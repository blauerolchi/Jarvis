"""Self-contained HTML report (interactive SVG charts, no external assets)."""

from __future__ import annotations

import datetime as dt
import json
import math
from importlib import resources
from pathlib import Path

import numpy as np
import pandas as pd

from aimharness.analysis.recommend import recommendations
from aimharness.analysis.kinematics import angular_speed, lowpass
from aimharness.analysis.summary import analyze_all, json_safe, load_all_trials
from aimharness.analysis.trials import trial_signals
from aimharness.data.store import load_session, sessions_root
from aimharness.mathutil import tangent_offset

# key -> label, unit, decimals, scale, better ("up" | "down" | None), scoring ("click" | "tracking" | "both")
METRICS: dict[str, dict] = {
    "score": dict(label="Score", unit="", dec=0, scale=1, better="up", scoring="both"),
    "accuracy": dict(label="Genauigkeit", unit="%", dec=1, scale=100, better="up", scoring="click"),
    "kills_per_min": dict(label="Kills pro Minute", unit="", dec=1, scale=1, better="up", scoring="click"),
    "rt_median_ms": dict(label="Reaktionszeit (Median)", unit="ms", dec=0, scale=1, better="down", scoring="click"),
    "mt_median_ms": dict(label="Bewegungszeit (Median)", unit="ms", dec=0, scale=1, better="down", scoring="click"),
    "tp_effective_bps": dict(label="Durchsatz, effektiv", unit="bit/s", dec=2, scale=1, better="up", scoring="click"),
    "tp_nominal_bps": dict(label="Durchsatz, nominal", unit="bit/s", dec=2, scale=1, better="up", scoring="click"),
    "overshoot_rate": dict(label="Overshoot über Zielrand", unit="%", dec=1, scale=100, better="down", scoring="click"),
    "primary_gain_median": dict(label="Gain der Primärbewegung", unit="", dec=2, scale=1, better=None, scoring="click"),
    "corrections_mean": dict(label="Nachkorrekturen pro Ziel", unit="", dec=2, scale=1, better="down", scoring="click"),
    "verify_median_ms": dict(label="Zeit im Ziel vor Klick", unit="ms", dec=0, scale=1, better=None, scoring="click"),
    "on_target_held_pct": dict(label="On target (LMB)", unit="%", dec=1, scale=1, better="up", scoring="tracking"),
    "track_rms_err_deg": dict(label="Tracking-Fehler (RMS)", unit="°", dec=2, scale=1, better="down", scoring="tracking"),
    "track_lag_ms": dict(label="Nachlauf", unit="ms", dec=0, scale=1, better="down", scoring="tracking"),
    "reversal_response_ms": dict(label="Reaktion auf Richtungswechsel", unit="ms", dec=0, scale=1, better="down", scoring="tracking"),
    "track_gain": dict(label="Geschwindigkeits-Gain", unit="", dec=2, scale=1, better=None, scoring="tracking"),
    "jitter_rms_arcmin": dict(label="Mikrojitter (RMS)", unit="'", dec=2, scale=1, better=None, scoring="both"),
}

KPI_KEYS = {
    "click": ["score", "accuracy", "rt_median_ms", "tp_effective_bps", "overshoot_rate", "corrections_mean"],
    "tracking": ["score", "on_target_held_pct", "track_lag_ms", "reversal_response_ms", "track_rms_err_deg", "jitter_rms_arcmin"],
}
RECENT_SESSIONS = 5
PROFILE_STEP_MS = 5
PROFILE_HORIZON_MS = 700


