// Platform-fighter combat flow: acceptance test 55 (Dash -> Light -> Kick -> Front Flip -> Shoot ->
// Air Slash -> Falling Attack -> Landing -> Roll away, without idle gaps), mobile shooting (salto
// shot, falling shot, shots while running / rolling, auto reload, no state lock), dive impact, and the
// new flow combos CRESCENT FLOW, MOON GUNNER, DESERT DIVE, MOON DANCE. Inputs only, nothing scripted.
// Usage: NODE_PATH=$(npm root -g) node tests/flowcombat.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const res = await page.evaluate(() => {
    const g = SA.game, R = {};
    let frame = 0, tagLog = [];
    const orig = SA.Combat.applyHit;
    SA.Combat.applyHit = function (a, b, m, hit, game, opts) { const r = orig.apply(this, arguments); if (a === g.p1) tagLog.push(SA.comboTag(a, m, opts) + '@' + frame); return r; };
    const f = () => g.p1;
    const hit = (x) => x.moveContact === 'hit' && g.hitstop === 0;
    // step list runner: { press, hold, until(f), max, n }; records the state of every frame
    const play = (setup, steps) => {
      T.training('stand'); setup(); T.run(3);
      g.p1.lastFlow = null;
      tagLog = []; frame = 0;
      const states = [];
      let best = { hits: 0, name: null };
      for (const st of steps) {
        const max = st.until ? st.max || 60 : st.n || 1;
        for (let i = 0; i < max; i++) {
          if (st.until && st.until(f())) break;
          T.run(1, { hold: st.hold || [], press: i === 0 ? st.press || [] : [] });
          states.push(f().state); frame++;
          const c = f().combo;
          if (c.hits > best.hits || (c.name && c.hits >= best.hits)) best = { hits: c.hits, name: c.name, tags: c.tags.join(',') };
        }
      }
      best.flow = g.p1.lastFlow;
      best.log = tagLog.join(' ');
      best.st = states.map((q, i) => q !== states[i - 1] ? i + ':' + q : '').filter(Boolean).join('>');
      return { best, states };
    };
    const runLen = (states, re) => { let m = 0, cur = 0; for (const s of states) { if (re.test(s)) { cur++; m = Math.max(m, cur); } else cur = 0; } return m; };

    // ---- acceptance 55 ----
    const seen = [];
    const a55 = play(() => T.place(-560, 0), [
      { press: ['gDashF'], hold: ['right'] }, { n: 4, hold: ['right'] },
      { press: ['light'] }, { until: hit, max: 25 }, () => seen.push('light'),
      { press: ['kick'] }, { until: (x) => x.move && /kick/i.test(x.move.id) && hit(x), max: 30 },
      { press: ['gFlipF'] }, { until: (x) => x.state === 'flip', max: 12 },
      { n: 6 }, { press: ['ranged'] }, { n: 3 },
      { press: ['light'] }, { until: (x) => x.state === 'attack', max: 14 }, { until: (x) => x.state !== 'attack', max: 40 },
      { press: ['heavy'], hold: ['down'] }, { until: (x) => x.grounded, max: 60, hold: ['down'] },
      { press: ['gRollB'] }, { n: 8 },
    ].filter((s) => typeof s === 'object'));
    const st = a55.states;
    const order = ['dash', 'attack', 'flip', 'attack', 'roll'];
    let k = 0;
    for (const s of st) if (k < order.length && s === order[k]) k++;
    R.a55 = { order: k === order.length, idle: runLen(st, /^(idle|walk|crouch)$/), states: st.map((s, i) => s !== st[i - 1] ? i + ':' + s : '').filter(Boolean).join('>'), best: a55.best };

    // ---- mobile shooting ----
    T.training('stand'); T.place(-500, 300); T.run(3);
    const p = f();
    p.setLoadout({ weapon: p.weapon.id, ranged: 'crescent_pistols' });
    // running shot: still running afterwards (no state lock)
    T.run(30, { hold: ['right'] });
    const a0 = p.rangedState.ammo;
    T.run(1, { hold: ['right'], press: ['ranged'] });
    R.runShot = { ammo: a0 - p.rangedState.ammo, state: p.state, shootT: p.shootT > 0 };
    // salto shot: fire inside a front flip, the flip continues
    T.place(-600, 300); T.run(3);
    T.run(1, { press: ['gFlipF'] }); T.run(8);
    const rot0 = p.pose.rot;
    T.run(1, { press: ['ranged'] }); T.run(3);
    R.saltoShot = { state: p.state, kind: p.flip && p.flip.kind, shootT: p.shootT > 0, rotating: Math.abs(p.pose.rot - rot0) > 0.3 };
    // falling shot: down + shoot in the air aims down and holds the fall a moment
    T.place(-600, 300); T.run(3);
    T.run(1, { press: ['gJump'] }); T.run(22);
    const vy0 = p.vy;
    T.run(1, { press: ['ranged'], hold: ['down'] });
    const pr = g.projectiles.pool.filter((q) => q.alive && q.owner === p).pop();
    R.fallShot = { aimDown: pr ? pr.vy > 600 : false, vyBefore: Math.round(vy0), vyAfter: Math.round(p.vy) };
    // roll exit shot
    T.place(-600, 300); T.run(3);
    T.run(1, { press: ['gRollF'] }); T.run(13);
    T.run(1, { press: ['ranged'] });
    R.rollShot = { state: p.state, shootT: p.shootT > 0 };
    // auto reload: empty the magazine, wait, full again without a button
    T.place(-600, 300); T.run(3);
    for (let i = 0; i < 12; i++) T.run(8, { press: ['ranged'] });
    const empty = p.rangedState.ammo;
    T.run(80);
    R.autoReload = { empty, after: p.rangedState.ammo, mag: p.rangedWeapon.magazine };
    // idle reload: one shot, pause, refilled
    p.rangedState.ammo = p.rangedWeapon.magazine;
    T.run(1, { press: ['ranged'] }); T.run(150);
    R.idleReload = p.rangedState.ammo === p.rangedWeapon.magazine;

    // ---- dive impact ----
    T.training('stand'); T.place(-160, 0);
    f().y = -320; f().grounded = false; f().setState('air'); f().vy = 200;
    T.run(1, { press: ['heavy'], hold: ['down'] });
    let maxRing = 0;
    for (let i = 0; i < 50; i++) { T.run(1, { hold: ['down'] }); maxRing = Math.max(maxRing, g.particles.pool.filter((q) => q.alive && q.type === 'ring' && q.rot === 0.3).length); }
    R.dive = { hp: g.p2.maxHp - g.p2.hp, p2: g.p2.state, rings: maxRing };

    // ---- Crescent Moonfall (the Moon Guardian's special) ----
    T.training('stand'); T.place(-420, 0);
    f().specialId = 'crescent'; f().energy = 100;
    const phases = [];
    T.run(1, { press: ['special'] });
    for (let i = 0; i < 160; i++) { T.run(1); const sp = f().sp; if (sp && phases[phases.length - 1] !== sp.phase) phases.push(sp.phase); }
    R.crescent = { phases: phases.join('>'), dmg: g.p2.maxHp - g.p2.hp, state: f().state };

    // ---- named flow combos ----
    R.crescentFlow = play(() => T.place(-260, 0), [
      { n: 6, hold: ['right'] },
      { press: ['light'] }, { until: hit, max: 25 },
      { press: ['kick'] }, { until: (x) => x.move && /kick/i.test(x.move.id) && hit(x), max: 30 },
      { press: ['gFlipF'] }, { until: (x) => x.state === 'flip', max: 10 }, { n: 7 },
      { press: ['light'] }, { until: (x) => x.state === 'air', max: 40 },
      { press: ['heavy'], hold: ['down'] }, { until: (x) => x.grounded, max: 60, hold: ['down'] }, { n: 10 },
    ]).best;
    R.moonGunner = play(() => T.place(300, 470), [
      { press: ['gFlipB'] }, { n: 8 },
      { press: ['ranged'] }, { n: 8 }, { press: ['ranged'] },
      { until: (x) => x.grounded, max: 60 },
      { press: ['gLongF'], hold: ['right'] }, { n: 8, hold: ['right'] },
      { press: ['kick'], hold: ['right'] }, { n: 30 },
    ]).best;
    R.desertDive = play(() => { T.place(-300, 0); }, [
      { press: ['gJump'], hold: ['right'] }, { n: 12, hold: ['right'] },
      { press: ['ranged'] }, { n: 2 },
      { press: ['heavy'], hold: ['down'] }, { until: (x) => x.grounded, max: 60, hold: ['down'] }, { n: 20 },
    ]).best;
    R.moonDance = play(() => T.place(-420, 0), [
      { press: ['gRollF'] }, { n: 13 },
      { press: ['kick'] }, { until: hit, max: 25 }, { n: 4 },
      { press: ['gDashF'], hold: ['right'] }, { n: 3, hold: ['right'] },
      { press: ['kick'], hold: ['right'] }, { until: hit, max: 25 }, { n: 6 },
      { press: ['gFlipB'] }, { n: 10 },
      { press: ['ranged'] }, { n: 30 },
    ]).best;
    return R;
  });
  const checks = [
    ['acceptance 55: dash > light > kick > flip > shot > air slash > falling attack > roll, no idle gaps (landing <= 100 ms)', res.a55.order && res.a55.idle <= 6],
    ['running shot: fires, keeps running (no state lock)', res.runShot.ammo === 1 && /run|sprint/.test(res.runShot.state) && res.runShot.shootT],
    ['salto shot: fired mid-flip, the flip keeps rotating', res.saltoShot.state === 'flip' && res.saltoShot.shootT && res.saltoShot.rotating],
    ['falling shot: down + shoot aims down, recoil holds the fall', res.fallShot.aimDown && res.fallShot.vyAfter < res.fallShot.vyBefore],
    ['roll exit shot', res.rollShot.shootT],
    ['auto reload when empty', res.autoReload.empty === 0 && res.autoReload.after === res.autoReload.mag],
    ['auto reload after a pause', res.idleReload],
    ['heavy dive: impact ring + damage + launch', res.dive.rings > 0 && res.dive.hp > 0 && /launched|down/.test(res.dive.p2)],
    ['CRESCENT MOONFALL: dash > flip > cut > energy arc, lands', res.crescent.phases.startsWith('charge>dash>flip>cut') && res.crescent.dmg >= 80 && res.crescent.state !== 'special', res.crescent],
    ['CRESCENT FLOW', res.crescentFlow.flow === 'CRESCENT FLOW'],
    ['MOON GUNNER', res.moonGunner.flow === 'MOON GUNNER'],
    ['DESERT DIVE', res.desertDive.flow === 'DESERT DIVE'],
    ['MOON DANCE', res.moonDance.flow === 'MOON DANCE'],
  ];
  let fail = 0;
  for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fail++; }
  console.log(JSON.stringify(res));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  console.log(fail ? `${fail} FAILED` : `ALL ${checks.length} CHECKS PASSED`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
