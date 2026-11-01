"""Per-session summaries (cached next to the raw data) and cross-session tables."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from aimharness.analysis import ANALYSIS_VERSION
from aimharness.analysis.fitts import effective_throughput, fitts_fit
from aimharness.analysis.jitter import jitter_metrics
from aimharness.analysis.kinematics import report_interval_ns
from aimharness.analysis.tracking import tracking_metrics
from aimharness.analysis.trials import build_trials
from aimharness.data.store import SessionData, list_sessions, load_session

SUMMARY_FILE = "summary.json"
TRIALS_FILE = "trials.parquet"


def _median(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return float(s.median()) if len(s) else math.nan


def _iqr(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return float(s.quantile(0.75) - s.quantile(0.25)) if len(s) >= 4 else math.nan


def json_safe(obj):
    """JSON-safe: NaN -> None, numpy scalars -> Python."""
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        return None if not math.isfinite(float(obj)) else float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def session_summary(sess: SessionData) -> tuple[dict, pd.DataFrame]:
    meta = sess.meta
    fr = sess.frames[~sess.frames["paused"]] if len(sess.frames) else sess.frames
    moving = sess.input_events[(sess.input_events["dx"] != 0) | (sess.input_events["dy"] != 0)]
    interval = report_interval_ns(moving["t_ns"].to_numpy(np.int64)) if len(moving) > 10 else math.nan
    s: dict = {
        "analysis_version": ANALYSIS_VERSION,
        "session": sess.path.name,
        "scenario": sess.scenario_id,
        "scenario_name": meta["scenario"]["name"],
        "scoring": sess.scoring,
        "started": meta["started"],
        "duration_s": meta["duration_s"],
        "aborted": meta["aborted"],
        "backend": meta["input"]["backend"],
        "timestamp_quality": meta["input"]["timestamp_quality"],
        "rawinput_reregistrations": meta["input"].get("reregistrations", 0),
        "deg_per_count": meta["mouse"]["deg_per_count_effective"],
        "hfov_deg": meta["display"]["hfov_deg"],
        "setup_note": meta.get("setup_note", ""),
        "mean_fps": float(1000.0 / fr["dt_ms"].mean()) if len(fr) else math.nan,
        "frame_time_p99_ms": float(fr["dt_ms"].quantile(0.99)) if len(fr) else math.nan,
        "input_rate_hz": 1e9 / interval if interval and math.isfinite(interval) else math.nan,
        **{k: v for k, v in meta.get("quick_stats", {}).items()},
    }
    trials = build_trials(sess)
    if sess.scoring == "click" and not trials.empty:
        killed = trials[trials["outcome"] == "killed"]
        moved = killed[killed["no_movement"] == False]  # noqa: E712
        s |= {
            "n_trials": int(len(trials)),
            "expired_rate": float((trials["outcome"] == "expired").mean()),
            "rt_median_ms": _median(trials["rt_ms"]),
            "rt_iqr_ms": _iqr(trials["rt_ms"]),
            "onset_latency_median_ms": _median(trials["onset_latency_ms"]),
            "mt_median_ms": _median(moved["mt_ms"]),
            "ttk_median_ms": _median(killed["ttk_ms"]),
            "peak_speed_median_dps": _median(moved.get("peak_speed_dps", pd.Series(dtype=float))),
            "primary_gain_median": _median(moved.get("primary_gain", pd.Series(dtype=float))),
            "primary_gain_iqr": _iqr(moved.get("primary_gain", pd.Series(dtype=float))),
            "overshoot_rate": float(moved["overshoot_beyond_edge"].astype(float).mean()) if len(moved) and "overshoot_beyond_edge" in moved else math.nan,
            "overshoot_norm_median": _median(moved.get("overshoot_norm", pd.Series(dtype=float))),
            "corrections_mean": float(pd.to_numeric(moved.get("n_corrections", pd.Series(dtype=float))).mean()) if len(moved) else math.nan,
            "path_efficiency_median": _median(moved.get("path_efficiency", pd.Series(dtype=float))),
            "verify_median_ms": _median(moved.get("verify_ms", pd.Series(dtype=float))),
            "misses_per_kill": float(killed["n_misses"].mean()) if len(killed) else math.nan,
        }
        s |= fitts_fit(trials)
        tp_e, cond_table = effective_throughput(trials)
        s["tp_effective_bps"] = tp_e
        s["fitts_conditions"] = cond_table.to_dict(orient="records")
    if sess.scoring == "tracking":
        s |= tracking_metrics(sess.frames, sess.target_frames, sess.target_events)
    s |= jitter_metrics(sess)
    return json_safe(s), trials


def analyze_session(path: Path, force: bool = False) -> dict:
    """Return the cached summary or compute (and cache) it."""
    summary_path = path / SUMMARY_FILE
    if not force and summary_path.exists():
        cached = json.loads(summary_path.read_text(encoding="utf-8"))
        if cached.get("analysis_version") == ANALYSIS_VERSION:
            return cached
    summary, trials = session_summary(load_session(path))
    if not trials.empty:
        trials.to_parquet(path / TRIALS_FILE, index=False)
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


def analyze_all(data_root: Path, force: bool = False, log=print) -> pd.DataFrame:
    rows = []
    for p in list_sessions(data_root):
        try:
            rows.append(analyze_session(p, force))
        except Exception as exc:  # noqa: BLE001 - one broken session must not stop the report
            log(f"[analyse] {p.name}: {type(exc).__name__}: {exc}")
    return pd.DataFrame(rows)


def load_all_trials(data_root: Path) -> pd.DataFrame:
    frames = [pd.read_parquet(p / TRIALS_FILE) for p in list_sessions(data_root) if (p / TRIALS_FILE).exists()]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
