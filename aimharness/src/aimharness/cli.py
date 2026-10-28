"""Command line entry point: ``python -m aimharness <command>``."""

from __future__ import annotations

import argparse
import math
import os
import sys
import time
import webbrowser
from pathlib import Path

from aimharness import __version__
from aimharness.settings import data_root, harness_home, load_settings


def _settings(args):
    settings = load_settings(Path(args.settings) if args.settings else None)
    if getattr(args, "windowed", False):
        settings.display.mode = "windowed"
    return settings


def _scenarios():
    from aimharness.scenario import load_all_scenarios

    return load_all_scenarios(harness_home() / "scenarios")


def cmd_play(args) -> int:
    from aimharness.game.app import App

    settings = _settings(args)
    return App(settings, _scenarios(), data_root(settings), args.backend).run(args.scenario)


def cmd_list(args) -> int:
    for sc in _scenarios():
        print(f"{sc.id:20s} {sc.name:28s} {sc.duration_s:5.0f}s  {sc.scoring:8s} {sc.description}")
    return 0


def cmd_sessions(args) -> int:
    from aimharness.data.store import list_sessions, read_meta

    settings = _settings(args)
    for p in list_sessions(data_root(settings)):
        m = read_meta(p)
        q = m.get("quick_stats", {})
        flag = " (abgebrochen)" if m.get("aborted") else ""
        print(f"{p.name:45s} score={q.get('score', '-'):>6}  {m['input']['backend']:9s}{flag}")
    return 0


def _fmt(v, nd=1):
    return "-" if v is None or (isinstance(v, float) and not math.isfinite(v)) else f"{v:.{nd}f}"


def cmd_analyze(args) -> int:
    from aimharness.analysis.summary import analyze_all, analyze_session
    from aimharness.data.store import resolve_session

    settings = _settings(args)
    root = data_root(settings)
    if args.session:
        rows = [analyze_session(resolve_session(root, args.session), force=True)]
    else:
        df = analyze_all(root, force=args.force)
        rows = df.to_dict("records") if not df.empty else []
    if not rows:
        print("Keine Sessions gefunden.")
        return 1
    for s in rows:
        print(f"\n{s['session']}  [{s['scenario']}]  backend={s['backend']}  "
              f"fps={_fmt(s.get('mean_fps'), 0)}  input={_fmt(s.get('input_rate_hz'), 0)} Hz")
        if s["scoring"] == "click":
            print(f"  score={s.get('score')}  acc={_fmt(100 * (s.get('accuracy') or 0))}%  trials={_fmt(s.get('n_trials'), 0)}"
                  f"  RT={_fmt(s.get('rt_median_ms'), 0)} ms  MT={_fmt(s.get('mt_median_ms'), 0)} ms"
                  f"  overshoot={_fmt(100 * s['overshoot_rate'] if s.get('overshoot_rate') is not None else None)}%"
                  f"  corr={_fmt(s.get('corrections_mean'), 2)}  TPe={_fmt(s.get('tp_effective_bps'), 2)} bit/s")
        else:
            print(f"  on-target={_fmt(s.get('on_target_held_pct'))}%  lag={_fmt(s.get('track_lag_ms'), 0)} ms"
                  f"  reversal={_fmt(s.get('reversal_response_ms'), 0)} ms  gain={_fmt(s.get('track_gain'), 2)}")
        print(f"  jitter={_fmt(s.get('jitter_rms_arcmin'), 2)}'  peak={_fmt(s.get('jitter_peak_hz'), 0)} Hz")
    return 0


def cmd_report(args) -> int:
    from aimharness.analysis.report import build_report

    settings = _settings(args)
    path = build_report(data_root(settings), force=args.force)
    print(f"Report: {path}")
    if not args.no_open:
        webbrowser.open(path.as_uri())
    return 0


def cmd_replay(args) -> int:
    from aimharness.data.store import load_session, resolve_session
    from aimharness.replay import Replay

    settings = _settings(args)
    sess = load_session(resolve_session(data_root(settings), args.session))
    Replay(sess, settings, args.speed).run()
    return 0


