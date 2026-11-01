"""Angular / camera math.

Conventions
-----------
World axes: x right, y up, z forward (at yaw = 0, pitch = 0).
Yaw increases when turning right, pitch increases when looking up.
All public angles are in degrees.
"""

from __future__ import annotations

import math

import numpy as np


def wrap_deg(a):
    """Wrap angle(s) to [-180, 180)."""
    if isinstance(a, np.ndarray):
        return (a + 180.0) % 360.0 - 180.0
    return (float(a) + 180.0) % 360.0 - 180.0


def forward(yaw_deg: float, pitch_deg: float) -> np.ndarray:
    y, p = math.radians(yaw_deg), math.radians(pitch_deg)
    cp = math.cos(p)
    return np.array([cp * math.sin(y), math.sin(p), cp * math.cos(y)])


def camera_basis(yaw_deg: float, pitch_deg: float) -> np.ndarray:
    """Rows: right, up, forward. ``basis @ v`` maps world -> camera coords."""
    y = math.radians(yaw_deg)
    f = forward(yaw_deg, pitch_deg)
    r = np.array([math.cos(y), 0.0, -math.sin(y)])
    u = np.cross(f, r)
    return np.stack([r, u, f])


def sph_to_world(yaw_deg, pitch_deg, dist):
    """Vectorised spherical (yaw, pitch, distance) -> world xyz."""
    y = np.radians(yaw_deg)
    p = np.radians(pitch_deg)
    cp = np.cos(p)
    return np.stack([cp * np.sin(y), np.sin(p), cp * np.cos(y)], axis=-1) * np.asarray(dist)[..., None]


def angle_between(yaw1, pitch1, yaw2, pitch2):
    """Great-circle angle (deg) between two view directions. Vectorised."""
    y1, p1, y2, p2 = (np.radians(v) for v in (yaw1, pitch1, yaw2, pitch2))
    # Haversine form is numerically stable for tiny angles.
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin((y2 - y1) / 2) ** 2
    return np.degrees(2 * np.arcsin(np.sqrt(np.clip(h, 0.0, 1.0))))


def angular_radius_deg(radius_m: float, distance_m: float) -> float:
    if distance_m <= radius_m:
        return 90.0
    return math.degrees(math.asin(radius_m / distance_m))


def tangent_offset(cross_yaw, cross_pitch, tgt_yaw, tgt_pitch):
    """Target position relative to the crosshair in a local tangent plane (deg).

    x > 0: target is to the right, y > 0: target is above. Exact enough for the
    analysis of aiming movements (|pitch| well below 60 degrees).
    """
    c = np.cos(np.radians(tgt_pitch))
    ex = wrap_deg(np.asarray(tgt_yaw, dtype=float) - np.asarray(cross_yaw, dtype=float)) * c
    ey = np.asarray(tgt_pitch, dtype=float) - np.asarray(cross_pitch, dtype=float)
    return ex, ey


def destination(yaw_deg: float, pitch_deg: float, bearing_deg: float, dist_deg: float) -> tuple[float, float]:
    """Point at great-circle distance ``dist_deg`` from (yaw, pitch).

    ``bearing_deg`` 0 = up (pitch increasing), 90 = right (yaw increasing).
    """
    lat1, lon1 = math.radians(pitch_deg), math.radians(yaw_deg)
    th, d = math.radians(bearing_deg), math.radians(dist_deg)
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(th))
    lon2 = lon1 + math.atan2(
        math.sin(th) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    return wrap_deg(math.degrees(lon2)), math.degrees(lat2)


class Projector:
    """Pinhole projection for a screen of ``width`` x ``height`` pixels."""

    def __init__(self, width: int, height: int, hfov_deg: float):
        self.width = width
        self.height = height
        self.cx = width / 2.0
        self.cy = height / 2.0
        self.focal = self.cx / math.tan(math.radians(hfov_deg) / 2.0)
        self.vfov_deg = math.degrees(2.0 * math.atan(self.cy / self.focal))

    def project_cam(self, pc: np.ndarray) -> np.ndarray:
        """Camera-space points (N, 3) with z > 0 -> screen (N, 2)."""
        z = pc[..., 2]
        sx = self.cx + self.focal * pc[..., 0] / z
        sy = self.cy - self.focal * pc[..., 1] / z
        return np.stack([sx, sy], axis=-1)

    def sphere_screen(self, basis: np.ndarray, center_world: np.ndarray, radius_m: float):
        """Return (sx, sy, r_px, in_front) for a sphere seen from the origin."""
        pc = basis @ center_world
        z = pc[2]
        if z <= radius_m * 0.5:
            return 0.0, 0.0, 0.0, False
        dist = float(np.linalg.norm(center_world))
        alpha = math.asin(min(1.0, radius_m / dist)) if dist > 0 else math.pi / 2
        r_px = self.focal * math.tan(alpha) * dist / z
        sx = self.cx + self.focal * pc[0] / z
        sy = self.cy - self.focal * pc[1] / z
        return sx, sy, r_px, True
