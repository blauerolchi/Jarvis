'use strict';
/*
 * Fighter: state machine, movement and move execution.
 * Driven only through its Controller (held actions + buffered presses), for both human and AI.
 *
 * States: idle walk crouch block | prejump air landing | dash run evade | attack special bossmove
 *         hitstun blockstun stagger launched down getup rushed | victory defeat ko intro
 *
 * The moveset comes from the equipped weapon (SA.WEAPON_SETS), so the same state machine runs
 * fists, katana, spear, hammer … Context actions: down + attack = low attack, up + heavy =
 * overhead, attack while dashing = dash attack, attack in the air = air attack.
 */
(function (SA) {
  const { clamp, damp, lerp } = SA.M;
  const A = SA.Anim;

  // Movement tuning (px/s, frames). Responsive input: target speeds are reached within ~3 frames.
  const WALK_FWD = 430, WALK_BACK = 350, RUN_SPEED = 760, SPRINT_SPEED = 960;
  const ACCEL = 60, DECEL = 40;
  const JUMP_VY = -1480, JUMP_VX = 540;
  const DASH_CD = 12;
  const RUN_AFTER = 9, SPRINT_AFTER = 38;      // keyboard: hold forward to break into a run / sprint
  const AIR_STEER = 1250, AIR_MAX = 620;   // air control ≈ 40 % of ground control

  // ---------- root motion ----------
  // Mobility moves don't use flat speeds: each has a velocity *shape* v(u) over its duration, turned
  // into a cumulative position curve C(u) (0 -> 1). Every step moves the fighter by
  // dist * (C(u1) - C(u0)), expressed as a velocity so physics / body collision still apply.
  // => very fast bursts that still travel over many rendered frames, with a clean ease-out.
  function makeCurve(shape) {
    const N = 64, c = new Float32Array(N + 1);
    let sum = 0;
    for (let i = 0; i < N; i++) { c[i] = sum; sum += Math.max(0, shape((i + 0.5) / N)); }
    c[N] = sum;
    for (let i = 0; i <= N; i++) c[i] /= sum;
    return c;
  }
  function curveAt(c, u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    const x = u * 64, i = Math.floor(x);
    return c[i] + (c[i + 1] - c[i]) * (x - i);
  }
  const ramp = (u, a, from) => (u < a ? from + (1 - from) * (u / a) : 1);
  // frames, dist (px), velocity shape, invulnerable frames [from, to], mobility cost
  const MOB = {
    // dash: snaps to full speed, short peak, eases out into running speed
    dash: { frames: 11, dist: 255, shape: (u) => ramp(u, 0.12, 0.55) * (u < 0.12 ? 1 : 1 - 0.68 * Math.pow((u - 0.12) / 0.88, 0.85)), cost: 20 },
    // backstep: a quick defensive hop back that settles
    backstep: { frames: 15, dist: 180, shape: (u) => ramp(u, 0.1, 0.6) * Math.pow(1 - u, 1.3), invuln: [1, 8], cost: 18 },
    // combat roll: accelerate, hold, brake, clean recovery frame
    roll: { frames: 24, dist: 330, shape: (u) => ramp(u, 0.16, 0.45) * (u < 0.66 ? 1 : 1 - 0.9 * ((u - 0.66) / 0.34)), invuln: [2, 10], through: 17, cost: 26 },
    // slide: launched by the run, friction slows it down
    slide: { frames: 24, dist: 300, shape: (u) => Math.pow(1 - u, 1.25) + 0.04, cost: 16 },
    // air dash: short horizontal burst, gravity paused
    airdash: { frames: 10, dist: 215, shape: (u) => ramp(u, 0.15, 0.6) * (1 - 0.55 * u), cost: 24 },
  };
  for (const k in MOB) MOB[k].curve = makeCurve(MOB[k].shape);
  // acrobatics: take-off velocity, gravity scale, rotation frames, attack allowed from frame, invulnerable frames
  const FLIPS = {
    front: { vy: -1420, vx: 820, grav: 1, rotFrames: 30, atkFrom: 8, dir: 1, cost: 18 },
    back: { vy: -1400, vx: -600, grav: 1.05, rotFrames: 28, atkFrom: 14, dir: -1, cost: 18 },
    // handspring (flik-flak): low, fast arc backwards over the hands
    hand: { vy: -520, vx: -820, grav: 0.9, rotFrames: 19, atkFrom: 99, dir: -1, invuln: [2, 11], cost: 30 },
    // joystick up: acrobatic jump with a small tucked spin; horizontal speed from the held direction
    spin: { vy: -1560, vx: 0, steer: true, grav: 1, rotFrames: 26, atkFrom: 5, dir: 1, cost: 0 },
    // double ↗: flip leap, long and high (platform to platform)
    leap: { vy: -1640, vx: 960, grav: 0.96, rotFrames: 34, atkFrom: 8, dir: 1, cost: 22 },
  };
  const FAST_FALL = 1650;
  const ROLL = MOB.roll;
  const FEET = ['footF', 'footB'];
  const MOB_REGEN = 70;   // mobility meter per second (hidden): chaining many dodges costs recovery time

  // states that may fire the sidearm on top of what they are doing (shooting never locks the fighter)
  const SHOOT_OK = { idle: 1, walk: 1, crouch: 1, run: 1, sprint: 1, dash: 1, slide: 1, roll: 1, evade: 1, air: 1, flip: 1, airdash: 1, landing: 1, prejump: 1 };
  const NEUTRAL = { idle: 1, walk: 1, crouch: 1, block: 1 };
  const MOVING = { run: 1, sprint: 1, dash: 1 };
  const STUNNED = { hitstun: 1, launched: 1, stagger: 1, rushed: 1 };

  SA.SPECIALS = {
    rush: { id: 'rush', name: 'TOMB RUSH', desc: 'A dash wrapped in sand: five strikes from every side and a crushing finisher.' },
    storm: { id: 'storm', name: 'SANDSTORM SPIRAL', desc: 'Rising whirlwind of kicks inside a sand vortex. Great anti-air, launches the enemy.' },
    slash: { id: 'slash', name: 'CRESCENT OF ANUBIS', desc: 'A lunging cut that releases a black-gold crescent across the arena.' },
    quake: { id: 'quake', name: 'EARTHSHAKER', desc: 'Leap and slam the ground: shockwaves travel both ways.' },
  };

  const DIVE_IMPACT = { id: 'diveImpact', damage: 30, hitstun: 24, blockstun: 16, kb: 260, kbY: -760, knockdown: true, level: 'low', hitstop: 7, shake: 0.45, zoom: 0.05, sound: 'hit_heavy', power: 0.95 };
  const RUSH_DASH = { id: 'rush', damage: 30, hitstun: 30, blockstun: 24, kb: 120, level: 'mid', hitstop: 4, shake: 0.3, sound: 'hit_heavy', power: 0.8, unparryable: true };
  const RUSH_HIT = { id: 'rush', damage: 24, hitstun: 30, kb: 0, level: 'mid', hitstop: 3, shake: 0.18, sound: 'hit_light', power: 0.55 };
  const RUSH_FINAL = { id: 'rush', damage: 90, hitstun: 30, kb: 1350, kbY: -950, knockdown: true, level: 'mid', hitstop: 9, shake: 0.85, zoom: 0.1, sound: 'hit_special', power: 1.4 };
  const STORM_HIT = { id: 'storm', damage: 40, hitstun: 30, blockstun: 14, kb: 40, kbY: -1250, knockdown: true, level: 'mid', hitstop: 3, shake: 0.25, sound: 'hit_kick', power: 0.7 };
  const STORM_FINAL = { id: 'storm', damage: 75, hitstun: 30, blockstun: 16, kb: 950, kbY: -700, knockdown: true, level: 'mid', hitstop: 8, shake: 0.7, zoom: 0.08, sound: 'hit_special', power: 1.3 };
  const QUAKE_HIT = { id: 'quake', damage: 80, hitstun: 30, blockstun: 18, kb: 650, kbY: -760, knockdown: true, level: 'mid', hitstop: 8, shake: 0.8, zoom: 0.08, sound: 'hit_special', power: 1.3, unparryable: true };

  const RUSH_POSES = ['jab', 'kick', 'jab2', 'heavy', 'lowKick'].map((id) => {
    const keys = SA.MOVES[id].keys;
    return keys[keys.length - 3][1]; // the strike pose
  });

  // root joint of a striking limb (used for the near/close-range hitbox)
  const PARENT = { handF: 'sh', handB: 'sh', footF: 'hip', footB: 'hip', kneeF: 'hip', kneeB: 'hip' };
  function segRect(x0, y0, x1, y1, pad) {
    return { x: Math.min(x0, x1) - pad, y: Math.min(y0, y1) - pad, w: Math.abs(x1 - x0) + pad * 2, h: Math.abs(y1 - y0) + pad * 2 };
  }
  // the close-range box never reaches higher or lower than the attack itself (high attacks still whiff over crouchers)
  function clipNear(near, rect) {
    if (!near) return null;
    const y1 = Math.min(near.y + near.h, rect.y + rect.h + 8);
    const y0 = Math.max(near.y, rect.y - 8);
    if (y1 <= y0) return null;
    near.y = y0; near.h = y1 - y0;
    return near;
  }

  class Fighter {
    constructor(o) {
      this.name = o.name;
      this.look = o.look;
      this.ctrl = o.controller;
      this.isPlayer = !!o.isPlayer;
      this.maxHp = o.maxHp || 1000;
      this.damageMul = o.damageMul || 1;
      this.baseSpeed = o.speedMul || 1;
      this.speedMul = this.baseSpeed;
      this.specialId = o.special || 'rush';
      this.armor = o.armor || 0;            // damage reduction (0..0.5)
      this.superArmor = o.superArmor || 0;  // hits with less power than this don't flinch
      this.pose = A.P();
      this.entryPose = A.P();
      this.local = A.createSkeleton();
      this.skel = A.createSkeleton();
      this.hurt = { head: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, torso: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, legs: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } };
      this.hitList = new Set();
      this.combo = { hits: 0, damage: 0, seq: [], tags: [], timer: 0, name: null };
      this.flow = []; this.flowT = 0; this.lastFlow = null;
      this.accessories = null;
      this.energy = 0;
      this.setLoadout({ weapon: o.weapon || 'fists', ranged: o.ranged || null });
      this.reset(0, 1);
    }

    setLoadout(l) {
      const w = SA.WEAPONS[l.weapon] || SA.WEAPONS.fists;
      this.weapon = w;
      this.moveset = SA.WEAPON_SETS[w.id];
      this.wgeom = w.geom;
      this.rangedWeapon = l.ranged ? SA.RANGED[l.ranged] || null : null;
      this.rangedState = this.rangedWeapon ? new SA.RangedState(this.rangedWeapon) : null;
      if (l.special) this.specialId = l.special;
    }

    reset(x, facing) {
      this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.plat = null; this.dropT = 0; this.fastFall = false; this.shootT = 0; this.shotCd = 0; this.dive = false;
      this.prevX = x; this.prevY = 0;
      this.facing = facing;
      this.grounded = true;
      this.hp = this.maxHp;
      this.state = 'idle'; this.st = 0;
      this.move = null; this.mt = 0; this.animKeys = null;
      this.moveContact = null; this.lunged = false; this.whooshed = false; this.fired = false; this.effectDone = false;
      this.hitList.clear();
      this.stun = 0; this.invuln = 0;
      this.parryAge = 99; this.parryLock = 0;
      this.crouchBlock = false;
      this.juggle = 0; this.bounced = false;
      this.airTime = 0; this.airAttackUsed = false; this.diveUsed = false; this.jumpDir = 0;
      this.walkDir = 1; this.walkPhase = 0;
      this.animTime = Math.random() * 10;
      this.spin = null; this.spinScale = 1; this.scaleX = 1; this.scaleY = 1;
      this.hitPose = 'hitBody';
      this.sp = null; this.bm = null;
      this.slowT = 0; this.burnT = 0; this.burnAcc = 0; this.shieldT = 0; this.vanished = false;
      this.ghosts = []; this.ghostTimer = 0;
      this.trail = [];
      this.fromRun = false;
      this.turnT = 0; this.rollDir = 1; this.rollThrough = 0;
      this.fwdT = 0; this.dashCd = 0; this.landT = 0; this.gravMul = 1; this.moveBonus = 1;
      this.faceVis = facing; this.lean = 0; this.prevVx = 0;
      this.flip = null; this.airDashUsed = false; this.dive = false; this.flipAtk = 0; this.hsLand = 0;
      this.mobility = 100; this.mobRest = 0; this.rm = null;
      if (this.rangedWeapon) this.rangedState = new SA.RangedState(this.rangedWeapon);
      this.startCombo();
      A.copyPose(this.pose, A.STANCE);
      A.solveLocal(this.pose, this.local, this.look.bulk, this.wgeom);
      A.toWorld(this);
      this.updateHurtboxes();
      this.snapshotRender();
      if (this.ctrl) this.ctrl.clear();
      if (this.accessories) SA.Render.resetAccessories(this);
    }

    // ---------- queries ----------
    // movement collider (separate from hurtboxes and attack hitboxes), see SA.Physics
    get body() { return SA.Physics.bodyOf(this); }
    get phase() {
      const m = this.move;
      if (!m || this.state !== 'attack') return null;
      if (this.mt < m.startup) return 'startup';
      if (this.mt < m.startup + m.active) return 'active';
      return 'recovery';
    }
    fwdHeld() { return this.ctrl.held(this.facing > 0 ? 'right' : 'left'); }
    backHeld() { return this.ctrl.held(this.facing > 0 ? 'left' : 'right'); }
    isNeutral() { return !!NEUTRAL[this.state]; }
    isMoving() { return !!MOVING[this.state]; }
    // walk / run / sprint: stick deflection on touch, hold time on keyboard (and digital AI input)
    moveTier() {
      const c = this.ctrl;
      if (c.stick || c.analog < 1) {
        const a = c.analog;
        return a >= SA.Stick.RUN ? 'sprint' : a >= SA.Stick.WALK ? 'run' : 'walk';
      }
      return this.fwdT >= SPRINT_AFTER ? 'sprint' : this.fwdT >= RUN_AFTER ? 'run' : 'walk';
    }
    isStunned() { return !!STUNNED[this.state]; }
    isCrouching() {
      return this.state === 'crouch' || this.state === 'slide' || ((this.state === 'block' || this.state === 'blockstun') && this.crouchBlock) ||
        (this.state === 'attack' && this.move && this.move.crouching);
    }
    canBeHit(attacker) {
      if (this.invuln > 0 || this.vanished) return false;
      const s = this.state;
      if (s === 'down' || s === 'getup' || s === 'ko' || s === 'victory' || s === 'defeat' || s === 'rushed') return false;
      if (s === 'launched' && this.juggle >= 5 && !(attacker && attacker.state === 'special')) return false;
      return true;
    }
    // Heavy wind-ups and armored enemies absorb weaker hits without flinching.
    isArmored(m) {
      const power = m.power || 0.5;
      if (m.knockdown && power >= 0.9) return false;
      if (this.state === 'attack' && this.move && this.move.armor) {
        const [a, b] = this.move.armor;
        if (this.mt >= a && this.mt <= b && power < 1.05) return true;
      }
      if (this.state === 'bossmove' && this.bm && this.bm.armored) return power < 1.2;
      return this.superArmor > 0 && power < this.superArmor && (this.isNeutral() || this.state === 'attack');
    }

    setState(s) {
      this.state = s;
      this.st = 0;
      if (s !== 'attack' && s !== 'special') { this.spin = null; }
      if (s !== 'bossmove') this.vanished = false;
    }
    setAnim(keys) {
      A.copyPose(this.entryPose, this.pose);
      this.entryPose.rot = Math.atan2(Math.sin(this.entryPose.rot), Math.cos(this.entryPose.rot));
      this.animKeys = keys;
      this.mt = 0;
    }
    cancelMove() {
      this.move = null;
      this.animKeys = null;
      this.spin = null;
      this.sp = null;
      this.bm = null;
      this.vanished = false;
    }
    toNeutral() {
      this.cancelMove();
      if (!this.grounded) { this.setState('air'); return; }
      this.setState(this.ctrl.held('down') ? 'crouch' : 'idle');
    }
    startCombo() {
      this.combo.hits = 0;
      this.combo.damage = 0;
      this.combo.seq.length = 0;
      if (this.combo.tags) this.combo.tags.length = 0;
      this.combo.timer = 0;
      this.combo.name = null;
    }
    addEnergy(v) {
      if (this.state === 'special') return;
      this.energy = clamp((this.energy || 0) + v, 0, 100);
    }

    startMove(id) {
      const m = SA.MOVES[id];
      if (!m) return;
      this.moveBonus = m.id === 'backCounter' || (this.state === 'evade' && id === this.moveset.backCounter) ? 1.2 : 1;
      const st0 = this.state;
      this.moveCtx = st0 === 'roll' ? 'roll' : st0 === 'dash' || st0 === 'run' || st0 === 'sprint' || st0 === 'slide' ? 'dash' : null;
      A.copyPose(this.entryPose, this.pose);
      this.entryPose.rot = Math.atan2(Math.sin(this.entryPose.rot), Math.cos(this.entryPose.rot));
      this.move = m;
      this.animKeys = m.keys;
      this.setState('attack');
      this.mt = 0;
      this.spin = m.spin || null;
      this.hitList.clear();
      this.moveContact = null;
      this.lunged = false;
      this.whooshed = false;
      this.fired = false;
      this.effectDone = false;
      this.trail.length = 0;
      if (m.air) this.airAttackUsed = true;
      if (m.reload) SA.audio.play('reload');
    }

    // root motion: move along a mobility curve (see MOB). dir: +1 forward, -1 backward
    startRoot(id, dir, distScale) {
      const M = MOB[id];
      // the hidden mobility meter: a tired fighter still moves, just a little shorter and slower to recover
      const tired = this.mobility < M.cost;
      this.mobility -= M.cost;
      this.mobRest = 0.3;
      this.rm = { M, dir, dist: M.dist * (distScale || 1) * (tired ? 0.82 : 1) * this.speedMul, frames: M.frames };
      if (tired) this.dashCd += 8;
      if (M.invuln) this.invuln = Math.max(this.invuln, M.invuln[1]);
    }
    rootMotion(ts) {
      const r = this.rm;
      if (!r) return 1;
      const u1 = clamp(this.st / r.frames, 0, 1), u0 = clamp((this.st - ts) / r.frames, 0, 1);
      const d = (curveAt(r.M.curve, u1) - curveAt(r.M.curve, u0)) * r.dist;
      this.vx = this.facing * r.dir * d / (SA.STEP * Math.max(ts, 0.001));
      return u1;
    }

    // When the current move may be cancelled. Light / medium: early on contact, late on a whiff.
    // Heavies (power >= 0.8): only after they connected, a little later.
    cancelOpen() {
      const m = this.move;
      const heavy = (m.power || 0.5) >= 0.8;
      if (this.moveContact === 'hit' || this.moveContact === 'block') return this.mt >= m.startup + Math.min(m.active, 3) - 1 + (heavy ? 3 : 0);
      if (heavy) return false;
      return this.mt >= m.startup + m.active + m.recovery * 0.45;
    }

    // Hitbox in world space for the current attack, or null.
    activeHit() {
      if (this.state === 'attack') {
        const m = this.move;
        if (!m || !m.hit || this.phase !== 'active') return null;
        const h = m.hit, s = this.look.scale, S = this.skel;
        if (h.seg) {
          // weapon hitbox: the blade from the hand to the tip (+ a little), padded.
          // near hitbox: arm + hilt, so an enemy standing right in front is never inside a dead zone
          const B = h.seg === 'B';
          const a = S[B ? 'handB' : 'handF'], t = S[B ? 'tipB' : 'tip'];
          const pad = (h.pad || 18) * s;
          const rect = segRect(a.x, a.y, a.x + (t.x - a.x) * 1.08, a.y + (t.y - a.y) * 1.08, pad);
          return { rect, near: clipNear(segRect(S.sh.x, S.sh.y, a.x + (t.x - a.x) * 0.3, a.y + (t.y - a.y) * 0.3, 24 * s), rect), data: m };
        }
        const j = S[h.joint];
        const cx = j.x + h.ox * this.facing * s, cy = j.y + h.oy * s;
        const par = PARENT[h.joint];
        const rect = { x: cx - h.w * s / 2, y: cy - h.h * s / 2, w: h.w * s, h: h.h * s };
        // near hitbox: the whole striking limb (arm / leg) – a point-blank jab lands on the chest
        return { rect, near: par ? clipNear(segRect(S[par].x, S[par].y, j.x, j.y, Math.min(h.w, h.h) * 0.45 * s), rect) : null, data: m };
      }
      if (this.state === 'special' && this.sp) return this.specialHit();
      if (this.state === 'bossmove' && this.bm) return SA.Bosses.moveHit(this);
      return null;
    }

    // ---------- main update ----------
    update(ts, game) {
      const c = this.ctrl;
      const dt = SA.STEP * ts;
      this.prevX = this.x; this.prevY = this.y;
      this.st += ts;
      if (this.invuln > 0) this.invuln -= ts;
      if (this.parryLock > 0) this.parryLock -= ts;
      if (this.dashCd > 0) this.dashCd -= ts;
      if (this.landT > 0) this.landT -= ts;
      if (this.hsLand > 0) this.hsLand -= ts;
      if (this.feintT > 0) this.feintT -= ts;
      if (this.shotCd > 0) this.shotCd -= ts;
      if (this.flowT > 0) this.flowT -= ts;
      if (this.shootT > 0) this.shootT = STUNNED[this.state] || this.state === 'down' ? 0 : this.shootT - ts;
      // hidden mobility meter regenerates after a short rest
      if (this.mobRest > 0) this.mobRest -= dt;
      else if (this.mobility < 100) this.mobility = Math.min(100, this.mobility + MOB_REGEN * dt);
      this.parryAge += ts;
      if (c.consume('block')) {
        this.parryAge = this.parryLock > 0 ? 99 : 0; // mashing block never parries
        this.parryLock = 24;
      }
      if (!this.grounded) this.airTime += dt;
      this.updateStatus(dt, game);
      if (c.has('reload')) { c.consume('reload'); this.tryReload(); }
      if (this.rangedWeapon && !game.fightLocked && c.has('ranged') && this.shotCd <= 0 && this.canShoot()) { c.consume('ranged'); this.shoot(game); }

      if (game.fightLocked && (this.isNeutral() || this.isMoving())) {
        if (this.state !== 'idle') this.setState('idle');
        this.vx = damp(this.vx, 0, 12, dt);
      } else {
        this.updateState(ts, dt, game);
      }

      SA.Physics.integrate(this, dt, game);
      c.tick(ts);
    }

    updateStatus(dt, game) {
      const W = SA.BALANCE.weapons;
      if (this.slowT > 0) this.slowT -= dt;
      if (this.shieldT > 0) this.shieldT -= dt;
      if (this.burnT > 0) {
        this.burnT -= dt;
        this.burnAcc += W.burn.dps * dt;
        if (this.burnAcc >= 4) {
          const d = Math.floor(this.burnAcc);
          this.burnAcc -= d;
          if (this.hp > 1 && !this.infiniteHpLock) this.hp = Math.max(1, this.hp - d);
          SA.FX.burn(game.particles, this.skel.hip.x, this.skel.hip.y - 60);
        }
      }
      this.speedMul = this.baseSpeed * (this.slowT > 0 ? W.frostSlow.factor : 1) * (this.rageSpeed || 1);
      const rs = this.rangedState;
      if (rs) {
        rs.tick(dt);
        if (rs.reloaded) { rs.reloaded = false; SA.audio.play('reload', 1.2); }
      }
    }

    updateState(ts, dt, game) {
      const c = this.ctrl;
      const ms = this.moveset;
      switch (this.state) {
        case 'idle': case 'walk': case 'crouch': case 'block':
          this.updateNeutral(dt, game);
          break;

        case 'prejump':
          // take-off crouch: 2 frames, keeps the running momentum
          this.vx = damp(this.vx, this.fromRun ? this.vx : 0, 20, dt);
          // up + heavy: cancel the jump into the overhead / uppercut
          if (!this.fromRun && c.consume('heavy')) { this.startMove(ms.heavyUp); break; }
          if (this.st >= 2) this.doJump(game);
          break;

        case 'air': case 'flip':
          this.updateAir(ts, dt, game);
          break;

        case 'airdash': {
          // horizontal burst, gravity paused; attacks come straight out of it
          this.rootMotion(ts);
          this.vy = 0;
          this.spawnGhost(2, true);
          if (this.airActions(game, true)) { this.gravMul = 1; break; }
          if (this.st >= this.rm.frames) { this.gravMul = 1; this.rm = null; this.setState('air'); }
          break;
        }

        case 'landing':
          // short landing recovery after a whiffed air attack; attacks may still cancel it late
          this.stun -= ts;
          this.vx = damp(this.vx, 0, 14, dt);
          // defensive movement (roll / backstep / dash) comes out after 3 frames, attacks only late
          if (this.st >= 3 && (this.tryGesture(game) || this.tryDash(game))) break;
          if (this.stun <= 3 && this.tryAttacks()) break;
          if (this.stun <= 0) this.toNeutral();
          break;

        case 'dash': {
          // second flick during the dash: it becomes the long dash
          if (this.ctrl.consume('gLongF') && this.st < this.rm.frames - 2) {
            this.rm.dist *= 1.65;
            this.rm.frames += 4;
            this.dashCd = this.rm.frames + DASH_CD;
          }
          this.rootMotion(ts);
          this.spawnGhost(this.weapon.element === 'shadow' ? 2 : 3, true);
          if (this.runActions(game)) break;
          if (this.st >= this.rm.frames) {
            this.rm = null;
            if (this.fwdHeld()) { this.fwdT = Math.max(this.fwdT, RUN_AFTER); this.setState(this.moveTier() === 'sprint' ? 'sprint' : 'run'); }
            else this.setState('idle');
          }
          break;
        }

        case 'slide': {
          // low, fast slide out of a run: under high attacks and projectiles
          const u = this.rootMotion(ts);
          if (Math.floor(this.st) % 3 === 0 && this.st % 1 < ts) SA.FX.dust(game.particles, this.x, this.y, 0.45, -this.facing);
          if (this.st >= 3) {
            if (c.consume('light') || c.consume('kick')) { this.startMove(ms.slide); break; }       // slide attack (low sweep)
            if (c.consume('heavy')) { c.consume('up'); this.startMove(ms.heavyUp); break; }         // slide -> uppercut
            if (c.consume('up')) { this.rm = null; this.startPrejump(true); break; }                   // slide -> jump / flip
            if (this.hasJumpGesture()) { this.rm = null; this.tryGesture(game); break; }
          }
          if (u >= 1) { this.rm = null; this.toNeutral(); }
          break;
        }

        case 'run': case 'sprint': {
          if (!this.fwdHeld()) {
            // stop: a short skid keeps a little momentum, controls stay live
            SA.FX.dust(game.particles, this.x + this.facing * 20, this.y, this.state === 'sprint' ? 0.8 : 0.5, this.facing);
            this.vx *= 0.55;
            this.fwdT = 0;
            if (this.backHeld()) this.turnT = 6;   // reversing out of a run: pivot / foot slide
            this.setState(c.held('down') ? 'crouch' : 'idle');
            break;
          }
          this.fwdT += ts;
          // run + down = slide (a ↘ / ↙ roll gesture wins)
          if (this.hasMoveGesture() || this.hasJumpGesture()) { if (this.tryGesture(game)) break; }
          if (c.held('down') && this.st >= 2 && !this.hasMoveGesture()) { this.startSlide(game); break; }
          const tier = this.moveTier();
          if (tier === 'walk') { this.setState('walk'); break; }
          if (tier !== this.state) this.setState(tier);
          const sp = (tier === 'sprint' ? SPRINT_SPEED : RUN_SPEED) * this.speedMul;
          this.vx = damp(this.vx, this.facing * sp, ACCEL * 0.7, dt);
          if (tier === 'sprint') this.spawnGhost(4);
          if (this.runActions(game)) break;
          break;
        }

        case 'roll': {
          // tucked roll: passes through the enemy body and under high attacks, short vulnerable end
          const R = ROLL;
          const u = this.rootMotion(ts);
          if (Math.floor(this.st) % 5 === 0 && this.st % 1 < ts) SA.FX.dust(game.particles, this.x, this.y, 0.4, -this.facing * this.rollDir);
          // never come out of a roll inside the opponent: keep passing through until clear
          const o = game.p1 === this ? game.p2 : game.p1;
          if (o && this.st >= this.rollThrough - 1 && this.st < R.frames + 8 && Math.abs(o.x - this.x) < SA.Physics.minDistance(this, o)) {
            this.rollThrough = this.st + 2;
            if (u >= 0.66) this.vx = this.facing * this.rollDir * 420 * this.speedMul;
          }
          // attack roll: light = low slash / jab, kick = low kick, heavy = rising launcher out of the roll
          if (this.st >= 13 && this.st >= this.rollThrough - 2) {
            if (c.consume('light')) { this.rm = null; this.startMove(ms.lightDown); break; }
            if (c.consume('kick')) { this.rm = null; this.startMove(ms.kickDown); break; }
            if (c.consume('heavy')) { this.rm = null; this.startMove(ms.heavyUp); break; }
          }
          if (this.st >= R.frames && this.st >= this.rollThrough) {
            this.vx *= 0.3; this.rm = null; this.toNeutral();
            // a jump pressed during the roll's end comes out on the very next frame
            if (c.consume('up')) this.startPrejump(false);
            else this.tryGesture(game);
          }
          break;
        }

        case 'evade':
          // backstep: short defensive hop back; heavy right after it = backstep counter, jump = backflip
          this.rootMotion(ts);
          this.spawnGhost(3);
          if (c.consume('gLongB')) { this.rm = null; this.dashCd = 0; this.startFlip('hand', game); break; }   // second flick: flik-flak
          if (this.st >= 3 && (c.consume('up') || c.consume('gFlipB'))) { this.rm = null; this.startFlip('back', game); break; }
          if (this.st >= 5 && c.consume('heavy')) { this.rm = null; this.startMove(this.moveset.backCounter); break; }
          if (this.st >= 9 && this.tryAttacks()) { this.rm = null; break; }
          if (this.st >= this.rm.frames) { this.rm = null; this.toNeutral(); }
          break;

        case 'attack':
          this.updateAttack(ts, dt, game);
          break;

        case 'special':
          this.updateSpecial(ts, dt, game);
          break;

        case 'bossmove':
          SA.Bosses.updateMove(this, ts, dt, game);
          break;

        case 'hitstun':
          this.stun -= ts;
          if (this.grounded) this.vx = damp(this.vx, 0, 7, dt);
          if (this.stun <= 0) this.toNeutral();
          break;

        case 'blockstun':
          this.crouchBlock = c.held('down');
          this.stun -= ts;
          this.vx = damp(this.vx, 0, 8, dt);
          if (this.stun <= 0) {
            if (c.held('block')) this.setState('block');
            else this.toNeutral();
          }
          break;

        case 'stagger':
          this.stun -= ts;
          this.vx = damp(this.vx, 0, 6, dt);
          if (this.stun <= 0) this.toNeutral();
          break;

        case 'launched':
          break;

        case 'down':
          this.vx = damp(this.vx, 0, 8, dt);
          if (this.hp <= 0) break;
          if (this.st >= 42 || (this.st >= 14 && (c.consume('up') || c.consume('dash')))) {
            this.setState('getup');
            this.invuln = 28;
            this.juggle = 0;
          }
          break;

        case 'getup':
          this.vx = 0;
          if (this.st >= 24) { this.juggle = 0; this.toNeutral(); }
          break;

        case 'rushed':
          this.vx = 0; this.vy = 0;
          break;

        case 'ko': case 'victory': case 'defeat': case 'intro':
          this.vx = damp(this.vx, 0, 8, dt);
          break;
      }
    }

    updateNeutral(dt, game) {
      const c = this.ctrl;
      const down = c.held('down'), fwd = this.fwdHeld(), back = this.backHeld();
      if (!fwd) this.fwdT = 0;
      if (this.hsLand > 0 && this.ctrl.consume('heavy')) { this.hsLand = 0; this.startMove(this.moveset.backCounter); return; }
      if (this.tryAttacks()) return;
      if (this.tryGesture(game)) return;
      if (this.tryDash(game)) return;
      if (c.consume('up')) { this.startPrejump(false); return; }
      if (c.held('block')) {
        if (this.state !== 'block') this.setState('block');
        this.crouchBlock = down;
        this.vx = damp(this.vx, 0, 25, dt);
        return;
      }
      if (down) {
        if (this.state !== 'crouch') this.setState('crouch');
        this.vx = damp(this.vx, 0, 25, dt);
      } else if (fwd || back) {
        const dir = fwd ? 1 : -1;
        if (fwd) {
          this.fwdT += dt * 60;
          const tier = this.moveTier();
          if (tier !== 'walk') {
            this.setState(tier);
            this.vx = damp(this.vx, this.facing * (tier === 'sprint' ? SPRINT_SPEED : RUN_SPEED) * this.speedMul, ACCEL, dt);
            return;
          }
        }
        // quick reversal: short pivot / foot slide (visual only)
        if (this.state === 'walk' && this.walkDir !== dir && Math.abs(this.vx) > 150) {
          this.turnT = 5;
          SA.FX.dust(game.particles, this.x, this.y, 0.35, -dir * this.facing);
        }
        if (this.state !== 'walk') this.setState('walk');
        this.walkDir = dir;
        // stick: walking speed follows the deflection inside the walk zone
        const a = c.stick || c.analog < 1 ? clamp((c.analog - SA.Stick.DEAD) / (SA.Stick.WALK - SA.Stick.DEAD), 0, 1) : 1;
        const speed = (dir > 0 ? WALK_FWD : WALK_BACK) * this.speedMul * lerp(0.55, 1, a);
        this.vx = damp(this.vx, this.facing * dir * speed, ACCEL, dt);
      } else {
        if (this.state !== 'idle') this.setState('idle');
        this.vx = damp(this.vx, 0, DECEL, dt);
      }
    }

    // Attack inputs from neutral. Held directions turn buttons into context attacks.
    tryAttacks() {
      const c = this.ctrl, ms = this.moveset;
      const down = c.held('down'), up = c.held('up');
      if (c.has('special')) {
        c.consume('special');
        if (this.energy >= 100) { this.startSpecial(); return true; }
        SA.audio.play('denied');
      }
      // directions: held now or held when the button was pressed (input buffer)
      const fwdName = this.facing > 0 ? 'right' : 'left';
      if (c.consume('light')) { this.startMove(down || c.dirHeld('down') ? ms.lightDown : ms.light); return true; }
      if (c.consume('heavy')) {
        const d = down || c.dirHeld('down'), u = up || c.dirHeld('up');
        if (u && !d) c.consume('up');
        this.startMove(d ? ms.heavyDown : u ? ms.heavyUp : c.dirHeld(fwdName) ? ms.heavyFwd : ms.heavy);
        return true;
      }
      if (c.consume('kick')) { this.startMove(down || c.dirHeld('down') ? ms.kickDown : ms.kick); return true; }
      return false;
    }

    // Sidearm. Fires on top of the current action: running, dashing, rolling out, mid-flip (the salto
    // shot keeps spinning), falling (down = aimed down, the recoil holds the fall for a moment).
    canShoot() {
      const st = this.state;
      if (st === 'attack') {
        const m = this.move;
        if (!m || m.ranged || m.reload) return false;
        const done = this.cancelOpen() || (m.air && this.mt >= m.startup + m.active);
        if (!done) return false;
        this.cancelMove();
        if (this.grounded) this.toNeutral(); else this.setState('air');
        return true;
      }
      if (!SHOOT_OK[st]) return false;
      if (st === 'roll' && this.st < 12) return false;
      if (st === 'flip' && this.flip && this.flip.kind === 'hand' && this.st < 9) return false;   // hands on the floor
      return true;
    }
    shoot(game) {
      const r = this.rangedWeapon, rs = this.rangedState, c = this.ctrl;
      if (!rs.ready()) {
        if (r.magazine) rs.startReload();
        SA.audio.play('empty', 0.6);
        this.shotCd = 8;
        return false;
      }
      rs.use();
      if (r.proj.returns) rs.out = true;
      const air = !this.grounded;
      const o = game.p1 === this ? game.p2 : game.p1;
      let aim = 0;
      if (air && c.held('down')) aim = 0.85;            // falling shot
      else if (c.held('up')) aim = -0.45;               // anti-air
      else if (o) {
        // light aim assist toward the opponent's chest (platform height differences)
        const dy = (o.y - 120 * o.look.scale) - (this.y - 150 * this.look.scale);
        aim = clamp(Math.atan2(dy, Math.max(120, Math.abs(o.x - this.x))), -0.32, 0.32);
      }
      this.shotHand = r.dual ? 1 - (this.shotHand || 0) : 1;
      game.projectiles.fire(this, r, game, aim);
      this.shootAim = aim;
      this.shootT = this.shootMax = 14;
      this.shotCd = r.rate || Math.max(7, Math.round((r.startup + r.recovery) * 0.6));
      const rec = r.recoil || (r.kind === 'gun' ? 100 : 40);
      if (air) {
        this.vx -= this.facing * rec * 0.55 * Math.cos(aim);
        if (aim > 0.3) { this.vy = Math.min(this.vy, 0) - 160 - rec * 0.5; this.fastFall = false; }   // shooting down pushes up
        else if (this.vy > 0) this.vy *= 0.6;                                                          // a short air stall
      } else {
        this.vx -= this.facing * rec * 0.6;
      }
      this.shotFlash = 3;
      return true;
    }
    tryRanged() { return false; }   // kept for callers of the old API: shots go through shoot()
    tryReload() {
      const rs = this.rangedState;
      if (rs && this.rangedWeapon.magazine) rs.startReload();
      return false;
    }

    // Attacks out of dash / run / sprint: dash attacks, running attack, slide (down + attack), leap.
    runActions(game) {
      const c = this.ctrl, ms = this.moveset;
      const dash = this.state === 'dash', down = c.held('down');
      if (c.consume('light')) { this.startMove(down ? ms.slide : dash ? ms.dashLight : ms.runLight); return true; }
      if (c.consume('kick')) { this.startMove(down || dash ? ms.dashHeavy : ms.runLight); return true; }
      if (c.consume('heavy')) { this.startMove(down ? ms.slide : dash ? ms.dashHeavy : ms.heavyFwd); return true; }
      if (c.has('special') && this.energy >= 100) { c.consume('special'); this.startSpecial(); return true; }
      if (c.consume('up')) { this.rm = null; this.startPrejump(true); return true; }
      if (this.hasJumpGesture() || (!dash && this.hasMoveGesture())) {
        const rm = this.rm;
        this.rm = null;
        if (this.tryGesture(game)) return true;
        this.rm = rm;
      }
      if (!dash && this.tryDash(game)) return true;
      if (dash && down && this.st >= 3) { this.rm = null; this.startSlide(game); return true; }
      if (c.held('block')) { this.setState('block'); this.crouchBlock = down; this.vx *= 0.4; return true; }
      return false;
    }

    // dash button: down = roll, forward = dash, otherwise backstep. Small cooldown against spamming;
    // a press during the cooldown stays buffered and fires as soon as it ends.
    // dash button: down = combat roll, forward = dash, back = handspring (flik-flak), neutral = backstep.
    // A double tap on left / right ('step') is a quick dash forward / backstep back.
    // Small cooldown against spamming; a press during the cooldown stays buffered.
    tryDash(game) {
      const c = this.ctrl;
      const step = c.has('step');
      if ((!c.has('dash') && !step) || this.dashCd > 0) return false;
      if (step) c.consume('step'); else c.consume('dash');
      if (c.held('down')) this.startRoll(game, this.backHeld() ? -1 : 1);
      else if (this.fwdHeld()) this.startDash(game);
      else if (this.backHeld() && !step && this.grounded) this.startFlip('hand', game);
      else this.startEvade(game);
      return true;
    }

    // Joystick gestures (src/touch.js), already resolved relative to the opponent (F = toward).
    // ground: up = spin jump, ↗/↖ = front flip / backflip, ↘/↙ = roll, flick = dash / backstep,
    // double flick = long dash / handspring. air: flick = air dash, down = fast fall.
    tryGesture(game) {
      const c = this.ctrl;
      if (!this.grounded) {
        if (c.consume('gDown')) { this.fastFallStart(game); return false; }
        const fa = c.has('gDashF') || c.has('gLongF') ? 1 : c.has('gDashB') || c.has('gLongB') ? -1 : 0;
        if (fa && !this.airDashUsed && this.dashCd <= 0) {
          c.consume('gDashF'); c.consume('gLongF'); c.consume('gDashB'); c.consume('gLongB');
          this.startAirDash(fa);
          return true;
        }
        return false;
      }
      if (c.consume('gJump')) { this.startPrejump(false, 'spin'); return true; }
      if (c.consume('gFlipF')) { this.startPrejump(true, 'front'); return true; }
      if (c.consume('gFlipB')) { this.startPrejump(false, 'back'); return true; }
      // down on a platform: drop through it (on the main floor: crouch only)
      if (c.consume('gDown') && this.plat) { this.dropT = 12; return true; }
      // the second half of a double flick may follow its own dash / backstep right away
      if (c.consume('gLongF')) { this.startDash(game, 1.5); return true; }
      if (c.consume('gLongB')) { this.startFlip('hand', game); return true; }
      if (this.dashCd > 0) return false;   // rolls / dashes stay buffered until the cooldown ends
      if (c.consume('gRollF')) { this.startRoll(game, 1); return true; }
      if (c.consume('gRollB')) { this.startRoll(game, -1); return true; }
      if (c.consume('gDashF')) { this.startDash(game); return true; }
      if (c.consume('gDashB')) { this.startEvade(game); return true; }
      return false;
    }
    hasMoveGesture() {
      const c = this.ctrl;
      return c.has('gRollF') || c.has('gRollB') || c.has('gDashF') || c.has('gDashB') || c.has('gLongF') || c.has('gLongB');
    }
    hasJumpGesture() {
      const c = this.ctrl;
      return c.has('gJump') || c.has('gFlipF') || c.has('gFlipB');
    }
    fastFallStart(game) {
      if (this.vy < -200 && this.state === 'flip' && this.st < 8) return;   // not during the take-off
      this.fastFall = true;
      this.vy = Math.max(this.vy, FAST_FALL * 0.75);
      this.dropT = 14;   // falls through one-way platforms for a moment
      SA.audio.play('whoosh_light', 0.6);
    }
    startAirDash(dir) {
      this.airDashUsed = true;
      this.flip = null;
      this.cancelMove();
      this.setState('airdash');
      this.startRoot('airdash', dir);
      this.gravMul = 0;
      this.vy = 0;
      this.fastFall = false;
      this.dashCd = this.rm.frames + DASH_CD;
      SA.audio.play('dash', 1.1);
      SA.audio.play('wind', 0.4);
    }

    startDash(game, distScale) {
      this.setState('dash');
      this.startRoot('dash', 1, distScale);
      this.dashCd = this.rm.frames + DASH_CD;
      SA.audio.play('dash');
      SA.FX.dust(game.particles, this.x - this.facing * 20, this.y, 0.7, -this.facing);
      SA.FX.sandTrail(game.particles, this.x - this.facing * 40, -10, -this.facing, '#cfae78');
    }

    startRoll(game, dir) {
      this.setState('roll');
      this.rollDir = dir;
      this.startRoot('roll', dir);
      this.rollThrough = ROLL.through;
      this.dashCd = ROLL.frames + DASH_CD;
      SA.audio.play('dash', 0.8);
      SA.FX.dust(game.particles, this.x, this.y, 0.6, -this.facing * dir);
    }

    startEvade(game) {
      this.setState('evade');
      this.startRoot('backstep', -1);
      this.dashCd = this.rm.frames + DASH_CD;
      SA.audio.play('dash');
      SA.FX.dust(game.particles, this.x + this.facing * 10, this.y, 0.6, this.facing);
    }

    startSlide(game) {
      this.setState('slide');
      // the slide inherits the run: faster runs slide further
      this.startRoot('slide', 1, clamp(Math.abs(this.vx) / RUN_SPEED, 0.75, 1.3));
      this.dashCd = Math.max(this.dashCd, 10);
      SA.audio.play('dash', 0.7);
      SA.FX.dust(game.particles, this.x, this.y, 0.8, -this.facing);
    }

    // front flip / backflip / handspring: real jumps (physics) with an acrobatic body rotation
    startFlip(kind, game) {
      const F = FLIPS[kind];
      if (this.mobility < F.cost) this.dashCd += 6;
      this.mobility -= F.cost;
      this.mobRest = 0.3;
      this.cancelMove();
      this.setState('flip');
      this.flip = { kind, F };
      this.grounded = false;
      this.plat = null;
      this.y -= 1;
      this.vy = F.vy;
      const sd = F.steer ? (this.fwdHeld() ? 1 : this.backHeld() ? -1 : 0) : 0;
      this.vx = this.facing * (F.steer ? sd * JUMP_VX : F.vx) * this.speedMul;
      this.gravMul = F.grav;
      this.fastFall = false;
      this.airAttackUsed = false; this.diveUsed = false;
      this.airWhiff = false;
      this.airDashUsed = kind === 'hand';
      this.airTime = 0;
      this.jumpDir = F.steer ? sd : F.dir;
      if (F.invuln) this.invuln = Math.max(this.invuln, F.invuln[1]);
      if (kind === 'hand') this.dashCd = Math.max(this.dashCd, 22 + DASH_CD);
      this.scaleY = 1.12; this.scaleX = 0.92;
      SA.audio.play(kind === 'hand' ? 'dash' : 'jump', 1.1);
      SA.audio.play('whoosh_medium', 0.7);
      SA.FX.dust(game.particles, this.x, this.y, 0.6, -this.facing * F.dir);
    }

    // air: steering, air attacks (light / kick / heavy, down + heavy = dive), air throw, one air dash
    updateAir(ts, dt, game) {
      const flip = this.state === 'flip' ? this.flip : null;
      // air control: ~40 % of ground control; flips steer even less
      const steer = this.fwdHeld() ? 1 : this.backHeld() ? -1 : 0;
      const k = flip ? 0.5 : 1;
      if (steer) {
        const lim = Math.max(AIR_MAX, Math.abs(this.vx));
        this.vx = clamp(this.vx + this.facing * steer * AIR_STEER * k * dt, -lim, lim);
      }
      // ↗ again right after a front flip's take-off: the flip becomes a long flip leap
      if (flip && flip.kind === 'front' && this.st < 9 && this.ctrl.consume('gFlipF')) {
        const L = FLIPS.leap;
        this.flip = { kind: 'leap', F: L };
        this.vy = Math.min(this.vy, L.vy * 0.9);
        this.vx = this.facing * L.vx * this.speedMul;
        this.gravMul = L.grav;
        SA.audio.play('whoosh_medium', 0.8);
      }
      if (flip && flip.kind === 'hand' && this.st < flip.F.rotFrames) return;   // committed until the hands leave the floor
      if (flip && this.st < flip.F.atkFrom) return;
      if (this.airActions(game, false)) return;
      // flip finished: normal air state (the body opens up, attacks stay available)
      if (flip && this.st >= flip.F.rotFrames + 4) { this.setState('air'); this.flip = null; }
    }

    airActions(game, fromDash) {
      const c = this.ctrl, ms = this.moveset;
      if (!fromDash && this.tryGesture(game)) return true;
      // one air attack per jump, plus one falling attack (down + attack) after it
      const down = c.held('down');
      if (!this.airAttackUsed || (down && !this.diveUsed && this.airTime > 0.12)) {
        const fromFlip = this.state === 'flip';
        let id = null;
        // down + any attack = falling attack: light = falling slash, kick = dive kick, heavy = crescent dive
        if (c.consume('light')) id = ms.airLight;
        else if (c.consume('kick')) id = ms.airKick;
        else if (c.consume('heavy')) id = ms.airHeavy;
        if (id) {
          const dive = down;
          // a flip slash keeps rotating: remember where the flip's rotation is (in its own direction)
          let r0 = this.pose.rot;
          const fd = fromFlip && this.flip ? this.flip.F.dir : 0;
          if (fd) { while (r0 * fd < 0) r0 += fd * SA.TAU; }
          this.startMove(id);
          this.flipAtk = fd;
          this.flipRot0 = r0;
          if (dive) {
            // dive attack: steep drop onto the opponent (heavy = straight down, the others angled)
            this.dive = id === ms.airHeavy ? 'heavy' : 'light';
            this.diveUsed = true;
            this.vy = Math.max(this.vy, this.dive === 'heavy' ? 1650 : 1450);
            this.vx = this.facing * (this.dive === 'heavy' ? 320 : 720) * this.speedMul;
            // steer the dive onto an opponent below / ahead (touch-friendly falling attacks)
            const o = game.p1 === this ? game.p2 : game.p1;
            if (o && Math.abs(o.x - this.x) < 520 && o.y > this.y + 40) {
              const t = (o.y - this.y) / 1750 + 0.04;
              if (Math.abs(o.x - this.x) > 30) this.facing = Math.sign(o.x - this.x);   // crossed over: turn into the dive
              this.vx = clamp((o.x - this.x) / t, -780, 780);
            }
            this.gravMul = 1;
            this.flipAtk = 0;
          }
          if (fromDash) this.moveBonus = 1.1;
          return true;
        }
      }
      // air dash (down + dash stays buffered: it is a roll on landing)
      if (!fromDash && !this.airDashUsed && this.dashCd <= 0 && !c.held('down') && (c.has('dash') || c.has('step'))) {
        c.consume('dash'); c.consume('step');
        this.startAirDash(this.backHeld() ? -1 : 1);
        return true;
      }
      return false;
    }

    startPrejump(fromRun, kind) {
      this.fromRun = fromRun;
      this.jumpKind = kind || null;
      // the direction is taken when jump is pressed (a quick back+up tap is still a backflip)
      this.jumpIntent = this.fwdHeld() ? 1 : this.backHeld() ? -1 : 0;
      this.setState('prejump');
      this.scaleY = 0.9; this.scaleX = 1.06;
    }

    doJump(game) {
      const dir = this.fwdHeld() ? 1 : this.backHeld() ? -1 : this.jumpIntent || 0;
      // joystick gestures pick the jump directly (spin jump / front flip / backflip)
      if (this.jumpKind) { const k = this.jumpKind; this.jumpKind = null; this.startFlip(k, game); return; }
      // run / dash / slide + jump = front flip, back + jump = backflip
      if (this.fromRun) { this.startFlip('front', game); return; }
      if (dir < 0) { this.startFlip('back', game); return; }
      this.airDashUsed = false;
      this.airWhiff = false;
      this.gravMul = 1;
      this.jumpDir = dir;
      // neutral / forward jump (run + jump = front flip, back + jump = backflip, see above)
      this.vy = JUMP_VY;
      this.vx = dir * this.facing * JUMP_VX * this.speedMul;
      this.grounded = false;
      this.plat = null;
      this.y -= 1;
      this.airAttackUsed = false; this.diveUsed = false;
      this.airTime = 0;
      this.setState('air');
      this.scaleY = 1.12; this.scaleX = 0.92;
      SA.audio.play('jump');
      SA.FX.dust(game.particles, this.x, this.y, 0.5, 0);
    }

    updateAttack(ts, dt, game) {
      const m = this.move, c = this.ctrl;
      this.mt += ts;
      if (m.air && !this.grounded && !this.dive && c.consume('gDown')) this.fastFallStart(game);
      if (m.lunge && !this.lunged && this.mt >= m.lunge[0]) {
        this.lunged = true;
        if (this.grounded) {
          const v = this.facing * m.lunge[1] * this.speedMul;
          if (Math.sign(this.vx) !== Math.sign(v) || Math.abs(this.vx) < Math.abs(v)) this.vx = v;
        }
      }
      if (!this.whooshed && m.whoosh && this.mt >= m.startup - 3) {
        this.whooshed = true;
        SA.audio.play('whoosh_' + m.whoosh);
      }
      // ranged: spawn the projectile on the release frame
      if (m.ranged && !this.fired && this.mt >= m.startup) {
        this.fired = true;
        const rs = this.rangedState;
        if (rs && rs.ready()) {
          rs.use();
          if (this.rangedWeapon.proj.returns) rs.out = true;
          game.projectiles.fire(this, this.rangedWeapon, game);
        }
      }
      if (m.reload && this.mt >= m.total - 1 && !this.fired) {
        this.fired = true;
        if (this.rangedState) this.rangedState.ammo = this.rangedWeapon.magazine;
        SA.audio.play('reload', 1.3);
      }
      // weapon effects (hammer slam shockwave)
      if (m.effect === 'shockwave' && !this.effectDone && this.mt >= m.startup) {
        this.effectDone = true;
        const tip = this.skel.tip;
        game.projectiles.shockwave(this, tip.x, this.facing, { dmg: Math.round(34 * (this.damageMul || 1)), color: this.weapon.element === 'shock' ? '#9fd0ff' : '#ffcf8a' });
        SA.FX.dust(game.particles, tip.x, this.y, 1.2, 0);
        game.shake(0.3);
        SA.audio.play('boss_impact', 0.6);
      }
      if (m.armor && this.mt >= m.armor[0] && this.mt <= m.armor[1] && Math.floor(this.mt) % 4 === 0) {
        SA.FX.aura(game.particles, this.x, this.y, '#c9d3e0');
      }
      if (this.grounded) this.vx = damp(this.vx, 0, m.friction || 9, dt);

      // a hit may always be cancelled into movement (dash / roll / backstep), a block only off cooldown
      if (this.moveContact && this.grounded && ((m.power || 0.5) < 0.8 || this.moveContact === 'hit') && !m.ranged &&
          (this.dashCd <= 0 || this.moveContact === 'hit') && this.mt >= m.startup && (c.has('dash') || c.has('step') || this.hasMoveGesture())) {
        this.cancelMove();
        this.dashCd = 0;
        if (!this.tryGesture(game)) this.tryDash(game);
        return;
      }
      // ATTACK double tap: a heavy pressed right after a whiffing light cancels it into the context heavy
      if (!this.moveContact && (m.power || 0.5) < 0.62 && !m.ranged && !m.reload && this.mt <= m.startup + m.active + 8 && c.tapHeavy > 0 && c.has('heavy')) {
        c.tapHeavy = 0;
        const ms = this.moveset;
        const run = m.id === ms.dashLight || m.id === ms.runLight;
        if (!this.grounded && m.air) {
          c.consume('heavy');
          this.cancelMove();
          this.startMove(ms.airHeavy);
          if (c.held('down')) { this.dive = 'heavy'; this.vy = Math.max(this.vy, 1650); this.vx = this.facing * 320 * this.speedMul; this.gravMul = 1; }
          return;
        }
        if (this.grounded) {
          if (run) { c.consume('heavy'); this.startMove(ms.dashHeavy); return; }
          this.cancelMove();
          if (this.tryAttacks()) return;
        }
      }
      if (m.chain && this.cancelOpen()) {
        for (const key in m.chain) {
          if (c.consume(key)) {
            // down + light inside a string still gives the low variant for fists
            this.startMove(m.chain[key]);
            return;
          }
        }
      }
      // light / medium attacks that connected can be cancelled into a dash or backstep
      if (this.moveContact === 'hit' && this.energy >= 100 && c.has('special')) {
        c.consume('special');
        this.startSpecial();
        return;
      }
      // ---- cancel windows (see cancelOpen): movement and combat flow into each other ----
      if (this.grounded && !m.ranged && !m.reload && this.cancelOpen()) {
        const light = (m.power || 0.5) < 0.62;
        // light attacks cancel into any other attack (directional heavies, kicks, lows)
        if (light && this.tryAttacks()) return;
        // jump cancel: after a hit (launchers!) or from a light attack's window -> air combo
        if ((light || this.moveContact === 'hit') && c.has('up')) {
          c.consume('up');
          this.cancelMove();
          this.startPrejump(false);
          return;
        }
        if ((light || this.moveContact === 'hit') && this.hasJumpGesture()) {
          this.cancelMove();
          this.tryGesture(game);
          return;
        }
        // movement out of a light attack's late window (whiff): roll / dash / backstep gestures
        if (light && this.hasMoveGesture() && this.dashCd <= 0) {
          this.cancelMove();
          this.tryGesture(game);
          return;
        }
      }
      if (m.air && !this.grounded && this.mt >= m.total) {
        // air attack finished: keep falling in the air state (no pose snap), flips end here too
        this.airWhiff = !this.moveContact;
        this.cancelMove();
        this.flipAtk = 0;
        this.setState('air');
        return;
      }
      if (this.mt >= m.total && (!m.air || this.grounded)) this.toNeutral();
    }

    onLand(game, impactVy) {
      this.grounded = true;
      this.fastFall = false;
      this.vy = 0;
      this.dropT = 0;
      this.airTime = 0;
      switch (this.state) {
        case 'air': {
          // a whiffed jump attack still costs a short landing recovery (no jump-attack mashing)
          if (this.airWhiff) {
            this.airWhiff = false;
            this.stun = 8; this.landT = 10;
            this.scaleY = 0.84; this.scaleX = 1.1;
            SA.FX.dust(game.particles, this.x, this.y, 0.5, 0);
            this.setState('landing');
            break;
          }
          // no input lock on a normal landing: knee bend + squash are purely visual
          const hard = impactVy > 1700;
          this.scaleY = hard ? 0.78 : 0.86; this.scaleX = hard ? 1.14 : 1.08;
          this.landT = hard ? 12 : 8;
          SA.FX.dust(game.particles, this.x, this.y, hard ? 1 : 0.5, 0);
          SA.audio.play('land', hard ? 0.7 : 0.4);
          if (hard) game.shake(0.12);
          this.toNeutral();
          break;
        }
        case 'flip': case 'airdash': {
          const hand = this.flip && this.flip.kind === 'hand';
          this.flip = null; this.rm = null; this.gravMul = 1;
          this.scaleY = 0.84; this.scaleX = 1.1;
          this.landT = hand ? 6 : 9;
          SA.FX.dust(game.particles, this.x, this.y, 0.6, 0);
          SA.audio.play('land', 0.5);
          // a handspring lands ready to counter: heavy right after it = backstep counter
          if (hand) this.hsLand = 12;
          this.toNeutral();
          break;
        }
        case 'attack': {
          const dive = this.dive;
          this.dive = false; this.flipAtk = 0; this.gravMul = 1;
          this.scaleY = 0.84; this.scaleX = 1.1;
          this.landT = 10;
          SA.FX.dust(game.particles, this.x, this.y, dive ? 1.2 : 0.5, 0);
          if (dive) this.diveImpact(game, dive === 'heavy');
          this.cancelMove();
          if (this.moveContact) {
            // a jump attack that connected flows straight into the ground game (landing sweep, dash …)
            this.setState(this.ctrl.held('down') ? 'crouch' : 'idle');
          } else {
            // a whiffed jump attack is punishable on landing
            this.stun = dive ? 12 : 8;
            this.setState('landing');
          }
          break;
        }
        case 'launched':
          this.gravMul = 1;
          if (!this.bounced && impactVy > 850) {
            this.bounced = true;
            this.grounded = false;
            this.vy = -impactVy * 0.32;
            this.plat = null;
            this.y -= 1;
            this.vx *= 0.6;
            SA.FX.dust(game.particles, this.x, this.y, 1.2, 0);
            SA.audio.play('knockdown', 0.9);
            game.shake(0.25);
          } else {
            this.setState(this.hp <= 0 ? 'ko' : 'down');
            this.vx *= 0.35;
            SA.FX.dust(game.particles, this.x, this.y, 0.8, 0);
            SA.audio.play('knockdown', 0.5);
          }
          break;
        case 'special':
          if (this.sp && this.sp.id === 'quake' && this.sp.phase === 'leap') { this.quakeSlam(game); break; }
          this.cancelMove();
          this.setState('landing');
          this.stun = 18;
          SA.FX.dust(game.particles, this.x, this.y, 0.8, 0);
          SA.audio.play('land', 0.7);
          break;
        case 'bossmove':
          SA.Bosses.onLand(this, game);
          break;
        case 'hitstun': case 'stagger':
          this.setState('down');
          break;
      }
    }

    // a dive hitting the floor: impact ring + sand burst; the heavy crescent dive also hits around it
    diveImpact(game, heavy) {
      const x = this.x + this.facing * 30, y = this.y;
      SA.FX.impact(game.particles, x, y, heavy ? 1 : 0.55, this.weapon.element === 'shadow' ? '#b58cff' : '#bfe6ff');
      game.shake(heavy ? 0.42 : 0.2);
      SA.audio.play(heavy ? 'boss_impact' : 'land', heavy ? 0.7 : 0.9);
      if (!heavy) return;
      game.camera.punch(0.05);
      const o = game.p1 === this ? game.p2 : game.p1;
      if (!o || this.hitList.has(o) || !o.grounded || Math.abs(o.y - this.y) > 30 || Math.abs(o.x - x) > 200 * this.look.scale) return;
      if (!o.canBeHit(this)) return;
      DIVE_IMPACT.damage = Math.round(30 * (this.damageMul || 1));
      const hit = { region: 'legs', x: o.x, y: o.y - 40 };
      if (o.state === 'block' && o.crouchBlock) SA.Combat.block(this, o, DIVE_IMPACT, hit, game);
      else SA.Combat.applyHit(this, o, DIVE_IMPACT, hit, game);
    }

    // walked / dashed / rolled off a platform edge, or dropped through it
    leaveGround(game) {
      const st = this.state;
      this.airTime = 0;
      if (NEUTRAL[st] || MOVING[st] || st === 'landing' || st === 'roll' || st === 'slide' || st === 'evade' || st === 'prejump') {
        this.rm = null;
        this.cancelMove();
        this.setState('air');
        this.airAttackUsed = false; this.diveUsed = false;
        this.airDashUsed = false;
        this.airWhiff = false;
        this.gravMul = 1;
        this.jumpDir = 0;
      }
    }

    // ---------- special moves ----------
    startSpecial() {
      this.energy = 0;
      this.cancelMove();
      this.setState('special');
      this.sp = { id: this.specialId, phase: 'charge', t: 0, hits: 0, target: null, side: 0, finished: false };
      this.setAnim([[0, SA.POSES.special], [10, SA.POSES.special]]);
      this.invuln = 12;
      this.hitList.clear();
      this.moveContact = null;
      if (this.game) this.game.onSpecialStart(this);
    }

    updateSpecial(ts, dt, game) {
      const sp = this.sp;
      if (!sp) { this.toNeutral(); return; }
      sp.t += ts;
      this.mt += ts;
      if (sp.id === 'rush') this.updateRush(sp, ts, dt, game);
      else if (sp.id === 'slash') this.updateSlash(sp, ts, dt, game);
      else if (sp.id === 'quake') this.updateQuake(sp, ts, dt, game);
      else this.updateStorm(sp, ts, dt, game);
    }

    updateRush(sp, ts, dt, game) {
      switch (sp.phase) {
        case 'charge':
          this.vx = damp(this.vx, 0, 20, dt);
          if (sp.t >= 10) {
            sp.phase = 'dash'; sp.t = 0;
            this.setAnim([[0, SA.POSES.rushDash]]);
            SA.audio.play('dash', 1.2);
            SA.FX.dust(game.particles, this.x - this.facing * 30, this.y, 1, -this.facing);
          }
          break;
        case 'dash':
          this.vx = this.facing * 2300 * this.speedMul;
          this.spawnGhost(2);
          if (sp.t >= 20) {
            sp.phase = 'whiff'; sp.t = 0;
            this.setAnim([[0, SA.POSES.rushDash], [10, SA.POSES.crouch], [30, SA.POSES.stance]]);
          }
          break;
        case 'rush':
          this.updateRushCombo(sp, game);
          break;
        case 'whiff': case 'blocked':
          this.vx = damp(this.vx, 0, 6, dt);
          if (sp.t >= (sp.phase === 'whiff' ? 32 : 28)) this.toNeutral();
          break;
        case 'end':
          this.vx = damp(this.vx, 0, 8, dt);
          if (sp.t >= 24) this.toNeutral();
          break;
      }
    }

    updateRushCombo(sp, game) {
      const b = sp.target;
      this.vx = 0;
      const TIMES = [5, 12, 19, 26, 33];
      if (sp.hits < TIMES.length && sp.t >= TIMES[sp.hits]) {
        const i = sp.hits;
        let side = i % 2 === 0 ? -sp.side : sp.side;
        let nx = b.x + side * 105;
        if (Math.abs(nx) > SA.WALL) { side = -side; nx = b.x + side * 105; }
        this.spawnGhost(0, true);
        this.x = this.prevX = clamp(nx, -SA.WALL, SA.WALL);
        this.facing = Math.sign(b.x - this.x) || this.facing;
        this.setAnim([[0, RUSH_POSES[i]], [7, RUSH_POSES[i]]]);
        A.copyPose(this.entryPose, RUSH_POSES[i]);
        const hit = { region: 'torso', x: (this.x + b.x) / 2, y: b.y - 170 + (i % 2) * 40 };
        SA.Combat.applyHit(this, b, RUSH_HIT, hit, game, { keepState: true, noScale: true, minHp: 1 });
        b.hitPose = i % 2 ? 'hitHigh' : 'hitBody';
        SA.Anim.lerpPose(b.pose, b.pose, SA.POSES[b.hitPose], 0.7);
        SA.FX.slash(game.particles, hit.x, hit.y, this.facing, this.look.accent);
        sp.hits++;
      }
      if (sp.hits >= TIMES.length && sp.t >= 43 && !sp.finished) {
        sp.finished = true;
        let nx = b.x + sp.side * 115;
        if (Math.abs(nx) > SA.WALL) nx = b.x - sp.side * 115;
        this.spawnGhost(0, true);
        this.x = this.prevX = clamp(nx, -SA.WALL, SA.WALL);
        this.facing = Math.sign(b.x - this.x) || this.facing;
        const kick = SA.MOVES.spinKick.keys[3][1];
        this.setAnim([[0, kick], [12, kick], [24, SA.POSES.stance]]);
        A.copyPose(this.entryPose, kick);
        b.setState('hitstun');
        const hit = { region: 'torso', x: (this.x + b.x) / 2, y: b.y - 200 };
        SA.Combat.applyHit(this, b, RUSH_FINAL, hit, game, { noScale: true });
        game.slowMo(0.3, 0.6);
        game.onSpecialLanded(this);
        sp.phase = 'end';
        sp.t = 0;
      }
    }

    onRushContact(b, result, game) {
      const sp = this.sp;
      if (result === 'block') {
        sp.phase = 'blocked'; sp.t = 0;
        this.vx = -this.facing * 500;
        this.setAnim([[0, SA.POSES.rushDash], [12, SA.POSES.crouch], [28, SA.POSES.stance]]);
        return;
      }
      sp.phase = 'rush'; sp.t = 0; sp.target = b;
      sp.side = Math.sign(this.x - b.x) || -this.facing;
      this.vx = 0;
      b.cancelMove();
      b.setState('rushed');
      b.vx = 0; b.vy = 0;
      game.slowMo(0.55, 0.9);
    }

    updateStorm(sp, ts, dt, game) {
      switch (sp.phase) {
        case 'charge':
          this.vx = damp(this.vx, 0, 20, dt);
          if (sp.t >= 8) {
            sp.phase = 'rise'; sp.t = 0;
            this.grounded = false;
            this.y = -1;
            this.vy = -1500;
            this.vx = this.facing * 380 * this.speedMul;
            this.hitList.clear();
            const up = SA.MOVES.spinKick.keys[3][1];
            this.setAnim([[0, up], [8, up]]);
            this.spin = [0, 8];
            SA.audio.play('whoosh_heavy', 1.2);
            SA.FX.dust(game.particles, this.x, this.y, 1.2, 0);
          }
          break;
        case 'rise':
          this.mt = sp.t % 8;
          this.spawnGhost(3);
          if (sp.t >= 6 * sp.hits && sp.hits < 4) this.hitList.clear();
          if (sp.t > 28) {
            sp.phase = 'fall';
            this.spin = null;
            this.setAnim([[0, SA.POSES.fall], [10, SA.POSES.fall]]);
          }
          break;
        case 'fall':
          break;
      }
    }

    // Shadow Slash: lunging cut that releases a crescent wave.
    updateSlash(sp, ts, dt, game) {
      const tpl = SA.MOVES['katana:a1'].keys;
      switch (sp.phase) {
        case 'charge':
          this.vx = damp(this.vx, 0, 20, dt);
          if (sp.t < 1.1) this.setAnim([[0, SA.POSES.special], [8, tpl[1][1]]]);
          if (sp.t >= 9) {
            sp.phase = 'cut'; sp.t = 0;
            this.setAnim([[0, tpl[1][1]], [3, tpl[2][1]], [10, tpl[3][1]]]);
            this.vx = this.facing * 1500 * this.speedMul;
            SA.audio.play('draw');
          }
          break;
        case 'cut':
          this.vx = damp(this.vx, 0, 6, dt);
          this.spawnGhost(2);
          if (!sp.finished && sp.t >= 3) {
            sp.finished = true;
            const color = this.weapon.element === 'fire' ? '#ff7a2a' : this.weapon.element === 'frost' ? '#8fe3ff' : '#b58cff';
            game.projectiles.wave(this, this.x + this.facing * 90, this.y - 170, this.facing, {
              speed: 1900, w: 130, h: 250, color, life: 0.8,
              data: { damage: Math.round(95 * (this.damageMul || 1)), hitstun: 28, blockstun: 18, kb: 820, kbY: -620, knockdown: true, level: 'mid', unparryable: true, element: this.weapon.element },
            });
            game.shake(0.35);
            SA.audio.play('hit_special', 0.6);
          }
          if (sp.t >= 12) { sp.phase = 'end'; sp.t = 0; this.setAnim([[0, this.pose], [20, SA.POSES.stance]]); }
          break;
        case 'end':
          this.vx = damp(this.vx, 0, 8, dt);
          if (sp.t >= 20) this.toNeutral();
          break;
      }
    }

    // Earthshaker: leap, slam, shockwaves both ways.
    updateQuake(sp, ts, dt, game) {
      switch (sp.phase) {
        case 'charge':
          this.vx = damp(this.vx, 0, 20, dt);
          if (sp.t >= 7) {
            sp.phase = 'leap'; sp.t = 0;
            this.grounded = false;
            this.y = -1;
            this.vy = -1150;
            this.vx = this.facing * 420 * this.speedMul;
            const w = SA.WEAPON_STYLES.heavy && SA.MOVES['war_hammer:hv'];
            this.setAnim([[0, SA.POSES.jump], [10, w ? w.keys[1][1] : SA.POSES.jump]]);
            SA.audio.play('whoosh_heavy', 1.2);
          }
          break;
        case 'leap':
          this.spawnGhost(3);
          if (this.vy > 200 && !sp.falling) {
            sp.falling = true;
            const w = SA.MOVES['war_hammer:hv'];
            if (w) this.setAnim([[0, this.pose], [6, w.keys[2][1]]]);
          }
          break;
        case 'slam':
          this.vx = damp(this.vx, 0, 12, dt);
          if (sp.t >= 26) this.toNeutral();
          break;
      }
    }

    quakeSlam(game) {
      const sp = this.sp;
      sp.phase = 'slam'; sp.t = 0;
      this.hitList.clear();
      const w = SA.MOVES['war_hammer:hv'];
      if (w) this.setAnim([[0, w.keys[2][1]], [8, w.keys[3][1]], [26, SA.POSES.stance]]);
      const color = this.weapon.element === 'shock' ? '#9fd0ff' : '#ffcf8a';
      const dmg = Math.round(46 * (this.damageMul || 1));
      game.projectiles.shockwave(this, this.x + this.facing * 60, this.facing, { dmg, speed: 1100, life: 0.8, color });
      game.projectiles.shockwave(this, this.x - this.facing * 60, -this.facing, { dmg: Math.round(dmg * 0.7), speed: 900, life: 0.6, color });
      SA.FX.dust(game.particles, this.x, this.y, 2, 0);
      SA.FX.ko(game.particles, this.x, -20);
      game.shake(0.8);
      game.camera.punch(0.1);
      SA.audio.play('boss_impact');
      SA.Device.vibrate(this.isPlayer ? 30 : 0);
    }

    specialHit() {
      const sp = this.sp;
      const s = this.look.scale;
      if (sp.id === 'rush' && sp.phase === 'dash') {
        const cx = this.skel.hip.x + this.facing * 70 * s;
        return {
          rect: { x: cx - 80 * s, y: this.y - 270 * s, w: 160 * s, h: 250 * s },
          data: RUSH_DASH,
          onContact: (b, result, game) => this.onRushContact(b, result, game),
        };
      }
      if (sp.id === 'storm' && sp.phase === 'rise' && sp.hits < 4 && sp.t < 28) {
        const cx = this.x + this.facing * 60;
        return {
          rect: { x: cx - 140 * s, y: this.y - 320 * s, w: 280 * s, h: 330 * s },
          data: sp.hits >= 3 ? STORM_FINAL : STORM_HIT,
          onContact: (b, result, game) => {
            sp.hits++;
            if (result === 'hit' && sp.hits >= 4) game.onSpecialLanded(this);
            if (result === 'block') sp.hits = 4;
          },
        };
      }
      if (sp.id === 'quake' && sp.phase === 'slam' && sp.t < 5) {
        return {
          rect: { x: this.x - 190 * s, y: this.y - 200 * s, w: 380 * s, h: 200 * s },
          data: QUAKE_HIT,
          onContact: (b, result, game) => { if (result === 'hit') game.onSpecialLanded(this); },
        };
      }
      return null;
    }

    // Foot planting (IK-light): while a foot has ground contact during idle / walk / run it stays
    // where it was planted; the knee takes half of the correction. The lock releases when the foot
    // lifts or the correction would exceed a few pixels, so gait timing and pose stay in charge.
    footLock() {
      const st = this.state;
      const gait = this.grounded && (st === 'idle' || st === 'walk' || st === 'run' || st === 'sprint' || st === 'crouch' || st === 'block');
      const L = this._lock || (this._lock = { footF: { on: false, x: 0 }, footB: { on: false, x: 0 } });
      const S = this.skel;
      const max = st === 'run' || st === 'sprint' ? 10 : 16;
      for (let fi = 0; fi < 2; fi++) {
        const k = FEET[fi];
        const lk = L[k], foot = S[k];
        const contact = gait && foot.y > this.y - 7 * this.look.scale;
        if (!contact) { lk.on = false; continue; }
        if (!lk.on) { lk.on = true; lk.x = foot.x; continue; }
        let d = lk.x - foot.x;
        if (Math.abs(d) > max) { lk.x = foot.x - Math.sign(d) * max * 0.5; d = lk.x - foot.x; }
        const toe = S[k === 'footF' ? 'toeF' : 'toeB'], knee = S[k === 'footF' ? 'kneeF' : 'kneeB'];
        foot.x += d; toe.x += d; knee.x += d * 0.5;
      }
    }

    // ---------- render interpolation ----------
    // The simulation runs at a fixed 60 Hz; the screen may run at 50–144 Hz with jittery frame times.
    // snapshotRender() stores the pose of the previous tick, beginRender(alpha) temporarily puts the
    // blended pose (previous → current) into skel / x / y, endRender() restores the simulation state.
    snapshotRender() {
      const P = this._rPrev || (this._rPrev = A.createSkeleton());
      for (let i_k = 0, a_k = A.POINTS; i_k < a_k.length; i_k++) { const k = a_k[i_k]; P[k].x = this.skel[k].x; P[k].y = this.skel[k].y; }
      this._rpx = this.x; this._rpy = this.y;
      this._rReady = true;
    }
    beginRender(alpha) {
      // real teleports (vanish / reappear, round reset) are shown as the jump they are
      const lerpOn = this._rReady && alpha < 1 && Math.abs(this.x - this._rpx) < 260 && Math.abs(this.y - this._rpy) < 260;
      // turning: the gameplay facing flips at once, the drawing turns through ~7 frames (x scale
      // passes through a narrow side view) so the figure never mirrors within a single frame
      const turn = this.faceVis !== undefined && this.faceVis !== this.facing ? this.faceVis * this.facing : 1;
      this._rOn = lerpOn || turn !== 1;
      if (!this._rOn) return;
      const C = this._rCur || (this._rCur = A.createSkeleton()), P = this._rPrev, S = this.skel;
      this._rx = this.x; this._ry = this.y;
      if (lerpOn) {
        this.x = this._rpx + (this.x - this._rpx) * alpha;
        this.y = this._rpy + (this.y - this._rpy) * alpha;
      }
      let m = turn;
      if (Math.abs(m) < 0.14) m = m < 0 ? -0.14 : 0.14;
      const cx = this.x;
      for (let i_k = 0, a_k = A.POINTS; i_k < a_k.length; i_k++) { const k = a_k[i_k];
        const sk = S[k], c = C[k];
        c.x = sk.x; c.y = sk.y;
        let x = sk.x, y = sk.y;
        if (lerpOn) { const p = P[k]; x = p.x + (x - p.x) * alpha; y = p.y + (y - p.y) * alpha; }
        if (m !== 1) x = cx + (x - cx) * m;
        sk.x = x; sk.y = y;
      }
      this._rSpin = this.spinScale;
      if (m !== 1) this.spinScale *= m;
    }
    endRender() {
      if (!this._rOn) return;
      const C = this._rCur, S = this.skel;
      for (let i_k = 0, a_k = A.POINTS; i_k < a_k.length; i_k++) { const k = a_k[i_k]; S[k].x = C[k].x; S[k].y = C[k].y; }
      this.x = this._rx; this.y = this._ry;
      this.spinScale = this._rSpin;
      this._rOn = false;
    }

    // ---------- visuals bookkeeping ----------
    // Afterimages: at most 3 at a time, recycled from a small pool (no allocations during combos).
    // interval: spawn every n-th call (0 = every call); force: also on graphics presets without ghosts
    spawnGhost(interval, force) {
      if (SA.GFX && !SA.GFX.ghosts && !force) return;
      this.ghostTimer++;
      if (interval > 0 && this.ghostTimer % interval !== 0) return;
      const pool = this._ghostPool || (this._ghostPool = []);
      let g = this.ghosts.length >= 3 ? this.ghosts.shift() : pool.pop();
      if (!g) { g = { pts: A.createSkeleton(), life: 1, facing: 1 }; }
      for (let i_k = 0, a_k = A.POINTS; i_k < a_k.length; i_k++) { const k = a_k[i_k]; g.pts[k].x = this.skel[k].x; g.pts[k].y = this.skel[k].y; }
      g.life = 1;
      g.facing = this.facing * this.spinScale;
      this.ghosts.push(g);
    }

    updateHurtboxes() {
      const s = this.skel, sc = this.look.scale * (this.look.bulk || 1);
      const hr = 25 * sc;
      const H = this.hurt;
      H.head.x = s.head.x - hr; H.head.y = s.head.y - hr; H.head.w = hr * 2; H.head.h = hr * 2;
      let x0 = Math.min(s.neck.x, s.hip.x, s.sh.x), x1 = Math.max(s.neck.x, s.hip.x, s.sh.x);
      let y0 = Math.min(s.neck.y, s.hip.y), y1 = Math.max(s.neck.y, s.hip.y);
      const pad = 21 * sc;
      H.torso.x = x0 - pad; H.torso.w = x1 - x0 + pad * 2; H.torso.y = y0 - 6; H.torso.h = y1 - y0 + 12;
      x0 = Math.min(s.hip.x, s.kneeF.x, s.kneeB.x, s.footF.x, s.footB.x);
      x1 = Math.max(s.hip.x, s.kneeF.x, s.kneeB.x, s.footF.x, s.footB.x);
      y0 = Math.min(s.hip.y, s.kneeF.y, s.kneeB.y, s.footF.y, s.footB.y) + 6;
      y1 = Math.max(s.hip.y, s.kneeF.y, s.kneeB.y, s.footF.y, s.footB.y) + 4;
      H.legs.x = x0 - 13; H.legs.w = x1 - x0 + 26; H.legs.y = y0; H.legs.h = Math.max(10, y1 - y0);
    }

    // Called after physics & body separation: animate, solve skeleton, update effects.
    postUpdate(ts, game) {
      const dt = SA.STEP * ts;
      A.update(this, ts);
      A.toWorld(this);
      this.footLock();
      this.updateHurtboxes();

      // motion arc: the real path of the weapon tip (and a point down the blade) during the strike
      const m = this.state === 'attack' ? this.move : null;
      if (m && m.hit && this.mt >= m.startup - 2 && this.mt <= m.startup + m.active + 2) {
        const S = this.skel, h = m.hit;
        let tx, ty, bx, by;
        if (h.seg) {
          const hand = S[h.seg === 'B' ? 'handB' : 'handF'], tip = S[h.seg === 'B' ? 'tipB' : 'tip'];
          const k = this.weapon.style === 'spear' ? 0.82 : this.weapon.style === 'heavy' ? 0.55 : 0.45;
          tx = tip.x; ty = tip.y; bx = hand.x + (tip.x - hand.x) * k; by = hand.y + (tip.y - hand.y) * k;
        } else {
          const j = S[h.joint], par = S[PARENT[h.joint] || h.joint];
          tx = j.x; ty = j.y; bx = j.x + (par.x - j.x) * 0.3; by = j.y + (par.y - j.y) * 0.3;
        }
        const pool = this._trailPool || (this._trailPool = []);
        const e = this.trail.length >= 7 ? this.trail.shift() : pool.pop() || {};
        e.x = tx; e.y = ty; e.bx = bx; e.by = by;
        this.trail.push(e);
      } else if (this.trail.length) {
        (this._trailPool || (this._trailPool = [])).push(this.trail.shift());
      }
      if (this.turnT > 0) this.turnT -= ts;
      // visual facing follows the gameplay facing over ~7 frames (a teleport turns at once)
      if (this.faceVis !== this.facing) {
        if (Math.abs(this.x - this.prevX) > 200 || this.state === 'bossmove' || this.state === 'intro') this.faceVis = this.facing;
        else {
          const step = ts * 2 / 7;
          this.faceVis = this.facing > 0 ? Math.min(1, this.faceVis + step) : Math.max(-1, this.faceVis - step);
        }
      }
      // afterimages are short: 60–150 ms
      for (let i_g = 0, a_g = this.ghosts; i_g < a_g.length; i_g++) { const g = a_g[i_g]; g.life -= dt * 8; }
      while (this.ghosts.length && this.ghosts[0].life <= 0) (this._ghostPool || (this._ghostPool = [])).push(this.ghosts.shift());

      SA.Render.updateAccessories(this, dt, game.arena);
    }
  }

  SA.Fighter = Fighter;
})(window.SA);
