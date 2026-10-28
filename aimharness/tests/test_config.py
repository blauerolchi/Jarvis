from pathlib import Path

import pytest

from aimharness.scenario import Scenario, TargetSpec, SpawnSpec, load_all_scenarios, validate
from aimharness.settings import MouseSettings, Settings, load_settings

ROOT = Path(__file__).resolve().parents[1]


def test_sensitivity_conversion():
    m = MouseSettings(dpi=800, cm_per_360=34.6)
    counts_per_360 = 34.6 / 2.54 * 800
    assert m.effective_deg_per_count() == pytest.approx(360 / counts_per_360)
    assert m.effective_cm_per_360() == pytest.approx(34.6)
    assert MouseSettings(deg_per_count=0.022).effective_deg_per_count() == 0.022


def test_shipped_settings_file_loads():
    s = load_settings(ROOT / "config" / "settings.toml")
    assert isinstance(s, Settings)
    assert s.data_dir == "data"
    assert s.mouse.dpi == 800


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
