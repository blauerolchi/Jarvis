// Real multitouch through Chromium's touch pipeline (CDP Input.dispatchTouchEvent -> Pointer Events).
// Fixed joystick + gesture recognizer (jump / flips / rolls / flicks, relative to the enemy), 4 buttons,
// ATTACK double tap, 3 fingers, sliding between buttons, pointercancel, menu taps, acceptance test 53.
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
      flip: f.flip && f.flip.kind, rollDir: f.rollDir, rm: f.rm && Math.round(f.rm.dist), fastFall: !!f.fastFall, vy: Math.round(f.vy),
      power: f.move ? (f.move.power || 0.5) : 0, facing: f.facing,
    };
  });

  const B = { attack: [1716, 868], kick: [1474, 952], shoot: [1520, 712], special: [1792, 600] };
  const SX = 285, SY = 790, R = 165;
  const tap = async (id, b, ms) => { await down(id, b[0], b[1]); await wait(ms || 30); await up(id); };
  const place = (x1, x2) => page.evaluate(([a, b]) => {
    const g = SA.game; g.p1.reset(a, a < b ? 1 : -1); g.p2.reset(b, a < b ? -1 : 1);
    g.p1.ctrl.clear(); g.p1.dashCd = 0; g.p1.mobility = 100;
  }, [x1, x2]);
  const settle = async () => { for (let i = 0; i < 40; i++) { const q = await st(); if (q.grounded && /idle|crouch|walk/.test(q.state)) return; await wait(50); } };
  // a stick gesture: push to (ux, uy) * R, hold, come back to the centre and lift
  const gesture = async (ux, uy, holdMs) => {
    await down(1, SX, SY);
    await move(1, SX + ux * R, SY + uy * R);
    await wait(holdMs || 50);
    const s = await st();
    await move(1, SX, SY);
    await up(1);
    return s;
  };
  const flick = async (dir) => {
    await down(1, SX, SY);
    await move(1, SX + dir * R, SY);
    await wait(20);
    await move(1, SX, SY);
    await up(1);
  };
  const D = Math.SQRT1_2;
  // per-frame recorder (CDP round trips are slower than the moves themselves)
  await page.evaluate(() => {
    window.__log = [];
    const rec = () => { const f = SA.game.p1; if (f) window.__log.push({ s: f.state, flip: f.flip && f.flip.kind, rm: f.rm ? Math.round(f.rm.dist) : 0 }); if (window.__log.length > 600) window.__log.shift(); requestAnimationFrame(rec); };
    requestAnimationFrame(rec);
  });
  const logSince = () => page.evaluate(() => { const l = window.__log; window.__log = []; return l; });

  // --- menu taps work with touch (tap TRAINING card) ---
  await wait(600);
  const card = await page.evaluate(() => { const m = SA.game.ui.menus.main; return m.rect(m.cards.find((c) => c.label === 'TRAINING')); });
  if (card) { await down(1, card.x + card.w / 2, card.y + card.h / 2); await wait(60); await up(1); }
  else { await page.evaluate(() => SA.game.startTraining()); }
  await wait(1500);
  let s = await st();
  check('tap on TRAINING card starts training', s.scene === 'fight' && s.mode === 'training', s);
  await place(-300, 300);
  s = await st();
  check('touch overlay active in fight', s.active && s.device === 'touch', s);
  const btns = await page.evaluate(() => SA.game.touch.visibleButtons().map((b) => b.id).join(','));
  check('only ATTACK / KICK / SPECIAL (+SHOOT with a gun)', btns === 'light,kick,special', btns);
  await page.screenshot({ path: out + '/touch-01-overlay.png' });

  // --- joystick right: walk ---
  await down(1, SX, SY);
  await move(1, SX + 120, SY);
  await wait(400);
  s = await st();
  check('stick right -> walk right', s.virtual === 'right' && s.x > -300, s);

  // --- fixed joystick: the base never moves, the knob stays inside the radius ---
  const stickInfo = () => page.evaluate(() => { const t = SA.game.touch.stick; return { bx: t.bx, by: t.by, x: Math.round(t.x), y: Math.round(t.y), mag: +(t.mag || 0).toFixed(2), analog: +SA.game.input.analogX.toFixed(2) }; });
  const base0 = await stickInfo();
  await move(1, 820, 650);
  await wait(40);
  const far = await stickInfo();
  await move(1, SX + R * 0.3, SY); await wait(30);
  const walk = await stickInfo();
  await move(1, SX + R * 0.7, SY); await wait(30);
  const run = await stickInfo();
  await move(1, SX + R * 0.95, SY); await wait(30);
  const sprint = await stickInfo();
  await move(1, SX + R * 0.06, SY); await wait(30);
  const dead = await stickInfo();
  const deadV = await page.evaluate(() => [...SA.game.input.virtual].join(','));
  await up(1);
  await wait(30);
  await down(1, 600, 900);
  await wait(30);
  const away = await stickInfo();
  check('joystick base fixed, knob clamped to radius', far.bx === base0.bx && far.by === base0.by && away.bx === base0.bx && Math.hypot(far.x, far.y) <= R + 1, { base0, far, away });
  check('joystick zones: deadzone / walk / run / sprint', deadV === '' && walk.mag > 0.12 && walk.mag < 0.5 && run.mag >= 0.5 && run.mag < 0.85 && sprint.mag >= 0.85, { dead, deadV, walk, run, sprint });
  await up(1);
  await wait(30);
  const released = await page.evaluate(() => { const t = SA.game.touch.stick; return { id: t.id, x: t.x, y: t.y, v: [...SA.game.input.virtual].join(',') }; });
  check('joystick resets on lift', released.id === null && released.x === 0 && released.y === 0 && released.v === '', released);

  // --- stick + ATTACK simultaneously ---
  await settle(); await place(-300, 300);
  await down(1, SX, SY);
  await move(1, SX + 120, SY);
  await wait(150);
  await down(2, ...B.attack);
  await wait(50);
  s = await st();
  check('stick + ATTACK at the same time', s.state === 'attack' && s.virtual.includes('right') && s.stick, s);
  await up(2);
  await wait(400);
  await move(1, SX, SY + R);
  await wait(120);
  await down(2, ...B.attack);
  await wait(50);
  s = await st();
  check('stick down + ATTACK -> low attack', s.move === 'crouchJab' || /low|down|sweep/i.test(s.move || ''), s);
  await up(2);
  await up(1);
  await wait(500);

  // --- ATTACK double tap = heavy ---
  await settle(); await place(-500, 300);
  await tap(2, B.attack, 10);
  await wait(20);
  await tap(2, B.attack, 10);
  await wait(60);
  s = await st();
  check('ATTACK double tap -> heavy (cancels the light)', s.state === 'attack' && s.power >= 0.8, s);
  await wait(700);

  // --- movement gestures (relative to the enemy on the right) ---
  await settle(); await place(-500, 400);
  s = await gesture(0, -1, 70);
  check('stick up -> acrobatic spin jump', s.flip === 'spin' || (!s.grounded && s.state === 'flip'), s);
  await settle(); await place(-500, 400);
  s = await gesture(D, -D, 70);
  check('stick ↗ -> front flip', s.flip === 'front', s);
  await settle(); await place(-300, 400);
  s = await gesture(-D, -D, 70);
  check('stick ↖ -> backflip', s.flip === 'back', s);
  await settle(); await place(-500, 400);
  s = await gesture(D, D, 40);
  check('stick ↘ -> roll toward the enemy', s.state === 'roll' && s.rollDir === 1, s);
  await settle(); await place(-300, 400);
  s = await gesture(-D, D, 40);
  check('stick ↙ -> roll away', s.state === 'roll' && s.rollDir === -1, s);
  await settle(); await place(-500, 400);
  await flick(1);
  await wait(30);
  s = await st();
  check('quick flick toward -> dash', s.state === 'dash', s);
  await settle(); await place(-500, 400); await wait(400);
  await logSince();
  await flick(1); await wait(10); await flick(1);
  await wait(200);
  let lg = await logSince();
  check('double flick toward -> long dash', lg.some((e) => e.s === 'dash' && e.rm > 300), Math.max(...lg.map((e) => e.rm)));
  await settle(); await place(-200, 400); await wait(400);
  await flick(-1);
  await wait(30);
  s = await st();
  check('quick flick away -> backstep', s.state === 'evade', s);
  await settle(); await place(-200, 400); await wait(400);
  await logSince();
  await flick(-1); await wait(10); await flick(-1);
  await wait(200);
  lg = await logSince();
  check('double flick away -> handspring (flik-flak)', lg.some((e) => e.flip === 'hand'), lg.map((e) => e.s + (e.flip || '')).filter((v, i, a) => a[i - 1] !== v));

  // sides switched: the same screen direction now means the opposite
  await settle(); await place(300, -300);
  s = await gesture(D, -D, 70);
  check('sides switched: stick ↗ (away from the enemy) -> backflip', s.flip === 'back' && s.facing === -1, s);
  await settle(); await place(300, -300);
  s = await gesture(-D, -D, 70);
  check('sides switched: stick ↖ (toward) -> front flip', s.flip === 'front', s);

  // --- air: flick = air dash, down = fast fall ---
  await settle(); await place(-500, 400);
  await gesture(0, -1, 30);
  await wait(220);
  await flick(1);
  await wait(20);
  s = await st();
  check('air flick -> air dash', s.state === 'airdash', s);
  await settle(); await place(-500, 400);
  await gesture(0, -1, 30);
  await wait(150);
  s = await gesture(0, 1, 60);
  check('air down -> fast fall', s.fastFall && s.vy > 1200, s);
  await settle();

  // --- acceptance 53: → run, ↗ front flip, ATTACK air slash, ↘ roll after landing, ATTACK roll attack, ← ← backflip, SHOOT in it ---
  await page.evaluate(() => { const g = SA.game; g.p1.setLoadout({ weapon: g.p1.weapon.id, ranged: 'pistol' }); });
  await place(-700, 600);
  const seq = [];
  const note = async (tag) => { const q = await st(); seq.push(tag + ':' + q.state + (q.flip ? '/' + q.flip : '') + (q.move ? '/' + q.move : '')); return q; };
  await down(1, SX, SY);
  await move(1, SX + R, SY);
  await wait(450);
  const runS = await note('run');
  await move(1, SX + R * D, SY - R * D);
  await wait(60);
  const flipS = await note('flip');
  await wait(170);
  await tap(2, B.attack, 20);
  await wait(40);
  const airS = await note('airslash');
  for (let i = 0; i < 40; i++) { const q = await st(); if (q.grounded) break; await wait(25); }
  await move(1, SX, SY); await wait(20);
  await move(1, SX + R * D, SY + R * D);
  await wait(60);
  const rollS = await note('roll');
  await wait(170);
  await tap(2, B.attack, 20);
  await wait(60);
  const rollAtk = await note('rollatk');
  await move(1, SX, SY);
  await up(1);
  await wait(500);
  const fac = (await st()).facing;
  await flick(-fac); await wait(10); await flick(-fac);
  await wait(60);
  const bf = await note('backflip');
  await wait(150);
  await tap(2, B.shoot, 20);
  await wait(60);
  const shot = await note('shoot');
  check('acceptance 53: run -> front flip -> air slash -> roll -> roll attack -> backflip -> shoot',
    /run|sprint/.test(runS.state) && flipS.flip === 'front' && airS.state === 'attack' && rollS.state === 'roll' && rollAtk.state === 'attack' &&
    (bf.flip === 'hand' || bf.flip === 'back') && (shot.state === 'attack' || shot.flip) , seq);
  await wait(800);

  // --- three fingers ---
  await settle();
  await down(1, SX, SY); await move(1, SX - 100, SY);
  await down(2, ...B.kick);
  await down(3, ...B.special);
  await wait(30);
  s = await st();
  check('3 fingers tracked independently', s.owned === 3 && s.stick, s);
  await up(3); await up(2);
  await wait(300);

  // --- sliding from ATTACK onto KICK presses KICK ---
  await down(2, ...B.attack);
  await wait(30);
  await move(2, ...B.kick);
  await wait(10);
  const slid = await page.evaluate(() => SA.game.touch.owned.get([...SA.game.touch.owned.keys()].find((k) => SA.game.touch.owned.get(k) !== 'stick')));
  check('finger slides from ATTACK to KICK', slid && slid.id === 'kick', { slid: slid && slid.id });
  await up(2);
  await wait(300);

  // --- pointercancel releases everything ---
  await down(2, ...B.kick);
  await wait(60);
  await send('touchCancel');
  fingers.clear();
  await wait(60);
  s = await st();
  check('pointercancel releases stick + buttons', s.virtual === '' && s.owned === 0 && !s.stick, s);

  // --- stray touch in the middle never becomes a UI tap ---
  await down(4, 960, 300);
  await wait(30);
  await up(4);
  await wait(60);
  s = await st();
  check('stray touch in fight is swallowed', s.scene === 'fight' && !s.paused && s.owned === 0, s);

  // --- SHOOT button with a gun ---
  await settle(); await place(-300, 300);
  const ammo0 = await page.evaluate(() => { const f = SA.game.p1; f.rangedState.ammo = f.rangedWeapon.magazine; f.rangedState.cd = 0; return f.rangedState.ammo; });
  await tap(6, B.shoot, 30);
  await wait(300);
  const ammo = await page.evaluate(() => SA.game.p1.rangedState.ammo);
  check('SHOOT button fires', ammo === ammo0 - 1, { ammo0, ammo });
  await page.screenshot({ path: out + '/touch-03-weapons.png' });

  // --- pause button ---
  await down(5, 1868, 236);
  await wait(40);
  await up(5);
  await wait(200);
  s = await st();
  check('pause button pauses', s.paused, s);
  check('overlay hidden while paused', !s.active, s);

  // --- portrait: rotate overlay + auto-pause ---
  await page.setViewportSize({ width: 800, height: 1280 });
  await wait(400);
  const portrait = await page.evaluate(() => ({ paused: SA.game.paused, rotate: getComputedStyle(document.getElementById('rotate')).display }));
  check('portrait -> rotate hint + pause', portrait.paused && portrait.rotate !== 'none', portrait);
  await page.setViewportSize({ width: 1280, height: 800 });
  await wait(300);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
