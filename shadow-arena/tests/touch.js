// Real multitouch through Chromium's touch pipeline (CDP Input.dispatchTouchEvent -> Pointer Events).
// Joystick + buttons at the same time, 3 fingers, sliding off a hold button, pointercancel, menu taps.
// Usage: NODE_PATH=$(npm root -g) node tests/touch.js [outDir]
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'out');
require('fs').mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.SA && SA.game);
  const cdp = await ctx.newCDPSession(page);
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + JSON.stringify(info === undefined ? '' : info)); };

  // logical (1920x1080) -> page coordinates
  const rect = await page.evaluate(() => { const r = SA.game.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const P = (x, y) => ({ x: rect.x + (x / 1920) * rect.w, y: rect.y + (y / 1080) * rect.h });
  const fingers = new Map();
  const send = async (type) => {
    const touchPoints = type === 'touchCancel' ? [] : [...fingers.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id }));
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  };
  const down = async (id, x, y) => { fingers.set(id, P(x, y)); await send('touchStart'); };
  const move = async (id, x, y) => { fingers.set(id, P(x, y)); await send('touchMove'); };
  // CDP: touchEnd carries the finger(s) being lifted; the others stay down
  const up = async (id) => {
    const p = fingers.get(id);
    fingers.delete(id);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id }] });
  };
  const wait = (ms) => page.waitForTimeout(ms);
  const st = () => page.evaluate(() => {
    const g = SA.game, f = g.p1, T = g.touch;
    return {
      scene: g.scene, ui: g.ui.screen, mode: g.mode, paused: g.paused, state: f.state, move: f.move && f.move.id,
      virtual: [...g.input.virtual].sort().join(','), owned: T.owned.size, stick: T.stick.id !== null, x: Math.round(f.x),
      grounded: f.grounded, crouch: f.isCrouching(), device: g.input.lastDevice, active: T.active,
      block: T.buttons.find((b) => b.id === 'block').pointers.size,
    };
  });

  // --- menu taps work with touch (tap TRAINING card) ---
  await wait(600);
  const card = await page.evaluate(() => { const m = SA.game.ui.menus.main; return m.rect(m.cards.find((c) => c.label === 'TRAINING')); });
  if (card) { await down(1, card.x + card.w / 2, card.y + card.h / 2); await wait(60); await up(1); }
  else { await page.evaluate(() => SA.game.startTraining()); }
  await wait(1500);
  let s = await st();
  check('tap on TRAINING card starts training', s.scene === 'fight' && s.mode === 'training', s);
  await page.evaluate(() => { SA.game.p1.reset(-300, 1); SA.game.p2.reset(300, -1); });
  s = await st();
  check('touch overlay active in fight', s.active && s.device === 'touch', s);
  await page.screenshot({ path: out + '/touch-01-overlay.png' });

  // --- joystick right: walk ---
  await down(1, 270, 800);
  await move(1, 400, 800);
  await wait(400);
  s = await st();
  check('stick right -> walk right', s.virtual === 'right' && s.x > -300, s);

  // --- stick right held + PUNCH simultaneously (second finger) ---
  await down(2, 1702, 858);
  await wait(50);
  s = await st();
  check('stick + PUNCH at the same time', s.state === 'attack' && s.virtual.includes('right') && s.stick, s);
  await up(2);
  await wait(400);

  // --- stick down + PUNCH -> low attack ---
  await move(1, 270, 950);
  await wait(120);
  await down(2, 1702, 858);
  await wait(50);
  s = await st();
  check('stick down + PUNCH -> low attack', s.move === 'crouchJab' || /:low$/.test(s.move || ''), s);
  await up(2);
  await wait(400);

  // --- stick + BLOCK hold + KICK (three fingers) ---
  await move(1, 150, 800);                       // hold back
  await down(2, 1712, 638);                      // BLOCK (hold)
  await wait(120);
  s = await st();
  check('stick + BLOCK held', s.virtual.includes('block') && s.virtual.includes('left') && s.state === 'block', s);
  await down(3, 1484, 936);                      // KICK with a third finger
  await wait(30);
  s = await st();
  check('3 fingers tracked independently', s.owned === 3 && s.stick && s.block === 1, s);
  await up(3);
  await wait(300);

  // --- sliding the BLOCK finger away releases block ---
  await move(2, 1712, 380);
  await wait(60);
  s = await st();
  check('finger leaves BLOCK -> block released', !s.virtual.includes('block') && s.virtual.includes('left'), s);

  // --- sliding from HEAVY onto KICK presses KICK ---
  await up(2);
  await wait(400);
  await down(2, 1502, 728);
  await wait(30);
  const beforeSlide = await page.evaluate(() => SA.game.input.queue.slice());
  await move(2, 1484, 936);
  await wait(10);
  s = await st();
  const slid = await page.evaluate(() => SA.game.touch.owned.get([...SA.game.touch.owned.keys()].find((k) => SA.game.touch.owned.get(k) !== 'stick')));
  check('finger slides from HEAVY to KICK', slid && slid.id === 'kick', { slid: slid && slid.id, beforeSlide });
  await up(2);
  await wait(300);

  // --- jump with stick up (stick finger still the same) ---
  await move(1, 270, 620);
  await wait(120);
  s = await st();
  check('stick up -> jump', !s.grounded || s.state === 'jump' || s.state === 'prejump', s);
  await move(1, 270, 800);
  await wait(700);

  // --- pointercancel releases everything that finger owned ---
  await down(2, 1712, 638);
  await wait(60);
  await send('touchCancel');
  fingers.clear();
  await wait(60);
  s = await st();
  check('pointercancel releases stick + block', s.virtual === '' && s.owned === 0 && !s.stick, s);

  // --- stray touch in the middle never becomes a UI tap ---
  await down(4, 960, 300);
  await wait(30);
  await up(4);
  await wait(60);
  s = await st();
  check('stray touch in fight is swallowed', s.scene === 'fight' && !s.paused && s.owned === 0, s);

  // --- pause button ---
  await down(5, 1860, 178);
  await wait(40);
  await up(5);
  await wait(200);
  s = await st();
  check('pause button pauses', s.paused, s);
  await page.screenshot({ path: out + '/touch-02-pause.png' });
  check('overlay hidden while paused', !s.active, s);

  // --- ranged buttons appear with a gun equipped ---
  await page.evaluate(() => { const g = SA.game; g.paused = false; g.p1.setLoadout({ weapon: 'katana', ranged: 'pistol' }); });
  const labels = await page.evaluate(() => SA.game.touch.visibleButtons().map((b) => SA.game.touch.labelFor(b, SA.game.p1)));
  check('weapon labels on buttons (katana + pistol)', labels.includes('SLASH') && labels.includes('SHOOT') && labels.includes('RELOAD'), labels);
  await down(6, 1312, 806);
  await wait(30);
  await up(6);
  await wait(200);
  const ammo = await page.evaluate(() => SA.game.p1.rangedState.ammo);
  check('SHOOT button fires', ammo === 5, ammo);
  await page.screenshot({ path: out + '/touch-03-weapons.png' });

  // --- portrait: rotate overlay + auto-pause ---
  await page.setViewportSize({ width: 800, height: 1280 });
  await wait(400);
  const portrait = await page.evaluate(() => ({ paused: SA.game.paused, rotate: getComputedStyle(document.getElementById('rotate')).display }));
  check('portrait -> rotate hint + pause', portrait.paused && portrait.rotate !== 'none', portrait);
  await page.screenshot({ path: out + '/touch-04-portrait.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await wait(300);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
