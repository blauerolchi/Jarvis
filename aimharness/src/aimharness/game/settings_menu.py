"""In-app settings screen (pygame). Edits Settings in place and saves them to TOML."""

from __future__ import annotations

import copy
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pygame

from aimharness.confutil import parse_color
from aimharness.game.render import Renderer
from aimharness.settings import GAME_YAW, Settings, save_settings

TEXT = (230, 232, 238)
MUTED = (150, 154, 166)
ACCENT = (120, 220, 255)
BAD = (240, 130, 120)

COLOR_PRESETS = ["#00ff7f", "#00e5ff", "#ffffff", "#ffff00", "#ff3df2", "#ff3b3b"]
RESOLUTIONS = [(0, 0), (1280, 720), (1600, 900), (1920, 1080), (2560, 1440), (3840, 2160)]
FPS_CAPS = [0, 144, 165, 240, 360, 500, 1000]
SENS_MODES = [("cm360", "cm/360")] + [(k, v[0]) for k, v in GAME_YAW.items()] + [("direct", "°/count direkt")]


@dataclass
class Field:
    label: str | Callable[[Settings], str]
    kind: str  # int | float | bool | choice | text | color
    get: Callable[[Settings], object]
    set: Callable[[Settings, object], None]
    lo: float = 0.0
    hi: float = 0.0
    step: float = 1.0
    big: float = 10.0
    choices: Callable[[Settings], Sequence[tuple[object, str]]] | None = None
    fmt: Callable[[object], str] = str
    help: str = ""
    visible: Callable[[Settings], bool] = field(default=lambda s: True)
    # Custom "reset to default"; by default the value of a fresh Settings() is used.
    reset: Callable[[Settings], None] | None = None

    def title(self, s: Settings) -> str:
        return self.label(s) if callable(self.label) else self.label


def _attr(section: str, name: str) -> tuple[Callable, Callable]:
    def get(s: Settings):
        return getattr(getattr(s, section), name)

    def set_(s: Settings, v):
        setattr(getattr(s, section), name, v)

    return get, set_


def _num(section: str, name: str, label, kind: str, lo, hi, step, big, fmt, help_: str, **kw) -> Field:
    g, st = _attr(section, name)
    return Field(label, kind, g, st, lo, hi, step, big, fmt=fmt, help=help_, **kw)


def _bool(section: str, name: str, label: str, help_: str = "") -> Field:
    g, st = _attr(section, name)
    return Field(label, "bool", g, st, fmt=lambda v: "an" if v else "aus", help=help_)


def _choice(section: str, name: str, label: str, options: Sequence[tuple[object, str]], help_: str = "") -> Field:
    g, st = _attr(section, name)
    return Field(label, "choice", g, st, choices=lambda s: options, help=help_)


def _reset_sensitivity(s: Settings) -> None:
    """Default sensitivity, expressed in the current mode (and DPI)."""
    mode = s.mouse.sens_mode
    s.mouse.game, s.mouse.game_sens, s.mouse.deg_per_count = "", 0.0, 0.0
    s.mouse.cm_per_360 = Settings().mouse.cm_per_360
    s.mouse.set_sens_mode(mode)


def _fps_choices(s: Settings) -> list[tuple[object, str]]:
    caps = FPS_CAPS if s.display.fps_cap in FPS_CAPS else sorted(FPS_CAPS + [s.display.fps_cap])
    return [(v, "unbegrenzt" if v == 0 else f"{v} fps") for v in caps]


def _resolution_choices(s: Settings) -> list[tuple[object, str]]:
    opts = [((w, h), "Desktop" if w == 0 else f"{w} × {h}") for w, h in RESOLUTIONS]
    cur = (s.display.width, s.display.height)
    if cur not in RESOLUTIONS:
        opts.append((cur, f"{cur[0]} × {cur[1]}"))
    return opts


