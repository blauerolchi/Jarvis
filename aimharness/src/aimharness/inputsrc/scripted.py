"""Deterministic synthetic input for automated smoke tests.

Produces a slow sinusoidal sweep and periodic clicks at a fixed report rate.
It does not know anything about targets; it only exercises the
capture -> record -> analysis pipeline without a physical mouse.
"""

from __future__ import annotations

import math
import time

from aimharness.inputsrc.base import LMB_DOWN, LMB_UP, InputEvent, InputSource


class ScriptedInputSource(InputSource):
    name = "scripted"
    timestamp_quality = "synthetic"

    def __init__(self, amplitude_counts: float = 4.0, period_s: float = 1.7,
                 click_interval_s: float = 0.23, rate_hz: int = 1000):
        self._amp = amplitude_counts
        self._period = period_s
        self._click_interval = click_interval_s
        self._step_ns = int(1e9 / rate_hz)
        self._t0 = 0
        self._t_next = 0
        self._next_click = click_interval_s
        self._release_at: float | None = None
        self._acc_x = 0.0
        self._acc_y = 0.0

    def start(self, window_handle: int | None) -> None:
        self._t0 = time.perf_counter_ns()
        self._t_next = self._t0 + self._step_ns

    def poll(self, pygame_events: list) -> list[InputEvent]:
        now = time.perf_counter_ns()
        out: list[InputEvent] = []
        while self._t_next <= now:
            s = (self._t_next - self._t0) / 1e9
            w = 2 * math.pi / self._period
            self._acc_x += self._amp * math.sin(w * s)
            self._acc_y += 0.3 * self._amp * math.cos(0.7 * w * s)
            dx, dy = int(self._acc_x), int(self._acc_y)
            self._acc_x -= dx
            self._acc_y -= dy
            buttons = 0
            if s >= self._next_click:
                buttons |= LMB_DOWN
                self._release_at = s + 0.04
                self._next_click += self._click_interval
            elif self._release_at is not None and s >= self._release_at:
                buttons |= LMB_UP
                self._release_at = None
            if dx or dy or buttons:
                out.append(InputEvent(self._t_next, dx, dy, buttons))
            self._t_next += self._step_ns
        return out