def cmd_inputtest(args) -> int:
    """Measure the raw input report rate and counts without opening the game."""
    import numpy as np

    from aimharness.inputsrc import create_input_source

    if sys.platform != "win32":
        print("inputtest benötigt Windows (Raw Input).")
        return 1
    settings = _settings(args)
    src = create_input_source("rawinput")
    src.start(None)
    print(f"Maus {args.seconds:g} s lang in Kreisen bewegen und ein paar Mal klicken ...")
    events = []
    end = time.perf_counter() + args.seconds
    try:
        while time.perf_counter() < end:
            events += src.poll([])
            time.sleep(0.01)
        events += src.poll([])
    finally:
        src.stop()
    moving = [e for e in events if e.dx or e.dy]
    if len(moving) < 10:
        print("Zu wenige Bewegungsereignisse empfangen.")
        return 1
    t = np.array([e.t_ns for e in moving], dtype=np.int64)
    dt = np.diff(t) / 1e6
    dt = dt[dt < 50]
    dx = sum(e.dx for e in moving)
    dy = sum(e.dy for e in moving)
    path = sum(math.hypot(e.dx, e.dy) for e in moving)
    devices = {e.device for e in events}
    clicks = sum(1 for e in events if e.buttons & 0x1)
    print(f"Ereignisse:          {len(events)} ({len(moving)} mit Bewegung), Geräte: {len(devices)}")
    print(f"Report-Intervall:    Median {np.median(dt):.3f} ms  -> ca. {1000 / np.median(dt):.0f} Hz")
    print(f"Intervall p5/p95:    {np.percentile(dt, 5):.3f} / {np.percentile(dt, 95):.3f} ms")
    print(f"Weg:                 {path:.0f} Counts = {path / settings.mouse.dpi * 2.54:.1f} cm bei {settings.mouse.dpi} DPI")
    print(f"Netto dx/dy:         {dx} / {dy}")
    print(f"Linksklicks:         {clicks}")
    print(f"Diagnose:            {src.diagnostics()}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="aimharness", description="Zeigebewegungen erfassen und auswerten.")
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("--settings", help="Pfad zur settings.toml (Standard: ./config/settings.toml)")
    sub = p.add_subparsers(dest="command")

    sp = sub.add_parser("play", help="Trainer starten (Standard)")
    sp.add_argument("scenario", nargs="?", help="Szenario-ID direkt starten")
    sp.add_argument("--backend", choices=["auto", "rawinput", "pygame"], help="Eingabe-Backend überschreiben")
    sp.add_argument("--windowed", action="store_true", help="im Fenster statt Vollbild")
    sp.set_defaults(func=cmd_play)

    sub.add_parser("list", help="Szenarien auflisten").set_defaults(func=cmd_list)
    sub.add_parser("sessions", help="aufgezeichnete Sessions auflisten").set_defaults(func=cmd_sessions)

    sp = sub.add_parser("analyze", help="Sessions auswerten und Kennzahlen ausgeben")
    sp.add_argument("session", nargs="?", help="Session (Name, Präfix oder 'latest'); ohne Angabe alle")
    sp.add_argument("--force", action="store_true", help="zwischengespeicherte Auswertungen neu berechnen")
    sp.set_defaults(func=cmd_analyze)

    sp = sub.add_parser("report", help="HTML-Report erzeugen")
    sp.add_argument("--force", action="store_true", help="alle Sessions neu auswerten")
    sp.add_argument("--no-open", action="store_true", help="Report nicht im Browser öffnen")
    sp.set_defaults(func=cmd_report)

    sp = sub.add_parser("replay", help="Session visuell wiedergeben")
    sp.add_argument("session", nargs="?", default="latest")
    sp.add_argument("--speed", type=float, default=1.0)
    sp.add_argument("--windowed", action="store_true")
    sp.set_defaults(func=cmd_replay)

    sp = sub.add_parser("inputtest", help="Raw-Input-Rate und Counts messen (Windows)")
    sp.add_argument("--seconds", type=float, default=5.0)
    sp.set_defaults(func=cmd_inputtest)
    return p


def main(argv: list[str] | None = None) -> int:
    os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command is None:
        args.scenario, args.backend, args.windowed = None, None, False
        return cmd_play(args)
    return args.func(args)
