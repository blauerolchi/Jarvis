import numpy as np

from aimharness.game.targets import TargetManager
from aimharness.mathutil import angle_between
from aimharness.scenario import MotionSpec, Scenario, SpawnSpec, TargetSpec

MS = 1_000_000


def manager(**spawn):
    motion = spawn.pop("motion", MotionSpec())
    sc = Scenario(id="t", targets=TargetSpec(radius_m=[0.3], distance_m=[10.0]), spawn=SpawnSpec(**spawn), motion=motion)
    return TargetManager(sc, np.random.default_rng(3))


def test_grid_spawns_distinct_cells_and_respawns_on_kill():
    m = manager(pattern="grid", count=3, grid_cols=4, grid_rows=3)
    m.start(0.0)
    m.update(0, 0, 0.0, 0.0, 0.0, 0.0)
    assert len(m.alive) == 3
    for _ in range(30):
        cells = [t.cell for t in m.alive.values()]
        assert len(set(cells)) == 3
        tgt = next(iter(m.alive.values()))
        killed_cell = tgt.cell
        assert m.hit(tgt, MS, 1, 0.0)
        m.update(MS, 1, 0.001, 0.001, 0.0, 0.0)
        assert len(m.alive) == 3
        assert killed_cell not in [t.cell for t in m.alive.values()]


def test_amplitude_pattern_places_target_at_amplitude_and_balances_conditions():
    m = manager(pattern="amplitude", count=1, amplitudes_deg=[8.0, 16.0], yaw_range_deg=(-60, 60), pitch_range_deg=(-40, 40))
    m.start(0)
    seen = []
    t = 0
    for _ in range(8):
        m.update(t, 0, t / 1e9, 0.001, 0.0, 0.0)
        tgt = next(iter(m.alive.values()))
        assert abs(angle_between(0.0, 0.0, tgt.yaw, tgt.pitch) - tgt.amplitude_nominal) < 1e-6
        seen.append(tgt.cond_id)
        m.hit(tgt, t, 0, t / 1e9)
        t += MS
    # Two conditions -> each appears exactly once per block of two.
    for i in range(0, 8, 2):
        assert sorted(seen[i:i + 2]) == [0, 1]


def test_spawn_delay_and_timeout_run_on_simulation_time():
    m = manager(pattern="random", count=1, delay_ms=(200.0, 200.0), timeout_s=1.0)
    m.start(0.0)
    m.update(100 * MS, 1, 0.1, 0.1, 0, 0)
    assert not m.alive
    m.update(200 * MS, 2, 0.2, 0.1, 0, 0)
    assert len(m.alive) == 1
    # A long pause (wall clock jumps, simulation time does not) must not expire the target.
    m.update(60_000 * MS, 3, 0.2, 0.0, 0, 0)
    assert len(m.alive) == 1
    for i in range(11):
        m.update((60_000 + 100 * (i + 1)) * MS, 4 + i, 0.2 + 0.1 * (i + 1), 0.1, 0, 0)
    assert not m.alive and m.finished[-1].outcome == "expired"


def test_strafe_stays_in_bounds_and_reverses():
    motion = MotionSpec(kind="strafe", speed_mps=(4.0, 6.0), reverse_interval_s=(0.3, 0.6), accel_mps2=50.0, vertical=True)
    m = manager(pattern="random", count=1, yaw_range_deg=(-10, 10), pitch_range_deg=(-5, 5), motion=motion)
    m.start(0)
    dt = 0.004
    for i in range(1, 5000):
        m.update(int(i * dt * 1e9), i, i * dt, dt, 0, 0)
        tgt = next(iter(m.alive.values()))
        assert -12 <= tgt.yaw <= 12 and -7 <= tgt.pitch <= 7
    kinds = {e.kind for e in m.events}
    assert {"reverse_x", "reverse_y"} <= kinds


def test_hp_requires_multiple_hits():
    sc = Scenario(id="t", targets=TargetSpec(radius_m=[0.3], distance_m=[10.0], hp=3), spawn=SpawnSpec(pattern="random"))
    m = TargetManager(sc, np.random.default_rng(0))
    m.start(0)
    m.update(0, 0, 0, 0, 0, 0)
    tgt = next(iter(m.alive.values()))
    assert not m.hit(tgt, 1, 0, 0.0) and not m.hit(tgt, 2, 0, 0.0)
    assert m.hit(tgt, 3, 0, 0.0)
    assert tgt.outcome == "killed"


def test_under_crosshair_uses_angular_radius():
    m = manager(pattern="random", count=1)
    m.start(0)
    m.update(0, 0, 0, 0, 0, 0)
    tgt = next(iter(m.alive.values()))
    assert m.under_crosshair(tgt.yaw, tgt.pitch) is tgt
    assert m.under_crosshair(tgt.yaw + tgt.ang_radius * 1.5, tgt.pitch) is None
