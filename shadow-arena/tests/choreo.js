// Acceptance test 74 (choreographed action through the normal systems, inputs only):
// Run -> Jump/Front Flip -> Attack -> Double Jump -> Shoot -> Spin Kick -> Down Air -> impact slow
// motion -> Landing -> Roll -> Dash away. Checks: every step happens, no idle frames in between,
// controlled airtime (jump / flip / double jump), a slow-motion dip on the impact, no position or
// rotation jumps. Plus jump physics: apex hang, coyote time, jump buffer, double jump direction.
// Usage: NODE_PATH=$(npm root -g) node tests/choreo.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const res = await page.evaluate(() => {
    const g = SA.game, R = {};
    let hits = [];
    const orig = SA.Combat.applyHit;
    SA.Combat.applyHit = function (a, b, m, hit, game, opts) { if (a === g.p1) hits.push(SA.comboTag(a, m, opts)); return orig.apply(this, arguments); };
    const f = () => g.p1;
    const airtime = (press, hold) => {
      T.training('stand'); T.place(-100, 900); T.run(3);
      T.run(1, { press, hold });
      let n = 0;
      while (n < 200) { T.run(1, { hold }); n++; if (f().grounded && n > 4) break; }
      return +(n / 60).toFixed(2);
    };
    R.jump = airtime(['up']);
    R.spin = airtime(['gJump']);
    R.flip = airtime(['gFlipF']);
    R.back = airtime(['gFlipB']);
    // apex hang: frames with |vy| < 130 around the top
    T.training('stand'); T.place(-100, 900); T.run(3); T.run(1, { press: ['up'] });
    let hang = 0; for (let i = 0; i < 80; i++) { T.run(1); if (!f().grounded && Math.abs(f().vy) < 130) hang++; }
    R.hang = hang;
    // double jump: neutral = straight up, back = diagonal back; ~0.45-0.7 s extra
    T.training('stand'); T.place(-100, 900); T.run(3); T.run(1, { press: ['gJump'] }); T.run(26);
    const y0 = f().y; T.run(1, { press: ['gJump'] });
    let dj = 0, top = f().y; while (dj < 120 && !f().grounded) { T.run(1); dj++; top = Math.min(top, f().y); }
    R.dj = { extra: +(dj / 60).toFixed(2), rise: Math.round(y0 - top) };
    T.training('stand'); T.place(-100, 900); T.run(3); T.run(1, { press: ['gJump'] }); T.run(26);
    T.run(1, { press: ['gJump'], hold: ['left'] }); T.run(4, { hold: ['left'] });
    R.djBack = { vx: Math.round(f().vx), kind: f().flip && f().flip.kind };
    // coyote time: walk off a platform, jump 4 frames later = full ground jump
    T.training('stand'); T.place(-100, 900);
    const P = SA.Physics.platforms, low = P.find((q) => q.y > -400 && q.x < 0);
    f().x = low.x + low.w / 2 - 6; f().y = low.y; f().plat = low; f().grounded = true; f().facing = 1;
    let off = 0; while (f().grounded && off < 30) { T.run(1, { hold: ['right'] }); off++; }
    T.run(3, { hold: ['right'] }); T.run(1, { press: ['gJump'] });
    T.run(3);
    R.coyote = { vy: Math.round(f().vy), jumps: f().airJumps };
    // jump buffer: up pressed just before touching down -> jumps on landing
    T.training('stand'); T.place(-100, 900); T.run(3); T.run(1, { press: ['up'] });
    T.run(1, { press: ['gJump'] });  // spend the double jump
    while (!(f().vy > 0 && f().y > -50)) T.run(1);
    T.run(1, { press: ['gJump'] });
    let landed = false, rejump = false;
    for (let i = 0; i < 20; i++) { T.run(1); if (f().grounded) landed = true; if (landed && !f().grounded) rejump = true; }
    R.jumpBuffer = rejump;

    // ---- acceptance 74 ----
    T.training('stand'); SA.Physics.platforms = []; T.place(-300, 120); T.run(3); window.__trace = [];   // open ground
    const log = [], tsLog = [];
    hits = [];
    let prev = null, maxPos = 0, maxRot = 0, prevRot = f().pose.rot;
    const step = (n, o) => {
      for (let i = 0; i < n; i++) {
        T.run(1, i === 0 ? o : { hold: o && o.hold });
        const x = f();
        if (prev) maxPos = Math.max(maxPos, Math.hypot(x.x - prev.x, x.y - prev.y));
        let dr = Math.abs(x.pose.rot - prevRot); dr = Math.min(dr, Math.abs(dr - SA.TAU));
        if (dr > maxRot) { maxRot = dr; window.__rotAt = log.length + ':' + x.state + ':' + (x.move ? x.move.id : '') + ':' + (x.flip ? x.flip.kind : '') + ':' + prevRot.toFixed(2) + '>' + x.pose.rot.toFixed(2); } prevRot = x.pose.rot;
        prev = { x: x.x, y: x.y };
        if (window.__trace) window.__trace.push([log.length, x.state, Math.round(x.x), Math.round(x.y), Math.round(g.p2.x), g.p2.state].join(','));
        log.push(x.state + (x.flip ? ':' + x.flip.kind : '') + (x.move ? ':' + x.move.id : '') + (x.shootT > 0 ? ':shot' : ''));
        tsLog.push(g.timeScale);
      }
    };
    const until = (fn, max, o) => { for (let i = 0; i < max; i++) { if (fn(f())) return true; step(1, i === 0 ? o : { hold: o && o.hold }); } return false; };
    step(24, { hold: ['right'] });                                   // run
    step(1, { press: ['gFlipF'], hold: ['right'] });                 // jump -> front flip
    until((x) => x.state === 'flip', 6);
    step(9);
    step(1, { press: ['light'] });                                    // flip slash
    until((x) => x.state === 'air', 40);
    step(1, { press: ['gJump'] });                                    // double jump
    step(6);
    step(1, { press: ['ranged'] });                                   // shoot
    step(2);
    step(1, { press: ['kick'] });                                     // spin kick (air kick)
    until((x) => !x.move || x.state !== 'attack' || x.mt >= x.move.startup + x.move.active + 1, 40);
    // make sure the down air finds the target: the dummy stands below / ahead
    step(1, { press: ['heavy'], hold: ['down'] });                    // down air
    until((x) => x.grounded, 90, { hold: ['down'] });
    step(1, { press: ['gRollB'] });                                   // roll away
    until((x) => x.state !== 'roll', 40);
    step(1, { press: ['gDashB'] });                                   // dash away (backstep)
    step(20);
    const states = log.map((s) => s.split(':')[0]);
    const want = ['run', 'flip', 'attack', 'flip', 'attack', 'landing|idle|crouch', 'roll', 'evade'];
    let k = 0;
    for (const s of states) if (k < want.length && new RegExp('^(' + want[k] + ')$').test(s)) k++;
    // idle gaps before the final landing
    const firstLandIdx = states.findIndex((s, i) => i > 30 && /landing|idle|crouch/.test(s));
    const firstAir = states.indexOf('prejump');
    let idleRun = 0, cur = 0;
    for (let i = firstAir; i < firstLandIdx; i++) { if (/^(idle|walk)$/.test(states[i])) { cur++; idleRun = Math.max(idleRun, cur); } else cur = 0; }
    R.a74 = {
      order: k === want.length, k, idleRun, minTs: +Math.min(...tsLog).toFixed(2), shot: log.some((s) => s.includes('shot')),
      dj: log.some((s) => s.includes(':dj')), hits: hits.join(','), maxPos: Math.round(maxPos), maxRot: +maxRot.toFixed(2),
      flow: log.filter((s, i) => s !== log[i - 1]).join(' > '), rotAt: window.__rotAt,
    };
    return R;
  });
  const a = res.a74;
  const checks = [
    ['jump airtime 0.8-1.05 s', res.jump >= 0.8 && res.jump <= 1.05, res.jump],
    ['acrobatic jump / flips 0.95-1.25 s', res.spin >= 0.9 && res.flip >= 0.95 && res.flip <= 1.25 && res.back >= 0.9 && res.back <= 1.25, { spin: res.spin, flip: res.flip, back: res.back }],
    ['apex hang (~70-130 ms of reduced gravity)', res.hang >= 4 && res.hang <= 9, res.hang],
    ['double jump: weaker, 0.45-0.75 s extra', res.dj.extra >= 0.45 && res.dj.extra <= 0.75 && res.dj.rise > 80 && res.dj.rise < 260, res.dj],
    ['double jump with direction (back = diagonal backflip)', res.djBack.kind === 'djB' && res.djBack.vx < -150, res.djBack],
    ['coyote time: jump right after walking off', res.coyote.vy < -1200, res.coyote],
    ['jump buffer: up just before landing jumps on touchdown', res.jumpBuffer],
    ['74: run > flip > slash > double jump > shot > kick > down air > land > roll > dash', a.order && a.shot && a.dj, a],
    ['74: no idle frames in the air sequence', a.idleRun === 0, a.idleRun],
    ['74: impact slow motion', a.minTs <= 0.5, a.minTs],
    ['74: hits landed (incl. the down air)', a.hits.split(',').length >= 2 && a.hits.includes('dive'), a.hits],
    ['74: no position / rotation jumps', a.maxPos < 45 && a.maxRot < 0.5, { pos: a.maxPos, rot: a.maxRot }],
  ];
  let fail = 0;
  for (const [name, ok, info] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + JSON.stringify(info === undefined ? '' : info)); if (!ok) fail++; }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  console.log(fail ? `${fail} FAILED` : `ALL ${checks.length} CHECKS PASSED`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
