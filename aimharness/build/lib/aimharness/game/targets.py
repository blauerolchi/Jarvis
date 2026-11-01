"""Target spawning, motion and hit testing (pure logic, no rendering)."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from aimharness.mathutil import angle_between, angular_radius_deg, destination, wrap_deg
from aimharness.scenario import Scenario


@dataclass
class Target:
    id: int
    yaw: float
    pitch: float
    distance: float
    radius: float
    hp: int
    cond_id: int = -1
    amplitude_nominal: float = float("nan")
    is_home: bool = False
    cell: int = -1
    spawn_t_ns: int = 0
    spawn_frame: int = 0
    spawn_yaw: float = 0.0
    spawn_pitch: float = 0.0
    visible_t_ns: int = -1
    visible_frame: int = -1
    end_t_ns: int = -1
    end_frame: int = -1
    outcome: str = ""
    hits: int = 0
    speed: float = 0.0
    age_s: float = 0.0  # simulation time alive (excludes pauses)
    # Strafe state: lateral (along yaw) and vertical velocity in m/s.
    vx: float = 0.0
    vx_goal: float = 0.0
    next_rev_x: float = math.inf
    vy: float = 0.0
    vy_goal: float = 0.0
    next_rev_y: float = math.inf

    @property
    def ang_radius(self) -> float:
        return angular_radius_deg(self.radius, self.distance)


@dataclass(slots=True)
class TargetEvent:
    t_ns: int
    frame: int
    target_id: int
    kind: str
    value: float = float("nan")


class TargetManager:
    """Owns all targets of a session and applies the scenario rules."""

    def __init__(self, scenario: Scenario, rng: np.random.Generator):
        self.sc = scenario
        self.rng = rng
        self.alive: dict[int, Target] = {}
        self.finished: list[Target] = []
        self.events: list[TargetEvent] = []
        self._next_id = 0
        self._pending: list[float] = []  # due times in simulation seconds
        self._conds = scenario.conditions()
        self._cond_queue: list[int] = []
        self._last_was_home = True
        self._last_cell = -1
        sp = scenario.spawn
        self._cells = [
            (float(y), float(p))
            for p in np.linspace(sp.pitch_range_deg[1], sp.pitch_range_deg[0], sp.grid_rows)
            for y in np.linspace(sp.yaw_range_deg[0], sp.yaw_range_deg[1], sp.grid_cols)
        ]

    # -- lifecycle -------------------------------------------------------------------
    def start(self, sim_s: float = 0.0) -> None:
        for _ in range(self.sc.spawn.count):
            self._schedule(sim_s)

    def update(self, t_ns: int, frame: int, sim_s: float, dt_s: float, cross_yaw: float, cross_pitch: float) -> None:
        """Advance by ``dt_s`` of simulation time. ``t_ns`` (wall clock) is only used for records.

        Timers (spawn delays, timeouts, direction changes) run on ``sim_s`` so a
        pause does not make targets expire or spawn on resume.
        """
        for tgt in self.alive.values():
            tgt.age_s += dt_s
        due = [p for p in self._pending if p <= sim_s]
        if due:
            self._pending = [p for p in self._pending if p > sim_s]
            for _ in due:
                self._spawn(t_ns, frame, sim_s, cross_yaw, cross_pitch)
        timeout = self.sc.spawn.timeout_s
        if timeout > 0:
            for tgt in list(self.alive.values()):
                if tgt.age_s >= timeout:
                    self._end(tgt, t_ns, frame, "expired")
                    self._schedule(sim_s)
        if self.sc.motion.kind == "strafe":
            for tgt in self.alive.values():
                self._move(tgt, t_ns, frame, sim_s, dt_s)

    def hit(self, tgt: Target, t_ns: int, frame: int, sim_s: float) -> bool:
        """Register a hit; returns True if the target was destroyed."""
        tgt.hits += 1
        if tgt.hits < tgt.hp:
            self.events.append(TargetEvent(t_ns, frame, tgt.id, "hit", tgt.hits))
            return False
        self._end(tgt, t_ns, frame, "killed")
        self._last_cell = tgt.cell
        self._schedule(sim_s)
        return True

    def end_all(self, t_ns: int, frame: int) -> None:
        for tgt in list(self.alive.values()):
            self._end(tgt, t_ns, frame, "session_end")
        self._pending.clear()

    def all_targets(self) -> list[Target]:
        return sorted(self.finished + list(self.alive.values()), key=lambda t: t.id)

    # -- queries ---------------------------------------------------------------------
    def nearest(self, yaw: float, pitch: float) -> tuple[Target | None, float]:
        """Target closest to the view direction measured from its edge (deg, < 0 inside)."""
        best, best_edge = None, math.inf
        for tgt in self.alive.values():
            edge = float(angle_between(yaw, pitch, tgt.yaw, tgt.pitch)) - tgt.ang_radius
            if edge < best_edge:
                best, best_edge = tgt, edge
        return best, best_edge

    def under_crosshair(self, yaw: float, pitch: float) -> Target | None:
        tgt, edge = self.nearest(yaw, pitch)
        return tgt if tgt is not None and edge <= 0.0 else None

    # -- internals -------------------------------------------------------------------
    def _schedule(self, sim_s: float) -> None:
        lo, hi = self.sc.spawn.delay_ms
        delay_ms = self.rng.uniform(lo, hi) if hi > lo else lo
        self._pending.append(sim_s + delay_ms / 1000.0)

    def _end(self, tgt: Target, t_ns: int, frame: int, outcome: str) -> None:
        tgt.end_t_ns, tgt.end_frame, tgt.outcome = t_ns, frame, outcome
        self.alive.pop(tgt.id, None)
        self.finished.append(tgt)
        self.events.append(TargetEvent(t_ns, frame, tgt.id, outcome))

    def _draw(self, values: list[float]) -> float:
        return float(values[self.rng.integers(len(values))])

    def _spawn(self, t_ns: int, frame: int, sim_s: float, cross_yaw: float, cross_pitch: float) -> None:
        sc, sp = self.sc, self.sc.spawn
        cond_id, amp, is_home, cell = -1, float("nan"), False, -1
        radius, dist = self._draw(sc.targets.radius_m), self._draw(sc.targets.distance_m)
        if sp.pattern == "grid":
            cell = self._pick_cell()
            yaw, pitch = self._cells[cell]
        elif sp.pattern == "random":
            yaw, pitch = self._pick_random()
        elif sp.center_return and not self._last_was_home:
            yaw, pitch, is_home = 0.0, 0.0, True
            radius, dist = sc.targets.radius_m[0], sc.targets.distance_m[0]
        else:
            cond_id = self._next_condition()
            amp, radius, dist = self._conds[cond_id]
            yaw, pitch = self._pick_at_amplitude(cross_yaw, cross_pitch, amp)
        if sp.pattern == "amplitude":
            self._last_was_home = is_home

        tgt = Target(
            id=self._next_id, yaw=yaw, pitch=pitch, distance=dist, radius=radius, hp=sc.targets.hp,
            cond_id=cond_id, amplitude_nominal=amp, is_home=is_home, cell=cell,
            spawn_t_ns=t_ns, spawn_frame=frame, spawn_yaw=yaw, spawn_pitch=pitch,
        )
        self._next_id += 1
        if sc.motion.kind == "strafe":
            m = sc.motion
            tgt.speed = float(self.rng.uniform(*m.speed_mps))
            tgt.vx_goal = tgt.speed * (1 if self.rng.random() < 0.5 else -1)
            tgt.vx = tgt.vx_goal
            tgt.next_rev_x = sim_s + float(self.rng.uniform(*m.reverse_interval_s))
            if m.vertical:
                tgt.vy_goal = float(self.rng.uniform(*m.vertical_speed_mps)) * (1 if self.rng.random() < 0.5 else -1)
                tgt.vy = tgt.vy_goal
                tgt.next_rev_y = sim_s + float(self.rng.uniform(*m.reverse_interval_s))
        self.alive[tgt.id] = tgt
        self.events.append(TargetEvent(t_ns, frame, tgt.id, "spawn", cond_id))

    def _pick_cell(self) -> int:
        used = {t.cell for t in self.alive.values()}
        free = [i for i in range(len(self._cells)) if i not in used and i != self._last_cell]
        if not free:
            free = [i for i in range(len(self._cells)) if i not in used]
        return int(free[self.rng.integers(len(free))])

    def _separated(self, yaw: float, pitch: float) -> bool:
        sep = self.sc.spawn.min_separation_deg
        return all(float(angle_between(yaw, pitch, t.yaw, t.pitch)) >= sep + t.ang_radius for t in self.alive.values())

    def _pick_random(self) -> tuple[float, float]:
        sp = self.sc.spawn
        yaw = pitch = 0.0
        for _ in range(100):
            yaw = float(self.rng.uniform(*sp.yaw_range_deg))
            pitch = float(self.rng.uniform(*sp.pitch_range_deg))
            if self._separated(yaw, pitch):
                break
        return yaw, pitch

    def _next_condition(self) -> int:
        # Balanced blocks: every condition once per block, shuffled.
        if not self._cond_queue:
            self._cond_queue = [int(i) for i in self.rng.permutation(len(self._conds))]
        return self._cond_queue.pop()

    def _in_area(self, yaw: float, pitch: float) -> bool:
        sp = self.sc.spawn
        return sp.yaw_range_deg[0] <= yaw <= sp.yaw_range_deg[1] and sp.pitch_range_deg[0] <= pitch <= sp.pitch_range_deg[1]

    def _pick_at_amplitude(self, cross_yaw: float, cross_pitch: float, amp: float) -> tuple[float, float]:
        for _ in range(64):
            yaw, pitch = destination(cross_yaw, cross_pitch, float(self.rng.uniform(0, 360)), amp)
            if self._in_area(yaw, pitch):
                return yaw, pitch
        # Fall back to the direction of the area centre, clamped to the area.
        sp = self.sc.spawn
        cy, cp = sum(sp.yaw_range_deg) / 2, sum(sp.pitch_range_deg) / 2
        bearing = math.degrees(math.atan2(wrap_deg(cy - cross_yaw) * math.cos(math.radians(cross_pitch)), cp - cross_pitch))
        yaw, pitch = destination(cross_yaw, cross_pitch, bearing, amp)
        return (float(np.clip(yaw, *sp.yaw_range_deg)), float(np.clip(pitch, *sp.pitch_range_deg)))

    def _move(self, tgt: Target, t_ns: int, frame: int, sim_s: float, dt_s: float) -> None:
        m, sp = self.sc.motion, self.sc.spawn
        if sim_s >= tgt.next_rev_x:
            tgt.vx_goal = -math.copysign(float(self.rng.uniform(*m.speed_mps)), tgt.vx_goal)
            tgt.next_rev_x = sim_s + float(self.rng.uniform(*m.reverse_interval_s))
            self.events.append(TargetEvent(t_ns, frame, tgt.id, "reverse_x", tgt.vx_goal))
        if (tgt.yaw >= sp.yaw_range_deg[1] and tgt.vx_goal > 0) or (tgt.yaw <= sp.yaw_range_deg[0] and tgt.vx_goal < 0):
            tgt.vx_goal = -tgt.vx_goal
            self.events.append(TargetEvent(t_ns, frame, tgt.id, "reverse_x", tgt.vx_goal))
        step = m.accel_mps2 * dt_s
        tgt.vx += float(np.clip(tgt.vx_goal - tgt.vx, -step, step))
        circ = tgt.distance * max(0.05, math.cos(math.radians(tgt.pitch)))
        tgt.yaw = wrap_deg(tgt.yaw + math.degrees(tgt.vx * dt_s / circ))

        if m.vertical:
            if sim_s >= tgt.next_rev_y:
                tgt.vy_goal = -math.copysign(float(self.rng.uniform(*m.vertical_speed_mps)), tgt.vy_goal)
                tgt.next_rev_y = sim_s + float(self.rng.uniform(*m.reverse_interval_s))
                self.events.append(TargetEvent(t_ns, frame, tgt.id, "reverse_y", tgt.vy_goal))
            if (tgt.pitch >= sp.pitch_range_deg[1] and tgt.vy_goal > 0) or (tgt.pitch <= sp.pitch_range_deg[0] and tgt.vy_goal < 0):
                tgt.vy_goal = -tgt.vy_goal
                self.events.append(TargetEvent(t_ns, frame, tgt.id, "reverse_y", tgt.vy_goal))
            tgt.vy += float(np.clip(tgt.vy_goal - tgt.vy, -step, step))
            tgt.pitch = float(np.clip(tgt.pitch + math.degrees(tgt.vy * dt_s / tgt.distance), -80.0, 80.0))
