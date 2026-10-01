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
  // loose bandage ends (mummy wraps) hanging from arms / hips
  const wraps = (color, n) => ({ anchor: 'hip', color, windMul: 1.1, front: false,
    rope: [{ n: n || 4, seg: 11, w0: 7, w1: 3, at: [-12, -60] }, { n: (n || 4) + 1, seg: 12, w0: 8, w1: 3, at: [6, -4] }] });
  const cape = (n) => ({ anchor: 'neck', windMul: 0.7, rope: [{ n: n || 8, seg: 16, w0: 26, w1: 14, at: [-10, 6] }, { n: (n || 8) - 1, seg: 15, w0: 22, w1: 10, at: [-2, 8] }] });

  // Egyptian underworld roster. weapons: [fromStage, weaponId]; ranged likewise.
  // from: first stage the archetype appears, weight: how common it is once unlocked (newer types are
  // favoured for a while so the ladder keeps introducing new opponents).
  // ai: behaviour profile — intents (strategy weights), mobility (which moves it uses), rangeBias
  // (px added to the weapon's optimal range), combos (real sequences, see enemy.js).
  const ARCHETYPES = {
    tomb_guard: {
      label: 'TOMB GUARD', nouns: ['Tomb Guard', 'Grave Warden', 'Crypt Sentinel', 'Gate Keeper'], traits: ['Spear + Shield', 'Defensive'],
      hp: 1.1, dmg: 0.95, speed: 0.92, scale: 1.02, bulk: 1.08, armor: 0.06, from: 1, weight: 1,
      weapons: [[1, 'spear'], [18, 'frost_spear']], ranged: [],
      look: { kind: 'undead', skin: '#2a2622', wrap: '#6d6152', metal: '#7d6a45', eye: '#6fe8d8' },
      acc: (c) => [{ type: 'shield', color: '#5c4a2c', rim: '#c9a55a' }, { type: 'nemes', color: '#3b3226', stripe: '#8a7650' }, SA.EnemyGen.wraps(c, 3)],
      ai: { aggression: 0.5, blockMul: 1.4, dodgeMul: 0.5, rangeBias: 40,
        intents: { pressure: 0.6, keepDistance: 1.8, bait: 0.5, defend: 1.4, combo: 0.6, reposition: 1 },
        mobility: { dash: 0.15, backstep: 0.55, roll: 0.05, jump: 0.05, slide: 0.05, run: 0.3 },
        combos: [['light', 'light'], ['fheavy'], ['guard', 'light', 'heavy'], ['dlight', 'uheavy'], ['kick', 'light']],
        weights: { jab: 3, kick: 1.2, heavy: 1.4, lowKick: 1, over: 0.8 } },
    },
    desert_bandit: {
      label: 'DESERT BANDIT', nouns: ['Desert Bandit', 'Dune Raider', 'Sand Thief', 'Caravan Cutthroat'], traits: ['Dual Blades', 'Fast'],
      hp: 0.9, dmg: 0.95, speed: 1.1, scale: 0.98, bulk: 0.95, from: 4, weight: 1,
      weapons: [[1, 'dual_blades'], [27, 'shadow_blades']], ranged: [[9, 'throwing_knife']],
      look: { kind: 'human', skin: '#3a2618', wrap: '#b58e5a', metal: '#b0a27a', eye: '#ffcf6a' },
      acc: (c) => [{ type: 'turban', color: '#c9a36a', tail: true }, SA.EnemyGen.sash('#6a2a1a', 6)],
      ai: { aggression: 0.8, blockMul: 0.7, dodgeMul: 1.3, rangeBias: -40,
        intents: { pressure: 1.4, keepDistance: 0.2, bait: 0.4, defend: 0.4, combo: 1.4, reposition: 1 },
        mobility: { dash: 0.8, backstep: 0.5, roll: 0.5, jump: 0.4, slide: 0.6, run: 0.9 },
        combos: [['light', 'light', 'dash', 'kick'], ['light', 'light', 'light', 'light'], ['dash', 'light', 'light'], ['dkick', 'light'], ['light', 'wait:8', 'fheavy']],
        weights: { jab: 3, kick: 1.2, heavy: 0.8, lowKick: 1.4, over: 0.4 } },
    },
    desert_archer: {
      label: 'DESERT ARCHER', nouns: ['Desert Archer', 'Dune Hunter', 'Sand Bowman', 'Sun Marksman'], traits: ['Bow', 'Keeps Distance'],
      hp: 0.85, dmg: 0.95, speed: 1.05, scale: 0.98, bulk: 0.94, from: 6, weight: 0.8,
      weapons: [[1, 'fists'], [12, 'wood_staff']], ranged: [[1, 'crossbow']],
      look: { kind: 'human', skin: '#3a2618', wrap: '#a88a5a', metal: '#9a8a60', eye: '#ffe08a' },
      acc: (c) => [{ type: 'turban', color: '#8a6a3a' }, { type: 'quiver', color: '#4a3220' }],
      ai: { aggression: 0.45, blockMul: 0.8, dodgeMul: 1.4, rangeBias: 240, keepAway: true, rangedMul: 2.6,
        intents: { pressure: 0.3, keepDistance: 2, bait: 0.3, defend: 0.6, combo: 0.4, ranged: 2.6, reposition: 1.3 },
        mobility: { dash: 0.2, backstep: 1, roll: 0.5, jump: 0.35, slide: 0.1, run: 0.6 },
        combos: [['light', 'kick'], ['back', 'ranged'], ['kick', 'fheavy']],
        weights: { jab: 2, kick: 1.8, heavy: 0.6, lowKick: 1, over: 0.3 } },
    },
    royal_guard: {
      label: 'ROYAL GUARD', nouns: ['Royal Guard', 'Pharaoh\'s Shield', 'Gilded Sentinel', 'Throne Warden'], traits: ['Gold Armor', 'Strong Guard'],
      hp: 1.2, dmg: 1, speed: 0.96, scale: 1.04, bulk: 1.1, armor: 0.12, parry: 0.12, from: 7, weight: 0.9,
      weapons: [[1, 'spear'], [12, 'katana'], [24, 'frost_spear']], ranged: [],
      look: { kind: 'human', skin: '#2e1e14', wrap: '#1c1a24', metal: '#d8b25a', eye: '#ffe7a0' },
      acc: (c) => [{ type: 'nemes', color: '#caa24e', stripe: '#1f3f8a' }, { type: 'collar', color: '#d8b25a', gem: '#2f6fd8' }, { type: 'kilt', color: '#e8dcc0' }],
      ai: { aggression: 0.55, blockMul: 1.6, dodgeMul: 0.6, rangeBias: 10,
        intents: { pressure: 0.7, keepDistance: 1, bait: 0.6, defend: 1.6, combo: 0.8, reposition: 1 },
        mobility: { dash: 0.3, backstep: 0.6, roll: 0.15, jump: 0.1, slide: 0.1, run: 0.5 },
        combos: [['guard', 'light', 'heavy'], ['guard', 'fheavy'], ['light', 'light'], ['kick', 'fheavy'], ['dlight', 'heavy']],
        weights: { jab: 2.5, kick: 1.4, heavy: 1.6, lowKick: 1.2, over: 1.2 } },
    },
    scarab_warrior: {
      label: 'SCARAB WARRIOR', nouns: ['Scarab Warrior', 'Beetle Knight', 'Shell Brute', 'Dung Colossus'], traits: ['Beetle Armor', 'Tank'],
      hp: 1.6, dmg: 1.12, speed: 0.82, scale: 1.12, bulk: 1.35, armor: 0.18, superArmor: 0.55, from: 5, weight: 0.8,
      weapons: [[1, 'fists'], [10, 'war_hammer'], [28, 'thunder_hammer']], ranged: [],
      look: { kind: 'beast', skin: '#161a1a', wrap: '#233a36', metal: '#2f6f62', eye: '#7cffd0' },
      acc: (c) => [{ type: 'scarabShell', color: '#1f3f3a', rim: '#58c8a8' }, { type: 'mandibles', color: '#1a2a28' }],
      ai: { aggression: 0.62, blockMul: 1.1, dodgeMul: 0.2, rangeBias: 0,
        intents: { pressure: 1.3, keepDistance: 0.2, bait: 0.2, defend: 0.8, combo: 0.8, reposition: 0.6 },
        mobility: { dash: 0.15, backstep: 0.1, roll: 0, jump: 0.02, slide: 0, run: 0.35 },
        combos: [['heavy'], ['light', 'heavy'], ['fheavy'], ['kick', 'heavy'], ['dheavy']],
        weights: { jab: 1.4, kick: 1.2, heavy: 3.2, lowKick: 0.8, over: 1.4 } },
    },
    anubis_acolyte: {
      label: 'ANUBIS ACOLYTE', nouns: ['Anubis Acolyte', 'Jackal Priest', 'Death Cultist', 'Soul Reaper'], traits: ['Khopesh', 'Aggressive Combos'],
      hp: 1.0, dmg: 1.05, speed: 1.02, scale: 1.02, bulk: 1.0, from: 8, weight: 1,
      weapons: [[1, 'katana'], [22, 'flame_katana'], [30, 'shadow_katana']], ranged: [],
      look: { kind: 'human', skin: '#141014', wrap: '#1a1418', metal: '#c9a24e', eye: '#ffb13a' },
      acc: (c) => [{ type: 'jackalMask', color: '#0c0a0e', trim: '#c9a24e' }, { type: 'kilt', color: '#2a1d14' }, SA.EnemyGen.sash('#7a1a1a', 5)],
      ai: { aggression: 0.86, blockMul: 0.9, dodgeMul: 0.9, rangeBias: -10,
        intents: { pressure: 1.5, keepDistance: 0.3, bait: 0.5, defend: 0.5, combo: 1.6, reposition: 1 },
        mobility: { dash: 0.6, backstep: 0.45, roll: 0.3, jump: 0.3, slide: 0.3, run: 0.8 },
        combos: [['light', 'light', 'heavy'], ['light', 'light', 'dash', 'kick'], ['fheavy', 'light'], ['light', 'wait:9', 'heavy'], ['dlight', 'uheavy'], ['light', 'light', 'light']],
        weights: { jab: 3, kick: 1.4, heavy: 1.6, lowKick: 1.2, over: 1.2 } },
    },
    jackal_assassin: {
      label: 'JACKAL ASSASSIN', nouns: ['Jackal Assassin', 'Night Jackal', 'Tomb Stalker', 'Sand Shade'], traits: ['Very Fast', 'Dash Strikes'],
      hp: 0.82, dmg: 0.98, speed: 1.16, scale: 0.97, bulk: 0.9, from: 11, weight: 1.1,
      weapons: [[1, 'dual_blades'], [27, 'shadow_blades']], ranged: [[14, 'throwing_knife']],
      look: { kind: 'beast', skin: '#0c0a0c', wrap: '#1a1418', metal: '#8a7a5a', eye: '#ff4a3a' },
      acc: (c) => [{ type: 'jackalHead', color: '#0a080a', ears: true }, SA.EnemyGen.band('#2a1a14', 6)],
      ai: { aggression: 0.92, blockMul: 0.7, dodgeMul: 1.8, rangeBias: -60,
        intents: { pressure: 1.6, keepDistance: 0.1, bait: 0.8, defend: 0.3, combo: 1.5, reposition: 1.2 },
        mobility: { dash: 1, backstep: 0.9, roll: 0.75, jump: 0.6, slide: 0.8, run: 1 },
        combos: [['light', 'light', 'dash', 'kick'], ['dash', 'light', 'light', 'heavy'], ['back', 'dash', 'light'], ['jump', 'kick', 'light'], ['dkick', 'light', 'light']],
        weights: { jab: 3, kick: 1.3, heavy: 0.8, lowKick: 1.6, over: 0.5 } },
    },
    serpent_priest: {
      label: 'SERPENT PRIEST', nouns: ['Serpent Priest', 'Cobra Mystic', 'Venom Oracle', 'Apep Cultist'], traits: ['Poison Magic', 'Keeps Distance'],
      hp: 0.88, dmg: 1, speed: 0.98, scale: 1.0, bulk: 0.95, from: 11, weight: 0.9,
      weapons: [[1, 'wood_staff'], [9, 'bo_staff'], [25, 'electric_baton']], ranged: [[1, 'venom_orb']],
      look: { kind: 'human', skin: '#1e241a', wrap: '#1f3a2a', metal: '#b89a4a', eye: '#8fff6a' },
      acc: (c) => [{ type: 'cobraHood', color: '#1d3a26', scale: '#9ad86a' }, { type: 'robe', color: '#16261c' }],
      ai: { aggression: 0.5, blockMul: 0.9, dodgeMul: 1.3, rangeBias: 140, keepAway: true, rangedMul: 2.2,
        intents: { pressure: 0.4, keepDistance: 1.8, bait: 0.4, defend: 0.7, combo: 0.5, ranged: 2.3, reposition: 1.2 },
        mobility: { dash: 0.3, backstep: 0.8, roll: 0.4, jump: 0.2, slide: 0.1, run: 0.6 },
        combos: [['light', 'kick'], ['back', 'ranged'], ['light', 'fheavy'], ['dlight', 'ranged']],
        weights: { jab: 2, kick: 1.6, heavy: 1, lowKick: 1, over: 0.8 } },
    },
    cursed_mummy: {
      label: 'CURSED MUMMY', nouns: ['Cursed Mummy', 'Restless Dead', 'Wrapped Horror', 'Hollow Pharaoh'], traits: ['Unpredictable', 'Relentless'],
      hp: 1.1, dmg: 1.05, speed: 1.0, scale: 1.02, bulk: 1.0, from: 14, weight: 0.9,
      weapons: [[1, 'fists'], [18, 'scythe']], ranged: [],
      look: { kind: 'mummy', skin: '#1a1612', wrap: '#8a7a5e', metal: '#6a5a3a', eye: '#9dff5a' },
      acc: (c) => [SA.EnemyGen.wraps('#8a7a5e', 5)],
      ai: { aggression: 0.8, blockMul: 0.6, dodgeMul: 1, rangeBias: 0, erratic: true,
        intents: { pressure: 1.3, keepDistance: 0.5, bait: 0.6, defend: 0.5, combo: 1.2, reposition: 1 },
        mobility: { dash: 0.5, backstep: 0.5, roll: 0.5, jump: 0.5, slide: 0.4, run: 0.6 },
        combos: [['light', 'heavy'], ['kick', 'kick'], ['jump', 'kick'], ['dheavy'], ['light', 'wait:14', 'fheavy'], ['roll', 'uheavy'], ['dkick', 'dkick', 'uheavy']],
        weights: { jab: 2, kick: 2, heavy: 2, lowKick: 1.5, over: 1.2 } },
    },
    tomb_executioner: {
      label: 'TOMB EXECUTIONER', nouns: ['Tomb Executioner', 'Headsman', 'Doom Bearer', 'Gate Breaker'], traits: ['Two-Handed', 'Slow + Heavy'],
      hp: 1.45, dmg: 1.2, speed: 0.85, scale: 1.15, bulk: 1.25, superArmor: 0.5, from: 16, weight: 0.8,
      weapons: [[1, 'great_sword'], [26, 'executioner_axe']], ranged: [],
      look: { kind: 'human', skin: '#1e1612', wrap: '#141014', metal: '#6a5a4a', eye: '#ff6a2a' },
      acc: (c) => [{ type: 'execHood', color: '#0e0c0e' }, { type: 'kilt', color: '#1c1410' }],
      ai: { aggression: 0.6, blockMul: 1, dodgeMul: 0.2, rangeBias: 20,
        intents: { pressure: 1.1, keepDistance: 0.6, bait: 0.5, defend: 0.7, combo: 0.6, reposition: 0.8 },
        mobility: { dash: 0.2, backstep: 0.1, roll: 0, jump: 0.05, slide: 0, run: 0.4 },
        combos: [['heavy'], ['fheavy'], ['light', 'heavy'], ['dheavy'], ['uheavy'], ['light', 'wait:12', 'heavy']],
        weights: { jab: 1.5, kick: 1, heavy: 3, lowKick: 0.8, over: 1.6 } },
    },
  };

  // Acrobatic movement personality per archetype (front flip, handspring, air dash, feints) and
  // the movement combos they like. Tomb guards stay calm and precise, jackal assassins fly around.
  const ACROBATICS = {
    // spacing -> spear poke -> step back -> anti-air
    tomb_guard: { mob: { flip: 0, hand: 0, airdash: 0 }, feint: 0.1, combos: [['light', 'back', 'uheavy']] },
    scarab_warrior: { mob: { flip: 0, hand: 0, airdash: 0 }, feint: 0 },
    tomb_executioner: { mob: { flip: 0, hand: 0, airdash: 0 }, feint: 0.15 },
    royal_guard: { mob: { flip: 0.05, hand: 0.2, airdash: 0 }, feint: 0.45, combos: [['back', 'heavy'], ['guard', 'light', 'heavy']] },
    desert_bandit: { mob: { flip: 0.4, hand: 0.35, airdash: 0.3 }, feint: 0.3, combos: [['roll', 'light', 'kick'], ['dash', 'dlight'], ['dash', 'jump', 'light']] },
    jackal_assassin: { mob: { flip: 0.9, hand: 0.8, airdash: 0.7 }, feint: 0.5,
      combos: [['dash', 'light', 'roll', 'jump', 'kick'], ['jump', 'adash', 'light'], ['hand', 'dash', 'light', 'light'],
        ['dash', 'light', 'kick', 'gFlipF', 'light', 'dkick']] },   // dash -> slash -> kick -> flip -> air -> dive
    // dash in -> air slash -> down attack
    anubis_acolyte: { mob: { flip: 0.3, hand: 0.4, airdash: 0.2 }, feint: 0.5, combos: [['dash', 'gJump', 'light', 'dheavy']] },
    cursed_mummy: { mob: { flip: 0.2, hand: 0.1, airdash: 0.1 }, feint: 0.2 },
    desert_archer: { mob: { flip: 0.1, hand: 0.6, airdash: 0.1 }, feint: 0.1, combos: [['hand', 'ranged']] },
    serpent_priest: { mob: { flip: 0.05, hand: 0.4, airdash: 0.05 }, feint: 0.2 },
  };
  for (const id in ACROBATICS) {
    const a = ARCHETYPES[id], x = ACROBATICS[id];
    if (!a) continue;
    a.ai.mobility = Object.assign({}, a.ai.mobility, x.mob);
    a.ai.feint = x.feint;
    if (x.combos) a.ai.combos = a.ai.combos.concat(x.combos);
  }

  const PREFIX = ['Sand', 'Ash', 'Dune', 'Obsidian', 'Gilded', 'Hollow', 'Cursed', 'Night', 'Sun-Burnt', 'Jackal', 'Lapis', 'Bone', 'Ember', 'Silent', 'Moon'];
  const ACCENTS = ['#e8b64a', '#35d6c6', '#ff8a3a', '#4a7cff', '#9dff5a', '#ff4a3a', '#d8c08a', '#6fe8ff', '#c07bff', '#ffd27a'];

  const MODIFIERS = {
    aggressive: { label: 'AGGRESSIVE', apply(d) { d.params.aggression *= 1.25; d.params.think = d.params.think.map((v) => v * 0.75); } },
    fast: { label: 'FAST', extreme: true, apply(d) { d.stats.speedMul *= 1.12; } },
    armored: { label: 'ARMORED', extreme: true, apply(d) { d.stats.armor = Math.max(d.stats.armor || 0, 0.22); d.stats.superArmor = Math.max(d.stats.superArmor || 0, 0.6); } },
    berserker: { label: 'BERSERKER', apply(d) { d.ai.rage = true; } },
    ranged_master: { label: 'RANGED MASTER', apply(d, s) { if (!d.ranged) d.ranged = s >= 20 ? 'kunai' : 'shuriken'; d.ai.rangedMul = (d.ai.rangedMul || 1) * 2; } },
    parry_master: { label: 'PARRY MASTER', apply(d) { d.params.parry = Math.min(0.55, d.params.parry + 0.25); d.params.block = Math.min(0.9, d.params.block + 0.1); } },
    shadow_step: { label: 'SHADOW STEP', extreme: true, apply(d) { if (!d.abilities.some((a) => a.id === 'teleport')) d.abilities.push({ id: 'teleport', cd: 6, min: 240, chance: 0.45 }); } },
  };

  // Stage gates: 1–3 only tomb guards, then new types join; a freshly unlocked type is favoured for a while.
  function pickArchetype(stage, rng) {
    const ids = Object.keys(ARCHETYPES).filter((k) => stage >= ARCHETYPES[k].from);
    const w = ids.map((k) => {
      const a = ARCHETYPES[k];
      const age = stage - a.from;
      return a.weight * (age < 6 ? 1.8 : 1);
    });
    let r = rng() * w.reduce((x, y) => x + y, 0);
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }

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
  // Reaction time depends on the enemy tier (frames at 60 fps): normal 200–400 ms, elite 140–250 ms,
  // boss 100–220 ms — later stages move toward the fast end. Bosses are hard through their moves,
  // not through perfect reactions.
  function aiParams(s, kind) {
    const E = B.enemyScaling;
    const t = B.stageT(s);
    const L = (k, pow) => lerp(E[k][0], E[k][1], pow ? Math.pow(t, pow) : t);
    const react = E.reactByKind[kind || 'normal'] || E.reactByKind.normal;
    return {
      label: 'STAGE', react: lerp(react[0], react[1], t), block: L('block'), lowRead: L('lowRead'), parry: L('parry', 1.6), dodge: L('dodge'),
      punish: L('punish'), antiAir: L('antiAir'), comboDepth: Math.floor(L('comboDepth')), comboChance: L('comboChance'),
      think: [L('thinkMin'), L('thinkMax')], aggression: L('aggression'), mistakes: L('mistakes'), spacing: L('spacing'),
      safe: t > 0.5, guard: L('guard'), anticipate: L('anticipate'), special: L('special'), ranged: L('ranged'),
      quality: L('quality'), mobility: L('mobility'), bait: L('bait'), variety: L('variety'),
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

  // Materials come from the archetype (undead / human / beast / mummy), the accent varies per enemy.
  function makeLook(arch, accent, rng) {
    const L = arch.look || {};
    const v = (rng() - 0.5) * 0.16;
    return {
      kind: L.kind || 'human',
      mat: { skin: SA.M.shade(L.skin || '#3a2618', v), wrap: L.wrap, metal: L.metal, cloth: L.cloth || SA.M.shade(accent, -0.55) },
      wraps: L.wraps, tatters: L.tatters, headScale: L.headScale,
      body: '#0a0808', back: '#1a1614', accent, trail: accent, spark: SA.M.shade(accent, 0.4),
      eye: L.eye || accent, eyeCore: '#ffffff', scale: arch.scale * (0.98 + rng() * 0.05), bulk: arch.bulk, victory: rng() < 0.5 ? 1 : 2,
      accessories: arch.acc(SA.M.shade(accent, -0.2)),
    };
  }

  function generate(stage, difficulty, seed, forceBoss, forceArch) {
    const rng = SA.M.seeded((seed || 1) * 7919 + stage * 131);
    const kind = forceBoss ? 'boss' : stageKind(stage);
    const effStage = Math.max(1, stage + (B.arena.difficultyOffset[difficulty] || 0) +
      (kind === 'elite' ? B.enemyScaling.eliteStageBonus : kind === 'boss' ? B.enemyScaling.bossStageBonus : 0));
    if (kind === 'boss') return SA.Bosses.generate(stage, effStage, difficulty, rng);

    const archId = forceArch && ARCHETYPES[forceArch] ? forceArch : pickArchetype(stage, rng);
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
      params: aiParams(effStage, kind),
      abilities: (arch.abilities || []).map((a) => Object.assign({}, a)),
      traits: arch.traits.slice(),
      modifiers: [],
    };
    if (arch.parry) d.params.parry = Math.min(0.5, d.params.parry + arch.parry);
    // occasional throwables on non-ranged archetypes later on
    if (!d.ranged && stage > 15 && rng() < 0.25) d.ranged = stage > 25 ? 'kunai' : 'shuriken';
    const W = SA.WEAPONS[d.weapon];
    if (W && W.special) d.special = W.special;
    else if (arch === ARCHETYPES.jackal_assassin || arch === ARCHETYPES.desert_bandit) d.special = 'storm';

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

  // FIGHT mode / menu demo opponent: an archetype champion at a strength that fits the difficulty
  const FIGHT_STAGE = { easy: 4, normal: 14, hard: 29 };
  function makeOpponent(archId, difficulty, seed) {
    const def = generate(FIGHT_STAGE[difficulty] || 14, 'normal', seed || 3, false, archId);
    def.name = def.name.replace(/^Elite /, '');
    return { def, fighter: createFighter(def, new SA.Controller()) };
  }
  SA.opponentName = (id) => (SA.CHARACTERS[id] ? SA.CHARACTERS[id].name : ARCHETYPES[id] ? ARCHETYPES[id].label : String(id).toUpperCase());

  SA.ARCHETYPES = ARCHETYPES;
  SA.ELITE_MODIFIERS = MODIFIERS;
  SA.EnemyGen = { generate, createFighter, makeOpponent, aiParams, statScale, stageKind, arenaFor, makeLook, pickArchetype, cape, band, coat, tail, sash, wraps };
})(window.SA);
