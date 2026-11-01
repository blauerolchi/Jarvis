"""Fitts' law fit and effective throughput (ISO 9241-411 style)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _valid(trials: pd.DataFrame) -> pd.DataFrame:
    if trials.empty or "mt_ms" not in trials:
        return trials.iloc[0:0]
    ok = (trials["outcome"] == "killed") & (trials["no_movement"] == False) & (trials["mt_ms"] > 0)  # noqa: E712
    ok &= ~trials["is_home"] if "is_home" in trials else True
    return trials[ok & np.isfinite(trials["ID"])]


def fitts_fit(trials: pd.DataFrame) -> dict:
    """Linear regression MT = a + b * ID (Shannon formulation, nominal width)."""
    df = _valid(trials)
    out = {"fitts_n": int(len(df)), "fitts_a_ms": np.nan, "fitts_b_ms_per_bit": np.nan, "fitts_r2": np.nan,
           "tp_nominal_bps": np.nan}
    if len(df) < 5 or df["ID"].std() < 0.2:
        if len(df):
            out["tp_nominal_bps"] = float(np.mean(df["ID"] / (df["mt_ms"] / 1000)))
        return out
    b, a = np.polyfit(df["ID"], df["mt_ms"], 1)
    pred = a + b * df["ID"]
    ss_res = float(np.sum((df["mt_ms"] - pred) ** 2))
    ss_tot = float(np.sum((df["mt_ms"] - df["mt_ms"].mean()) ** 2))
    out |= {
        "fitts_a_ms": float(a),
        "fitts_b_ms_per_bit": float(b),
        "fitts_r2": 1 - ss_res / ss_tot if ss_tot > 0 else np.nan,
        "tp_nominal_bps": float(np.mean(df["ID"] / (df["mt_ms"] / 1000))),
    }
    return out


def effective_throughput(trials: pd.DataFrame, min_n: int = 5) -> tuple[float, pd.DataFrame]:
    """Mean effective throughput over conditions (amplitude x size) with >= min_n trials.

    Endpoint deviation along the movement axis dx = -end_along (positive =
    beyond the centre); We = 4.133 * SD(dx), Ae = mean(A + dx).
    """
    df = _valid(trials)
    if df.empty or "cond_id" not in df:
        return np.nan, pd.DataFrame()
    df = df[df["cond_id"] >= 0]
    rows = []
    for cond, g in df.groupby("cond_id"):
        if len(g) < min_n:
            continue
        dx = -g["end_along_deg"]
        we = 4.133 * float(np.std(dx, ddof=1))
        ae = float(np.mean(g["A_deg"] + dx))
        if we <= 0:
            continue
        ide = float(np.log2(ae / we + 1.0))
        mt = float(g["mt_ms"].mean())
        rows.append({"cond_id": int(cond), "n": len(g), "A_nominal_deg": float(g["A_deg"].median()),
                     "W_deg": float(g["W_deg"].median()), "Ae_deg": ae, "We_deg": we, "IDe": ide,
                     "mt_ms": mt, "tp_bps": ide / (mt / 1000)})
    table = pd.DataFrame(rows)
    return (float(table["tp_bps"].mean()) if len(table) else np.nan), table
