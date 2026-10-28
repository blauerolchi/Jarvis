"""Application shell: display setup, scenario menu, results screen."""

from __future__ import annotations

import ctypes
import os
import sys
import webbrowser
from pathlib import Path

import pygame

from aimharness.data.store import list_sessions, read_meta
from aimharness.game.render import BG, Renderer
from aimharness.game.session import GameSession, SessionResult
from aimharness.game.sound import Sounds
from aimharness.inputsrc import create_input_source, resolve_backend
from aimharness.scenario import Scenario
from aimharness.settings import Settings

TEXT = (230, 232, 238)
MUTED = (150, 154, 166)
ACCENT = (120, 220, 255)
GOOD = (120, 230, 150)
BAD = (240, 130, 120)


def init_platform() -> None:
    os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
    # SDL captures the mouse while a button is held and may register its own raw
    # input for that; Windows keeps only one raw mouse target per process, which
    # would steal the harness' registration exactly during clicks.
    os.environ.setdefault("SDL_MOUSE_AUTO_CAPTURE", "0")
    if sys.platform == "win32":
        # Render at native resolution on scaled (high-DPI) displays.
        os.environ.setdefault("SDL_WINDOWS_DPI_AWARENESS", "permonitorv2")
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except (AttributeError, OSError):
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except (AttributeError, OSError):
                pass


def open_display(settings: Settings) -> pygame.Surface:
    d = settings.display
    sizes = pygame.display.get_desktop_sizes()
    idx = max(0, min(d.display_index, len(sizes) - 1))
    if d.mode == "windowed":
        size = (d.width or 1600, d.height or 900)
    else:
        size = (d.width or sizes[idx][0], d.height or sizes[idx][1])
    flags = {"fullscreen": pygame.FULLSCREEN, "borderless": pygame.NOFRAME, "windowed": 0}[d.mode]
    screen = pygame.display.set_mode(size, flags, display=idx)
    pygame.display.set_caption("Aim Harness")
    return screen


def scenario_history(data_root: Path, scenario_id: str) -> list[dict]:
    """quick_stats of completed sessions of one scenario, oldest first."""
    out = []
    for p in list_sessions(data_root):
        if scenario_id not in p.name:
            continue
        try:
            meta = read_meta(p)
        except (OSError, ValueError):
            continue
        if meta.get("scenario", {}).get("id") == scenario_id and not meta.get("aborted"):
            out.append(meta.get("quick_stats", {}))
    return out


