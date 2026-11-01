"""User settings (mouse sensitivity, display, crosshair, input backend)."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from aimharness.confutil import from_dict, parse_color


@dataclass
class MouseSettings:
    dpi: int = 800
    # Physical mouse travel for a full 360 degree turn.
    cm_per_360: float = 34.6
    # If set (> 0) this overrides dpi / cm_per_360.
    deg_per_count: float = 0.0
    invert_y: bool = False

    def effective_deg_per_count(self) -> float:
        if self.deg_per_count > 0:
            return self.deg_per_count
        if self.dpi <= 0 or self.cm_per_360 <= 0:
            raise ValueError("mouse.dpi and mouse.cm_per_360 must be positive")
        counts_per_360 = self.cm_per_360 / 2.54 * self.dpi
        return 360.0 / counts_per_360

    def effective_cm_per_360(self) -> float:
        return 360.0 / self.effective_deg_per_count() / self.dpi * 2.54


@dataclass
class DisplaySettings:
    # 0 = use desktop resolution of the selected display.
    width: int = 0
    height: int = 0
    # "fullscreen" | "borderless" | "windowed"
    mode: str = "fullscreen"
    display_index: int = 0
    hfov_deg: float = 103.0
    # 0 = uncapped.
    fps_cap: int = 360
    show_fps: bool = False


@dataclass
class CrosshairSettings:
    color: str = "#00ff7f"
    dot: bool = True
    dot_size: int = 2
    lines: bool = True
    length: int = 7
    gap: int = 4
    thickness: int = 2
    outline: bool = True

    @property
    def rgb(self) -> tuple[int, int, int]:
        return parse_color(self.color)


@dataclass
class InputSettings:
    # "auto" (raw input on Windows, pygame elsewhere) | "rawinput" | "pygame"
    backend: str = "auto"


@dataclass
class AudioSettings:
    enabled: bool = True
    volume: float = 0.35


@dataclass
class SessionSettings:
    countdown_s: float = 3.0
    # Free-text label stored with every session (e.g. mouse / mousepad used).
    setup_note: str = ""


@dataclass
class Settings:
    mouse: MouseSettings = field(default_factory=MouseSettings)
    display: DisplaySettings = field(default_factory=DisplaySettings)
    crosshair: CrosshairSettings = field(default_factory=CrosshairSettings)
    input: InputSettings = field(default_factory=InputSettings)
    audio: AudioSettings = field(default_factory=AudioSettings)
    session: SessionSettings = field(default_factory=SessionSettings)
    data_dir: str = "data"


def harness_home() -> Path:
    """Project working directory: $AIMHARNESS_HOME or the current directory."""
    return Path(os.environ.get("AIMHARNESS_HOME", Path.cwd())).resolve()


def default_settings_path() -> Path:
    return harness_home() / "config" / "settings.toml"


def load_settings(path: Path | None = None) -> Settings:
    path = path or default_settings_path()
    if not path.exists():
        return Settings()
    with path.open("rb") as fh:
        data = tomllib.load(fh)
    settings = from_dict(Settings, data)
    _validate(settings)
    return settings


def _validate(s: Settings) -> None:
    if s.display.mode not in ("fullscreen", "borderless", "windowed"):
        raise ValueError(f"display.mode must be fullscreen|borderless|windowed, got {s.display.mode!r}")
    if not 30.0 <= s.display.hfov_deg <= 150.0:
        raise ValueError("display.hfov_deg must be within 30..150")
    if s.input.backend not in ("auto", "rawinput", "pygame"):
        raise ValueError(f"input.backend must be auto|rawinput|pygame, got {s.input.backend!r}")
    s.mouse.effective_deg_per_count()
    parse_color(s.crosshair.color)


def data_root(settings: Settings) -> Path:
    p = Path(settings.data_dir)
    if not p.is_absolute():
        p = harness_home() / p
    return p
