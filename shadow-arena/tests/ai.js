// AI acceptance tests: movement variety, weapon spacing per archetype, intent dwell, reaction delay,
// real combos, corner escapes, baits, AI + body collision. Usage: NODE_PATH=$(npm root -g) node tests/ai.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };

  await page.evaluate(() => {
    const g = SA.game;
    // arena fight: p2 = generated archetype (AI), p1 = either an AI too or a scripted "player"
    T.arenaFight = (arch, stage, opts) => {
      opts = opts || {};
      const def = arch && SA.BOSSES && SA.BOSSES[arch] ? SA.Bosses.generate(stage, stage, 'normal', SA.M.seeded(5), arch)
        : SA.EnemyGen.generate(stage, 'normal', opts.seed || 11, false, arch);
      g.scene = 'fight';
      g.arenaRun = { stage, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
      g.setupWorld({ mode: 'arena', arena: def.arena, enemy: def });
      g.transition = null; g.fade = 0;
      g.match.phase = 'fight';
      for (const f of [g.p1, g.p2]) if (f.state === 'intro') f.setState('idle');
      if (opts.p1ai) {
        g.p1.ctrl = new SA.Controller();
        g.ai1 = new SA.EnemyAI(g.p1, g.p2, g, { params: SA.EnemyGen.aiParams(opts.p1stage || 15), profile: SA.normalizeAIProfile({}) });
      } else g.ai1 = null;
      g.p1.hp = g.p1.maxHp = 99999;      // the fight never ends early
      g.p2.hp = g.p2.maxHp = 99999;
      return def;
    };
    T.hold = (n, hold) => { for (let i = 0; i < n; i++) { g.input.heldActions = new Set(hold || []); g.tick(); } };
  });

  // T9: over several AI-vs-AI fights the enemies use many different movement options
  const t9 = await page.evaluate(() => {
    const g = SA.game, used = {};
    for (const arch of ['desert_bandit', 'jackal_assassin', 'anubis_acolyte', 'cursed_mummy', 'tomb_guard', 'serpent_priest']) {
      T.arenaFight(arch, 31, { p1ai: true, p1stage: 26 });
      for (let i = 0; i < 1500; i++) { g.tick(); g.p1.hp = Math.max(g.p1.hp, 1000); g.p2.hp = Math.max(g.p2.hp, 1000); }
      for (const [k, v] of Object.entries(g.ai2.used)) used[k] = (used[k] || 0) + v;
    }
    return used;
  });
  const moveKinds = ['dash', 'backstep', 'roll', 'jump', 'jumpBack', 'run', 'sprint', 'slide', 'runAttack', 'flip', 'airdash', 'handspring', 'feint'].filter((k) => t9[k] > 0);
  check('T9 AI uses many movement options', moveKinds.length >= 6, { moveKinds, used: t9 });
  const intents = Object.keys(t9).filter((k) => k.startsWith('intent:')).map((k) => k.slice(7));
  check('AI switches between several intents', intents.length >= 5, intents);
  check('AI baits / frame traps / counters', (t9.bait || 0) + (t9.frameTrap || 0) + (t9.baitPunish || 0) > 0 && (t9.punish || 0) > 0, { bait: t9.bait, trap: t9.frameTrap, bp: t9.baitPunish, punish: t9.punish, counter: t9.counter });

  // T10: spacing — spear guard holds range, assassin hugs. Measured against a passive player who
  // walks back and forth (never attacks), only while the AI is moving (not attacking).
  const t10 = await page.evaluate(() => {
    const g = SA.game;
    const measure = (arch) => {
      T.arenaFight(arch, 12, {});
      let sum = 0, n = 0;
      for (let i = 0; i < 2600; i++) {
        // the "player" mostly stands and now and then steps in or out
        const ph = i % 150;
        const hold = ph < 18 ? ['right'] : ph > 75 && ph < 90 ? ['left'] : [];
        T.hold(1, hold);
        // spacing = where it walks to on its own (baits deliberately hover at the opponent's reach)
        if (g.p2.isNeutral() && g.ai2.state === 'IDLE' && g.ai2.intent !== 'BAIT' && i > 60) { sum += Math.abs(g.p2.x - g.p1.x); n++; }
      }
      return { avg: Math.round(sum / Math.max(1, n)), n, opt: g.p2.weapon.ranges.opt, weapon: g.p2.weapon.id };
    };
    return { spear: measure('tomb_guard'), assassin: measure('jackal_assassin'), archer: measure('desert_archer') };
  });
  check('T10 spear guard keeps range, assassin gets close', t10.spear.avg > t10.assassin.avg + 60, t10);
  check('archer keeps the most distance', t10.archer.avg > t10.spear.avg, t10);

  // intents persist: no per-frame flip-flopping
  const dwell = await page.evaluate(() => {
    const g = SA.game;
    T.arenaFight('anubis_acolyte', 21, { p1ai: true });
    let switches = 0, last = null;
    for (let i = 0; i < 1200; i++) {
      g.tick(); g.p1.hp = Math.max(g.p1.hp, 1000); g.p2.hp = Math.max(g.p2.hp, 1000);
      if (g.ai2.intent !== last) { switches++; last = g.ai2.intent; }
    }
    return { perSecond: +(switches / 20).toFixed(2), switches };
  });
  check('intents are kept for a while (< 1.5 switches / s)', dwell.perSecond < 1.5 && dwell.switches > 3, dwell);

  // reaction delay: the AI can only answer an attack after its reaction time (no input reading)
  const react = await page.evaluate(() => {
    const g = SA.game;
    const out = {};
    for (const [label, kind, stage] of [['normal', 'normal', 5], ['elite', 'elite', 25], ['boss', 'boss', 30]]) {
      const P = SA.EnemyGen.aiParams(stage, kind);
      out[label] = Math.round(P.react / 60 * 1000);
    }
    // measured: frames between the player's attack starting and the AI *perceiving* it
    T.arenaFight('royal_guard', 21, {});
    const delays = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      g.p1.reset(-400, 1); g.p2.reset(400, -1); g.ai2.reset();
      g.ai2.update = ((orig) => function (ts) { orig.call(this, ts); this.ctrl.hold.clear(); this.ctrl.clearBuffer(); })(SA.EnemyAI.prototype.update);
      T.hold(20, []);
      g.input.queue.push('light');
      let start = -1, seen = -1;
      for (let i = 0; i < 40; i++) {
        T.hold(1, []);
        if (start < 0 && g.p1.state === 'attack') start = i;
        if (seen < 0 && g.ai2.perceived && g.ai2.perceived.state === 'attack') seen = i;
      }
      if (start >= 0 && seen >= 0) delays.push(seen - start);
    }
    out.measuredFrames = delays;
    out.react = Math.round(g.ai2.D.react);
    return out;
  });
  check('reaction time tiers (normal 200-400, elite 140-250, boss 100-220 ms)',
    react.normal >= 200 && react.normal <= 400 && react.elite >= 140 && react.elite <= 250 && react.boss >= 100 && react.boss <= 220, react);
  check('AI perceives attacks only after its reaction time', react.measuredFrames.length > 0 && react.measuredFrames.every((d) => d >= react.react - 1), react);

  // combos: AI lands real multi-hit sequences
  const combos = await page.evaluate(() => {
    const g = SA.game;
    T.arenaFight('desert_bandit', 31, {});
    let best = 0;
    for (let i = 0; i < 2400; i++) { T.hold(1, []); if (g.p2.combo.hits > best) best = g.p2.combo.hits; g.p1.hp = Math.max(g.p1.hp, 1000); }
    return { best, seqs: g.ai2.profile.combos.length };
  });
  check('AI lands multi-hit combos', combos.best >= 3, combos);

  // corner: pressed into the corner, the AI escapes (roll / jump / push) or guards instead of staying pinned
  const corner = await page.evaluate(() => {
    const g = SA.game;
    T.arenaFight('jackal_assassin', 26, {});
    g.p2.reset(SA.WALL - 10, -1); g.p1.reset(SA.WALL - 190, 1); g.ai2.reset();
    const x0 = g.p2.x;
    let escaped = false, minD = 1e9;
    for (let i = 0; i < 480; i++) {
      T.hold(1, i % 40 < 6 ? ['right'] : []);
      if (i % 30 === 0) g.input.queue.push('light');
      if (g.p2.x < g.p1.x || Math.abs(g.p2.x) < SA.WALL - 350) escaped = true;
      const both = g.p1.grounded && g.p2.grounded && g.p1.state !== 'roll' && g.p2.state !== 'roll';
      if (both) minD = Math.min(minD, Math.abs(g.p2.x - g.p1.x) - SA.Physics.minDistance(g.p1, g.p2));
    }
    return { escaped, used: g.ai2.used, minD: Math.round(minD) };
  });
  check('cornered AI escapes', corner.escaped, corner);

  // AI + collision: across AI-vs-AI fights the bodies never sink into each other (grounded, not rolling)
  const coll = await page.evaluate(() => {
    const g = SA.game;
    // a landing on top of the opponent is pushed apart smoothly over a few frames (no position jump);
    // what must never happen is bodies staying inside each other
    let worst = 0, frames = 0, at = null, run = 0, longest = 0;
    for (const arch of ['scarab_warrior', 'jackal_assassin', 'tomb_executioner', 'desert_bandit']) {
      T.arenaFight(arch, 36, { p1ai: true });
      for (let i = 0; i < 900; i++) {
        g.tick(); g.p1.hp = Math.max(g.p1.hp, 1000); g.p2.hp = Math.max(g.p2.hp, 1000);
        const a = g.p1, b = g.p2;
        const pass = a.body.pass || b.body.pass || !a.grounded || !b.grounded || a.state === 'down' || b.state === 'down' || Math.abs(a.y - b.y) > 100;   // one on a platform above the other
        if (!pass) {
          const ov = SA.Physics.minDistance(a, b) - Math.abs(a.x - b.x);
          if (ov > worst) { worst = ov; at = [a.state, b.state, a.move && a.move.id, b.move && b.move.id, Math.round(a.x), Math.round(b.x)]; }
          run = ov > 30 ? run + 1 : 0;
          longest = Math.max(longest, run);
          frames++;
        } else run = 0;
      }
    }
    return { worstOverlap: +worst.toFixed(1), overlapRun: longest, frames, at };
  });
  check('AI + collision: bodies never stay inside each other', coll.overlapRun <= 4 && coll.worstOverlap < 110 && coll.frames > 1000, coll);

  // archetypes use their mobility: tomb guard / scarab barely dash, jackal assassin dashes a lot
  const mob = await page.evaluate(() => {
    const g = SA.game, out = {};
    for (const arch of ['scarab_warrior', 'jackal_assassin']) {
      T.arenaFight(arch, 21, { p1ai: true });
      for (let i = 0; i < 3000; i++) { g.tick(); g.p1.hp = Math.max(g.p1.hp, 1000); g.p2.hp = Math.max(g.p2.hp, 1000); }
      const u = g.ai2.used;
      out[arch] = (u.dash || 0) + (u.backstep || 0) + (u.roll || 0) + (u.slide || 0) + (u.jump || 0) + (u.jumpBack || 0) + (u.flip || 0) + (u.airdash || 0) + (u.handspring || 0);
    }
    return out;
  });
  check('archetype mobility differs (assassin >> scarab)', mob.jackal_assassin >= mob.scarab_warrior * 2 + 3, mob);

  // stage progression: early stages are tomb guards only; new types join later
  const ladder = await page.evaluate(() => {
    const at = (s) => [...new Set(Array.from({ length: 40 }, (_, i) => SA.EnemyGen.generate(s, 'normal', i + 1).archetype))].sort();
    return { s2: at(2), s7: at(7), s15: at(15), s25: at(25) };
  });
  check('ladder introduces archetypes gradually', ladder.s2.join() === 'tomb_guard' && ladder.s7.length >= 3 && ladder.s15.includes('jackal_assassin') && ladder.s25.length >= 9, ladder);

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + '  ' + JSON.stringify(x.info));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
