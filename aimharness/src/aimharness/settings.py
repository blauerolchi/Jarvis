"""User settings (mouse sensitivity, display, crosshair, input backend)."""

from __future__ import annotations

import dataclasses
import json
import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from aimharness.confutil import from_dict, parse_color


# Degrees of view rotation per mouse count at in-game sensitivity 1.0.
GAME_YAW: dict[str, tuple[str, float]] = {
    "cs2": ("CS2", 0.022),
    "valorant": ("Valorant", 0.07),
    "apex": ("Apex Legends", 0.022),
    "overwatch2": ("Overwatch 2", 0.0066),
    "cod": ("Call of Duty", 0.0066),
}


@dataclass
class MouseSettings:
    dpi: int = 800
    # Physical mouse travel for a full 360 degree turn.
    cm_per_360: float = 34.6
    # Alternative: sensitivity as in a game (key of GAME_YAW) -> overrides cm_per_360.
    game: str = ""
    game_sens: float = 0.0
    # If set (> 0) this overrides everything else.
    deg_per_count: float = 0.0
    invert_y: bool = False

    @property
    def sens_mode(self) -> str:
        """"direct", a GAME_YAW key, or "cm360"."""
        if self.deg_per_count > 0:
            return "direct"
        return self.game or "cm360"

    def effective_deg_per_count(self) -> float:
        if self.deg_per_count > 0:
            return self.deg_per_count
        if self.game:
            if self.game not in GAME_YAW or self.game_sens <= 0:
                raise ValueError("mouse.game must be one of " + ", ".join(GAME_YAW) + " with game_sens > 0")
            return GAME_YAW[self.game][1] * self.game_sens
        if self.dpi <= 0 or self.cm_per_360 <= 0:
            raise ValueError("mouse.dpi and mouse.cm_per_360 must be positive")
        counts_per_360 = self.cm_per_360 / 2.54 * self.dpi
        return 360.0 / counts_per_360

    def effective_cm_per_360(self) -> float:
        return 360.0 / self.effective_deg_per_count() / self.dpi * 2.54

    def game_equivalent(self, game: str) -> float:
        """In-game sensitivity of ``game`` that gives the same angle per count."""
        return self.effective_deg_per_count() / GAME_YAW[game][1]

    def set_sens_mode(self, mode: str) -> None:
        """Switch how the sensitivity is expressed without changing its value."""
        dpc = self.effective_deg_per_count()
        self.game, self.game_sens, self.deg_per_count = "", 0.0, 0.0
        # Rounded to the precision people type in; the change is < 0.01 %.
        if mode == "direct":
            self.deg_per_count = round(dpc, 6)
        elif mode in GAME_YAW:
            self.game, self.game_sens = mode, round(dpc / GAME_YAW[mode][1], 4)
        else:
            self.cm_per_360 = round(360.0 / dpc / self.dpi * 2.54, 2)

    def scale_sensitivity(self, factor: float) -> None:
        """Multiply the angle per count by ``factor`` in the current representation."""
        if self.deg_per_count > 0:
            self.deg_per_count *= factor
        elif self.game:
            self.game_sens *= factor
        else:
            self.cm_per_360 /= factor


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
    if s.mouse.game and s.mouse.game not in GAME_YAW:
        raise ValueError(f"mouse.game must be one of {', '.join(GAME_YAW)} or empty, got {s.mouse.game!r}")
    s.mouse.effective_deg_per_count()
    parse_color(s.crosshair.color)


def data_root(settings: Settings) -> Path:
    p = Path(settings.data_dir)
    if not p.is_absolute():
        p = harness_home() / p
    return p


# -- writing -------------------------------------------------------------------------
_COMMENTS = {
    "data_dir": "where sessions and reports are stored (relative to the project folder)",
    "mouse.dpi": "mouse DPI / CPI",
    "mouse.cm_per_360": "mouse travel for a 360 degree turn (used when game is empty)",
    "mouse.game": "sensitivity as in a game: " + " | ".join(GAME_YAW) + " (empty = cm_per_360)",
    "mouse.game_sens": "in-game sensitivity for 'game'",
    "mouse.deg_per_count": "> 0 overrides everything: view angle per mouse count",
    "display.width": "0 = desktop resolution",
    "display.height": "0 = desktop resolution",
    "display.mode": "fullscreen | borderless | windowed",
    "display.hfov_deg": "horizontal field of view",
    "display.fps_cap": "0 = uncapped",
    "display.show_fps": "toggle in-game with F3",
    "input.backend": "auto | rawinput | pygame",
    "session.setup_note": "stored with every session, e.g. mouse, polling rate, pad, monitor Hz",
}
_SECTIONS = ("mouse", "display", "crosshair", "input", "audio", "session")


def _toml_value(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    return json.dumps(str(v), ensure_ascii=False)


def _toml_line(key: str, value, comment_key: str) -> str:
    line = f"{key} = {_toml_value(value)}"
    comment = _COMMENTS.get(comment_key)
    return f"{line:<30} # {comment}" if comment else line


def dumps_settings(s: Settings) -> str:
    lines = [
        "# Aim harness settings. Written by the settings menu; manual edits are fine.",
        "# All keys are optional; missing keys use their defaults.",
        "",
        _toml_line("data_dir", s.data_dir, "data_dir"),
    ]
    for name in _SECTIONS:
        section = getattr(s, name)
        lines += ["", f"[{name}]"]
        for f in dataclasses.fields(section):
            lines.append(_toml_line(f.name, getattr(section, f.name), f"{name}.{f.name}"))
    return "\n".join(lines) + "\n"


def save_settings(s: Settings, path: Path | None = None) -> Path:
    _validate(s)
    path = path or default_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(dumps_settings(s), encoding="utf-8")
    tmp.replace(path)
    return path
