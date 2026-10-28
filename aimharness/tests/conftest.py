from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")

from aimharness.data.schema import TABLES  # noqa: E402
from aimharness.data.store import SessionData  # noqa: E402

MS = 1_000_000


def min_jerk(t: np.ndarray, t0: float, dur: float, x0: float, x1: float) -> np.ndarray:
    s = np.clip((t - t0) / dur, 0.0, 1.0)
    return x0 + (x1 - x0) * (10 * s**3 - 15 * s**4 + 6 * s**5)


def make_click_session(tmp_path: Path, segments: list[tuple[float, float, float, float]], target_yaw: float,
                       ang_radius: float, t_visible_ms: float, t_click_ms: float,
                       deg_per_count: float = 0.01, end_ms: float | None = None) -> SessionData:
    """Single static target at (target_yaw, 0). ``segments``: (t0_ms, dur_ms, from_deg, to_deg)."""
    end_ms = end_ms or t_click_ms + 50
    t_ms = np.arange(0.0, end_ms, 1.0)
    yaw = np.zeros_like(t_ms)
    for t0, dur, a, b in segments:
        yaw = np.where(t_ms >= t0, min_jerk(t_ms, t0, dur, a, b), yaw)
    counts = np.round(yaw / deg_per_count).astype(int)
    dx = np.diff(np.r_[0, counts])
    sel = dx != 0
    t_ev = (t_ms[sel] * MS).astype(np.int64)
    yaw_ev = counts[sel] * deg_per_count
    click_t = int(t_click_ms * MS)
    pos_at_click = counts[int(t_click_ms)] * deg_per_count
    inp = pd.DataFrame({
        "seq": np.arange(len(t_ev)), "t_ns": t_ev, "t_msg_ms": 0, "frame": (t_ev // (4 * MS)),
        "dx": dx[sel], "dy": 0, "button_flags": 0, "flags": 0, "device": 0,
        "yaw_deg": yaw_ev, "pitch_deg": 0.0, "paused": False,
    })
    click = pd.DataFrame([{"seq": len(inp), "t_ns": click_t, "t_msg_ms": 0, "frame": click_t // (4 * MS),
                           "dx": 0, "dy": 0, "button_flags": 1, "flags": 0, "device": 0,
                           "yaw_deg": pos_at_click, "pitch_deg": 0.0, "paused": False}])
    inp = pd.concat([inp, click]).sort_values("t_ns").reset_index(drop=True)

    f_t = np.arange(0, int(end_ms * MS), 4 * MS, dtype=np.int64)
    frames = pd.DataFrame({
        "frame": np.arange(len(f_t)), "t_ns": f_t, "t_present_ns": f_t + 2 * MS, "dt_ms": 4.0,
        "yaw_deg": np.interp(f_t / MS, t_ms, yaw), "pitch_deg": 0.0, "n_events": 4, "sum_dx": 0,
        "sum_dy": 0, "lmb": False, "on_target": -1, "paused": False,
    })
    vis_frame = int(t_visible_ms // 4)
    alive = frames["frame"][(frames["frame"] >= vis_frame) & (frames["t_ns"] <= click_t)]
    dist = 10.0
    radius = dist * math.sin(math.radians(ang_radius))
    target_frames = pd.DataFrame({
        "frame": alive.to_numpy(), "target_id": 0, "yaw_deg": target_yaw, "pitch_deg": 0.0,
        "distance_m": dist, "radius_m": radius, "ang_radius_deg": ang_radius,
        "screen_x": 0.0, "screen_y": 0.0, "screen_r": 0.0, "on_screen": True,
    })
    targets = pd.DataFrame([{
        "target_id": 0, "cond_id": 0, "amplitude_nominal_deg": target_yaw, "is_home": False,
        "spawn_t_ns": int(t_visible_ms * MS) - MS, "spawn_frame": vis_frame,
        "visible_t_ns": int(t_visible_ms * MS), "visible_frame": vis_frame,
        "end_t_ns": click_t, "end_frame": click_t // (4 * MS), "outcome": "killed",
        "spawn_yaw_deg": target_yaw, "spawn_pitch_deg": 0.0, "distance_m": dist, "radius_m": radius,
        "ang_radius_deg": ang_radius, "hp": 1, "hits": 1, "speed_mps": 0.0,
    }])
    shots = pd.DataFrame([{
        "shot_id": 0, "t_ns": click_t, "frame": click_t // (4 * MS), "yaw_deg": pos_at_click,
        "pitch_deg": 0.0, "hit": True, "killed": True, "target_id": 0,
        "err_deg": abs(target_yaw - pos_at_click), "err_x_deg": target_yaw - pos_at_click,
        "err_y_deg": 0.0, "ang_radius_deg": ang_radius,
    }])
    events = pd.DataFrame(columns=list(TABLES["target_events"])).astype(TABLES["target_events"])
    tables = {"input_events": inp, "frames": frames, "target_frames": target_frames, "targets": targets,
              "shots": shots, "target_events": events}
    tables = {k: v.astype(TABLES[k]) for k, v in tables.items()}
    meta = {
        "scenario": {"id": "synthetic", "name": "Synthetic", "scoring": "click"},
        "started": "2026-01-01T00:00:00", "duration_s": end_ms / 1000, "aborted": False,
        "input": {"backend": "synthetic", "timestamp_quality": "synthetic"},
        "mouse": {"deg_per_count_effective": deg_per_count}, "display": {"hfov_deg": 103.0},
        "pauses_ns": [], "quick_stats": {},
    }
    path = tmp_path / "2026-01-01_00-00-00_synthetic"
    path.mkdir(parents=True, exist_ok=True)
    return SessionData(path=path, meta=meta, **tables)


@pytest.fixture
def click_session_factory(tmp_path):
    def factory(**kw):
        return make_click_session(tmp_path, **kw)
    return factory
