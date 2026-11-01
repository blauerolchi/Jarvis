"""One recorded run of a scenario: countdown, frame loop, recording, saving."""

from __future__ import annotations

import datetime as dt
import math
import platform
import sys
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pygame

from aimharness import __version__
from aimharness.confutil import to_dict
from aimharness.data.recorder import SessionRecorder
from aimharness.data.store import new_session_dir
from aimharness.game.render import Effect, Renderer, fmt_time
from aimharness.game.sound import Sounds
from aimharness.game.targets import TargetManager
from aimharness.inputsrc.base import FLAG_ABSOLUTE, LMB_DOWN, LMB_UP, InputSource
from aimharness.mathutil import angle_between, tangent_offset, wrap_deg
from aimharness.scenario import Scenario
from aimharness.settings import Settings


@dataclass
class QuickStats:
    shots: int = 0
    hits: int = 0
    kills: int = 0
    expired: int = 0
    ttk_ms: list[float] = field(default_factory=list)
    on_target_s: float = 0.0       # tracking: time on target while LMB held
    on_target_any_s: float = 0.0   # tracking: time on target regardless of LMB
    active_s: float = 0.0

    @property
    def accuracy(self) -> float:
        return self.hits / self.shots if self.shots else 0.0

    def score(self, scoring: str) -> int:
        if scoring == "tracking":
            return int(round(self.on_target_s * 100))
        return int(round(self.kills * 100 * self.accuracy))

    def as_dict(self, scoring: str) -> dict:
        d = {
            "score": self.score(scoring),
            "shots": self.shots,
            "hits": self.hits,
            "kills": self.kills,
            "expired": self.expired,
            "accuracy": round(self.accuracy, 4),
            "active_s": round(self.active_s, 3),
        }
        if scoring == "tracking":
            d["on_target_pct"] = round(100 * self.on_target_any_s / self.active_s, 2) if self.active_s else 0.0
            d["on_target_held_pct"] = round(100 * self.on_target_s / self.active_s, 2) if self.active_s else 0.0
        else:
            d["kills_per_min"] = round(60 * self.kills / self.active_s, 2) if self.active_s else 0.0
            d["mean_ttk_ms"] = round(float(np.mean(self.ttk_ms)), 1) if self.ttk_ms else None
        return d


@dataclass
class SessionResult:
    path: Path | None
    aborted: bool
    stats: dict


