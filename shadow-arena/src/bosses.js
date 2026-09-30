'use strict';
/*
 * Boss system: the gods of the Egyptian underworld. Data-driven, with a general PHASE architecture
 * and scripted abilities ("boss moves": telegraphed wind-up -> action -> recovery).
 *   phase 1 -> hp < phases[1].at -> phase 2 -> hp < phases[2].at -> phase 3
 * A phase can change speed, aggression, armor, the ability set, the arena mood (darkness, light,
 * lightning), eye glow and music intensity. Every ability is readable: it has a visible wind-up,
 * a counter (jump / crouch / roll / distance / block) and a punish window afterwards.
 *
 *   ANUBIS  – Guardian of the Dead:   teleport, shadow dash (passes through), soul slash, spirits
 *   SOBEK   – Lord of the Nile:       bite (grab), charge, tail sweep (jump!), ground slam
 *   SEKHMET – Lioness of War:         pounce, claw rush, solar flare, berserk below 40 %
 *   HORUS   – Falcon of the Sky:      dive, wind bolts, sky feints
 *   SET     – God of Chaos:           telegraphed lightning, sandstorm push, fake-outs
 *   RA      – The Sun Itself:         sun beam (high / low), homing sun orbs, light dash, solar explosion
 *   OSIRIS  – King of the Underworld: spirits, soul drain, regeneration channel, second life
 */
