// Smoothness acceptance tests (A–G) + render interpolation + frame pacing.
// Every sequence is driven by real inputs; per simulation step we record the state, the move, the
// body position and the skeleton relative to the hip, then check:
//   - no pose snaps: the body shape (joint distances to the hip) never changes abruptly in one step
//   - no position jumps: the body never moves more than POS_MAX px in one step (no teleports)
//   - flow: the moves follow each other without an idle frame in between
// Usage: NODE_PATH=$(npm root -g) node tests/smooth.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };

  await page.evaluate(() => {
    const g = SA.game;
    const JOINTS = ['head', 'neck', 'sh', 'elbF', 'handF', 'elbB', 'handB', 'kneeF', 'footF', 'kneeB', 'footB', 'tip'];
    // steps: { n, hold, press, until(f, o), max }
    T.seq = (steps, who) => {
      const log = [];
      const f = () => (who === 2 ? g.p2 : g.p1);
      let prev = null;
      const rec = () => {
        // measure what is drawn: the presentation skeleton (visual turn applied), not the gameplay one
        const F = f(), S = F.skel, rel = {};
        F.beginRender(1);
        // body shape: distance of every joint from the hip (independent of rotation) + trunk angle
        for (const k of JOINTS) rel[k] = Math.hypot(S[k].x - S.hip.x, S[k].y - S.hip.y);
        const ang = Math.atan2(S.neck.y - S.hip.y, S.neck.x - S.hip.x);
        F.endRender();
        const e = { s: F.state, m: F.move ? F.move.id.split(':').pop() : null, x: F.x, y: F.y, rel, ang, fv: F.faceVis, fc: F.facing, hits: F.combo.hits };
        if (prev) {
          // snap = the whole body changes at once (mean joint travel); a fast strike moves one limb
          let pj = 0, sum = 0;
          for (const k of JOINTS) { const d = Math.abs(rel[k] - prev.rel[k]); pj = Math.max(pj, d); sum += d; }
          e.pj = pj; e.pm = sum / JOINTS.length;
          let da = Math.abs(ang - prev.ang); if (da > Math.PI) da = SA.TAU - da;
          e.rot = da;
          e.dx = Math.hypot(F.x - prev.x, F.y - prev.y);
        }
        prev = e;
        log.push(e);
      };
      for (const st of steps) {
        const max = st.until ? st.max || 90 : st.n || 1;
        for (let i = 0; i < max; i++) {
          if (st.until && st.until(f(), g)) break;
          T.run(1, { hold: st.hold || [], press: i === 0 ? st.press || [] : [] });
          rec();
        }
      }
      const pose = Math.max(0, ...log.map((l) => l.pm || 0));
      const limb = Math.max(0, ...log.map((l) => l.pj || 0));
      const rot = Math.max(0, ...log.map((l) => l.rot || 0));
      const pos = Math.max(0, ...log.map((l) => l.dx || 0));
      const worst = log.map((l, i) => ({ i, t: (l.m || l.s), p: Math.round(l.pm || 0), r: +(l.rot || 0).toFixed(2), prev: i ? (log[i - 1].m || log[i - 1].s) : '' }))
        .filter((w) => w.p > 20 || w.r > 0.45).slice(0, 6);
      const flow = [];
      for (const l of log) { const t = l.m ? 'attack:' + l.m : l.s; if (flow[flow.length - 1] !== t) flow.push(t); }
      return { log, worst, pose: Math.round(pose), limb: Math.round(limb), rot: +rot.toFixed(2), pos: Math.round(pos), flow, hits: Math.max(...log.map((l) => l.hits)) };
    };
    // idle frames between the first frame of state a and the first frame of state b afterwards
    T.idleBetween = (log, fromIdx, toPred) => {
      let n = 0;
      for (let i = fromIdx; i < log.length; i++) {
        if (toPred(log[i])) return n;
        if (log[i].s === 'idle' || log[i].s === 'walk') n++;
      }
      return 99;
    };
  });

  // mean joint travel per step (whole-body snap) / fastest single limb (a strike) / body travel per step
  // per simulation step: mean change of the body shape (a whole-body snap), fastest single limb
  // (a strike may be fast), trunk rotation (flips / rolls spin smoothly), body travel (no teleports)
  const POSE_MAX = 28, LIMB_MAX = 130, ROT_MAX = 0.5, POS_MAX = 45;
  const smooth = (r) => r.pose <= POSE_MAX && r.limb <= LIMB_MAX && r.rot <= ROT_MAX && r.pos <= POS_MAX;

  // A: Idle -> Run -> Dash -> Stop -> Turn (roll through the opponent) -> Run
  const A = await page.evaluate(() => {
    T.training('stand'); T.place(-700, 0); T.run(5);
    const r = T.seq([
      { n: 10 },
      { n: 24, hold: ['right'] },
      { n: 12, hold: ['right'], press: ['dash'] },
      { n: 16 },
      { n: 1, hold: ['down'], press: ['dash'] },
      { until: (f) => f.state !== 'roll', max: 60, hold: [] },
      { n: 40, hold: ['left'] },
    ]);
    const L = r.log;
    const flipAt = L.findIndex((l, i) => i > 0 && l.fc !== L[i - 1].fc);
    let turnFrames = 0;
    for (let i = Math.max(0, flipAt); i < L.length && flipAt >= 0; i++) { if (L[i].fv !== L[i].fc) turnFrames++; else break; }
    delete r.log;
    return Object.assign(r, { turnFrames, turned: flipAt >= 0 });
  });
  check('A idle > run > dash > stop > turn > run, no pose / position jumps',
    ['run', 'dash', 'roll'].every((s) => A.flow.includes(s)) && A.flow.lastIndexOf('run') > A.flow.indexOf('roll') && A.turned && A.turnFrames >= 4 && A.turnFrames <= 9 &&
    smooth(A), A);

  // B: Run -> Jump (front flip) -> Air attack -> Landing -> Roll (buffered before touching down)
  const B = await page.evaluate(() => {
    T.training('stand'); T.place(-1000, 1000); T.run(5);
    const r = T.seq([
      { n: 20, hold: ['right'] },
      { n: 1, hold: ['right'], press: ['up'] },
      { n: 12 },
      { n: 1, press: ['light'] },
      { until: (f) => f.y > -60 && f.vy > 0, max: 80 },
      { n: 1, hold: ['down'], press: ['dash'] },
      { until: (f) => f.state === 'roll', max: 20, hold: ['down'] },
      { n: 28 },
    ]);
    const L = r.log;
    const atk = L.findIndex((l) => l.m);
    const idle = T.idleBetween(L, atk, (l) => l.s === 'roll');
    delete r.log;
    return Object.assign(r, { idle });
  });
  check('B run > front flip > air attack > landing > roll as one motion', B.flow.includes('flip') && B.flow.some((t) => t.startsWith('attack:')) &&
    B.flow.includes('roll') && B.idle <= 1 && smooth(B), B);

  // C: Roll -> Attack -> Dash -> Heavy, against a standing opponent: no idle frame in between
  const C = await page.evaluate(() => {
    T.training('stand'); T.place(-470, 0); T.run(5);
    const r = T.seq([
      { n: 1, hold: ['down'], press: ['dash'] },
      { n: 12, hold: ['down'] },
      { n: 1, press: ['light'] },
      { until: (f) => f.moveContact === 'hit', max: 30 },
      { n: 1, hold: ['right'], press: ['dash'] },
      { n: 3, hold: ['right'] },
      { n: 1, hold: ['right'], press: ['heavy'] },
      { n: 40 },
    ]);
    const L = r.log;
    const seq = r.flow.filter((t) => t !== 'crouch');
    delete r.log;
    return Object.assign(r, { seq, idleFrames: L.slice(0, L.findIndex((l) => l.m === 'slideKick') + 1).filter((l) => l.s === 'idle').length });
  });
  check('C roll > attack > dash > heavy, no idle in between', C.seq.join(' > ').startsWith('roll > attack:crouchJab > dash > attack:slideKick') && C.idleFrames === 0 && C.hits >= 2 &&
    smooth(C), C);

  // D: Backstep -> Backflip -> Throwing weapon (in the air)
  const D = await page.evaluate(() => {
    T.training('stand'); T.place(-100, 500); T.run(5);
    SA.game.p1.setLoadout({ weapon: 'fists', ranged: 'shuriken' });
    const r = T.seq([
      { n: 1, press: ['dash'] },
      { n: 4 },
      { n: 1, press: ['up'] },
      { until: (f) => f.state === 'flip' && f.st >= 12, max: 20 },
      { n: 1, press: ['ranged'] },
      { until: (f) => f.grounded && f.state !== 'attack', max: 80 },
      { n: 6 },
    ]);
    const proj = SA.game.projectiles.get().length;
    delete r.log;
    return Object.assign(r, { proj });
  });
  check('D backstep > backflip > air throw', D.flow.join(' > ').startsWith('evade > flip > attack:air') && D.proj >= 1 && smooth(D), D);

  // E: Slide -> Uppercut (launch) -> Jump cancel -> Air kick on the airborne opponent
  const E = await page.evaluate(() => {
    const g = SA.game;
    T.training('stand'); T.place(-900, 0); T.run(5);
    const d = () => Math.abs(g.p1.x - g.p2.x);
    const r = T.seq([
      { until: () => d() < 520, max: 80, hold: ['right'] },
      { n: 3, hold: ['right', 'down'] },
      { until: () => d() < 200 || g.p1.state !== 'slide', max: 30, hold: ['right', 'down'] },
      { n: 1, press: ['heavy'] },
      { until: (f) => f.moveContact === 'hit', max: 25 },
      { n: 1, press: ['up'] },
      { until: (f) => f.state === 'air', max: 12 },
      { n: 3, hold: ['right'] },
      { n: 1, hold: ['right'], press: ['kick'] },
      { until: (f) => f.grounded && f.state !== 'attack', max: 90, hold: ['right'] },
    ]);
    delete r.log;
    return r;
  });
  check('E slide > uppercut > jump > air kick (air combo)', /slide > attack:uppercut > (prejump|air).* > attack:flyingKick/.test(E.flow.join(' > ')) && E.hits >= 2 &&
    smooth(E), E);

  // F: the Jackal Assassin AI performs Dash -> Light -> Roll -> Jump attack fluidly
  const F = await page.evaluate(() => {
    const g = SA.game;
    const def = SA.EnemyGen.generate(21, 'normal', 11, false, 'jackal_assassin');
    g.scene = 'fight';
    g.arenaRun = { stage: 21, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
    g.setupWorld({ mode: 'arena', arena: def.arena, enemy: def });
    g.transition = null; g.fade = 0; g.match.phase = 'fight';
    for (const f of [g.p1, g.p2]) if (f.state === 'intro') f.setState('idle');
    g.p1.hp = g.p1.maxHp = 99999;
    g.p1.reset(-120, 1); g.p2.reset(260, -1); g.ai2.reset();
    // the AI only runs this plan (its own decision layer paused for the test)
    const ai = g.ai2;
    ai.startPlan('ATTACK', ['dash', 'light', 'roll', 'jump', 'kick']);
    const orig = ai.chooseIntent.bind(ai);
    ai.chooseIntent = () => {};
    ai.react = () => false;
    const r = T.seq([{ until: () => !ai.plan || (ai.plan.i >= ai.plan.steps.length && g.p2.isNeutral()), max: 150 }], 2);
    ai.chooseIntent = orig;
    delete r.log;
    return r;
  });
  check('F Jackal Assassin AI: dash > light > roll > jump attack', /dash > attack:\S+ > roll > .*(air|prejump).* > attack:/.test(F.flow.join(' > ')) && smooth(F), F);

  // interpolation: constant-speed run, jittery 60 Hz and 144 Hz frame clocks; the *drawn* position
  // must move evenly (without interpolation it stutters: 0 or 2 steps per frame)
  const I = await page.evaluate(() => {
    const g = SA.game, out = {};
    const sim = (hz, jitter, interp) => {
      T.training('stand'); T.place(-1100, 1150); T.run(5);
      const f = g.p1;
      let acc = 0, t = 0, seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const xs = [], dts = [];
      const frames = Math.round(hz * 1.2), skip = Math.round(hz * 0.95);   // measure at full sprint
      for (let i = 0; i < frames; i++) {
        const dt = 1 / hz * (1 + (rnd() - 0.5) * 2 * jitter);
        t += dt; acc += dt;
        while (acc >= SA.STEP) { g.input.heldActions = new Set(['right']); g.tick(); acc -= SA.STEP; }
        const a = interp ? acc / SA.STEP : 1;
        f.beginRender(a);
        const x = f.x;
        f.endRender();
        if (i > skip) { xs.push(x); dts.push(dt); }
      }
      // drawn speed per frame, relative spread (coefficient of variation)
      const v = [];
      for (let i = 1; i < xs.length; i++) v.push((xs[i] - xs[i - 1]) / dts[i]);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length);
      return +(sd / Math.abs(mean)).toFixed(3);
    };
    out.hz60 = { interp: sim(60, 0.08, true), raw: sim(60, 0.08, false) };
    out.hz144 = { interp: sim(144, 0.05, true), raw: sim(144, 0.05, false) };
    return out;
  });
  check('render interpolation: even drawn speed at jittery 60 Hz and at 144 Hz', I.hz60.interp < 0.12 && I.hz144.interp < 0.12 && I.hz60.raw > I.hz60.interp * 3 && I.hz144.raw > I.hz144.interp * 3, I);

  // G: two AIs fight for 25 s (1500 steps + a render each): stable step times, no growing spikes
  const G = await page.evaluate(() => {
    const g = SA.game;
    const def = SA.EnemyGen.generate(26, 'normal', 5, false, 'jackal_assassin');
    g.scene = 'fight';
    g.arenaRun = { stage: 26, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
    g.setupWorld({ mode: 'arena', arena: def.arena, enemy: def });
    g.transition = null; g.fade = 0; g.match.phase = 'fight';
    for (const f of [g.p1, g.p2]) if (f.state === 'intro') f.setState('idle');
    g.p1.ctrl = new SA.Controller();
    g.ai1 = new SA.EnemyAI(g.p1, g.p2, g, { params: SA.EnemyGen.aiParams(26), profile: SA.ARCHETYPES.desert_bandit.ai });
    // one presented frame = two simulation steps + one render (flushed like a real frame)
    const times = [], steps = [], heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    for (let i = 0; i < 750; i++) {
      const t0 = performance.now();
      for (let k = 0; k < 2; k++) {
        const s0 = performance.now();
        g.tick(); g.p1.hp = Math.max(g.p1.hp, 500); g.p2.hp = Math.max(g.p2.hp, 500);
        steps.push(performance.now() - s0);
      }
      g.render(); g.ctx.getImageData(0, 0, 1, 1);
      times.push(performance.now() - t0);
    }
    const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const used = Object.assign({}, g.ai2.used);
    for (const k in g.ai1.used) used[k] = (used[k] || 0) + g.ai1.used[k];
    g.ai1 = null;
    const stats = (arr) => {
      const sorted = arr.slice().sort((a, b) => a - b);
      const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const h = arr.length / 2;
      return { median: +q(0.5).toFixed(2), p99: +q(0.99).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2), slow: arr.filter((t) => t > 4).length, drift: +(avg(arr.slice(h)) / avg(arr.slice(0, h))).toFixed(2) };
    };
    return { sim: stats(steps), frame: stats(times), heapMB: heap0 ? +((heap1 - heap0) / 1e6).toFixed(1) : null, used };
  });
  // simulation steps (our code: movement, AI, collision, animation) must be flat: no GC or cache spikes
  check('G 25 s AI vs AI: simulation steps steady (no spikes, no drift)', G.sim.p99 < 3 && G.sim.slow <= 3 && G.sim.max < 15 && G.sim.drift < 1.3, G.sim);
  // headless Chrome rasterises in software, frame cost follows the content (zoom, fighters close);
  // a real spike (hundreds of ms, GC) would stand far above that
  check('G presented frames without spikes', G.frame.max < G.frame.median * 3.5 && G.frame.drift < 1.25, G.frame);
  const acro = ['flip', 'airdash', 'handspring', 'roll', 'slide', 'feint'].filter((k) => (G.used[k] || 0) > 0);
  check('AI uses the new movement (flips / air dash / handspring / roll / slide / feints)', acro.length >= 3, { acro, used: G.used });

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + '  ' + JSON.stringify(x.info));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