def _set_resolution(s: Settings, v) -> None:
    s.display.width, s.display.height = v


def build_sections() -> list[tuple[str, list[Field]]]:
    mode = lambda s: s.mouse.sens_mode  # noqa: E731
    return [
        ("Maus", [
            Field("Sensitivität angeben als", "choice", mode, lambda s, v: s.mouse.set_sens_mode(v),
                  choices=lambda s: SENS_MODES,
                  help="Wie die Sensitivität eingegeben wird: als Mausweg pro 360°-Drehung oder als "
                       "Sensitivität eines Spiels. Beim Umschalten bleibt die tatsächliche Empfindlichkeit gleich."),
            _num("mouse", "dpi", "DPI", "int", 100, 32000, 50, 400, lambda v: f"{v}",
                 "DPI (CPI) deiner Maus, wie in der Maussoftware eingestellt. Im cm/360-Modus bleibt der "
                 "Mausweg pro Drehung gleich, bei Spiel-Sensitivität bleibt wie im Spiel der Winkel pro Count gleich."),
            _num("mouse", "cm_per_360", "cm/360", "float", 5, 200, 0.5, 5, lambda v: f"{v:.1f} cm",
                 "Mausweg für eine volle 360°-Drehung. Kleiner = empfindlicher.",
                 visible=lambda s: s.mouse.sens_mode == "cm360"),
            _num("mouse", "game_sens", lambda s: f"{GAME_YAW.get(s.mouse.game, ('Spiel',))[0]}-Sensitivität", "float",
                 0.001, 100, 0.01, 0.1, lambda v: f"{v:.3f}",
                 "Sensitivitätswert wie im Spiel eingestellt (bei gleicher DPI).",
                 visible=lambda s: s.mouse.sens_mode in GAME_YAW, reset=_reset_sensitivity),
            _num("mouse", "deg_per_count", "°/count", "float", 0.0005, 1.0, 0.0005, 0.005, lambda v: f"{v:.4f}",
                 "Drehwinkel pro Maus-Count. Überschreibt alle anderen Angaben.",
                 visible=lambda s: s.mouse.sens_mode == "direct", reset=_reset_sensitivity),
            _bool("mouse", "invert_y", "Y-Achse invertieren"),
        ]),
        ("Darstellung", [
            _choice("display", "mode", "Anzeigemodus",
                    [("fullscreen", "Vollbild"), ("borderless", "Rahmenloses Fenster"), ("windowed", "Fenster")],
                    "Vollbild hat in der Regel die geringste Latenz."),
            Field("Auflösung", "choice", lambda s: (s.display.width, s.display.height), _set_resolution,
                  choices=_resolution_choices, help="Desktop = native Auflösung des gewählten Monitors."),
            _num("display", "hfov_deg", "Sichtfeld (FOV)", "float", 60, 130, 1, 5, lambda v: f"{v:.0f}° horizontal",
                 "Horizontales Sichtfeld. Aim Labs und Valorant: 103°, CS2 bei 16:9: 106°. Für vergleichbare "
                 "Messungen nicht zwischen Sessions ändern."),
            Field("FPS-Limit", "choice", *_attr("display", "fps_cap"),
                  choices=_fps_choices,
                  help="Höher = geringere Eingabelatenz und feinere Messung, aber mehr CPU-Last."),
            _bool("display", "show_fps", "FPS-Anzeige", "Im Spiel auch mit F3 umschaltbar."),
        ]),
        ("Crosshair", [
            Field("Farbe", "color", *_attr("crosshair", "color"), fmt=lambda v: str(v).lower(),
                  help="Pfeiltasten wechseln zwischen Vorlagen, Enter erlaubt einen eigenen Hex-Wert (#rrggbb)."),
            _bool("crosshair", "dot", "Mittelpunkt"),
            _num("crosshair", "dot_size", "Punktgröße", "int", 1, 12, 1, 2, lambda v: f"{v} px", ""),
            _bool("crosshair", "lines", "Linien"),
            _num("crosshair", "length", "Linienlänge", "int", 1, 40, 1, 5, lambda v: f"{v} px", ""),
            _num("crosshair", "gap", "Abstand zur Mitte", "int", 0, 30, 1, 5, lambda v: f"{v} px", ""),
            _num("crosshair", "thickness", "Linienstärke", "int", 1, 10, 1, 2, lambda v: f"{v} px", ""),
            _bool("crosshair", "outline", "Schwarze Kontur"),
        ]),
        ("Eingabe", [
            _choice("input", "backend", "Eingabe-Backend",
                    [("auto", "Automatisch"), ("rawinput", "Raw Input (Windows)"), ("pygame", "pygame (framegenau)")],
                    "Automatisch nutzt unter Windows Raw Input mit Zeitstempel pro Maus-Report."),
        ]),
        ("Ton", [
            _bool("audio", "enabled", "Treffertöne"),
            _num("audio", "volume", "Lautstärke", "float", 0, 1, 0.05, 0.2, lambda v: f"{100 * v:.0f} %", ""),
        ]),
        ("Session", [
            _num("session", "countdown_s", "Countdown", "float", 0, 10, 0.5, 2, lambda v: f"{v:.1f} s",
                 "Zeit vor dem Start einer Session, in der du dich schon umsehen kannst."),
            Field("Setup-Notiz", "text", *_attr("session", "setup_note"),
                  fmt=lambda v: str(v) if v else "–",
                  help="Wird mit jeder Session gespeichert, z. B. Maus, Pollingrate, Mauspad, Monitor-Hz. "
                       "Hilft später beim Vergleich im Report."),
        ]),
    ]


