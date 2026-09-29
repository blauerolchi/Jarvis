'use strict';
/*
 * Fighter: state machine, movement and move execution.
 * Driven only through its Controller (held actions + buffered presses), for both human and AI.
 *
 * States: idle walk crouch block | prejump air landing | dash run evade | attack special
 *         hitstun blockstun stagger launched down getup rushed | victory defeat ko
 */
(function (SA) {
  const { clamp, damp, lerp } = SA.M;
  const A = SA.Anim;

  const WALK_FWD = 360, WALK_BACK = 285;
  const JUMP_VY = -1300, JUMP_VX = 430;
  const DASH_SPEED = 1250, RUN_SPEED = 700;
  const DASH_FRAMES = 14, EVADE_FRAMES = 18;

  const NEUTRAL = { idle: 1, walk: 1, crouch: 1, block: 1 };
  const STUNNED = { hitstun: 1, launched: 1, stagger: 1, rushed: 1 };

  SA.SPECIALS = {
    rush: { id: 'rush', name: 'SHADOW RUSH', desc: 'Lightning dash into a five-strike flurry and a crushing finisher.' },
    storm: { id: 'storm', name: 'CRESCENT STORM', desc: 'Rising whirlwind of kicks. Great anti-air, launches the enemy.' },
  };

  const RUSH_DASH = { id: 'rush', damage: 30, hitstun: 30, blockstun: 24, kb: 120, level: 'mid', hitstop: 4, shake: 0.3, sound: 'hit_heavy', power: 0.8, unparryable: true };
  const RUSH_HIT = { id: 'rush', damage: 24, hitstun: 30, kb: 0, level: 'mid', hitstop: 3, shake: 0.18, sound: 'hit_light', power: 0.55 };
  const RUSH_FINAL = { id: 'rush', damage: 90, hitstun: 30, kb: 1350, kbY: -950, knockdown: true, level: 'mid', hitstop: 9, shake: 0.85, zoom: 0.1, sound: 'hit_special', power: 1.4 };
  const STORM_HIT = { id: 'storm', damage: 40, hitstun: 30, blockstun: 14, kb: 40, kbY: -1250, knockdown: true, level: 'mid', hitstop: 3, shake: 0.25, sound: 'hit_kick', power: 0.7 };
  const STORM_FINAL = { id: 'storm', damage: 75, hitstun: 30, blockstun: 16, kb: 950, kbY: -700, knockdown: true, level: 'mid', hitstop: 8, shake: 0.7, zoom: 0.08, sound: 'hit_special', power: 1.3 };

  const RUSH_POSES = ['jab', 'kick', 'jab2', 'heavy', 'lowKick'].map((id) => {
    const keys = SA.MOVES[id].keys;
    return keys[keys.length - 3][1]; // the strike pose
  });

  class Fighter {
    constructor(o) {
      this.name = o.name;
      this.look = o.look;
      this.ctrl = o.controller;
      this.isPlayer = !!o.isPlayer;
      this.maxHp = o.maxHp || 1000;
      this.damageMul = o.damageMul || 1;
      this.speedMul = o.speedMul || 1;
      this.specialId = o.special || 'rush';
      this.pose = A.P();
      this.entryPose = A.P();
      this.local = A.createSkeleton();
      this.skel = A.createSkeleton();
      this.hurt = { head: { x: 0, y: 0, w: 0, h: 0 }, torso: { x: 0, y: 0, w: 0, h: 0 }, legs: { x: 0, y: 0, w: 0, h: 0 } };
      this.hitList = new Set();
      this.combo = { hits: 0, damage: 0, seq: [], timer: 0, name: null };
      this.accessories = null;
      this.reset(0, 1);
    }

    reset(x, facing) {
      this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
      this.prevX = x; this.prevY = 0;
      this.facing = facing;
      this.grounded = true;
      this.hp = this.maxHp;
      this.state = 'idle'; this.st = 0;
      this.move = null; this.mt = 0; this.animKeys = null;
      this.moveContact = null; this.lunged = false; this.whooshed = false;
      this.hitList.clear();
      this.stun = 0; this.invuln = 0;
      this.parryAge = 99; this.parryLock = 0;
      this.crouchBlock = false;
      this.juggle = 0; this.bounced = false;
      this.airTime = 0; this.airAttackUsed = false; this.jumpDir = 0;
      this.walkDir = 1; this.walkPhase = 0;
      this.animTime = Math.random() * 10;
      this.spin = null; this.spinScale = 1; this.scaleX = 1; this.scaleY = 1;
      this.hitPose = 'hitBody';
      this.sp = null;
      this.ghosts = []; this.ghostTimer = 0;
      this.trail = [];
      this.fromRun = false;
      this.startCombo();
      A.copyPose(this.pose, A.STANCE);
      A.solveLocal(this.pose, this.local, this.look.bulk);
      A.toWorld(this);
      this.updateHurtboxes();
      if (this.ctrl) this.ctrl.clear();
      if (this.accessories) SA.Render.resetAccessories(this);
    }

    // ---------- queries ----------
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
    isStunned() { return !!STUNNED[this.state]; }
    isCrouching() {
      return this.state === 'crouch' || ((this.state === 'block' || this.state === 'blockstun') && this.crouchBlock) ||
        (this.state === 'attack' && this.move && this.move.crouching);
    }
    canBeHit(attacker) {
      if (this.invuln > 0) return false;
      const s = this.state;
      if (s === 'down' || s === 'getup' || s === 'ko' || s === 'victory' || s === 'defeat' || s === 'rushed') return false;
      if (s === 'launched' && this.juggle >= 3 && !(attacker && attacker.state === 'special')) return false;
      return true;
    }

    setState(s) {
      this.state = s;
      this.st = 0;
      if (s !== 'attack' && s !== 'special') { this.spin = null; }
    }
    setAnim(keys) {
      A.copyPose(this.entryPose, this.pose);
      this.animKeys = keys;
      this.mt = 0;
    }
    cancelMove() {
      this.move = null;
      this.animKeys = null;
      this.spin = null;
      this.sp = null;
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
      this.combo.timer = 0;
      this.combo.name = null;
    }
    addEnergy(v) {
      if (this.state === 'special') return;
      this.energy = clamp((this.energy || 0) + v, 0, 100);
    }

    startMove(id) {
      const m = SA.MOVES[id];
      A.copyPose(this.entryPose, this.pose);
      this.move = m;
      this.animKeys = m.keys;
      this.setState('attack');
      this.mt = 0;
      this.spin = m.spin || null;
      this.hitList.clear();
      this.moveContact = null;
      this.lunged = false;
      this.whooshed = false;
      this.trail.length = 0;
      if (m.air) this.airAttackUsed = true;
    }

    cancelOpen() {
      const m = this.move;
      if (this.moveContact === 'hit' || this.moveContact === 'block') return this.mt >= m.startup + Math.min(m.active, 3) - 1;
      return this.mt >= m.startup + m.active + m.recovery * 0.45;
    }

    // Hitbox in world space for the current attack, or null.
    activeHit() {
      if (this.state === 'attack') {
        const m = this.move;
        if (!m || !m.hit || this.phase !== 'active') return null;
        const h = m.hit, j = this.skel[h.joint], s = this.look.scale;
        const cx = j.x + h.ox * this.facing * s, cy = j.y + h.oy * s;
        return { rect: { x: cx - h.w * s / 2, y: cy - h.h * s / 2, w: h.w * s, h: h.h * s }, data: m };
      }
      if (this.state === 'special' && this.sp) return this.specialHit();
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
      this.parryAge += ts;
      if (c.consume('block')) {
        this.parryAge = this.parryLock > 0 ? 99 : 0; // mashing block never parries
        this.parryLock = 24;
      }
      if (!this.grounded) this.airTime += dt;

      if (game.fightLocked && (this.isNeutral() || this.state === 'run' || this.state === 'dash')) {
        if (this.state !== 'idle') this.setState('idle');
        this.vx = damp(this.vx, 0, 12, dt);
      } else {
        this.updateState(ts, dt, game);
      }

      SA.Physics.integrate(this, dt, game);
      c.tick(ts);
    }

    updateState(ts, dt, game) {
      const c = this.ctrl;
      switch (this.state) {
        case 'idle': case 'walk': case 'crouch': case 'block':
          this.updateNeutral(dt, game);
          break;

        case 'prejump':
          this.vx = damp(this.vx, this.fromRun ? this.vx : 0, 20, dt);
          if (this.st >= 2) this.doJump(game);
          break;

        case 'air':
          if (!this.airAttackUsed) {
            if (c.consume('light')) this.startMove('airPunch');
            else if (c.consume('kick') || c.consume('heavy')) this.startMove('flyingKick');
          }
          break;

        case 'landing':
          this.stun -= ts;
          this.vx = damp(this.vx, 0, 14, dt);
          if (this.stun <= 0) this.toNeutral();
          break;

        case 'dash': {
          const u = clamp(this.st / DASH_FRAMES, 0, 1);
          this.vx = this.facing * lerp(DASH_SPEED, RUN_SPEED, u) * this.speedMul;
          this.spawnGhost(3);
          if (this.runActions(game)) break;
          if (this.st >= DASH_FRAMES) this.setState(this.fwdHeld() ? 'run' : 'idle');
          break;
        }

        case 'run':
          this.vx = damp(this.vx, this.facing * RUN_SPEED * this.speedMul, 20, dt);
          this.spawnGhost(5);
          if (Math.floor(this.st) % 14 === 0 && this.st % 1 < ts) SA.FX.dust(game.particles, this.x - this.facing * 30, 0, 0.35, -this.facing);
          if (this.runActions(game)) break;
          if (!this.fwdHeld()) {
            SA.FX.dust(game.particles, this.x + this.facing * 20, 0, 0.5, this.facing);
            this.setState(c.held('down') ? 'crouch' : 'idle');
          }
          break;

        case 'evade':
          this.vx = damp(this.vx, 0, 7, dt);
          this.spawnGhost(3);
          if (this.st >= 13 && this.tryAttacks()) break;
          if (this.st >= EVADE_FRAMES) this.toNeutral();
          break;

        case 'attack':
          this.updateAttack(ts, dt, game);
          break;

        case 'special':
          this.updateSpecial(ts, dt, game);
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
      if (this.tryAttacks()) return;
      if (c.consume('dash')) {
        if (fwd) this.startDash(game); else this.startEvade(game);
        return;
      }
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
        if (this.state !== 'walk') this.setState('walk');
        this.walkDir = dir;
        const speed = (dir > 0 ? WALK_FWD : WALK_BACK) * this.speedMul;
        this.vx = damp(this.vx, this.facing * dir * speed, 42, dt);
      } else {
        if (this.state !== 'idle') this.setState('idle');
        this.vx = damp(this.vx, 0, 36, dt);
      }
    }

    // Attack inputs from neutral. S modifies punches/kicks into crouching versions.
    tryAttacks() {
      const c = this.ctrl;
      const down = c.held('down');
      if (c.has('special')) {
        c.consume('special');
        if (this.energy >= 100) { this.startSpecial(); return true; }
        SA.audio.play('denied');
      }
      if (c.consume('light')) { this.startMove(down ? 'crouchJab' : 'jab'); return true; }
      if (c.consume('heavy')) { this.startMove(down ? 'uppercut' : 'heavy'); return true; }
      if (c.consume('kick')) { this.startMove(down ? 'lowKick' : 'kick'); return true; }
      return false;
    }

    runActions(game) {
      const c = this.ctrl;
      if (c.consume('light')) { this.startMove('dashPunch'); return true; }
      if (c.consume('kick') || c.consume('heavy')) { this.startMove('slideKick'); return true; }
      if (c.has('special') && this.energy >= 100) { c.consume('special'); this.startSpecial(); return true; }
      if (c.consume('up')) { this.startPrejump(true); return true; }
      if (c.held('block')) { this.setState('block'); this.crouchBlock = c.held('down'); return true; }
      return false;
    }

    startDash(game) {
      this.setState('dash');
      this.vx = this.facing * DASH_SPEED * this.speedMul;
      SA.audio.play('dash');
      SA.FX.dust(game.particles, this.x - this.facing * 20, 0, 0.7, -this.facing);
    }

    startEvade(game) {
      this.setState('evade');
      this.vx = -this.facing * 1100 * this.speedMul;
      this.invuln = 12;
      SA.audio.play('dash');
      SA.FX.dust(game.particles, this.x + this.facing * 10, 0, 0.6, this.facing);
    }

    startPrejump(fromRun) {
      this.fromRun = fromRun;
      this.setState('prejump');
      this.scaleY = 0.9; this.scaleX = 1.06;
    }

    doJump(game) {
      const dir = this.fwdHeld() ? 1 : this.backHeld() ? -1 : 0;
      this.jumpDir = this.fromRun ? 1 : dir;
      this.vy = JUMP_VY;
      this.vx = this.fromRun ? this.facing * 640 * this.speedMul : dir * this.facing * JUMP_VX * this.speedMul;
      this.grounded = false;
      this.y = -1;
      this.airAttackUsed = false;
      this.airTime = 0;
      this.setState('air');
      this.scaleY = 1.12; this.scaleX = 0.92;
      SA.audio.play('jump');
      SA.FX.dust(game.particles, this.x, 0, 0.5, 0);
    }

    updateAttack(ts, dt, game) {
      const m = this.move, c = this.ctrl;
      this.mt += ts;
      if (m.lunge && !this.lunged && this.mt >= m.lunge[0]) {
        this.lunged = true;
        if (this.grounded) {
          const v = this.facing * m.lunge[1] * this.speedMul;
          if (Math.sign(this.vx) !== Math.sign(v) || Math.abs(this.vx) < Math.abs(v)) this.vx = v;
        }
      }
      if (!this.whooshed && this.mt >= m.startup - 3) {
        this.whooshed = true;
        SA.audio.play('whoosh_' + (m.whoosh || 'light'));
      }
      if (this.grounded) this.vx = damp(this.vx, 0, m.friction || 9, dt);

      if (m.chain && this.cancelOpen()) {
        for (const key in m.chain) {
          if (c.consume(key)) { this.startMove(m.chain[key]); return; }
        }
      }
      if (this.moveContact === 'hit' && this.energy >= 100 && c.has('special')) {
        c.consume('special');
        this.startSpecial();
        return;
      }
      if (this.mt >= m.total && (!m.air || this.grounded)) this.toNeutral();
    }

    onLand(game, impactVy) {
      this.grounded = true;
      this.vy = 0;
      this.y = 0;
      this.airTime = 0;
      switch (this.state) {
        case 'air':
          this.scaleY = 0.84; this.scaleX = 1.1;
          SA.FX.dust(game.particles, this.x, 0, 0.5, 0);
          SA.audio.play('land', 0.4);
          this.toNeutral();
          break;
        case 'attack':
          this.cancelMove();
          this.setState('landing');
          this.stun = 5;
          this.scaleY = 0.86; this.scaleX = 1.08;
          SA.FX.dust(game.particles, this.x, 0, 0.5, 0);
          break;
        case 'launched':
          if (!this.bounced && impactVy > 850) {
            this.bounced = true;
            this.grounded = false;
            this.vy = -impactVy * 0.32;
            this.y = -1;
            this.vx *= 0.6;
            SA.FX.dust(game.particles, this.x, 0, 1.2, 0);
            SA.audio.play('knockdown', 0.9);
            game.shake(0.25);
          } else {
            this.setState(this.hp <= 0 ? 'ko' : 'down');
            this.vx *= 0.35;
            SA.FX.dust(game.particles, this.x, 0, 0.8, 0);
            SA.audio.play('knockdown', 0.5);
          }
          break;
        case 'special':
          this.cancelMove();
          this.setState('landing');
          this.stun = 18;
          SA.FX.dust(game.particles, this.x, 0, 0.8, 0);
          SA.audio.play('land', 0.7);
          break;
        case 'hitstun': case 'stagger':
          this.setState('down');
          break;
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
            SA.FX.dust(game.particles, this.x - this.facing * 30, 0, 1, -this.facing);
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
            SA.FX.dust(game.particles, this.x, 0, 1.2, 0);
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
      return null;
    }

    // ---------- visuals bookkeeping ----------
    spawnGhost(interval, force) {
      this.ghostTimer++;
      if (!force && (interval <= 0 || this.ghostTimer % interval !== 0)) return;
      const pts = {};
      for (const k of A.POINTS) pts[k] = { x: this.skel[k].x, y: this.skel[k].y };
      this.ghosts.push({ pts, life: 1, facing: this.facing * this.spinScale });
      if (this.ghosts.length > 10) this.ghosts.shift();
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
      this.updateHurtboxes();

      const m = this.state === 'attack' ? this.move : null;
      if (m && m.hit && this.mt >= m.startup - 2 && this.mt <= m.startup + m.active + 2) {
        const j = this.skel[m.hit.joint];
        this.trail.push({ x: j.x, y: j.y });
        if (this.trail.length > 8) this.trail.shift();
      } else if (this.trail.length) {
        this.trail.shift();
      }
      for (const g of this.ghosts) g.life -= dt * 3.2;
      while (this.ghosts.length && this.ghosts[0].life <= 0) this.ghosts.shift();

      SA.Render.updateAccessories(this, dt, game.arena);
    }
  }

  SA.Fighter = Fighter;
})(window.SA);
