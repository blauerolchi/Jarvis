"""Software renderer: grid room, shaded sphere targets, crosshair and HUD."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pygame

from aimharness.mathutil import Projector, camera_basis, sph_to_world
from aimharness.settings import CrosshairSettings

BG = (18, 19, 24)
FACE_COLORS = {
    "floor": (30, 32, 38),
    "ceiling": (24, 25, 30),
    "wall_x": (40, 42, 50),
    "wall_z": (44, 46, 55),
}
GRID = (86, 90, 104)
NEAR = 0.05

# Room box (metres). The player stands at the origin.
ROOM_X = (-30.0, 30.0)
ROOM_Y = (-4.0, 14.0)
ROOM_Z = (-30.0, 30.0)
GRID_STEP = 3.0


def _room_faces() -> list[tuple[np.ndarray, tuple[int, int, int]]]:
    (x0, x1), (y0, y1), (z0, z1) = ROOM_X, ROOM_Y, ROOM_Z
    q = lambda *pts: np.array(pts, dtype=float)  # noqa: E731
    return [
        (q((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)), FACE_COLORS["floor"]),
        (q((x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)), FACE_COLORS["ceiling"]),
        (q((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)), FACE_COLORS["wall_x"]),
        (q((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)), FACE_COLORS["wall_x"]),
        (q((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)), FACE_COLORS["wall_z"]),
        (q((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)), FACE_COLORS["wall_z"]),
    ]


def _room_grid() -> tuple[np.ndarray, np.ndarray]:
    """Grid line segments on the floor and the four walls."""
    (x0, x1), (y0, y1), (z0, z1) = ROOM_X, ROOM_Y, ROOM_Z
    a, b = [], []
    for x in np.arange(x0, x1 + 1e-6, GRID_STEP):
        a += [(x, y0, z0), (x, y0, z1), (x, y0, z0)]  # floor, back wall, front wall
        b += [(x, y0, z1), (x, y1, z1), (x, y1, z0)]
    for z in np.arange(z0, z1 + 1e-6, GRID_STEP):
        a += [(x0, y0, z), (x0, y0, z), (x1, y0, z)]  # floor, left wall, right wall
        b += [(x1, y0, z), (x0, y1, z), (x1, y1, z)]
    for y in np.arange(y0, y1 + 1e-6, GRID_STEP):
        a += [(x0, y, z1), (x0, y, z0), (x0, y, z0), (x1, y, z0)]  # back, front, left, right
        b += [(x1, y, z1), (x1, y, z0), (x0, y, z1), (x1, y, z1)]
    return np.array(a, dtype=float), np.array(b, dtype=float)


def _clip_polygon_near(pc: np.ndarray) -> np.ndarray:
    out = []
    n = len(pc)
    for i in range(n):
        a, b = pc[i], pc[(i + 1) % n]
        a_in, b_in = a[2] >= NEAR, b[2] >= NEAR
        if a_in:
            out.append(a)
        if a_in != b_in:
            t = (NEAR - a[2]) / (b[2] - a[2])
            out.append(a + (b - a) * t)
    return np.array(out)


def clip_polygon_rect(pts: np.ndarray, xmin: float, ymin: float, xmax: float, ymax: float) -> np.ndarray:
    """Sutherland-Hodgman clipping of a 2D polygon to a rectangle.

    pygame's polygon fill scans the full (unclipped) vertical extent, which is
    very slow for vertices projected far off-screen.
    """
    for axis, bound, keep_greater in ((0, xmin, True), (0, xmax, False), (1, ymin, True), (1, ymax, False)):
        if len(pts) == 0:
            break
        out = []
        n = len(pts)
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            a_in = a[axis] >= bound if keep_greater else a[axis] <= bound
            b_in = b[axis] >= bound if keep_greater else b[axis] <= bound
            if a_in:
                out.append(a)
            if a_in != b_in:
                t = (bound - a[axis]) / (b[axis] - a[axis])
                out.append(a + (b - a) * t)
        pts = np.array(out)
    return pts


def clip_segments_2d(p: np.ndarray, q: np.ndarray, xmin: float, ymin: float, xmax: float, ymax: float):
    """Vectorised Liang-Barsky clipping of segments p->q (N, 2) to a rectangle."""
    d = q - p
    t0 = np.zeros(len(p))
    t1 = np.ones(len(p))
    keep = np.ones(len(p), dtype=bool)
    for pk, qk in ((-d[:, 0], p[:, 0] - xmin), (d[:, 0], xmax - p[:, 0]),
                   (-d[:, 1], p[:, 1] - ymin), (d[:, 1], ymax - p[:, 1])):
        keep &= ~((pk == 0) & (qk < 0))
        with np.errstate(divide="ignore", invalid="ignore"):
            r = qk / pk
        t0 = np.where(pk < 0, np.maximum(t0, r), t0)
        t1 = np.where(pk > 0, np.minimum(t1, r), t1)
    keep &= t0 <= t1
    return p + d * t0[:, None], p + d * t1[:, None], keep


def make_sphere_sprite(color: tuple[int, int, int], size: int = 256) -> pygame.Surface:
    """Pre-shaded sphere (diffuse + specular highlight) with an anti-aliased edge."""
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    x = (xx + 0.5 - size / 2) / (size / 2)
    y = (yy + 0.5 - size / 2) / (size / 2)
    r = np.sqrt(x * x + y * y)
    z = np.sqrt(np.clip(1.0 - r * r, 0.0, 1.0))
    light = np.array([-0.45, -0.55, 0.70])
    light /= np.linalg.norm(light)
    half = light + np.array([0.0, 0.0, 1.0])
    half /= np.linalg.norm(half)
    ndl = np.clip(x * light[0] + y * light[1] + z * light[2], 0.0, 1.0)
    spec = np.clip(x * half[0] + y * half[1] + z * half[2], 0.0, 1.0) ** 40
    shade = 0.36 + 0.74 * ndl
    rgb = np.clip(np.array(color, dtype=float)[None, None, :] * shade[..., None] + 150.0 * spec[..., None], 0, 255)
    alpha = np.clip((1.0 - r) * size / 2 + 0.5, 0.0, 1.0) * 255
    surf = pygame.Surface((size, size), pygame.SRCALPHA)
    px = pygame.surfarray.pixels3d(surf)
    px[...] = rgb.transpose(1, 0, 2).astype(np.uint8)
    del px
    pa = pygame.surfarray.pixels_alpha(surf)
    pa[...] = alpha.T.astype(np.uint8)
    del pa
    return surf


@dataclass
class Effect:
    yaw: float
    pitch: float
    distance: float
    radius: float
    t0: float
    color: tuple[int, int, int]
    duration: float = 0.18


class Renderer:
    def __init__(self, surface: pygame.Surface, hfov_deg: float, crosshair: CrosshairSettings):
        self.surface = surface
        self.w, self.h = surface.get_size()
        self.proj = Projector(self.w, self.h, hfov_deg)
        self.crosshair = crosshair
        self.basis = camera_basis(0.0, 0.0)
        self._faces = _room_faces()
        self._grid_a, self._grid_b = _room_grid()
        self._fog_colors = [self._mix(GRID, FACE_COLORS["wall_x"], f) for f in np.linspace(0.0, 0.8, 9)]
        self._sprites: dict[tuple[int, int, int], pygame.Surface] = {}
        self._scaled: dict[tuple, pygame.Surface] = {}
        self._fonts: dict[int, pygame.font.Font] = {}

    @staticmethod
    def _mix(c1, c2, f):
        return tuple(int(a + (b - a) * f) for a, b in zip(c1, c2))

    def font(self, size: int) -> pygame.font.Font:
        if size not in self._fonts:
            self._fonts[size] = pygame.font.Font(None, size)
        return self._fonts[size]

    # -- world -----------------------------------------------------------------------
    def begin(self, yaw: float, pitch: float) -> None:
        self.basis = camera_basis(yaw, pitch)
        self.surface.fill(BG)

    def draw_room(self) -> None:
        proj, surf = self.proj, self.surface
        for verts, color in self._faces:
            pc = _clip_polygon_near(verts @ self.basis.T)
            if len(pc) >= 3:
                pts = clip_polygon_rect(proj.project_cam(pc), -1.0, -1.0, self.w + 1.0, self.h + 1.0)
                if len(pts) >= 3:
                    pygame.draw.polygon(surf, color, pts.tolist())
        pa = self._grid_a @ self.basis.T
        pb = self._grid_b @ self.basis.T
        za, zb = pa[:, 2], pb[:, 2]
        vis = (za > NEAR) | (zb > NEAR)
        pa, pb, za, zb = pa[vis], pb[vis], za[vis], zb[vis]
        with np.errstate(divide="ignore", invalid="ignore"):
            ta = np.clip((NEAR - za) / (zb - za), 0.0, 1.0)[:, None]
            tb = np.clip((NEAR - zb) / (za - zb), 0.0, 1.0)[:, None]
        pa, pb = (np.where((za < NEAR)[:, None], pa + (pb - pa) * ta, pa),
                  np.where((zb < NEAR)[:, None], pb + (pa - pb) * tb, pb))
        sa, sb = proj.project_cam(pa), proj.project_cam(pb)
        depth = np.linalg.norm((pa + pb) / 2, axis=1)
        fog_idx = np.clip((depth / 55.0 * 8).astype(int), 0, 8)
        sa, sb, keep = clip_segments_2d(sa, sb, -2.0, -2.0, self.w + 2.0, self.h + 2.0)
        for i in np.flatnonzero(keep):
            pygame.draw.line(surf, self._fog_colors[fog_idx[i]], sa[i], sb[i])

    def target_screen(self, yaw: float, pitch: float, distance: float, radius: float) -> tuple[float, float, float, bool]:
        center = sph_to_world(yaw, pitch, distance)
        sx, sy, r, front = self.proj.sphere_screen(self.basis, center, radius)
        on_screen = front and -r <= sx <= self.w + r and -r <= sy <= self.h + r
        return sx, sy, r, on_screen

    def sphere_sprite(self, color: tuple[int, int, int]) -> pygame.Surface:
        """Full-resolution shaded sprite for ``color`` (created once; call early to avoid a first-frame hitch)."""
        base = self._sprites.get(color)
        if base is None:
            base = make_sphere_sprite(color)
            if pygame.display.get_surface() is not None:
                base = base.convert_alpha()
            self._sprites[color] = base
        return base

    def draw_sphere(self, sx: float, sy: float, r: float, color: tuple[int, int, int]) -> None:
        d = max(2, min(2048, int(round(2 * r))))
        key = (color, d)
        img = self._scaled.get(key)
        if img is None:
            img = pygame.transform.smoothscale(self.sphere_sprite(color), (d, d))
            if len(self._scaled) > 600:
                self._scaled.clear()
            self._scaled[key] = img
        self.surface.blit(img, (sx - d / 2, sy - d / 2))

    def draw_effects(self, effects: list[Effect], now_s: float) -> None:
        for e in effects:
            k = (now_s - e.t0) / e.duration
            if not 0.0 <= k <= 1.0:
                continue
            sx, sy, r, on = self.target_screen(e.yaw, e.pitch, e.distance, e.radius)
            if not on:
                continue
            color = self._mix(e.color, BG, k)
            pygame.draw.circle(self.surface, color, (sx, sy), r * (1.0 + 0.9 * k), max(1, int(3 * (1 - k)) + 1))

    def draw_world_marker(self, yaw: float, pitch: float, color, size: int = 4) -> None:
        sx, sy, _, on = self.target_screen(yaw, pitch, 10.0, 0.01)
        if on:
            pygame.draw.circle(self.surface, color, (sx, sy), size)

    def world_to_screen(self, yaw: float, pitch: float) -> tuple[float, float] | None:
        sx, sy, _, on = self.target_screen(yaw, pitch, 10.0, 0.01)
        return (sx, sy) if on else None

    # -- 2D overlay ------------------------------------------------------------------
    def draw_crosshair(self, center: tuple[int, int] | None = None) -> None:
        c = self.crosshair
        cx, cy = center or (self.w // 2, self.h // 2)
        rects = []
        th = c.thickness
        if c.lines:
            rects += [
                pygame.Rect(cx - c.gap - c.length, cy - th // 2, c.length, th),
                pygame.Rect(cx + c.gap + 1, cy - th // 2, c.length, th),
                pygame.Rect(cx - th // 2, cy - c.gap - c.length, th, c.length),
                pygame.Rect(cx - th // 2, cy + c.gap + 1, th, c.length),
            ]
        if c.dot:
            rects.append(pygame.Rect(cx - c.dot_size // 2, cy - c.dot_size // 2, c.dot_size, c.dot_size))
        if c.outline:
            for r in rects:
                pygame.draw.rect(self.surface, (0, 0, 0), r.inflate(2, 2))
        for r in rects:
            pygame.draw.rect(self.surface, c.rgb, r)

    def text(self, s: str, pos: tuple[float, float], size: int = 28, color=(230, 232, 238), anchor: str = "topleft") -> pygame.Rect:
        img = self.font(size).render(s, True, color)
        rect = img.get_rect(**{anchor: (int(pos[0]), int(pos[1]))})
        self.surface.blit(img, rect)
        return rect

    def dim(self, alpha: int = 160) -> None:
        shade = pygame.Surface((self.w, self.h), pygame.SRCALPHA)
        shade.fill((0, 0, 0, alpha))
        self.surface.blit(shade, (0, 0))

    def panel(self, rect: pygame.Rect, alpha: int = 200) -> None:
        shade = pygame.Surface(rect.size, pygame.SRCALPHA)
        shade.fill((12, 13, 17, alpha))
        self.surface.blit(shade, rect.topleft)
        pygame.draw.rect(self.surface, (70, 74, 88), rect, 1)


def fmt_time(seconds: float) -> str:
    s = max(0, int(math.ceil(seconds)))
    return f"{s // 60}:{s % 60:02d}"
