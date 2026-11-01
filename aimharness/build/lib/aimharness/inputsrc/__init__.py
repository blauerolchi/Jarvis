"""Mouse input backends."""

from __future__ import annotations

import sys

from aimharness.inputsrc.base import InputEvent, InputSource


def resolve_backend(backend: str) -> str:
    if backend == "auto":
        return "rawinput" if sys.platform == "win32" else "pygame"
    return backend


def create_input_source(backend: str) -> InputSource:
    backend = resolve_backend(backend)
    if backend == "rawinput":
        from aimharness.inputsrc.win_rawinput import WinRawInputSource

        return WinRawInputSource()
    if backend == "pygame":
        from aimharness.inputsrc.pygame_rel import PygameRelativeSource

        return PygameRelativeSource()
    if backend == "scripted":
        from aimharness.inputsrc.scripted import ScriptedInputSource

        return ScriptedInputSource()
    raise ValueError(f"unknown input backend {backend!r}")


__all__ = ["InputEvent", "InputSource", "create_input_source", "resolve_backend"]