(function (SA) {
  const { clamp, damp, rand } = SA.M;
  const A = SA.Anim;
  const P = (o, b) => A.P(o, b);
  const chance = (p) => Math.random() < p;

  // hit data helper (damage before the attacker's damage multiplier)
  const H = (id, damage, o) => Object.assign({ id, damage, hitstun: 24, blockstun: 14, kb: 520, level: 'mid', hitstop: 6, shake: 0.4, sound: 'hit_heavy', power: 1 }, o || {});

  const cape = (n) => SA.EnemyGen.cape(n);

  const BOSSES = {
    anubis: {
      name: 'ANUBIS', title: 'Guardian of the Dead', arena: 'tomb_anubis',
      weapon: 'anubis_khopesh', ranged: null, special: 'slash',
      hp: 1.8, dmg: 1.08, speed: 1.06, scale: 1.15, bulk: 1.02, armor: 0.05, superArmor: 0.3,
      look: { skin: '#0b0a0e', wrap: '#2a2230', metal: '#e0b24a', cloth: '#14111c', eye: '#ffd24a', accent: '#e0b24a' },
      acc: () => [{ type: 'jackalHead', color: '#0a090c', trim: '#e0b24a' }, { type: 'collar', color: '#d4a84a', gem: '#1f5bd8' },
        { type: 'kilt', color: '#e8dcc0' }, { type: 'belt', color: '#e0b24a', flap: '#1a2a6a' }, { type: 'bracers', color: '#e0b24a' }, cape(8)],
      tint: [40, 20, 80], fx: 'embers', introEye: '#ffd24a',
      ai: { aggression: 0.72, blockMul: 1.2, dodgeMul: 1.2, rangeBias: 10, parry: 0.12,
        intents: { pressure: 1.3, keepDistance: 0.6, bait: 0.8, defend: 0.6, combo: 1.6, reposition: 0.8, special: 1.4 },
        mobility: { dash: 0.7, backstep: 0.6, roll: 0.3, jump: 0.25, slide: 0.2, run: 0.8 },
        combos: [['ab:teleport', 'light', 'light', 'heavy'], ['light', 'light', 'ab:soulSlash'], ['dash', 'light', 'fheavy'], ['light', 'dkick', 'uheavy'], ['guard', 'light', 'heavy']],
        weights: { jab: 3, kick: 1.3, heavy: 2, lowKick: 1, over: 1.2 } },
      phases: [
        { at: 1, abilities: [{ id: 'teleport', cd: 7, min: 260, chance: 0.4 }, { id: 'soulSlash', cd: 7, min: 320, chance: 0.4 }] },
        { at: 0.6, speed: 1.1, aggression: 1.25, label: 'JUDGEMENT OF THE DEAD', dark: 0.42, eyeBoost: 1,
          abilities: [{ id: 'teleport', cd: 5, min: 220 }, { id: 'soulSlash', cd: 5.5, min: 280, double: true }, { id: 'shadowDash', cd: 6, min: 240, max: 700 }, { id: 'summonSpirits', cd: 10, min: 200, count: 3 }] },
        { at: 0.25, speed: 1.18, aggression: 1.45, label: 'WEIGHING OF THE HEART', dark: 0.6, eyeBoost: 1.6,
          abilities: [{ id: 'teleport', cd: 3.5, min: 200 }, { id: 'shadowDash', cd: 4.5, min: 220, max: 760 }, { id: 'soulSlash', cd: 4, min: 260, double: true }, { id: 'summonSpirits', cd: 8, min: 150, count: 4 }] },
      ],
    },
    sobek: {
      name: 'SOBEK', title: 'Devourer of the Nile', arena: 'nile_night',
      weapon: 'titan_hammer', ranged: null, special: 'quake',
      hp: 2.5, dmg: 1.15, speed: 0.84, scale: 1.4, bulk: 1.35, armor: 0.22, superArmor: 0.75,
      look: { skin: '#1d2a1a', wrap: '#3a4a2a', metal: '#b89a4a', cloth: '#1a2418', eye: '#d8ff5a', accent: '#8fd05a' },
      acc: () => [{ type: 'crocHead', color: '#22321e', teeth: '#e8dcc0' }, { type: 'collar', color: '#b89a4a', gem: '#2a8a5a' },
        { type: 'kilt', color: '#4a3a22' }, { type: 'belt', color: '#b89a4a' }, { type: 'bracers', color: '#b89a4a' }, SA.EnemyGen.tail()],
      tint: [30, 90, 50], fx: 'embers', introEye: '#d8ff5a',
      ai: { aggression: 0.6, blockMul: 1.1, dodgeMul: 0.15, rangeBias: 0,
        intents: { pressure: 1.5, keepDistance: 0.2, bait: 0.4, defend: 0.8, combo: 1, reposition: 0.5, special: 1.2 },
        mobility: { dash: 0.2, backstep: 0.1, roll: 0, jump: 0.02, slide: 0, run: 0.5 },
        combos: [['heavy'], ['light', 'heavy'], ['fheavy'], ['light', 'ab:bite'], ['dheavy']],
        weights: { jab: 1.5, kick: 1, heavy: 3.4, lowKick: 0.6, over: 1.6 } },
      phases: [
        { at: 1, abilities: [{ id: 'bite', cd: 6, max: 260, chance: 0.5 }, { id: 'slam', cd: 7, max: 440 }] },
        { at: 0.6, speed: 1.08, aggression: 1.2, label: 'RIVER RAGE',
          abilities: [{ id: 'bite', cd: 5, max: 260 }, { id: 'charge', cd: 6, min: 320 }, { id: 'tailSweep', cd: 6, max: 330 }, { id: 'slam', cd: 6, max: 440 }] },
        { at: 0.25, speed: 1.15, aggression: 1.4, label: 'DEVOURER', armor: 0.3,
          abilities: [{ id: 'bite', cd: 3.5, max: 270 }, { id: 'tailSweep', cd: 4, max: 340 }, { id: 'charge', cd: 5, min: 300 }, { id: 'slam', cd: 4.5, max: 440 }] },
      ],
    },
    sekhmet: {
      name: 'SEKHMET', title: 'Lioness of War', arena: 'lost_pyramid',
      weapon: 'sekhmet_claws', ranged: null, special: 'storm',
      hp: 1.7, dmg: 1.1, speed: 1.12, scale: 1.1, bulk: 1.05, armor: 0.05, superArmor: 0.2,
      look: { skin: '#2a1408', wrap: '#6a3a18', metal: '#f0b43a', cloth: '#8a1a10', eye: '#ff7a2a', accent: '#ff7a2a' },
      acc: () => [{ type: 'mane', color: '#7a4a18' }, { type: 'lionHead', color: '#8a5a22' }, { type: 'sunDisc', color: '#ff8a2a', glow: '#ff5a1a' },
        { type: 'collar', color: '#f0b43a', gem: '#c01a10' }, { type: 'kilt', color: '#8a1a10' }, { type: 'bracers', color: '#f0b43a' }],
      tint: [200, 60, 10], fx: 'embers', introEye: '#ff7a2a',
      ai: { aggression: 0.85, blockMul: 0.7, dodgeMul: 1.1, rangeBias: -30,
        intents: { pressure: 2, keepDistance: 0.2, bait: 0.4, defend: 0.3, combo: 1.8, reposition: 0.6, special: 1.3 },
        mobility: { dash: 1, backstep: 0.4, roll: 0.4, jump: 0.6, slide: 0.6, run: 1 },
        combos: [['light', 'light', 'dash', 'kick'], ['light', 'light', 'light', 'heavy'], ['dash', 'light', 'light', 'uheavy'], ['jump', 'kick', 'light'], ['ab:clawRush']],
        weights: { jab: 3, kick: 1.6, heavy: 1.2, lowKick: 1.2, over: 0.6 } },
      phases: [
        { at: 1, abilities: [{ id: 'leap', cd: 6, min: 280, chance: 0.45 }, { id: 'clawRush', cd: 6.5, max: 340 }] },
        { at: 0.7, speed: 1.08, aggression: 1.2, label: 'SOLAR FURY',
          abilities: [{ id: 'leap', cd: 5, min: 260 }, { id: 'clawRush', cd: 5, max: 360 }, { id: 'solarFlare', cd: 8, max: 300 }] },
        { at: 0.4, speed: 1.25, aggression: 1.6, label: 'BERSERK', eyeBoost: 1.4, berserk: true,
          abilities: [{ id: 'leap', cd: 3.5, min: 220 }, { id: 'clawRush', cd: 3.5, max: 380 }, { id: 'solarFlare', cd: 6, max: 320 }] },
      ],
    },
    horus: {
      name: 'HORUS', title: 'Falcon of the Endless Sky', arena: 'desert_temple',
      weapon: 'horus_spear', ranged: null, special: 'slash',
      hp: 1.7, dmg: 1.06, speed: 1.1, scale: 1.08, bulk: 1, armor: 0, superArmor: 0.2,
      look: { skin: '#241a10', wrap: '#e8dcc0', metal: '#f2c458', cloth: '#1a3a8a', eye: '#6fd8ff', accent: '#4aa8ff' },
      acc: () => [{ type: 'falconHead', color: '#3a2a18', mark: '#1a3a8a' }, { type: 'wings', color: '#4a3420', tip: '#f2c458' }, { type: 'collar', color: '#f2c458', gem: '#1a4aaa' },
        { type: 'kilt', color: '#e8dcc0' }, { type: 'belt', color: '#f2c458', flap: '#1a3a8a' }, { type: 'bracers', color: '#f2c458' }],
      tint: [40, 120, 255], fx: 'embers', introEye: '#6fd8ff',
      ai: { aggression: 0.7, blockMul: 1, dodgeMul: 1.4, rangeBias: 60,
        intents: { pressure: 1, keepDistance: 1.1, bait: 0.7, defend: 0.6, combo: 1.2, reposition: 1.2, special: 1.5 },
        mobility: { dash: 0.6, backstep: 0.7, roll: 0.3, jump: 1.2, slide: 0.2, run: 0.8 },
        combos: [['jump', 'kick', 'light'], ['light', 'light', 'uheavy'], ['back', 'ab:windBolts'], ['fheavy'], ['dash', 'light', 'heavy']],
        weights: { jab: 2.4, kick: 1.4, heavy: 1.6, lowKick: 0.8, over: 1 } },
      phases: [
        { at: 1, abilities: [{ id: 'dive', cd: 6.5, min: 260, chance: 0.45 }, { id: 'windBolts', cd: 6, min: 360, count: 2 }] },
        { at: 0.6, speed: 1.1, aggression: 1.2, label: 'SKY LORD',
          abilities: [{ id: 'dive', cd: 5, min: 220 }, { id: 'windBolts', cd: 5, min: 320, count: 3 }, { id: 'teleport', cd: 7, min: 300 }] },
        { at: 0.25, speed: 1.18, aggression: 1.4, label: 'EYE OF HORUS', eyeBoost: 1.3,
          abilities: [{ id: 'dive', cd: 3.5, min: 200, double: true }, { id: 'windBolts', cd: 4, min: 280, count: 4 }, { id: 'teleport', cd: 5, min: 260 }] },
      ],
    },
    set: {
      name: 'SET', title: 'Lord of Chaos and Storms', arena: 'chaos_desert',
      weapon: 'set_sceptre', ranged: null, special: 'quake',
      hp: 1.9, dmg: 1.1, speed: 1.02, scale: 1.12, bulk: 1.1, armor: 0.1, superArmor: 0.4,
      look: { skin: '#2a0e0a', wrap: '#4a1a12', metal: '#8a6a9a', cloth: '#3a0a0a', eye: '#ff3a3a', accent: '#c04aff' },
      acc: () => [{ type: 'setHead', color: '#4a1a12' }, { type: 'collar', color: '#8a6a9a', gem: '#c04aff' },
        { type: 'kilt', color: '#2a0a0a' }, { type: 'belt', color: '#8a6a9a', flap: '#5a1010' }, { type: 'bracers', color: '#8a6a9a' }, cape(7)],
      tint: [120, 30, 140], fx: 'embers', introEye: '#ff3a3a',
      ai: { aggression: 0.66, blockMul: 1, dodgeMul: 1, rangeBias: 20, erratic: true,
        intents: { pressure: 1.1, keepDistance: 0.8, bait: 1.4, defend: 0.6, combo: 1.2, reposition: 1, special: 1.6 },
        mobility: { dash: 0.6, backstep: 0.6, roll: 0.4, jump: 0.4, slide: 0.3, run: 0.7 },
        combos: [['light', 'light', 'heavy'], ['ab:fakeOut'], ['light', 'wait:14', 'fheavy'], ['dash', 'light', 'dheavy'], ['guard', 'uheavy']],
        weights: { jab: 2, kick: 1.2, heavy: 2.2, lowKick: 1, over: 1.4 } },
      phases: [
        { at: 1, abilities: [{ id: 'lightning', cd: 7, min: 200, count: 1, chance: 0.45 }, { id: 'fakeOut', cd: 7, max: 380 }] },
        { at: 0.6, speed: 1.08, aggression: 1.2, label: 'CHAOS STORM', storm: true,
          abilities: [{ id: 'lightning', cd: 5.5, min: 160, count: 2 }, { id: 'sandstorm', cd: 11, chance: 0.6 }, { id: 'fakeOut', cd: 6, max: 400 }, { id: 'teleport', cd: 7, min: 280 }] },
        { at: 0.25, speed: 1.15, aggression: 1.4, label: 'RED DESERT', eyeBoost: 1.3, storm: true,
          abilities: [{ id: 'lightning', cd: 4, min: 120, count: 3 }, { id: 'sandstorm', cd: 9 }, { id: 'fakeOut', cd: 4.5, max: 420 }, { id: 'slam', cd: 6, max: 440 }] },
      ],
    },
    ra: {
      name: 'RA', title: 'The Sun Itself', arena: 'temple_ra',
      weapon: 'ra_sceptre', ranged: null, special: 'rush',
      hp: 2.0, dmg: 1.12, speed: 1.04, scale: 1.12, bulk: 1.08, armor: 0.1, superArmor: 0.5,
      look: { skin: '#2a1a0a', wrap: '#f0e0b0', metal: '#ffd24a', cloth: '#c0501a', eye: '#fff2a0', accent: '#ffb13a' },
      acc: () => [{ type: 'falconHead', color: '#6a4a1a', mark: '#c0501a' }, { type: 'sunDisc', color: '#ffc23a', glow: '#ff9a1a' },
        { type: 'collar', color: '#ffd24a', gem: '#c0301a' }, { type: 'kilt', color: '#f0e0b0' }, { type: 'belt', color: '#ffd24a', flap: '#c0501a' }, { type: 'bracers', color: '#ffd24a' }, cape(7)],
      tint: [255, 170, 40], fx: 'embers', introEye: '#fff2a0',
      ai: { aggression: 0.62, blockMul: 1.2, dodgeMul: 0.8, rangeBias: 80,
        intents: { pressure: 0.9, keepDistance: 1.2, bait: 0.6, defend: 0.8, combo: 1.1, reposition: 1, special: 1.8 },
        mobility: { dash: 0.5, backstep: 0.6, roll: 0.2, jump: 0.2, slide: 0.1, run: 0.6 },
        combos: [['light', 'light', 'heavy'], ['fheavy'], ['ab:lightDash', 'light', 'heavy'], ['guard', 'light', 'uheavy'], ['back', 'ab:sunOrbs']],
        weights: { jab: 2, kick: 1, heavy: 2.4, lowKick: 0.8, over: 1.3 } },
      phases: [
        { at: 1, abilities: [{ id: 'sunBeam', cd: 7, min: 300, chance: 0.45 }, { id: 'sunOrbs', cd: 8, min: 260, count: 2 }] },
        { at: 0.6, speed: 1.08, aggression: 1.2, label: 'SOLAR ZENITH', light: 0.35,
          abilities: [{ id: 'sunBeam', cd: 5.5, min: 260 }, { id: 'sunOrbs', cd: 6.5, min: 220, count: 3 }, { id: 'lightDash', cd: 6, min: 260, max: 760 }] },
        { at: 0.25, speed: 1.15, aggression: 1.4, label: 'SUPERNOVA', light: 0.6, eyeBoost: 1.5,
          abilities: [{ id: 'solarExplosion', cd: 9, max: 380 }, { id: 'sunBeam', cd: 4.5, min: 220 }, { id: 'sunOrbs', cd: 5, min: 200, count: 4 }, { id: 'lightDash', cd: 5, min: 240, max: 780 }] },
      ],
    },
    osiris: {
      name: 'OSIRIS', title: 'King of the Underworld', arena: 'hall_osiris',
      weapon: 'osiris_crook', ranged: null, special: 'slash',
      hp: 1.9, dmg: 1.08, speed: 0.98, scale: 1.15, bulk: 1.08, armor: 0.12, superArmor: 0.4, secondLife: 0.45,
      look: { skin: '#1a3a26', wrap: '#e8e4d4', metal: '#e0b24a', cloth: '#e8e4d4', eye: '#6fffb0', accent: '#4fe89a' },
      acc: () => [{ type: 'atef', color: '#ece6d2', feather: '#d8b25a' }, { type: 'collar', color: '#e0b24a', gem: '#1f5bd8' },
        { type: 'robe', color: '#e2dcc8' }, { type: 'belt', color: '#e0b24a', flap: '#1f3a8a' }, { type: 'bracers', color: '#e0b24a' }],
      tint: [30, 180, 120], fx: 'embers', introEye: '#6fffb0',
      ai: { aggression: 0.6, blockMul: 1.3, dodgeMul: 0.7, rangeBias: 40,
        intents: { pressure: 1, keepDistance: 0.9, bait: 0.7, defend: 1, combo: 1.2, reposition: 0.8, special: 1.6 },
        mobility: { dash: 0.4, backstep: 0.5, roll: 0.2, jump: 0.15, slide: 0.1, run: 0.5 },
        combos: [['light', 'light', 'heavy'], ['guard', 'light', 'fheavy'], ['light', 'ab:soulDrain'], ['dlight', 'uheavy'], ['back', 'ab:summonSpirits']],
        weights: { jab: 2.2, kick: 1, heavy: 2.2, lowKick: 1, over: 1.2 } },
      phases: [
        { at: 1, abilities: [{ id: 'summonSpirits', cd: 8, min: 240, count: 2, chance: 0.45 }, { id: 'soulDrain', cd: 7, max: 330 }] },
        { at: 0.6, speed: 1.06, aggression: 1.2, label: 'LORD OF THE DEAD', dark: 0.3,
          abilities: [{ id: 'summonSpirits', cd: 7, min: 220, count: 3 }, { id: 'soulDrain', cd: 5.5, max: 340 }, { id: 'regen', cd: 12, min: 420 }] },
        { at: 0.25, speed: 1.12, aggression: 1.35, label: 'ETERNAL KING', dark: 0.45, eyeBoost: 1.4,
          abilities: [{ id: 'summonSpirits', cd: 5.5, min: 200, count: 4 }, { id: 'soulDrain', cd: 4.5, max: 350 }, { id: 'regen', cd: 10, min: 400 }, { id: 'teleport', cd: 6, min: 260 }] },
      ],
    },
  };
  const ORDER = ['anubis', 'sobek', 'sekhmet', 'horus', 'set', 'ra', 'osiris'];
  // old save data / dev helpers may still name the pre-Egypt bosses
  const RENAME = { executioner: 'anubis', shadow_ronin: 'anubis', iron_titan: 'sobek', hunter: 'horus', cyber_warlord: 'ra' };

  function generate(stage, effStage, difficulty, rng, forceId) {
    const id = BOSSES[forceId] ? forceId : RENAME[forceId] ||
      ORDER[(Math.floor(stage / SA.BALANCE.arena.bossEvery) - 1 + ORDER.length * 10) % ORDER.length];
    const b = BOSSES[id];
    const great = stage % SA.BALANCE.arena.greatBossEvery === 0;
    const sc = SA.EnemyGen.statScale(effStage);
    const params = SA.EnemyGen.aiParams(effStage, 'boss');
    if (b.ai.parry) params.parry = Math.min(0.5, params.parry + b.ai.parry);
    const L = b.look;
    const look = {
      kind: 'god', mat: { skin: L.skin, wrap: L.wrap, metal: L.metal, cloth: L.cloth },
      body: '#050406', back: '#17121c', accent: L.accent, trail: L.accent, spark: SA.M.shade(L.accent, 0.4),
      eye: L.eye, eyeCore: '#ffffff', scale: b.scale * (great ? 1.05 : 1), bulk: b.bulk, victory: 2,
      accessories: b.acc(),
    };
    return {
      kind: 'boss', bossId: id, great, stage, label: great ? 'GREAT BOSS' : 'GOD',
      name: (great ? 'ASCENDED ' : '') + b.name, title: b.title,
      weapon: b.weapon, ranged: b.ranged, special: b.special,
      stats: {
        maxHp: Math.round(1000 * b.hp * sc.hp * (great ? 1.25 : 1)),
        damageMul: b.dmg * sc.dmg * (great ? 1.08 : 1), speedMul: b.speed * sc.speed,
        armor: b.armor, superArmor: b.superArmor,
      },
      look, ai: Object.assign({}, b.ai, { weights: Object.assign({}, b.ai.weights) }), params,
      abilities: b.phases[0].abilities.map((a) => Object.assign({}, a)),
      phases: b.phases, traits: ['God', b.phases.length + ' Phases'].concat(b.secondLife ? ['Second Life'] : []), modifiers: [],
      arena: b.arena, tint: b.tint, fx: b.fx, introEye: b.introEye, secondLife: b.secondLife || 0,
    };
  }

  // ---------- phase controller (called every tick for boss fights) ----------
  function applyPhaseMood(game, def, idx) {
    const ph = def.phases[idx] || {};
    game.bossFx = { phase: idx, tint: def.tint, fx: def.fx, dark: ph.dark || 0, light: ph.light || 0, storm: !!ph.storm };
  }

  function updatePhase(f, ai, game) {
    const def = f.def;
    if (!def || !def.phases || f.hp <= 0) return;
    const ratio = f.hp / f.maxHp;
    const cur = f.bossPhase || 0;
    let next = cur;
    for (let i = def.phases.length - 1; i > cur; i--) if (ratio < def.phases[i].at) { next = i; break; }
    if (next === cur) return;
    enterPhase(f, ai, game, next);
  }

  function enterPhase(f, ai, game, next) {
    const def = f.def;
    f.bossPhase = next;
    const ph = def.phases[next];
    f.baseSpeed = def.stats.speedMul * (ph.speed || 1);
    if (ph.armor) f.armor = Math.max(f.armor, ph.armor);
    f.look.eyeBoost = ph.eyeBoost || 0;
    if (ai) {
      ai.phaseAggression = ph.aggression || 1;
      ai.abilities = ph.abilities.map((a) => Object.assign({ cdLeft: 1.2 }, a));
      if (ph.berserk) ai.rage = 1.3;
    }
    f.invuln = Math.max(f.invuln, 40);
    // cinematic transition
    game.slowMo(0.3, 0.7);
    game.shake(0.7);
    game.camera.punch(0.1);
    game.impactFlash(0.3);
    SA.FX.special(game.particles, f.x, f.y, f.look.accent);
    SA.FX.glyphBurst(game.particles, f.skel.hip.x, f.y - 150 * f.look.scale, f.look.accent, 12, 520);
    SA.audio.play('roar');
    SA.audio.play('boss_impact', 0.8);
    SA.audio.setMusicIntensity(1 + next * 0.3);
    game.ui.showBanner(`PHASE ${next + 1}  ·  ${ph.label || ''}`, 1.2, f.look.accent);
    applyPhaseMood(game, def, next);
    if (ph.storm) { game.arena.forceLightning = true; if (game.arena.strike) game.arena.strike(); }
    SA.Device.vibrate([25, 20, 35]);
  }

  // Osiris: the first defeat is not the end (called from the KO check).
  function tryRevive(f, game) {
    const def = f.def;
    if (!def || !def.secondLife || f.revived) return false;
    f.revived = true;
    f.hp = Math.round(f.maxHp * def.secondLife);
    f.invuln = Math.max(f.invuln, 120);
    game.slowMo(0.25, 1.1);
    game.impactFlash(0.5);
    game.shake(0.8);
    SA.FX.glyphBurst(game.particles, f.x, f.y - 150, f.look.accent, 18, 640);
    SA.audio.play('whisper', 1);
    SA.audio.play('roar');
    game.ui.showAnnounce('SECOND LIFE', { dur: 1.4, size: 150, color: f.look.accent, sub: 'OSIRIS RISES AGAIN' });
    const last = def.phases.length - 1;
    if ((f.bossPhase || 0) < last) enterPhase(f, game.ai2 && game.ai2.me === f ? game.ai2 : null, game, last);
    return true;
  }

  // Per-tick effects that outlive a boss move: pending lightning strikes, sandstorms.
  function tick(f, game, dt) {
    const tg = f === game.p1 ? game.p2 : game.p1;
    if (f.strikes && f.strikes.length) {
      for (let i = f.strikes.length - 1; i >= 0; i--) {
        const s = f.strikes[i];
        s.t -= dt;
        if (s.t > 0) continue;
        f.strikes.splice(i, 1);
        game.projectiles.spawn({
          type: 'pillar', owner: f, x: s.x, y: -450, vx: 0, vy: 0, life: 0.22, w: 120, h: 900, ground: true, pierce: true,
          unblockable: true, color: '#c89aff',
          data: H('lightning', 46, { hitstun: 26, kb: 380, kbY: -700, knockdown: true, sound: 'hit_special', power: 1, projectile: true, element: 'shock' }),
        });
        if (game.arena.strike) game.arena.strike();
        SA.FX.dust(game.particles, s.x, 0, 1.4, 0);
        SA.FX.spark(game.particles, s.x, -10, '#e8d0ff');
        game.shake(0.45);
        SA.audio.play('thunder', 0.9);
      }
    }
    if (f.stormT > 0) {
      f.stormT -= dt;
      const dir = Math.sign(tg.x - f.x) || 1;
      // the storm pushes the opponent away (toward the wall); it can walk against it slowly
      if (tg.canBeHit(f) && tg.state !== 'down') tg.x = clamp(tg.x + dir * 150 * dt, -SA.WALL, SA.WALL);
      if (Math.random() < 0.6) SA.FX.sandTrail(game.particles, tg.x - dir * rand(200, 600), -rand(20, 300), dir, '#d8b070');
      f.stormShot = (f.stormShot || 0) - dt;
      if (f.stormShot <= 0) {
        f.stormShot = 0.9;
        game.projectiles.spawn({
          type: 'sand', owner: f, x: f.x + dir * 80, y: -rand(40, 200), vx: dir * 1300, vy: 0, life: 1.4, size: 26,
          data: H('sand', 10, { hitstun: 10, blockstun: 6, kb: 260, hitstop: 2, shake: 0.08, sound: 'hit_light', power: 0.3, projectile: true }),
        });
      }
    }
  }

  // ---------- abilities ("boss moves") ----------
  // windup / recover in frames; armored: absorbs weaker hits during the whole move.
  const MOVES = {
    teleport: { windup: 10, recover: 4 },
    shadowDash: { windup: 16, recover: 18 },
    soulSlash: { windup: 16, recover: 18 },
    summonSpirits: { windup: 22, recover: 14 },
    bite: { windup: 16, recover: 22 },
    charge: { windup: 18, recover: 26 },
    tailSweep: { windup: 16, recover: 22, armored: true },
    slam: { windup: 24, recover: 26, armored: true },
    leap: { windup: 12, recover: 20 },
    clawRush: { windup: 10, recover: 20 },
    solarFlare: { windup: 26, recover: 22, armored: true },
    dive: { windup: 10, recover: 20 },
    windBolts: { windup: 14, recover: 16 },
    lightning: { windup: 16, recover: 14 },
    sandstorm: { windup: 20, recover: 12, armored: true },
    fakeOut: { windup: 18, recover: 6 },
    sunBeam: { windup: 30, recover: 22 },
    sunOrbs: { windup: 18, recover: 14 },
    lightDash: { windup: 12, recover: 16 },
    solarExplosion: { windup: 44, recover: 26, armored: true },
    soulDrain: { windup: 18, recover: 20 },
    regen: { windup: 10, recover: 10 },
  };

  const heavyKeys = (i) => SA.MOVES['war_hammer:hv'].keys[i][1];
  const slashKeys = (i) => SA.MOVES['katana:a1'].keys[i][1];
  const POSE = {
    crouchCharge: P({ torso: 0.75, head: -0.1, lF1: 1.2, lF2: -1.9, lB1: -0.3, lB2: -1.4, aF1: 0.4, aF2: 0.6, aB1: -0.8, aB2: 0.5 }),
    armsUp: P({ torso: -0.25, head: -0.2, aF1: 2.8, aF2: 0.3, aB1: 2.6, aB2: 0.4, lF1: 0.4, lF2: -0.4, lB1: -0.35, lB2: -0.2 }),
    jaws: P({ torso: 0.85, head: -0.35, aF1: 1.5, aF2: 0.3, aB1: 1.1, aB2: 0.4, lF1: 0.9, lF2: -1.3, lB1: -0.6, lB2: -0.5 }),
    jawsOpen: P({ torso: -0.2, head: -0.4, aF1: 1.0, aF2: 1.4, aB1: 0.6, aB2: 1.6, lF1: 0.5, lF2: -0.9, lB1: -0.4, lB2: -0.5 }),
    sweep: P({ torso: 0.9, head: 0.3, aF1: 0.2, aF2: 0.6, aB1: -0.5, aB2: 0.6, lF1: 1.6, lF2: -2.3, lB1: -1.3, lB2: -0.2, rot: 0.1 }),
    pointF: P({ torso: 0.05, aF1: 1.5, aF2: 0.05, aB1: -0.3, aB2: 1.6, lF1: 0.5, lF2: -0.6, lB1: -0.4, lB2: -0.2 }),
    castHigh: P({ torso: -0.15, aF1: 3.0, aF2: 0.1, aB1: 0.4, aB2: 1.8, lF1: 0.4, lF2: -0.5, lB1: -0.35, lB2: -0.2 }),
    dive: P({ torso: 1.3, head: -0.4, aF1: 2.2, aF2: 0.1, aB1: 1.9, aB2: 0.2, lF1: 0.2, lF2: -0.3, lB1: -0.5, lB2: -0.2 }),
    claw1: P({ torso: 0.5, aF1: 1.9, aF2: 0.2, aB1: -0.6, aB2: 1.5, lF1: 0.9, lF2: -1.1, lB1: -0.6, lB2: -0.3 }),
    claw2: P({ torso: 0.55, aF1: -0.4, aF2: 1.4, aB1: 1.9, aB2: 0.25, lF1: 0.9, lF2: -1.1, lB1: -0.6, lB2: -0.3 }),
    channel: P({ torso: 0.1, head: 0.25, aF1: 1.6, aF2: 1.6, aB1: 1.4, aB2: 1.7, lF1: 0.6, lF2: -1.1, lB1: -0.4, lB2: -0.9 }),
  };
  const WINDUP_POSE = {
    slam: () => heavyKeys(1), fakeOut: () => heavyKeys(1), charge: () => POSE.crouchCharge, shadowDash: () => POSE.crouchCharge,
    lightDash: () => POSE.crouchCharge, soulSlash: () => slashKeys(1), summonSpirits: () => POSE.armsUp, sandstorm: () => POSE.armsUp,
    solarExplosion: () => POSE.armsUp, bite: () => POSE.jawsOpen, tailSweep: () => SA.POSES.crouch, leap: () => SA.POSES.prejump,
    dive: () => SA.POSES.prejump, clawRush: () => POSE.claw2, lightning: () => POSE.castHigh, windBolts: () => POSE.castHigh,
    sunOrbs: () => POSE.castHigh, sunBeam: () => POSE.pointF, soulDrain: () => POSE.pointF, solarFlare: () => POSE.channel, regen: () => POSE.channel,
  };

  // extra: overrides for the ability entry (an AI combo plan passes { follow: false } for a teleport)
  function startAbility(f, target, id, game, extra) {
    const M = MOVES[id];
    if (!M || !(f.isNeutral() || f.state === 'run' || f.state === 'sprint') || !f.grounded) return false;
    const ai = game.ai2 && game.ai2.me === f ? game.ai2 : game.ai1 && game.ai1.me === f ? game.ai1 : null;
    const ab = Object.assign({}, (ai && ai.abilities ? ai.abilities : []).find((a) => a.id === id) || {}, extra || {});
    f.cancelMove();
    f.setState('bossmove');
    f.bm = { id, t: 0, phase: 'windup', fired: 0, target, opts: ab, armored: !!M.armored, pass: false };
    f.facing = Math.sign(target.x - f.x) || f.facing;
    f.hitList.clear();
    f.moveContact = null;
    const col = f.look.accent;
    const pose = WINDUP_POSE[id] ? WINDUP_POSE[id]() : SA.POSES.crouch;
    f.setAnim([[0, f.pose], [M.windup, pose, 'smooth']]);
    // telegraphs so the player can read what is coming
    SA.FX.telegraph(game.particles, f, col);
    if (id === 'sunBeam') {
      const high = chance(0.5);
      f.bm.high = high;
      game.projectiles.spawn({ type: 'beam', warn: true, owner: f, x: f.x + f.facing * 760, y: high ? -248 : -45, vx: 0, vy: 0, life: M.windup / 60, w: 1400, h: 8, ground: true, pierce: true, color: col, data: H('warn', 0) });
    }
    if (id === 'solarExplosion') SA.FX.marker(game.particles, f.x, col, M.windup / 60);
    if (id === 'bite' || id === 'tailSweep') game.label(id === 'bite' ? '!' : 'JUMP!', f.x, f.y - 300 * f.look.scale, '#ffcf6a', f, 0.9);
    SA.audio.play(id === 'teleport' ? 'teleport' : id === 'summonSpirits' || id === 'soulDrain' || id === 'regen' ? 'whisper' : 'charge_up', 0.8);
    return true;
  }

  function updateMove(f, ts, dt, game) {
    const bm = f.bm;
    if (!bm) { f.toNeutral(); return; }
    const M = MOVES[bm.id];
    bm.t += ts;
    f.mt += ts;
    if (bm.phase === 'windup') {
      if (f.grounded) f.vx = damp(f.vx, 0, 14, dt);
      if (Math.floor(bm.t) % 3 === 0) SA.FX.aura(game.particles, f.x, f.y, f.look.accent);
      if ((bm.id === 'regen' || bm.id === 'summonSpirits') && Math.random() < 0.3) SA.FX.glyphRise(game.particles, f.x + rand(-60, 60), f.y - rand(0, 80), f.look.accent);
      if (bm.t >= M.windup) { bm.phase = 'act'; bm.t = 0; act(f, bm, game); }
      return;
    }
    if (bm.phase === 'act') { actUpdate(f, bm, ts, dt, game); return; }
    // recover (the punish window)
    if (f.grounded) f.vx = damp(f.vx, 0, 10, dt);
    if (bm.t >= M.recover) f.toNeutral();
  }

  function toRecover(f, bm) {
    bm.phase = 'recover';
    bm.t = 0;
    bm.pass = false;
    f.vanished = false;
    f.setAnim([[0, f.pose], [MOVES[bm.id].recover, SA.POSES.stance, 'smooth']]);
  }

  function reappear(f, bm, game, x) {
    const tg = bm.target;
    f.vanished = false;
    f.x = f.prevX = clamp(x, -SA.WALL, SA.WALL);
    f.facing = Math.sign(tg.x - f.x) || f.facing;
    SA.FX.smoke(game.particles, f.x, f.y, f.look.accent);
    SA.FX.glyphBurst(game.particles, f.x, f.y - 140, f.look.accent, 5, 260);
    SA.audio.play('teleport', 1.2);
  }

  // a position next to the target (behind it when there is room)
  function besideTarget(tg, behindChance, gap) {
    const behind = Math.random() < behindChance ? -tg.facing : tg.facing;
    let nx = tg.x + behind * gap;
    if (Math.abs(nx) > SA.WALL - 20) nx = tg.x - behind * gap;
    return nx;
  }

  function homing(f, game, type, n, o) {
    const hand = f.skel.handF;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55;
      game.projectiles.spawn({
        type, owner: f, x: hand.x + Math.cos(a) * 40, y: Math.min(-60, hand.y - 30 + Math.sin(a) * 40), vx: Math.cos(a) * 520 + f.facing * 120, vy: Math.sin(a) * 520,
        life: o.life || 3.2, size: o.size || 30, homing: o.turn || 3.2, homingDelay: 0.3 + i * 0.12, speed: o.speed || 720, target: f === game.p1 ? game.p2 : game.p1,
        color: o.color || f.look.accent,
        data: H(type, o.dmg || 20, { hitstun: 18, blockstun: 10, kb: 260, hitstop: 4, shake: 0.18, sound: 'hit_special', power: 0.5, projectile: true, element: o.element || null }),
      });
    }
  }

  function act(f, bm, game) {
    const tg = bm.target, s = f.look.scale, col = f.look.accent;
    f.hitList.clear();
    switch (bm.id) {
      case 'teleport':
        f.vanished = true;
        SA.FX.smoke(game.particles, f.x, f.y, col);
        bm.nx = besideTarget(tg, 0.6, 150 * s);
        break;
      case 'shadowDash': case 'lightDash':
        f.setAnim([[0, SA.POSES.rushDash]]);
        bm.pass = true;
        bm.startSide = Math.sign(tg.x - f.x) || f.facing;
        SA.audio.play('dash', 1.3);
        SA.audio.play('wind', 0.6);
        break;
      case 'soulSlash':
        f.setAnim([[0, slashKeys(2)], [8, slashKeys(3)]]);
        break;
      case 'summonSpirits':
        homing(f, game, 'spirit', bm.opts.count || 2, { dmg: 22, speed: 700, turn: 3.0, color: f.def && f.def.bossId === 'osiris' ? '#6fffb0' : '#8fb4ff' });
        SA.audio.play('whisper', 1);
        toRecover(f, bm);
        break;
      case 'bite':
        f.setAnim([[0, POSE.jaws]]);
        f.vx = f.facing * 760;
        SA.audio.play('whoosh_heavy', 1);
        break;
      case 'charge':
        f.setAnim([[0, SA.POSES.rushDash]]);
        SA.audio.play('dash', 1.3);
        break;
      case 'tailSweep':
        f.setAnim([[0, POSE.sweep]]);
        SA.audio.play('whoosh_heavy', 1.2);
        break;
      case 'slam': {
        f.setAnim([[0, heavyKeys(2)], [6, heavyKeys(3)]]);
        const tipX = f.x + f.facing * 180 * s;
        SA.FX.dust(game.particles, tipX, 0, 1.8, 0);
        game.shake(0.7);
        game.camera.punch(0.08);
        SA.audio.play('boss_impact');
        game.projectiles.shockwave(f, tipX, f.facing, { dmg: 36, speed: 1000, color: SA.M.shade(col, 0.3) });
        SA.Device.vibrate([25, 20, 35]);
        break;
      }
      case 'leap': case 'dive': {
        f.setAnim([[0, SA.POSES.jump]]);
        f.grounded = false;
        const G = SA.GRAVITY;
        if (bm.id === 'leap') {
          const vy = -1450;
          const T = -vy / G + -vy / (G * Math.sqrt(1.18));
          f.vy = vy;
          f.vx = clamp((tg.x - f.x) / T, -1300, 1300);
        } else {
          f.vy = -1900;
          f.vx = f.facing * 200;
        }
        SA.FX.dust(game.particles, f.x, 0, 1, 0);
        SA.audio.play('jump', 1.2);
        break;
      }
      case 'clawRush':
        bm.slash = -1;
        SA.audio.play('roar', 0.5);
        break;
      case 'solarFlare':
        f.setAnim([[0, POSE.armsUp]]);
        SA.FX.special(game.particles, f.x, f.y, '#ff8a2a');
        game.impactFlash(0.25);
        game.shake(0.5);
        SA.audio.play('explosion', 0.8);
        for (const d of [-1, 1]) game.projectiles.shockwave(f, f.x + d * 120, d, { dmg: 30, speed: 900, color: '#ff8a2a', data: { element: 'fire' } });
        break;
      case 'windBolts':
        f.setAnim([[0, POSE.pointF]]);
        break;
      case 'lightning': {
        f.setAnim([[0, POSE.castHigh]]);
        const n = bm.opts.count || 1;
        f.strikes = f.strikes || [];
        for (let i = 0; i < n; i++) {
          const x = clamp(tg.x + (i === 0 ? tg.vx * 0.25 : (i % 2 ? 1 : -1) * 230 * Math.ceil(i / 2)), -SA.WALL, SA.WALL);
          f.strikes.push({ x, t: 0.85 + i * 0.12 });
          SA.FX.marker(game.particles, x, '#c89aff', 0.85 + i * 0.12);
          // flickering column of light where the bolt will land
          game.projectiles.spawn({ type: 'pillar', warn: true, owner: f, x, y: -450, vx: 0, vy: 0, life: 0.85 + i * 0.12, w: 120, h: 900, ground: true, color: '#c89aff', data: H('warn', 0) });
        }
        SA.audio.play('charge_up', 1.1);
        toRecover(f, bm);
        break;
      }
      case 'sandstorm':
        f.stormT = 3.2;
        f.stormShot = 0.4;
        SA.audio.play('wind', 1.2);
        game.shake(0.3);
        toRecover(f, bm);
        break;
      case 'fakeOut':
        // the big wind-up was a lie: vanish and hit from the other side, or strike early
        if (chance(0.55)) {
          f.vanished = true;
          SA.FX.smoke(game.particles, f.x, f.y, col);
          bm.nx = besideTarget(tg, 0.85, 150 * s);
          SA.audio.play('teleport', 1);
        } else {
          f.toNeutral();
          f.startMove(f.moveset.light);
        }
        break;
      case 'sunBeam':
        game.projectiles.spawn({
          type: 'beam', owner: f, x: f.x + f.facing * 760, y: bm.high ? -248 : -45, vx: 0, vy: 0, life: 0.4, w: 1400, h: bm.high ? 40 : 76, ground: true, pierce: true,
          color: '#ffd24a', level: bm.high ? 'high' : 'low',
          data: H('sunBeam', 54, { hitstun: 24, kb: 620, kbY: -520, knockdown: true, level: bm.high ? 'high' : 'low', sound: 'hit_special', power: 1, projectile: true, element: 'fire' }),
        });
        game.impactFlash(0.2);
        game.shake(0.4);
        SA.audio.play('beam', 1);
        f.setAnim([[0, POSE.pointF]]);
        break;
      case 'sunOrbs':
        homing(f, game, 'orb', bm.opts.count || 2, { dmg: 24, speed: 620, turn: 2.2, color: '#ffb13a', element: 'fire' });
        SA.audio.play('energy', 1);
        toRecover(f, bm);
        break;
      case 'solarExplosion':
        f.setAnim([[0, POSE.armsUp]]);
        game.impactFlash(0.6);
        game.shake(1);
        game.camera.punch(0.12);
        SA.FX.explosion(game.particles, f.x, f.y - 120, 420 * s);
        SA.FX.glyphBurst(game.particles, f.x, f.y - 150, '#ffd24a', 14, 700);
        SA.audio.play('explosion', 1.3);
        SA.audio.play('boss_impact');
        break;
      case 'soulDrain':
        bm.ticks = 0;
        f.setAnim([[0, POSE.pointF]]);
        break;
      case 'regen':
        f.setAnim([[0, POSE.channel]]);
        break;
    }
  }

  function actUpdate(f, bm, ts, dt, game) {
    const tg = bm.target, s = f.look.scale;
    switch (bm.id) {
      case 'teleport': case 'fakeOut':
        if (bm.t >= 10) {
          reappear(f, bm, game, bm.nx);
          f.toNeutral();
          // inside an AI combo plan the teleport only repositions; on its own it strikes at once
          if (bm.opts.follow !== false) f.startMove(bm.id === 'fakeOut' ? f.moveset.light : f.moveset.heavy);
        }
        break;
      case 'shadowDash': case 'lightDash': {
        const fast = bm.id === 'lightDash' ? 2500 : 2150;
        f.vx = f.facing * fast * Math.min(1.15, f.speedMul);
        f.spawnGhost(2);
        if (bm.id === 'lightDash') SA.FX.glyphRise(game.particles, f.x, f.y - 60, '#ffd24a');
        else SA.FX.sandTrail(game.particles, f.x, f.y - 20, f.facing, '#2a1a3a');
        const passed = Math.sign(tg.x - f.x) !== bm.startSide && Math.abs(tg.x - f.x) > 170 * s;
        if (passed || bm.t >= 26 || Math.abs(f.x) >= SA.WALL - 2) {
          f.vx = f.facing * 300;
          toRecover(f, bm);
          f.facing = Math.sign(tg.x - f.x) || f.facing;
        }
        break;
      }
      case 'soulSlash': {
        const n = bm.opts.double ? 2 : 1;
        const times = [2, 16];
        while (bm.fired < n && bm.t >= times[bm.fired]) {
          if (bm.fired === 1) f.setAnim([[0, slashKeys(2)], [8, slashKeys(3)]]);
          // the second wave travels low: jump it
          const low = bm.fired === 1;
          game.projectiles.wave(f, f.x + f.facing * 90, low ? -70 : f.y - 170 * s, f.facing, {
            speed: 1500, w: low ? 130 : 120, h: low ? 120 : 230, color: '#7a8cff', life: 0.9,
            data: { id: 'soulSlash', damage: 44, hitstun: 24, blockstun: 16, kb: 620, kbY: -520, knockdown: true, level: low ? 'low' : 'mid', element: 'shadow' },
            extra: { level: low ? 'low' : 'mid' },
          });
          SA.audio.play('draw', 1);
          game.shake(0.3);
          bm.fired++;
        }
        if (bm.t >= (n > 1 ? 24 : 10)) toRecover(f, bm);
        break;
      }
      case 'bite':
        if (bm.grabbed) {
          const b = bm.grabbed;
          f.vx = 0;
          b.x = clamp(f.x + f.facing * 115 * s, -SA.WALL, SA.WALL);
          b.vx = 0;
          if (b.state === 'hitstun') b.stun = Math.max(b.stun, 8);
          if (bm.t >= (bm.chomps + 1) * 14) {
            bm.chomps++;
            const last = bm.chomps >= 3;
            const hit = { region: 'torso', x: b.skel.hip.x, y: b.y - 150 };
            const data = last ? H('bite', 30, { kb: 900, kbY: -760, knockdown: true, hitstop: 10, shake: 0.7, sound: 'boss_impact', power: 1.2 })
              : H('bite', 16, { hitstun: 30, kb: 0, hitstop: 4, shake: 0.3, sound: 'hit_heavy', power: 0.7 });
            SA.Combat.applyHit(f, b, data, hit, game, { dir: f.facing, noScale: true });
            f.setAnim([[0, POSE.jawsOpen], [6, POSE.jaws]]);
            if (last) { bm.grabbed = null; toRecover(f, bm); break; }
          }
          if (b.state !== 'hitstun') { bm.grabbed = null; toRecover(f, bm); }
        } else {
          f.vx = damp(f.vx, 0, 6, dt);
          if (bm.t >= 12) toRecover(f, bm);
        }
        break;
      case 'charge':
        f.vx = f.facing * 1650 * Math.min(1.1, f.speedMul);
        f.spawnGhost(2);
        if (bm.t % 4 < 1) SA.FX.dust(game.particles, f.x - f.facing * 40, 0, 0.5, -f.facing);
        if (bm.t >= 28 || Math.abs(f.x) >= SA.WALL - 2 || f.moveContact) toRecover(f, bm);
        break;
      case 'tailSweep':
        if (bm.t >= 14) toRecover(f, bm);
        break;
      case 'slam':
        if (bm.t >= 6) toRecover(f, bm);
        break;
      case 'leap':
        // airborne: gravity does the work, onLand crashes down
        if (!bm.landed && f.vy > 0 && !bm.falling) { bm.falling = true; f.setAnim([[0, f.pose], [6, POSE.dive]]); }
        if (bm.landed && bm.t - bm.landed >= 5) toRecover(f, bm);
        break;
      case 'dive':
        if (!bm.diving && !bm.landed && (f.vy >= -200 || bm.t >= 26)) {
          // at the apex: aim at where the target is now and dive
          bm.diving = true;
          const dx = tg.x - f.x, dy = -f.y;
          const L = Math.hypot(dx, dy) || 1;
          const sp = 2300;
          f.vx = dx / L * sp; f.vy = Math.max(900, dy / L * sp);
          f.facing = Math.sign(dx) || f.facing;
          f.setAnim([[0, POSE.dive]]);
          f.hitList.clear();
          SA.audio.play('whoosh_heavy', 1.3);
        }
        if (bm.diving && !bm.landed) f.spawnGhost(2);
        if (bm.landed && bm.t - bm.landed >= 5) {
          if (bm.opts.double && !bm.again) {
            // phase 3: bounce up and dive a second time
            bm.again = true; bm.diving = false; bm.landed = 0; bm.t = 0;
            f.grounded = false; f.vy = -1600; f.vx = 0;
            f.setAnim([[0, SA.POSES.jump]]);
            f.hitList.clear();
          } else toRecover(f, bm);
        }
        break;
      case 'clawRush': {
        // four quick claw swipes that walk forward, the last one knocks down
        const idx = Math.floor(bm.t / 8);
        if (idx !== bm.slash && idx < 4) {
          bm.slash = idx;
          f.hitList.clear();
          f.setAnim([[0, f.pose], [4, idx % 2 ? POSE.claw2 : POSE.claw1, 'out']]);
          SA.audio.play('whoosh_heavy', 0.9);
          SA.FX.slash(game.particles, f.x + f.facing * 90 * s, f.y - 150 * s, f.facing, '#ff8a2a');
        }
        f.vx = f.facing * 620;
        if (bm.t >= 32) toRecover(f, bm);
        break;
      }
      case 'solarFlare':
        if (bm.t >= 8) toRecover(f, bm);
        break;
      case 'windBolts': {
        const n = bm.opts.count || 2;
        while (bm.fired < n && bm.t >= bm.fired * 7) {
          const hand = f.skel.handF;
          const y = [-200, -60, -140, -240][bm.fired % 4];
          const low = y > -100;
          game.projectiles.spawn({
            type: 'wind', owner: f, x: hand.x + f.facing * 30, y, vx: f.facing * 1500, vy: 0, life: 1.2, w: 70, h: 44,
            color: '#aee6ff', level: low ? 'low' : 'mid',
            data: H('wind', 18, { hitstun: 16, blockstun: 8, kb: 420, hitstop: 3, shake: 0.12, sound: 'hit_light', power: 0.45, projectile: true, level: low ? 'low' : 'mid' }),
          });
          SA.audio.play('wind', 0.6);
          bm.fired++;
        }
        if (bm.t >= n * 7 + 4) toRecover(f, bm);
        break;
      }
      case 'sunBeam':
        if (bm.t >= 20) toRecover(f, bm);
        break;
      case 'solarExplosion':
        if (bm.t >= 7) toRecover(f, bm);
        break;
      case 'soulDrain': {
        // a stream of souls: every 12 frames a small hit that heals the god (block it or get away)
        const dist = Math.abs(tg.x - f.x);
        const inFront = Math.sign(tg.x - f.x) === f.facing;
        if (bm.t >= (bm.ticks + 1) * 12) {
          bm.ticks++;
          if (dist < 400 * s && inFront && tg.canBeHit(f)) {
            for (let i = 0; i < 4; i++) SA.FX.wisp(game.particles, tg.skel.hip.x + rand(-20, 20), tg.y - 150 + rand(-40, 40), '#6fffb0');
            const blocking = (tg.state === 'block' || tg.state === 'blockstun') && Math.sign(f.x - tg.x) === tg.facing;
            if (blocking) {
              tg.hp = Math.max(1, tg.hp - 2);
              SA.FX.block(game.particles, tg.skel.hip.x, tg.y - 150, -f.facing, 0.4);
            } else {
              const before = tg.hp;
              SA.Combat.applyHit(f, tg, H('soulDrain', 9, { hitstun: 11, kb: -60, hitstop: 2, shake: 0.08, sound: 'hit_light', power: 0.3 }), { region: 'torso', x: tg.skel.hip.x, y: tg.y - 150 }, game, { dir: f.facing, noScale: true });
              f.hp = Math.min(f.maxHp, f.hp + Math.round((before - tg.hp) * 1.5));
            }
          }
        }
        if (bm.t >= 50) toRecover(f, bm);
        break;
      }
      case 'regen':
        // channel: any hit interrupts it (the god is not armored while healing)
        if (Math.floor(bm.t / 6) !== Math.floor((bm.t - ts) / 6)) {
          f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.006));
          SA.FX.glyphRise(game.particles, f.x + rand(-50, 50), f.y - rand(0, 100), '#6fffb0');
        }
        if (bm.t >= 90) toRecover(f, bm);
        break;
      default:
        toRecover(f, bm);
    }
  }

  function moveHit(f) {
    const bm = f.bm;
    if (!bm || bm.phase !== 'act') return null;
    const s = f.look.scale;
    const front = (w, h, off) => ({ x: f.facing > 0 ? f.x + (off || 0) * s : f.x - (w + (off || 0)) * s, y: f.y - h * s, w: w * s, h: h * s });
    switch (bm.id) {
      case 'slam':
        if (bm.t < 5) return { rect: front(290, 230), data: H('slam', 62, { hitstun: 26, blockstun: 18, kb: 700, kbY: -600, knockdown: true, hitstop: 8, shake: 0.7, zoom: 0.08, sound: 'boss_impact', power: 1.2 }) };
        return null;
      case 'charge': {
        const cx = f.x + f.facing * 60 * s;
        return { rect: { x: cx - 70 * s, y: f.y - 260 * s, w: 140 * s, h: 260 * s }, data: H('charge', 52, { hitstun: 26, blockstun: 16, kb: 900, kbY: -520, knockdown: true, shake: 0.5, power: 1 }) };
      }
      case 'shadowDash': case 'lightDash': {
        const cx = f.x + f.facing * 30 * s;
        return { rect: { x: cx - 80 * s, y: f.y - 250 * s, w: 160 * s, h: 250 * s },
          data: H(bm.id, bm.id === 'lightDash' ? 40 : 44, { hitstun: 28, blockstun: 14, kb: 300, kbY: -500, knockdown: true, sound: 'hit_blade', power: 0.9, element: bm.id === 'lightDash' ? 'fire' : 'shadow' }) };
      }
      case 'bite':
        if (bm.grabbed || bm.t > 8) return null;
        return { rect: front(120, 220, 20), data: H('biteGrab', 8, { hitstun: 40, kb: 0, unblockable: true, unparryable: true, hitstop: 6, shake: 0.4, power: 0.7 }),
          onContact(b, kind) { if (kind === 'hit' && b.state === 'hitstun') { bm.grabbed = b; bm.chomps = 0; bm.t = 0; } } };
      case 'tailSweep':
        if (bm.t < 2 || bm.t > 9) return null;
        return { rect: { x: f.x - 290 * s, y: f.y - 68 * s, w: 580 * s, h: 68 * s }, data: H('tailSweep', 44, { hitstun: 24, kb: 640, kbY: -600, knockdown: true, level: 'low', shake: 0.5, power: 1 }) };
      case 'leap':
        if (bm.landed && bm.t - bm.landed < 4) return { rect: { x: f.x - 170 * s, y: f.y - 150 * s, w: 340 * s, h: 150 * s }, data: H('pounce', 54, { hitstun: 26, kb: 640, kbY: -640, knockdown: true, shake: 0.6, power: 1.1 }) };
        if (!f.grounded && f.vy > 0) return { rect: { x: f.x - 90 * s, y: f.y - 200 * s, w: 180 * s, h: 200 * s }, data: H('pounce', 40, { hitstun: 24, kb: 500, kbY: -520, knockdown: true, level: 'overhead', power: 1 }) };
        return null;
      case 'dive':
        if (bm.diving && !bm.landed) return { rect: { x: f.x - 90 * s, y: f.y - 220 * s, w: 180 * s, h: 220 * s }, data: H('dive', 48, { hitstun: 26, kb: 620, kbY: -560, knockdown: true, level: 'overhead', sound: 'hit_blade', power: 1 }) };
        return null;
      case 'clawRush':
        if (bm.t % 8 < 2 || bm.t % 8 > 5) return null;
        return { rect: front(190, 220, 10), data: bm.slash >= 3 ? H('claw', 30, { hitstun: 26, kb: 640, kbY: -560, knockdown: true, sound: 'hit_blade', power: 1, element: 'fire' })
          : H('claw', 16, { hitstun: 20, blockstun: 12, kb: 160, hitstop: 4, shake: 0.18, sound: 'hit_blade', power: 0.5 }) };
      case 'solarFlare':
        if (bm.t < 4) return { rect: { x: f.x - 230 * s, y: f.y - 300 * s, w: 460 * s, h: 300 * s }, data: H('solarFlare', 50, { hitstun: 26, kb: 700, kbY: -600, knockdown: true, sound: 'hit_special', power: 1.1, element: 'fire' }) };
        return null;
      case 'solarExplosion':
        if (bm.t < 5) return { rect: { x: f.x - 420 * s, y: f.y - 420 * s, w: 840 * s, h: 420 * s }, data: H('solarExplosion', 78, { hitstun: 30, blockstun: 22, kb: 900, kbY: -800, knockdown: true, shake: 1, zoom: 0.1, sound: 'boss_impact', power: 1.3, element: 'fire' }) };
        return null;
      default:
        return null;
    }
  }

  function onLand(f, game) {
    const bm = f.bm;
    if (!bm || (bm.id !== 'leap' && bm.id !== 'dive') || bm.landed) { f.toNeutral(); return; }
    bm.landed = Math.max(0.01, bm.t);
    f.vx *= 0.2;
    f.hitList.clear();
    f.setAnim([[0, SA.POSES.crouch]]);
    const s = f.look.scale;
    SA.FX.dust(game.particles, f.x, 0, 1.8, 0);
    game.shake(0.6);
    game.camera.punch(0.06);
    SA.audio.play('boss_impact', 0.8);
    if (bm.id === 'leap') for (const d of [-1, 1]) game.projectiles.shockwave(f, f.x + d * 90 * s, d, { dmg: 26, speed: 850, color: '#ff8a2a' });
  }

  // Boss AI: regular combat AI + phase-aware aggression + lingering effects.
  class BossAI extends SA.EnemyAI {
    aggr() { return super.aggr() * (this.phaseAggression || 1); }
    update(ts) {
      super.update(ts);
      updatePhase(this.me, this, this.game);
      tick(this.me, this.game, ts / 60);
    }
  }

  SA.BOSSES = BOSSES;
  SA.BOSS_ORDER = ORDER;
  SA.BOSS_RENAME = RENAME;
  SA.BossAI = BossAI;
  SA.Bosses = { generate, updatePhase, enterPhase, startAbility, updateMove, moveHit, onLand, tryRevive, tick, applyPhaseMood, MOVES, BOSSES, ORDER, RENAME };
})(window.SA);
