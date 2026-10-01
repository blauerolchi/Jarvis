// Phone (landscape 19.5:9): full-screen wide canvas (no letterbox), the tablet controls scaled up,
// real multitouch through CDP: stick walk + gestures, ATTACK, SHOOT, pause, HUD scale.
// Usage: NODE_PATH=$(npm root -g) node tests/phone.js
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.SA && SA.game);
  const cdp = await ctx.newCDPSession(page);
  const results = [];
  const check = (name, ok, info) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + JSON.stringify(info === undefined ? '' : info)); };
  const info = await page.evaluate(() => { const r = SA.game.canvas.getBoundingClientRect(); return { W: SA.W, phone: SA.Device.isPhone, x: r.left, y: r.top, w: r.width, h: r.height }; });
  check('phone detected, wide logical canvas fills the screen', info.phone && info.W > 2200 && info.w >= 840 && info.h >= 388, info);
  const P = (x, y) => ({ x: info.x + (x / info.W) * info.w, y: info.y + (y / 1080) * info.h });
  const fingers = new Map();
  const send = async (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
  const down = async (id, x, y) => { fingers.set(id, P(x, y)); await send('touchStart'); };
  const move = async (id, x, y) => { fingers.set(id, P(x, y)); await send('touchMove'); };
  const up = async (id) => { const p = fingers.get(id); fingers.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id }] }); };
  const wait = (ms) => page.waitForTimeout(ms);
  await wait(500);
  await page.evaluate(() => { SA.game.startTraining ? SA.game.startTraining() : 0; });
  await wait(1500);
  const geo = await page.evaluate(() => {
    const T = SA.game.touch, g = SA.game; g.p1.reset(-300, 1); g.p2.reset(300, -1);
    const b = Object.fromEntries(T.buttons.map((x) => [x.id, T.geom(x)]));
    return { active: T.active, scale: T.scale, bx: T.stick.bx, by: T.stick.by, b, pause: { x: SA.W - 52, y: 236 } };
  });
  check('touch overlay active, controls scaled for the phone', geo.active && geo.scale >= 1.2, { scale: geo.scale });
  const st = () => page.evaluate(() => { const f = SA.game.p1; return { state: f.state, x: Math.round(f.x), grounded: f.grounded, flip: f.flip && f.flip.kind, paused: SA.game.paused, shot: (f.shootT || 0) > 0 }; });
  // stick: base position = default spot (scaled)
  const SX = 285 * geo.scale, SY = 1080 - (1080 - 790) * geo.scale, R = 165 * geo.scale;
  await down(1, SX, SY); await move(1, SX + R * 0.9, SY); await wait(400);
  let s = await st();
  check('stick right -> run', s.x > -280 && /walk|run|sprint/.test(s.state), s);
  await down(2, geo.b.light.x, geo.b.light.y); await wait(40);
  s = await st();
  check('stick + ATTACK at once', s.state === 'attack', s);
  await up(2); await move(1, SX, SY); await up(1); await wait(600);
  await down(1, SX, SY); await move(1, SX + R * 0.7, SY - R * 0.7); await wait(60);
  s = await st();
  check('stick ↗ -> front flip', s.flip === 'front', s);
  await down(2, geo.b.ranged.x, geo.b.ranged.y); await wait(40);
  s = await st();
  check('SHOOT mid-flip', s.shot, s);
  await up(2); await move(1, SX, SY); await up(1); await wait(1200);
  await down(3, geo.pause.x, geo.pause.y); await wait(40); await up(3); await wait(200);
  s = await st();
  check('pause button at the right edge', s.paused, s);
  const hud = await page.evaluate(() => SA.game.ui.hudK);
  check('HUD scaled up on the phone', hud > 1.2, hud);
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
