"""Humanoid training bot: body geometry, hit zones and sprite.

The bot is a flat figure on a vertical billboard plane that always faces the
player (like classic shooter sprites). Geometry is given in metres in local
coordinates (u to the right as seen by the player, v up) relative to the head
centre. The same parts are used for drawing and for hit testing, so what is
visible is exactly what can be hit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pygame

from aimharness.mathutil import forward, sph_to_world

HEAD_R = 0.115
HEAD_HEIGHT = 1.645          # head centre above the ground
V_TOP = HEAD_R + 0.02        # sprite extent (local v)
V_BOTTOM = -HEAD_HEIGHT - 0.005
U_HALF = 0.42
ZONES = ("head", "body", "legs")


@dataclass(frozen=True)
class Circle:
    c: tuple[float, float]
    r: float
    zone: str

    def contains(self, u: float, v: float) -> bool:
        return (u - self.c[0]) ** 2 + (v - self.c[1]) ** 2 <= self.r ** 2


@dataclass(frozen=True)
class Capsule:
    a: tuple[float, float]
    b: tuple[float, float]
    r: float
    zone: str

    def contains(self, u: float, v: float) -> bool:
        ax, ay = self.a
        bx, by = self.b
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
        px, py = ax + t * dx - u, ay + t * dy - v
        return px * px + py * py <= self.r ** 2


@dataclass(frozen=True)
class Poly:
    """Convex polygon, vertices in either winding order."""

    pts: tuple[tuple[float, float], ...]
    zone: str

    def contains(self, u: float, v: float) -> bool:
        sign = 0
        n = len(self.pts)
        for i in range(n):
            (x1, y1), (x2, y2) = self.pts[i], self.pts[(i + 1) % n]
            cross = (x2 - x1) * (v - y1) - (y2 - y1) * (u - x1)
            if cross != 0:
                s = 1 if cross > 0 else -1
                if sign and s != sign:
                    return False
                sign = s
        return True


def _mirror(part):
    if isinstance(part, Circle):
        return Circle((-part.c[0], part.c[1]), part.r, part.zone)
    if isinstance(part, Capsule):
        return Capsule((-part.a[0], part.a[1]), (-part.b[0], part.b[1]), part.r, part.zone)
    return Poly(tuple((-x, y) for x, y in part.pts), part.zone)


_LEFT_ARM = [
    Capsule((-0.26, -0.28), (-0.31, -0.52), 0.055, "body"),   # upper arm
    Capsule((-0.31, -0.52), (-0.28, -0.76), 0.050, "body"),   # forearm
    Circle((-0.28, -0.80), 0.050, "body"),                    # hand
    Circle((-0.235, -0.255), 0.075, "body"),                  # shoulder
]
_LEFT_LEG = [
    Capsule((-0.10, -0.86), (-0.12, -1.22), 0.075, "legs"),   # thigh
    Capsule((-0.12, -1.22), (-0.13, -1.56), 0.060, "legs"),   # shin
    Capsule((-0.155, -1.60), (-0.085, -1.60), 0.045, "legs"),  # foot
]
TORSO = Poly(((-0.21, -0.19), (0.21, -0.19), (0.23, -0.30), (0.17, -0.70), (-0.17, -0.70), (-0.23, -0.30)), "body")
PELVIS = Poly(((-0.18, -0.68), (0.18, -0.68), (0.16, -0.87), (-0.16, -0.87)), "body")
NECK = Capsule((0.0, -0.10), (0.0, -0.20), 0.055, "body")
HEAD = Circle((0.0, 0.0), HEAD_R, "head")

# Hit test order: head wins over body, body over legs where parts overlap.
PARTS = [HEAD, NECK, TORSO, PELVIS, *_LEFT_ARM, *[_mirror(p) for p in _LEFT_ARM],
         *_LEFT_LEG, *[_mirror(p) for p in _LEFT_LEG]]


def zone_at(u: float, v: float) -> str | None:
    """Hit zone at local coordinates (metres, relative to the head centre)."""
    if abs(u) > U_HALF or not V_BOTTOM <= v <= V_TOP:
        return None
    for part in PARTS:
        if part.contains(u, v):
            return part.zone
    return None


def head_pose(yaw_deg: float, ground_distance: float, floor_y: float) -> tuple[float, float, float]:
    """(yaw, pitch, distance) of the head centre of a bot standing at ``ground_distance``."""
    head_y = floor_y + HEAD_HEIGHT
    return yaw_deg, math.degrees(math.atan2(head_y, ground_distance)), math.hypot(head_y, ground_distance)


def billboard_axes(head_world: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(right, normal-towards-player) of the bot's billboard plane."""
    h = np.array([head_world[0], 0.0, head_world[2]])
    h /= np.linalg.norm(h)
    return np.array([h[2], 0.0, -h[0]]), -h


def ray_hit(view_yaw: float, view_pitch: float, yaw: float, pitch: float, distance: float) -> tuple[str, float] | None:
    """Zone and ray distance where the view ray hits the bot whose head is at (yaw, pitch, distance)."""
    f = forward(view_yaw, view_pitch)
    head = sph_to_world(yaw, pitch, distance)
    right, normal = billboard_axes(head)
    denom = float(f @ normal)
    if denom >= -1e-9:
        return None
    t = float(head @ normal) / denom
    d = t * f - head
    zone = zone_at(float(d @ right), float(d[1]))
    return (zone, t) if zone else None


