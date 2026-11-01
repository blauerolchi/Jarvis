"""Micro-jitter: small involuntary crosshair motion while (nearly) holding still.

Physiological tremor shows up mostly between ~6 and 25 Hz. Hold phases are
samples where the 4 Hz low-passed crosshair speed is below ``hold_dps``; the
6-25 Hz band-passed position during those phases is the jitter signal.
Requires sub-frame timestamps (raw input backend) for meaningful spectra.
"""

from __future__ import annotations

import numpy as np
from scipy import signal

from aimharness.analysis.kinematics import FS, angular_speed, bandpass, crosshair_on_grid, lowpass, time_grid
from aimharness.analysis.trials import pause_intervals
from aimharness.data.store import SessionData

BAND = (6.0, 25.0)


def jitter_metrics(sess: SessionData, hold_dps: float = 20.0) -> dict:
    inp = sess.input_events[~sess.input_events["paused"]]
    out = {"jitter_rms_arcmin": np.nan, "jitter_rms_counts": np.nan, "jitter_peak_hz": np.nan,
           "hold_fraction": np.nan, "psd_f": [], "psd": []}
    if len(inp) < 200:
        return out
    grid = time_grid(int(inp["t_ns"].iloc[0]), int(inp["t_ns"].iloc[-1]))
    cy, cp = crosshair_on_grid(inp, grid)
    hold = lowpass(angular_speed(cy, cp), 4.0) < hold_dps
    for a, b in pause_intervals(sess):
        hold &= ~((grid >= a) & (grid <= b))
    x = cy * np.cos(np.radians(cp))
    jx, jy = bandpass(x, *BAND), bandpass(cp, *BAND)
    j = np.hypot(jx, jy)[hold]
    if len(j) < 100:
        return out
    rms = float(np.sqrt(np.mean(j ** 2)))
    dpc = float(sess.meta["mouse"]["deg_per_count_effective"])
    out |= {"jitter_rms_arcmin": rms * 60.0, "jitter_rms_counts": rms / dpc,
            "hold_fraction": float(hold.mean())}

    # Average Welch spectra over contiguous hold segments of >= 0.5 s.
    edges = np.flatnonzero(np.diff(np.r_[0, hold.astype(int), 0]))
    nper = 256
    spectra = []
    for s, e in zip(edges[::2], edges[1::2]):
        if e - s >= 2 * nper:
            f, px = signal.welch(jx[s:e], fs=FS, nperseg=nper)
            _, py = signal.welch(jy[s:e], fs=FS, nperseg=nper)
            spectra.append(px + py)
    if spectra:
        psd = np.mean(spectra, axis=0)
        band = (f >= BAND[0]) & (f <= BAND[1])
        out |= {"jitter_peak_hz": float(f[band][np.argmax(psd[band])]),
                "psd_f": f[f <= 40].tolist(), "psd": psd[f <= 40].tolist()}
    return out
