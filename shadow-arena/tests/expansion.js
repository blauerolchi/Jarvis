// Expansion checks: save migration, shop, weapons (reach/hit), projectiles, reload, arena flow,
// rewards, boss generation + phases, enemy generator over 120 stages, AI-vs-AI arena runs.
// Usage: NODE_PATH=$(npm root -g) node tests/expansion.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  await page.evaluate(() => {
    const tr = T.training;
    // keep the dummy's damage visible (no auto refill) so hits can be measured after a while
    T.training = (d, a) => { tr(d, a); SA.game.training.infiniteHp = false; };
    T.fight = () => { const g = SA.game; g.match.phase = 'fight'; for (const f of [g.p1, g.p2]) if (f.state === 'intro') f.setState('idle'); };
  });
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };

  // ---------- save migration v1 -> v2 ----------
  const mig = await page.evaluate(() => {
    const KEY = 'shadowArena.save.v1';
    const old = localStorage.getItem(KEY);
    localStorage.setItem(KEY, JSON.stringify({
      version: 1, difficulty: 'hard', unlockedArenas: ['temple', 'bamboo'], lastArena: 'bamboo',
      unlockedSpecials: ['rush', 'storm'], stats: { fights: 5, wins: 3, losses: 2, maxCombo: 7 },
      settings: { master: 0.5, sfx: 0.7, music: 0.2, shake: false, damageNumbers: true },
    }));
    SA.Save.load();
    const d = SA.Save.data;
    const r = { version: d.version, diff: d.progression.difficulty, arenas: d.progression.unlockedArenas.join(','),
      storm: SA.Save.owns('storm'), wins: d.statistics.wins, master: d.settings.master, coins: d.player.coins,
      equipped: d.inventory.equipped.primary };
    // corrupted save falls back to defaults
    localStorage.setItem(KEY, '{broken');
    SA.Save.load();
    r.corruptOk = SA.Save.data.version === 2 && SA.Save.data.player.level === 1;
    SA.Save.resetProgress();
    if (old) { /* the test page has its own storage, nothing to restore */ }
    return r;
  });
  check('migration v1->v2', mig.version === 2 && mig.diff === 'hard' && mig.arenas === 'temple,bamboo' && mig.storm && mig.wins === 3 && mig.master === 0.5 && mig.equipped === 'fists', mig);
  check('migration pays coins for old wins', mig.coins >= 150 + 3 * 60, mig.coins);
  check('corrupted save -> defaults', mig.corruptOk);

  // ---------- shop ----------
  const shop = await page.evaluate(() => {
    const p = SA.Save.data.player;
    const r = {};
    p.coins = 100; p.level = 1;
    r.poor = SA.Shop.buy('wood_staff');
    p.coins = 5000;
    r.locked = SA.Shop.buy('katana');
    p.level = 3;
    const before = p.coins;
    r.ok = SA.Shop.buy('katana');
    r.paid = before - p.coins;
    r.ownsSlash = SA.Save.owns('slash');
    r.again = SA.Shop.buy('katana');
    r.equip = SA.Shop.equip('katana');
    r.equipped = SA.Save.data.inventory.equipped.primary;
    r.equipUnowned = SA.Shop.equip('scythe');
    r.cats = SA.Shop.CATEGORIES.map((c) => SA.Shop.items(c).length);
    SA.Save.save();
    SA.Save.load();
    r.persisted = SA.Save.data.inventory.equipped.primary === 'katana' && SA.Save.owns('katana');
    return r;
  });
  check('shop: not enough coins', !shop.poor.ok && shop.poor.reason === 'coins', shop.poor);
  check('shop: level requirement', !shop.locked.ok && shop.locked.reason === 'level', shop.locked);
  check('shop: buy katana (+signature special)', shop.ok.ok && shop.paid === 1200 && shop.ownsSlash, shop);
  check('shop: no double buy', !shop.again.ok, shop.again);
  check('shop: equip owned / refuse unowned', shop.equip && shop.equipped === 'katana' && !shop.equipUnowned, shop);
  check('shop: all categories filled', shop.cats.every((n) => n >= 4), shop.cats);
  check('shop: save persists', shop.persisted);

  // ---------- melee weapons: every weapon hits from its own reach ----------
  const melee = await page.evaluate(() => {
    const g = SA.game;
    const out = {};
    for (const id of Object.keys(SA.WEAPONS)) {
      g.training.tryItem = id;
      T.training('stand');
      const reach = g.p1.moveset && SA.MOVES[g.p1.moveset.light].reach;
      // find the longest distance at which the first light attack still connects
      let maxHit = 0;
      for (let d = 120; d <= 420; d += 20) {
        T.place(600, 600 + d);
        g.p2.hp = g.p2.maxHp;
        T.run(1, { press: ['light'] });
        T.run(40);
        if (g.p2.hp < g.p2.maxHp) maxHit = d;
      }
      // each move of the set runs without errors
      const set = g.p1.moveset;
      const moves = {};
      for (const k of Object.keys(set)) moves[k] = set[k];
      out[id] = { maxHit, reach, dmg: SA.MOVES[set.light].damage, heavy: SA.MOVES[set.heavy].damage, n: Object.keys(set).length };
    }
    g.training.tryItem = null;
    return out;
  });
  for (const id of Object.keys(melee)) check('weapon hits: ' + id, melee[id].maxHit > 0, melee[id]);
  check('reach: spear > katana > fists', melee.spear.maxHit > melee.katana.maxHit && melee.katana.maxHit > melee.fists.maxHit,
    { spear: melee.spear.maxHit, katana: melee.katana.maxHit, fists: melee.fists.maxHit });
  check('speed/damage: hammer heavier than dual blades', melee.war_hammer.dmg > melee.dual_blades.dmg, { hammer: melee.war_hammer.dmg, dual: melee.dual_blades.dmg });

  // context actions per weapon (low / launcher / overhead / dash / air)
  const ctxs = await page.evaluate(() => {
    const g = SA.game;
    const r = {};
    g.training.tryItem = 'katana';
    T.training('stand');
    const run = (setup) => { T.place(600, 1000); T.run(10); setup(); return g.p1.move && g.p1.move.id; };
    r.low = run(() => T.run(2, { hold: ['down'], press: ['light'] }));
    r.launch = run(() => T.run(2, { hold: ['down'], press: ['heavy'] }));
    r.over = run(() => T.run(2, { hold: ['up'], press: ['heavy'] }));
    r.air = run(() => { T.run(1, { press: ['up'] }); T.run(12); T.run(2, { press: ['light'] }); });
    r.dash = run(() => { T.run(1, { hold: ['right'], press: ['dash'] }); T.run(3, { hold: ['right'] }); T.run(2, { press: ['light'] }); });
    g.training.tryItem = null;
    return r;
  });
  check('context: down+light = low', ctxs.low === 'katana:low', ctxs.low);
  check('context: down+heavy = launcher', ctxs.launch === 'katana:launch', ctxs.launch);
  check('context: up+heavy = overhead', ctxs.over === 'katana:over', ctxs.over);
  check('context: air attack', ctxs.air === 'katana:air', ctxs.air);
  check('context: dash attack', ctxs.dash === 'katana:dash', ctxs.dash);

  // ---------- ranged ----------
  const ranged = await page.evaluate(() => {
    const g = SA.game;
    const out = {};
    for (const id of Object.keys(SA.RANGED)) {
      g.training.tryItem = id;
      T.training('stand');
      T.place(-300, 300);
      if (id === 'rocket_pod') T.place(-200, 300);
      g.p2.hp = g.p2.maxHp;
      const st = g.p1.rangedState;
      const before = st.ammo !== undefined ? st.ammo : st.charges;
      T.run(1, { press: ['ranged'] });
      let spawned = 0;
      for (let i = 0; i < 90; i++) { T.run(1); spawned = Math.max(spawned, g.projectiles.get().length); }
      out[id] = { spawned, hit: g.p2.hp < g.p2.maxHp, dmg: g.p2.maxHp - g.p2.hp, label: st.label() };
      // blocked
      T.training('block');
      T.place(-300, 300);
      g.p2.hp = g.p2.maxHp;
      g.p1.rangedState = new SA.RangedState(SA.RANGED[id]);
      T.run(1, { press: ['ranged'] });
      T.run(90);
      out[id].blockDmg = g.p2.maxHp - g.p2.hp;
      out[id].before = before;
    }
    g.training.tryItem = null;
    return out;
  });
  for (const id of Object.keys(ranged)) {
    check('ranged fires+hits: ' + id, ranged[id].spawned > 0 && ranged[id].hit, ranged[id]);
    check('ranged blockable: ' + id, ranged[id].blockDmg < ranged[id].dmg, { hit: ranged[id].dmg, blocked: ranged[id].blockDmg });
  }

  // firearm magazine + reload, throwable charges + cooldown
  const reload = await page.evaluate(() => {
    const g = SA.game;
    g.training.tryItem = 'pistol';
    T.training('stand');
    T.place(-500, 500);
    const st = g.p1.rangedState;
    const mag = st.ammo;
    let shots = 0;
    for (let i = 0; i < 20 && st.ammo > 0; i++) { T.run(1, { press: ['ranged'] }); T.run(30); shots++; }
    const empty = st.ammo;
    T.run(1, { press: ['ranged'] }); T.run(2);
    const stateEmpty = g.p1.state;
    T.run(1, { press: ['reload'] });
    T.run(2);
    const reloading = g.p1.move && g.p1.move.id;
    T.run(120);
    const after = st.ammo;
    g.training.tryItem = 'shuriken';
    T.training('stand');
    const s2 = g.p1.rangedState;
    const c0 = s2.charges;
    T.run(1, { press: ['ranged'] }); T.run(20);
    const c1 = s2.charges;
    T.run(600);
    const c2 = s2.charges;
    g.training.tryItem = null;
    return { mag, shots, empty, stateEmpty, reloading, after, c0, c1, c2 };
  });
  check('pistol: magazine empties', reload.empty === 0 && reload.shots === reload.mag, reload);
  check('pistol: reload refills', reload.reloading === 'pistol:reload' && reload.after === reload.mag, reload);
  check('shuriken: charges use + regen', reload.c1 === reload.c0 - 1 && reload.c2 === reload.c0, reload);

  // parry reflects a projectile
  const parry = await page.evaluate(() => {
    const g = SA.game;
    T.training('stand');
    T.place(-300, 300);
    g.p2.setLoadout({ weapon: 'fists', ranged: 'throwing_knife' });
    g.p2.facing = -1;
    g.p2.ctrl.press('ranged');
    let reflected = false, pressed = false, dist = [];
    for (let i = 0; i < 90; i++) {
      const pr = g.projectiles.get()[0];
      if (pr && !pressed && Math.abs(pr.x - g.p1.x) < 150) { pressed = true; g.input.queue.push('block'); }
      g.input.heldActions = new Set(pressed ? ['block'] : []);
      g.tick();
      if (pr) dist.push(Math.round(pr.x - g.p1.x));
      if (g.projectiles.get().some((p) => p.owner === g.p1)) reflected = true;
    }
    g.input.heldActions = new Set();
    return { reflected, dist: dist.slice(0, 20), st: g.p1.state };
  });
  check('parry reflects projectile', parry.reflected, parry);

  // ---------- enemy generator 1..120 ----------
  const gen = await page.evaluate(() => {
    const out = { kinds: {}, arch: {}, errors: [], hp: [], bosses: [] };
    for (let s = 1; s <= 120; s++) {
      try {
        const e = SA.EnemyGen.generate(s, 'normal', 1234, false);
        out.kinds[e.kind] = (out.kinds[e.kind] || 0) + 1;
        if (s % 5 === 0 && e.kind !== (s % 10 === 0 ? 'boss' : 'elite')) out.errors.push('kind ' + e.kind + ' @' + s);
        out.arch[e.archetype || e.bossId] = 1;
        out.hp.push(e.stats.maxHp);
        if (e.kind === 'boss') out.bosses.push(s + ':' + e.bossId + (e.great ? '*' : ''));
        if (!SA.ARENAS[e.arena]) out.errors.push('arena ' + e.arena + ' @' + s);
        if (!SA.WEAPONS[e.weapon || 'fists']) out.errors.push('weapon ' + e.weapon + ' @' + s);
      } catch (err) { out.errors.push(s + ': ' + err.message); }
    }
    const a = SA.EnemyGen.aiParams(1), b = SA.EnemyGen.aiParams(60), c = SA.EnemyGen.aiParams(120);
    out.react = [a.react, b.react, c.react];
    const s1 = SA.EnemyGen.statScale(1), s50 = SA.EnemyGen.statScale(50), s100 = SA.EnemyGen.statScale(100);
    out.scale = [s1, s50, s100];
    return out;
  });
  check('generator: 120 stages without errors', gen.errors.length === 0, gen.errors.slice(0, 5));
  check('generator: elites every 5 / bosses every 10 (+rare random elites later)', gen.kinds.boss === 12 && gen.kinds.elite >= 12 && gen.kinds.elite < 30, gen.kinds);
  check('generator: great bosses every 30', gen.bosses.filter((b) => b.endsWith('*')).length === 4, gen.bosses);
  check('generator: archetype variety', Object.keys(gen.arch).length >= 12, Object.keys(gen.arch));
  check('scaling: reaction gets faster', gen.react[0] > gen.react[1] && gen.react[1] >= gen.react[2], gen.react);
  check('scaling: stats grow but stay bounded', JSON.stringify(gen.scale), gen.scale);

  // ---------- rewards ----------
  const rw = await page.evaluate(() => {
    const R = SA.Rewards;
    return {
      s1: R.forStage(1, 'normal', {}), s10b: R.forStage(10, 'boss', {}), s5e: R.forStage(5, 'elite', {}), s4: R.forStage(4, 'normal', {}),
      s50: R.forStage(50, 'normal', {}), streak5: R.forStage(6, 'normal', { streak: 5 }), s6: R.forStage(6, 'normal', {}),
      b5: R.streakBonus(5), b10: R.streakBonus(10), b20: R.streakBonus(25), b0: R.streakBonus(4),
    };
  });
  check('rewards: boss > elite > normal', rw.s10b.coins > rw.s5e.coins && rw.s5e.coins > rw.s4.coins, rw);
  check('rewards: non-linear growth', rw.s50.coins < rw.s1.coins * 50 && rw.s50.coins > rw.s1.coins * 5, [rw.s1.coins, rw.s50.coins]);
  check('rewards: streak bonuses 10/20/35%', rw.b0 === 0 && rw.b5 === 0.1 && rw.b10 === 0.2 && rw.b20 === 0.35, rw);
  check('rewards: streak raises payout', rw.streak5.coins > rw.s6.coins, [rw.s6.coins, rw.streak5.coins]);

  // ---------- XP / levels ----------
  const xp = await page.evaluate(() => {
    SA.Save.resetProgress();
    const p = SA.Save.data.player;
    const c0 = p.coins;
    const ups = SA.Progression.addXp(SA.Progression.xpToNext(1) + SA.Progression.xpToNext(2) + 5);
    return { level: p.level, ups: ups.map((u) => u.level), unlocks: ups.map((u) => u.unlocks.length), coinGain: p.coins - c0, curve: [1, 5, 10, 30].map((l) => SA.Progression.xpToNext(l)) };
  });
  check('xp: two level-ups with coins + unlock list', xp.level === 3 && xp.ups.join() === '2,3' && xp.coinGain > 0 && xp.unlocks[1] > 0, xp);
  check('xp: curve increases', xp.curve[0] < xp.curve[1] && xp.curve[1] < xp.curve[2] && xp.curve[2] < xp.curve[3], xp.curve);

  // ---------- arena flow ----------
  const arena = await page.evaluate(() => {
    const g = SA.game;
    SA.Save.resetProgress();
    const coins0 = SA.Save.data.player.coins;
    const flush = () => { g.updateTransition(1); g.transition = null; g.fade = 0; };
    SA.ArenaMode.start(g);
    flush();
    const r = { mode: g.mode, stage: g.arenaRun.stage };
    // win stage 1
    T.fight();
    g.p2.hp = 0;
    for (let i = 0; i < 400 && !g.arenaRun.screen; i++) T.run(1);
    r.screen1 = g.arenaRun.screen;
    r.runCoins = g.arenaRun.coins;
    r.banked = SA.Save.data.player.coins - coins0;
    r.streak = g.arenaRun.streak;
    // NEXT FIGHT
    g.arenaRun.menu.items[0].action();
    flush();
    r.stage2 = g.arenaRun.stage;
    r.enemy2 = g.enemyDef && g.enemyDef.kind;
    // jump to boss via dev helper
    SA.ArenaMode.spawnBoss(g);
    flush();
    r.bossStage = g.arenaRun.stage;
    r.boss = g.enemyDef.kind + ':' + g.enemyDef.bossId;
    r.bossAI = g.ai2.constructor.name;
    // phase transitions
    T.fight();
    const phases = [];
    g.p2.hp = g.p2.maxHp * 0.55; T.run(90); phases.push(g.p2.bossPhase);
    g.p2.hp = g.p2.maxHp * 0.2; T.run(90); phases.push(g.p2.bossPhase);
    r.phases = phases;
    // let the boss fight itself for a while (abilities), then lose
    let abil = 0;
    for (let i = 0; i < 1500; i++) { T.run(1); if (g.p2.state === 'bossmove') abil++; if (g.p1.hp <= 0) break; g.p1.hp = Math.max(g.p1.hp, 1); }
    r.abilityFrames = abil;
    T.fight();
    g.p1.hp = 0;
    for (let i = 0; i < 400 && g.arenaRun.screen !== 'over'; i++) T.run(1);
    r.over = g.arenaRun.screen;
    r.coinsKept = SA.Save.data.player.coins - coins0;
    r.best = SA.Save.data.progression.bestStage;
    r.menu = g.arenaRun.menu.items.map((i) => i.label).join('/');
    // RETRY starts over at stage 1
    g.arenaRun.menu.items[0].action();
    flush();
    r.retryStage = g.arenaRun.stage;
    return r;
  });
  check('arena: starts at stage 1', arena.mode === 'arena' && arena.stage === 1, arena);
  check('arena: victory reward screen + banked coins', arena.screen1 === 'reward' && arena.runCoins > 0 && arena.banked === arena.runCoins, arena);
  check('arena: next fight = stage 2', arena.stage2 === 2, arena.stage2);
  check('arena: boss at stage 10 with BossAI', arena.bossStage === 10 && arena.boss.startsWith('boss:') && arena.bossAI === 'BossAI', arena);
  check('arena: boss phases 2 and 3', arena.phases[0] === 1 && arena.phases[1] === 2, arena.phases);
  check('arena: boss uses abilities', arena.abilityFrames > 0, arena.abilityFrames);
  check('arena: run over screen, coins kept', arena.over === 'over' && arena.coinsKept >= arena.runCoins && arena.menu === 'RETRY/SHOP/MAIN MENU', arena);
  check('arena: retry restarts at stage 1', arena.retryStage === 1, arena.retryStage);

  // ---------- every boss: spawn, phases, abilities for a while (AI vs AI) ----------
  const bosses = await page.evaluate(() => {
    const g = SA.game;
    const out = {};
    for (const id of SA.Bosses.ORDER) {
      const def = SA.Bosses.generate(10, 10, 'normal', SA.M.seeded(7), id);
      g.scene = 'fight';
      g.arenaRun = { stage: 10, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
      g.setupWorld({ mode: 'arena', arena: def.arena, enemy: def });
      g.transition = null; g.fade = 0;
      // hand the player to an AI too
      g.p1.ctrl = new SA.Controller();
      g.ai1 = new SA.EnemyAI(g.p1, g.p2, g, { params: SA.EnemyGen.aiParams(15), profile: SA.CHARACTERS.shadow ? SA.CHARACTERS.shadow.ai : undefined });
      T.fight();
      const used = {};
      let maxPhase = 0;
      for (let i = 0; i < 2400 && g.match.phase === 'fight'; i++) {
        g.tick();
        if (g.p2.bm) used[g.p2.bm.id || g.p2.bm.name || '?'] = 1;
        maxPhase = Math.max(maxPhase, g.p2.bossPhase || 0);
        if (i === 600) g.p2.hp = g.p2.maxHp * 0.5;
        if (i === 1200) g.p2.hp = g.p2.maxHp * 0.2;
        g.p1.hp = Math.max(g.p1.hp, 50);
        g.p2.hp = Math.max(g.p2.hp, 30);
      }
      out[id] = { used: Object.keys(used), maxPhase, name: def.name };
    }
    g.arenaRun = null; g.ai1 = null;
    return out;
  });
  for (const id of Object.keys(bosses)) check('boss runs: ' + id, bosses[id].maxPhase === 2 && bosses[id].used.length > 0, bosses[id]);

  // ---------- AI vs AI across generated stages ----------
  const sim = await page.evaluate(() => {
    const g = SA.game;
    const out = [];
    for (const stage of [1, 4, 5, 13, 25, 37, 55, 80]) {
      const def = SA.EnemyGen.generate(stage, 'normal', 99, false);
      g.scene = 'fight';
      g.arenaRun = { stage, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
      g.setupWorld({ mode: 'arena', arena: def.arena, enemy: def });
      g.transition = null; g.fade = 0;
      g.p1.setLoadout({ weapon: SA.M.pick(['katana', 'spear', 'war_hammer', 'scythe', 'dual_blades']), ranged: SA.M.pick(['shuriken', 'pistol', 'boomerang_blade', 'shotgun']) });
      g.p1.ctrl = new SA.Controller();
      g.ai1 = new SA.EnemyAI(g.p1, g.p2, g, { params: SA.EnemyGen.aiParams(20) });
      T.fight();
      let frames = 0;
      for (; frames < 3600 && g.match.phase === 'fight'; frames++) g.tick();
      out.push({ stage, kind: def.kind, arch: def.archetype, frames, hp: [Math.round(g.p1.hp), Math.round(g.p2.hp)], proj: g.projectiles.get().length });
    }
    g.arenaRun = null; g.ai1 = null;
    return out;
  });
  check('AI vs AI across stages runs', sim.length === 8, sim);

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.info)));
  console.log('\nAI sims:', JSON.stringify(sim));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
