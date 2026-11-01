"""Tiny synthesised feedback sounds (no asset files needed)."""

from __future__ import annotations

import numpy as np
import pygame

SAMPLE_RATE = 44100


def _tone(freq: float, ms: float, decay: float, volume: float) -> np.ndarray:
    n = int(SAMPLE_RATE * ms / 1000)
    t = np.arange(n) / SAMPLE_RATE
    wave = np.sin(2 * np.pi * freq * t) * np.exp(-t * decay)
    return (wave * volume * 32767).astype(np.int16)


class Sounds:
    def __init__(self, enabled: bool, volume: float):
        self.ok = False
        if not enabled:
            return
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(SAMPLE_RATE, -16, 1, 256)
            freq, _, channels = pygame.mixer.get_init()
            self._hit = self._make(_tone(1250, 45, 90, volume), channels)
            self._kill = self._make(_tone(1650, 70, 60, volume), channels)
            self._miss = self._make(_tone(260, 40, 120, volume * 0.6), channels)
            self.ok = True
        except (pygame.error, ValueError):
            self.ok = False

    @staticmethod
    def _make(mono: np.ndarray, channels: int) -> pygame.mixer.Sound:
        data = mono if channels == 1 else np.repeat(mono[:, None], channels, axis=1)
        return pygame.sndarray.make_sound(np.ascontiguousarray(data))

    def hit(self) -> None:
        if self.ok:
            self._hit.play()

    def kill(self) -> None:
        if self.ok:
            self._kill.play()

    def miss(self) -> None:
        if self.ok:
            self._miss.play()
