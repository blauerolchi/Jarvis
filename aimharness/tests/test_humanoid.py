import math

import numpy as np
import pygame
import pytest

from aimharness.game import humanoid as hm
from aimharness.game.render import Renderer
from aimharness.game.targets import TargetManager
from aimharness.scenario import BOT_EYE_HEIGHT, Scenario, SpawnSpec, TargetSpec
from aimharness.settings import CrosshairSettings

FLOOR = -BOT_EYE_HEIGHT


@pytest.mark.parametrize("u,v,zone", [
    (0.0, 0.0, "head"), (0.08, 0.05, "head"),
    (0.0, -0.40, "body"), (0.0, -0.15, "body"), (0.30, -0.55, "body"), (0.0, -0.80, "body"),
    (-0.11, -1.00, "legs"), (0.12, -1.40, "legs"),
    (0.0, -1.20, None), (0.40, -0.40, None), (0.0, 0.20, None), (0.0, -1.70, None),
])
def test_zone_at(u, v, zone):
    assert hm.zone_at(u, v) == zone


def _pitch_to(dist, dy):
    return math.degrees(math.atan2(dy, dist))


@pytest.mark.parametrize("bot_yaw", [0.0, 30.0, -50.0])
def test_ray_hits_zones_from_any_direction(bot_yaw):
    yaw, pitch, dist = hm.head_pose(bot_yaw, 10.0, FLOOR)
    ground = 10.0
    head_y = FLOOR + hm.HEAD_HEIGHT
    assert hm.ray_hit(yaw, pitch, yaw, pitch, dist)[0] == "head"
    assert hm.ray_hit(yaw, _pitch_to(ground, head_y - 0.40), yaw, pitch, dist)[0] == "body"
    assert hm.ray_hit(yaw + math.degrees(math.atan2(0.11, ground)), _pitch_to(ground, head_y - 1.0), yaw, pitch, dist)[0] == "legs"
    assert hm.ray_hit(yaw + 5.0, pitch, yaw, pitch, dist) is None
    t = hm.ray_hit(yaw, pitch, yaw, pitch, dist)[1]
    assert t == pytest.approx(dist, rel=1e-6)


def _manager(**targets):
    spec = TargetSpec(kind="humanoid", distance_m=[10.0, 20.0], **targets)
    sc = Scenario(id="b", targets=spec, spawn=SpawnSpec(pattern="random", count=1, yaw_range_deg=(-20, 20)))
    m = TargetManager(sc, np.random.default_rng(1))
    m.start(0.0)
    m.update(0, 0, 0.0, 0.0, 0.0, 0.0)
    return m, next(iter(m.alive.values()))


def test_bots_stand_on_the_floor_with_heads_near_eye_level():
    m, bot = _manager()
    assert bot.kind == "humanoid" and bot.radius == hm.HEAD_R
    ground = bot.distance * math.cos(math.radians(bot.pitch))
    assert min(abs(ground - 10.0), abs(ground - 20.0)) < 1e-9
    head_y = bot.distance * math.sin(math.radians(bot.pitch))
    assert head_y == pytest.approx(FLOOR + hm.HEAD_HEIGHT)


@pytest.mark.parametrize("zone,hits_to_kill", [("head", 1), ("body", 3), ("legs", 4)])
def test_damage_per_zone(zone, hits_to_kill):
    m, bot = _manager()
    for i in range(hits_to_kill - 1):
        assert not m.hit(bot, i, 0, 0.0, zone)
    assert m.hit(bot, 99, 0, 0.0, zone)
    assert bot.outcome == "killed"


def test_headshot_only_ignores_body_hits():
    m, bot = _manager(headshot_only=True)
    for i in range(10):
        assert not m.hit(bot, i, 0, 0.0, "body")
    assert m.hit(bot, 11, 0, 0.0, "head")


def test_pick_prefers_the_front_bot_and_reports_the_zone():
    m, near = _manager()
    far = m.alive.pop(near.id)
    near_pose = hm.head_pose(5.0, 8.0, FLOOR)
    far_pose = hm.head_pose(5.0, 16.0, FLOOR)
    near.yaw, near.pitch, near.distance = near_pose
    far.id = 99
    far.yaw, far.pitch, far.distance = far_pose
    m.alive = {near.id: near, far.id: far}
    tgt, zone = m.pick(near_pose[0], near_pose[1])
    assert tgt is near and zone == "head"
    # Aiming over the near bot's head (gap above it) reaches the far bot's head.
    tgt, zone = m.pick(*far_pose[:2])
    assert tgt is far and zone == "head"


@pytest.mark.parametrize("ground,hfov", [(3.0, 90.0), (10.0, 103.0)])
def test_drawn_sprite_matches_hit_geometry(ground, hfov):
    """Pixels covered >= 50 % by the sprite and pixels whose centre ray hits the bot agree."""
    pygame.init()
    surf = pygame.Surface((1920, 1080))
    r = Renderer(surf, hfov, CrosshairSettings(), FLOOR)
    yaw, pitch, dist = hm.head_pose(0.0, ground, FLOOR)
    r.begin(0.0, 0.0)
    info = r.bot_screen(yaw, pitch, dist)
    img, (ox, oy) = r.draw_bot(info, (229, 72, 77))
    f = r.proj.focal
    tp = fp = fn = 0
    for y in range(0, img.get_height(), 2):
        for x in range(0, img.get_width(), 2):
            px, py = int(ox) + x, int(oy) + y
            if not (0 <= px < r.w and 0 <= py < r.h):
                continue
            drawn = img.get_at((x, y)).a >= 128
            xc, yc = (px + 0.5 - r.proj.cx) / f, -(py + 0.5 - r.proj.cy) / f
            view_yaw = math.degrees(math.atan2(xc, 1.0))
            view_pitch = math.degrees(math.atan2(yc, math.hypot(xc, 1.0)))
            hit = hm.ray_hit(view_yaw, view_pitch, yaw, pitch, dist) is not None
            tp += drawn and hit
            fp += drawn and not hit
            fn += hit and not drawn
    assert tp / (tp + fp) > 0.97  # visible -> hittable
    assert tp / (tp + fn) > 0.97  # hittable -> visible
