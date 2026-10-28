"""Mouse input source abstraction."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

# Button transition flags. Values match the Win32 RI_MOUSE_* constants so raw
# input flags can be stored unchanged.
LMB_DOWN = 0x0001
LMB_UP = 0x0002
RMB_DOWN = 0x0004
RMB_UP = 0x0008
MMB_DOWN = 0x0010
MMB_UP = 0x0020
WHEEL = 0x0400

# InputEvent.flags bits
FLAG_ABSOLUTE = 0x1      # device reported absolute coordinates (delta not usable)
FLAG_INPUTSINK = 0x2     # Windows reported RIM_INPUTSINK (target window not in the foreground)


@dataclass(slots=True)
class InputEvent:
    t_ns: int            # time.perf_counter_ns() at reception
    dx: int = 0          # raw counts, + = right
    dy: int = 0          # raw counts, + = towards the user (down)
    buttons: int = 0     # LMB_DOWN | LMB_UP | ...
    flags: int = 0
    t_msg_ms: int = 0    # OS message timestamp (ms), 0 if unavailable
    device: int = 0      # device handle / id, 0 if unknown


class InputSource(ABC):
    #: Short backend name stored with each session.
    name: str = "base"
    #: How the timestamps were obtained (stored with each session).
    timestamp_quality: str = "unknown"

    def start(self, window_handle: int | None) -> None:
        """Start capturing. ``window_handle`` is the native game window (or None)."""

    def stop(self) -> None:
        """Stop capturing and release resources."""

    @abstractmethod
    def poll(self, pygame_events: list) -> list[InputEvent]:
        """Return all events received since the last call (ordered by time)."""

    def set_focus(self, focused: bool) -> None:
        """Called when the game window gains or loses focus."""

    def per_frame(self) -> None:
        """Called once per frame (cursor confinement, health checks)."""

    def diagnostics(self) -> dict:
        return {}
