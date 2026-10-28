import ctypes

import pytest

from aimharness.inputsrc import win_structs as ws

pytestmark = pytest.mark.skipif(ctypes.sizeof(ctypes.c_void_p) != 8, reason="layout checked for 64-bit")


def test_raw_input_layout_matches_win64():
    assert ctypes.sizeof(ws.RAWINPUTDEVICE) == 16
    assert ctypes.sizeof(ws.RAWINPUTHEADER) == 24
    assert ctypes.sizeof(ws.RAWMOUSE) == 24
    assert ws.RAWMOUSE.lLastX.offset == 12
    assert ws.RAWMOUSE.lLastY.offset == 16
    assert ctypes.sizeof(ws.RAWINPUT_MOUSE) == 48
    assert ctypes.sizeof(ws.MSG) == 48
    assert ws.MSG.time.offset == 32
    assert ctypes.sizeof(ws.WNDCLASSEXW) == 80


def test_button_flags_are_readable_through_union():
    m = ws.RAWMOUSE()
    m.u.ulButtons = 0x0001 | (120 << 16)
    assert m.u.s.usButtonFlags == 0x0001
    assert m.u.s.usButtonData == 120
