// Movement & mobility acceptance tests: responsiveness, walk/run/sprint tiers, pivot, dash/backstep/roll,
// leap, slide, running attack, directional heavies, cancels, input + jump buffer, anti-mash rules.
// Usage: NODE_PATH=$(npm root -g) node tests/movement.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };

  await page.evaluate(() => {
    const g = SA.game;
    T.fresh = (x1, x2, weapon) => {
      g.training.tryItem = weapon || null;
      T.training('stand', 'temple');
      g.training.infiniteHp = false;
      g.ai2.update = () => {};
      T.place(x1 === undefined ? -600 : x1, x2 === undefined ? 600 : x2);
      g.p1.ctrl.stick = false;
    };
    // run n frames and record p1's state / move each frame
    T.rec = (n, o) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        T.run(1, { hold: (o && o.hold) || [], press: i === 0 && o ? o.press : null });
        out.push({ s: g.p1.state, m: g.p1.move && g.p1.move.id, vx: g.p1.vx, x: g.p1.x, y: g.p1.y, g: g.p1.grounded, t: g.p1.turnT });
      }
      return out;
    };
  });

  const r = await page.evaluate(() => {
    const g = SA.game, o = {};
    const f = () => g.p1;
    // --- responsiveness: frames until 90 % of walk speed, and until a reversal flips velocity
    T.fresh();
    let log = T.rec(10, { hold: ['right'] });
    o.walkFrames = log.findIndex((l) => l.vx > 0.9 * 430 * 0.99) + 1;
    log = T.rec(8, { hold: ['left'] });
    o.reverseFrames = log.findIndex((l) => l.vx < 0) + 1;
    o.pivot = log.some((l) => l.t > 0);
    // --- keyboard tiers: walk -> run -> sprint by hold time
    T.fresh();
    log = T.rec(60, { hold: ['right'] });
    o.tiers = [log[4].s, log[15].s, log[50].s];
    o.sprintSpeed = Math.round(log[59].vx);
    // --- stick tiers: deflection decides immediately
    const stick = (a) => { T.fresh(); g.input.analogX = a; g.input.virtual.add('right'); const l = T.rec(6); g.input.virtual.clear(); g.input.analogX = 1; return [l[5].s, Math.round(l[5].vx)]; };
    o.stickWalk = stick(0.3); o.stickRun = stick(0.7); o.stickSprint = stick(0.95);
    // --- T8: dash -> attack -> combo -> backstep
    T.fresh(-300, 60);
    const seq = [];
    const rec = (n, opt) => { for (const l of T.rec(n, opt)) seq.push(l.m || l.s); };
    rec(3, { hold: ['right'], press: ['dash'] });
    rec(1, { hold: ['right'], press: ['light'] });
    rec(26);
    rec(1, { press: ['light'] }); rec(9);
    rec(1, { press: ['light'] }); rec(9);
    rec(1, { press: ['dash'] }); rec(20);
    o.flow = [...new Set(seq)].join(' > ');
    // --- backstep counter
    T.fresh(-200, 200);
    T.rec(1, { press: ['dash'] });
    const bs = T.rec(6);
    const bc = T.rec(3, { press: ['heavy'] });
    o.backCounter = { start: bs[0].s, move: bc[2].m, bonus: f().moveBonus };
    // --- leap from a run
    T.fresh(-900, 900);
    T.rec(20, { hold: ['right'] });
    const lp = T.rec(4, { hold: ['right'], press: ['up'] });
    o.leap = { vx: Math.round(lp[3].vx), air: !lp[3].g };
    // --- slide: sprint + down + attack
    T.fresh(-900, 900);
    T.rec(45, { hold: ['right'] });
    const sl = T.rec(2, { hold: ['right', 'down'], press: ['light'] });
    o.slide = sl[1].m;
    // --- running attack
    T.fresh(-900, 900);
    T.rec(16, { hold: ['right'] });
    o.runAttack = T.rec(2, { hold: ['right'], press: ['light'] })[1].m;
    // --- directional heavies
    const heavy = (hold) => { T.fresh(-300, 300); return T.rec(2, { hold, press: ['heavy'] })[1].m; };
    o.heavy = { neutral: heavy([]), fwd: heavy(['right']), up: heavy(['up']), down: heavy(['down']) };
    // --- jump buffer: press up shortly before landing -> jumps again right away
    // frames from the jump press until touchdown (first grounded frame after being airborne)
    const landFrame = (log) => { const a = log.findIndex((l) => !l.g); return a < 0 ? -1 : a + log.slice(a).findIndex((l) => l.g); };
    T.fresh();
    T.rec(1, { press: ['up'] });
    let air = landFrame(T.rec(80));
    T.fresh();
    T.rec(1, { press: ['up'] });
    T.rec(air - 5);
    T.rec(1, { press: ['up'] });
    const jb = T.rec(14);
    const landedAt = jb.findIndex((l) => l.g);
    o.jumpBuffer = { air, landedAt, rejump: landedAt >= 0 && jb.slice(landedAt, landedAt + 4).some((l) => !l.g || l.s === 'prejump') };
    // --- landing has no lock: attack the frame after landing
    T.fresh();
    T.rec(1, { press: ['up'] });
    T.fresh();
    T.rec(1, { press: ['up'] });
    T.rec(air + 1);
    o.landAttack = T.rec(1, { press: ['light'] })[0].s;
    // --- dash cooldown: a second dash waits (buffered) for the cooldown
    T.fresh(-900, 900);
    const d1 = T.rec(1, { hold: ['right'], press: ['dash'] });
    T.rec(12, { hold: ['right'] });
    const early = T.rec(2, { hold: ['right'], press: ['dash'] });      // inside the cooldown: no dash
    T.fresh(-900, 900);
    T.rec(1, { hold: ['right'], press: ['dash'] });
    T.rec(20, { hold: ['right'] });
    const buffered = T.rec(8, { hold: ['right'], press: ['dash'] });   // just before it ends: fires when ready
    o.dashCd = { first: d1[0].s, early: early[1].s, buffered: buffered.some((l) => l.s === 'dash') };
    // --- roll: invulnerable early, vulnerable at the end
    T.fresh(-300, 300);
    T.rec(1, { hold: ['down'], press: ['dash'] });
    const inv = [];
    for (let i = 0; i < 26; i++) { T.rec(1); inv.push(f().canBeHit() ? 1 : 0); }
    o.roll = { early: inv.slice(0, 8).every((v) => !v), late: inv.slice(-6).some((v) => v) };
    // --- anti-mash: whiffed jump attack lands with lag; one that hits doesn't
    T.fresh(-600, 600);
    T.rec(1, { press: ['up'] });
    T.rec(4);
    T.rec(1, { press: ['kick'] });
    let l2 = T.rec(60);
    const li = l2.findIndex((l) => l.s === 'landing');
    o.whiffLag = li >= 0 ? l2.slice(li).findIndex((l) => l.s !== 'landing') : 0;
    return o;
  });

  check('input reacts at once: 90 % walk speed within 4 frames', r.walkFrames > 0 && r.walkFrames <= 4, r.walkFrames);
  check('T7 reversal flips velocity within 3 frames + pivot', r.reverseFrames > 0 && r.reverseFrames <= 3 && r.pivot, { frames: r.reverseFrames, pivot: r.pivot });
  check('keyboard: walk -> run -> sprint by hold time', r.tiers.join() === 'walk,run,sprint' && r.sprintSpeed > 900, { tiers: r.tiers, v: r.sprintSpeed });
  check('stick: deflection picks walk / run / sprint instantly', r.stickWalk[0] === 'walk' && r.stickRun[0] === 'run' && r.stickSprint[0] === 'sprint' && r.stickWalk[1] < r.stickRun[1] && r.stickRun[1] < r.stickSprint[1],
    { walk: r.stickWalk, run: r.stickRun, sprint: r.stickSprint });
  check('T8 dash > dash attack > combo > backstep', /dash > dashPunch.*jab > jab2.*evade/.test(r.flow), r.flow);
  check('backstep counter (backstep + heavy)', r.backCounter.start === 'evade' && r.backCounter.move === 'backCounter' && r.backCounter.bonus > 1, r.backCounter);
  check('leap: up while running = long fast jump', r.leap.air && r.leap.vx > 800, r.leap);
  check('slide: sprint + down + attack', r.slide === 'slideKick', r.slide);
  check('running attack', r.runAttack === 'runStrike', r.runAttack);
  check('directional heavies: lunge / uppercut / sweep', r.heavy.neutral === 'heavy' && r.heavy.fwd === 'lunge' && r.heavy.up === 'uppercut' && r.heavy.down === 'sweep', r.heavy);
  check('jump buffer: early jump press fires on landing', r.jumpBuffer.landedAt >= 0 && r.jumpBuffer.rejump, r.jumpBuffer);
  check('normal landing has no input lock', r.landAttack === 'attack', r.landAttack);
  check('dash cooldown (buffered second dash)', r.dashCd.first === 'dash' && r.dashCd.early !== 'dash' && r.dashCd.buffered, r.dashCd);
  check('roll: invulnerable early, vulnerable end', r.roll.early && r.roll.late, r.roll);
  check('whiffed jump attack is punishable on landing', r.whiffLag >= 8, r.whiffLag);

  // weapon: dash attack, running attack, sweep and backstep counter exist for every weapon style
  const wset = await page.evaluate(() => {
    const bad = [];
    for (const [id, set] of Object.entries(SA.WEAPON_SETS)) {
      for (const k of ['light', 'heavy', 'heavyFwd', 'heavyUp', 'heavyDown', 'dashLight', 'dashHeavy', 'runLight', 'slide', 'backCounter', 'airLight', 'airHeavy', 'kick', 'kickDown', 'lightDown']) {
        if (!SA.MOVES[set[k]]) bad.push(id + ':' + k);
      }
    }
    return bad;
  });
  check('every weapon has the full mobility moveset', wset.length === 0, wset.slice(0, 10));

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + '  ' + JSON.stringify(x.info));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