def _profiles(session_path: Path, trials: pd.DataFrame) -> dict:
    """Median / IQR of remaining distance (relative to A) and speed (relative to peak), aligned to onset."""
    rows = trials[(trials["outcome"] == "killed") & (trials["no_movement"] == False) & (~trials["is_home"])]  # noqa: E712
    rows = rows[np.isfinite(rows["t_onset_ns"].astype(float))]
    if len(rows) < 5:
        return {}
    sess = load_session(session_path)
    inp = sess.input_events[~sess.input_events["paused"]]
    rel = np.arange(0, PROFILE_HORIZON_MS + 1, PROFILE_STEP_MS)
    rem, spd = [], []
    for tr in rows.itertuples(index=False):
        grid, cy, cp, ty, tp = trial_signals(sess, inp, int(tr.target_id), int(tr.t_start_ns), int(tr.t_end_ns))
        ex, ey = tangent_offset(cy, cp, ty, tp)
        amp = math.hypot(ex[0], ey[0])
        if amp <= 0:
            continue
        along = (ex * ex[0] + ey * ey[0]) / amp / amp
        speed = lowpass(angular_speed(cy, cp), 30.0)
        peak = speed.max() or 1.0
        t_rel = (grid - int(tr.t_onset_ns)) / 1e6
        valid = (rel <= t_rel[-1])
        rem.append(np.where(valid, np.interp(rel, t_rel, along), np.nan))
        spd.append(np.where(valid, np.interp(rel, t_rel, speed / peak), np.nan))
    if len(rem) < 5:
        return {}
    rem, spd = np.array(rem), np.array(spd)
    enough = np.sum(np.isfinite(rem), axis=0) >= max(5, len(rem) // 4)

    def stats(a):
        with np.errstate(all="ignore"):
            q = np.nanpercentile(a[:, enough], [25, 50, 75], axis=0)
        return [[float(t), float(lo), float(md), float(hi)] for t, lo, md, hi in zip(rel[enough], *q)]

    return {"n": len(rem), "remaining": stats(rem), "speed": stats(spd)}


def _difficulty(trials: pd.DataFrame) -> dict:
    if trials.empty:
        return {}
    tr = trials[~trials["is_home"]].copy()
    tr["killed"] = tr["outcome"] == "killed"

    def table(col: str, edges: list[float], fmt) -> list[dict]:
        rows = []
        bins = pd.cut(tr[col], edges, right=False)
        for iv, g in tr.groupby(bins, observed=True):
            if g.empty:
                continue
            moved = g[g["no_movement"] == False]  # noqa: E712
            shots = int(g["n_shots"].sum())
            rows.append({
                "bin": fmt(iv.left, iv.right),
                "n": int(len(g)),
                "accuracy": float(g["killed"].sum() / shots) if shots else None,
                "expired": float((g["outcome"] == "expired").mean()),
                "mt_ms": float(moved["mt_ms"].median()) if moved["mt_ms"].notna().any() else None,
                "overshoot": float(moved["overshoot_beyond_edge"].astype(float).mean()) if len(moved) else None,
                "corrections": float(pd.to_numeric(moved["n_corrections"]).mean()) if len(moved) else None,
            })
        return rows

    def ival(a, b):
        return f"{a:g} – {b:g}" if math.isfinite(b) else f"≥ {a:g}"

    out = {}
    if "ID" in tr and tr["ID"].notna().any():
        out["by_id"] = table("ID", [0, 1, 2, 3, 4, 5, math.inf], ival)
    out["by_size"] = table("W_deg", [0, 1, 2, 3, 5, math.inf], lambda a, b: ival(a, b) + "°")
    return out


def _scenario_block(sid: str, summaries: pd.DataFrame, trials: pd.DataFrame, data_root: Path) -> dict:
    s = summaries[summaries["scenario"] == sid].sort_values("started")
    records = [json_safe(r) for r in s.drop(columns=[c for c in ("psd_f", "psd", "fitts_conditions") if c in s]).to_dict("records")]
    latest = s.iloc[-1].to_dict()
    scoring = latest["scoring"]
    block = {
        "id": sid,
        "name": latest["scenario_name"],
        "scoring": scoring,
        "sessions": records,
        "recommendations": recommendations(json_safe(latest), [json_safe(r) for r in s.iloc[:-1].to_dict("records")]),
        "psd": {"f": latest.get("psd_f") or [], "p": latest.get("psd") or []},
    }
    if scoring == "click" and not trials.empty:
        recent_ids = list(s["session"].iloc[-RECENT_SESSIONS:])
        t = trials[(trials["scenario"] == sid) & (trials["session"].isin(recent_ids))]
        if not t.empty:
            killed = t[(t["outcome"] == "killed") & (t["no_movement"] == False) & (~t["is_home"])]  # noqa: E712
            block["rt"] = [round(float(v), 1) for v in t["rt_ms"].dropna()]
            block["gain"] = [round(float(v), 3) for v in killed["primary_gain"].dropna()] if "primary_gain" in killed else []
            block["corrections"] = [int(v) for v in killed["n_corrections"].dropna()] if "n_corrections" in killed else []
            fitts = killed[np.isfinite(killed["ID"]) & (killed["mt_ms"] > 0)]
            block["fitts"] = [[round(float(a), 3), round(float(b), 1)] for a, b in zip(fitts["ID"], fitts["mt_ms"])][-3000:]
            if len(fitts) >= 5 and fitts["ID"].std() > 0.2:
                b, a = np.polyfit(fitts["ID"], fitts["mt_ms"], 1)
                block["fitts_fit"] = {"a": float(a), "b": float(b)}
            block["difficulty"] = _difficulty(t)
            block["recent_n"] = len(recent_ids)
        # Most recent session with enough completed trials.
        for _, row in s.iloc[::-1].iterrows():
            sess_trials = trials[trials["session"] == row["session"]]
            if len(sess_trials) >= 5:
                profile = _profiles(sessions_root(data_root) / row["session"], sess_trials)
                if profile:
                    block["profile"] = profile | {"started": row["started"]}
                    break
    return block


def build_report(data_root: Path, force: bool = False, out_path: Path | None = None) -> Path:
    summaries = analyze_all(data_root, force)
    if summaries.empty:
        raise RuntimeError("keine Sessions gefunden – zuerst eine Session spielen")
    trials = load_all_trials(data_root)
    order = summaries.groupby("scenario")["started"].max().sort_values(ascending=False).index
    data = {
        "generated": dt.datetime.now().isoformat(timespec="minutes"),
        "n_sessions": int(len(summaries)),
        "metrics": METRICS,
        "kpis": KPI_KEYS,
        "scenarios": [_scenario_block(sid, summaries, trials, data_root) for sid in order],
    }
    template = resources.files("aimharness.analysis").joinpath("report_template.html").read_text(encoding="utf-8")
    payload = json.dumps(json_safe(data), ensure_ascii=False).replace("</", "<\\/")
    html = template.replace("__DATA__", payload)
    out_dir = data_root / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_path or out_dir / f"report_{dt.datetime.now():%Y-%m-%d_%H-%M-%S}.html"
    out_path.write_text(html, encoding="utf-8")
    (out_dir / "latest.html").write_text(html, encoding="utf-8")
    return out_path
