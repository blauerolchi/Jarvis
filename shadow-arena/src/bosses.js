'use strict';
/*
 * Boss system: data-driven bosses with a general PHASE architecture and scripted abilities.
 *   phase 1 -> hp < 60 % -> phase 2 -> hp < 25 % -> phase 3
 * Each phase can change AI parameters, speed, ability set, visual effects, arena tint and music.
 * Abilities are "boss moves": telegraphed wind-up, action, recovery. Elites (Shadow Step) reuse them.
 */
(function (SA) {
  const { clamp, damp, rand } = SA.M;
  const A = SA.Anim;
  const P = (o, b) => A.P(o, b);

  const BOSSES = {
    executioner: {
      name: 'THE EXECUTIONER', title: 'Headsman of the Burning Palace', arena: 'palace',
      weapon: 'executioner_axe', ranged: null, special: 'quake',
      hp: 2.0, dmg: 1.12, speed: 0.88, scale: 1.2, bulk: 1.28, armor: 0.1, superArmor: 0.6,
      accent: '#ff3a1a', eye: '#ff2a1a', acc: () => [{ type: 'hood' }, SA.EnemyGen.cape(8)],
      tint: [255, 40, 0], fx: 'embers',
      ai: { aggression: 0.62, range: 260, blockMul: 0.8, dodgeMul: 0.3, jumpiness: 0.04,
        weights: { jab: 2, kick: 1, heavy: 3, lowKick: 0.8, dashPunch: 1, slideKick: 0.2, jumpIn: 0.2, combo: 2.5, over: 1.4 } },
      phases: [
        { at: 1, speed: 1, aggression: 1, abilities: [{ id: 'slam', cd: 7, max: 420, chance: 0.35 }] },
        { at: 0.6, speed: 1.12, aggression: 1.25, label: 'ENRAGED', abilities: [{ id: 'slam', cd: 5, max: 440 }, { id: 'shockwaves', cd: 8, min: 200 }] },
        { at: 0.25, speed: 1.2, aggression: 1.45, label: 'EXECUTION', abilities: [{ id: 'shockwaves', cd: 4.5, min: 150 }, { id: 'charge', cd: 6, min: 300 }, { id: 'slam', cd: 4, max: 440 }] },
      ],
    },
    shadow_ronin: {
      name: 'SHADOW RONIN', title: 'The Blade That Casts No Shadow', arena: 'bamboo',
      weapon: 'shadow_katana', ranged: 'shuriken', special: 'slash',
      hp: 1.6, dmg: 1.05, speed: 1.08, scale: 1.05, bulk: 1.02, armor: 0, superArmor: 0, parry: 0.2,
      accent: '#b58cff', eye: '#d2b2ff', acc: () => [{ type: 'hat' }, SA.EnemyGen.cape(7)],
      tint: [120, 60, 255], fx: 'petals',
      ai: { aggression: 0.72, range: 250, blockMul: 1.3, dodgeMul: 1.3, jumpiness: 0.12,
        weights: { jab: 3, kick: 1.4, heavy: 1.6, lowKick: 1.2, dashPunch: 2, slideKick: 0.6, jumpIn: 0.5, combo: 4, over: 1.2 } },
      phases: [
        { at: 1, speed: 1, aggression: 1, abilities: [{ id: 'teleport', cd: 7, min: 260, chance: 0.4 }] },
        { at: 0.6, speed: 1.1, aggression: 1.2, label: 'SHADOW STANCE', abilities: [{ id: 'teleport', cd: 5, min: 220 }, { id: 'shadowSlash', cd: 6, min: 320 }] },
        { at: 0.25, speed: 1.18, aggression: 1.35, label: 'THOUSAND CUTS', abilities: [{ id: 'teleport', cd: 3.5, min: 200 }, { id: 'shadowSlash', cd: 4, min: 260, double: true }] },
      ],
    },
    iron_titan: {
      name: 'IRON TITAN', title: 'The Mountain That Walks', arena: 'frozen',
      weapon: 'titan_hammer', ranged: null, special: 'quake',
      hp: 2.5, dmg: 1.15, speed: 0.8, scale: 1.26, bulk: 1.4, armor: 0.3, superArmor: 0.8,
      accent: '#9fd0ff', eye: '#bfe6ff', acc: () => [{ type: 'helmet' }],
      tint: [120, 180, 255], fx: 'sparks',
      ai: { aggression: 0.55, range: 250, blockMul: 1.4, dodgeMul: 0.1, jumpiness: 0.02,
        weights: { jab: 1.4, kick: 1, heavy: 3.4, lowKick: 0.6, dashPunch: 0.6, slideKick: 0.1, jumpIn: 0.05, combo: 2, over: 1.6 } },
      phases: [
        { at: 1, speed: 1, aggression: 1, abilities: [{ id: 'slam', cd: 6, max: 440 }] },
        { at: 0.6, speed: 1.08, aggression: 1.15, label: 'OVERDRIVE', abilities: [{ id: 'slam', cd: 4.5, max: 440 }, { id: 'quake', cd: 9, min: 150 }] },
        { at: 0.25, speed: 1.15, aggression: 1.3, label: 'MELTDOWN', armor: 0.18, abilities: [{ id: 'quake', cd: 6, min: 100 }, { id: 'shockwaves', cd: 5, min: 200 }, { id: 'charge', cd: 7, min: 320 }] },
      ],
    },
    hunter: {
      name: 'THE HUNTER', title: 'Nothing Escapes the Crossbow', arena: 'ancient',
      weapon: 'dual_blades', ranged: 'crossbow', special: 'storm',
      hp: 1.6, dmg: 1.05, speed: 1.06, scale: 1.03, bulk: 1, armor: 0, superArmor: 0,
      accent: '#7cff6b', eye: '#caffb0', acc: () => [{ type: 'hood' }, SA.EnemyGen.cape(9)],
      tint: [60, 200, 90], fx: 'leaves',
      ai: { aggression: 0.6, range: 420, blockMul: 1, dodgeMul: 1.6, jumpiness: 0.2, keepAway: true, rangedMul: 2.2, rangedMin: 280,
        weights: { jab: 2.6, kick: 1.5, heavy: 1.2, lowKick: 1.4, dashPunch: 1.4, slideKick: 1, jumpIn: 0.6, combo: 3.5, over: 0.6 } },
      phases: [
        { at: 1, speed: 1, aggression: 1, abilities: [{ id: 'daggers', cd: 6, min: 280, chance: 0.4 }] },
        { at: 0.6, speed: 1.1, aggression: 1.15, label: 'THE CHASE', abilities: [{ id: 'daggers', cd: 4.5, min: 240 }, { id: 'vanish', cd: 7, max: 260 }] },
        { at: 0.25, speed: 1.18, aggression: 1.35, label: 'KILL SHOT', abilities: [{ id: 'daggers', cd: 3.5, min: 200, fan: 5 }, { id: 'vanish', cd: 5, max: 280 }, { id: 'teleport', cd: 6, min: 300 }] },
      ],
    },
    cyber_warlord: {
      name: 'CYBER WARLORD', title: 'Steel, Neon and Fire', arena: 'cyber',
      weapon: 'katana', ranged: 'energy_pistol', special: 'rush',
      hp: 2.0, dmg: 1.1, speed: 1.04, scale: 1.12, bulk: 1.12, armor: 0.1, superArmor: 0.4,
      accent: '#35f0ff', eye: '#35f0ff', visor: true, acc: () => [SA.EnemyGen.coat()],
      tint: [30, 220, 255], fx: 'data',
      ai: { aggression: 0.7, range: 300, blockMul: 1.1, dodgeMul: 1, jumpiness: 0.1, rangedMul: 1.6, rangedMin: 320,
        weights: { jab: 2.6, kick: 1.3, heavy: 1.8, lowKick: 1, dashPunch: 2.2, slideKick: 0.8, jumpIn: 0.4, combo: 3.5, over: 1 } },
      phases: [
        { at: 1, speed: 1, aggression: 1, abilities: [{ id: 'volley', cd: 8, min: 300, chance: 0.35 }] },
        { at: 0.6, speed: 1.1, aggression: 1.2, label: 'SHIELD PROTOCOL', abilities: [{ id: 'shield', cd: 11, chance: 0.5 }, { id: 'volley', cd: 6, min: 260 }, { id: 'charge', cd: 7, min: 320 }] },
        { at: 0.25, speed: 1.18, aggression: 1.4, label: 'FULL ASSAULT', abilities: [{ id: 'volley', cd: 4, min: 200, count: 5 }, { id: 'shield', cd: 9 }, { id: 'teleport', cd: 5, min: 260 }] },
      ],
    },
  };
  const ORDER = ['executioner', 'shadow_ronin', 'iron_titan', 'hunter', 'cyber_warlord'];

  function generate(stage, effStage, difficulty, rng, forceId) {
    const id = forceId || ORDER[(Math.floor(stage / SA.BALANCE.arena.bossEvery) - 1 + ORDER.length * 10) % ORDER.length];
    const b = BOSSES[id];
    const great = stage % SA.BALANCE.arena.greatBossEvery === 0;
    const sc = SA.EnemyGen.statScale(effStage);
    const params = SA.EnemyGen.aiParams(effStage);
    if (b.parry) params.parry = Math.min(0.5, params.parry + b.parry);
    const look = {
      body: '#040306', back: '#17121c', accent: b.accent, trail: b.accent, spark: SA.M.shade(b.accent, 0.4),
      eye: b.eye, eyeCore: '#ffffff', visor: !!b.visor, scale: b.scale * (great ? 1.06 : 1), bulk: b.bulk, victory: 2,
      accessories: b.acc(),
    };
    return {
      kind: 'boss', bossId: id, great, stage, label: great ? 'GREAT BOSS' : 'BOSS',
      name: (great ? 'ASCENDED ' : '') + b.name, title: b.title,
      weapon: b.weapon, ranged: b.ranged, special: b.special,
      stats: {
        maxHp: Math.round(1000 * b.hp * sc.hp * (great ? 1.25 : 1)),
        damageMul: b.dmg * sc.dmg * (great ? 1.08 : 1), speedMul: b.speed * sc.speed,
        armor: b.armor, superArmor: b.superArmor,
      },
      look, ai: Object.assign({}, b.ai, { weights: Object.assign({}, b.ai.weights) }), params,
      abilities: b.phases[0].abilities.map((a) => Object.assign({}, a)),
      phases: b.phases, traits: ['Boss', b.phases.length + ' Phases'], modifiers: [],
      arena: b.arena, tint: b.tint, fx: b.fx,
    };
  }

  // ---------- phase controller (called every tick for boss fights) ----------
  function updatePhase(f, ai, game) {
    const def = f.def;
    if (!def || !def.phases || f.hp <= 0) return;
    const ratio = f.hp / f.maxHp;
    const cur = f.bossPhase || 0;
    let next = cur;
    for (let i = def.phases.length - 1; i > cur; i--) if (ratio < def.phases[i].at) { next = i; break; }
    if (next === cur) return;
    f.bossPhase = next;
    const ph = def.phases[next];
    f.baseSpeed = def.stats.speedMul * (ph.speed || 1);
    if (ph.armor) f.armor = Math.max(f.armor, ph.armor);
    ai.phaseAggression = ph.aggression || 1;
    ai.abilities = ph.abilities.map((a) => Object.assign({ cdLeft: 1.2 }, a));
    f.invuln = Math.max(f.invuln, 40);
    // cinematic transition
    game.slowMo(0.3, 0.7);
    game.shake(0.6);
    game.camera.punch(0.1);
    game.impactFlash(0.3);
    SA.FX.special(game.particles, f.x, f.y, f.look.accent);
    SA.FX.ko(game.particles, f.skel.hip.x, f.y - 160);
    SA.audio.play('roar');
    SA.audio.setMusicIntensity(1 + next * 0.3);
    game.ui.showBanner(`PHASE ${next + 1}  ·  ${ph.label || ''}`, 1, f.look.accent);
    game.bossFx = { phase: next, tint: def.tint, fx: def.fx };
    SA.Device.vibrate([25, 20, 35]);
  }

  // ---------- abilities ("boss moves") ----------
  const MOVES = {
    slam: { windup: 24, recover: 26, armored: true },
    shockwaves: { windup: 18, recover: 22, armored: true },
    charge: { windup: 16, recover: 26 },
    teleport: { windup: 10, recover: 4 },
    vanish: { windup: 8, recover: 6 },
    shadowSlash: { windup: 14, recover: 18 },
    volley: { windup: 16, recover: 18 },
    shield: { windup: 10, recover: 8 },
    daggers: { windup: 10, recover: 16 },
    quake: { windup: 12, recover: 20, armored: true },
  };

  const SLAM_HIT = { id: 'slam', damage: 70, hitstun: 26, blockstun: 18, kb: 700, kbY: -600, knockdown: true, level: 'mid', hitstop: 8, shake: 0.7, zoom: 0.08, sound: 'boss_impact', power: 1.2 };
  const CHARGE_HIT = { id: 'charge', damage: 60, hitstun: 26, blockstun: 16, kb: 900, kbY: -520, knockdown: true, level: 'mid', hitstop: 6, shake: 0.5, sound: 'hit_heavy', power: 1.0 };

  function heavyKeys(i) { return SA.MOVES['war_hammer:hv'].keys[i][1]; }

  function startAbility(f, target, id, game) {
    const M = MOVES[id];
    if (!M || !(f.isNeutral() || f.state === 'run' || f.state === 'sprint') || !f.grounded) return false;
    const ab = (game.ai2 && game.ai2.me === f ? game.ai2.abilities : []).find((a) => a.id === id) || {};
    f.cancelMove();
    f.setState('bossmove');
    f.bm = { id, t: 0, phase: 'windup', fired: 0, target, opts: ab, armored: !!M.armored };
    f.hitList.clear();
    f.moveContact = null;
    switch (id) {
      case 'slam': case 'shockwaves': case 'quake':
        f.setAnim([[0, f.pose], [M.windup, heavyKeys(1), 'smooth']]);
        break;
      case 'charge':
        f.setAnim([[0, f.pose], [M.windup, P({ torso: 0.7, lF1: 1.0, lF2: -1.6, lB1: -0.6, lB2: -0.6, aF1: 1.2, aF2: 1.2, aB1: 1.0, aB2: 1.4 })]]);
        break;
      case 'volley':
        f.setAnim([[0, f.pose], [M.windup, P({ torso: -0.2, aF1: 2.6, aF2: 0.2, aB1: 2.4, aB2: 0.3 })]]);
        break;
      case 'shield':
        f.setAnim([[0, f.pose], [M.windup, SA.POSES.special]]);
        break;
      default:
        f.setAnim([[0, f.pose], [M.windup, SA.POSES.crouch]]);
    }
    // telegraph so the player can react
    SA.FX.telegraph(game.particles, f, f.look.accent);
    SA.audio.play(id === 'teleport' || id === 'vanish' ? 'teleport' : 'charge_up', 0.8);
    return true;
  }

  function updateMove(f, ts, dt, game) {
    const bm = f.bm;
    if (!bm) { f.toNeutral(); return; }
    const M = MOVES[bm.id];
    bm.t += ts;
    f.mt += ts;
    const tg = bm.target;
    if (bm.phase === 'windup') {
      f.vx = damp(f.vx, 0, 14, dt);
      if (Math.floor(bm.t) % 3 === 0) SA.FX.aura(game.particles, f.x, f.y, f.look.accent);
      if (bm.t >= M.windup) { bm.phase = 'act'; bm.t = 0; act(f, bm, game); }
      return;
    }
    if (bm.phase === 'act') {
      actUpdate(f, bm, ts, dt, game);
      return;
    }
    // recover
    f.vx = damp(f.vx, 0, 10, dt);
    if (bm.t >= M.recover) {
      if (bm.followUp) { const id = bm.followUp; f.toNeutral(); f.startMove(id); return; }
      f.toNeutral();
    }
    void tg;
  }

  function toRecover(f, bm) {
    bm.phase = 'recover';
    bm.t = 0;
    f.setAnim([[0, f.pose], [MOVES[bm.id].recover, SA.POSES.stance, 'smooth']]);
  }

  function act(f, bm, game) {
    const tg = bm.target;
    switch (bm.id) {
      case 'slam': case 'quake': {
        f.setAnim([[0, heavyKeys(2)], [6, heavyKeys(3)]]);
        f.hitList.clear();
        const tipX = f.x + f.facing * 180 * f.look.scale;
        SA.FX.dust(game.particles, tipX, 0, 1.8, 0);
        game.shake(0.7);
        game.camera.punch(0.08);
        SA.audio.play('boss_impact');
        game.projectiles.shockwave(f, tipX, f.facing, { dmg: Math.round(40 * f.damageMul), speed: 1000, color: SA.M.shade(f.look.accent, 0.3) });
        if (bm.id === 'quake') game.projectiles.shockwave(f, f.x - f.facing * 120, -f.facing, { dmg: Math.round(34 * f.damageMul), speed: 900, color: SA.M.shade(f.look.accent, 0.3) });
        SA.Device.vibrate([25, 20, 35]);
        break;
      }
      case 'shockwaves':
        f.setAnim([[0, heavyKeys(2)], [6, heavyKeys(3)]]);
        break;
      case 'charge':
        f.setAnim([[0, SA.POSES.rushDash]]);
        f.hitList.clear();
        SA.audio.play('dash', 1.3);
        break;
      case 'teleport': {
        // vanish, then strike from behind or in front
        f.vanished = true;
        SA.FX.smoke(game.particles, f.x, f.y, f.look.accent);
        const behind = Math.random() < 0.6 ? -tg.facing : tg.facing;
        let nx = tg.x + behind * 150;
        if (Math.abs(nx) > SA.WALL - 20) nx = tg.x - behind * 150;
        bm.nx = clamp(nx, -SA.WALL, SA.WALL);
        break;
      }
      case 'vanish':
        f.vanished = true;
        SA.FX.smoke(game.particles, f.x, f.y, f.look.accent);
        bm.nx = clamp(f.x + (f.x < tg.x ? -1 : 1) * 520, -SA.WALL, SA.WALL);
        break;
      case 'shadowSlash': {
        const kk = SA.MOVES['katana:a1'].keys;
        f.setAnim([[0, kk[2][1]], [8, kk[3][1]]]);
        break;
      }
      case 'volley':
        f.setAnim([[0, f.pose]]);
        break;
      case 'shield':
        f.shieldT = 4.5;
        SA.audio.play('shield');
        SA.FX.special(game.particles, f.x, f.y, '#35f0ff');
        toRecover(f, bm);
        break;
      case 'daggers': {
        const kk = SA.MOVES['shuriken:fire'].keys;
        f.setAnim([[0, kk[2][1]], [8, kk[3][1]]]);
        break;
      }
    }
  }

  function actUpdate(f, bm, ts, dt, game) {
    const tg = bm.target;
    switch (bm.id) {
      case 'slam': case 'quake':
        if (bm.t >= 6) toRecover(f, bm);
        break;
      case 'shockwaves': {
        const times = [0, 12, 24];
        while (bm.fired < times.length && bm.t >= times[bm.fired]) {
          const dir = bm.fired === 1 ? -f.facing : f.facing;
          game.projectiles.shockwave(f, f.x + dir * 100, dir, { dmg: Math.round(38 * f.damageMul), speed: 900 + bm.fired * 150, color: SA.M.shade(f.look.accent, 0.3) });
          SA.FX.dust(game.particles, f.x + dir * 100, 0, 1.2, dir);
          game.shake(0.35);
          SA.audio.play('boss_impact', 0.6);
          bm.fired++;
        }
        if (bm.t >= 30) toRecover(f, bm);
        break;
      }
      case 'charge':
        f.vx = f.facing * 1650 * f.speedMul;
        f.spawnGhost(2);
        if (bm.t >= 26 || Math.abs(f.x) >= SA.WALL - 2 || f.moveContact) toRecover(f, bm);
        break;
      case 'teleport':
        if (bm.t >= 10) {
          f.vanished = false;
          f.x = f.prevX = bm.nx;
          f.facing = Math.sign(tg.x - f.x) || f.facing;
          SA.FX.smoke(game.particles, f.x, f.y, f.look.accent);
          SA.audio.play('teleport', 1.2);
          const heavy = f.moveset.heavy;
          f.toNeutral();
          f.startMove(heavy);
        }
        break;
      case 'vanish':
        if (bm.t >= 12) {
          f.vanished = false;
          f.x = f.prevX = bm.nx;
          f.facing = Math.sign(tg.x - f.x) || f.facing;
          SA.FX.smoke(game.particles, f.x, f.y, f.look.accent);
          toRecover(f, bm);
          if (f.rangedWeapon && f.rangedState.ready()) bm.followUp = f.rangedWeapon.id + ':fire';
        }
        break;
      case 'shadowSlash': {
        const n = bm.opts && bm.opts.double ? 2 : 1;
        const times = [2, 16];
        while (bm.fired < n && bm.t >= times[bm.fired]) {
          game.projectiles.wave(f, f.x + f.facing * 90, f.y - 170 + bm.fired * 60, f.facing, {
            speed: 1700, w: 120, h: 230, color: f.look.accent, life: 0.9,
            data: { damage: Math.round(62 * f.damageMul), hitstun: 26, blockstun: 16, kb: 700, kbY: -560, knockdown: true, level: 'mid' },
          });
          SA.audio.play('draw', 1);
          game.shake(0.3);
          bm.fired++;
        }
        if (bm.t >= (n > 1 ? 22 : 10)) toRecover(f, bm);
        break;
      }
      case 'volley': {
        const n = (bm.opts && bm.opts.count) || 3;
        while (bm.fired < n && bm.t >= bm.fired * 8) {
          const tx = tg.x + rand(-120, 120);
          const flight = 1.05;
          const hand = f.skel.handF;
          game.projectiles.spawn({
            type: 'rocket', owner: f, x: hand.x, y: hand.y - 20, vx: (tx - hand.x) / flight, vy: -900, grav: 1700, life: 2.5, size: 26,
            explode: { r: 150, dmg: Math.round(42 * f.damageMul) }, color: '#ff8a2a',
            data: { id: 'rocket', damage: Math.round(22 * f.damageMul), hitstun: 18, blockstun: 10, kb: 300, level: 'mid', hitstop: 4, shake: 0.2, sound: 'hit_heavy', power: 0.6, projectile: true },
          });
          SA.audio.play('rocket');
          bm.fired++;
        }
        if (bm.t >= n * 8 + 4) toRecover(f, bm);
        break;
      }
      case 'daggers': {
        const fan = (bm.opts && bm.opts.fan) || 3;
        if (!bm.fired) {
          bm.fired = 1;
          const hand = f.skel.handF;
          for (let i = 0; i < fan; i++) {
            const a = (i - (fan - 1) / 2) * 0.13;
            game.projectiles.spawn({
              type: 'knife', owner: f, x: hand.x + f.facing * 18, y: hand.y, vx: Math.cos(a) * 1600 * f.facing, vy: Math.sin(a) * 1600, life: 1.2, size: 18,
              data: { id: 'dagger', damage: Math.round(30 * f.damageMul), hitstun: 16, blockstun: 8, kb: 180, level: 'mid', hitstop: 3, shake: 0.1, sound: 'hit_blade', power: 0.4, projectile: true },
            });
          }
          SA.audio.play('throw', 1.2);
        }
        if (bm.t >= 8) toRecover(f, bm);
        break;
      }
      default:
        toRecover(f, bm);
    }
  }

  function moveHit(f) {
    const bm = f.bm;
    if (!bm || bm.phase !== 'act') return null;
    const s = f.look.scale;
    if ((bm.id === 'slam' || bm.id === 'quake') && bm.t < 5) {
      const x0 = f.facing > 0 ? f.x : f.x - 290 * s;
      return { rect: { x: x0, y: f.y - 230 * s, w: 290 * s, h: 230 * s }, data: Object.assign({}, SLAM_HIT, { damage: Math.round(SLAM_HIT.damage * f.damageMul) }) };
    }
    if (bm.id === 'charge') {
      const cx = f.x + f.facing * 60 * s;
      return { rect: { x: cx - 70 * s, y: f.y - 260 * s, w: 140 * s, h: 260 * s }, data: Object.assign({}, CHARGE_HIT, { damage: Math.round(CHARGE_HIT.damage * f.damageMul) }) };
    }
    return null;
  }

  function onLand(f) { f.toNeutral(); }

  // Boss AI: regular combat AI + phase-aware aggression.
  class BossAI extends SA.EnemyAI {
    aggr() { return super.aggr() * (this.phaseAggression || 1); }
    update(ts) {
      super.update(ts);
      updatePhase(this.me, this, this.game);
    }
  }

  SA.BOSSES = BOSSES;
  SA.BOSS_ORDER = ORDER;
  SA.BossAI = BossAI;
  SA.Bosses = { generate, updatePhase, startAbility, updateMove, moveHit, onLand, MOVES, BOSSES, ORDER };
})(window.SA);
