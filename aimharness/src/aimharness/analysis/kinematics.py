"""Resampling and filtering of crosshair / target trajectories."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import signal

FS = 1000.0  # analysis sample rate (Hz)


def _dedupe_last(t: np.ndarray, *vals: np.ndarray):
    """Keep the last sample of runs with identical timestamps."""
    if len(t) == 0:
        return (t, *vals)
    keep = np.r_[t[1:] != t[:-1], True]
    return (t[keep], *(v[keep] for v in vals))


def hold_aware_interp(t_grid: np.ndarray, t: np.ndarray, v: np.ndarray, gap_ns: int) -> np.ndarray:
    """Linear interpolation between reports, zero-order hold across idle gaps.

    Mice only report while moving. Plain linear interpolation across a 300 ms
    idle gap would invent a slow drift, so a hold point is inserted just
    before each report that follows a gap.
    """
    if len(t) == 0:
        return np.full(len(t_grid), np.nan)
    if len(t) > 1:
        dt = np.diff(t)
        gaps = np.flatnonzero(dt > gap_ns) + 1
        if len(gaps):
            hold_t = t[gaps] - gap_ns // 2
            t = np.insert(t, gaps, hold_t)
            v = np.insert(v, gaps, v[gaps - 1])
    return np.interp(t_grid, t, v)


def report_interval_ns(t: np.ndarray) -> int:
    """Typical interval between consecutive mouse reports while moving."""
    if len(t) < 3:
        return 1_000_000
    dt = np.diff(t)
    dt = dt[(dt > 0) & (dt < 50_000_000)]
    return int(np.median(dt)) if len(dt) else 1_000_000


def crosshair_on_grid(inp: pd.DataFrame, t_grid: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Crosshair yaw (unwrapped) and pitch at ``t_grid`` (ns) from input events.

    ``inp`` must contain t_ns, yaw_deg, pitch_deg (state after each report).
    """
    t = inp["t_ns"].to_numpy(np.int64)
    yaw = np.unwrap(inp["yaw_deg"].to_numpy(float), period=360.0)
    pitch = inp["pitch_deg"].to_numpy(float)
    t, yaw, pitch = _dedupe_last(t, yaw, pitch)
    gap = int(np.clip(3 * report_interval_ns(t), 2_000_000, 20_000_000))
    return hold_aware_interp(t_grid, t, yaw, gap), hold_aware_interp(t_grid, t, pitch, gap)


def time_grid(t0_ns: int, t1_ns: int, fs: float = FS) -> np.ndarray:
    step = int(round(1e9 / fs))
    return np.arange(int(t0_ns), int(t1_ns) + 1, step, dtype=np.int64)


def lowpass(x: np.ndarray, cutoff_hz: float, fs: float = FS, order: int = 2) -> np.ndarray:
    if len(x) < 16 or cutoff_hz >= fs / 2:
        return x.copy()
    sos = signal.butter(order, cutoff_hz, btype="low", fs=fs, output="sos")
    return signal.sosfiltfilt(sos, x)


def bandpass(x: np.ndarray, lo_hz: float, hi_hz: float, fs: float = FS, order: int = 2) -> np.ndarray:
    hi_hz = min(hi_hz, 0.45 * fs)
    if len(x) < 32 or lo_hz >= hi_hz:
        return np.zeros_like(x)
    sos = signal.butter(order, [lo_hz, hi_hz], btype="band", fs=fs, output="sos")
    return signal.sosfiltfilt(sos, x)


def angular_speed(yaw: np.ndarray, pitch: np.ndarray, fs: float = FS) -> np.ndarray:
    """Crosshair angular speed (deg/s) on a uniform grid."""
    if len(yaw) < 2:
        return np.zeros_like(yaw)
    vx = np.gradient(yaw, 1.0 / fs) * np.cos(np.radians(pitch))
    vy = np.gradient(pitch, 1.0 / fs)
    return np.hypot(vx, vy)


def target_on_grid(target_frames: pd.DataFrame, frames: pd.DataFrame, target_id: int,
                   t_grid: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Target yaw (unwrapped) / pitch at ``t_grid`` using the per-frame log."""
    tf = target_frames[target_frames["target_id"] == target_id]
    if tf.empty:
        return np.full(len(t_grid), np.nan), np.full(len(t_grid), np.nan)
    tf = tf.merge(frames[["frame", "t_ns"]], on="frame", how="left").sort_values("t_ns")
    t = tf["t_ns"].to_numpy(np.int64)
    yaw = np.unwrap(tf["yaw_deg"].to_numpy(float), period=360.0)
    pitch = tf["pitch_deg"].to_numpy(float)
    return np.interp(t_grid, t, yaw), np.interp(t_grid, t, pitch)
