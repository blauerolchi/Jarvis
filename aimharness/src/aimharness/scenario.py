"""Scenario definitions (TOML) for the target environment."""

from __future__ import annotations

import itertools
import tomllib
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path

from aimharness.confutil import from_dict, parse_color

# Floor below the player's eye: sphere targets float in a room with a low floor,
# training bots stand on the floor with the camera at a typical eye height.
SPHERE_FLOOR_Y = -4.0
BOT_EYE_HEIGHT = 1.65


@dataclass
class TargetSpec:
    # "sphere" | "humanoid" (training bot standing on the floor)
    kind: str = "sphere"
    # Candidate values; one is drawn per spawn (or combined into conditions
    # for the "amplitude" spawn pattern). For humanoids distance_m is the
    # distance along the floor and radius_m is ignored.
    distance_m: list[float] = field(default_factory=lambda: [10.0])
    radius_m: list[float] = field(default_factory=lambda: [0.35])
    # Sphere colour, or accent colour of the bots.
    color: str = "#26b4ff"
    # Spheres: hits needed.
    hp: int = 1
    # Humanoids: health and damage per hit zone; headshot_only ignores body/leg hits.
    health: float = 100.0
    damage_head: float = 100.0
    damage_body: float = 34.0
    damage_legs: float = 25.0
    headshot_only: bool = False

    @property
    def humanoid(self) -> bool:
        return self.kind == "humanoid"

    def damage(self, zone: str) -> float:
        if self.headshot_only and zone != "head":
            return 0.0
        return {"head": self.damage_head, "body": self.damage_body, "legs": self.damage_legs}.get(zone, 0.0)

    @property
    def rgb(self) -> tuple[int, int, int]:
        return parse_color(self.color)


@dataclass
class SpawnSpec:
    # "grid" | "random" | "amplitude"
    pattern: str = "random"
    count: int = 1
    # Absolute world angles of the spawn area (player starts at yaw 0, pitch 0).
    yaw_range_deg: tuple[float, float] = (-30.0, 30.0)
    pitch_range_deg: tuple[float, float] = (-10.0, 15.0)
    grid_cols: int = 5
    grid_rows: int = 5
    # Minimum angular separation between simultaneously alive targets.
    min_separation_deg: float = 4.0
    # "amplitude" pattern: angular distance from the crosshair at spawn time.
    amplitudes_deg: list[float] = field(default_factory=lambda: [10.0, 20.0, 35.0])
    # Alternate outward targets with a target at the home position (yaw 0, pitch 0).
    center_return: bool = False
    # Random foreperiod before a replacement target appears (min, max).
    delay_ms: tuple[float, float] = (0.0, 0.0)
    # Targets disappear (outcome "expired") after this time; 0 = never.
    timeout_s: float = 0.0


@dataclass
class MotionSpec:
    # "static" | "strafe"
    kind: str = "static"
    speed_mps: tuple[float, float] = (2.5, 4.5)
    # Time between direction changes (min, max).
    reverse_interval_s: tuple[float, float] = (0.4, 1.2)
    accel_mps2: float = 25.0
    vertical: bool = False
    vertical_speed_mps: tuple[float, float] = (0.5, 1.5)


@dataclass
class Scenario:
    id: str = ""
    name: str = ""
    description: str = ""
    order: int = 100  # position in the menu
    duration_s: float = 60.0
    # "click" (targets die when shot) | "tracking" (hold LMB on target)
    scoring: str = "click"
    seed: int = 0  # 0 = random seed per session
    targets: TargetSpec = field(default_factory=TargetSpec)
    spawn: SpawnSpec = field(default_factory=SpawnSpec)
    motion: MotionSpec = field(default_factory=MotionSpec)
    source_path: str = ""

    def conditions(self) -> list[tuple[float, float, float]]:
        """(amplitude_deg, radius_m, distance_m) combinations for the amplitude pattern."""
        return list(itertools.product(self.spawn.amplitudes_deg, self.targets.radius_m, self.targets.distance_m))


