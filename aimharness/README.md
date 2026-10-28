# Aim Harness

Forschungs-Harness zum Erfassen und Auswerten der eigenen Zeigebewegungen in einer
Zielumgebung im Stil von Aim Labs. Der Trainer zeichnet jede Mausbewegung als Rohdaten auf.
Die Analyse macht daraus ein Profil deiner Motorik: Reaktionszeit, Fitts-Durchsatz,
Overshoot, Nachkorrekturen, Mikrojitter und Tracking-Verhalten. Ein HTML-Report zeigt,
wie sich das Profil über die Sessions entwickelt.

Das Harness misst und visualisiert nur. Es erzeugt keine Eingaben und steuert nichts.

## Voraussetzungen

- Windows 10/11 (Raw Input). Unter Linux/macOS läuft es mit framegenauen Zeitstempeln.
- Python 3.11 bis 3.13, **64-Bit**
- Maus mit 500–8000 Hz Pollingrate empfohlen

## Installation

Am einfachsten per Doppelklick auf `start.bat`. Beim ersten Start legt es eine virtuelle
Umgebung in `.venv` an und installiert die Abhängigkeiten.

Manuell (PowerShell, im Ordner `aimharness`):

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
python -m aimharness
```

Falls für deine Python-Version kein `pygame`-Wheel existiert: `pip install pygame-ce`
statt `pygame`. Das Harness nutzt nur die gemeinsame API.

## Erste Schritte

1. **Sensitivität einstellen** in `config/settings.toml`: `dpi` und `cm_per_360` so wählen
   wie in deinem Spiel. Alternativ `deg_per_count` direkt setzen (z. B. CS2 Sens 1.0 → `0.022`).
2. **Raw Input prüfen:**
   ```powershell
   python -m aimharness inputtest
   ```
   Die Maus fünf Sekunden kreisen lassen. Ausgegeben werden Pollingrate, Intervall-Streuung
   und zurückgelegte Counts. Stimmt der Weg in cm nicht, ist der DPI-Wert falsch.
3. **Spielen:** `python -m aimharness` öffnet das Menü. Ein Szenario direkt starten:
   `python -m aimharness play flick_fitts`
4. **Auswerten:** `python -m aimharness report` erzeugt `data/reports/report_<Zeit>.html`
   und öffnet ihn im Browser. Im Menü und auf dem Ergebnisbildschirm geht das mit **R**.

## Bedienung

| Ort | Taste | Aktion |
|---|---|---|
| Menü | Pfeiltasten, 1–9, Mausrad | Szenario wählen |
| Menü | Enter, Doppelklick | Starten |
| Menü, Ergebnis | R | Report erzeugen und öffnen |
| Session | Linksklick | Schießen (Tracking: halten) |
| Session | P | Pause (auch automatisch bei Fokusverlust) |
| Session | Esc | Beenden. Die Daten werden gespeichert und als „abgebrochen“ markiert |
| Session | F3 | FPS-Anzeige |
| Ergebnis | Enter / M | Nochmal / Menü |

## Szenarien

| ID | Inhalt | Wofür |
|---|---|---|
| `gridshot` | 3 statische Ziele auf 5×4-Raster | Tempo, Zielwechsel |
| `microshot` | kleine Ziele, kurze Distanzen | Präzision, Feinkorrektur |
| `flick_fitts` | 1 Ziel, Distanz 8/16/32° × 2 Größen, balanciert, zufällige Vorlaufzeit | Reaktionszeit, Fitts-Kurve, effektiver Durchsatz |
| `spidershot` | Wechsel zwischen Mittelziel und Ziel in zufälliger Richtung | Flicks hin und zurück |
| `strafeshot` | bewegte Ziele mit ADAD-Richtungswechseln | Flicks auf bewegte Ziele |
| `tracking_smooth` | weiche Zielbewegung, LMB halten | Tracking, Nachlauf |
| `tracking_reactive` | abrupte Wechsel in beiden Achsen | Reaktion auf Richtungswechsel |

### Eigene Szenarien

TOML-Dateien in `scenarios/` (im Projektordner) werden zusätzlich geladen. Bei gleicher `id`
ersetzen sie ein eingebautes Szenario.

```toml
id = "mein_flick"
name = "Mein Flick"
description = "Große Distanzen, kleine Ziele"
duration_s = 60.0
scoring = "click"            # click | tracking
seed = 0                     # 0 = zufällig; fester Wert = reproduzierbare Zielfolge

[targets]
distance_m = [10.0]          # Kandidaten, pro Ziel wird einer gezogen
radius_m = [0.15, 0.3]
color = "#26b4ff"
hp = 1

