"""Windows Raw Input mouse backend.

A dedicated thread owns a message-only window that is registered for raw mouse
input with RIDEV_INPUTSINK. Every WM_INPUT message is timestamped with
``time.perf_counter_ns()`` (QueryPerformanceCounter) the moment it is read, so
timestamps do not depend on the render loop and keep the device's native
report rate (125 Hz ... 8 kHz).

Windows allows only one raw-input target window per device class and process.
SDL registers its own raw input when relative mouse mode is enabled (and, with
SDL_MOUSE_AUTO_CAPTURE, while a button is held), so the game keeps both off while
this backend runs: it hides the cursor and confines it with ClipCursor instead.
The registration is re-checked every frame and restored if something replaced it;
the number of restorations is stored with the session.
"""

from __future__ import annotations

import collections
import ctypes
import sys
import threading
import time
from ctypes import byref, sizeof

from aimharness.inputsrc.base import FLAG_ABSOLUTE, FLAG_INPUTSINK, InputEvent, InputSource
from aimharness.inputsrc.win_structs import (
    DWORD,
    HANDLE,
    HID_USAGE_GENERIC_MOUSE,
    HID_USAGE_PAGE_GENERIC,
    HWND,
    HWND_MESSAGE,
    LPARAM,
    MOUSE_MOVE_ABSOLUTE,
    MSG,
    POINT,
    RAWINPUT_MOUSE,
    RAWINPUTDEVICE,
    RAWINPUTHEADER,
    RECT,
    RID_INPUT,
    RIDEV_INPUTSINK,
    RIDEV_REMOVE,
    RIM_INPUTSINK,
    RIM_TYPEMOUSE,
    UINT,
    WM_APP_REREGISTER,
    WM_INPUT,
    WM_QUIT,
    WNDCLASSEXW,
    WPARAM,
)

_GETRAWINPUTDATA_ERROR = 0xFFFFFFFF


def _bind(u, k) -> None:
    c_int, c_wchar_p, c_void_p = ctypes.c_int, ctypes.c_wchar_p, ctypes.c_void_p
    u.RegisterClassExW.argtypes = [ctypes.POINTER(WNDCLASSEXW)]
    u.RegisterClassExW.restype = ctypes.c_uint16
    u.UnregisterClassW.argtypes = [c_wchar_p, HANDLE]
    u.UnregisterClassW.restype = c_int
    u.CreateWindowExW.argtypes = [DWORD, c_wchar_p, c_wchar_p, DWORD, c_int, c_int, c_int, c_int,
                                  HWND, HANDLE, HANDLE, c_void_p]
    u.CreateWindowExW.restype = HWND
    u.DestroyWindow.argtypes = [HWND]
    u.DestroyWindow.restype = c_int
    u.DefWindowProcW.argtypes = [HWND, UINT, WPARAM, LPARAM]
    u.DefWindowProcW.restype = LPARAM
    u.RegisterRawInputDevices.argtypes = [ctypes.POINTER(RAWINPUTDEVICE), UINT, UINT]
    u.RegisterRawInputDevices.restype = c_int
    u.GetRegisteredRawInputDevices.argtypes = [ctypes.POINTER(RAWINPUTDEVICE), ctypes.POINTER(UINT), UINT]
    u.GetRegisteredRawInputDevices.restype = UINT
    u.GetRawInputData.argtypes = [HANDLE, UINT, c_void_p, ctypes.POINTER(UINT), UINT]
    u.GetRawInputData.restype = UINT
    u.GetMessageW.argtypes = [ctypes.POINTER(MSG), HWND, UINT, UINT]
    u.GetMessageW.restype = c_int
    u.DispatchMessageW.argtypes = [ctypes.POINTER(MSG)]
    u.DispatchMessageW.restype = LPARAM
    u.PostThreadMessageW.argtypes = [DWORD, UINT, WPARAM, LPARAM]
    u.PostThreadMessageW.restype = c_int
    u.GetClientRect.argtypes = [HWND, ctypes.POINTER(RECT)]
    u.GetClientRect.restype = c_int
    u.ClientToScreen.argtypes = [HWND, ctypes.POINTER(POINT)]
    u.ClientToScreen.restype = c_int
    u.ClipCursor.argtypes = [ctypes.POINTER(RECT)]
    u.ClipCursor.restype = c_int
    k.GetModuleHandleW.argtypes = [c_wchar_p]
    k.GetModuleHandleW.restype = HANDLE
    k.GetCurrentThreadId.argtypes = []
    k.GetCurrentThreadId.restype = DWORD


