import numpy as np
import pandas as pd

from aimharness.analysis.fitts import effective_throughput, fitts_fit
from aimharness.analysis.kinematics import hold_aware_interp
from aimharness.analysis.summary import session_summary
from aimharness.analysis.trials import build_trials


def test_overshoot_and_correction_detected(click_session_factory):
    # Visible at 100 ms, onset at 300 ms, primary flick overshoots 20 -> 21.5 deg,
    # corrective movement back to 20 deg, click at 800 ms. Target radius 1 deg.
    sess = click_session_factory(
        segments=[(300, 250, 0.0, 21.5), (600, 150, 21.5, 20.0)],
        target_yaw=20.0, ang_radius=1.0, t_visible_ms=100, t_click_ms=800,
    )
    trials = build_trials(sess)
    assert len(trials) == 1
    t = trials.iloc[0]
    assert t["stimulus"]
    assert 195 <= t["rt_ms"] <= 240
    assert abs(t["A_deg"] - 20.0) < 0.05
    assert abs(t["overshoot_deg"] - 1.5) < 0.1
    assert t["overshoot_beyond_edge"]
    assert 1.05 <= t["primary_gain"] <= 1.10
    assert t["n_corrections"] >= 1
    assert 450 <= t["mt_ms"] <= 510
    assert 50 <= t["verify_ms"] <= 200
    assert abs(t["end_err_deg"]) < 0.05


def test_undershoot_without_overshoot(click_session_factory):
    sess = click_session_factory(
        segments=[(250, 220, 0.0, 17.0), (520, 160, 17.0, 20.0)],
        target_yaw=20.0, ang_radius=1.0, t_visible_ms=50, t_click_ms=760,
    )
    t = build_trials(sess).iloc[0]
    assert t["overshoot_deg"] < 0.05
    assert not t["overshoot_beyond_edge"]
    assert 0.8 <= t["primary_gain"] <= 0.9
    assert t["n_corrections"] >= 1


def test_session_summary_contains_core_metrics(click_session_factory):
    sess = click_session_factory(
        segments=[(300, 250, 0.0, 20.2)], target_yaw=20.0, ang_radius=1.0, t_visible_ms=100, t_click_ms=650,
    )
    summary, trials = session_summary(sess)
    assert summary["n_trials"] == 1
    assert summary["rt_median_ms"] is not None
    assert summary["overshoot_rate"] == 0.0
    assert summary["scoring"] == "click"


def test_fitts_fit_recovers_parameters():
    rng = np.random.default_rng(1)
    rows = []
    for _ in range(200):
        a = rng.choice([8.0, 16.0, 32.0])
        w = rng.choice([1.0, 2.0])
        idx = np.log2(a / w + 1)
        rows.append({"outcome": "killed", "no_movement": False, "is_home": False, "A_deg": a, "W_deg": w,
                     "ID": idx, "mt_ms": 120 + 90 * idx + rng.normal(0, 10), "cond_id": int(a) * 10 + int(w),
                     "end_along_deg": rng.normal(0, w / 4)})
    trials = pd.DataFrame(rows)
    fit = fitts_fit(trials)
    assert abs(fit["fitts_a_ms"] - 120) < 15
    assert abs(fit["fitts_b_ms_per_bit"] - 90) < 6
    assert fit["fitts_r2"] > 0.9
    tp, table = effective_throughput(trials)
    assert len(table) == 6
    assert np.isfinite(tp) and tp > 0


def test_hold_aware_interp_does_not_invent_drift():
    ms = 1_000_000
    t = np.array([0, 1, 2, 300, 301], dtype=np.int64) * ms
    v = np.array([0.0, 1.0, 2.0, 3.0, 4.0])
    grid = np.arange(0, 302, 1, dtype=np.int64) * ms
    out = hold_aware_interp(grid, t, v, gap_ns=5 * ms)
    # During the idle gap the position must stay at the last reported value.
    assert np.allclose(out[3:290], 2.0)
    assert out[-1] == 4.0