[spawn]
pattern = "amplitude"        # grid | random | amplitude
count = 1                    # gleichzeitige Ziele
amplitudes_deg = [20.0, 40.0]
yaw_range_deg = [-60.0, 60.0]
pitch_range_deg = [-20.0, 25.0]
delay_ms = [300.0, 900.0]    # Vorlaufzeit vor jedem neuen Ziel
timeout_s = 3.0              # 0 = Ziele bleiben
center_return = false        # Spidershot-Wechsel zum Mittelziel
min_separation_deg = 4.0
grid_cols = 5
grid_rows = 5

[motion]
kind = "static"              # static | strafe
speed_mps = [2.5, 4.5]
reverse_interval_s = [0.4, 1.2]
accel_mps2 = 25.0
vertical = false
vertical_speed_mps = [0.5, 1.5]
```

Beim Muster `amplitude` ist jede Kombination aus Distanz × Radius × Entfernung eine
Bedingung. Die Bedingungen kommen in gemischten Blöcken gleich oft vor. Daraus berechnet die
Analyse den effektiven Durchsatz nach ISO 9241-411.

## Aufgezeichnete Daten

Jede Session landet in `data/sessions/<Datum>_<Uhrzeit>_<Szenario>/`. Alle Zeiten sind
Nanosekunden relativ zum Session-Start auf der `perf_counter`-Uhr (QueryPerformanceCounter).
Winkel sind in Grad, Yaw liegt in [-180, 180).

| Datei | Inhalt (eine Zeile pro …) |
|---|---|
| `input_events.parquet` | Maus-Report: `t_ns`, OS-Zeit `t_msg_ms`, `dx`/`dy` in Counts, Button-Flags, Gerät, Crosshair-Richtung nach dem Event, Frame |
| `frames.parquet` | Frame: Start- und Present-Zeit, dt, gerenderte Crosshair-Richtung, Summen der Deltas, LMB, Ziel unter dem Crosshair |
| `target_frames.parquet` | Frame × Ziel: Richtung, Entfernung, Radius, Winkelradius, Bildschirmposition und -radius |
| `targets.parquet` | Ziel: Spawn, erster sichtbarer Frame, Ende, Ergebnis (`killed`/`expired`/`session_end`), Bedingung |
| `shots.parquet` | Klick: Zeit, Richtung, Treffer, Zielfehler (Winkel und x/y-Komponenten), Winkelradius |
| `target_events.parquet` | Ereignis: Spawn, sichtbar, Treffer, Kill, Ablauf, Richtungswechsel, Pause |
| `meta.json` | Szenario, Sensitivität, Display, FOV, Backend, Seed, Pausen, Plattform, Kurzstatistik |
| `summary.json`, `trials.parquet` | Ergebnis der Analyse (Cache; `analyze --force` bzw. `report --force` berechnet neu) |

Die Parquet-Dateien lassen sich direkt mit pandas, Polars, R oder DuckDB lesen:

```python
import pandas as pd
ev = pd.read_parquet("data/sessions/<session>/input_events.parquet")
```

## Analyse

`python -m aimharness analyze` zeigt die Kennzahlen pro Session in der Konsole.
`python -m aimharness report` erzeugt den interaktiven Report: Szenario-Filter, Verlauf über
Sessions, Bewegungsprofil, Verteilungen, Tabellen nach Schwierigkeit und Trainingshinweise.

Ein **Durchgang** beginnt, sobald das Ziel sichtbar ist und der vorherige Treffer erfolgt ist.
Er endet mit dem Treffer-Klick oder wenn das Ziel abläuft. Die Bewegung wird auf 1 kHz
umgerechnet. In Pausen ohne Mausreports bleibt die Position stehen, damit kein künstliches
Driften entsteht.

| Kennzahl | Definition |
|---|---|
| Reaktionszeit | erster Frame mit sichtbarem Ziel → Bewegungsbeginn (nur bei Zielen, die nach dem letzten Treffer erschienen sind) |
| Bewegungsbeginn | letzter Zeitpunkt vor der Geschwindigkeitsspitze unter 5 % der Spitze (≥ 4 °/s), 30-Hz-Tiefpass |
| Bewegungszeit (MT) | Bewegungsbeginn → Treffer-Klick |
| Primärbewegung, Gain | bis zum ersten Geschwindigkeitsminimum nach der Spitze; Gain = zurückgelegter Anteil der Distanz |
| Overshoot | wie weit das Crosshair entlang der Anfangsrichtung über das Zielzentrum hinausgeht (zielrelativ, auch für bewegte Ziele); Rate = Anteil der Durchgänge über den Zielrand |
| Nachkorrekturen | weitere Geschwindigkeitsspitzen nach der Primärbewegung (≥ 8 % der Spitze bzw. 8 °/s) |
| Fitts | Regression MT = a + b · ID mit ID = log2(A/W + 1); effektiver Durchsatz mit We = 4,133 · SD der Endpunkte |
| Mikrojitter | RMS der 6–25-Hz-bandpassgefilterten Position in Haltephasen (< 20 °/s), Spektrum per Welch |
| Tracking | Zeit auf dem Ziel, RMS-Fehler, Nachlauf (Kreuzkorrelation), Gain, Reaktion auf Richtungswechsel |

## Replay

```powershell
python -m aimharness replay              # letzte Session
python -m aimharness replay 2026-10-28_19 --speed 0.25 --windowed
```

Das Replay zeigt die aufgezeichneten Frames mit der Crosshair-Spur der letzten 350 ms sowie
Treffern (grün) und Fehlschüssen (rot).

Tasten: Leertaste Pause · ←/→ Frame bzw. 2 s · ↑/↓ Tempo · N/B nächster/vorheriger Treffer ·
T Spur · Pos1 Anfang · Klick auf die Zeitleiste springt.

## Messgenauigkeit und Grenzen

- **Zeitstempel:** Ein eigener Thread empfängt `WM_INPUT` und stempelt jeden Report beim
  Empfang mit QueryPerformanceCounter. Damit bleiben die native Pollingrate und die zeitliche
  Auflösung der Reports erhalten. Python kann den Thread kurz verzögern; das GIL-Intervall
  ist dafür auf 0,2 ms gesenkt. Die OS-Zeit (`t_msg_ms`) wird zum Abgleich mitgespeichert.
- **Displaylatenz** (Render → Bildschirm) ist nicht enthalten. „Sichtbar“ bedeutet: Der
  Frame mit dem Ziel wurde an den Compositor übergeben. Für Vergleiche über die Zeit ist das
  unerheblich, solange Monitor und Einstellungen gleich bleiben. Die Bildwiederholrate deshalb
  in `setup_note` festhalten.
- **Schüsse** werden mit der Crosshair-Richtung zum Zeitpunkt des Klicks ausgewertet, also nach
  allen vorherigen Maus-Reports. Die Zielpositionen stammen aus dem zuletzt angezeigten Frame,
  also aus dem, was du gesehen hast.
- **Raw Input und SDL:** Windows erlaubt pro Prozess nur ein Raw-Input-Ziel für Mäuse. Das
  Harness schaltet deshalb den Relative Mode und das Auto-Capture von SDL ab, versteckt den
  Cursor und hält ihn per `ClipCursor` im Fenster. Die Registrierung wird in jedem Frame
  geprüft und bei Bedarf wiederhergestellt; der Report warnt, falls das passiert ist.
  Mausbeschleunigung („Zeigerpräzision verbessern“) wirkt nicht auf Raw Input.
- **pygame-Backend** (Linux/macOS oder `--backend pygame`): Die Deltas sind korrekt, die
  Zeitstempel aber nur framegenau. Report und Hinweise kennzeichnen solche Sessions.
- **Bildrate:** Der Software-Renderer schafft je nach CPU einige hundert fps bei 1080p.
  `fps_cap` begrenzt die Rate; den Mittelwert und das 99. Perzentil der Frame-Zeit zeigt der Report.

## Projektstruktur

```
aimharness/
├── config/settings.toml          Benutzereinstellungen
├── scenarios/                    eigene Szenarien (optional)
├── data/                         Sessions und Reports (wird angelegt)
├── src/aimharness/
│   ├── cli.py                    Kommandozeile
│   ├── settings.py, scenario.py  Konfiguration
│   ├── mathutil.py               Winkel, Kamera, Projektion
│   ├── inputsrc/                 Raw Input (Windows), pygame, Skript-Eingabe für Tests
│   ├── game/                     Ziele, Renderer, Session-Schleife, Menü
│   ├── data/                     Schema, Recorder, Session-Speicher
│   ├── analysis/                 Kinematik, Durchgänge, Fitts, Jitter, Tracking, Report
│   ├── replay.py                 Wiedergabe
│   └── scenarios/*.toml          eingebaute Szenarien
└── tests/                        pytest (inkl. Headless-Durchlauf)
```

## Tests

```powershell
pip install -e ".[dev]"
pytest
```

Die Tests prüfen Mathematik, Konfiguration, Ziellogik und das Speicherlayout der
Win32-Strukturen. Die Analyse wird an Bewegungen mit bekanntem Overshoot, bekannter
Reaktionszeit und bekannten Korrekturen geprüft. Ein Headless-Durchlauf (SDL-Dummy-Treiber)
geht von der Spielsession über die Parquet-Dateien bis zum Report.
