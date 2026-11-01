"""Rule-based training hints derived from the latest session of a scenario."""

from __future__ import annotations

import math
from statistics import median


def _num(d: dict, key: str) -> float:
    v = d.get(key)
    return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else math.nan


def _baseline(history: list[dict], key: str) -> float:
    vals = [_num(h, key) for h in history[-5:]]
    vals = [v for v in vals if math.isfinite(v)]
    return median(vals) if vals else math.nan


def recommendations(latest: dict, history: list[dict]) -> list[dict]:
    """``history``: earlier summaries of the same scenario (oldest first)."""
    out: list[dict] = []

    def add(level: str, title: str, text: str) -> None:
        out.append({"level": level, "title": title, "text": text})

    if latest.get("timestamp_quality") == "frame":
        add("warning", "Zeitstempel nur framegenau",
            "Diese Session lief mit dem pygame-Backend. Reaktionszeit, Kinematik und Jitter sind nur "
            "eingeschränkt aussagekräftig. Unter Windows das Raw-Input-Backend verwenden.")
    dpc, base_dpc = _num(latest, "deg_per_count"), _baseline(history, "deg_per_count")
    if math.isfinite(dpc) and math.isfinite(base_dpc) and base_dpc > 0 and abs(dpc / base_dpc - 1) > 0.01:
        add("info", "Sensitivität geändert",
            f"{base_dpc:.4f} → {dpc:.4f}°/count ({dpc / base_dpc - 1:+.0%}) gegenüber den letzten Sessions. "
            "Kennzahlen vor und nach der Änderung sind nur eingeschränkt vergleichbar; die Motorik braucht "
            "einige Sessions zur Anpassung.")
    fov, base_fov = _num(latest, "hfov_deg"), _baseline(history, "hfov_deg")
    if math.isfinite(fov) and math.isfinite(base_fov) and abs(fov - base_fov) >= 1:
        add("info", "Sichtfeld geändert",
            f"{base_fov:.0f}° → {fov:.0f}°. Zielgrößen und Abstände wirken auf dem Bildschirm anders; "
            "Vergleiche mit früheren Sessions sind eingeschränkt.")
    rereg = _num(latest, "rawinput_reregistrations")
    if math.isfinite(rereg) and rereg > 0:
        add("warning", "Raw-Input-Registrierung unterbrochen",
            f"Ein anderes Programm oder SDL hat die Raw-Input-Registrierung {rereg:.0f}-mal übernommen. "
            "Sie wurde jeweils im nächsten Frame wiederhergestellt; einzelne Maus-Reports können fehlen.")
    fps = _num(latest, "mean_fps")
    if math.isfinite(fps) and fps < 144:
        add("warning", "Niedrige Bildrate",
            f"Durchschnittlich {fps:.0f} fps. Für saubere Messungen mindestens 144 fps anstreben "
            "(kleinere Auflösung oder fps_cap anpassen).")

    score, base_score = _num(latest, "score"), _baseline(history, "score")
    if math.isfinite(base_score) and base_score > 0 and math.isfinite(score):
        change = score / base_score - 1
        if change >= 0.05:
            add("good", "Fortschritt", f"Score {change:+.0%} gegenüber dem Median der letzten Sessions.")
        elif change <= -0.10:
            add("info", "Schwächere Session",
                f"Score {change:+.0%} gegenüber dem Median der letzten Sessions. Müdigkeit oder "
                "Aufwärmen prüfen, bevor du Rückschlüsse ziehst.")

    if latest.get("scoring") == "click":
        rate = _num(latest, "overshoot_rate")
        if math.isfinite(rate) and rate > 0.30:
            add("warning", "Häufiges Überschießen",
                f"{rate:.0%} der Flicks schießen über den Zielrand hinaus. Kontrolliert abbremsen: "
                "Microshot oder Spidershot mit Fokus auf Präzision statt Tempo. Bleibt der Wert hoch, "
                "die Sensitivität prüfen.")
        gain, corr = _num(latest, "primary_gain_median"), _num(latest, "corrections_mean")
        if math.isfinite(gain) and gain < 0.85 and math.isfinite(corr) and corr >= 1.0:
            add("warning", "Systematisches Unterschießen",
                f"Die Primärbewegung erreicht im Median nur {gain:.0%} der Distanz, danach folgen "
                f"{corr:.1f} Nachkorrekturen. Flick (Fitts-Design) mit großen Distanzen trainieren und "
                "bewusst bis ins Ziel ziehen.")
        elif math.isfinite(corr) and corr > 1.5:
            add("info", "Viele Nachkorrekturen",
                f"Im Mittel {corr:.1f} Korrekturbewegungen pro Ziel. Ein sauberer erster Flick spart Zeit.")
        misses, verify = _num(latest, "misses_per_kill"), _num(latest, "verify_median_ms")
        if math.isfinite(misses) and misses > 0.5:
            hint = (" Du klickst oft unmittelbar beim Erreichen des Ziels; ein kurzer Bestätigungsmoment hilft."
                    if math.isfinite(verify) and verify < 40 else "")
            add("warning", "Viele Fehlschüsse", f"{misses:.2f} Fehlschüsse pro Treffer.{hint}")
        rt = _num(latest, "rt_median_ms")
        if math.isfinite(rt) and rt > 300:
            add("info", "Reaktionszeit",
                f"Median {rt:.0f} ms bis zum Bewegungsbeginn. Flick (Fitts-Design) mit zufälliger "
                "Vorlaufzeit misst und trainiert genau diesen Anteil.")
    else:
        lag = _num(latest, "track_lag_ms")
        if math.isfinite(lag) and lag > 120:
            add("warning", "Nachlauf beim Tracking",
                f"Das Crosshair folgt dem Ziel mit etwa {lag:.0f} ms Verzögerung. Tracking (smooth) "
                "mit Fokus auf vorausschauendes Mitziehen.")
        rr = _num(latest, "reversal_response_ms")
        if math.isfinite(rr) and rr > 250:
            add("info", "Reaktion auf Richtungswechsel",
                f"Median {rr:.0f} ms bis zur Gegenbewegung. Tracking (reaktiv) trainiert das gezielt.")
        g = _num(latest, "track_gain")
        if math.isfinite(g) and (g < 0.85 or g > 1.15):
            what = "zu langsam (Untersteuern)" if g < 0.85 else "zu stark (Übersteuern)"
            add("info", "Geschwindigkeitsanpassung", f"Die Mausgeschwindigkeit ist im Verhältnis zum Ziel {what}: Gain {g:.2f}.")

    jit, peak = _num(latest, "jitter_rms_arcmin"), _num(latest, "jitter_peak_hz")
    if math.isfinite(jit):
        peak_txt = f", Spektralspitze bei {peak:.0f} Hz" if math.isfinite(peak) else ""
        add("info", "Mikrojitter",
            f"RMS {jit:.2f} Bogenminuten in Haltephasen ({_num(latest, 'jitter_rms_counts'):.1f} Counts){peak_txt}. "
            "Vergleichswert für Griff, Mauspad und Ermüdung.")
    return out
