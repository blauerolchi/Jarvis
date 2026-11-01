"""Settings screen and sensitivity sandbox, driven headless."""

import pygame
import pytest

from aimharness.game import sandbox
from aimharness.game.settings_menu import SettingsMenu, display_changed, snapshot
from aimharness.game.sound import Sounds
from aimharness.settings import Settings, load_settings


@pytest.fixture
def screen():
    pygame.init()
    yield pygame.display.set_mode((1280, 720))
    pygame.quit()


@pytest.fixture
def menu(screen, tmp_path):
    return SettingsMenu(screen, Settings(), tmp_path / "settings.toml", open_sandbox=lambda: None)


def test_every_field_can_be_changed_reset_and_saved(menu):
    s = menu.settings
    for _ in range(3):  # visible fields change with the sensitivity mode (field 0)
        for i in range(1, len(menu.fields())):
            f = menu.fields()[i]
            menu.sel = i
            for direction in (1, 1, -1):
                menu.change(f, direction)
                menu.change(f, direction, big=True)
                s.mouse.effective_deg_per_count()  # always a valid sensitivity
            assert menu.value_text(f)
            menu.reset(f)
        menu.change(menu.fields()[0], 1)  # next sensitivity mode
    assert menu._save()
    assert load_settings(menu.path) == s


def test_text_entry_validates_ranges(menu):
    dpi = next(f for f in menu.fields() if f.title(menu.settings) == "DPI")
    assert menu.commit_edit(dpi, "1600")
    assert menu.settings.mouse.dpi == 1600
    assert not menu.commit_edit(dpi, "5")
    assert not menu.commit_edit(dpi, "abc")
    assert menu.settings.mouse.dpi == 1600
    cm = next(f for f in menu.fields() if f.title(menu.settings) == "cm/360")
    assert menu.commit_edit(cm, "31,5")  # German decimal comma
    assert menu.settings.mouse.cm_per_360 == 31.5
    color = next(f for f in menu.fields() if f.kind == "color")
    assert menu.commit_edit(color, "FFAA00")
    assert menu.settings.crosshair.color == "#ffaa00"
    assert not menu.commit_edit(color, "#xyz")


def test_sens_mode_switch_keeps_sensitivity_and_shows_game_field(menu):
    s = menu.settings
    before = s.mouse.effective_deg_per_count()
    mode = menu.fields()[0]
    menu.change(mode, 1)  # cm/360 -> CS2
    assert s.mouse.sens_mode == "cs2"
    assert s.mouse.effective_deg_per_count() == pytest.approx(before, rel=1e-4)
    titles = [f.title(s) for f in menu.fields()]
    assert "CS2-Sensitivität" in titles and "cm/360" not in titles


def test_menu_draws_and_leaves_with_escape(menu, monkeypatch):
    menu.settings.session.setup_note = "Testmaus"
    pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_DOWN, mod=0))
    pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_ESCAPE, mod=0))
    assert menu.run() is True
    assert menu.path.exists()
    for i in range(len(menu.fields())):  # every row visible at least once (scrolling)
        menu.sel = i
        menu._draw("")


def test_display_changed():
    a = Settings()
    b = snapshot(a)
    b.crosshair.gap = 9
    assert not display_changed(a, b)
    b.display.mode = "windowed"
    assert display_changed(a, b)


def test_sandbox_runs_and_adjusts_sensitivity(screen, monkeypatch):
    s = Settings()
    before = s.mouse.effective_deg_per_count()
    frames = []

    def flip():
        frames.append(1)
        if len(frames) == 1:
            pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_PLUS, mod=0))
        elif len(frames) == 5:
            pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_ESCAPE, mod=0))

    monkeypatch.setattr(pygame.display, "flip", flip)
    sandbox.run_sandbox(screen, s, "scripted", Sounds(False, 0.0))
    assert len(frames) == 5
    assert s.mouse.effective_deg_per_count() == pytest.approx(before * 1.02)