def validate(sc: Scenario) -> None:
    errs = []
    if not sc.id:
        errs.append("id missing")
    if sc.duration_s <= 0:
        errs.append("duration_s must be > 0")
    if sc.scoring not in ("click", "tracking"):
        errs.append("scoring must be click|tracking")
    if sc.spawn.pattern not in ("grid", "random", "amplitude"):
        errs.append("spawn.pattern must be grid|random|amplitude")
    if sc.motion.kind not in ("static", "strafe"):
        errs.append("motion.kind must be static|strafe")
    if sc.spawn.count < 1:
        errs.append("spawn.count must be >= 1")
    if sc.spawn.pattern == "grid" and sc.spawn.count >= sc.spawn.grid_cols * sc.spawn.grid_rows:
        errs.append("spawn.count must be smaller than the number of grid cells")
    if sc.spawn.pattern == "amplitude" and sc.spawn.count != 1:
        errs.append("amplitude pattern requires spawn.count = 1")
    if sc.scoring == "tracking" and sc.spawn.count != 1:
        errs.append("tracking requires spawn.count = 1")
    if sc.targets.kind not in ("sphere", "humanoid"):
        errs.append("targets.kind must be sphere|humanoid")
    if sc.targets.humanoid:
        if sc.spawn.pattern == "grid":
            errs.append("humanoid targets support the random and amplitude patterns")
        if sc.motion.vertical:
            errs.append("humanoid targets cannot move vertically")
        if sc.targets.health <= 0 or max(sc.targets.damage_head, sc.targets.damage_body, sc.targets.damage_legs) <= 0:
            errs.append("targets.health and at least one damage value must be > 0")
        if any(d <= 1.0 for d in sc.targets.distance_m):
            errs.append("humanoid distance_m must be > 1 m")
    if not sc.targets.distance_m or not sc.targets.radius_m:
        errs.append("targets.distance_m and targets.radius_m must not be empty")
    if any(r <= 0 for r in sc.targets.radius_m) or any(d <= r for d in sc.targets.distance_m for r in sc.targets.radius_m):
        errs.append("target radius must be > 0 and smaller than the distance")
    lo, hi = sc.spawn.yaw_range_deg
    plo, phi = sc.spawn.pitch_range_deg
    if lo >= hi or plo >= phi or plo < -80 or phi > 80:
        errs.append("invalid yaw/pitch range")
    try:
        parse_color(sc.targets.color)
    except ValueError as exc:
        errs.append(str(exc))
    if errs:
        raise ValueError(f"scenario {sc.id or sc.source_path}: " + "; ".join(errs))


def load_scenario_file(path: Path) -> Scenario:
    with path.open("rb") as fh:
        data = tomllib.load(fh)
    sc = from_dict(Scenario, data)
    sc.id = sc.id or path.stem
    sc.name = sc.name or sc.id
    sc.source_path = str(path)
    validate(sc)
    return sc


def builtin_scenario_paths() -> list[Path]:
    root = resources.files("aimharness") / "scenarios"
    return sorted(Path(str(p)) for p in root.iterdir() if p.name.endswith(".toml"))


def load_all_scenarios(user_dir: Path | None = None) -> list[Scenario]:
    """Built-in scenarios plus user scenarios (user files override by id)."""
    by_id: dict[str, Scenario] = {}
    paths = builtin_scenario_paths()
    if user_dir and user_dir.is_dir():
        paths += sorted(user_dir.glob("*.toml"))
    for p in paths:
        sc = load_scenario_file(p)
        by_id[sc.id] = sc
    return sorted(by_id.values(), key=lambda sc: (sc.order, sc.id))


def floor_y(sc: Scenario) -> float:
    """Floor height relative to the player's eye (metres)."""
    return -BOT_EYE_HEIGHT if sc.targets.humanoid else SPHERE_FLOOR_Y
