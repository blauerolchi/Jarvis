"""Segmentation of click scenarios into trials and per-trial movement metrics.

A trial is the engagement of one target: it starts when the target is visible
*and* the previous kill has happened (whichever is later) and ends with the
killing click (or the target expiring).

Movement decomposition (on the 30 Hz low-passed crosshair speed):

* onset           last sample before the speed peak below max(5 % peak, 4 deg/s)
* primary end     first speed minimum after the peak (end of the ballistic phase)
* corrections     further speed peaks after the primary end (>= max(8 % peak, 8 deg/s))
* overshoot       how far the crosshair passed the target centre along the
                  initial target direction (target-relative, so it also works
                  for moving targets)
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import signal

from aimharness.analysis.kinematics import FS, angular_speed, crosshair_on_grid, lowpass, target_on_grid, time_grid
from aimharness.data.store import SessionData
from aimharness.mathutil import tangent_offset


@dataclass
class TrialParams:
    lowpass_hz: float = 30.0
    onset_frac: float = 0.05
    onset_min_dps: float = 4.0
    corr_frac: float = 0.08
    corr_min_dps: float = 8.0
    corr_min_sep_ms: float = 40.0
    min_peak_dps: float = 15.0


KINEMATIC_COLUMNS = (
    "A_deg", "no_movement", "end_along_deg", "end_perp_deg", "end_err_deg", "end_err_norm", "peak_speed_dps",
    "t_onset_ns", "t_peak_ns", "t_primary_end_ns", "time_to_peak_ms", "primary_dur_ms", "primary_gain",
    "primary_err_deg", "primary_perp_deg", "n_corrections", "overshoot_deg", "overshoot_norm",
    "overshoot_beyond_edge", "path_efficiency", "verify_ms",
)


def pause_intervals(sess: SessionData) -> list[tuple[int, int]]:
    end = int(sess.frames["t_ns"].max()) if len(sess.frames) else 0
    return [(int(a), int(b) if b >= 0 else end) for a, b in sess.meta.get("pauses_ns", [])]


def _overlaps(a0: int, a1: int, intervals: list[tuple[int, int]]) -> bool:
    return any(a0 < b1 and b0 < a1 for b0, b1 in intervals)


def trial_kinematics(t: np.ndarray, cy: np.ndarray, cp: np.ndarray, ty: np.ndarray, tp: np.ndarray,
                     ang_radius: float, params: TrialParams = TrialParams()) -> dict:
    """Metrics of one aiming movement sampled on a uniform grid ``t`` (ns)."""
    ex, ey = tangent_offset(cy, cp, ty, tp)
    ex, ey = np.asarray(ex, float), np.asarray(ey, float)
    amp = float(np.hypot(ex[0], ey[0]))
    out: dict = {"A_deg": amp}
    if amp < 1e-6:
        return out | {"no_movement": True}
    u = np.array([ex[0], ey[0]]) / amp
    along = ex * u[0] + ey * u[1]          # remaining distance to the centre along the initial direction
    perp = -ex * u[1] + ey * u[0]
    speed = lowpass(angular_speed(cy, cp), params.lowpass_hz)
    ipk = int(np.argmax(speed))
    peak = float(speed[ipk])
    err = np.hypot(ex, ey)
    out |= {
        "end_along_deg": float(along[-1]),
        "end_perp_deg": float(perp[-1]),
        "end_err_deg": float(err[-1]),
        "end_err_norm": float(err[-1] / ang_radius),
        "peak_speed_dps": peak,
    }
    if peak < params.min_peak_dps:
        return out | {"no_movement": True}

    thr = max(params.onset_frac * peak, params.onset_min_dps)
    below = np.flatnonzero(speed[:ipk] < thr)
    i_on = int(below[-1]) if len(below) else 0

    acc = np.diff(speed[ipk:])
    mins = np.flatnonzero((acc[:-1] < 0) & (acc[1:] >= 0)) + 1 + ipk if len(acc) > 1 else np.array([], int)
    i_pe = int(mins[0]) if len(mins) else len(speed) - 1

    height = max(params.corr_frac * peak, params.corr_min_dps)
    peaks, _ = signal.find_peaks(speed[i_pe:], height=height, prominence=0.5 * height,
                                 distance=max(1, int(params.corr_min_sep_ms * FS / 1000)))

    seg = slice(i_on, None)
    overshoot = float(max(0.0, -np.min(along[seg])))
    # Path of the crosshair relative to the world (not the target).
    dx = np.diff(cy[seg]) * np.cos(np.radians(cp[seg][:-1]))
    dy = np.diff(cp[seg])
    path = float(np.sum(np.hypot(dx, dy)))
    straight = float(np.hypot((cy[-1] - cy[i_on]) * np.cos(np.radians(cp[-1])), cp[-1] - cp[i_on]))

    inside = err <= ang_radius
    if inside[-1]:
        outside = np.flatnonzero(~inside)
        i_enter = int(outside[-1]) + 1 if len(outside) else 0
        verify_ms = float((t[-1] - t[i_enter]) / 1e6)
    else:
        verify_ms = np.nan

    return out | {
        "no_movement": False,
        "t_onset_ns": int(t[i_on]),
        "t_peak_ns": int(t[ipk]),
        "t_primary_end_ns": int(t[i_pe]),
        "time_to_peak_ms": float((t[ipk] - t[i_on]) / 1e6),
        "primary_dur_ms": float((t[i_pe] - t[i_on]) / 1e6),
        "primary_gain": float((amp - along[i_pe]) / amp),
        "primary_err_deg": float(np.hypot(along[i_pe], perp[i_pe])),
        "primary_perp_deg": float(perp[i_pe]),
        "n_corrections": int(len(peaks)),
        "overshoot_deg": overshoot,
        "overshoot_norm": overshoot / amp,
        "overshoot_beyond_edge": bool(overshoot > ang_radius),
        "path_efficiency": straight / path if path > 0 else np.nan,
        "verify_ms": verify_ms,
    }


def trial_signals(sess: SessionData, inp: pd.DataFrame, target_id: int, t0_ns: int, t1_ns: int):
    """Uniform 1 kHz grid with crosshair and target yaw/pitch for one engagement."""
    grid = time_grid(t0_ns, t1_ns)
    cy, cp = crosshair_on_grid(inp, grid)
    ty, tp = target_on_grid(sess.target_frames, sess.frames, target_id, grid)
    return grid, cy, cp, ty, tp


def build_trials(sess: SessionData, params: TrialParams = TrialParams()) -> pd.DataFrame:
    """One row per engaged target (killed or expired) of a click scenario."""
    if sess.scoring != "click" or sess.targets.empty:
        return pd.DataFrame()
    tg = sess.targets
    kills = np.sort(tg.loc[tg["outcome"] == "killed", "end_t_ns"].to_numpy(np.int64))
    pauses = pause_intervals(sess)
    inp = sess.input_events[~sess.input_events["paused"]]
    shots_t = sess.shots["t_ns"].to_numpy(np.int64)
    rows = []
    for tgt in tg[tg["outcome"].isin(["killed", "expired"])].itertuples(index=False):
        t_end = int(tgt.end_t_ns)
        prev = kills[kills < t_end]
        prev_kill = int(prev[-1]) if len(prev) else 0
        t_vis = int(tgt.visible_t_ns) if tgt.visible_t_ns >= 0 else int(tgt.spawn_t_ns)
        t_start = max(t_vis, prev_kill)
        if t_end <= t_start or _overlaps(t_start, t_end, pauses):
            continue
        n_shots = int(np.count_nonzero((shots_t > t_start) & (shots_t <= t_end)))
        row = {
            "session": sess.path.name,
            "scenario": sess.scenario_id,
            "target_id": int(tgt.target_id),
            "cond_id": int(tgt.cond_id),
            "is_home": bool(tgt.is_home),
            "outcome": tgt.outcome,
            "stimulus": bool(t_vis >= prev_kill),
            "t_start_ns": t_start,
            "t_visible_ns": t_vis,
            "t_end_ns": t_end,
            "ang_radius_deg": float(tgt.ang_radius_deg),
            "W_deg": 2.0 * float(tgt.ang_radius_deg),
            "moving": float(tgt.speed_mps) > 0,
            "n_shots": n_shots,
            "n_misses": n_shots - (1 if tgt.outcome == "killed" else 0),
            "ttk_ms": (t_end - t_start) / 1e6 if tgt.outcome == "killed" else np.nan,
        }
        if t_end - t_start >= 8_000_000 and not inp.empty:
            grid, cy, cp, ty, tp = trial_signals(sess, inp, int(tgt.target_id), t_start, t_end)
            if np.all(np.isfinite(ty)):
                row |= trial_kinematics(grid, cy, cp, ty, tp, float(tgt.ang_radius_deg), params)
        rows.append(row)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for col in KINEMATIC_COLUMNS:
        if col not in df:
            df[col] = np.nan
    df["ID"] = np.log2(df["A_deg"] / df["W_deg"] + 1.0)
    df["onset_latency_ms"] = (df["t_onset_ns"] - df["t_start_ns"]) / 1e6
    df["rt_ms"] = np.where(df["stimulus"], (df["t_onset_ns"] - df["t_visible_ns"]) / 1e6, np.nan)
    df["mt_ms"] = np.where(df["outcome"] == "killed", (df["t_end_ns"] - df["t_onset_ns"]) / 1e6, np.nan)
    return df
