// Deterministic mechanics tests. Usage: NODE_PATH=$(npm root -g) node tests/mechanics.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const results = await page.evaluate(() => {
    const g = SA.game, out = {};
    const fresh = (x1, x2, dummy) => { T.training(dummy || 'stand'); T.place(x1, x2); g.ai2.forceHold = null; };
    const hit = () => g.p2.hp < g.p2.maxHp;

    // 1) reach of each basic move against a standing dummy
    const reach = (press, hold, frames) => {
      let max = 0;
      for (let d = 120; d <= 560; d += 10) {
        fresh(0, d);
        T.run(1, { press, hold });
        T.run(frames || 30, { hold });
        if (hit()) max = d;
      }
      return max;
    };
    out.reach = {
      jab: reach(['light']), heavy: reach(['heavy'], [], 45), kick: reach(['kick']), lowKick: reach(['kick'], ['down']),
      crouchJab: reach(['light'], ['down']), uppercut: reach(['heavy'], ['down']), spin: null,
    };

    // 2) high attacks whiff over a crouching opponent, kicks don't
    const vsCrouch = (press, hold) => { fresh(0, 190); g.ai2.forceHold = ['down']; T.run(5); T.run(1, { press, hold }); T.run(40, { hold }); return hit(); };
    out.crouch = { jabHits: vsCrouch(['light']), heavyHits: vsCrouch(['heavy']), kickHits: vsCrouch(['kick']), lowKickHits: vsCrouch(['kick'], ['down']) };

    // 3) blocking levels
    const vsBlock = (hold2, press, hold) => {
      fresh(0, 190); g.ai2.forceHold = hold2; T.run(5); const hp = g.p2.hp;
      T.run(1, { press, hold }); T.run(40, { hold });
      return (hp - g.p2.hp) > 12 ? 'HIT ' + (hp - g.p2.hp) : 'blocked (chip ' + (hp - g.p2.hp) + ')';
    };
    out.block = {
      jabStanding: vsBlock(['block'], ['light']),
      lowKickStanding_shouldHit: vsBlock(['block'], ['kick'], ['down']),
      lowKickCrouch: vsBlock(['block', 'down'], ['kick'], ['down']),
      kickCrouch: vsBlock(['block', 'down'], ['kick']),
    };

    // 4) parry: p2 attacks, p1 taps block at given frames (holding block from the first tap)
    const parry = (move, taps) => {
      fresh(0, 190);
      g.p2.ctrl.press(move);
      let res = null;
      for (let f = 0; f < 50; f++) {
        T.run(1, { hold: f >= taps[0] ? ['block'] : [], press: taps.indexOf(f) >= 0 ? ['block'] : [] });
        if (g.p2.state === 'stagger') res = 'parry';
      }
      return res || (g.p1.hp < g.p1.maxHp - 20 ? 'hit' : 'blocked');
    };
    out.parry = {
      jabTap0: parry('light', [0]),            // hit lands ~5 frames later -> parry
      heavyTap12: parry('heavy', [12]),        // heavy lands ~15 -> parry
      heavyTap0_tooEarly: parry('heavy', [0]), // 15 frames early -> normal block
      heavyMash: parry('heavy', [4, 12]),      // second tap inside lockout -> no parry
    };
    // 5) combos
    const combo = (seq, d, hold) => {
      fresh(0, d || 170);
      let best = 0, dmg = 0;
      for (let f = 0; f < 110; f++) {
        const step = seq.find((s) => s[0] === f);
        T.run(1, { press: step ? [step[1]] : [], hold: step && step[2] ? step[2] : (hold || []) });
        if (g.p1.combo.hits > best) { best = g.p1.combo.hits; dmg = g.p1.combo.damage; }
      }
      return { hits: best, damage: dmg, p2: g.p2.state, name: g.ui.combo[0] && g.ui.combo[0].name };
    };
    out.combos = {
      JJK: combo([[0, 'light'], [4, 'light'], [12, 'heavy']]),
      JLL: combo([[0, 'light'], [4, 'kick'], [14, 'kick']]),
      SL_J: combo([[0, 'kick', ['down']], [6, 'light']], 180),
      SJ_SL_J: combo([[0, 'light', ['down']], [4, 'kick', ['down']], [14, 'light']], 170),
      JJK_mashedEarly: combo([[0, 'light'], [2, 'light'], [3, 'heavy']]),
    };

    // 6) dash attacks
    fresh(0, 430); T.run(1, { press: ['dash'], hold: ['right'] }); T.run(3, { hold: ['right'] }); T.run(1, { press: ['light'] }); T.run(40);
    out.dashPunch = { hit: hit(), dmg: g.p2.maxHp - g.p2.hp };
    fresh(0, 460); T.run(1, { press: ['dash'], hold: ['right'] }); T.run(3, { hold: ['right'] }); T.run(1, { press: ['kick'] }); T.run(50);
    out.slideKick = { hit: hit(), p2: g.p2.state };
    // evade has invulnerability
    fresh(0, 190); g.p2.ctrl.press('heavy'); T.run(6); T.run(1, { press: ['dash'] }); T.run(40);
    out.evadeHeavy = g.p1.hp === g.p1.maxHp ? 'evaded' : 'hit';

    // 7) jump attacks
    fresh(0, 330); T.run(1, { press: ['up'], hold: ['right'] }); T.run(14, { hold: ['right'] }); T.run(1, { press: ['kick'] }); T.run(50);
    out.flyingKick = { hit: hit(), dmg: g.p2.maxHp - g.p2.hp };
    fresh(0, 380); T.run(1, { press: ['up'], hold: ['right'] }); T.run(22, { hold: ['right'] }); T.run(1, { press: ['light'] }); T.run(50);
    out.airPunch = { hit: hit(), dmg: g.p2.maxHp - g.p2.hp };
    // overhead vs crouch block
    fresh(0, 330); g.ai2.forceHold = ['block', 'down']; T.run(1, { press: ['up'], hold: ['right'] }); T.run(14, { hold: ['right'] }); T.run(1, { press: ['kick'] }); T.run(50);
    out.overheadVsCrouchBlock = hit() && g.p2.hp < g.p2.maxHp - 20 ? 'hit' : 'blocked';

    // 8) specials
    fresh(0, 500); g.p1.energy = 100; T.run(1, { press: ['special'] }); T.run(160);
    out.rush = { dmg: g.p2.maxHp - g.p2.hp, p2: g.p2.state, energy: g.p1.energy };
    fresh(0, 180); g.p1.specialId = 'storm'; g.p1.energy = 100; T.run(1, { press: ['special'] }); T.run(120);
    out.storm = { dmg: g.p2.maxHp - g.p2.hp, p2: g.p2.state };
    fresh(0, 500); g.p1.energy = 50; T.run(1, { press: ['special'] }); T.run(30);
    out.specialWithoutEnergy = g.p1.state;
    fresh(0, 500); g.ai2.forceHold = ['block']; g.p1.energy = 100; T.run(1, { press: ['special'] }); T.run(80);
    out.rushBlocked = { p1: g.p1.state, dmg: g.p2.maxHp - g.p2.hp };

    // 9) knockdown / getup cycle
    fresh(0, 170); T.run(1, { press: ['light'] }); T.run(4); T.run(1, { press: ['light'] }); T.run(7); T.run(1, { press: ['heavy'] });
    const seen = new Set(); for (let f = 0; f < 150; f++) { T.run(1); seen.add(g.p2.state); }
    out.knockdownStates = [...seen].join(',');

    // 10) responsiveness: frames from press to movement/attack
    fresh(0, 400); T.run(1, { hold: ['right'] }); out.walkFrame1Vx = Math.round(g.p1.vx);
    fresh(0, 400); T.run(1, { press: ['light'] }); out.jabStartsSameFrame = g.p1.state === 'attack';
    fresh(-300, 300); T.run(1, { press: ['up'] }); T.run(2); out.jumpAfter3Frames = g.p1.state;
    return out;
  });
  const r = results;
  const checks = [
    ['jab reach 220-280', r.reach.jab >= 220 && r.reach.jab <= 280],
    ['kick outranges jab', r.reach.kick > r.reach.jab],
    ['heavy outranges jab (lunge)', r.reach.heavy > r.reach.jab],
    ['jab whiffs over crouch', !r.crouch.jabHits],
    ['heavy whiffs over crouch', !r.crouch.heavyHits],
    ['kick hits crouching', r.crouch.kickHits],
    ['standing block stops jab', /blocked/.test(r.block.jabStanding)],
    ['low kick beats standing block', /HIT/.test(r.block.lowKickStanding_shouldHit)],
    ['crouch block stops low kick', /blocked/.test(r.block.lowKickCrouch)],
    ['timed tap parries jab', r.parry.jabTap0 === 'parry'],
    ['timed tap parries heavy', r.parry.heavyTap12 === 'parry'],
    ['early tap is only a block', r.parry.heavyTap0_tooEarly === 'blocked'],
    ['mashing block never parries', r.parry.heavyMash === 'blocked'],
    ['J J K = 3 hits + name', r.combos.JJK.hits === 3 && r.combos.JJK.name === 'TWIN DRAGON PALM'],
    ['J L L = 3 hits + name', r.combos.JLL.hits === 3 && r.combos.JLL.name === 'CRESCENT CHAIN'],
    ['S+L -> J = 2 hits', r.combos.SL_J.hits === 2],
    ['fast mashed J J K still combos', r.combos.JJK_mashedEarly.hits === 3],
    ['dash punch connects', r.dashPunch.hit],
    ['slide kick knocks down', r.slideKick.hit],
    ['evade dodges heavy', r.evadeHeavy === 'evaded'],
    ['flying kick connects', r.flyingKick.hit],
    ['air punch connects', r.airPunch.hit],
    ['jump-in beats crouch block', r.overheadVsCrouchBlock === 'hit'],
    ['shadow rush 200+ damage', r.rush.dmg >= 200],
    ['crescent storm multi-hit', r.storm.dmg >= 100],
    ['no special without energy', r.specialWithoutEnergy !== 'special'],
    ['blocked rush is unsafe-ish', r.rushBlocked.dmg < 20],
    ['knockdown -> getup cycle', /launched/.test(r.knockdownStates) && /getup/.test(r.knockdownStates)],
    ['jab starts on press frame', r.jabStartsSameFrame],
    ['jump leaves ground by frame 3', r.jumpAfter3Frames === 'air'],
  ];
  let fail = 0;
  for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fail++; }
  if (process.env.VERBOSE) console.log(JSON.stringify(results, null, 1));
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); fail++; }
  console.log(fail ? `${fail} FAILED` : `ALL ${checks.length} CHECKS PASSED`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