# -- sprite ------------------------------------------------------------------------
DARK = (40, 43, 51)
MID = (66, 71, 84)
PLATE = (102, 108, 124)
LIGHT = (156, 163, 182)
GLOW = (110, 225, 255)
OUTLINE = (14, 15, 19)


def _lighter(c, k=0.35):
    return tuple(min(255, int(x + (255 - x) * k)) for x in c)


def make_bot_sprite(accent: tuple[int, int, int], ppm: int = 240, ss: int = 2) -> pygame.Surface:
    """Draw the bot at ``ppm`` pixels per metre (supersampled ``ss`` times for anti-aliasing)."""
    s = ppm * ss
    w, h = int(2 * U_HALF * s), int((V_TOP - V_BOTTOM) * s)
    surf = pygame.Surface((w, h), pygame.SRCALPHA)

    def p(u, v):
        return (w / 2 + u * s, (V_TOP - v) * s)

    def capsule(a, b, r, color, highlight=True):
        width = max(1, int(round(2 * r * s)))
        pygame.draw.line(surf, color, p(*a), p(*b), width)
        for q in (a, b):
            pygame.draw.circle(surf, color, p(*q), r * s)
        if highlight:
            off = (-0.35 * r, 0.25 * r)
            hl = _lighter(color, 0.22)
            pygame.draw.line(surf, hl, p(a[0] + off[0], a[1] + off[1]), p(b[0] + off[0], b[1] + off[1]),
                             max(1, int(width * 0.3)))

    def poly(pts, color):
        pygame.draw.polygon(surf, color, [p(u, v) for u, v in pts])

    def circle(c, r, color):
        pygame.draw.circle(surf, color, p(*c), r * s)

    for side in (1, -1):
        legs = _LEFT_LEG if side == 1 else [_mirror(q) for q in _LEFT_LEG]
        thigh, shin, foot = legs
        capsule(thigh.a, thigh.b, thigh.r, MID)
        capsule(shin.a, shin.b, shin.r, DARK)
        capsule((shin.a[0], shin.a[1] - 0.05), (shin.b[0], shin.b[1] + 0.10), shin.r * 0.55, PLATE)
        circle(thigh.b, 0.068, PLATE)                       # knee pad
        capsule(foot.a, foot.b, foot.r, DARK, highlight=False)

    poly(PELVIS.pts, DARK)
    poly(((-0.18, -0.68), (0.18, -0.68), (0.178, -0.715), (-0.178, -0.715)), accent)  # belt
    poly(TORSO.pts, MID)
    poly(((-0.16, -0.23), (0.16, -0.23), (0.17, -0.31), (0.12, -0.52), (-0.12, -0.52), (-0.17, -0.31)), PLATE)
    poly(((-0.165, -0.30), (0.165, -0.30), (0.155, -0.335), (-0.155, -0.335)), accent)  # chest stripe
    poly(((-0.13, -0.56), (0.13, -0.56), (0.12, -0.66), (-0.12, -0.66)), DARK)            # abs plate
    circle((0.0, -0.43), 0.032, GLOW)                                                      # core light
    circle((0.0, -0.43), 0.016, _lighter(GLOW, 0.6))

    for side in (1, -1):
        arm = _LEFT_ARM if side == 1 else [_mirror(q) for q in _LEFT_ARM]
        upper, fore, hand, shoulder = arm
        capsule(upper.a, upper.b, upper.r, MID)
        capsule(fore.a, fore.b, fore.r, DARK)
        capsule((fore.a[0], fore.a[1] - 0.04), (fore.b[0], fore.b[1] + 0.06), fore.r * 0.6, PLATE)
        circle(hand.c, hand.r, DARK)
        circle(shoulder.c, shoulder.r, accent)
        circle((shoulder.c[0] - 0.02, shoulder.c[1] + 0.02), shoulder.r * 0.45, _lighter(accent, 0.3))

    capsule(NECK.a, NECK.b, NECK.r, DARK, highlight=False)
    circle(HEAD.c, HEAD.r, PLATE)                                       # helmet
    circle((0.0, 0.005), HEAD.r * 0.86, MID)
    visor = pygame.Rect(0, 0, int(0.19 * s), int(0.062 * s))
    visor.center = (int(p(0.0, 0.0)[0]), int(p(0.0, 0.012)[1]))
    pygame.draw.rect(surf, DARK, visor.inflate(int(0.02 * s), int(0.02 * s)), border_radius=int(0.035 * s))
    pygame.draw.rect(surf, GLOW, visor, border_radius=int(0.03 * s))
    pygame.draw.rect(surf, _lighter(GLOW, 0.55), visor.inflate(-int(0.06 * s), -int(0.035 * s)),
                     border_radius=int(0.02 * s))
    circle((-0.045, 0.06), 0.022, LIGHT)                                 # helmet highlight
    poly(((-0.02, HEAD_R - 0.004), (0.02, HEAD_R - 0.004), (0.016, HEAD_R - 0.05), (-0.016, HEAD_R - 0.05)), accent)

    # Dark silhouette outline improves readability against the room. It is
    # clipped to the silhouette so the visible bot never extends past the hit area.
    mask = pygame.mask.from_surface(surf)
    outline = mask.outline()
    if len(outline) > 2:
        pygame.draw.lines(surf, OUTLINE, True, outline, max(2, ss * 2))
        keep = mask.to_surface(setcolor=(255, 255, 255, 255), unsetcolor=(0, 0, 0, 0))
        surf.blit(keep, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
    return pygame.transform.smoothscale(surf, (w // ss, h // ss))


def sprite_aspect() -> float:
    return (2 * U_HALF) / (V_TOP - V_BOTTOM)
