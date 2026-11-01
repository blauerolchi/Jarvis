"""Portable fallback backend using SDL relative mouse mode via pygame.

Deltas come from SDL (raw counts on most platforms), but timestamps are taken
once per frame, so their resolution equals the frame time. Sessions recorded
with this backend are flagged and the analysis treats sub-frame timing as
unavailable.
"""

from __future__ import annotations

import time

import pygame

from aimharness.inputsrc.base import LMB_DOWN, LMB_UP, MMB_DOWN, MMB_UP, RMB_DOWN, RMB_UP, InputEvent, InputSource

_DOWN = {1: LMB_DOWN, 2: MMB_DOWN, 3: RMB_DOWN}
_UP = {1: LMB_UP, 2: MMB_UP, 3: RMB_UP}


class PygameRelativeSource(InputSource):
    name = "pygame"
    timestamp_quality = "frame"

    def start(self, window_handle: int | None) -> None:
        # Grab first: pygame enables relative mode when the cursor is hidden
        # while the input is grabbed.
        pygame.event.set_grab(True)
        pygame.mouse.set_visible(False)
        pygame.mouse.get_rel()

    def stop(self) -> None:
        pygame.event.set_grab(False)
        pygame.mouse.set_visible(True)

    def set_focus(self, focused: bool) -> None:
        pygame.event.set_grab(focused)
        if focused:
            pygame.mouse.set_visible(False)

    def poll(self, pygame_events: list) -> list[InputEvent]:
        t = time.perf_counter_ns()
        out: list[InputEvent] = []
        for e in pygame_events:
            if e.type == pygame.MOUSEMOTION:
                out.append(InputEvent(t, int(e.rel[0]), int(e.rel[1])))
            elif e.type == pygame.MOUSEBUTTONDOWN and e.button in _DOWN:
                out.append(InputEvent(t, buttons=_DOWN[e.button]))
            elif e.type == pygame.MOUSEBUTTONUP and e.button in _UP:
                out.append(InputEvent(t, buttons=_UP[e.button]))
        return out
