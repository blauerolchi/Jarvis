"""Metrics for tracking scenarios (continuous following of a moving target)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from aimharness.analysis.kinematics import lowpass
from aimharness.mathutil import tangent_offset

FS_TRACK = 500.0


def _zero_crossings(v: np.ndarray, t: np.ndarray, after_ns: int, sign: float, limit_ns: int) -> int | None:
    """First time after ``after_ns`` where v changes to the direction ``sign``."""
    idx = np.flatnonzero((t > after_ns) & (t <= after_ns + limit_ns) & (sign * v > 0))
    return int(t[idx[0]]) if len(idx) else None


def tracking_metrics(frames: pd.DataFrame, target_frames: pd.DataFrame, target_events: pd.DataFrame) -> dict:
    fr = frames[~frames["paused"]]
    tf = target_frames.merge(fr[["frame", "t_ns", "yaw_deg", "pitch_deg", "lmb"]], on="frame",
                             suffixes=("_t", "_c"))
    out = {"on_target_pct": np.nan, "on_target_held_pct": np.nan, "track_rms_err_deg": np.nan,
           "track_err_norm": np.nan, "track_lag_ms": np.nan, "track_gain": np.nan,
           "reversal_response_ms": np.nan, "n_reversals": 0}
    if len(tf) < 50:
        return out
    tf = tf.sort_values("t_ns")
    t_src = tf["t_ns"].to_numpy(np.int64)
    t = np.arange(t_src[0], t_src[-1], int(1e9 / FS_TRACK), dtype=np.int64)
    cy = np.interp(t, t_src, np.unwrap(tf["yaw_deg_c"].to_numpy(float), period=360))
    cp = np.interp(t, t_src, tf["pitch_deg_c"].to_numpy(float))
    ty = np.interp(t, t_src, np.unwrap(tf["yaw_deg_t"].to_numpy(float), period=360))
    tp = np.interp(t, t_src, tf["pitch_deg_t"].to_numpy(float))
    ang_r = np.interp(t, t_src, tf["ang_radius_deg"].to_numpy(float))
    lmb = tf["lmb"].to_numpy(bool)[np.clip(np.searchsorted(t_src, t, side="right") - 1, 0, len(t_src) - 1)]
    ex, ey = tangent_offset(cy, cp, ty, tp)
    err = np.hypot(ex, ey)
    on = err <= ang_r
    out |= {
        "on_target_pct": 100.0 * float(on.mean()),
        "on_target_held_pct": 100.0 * float((on & lmb).mean()),
        "track_rms_err_deg": float(np.sqrt(np.mean(err ** 2))),
        "track_err_norm": float(np.mean(err / ang_r)),
    }

    # Horizontal velocities, 10 Hz low-pass.
    vc = lowpass(np.gradient(cy, 1 / FS_TRACK), 10.0, FS_TRACK)
    vt = lowpass(np.gradient(ty, 1 / FS_TRACK), 10.0, FS_TRACK)
    max_lag = int(0.4 * FS_TRACK)
    if len(vc) > 4 * max_lag and np.std(vt) > 0:
        a, b = vt - vt.mean(), vc - vc.mean()
        corr = [np.dot(a[: len(a) - k], b[k:]) for k in range(max_lag + 1)]
        out["track_lag_ms"] = 1000.0 * int(np.argmax(corr)) / FS_TRACK
        out["track_gain"] = float(np.std(vc) / np.std(vt))

    # Response to target direction changes: from the target's velocity sign
    # change to the crosshair's velocity sign change in the same direction.
    revs = target_events[target_events["kind"] == "reverse_x"]
    lat = []
    for ev in revs.itertuples(index=False):
        sign = float(np.sign(ev.value))
        t_tgt = _zero_crossings(vt, t, int(ev.t_ns), sign, 800_000_000)
        if t_tgt is None:
            continue
        t_cross = _zero_crossings(vc, t, t_tgt - 150_000_000, sign, 950_000_000)
        if t_cross is not None:
            lat.append((t_cross - t_tgt) / 1e6)
    if lat:
        out["reversal_response_ms"] = float(np.median(lat))
        out["n_reversals"] = len(lat)
    return out
