// Headless smoke test: loads index.html from file://, collects errors, drives menus & a fight.
// Usage: NODE_PATH=$(npm root -g) node tests/smoke.js [outDir]
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'out');
require('fs').mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/01-menu.png' });

  const key = async (k, hold = 60) => { await page.keyboard.down(k); await page.waitForTimeout(hold); await page.keyboard.up(k); };
  await key('Enter');                       // FIGHT -> select
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/02-select.png' });
  await key('Enter');                       // start fight
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '/03-round.png' });
  await page.waitForTimeout(1500);
  // some player actions
  for (const k of ['KeyD', 'KeyJ', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'KeyW', 'KeyL']) { await key(k, 50); await page.waitForTimeout(120); }
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await key('KeyJ', 40); await page.waitForTimeout(70); await key('KeyJ', 40); await page.waitForTimeout(70); await key('KeyK', 40);
  await page.waitForTimeout(250);
  await page.screenshot({ path: out + '/04-fight.png' });
  await key('F2'); await key('F1');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/05-debug.png' });
  await key('F2'); await key('F1');
  await key('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/06-pause.png' });
  const state = await page.evaluate(() => ({
    scene: SA.game.scene, mode: SA.game.mode, p1: SA.game.p1.state, p2: SA.game.p2.state,
    hp: [SA.game.p1.hp, SA.game.p2.hp], phase: SA.game.match.phase, fps: SA.game.fps,
  }));
  console.log(JSON.stringify(state));
  console.log(errors.length ? errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
