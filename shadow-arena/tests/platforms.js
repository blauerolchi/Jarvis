// One-way platforms: land from above, jump through from below, walk / roll / dash off the edge,
// drop through, fast fall, never stuck, projectiles + shadows, and acceptance test 54:
// ground -> diagonal flip -> low platform -> jump -> high platform -> down air -> hit -> ground.
// Usage: NODE_PATH=$(npm root -g) node tests/platforms.js [outDir]
const { openGame } = require('./harness');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'out');
require('fs').mkdirSync(out, { recursive: true });

(async () => {
  const { browser, page, errors } = await openGame();
  const res = await page.evaluate(() => {
    const g = SA.game;
    const R = {};
    T.training('stand', 'desert_temple');
    const P = SA.Physics.platforms;
    R.layout = P.map((p) => [p.x, p.y, p.w]);
    const low = P.find((p) => p.x > 0 && p.y > -400), lowL = P.find((p) => p.x < 0 && p.y > -400), high = P.find((p) => p.y < -400);
    const f = g.p1;
    const until = (fn, max, o) => { for (let i = 0; i < (max || 120); i++) { if (fn()) return i; T.run(1, o); } return -1; };
    const trace = [];
    const watch = (n, o) => { let maxJump = 0, py = f.y, stuck = 0; for (let i = 0; i < n; i++) { T.run(1, o); maxJump = Math.max(maxJump, Math.abs(f.y - py)); if (Math.abs(f.x) > SA.WALL + 1) stuck++; py = f.y; } return { maxJump, stuck }; };

    // 1. jump up through a platform from below and land on it from above
    T.place(low.x - 40, -900); T.run(3);
    T.run(1, { press: ['gJump'] });
    let sawAbove = false, under = 0;
    for (let i = 0; i < 90; i++) { T.run(1); if (f.y < low.y - 5) sawAbove = true; if (f.vy < 0 && f.y > low.y && f.y < low.y + 200) under++; if (f.grounded && i > 5) break; }
    R.jumpThrough = { sawAbove, under, grounded: f.grounded, onPlat: f.plat === low, y: Math.round(f.y) };

    // 2. standing on the platform: physics keeps the feet on its top
    T.run(20);
    R.stand = { y: Math.round(f.y), grounded: f.grounded, state: f.state };

    // 3. walk off the edge -> falls, lands on the ground, no snap
    let n = until(() => !f.grounded, 200, { hold: ['right'] });
    R.walkOff = { frames: n, state: f.state };
    n = until(() => f.grounded, 120, { hold: ['right'] });
    R.walkOffLand = { frames: n, y: Math.round(f.y), state: f.state };

    // 4. drop through: stand on the platform, press down (gDown) -> falls through to the floor
    T.place(low.x, -900); f.y = low.y; f.plat = low; f.grounded = true; T.run(5);
    T.run(1, { press: ['gDown'] });
    n = until(() => f.grounded && f.plat === null, 90);
    R.drop = { frames: n, y: Math.round(f.y), plat: !!f.plat };

    // 5. fast fall from a jump ignores the platform and falls much faster
    T.place(low.x, -900); T.run(3);
    T.run(1, { press: ['gJump'] });
    until(() => f.vy > 0 && f.y < low.y - 20, 60);
    T.run(1, { press: ['gDown'] });
    T.run(2);
    const vyFast = f.vy;
    n = until(() => f.grounded, 60);
    R.fastFall = { vy: Math.round(vyFast), landedOn: f.plat ? 'plat' : 'ground', frames: n };

    // 6. roll and dash off a platform edge -> airborne, then land
    T.place(low.x + low.w / 2 - 60, -900); f.y = low.y; f.plat = low; f.grounded = true; f.facing = 1; T.run(3);
    T.run(1, { press: ['gRollF'] });
    n = until(() => !f.grounded, 40);
    R.rollOff = { frames: n, state: f.state };
    until(() => f.grounded, 120);
    T.place(lowL.x + lowL.w / 2 - 70, 400); f.y = lowL.y; f.plat = lowL; f.grounded = true; T.run(3);
    R.dashPre = { grounded: f.grounded, state: f.state, y: f.y, dcd: f.dashCd };
    T.run(1, { press: ['gDashF'] });
    n = until(() => !f.grounded, 40);
    R.dashOff = { frames: n, state: f.state };
    until(() => f.grounded, 120);

    // 7. acceptance 54: ground -> diagonal flip onto the low platform -> jump -> high platform -> down air -> hit -> ground
    // the enemy waits on the ground left of the high platform; the flip crosses over it onto the left platform
    T.place(lowL.x + 450, high.x - high.w / 2 - 70); T.run(5);
    const seq = [];
    const mark = (t) => seq.push(t + ':' + f.state + (f.plat ? '@' + Math.round(f.plat.y) : f.grounded ? '@0' : ''));
    T.run(1, { press: ['gFlipF'] });
    let landedLow = until(() => f.grounded && f.st > 2, 120);
    mark('flip');
    // to the platform's right edge, spin jump up and over to the high platform
    until(() => f.x > lowL.x + lowL.w / 2 - 30, 90, { hold: ['right'] });
    T.run(1, { press: ['gJump'], hold: ['right'] });
    let landedHigh = until(() => f.grounded && f.st > 2, 120, { hold: ['right'] });
    mark('jump');
    // walk off toward the enemy and drive a down air attack into it
    f.facing = g.p2.x > f.x ? 1 : -1;
    const dir = f.facing > 0 ? 'right' : 'left';
    until(() => !f.grounded, 120, { hold: [dir] });
    mark('off');
    until(() => Math.abs(f.x - g.p2.x) < 110, 40, { hold: [dir] });
    T.run(1, { press: ['heavy'], hold: ['down'] });
    mark('dive');
    let hit = until(() => f.moveContact === 'hit', 60, { hold: ['down'] });
    n = until(() => f.grounded, 90);
    mark('land');
    R.acceptance54 = { landedLow, landedHigh, hit, ground: f.grounded && !f.plat, seq };
    const motion = watch(120);
    R.noTeleport = motion;

    // 8. camera follows the high tier (the fighter stays on screen)
    T.place(high.x, high.x + 140); f.y = high.y; f.plat = high; f.grounded = true;
    g.p2.y = high.y; g.p2.plat = high; g.p2.grounded = true;
    for (let i = 0; i < 120; i++) T.run(1);
    const sc = g.camera.worldToScreen(f.x, f.y - 250), feet = g.camera.worldToScreen(f.x, f.y);
    R.camera = { head: Math.round(sc.y), feet: Math.round(feet.y), zoom: +g.camera.zoom.toFixed(2) };

    // 9. shadow: on the platform the floor under the fighter is the platform
    R.floor = { onPlat: SA.Physics.floorAt(high.x, high.y - 100), ground: SA.Physics.floorAt(2000, -50) };
    return R;
  });
  await page.evaluate(() => { const g = SA.game; g.manual = false; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/platforms.png' });
  const checks = [
    ['jump through from below, land on top', res.jumpThrough.sawAbove && res.jumpThrough.onPlat && res.jumpThrough.grounded],
    ['standing on a platform keeps the feet on top', res.stand.grounded && res.stand.y === res.layout.find((p) => p[0] > 0 && p[1] > -400)[1]],
    ['walk off the edge -> air -> lands on the ground', res.walkOff.frames > 0 && res.walkOff.state === 'air' && res.walkOffLand.frames > 0 && res.walkOffLand.y === 0],
    ['down on a platform drops through', res.drop.frames > 0 && res.drop.y === 0 && !res.drop.plat],
    ['fast fall: fast and passes the platform', res.fastFall.vy >= 1500 && res.fastFall.landedOn === 'ground'],
    ['roll off the edge -> airborne', res.rollOff.frames >= 0 && res.rollOff.state === 'air'],
    ['dash off the edge -> airborne', res.dashOff.frames >= 0 && res.dashOff.state === 'air'],
    ['acceptance 54: flip -> low platform -> jump -> high platform -> down air hit -> ground', res.acceptance54.landedLow > 0 && res.acceptance54.landedHigh > 0 && res.acceptance54.hit >= 0 && res.acceptance54.ground &&
      /flip:.*@-2/.test(res.acceptance54.seq[0]) && /jump:.*@-5/.test(res.acceptance54.seq[1])],
    ['no teleports / no stuck', res.noTeleport.maxJump < 60 && res.noTeleport.stuck === 0],
    ['camera keeps the high tier on screen', res.camera.head > 0 && res.camera.feet < 1080],
    ['shadow floor = platform under the fighter', res.floor.onPlat < -400 && res.floor.ground === 0],
  ];
  let fail = 0;
  for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fail++; }
  console.log(JSON.stringify(res, null, 0));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  console.log(fail ? `${fail} FAILED` : `ALL ${checks.length} CHECKS PASSED`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
