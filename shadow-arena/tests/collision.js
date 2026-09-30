// Close-combat acceptance tests: body collision, jitter, point-blank hits, cross-ups, corners, dash/roll,
// fighters of different sizes. Usage: NODE_PATH=$(npm root -g) node tests/collision.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };

  await page.evaluate(() => {
    const g = SA.game;
    // p2 is driven directly by the test: hold set + presses, the dummy AI does nothing
    T.setup = (o) => {
      o = o || {};
      g.training.tryItem = o.weapon || null;
      T.training('stand', 'desert_temple');
      g.training.infiniteHp = false;
      g.ai2.update = () => {};
      if (o.p2weapon) g.p2.setLoadout({ weapon: o.p2weapon });
      if (o.p2scale) { g.p2.look.scale = o.p2scale; g.p2.look.bulk = o.p2bulk || 1; }
      T.place(o.x1 === undefined ? -300 : o.x1, o.x2 === undefined ? 300 : o.x2);
    };
    T.step = (n, p1hold, p2hold, p1press, p2press) => {
      const log = [];
      for (let i = 0; i < n; i++) {
        g.p2.ctrl.hold = new Set(p2hold || []);
        if (i === 0 && p2press) for (const a of p2press) g.p2.ctrl.press(a);
        T.run(1, { hold: p1hold || [], press: i === 0 ? p1press : null });
        log.push({ x1: g.p1.x, x2: g.p2.x, y1: g.p1.y, f1: g.p1.facing, f2: g.p2.facing, s1: g.p1.state, s2: g.p2.state });
      }
      return log;
    };
    T.minSep = () => SA.Physics.minDistance(g.p1, g.p2);
    // hurtbox overlap of the two torsos (should never be deep)
    T.bodyOverlap = () => {
      const a = g.p1, b = g.p2;
      return (a.body.w + b.body.w) / 2 - Math.abs(a.x - b.x);
    };
  });

  // TEST 1: player walks straight into a standing enemy
  const t1 = await page.evaluate(() => {
    T.setup({ x1: -250, x2: 60 });
    const log = T.step(150, ['right'], []);
    const minD = Math.min(...log.map((l) => Math.abs(l.x2 - l.x1)));
    const tail = log.slice(-40);
    // jitter = direction reversals of p1 while pressing forward
    let rev = 0;
    for (let i = 2; i < tail.length; i++) {
      const d0 = tail[i - 1].x1 - tail[i - 2].x1, d1 = tail[i].x1 - tail[i - 1].x1;
      if (d0 * d1 < -0.01) rev++;
    }
    const gap = tail.map((l) => l.x2 - l.x1);
    return { minD: Math.round(minD), sep: Math.round(T.minSep()), rev, gapRange: +(Math.max(...gap) - Math.min(...gap)).toFixed(2), pushed: Math.round(log[log.length - 1].x2 - 60) };
  });
  check('T1 walk into enemy: never inside', t1.minD >= t1.sep - 2, t1);
  check('T1 walk into enemy: no jitter', t1.rev === 0 && t1.gapRange < 1.5, t1);

  // TEST 2: both walk into each other
  const t2 = await page.evaluate(() => {
    T.setup({ x1: -300, x2: 300 });
    const log = T.step(150, ['right'], ['left']);
    const minD = Math.min(...log.map((l) => Math.abs(l.x2 - l.x1)));
    const tail = log.slice(-40);
    let rev = 0;
    for (let i = 2; i < tail.length; i++) {
      for (const k of ['x1', 'x2']) {
        const d0 = tail[i - 1][k] - tail[i - 2][k], d1 = tail[i][k] - tail[i - 1][k];
        if (d0 * d1 < -0.01) rev++;
      }
    }
    const mid = (tail[tail.length - 1].x1 + tail[tail.length - 1].x2) / 2;
    return { minD: Math.round(minD), sep: Math.round(T.minSep()), rev, mid: Math.round(mid), sides: log.every((l) => l.x1 < l.x2) };
  });
  check('T2 both walk: stop cleanly against each other', t2.minD >= t2.sep - 2 && t2.sides, t2);
  check('T2 both walk: no jitter, meet in the middle', t2.rev === 0 && Math.abs(t2.mid) < 30, t2);

  // TEST 3: attacks from point-blank range connect (every weapon, light + heavy + low)
  const t3 = await page.evaluate(() => {
    const g = SA.game, out = {};
    for (const w of Object.keys(SA.WEAPONS)) {
      const r = {};
      for (const [k, hold] of [['light', []], ['heavy', []], ['light', ['down']], ['kick', []]]) {
        T.setup({ weapon: w, x1: 0, x2: 10 });
        T.step(4, [], []);               // separation pushes them to minimum distance
        const d = Math.round(Math.abs(g.p2.x - g.p1.x));
        g.p2.hp = g.p2.maxHp;
        T.step(1, hold, [], [k]);
        T.step(50, hold, []);
        r[(hold.length ? 'down+' : '') + k] = g.p2.hp < g.p2.maxHp ? d : 'MISS@' + d;
      }
      out[w] = r;
    }
    return out;
  });
  const misses = [];
  for (const [w, r] of Object.entries(t3)) for (const [k, v] of Object.entries(r)) if (String(v).startsWith('MISS')) misses.push(w + ':' + k + ' ' + v);
  check('T3 point-blank attacks hit (all weapons)', misses.length === 0, misses.slice(0, 12));

  // single swing = single hit, even with long active frames
  const once = await page.evaluate(() => {
    const g = SA.game;
    const out = {};
    for (const w of ['fists', 'katana', 'war_hammer', 'scythe', 'dual_blades']) {
      T.setup({ weapon: w, x1: -60, x2: 60 });
      T.step(3, [], []);
      const hits = [];
      const orig = SA.Combat.applyHit;
      SA.Combat.applyHit = function (a, b, m, hit, game, opts) { if (a === g.p1) hits.push(m.id); return orig.apply(this, arguments); };
      T.step(1, [], [], ['heavy']);
      T.step(60, [], []);
      SA.Combat.applyHit = orig;
      out[w] = hits.length;
    }
    return out;
  });
  check('one hit per swing', Object.values(once).every((n) => n === 1), once);

  // TEST 4: jump over the enemy -> side switch + facing update, no overlap after landing
  const t4 = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: -150, x2: 20 });
    T.step(2, [], []);
    const before = { f1: g.p1.facing, side: Math.sign(g.p2.x - g.p1.x) };
    T.step(1, ['right', 'up'], [], ['up']);
    const log = T.step(80, ['right'], []);
    const flips = [];
    for (let i = 1; i < log.length; i++) if (log[i].f1 !== log[i - 1].f1) flips.push(i);
    return { before, side: Math.sign(g.p2.x - g.p1.x), f1: g.p1.facing, f2: g.p2.facing, flips, gap: Math.round(Math.abs(g.p2.x - g.p1.x)), sep: Math.round(T.minSep()), state: g.p1.state };
  });
  check('T4 jump over: sides switched', t4.side === -t4.before.side, t4);
  check('T4 jump over: both face each other, single clean flip', t4.f1 === -t4.before.f1 && t4.f2 === -t4.f1 && t4.flips.length === 1 && t4.gap >= t4.sep - 2, t4);

  // facing hysteresis: tiny back-and-forth around the opponent never flickers the facing
  const flick = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: -200, x2: 200 });
    let flips = 0, last = g.p1.facing;
    for (let i = 0; i < 60; i++) {
      g.p2.x = g.p1.x + (i % 2 ? 6 : -6) + 0.0001;   // opponent jitters right on top of the player's centre line
      g.p2.y = -400;                                   // (airborne so no body push)
      g.p2.grounded = false;
      T.step(1, [], []);
      if (g.p1.facing !== last) { flips++; last = g.p1.facing; }
    }
    return { flips };
  });
  check('facing deadzone: no flicker', flick.flips <= 1, flick);

  // dash into the enemy stops at body contact, roll passes through
  const dash = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: -260, x2: 40 });
    T.step(2, [], []);
    const log = T.step(40, ['right'], [], ['dash']);
    const minD = Math.min(...log.map((l) => l.x2 - l.x1));
    return { minD: Math.round(minD), sep: Math.round(T.minSep()), sides: log.every((l) => l.x1 < l.x2) };
  });
  check('dash into enemy: stops at body contact', dash.sides && dash.minD >= dash.sep - 4, dash);
  const roll = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: -140, x2: 20 });
    T.step(2, [], []);
    T.step(1, ['down', 'right'], [], ['dash']);
    const log = T.step(60, [], []);
    return { side: Math.sign(g.p2.x - g.p1.x), f1: g.p1.facing, gap: Math.round(Math.abs(g.p2.x - g.p1.x)), sep: Math.round(T.minSep()), states: [...new Set(log.map((l) => l.s1))].join(',') };
  });
  check('combat roll passes through + turns around', roll.side === -1 && roll.f1 === -1 && roll.gap >= roll.sep - 2, roll);

  // corner: enemy pinned at the wall, player keeps walking in
  const corner = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: SA.WALL - 300, x2: SA.WALL - 5 });
    const log = T.step(120, ['right'], []);
    const minD = Math.min(...log.map((l) => l.x2 - l.x1));
    const maxX2 = Math.max(...log.map((l) => l.x2));
    return { minD: Math.round(minD), sep: Math.round(T.minSep()), maxX2: Math.round(maxX2), wall: SA.WALL };
  });
  check('corner: defender stays inside, attacker cannot enter', corner.maxX2 <= corner.wall && corner.minD >= corner.sep - 2, corner);
  // corner + attack: repeated hits against the wall push the attacker back out
  const cornerHit = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: SA.WALL - 200, x2: SA.WALL - 5 });
    T.step(40, ['right'], []);
    const x0 = g.p1.x;
    for (let i = 0; i < 4; i++) { T.step(1, [], [], ['light']); T.step(22, [], []); }
    return { pushedBack: Math.round(x0 - g.p1.x), gap: Math.round(g.p2.x - g.p1.x), sep: Math.round(T.minSep()) };
  });
  check('corner: hits push the attacker out', cornerHit.pushedBack > 20 && cornerHit.gap >= cornerHit.sep - 2, cornerHit);

  // block pushback separates fighters
  const blockPush = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: -80, x2: 80 });
    T.step(3, [], ['block']);
    const d0 = Math.abs(g.p2.x - g.p1.x);
    T.step(1, [], ['block'], ['heavy']);
    T.step(45, [], ['block']);
    return { grow: Math.round(Math.abs(g.p2.x - g.p1.x) - d0), s2: g.p2.state };
  });
  check('blocked attacks create pushback', blockPush.grow > 25, blockPush);

  // different sizes: a big boss-size body keeps a larger distance but is still hittable point-blank
  const big = await page.evaluate(() => {
    const g = SA.game;
    T.setup({ x1: -200, x2: 100, p2scale: 1.4, p2bulk: 1.3 });
    T.step(120, ['right'], []);
    const d = Math.abs(g.p2.x - g.p1.x);
    const sep = T.minSep();
    g.p2.hp = g.p2.maxHp;
    T.step(1, [], [], ['light']);
    T.step(40, [], []);
    return { d: Math.round(d), sep: Math.round(sep), hit: g.p2.hp < g.p2.maxHp, bodyW: Math.round(g.p2.body.w) };
  });
  check('large fighter: bigger collider, still hit point-blank', big.d >= big.sep - 2 && big.sep > 90 && big.hit, big);

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + '  ' + JSON.stringify(r.info));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