class WinCursorLock:
    """Confine the (hidden) OS cursor to the game window's client area."""

    def __init__(self, hwnd: int, user32):
        self._hwnd = hwnd
        self._u = user32

    def engage(self) -> None:
        rc = RECT()
        if not self._u.GetClientRect(self._hwnd, byref(rc)):
            return
        pt = POINT(0, 0)
        self._u.ClientToScreen(self._hwnd, byref(pt))
        clip = RECT(pt.x, pt.y, pt.x + rc.right, pt.y + rc.bottom)
        self._u.ClipCursor(byref(clip))

    def release(self) -> None:
        self._u.ClipCursor(None)


class WinRawInputSource(InputSource):
    name = "rawinput"
    timestamp_quality = "qpc-on-receipt"

    def __init__(self) -> None:
        if sys.platform != "win32":
            raise RuntimeError("raw input backend is only available on Windows")
        if sizeof(ctypes.c_void_p) != 8:
            raise RuntimeError("raw input backend requires 64-bit Python")
        self._u = ctypes.WinDLL("user32", use_last_error=True)
        self._k = ctypes.WinDLL("kernel32", use_last_error=True)
        _bind(self._u, self._k)
        self._queue: collections.deque[InputEvent] = collections.deque()
        self._thread: threading.Thread | None = None
        self._ready = threading.Event()
        self._error: BaseException | None = None
        self._hwnd: int | None = None
        self._tid = 0
        self._cursor: WinCursorLock | None = None
        self._focused = True
        self._last_check = 0.0
        self._prev_switch = sys.getswitchinterval()
        self._stats = {"events": 0, "absolute_events": 0, "inputsink_events": 0, "reregistrations": 0}

    # -- lifecycle -----------------------------------------------------------------
    def start(self, window_handle: int | None) -> None:
        # Short GIL switch interval so the capture thread is not starved by the
        # render loop (affects timestamp latency, not correctness).
        sys.setswitchinterval(0.0002)
        self._thread = threading.Thread(target=self._run, name="aimharness-rawinput", daemon=True)
        self._thread.start()
        if not self._ready.wait(3.0):
            raise RuntimeError("raw input thread did not start")
        if self._error is not None:
            raise RuntimeError(f"raw input initialisation failed: {self._error}") from self._error
        if window_handle:
            self._cursor = WinCursorLock(window_handle, self._u)
            self._cursor.engage()

    def stop(self) -> None:
        if self._cursor:
            self._cursor.release()
        if self._thread and self._thread.is_alive():
            self._u.PostThreadMessageW(self._tid, WM_QUIT, 0, 0)
            self._thread.join(2.0)
        sys.setswitchinterval(self._prev_switch)

    # -- per frame -----------------------------------------------------------------
    def poll(self, pygame_events: list) -> list[InputEvent]:
        out: list[InputEvent] = []
        q = self._queue
        while q:
            out.append(q.popleft())
        return out

    def set_focus(self, focused: bool) -> None:
        self._focused = focused
        if self._cursor:
            if focused:
                self._cursor.engage()
            else:
                self._cursor.release()

    def per_frame(self) -> None:
        # Cheap (two syscalls); checked every frame so a stolen registration
        # costs at most one frame of input.
        if not self._registration_ok():
            self._stats["reregistrations"] += 1
            self._u.PostThreadMessageW(self._tid, WM_APP_REREGISTER, 0, 0)
        now = time.perf_counter()
        if now - self._last_check >= 0.5:
            self._last_check = now
            if self._cursor and self._focused:
                # Other applications / alt-tab can reset the clip rectangle.
                self._cursor.engage()

    def diagnostics(self) -> dict:
        return dict(self._stats)

    # -- internals -----------------------------------------------------------------
    def _register(self, hwnd: int) -> None:
        rid = RAWINPUTDEVICE(HID_USAGE_PAGE_GENERIC, HID_USAGE_GENERIC_MOUSE, RIDEV_INPUTSINK, hwnd)
        if not self._u.RegisterRawInputDevices(byref(rid), 1, sizeof(rid)):
            raise ctypes.WinError(ctypes.get_last_error())

    def _unregister(self) -> None:
        rid = RAWINPUTDEVICE(HID_USAGE_PAGE_GENERIC, HID_USAGE_GENERIC_MOUSE, RIDEV_REMOVE, None)
        self._u.RegisterRawInputDevices(byref(rid), 1, sizeof(rid))

    def _registration_ok(self) -> bool:
        n = UINT(0)
        self._u.GetRegisteredRawInputDevices(None, byref(n), sizeof(RAWINPUTDEVICE))
        if n.value == 0:
            return False
        arr = (RAWINPUTDEVICE * n.value)()
        got = self._u.GetRegisteredRawInputDevices(arr, byref(n), sizeof(RAWINPUTDEVICE))
        if got == _GETRAWINPUTDATA_ERROR:
            return True  # cannot tell; do not fight over it
        for dev in arr[:got]:
            if dev.usUsagePage == HID_USAGE_PAGE_GENERIC and dev.usUsage == HID_USAGE_GENERIC_MOUSE:
                return dev.hwndTarget == self._hwnd
        return False

    def _run(self) -> None:
        u, k = self._u, self._k
        hinst = k.GetModuleHandleW(None)
        cls_name = f"AimHarnessRawInput{id(self):x}"
        wc = WNDCLASSEXW()
        wc.cbSize = sizeof(WNDCLASSEXW)
        wc.lpfnWndProc = ctypes.cast(u.DefWindowProcW, ctypes.c_void_p).value
        wc.hInstance = hinst
        wc.lpszClassName = cls_name
        hwnd = None
        try:
            if not u.RegisterClassExW(byref(wc)):
                raise ctypes.WinError(ctypes.get_last_error())
            hwnd = u.CreateWindowExW(0, cls_name, "aimharness raw input", 0, 0, 0, 0, 0,
                                     HWND_MESSAGE, None, hinst, None)
            if not hwnd:
                raise ctypes.WinError(ctypes.get_last_error())
            self._hwnd = hwnd
            self._tid = k.GetCurrentThreadId()
            self._register(hwnd)
        except BaseException as exc:  # noqa: BLE001 - reported to the starting thread
            self._error = exc
            if hwnd:
                u.DestroyWindow(hwnd)
            u.UnregisterClassW(cls_name, hinst)
            self._ready.set()
            return
        self._ready.set()

        msg = MSG()
        buf = (ctypes.c_uint64 * 32)()  # 256 bytes, 8-byte aligned
        ri = RAWINPUT_MOUSE.from_buffer(buf)
        size = UINT()
        header_size = sizeof(RAWINPUTHEADER)
        perf = time.perf_counter_ns
        append = self._queue.append
        stats = self._stats
        try:
            while True:
                r = u.GetMessageW(byref(msg), None, 0, 0)
                if r == 0 or r == -1:
                    break
                if msg.message == WM_INPUT:
                    t = perf()
                    size.value = sizeof(buf)
                    n = u.GetRawInputData(msg.lParam, RID_INPUT, buf, byref(size), header_size)
                    if n != _GETRAWINPUTDATA_ERROR and ri.header.dwType == RIM_TYPEMOUSE:
                        m = ri.mouse
                        dx, dy, flags = m.lLastX, m.lLastY, 0
                        if m.usFlags & MOUSE_MOVE_ABSOLUTE:
                            flags |= FLAG_ABSOLUTE
                            dx = dy = 0
                            stats["absolute_events"] += 1
                        if (msg.wParam & 0xFF) == RIM_INPUTSINK:
                            flags |= FLAG_INPUTSINK
                            stats["inputsink_events"] += 1
                        stats["events"] += 1
                        append(InputEvent(t, dx, dy, m.u.s.usButtonFlags, flags, msg.time,
                                          ri.header.hDevice or 0))
                elif msg.message == WM_APP_REREGISTER and not msg.hwnd:
                    try:
                        self._register(hwnd)
                    except OSError:
                        pass
                    continue
                u.DispatchMessageW(byref(msg))  # DefWindowProc cleans up WM_INPUT
        finally:
            self._unregister()
            u.DestroyWindow(hwnd)
            u.UnregisterClassW(cls_name, hinst)
