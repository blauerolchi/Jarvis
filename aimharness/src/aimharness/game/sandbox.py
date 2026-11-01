"""Free-aim sandbox for trying out the sensitivity. Nothing is recorded."""

from __future__ import annotations

import math
import time

import numpy as np
import pygame

from aimharness.game.render import Effect, Renderer
from aimharness.game.sound import Sounds
from aimharness.inputsrc import create_input_source
from aimharness.inputsrc.base import FLAG_ABSOLUTE, LMB_DOWN
from aimharness.mathutil import angle_between, angular_radius_deg, wrap_deg
from aimharness.settings import Settings

TARGET_COLOR = (38, 180, 255)
DISTANCE = 10.0
RADIUS = 0.35
RESPAWN_S = 0.6
# Fixed layout: centre plus rings at 15 and 35 degrees to judge short and long flicks.
LAYOUT = [(0.0, 0.0)] + [(15 * math.cos(a), 15 * math.sin(a)) for a in np.radians(range(0, 360, 90))] \
    + [(35 * math.cos(a), 0.6 * 35 * math.sin(a)) for a in np.radians(range(45, 360, 90))]


def sensitivity_line(settings: Settings) -> str:
    m = settings.mouse
    dpc = m.effective_deg_per_count()
    return (f"{dpc:.4f}°/count  ·  {m.effective_cm_per_360():.1f} cm/360 bei {m.dpi} DPI  ·  "
            f"CS2 {m.game_equivalent('cs2'):.2f}  ·  Valorant {m.game_equivalent('valorant'):.3f}")


def run_sandbox(screen: pygame.Surface, settings: Settings, backend: str, sounds: Sounds) -> None:
    r = Renderer(screen, settings.display.hfov_deg, settings.crosshair)
    r.sphere_sprite(TARGET_COLOR)
    clock = pygame.time.Clock()
    source = create_input_source(backend)
    pygame.mouse.set_visible(False)
    source.start(pygame.display.get_wm_info().get("window"))
    yaw = pitch = 0.0
    hidden_until = [0.0] * len(LAYOUT)
    effects: list[Effect] = []
    ang_r = angular_radius_deg(RADIUS, DISTANCE)
    try:
        while True:
            now = time.perf_counter()
            events = pygame.event.get()
            for e in events:
                if e.type == pygame.QUIT:
                    return
                if e.type == pygame.KEYDOWN:
                    if e.key in (pygame.K_ESCAPE, pygame.K_t):
                        return
                    if e.key in (pygame.K_PLUS, pygame.K_KP_PLUS, pygame.K_EQUALS):
                        settings.mouse.scale_sensitivity(1.02)
                    elif e.key in (pygame.K_MINUS, pygame.K_KP_MINUS):
                        settings.mouse.scale_sensitivity(1 / 1.02)
                    elif e.key == pygame.K_c:
                        yaw = pitch = 0.0
                elif e.type == pygame.WINDOWFOCUSLOST:
                    source.set_focus(False)
                elif e.type == pygame.WINDOWFOCUSGAINED:
                    source.set_focus(True)
            dpc = settings.mouse.effective_deg_per_count()
            y_sign = -1.0 if settings.mouse.invert_y else 1.0
            for ev in source.poll(events):
                if not ev.flags & FLAG_ABSOLUTE:
                    yaw = wrap_deg(yaw + ev.dx * dpc)
                    pitch = float(np.clip(pitch - y_sign * ev.dy * dpc, -89.0, 89.0))
                if ev.buttons & LMB_DOWN:
                    for i, (ty, tp) in enumerate(LAYOUT):
                        if now >= hidden_until[i] and angle_between(yaw, pitch, ty, tp) <= ang_r:
                            hidden_until[i] = now + RESPAWN_S
                            effects.append(Effect(ty, tp, DISTANCE, RADIUS, now, TARGET_COLOR))
                            sounds.kill()
                            break
                    else:
                        sounds.miss()
            source.per_frame()

            r.begin(yaw, pitch)
            r.draw_room()
            for i, (ty, tp) in enumerate(LAYOUT):
                if now >= hidden_until[i]:
                    sx, sy, sr, on = r.target_screen(ty, tp, DISTANCE, RADIUS)
                    if on:
                        r.draw_sphere(sx, sy, sr, TARGET_COLOR)
            effects = [e for e in effects if now - e.t0 <= e.duration]
            r.draw_effects(effects, now)
            r.draw_crosshair()
            r.text("Sensitivität testen  ·  wird nicht aufgezeichnet", (r.w / 2, 18), 30, anchor="midtop")
            r.text(sensitivity_line(settings), (r.w / 2, 54), 26, (120, 220, 255), anchor="midtop")
            r.text("+ / -: Sensitivität ±2 %   C: Blick zentrieren   Esc: zurück zu den Einstellungen",
                   (r.w / 2, r.h - 30), 24, (150, 154, 166), anchor="midbottom")
            pygame.display.flip()
            clock.tick(settings.display.fps_cap)
    finally:
        source.stop()
        pygame.mouse.set_visible(True)
        pygame.event.clear()