class App:
    def __init__(self, settings: Settings, scenarios: list[Scenario], data_root: Path, backend: str | None = None):
        self.settings = settings
        self.scenarios = scenarios
        self.data_root = data_root
        self.backend = resolve_backend(backend or settings.input.backend)
        self.selected = 0
        self.message = ""
        self._history: dict[str, list[dict]] = {}

    def history(self, scenario_id: str) -> list[dict]:
        if scenario_id not in self._history:
            self._history[scenario_id] = scenario_history(self.data_root, scenario_id)
        return self._history[scenario_id]

    def run(self, scenario_id: str | None = None) -> int:
        init_platform()
        pygame.mixer.pre_init(44100, -16, 1, 256)
        pygame.init()
        try:
            self.screen = open_display(self.settings)
            self.renderer = Renderer(self.screen, self.settings.display.hfov_deg, self.settings.crosshair)
            self.sounds = Sounds(self.settings.audio.enabled, self.settings.audio.volume)
            self.clock = pygame.time.Clock()
            if scenario_id:
                ids = [s.id for s in self.scenarios]
                if scenario_id not in ids:
                    raise SystemExit(f"unknown scenario {scenario_id!r}; available: {', '.join(ids)}")
                self.selected = ids.index(scenario_id)
                if not self._play_loop():
                    return 0
            while True:
                if not self._menu():
                    return 0
                if not self._play_loop():
                    return 0
        finally:
            pygame.quit()

    # -- play ------------------------------------------------------------------------
    def _play_loop(self) -> bool:
        """Play the selected scenario until the user goes back. False = quit app."""
        while True:
            result = self._play_once()
            self._history.clear()
            if result.path is None:
                return True
            action = self._results(result)
            if action == "again":
                continue
            return action != "quit"

    def _play_once(self) -> SessionResult:
        sc = self.scenarios[self.selected]
        source = create_input_source(self.backend)
        hwnd = pygame.display.get_wm_info().get("window")
        pygame.mouse.set_visible(False)
        source.start(hwnd)
        try:
            session = GameSession(self.screen, self.settings, sc, source, self.data_root, self.sounds)
            return session.run()
        finally:
            source.stop()
            pygame.mouse.set_visible(True)
            pygame.event.clear()

    # -- menu ------------------------------------------------------------------------
    def _menu(self) -> bool:
        r = self.renderer
        while True:
            for e in pygame.event.get():
                if e.type == pygame.QUIT:
                    return False
                if e.type == pygame.KEYDOWN:
                    if e.key == pygame.K_ESCAPE:
                        return False
                    if e.key in (pygame.K_UP, pygame.K_w):
                        self.selected = (self.selected - 1) % len(self.scenarios)
                    elif e.key in (pygame.K_DOWN, pygame.K_s):
                        self.selected = (self.selected + 1) % len(self.scenarios)
                    elif e.key in (pygame.K_RETURN, pygame.K_KP_ENTER, pygame.K_SPACE):
                        return True
                    elif e.key == pygame.K_r:
                        self._make_report()
                    elif pygame.K_1 <= e.key <= pygame.K_9 and e.key - pygame.K_1 < len(self.scenarios):
                        self.selected = e.key - pygame.K_1
                elif e.type == pygame.MOUSEWHEEL:
                    self.selected = (self.selected - e.y) % len(self.scenarios)
                elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
                    hit = self._menu_item_at(e.pos)
                    if hit is not None:
                        if hit == self.selected:
                            return True
                        self.selected = hit
            self._draw_menu()
            pygame.display.flip()
            self.clock.tick(60)

    def _menu_rows(self) -> list[pygame.Rect]:
        r = self.renderer
        x, y0, h = int(r.w * 0.08), int(r.h * 0.22), 46
        return [pygame.Rect(x, y0 + i * h, int(r.w * 0.36), h - 6) for i in range(len(self.scenarios))]

    def _menu_item_at(self, pos) -> int | None:
        for i, rect in enumerate(self._menu_rows()):
            if rect.collidepoint(pos):
                return i
        return None

    def _draw_menu(self) -> None:
        r = self.renderer
        r.begin(0.0, 0.0)
        r.draw_room()
        r.dim(170)
        r.text("AIM HARNESS", (r.w * 0.08, r.h * 0.08), 72, ACCENT)
        r.text("Zeigebewegungen erfassen und auswerten", (r.w * 0.08, r.h * 0.08 + 62), 28, MUTED)
        for i, (sc, rect) in enumerate(zip(self.scenarios, self._menu_rows())):
            sel = i == self.selected
            r.panel(rect, 230 if sel else 120)
            if sel:
                pygame.draw.rect(r.surface, ACCENT, rect, 2)
            r.text(f"{i + 1}  {sc.name}", (rect.x + 14, rect.centery), 30, TEXT if sel else MUTED, anchor="midleft")
            r.text(f"{sc.duration_s:.0f}s", (rect.right - 14, rect.centery), 24, MUTED, anchor="midright")

        sc = self.scenarios[self.selected]
        box = pygame.Rect(int(r.w * 0.50), int(r.h * 0.22), int(r.w * 0.42), int(r.h * 0.46))
        r.panel(box, 210)
        y = box.y + 20
        r.text(sc.name, (box.x + 20, y), 44, TEXT)
        y += 52
        for line in _wrap(sc.description, r.font(26), box.w - 40):
            r.text(line, (box.x + 20, y), 26, MUTED)
            y += 26
        y += 14
        details = [
            f"Wertung: {'Tracking (LMB halten)' if sc.scoring == 'tracking' else 'Klick'}",
            f"Ziele: {sc.spawn.count} gleichzeitig, Muster '{sc.spawn.pattern}', Bewegung '{sc.motion.kind}'",
            f"Radius {', '.join(f'{v:g}' for v in sc.targets.radius_m)} m  ·  Distanz {', '.join(f'{v:g}' for v in sc.targets.distance_m)} m",
        ]
        for line in details:
            r.text(line, (box.x + 20, y), 24, MUTED)
            y += 26
        hist = self.history(sc.id)
        y += 14
        if hist:
            best = max(h.get("score", 0) for h in hist)
            last = hist[-1]
            r.text(f"Sessions: {len(hist)}   Bestwert: {best}   Zuletzt: {last.get('score', 0)}", (box.x + 20, y), 28, TEXT)
        else:
            r.text("Noch keine Sessions", (box.x + 20, y), 28, TEXT)

        m = self.settings.mouse
        dpc = m.effective_deg_per_count()
        info = (f"Sensitivität {dpc:.4f}°/count ({m.effective_cm_per_360():.1f} cm/360 @ {m.dpi} DPI)  ·  "
                f"FOV {self.settings.display.hfov_deg:g}°  ·  Eingabe: {self.backend}")
        r.text(info, (r.w * 0.08, r.h * 0.86), 24, MUTED)
        r.text("Pfeiltasten oder 1-9: Auswahl   Enter/Doppelklick: Start   R: Report   Esc: Beenden",
               (r.w * 0.08, r.h * 0.86 + 30), 24, MUTED)
        if self.message:
            r.text(self.message, (r.w * 0.08, r.h * 0.86 - 34), 24, ACCENT)

    # -- results ---------------------------------------------------------------------
    def _results(self, result: SessionResult) -> str:
        sc = self.scenarios[self.selected]
        hist = self.history(sc.id)
        prev = hist[:-1] if hist and not result.aborted else hist
        prev_best = max((h.get("score", 0) for h in prev), default=None)
        r = self.renderer
        while True:
            for e in pygame.event.get():
                if e.type == pygame.QUIT:
                    return "quit"
                if e.type == pygame.KEYDOWN:
                    if e.key in (pygame.K_RETURN, pygame.K_KP_ENTER, pygame.K_SPACE):
                        return "again"
                    if e.key in (pygame.K_ESCAPE, pygame.K_m):
                        return "menu"
                    if e.key == pygame.K_r:
                        self._make_report()
            r.begin(0.0, 0.0)
            r.draw_room()
            r.dim(180)
            st = result.stats
            r.text(sc.name, (r.w / 2, r.h * 0.14), 48, MUTED, anchor="center")
            r.text(str(st.get("score", 0)), (r.w / 2, r.h * 0.25), 120, ACCENT, anchor="center")
            if result.aborted:
                r.text("abgebrochen – Daten wurden trotzdem gespeichert", (r.w / 2, r.h * 0.33), 26, BAD, anchor="center")
            elif prev_best is not None:
                diff = st.get("score", 0) - prev_best
                txt = "Neuer Bestwert!" if diff > 0 else f"Bestwert {prev_best} ({diff:+d})"
                r.text(txt, (r.w / 2, r.h * 0.33), 30, GOOD if diff > 0 else MUTED, anchor="center")
            rows = _result_rows(st, sc.scoring)
            y = r.h * 0.40
            for label, value in rows:
                r.text(label, (r.w / 2 - 20, y), 32, MUTED, anchor="topright")
                r.text(value, (r.w / 2 + 20, y), 32, TEXT, anchor="topleft")
                y += 40
            if result.path:
                r.text(f"Gespeichert: {result.path}", (r.w / 2, r.h * 0.84), 22, MUTED, anchor="center")
            r.text("Enter: Nochmal   R: Report   M/Esc: Menü", (r.w / 2, r.h * 0.89), 28, TEXT, anchor="center")
            if self.message:
                r.text(self.message, (r.w / 2, r.h * 0.93), 24, ACCENT, anchor="center")
            pygame.display.flip()
            self.clock.tick(60)

    def _make_report(self) -> None:
        r = self.renderer
        r.dim(200)
        r.text("Report wird erstellt ...", (r.w / 2, r.h / 2), 40, TEXT, anchor="center")
        pygame.display.flip()
        try:
            from aimharness.analysis.report import build_report

            path = build_report(self.data_root)
            self.message = f"Report: {path}"
            webbrowser.open(path.as_uri())
        except Exception as exc:  # noqa: BLE001 - shown to the user, app keeps running
            self.message = f"Report fehlgeschlagen: {exc}"


def _result_rows(st: dict, scoring: str) -> list[tuple[str, str]]:
    if scoring == "tracking":
        return [
            ("On target (LMB)", f"{st.get('on_target_held_pct', 0):.1f} %"),
            ("On target (gesamt)", f"{st.get('on_target_pct', 0):.1f} %"),
            ("Aktive Zeit", f"{st.get('active_s', 0):.1f} s"),
        ]
    ttk = st.get("mean_ttk_ms")
    return [
        ("Treffer / Schüsse", f"{st.get('hits', 0)} / {st.get('shots', 0)}"),
        ("Genauigkeit", f"{100 * st.get('accuracy', 0):.1f} %"),
        ("Kills pro Minute", f"{st.get('kills_per_min', 0):.1f}"),
        ("Ø Zeit bis Treffer", f"{ttk:.0f} ms" if ttk else "–"),
        ("Abgelaufene Ziele", str(st.get("expired", 0))),
    ]


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


__all__ = ["App", "BG", "init_platform", "open_display"]
