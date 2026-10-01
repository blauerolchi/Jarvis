// AI on platforms + acceptance test 56: the AI never waits under a player standing on a platform
// (jumps up, takes a lower platform first, or shoots up), drops / dives onto a player below, chases in
// the air, and over 30 s of AI vs AI shows approach, retreat, jumps, platform changes, rolls, air
// attacks, counters, ranged attacks and combos. Usage: NODE_PATH=$(npm root -g) node tests/aiplatform.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const res = await page.evaluate(() => {
    const g = SA.game, R = {};
    const fight = (arch, stage, p1ai, seed) => {
      const def = SA.EnemyGen.generate(stage, 'normal', seed || 11, false, arch);
      g.scene = 'fight';
      g.arenaRun = { stage, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
      g.setupWorld({ mode: 'arena', arena: 'desert_temple', enemy: def });
      g.transition = null; g.fade = 0;
      g.match.phase = 'fight';
      for (const f of [g.p1, g.p2]) if (f.state === 'intro') f.setState('idle');
      if (p1ai) {
        g.p1.ctrl = new SA.Controller();
        g.ai1 = new SA.EnemyAI(g.p1, g.p2, g, { params: SA.EnemyGen.aiParams(26), profile: SA.normalizeAIProfile({}) });
      } else g.ai1 = null;
      g.p1.hp = g.p1.maxHp = 99999; g.p2.hp = g.p2.maxHp = 99999;
    };
    const P = () => SA.Physics.platforms;
    const putOn = (f, q, dx) => { f.x = q.x + (dx || 0); f.y = q.y; f.plat = q; f.grounded = true; f.vx = 0; f.vy = 0; f.setState('idle'); };

    // 1. player on the high platform, AI on the floor
    const under = { frames: 0, reached: 0, shotsUp: 0, jumps: 0 };
    for (const arch of ['desert_bandit', 'jackal_assassin', 'tomb_guard']) {
      fight(arch, 20, false, 7);
      const high = P().find((q) => q.y < -400);
      putOn(g.p1, high, 0);
      g.p2.x = high.x + 160; g.p2.y = 0; g.p2.plat = null; g.p2.grounded = true;
      let reached = false, beneath = 0;
      for (let i = 0; i < 480; i++) {
        g.input.heldActions = new Set();
        g.tick();
        g.p1.hp = 99999;
        if (g.p1.state === 'idle' && g.p1.plat !== high) putOn(g.p1, high, 0);   // the "player" keeps standing up there
        const a = g.p2;
        if (a.grounded && a.y < -150) reached = true;
        if (a.grounded && a.y === 0 && Math.abs(a.x - g.p1.x) < 140) beneath++;
      }
      under.frames = Math.max(under.frames, beneath);
      if (reached) under.reached++;
      under.shotsUp += g.ai2.used.rangedUp || 0;
      under.jumps += g.ai2.used.platformJump || 0;
    }
    R.under = under;

    // 2. AI on a platform, player below -> drops / walks off / dives
    const drop = { left: 0, dives: 0 };
    for (const arch of ['desert_bandit', 'jackal_assassin', 'anubis_acolyte']) {
      fight(arch, 20, false, 9);
      const low = P().find((q) => q.y > -400 && q.x > 0);
      putOn(g.p2, low, 0);
      g.p1.x = low.x - 120; g.p1.y = 0; g.p1.plat = null; g.p1.grounded = true;
      let left = false;
      for (let i = 0; i < 300; i++) { g.input.heldActions = new Set(); g.tick(); if (g.p2.grounded && g.p2.y === 0) left = true; }
      if (left) drop.left++;
      drop.dives += (g.ai2.used.diveAttack || 0) + (g.ai2.used.platformDrop || 0);
    }
    R.drop = drop;

    // 3. acceptance 56: 30 s AI vs AI
    const used = {};
    let platFrames = 0, airFrames = 0;
    for (const arch of ['jackal_assassin', 'desert_bandit', 'anubis_acolyte', 'desert_archer']) {
      fight(arch, 28, true, 13);
      for (let i = 0; i < 1800; i++) {
        g.tick(); g.p1.hp = Math.max(g.p1.hp, 1000); g.p2.hp = Math.max(g.p2.hp, 1000);
        if (g.p2.grounded && g.p2.y < -100) platFrames++;
        if (!g.p2.grounded) airFrames++;
      }
      for (const [k, v] of Object.entries(g.ai2.used)) used[k] = (used[k] || 0) + v;
    }
    R.used = used;
    R.platFrames = platFrames; R.airFrames = airFrames;
    return R;
  });
  const u = res.used;
  const has = (...keys) => keys.some((k) => (u[k] || 0) > 0);
  const checks = [
    ['AI does not wait under a player on a platform', res.under.frames < 120 && (res.under.reached >= 2 || res.under.shotsUp > 0), res.under],
    ['AI reaches the high tier (via a low platform)', res.under.reached >= 2, res.under],
    ['AI on a platform comes down to a player below', res.drop.left >= 2, res.drop],
    ['56: approach', has('run', 'sprint', 'dash')],
    ['56: retreat', has('backstep', 'handspring', 'intent:KEEP_DISTANCE', 'intent:ESCAPE')],
    ['56: jumps', has('jump', 'jumpBack', 'flip', 'platformJump')],
    ['56: platform changes', (u.platformJump || 0) + (u.platformDrop || 0) > 0 && res.platFrames > 30, { pj: u.platformJump, pd: u.platformDrop, platFrames: res.platFrames }],
    ['56: roll', has('roll')],
    ['56: air attack', has('airAttack', 'diveAttack'), { air: u.airAttack, dive: u.diveAttack }],
    ['56: counter / punish', has('counter', 'punish', 'baitPunish')],
    ['56: ranged', has('rangedUp') || (u['intent:RANGED_PRESSURE'] || 0) > 0],
    ['56: combo', has('combo', 'intent:COMBO')],
  ];
  let fail = 0;
  for (const [name, ok, info] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + JSON.stringify(info) : '')); if (!ok) fail++; }
  console.log(JSON.stringify(res.used));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  console.log(fail ? `${fail} FAILED` : `ALL ${checks.length} CHECKS PASSED`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