class GameSession:
    def __init__(self, screen: pygame.Surface, settings: Settings, scenario: Scenario, source: InputSource,
                 data_root: Path, sounds: Sounds | None = None, max_frames: int | None = None):
        self.screen = screen
        self.settings = settings
        self.sc = scenario
        self.source = source
        self.data_root = data_root
        self.renderer = Renderer(screen, settings.display.hfov_deg, settings.crosshair)
        self.color = scenario.targets.rgb
        self.highlight_color = tuple(min(255, int(c * 0.6 + 110)) for c in self.color)
        for c in (self.color, self.highlight_color):
            self.renderer.sphere_sprite(c)
        self.sounds = sounds or Sounds(False, 0.0)
        self.max_frames = max_frames  # for automated tests
        self.deg_per_count = settings.mouse.effective_deg_per_count()
        self.y_sign = -1.0 if settings.mouse.invert_y else 1.0
        self.seed = scenario.seed or int(np.random.SeedSequence().entropy % (2**31))
        self.rng = np.random.default_rng(self.seed)
        self.clock = pygame.time.Clock()
        self.yaw = 0.0
        self.pitch = 0.0
        self.lmb = False
        self.paused = False
        self.show_fps = settings.display.show_fps
        self.effects: list[Effect] = []
        self.stats = QuickStats()
        self._shot_id = 0
        self._pauses: list[list[int]] = []

    # -- helpers ---------------------------------------------------------------------
    def _apply_motion(self, dx: int, dy: int) -> None:
        self.yaw = wrap_deg(self.yaw + dx * self.deg_per_count)
        self.pitch = float(np.clip(self.pitch - self.y_sign * dy * self.deg_per_count, -89.0, 89.0))

    def _pump(self) -> tuple[list, bool, bool]:
        """Return (events, quit_requested, escape_pressed); handles focus changes."""
        events = pygame.event.get()
        quit_req = esc = False
        for e in events:
            if e.type == pygame.QUIT:
                quit_req = True
            elif e.type == pygame.KEYDOWN:
                if e.key == pygame.K_ESCAPE:
                    esc = True
                elif e.key == pygame.K_F3:
                    self.show_fps = not self.show_fps
            elif e.type == pygame.WINDOWFOCUSLOST:
                self.source.set_focus(False)
            elif e.type == pygame.WINDOWFOCUSGAINED:
                self.source.set_focus(True)
        return events, quit_req, esc

    # -- phases ----------------------------------------------------------------------
    def _countdown(self) -> bool:
        """Show a countdown while the view is already controllable. False = cancelled."""
        r = self.renderer
        end = time.perf_counter() + self.settings.session.countdown_s
        while True:
            left = end - time.perf_counter()
            if left <= 0:
                return True
            events, quit_req, esc = self._pump()
            if quit_req or esc:
                return False
            for ev in self.source.poll(events):
                if not ev.flags & FLAG_ABSOLUTE:
                    self._apply_motion(ev.dx, ev.dy)
            self.source.per_frame()
            r.begin(self.yaw, self.pitch)
            r.draw_room()
            r.draw_crosshair()
            r.text(self.sc.name, (r.w / 2, r.h * 0.30), 44, anchor="center")
            r.text(str(int(math.ceil(left))), (r.w / 2, r.h * 0.40), 96, (120, 220, 255), anchor="center")
            r.text("Esc: abbrechen", (r.w / 2, r.h * 0.48), 24, (150, 154, 166), anchor="center")
            pygame.display.flip()
            self.clock.tick(self.settings.display.fps_cap)

    def run(self) -> SessionResult:
        self.source.poll(pygame.event.get())  # discard stale input
        if self.settings.session.countdown_s > 0 and not self._countdown():
            return SessionResult(None, True, {})
        self.source.poll(pygame.event.get())

        t0 = time.perf_counter_ns()
        rec = SessionRecorder(t0)
        mgr = TargetManager(self.sc, self.rng)
        mgr.start(0.0)
        started = dt.datetime.now()
        aborted = False
        error = None
        frame = 0
        sim_s = 0.0
        last_t = t0
        try:
            while True:
                t_frame = time.perf_counter_ns()
                dt_s = min(0.1, (t_frame - last_t) / 1e9)
                last_t = t_frame
                events, quit_req, esc = self._pump()
                if quit_req or esc:
                    aborted = True
                    break
                for e in events:
                    if e.type == pygame.WINDOWFOCUSLOST and not self.paused:
                        self._set_paused(True, t_frame, frame, rec)
                    elif e.type == pygame.KEYDOWN and e.key == pygame.K_p:
                        self._set_paused(not self.paused, t_frame, frame, rec)

                # 1) input, in order of arrival; shots use the state that was on screen
                inputs = self.source.poll(events)
                sum_dx = sum_dy = 0
                for ev in inputs:
                    if self.paused:
                        if ev.buttons & LMB_DOWN:
                            self._set_paused(False, ev.t_ns, frame, rec)
                        rec.input_event(ev, frame, self.yaw, self.pitch, True)
                        continue
                    if not ev.flags & FLAG_ABSOLUTE:
                        self._apply_motion(ev.dx, ev.dy)
                        sum_dx += ev.dx
                        sum_dy += ev.dy
                    rec.input_event(ev, frame, self.yaw, self.pitch, False)
                    if ev.buttons & LMB_DOWN:
                        self.lmb = True
                        self._fire(ev.t_ns, frame, mgr, rec, sim_s)
                    if ev.buttons & LMB_UP:
                        self.lmb = False
                self.source.per_frame()

                # 2) simulation
                on_target = -1
                if not self.paused:
                    sim_s += dt_s
                    self.stats.active_s = sim_s
                    mgr.update(t_frame, frame, sim_s, dt_s, self.yaw, self.pitch)
                    tgt = mgr.under_crosshair(self.yaw, self.pitch)
                    on_target = tgt.id if tgt else -1
                    if self.sc.scoring == "tracking" and tgt is not None:
                        self.stats.on_target_any_s += dt_s
                        if self.lmb:
                            self.stats.on_target_s += dt_s
                for te in mgr.events:
                    rec.event(te.t_ns, te.frame, te.target_id, te.kind, te.value)
                    if te.kind == "expired":
                        self.stats.expired += 1
                mgr.events.clear()

                # 3) render
                screen_info = self._render(mgr, sim_s)
                pygame.display.flip()
                t_present = time.perf_counter_ns()

                # 4) record what was presented
                rec.frame(frame, t_frame, t_present, dt_s * 1000.0, self.yaw, self.pitch, len(inputs),
                          sum_dx, sum_dy, self.lmb, on_target, self.paused)
                for tgt, (sx, sy, sr, on_screen) in screen_info:
                    rec.target_frame(frame, tgt.id, tgt.yaw, tgt.pitch, tgt.distance, tgt.radius,
                                     tgt.ang_radius, sx, sy, sr, on_screen)
                    if on_screen and tgt.visible_t_ns < 0:
                        tgt.visible_t_ns, tgt.visible_frame = t_present, frame
                        rec.event(t_present, frame, tgt.id, "visible")

                frame += 1
                if sim_s >= self.sc.duration_s or (self.max_frames and frame >= self.max_frames):
                    break
                self.clock.tick(self.settings.display.fps_cap)
        except Exception:  # keep whatever was recorded
            aborted = True
            error = traceback.format_exc()
        finally:
            t_end = time.perf_counter_ns()
            if self.paused:
                self._set_paused(False, t_end, frame, rec)
            mgr.end_all(t_end, frame)
            for te in mgr.events:
                rec.event(te.t_ns, te.frame, te.target_id, te.kind, te.value)
            rec.targets(mgr.all_targets())

        stats = self.stats.as_dict(self.sc.scoring)
        session_dir = new_session_dir(self.data_root, self.sc.id, started)
        meta = self._meta(session_dir.name, started, t0, t_end, frame, aborted, error, stats)
        path = rec.save(session_dir, meta)
        if error:
            print(error, file=sys.stderr)
        return SessionResult(path, aborted, stats)

    # -- frame parts -----------------------------------------------------------------
    def _set_paused(self, paused: bool, t_ns: int, frame: int, rec: SessionRecorder) -> None:
        if paused == self.paused:
            return
        self.paused = paused
        rec.event(t_ns, frame, -1, "pause" if paused else "resume")
        if paused:
            self._pauses.append([t_ns - rec.t0, -1])
            self.lmb = False
        elif self._pauses:
            self._pauses[-1][1] = t_ns - rec.t0

    def _fire(self, t_ns: int, frame: int, mgr: TargetManager, rec: SessionRecorder, sim_s: float) -> None:
        tgt, edge = mgr.nearest(self.yaw, self.pitch)
        hit = tgt is not None and edge <= 0.0
        killed = False
        if self.sc.scoring == "click":
            self.stats.shots += 1
            if hit:
                self.stats.hits += 1
                killed = mgr.hit(tgt, t_ns, frame, sim_s)
                if killed:
                    self.stats.kills += 1
                    start = tgt.visible_t_ns if tgt.visible_t_ns >= 0 else tgt.spawn_t_ns
                    self.stats.ttk_ms.append((t_ns - start) / 1e6)
                    self.effects.append(Effect(tgt.yaw, tgt.pitch, tgt.distance, tgt.radius, sim_s, self.color))
                    self.sounds.kill()
                else:
                    self.sounds.hit()
            else:
                self.sounds.miss()
        if tgt is not None:
            err = float(angle_between(self.yaw, self.pitch, tgt.yaw, tgt.pitch))
            ex, ey = tangent_offset(self.yaw, self.pitch, tgt.yaw, tgt.pitch)
            rec.shot(self._shot_id, t_ns, frame, self.yaw, self.pitch, hit, killed, tgt.id, err,
                     float(ex), float(ey), tgt.ang_radius)
        else:
            nan = float("nan")
            rec.shot(self._shot_id, t_ns, frame, self.yaw, self.pitch, False, False, -1, nan, nan, nan, nan)
        self._shot_id += 1

    def _render(self, mgr: TargetManager, sim_s: float):
        r = self.renderer
        r.begin(self.yaw, self.pitch)
        r.draw_room()
        info = []
        for tgt in mgr.alive.values():
            info.append((tgt, r.target_screen(tgt.yaw, tgt.pitch, tgt.distance, tgt.radius)))
        for tgt, (sx, sy, sr, on_screen) in sorted(info, key=lambda it: -it[0].distance):
            if on_screen:
                highlight = self.sc.scoring == "tracking" and self.lmb and mgr.under_crosshair(self.yaw, self.pitch) is tgt
                r.draw_sphere(sx, sy, sr, self.highlight_color if highlight else self.color)
        self.effects = [e for e in self.effects if sim_s - e.t0 <= e.duration]
        r.draw_effects(self.effects, sim_s)
        r.draw_crosshair()
        self._hud(sim_s)
        return info

    def _hud(self, sim_s: float) -> None:
        r, st = self.renderer, self.stats
        r.text(fmt_time(self.sc.duration_s - sim_s), (r.w / 2, 18), 48, anchor="midtop")
        r.text(f"{st.score(self.sc.scoring)}", (r.w / 2, 62), 30, (120, 220, 255), anchor="midtop")
        if self.sc.scoring == "tracking":
            pct = 100 * st.on_target_s / sim_s if sim_s > 0 else 0.0
            r.text(f"On target {pct:4.1f}%", (24, 18), 28)
        else:
            r.text(f"Accuracy {100 * st.accuracy:5.1f}%", (24, 18), 28)
            r.text(f"Kills {st.kills}", (24, 46), 28)
        if self.show_fps:
            r.text(f"{self.clock.get_fps():5.0f} fps", (r.w - 20, 18), 24, (150, 154, 166), anchor="topright")
        if self.paused:
            r.dim(150)
            r.text("Pausiert", (r.w / 2, r.h * 0.42), 64, anchor="center")
            r.text("Klick oder P: weiter  ·  Esc: beenden und speichern", (r.w / 2, r.h * 0.50), 28,
                   (190, 194, 204), anchor="center")

    def _meta(self, session_id, started, t0, t_end, frames, aborted, error, stats) -> dict:
        s = self.settings
        return {
            "harness_version": __version__,
            "session_id": session_id,
            "started": started.isoformat(timespec="seconds"),
            "duration_s": round((t_end - t0) / 1e9, 3),
            "frames": frames,
            "aborted": aborted,
            "error": error,
            "seed": self.seed,
            "scenario": to_dict(self.sc),
            "mouse": {**to_dict(s.mouse), "deg_per_count_effective": self.deg_per_count},
            "display": {**to_dict(s.display), "width_px": self.renderer.w, "height_px": self.renderer.h,
                        "vfov_deg": self.renderer.proj.vfov_deg, "focal_px": self.renderer.proj.focal},
            "input": {"backend": self.source.name, "timestamp_quality": self.source.timestamp_quality,
                      **self.source.diagnostics()},
            "pauses_ns": self._pauses,
            "setup_note": s.session.setup_note,
            "platform": {"os": platform.platform(), "python": sys.version.split()[0],
                         "pygame": pygame.version.ver, "sdl": ".".join(map(str, pygame.get_sdl_version()))},
            "quick_stats": stats,
        }
