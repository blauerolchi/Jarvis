'use strict';
/*
 * WeaponSystem — data-driven weapons.
 *
 * A melee weapon = a STYLE (how it fights: animations, frame data, combo routes, hitboxes)
 *                + its own stats (damage, speed, reach/length, element, rarity, signature special).
 * Styles generate real moves into SA.MOVES (id "<weapon>:<move>") so the existing combat,
 * animation, AI and hitbox code runs them exactly like the original fist moves.
 *
 * Ranged weapons (throwables / firearms) live in their own slot and fire projectiles
 * (see projectiles.js). They have charges or magazines, cooldowns and reload times.
 */
(function (SA) {
  const P = (o, base) => SA.Anim.P(o, base);
  const S = SA.POSES.stance, C = SA.POSES.crouch, J = SA.POSES.jump, D = SA.POSES.dash;
  const B = SA.BALANCE;

  // ---------- strike templates (base = pose the move starts/ends in) ----------
  // Each returns { base, windup, strike, follow } poses; styles pick templates + frame data.
  const LUNGE_LEGS = { lF1: 0.78, lF2: -1.02, lB1: -0.58, lB2: -0.02 };
  const TPL = {
    slashH: () => ({
      base: S,
      windup: P({ torso: 0.02, hipX: -4, aF1: -0.1, aF2: 2.3, wg: -1.4 }),
      strike: P(Object.assign({ hipX: 16, torso: 0.32, head: 0.05, aF1: 1.5, aF2: 0.12, wg: -0.05 }, LUNGE_LEGS)),
      follow: P(Object.assign({ hipX: 18, torso: 0.36, aF1: 1.05, aF2: 0.1, wg: 0.4 }, LUNGE_LEGS)),
    }),
    slashUp: () => ({
      base: S,
      windup: P({ torso: 0.25, aF1: 0.4, aF2: 0.1, wg: -0.3 }),
      strike: P(Object.assign({ hipX: 14, torso: 0.2, aF1: 2.2, aF2: 0.2, wg: -0.2 }, LUNGE_LEGS)),
      follow: P(Object.assign({ hipX: 14, torso: 0.12, aF1: 2.7, aF2: 0.3, wg: -0.1 }, LUNGE_LEGS)),
    }),
    backSlash: () => ({ // back-hand slash (dual blades)
      base: S,
      windup: P({ torso: 0.05, aB1: -0.2, aB2: 2.2, wgB: -1.3, aF1: 0.7, aF2: 2.0 }),
      strike: P(Object.assign({ hipX: 18, torso: 0.42, aB1: 1.55, aB2: 0.1, wgB: 0, aF1: 0.45, aF2: 2.3 }, LUNGE_LEGS)),
      follow: P(Object.assign({ hipX: 18, torso: 0.44, aB1: 1.1, aB2: 0.1, wgB: 0.4, aF1: 0.45, aF2: 2.3 }, LUNGE_LEGS)),
    }),
    overhead: () => ({
      base: S,
      windup: P({ torso: -0.25, hipX: -6, aF1: 2.9, aF2: 0.5, wg: 0.9, aB1: 2.6, aB2: 0.6 }),
      strike: P(Object.assign({ hipX: 30, torso: 0.6, head: 0.1, aF1: 1.4, aF2: 0.1, wg: 0.15, aB1: 1.2, aB2: 0.3 }, LUNGE_LEGS)),
      follow: P(Object.assign({ hipX: 32, torso: 0.66, aF1: 0.85, aF2: 0.1, wg: 0.4, aB1: 0.8, aB2: 0.3 }, LUNGE_LEGS)),
    }),
    thrust: () => ({
      base: S,
      windup: P({ torso: 0.02, hipX: -10, aF1: 0.7, aF2: 1.4, wg: -0.55, lF1: 0.5, lB1: -0.35 }),
      strike: P(Object.assign({ hipX: 28, torso: 0.42, head: 0.08, aF1: 1.6, aF2: 0.02, wg: -0.05 }, LUNGE_LEGS)),
      follow: P(Object.assign({ hipX: 30, torso: 0.44, aF1: 1.58, aF2: 0.04, wg: -0.05 }, LUNGE_LEGS)),
    }),
    sweepLow: () => ({
      base: C,
      windup: P({ aF1: 0.2, aF2: 1.9, wg: -0.6, torso: 0.5 }, C),
      strike: P({ torso: 0.32, hipX: 12, aF1: 1.25, aF2: 0.05, wg: 0.55 }, C),
      follow: P({ torso: 0.3, hipX: 12, aF1: 0.9, aF2: 0.05, wg: 0.85 }, C),
    }),
    launcher: () => ({
      base: C,
      windup: P({ torso: 0.45, aF1: 0.2, aF2: 0.3, wg: 0.2, lF1: 0.9, lF2: -1.7, lB1: -0.1, lB2: -1.2 }),
      strike: P({ hipX: 14, torso: 0.1, aF1: 1.6, aF2: 0.3, wg: 0.5, lF1: 0.6, lF2: -0.7, lB1: -0.35, lB2: -0.2 }),
      follow: P({ hipX: 16, torso: -0.1, head: -0.2, aF1: 2.8, aF2: 0.3, wg: 0.2, lF1: 0.35, lF2: -0.1, lB1: -0.35, lB2: -0.05 }),
    }),
    dashStrike: () => ({
      base: D,
      windup: P({ torso: 0.55, aF1: -0.3, aF2: 2.0, wg: -1.2, lF1: 1.0, lF2: -1.2, lB1: -0.7, lB2: -0.3 }),
      strike: P({ hipX: 36, torso: 0.7, head: 0.1, aF1: 1.55, aF2: 0.05, wg: 0, lF1: 0.95, lF2: -1.2, lB1: -0.85, lB2: 0 }),
      follow: P({ hipX: 38, torso: 0.7, aF1: 1.2, aF2: 0.05, wg: 0.35, lF1: 0.95, lF2: -1.2, lB1: -0.85, lB2: 0 }),
    }),
    air: () => ({
      base: J,
      windup: P({ aF1: 2.4, aF2: 0.6, wg: 0.3, torso: 0.05 }, J),
      strike: P({ torso: 0.45, aF1: 1.1, aF2: 0.1, wg: 0.45 }, J),
      follow: P({ torso: 0.45, aF1: 0.95, aF2: 0.1, wg: 0.55 }, J),
    }),
    spin: () => ({
      base: S,
      windup: P({ torso: 0.25, aF1: 0.8, aF2: 1.8, wg: -1.0, aB1: 0.6, aB2: 1.8, wgB: -1.0 }),
      strike: P(Object.assign({ hipX: 10, torso: 0.3, aF1: 1.55, aF2: 0.1, wg: 0, aB1: 1.45, aB2: 0.1, wgB: 0.1 }, LUNGE_LEGS)),
      follow: P(Object.assign({ hipX: 12, torso: 0.3, aF1: 1.2, aF2: 0.1, wg: 0.3, aB1: 1.1, aB2: 0.1, wgB: 0.4 }, LUNGE_LEGS)),
    }),
    slam: () => ({
      base: S,
      windup: P({ torso: -0.3, hipX: -10, aF1: 3.0, aF2: 0.3, wg: 0.6, aB1: 2.8, aB2: 0.5, lF1: 0.5, lF2: -0.9 }),
      strike: P({ hipX: 26, torso: 0.85, head: 0.3, aF1: 1.0, aF2: 0.1, wg: 0.55, aB1: 0.9, aB2: 0.3, lF1: 1.0, lF2: -1.4, lB1: -0.6, lB2: -0.1 }),
      follow: P({ hipX: 26, torso: 0.88, head: 0.3, aF1: 0.8, aF2: 0.1, wg: 0.7, aB1: 0.8, aB2: 0.3, lF1: 1.0, lF2: -1.4, lB1: -0.6, lB2: -0.1 }),
    }),
    reap: () => ({ // scythe pull: sweep from far forward back towards the body
      base: S,
      windup: P({ torso: 0.35, hipX: 20, aF1: 1.9, aF2: 0.1, wg: 0.9, lF1: 0.8, lF2: -1.0 }),
      strike: P({ torso: 0.1, hipX: 0, aF1: 1.5, aF2: 0.1, wg: 1.6, lF1: 0.55, lF2: -0.8 }),
      follow: P({ torso: -0.15, hipX: -12, aF1: 0.8, aF2: 0.4, wg: 1.8, lF1: 0.45, lF2: -0.7 }),
    }),
    // ranged: throw / aim
    throw: () => ({
      base: S,
      windup: P({ torso: -0.15, hipX: -6, aF1: -0.5, aF2: 1.6, wg: -0.35 }),
      strike: P({ torso: 0.35, hipX: 12, aF1: 1.55, aF2: 0.15 }),
      follow: P({ torso: 0.3, hipX: 12, aF1: 1.1, aF2: 0.2 }),
    }),
    aim: () => ({
      base: S,
      windup: P({ torso: 0.02, aF1: 1.45, aF2: 0.1, wg: -0.05, aB1: 1.2, aB2: 0.6 }),
      strike: P({ torso: -0.08, head: 0.1, aF1: 1.62, aF2: 0.02, wg: -0.05, aB1: 1.35, aB2: 0.4 }),
      follow: P({ torso: -0.14, aF1: 1.9, aF2: 0.05, wg: -0.05, aB1: 1.3, aB2: 0.5 }),
    }),
    airThrow: () => ({
      base: J,
      windup: P({ aF1: 2.6, aF2: 0.8, torso: -0.1 }, J),
      strike: P({ aF1: 1.2, aF2: 0.1, torso: 0.4 }, J),
      follow: P({ aF1: 1.0, aF2: 0.1, torso: 0.4 }, J),
    }),
  };

  function buildKeys(tpl, st, ac, rc, ease) {
    const t = TPL[tpl]();
    const total = st + ac + rc;
    return [
      [0, t.base],
      [Math.max(1, Math.round(st * 0.6)), t.windup],
      [st, t.strike, ease || 'out'],
      [st + ac, t.follow],
      [total, t.base, 'smooth'],
    ];
  }

  // ---------- styles: how each weapon class fights ----------
  // moves: frame data in "baseline" frames (speed 1), damage before weapon multipliers.
  // map: which move each input produces. Kicks (L) stay the character's own kicks.
  const hitF = (pad) => ({ seg: 'F', pad });
  const hitB = (pad) => ({ seg: 'B', pad });

  const STYLES = {
    sword: {
      labels: { light: 'SLASH', heavy: 'HEAVY' },
      moves: {
        a1: { tpl: 'slashH', st: 7, ac: 4, rc: 13, dmg: 44, kb: 300, hitstun: 16, blockstun: 10, level: 'high', lunge: [1, 280], hit: hitF(20), power: 0.45, chain: { light: 'a2', heavy: 'a3', kick: 'kick' } },
        a2: { tpl: 'slashUp', st: 7, ac: 4, rc: 14, dmg: 48, kb: 320, hitstun: 17, blockstun: 10, level: 'high', lunge: [1, 300], hit: hitF(20), power: 0.5, chain: { heavy: 'a3', light: 'a3' } },
        a3: { tpl: 'overhead', st: 12, ac: 5, rc: 22, dmg: 112, kb: 860, kbY: -500, knockdown: true, hitstun: 26, blockstun: 14, level: 'high', lunge: [7, 620], hit: hitF(26), power: 1, hitstop: 6, shake: 0.5, zoom: 0.07 },
        hv: { tpl: 'dashStrike', st: 13, ac: 4, rc: 22, dmg: 92, kb: 720, hitstun: 24, blockstun: 14, level: 'high', lunge: [8, 760], hit: hitF(24), power: 0.85, hitstop: 5, shake: 0.35, zoom: 0.04 },
        low: { tpl: 'sweepLow', st: 8, ac: 4, rc: 15, dmg: 46, kb: 220, hitstun: 20, blockstun: 10, level: 'low', crouching: true, lunge: [2, 240], hit: hitF(18), power: 0.45, chain: { light: 'launch', heavy: 'launch' } },
        launch: { tpl: 'launcher', st: 8, ac: 6, rc: 20, dmg: 80, kb: 260, kbY: -1150, knockdown: true, hitstun: 24, blockstun: 12, level: 'mid', lunge: [3, 300], hit: hitF(26), power: 0.9, hitstop: 5, shake: 0.4 },
        over: { tpl: 'overhead', st: 15, ac: 4, rc: 20, dmg: 70, kb: 420, hitstun: 22, blockstun: 12, level: 'overhead', lunge: [8, 420], hit: hitF(24), power: 0.7, hitstop: 5, shake: 0.3 },
        dash: { tpl: 'dashStrike', st: 6, ac: 6, rc: 18, dmg: 78, kb: 650, hitstun: 22, blockstun: 12, level: 'high', lunge: [0, 1000], friction: 5, hit: hitF(24), power: 0.8 },
        air: { tpl: 'air', st: 5, ac: 8, rc: 10, dmg: 58, kb: 340, hitstun: 18, blockstun: 10, level: 'overhead', air: true, hit: hitF(26), power: 0.55 },
      },
      combos: [['a1', 'a2', 'a3', 'FLURRY'], ['low', 'launch', 'RISING MOON']],
    },
    dual: {
      labels: { light: 'SLASH', heavy: 'CROSS' },
      moves: {
        a1: { tpl: 'slashH', st: 4, ac: 3, rc: 9, dmg: 26, kb: 180, hitstun: 15, blockstun: 8, level: 'high', lunge: [1, 260], hit: hitF(18), power: 0.3, chain: { light: 'a2', heavy: 'a4', kick: 'kick' } },
        a2: { tpl: 'backSlash', st: 5, ac: 3, rc: 10, dmg: 28, kb: 200, hitstun: 15, blockstun: 8, level: 'high', lunge: [1, 280], hit: hitB(18), power: 0.32, chain: { light: 'a3', heavy: 'a4' } },
        a3: { tpl: 'slashUp', st: 5, ac: 3, rc: 10, dmg: 30, kb: 220, hitstun: 16, blockstun: 8, level: 'high', lunge: [1, 280], hit: hitF(18), power: 0.34, chain: { light: 'a4', heavy: 'a4' } },
        a4: { tpl: 'spin', st: 9, ac: 6, rc: 18, dmg: 62, kb: 760, kbY: -480, knockdown: true, hitstun: 24, blockstun: 12, level: 'high', lunge: [3, 520], hit: hitF(30), spin: [0, 8], power: 0.85, hitstop: 5, shake: 0.4 },
        hv: { tpl: 'spin', st: 11, ac: 5, rc: 18, dmg: 70, kb: 600, hitstun: 22, blockstun: 12, level: 'high', lunge: [6, 560], hit: hitF(28), power: 0.75, hitstop: 5, shake: 0.3 },
        low: { tpl: 'sweepLow', st: 5, ac: 3, rc: 11, dmg: 28, kb: 160, hitstun: 18, blockstun: 8, level: 'low', crouching: true, lunge: [1, 220], hit: hitF(16), power: 0.3, chain: { light: 'launch', heavy: 'launch' } },
        launch: { tpl: 'launcher', st: 7, ac: 5, rc: 18, dmg: 58, kb: 220, kbY: -1100, knockdown: true, hitstun: 22, blockstun: 10, level: 'mid', lunge: [2, 280], hit: hitF(24), power: 0.7 },
        over: { tpl: 'overhead', st: 12, ac: 4, rc: 18, dmg: 52, kb: 360, hitstun: 20, blockstun: 10, level: 'overhead', lunge: [6, 400], hit: hitF(22), power: 0.6 },
        dash: { tpl: 'dashStrike', st: 5, ac: 5, rc: 14, dmg: 56, kb: 520, hitstun: 22, blockstun: 10, level: 'high', lunge: [0, 1100], friction: 5, hit: hitF(20), power: 0.6, chain: { light: 'a2' } },
        air: { tpl: 'air', st: 4, ac: 8, rc: 8, dmg: 40, kb: 280, hitstun: 18, blockstun: 8, level: 'overhead', air: true, hit: hitF(22), power: 0.45 },
      },
      combos: [['a1', 'a2', 'a3', 'a4', 'BLADE DANCE'], ['dash', 'a2', 'SHADOW DART']],
    },
    staff: {
      labels: { light: 'STRIKE', heavy: 'SWEEP' },
      moves: {
        a1: { tpl: 'thrust', st: 6, ac: 3, rc: 10, dmg: 36, kb: 300, hitstun: 16, blockstun: 9, level: 'mid', lunge: [1, 240], hit: hitF(16), power: 0.35, chain: { light: 'a2', heavy: 'a3', kick: 'kick' } },
        a2: { tpl: 'slashUp', st: 7, ac: 4, rc: 12, dmg: 40, kb: 320, hitstun: 17, blockstun: 9, level: 'high', lunge: [1, 260], hit: hitF(20), power: 0.4, chain: { heavy: 'a3', light: 'a3' } },
        a3: { tpl: 'spin', st: 10, ac: 6, rc: 18, dmg: 82, kb: 760, kbY: -460, knockdown: true, hitstun: 24, blockstun: 12, level: 'mid', lunge: [4, 480], hit: hitF(28), spin: [0, 9], power: 0.85, hitstop: 5, shake: 0.4 },
        hv: { tpl: 'thrust', st: 11, ac: 4, rc: 16, dmg: 74, kb: 820, hitstun: 22, blockstun: 12, level: 'mid', lunge: [6, 720], hit: hitF(22), power: 0.75, hitstop: 5, shake: 0.3 },
        low: { tpl: 'sweepLow', st: 9, ac: 5, rc: 16, dmg: 46, kb: 260, kbY: -360, knockdown: true, hitstun: 20, blockstun: 10, level: 'low', crouching: true, lunge: [2, 220], hit: hitF(20), power: 0.55 },
        launch: { tpl: 'launcher', st: 7, ac: 7, rc: 18, dmg: 70, kb: 240, kbY: -1150, knockdown: true, hitstun: 24, blockstun: 12, level: 'mid', lunge: [3, 280], hit: hitF(26), power: 0.8 },
        over: { tpl: 'overhead', st: 13, ac: 4, rc: 18, dmg: 64, kb: 420, hitstun: 22, blockstun: 12, level: 'overhead', lunge: [6, 400], hit: hitF(24), power: 0.65 },
        dash: { tpl: 'thrust', st: 6, ac: 6, rc: 16, dmg: 66, kb: 700, hitstun: 22, blockstun: 12, level: 'mid', lunge: [0, 980], friction: 5, hit: hitF(20), power: 0.7 },
        air: { tpl: 'air', st: 6, ac: 8, rc: 10, dmg: 52, kb: 340, hitstun: 18, blockstun: 10, level: 'overhead', air: true, hit: hitF(24), power: 0.5 },
      },
      blockBonus: 0.3,
      combos: [['a1', 'a2', 'a3', 'WHIRLING STAFF']],
    },
    spear: {
      labels: { desc: 'Leaf-bladed bronze spear. Extreme reach: win by spacing, get punished up close.', grip: '#5a3e22', metal: '#b88a44', name: 'Bronze Spear', light: 'THRUST', heavy: 'LUNGE' },
      moves: {
        a1: { tpl: 'thrust', st: 9, ac: 4, rc: 17, dmg: 50, kb: 360, hitstun: 18, blockstun: 10, level: 'mid', lunge: [2, 260], hit: hitF(14), power: 0.45, chain: { light: 'a2', heavy: 'hv', kick: 'kick' } },
        a2: { tpl: 'thrust', st: 8, ac: 4, rc: 18, dmg: 54, kb: 420, hitstun: 18, blockstun: 10, level: 'mid', lunge: [2, 300], hit: hitF(14), power: 0.5, chain: { heavy: 'launch' } },
        hv: { tpl: 'thrust', st: 14, ac: 5, rc: 24, dmg: 96, kb: 900, hitstun: 24, blockstun: 14, level: 'mid', lunge: [9, 820], hit: hitF(18), power: 0.9, hitstop: 6, shake: 0.4, zoom: 0.05 },
        low: { tpl: 'sweepLow', st: 10, ac: 4, rc: 18, dmg: 52, kb: 280, hitstun: 20, blockstun: 10, level: 'low', crouching: true, lunge: [3, 240], hit: hitF(16), power: 0.5 },
        launch: { tpl: 'launcher', st: 10, ac: 6, rc: 22, dmg: 78, kb: 260, kbY: -1150, knockdown: true, hitstun: 24, blockstun: 12, level: 'mid', lunge: [4, 300], hit: hitF(24), power: 0.85 },
        over: { tpl: 'overhead', st: 16, ac: 4, rc: 22, dmg: 74, kb: 460, hitstun: 22, blockstun: 12, level: 'overhead', lunge: [9, 400], hit: hitF(22), power: 0.7 },
        dash: { tpl: 'thrust', st: 7, ac: 6, rc: 20, dmg: 82, kb: 780, hitstun: 22, blockstun: 12, level: 'mid', lunge: [0, 1100], friction: 4.5, hit: hitF(16), power: 0.8 },
        air: { tpl: 'air', st: 7, ac: 8, rc: 12, dmg: 56, kb: 360, hitstun: 18, blockstun: 10, level: 'overhead', air: true, hit: hitF(20), power: 0.5 },
      },
      combos: [['a1', 'a2', 'launch', 'PIERCING ASCENT'], ['a1', 'hv', 'IMPALER']],
    },
    heavy: {
      labels: { light: 'CLEAVE', heavy: 'SLAM' },
      moves: {
        a1: { tpl: 'slashH', st: 11, ac: 5, rc: 19, dmg: 74, kb: 620, hitstun: 22, blockstun: 14, level: 'high', lunge: [4, 360], hit: hitF(28), power: 0.75, hitstop: 5, shake: 0.3, chain: { light: 'a2', heavy: 'a3', kick: 'kick' } },
        a2: { tpl: 'slashUp', st: 12, ac: 5, rc: 20, dmg: 80, kb: 660, hitstun: 22, blockstun: 14, level: 'high', lunge: [4, 380], hit: hitF(28), power: 0.8, hitstop: 5, shake: 0.35, chain: { heavy: 'a3', light: 'a3' } },
        a3: { tpl: 'slam', st: 16, ac: 5, rc: 26, dmg: 128, kb: 900, kbY: -560, knockdown: true, hitstun: 28, blockstun: 18, level: 'mid', lunge: [8, 520], hit: hitF(34), power: 1.1, hitstop: 8, shake: 0.7, zoom: 0.08 },
        hv: { tpl: 'slam', st: 18, ac: 5, rc: 26, dmg: 115, kb: 800, kbY: -520, knockdown: true, hitstun: 26, blockstun: 18, level: 'mid', lunge: [9, 420], hit: hitF(34), power: 1.05, hitstop: 8, shake: 0.7, zoom: 0.08, armor: [3, 18], effect: 'shockwave' },
        low: { tpl: 'sweepLow', st: 12, ac: 5, rc: 20, dmg: 70, kb: 360, kbY: -380, knockdown: true, hitstun: 22, blockstun: 12, level: 'low', crouching: true, lunge: [3, 260], hit: hitF(24), power: 0.7, hitstop: 5 },
        launch: { tpl: 'launcher', st: 12, ac: 6, rc: 24, dmg: 96, kb: 300, kbY: -1150, knockdown: true, hitstun: 26, blockstun: 14, level: 'mid', lunge: [4, 320], hit: hitF(30), power: 1, hitstop: 6, shake: 0.5 },
        over: { tpl: 'slam', st: 20, ac: 5, rc: 24, dmg: 96, kb: 600, hitstun: 24, blockstun: 16, level: 'overhead', lunge: [10, 420], hit: hitF(30), power: 0.95, hitstop: 7, shake: 0.6, armor: [4, 20] },
        dash: { tpl: 'dashStrike', st: 9, ac: 6, rc: 22, dmg: 96, kb: 820, hitstun: 24, blockstun: 14, level: 'high', lunge: [0, 900], friction: 4.5, hit: hitF(28), power: 0.9, hitstop: 6 },
        air: { tpl: 'air', st: 8, ac: 8, rc: 14, dmg: 80, kb: 420, hitstun: 20, blockstun: 12, level: 'overhead', air: true, hit: hitF(30), power: 0.7, hitstop: 5 },
      },
      combos: [['a1', 'a2', 'a3', 'EARTHBREAKER']],
    },
    scythe: {
      labels: { desc: 'Long harvesting blade of the underworld. The heavy HOOK pulls enemies in.', grip: '#2a1c12', metal: '#9a8a6a', name: 'Reaper’s Sickle', light: 'REAP', heavy: 'HOOK' },
      moves: {
        a1: { tpl: 'slashH', st: 9, ac: 5, rc: 15, dmg: 50, kb: 280, hitstun: 18, blockstun: 10, level: 'high', lunge: [2, 280], hit: hitF(26), power: 0.5, chain: { light: 'a2', heavy: 'hv', kick: 'kick' } },
        a2: { tpl: 'slashUp', st: 9, ac: 5, rc: 16, dmg: 54, kb: 300, hitstun: 18, blockstun: 10, level: 'high', lunge: [2, 280], hit: hitF(26), power: 0.55, chain: { heavy: 'hv', light: 'launch' } },
        hv: { tpl: 'reap', st: 11, ac: 6, rc: 18, dmg: 60, kb: -420, hitstun: 26, blockstun: 12, level: 'mid', hit: hitF(30), power: 0.7, hitstop: 5, shake: 0.3, chain: { light: 'a1', heavy: 'launch' } },
        low: { tpl: 'sweepLow', st: 11, ac: 6, rc: 18, dmg: 58, kb: 300, kbY: -380, knockdown: true, hitstun: 22, blockstun: 12, level: 'low', crouching: true, lunge: [3, 240], hit: hitF(26), power: 0.6 },
        launch: { tpl: 'launcher', st: 10, ac: 7, rc: 20, dmg: 84, kb: 260, kbY: -1150, knockdown: true, hitstun: 24, blockstun: 12, level: 'mid', lunge: [3, 280], hit: hitF(30), power: 0.9, hitstop: 5 },
        over: { tpl: 'overhead', st: 16, ac: 5, rc: 20, dmg: 76, kb: 460, hitstun: 22, blockstun: 12, level: 'overhead', lunge: [8, 420], hit: hitF(28), power: 0.75 },
        dash: { tpl: 'dashStrike', st: 7, ac: 7, rc: 20, dmg: 76, kb: 640, hitstun: 22, blockstun: 12, level: 'high', lunge: [0, 1000], friction: 5, hit: hitF(28), power: 0.75 },
        air: { tpl: 'air', st: 7, ac: 9, rc: 12, dmg: 60, kb: 360, hitstun: 18, blockstun: 10, level: 'overhead', air: true, hit: hitF(28), power: 0.55 },
      },
      combos: [['a1', 'hv', 'launch', 'GRIM HARVEST'], ['a1', 'a2', 'launch', 'DEATH SPIRAL']],
    },
    baton: {
      labels: { light: 'STRIKE', heavy: 'SHOCK' },
      moves: {
        a1: { tpl: 'slashH', st: 6, ac: 3, rc: 11, dmg: 38, kb: 260, hitstun: 16, blockstun: 9, level: 'high', lunge: [1, 260], hit: hitF(18), power: 0.4, chain: { light: 'a2', heavy: 'a3', kick: 'kick' } },
        a2: { tpl: 'slashUp', st: 6, ac: 3, rc: 12, dmg: 40, kb: 280, hitstun: 17, blockstun: 9, level: 'high', lunge: [1, 280], hit: hitF(18), power: 0.42, chain: { heavy: 'a3', light: 'a3' } },
        a3: { tpl: 'overhead', st: 11, ac: 4, rc: 20, dmg: 88, kb: 760, kbY: -480, knockdown: true, hitstun: 24, blockstun: 12, level: 'high', lunge: [6, 560], hit: hitF(22), power: 0.9, hitstop: 6, shake: 0.4, stunProc: 1 },
        hv: { tpl: 'thrust', st: 12, ac: 5, rc: 20, dmg: 72, kb: 520, hitstun: 30, blockstun: 12, level: 'mid', lunge: [7, 560], hit: hitF(24), power: 0.75, hitstop: 6, shake: 0.35, stunProc: 1 },
        low: { tpl: 'sweepLow', st: 7, ac: 4, rc: 14, dmg: 40, kb: 200, hitstun: 20, blockstun: 9, level: 'low', crouching: true, lunge: [2, 230], hit: hitF(16), power: 0.4, chain: { light: 'launch', heavy: 'launch' } },
        launch: { tpl: 'launcher', st: 7, ac: 6, rc: 20, dmg: 74, kb: 240, kbY: -1120, knockdown: true, hitstun: 24, blockstun: 12, level: 'mid', lunge: [3, 280], hit: hitF(22), power: 0.8 },
        over: { tpl: 'overhead', st: 14, ac: 4, rc: 18, dmg: 60, kb: 380, hitstun: 22, blockstun: 12, level: 'overhead', lunge: [7, 380], hit: hitF(20), power: 0.6 },
        dash: { tpl: 'dashStrike', st: 6, ac: 5, rc: 17, dmg: 70, kb: 620, hitstun: 22, blockstun: 12, level: 'high', lunge: [0, 1000], friction: 5, hit: hitF(20), power: 0.7 },
        air: { tpl: 'air', st: 5, ac: 8, rc: 10, dmg: 50, kb: 320, hitstun: 18, blockstun: 10, level: 'overhead', air: true, hit: hitF(22), power: 0.5 },
      },
      combos: [['a1', 'a2', 'a3', 'OVERLOAD']],
    },
  };

  // fists use the original hand-authored moves
  // Input -> move. Directional heavies: neutral / forward (lunge) / up (uppercut, launcher) / down (sweep).
  // Mobility attacks: dash + attack, running attack, slide (run + down + attack), backstep counter.
  const FIST_MAP = {
    light: 'jab', lightDown: 'crouchJab', heavy: 'heavy', heavyFwd: 'lunge', heavyDown: 'sweep', heavyUp: 'uppercut',
    dashLight: 'dashPunch', dashHeavy: 'slideKick', runLight: 'runStrike', slide: 'slideKick', backCounter: 'backCounter',
    airLight: 'airPunch', airHeavy: 'airSmash', airKick: 'flyingKick', kick: 'kick', kickDown: 'lowKick',
  };
  const STYLE_MAP = {
    light: 'a1', lightDown: 'low', heavy: 'over', heavyFwd: 'hv', heavyDown: 'sweep', heavyUp: 'launch',
    dashLight: 'dash', runLight: 'dash', backCounter: 'dash', airLight: 'air', airHeavy: 'airHeavy',
  };
  // every weapon style gets a heavy air strike (jump + heavy): a slower, harder downward cut
  for (const st of Object.values(STYLES)) {
    const air = st.moves.air;
    if (!air || st.moves.airHeavy) continue;
    st.moves.airHeavy = Object.assign({}, air, {
      st: air.st + 3, ac: air.ac + 1, rc: air.rc + 4, dmg: Math.round(air.dmg * 1.4), kb: 460, kbY: -380, knockdown: true,
      power: 0.82, hitstop: 5, shake: 0.32, chain: null,
    });
  }
  // every weapon style gets a knockdown sweep (down + heavy), derived from its low attack
  for (const st of Object.values(STYLES)) {
    const low = st.moves.low;
    if (!low || st.moves.sweep) continue;
    st.moves.sweep = Object.assign({}, low, {
      st: low.st + 3, ac: low.ac + 2, rc: low.rc + 7, dmg: Math.round(low.dmg * 1.35), kb: 240, kbY: -420,
      knockdown: true, level: 'low', crouching: true, power: 0.72, hitstop: 5, shake: 0.3, chain: null,
      lunge: [2, (low.lunge ? low.lunge[1] : 220) + 60],
    });
  }

  // ---------- catalog ----------
  // melee: style, len (reach of the weapon itself), back (length behind the hand), speed, damage
  const WEAPONS = {
    fists: { name: 'Fists', type: 'melee', style: 'fists', rarity: 'common', price: 0, levelRequired: 1,
      speed: 1, damage: 1, len: 0, desc: 'Linen-wrapped fists of the dead. Fast, mobile, always with you.', icon: 'fist' },
    cursed_fists: { name: 'Cursed Fists', type: 'melee', style: 'fists', rarity: 'epic', price: 5200, levelRequired: 14,
      speed: 1, damage: 1.07, len: 0, element: 'shadow', icon: 'fist',
      desc: 'Wrappings soaked in a pharaoh’s curse: every fist strike bites a little harder and leaves black smoke.' },
    wood_staff: { grip: '#6a4a2e', metal: '#c9a25a', name: 'Ceremonial Staff', type: 'melee', style: 'staff', rarity: 'common', price: 250, levelRequired: 1,
      speed: 1.02, damage: 0.92, len: 115, back: 70, look: 'staff', color: '#6a4a2e',
      desc: 'Temple staff of cedar and gold. Long reach, quick pokes, sturdy guard.' },
    katana: { grip: '#3a2616', metal: '#c89a4a', name: 'Khopesh', type: 'melee', style: 'sword', rarity: 'uncommon', price: 1200, levelRequired: 3,
      speed: 1, damage: 1, len: 108, back: 26, look: 'khopesh', special: 'slash',
      desc: 'The sickle-sword of the pharaoh’s soldiers. Balanced reach and speed. Signature: Crescent of Anubis.' },
    bo_staff: { grip: '#2a1f16', metal: '#e0b24a', name: 'Ankh Staff', type: 'melee', style: 'staff', rarity: 'rare', price: 2600, levelRequired: 7,
      speed: 1.05, damage: 1.02, len: 125, back: 80, look: 'ankh', color: '#5b6068', element: null,
      desc: 'Staff crowned with the ankh. Faster sweeps, excellent anti-air and defense.' },
    dual_blades: { grip: '#2a1c12', metal: '#b88a44', name: 'Dual Khopesh', type: 'melee', style: 'dual', rarity: 'uncommon', price: 2000, levelRequired: 5,
      speed: 1.05, damage: 1, len: 62, back: 12, dual: true, look: 'khopesh',
      desc: 'Two short sickle-blades. Very fast four-hit strings and dash cancels.' },
    spear: { name: 'Spear', type: 'melee', style: 'spear', rarity: 'rare', price: 3200, levelRequired: 8,
      speed: 1, damage: 1, len: 170, back: 60, look: 'spear',
      desc: 'Extreme reach, slow recovery. Win by spacing; get punished up close.' },
    great_sword: { grip: '#1c3a6a', metal: '#e6be5a', name: 'Pharaoh Greatsword', type: 'melee', style: 'heavy', rarity: 'rare', price: 4500, levelRequired: 10,
      speed: 0.95, damage: 1.02, len: 132, back: 30, look: 'greatsword',
      desc: 'Gilded royal blade. Huge damage; heavy attacks shrug off hits while winding up.' },
    war_hammer: { grip: '#4a3220', metal: '#8a7a62', name: 'War Mace', type: 'melee', style: 'heavy', rarity: 'rare', price: 6500, levelRequired: 15,
      speed: 0.9, damage: 1.06, len: 118, back: 40, look: 'mace', special: 'quake',
      desc: 'Stone-headed mace. Massive knockback, the slam sends a shockwave. Signature: Earthshaker.' },
    frost_spear: { grip: '#2a2a3a', metal: '#bfd6e8', name: 'Moonlit Spear', type: 'melee', style: 'spear', rarity: 'epic', price: 11000, levelRequired: 18,
      speed: 1.02, damage: 1, len: 175, back: 60, look: 'spear', element: 'frost',
      desc: 'Blessed by the moon god Khonsu. Hits may chill and slow the target.' },
    scythe: { name: 'Scythe', type: 'melee', style: 'scythe', rarity: 'epic', price: 9000, levelRequired: 20,
      speed: 0.98, damage: 1, len: 150, back: 50, look: 'scythe',
      desc: 'Wide sweeps. The heavy HOOK pulls enemies toward you for follow-ups.' },
    flame_katana: { grip: '#4a1a10', metal: '#f0b040', name: 'Solar Khopesh', type: 'melee', style: 'sword', rarity: 'epic', price: 15000, levelRequired: 22,
      speed: 1, damage: 1, len: 110, back: 26, look: 'khopesh', element: 'fire', special: 'slash',
      desc: 'Forged in the light of Ra: burns on hit. Signature: Crescent of Anubis.' },
    electric_baton: { grip: '#1c2a3a', metal: '#6ab8d8', name: 'Was Sceptre', type: 'melee', style: 'baton', rarity: 'epic', price: 12000, levelRequired: 25,
      speed: 1.04, damage: 1, len: 84, back: 18, look: 'scepter', element: 'shock',
      desc: 'Sceptre of Set, crackling with storm power. Chance to stun; the heavy always stuns.' },
    shadow_blades: { grip: '#101a18', metal: '#2fb8a0', name: 'Scarab Blades', type: 'melee', style: 'dual', rarity: 'legendary', price: 22000, levelRequired: 27,
      speed: 1.08, damage: 1, len: 66, back: 12, dual: true, look: 'khopesh', element: 'shadow',
      desc: 'Twin blades of green scarab bronze. Dashes leave a shadow trail.' },
    thunder_hammer: { grip: '#2a1a14', metal: '#6a7a9a', name: 'Mace of Set', type: 'melee', style: 'heavy', rarity: 'legendary', price: 30000, levelRequired: 28,
      speed: 0.92, damage: 1.04, len: 120, back: 40, look: 'mace', element: 'shock', special: 'quake',
      desc: 'The chaos god’s mace, the slam crackles with lightning. Signature: Earthshaker.' },
    shadow_katana: { grip: '#c9a24e', metal: '#1a1620', name: 'Khopesh of Anubis', type: 'melee', style: 'sword', rarity: 'legendary', price: 25000, levelRequired: 30,
      speed: 1.05, damage: 1.02, len: 114, back: 26, look: 'khopesh', element: 'shadow', special: 'slash',
      desc: 'Black blade of the Guardian of the Dead. Faster cuts and a shadow trail.' },
    // boss-only
    executioner_axe: { grip: '#2a1c12', metal: '#6a6258', name: 'Executioner’s Axe', type: 'melee', style: 'heavy', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 0.86, damage: 1.1, len: 150, back: 50, look: 'axe' },
    titan_hammer: { grip: '#1c1a12', metal: '#4a5a42', name: 'Sobek’s Maul', type: 'melee', style: 'heavy', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 0.85, damage: 1.12, len: 135, back: 50, look: 'mace', element: 'shock' },
    // weapons of the gods (boss-only)
    anubis_khopesh: { grip: '#d4a84a', metal: '#141018', name: 'Khopesh of the Dead', type: 'melee', style: 'sword', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 1.04, damage: 1.08, len: 128, back: 28, look: 'khopesh', element: 'shadow' },
    sekhmet_claws: { grip: '#8a1a10', metal: '#f0b43a', name: 'Claws of Sekhmet', type: 'melee', style: 'dual', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 1.12, damage: 1.02, len: 52, back: 10, dual: true, look: 'khopesh', element: 'fire' },
    horus_spear: { grip: '#1a3a8a', metal: '#f2c458', name: 'Spear of Horus', type: 'melee', style: 'spear', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 1.06, damage: 1.04, len: 190, back: 60, look: 'spear' },
    set_sceptre: { grip: '#3a1a2a', metal: '#8a6a9a', name: 'Was of Chaos', type: 'melee', style: 'heavy', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 0.9, damage: 1.08, len: 128, back: 44, look: 'mace', element: 'shock' },
    ra_sceptre: { grip: '#c0501a', metal: '#ffd24a', name: 'Sceptre of Ra', type: 'melee', style: 'staff', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 1.02, damage: 1.06, len: 170, back: 80, look: 'scepter', element: 'fire' },
    osiris_crook: { grip: '#1f3a8a', metal: '#e0b24a', name: 'Crook of Osiris', type: 'melee', style: 'scythe', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      speed: 0.98, damage: 1.06, len: 150, back: 40, look: 'scythe' },
  };

  // ranged slot
  const RANGED = {
    // the Moon Guardian's sidearms: fast, light, made to be fired mid-flip, mid-roll and while falling
    crescent_pistols: { name: 'Crescent Pistols', type: 'firearm', kind: 'gun', rarity: 'common', price: 0, levelRequired: 1, dual: true,
      magazine: 8, reload: 1.1, rate: 7, startup: 3, recovery: 8, recoil: 70, sound: 'energy',
      proj: { type: 'bullet', speed: 2500, dmg: 16, hitstun: 13, kb: 110, size: 9, color: '#cfe8ff' },
      desc: 'Twin moon-silver pistols. Fire while flipping, rolling or falling (down = aim down). They reload themselves.' },
    shuriken: { name: 'Scarab Discs', type: 'throwable', kind: 'throw', rarity: 'common', price: 200, levelRequired: 1,
      charges: 3, recharge: 2.2, startup: 5, recovery: 9, air: true, sound: 'throw',
      proj: { type: 'shuriken', speed: 1500, dmg: 22, hitstun: 16, kb: 120, size: 22 },
      desc: 'Spinning bronze scarabs. Fast and light: extend combos and poke from range.' },
    throwing_knife: { name: 'Throwing Knives', type: 'throwable', kind: 'throw', rarity: 'common', price: 700, levelRequired: 3,
      charges: 2, recharge: 2.8, startup: 7, recovery: 11, air: true, sound: 'throw',
      proj: { type: 'knife', speed: 1750, dmg: 40, hitstun: 18, kb: 200, size: 18 },
      desc: 'Precise bronze knives, harder hitting than scarab discs, fewer charges.' },
    kunai: { name: 'Cursed Daggers', type: 'throwable', kind: 'throw', rarity: 'uncommon', price: 1500, levelRequired: 8,
      charges: 3, recharge: 2.4, startup: 6, recovery: 10, air: true, sound: 'throw',
      proj: { type: 'kunai', speed: 1250, vy: -380, grav: 1100, dmg: 34, hitstun: 18, kb: 220, size: 20 },
      desc: 'Arcing throw that drops over guards and hits jumping enemies.' },
    boomerang_blade: { name: 'Throwing Stick', type: 'throwable', kind: 'throw', rarity: 'rare', price: 3800, levelRequired: 12,
      charges: 1, recharge: 0.6, startup: 8, recovery: 12, air: false, sound: 'throw',
      proj: { type: 'boomerang', speed: 1300, dmg: 30, hitstun: 16, kb: 160, size: 30, returns: true, life: 1.5 },
      desc: 'The hunters’ curved throwing stick: flies out and returns, hitting twice.' },
    explosive_kunai: { name: 'Fire Scarab', type: 'throwable', kind: 'throw', rarity: 'epic', price: 7500, levelRequired: 20,
      charges: 2, recharge: 4.2, startup: 8, recovery: 12, air: true, sound: 'throw',
      proj: { type: 'kunai', speed: 1150, vy: -420, grav: 1150, dmg: 18, hitstun: 16, kb: 200, size: 20, explode: { r: 150, dmg: 55 } },
      desc: 'A scarab of burning resin that explodes on impact. Chips through guards.' },
    pistol: { name: 'Eye of Ra', type: 'firearm', kind: 'gun', rarity: 'uncommon', price: 2500, levelRequired: 5,
      magazine: 6, reload: 1.5, startup: 5, recovery: 12, recoil: 110, sound: 'energy',
      proj: { type: 'bullet', speed: 2600, dmg: 32, hitstun: 14, kb: 160, size: 10 },
      desc: 'Amulet that fires bolts of sunlight. Six charges, then it must be re-lit. Crouch to dodge.' },
    revolver: { name: 'Scepter of Set', type: 'firearm', kind: 'gun', rarity: 'rare', price: 5200, levelRequired: 10,
      magazine: 5, reload: 2.1, startup: 9, recovery: 20, recoil: 220, sound: 'energy',
      proj: { type: 'bullet', speed: 2900, dmg: 70, hitstun: 20, kb: 380, size: 12 },
      desc: 'Hurls a lightning bolt: huge damage, slow to fire and to recharge.' },
    crossbow: { name: 'Desert Bow', type: 'firearm', kind: 'gun', rarity: 'rare', price: 4600, levelRequired: 13,
      magazine: 1, reload: 1.5, startup: 15, recovery: 14, recoil: 90, sound: 'crossbow',
      proj: { type: 'bolt', speed: 1900, dmg: 86, hitstun: 22, kb: 520, size: 14 },
      desc: 'Composite bow of horn and sinew. One powerful arrow, then draw again.' },
    shotgun: { name: 'Sandburst Relic', type: 'firearm', kind: 'gun', rarity: 'epic', price: 8200, levelRequired: 15,
      magazine: 2, reload: 2.0, startup: 10, recovery: 24, recoil: 320, sound: 'explosion',
      proj: { type: 'pellet', speed: 2300, dmg: 17, hitstun: 20, kb: 420, size: 10, count: 5, spread: 0.12, life: 0.22 },
      desc: 'Blasts a cone of sand shards. Short range, massive knockback.' },
    energy_pistol: { name: 'Ankh of Radiance', type: 'firearm', kind: 'gun', rarity: 'legendary', price: 16000, levelRequired: 25,
      cooldown: 1.0, startup: 6, recovery: 12, recoil: 90, sound: 'energy',
      proj: { type: 'energy', speed: 2100, dmg: 44, hitstun: 18, kb: 260, size: 22 },
      desc: 'Divine relic: no charges, it cools down between blasts of light.' },
    // enemy / boss only
    venom_orb: { name: 'Venom Orb', type: 'throwable', kind: 'throw', rarity: 'rare', price: 0, levelRequired: 99, hidden: true,
      charges: 3, recharge: 1.7, startup: 10, recovery: 14, air: false, element: 'fire', sound: 'energy',
      proj: { type: 'energy', speed: 1250, dmg: 30, hitstun: 16, kb: 220, size: 24, color: '#8fff6a', poison: true },
      desc: 'Serpent magic: a slow green orb that poisons on hit.' },
    rocket_pod: { name: 'Sun Orbs', type: 'firearm', kind: 'gun', rarity: 'legendary', price: 0, levelRequired: 99, hidden: true,
      magazine: 3, reload: 3, startup: 14, recovery: 16, recoil: 60, sound: 'rocket',
      proj: { type: 'rocket', speed: 900, aim: true, grav: 900, dmg: 30, hitstun: 18, kb: 300, size: 24, explode: { r: 170, dmg: 50 } } },
  };

  const SPECIAL_ITEMS = {
    rush: { name: 'Tomb Rush', type: 'special', rarity: 'uncommon', price: 0, levelRequired: 1 },
    crescent: { name: 'Crescent Moonfall', type: 'special', rarity: 'rare', price: 0, levelRequired: 1 },
    storm: { name: 'Sandstorm Spiral', type: 'special', rarity: 'rare', price: 900, levelRequired: 4 },
    slash: { name: 'Crescent of Anubis', type: 'special', rarity: 'epic', price: 1800, levelRequired: 6 },
    quake: { name: 'Earthshaker', type: 'special', rarity: 'epic', price: 3000, levelRequired: 12 },
  };

  // cosmetics recolour the mummy: bandages, metal, eye glow and the dash / sand trail
  const COSMETICS = {
    cos_crimson: { name: 'Sand Wraps', type: 'cosmetic', rarity: 'common', price: 0, levelRequired: 1, wrap: '#c9b58a', accent: '#e0b24a', trail: '#d8c08a', eye: '#4ff0dc' },
    cos_gold: { name: 'Gilded Burial', type: 'cosmetic', rarity: 'uncommon', price: 400, levelRequired: 3, wrap: '#dccb96', metal: '#f2c458', accent: '#ffcf5a', trail: '#ffe0a0', eye: '#ffe38a' },
    cos_azure: { name: 'Lapis Curse', type: 'cosmetic', rarity: 'uncommon', price: 700, levelRequired: 6, wrap: '#b6ae98', accent: '#4a7cff', trail: '#8fc0ff', eye: '#5aa8ff' },
    cos_jade: { name: 'Jade Spirit', type: 'cosmetic', rarity: 'rare', price: 1100, levelRequired: 9, wrap: '#a8b28e', accent: '#2fd58a', trail: '#8fffc4', eye: '#6fffb0' },
    cos_violet: { name: 'Amethyst Hex', type: 'cosmetic', rarity: 'rare', price: 1600, levelRequired: 14, wrap: '#b2a6b4', accent: '#a86bff', trail: '#d2b2ff', eye: '#c07bff' },
    cos_ember: { name: 'Ember Soul', type: 'cosmetic', rarity: 'epic', price: 2600, levelRequired: 20, wrap: '#8e6c4a', skin: '#1c0c06', accent: '#ff6a1a', trail: '#ffb070', eye: '#ff8a3a' },
    cos_void: { name: 'Obsidian Wraps', type: 'cosmetic', rarity: 'legendary', price: 6000, levelRequired: 30, wrap: '#2c2832', metal: '#9a8ab8', accent: '#7a5cff', trail: '#b7a2ff', eye: '#ffffff' },
  };


  // ---------- move generation ----------
  function scaleFrames(n, sp) { return Math.max(1, Math.round(n / sp)); }

  function generateStyleMoves(wid, w) {
    const style = STYLES[w.style];
    const sp = w.speed || 1;
    const dm = (w.damage || 1) * (B.weapons.rarityDamage[w.rarity] || 1);
    const out = {};
    for (const key of Object.keys(style.moves)) {
      const t = style.moves[key];
      const st = scaleFrames(t.st, sp), ac = Math.max(2, scaleFrames(t.ac, sp)), rc = scaleFrames(t.rc, sp);
      const id = wid + ':' + key;
      const m = {
        id, name: w.name + ' ' + key, weapon: wid,
        startup: st, active: ac, recovery: rc, total: st + ac + rc,
        damage: Math.round(t.dmg * dm), hitstun: t.hitstun, blockstun: t.blockstun, kb: t.kb, kbY: t.kbY,
        knockdown: t.knockdown, level: t.level, crouching: t.crouching, air: t.air, spin: t.spin ? [0, scaleFrames(t.spin[1], sp)] : null,
        lunge: t.lunge ? [scaleFrames(t.lunge[0], sp), t.lunge[1]] : null, friction: t.friction,
        hit: Object.assign({ joint: t.hit.seg === 'B' ? 'tipB' : 'tip' }, t.hit),
        hitstop: t.hitstop || 3, shake: t.shake || 0.12, zoom: t.zoom, power: t.power,
        sound: w.element === 'shock' ? 'hit_shock' : (w.style === 'heavy' ? 'hit_heavy' : 'hit_blade'),
        whoosh: w.style === 'heavy' ? 'heavy' : 'blade',
        element: w.element || null, stunProc: t.stunProc, armor: t.armor ? [scaleFrames(t.armor[0], sp), scaleFrames(t.armor[1], sp)] : null,
        effect: t.effect || null,
        keys: buildKeys(t.tpl, st, ac, rc, t.tpl === 'overhead' || t.tpl === 'slam' ? 'in' : 'out'),
        blend: 2,
      };
      if (t.chain) {
        m.chain = {};
        for (const k in t.chain) m.chain[k] = t.chain[k] === 'kick' ? 'kick' : wid + ':' + t.chain[k];
      }
      // rough reach for the AI: arm + weapon + lunge travel
      m.reach = 150 + (w.len || 0) * 0.95 + (t.lunge ? t.lunge[1] * 0.06 : 0) + (t.hit.pad || 0);
      out[key] = m;
      SA.MOVES[id] = m;
    }
    const map = Object.assign({}, FIST_MAP);
    for (const k in STYLE_MAP) if (out[STYLE_MAP[k]]) map[k] = out[STYLE_MAP[k]].id;
    // named combos for the HUD
    for (const c of style.combos || []) {
      const seq = c.slice(0, -1).map((k) => wid + ':' + k);
      SA.COMBO_NAMES.push({ seq, name: c[c.length - 1] });
    }
    return map;
  }

  function generateRangedMove(rid, r) {
    const gun = r.kind === 'gun';
    const st = r.startup, ac = 2, rc = r.recovery;
    const m = {
      id: rid + ':fire', name: r.name, ranged: rid, startup: st, active: ac, recovery: rc, total: st + ac + rc,
      keys: buildKeys(gun ? 'aim' : 'throw', st, ac, rc), blend: 2, whoosh: gun ? null : 'light',
      damage: 0, level: 'mid', hit: null, reach: gun ? 900 : 800,
    };
    SA.MOVES[m.id] = m;
    const air = {
      id: rid + ':air', name: r.name, ranged: rid, air: true, startup: st, active: ac, recovery: rc, total: st + ac + rc,
      keys: buildKeys('airThrow', st, ac, rc), blend: 2, whoosh: 'light', damage: 0, level: 'mid', hit: null, reach: 700,
    };
    SA.MOVES[air.id] = air;
    const reload = {
      id: rid + ':reload', name: 'Reload', startup: 999, active: 0, recovery: 0,
      total: Math.round((r.reload || 1) * 60), damage: 0, hit: null, reload: true,
      keys: [[0, S], [6, P({ torso: 0.3, head: 0.4, aF1: 0.6, aF2: 1.4, aB1: 0.9, aB2: 1.6 })], [Math.round((r.reload || 1) * 60) - 6, P({ torso: 0.3, head: 0.4, aF1: 0.7, aF2: 1.5, aB1: 1.0, aB2: 1.5 })], [Math.round((r.reload || 1) * 60), S]],
      blend: 3,
    };
    SA.MOVES[reload.id] = reload;
  }

  // Display stats for the shop (1..10 bars) derived from the generated moves, not hand-typed.
  function statsFor(id) {
    const w = WEAPONS[id];
    if (w) {
      const ms = SA.WEAPON_SETS[id];
      const light = SA.MOVES[ms.light], heavy = SA.MOVES[ms.heavy];
      const dmg = (light.damage + heavy.damage) / 2;
      return {
        damage: Math.max(1, Math.min(10, Math.round(dmg / 11))),
        speed: Math.max(1, Math.min(10, Math.round(46 / (light.startup + light.recovery * 0.5)))),
        range: Math.max(1, Math.min(10, Math.round((light.reach - 120) / 22))),
      };
    }
    const r = RANGED[id];
    if (r) {
      const p = r.proj;
      const dmg = p.dmg * (p.count || 1) + (p.explode ? p.explode.dmg : 0);
      return {
        damage: Math.max(1, Math.min(10, Math.round(dmg / 9))),
        speed: Math.max(1, Math.min(10, Math.round(p.speed / 290))),
        range: p.life ? 3 : p.grav ? 7 : 10,
      };
    }
    return null;
  }

  const SPECIAL_EFFECT = {
    fire: 'Burn: orange sparks and a short damage-over-time on hit.',
    frost: 'Chill: hits can slow the enemy for a moment.',
    shock: 'Stun: hits can briefly extend hit stun.',
    shadow: 'Shadow trail on dashes and attacks.',
  };

  // ranged state per fighter (charges / magazine / cooldown)
  class RangedState {
    constructor(def) {
      this.def = def;
      this.charges = def.charges || 0;
      this.ammo = def.magazine || 0;
      this.recharge = 0;
      this.cool = 0;
      this.reloadT = 0;      // automatic reload (empty magazine, or a short pause in the shooting)
      this.reloadMax = 1;
      this.idleT = 0;
      this.reloaded = false;
    }
    startReload(frac) {
      const d = this.def;
      if (!d.magazine || this.reloadT > 0 || this.ammo >= d.magazine) return;
      this.reloadT = this.reloadMax = (d.reload || 1) * (frac || 1);
    }
    reloading() { return this.reloadT > 0; }
    ready() {
      const d = this.def;
      if (d.kind === 'throw') return this.charges > 0;
      if (d.cooldown) return this.cool <= 0;
      return this.ammo > 0;
    }
    use() {
      const d = this.def;
      if (d.kind === 'throw') { this.charges--; }
      else if (d.cooldown) this.cool = d.cooldown;
      else { this.ammo--; this.idleT = 0; this.reloadT = 0; }
    }
    tick(dt) {
      const d = this.def;
      if (d.kind === 'throw' && this.charges < d.charges && !this.out) {
        this.recharge += dt;
        if (this.recharge >= d.recharge) { this.recharge = 0; this.charges++; }
      }
      if (this.cool > 0) this.cool -= dt;
      if (d.magazine) {
        this.idleT += dt;
        if (this.ammo <= 0) this.startReload();
        else if (this.ammo < d.magazine && this.idleT > 1.6) this.startReload(0.7);
        if (this.reloadT > 0) {
          this.reloadT -= dt;
          if (this.reloadT <= 0) { this.reloadT = 0; this.ammo = d.magazine; this.reloaded = true; }
        }
      }
    }
    cooldownFrac() {
      const d = this.def;
      if (d.kind === 'throw') return this.charges > 0 ? 0 : 1 - this.recharge / d.recharge;
      if (d.cooldown) return Math.max(0, this.cool / d.cooldown);
      if (this.reloadT > 0) return this.reloadT / this.reloadMax;
      return this.ammo > 0 ? 0 : 1;
    }
    label() {
      const d = this.def;
      if (d.kind === 'throw') return `${this.charges}/${d.charges}`;
      if (d.cooldown) return this.cool > 0 ? 'HEAT' : 'READY';
      if (this.reloadT > 0) return 'RELOAD';
      return `${this.ammo}/${d.magazine}`;
    }
  }

  // Fist variants (Cursed Fists): the fist moveset cloned with an element and a damage factor.
  function cloneFists(wid, w) {
    const map = {}, done = {};
    const clone = (mid) => {
      if (!mid) return mid;
      const nid = wid + ':' + mid;
      if (done[mid]) return nid;
      done[mid] = true;
      const m = SA.MOVES[mid];
      const c = Object.assign({}, m, { id: nid, weapon: wid, element: w.element, damage: Math.round(m.damage * (w.damage || 1)) });
      if (m.chain) { c.chain = {}; for (const k in m.chain) c.chain[k] = clone(m.chain[k]); }
      SA.MOVES[nid] = c;
      return nid;
    };
    for (const k in FIST_MAP) map[k] = clone(FIST_MAP[k]);
    // named fist combos keep their names
    for (const cn of SA.COMBO_NAMES.slice()) {
      if (cn.seq.every((x) => done[x])) SA.COMBO_NAMES.push({ seq: cn.seq.map((x) => wid + ':' + x), name: cn.name });
    }
    return map;
  }

  // ---------- registry ----------
  SA.WEAPONS = WEAPONS;
  SA.RANGED = RANGED;
  SA.SPECIAL_ITEMS = SPECIAL_ITEMS;
  SA.COSMETICS = COSMETICS;
  SA.WEAPON_STYLES = STYLES;
  SA.WEAPON_SETS = {};
  for (const id of Object.keys(WEAPONS)) {
    const w = WEAPONS[id];
    w.id = id;
    SA.WEAPON_SETS[id] = w.style === 'fists' ? (w.element || w.damage !== 1 ? cloneFists(id, w) : Object.assign({}, FIST_MAP)) : generateStyleMoves(id, w);
    if (w.style !== 'fists') {
      w.touch = STYLES[w.style].labels;
      w.geom = { len: w.len, back: w.back || 0, dual: !!w.dual };
      w.blockBonus = STYLES[w.style].blockBonus || 0;
    } else {
      w.touch = { light: 'PUNCH', heavy: 'HEAVY' };
      w.geom = null;
    }
  }
  for (const id of Object.keys(RANGED)) { RANGED[id].id = id; generateRangedMove(id, RANGED[id]); }
  for (const id of Object.keys(SPECIAL_ITEMS)) SPECIAL_ITEMS[id].id = id;
  for (const id of Object.keys(COSMETICS)) COSMETICS[id].id = id;

  // ---------- measured reach & weapon ranges ----------
  // Solves each move's pose at the middle of its active window and measures how far in front of the
  // fighter's centre the hitbox reaches (plus lunge travel and the target's half torso). The AI and the
  // shop both use these real numbers instead of guesses.
  const TARGET_HALF = 26;
  function measureReach(m, wgeom) {
    if (!m || !m.hit || !m.keys) return m && m.reach;
    const A = SA.Anim;
    const t = m.startup + m.active * 0.5;
    const pose = A.P();
    A.sampleKeys(m.keys, t, pose);
    const S = A.createSkeleton();
    A.solveLocal(pose, S, 1, wgeom);
    const h = m.hit;
    let far;
    if (h.seg) {
      const a = S[h.seg === 'B' ? 'handB' : 'handF'], tp = S[h.seg === 'B' ? 'tipB' : 'tip'];
      far = Math.max(a.x, a.x + (tp.x - a.x) * 1.08) + (h.pad || 18);
    } else {
      far = S[h.joint].x + h.ox + h.w / 2;
    }
    let lunge = 0;
    if (m.lunge) {
      const k = m.friction || 9, dt = Math.max(0, t - m.lunge[0]) / 60;
      lunge = m.lunge[1] * (1 - Math.exp(-k * dt)) / k;
    }
    return Math.round(far + lunge + TARGET_HALF);
  }
  function computeRanges() {
    const contact = SA.Physics ? SA.Physics.BODY_W : 88;
    for (const id of Object.keys(WEAPONS)) {
      const w = WEAPONS[id], set = SA.WEAPON_SETS[id];
      const seen = {};
      for (const key in set) {
        const m = SA.MOVES[set[key]];
        if (m && !seen[m.id]) { seen[m.id] = 1; const r = measureReach(m, w.geom); if (r) m.reach = r; }
      }
      const light = SA.MOVES[set.light], heavy = SA.MOVES[set.heavy];
      const max = Math.max(light.reach, heavy.reach);
      // long weapons lose leverage up close (they still hit with the shaft / arm, just not ideally)
      const long = (w.len || 0) >= 150;
      w.ranges = {
        min: Math.round(long ? Math.max(contact + 20, light.reach * 0.45) : contact),
        opt: Math.round(Math.max(contact + 30, light.reach * 0.82)),
        max: Math.round(max),
      };
    }
  }
  computeRanges();

  // human-readable input sequences of a weapon's named combos, e.g. [['J  J  K', 'FLURRY']]
  const KEY_OF = { light: 'J', heavy: 'K', kick: 'L', lightDown: 'S+J', heavyDown: 'S+K', heavyUp: 'W+K', dashLight: 'I→ J', airLight: 'air J' };
  function comboInputs(wid) {
    const w = WEAPONS[wid];
    if (!w || w.style === 'fists') return null;
    const style = STYLES[w.style];
    const out = [];
    for (const c of style.combos || []) {
      const seq = c.slice(0, -1);
      const first = Object.keys(STYLE_MAP).find((k) => STYLE_MAP[k] === seq[0]);
      const keys = [KEY_OF[first] || '?'];
      for (let i = 1; i < seq.length; i++) {
        const ch = (style.moves[seq[i - 1]] || {}).chain || {};
        const inp = Object.keys(ch).find((k) => ch[k] === seq[i]);
        keys.push(inp ? KEY_OF[inp] : '?');
      }
      out.push([keys.join('  '), c[c.length - 1]]);
    }
    return out;
  }

  SA.Items = {
    comboInputs,
    get(id) { return WEAPONS[id] || RANGED[id] || SPECIAL_ITEMS[id] || COSMETICS[id] || null; },
    category(id) {
      if (WEAPONS[id]) return 'weapons';
      if (RANGED[id]) return RANGED[id].type === 'firearm' ? 'firearms' : 'throwables';
      if (SPECIAL_ITEMS[id]) return 'specials';
      if (COSMETICS[id]) return 'cosmetics';
      return null;
    },
    statsFor,
    effectText(id) {
      const w = WEAPONS[id];
      if (w) {
        const parts = [];
        if (w.element) parts.push(SPECIAL_EFFECT[w.element]);
        if (w.special) parts.push('Signature special: ' + SA.SPECIALS[w.special].name + ' (unlocked with the weapon).');
        if (w.style === 'heavy') parts.push('Heavy attacks have armor during their wind-up.');
        if (w.style === 'scythe') parts.push('HOOK pulls the enemy in.');
        if (w.style === 'staff') parts.push('Defensive: reduced block stun and chip.');
        return parts.join(' ') || 'No special effect.';
      }
      const r = RANGED[id];
      if (r) {
        if (r.kind === 'throw') return `${r.charges} charges, one returns every ${r.recharge}s.` + (r.proj.explode ? ' Explodes on impact.' : '') + (r.proj.returns ? ' Returns to you.' : '');
        if (r.cooldown) return `Cools down ${r.cooldown}s between shots. No reload.`;
        return `Magazine ${r.magazine}, reloads itself in ${r.reload}s. Fire on the move: flips, rolls, falls.` + (r.proj.count ? ` Fires ${r.proj.count} pellets.` : '') + (r.dual ? ' Two pistols, alternating.' : '');
      }
      return '';
    },
  };

  SA.RangedState = RangedState;
  SA.FIST_MAP = FIST_MAP;
})(window.SA);
