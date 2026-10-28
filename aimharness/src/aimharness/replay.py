"""Visual replay of a recorded session from the logged frames."""

from __future__ import annotations

import time

import numpy as np
import pygame

from aimharness.confutil import parse_color
from aimharness.data.store import SessionData
from aimharness.game.app import init_platform, open_display
from aimharness.game.render import Renderer
from aimharness.settings import Settings

TRAIL_NS = 350_000_000
SHOT_NS = 500_000_000
SEEK_NS = 2_000_000_000
HIT = (90, 220, 120)
MISS = (240, 110, 100)
TRAIL = (255, 210, 90)


class Replay:
    def __init__(self, sess: SessionData, settings: Settings, speed: float = 1.0):
        self.sess = sess
        self.settings = settings
        self.speed = speed
        fr = sess.frames.sort_values("frame")
        self.f_t = fr["t_ns"].to_numpy(np.int64)
        self.f_id = fr["frame"].to_numpy(np.int64)
        self.f_yaw = fr["yaw_deg"].to_numpy(float)
        self.f_pitch = fr["pitch_deg"].to_numpy(float)
        tf = sess.target_frames.sort_values("frame")
        self.tf_frame = tf["frame"].to_numpy(np.int64)
        self.tf = tf[["yaw_deg", "pitch_deg", "distance_m", "radius_m"]].to_numpy(float)
        inp = sess.input_events[~sess.input_events["paused"]]
        self.i_t = inp["t_ns"].to_numpy(np.int64)
        self.i_yaw = inp["yaw_deg"].to_numpy(float)
        self.i_pitch = inp["pitch_deg"].to_numpy(float)
        sh = sess.shots
        self.shots = list(zip(sh["t_ns"].to_numpy(np.int64), sh["yaw_deg"], sh["pitch_deg"], sh["hit"]))
        kills = sess.targets[sess.targets["outcome"] == "killed"]["end_t_ns"]
        self.kills = np.sort(kills.to_numpy(np.int64))
        self.color = parse_color(sess.meta["scenario"]["targets"]["color"]) if "targets" in sess.meta["scenario"] else (38, 180, 255)
        self.t = int(self.f_t[0]) if len(self.f_t) else 0
        self.playing = True
        self.show_trail = True

    def run(self) -> None:
        init_platform()
        pygame.init()
        try:
            screen = open_display(self.settings)
            hfov = float(self.sess.meta.get("display", {}).get("hfov_deg", self.settings.display.hfov_deg))
            self.r = Renderer(screen, hfov, self.settings.crosshair)
            clock = pygame.time.Clock()
            last = time.perf_counter_ns()
            while True:
                now = time.perf_counter_ns()
                if self.playing:
                    self.t = min(int(self.f_t[-1]), self.t + int((now - last) * self.speed))
                last = now
                if not self._events():
                    return
                self._draw()
                pygame.display.flip()
                clock.tick(240)
        finally:
            pygame.quit()

    # -- input -----------------------------------------------------------------------
    def _seek(self, t: int) -> None:
        self.t = int(np.clip(t, self.f_t[0], self.f_t[-1]))

    def _events(self) -> bool:
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                return False
            if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1 and e.pos[1] >= self.r.h - 40:
                frac = (e.pos[0] - 20) / max(1, self.r.w - 40)
                self._seek(int(self.f_t[0] + frac * (self.f_t[-1] - self.f_t[0])))
            if e.type != pygame.KEYDOWN:
                continue
            k = e.key
            if k == pygame.K_ESCAPE:
                return False
            if k == pygame.K_SPACE:
                self.playing = not self.playing
            elif k in (pygame.K_LEFT, pygame.K_RIGHT):
                step = 1 if k == pygame.K_RIGHT else -1
                if self.playing:
                    self._seek(self.t + step * SEEK_NS)
                else:
                    i = int(np.clip(np.searchsorted(self.f_t, self.t, "right") - 1 + step, 0, len(self.f_t) - 1))
                    self.t = int(self.f_t[i])
            elif k == pygame.K_UP:
                self.speed = min(4.0, self.speed * 2)
            elif k == pygame.K_DOWN:
                self.speed = max(0.0625, self.speed / 2)
            elif k in (pygame.K_n, pygame.K_b) and len(self.kills):
                if k == pygame.K_n:
                    nxt = self.kills[self.kills > self.t + 700_000_000]
                    target = nxt[0] if len(nxt) else self.kills[-1]
                else:
                    prv = self.kills[self.kills < self.t - 100_000_000]
                    target = prv[-1] if len(prv) else self.kills[0]
                self._seek(int(target) - 600_000_000)
            elif k == pygame.K_t:
                self.show_trail = not self.show_trail
            elif k == pygame.K_HOME:
                self._seek(int(self.f_t[0]))
        return True

    # -- drawing ---------------------------------------------------------------------
    def _draw(self) -> None:
        r = self.r
        i = max(0, int(np.searchsorted(self.f_t, self.t, "right")) - 1)
        frame = int(self.f_id[i])
        r.begin(self.f_yaw[i], self.f_pitch[i])
        r.draw_room()
        lo, hi = np.searchsorted(self.tf_frame, [frame, frame + 1])
        for yaw, pitch, dist, rad in sorted(self.tf[lo:hi], key=lambda row: -row[2]):
            sx, sy, sr, on = r.target_screen(yaw, pitch, dist, rad)
            if on:
                r.draw_sphere(sx, sy, sr, self.color)
        if self.show_trail:
            a, b = np.searchsorted(self.i_t, [self.t - TRAIL_NS, self.t + 1])
            pts = [r.world_to_screen(y, p) for y, p in zip(self.i_yaw[a:b], self.i_pitch[a:b])]
            pts = [p for p in pts if p is not None]
            if len(pts) >= 2:
                pygame.draw.lines(r.surface, TRAIL, False, pts, 2)
        for t_ns, yaw, pitch, hit in self.shots:
            if self.t - SHOT_NS <= t_ns <= self.t:
                p = r.world_to_screen(yaw, pitch)
                if p:
                    pygame.draw.circle(r.surface, HIT if hit else MISS, p, 7, 2)
        r.draw_crosshair()
        self._hud(frame)

    def _hud(self, frame: int) -> None:
        r = self.r
        t_s = (self.t - self.f_t[0]) / 1e9
        total = (self.f_t[-1] - self.f_t[0]) / 1e9
        state = "Wiedergabe" if self.playing else "Pause"
        r.text(f"{self.sess.path.name}", (20, 16), 24, (190, 194, 204))
        r.text(f"{state}  {t_s:6.2f} / {total:.2f} s   Frame {frame}   Tempo {self.speed:g}x", (20, 42), 28)
        r.text("Leertaste: Pause   Pfeile links/rechts: Frame bzw. 2 s   hoch/runter: Tempo   N/B: nächster/vorheriger Treffer"
               "   T: Spur   Pos1: Anfang   Esc: Ende", (20, r.h - 66), 20, (150, 154, 166))
        bar = pygame.Rect(20, r.h - 34, r.w - 40, 10)
        pygame.draw.rect(r.surface, (60, 63, 74), bar, border_radius=5)
        frac = t_s / total if total > 0 else 0
        pygame.draw.rect(r.surface, (120, 220, 255), (bar.x, bar.y, int(bar.w * frac), bar.h), border_radius=5)
        for k in self.kills:
            x = bar.x + bar.w * (k - self.f_t[0]) / max(1, self.f_t[-1] - self.f_t[0])
            pygame.draw.line(r.surface, HIT, (x, bar.y - 4), (x, bar.y - 1))
