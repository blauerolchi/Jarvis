// Shared Playwright harness: opens the game in manual-step mode and exposes helpers in the page.
const { chromium } = require('playwright');
const path = require('path');

async function openGame() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.SA && SA.game);
  await page.evaluate(() => {
    const g = SA.game;
    g.manual = true;
    g.transition = null; g.fade = 0;
    // T.run(frames, {hold:[...], press:[...]}) steps the simulation deterministically
    window.T = {
      run(n, o) {
        o = o || {};
        for (let i = 0; i < n; i++) {
          g.input.heldActions = new Set(o.hold || []);
          if (i === 0 && o.press) for (const p of o.press) g.input.queue.push(p);
          g.tick();
        }
      },
      training(dummy, arena) {
        g.scene = 'fight';
        g.training.dummy = dummy || 'stand';
        g.setupWorld({ mode: 'training', arena: arena || SA.ARENA_ORDER[0] });
        g.training.infiniteEnergy = false;
        g.p1.energy = 0;
        g.transition = null; g.fade = 0;
      },
      place(x1, x2) {
        g.p1.reset(x1, x2 > x1 ? 1 : -1); g.p2.reset(x2, x2 > x1 ? -1 : 1);
        g.p1.postUpdate(1, g); g.p2.postUpdate(1, g);
      },
      s() { return { p1: g.p1.state, p2: g.p2.state, hp1: g.p1.hp, hp2: g.p2.hp, d: Math.round(Math.abs(g.p1.x - g.p2.x)), combo: g.p1.combo.hits, dmg: g.p1.combo.damage }; },
    };
  });
  return { browser, page, errors };
}
module.exports = { openGame };
