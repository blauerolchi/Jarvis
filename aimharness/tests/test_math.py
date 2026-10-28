import math

import numpy as np
import pytest

from aimharness.mathutil import (
    Projector, angle_between, angular_radius_deg, camera_basis, destination, forward, tangent_offset, wrap_deg,
)


def test_forward_conventions():
    assert np.allclose(forward(0, 0), [0, 0, 1])
    assert np.allclose(forward(90, 0), [1, 0, 0])      # yaw right
    assert np.allclose(forward(0, 90), [0, 1, 0])      # pitch up


@pytest.mark.parametrize("yaw,pitch", [(0, 0), (37, -12), (-170, 45)])
def test_camera_basis_is_orthonormal_and_maps_forward_to_z(yaw, pitch):
    b = camera_basis(yaw, pitch)
    assert np.allclose(b @ b.T, np.eye(3), atol=1e-12)
    assert np.allclose(b @ forward(yaw, pitch), [0, 0, 1])
    assert b[1][1] >= 0  # camera up has a non-negative world-up component


def test_projection_centre_and_edge():
    proj = Projector(1920, 1080, 90.0)
    assert proj.focal == pytest.approx(960.0)
    b = camera_basis(10, 5)
    sx, sy, r, front = proj.sphere_screen(b, 10 * forward(10, 5), 0.5)
    assert front and sx == pytest.approx(960) and sy == pytest.approx(540)
    assert r == pytest.approx(960 * math.tan(math.asin(0.05)))
    # A point 45 deg to the right lands on the right screen edge at hfov 90.
    sx, sy, _, _ = proj.sphere_screen(camera_basis(0, 0), 10 * forward(45, 0), 0.1)
    assert sx == pytest.approx(1920, abs=1e-6)


def test_angles():
    assert angle_between(0, 0, 30, 0) == pytest.approx(30)
    assert angle_between(179, 0, -179, 0) == pytest.approx(2)
    assert angle_between(0, 0, 0, 0) == 0
    assert wrap_deg(190.0) == pytest.approx(-170)
    assert wrap_deg(-180.0) == pytest.approx(-180)
    assert angular_radius_deg(1.0, 10.0) == pytest.approx(math.degrees(math.asin(0.1)))


@pytest.mark.parametrize("bearing", [0, 45, 90, 200, 300])
def test_destination_has_requested_distance(bearing):
    yaw, pitch = destination(12.0, -8.0, bearing, 25.0)
    assert angle_between(12.0, -8.0, yaw, pitch) == pytest.approx(25.0, abs=1e-9)


def test_destination_bearing_directions():
    y, p = destination(0, 0, 0, 10)
    assert p == pytest.approx(10) and y == pytest.approx(0, abs=1e-9)
    y, p = destination(0, 0, 90, 10)
    assert y == pytest.approx(10) and p == pytest.approx(0, abs=1e-9)


def test_tangent_offset_signs_and_wrap():
    ex, ey = tangent_offset(170.0, 0.0, -170.0, 5.0)
    assert ex == pytest.approx(20 * math.cos(math.radians(5)))
    assert ey == pytest.approx(5)
