"""In-memory session recorder; writes Parquet tables + meta.json at the end."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from aimharness.data.schema import SCHEMA_VERSION, TABLES
from aimharness.inputsrc.base import InputEvent


class SessionRecorder:
    """Collects rows as tuples (cheap to append inside the frame loop)."""

    def __init__(self, t0_ns: int):
        self.t0 = t0_ns
        self.rows: dict[str, list[tuple]] = {name: [] for name in TABLES}
        self._seq = 0

    def rel(self, t_ns: int) -> int:
        return t_ns - self.t0

    def input_event(self, ev: InputEvent, frame: int, yaw: float, pitch: float, paused: bool) -> None:
        self.rows["input_events"].append((
            self._seq, ev.t_ns - self.t0, ev.t_msg_ms, frame, ev.dx, ev.dy, ev.buttons, ev.flags,
            ev.device, yaw, pitch, paused,
        ))
        self._seq += 1

    def frame(self, frame: int, t_ns: int, t_present_ns: int, dt_ms: float, yaw: float, pitch: float,
              n_events: int, sum_dx: int, sum_dy: int, lmb: bool, on_target: int, paused: bool) -> None:
        self.rows["frames"].append((
            frame, t_ns - self.t0, t_present_ns - self.t0, dt_ms, yaw, pitch, n_events, sum_dx, sum_dy,
            lmb, on_target, paused,
        ))

    def target_frame(self, frame: int, target_id: int, yaw: float, pitch: float, distance: float, radius: float,
                     ang_radius: float, sx: float, sy: float, sr: float, on_screen: bool) -> None:
        self.rows["target_frames"].append((frame, target_id, yaw, pitch, distance, radius, ang_radius, sx, sy, sr, on_screen))

    def shot(self, shot_id: int, t_ns: int, frame: int, yaw: float, pitch: float, hit: bool, killed: bool,
             target_id: int, err: float, err_x: float, err_y: float, ang_radius: float) -> None:
        self.rows["shots"].append((shot_id, t_ns - self.t0, frame, yaw, pitch, hit, killed, target_id, err, err_x, err_y, ang_radius))

    def event(self, t_ns: int, frame: int, target_id: int, kind: str, value: float = float("nan")) -> None:
        self.rows["target_events"].append((t_ns - self.t0, frame, target_id, kind, value))

    def targets(self, targets) -> None:
        rel = self.rel
        for t in targets:
            self.rows["targets"].append((
                t.id, t.cond_id, t.amplitude_nominal, t.is_home,
                rel(t.spawn_t_ns), t.spawn_frame,
                rel(t.visible_t_ns) if t.visible_t_ns >= 0 else -1, t.visible_frame,
                rel(t.end_t_ns) if t.end_t_ns >= 0 else -1, t.end_frame, t.outcome,
                t.spawn_yaw, t.spawn_pitch, t.distance, t.radius, t.ang_radius, t.hp, t.hits, t.speed,
            ))

    def tables(self) -> dict[str, pd.DataFrame]:
        out = {}
        for name, cols in TABLES.items():
            df = pd.DataFrame.from_records(self.rows[name], columns=list(cols))
            out[name] = df.astype(cols)
        return out

    def save(self, session_dir: Path, meta: dict) -> Path:
        session_dir.mkdir(parents=True, exist_ok=True)
        for name, df in self.tables().items():
            df.to_parquet(session_dir / f"{name}.parquet", index=False)
        meta = {"schema_version": SCHEMA_VERSION, **meta}
        (session_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
        return session_dir
