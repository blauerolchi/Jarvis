'use strict';
/*
 * Combat: move data (frame data + animation keys) and hit resolution.
 * All frame counts are 60 fps frames. Hitboxes are attached to the striking joint of the
 * animated skeleton, so what you see is what hits. Hurtboxes (head/torso/legs) are built
 * from the skeleton every frame, which makes crouching under high attacks actually work.
 *
 * Levels: high  -> blocked standing or crouching, whiffs over crouchers (by geometry)
 *         mid   -> blocked standing or crouching
 *         low   -> must be blocked crouching (S + U)
 *         overhead (jump attacks) -> must be blocked standing
 */
(function (SA) {
  const P = (o, base) => SA.Anim.P(o, base);
  const S = SA.POSES.stance;
  const C = SA.POSES.crouch;
  const J = SA.POSES.jump;

  const MOVES = SA.MOVES = {
    jab: {
      name: 'Jab', startup: 5, active: 3, recovery: 10,
      damage: 40, hitstun: 15, blockstun: 9, kb: 280, level: 'high',
      hit: { joint: 'handF', w: 64, h: 38, ox: 10, oy: 0 },
      lunge: [1, 260], hitstop: 3, shake: 0.1, sound: 'hit_light', whoosh: 'light', power: 0.35,
      chain: { light: 'jab2', kick: 'kick', heavy: 'heavy' },
      keys: [
        [0, S],
        [2, P({ hipX: -3, torso: 0.08, aF1: 0.45, aF2: 2.2 })],
        [5, P({ hipX: 12, torso: 0.3, head: 0.05, aF1: 1.74, aF2: 0.0, aB1: 0.3, aB2: 2.3, lF1: 0.72, lF2: -0.95, lB1: -0.52, lB2: -0.03 }), 'out'],
        [8, P({ hipX: 12, torso: 0.3, head: 0.05, aF1: 1.7, aF2: 0.06, aB1: 0.3, aB2: 2.3, lF1: 0.72, lF2: -0.95, lB1: -0.52, lB2: -0.03 })],
        [18, S],
      ],
    },
    jab2: {
      name: 'Cross', startup: 6, active: 3, recovery: 12,
      damage: 45, hitstun: 17, blockstun: 10, kb: 320, level: 'high',
      hit: { joint: 'handB', w: 64, h: 38, ox: 10, oy: 0 },
      lunge: [1, 300], hitstop: 3, shake: 0.12, sound: 'hit_light', whoosh: 'light', power: 0.4,
      chain: { heavy: 'finisher', kick: 'kick' },
      keys: [
        [0, S],
        [2, P({ torso: 0.05, aB1: 0.1, aB2: 2.3, aF1: 0.7, aF2: 2.0 })],
        [6, P({ hipX: 18, torso: 0.44, head: 0.1, aB1: 1.7, aB2: 0.0, aF1: 0.45, aF2: 2.3, lF1: 0.78, lF2: -1.05, lB1: -0.62, lB2: -0.02 }), 'out'],
        [9, P({ hipX: 18, torso: 0.44, head: 0.1, aB1: 1.66, aB2: 0.05, aF1: 0.45, aF2: 2.3, lF1: 0.78, lF2: -1.05, lB1: -0.62, lB2: -0.02 })],
        [21, S],
      ],
    },
    heavy: {
      name: 'Heavy Punch', startup: 14, active: 4, recovery: 22,
      damage: 95, hitstun: 24, blockstun: 14, kb: 720, level: 'high',
      hit: { joint: 'handB', w: 76, h: 50, ox: 12, oy: 0 },
      lunge: [10, 560], hitstop: 5, shake: 0.35, zoom: 0.04, sound: 'hit_heavy', whoosh: 'heavy', power: 0.8,
      keys: [
        [0, S],
        [10, P({ hipX: -12, torso: -0.2, head: 0.1, aB1: -0.7, aB2: 2.0, aF1: 1.0, aF2: 1.5, lF1: 0.5, lF2: -0.7, lB1: -0.5, lB2: -0.3 }), 'smooth'],
        [14, P({ hipX: 30, torso: 0.62, head: 0.15, aB1: 1.56, aB2: 0.0, aF1: 0.2, aF2: 1.8, lF1: 0.85, lF2: -1.1, lB1: -0.78, lB2: 0.0 }), 'in'],
        [18, P({ hipX: 34, torso: 0.64, head: 0.15, aB1: 1.54, aB2: 0.04, aF1: 0.2, aF2: 1.8, lF1: 0.85, lF2: -1.1, lB1: -0.78, lB2: 0.0 })],
        [26, P({ hipX: 24, torso: 0.42, aB1: 1.2, aB2: 0.8, aF1: 0.35, aF2: 1.9, lF1: 0.75, lF2: -1.0, lB1: -0.6 })],
        [40, S],
      ],
    },
    finisher: {
      name: 'Twin Palm', startup: 10, active: 4, recovery: 22,
      damage: 110, hitstun: 26, blockstun: 14, kb: 900, kbY: -520, knockdown: true, level: 'high',
      hit: { joint: 'handF', w: 86, h: 74, ox: 10, oy: 6 },
      lunge: [6, 620], hitstop: 6, shake: 0.5, zoom: 0.07, sound: 'hit_heavy', whoosh: 'heavy', power: 1,
      keys: [
        [0, S],
        [7, P({ hipX: -8, torso: -0.12, aF1: 0.2, aF2: 2.4, aB1: 0.0, aB2: 2.5, lF1: 0.5, lF2: -0.8 })],
        [10, P({ hipX: 34, torso: 0.5, head: 0.1, aF1: 1.5, aF2: 0.12, aB1: 1.4, aB2: 0.22, lF1: 0.9, lF2: -1.15, lB1: -0.82, lB2: 0 }), 'in'],
        [14, P({ hipX: 38, torso: 0.52, head: 0.1, aF1: 1.48, aF2: 0.14, aB1: 1.38, aB2: 0.24, lF1: 0.9, lF2: -1.15, lB1: -0.82, lB2: 0 })],
        [36, S],
      ],
    },
    kick: {
      name: 'Kick', startup: 9, active: 4, recovery: 17,
      damage: 70, hitstun: 20, blockstun: 11, kb: 460, level: 'mid',
      hit: { joint: 'footF', w: 84, h: 52, ox: 16, oy: 0 },
      lunge: [3, 320], hitstop: 4, shake: 0.2, sound: 'hit_kick', whoosh: 'medium', power: 0.6,
      chain: { kick: 'spinKick' },
      keys: [
        [0, S],
        [5, P({ torso: -0.05, lF1: 1.2, lF2: -2.1, lB1: -0.3, lB2: -0.1, aF1: 0.7, aF2: 1.8, aB1: 0.0, aB2: 2.2 })],
        [9, P({ hipX: 6, torso: -0.35, head: 0.25, lF1: 1.62, lF2: -0.02, lB1: -0.12, lB2: -0.05, aF1: 0.9, aF2: 1.5, aB1: -0.4, aB2: 1.4 }), 'out'],
        [13, P({ hipX: 6, torso: -0.36, head: 0.25, lF1: 1.6, lF2: -0.05, lB1: -0.12, lB2: -0.05, aF1: 0.9, aF2: 1.5, aB1: -0.4, aB2: 1.4 })],
        [19, P({ torso: -0.1, lF1: 1.1, lF2: -1.9, lB1: -0.25, lB2: -0.1 })],
        [30, S],
      ],
    },
    spinKick: {
      name: 'Spin Kick', startup: 13, active: 5, recovery: 22,
      damage: 105, hitstun: 26, blockstun: 14, kb: 820, kbY: -560, knockdown: true, level: 'high',
      hit: { joint: 'footB', w: 92, h: 70, ox: 14, oy: 0 },
      lunge: [4, 380], hitstop: 6, shake: 0.5, zoom: 0.06, sound: 'hit_heavy', whoosh: 'heavy', power: 1,
      spin: [0, 12],
      keys: [
        [0, S],
        [6, P({ hipX: 4, torso: 0.25, lB1: -0.7, lB2: -0.5, lF1: 0.4, lF2: -0.6, aF1: 0.4, aF2: 2.0, aB1: 0.8, aB2: 1.6 })],
        [13, P({ hipX: 10, torso: -0.6, head: 0.35, lB1: 2.05, lB2: -0.05, lF1: 0.08, lF2: -0.1, aF1: -0.6, aF2: 0.9, aB1: 1.3, aB2: 0.6 }), 'out'],
        [18, P({ hipX: 10, torso: -0.62, head: 0.35, lB1: 2.0, lB2: -0.1, lF1: 0.08, lF2: -0.1, aF1: -0.6, aF2: 0.9, aB1: 1.3, aB2: 0.6 })],
        [28, P({ torso: -0.1, lB1: 0.9, lB2: -1.4, lF1: 0.3, lF2: -0.4 })],
        [40, S],
      ],
    },
    lowKick: {
      name: 'Low Kick', startup: 8, active: 4, recovery: 16, crouching: true,
      damage: 50, hitstun: 20, blockstun: 10, kb: 220, level: 'low',
      hit: { joint: 'footF', w: 86, h: 44, ox: 14, oy: 0 },
      lunge: [2, 240], hitstop: 3, shake: 0.14, sound: 'hit_kick', whoosh: 'medium', power: 0.45,
      chain: { light: 'uppercut', heavy: 'uppercut' },
      keys: [
        [0, C],
        [4, P({ lF1: 0.9, lF2: -2.2, torso: 0.45 }, C)],
        [8, P({ torso: 0.3, head: 0.15, hipX: 10, lF1: 1.52, lF2: -0.04, lB1: 0.55, lB2: -2.3, aF1: 0.9, aF2: 1.8, aB1: 0.4, aB2: 2.2 }), 'out'],
        [12, P({ torso: 0.3, head: 0.15, hipX: 10, lF1: 1.5, lF2: -0.06, lB1: 0.55, lB2: -2.3, aF1: 0.9, aF2: 1.8, aB1: 0.4, aB2: 2.2 })],
        [28, C],
      ],
    },
    crouchJab: {
      name: 'Crouch Punch', startup: 5, active: 3, recovery: 9, crouching: true,
      damage: 32, hitstun: 14, blockstun: 8, kb: 220, level: 'mid',
      hit: { joint: 'handF', w: 60, h: 40, ox: 10, oy: 0 },
      lunge: [1, 180], hitstop: 3, shake: 0.08, sound: 'hit_light', whoosh: 'light', power: 0.3,
      chain: { heavy: 'uppercut', kick: 'lowKick' },
      keys: [
        [0, C],
        [2, P({ torso: 0.5, aF1: 0.6, aF2: 2.1 }, C)],
        [5, P({ hipX: 10, torso: 0.45, aF1: 1.55, aF2: 0.06, aB1: 0.5, aB2: 2.2 }, C), 'out'],
        [8, P({ hipX: 10, torso: 0.45, aF1: 1.52, aF2: 0.1, aB1: 0.5, aB2: 2.2 }, C)],
        [17, C],
      ],
    },
    uppercut: {
      name: 'Uppercut', startup: 7, active: 6, recovery: 20,
      damage: 85, hitstun: 24, blockstun: 12, kb: 260, kbY: -1150, knockdown: true, level: 'mid',
      hit: { joint: 'handF', w: 76, h: 96, ox: 4, oy: 18 },
      lunge: [3, 300], hitstop: 5, shake: 0.4, zoom: 0.05, sound: 'hit_heavy', whoosh: 'heavy', power: 0.9,
      keys: [
        [0, C],
        [4, P({ torso: 0.45, lF1: 0.9, lF2: -1.7, lB1: -0.1, lB2: -1.2, aF1: 0.3, aF2: 1.4, aB1: 0.4, aB2: 2.2 })],
        [7, P({ hipX: 14, torso: 0.3, aF1: 1.8, aF2: 0.9, lF1: 0.6, lF2: -0.7, lB1: -0.35, lB2: -0.2 }), 'in'],
        [10, P({ hipX: 18, torso: -0.05, head: -0.2, aF1: 2.7, aF2: 0.35, aB1: 0.3, aB2: 2.2, lF1: 0.35, lF2: -0.1, lB1: -0.35, lB2: -0.05 }), 'out'],
        [13, P({ hipX: 18, torso: -0.08, head: -0.2, aF1: 2.75, aF2: 0.3, aB1: 0.3, aB2: 2.2, lF1: 0.35, lF2: -0.1, lB1: -0.35, lB2: -0.05 })],
        [33, S],
      ],
    },
    airPunch: {
      name: 'Air Punch', startup: 5, active: 8, recovery: 10, air: true,
      damage: 55, hitstun: 18, blockstun: 10, kb: 320, level: 'overhead',
      hit: { joint: 'handF', w: 76, h: 84, ox: 8, oy: 16 },
      hitstop: 4, shake: 0.15, sound: 'hit_light', whoosh: 'light', power: 0.5,
      keys: [
        [0, J],
        [3, P({ aF1: 1.9, aF2: 1.6, torso: 0.1 }, J)],
        [5, P({ torso: 0.45, aF1: 1.05, aF2: 0.05, aB1: -0.6 }, J), 'out'],
        [13, P({ torso: 0.45, aF1: 1.08, aF2: 0.08, aB1: -0.6 }, J)],
        [23, SA.POSES.fall],
      ],
    },
    flyingKick: {
      name: 'Flying Kick', startup: 6, active: 12, recovery: 8, air: true,
      damage: 80, hitstun: 22, blockstun: 12, kb: 560, level: 'overhead',
      hit: { joint: 'footF', w: 84, h: 64, ox: 12, oy: 0 },
      hitstop: 5, shake: 0.3, zoom: 0.03, sound: 'hit_kick', whoosh: 'medium', power: 0.75,
      keys: [
        [0, J],
        [4, P({ lF1: 1.3, lF2: -2.0, torso: 0 }, J)],
        [6, P({ torso: -0.35, head: 0.2, lF1: 1.05, lF2: -0.02, lB1: 0.1, lB2: -1.9, aF1: 1.6, aF2: 0.7, aB1: -0.7, aB2: 1.0 }), 'out'],
        [18, P({ torso: -0.38, head: 0.2, lF1: 1.02, lF2: -0.04, lB1: 0.1, lB2: -1.9, aF1: 1.6, aF2: 0.7, aB1: -0.7, aB2: 1.0 })],
        [26, SA.POSES.fall],
      ],
    },
    dashPunch: {
      name: 'Dash Punch', startup: 6, active: 5, recovery: 18,
      damage: 80, hitstun: 22, blockstun: 12, kb: 680, level: 'high', friction: 5,
      hit: { joint: 'handB', w: 84, h: 52, ox: 12, oy: 0 },
      lunge: [0, 980], hitstop: 5, shake: 0.3, zoom: 0.04, sound: 'hit_heavy', whoosh: 'heavy', power: 0.8,
      keys: [
        [0, SA.POSES.dash],
        [3, P({ torso: 0.45, aB1: -0.3, aB2: 1.8, aF1: 1.0, aF2: 1.4, lF1: 1.0, lF2: -1.2, lB1: -0.7, lB2: -0.3 })],
        [6, P({ hipX: 36, torso: 0.7, head: 0.1, aB1: 1.58, aB2: 0.0, aF1: 0.2, aF2: 1.8, lF1: 0.95, lF2: -1.2, lB1: -0.85, lB2: 0.0 }), 'out'],
        [11, P({ hipX: 38, torso: 0.7, head: 0.1, aB1: 1.56, aB2: 0.04, aF1: 0.2, aF2: 1.8, lF1: 0.95, lF2: -1.2, lB1: -0.85, lB2: 0.0 })],
        [29, S],
      ],
    },
    slideKick: {
      name: 'Slide Kick', startup: 6, active: 12, recovery: 16, crouching: true,
      damage: 70, hitstun: 22, blockstun: 10, kb: 420, kbY: -380, knockdown: true, level: 'low', friction: 3.2,
      hit: { joint: 'footF', w: 96, h: 46, ox: 16, oy: 0 },
      lunge: [0, 1080], hitstop: 4, shake: 0.3, sound: 'hit_kick', whoosh: 'medium', power: 0.7,
      keys: [
        [0, SA.POSES.dash],
        [3, P({ torso: -0.4, lF1: 1.2, lF2: -1.5, lB1: 0.6, lB2: -2.2 })],
        [6, P({ torso: -0.95, head: 0.5, lF1: 1.5, lF2: -0.02, lB1: 0.75, lB2: -2.3, aF1: -0.6, aF2: 0.5, aB1: -0.9, aB2: 0.3 }), 'out'],
        [18, P({ torso: -0.9, head: 0.5, lF1: 1.48, lF2: -0.05, lB1: 0.75, lB2: -2.3, aF1: -0.6, aF2: 0.5, aB1: -0.9, aB2: 0.3 })],
        [26, C],
        [34, S],
      ],
    },
  };

  for (const id of Object.keys(MOVES)) {
    const m = MOVES[id];
    m.id = id;
    m.total = m.startup + m.active + m.recovery;
  }

  // Named combos are shown in the HUD when the whole chain connects.
  SA.COMBO_NAMES = [
    { seq: ['jab', 'jab2', 'finisher'], name: 'TWIN DRAGON PALM' },
    { seq: ['jab', 'kick', 'spinKick'], name: 'CRESCENT CHAIN' },
    { seq: ['kick', 'spinKick'], name: 'WHIRLWIND' },
    { seq: ['lowKick', 'uppercut'], name: 'RISING DRAGON' },
    { seq: ['crouchJab', 'lowKick', 'uppercut'], name: 'ROOT BREAKER' },
    { seq: ['uppercut', 'flyingKick'], name: 'SKY HUNTER' },
    { seq: ['uppercut', 'airPunch'], name: 'SKY HUNTER' },
  ];

  const { clamp } = SA.M;

  function hurtRegion(rect, b) {
    let best = null, bestA = 0, point = null;
    for (const r of ['head', 'torso', 'legs']) {
      const i = SA.M.intersect(rect, b.hurt[r]);
      if (!i) continue;
      let a = i.w * i.h;
      if (r === 'head') a *= 1.4; // small target, reward precise hits
      if (a > bestA) { bestA = a; best = r; point = i; }
    }
    return best ? { region: best, x: point.x + point.w / 2, y: point.y + point.h / 2 } : null;
  }

  function facingTowards(b, a) {
    const dx = a.x - b.x;
    return Math.abs(dx) < 8 || Math.sign(dx) === b.facing;
  }

  function canBlock(b, a, level) {
    if (b.state !== 'block' && b.state !== 'blockstun') return false;
    if (!facingTowards(b, a)) return false;
    if (level === 'low' && !b.crouchBlock) return false;
    if (level === 'overhead' && b.crouchBlock) return false;
    return true;
  }

  function comboScale(hits) {
    return Math.max(0.55, 1 - 0.08 * hits);
  }

  SA.Combat = {
    hurtRegion,

    // Checks a's active hit against b and resolves it.
    check(a, b, game, atk) {
      atk = atk || a.activeHit();
      if (!atk || a.hitList.has(b) || !b.canBeHit(a)) return;
      const hit = hurtRegion(atk.rect, b);
      if (!hit) return;
      a.hitList.add(b);
      const m = atk.data;

      if (canBlock(b, a, m.level) && !m.unblockable) {
        if (b.parryAge <= SA.PARRY_WINDOW && !m.unparryable) this.parry(a, b, hit, game);
        else this.block(a, b, m, hit, game);
        if (atk.onContact) atk.onContact(b, 'block', game);
        return;
      }
      if (b.state === 'block' && m.level === 'low') game.label('LOW', hit.x, hit.y - 60, '#7fd4ff', b);
      if (b.state === 'block' && m.level === 'overhead') game.label('OVERHEAD', hit.x, hit.y - 60, '#7fd4ff', b);

      this.applyHit(a, b, m, hit, game);
      if (atk.onContact) atk.onContact(b, 'hit', game);
    },

    block(a, b, m, hit, game) {
      const dir = SA.M.sign(b.x - a.x || a.facing);
      const bonus = (b.weapon && b.weapon.blockBonus) || 0;
      const chip = Math.round(m.damage * 0.1 * (1 - bonus));
      b.hp = Math.max(1, b.hp - chip);
      b.setState('blockstun');
      b.stun = Math.max(4, Math.round((m.blockstun || 10) * (1 - bonus * 0.6)));
      b.vx = dir * m.kb * 0.75;
      if (Math.abs(b.x) >= SA.WALL - 4) a.vx = -dir * m.kb * 0.6;
      a.moveContact = 'block';
      a.addEnergy(2);
      b.addEnergy(5);
      game.hitStop(Math.max(2, (m.hitstop || 3) - 1));
      b.hitShake = b.hitShakeMax = Math.max(2, (m.hitstop || 3) - 1);
      game.shake(m.shake * 0.4);
      SA.FX.block(game.particles, hit.x, hit.y, dir, m.power || 0.5);
      const metal = (a.weapon && a.weapon.geom) || (b.weapon && b.weapon.geom);
      SA.audio.play(metal ? 'block_metal' : 'block', m.power || 0.5);
      if (b.isPlayer) SA.Device.vibrate(10);
      game.onBlock(a, b, m);
    },

    parry(a, b, hit, game) {
      const dir = SA.M.sign(a.x - b.x || b.facing);
      a.cancelMove();
      if (a.grounded) {
        a.setState('stagger');
        a.stun = 40;
        a.vx = dir * 380;
      } else {
        a.setState('launched');
        a.vy = -380;
        a.vx = dir * 300;
      }
      b.setState('idle');
      b.stun = 0;
      b.parryLock = 0;
      b.invuln = 6;
      b.addEnergy(15);
      a.moveContact = 'parried';
      game.hitStop(7);
      game.slowMo(0.25, 0.45);
      game.shake(0.3);
      game.camera.punch(0.07);
      SA.FX.parry(game.particles, hit.x, hit.y);
      SA.audio.play('parry');
      game.label('PARRY!', hit.x, hit.y - 90, '#ffe9a8', b, 1.3);
      game.onParry(b, a);
    },

    // Applies damage + reaction. opts.keepState: scripted special hits keep the victim locked.
    applyHit(a, b, m, hit, game, opts) {
      opts = opts || {};
      const dir = opts.dir || SA.M.sign(b.x - a.x || a.facing);
      const counter = b.state === 'attack' && b.phase === 'startup';
      const punish = (b.state === 'attack' && b.phase === 'recovery' && !b.moveContact) ||
        b.state === 'stagger' || b.state === 'landing' || (b.state === 'special' && b.sp && /whiff|blocked/.test(b.sp.phase));

      // combo bookkeeping: a hit only extends a combo if the victim never recovered
      const inCombo = a.combo.hits > 0 && b.isStunned();
      if (!inCombo) a.startCombo();

      let dmg = m.damage * (a.damageMul || 1);
      if (hit.region === 'head') dmg *= 1.2;
      else if (hit.region === 'legs') dmg *= 0.92;
      if (counter) dmg *= 1.2;
      if (!opts.noScale) dmg *= comboScale(a.combo.hits);
      if (b.armor) dmg *= 1 - b.armor;
      if (b.shieldT > 0) dmg *= 0.3;
      dmg = Math.max(1, Math.round(dmg));
      if (opts.minHp !== undefined) dmg = Math.min(dmg, Math.max(0, b.hp - opts.minHp));
      b.hp = Math.max(0, b.hp - dmg);
      if (b.infiniteHp && b.hp <= 0) b.hp = 1;

      a.combo.hits++;
      a.combo.damage += dmg;
      a.combo.timer = 0;
      a.combo.seq.push(m.id || '');
      a.moveContact = 'hit';

      const ko = b.hp <= 0;
      // super armor: wind-ups of heavy attacks (and armored enemies) absorb weaker hits without flinching
      const armored = !ko && !opts.keepState && b.isArmored && b.isArmored(m);
      if (armored) {
        opts.keepState = true;
        game.label('ARMOR', hit.x, hit.y - 60, '#c9d3e0', b, 0.8);
        SA.FX.block(game.particles, hit.x, hit.y, dir, 0.4);
      }
      if (!opts.keepState) {
        b.cancelMove();
        const airborne = !b.grounded || b.state === 'launched';
        if (m.knockdown || ko || airborne) {
          b.setState('launched');
          b.grounded = false;
          b.bounced = false;
          b.juggle++;
          b.vy = Math.min(m.kbY || -520, airborne ? -560 : -300);
          if (ko) b.vy = Math.min(b.vy, -760);
          b.vx = dir * (m.kb * (ko ? 1.15 : 0.85));
          if (b.y >= 0) b.y = -1;
        } else {
          b.setState('hitstun');
          b.stun = m.hitstun + (counter ? 6 : 0);
          b.vx = dir * m.kb;
          b.hitPose = hit.region === 'head' ? 'hitHigh' : hit.region === 'legs' ? 'hitLow' : 'hitBody';
          SA.Anim.lerpPose(b.pose, b.pose, SA.POSES[b.hitPose], 0.6);
        }
        // pinned against the wall: the attacker gets pushed back instead
        if (Math.abs(b.x) >= SA.WALL - 4 && Math.sign(b.x) === dir) a.vx = -dir * m.kb * 0.55;
      }

      a.addEnergy(dmg * 0.11 + 2);
      b.addEnergy(dmg * 0.07);
      this.applyElement(a, b, m, hit, game);

      let stop = (m.hitstop || 3) + (counter ? 2 : 0);
      if (ko) stop = 12;
      game.hitStop(stop);
      b.hitShake = stop;
      b.hitShakeMax = stop;
      b.hitFlash = 1;
      game.shake((m.shake || 0.1) * (counter ? 1.3 : 1) + (ko ? 0.5 : 0));
      if (m.zoom) game.camera.punch(m.zoom);
      if (counter && (m.power || 0) >= 0.8) game.slowMo(0.45, 0.2);
      if ((m.power || 0) >= 0.8 || ko) game.impactFlash(ko ? 0.35 : 0.12 + (counter ? 0.08 : 0));
      const power = clamp((m.power || 0.5) + (counter ? 0.2 : 0) + (ko ? 0.6 : 0), 0, 1.6);
      SA.FX.hit(game.particles, hit.x, hit.y, dir, power, SA.Combat.sparkColor(a, m));
      SA.audio.play(m.sound || 'hit_light', power);
      if (a.isPlayer || b.isPlayer) {
        if (a.isBoss && power >= 0.9) SA.Device.vibrate([25, 20, 35]);
        else SA.Device.vibrate(power >= 0.8 || ko ? 30 : 15);
      }

      game.onHit(a, b, dmg, m, hit, { counter, punish, ko });
      if (counter) game.label('COUNTER', hit.x, hit.y - 70, '#ff6b5b', a);
      else if (punish) game.label('PUNISH', hit.x, hit.y - 70, '#ffb347', a);
      return dmg;
    },

    sparkColor(a, m) {
      const el = m.element || (m.projectile ? null : a.weapon && a.weapon.element);
      if (el === 'fire') return '#ff8a2a';
      if (el === 'frost') return '#8fe3ff';
      if (el === 'shock') return '#9fd0ff';
      if (el === 'shadow') return '#b58cff';
      return a.look.spark || '#ffd08a';
    },

    // Weapon elements: small, fair status effects.
    applyElement(a, b, m, hit, game) {
      const W = SA.BALANCE.weapons;
      const el = m.element;
      if (m.stunProc || (el === 'shock' && Math.random() < W.elementProc.shock)) {
        if (b.state === 'hitstun') b.stun += W.shockStun;
        SA.FX.shock(game.particles, hit.x, hit.y);
        game.label('STUN', hit.x, hit.y - 110, '#9fd0ff', b, 0.8);
      }
      if (el === 'frost' && Math.random() < W.elementProc.frost) {
        b.slowT = W.frostSlow.seconds;
        game.label('CHILL', hit.x, hit.y - 110, '#8fe3ff', b, 0.8);
      }
      if (el === 'fire') b.burnT = W.burn.seconds;
    },
  };
})(window.SA);