class SettingsMenu:
    """Returns from ``run`` when the user leaves; settings are saved on leave."""

    ROW_H = 36

    def __init__(self, screen: pygame.Surface, settings: Settings, settings_path: Path,
                 open_sandbox: Callable[[], None]):
        self.screen = screen
        self.settings = settings
        self.path = settings_path
        self.open_sandbox = open_sandbox
        self.sections = build_sections()
        self.defaults = Settings()
        self.sel = 0
        self.scroll = 0
        self.editing: str | None = None
        self.message = ""
        self.message_bad = False
        self.clock = pygame.time.Clock()
        self.renderer = Renderer(screen, settings.display.hfov_deg, settings.crosshair)

    # -- model -----------------------------------------------------------------------
    def fields(self) -> list[Field]:
        return [f for _, fs in self.sections for f in fs if f.visible(self.settings)]

    def current(self) -> Field:
        fs = self.fields()
        self.sel = max(0, min(self.sel, len(fs) - 1))
        return fs[self.sel]

    def _choices(self, f: Field, settings: Settings | None = None) -> list[tuple[object, str]]:
        s = settings or self.settings
        if f.kind == "color":
            opts = [(c, c) for c in COLOR_PRESETS]
            cur = str(f.get(s)).lower()
            return opts if cur in COLOR_PRESETS else [(cur, cur)] + opts
        return list(f.choices(s)) if f.choices else []

    def value_text(self, f: Field, settings: Settings | None = None) -> str:
        s = settings or self.settings
        v = f.get(s)
        if f.kind == "choice":
            return next((label for val, label in self._choices(f, s) if val == v), str(v))
        return f.fmt(v)

    def change(self, f: Field, direction: int, big: bool = False) -> None:
        s = self.settings
        if f.kind == "bool":
            f.set(s, not f.get(s))
        elif f.kind in ("choice", "color"):
            opts = [val for val, _ in self._choices(f)]
            cur = f.get(s) if f.kind == "choice" else str(f.get(s)).lower()
            i = opts.index(cur) if cur in opts else 0
            f.set(s, opts[(i + direction) % len(opts)])
        elif f.kind in ("int", "float"):
            v = f.get(s) + direction * (f.big if big else f.step)
            v = min(f.hi, max(f.lo, v))
            f.set(s, int(round(v)) if f.kind == "int" else round(v, 6))

    def reset(self, f: Field) -> None:
        if f.reset:
            f.reset(self.settings)
        else:
            f.set(self.settings, f.get(self.defaults))
        self.message = f"{f.title(self.settings)} auf Standard zurückgesetzt"
        self.message_bad = False

    def commit_edit(self, f: Field, text: str) -> bool:
        text = text.strip().replace(",", ".")
        try:
            if f.kind == "int":
                v = int(float(text))
                if not f.lo <= v <= f.hi:
                    raise ValueError(f"erlaubt: {f.lo:g} bis {f.hi:g}")
            elif f.kind == "float":
                v = float(text)
                if not f.lo <= v <= f.hi:
                    raise ValueError(f"erlaubt: {f.lo:g} bis {f.hi:g}")
            elif f.kind == "color":
                text = text if text.startswith("#") else "#" + text
                parse_color(text)
                v = text.lower()
            else:
                v = text
        except ValueError as exc:
            self.message, self.message_bad = f"Ungültiger Wert: {exc}", True
            return False
        f.set(self.settings, v)
        self.message = ""
        return True

    # -- loop ------------------------------------------------------------------------
    def run(self) -> bool:
        """Show the menu until the user leaves. Returns False if the window was closed."""
        buffer = ""
        pygame.key.stop_text_input()
        while True:
            for e in pygame.event.get():
                if e.type == pygame.QUIT:
                    self._save()
                    return False
                if self.editing is not None:
                    buffer = self._edit_event(e, buffer)
                    continue
                if e.type == pygame.KEYDOWN:
                    if not self._key(e):
                        if self._save():
                            return True
                    if self.editing is not None:
                        buffer = self.editing
                elif e.type == pygame.MOUSEWHEEL:
                    self.sel = max(0, min(len(self.fields()) - 1, self.sel - e.y))
                elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
                    self._click(e.pos)
                    if self.editing is not None:
                        buffer = self.editing
            self._draw(buffer)
            pygame.display.flip()
            self.clock.tick(60)

    def _key(self, e) -> bool:
        """Handle a key press; False = leave the menu."""
        f = self.current()
        big = bool(e.mod & pygame.KMOD_SHIFT)
        if e.key == pygame.K_ESCAPE:
            return False
        if e.key == pygame.K_UP:
            self.sel = (self.sel - 1) % len(self.fields())
        elif e.key == pygame.K_DOWN:
            self.sel = (self.sel + 1) % len(self.fields())
        elif e.key in (pygame.K_LEFT, pygame.K_RIGHT):
            self.change(f, 1 if e.key == pygame.K_RIGHT else -1, big)
        elif e.key in (pygame.K_RETURN, pygame.K_KP_ENTER, pygame.K_SPACE):
            self._activate(f)
        elif e.key in (pygame.K_BACKSPACE, pygame.K_DELETE):
            self.reset(f)
        elif e.key == pygame.K_t:
            self.open_sandbox()
        return True

    def _activate(self, f: Field) -> None:
        if f.kind in ("bool", "choice"):
            self.change(f, 1)
        else:
            v = f.get(self.settings)
            self.editing = f"{v:g}" if isinstance(v, float) else str(v)
            pygame.key.start_text_input()

    def _edit_event(self, e, buffer: str) -> str:
        if e.type == pygame.TEXTINPUT:
            return buffer + e.text
        if e.type != pygame.KEYDOWN:
            return buffer
        if e.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
            if self.commit_edit(self.current(), buffer):
                self._stop_edit()
        elif e.key == pygame.K_ESCAPE:
            self._stop_edit()
        elif e.key == pygame.K_BACKSPACE:
            return buffer[:-1]
        return buffer

    def _stop_edit(self) -> None:
        self.editing = None
        pygame.key.stop_text_input()

    def _save(self) -> bool:
        try:
            save_settings(self.settings, self.path)
        except (OSError, ValueError) as exc:
            self.message, self.message_bad = f"Speichern fehlgeschlagen: {exc}", True
            return False
        return True

    # -- layout ----------------------------------------------------------------------
    def _rows(self) -> list[tuple[str, object]]:
        """Visible rows: ("head", title) or ("field", index into fields())."""
        rows, i = [], 0
        for title, fs in self.sections:
            vis = [f for f in fs if f.visible(self.settings)]
            if not vis:
                continue
            rows.append(("head", title))
            for _ in vis:
                rows.append(("field", i))
                i += 1
        return rows

    def _list_geometry(self):
        r = self.renderer
        top, bottom = int(r.h * 0.17), int(r.h * 0.86)
        x, w = int(r.w * 0.06), int(r.w * 0.50)
        rows = self._rows()
        sel_row = next(k for k, (kind, v) in enumerate(rows) if kind == "field" and v == self.sel)
        visible_rows = max(1, (bottom - top) // self.ROW_H)
        if sel_row < self.scroll + 1:
            self.scroll = max(0, sel_row - 1)
        elif sel_row >= self.scroll + visible_rows:
            self.scroll = sel_row - visible_rows + 1
        self.scroll = max(0, min(self.scroll, max(0, len(rows) - visible_rows)))
        return rows, top, x, w, visible_rows

    def _click(self, pos) -> None:
        rows, top, x, w, n = self._list_geometry()
        for k, (kind, v) in enumerate(rows[self.scroll:self.scroll + n]):
            rect = pygame.Rect(x, top + k * self.ROW_H, w, self.ROW_H - 4)
            if kind == "field" and rect.collidepoint(pos):
                if v == self.sel:
                    f = self.current()
                    # Click on the right/left third steps the value, elsewhere activates.
                    if f.kind in ("int", "float", "choice", "color") and pos[0] > rect.right - rect.w // 3:
                        self.change(f, 1)
                    else:
                        self._activate(f)
                else:
                    self.sel = v
                return

    # -- drawing ---------------------------------------------------------------------
    def _draw(self, buffer: str) -> None:
        r = self.renderer
        s = self.settings
        r.begin(0.0, 0.0)
        r.draw_room()
        r.dim(185)
        r.text("EINSTELLUNGEN", (r.w * 0.06, r.h * 0.05), 60, ACCENT)
        r.text(f"Gespeichert in {self.path}", (r.w * 0.06, r.h * 0.05 + 52), 22, MUTED)

        rows, top, x, w, n = self._list_geometry()
        fields = self.fields()
        for k, (kind, v) in enumerate(rows[self.scroll:self.scroll + n]):
            y = top + k * self.ROW_H
            if kind == "head":
                r.text(str(v).upper(), (x, y + self.ROW_H - 8), 22, ACCENT, anchor="bottomleft")
                continue
            f = fields[v]
            rect = pygame.Rect(x, y, w, self.ROW_H - 4)
            sel = v == self.sel
            if sel:
                r.panel(rect, 230)
                pygame.draw.rect(r.surface, ACCENT, rect, 2)
            r.text(f.title(s), (rect.x + 14, rect.centery), 26, TEXT if sel else MUTED, anchor="midleft")
            if sel and self.editing is not None:
                val = buffer + ("_" if pygame.time.get_ticks() // 500 % 2 else " ")
            else:
                val = self.value_text(f)
                if sel and f.kind != "text":
                    val = f"<  {val}  >"
            if f.kind == "color":
                sw = pygame.Rect(rect.right - 30, rect.centery - 8, 16, 16)
                pygame.draw.rect(r.surface, parse_color(f.get(s)) if self.editing is None else ACCENT, sw)
                r.text(val, (rect.right - 40, rect.centery), 26, TEXT, anchor="midright")
            else:
                r.text(val, (rect.right - 14, rect.centery), 26, TEXT, anchor="midright")
        if self.scroll > 0:
            r.text("weitere oben", (x + w, top - 6), 20, MUTED, anchor="bottomright")
        if self.scroll + n < len(rows):
            r.text("weitere unten", (x + w, top + n * self.ROW_H), 20, MUTED, anchor="topright")

        self._draw_side(self.current())
        if self.editing is not None:
            keys = "Wert eintippen   Enter: übernehmen   Esc: abbrechen"
        else:
            keys = ("Pfeiltasten: Auswahl/Ändern (Shift: große Schritte)   Enter: Bearbeiten   "
                    "Entf: Standardwert   T: Sensitivität testen   Esc: Speichern und zurück")
        r.text(keys, (r.w * 0.06, r.h * 0.93), 22, MUTED, anchor="midleft")
        if self.message:
            r.text(self.message, (r.w * 0.06, r.h * 0.89), 24, BAD if self.message_bad else ACCENT, anchor="midleft")

    def _draw_side(self, f: Field) -> None:
        r, s = self.renderer, self.settings
        x, w = int(r.w * 0.60), int(r.w * 0.34)
        top, bottom = int(r.h * 0.17), int(r.h * 0.86)

        box = pygame.Rect(x, top, w, max(130, int(r.h * 0.20)))
        r.panel(box, 210)
        y = box.y + 14
        r.text(f.title(s), (box.x + 16, y), 30, TEXT)
        y += 36
        for line in _wrap(f.help or "Keine weiteren Hinweise.", r.font(22), box.w - 32):
            r.text(line, (box.x + 16, y), 22, MUTED)
            y += 22
        if f.visible(self.defaults):
            r.text(f"Standard: {self.value_text(f, self.defaults)}", (box.x + 16, box.bottom - 28), 22, MUTED)

        m = s.mouse
        items = [
            ("Winkel/Count", f"{m.effective_deg_per_count():.4f}°"),
            ("cm/360", f"{m.effective_cm_per_360():.1f} cm"),
        ] + [(label, f"{m.game_equivalent(key):.3f}") for key, (label, _) in GAME_YAW.items()]
        row_h, rows = 26, (len(items) + 1) // 2
        sens = pygame.Rect(x, box.bottom + 12, w, 44 + rows * row_h)
        r.panel(sens, 210)
        r.text(f"Sensitivität entspricht (bei {m.dpi} DPI)", (sens.x + 16, sens.y + 12), 24, TEXT)
        half = (sens.w - 32) // 2
        for i, (label, value) in enumerate(items):
            cx = sens.x + 16 + (i % 2) * (half + 16)
            cy = sens.y + 44 + (i // 2) * row_h + row_h // 2
            r.text(label, (cx, cy), 20, MUTED, anchor="midleft")
            r.text(value, (cx + half - 16, cy), 22, TEXT, anchor="midright")

        prev = pygame.Rect(x, sens.bottom + 12, w, bottom - sens.bottom - 12)
        if prev.h >= 60:
            r.panel(prev, 235)
            r.text("Vorschau", (prev.x + 16, prev.y + 10), 22, MUTED)
            c = (prev.centerx, prev.centery + 8)
            target_r = max(8, min(40, prev.h // 6))
            r.draw_sphere(c[0] + target_r * 2.2, c[1], target_r, (38, 180, 255))
            r.draw_crosshair(center=c)


def _wrap(text: str, font: pygame.font.Font, width: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if font.size(trial)[0] <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def display_changed(before: Settings, after: Settings) -> bool:
    b, a = before.display, after.display
    return (b.mode, b.width, b.height, b.display_index) != (a.mode, a.width, a.height, a.display_index)


def snapshot(settings: Settings) -> Settings:
    return copy.deepcopy(settings)
