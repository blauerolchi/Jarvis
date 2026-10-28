"""End-to-end: headless game session -> parquet -> analysis -> report -> replay frame."""

import json

import pygame
import pytest

from aimharness.analysis.report import build_report
from aimharness.analysis.summary import analyze_session
from aimharness.data.schema import TABLES
from aimharness.data.store import list_sessions, load_session
from aimharness.game.session import GameSession
from aimharness.inputsrc.scripted import ScriptedInputSource
from aimharness.replay import Replay
from aimharness.scenario import load_all_scenarios
from aimharness.settings import Settings


@pytest.fixture(scope="module")
def recorded(tmp_path_factory):
    root = tmp_path_factory.mktemp("data")
    pygame.init()
    screen = pygame.display.set_mode((640, 360))
    settings = Settings()
    settings.session.countdown_s = 0
    settings.display.fps_cap = 240
    scenarios = {s.id: s for s in load_all_scenarios()}
    paths = []
    for sid in ("gridshot", "strafeshot", "tracking_reactive"):
        sc = scenarios[sid]
        sc.duration_s = 1.0
        src = ScriptedInputSource()
        src.start(None)
        result = GameSession(screen, settings, sc, src, root).run()
        assert not result.aborted
        paths.append(result.path)
    yield root, paths, settings
    pygame.quit()


def test_session_files_follow_schema(recorded):
    root, paths, _ = recorded
    assert len(list_sessions(root)) == 3
    for p in paths:
        meta = json.loads((p / "meta.json").read_text())
        assert meta["input"]["backend"] == "scripted"
        sess = load_session(p)
        for name, cols in TABLES.items():
            assert list(getattr(sess, name).columns) == list(cols)
        assert len(sess.frames) > 20
        assert len(sess.input_events) > 100
        assert sess.frames["t_ns"].is_monotonic_increasing
        assert (sess.frames["t_present_ns"] >= sess.frames["t_ns"]).all()
        assert sess.input_events["t_ns"].is_monotonic_increasing
        assert len(sess.target_frames) > 0


def test_analysis_and_report(recorded):
    root, paths, _ = recorded
    for p in paths:
        summary = analyze_session(p, force=True)
        assert summary["session"] == p.name
        assert summary["mean_fps"] > 0
    tracking = analyze_session(paths[-1])
    assert tracking["on_target_pct"] is not None
    report = build_report(root)
    html = report.read_text(encoding="utf-8")
    assert "__DATA__" not in html and "Aim Harness" in html
    assert (root / "reports" / "latest.html").exists()


def test_replay_renders_a_frame(recorded):
    _, paths, settings = recorded
    rp = Replay(load_session(paths[0]), settings)
    from aimharness.game.render import Renderer

    rp.r = Renderer(pygame.display.get_surface(), 103.0, settings.crosshair)
    rp.t = int(rp.f_t[len(rp.f_t) // 2])
    rp._draw()
