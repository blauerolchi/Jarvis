// God boss tests: every ability of every god runs, hits a standing player, and has its counter
// (jump the tail sweep, walk out of lightning, crouch the high sun beam ...). Also: boss intro,
// Anubis pass-through dash, Osiris second life, phase moods.
// Usage: NODE_PATH=$(npm root -g) node tests/bosses.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };

  await page.evaluate(() => {
    const g = SA.game;
    T.boss = (id, stage) => {
      const def = SA.Bosses.generate(stage || 10, stage || 10, 'normal', SA.M.seeded(5), id);
      g.scene = 'fight';
      g.arenaRun = { stage: stage || 10, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
      g.setupWorld({ mode: 'arena', arena: def.arena, enemy: def });
      g.transition = null; g.fade = 0;
      return def;
    };
    T.fightNow = () => {
      g.match.phase = 'fight'; g.match.bossIntro = null;
      for (const f of [g.p1, g.p2]) if (f.state === 'intro') f.setState('idle');
      g.p2.introGlow = 0;
    };
    // run one ability against a passive player; returns what happened
    T.ability = (id, dist, hold, opts) => {
      T.fightNow();
      g.p1.reset(-dist / 2, 1); g.p2.reset(dist / 2, -1);
      g.p1.hp = g.p1.maxHp; g.p2.hp = g.p2.maxHp;
      g.ai2.update = () => {};   // freeze the AI: only the ability acts
      g.projectiles.clear();
      g.p2.strikes = []; g.p2.stormT = 0;
      const ok = SA.Bosses.startAbility(g.p2, g.p1, id, g, opts || {});
      let minHp = g.p1.hp, frames = 0, passed = false, x0 = g.p2.x, maxProj = 0;
      const hp2 = g.p2.hp;
      for (let i = 0; i < 260; i++) {
        // '!x' entries are button presses (edges), the rest are held
        const h = typeof hold === 'function' ? hold(i) : hold || [];
        T.run(1, { hold: h.filter((k) => k[0] !== '!'), press: h.filter((k) => k[0] === '!').map((k) => k.slice(1)) });
        SA.Bosses.tick(g.p2, g, 1 / 60);
        minHp = Math.min(minHp, g.p1.hp);
        maxProj = Math.max(maxProj, g.projectiles.get().length);
        if (Math.sign(g.p2.x - g.p1.x) !== Math.sign(x0 - g.p1.x)) passed = true;
        if (g.p2.isNeutral() && !(g.p2.strikes && g.p2.strikes.length) && !(g.p2.stormT > 0) && g.projectiles.get().length === 0 && i > 20) { frames = i; break; }
        frames = i;
      }
      delete g.ai2.update;
      return { ok, dmg: g.p1.maxHp - minHp, frames, passed, maxProj, heal: g.p2.hp - hp2, p1: g.p1.state };
    };
  });

  // 1) every ability of every god: starts, finishes, and damages a standing player
  const all = await page.evaluate(() => {
    const out = {};
    const distFor = { bite: 200, tailSweep: 220, slam: 300, clawRush: 260, solarFlare: 240, solarExplosion: 300, soulDrain: 260, regen: 500,
      teleport: 400, shadowDash: 420, lightDash: 420, charge: 500, leap: 520, dive: 420, soulSlash: 500, summonSpirits: 500, sunOrbs: 500,
      windBolts: 500, lightning: 400, sandstorm: 300, fakeOut: 300, sunBeam: 500 };
    for (const id of SA.Bosses.ORDER) {
      T.boss(id);
      const abil = new Set();
      for (const ph of SA.BOSSES[id].phases) for (const a of ph.abilities) abil.add(a.id);
      for (const ab of abil) {
        const r = T.ability(ab, distFor[ab] || 400, [], { count: 3, double: true });
        out[id + ':' + ab] = r;
      }
    }
    return out;
  });
  const noDamageOk = { regen: 1, sandstorm: 1, fakeOut: 1 };
  const bad = Object.entries(all).filter(([k, r]) => !r.ok || r.frames >= 259 || (!noDamageOk[k.split(':')[1]] && r.dmg <= 0));
  check('every god ability starts, ends and lands on a standing player', bad.length === 0 && Object.keys(all).length >= 25, bad.length ? bad : Object.keys(all).length + ' abilities');

  // 2) counters: each dangerous move has a way out
  const counters = await page.evaluate(() => {
    const out = {};
    T.boss('sobek');
    // tail sweep: jump over it (press up ~ as the tail comes)
    out.tailJump = T.ability('tailSweep', 220, (i) => (i === 10 ? ['!up', 'up'] : [])).dmg;
    out.tailStand = T.ability('tailSweep', 220, []).dmg;
    // bite (grab) can't be blocked but a backstep gets away
    out.biteBlock = T.ability('bite', 200, ['block']).dmg;
    out.biteBack = T.ability('bite', 200, (i) => (i === 6 ? ['left', '!dash'] : i < 30 ? ['left'] : [])).dmg;
    T.boss('set');
    // lightning: walk out of the marked spot
    out.lightStay = T.ability('lightning', 400, [], { count: 1 }).dmg;
    out.lightWalk = T.ability('lightning', 400, (i) => (i > 20 && i < 70 ? ['left'] : []), { count: 1 }).dmg;
    T.boss('ra');
    // sun beam: high -> crouch, low -> jump; force each variant
    const beam = (high, hold) => {
      const orig = Math.random;
      Math.random = () => (high ? 0.1 : 0.9);
      const r = T.ability('sunBeam', 500, hold);
      Math.random = orig;
      return r.dmg;
    };
    out.beamHighStand = beam(true, []);
    out.beamHighCrouch = beam(true, ['down']);
    out.beamLowStand = beam(false, []);
    out.beamLowJump = beam(false, (i) => (i === 22 ? ['!up', 'up'] : []));
    out.beamBlock = beam(true, ['block']);
    T.boss('anubis');
    out.slashBlock = T.ability('soulSlash', 500, ['block'], {}).dmg;
    out.slashStand = T.ability('soulSlash', 500, [], {}).dmg;
    return out;
  });
  check('tail sweep: jump it', counters.tailJump === 0 && counters.tailStand > 0, counters);
  check('bite: unblockable grab, a backstep escapes', counters.biteBlock > 40 && counters.biteBack === 0, counters);
  check('lightning: walk out of the marker', counters.lightWalk === 0 && counters.lightStay > 0, counters);
  check('sun beam: crouch the high one, jump the low one, block for chip', counters.beamHighCrouch === 0 && counters.beamHighStand > 0 &&
    counters.beamLowJump === 0 && counters.beamLowStand > 0 && counters.beamBlock > 0 && counters.beamBlock < counters.beamHighStand * 0.3, counters);
  check('soul slash can be blocked (chip only)', counters.slashBlock > 0 && counters.slashBlock < counters.slashStand * 0.3, counters);

  // 3) Anubis: shadow dash passes through the player; teleport in a plan only repositions
  const anubis = await page.evaluate(() => {
    const g = SA.game;
    T.boss('anubis');
    const dash = T.ability('shadowDash', 420, ['block']);
    const tp = T.ability('teleport', 400, [], { follow: false });
    T.fightNow();
    // an AI combo that starts with a teleport: ab:teleport -> light -> light -> heavy
    g.p1.reset(-250, 1); g.p2.reset(250, -1);
    g.ai2.reset();
    g.ai2.abilities.forEach((a) => { a.cdLeft = 0; });
    g.ai2.startPlan('ATTACK', ['ab:teleport', 'light', 'light', 'heavy']);
    const seen = [];
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      T.run(1);
      const tag = g.p2.state === 'bossmove' ? 'bm:' + g.p2.bm.id : g.p2.state === 'attack' ? 'atk' : null;
      if (tag && seen[seen.length - 1] !== tag) seen.push(tag);
      hits = Math.max(hits, g.p2.combo.hits);
      g.p1.hp = g.p1.maxHp;
    }
    return { dashPassed: dash.passed, dashDmg: dash.dmg, tpFrames: tp.frames, tpAttack: tp.p1, planSeen: seen, planHits: hits };
  });
  check('Anubis shadow dash passes through (cross-up) and hits', anubis.dashPassed && anubis.dashDmg > 0, anubis);
  check('Anubis combo: teleport -> slash -> slash -> heavy', anubis.planSeen[0] === 'bm:teleport' && anubis.planSeen.filter((x) => x === 'atk').length >= 1, anubis);

  // 4) boss intro: darkness with eyes, then name, then FIGHT (~2.5-3 s)
  const intro = await page.evaluate(() => {
    const g = SA.game;
    T.boss('anubis');
    const o = { phaseAt: [], names: [] };
    let x0 = g.p2.x, xStart = null;
    for (let i = 0; i < 240; i++) {
      T.run(1);
      if (i === 5) xStart = g.p2.x;
      const a = g.ui.announce;
      if (a && a.text && o.names[o.names.length - 1] !== a.text) o.names.push(a.text);
      if (g.match.phase === 'fight' && o.fightAt === undefined) o.fightAt = i;
      if (i === 10) o.glowEarly = g.p2.introGlow;
    }
    o.xStart = Math.round(xStart); o.xEnd = Math.round(g.p2.x); o.x0 = Math.round(x0);
    return o;
  });
  check('boss intro: god walks out of the dark, name + title, then FIGHT', intro.names.includes('ANUBIS') && intro.names.includes('FIGHT!') &&
    intro.fightAt > 140 && intro.fightAt < 200 && intro.glowEarly > 1 && intro.xStart > intro.xEnd, intro);

  // 5) phases: mood changes, Osiris second life, Sekhmet berserk
  const phases = await page.evaluate(() => {
    const g = SA.game, o = {};
    T.boss('anubis'); T.fightNow();
    g.p2.hp = g.p2.maxHp * 0.5; T.run(3);
    o.anubisDark = g.bossFx.dark; o.anubisEye = g.p2.look.eyeBoost;
    T.boss('ra'); T.fightNow();
    g.p2.hp = g.p2.maxHp * 0.5; T.run(3);
    o.raLight = g.bossFx.light;
    T.boss('sekhmet'); T.fightNow();
    g.p2.hp = g.p2.maxHp * 0.35; T.run(3);
    o.sekhmetPhase = g.p2.bossPhase; o.sekhmetRage = g.ai2.rage;
    T.boss('set'); T.fightNow();
    g.p2.hp = g.p2.maxHp * 0.5; T.run(3);
    o.setStorm = g.arena.forceLightning;
    T.boss('osiris'); T.fightNow();
    g.p2.hp = 5;
    g.p1.reset(g.p2.x - 150, 1);
    g.input.queue.push('heavy');
    for (let i = 0; i < 60 && g.p2.hp > 0 && !g.p2.revived; i++) T.run(1);
    T.run(5);
    o.osirisRevived = !!g.p2.revived; o.osirisHp = Math.round(g.p2.hp / g.p2.maxHp * 100); o.osirisMatch = g.match.phase;
    // the second defeat is final
    g.p2.hp = 0; T.run(20);
    o.osirisFinal = g.match.phase;
    return o;
  });
  check('phase moods: Anubis darkens + eyes glow, Ra brightens, Set storms', phases.anubisDark > 0.3 && phases.anubisEye >= 1 && phases.raLight > 0.2 && phases.setStorm, phases);
  check('Sekhmet goes berserk below 40 %', phases.sekhmetPhase === 2 && phases.sekhmetRage > 1, phases);
  check('Osiris second life (once)', phases.osirisRevived && phases.osirisHp >= 40 && phases.osirisMatch === 'fight' && phases.osirisFinal === 'ko', phases);

  // 6) boss scale: Sobek is big, the body collider scales with him, no overlap in AI fights
  const scale = await page.evaluate(() => {
    const g = SA.game, o = {};
    for (const id of ['sobek', 'anubis', 'sekhmet']) { T.boss(id); o[id] = +g.p2.look.scale.toFixed(2); }
    T.boss('sobek'); T.fightNow();
    g.p1.ctrl = new SA.Controller();
    g.ai1 = new SA.EnemyAI(g.p1, g.p2, g, { params: SA.EnemyGen.aiParams(20), profile: SA.ARCHETYPES.jackal_assassin.ai });
    let worst = 0;
    for (let i = 0; i < 1500; i++) {
      g.tick(); g.p1.hp = Math.max(g.p1.hp, 500); g.p2.hp = Math.max(g.p2.hp, 500);
      const a = g.p1, b = g.p2;
      if (a.body.pass || b.body.pass || !a.grounded || !b.grounded || a.state === 'down' || b.state === 'down' || a.state === 'hitstun' && b.bm && b.bm.grabbed) continue;
      worst = Math.max(worst, SA.Physics.minDistance(a, b) - Math.abs(a.x - b.x));
    }
    g.ai1 = null;
    o.minSep = Math.round(SA.Physics.minDistance(g.p1, g.p2));
    o.worstOverlap = Math.round(worst);
    return o;
  });
  check('god scales (mummy 1.0, Anubis 1.15, Sekhmet 1.1, Sobek 1.4) + collider', scale.sobek === 1.4 && scale.anubis === 1.15 && scale.sekhmet === 1.1 && scale.minSep > 120 && scale.worstOverlap <= 30, scale);

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + '  ' + JSON.stringify(x.info));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
