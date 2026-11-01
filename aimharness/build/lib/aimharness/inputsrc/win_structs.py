"""Win32 structures used by the raw input backend.

Defined with fixed-width integer types so the layout can be verified on any
platform (``LONG`` is 4 bytes on Windows but ``c_long`` is 8 bytes on 64-bit
Linux, so ``ctypes.wintypes`` cannot be used for that).
"""

from __future__ import annotations

import ctypes
from ctypes import Structure, Union, c_int32, c_size_t, c_ssize_t, c_uint16, c_uint32, c_void_p, c_wchar_p

USHORT = c_uint16
UINT = c_uint32
DWORD = c_uint32
LONG = c_int32
ULONG = c_uint32
HANDLE = c_void_p
HWND = c_void_p
WPARAM = c_size_t
LPARAM = c_ssize_t

WM_INPUT = 0x00FF
WM_QUIT = 0x0012
WM_APP = 0x8000
WM_APP_REREGISTER = WM_APP + 1

RID_INPUT = 0x10000003
RIM_TYPEMOUSE = 0
RIM_INPUTSINK = 1
RIDEV_REMOVE = 0x00000001
RIDEV_INPUTSINK = 0x00000100
MOUSE_MOVE_ABSOLUTE = 0x01
HID_USAGE_PAGE_GENERIC = 0x01
HID_USAGE_GENERIC_MOUSE = 0x02
HWND_MESSAGE = -3


class RAWINPUTDEVICE(Structure):
    _fields_ = [
        ("usUsagePage", USHORT),
        ("usUsage", USHORT),
        ("dwFlags", DWORD),
        ("hwndTarget", HWND),
    ]


class RAWINPUTHEADER(Structure):
    _fields_ = [
        ("dwType", DWORD),
        ("dwSize", DWORD),
        ("hDevice", HANDLE),
        ("wParam", WPARAM),
    ]


class _RAWMOUSE_BUTTONS(Structure):
    _fields_ = [("usButtonFlags", USHORT), ("usButtonData", USHORT)]


class _RAWMOUSE_U(Union):
    _fields_ = [("ulButtons", ULONG), ("s", _RAWMOUSE_BUTTONS)]


class RAWMOUSE(Structure):
    _fields_ = [
        ("usFlags", USHORT),
        ("u", _RAWMOUSE_U),
        ("ulRawButtons", ULONG),
        ("lLastX", LONG),
        ("lLastY", LONG),
        ("ulExtraInformation", ULONG),
    ]


class RAWINPUT_MOUSE(Structure):
    """RAWINPUT with the data union narrowed to the mouse member."""

    _fields_ = [("header", RAWINPUTHEADER), ("mouse", RAWMOUSE)]


class POINT(Structure):
    _fields_ = [("x", LONG), ("y", LONG)]


class RECT(Structure):
    _fields_ = [("left", LONG), ("top", LONG), ("right", LONG), ("bottom", LONG)]


class MSG(Structure):
    _fields_ = [
        ("hwnd", HWND),
        ("message", UINT),
        ("wParam", WPARAM),
        ("lParam", LPARAM),
        ("time", DWORD),
        ("pt", POINT),
        ("lPrivate", DWORD),
    ]


class WNDCLASSEXW(Structure):
    _fields_ = [
        ("cbSize", UINT),
        ("style", UINT),
        ("lpfnWndProc", c_void_p),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", HANDLE),
        ("hIcon", HANDLE),
        ("hCursor", HANDLE),
        ("hbrBackground", HANDLE),
        ("lpszMenuName", c_wchar_p),
        ("lpszClassName", c_wchar_p),
        ("hIconSm", HANDLE),
    ]
