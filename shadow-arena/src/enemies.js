'use strict';
/*
 * EnemyGenerator — archetypes x weapons x stage difficulty x visual variation x behavior.
 * Everything is data: archetypes, weapon gates, elite modifiers. Scaling curves live in BALANCE.
 * The AI never gets input reading: difficulty only changes reaction time, decision rates and choices.
 */
(function (SA) {
  const B = SA.BALANCE;
  const { lerp, clamp } = SA.M;

  const sash = (color, len) => ({ anchor: 'hip', color, front: true, windMul: 0.8, rope: [{ n: len || 5, seg: 10, w0: 7, w1: 3, at: [-14, -4] }] });
  const band = (color, n) => ({ anchor: 'head', color, windMul: 1, rope: [{ n: n || 7, seg: 11, w0: 7, w1: 2, at: [-17, -5] }, { n: (n || 7) - 1, seg: 10, w0: 6, w1: 2, at: [-17, 0] }] });
  const tail = () => ({ anchor: 'head', windMul: 1.2, rope: [{ n: 9, seg: 13, w0: 12, w1: 4, at: [-12, -16] }] });
  const coat = () => ({ anchor: 'hip', windMul: 0.6, rope: [{ n: 6, seg: 14, w0: 18, w1: 10, at: [-14, -12] }, { n: 6, seg: 13, w0: 16, w1: 8, at: [-6, -10] }] });
  const cape = (n) => ({ anchor: 'neck', windMul: 0.7, rope: [{ n: n || 8, seg: 16, w0: 26, w1: 14, at: [-10, 6] }, { n: (n || 8) - 1, seg: 15, w0: 22, w1: 10, at: [-2, 8] }] });

  // weapons: [fromStage, weaponId]; ranged likewise. ai: personality profile for EnemyAI.
  const ARCHETYPES = {
    brawler: {
      label: 'BRAWLER', nouns: ['Brawler', 'Bruiser', 'Pit Fighter', 'Iron Fist'], traits: ['Heavy Hitter', 'Tough'],
      hp: 1.25, dmg: 1.12, speed: 0.92, scale: 1.05, bulk: 1.18,
      weapons: [[1, 'fists'], [14, 'war_hammer'], [30, 'great_sword']], ranged: [],
      acc: () => [{ type: 'topknot' }, sash('#0c0a0c', 6)],
      ai: { aggression: 0.72, range: 215, blockMul: 1, dodgeMul: 0.5, jumpiness: 0.08,
        weights: { jab: 2, kick: 1.6, heavy: 3, lowKick: 1, dashPunch: 1.4, slideKick: 0.5, jumpIn: 0.3, combo: 3, over: 0.8 } },
    },
    assassin: {
      label: 'ASSASSIN', nouns: ['Assassin', 'Knife Dancer', 'Cutthroat', 'Night Blade'], traits: ['Fast', 'Dash Combos'],
      hp: 0.82, dmg: 0.95, speed: 1.14, scale: 0.97, bulk: 0.94,
      weapons: [[1, 'fists'], [6, 'dual_blades'], [27, 'shadow_blades']], ranged: [[12, 'throwing_knife']],
      acc: (c) => [band(c, 9)],
      ai: { aggression: 0.86, range: 190, blockMul: 0.7, dodgeMul: 1.8, jumpiness: 0.22,
        weights: { jab: 3, kick: 1.2, heavy: 0.8, lowKick: 1.4, dashPunch: 2.6, slideKick: 1.6, jumpIn: 1, combo: 4, over: 0.4 } },
    },
    swordsman: {
      label: 'SWORDSMAN', nouns: ['Swordsman', 'Blade Master', 'Wandering Ronin', 'Duelist'], traits: ['Long Reach', 'Parries'],
      hp: 1.0, dmg: 1.02, speed: 1, scale: 1.02, bulk: 1.02, parry: 0.1,
      weapons: [[1, 'wood_staff'], [4, 'katana'], [22, 'flame_katana'], [34, 'shadow_katana']], ranged: [],
      acc: (c) => [{ type: 'hat' }, sash('#0b090b', 7)],
      ai: { aggression: 0.62, range: 240, blockMul: 1.2, dodgeMul: 0.8, jumpiness: 0.1,
        weights: { jab: 3, kick: 1.4, heavy: 1.6, lowKick: 1.2, dashPunch: 1, slideKick: 0.5, jumpIn: 0.5, combo: 3, over: 1.2 } },
    },
    tank: {
      label: 'TANK', nouns: ['Juggernaut', 'Stone Guard', 'Iron Wall', 'Bulwark'], traits: ['Armored', 'Slow'],
      hp: 1.6, dmg: 1.15, speed: 0.82, scale: 1.1, bulk: 1.32, armor: 0.15, superArmor: 0.5,
      weapons: [[1, 'fists'], [10, 'great_sword'], [15, 'war_hammer']], ranged: [],
      acc: () => [{ type: 'helmet' }],
      ai: { aggression: 0.58, range: 230, blockMul: 1.3, dodgeMul: 0.2, jumpiness: 0.02,
        weights: { jab: 1.4, kick: 1.2, heavy: 3.2, lowKick: 0.8, dashPunch: 0.8, slideKick: 0.2, jumpIn: 0.1, combo: 2.2, over: 1.4 } },
    },
    ranger: {
      label: 'RANGER', nouns: ['Ranger', 'Kunai Thrower', 'Wind Hunter', 'Scout'], traits: ['Throwables', 'Keeps Distance'],
      hp: 0.9, dmg: 0.95, speed: 1.06, scale: 0.98, bulk: 0.96,
      weapons: [[1, 'wood_staff'], [8, 'spear'], [18, 'frost_spear']], ranged: [[1, 'shuriken'], [6, 'throwing_knife'], [9, 'kunai'], [20, 'boomerang_blade'], [25, 'explosive_kunai']],
      acc: (c) => [{ type: 'hood' }, tail()],
      ai: { aggression: 0.5, range: 420, blockMul: 0.9, dodgeMul: 1.3, jumpiness: 0.2, keepAway: true, rangedMul: 2.4, rangedMin: 280,
        weights: { jab: 2, kick: 1.8, heavy: 1, lowKick: 1.2, dashPunch: 0.6, slideKick: 0.8, jumpIn: 0.6, combo: 2, over: 0.5 } },
    },
    gunner: {
      label: 'GUNNER', nouns: ['Gunslinger', 'Street Shooter', 'Hired Gun', 'Deadeye'], traits: ['Firearms', 'Weak Up Close'],
      hp: 0.88, dmg: 0.95, speed: 1.02, scale: 1, bulk: 1, minStage: 12,
      weapons: [[1, 'fists'], [25, 'electric_baton']], ranged: [[12, 'pistol'], [18, 'revolver'], [22, 'shotgun'], [35, 'energy_pistol']],
      acc: (c) => [coat()],
      ai: { aggression: 0.5, range: 480, blockMul: 0.8, dodgeMul: 1.1, jumpiness: 0.08, keepAway: true, rangedMul: 2.2, rangedMin: 320,
        weights: { jab: 2, kick: 1.5, heavy: 0.8, lowKick: 1, dashPunch: 0.5, slideKick: 0.5, jumpIn: 0.3, combo: 1.6, over: 0.3 } },
    },
    monk: {
      label: 'MONK', nouns: ['Monk', 'Iron Monk', 'Silent Monk', 'Temple Guardian'], traits: ['Fast Combos', 'Dodges'],
      hp: 0.95, dmg: 0.95, speed: 1.08, scale: 0.98, bulk: 0.98,
      weapons: [[1, 'fists'], [7, 'bo_staff']], ranged: [],
      acc: () => [{ type: 'topknot' }, sash('#3a1a10', 6)],
      ai: { aggression: 0.7, range: 210, blockMul: 1, dodgeMul: 1.7, jumpiness: 0.25,
        weights: { jab: 3, kick: 3, heavy: 1, lowKick: 2, dashPunch: 1, slideKick: 1, jumpIn: 1.2, combo: 4, over: 0.6 } },
    },
    berserker: {
      label: 'BERSERKER', nouns: ['Berserker', 'Blood Rager', 'Wild One', 'Ravager'], traits: ['Rage at Low HP', 'Reckless'],
      hp: 1.15, dmg: 1.1, speed: 1, scale: 1.06, bulk: 1.15, minStage: 3,
      weapons: [[1, 'fists'], [10, 'great_sword'], [20, 'scythe']], ranged: [],
      acc: () => [{ type: 'horns' }, tail()],
      ai: { aggression: 0.9, range: 220, blockMul: 0.5, dodgeMul: 0.6, jumpiness: 0.15, rage: true,
        weights: { jab: 2, kick: 1.5, heavy: 2.6, lowKick: 1, dashPunch: 2, slideKick: 1, jumpIn: 0.6, combo: 3.5, over: 1 } },
    },
    shadow: {
      label: 'SHADOW', nouns: ['Phantom', 'Umbral Stalker', 'Shade', 'Void Walker'], traits: ['Teleports', 'Dash Strikes'],
      hp: 0.9, dmg: 1.02, speed: 1.1, scale: 1, bulk: 0.98, minStage: 8,
      weapons: [[1, 'fists'], [8, 'katana'], [20, 'dual_blades'], [30, 'shadow_katana']], ranged: [[15, 'shuriken']],
      acc: (c) => [{ type: 'hood' }, cape(7)],
      abilities: [{ id: 'teleport', cd: 7, min: 260, chance: 0.4 }],
      ai: { aggression: 0.75, range: 230, blockMul: 0.9, dodgeMul: 1.4, jumpiness: 0.15,
        weights: { jab: 2.5, kick: 1.5, heavy: 1.4, lowKick: 1.2, dashPunch: 2.2, slideKick: 1, jumpIn: 0.6, combo: 3.5, over: 0.8 } },
    },
  };

  const PREFIX = ['Night', 'Crimson', 'Iron', 'Silent', 'Storm', 'Ash', 'Frost', 'Void', 'Jade', 'Ember', 'Grey', 'Hollow', 'Thorn', 'Blood', 'Moon'];
  const ACCENTS = ['#ff4a3a', '#ffb347', '#35f0ff', '#7cff6b', '#c07bff', '#ff5dc0', '#5fa8ff', '#ffe066', '#ff7a2a', '#8fe3ff'];

  const MODIFIERS = {
    aggressive: { label: 'AGGRESSIVE', apply(d) { d.params.aggression *= 1.25; d.params.think = d.params.think.map((v) => v * 0.75); } },
    fast: { label: 'FAST', extreme: true, apply(d) { d.stats.speedMul *= 1.12; } },
    armored: { label: 'ARMORED', extreme: true, apply(d) { d.stats.armor = Math.max(d.stats.armor || 0, 0.22); d.stats.superArmor = Math.max(d.stats.superArmor || 0, 0.6); } },
    berserker: { label: 'BERSERKER', apply(d) { d.ai.rage = true; } },
    ranged_master: { label: 'RANGED MASTER', apply(d, s) { if (!d.ranged) d.ranged = s >= 20 ? 'kunai' : 'shuriken'; d.ai.rangedMul = (d.ai.rangedMul || 1) * 2; } },
    parry_master: { label: 'PARRY MASTER', apply(d) { d.params.parry = Math.min(0.55, d.params.parry + 0.25); d.params.block = Math.min(0.9, d.params.block + 0.1); } },
    shadow_step: { label: 'SHADOW STEP', extreme: true, apply(d) { if (!d.abilities.some((a) => a.id === 'teleport')) d.abilities.push({ id: 'teleport', cd: 6, min: 240, chance: 0.45 }); } },
  };

  function pickGated(list, stage, rng) {
    const ok = list.filter((e) => stage >= e[0]);
    if (!ok.length) return null;
    // later (stronger) entries become likelier as the stage grows
    const weights = ok.map((e, i) => 1 + i * (stage / 20));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ok.length; i++) { r -= weights[i]; if (r <= 0) return ok[i][1]; }
    return ok[ok.length - 1][1];
  }

  // AI parameters for an (effective) stage — a continuous difficulty curve.
  function aiParams(s) {
    const E = B.enemyScaling;
    const t = B.stageT(s);
    const L = (k, pow) => lerp(E[k][0], E[k][1], pow ? Math.pow(t, pow) : t);
    return {
      label: 'STAGE', react: L('react'), block: L('block'), lowRead: L('lowRead'), parry: L('parry', 1.6), dodge: L('dodge'),
      punish: L('punish'), antiAir: L('antiAir'), comboDepth: Math.floor(L('comboDepth')), comboChance: L('comboChance'),
      think: [L('thinkMin'), L('thinkMax')], aggression: L('aggression'), mistakes: L('mistakes'), spacing: L('spacing'),
      safe: t > 0.5, guard: L('guard'), anticipate: L('anticipate'), special: L('special'), ranged: L('ranged'),
    };
  }

  function statScale(s) {
    const E = B.enemyScaling;
    return {
      hp: Math.min(E.hp.max, E.hp.base + E.hp.perStage * s),
      dmg: Math.min(E.damage.max, E.damage.base + E.damage.perStage * s),
      speed: 1 + Math.min(E.speed.max, E.speed.perStage * s),
    };
  }

  function stageKind(stage) {
    const A = B.arena;
    if (stage % A.bossEvery === 0) return 'boss';
    if (stage % A.eliteEvery === 0) return 'elite';
    return 'normal';
  }

  function arenaFor(stage, rng, bossDef) {
    if (bossDef && bossDef.arena) return bossDef.arena;
    const rot = B.arena.rotation;
    return rot[Math.floor((stage - 1) / 3) % rot.length];
  }

  function makeLook(arch, accent, rng) {
    return {
      body: '#050508', back: SA.M.shade('#16161f', (rng() - 0.5) * 0.3), accent, trail: accent, spark: SA.M.shade(accent, 0.4),
      eye: accent, eyeCore: '#ffffff', scale: arch.scale * (0.98 + rng() * 0.05), bulk: arch.bulk, victory: rng() < 0.5 ? 1 : 2,
      visor: arch === ARCHETYPES.gunner && rng() < 0.6,
      accessories: arch.acc(SA.M.shade(accent, -0.2)),
    };
  }

  function generate(stage, difficulty, seed, forceBoss) {
    const rng = SA.M.seeded((seed || 1) * 7919 + stage * 131);
    const kind = forceBoss ? 'boss' : stageKind(stage);
    const effStage = Math.max(1, stage + (B.arena.difficultyOffset[difficulty] || 0) +
      (kind === 'elite' ? B.enemyScaling.eliteStageBonus : kind === 'boss' ? B.enemyScaling.bossStageBonus : 0));
    if (kind === 'boss') return SA.Bosses.generate(stage, effStage, difficulty, rng);

    const pool = Object.keys(ARCHETYPES).filter((k) => stage >= (ARCHETYPES[k].minStage || 1));
    const archId = pool[Math.floor(rng() * pool.length)];
    const arch = ARCHETYPES[archId];
    const sc = statScale(effStage);
    const accent = ACCENTS[Math.floor(rng() * ACCENTS.length)];
    const d = {
      kind, stage, archetype: archId, label: arch.label,
      name: PREFIX[Math.floor(rng() * PREFIX.length)] + ' ' + arch.nouns[Math.floor(rng() * arch.nouns.length)],
      weapon: pickGated(arch.weapons, stage, rng) || 'fists',
      ranged: pickGated(arch.ranged, stage, rng),
      special: 'rush',
      stats: {
        maxHp: Math.round(1000 * arch.hp * sc.hp * (kind === 'elite' ? 1.25 : 1)),
        damageMul: arch.dmg * sc.dmg, speedMul: arch.speed * sc.speed,
        armor: arch.armor || 0, superArmor: arch.superArmor || 0,
      },
      look: makeLook(arch, accent, rng),
      ai: Object.assign({}, arch.ai, { weights: Object.assign({}, arch.ai.weights) }),
      params: aiParams(effStage),
      abilities: (arch.abilities || []).map((a) => Object.assign({}, a)),
      traits: arch.traits.slice(),
      modifiers: [],
    };
    if (arch.parry) d.params.parry = Math.min(0.5, d.params.parry + arch.parry);
    // occasional throwables on non-ranged archetypes later on
    if (!d.ranged && stage > 15 && rng() < 0.25) d.ranged = stage > 25 ? 'kunai' : 'shuriken';
    const W = SA.WEAPONS[d.weapon];
    if (W && W.special) d.special = W.special;
    else if (arch === ARCHETYPES.monk || arch === ARCHETYPES.assassin) d.special = 'storm';

    // elite modifiers (never several extreme ones early)
    const E = B.elites;
    const rolledElite = kind === 'normal' && stage >= E.randomEliteFrom && rng() < E.randomEliteChance;
    if (kind === 'elite' || rolledElite) {
      const n = stage < 25 ? E.modifiersBefore25 : stage < 60 ? E.modifiersBefore60 : E.modifiersAfter;
      const keys = Object.keys(MODIFIERS);
      let extremes = 0;
      for (let tries = 0; d.modifiers.length < n && tries < 20; tries++) {
        const k = keys[Math.floor(rng() * keys.length)];
        if (d.modifiers.indexOf(k) >= 0) continue;
        if (MODIFIERS[k].extreme && extremes >= (stage < 40 ? 1 : 2)) continue;
        if (MODIFIERS[k].extreme) extremes++;
        d.modifiers.push(k);
        MODIFIERS[k].apply(d, stage);
      }
      if (rolledElite) d.kind = 'elite';
      d.name = 'Elite ' + d.name;
    }
    d.arena = arenaFor(stage, rng);
    return d;
  }

  // Build the fighter for a generated definition.
  function createFighter(def, controller) {
    const f = new SA.Fighter({
      name: def.name.toUpperCase(), look: def.look, controller,
      maxHp: def.stats.maxHp, damageMul: def.stats.damageMul, speedMul: def.stats.speedMul,
      armor: def.stats.armor, superArmor: def.stats.superArmor,
      special: def.special, weapon: def.weapon, ranged: def.ranged,
    });
    f.charId = def.archetype || def.bossId;
    f.title = def.title || (def.label + (def.weapon && def.weapon !== 'fists' ? ' · ' + SA.WEAPONS[def.weapon].name.toUpperCase() : ''));
    f.isBoss = def.kind === 'boss';
    f.def = def;
    return f;
  }

  SA.ARCHETYPES = ARCHETYPES;
  SA.ELITE_MODIFIERS = MODIFIERS;
  SA.EnemyGen = { generate, createFighter, aiParams, statScale, stageKind, arenaFor, makeLook, cape, band, coat, tail, sash };
})(window.SA);
