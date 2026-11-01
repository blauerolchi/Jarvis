from pathlib import Path

import pytest

from aimharness.scenario import Scenario, TargetSpec, SpawnSpec, load_all_scenarios, validate
from aimharness.settings import GAME_YAW, MouseSettings, Settings, dumps_settings, load_settings, save_settings

ROOT = Path(__file__).resolve().parents[1]


def test_sensitivity_conversion():
    m = MouseSettings(dpi=800, cm_per_360=34.6)
    counts_per_360 = 34.6 / 2.54 * 800
    assert m.effective_deg_per_count() == pytest.approx(360 / counts_per_360)
    assert m.effective_cm_per_360() == pytest.approx(34.6)
    assert MouseSettings(deg_per_count=0.022).effective_deg_per_count() == 0.022


def test_shipped_example_settings_match_defaults():
    s = load_settings(ROOT / "config" / "settings.example.toml")
    assert s == Settings()


def test_invalid_settings_rejected(tmp_path):
    p = tmp_path / "s.toml"
    p.write_text('[display]\nmode = "huge"\n')
    with pytest.raises(ValueError):
        load_settings(p)


def test_builtin_scenarios_are_valid():
    scenarios = load_all_scenarios()
    ids = {s.id for s in scenarios}
    assert {"gridshot", "microshot", "flick_fitts", "spidershot", "strafeshot", "tracking_smooth", "tracking_reactive"} <= ids


def test_user_scenario_overrides_builtin(tmp_path):
    (tmp_path / "gridshot.toml").write_text('id = "gridshot"\nname = "Mein Gridshot"\nduration_s = 30.0\n'
                                            '[spawn]\npattern = "grid"\ncount = 3\n')
    sc = {s.id: s for s in load_all_scenarios(tmp_path)}["gridshot"]
    assert sc.name == "Mein Gridshot" and sc.duration_s == 30.0


def test_validate_catches_bad_values():
    sc = Scenario(id="x", targets=TargetSpec(radius_m=[2.0], distance_m=[1.0]), spawn=SpawnSpec(pattern="nope"))
    with pytest.raises(ValueError):
        validate(sc)


def test_game_sensitivity_conversion():
    m = MouseSettings(dpi=800, game="cs2", game_sens=1.0)
    assert m.effective_deg_per_count() == pytest.approx(0.022)
    # CS2 1.0 @ 800 DPI is the well-known 51.95 cm/360.
    assert m.effective_cm_per_360() == pytest.approx(51.95, abs=0.01)
    # Valorant uses 0.07 deg/count -> CS2 sens = 3.18 x Valorant sens.
    assert m.game_equivalent("valorant") == pytest.approx(0.022 / 0.07)


@pytest.mark.parametrize("mode", ["cm360", "direct", *GAME_YAW])
def test_switching_sens_mode_keeps_the_sensitivity(mode):
    m = MouseSettings(dpi=1600, cm_per_360=28.0)
    before = m.effective_deg_per_count()
    m.set_sens_mode(mode)
    assert m.sens_mode == mode
    assert m.effective_deg_per_count() == pytest.approx(before, rel=1e-4)
    m.set_sens_mode("cm360")
    assert m.cm_per_360 == pytest.approx(28.0)


@pytest.mark.parametrize("mode", ["cm360", "direct", "valorant"])
def test_scale_sensitivity_in_every_mode(mode):
    m = MouseSettings()
    m.set_sens_mode(mode)
    before = m.effective_deg_per_count()
    m.scale_sensitivity(1.02)
    assert m.effective_deg_per_count() == pytest.approx(before * 1.02)


def test_settings_round_trip(tmp_path):
    s = Settings()
    s.mouse.set_sens_mode("valorant")
    s.mouse.dpi = 1600
    s.display.hfov_deg = 106.0
    s.crosshair.color = "#ffffff"
    s.session.setup_note = 'G Pro "X", 1000 Hz – Pad'
    path = save_settings(s, tmp_path / "config" / "settings.toml")
    assert load_settings(path) == s
    assert "game = \"valorant\"" in dumps_settings(s)


def test_invalid_game_rejected(tmp_path):
    p = tmp_path / "s.toml"
    p.write_text('[mouse]\ngame = "quake9"\ngame_sens = 1.0\n')
    with pytest.raises(ValueError):
        load_settings(p)
