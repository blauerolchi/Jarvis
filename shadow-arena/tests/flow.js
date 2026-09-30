// Real-time keyboard-only walkthrough of all menus. Usage: node tests/flow.js
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForTimeout(1200);
  const key = async (k, wait = 180) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
  const st = () => page.evaluate(() => ({ scene: SA.game.scene, ui: SA.game.ui.screen, mode: SA.game.mode, paused: SA.game.paused, phase: SA.game.match && SA.game.match.phase }));
  const log = async (label) => console.log(label.padEnd(28), JSON.stringify(await st()));
  let ok = true;
  const expect = async (label, fn) => { const s = await st(); const pass = fn(s); ok = ok && pass; console.log((pass ? 'PASS ' : 'FAIL ') + label.padEnd(30), JSON.stringify(s)); };

  const menuIdx = () => page.evaluate(() => SA.game.ui.menus.main.index);
  const goCard = async (i) => { // cards are laid out 2 per row: index = row * 2 + col
    const cur = await menuIdx();
    for (let r = Math.floor(cur / 2); r > 0; r--) await key('ArrowUp', 60);
    if (cur % 2) await key('ArrowLeft', 60);
    for (let r = 0; r < Math.floor(i / 2); r++) await key('ArrowDown', 60);
    if (i % 2) await key('ArrowRight', 60);
  };

  await expect('start screen = main menu', (s) => s.scene === 'menu' && s.ui === 'main');
  await goCard(1); await key('Enter', 900);
  await expect('FIGHT -> select', (s) => s.ui === 'select');
  await key('ArrowUp'); await key('ArrowUp'); await key('ArrowUp'); // arena row
  await key('ArrowRight'); await key('Enter');                       // locked arena -> denied
  await expect('locked arena refused', (s) => s.ui === 'select' && s.scene === 'menu');
  await key('ArrowLeft'); await key('Enter', 1200);
  await expect('fight started', (s) => s.scene === 'fight' && s.mode === 'fight');
  await page.waitForTimeout(2200);
  await expect('round running', (s) => s.phase === 'fight');
  await key('Escape');
  await expect('paused', (s) => s.paused);
  await key('Escape');
  await expect('ESC resumes', (s) => !s.paused);
  await key('Escape'); await key('ArrowDown'); await key('ArrowDown'); await key('Enter');   // RESUME, RESTART, MOVE LIST
  await expect('move list open', (s) => s.paused && true);
  const moves = await page.evaluate(() => SA.game.showMoves);
  console.log((moves ? 'PASS ' : 'FAIL ') + 'move list visible'); ok = ok && moves;
  await key('Escape'); await key('ArrowDown'); await key('ArrowDown'); await key('Enter', 1200);  // -> QUIT TO MENU
  await expect('quit to menu', (s) => s.scene === 'menu' && s.ui === 'main');
  await goCard(4); await key('Enter', 1200);
  await expect('training started', (s) => s.scene === 'fight' && s.mode === 'training');
  await key('Escape'); await key('ArrowDown'); await key('ArrowRight');
  const dummy = await page.evaluate(() => SA.game.training.dummy);
  console.log((dummy === 'block' ? 'PASS ' : 'FAIL ') + 'dummy option -> block'.padEnd(30), dummy); ok = ok && dummy === 'block';
  await key('Escape');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD');
  await key('KeyJ', 60); await key('KeyJ', 60); await key('KeyK', 500);
  const blocked = await page.evaluate(() => SA.game.p2.hp);
  console.log('training dummy hp after combo (blocking dummy):', blocked);
  await key('KeyR', 200);
  await key('Escape');
  for (let i = 0; i < 9; i++) await key('ArrowDown', 60);
  await key('Enter', 1200);
  await expect('training -> menu', (s) => s.scene === 'menu');
  const idx = await menuIdx();
  console.log((idx === 4 ? 'PASS ' : 'FAIL ') + 'menu remembers last choice'.padEnd(30), idx); ok = ok && idx === 4;
  await goCard(6); await key('Enter', 400);
  await expect('settings open', (s) => s.ui === 'settings');
  await key('ArrowDown'); await key('ArrowLeft');
  const vol = await page.evaluate(() => SA.Save.data.settings.master);
  console.log((Math.abs(vol - 0.7) < 1e-6 ? 'PASS ' : 'FAIL ') + 'master volume -10%'.padEnd(30), vol); ok = ok && Math.abs(vol - 0.7) < 1e-6;
  await key('ArrowRight');
  await key('Escape', 400);
  await goCard(7); await key('Enter', 400);
  await expect('controls open', (s) => s.ui === 'controls');
  await key('Escape', 300);
  await goCard(5); await key('Enter', 300);
  await expect('profile open', (s) => s.ui === 'profile');
  await key('Escape', 300);
  await goCard(2); await key('Enter', 300);
  await expect('shop open', (s) => s.ui === 'shop');
  await key('ArrowDown'); await key('Enter', 200);           // wood staff (level 1, 250 coins) -> buy with 150 coins fails
  const poorOwns = await page.evaluate(() => SA.Save.owns('wood_staff'));
  await page.evaluate(() => { SA.Save.data.player.coins = 1000; });
  await key('Enter', 200);
  const owns = await page.evaluate(() => SA.Save.owns('wood_staff') && SA.Save.data.player.coins === 750);
  await key('Enter', 200);
  const eq = await page.evaluate(() => SA.Save.data.inventory.equipped.primary);
  const shopOk = !poorOwns && owns && eq === 'wood_staff';
  console.log((shopOk ? 'PASS ' : 'FAIL ') + 'shop buy + equip via keyboard'.padEnd(30), JSON.stringify({ poorOwns, owns, eq })); ok = ok && shopOk;
  await key('ArrowRight', 200);
  const tab = await page.evaluate(() => SA.game.ui.shop.cat);
  console.log((tab === 1 ? 'PASS ' : 'FAIL ') + 'shop tab switch'.padEnd(30), tab); ok = ok && tab === 1;
  await key('Escape', 300);
  await goCard(3); await key('Enter', 300);
  await expect('loadout open', (s) => s.ui === 'loadout');
  await key('Escape', 300);
  await expect('back to main', (s) => s.ui === 'main');
  await goCard(0); await key('Enter', 1200);
  await expect('arena run started', (s) => s.scene === 'fight' && s.mode === 'arena');
  const saved = await page.evaluate(() => localStorage.getItem('shadowArena.save.v1') !== null);
  console.log((saved ? 'PASS ' : 'FAIL ') + 'progress saved to localStorage'); ok = ok && saved;
  if (errors.length) { ok = false; console.log('ERRORS:\n' + errors.join('\n')); }
  console.log(ok ? 'FLOW OK' : 'FLOW FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
