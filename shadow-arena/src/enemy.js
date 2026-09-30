'use strict';
/*
 * Combat AI — three layers, all playing through a normal Controller (held directions + buffered
 * presses), so every frame-data, buffer, cooldown and recovery rule applies exactly as for the player.
 *
 * 1. Perception   the AI sees a snapshot of the opponent from `react` frames ago (human reaction time:
 *                 normal 200–400 ms, elite 140–250 ms, boss 100–220 ms). It watches animation state,
 *                 position and velocity only — never inputs.
 * 2. Reactions    block / parry / backstep / roll / anti-air / whiff-punish / projectile answers to what it
 *                 has *seen*.
 * 3. Intents      a decision layer that picks a strategy and keeps it for a while (no per-frame flip-flop):
 *                 PRESSURE KEEP_DISTANCE BAIT PUNISH DEFEND REPOSITION COMBO ESCAPE RANGED_PRESSURE
 *                 SPECIAL_ATTACK. Intents drive spacing (from the weapon's measured min / optimal / max
 *                 range), movement (walk, run, sprint, dash, backstep, roll, jump, slide, running attack),
 *                 real combo sequences with abort rules, baits / frame traps and corner escapes.
 *
 * Difficulty never adds input reading: it raises decision quality, combo variety, reaction speed,
 * movement usage, punish rate, special usage and aggression (see SA.EnemyGen.aiParams).
 */
(function (SA) {
  const { rand, chance, weighted, clamp } = SA.M;

  const DIFFICULTY = SA.DIFFICULTY = {
    easy: { label: 'EASY', react: 22, block: 0.2, lowRead: 0.3, parry: 0, dodge: 0.06, punish: 0.25, antiAir: 0.12,
      comboDepth: 1, comboChance: 0.3, think: [26, 44], aggression: 0.75, mistakes: 0.25, spacing: 70, safe: false, guard: 0.4, anticipate: 0.02,
      quality: 0.25, mobility: 0.45, bait: 0.05, variety: 0.4, special: 0.12, ranged: 0.25 },
    normal: { label: 'NORMAL', react: 16, block: 0.5, lowRead: 0.55, parry: 0.05, dodge: 0.15, punish: 0.55, antiAir: 0.4,
      comboDepth: 2, comboChance: 0.6, think: [14, 26], aggression: 1, mistakes: 0.08, spacing: 35, safe: false, guard: 1, anticipate: 0.06,
      quality: 0.6, mobility: 0.8, bait: 0.35, variety: 0.7, special: 0.3, ranged: 0.4 },
    hard: { label: 'HARD', react: 10, block: 0.72, lowRead: 0.82, parry: 0.2, dodge: 0.28, punish: 0.88, antiAir: 0.65,
      comboDepth: 3, comboChance: 0.85, think: [8, 15], aggression: 1.1, mistakes: 0.02, spacing: 14, safe: true, guard: 1.6, anticipate: 0.12,
      quality: 0.9, mobility: 1.05, bait: 0.7, variety: 1, special: 0.45, ranged: 0.55 },
  };

  // Combo language: light kick heavy · d* (down+) · uheavy (up+heavy) · fheavy (forward+heavy, lunge)
  // dash · back (backstep) · roll · jump · wait:N frames · guard (hold block until something is blocked)
  // ranged · special · ab:<ability id>
  const DEFAULT_COMBOS = [
    ['light', 'light', 'heavy'],
    ['light', 'kick', 'kick'],
    ['dkick', 'light'],
    ['dlight', 'dkick', 'light'],
    ['light', 'light', 'dash', 'kick'],
    ['kick', 'fheavy'],
    ['light', 'wait:9', 'heavy'],
  ];

  const INTENTS = ['PRESSURE', 'KEEP_DISTANCE', 'BAIT', 'DEFEND', 'REPOSITION', 'COMBO', 'ESCAPE', 'RANGED_PRESSURE', 'SPECIAL_ATTACK'];
  const DWELL = { PRESSURE: [1.0, 2.2], KEEP_DISTANCE: [1.0, 2.0], BAIT: [1.6, 2.8], DEFEND: [0.8, 1.6], REPOSITION: [0.6, 1.2],
    COMBO: [0.9, 1.8], ESCAPE: [0.5, 1.0], RANGED_PRESSURE: [1.2, 2.4], SPECIAL_ATTACK: [0.8, 1.4], PUNISH: [0.5, 0.8] };
  const GAIT = { walk: 0.32, run: 0.7, sprint: 0.95 };

  // Fill a (possibly legacy) personality profile with intent weights, mobility and combos.
  function normalizeProfile(p) {
    p = Object.assign({ aggression: 0.65, blockMul: 1, dodgeMul: 1, jumpiness: 0.1, range: 240 }, p || {});
    const dm = p.dodgeMul;
    p.intents = Object.assign({
      pressure: 1, keepDistance: p.keepAway ? 1.8 : 0.35, bait: 0.45, defend: 0.55 * (p.blockMul || 1), combo: 1,
      ranged: p.rangedMul ? 0.6 * p.rangedMul : 0.25, reposition: 1,
    }, p.intents || {});
    p.mobility = Object.assign({
      dash: 0.45 + 0.15 * dm, backstep: 0.35 * dm, roll: 0.2 * dm, jump: Math.min(1, p.jumpiness * 3.5), slide: 0.3, run: 0.7,
    }, p.mobility || {});
    p.combos = p.combos || DEFAULT_COMBOS;
    p.weights = Object.assign({ jab: 2, kick: 1.5, heavy: 1.5, lowKick: 1, dashPunch: 1, slideKick: 0.6, jumpIn: 0.5, combo: 3, over: 0.8 }, p.weights || {});
    return p;
  }

  class EnemyAI {
    constructor(me, opp, game, opts) {
      this.me = me;
      this.opp = opp;
      this.game = game;
      this.ctrl = me.ctrl;
      if (opts.params) { this.diffName = 'stage'; this.D = Object.assign({}, DIFFICULTY.normal, opts.params); }
      else this.setDifficulty(opts.difficulty || 'normal');
      this.profile = normalizeProfile(opts.profile || SA.CHARACTERS.dummy.ai);
      this.abilities = (opts.abilities || []).map((a) => Object.assign({ cdLeft: a.cd * 0.5 }, a));
      this.mode = opts.mode || 'fight'; // fight | dummy | demo
      this.dummy = opts.dummy || 'stand';
      this.used = {};                   // movement / tactic usage counters (debug + tests)
      this.reset();
    }

    setDifficulty(name) {
      this.diffName = name;
      this.D = DIFFICULTY[name] || DIFFICULTY.normal;
    }

    reset() {
      this.state = 'IDLE';
      this.timer = 20;
      this.history = [];
      this.serial = 0;
      this.lastMove = null;
      this.lastMt = 0;
      this.reacted = -1;
      this.punished = -1;
      this.airSerial = 0;
      this.wasAir = false;
      this.antiAired = -1;
      this.plan = null;
      this.blockTimer = 0;
      this.crouchBlk = false;
      this.parryAt = -1;
      this.moveDir = 0;
      this.moveTimer = 0;
      this.perceived = null;
      this.seenProj = new Set();
      this.raged = false;
      this.rage = 1;
      this.intent = null;
      this.intentT = 0;
      this.bait = null;
      this.lastCombo = -1;
      this.oppAttacks = [];            // timestamps (frames) of attacks the opponent started
      this.oppBlocks = { low: 0, high: 0 };
      this.frame = 0;
      this.gait = GAIT.walk;
      this.desired = this.optRange();
      for (const a of this.abilities || []) a.cdLeft = a.cd * 0.5;
    }

    // ---------- weapon ranges ----------
    ranges() {
      const w = this.me.weapon;
      return (w && w.ranges) || { min: 108, opt: 200, max: 300 };
    }
    optRange() {
      const R = this.ranges(), p = this.profile;
      // personality nudges the weapon's ideal distance (assassins hug, spear users hold the tip);
      // ranged fighters (bow, magic) are happy far outside their melee reach
      return clamp(R.opt + (p.rangeBias || 0), R.min + 10, p.keepAway ? 900 : R.max);
    }
    // distance to hold while pressuring: short weapons step in, long weapons stay near the tip
    pressureRange() {
      const R = this.ranges(), long = R.min > 150;
      return Math.max(R.min + 8, this.optRange() * (this.profile.keepAway ? 0.9 : long ? 0.95 : 0.82));
    }
    attackReach() {
      const ms = this.me.moveset;
      const m = ms && SA.MOVES[ms.light];
      return (m && m.reach) || 240;
    }
    reachOf(step) {
      const ms = this.me.moveset;
      const key = { light: 'light', kick: 'kick', heavy: 'heavy', fheavy: 'heavyFwd', uheavy: 'heavyUp', dlight: 'lightDown', dkick: 'kickDown', dheavy: 'heavyDown' }[step];
      const m = key && SA.MOVES[ms[key]];
      return (m && m.reach) || 240;
    }

    // ---------- perception ----------
    observe() {
      const o = this.opp;
      const attacking = o.state === 'attack' || o.state === 'special';
      if (attacking && (o.move !== this.lastMove || o.mt < this.lastMt || (o.state === 'special' && this.lastMove !== 'special'))) {
        this.serial++;
        this.oppAttacks.push(this.frame);
      }
      while (this.oppAttacks.length && this.frame - this.oppAttacks[0] > 180) this.oppAttacks.shift();
      this.lastMove = o.state === 'special' ? 'special' : attacking ? o.move : null;
      this.lastMt = o.mt;
      if (!o.grounded && !this.wasAir) this.airSerial++;
      this.wasAir = !o.grounded;
      this.history.push({
        x: o.x, y: o.y, vx: o.vx, state: o.state, st: o.st, grounded: o.grounded,
        move: o.state === 'attack' ? o.move : null, phase: o.phase, mt: o.mt,
        contact: o.moveContact, serial: this.serial, air: this.airSerial, crouch: o.isCrouching(),
        blocking: o.state === 'block' || o.state === 'blockstun',
        sp: o.state === 'special' && o.sp ? o.sp.phase : null,
      });
      if (this.history.length > 40) this.history.shift();
      const i = Math.max(0, this.history.length - 1 - Math.round(this.D.react));
      this.perceived = this.history[i];
      const p = this.perceived;
      // learn how the opponent guards (for mix-ups): low vs high blocks
      if (p.blocking && this.frame % 20 === 0) this.oppBlocks[p.crouch ? 'low' : 'high']++;
    }

    keys() {
      return this.me.facing > 0 ? ['right', 'left'] : ['left', 'right'];
    }

    cornered(f, o) {
      return Math.abs(f.x) > SA.WALL - 190 && Math.sign(f.x) === Math.sign(f.x - o.x);
    }

    // ---------- main loop ----------
    update(ts) {
      const c = this.ctrl, me = this.me, game = this.game;
      c.hold.clear();
      c.stick = true;                    // AI moves "analog": walk / run / sprint by gait
      c.analog = this.gait = GAIT.walk;
      if (this.forceHold) for (const a of this.forceHold) c.hold.add(a); // test hook
      if (game.fightLocked || me.hp <= 0) { this.plan = null; return; }
      this.frame += ts;
      this.observe();
      const p = this.perceived;
      if (!p) return;
      this.timer -= ts;
      this.intentT -= ts / 60;
      const dist = Math.abs(p.x - me.x);
      this.dist = dist;
      for (const ab of this.abilities) if (ab.cdLeft > 0) ab.cdLeft -= ts / 60;
      if (this.profile.rage && !this.raged && me.hp < me.maxHp * 0.4 && me.hp > 0) {
        this.raged = true;
        this.rage = 1.4;
        me.rageSpeed = 1.12;
        game.label('RAGE', me.x, me.y - 330, '#ff4a3a', me, 1.2);
        SA.FX.special(game.particles, me.x, me.y, '#ff3a2a');
        SA.audio.play('roar', 0.6);
      }

      if (this.mode === 'dummy' && this.dummy !== 'cpu') { this.updateDummy(p, dist); return; }

      const canAct = me.isNeutral() || me.state === 'run' || me.state === 'sprint';
      if (canAct || me.state === 'blockstun') this.react(p, dist);
      // corner awareness: pinned and pressured -> switch to escaping now, not at the next re-think
      if (canAct && this.intent !== 'ESCAPE' && this.intent !== 'REPOSITION' && this.cornered(me, this.opp) && dist < 320 &&
          this.oppAttacks.length >= 1 && chance(0.04 + this.D.quality * 0.06)) this.setIntent('ESCAPE');

      const [fwd, back] = this.keys();
      switch (this.state) {
        case 'BLOCK':
          c.hold.add('block');
          if (this.crouchBlk) c.hold.add('down');
          if (this.parryAt >= 0) {
            this.parryAt -= ts;
            if (this.parryAt <= 0) { c.press('block'); this.parryAt = -1; }
          }
          this.blockTimer -= ts;
          if (this.blockTimer <= 0 && me.state !== 'blockstun') this.afterBlock(dist);
          break;

        case 'DODGE':
          if (me.state !== 'evade' && me.state !== 'dash' && me.state !== 'roll' && me.state !== 'prejump' && me.state !== 'air') this.enter('RECOVER', rand(3, 8));
          break;

        case 'ATTACK': case 'COMBO': case 'PUNISH':
          this.runPlan(fwd, back, dist);
          break;

        case 'RECOVER':
          if (me.isStunned() || me.state === 'down' || me.state === 'getup') { this.timer = Math.max(this.timer, 4); break; }
          if (this.recoverGuard) { c.hold.add('block'); }
          if (this.timer <= 0) this.enter('IDLE', 0);
          break;

        case 'IDLE':
        default:
          if (canAct) this.intentTick(p, dist, fwd, back);
          break;
      }

      // being hit resets intentions (and makes a new strategy likely)
      if (me.isStunned() && this.state !== 'RECOVER') {
        this.plan = null;
        this.bait = null;
        this.recoverGuard = chance(this.D.block * 0.8);
        this.enter('RECOVER', rand(6, 16));
        if (chance(0.5)) this.intentT = 0;
      }
    }

    aggr() { return (this.profile.aggression || 0.6) * this.D.aggression * (this.rage || 1); }
    // decision cadence: aggressive, agile archetypes decide faster than heavy, careful ones
    think(D) {
      const tempo = this.profile.tempo || (1.2 - 0.45 * (this.profile.aggression || 0.6));
      return rand(D.think[0], D.think[1]) * tempo;
    }

    enter(state, timer) {
      this.state = state;
      this.timer = timer || 0;
      if (state !== 'BLOCK') this.parryAt = -1;
    }

    count(k) { this.used[k] = (this.used[k] || 0) + 1; }

    // after a guard: counter-attack (guard -> counter -> heavy), step back, or just continue
    afterBlock(dist) {
      if (this.blockedSomething && dist < this.attackReach() + 20 && chance(this.D.punish * 0.8)) {
        this.blockedSomething = false;
        this.startPlan('PUNISH', dist < this.reachOf('light') ? ['light', 'heavy'] : ['fheavy']);
        this.count('counter');
        return;
      }
      this.blockedSomething = false;
      this.enter('IDLE', rand(2, 8));
    }

    // ================= reactive layer =================
    react(p, dist) {
      const D = this.D, c = this.ctrl, me = this.me;
      if (me.state === 'blockstun') this.blockedSomething = true;
      if (this.reactProjectiles()) return;
      const threat = (p.move && (p.phase === 'startup' || p.phase === 'active')) || (p.sp === 'charge' || p.sp === 'dash' || p.sp === 'rise');
      if (threat && p.serial !== this.reacted) {
        this.reacted = p.serial;
        const reach = p.sp ? 900 : (p.move.reach || 260);
        if (dist < reach + 50 && this.state !== 'PUNISH') {
          const r = Math.random();
          const block = D.block * (this.profile.blockMul || 1);
          const dodge = D.dodge * (this.profile.dodgeMul || 1);
          const level = p.move ? p.move.level : 'mid';
          const remaining = p.move ? p.move.startup + p.move.active - p.mt : 20;
          if (r < D.parry && p.move) {
            this.enter('BLOCK');
            this.blockTimer = remaining + 8;
            this.crouchBlk = level === 'low';
            this.parryAt = Math.max(0, p.move.startup - p.mt - D.react - 3);
            this.plan = null;
          } else if (r < D.parry + block) {
            this.enter('BLOCK');
            this.blockTimer = Math.max(8, remaining + 6);
            this.crouchBlk = level === 'low' ? chance(D.lowRead) : level === 'overhead' ? false : chance(0.15);
            this.plan = null;
          } else if (r < D.parry + block + dodge && p.phase !== 'active' && me.dashCd <= 0) {
            this.evasive(p, dist, level);
          }
        }
      }

      // anticipation: the opponent walks into striking range -> maybe guard before they swing
      if (this.state === 'IDLE' && !p.move && !p.sp && (p.state === 'walk' || p.state === 'run') && dist < 280 && Math.abs(p.vx) > 50 &&
          Math.sign(me.x - p.x) === Math.sign(p.vx) && chance(D.anticipate)) {
        this.enter('BLOCK');
        this.blockTimer = rand(14, 30);
        this.crouchBlk = chance(0.3);
      }

      // punish whiffed moves, landing jump attacks, parried/staggered opponents, roll recoveries
      const whiffed = (p.move && p.phase === 'recovery' && !p.contact) || p.state === 'stagger' || p.state === 'landing' ||
        p.sp === 'whiff' || p.sp === 'blocked' || (p.state === 'roll' && p.st > 18);
      if (whiffed && p.serial !== this.punished && this.state !== 'PUNISH') {
        this.punished = p.serial;
        const sure = p.state === 'stagger';
        if (chance(sure ? Math.max(D.punish, 0.6) : D.punish)) {
          const steps = this.punishSteps(dist);
          if (steps) { this.startPlan('PUNISH', steps); this.count('punish'); }
        }
      }

      // anti-air
      if (!p.grounded && p.air !== this.antiAired && (p.state === 'air' || p.state === 'attack') && dist < 340) {
        const approaching = Math.sign(me.x - p.x) === Math.sign(p.vx) || Math.abs(p.vx) < 50;
        if (approaching) {
          this.antiAired = p.air;
          if (chance(D.antiAir)) this.startPlan('ATTACK', ['uheavy']);
          else if (chance(D.block)) {
            this.enter('BLOCK');
            this.blockTimer = 30;
            this.crouchBlk = false;
          } else if (chance(this.profile.mobility.roll * D.mobility * 0.5) && me.dashCd <= 0) {
            this.press('roll');              // roll under the jump
            this.enter('DODGE');
          }
        }
      }
    }

    // pick an evasive answer by archetype mobility: backstep out, roll through / under, or jump a low
    evasive(p, dist, level) {
      const M = this.profile.mobility, me = this.me;
      const cornered = this.cornered(me, this.opp);
      const opts = [
        [cornered ? 0.1 : M.backstep * 1.2, 'back'],
        [M.roll * (level === 'low' ? 0.3 : 1) * (cornered ? 2 : 1), 'roll'],
        [M.jump * (level === 'low' ? 2 : 0.4), 'jump'],
      ];
      const pick = weighted(opts);
      this.plan = null;
      this.press(pick);
      this.enter('DODGE');
    }

    punishSteps(dist) {
      const R = this.me.moveset ? this.reachOf('light') : 240;
      if (dist < R) return this.comboSteps(true);
      if (dist < this.reachOf('fheavy')) return ['fheavy'];
      if (dist < 520) return ['dash', 'light'];
      return null;
    }

    // Projectiles are visible objects: react after the reaction delay, never before.
    reactProjectiles() {
      const game = this.game, me = this.me, D = this.D;
      if (!game.projectiles) return false;
      for (const pr of game.projectiles.pool) {
        if (!pr.alive || pr.owner === me || this.seenProj.has(pr.sid)) continue;
        if (pr.life * 60 < D.react) continue;
        const toward = Math.sign(me.x - pr.x) === Math.sign(pr.vx);
        const d = Math.abs(me.x - pr.x);
        if (!toward || d > 950) continue;
        this.seenProj.add(pr.sid);
        if (this.seenProj.size > 64) this.seenProj.clear();
        const r = Math.random();
        if (pr.type === 'shockwave') {
          if (r < D.dodge * 1.6 + 0.15) { this.press('jump'); this.enter('RECOVER', 20); }
          else if (r < D.dodge + D.block) { this.enter('BLOCK'); this.blockTimer = 26; this.crouchBlk = true; }
          return true;
        }
        if ((pr.type === 'bullet' || pr.type === 'pellet') && r < D.dodge * 1.4 + 0.1) {
          this.enter('BLOCK'); this.blockTimer = 22; this.crouchBlk = true;   // duck under
          return true;
        }
        if (r < D.dodge * this.profile.mobility.roll && d < 500 && me.dashCd <= 0) {
          this.press('roll'); this.enter('DODGE');
          return true;
        }
        if (r < D.block + 0.12) {
          this.enter('BLOCK'); this.blockTimer = Math.min(40, d / 40 + 10); this.crouchBlk = false;
          if (chance(D.parry)) this.parryAt = Math.max(0, d / (Math.abs(pr.vx) || 1) * 60 - 4);
          return true;
        }
      }
      return false;
    }

    // ================= intent layer =================
    chooseIntent(p, dist) {
      const me = this.me, o = this.opp, D = this.D, P = this.profile.intents;
      const aggr = this.aggr();
      const hp = me.hp / me.maxHp, oppHp = o.hp / o.maxHp;
      const R = this.ranges();
      const selfCorner = this.cornered(me, o), oppCorner = this.cornered(o, me);
      const oppAggressive = this.oppAttacks.length >= 3;
      const rw = me.rangedWeapon;
      const longWeapon = R.min > 150;
      const S = {
        PRESSURE: P.pressure * aggr * (1 + (oppCorner ? 0.9 : 0) + (hp > oppHp + 0.15 ? 0.4 : 0)),
        KEEP_DISTANCE: P.keepDistance * (longWeapon || rw ? 1.4 : 0.6) * (dist < R.opt * 0.85 ? 1.4 : 0.7),
        BAIT: P.bait * (0.35 + D.bait) * 1.25 * (dist > R.max ? 1.4 : 0.9),
        DEFEND: P.defend * Math.sqrt(D.guard) * (1.2 - aggr * 0.5) * (hp < 0.35 ? 1.6 : 1) * (oppAggressive ? 1.25 : 0.8),
        REPOSITION: selfCorner ? P.reposition * 1.8 * (1 + (1 - hp)) : 0.02,
        COMBO: P.combo * aggr * D.comboChance * (dist < R.opt + 80 ? 1.8 : 0.5),
        ESCAPE: selfCorner && (oppAggressive || hp < 0.4) ? P.reposition * 2.2 : 0,
        RANGED_PRESSURE: rw ? P.ranged * D.ranged * 2.2 * (dist > 360 ? 1.6 : 0.35) * (me.rangedState.ready() || rw.magazine ? 1 : 0.4) : 0,
        SPECIAL_ATTACK: me.energy >= 100 ? D.special * 3.5 : 0,
      };
      if (p.state === 'down' || p.state === 'getup') { S.PRESSURE += 2; S.BAIT *= 0.3; }
      // decision quality: good fighters mostly take the best option, weak ones pick loosely
      const entries = INTENTS.map((k) => [Math.max(0, S[k]), k]).filter((e) => e[0] > 0);
      let pick;
      if (chance(D.quality * (this.profile.erratic ? 0.45 : 1))) {
        entries.sort((a, b) => b[0] - a[0]);
        const r = Math.random();
        pick = (r < 0.6 ? entries[0] : r < 0.85 ? entries[1] || entries[0] : entries[2] || entries[0])[1];
      } else pick = weighted(entries);
      // variety: don't lock into the same intent forever
      if (pick === this.intent && entries.length > 1 && chance(0.35 * D.variety)) pick = weighted(entries.filter((e) => e[1] !== pick));
      this.setIntent(pick);
    }

    setIntent(k) {
      this.intent = k;
      const d = DWELL[k] || [1, 2];
      this.intentT = rand(d[0], d[1]) * (this.profile.erratic ? 0.5 : 1);   // cursed mummies change their mind a lot
      this.bait = null;
      this.count('intent:' + k);
    }

    intentTick(p, dist, fwd, back) {
      if (!this.intent || this.intentT <= 0) this.chooseIntent(p, dist);
      const me = this.me, R = this.ranges(), D = this.D;
      // abilities (teleport, slam, shield … from archetype, elite modifier or boss phase) come first
      if (this.timer <= 0 && this.tryAbility(dist)) return;
      if (this.timer <= 0 && this.spacingMove(dist)) return;
      switch (this.intent) {
        case 'PRESSURE': {
          this.moveTo(dist, this.pressureRange(), fwd, back, true);
          if (this.timer <= 0) {
            this.timer = this.think(D);
            if (!this.approachMove(dist)) this.attackFrom(dist, 0.8);
          }
          break;
        }
        case 'COMBO': {
          this.moveTo(dist, this.pressureRange(), fwd, back, true);
          if (this.timer <= 0) {
            this.timer = this.think(D) * 0.7;
            if (dist <= this.reachOf('light') + 10) this.startPlan('COMBO', this.comboSteps(false));
            else this.approachMove(dist);
          }
          break;
        }
        case 'KEEP_DISTANCE': {
          const keep = Math.max(this.optRange(), me.rangedWeapon ? 380 : 0);
          this.moveTo(dist, keep, fwd, back, false);
          if (this.timer <= 0) {
            this.timer = this.think(D);
            // whiff-punish / poke: the opponent steps into the tip of the weapon
            const approaching = Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(p.vx) > 80;
            if (dist < R.min && chance(this.profile.mobility.backstep * D.mobility)) { this.press('back'); this.enter('DODGE'); }
            else if (dist <= R.max && (approaching || chance(0.35))) this.attackFrom(dist, 1);
            else if (me.rangedWeapon && me.rangedState.ready() && dist > 300 && chance(0.4)) this.startPlan('ATTACK', ['ranged']);
          }
          break;
        }
        case 'BAIT':
          this.baitTick(p, dist, fwd, back);
          break;
        case 'DEFEND': {
          this.moveTo(dist, R.opt + 70, fwd, back, false);
          if (this.timer <= 0) {
            this.timer = this.think(D);
            if (dist < this.reachOf('light') + 60 && chance(0.6 * D.guard)) {
              this.enter('BLOCK');
              this.blockTimer = rand(16, 34);
              this.crouchBlk = this.oppBlocks.low > this.oppBlocks.high ? chance(0.5) : chance(0.3);
            } else if (dist <= this.reachOf('light') && chance(0.4)) this.attackFrom(dist, 0.6);
          }
          break;
        }
        case 'REPOSITION': case 'ESCAPE':
          this.escapeTick(p, dist, fwd, back);
          break;
        case 'RANGED_PRESSURE': {
          const rw = me.rangedWeapon;
          if (!rw) { this.intentT = 0; break; }
          const keep = rw.kind === 'gun' ? 520 : 420;
          this.moveTo(dist, keep, fwd, back, false);
          if (this.timer <= 0) {
            this.timer = this.think(D);
            const rs = me.rangedState;
            if (rw.magazine && rs.ammo === 0) { if (dist > 360) this.startPlan('ATTACK', ['reload']); else this.press('back'); }
            else if (rs.ready() && dist > 220) this.startPlan('ATTACK', ['ranged']);
            else if (dist < this.reachOf('light')) this.attackFrom(dist, 0.8);
          }
          break;
        }
        case 'SPECIAL_ATTACK': {
          if (me.energy < 100) { this.intentT = 0; break; }
          const storm = me.specialId === 'storm';
          const good = storm ? dist < 260 : me.specialId === 'slash' || me.specialId === 'quake' ? dist < 700 : dist < 520 && dist > 100;
          if (good && this.timer <= 0) { this.startPlan('ATTACK', ['special']); this.count('special'); }
          else this.moveTo(dist, storm ? 220 : 380, fwd, back, true);
          if (this.timer <= 0) this.timer = this.think(D) * 0.5;
          break;
        }
        default:
          this.footsies(dist, fwd, back);
      }
    }

    // Agile fighters dance: dash in / backstep out / roll out of the corner between their attacks.
    spacingMove(dist) {
      const M = this.profile.mobility, me = this.me, D = this.D;
      if (me.dashCd > 0 || !me.isNeutral()) return false;
      const want = this.intent === 'KEEP_DISTANCE' || this.intent === 'RANGED_PRESSURE' ? this.optRange() : this.ranges().opt * 0.85;
      const r = Math.random(), mob = D.mobility * 0.22;
      if (this.cornered(me, this.opp) && dist < 260 && r < M.roll * mob * 2) { this.press('roll'); this.enter('DODGE'); return true; }
      if (dist > want + 90 && dist < 700 && r < (M.dash + M.jump + M.slide) * mob) {
        // close the gap in the archetype's style: plain dash, jump-in, slide or a running attack
        const pick = weighted([[M.dash, 'dash'], [M.jump * 0.8, 'jumpIn'], [dist > 300 ? M.slide * 0.7 : 0, 'slide'], [dist > 380 ? M.run * 0.35 : 0, 'runAttack']]);
        if (pick === 'dash') { this.press('dash'); this.count('dash'); this.enter('DODGE'); this.timer = rand(4, 10); }
        else if (pick === 'jumpIn') { this.startPlan('ATTACK', ['jump', chance(0.6) ? 'kick' : 'light']); this.count('jump'); }
        else if (pick === 'slide') { this.startPlan('ATTACK', ['dash', 'dlight']); this.count('slide'); }
        else { this.startPlan('ATTACK', ['runlight']); this.count('runAttack'); }
        return true;
      }
      if (dist < want - 70 && r < M.backstep * mob) { this.press('back'); this.enter('DODGE'); return true; }
      return false;
    }

    // Walk / run / sprint (or back off) toward a distance; keeps a little footsie motion near it.
    moveTo(dist, want, fwd, back, allowRun) {
      const c = this.ctrl, me = this.me, M = this.profile.mobility, D = this.D;
      const err = dist - want;
      if (err > 45) {
        c.hold.add(fwd);
        const runOK = allowRun && M.run * D.mobility > 0.3;
        if (runOK && err > 420 && M.run > 0.55) { c.analog = GAIT.sprint; this.countOnce('sprint'); }
        else if (runOK && err > 170) { c.analog = GAIT.run; this.countOnce('run'); }
        else c.analog = GAIT.walk;
      } else if (err < -45) {
        const wall = Math.abs(me.x) > SA.WALL - 90 && Math.sign(me.x) === Math.sign(me.x - this.opp.x);
        if (!wall) {
          c.hold.add(back); c.analog = GAIT.walk;
          // far too close for this fighter's range: hop out with a backstep (or roll through when pinned)
          if (err < -110 && me.dashCd <= 0 && this.state === 'IDLE' && chance(M.backstep * D.mobility * (this.profile.keepAway ? 0.14 : 0.06))) { this.press('back'); this.enter('DODGE'); }
        } else if (err < -110 && me.dashCd <= 0 && chance(M.roll * D.mobility * 0.05)) { this.press('roll'); this.enter('DODGE'); }
      } else {
        this.footsies(dist, fwd, back, want);
      }
    }
    countOnce(k) { if (this.lastCount !== k) { this.count(k); this.lastCount = k; } }

    // Gap closers when far away: dash in, running attack, slide, leap / jump-in.
    approachMove(dist) {
      const M = this.profile.mobility, D = this.D, me = this.me, R = this.ranges();
      if (dist <= R.max + 40) return false;
      const mob = D.mobility * this.aggr();
      const opts = [
        [dist < 560 ? M.dash * mob : 0, 'dashAttack'],
        [dist > 380 && dist < 700 ? M.slide * mob * 0.7 : 0, 'slide'],
        [dist > 300 && dist < 560 ? M.jump * mob * 0.8 : 0, 'jumpIn'],
        [dist > 420 && me.state !== 'idle' ? M.run * mob * 0.6 : 0, 'runAttack'],
        [1.2, 'none'],
      ];
      const pick = weighted(opts);
      switch (pick) {
        case 'dashAttack': this.startPlan('ATTACK', ['dash', chance(0.6) ? 'light' : 'kick']); this.count('dash'); return true;
        case 'slide': this.startPlan('ATTACK', ['dash', 'dlight']); this.count('slide'); return true;
        case 'jumpIn': this.startPlan('ATTACK', ['jump', chance(0.6) ? 'kick' : 'light']); this.count('jump'); return true;
        case 'runAttack': this.startPlan('ATTACK', ['runlight']); this.count('runAttack'); return true;
        default: return false;
      }
    }

    // Choose a single attack that actually reaches from here (uses measured move reach + read of the guard).
    attackFrom(dist, mul) {
      const w = this.profile.weights, me = this.me, R = this.ranges();
      if (chance(this.D.mistakes)) { this.startPlan('ATTACK', [SA.M.pick(['heavy', 'kick', 'dkick', 'light'])]); return; }
      const lowReads = this.oppBlocks.low, highReads = this.oppBlocks.high;
      const cands = [
        ['light', w.jab], ['kick', w.kick], ['heavy', w.heavy * 0.8], ['fheavy', w.heavy * 0.7], ['dlight', 0.5],
        ['dkick', w.lowKick * (1 + highReads * 0.08)], ['dheavy', w.lowKick * 0.6 * (1 + highReads * 0.06)],
        ['uheavy', (w.over || 0.6) * (1 + lowReads * 0.08)],
      ].filter(([k]) => dist <= this.reachOf(k) + 5 && (dist >= R.min * 0.75 || k[0] === 'd'));
      if (!cands.length) { this.approachMove(dist); return; }
      if (chance(this.D.comboChance * 0.6 * mul) && dist <= this.reachOf('light')) { this.startPlan('COMBO', this.comboSteps(false)); return; }
      this.startPlan('ATTACK', [weighted(cands.map(([k, v]) => [v, k]))]);
    }

    // Bait: hover just outside the opponent's reach, invite a whiff, then punish; or a frame trap.
    baitTick(p, dist, fwd, back) {
      const me = this.me, o = this.opp;
      const oppReach = (o.moveset && SA.MOVES[o.moveset.light] && SA.MOVES[o.moveset.light].reach) || 250;
      if (!this.bait) { this.bait = { phase: 'in', t: 0 }; this.count('bait'); }
      const b = this.bait;
      b.t += 1;
      if (b.phase === 'in') {
        this.moveTo(dist, oppReach + 35, fwd, back, true);
        if (Math.abs(dist - (oppReach + 35)) < 50) { b.phase = 'hold'; b.t = 0; b.hold = rand(24, 50); }
        if (b.t > 120) this.intentT = 0;
        return;
      }
      if (b.phase === 'hold') {
        // tiny step in / out to look committed
        if (b.t % 16 < 5) this.ctrl.hold.add(fwd);
        // the opponent swings at the bait -> step out and come back with a dash attack
        if (p.move && (p.phase === 'startup' || p.phase === 'active') && dist < oppReach + 80) {
          this.startPlan('ATTACK', ['back', 'wait:4', 'dash', 'light']);
          this.count('baitPunish');
          this.bait = null; this.intentT = 0;
          return;
        }
        if (b.t > b.hold) {
          // nothing happened: frame trap (quick hit, pause, heavy)
          if (dist < this.reachOf('light') + 90) this.startPlan('ATTACK', ['dash', 'light', 'wait:10', 'heavy']);
          else this.startPlan('ATTACK', ['light', 'wait:10', 'heavy']);
          this.count('frameTrap');
          this.bait = null; this.intentT = 0;
        }
      }
    }

    // Cornered: roll through, jump over, push out with a heavy, or guard; otherwise walk back to the middle.
    escapeTick(p, dist, fwd, back) {
      const me = this.me, M = this.profile.mobility, D = this.D;
      const cornered = this.cornered(me, this.opp);
      if (!cornered) {
        // walk / run toward the centre side of the opponent
        const toCentre = Math.sign(-me.x) === me.facing ? fwd : back;
        if (Math.abs(me.x) > SA.WALL * 0.45) { this.ctrl.hold.add(toCentre); this.ctrl.analog = GAIT.run; }
        else this.intentT = 0;
        return;
      }
      if (this.timer > 0) { this.moveTo(dist, 160, fwd, back, false); return; }
      this.timer = this.think(D);
      const opts = [
        [dist < 300 && me.dashCd <= 0 ? M.roll * D.mobility * 2 : 0, 'roll'],
        [dist < 320 ? M.jump * D.mobility * 1.5 : 0, 'jump'],
        [dist < this.reachOf('fheavy') ? 0.8 : 0, 'push'],
        [0.6 * D.guard, 'guard'],
      ];
      switch (weighted(opts)) {
        case 'roll': this.press('roll'); this.enter('DODGE'); this.count('cornerRoll'); break;
        case 'jump': this.startPlan('ATTACK', ['jump', 'kick']); this.count('cornerJump'); break;
        case 'push': this.startPlan('ATTACK', ['fheavy']); break;
        default:
          this.enter('BLOCK'); this.blockTimer = rand(14, 26); this.crouchBlk = chance(0.35);
      }
    }

    tryAbility(dist) {
      const me = this.me;
      for (const ab of this.abilities) {
        if (ab.cdLeft > 0 || dist < (ab.min || 0) || dist > (ab.max || 9999)) continue;
        if (chance((ab.chance || 0.35) * 0.5) && SA.Bosses.startAbility(me, this.opp, ab.id, this.game)) {
          ab.cdLeft = ab.cd;
          this.count('ability');
          this.enter('RECOVER', 20);
          return true;
        }
      }
      return false;
    }

    // Small movements around the preferred range so the AI never stands still like a statue.
    footsies(dist, fwd, back, want) {
      const c = this.ctrl;
      this.moveTimer -= 1;
      if (this.moveTimer <= 0) {
        const w = (want || this.optRange()) + rand(-1, 1) * this.D.spacing;
        if (dist > w + 50) this.moveDir = 1;
        else if (dist < w - 60) this.moveDir = -1;
        else this.moveDir = weighted([[2, 0], [1, 1], [1, -1]]);
        this.moveTimer = rand(8, 26);
      }
      if (Math.abs(this.me.x) > SA.WALL - 80 && this.moveDir < 0 && Math.sign(this.me.x) === Math.sign(this.me.x - this.opp.x)) this.moveDir = 0;
      if (this.moveDir > 0) c.hold.add(fwd);
      else if (this.moveDir < 0) c.hold.add(back);
    }

    // ================= plans =================
    comboSteps(punish) {
      const D = this.D, list = this.profile.combos;
      // variety: avoid repeating the last combo
      let i = Math.floor(Math.random() * list.length);
      if (i === this.lastCombo && list.length > 1 && chance(D.variety)) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      this.lastCombo = i;
      const steps = list[i].slice();
      const hits = steps.filter((s) => !/^(wait|dash|back|roll|jump|guard)/.test(s)).length;
      const depth = chance(D.comboChance) ? D.comboDepth + 1 : 1;
      if (punish || hits <= depth) return steps;
      // shorten long strings for weaker fighters (keep movement steps attached to their attacks)
      const out = [];
      let n = 0;
      for (const s of steps) { if (!/^(wait|dash|back|roll|jump|guard)/.test(s)) n++; if (n > depth) break; out.push(s); }
      return out.length ? out : [steps[0]];
    }

    startPlan(state, steps) {
      this.plan = { steps, i: 0, wait: 0 };
      this.enter(state, 90);
    }

    // presses a movement action through the controller
    press(kind) {
      const c = this.ctrl, [fwd, back] = this.keys();
      if (kind === 'back') { c.hold.delete(fwd); c.press('dash'); this.count('backstep'); }
      else if (kind === 'roll') { c.hold.add('down'); c.press('dash'); this.count('roll'); }
      else if (kind === 'jump') { c.hold.add(back); c.press('up'); this.count('jumpBack'); }
      else if (kind === 'dash') { c.hold.add(fwd); c.press('dash'); }
    }

    // Executes one step: presses buttons through the controller.
    doStep(step, fwd) {
      const c = this.ctrl;
      if (step === 'dash') { c.hold.add(fwd); c.press('dash'); return; }
      if (step === 'back') { this.press('back'); return; }
      if (step === 'roll') { this.press('roll'); return; }
      if (step === 'jump') { c.hold.add(fwd); c.press('up'); return; }
      if (step === 'special') { c.press('special'); return; }
      if (step === 'ranged' || step === 'reload') { c.press(step); return; }
      if (step === 'uheavy') { c.hold.add('up'); c.press('heavy'); return; }
      if (step === 'fheavy') { c.hold.add(fwd); c.press('heavy'); return; }
      if (step === 'runlight') { c.hold.add(fwd); c.analog = GAIT.run; c.press('light'); return; }
      if (step.startsWith('ab:')) { SA.Bosses.startAbility(this.me, this.opp, step.slice(3), this.game); return; }
      if (step[0] === 'd' && step !== 'dash') { c.hold.add('down'); c.press(step.slice(1)); return; }
      c.press(step);
    }

    runPlan(fwd, back, dist) {
      const me = this.me, plan = this.plan, c = this.ctrl;
      if (!plan) { this.enter('RECOVER', rand(4, 10)); return; }
      const step = plan.steps[plan.i];
      const prev = plan.i > 0 ? plan.steps[plan.i - 1] : null;
      if (prev === 'dash' && me.isMoving()) c.hold.add(fwd);
      if (prev === 'jump' && (me.state === 'prejump' || me.state === 'air')) c.hold.add(fwd);

      if (!step) {
        // plan finished: wait for the last action to end
        if (me.isNeutral()) this.enter('RECOVER', rand(2, 8) * (this.D.safe ? 1 : 1.4));
        return;
      }
      // timed pause inside a plan (frame traps, baits)
      if (step.startsWith('wait:')) {
        if (me.state === 'attack' && me.phase !== 'recovery') return;
        plan.wait += 1;
        if (plan.wait >= +step.slice(5)) { plan.wait = 0; plan.i++; }
        return;
      }
      // guard: hold block until something is blocked (or time runs out), then continue with the counter
      if (step === 'guard') {
        c.hold.add('block');
        plan.wait += 1;
        if (me.state === 'blockstun') plan.blocked = true;
        if ((plan.blocked && me.state !== 'blockstun') || plan.wait > 50) { plan.wait = 0; plan.i++; if (!plan.blocked) plan.i = plan.steps.length; }
        return;
      }
      if (step.startsWith('ab:')) {
        if (me.isNeutral() || me.isMoving()) { this.doStep(step, fwd); plan.i++; }
        return;
      }
      // running attack: build up a run first, then strike out of it
      if (step === 'runlight') {
        c.hold.add(fwd);
        c.analog = GAIT.run;
        plan.wait += 1;
        if (me.state === 'run' || me.state === 'sprint') { c.press('light'); plan.wait = 0; plan.i++; }
        else if (plan.wait > 30 || !(me.isNeutral() || me.isMoving())) plan.i = plan.steps.length;
        return;
      }
      if (plan.i === 0 || prev.startsWith('wait:') || prev === 'guard' || prev.startsWith('ab:')) {
        if (me.isNeutral() || me.state === 'run' || me.state === 'sprint') {
          if (step[0] === 'd' && step !== 'dash') c.hold.add('down');
          this.doStep(step, fwd);
          plan.i++;
        } else if (prev && prev.startsWith('ab:') && me.state !== 'bossmove' && me.state !== 'attack') plan.i = plan.steps.length;
        return;
      }
      if (prev === 'dash') {
        if (me.isMoving()) {
          if (dist < 330 || me.st > 8) { this.doStep(step, fwd); plan.i++; }
        } else if (me.isNeutral() && me.st > 10) this.plan.i = plan.steps.length;
        return;
      }
      if (prev === 'back') {
        if (me.state === 'evade') { if (me.st >= 6) { this.doStep(step === 'light' ? 'heavy' : step, fwd); plan.i++; } }
        else if (me.isNeutral()) { this.doStep(step, fwd); plan.i++; }
        return;
      }
      if (prev === 'jump') {
        if (me.state === 'air' && (dist < 250 || me.vy > 150)) { this.doStep(step, fwd); plan.i++; }
        else if (me.isNeutral() && me.st > 6) this.plan.i = plan.steps.length;
        return;
      }
      // a clean hit with full energy: cancel straight into the special
      if (me.state === 'attack' && me.moveContact === 'hit' && me.energy >= 100 && this.diffName !== 'easy' && chance(0.08 + this.D.special * 0.1)) {
        c.press('special');
        plan.i = plan.steps.length;
        return;
      }
      // chained attacks: continue only after contact; smart fighters stop when blocked
      if (me.state === 'attack') {
        if (me.moveContact === 'hit' || (me.moveContact === 'block' && !this.D.safe && chance(0.5))) {
          if (step[0] === 'd' && step !== 'dash') c.hold.add('down');
          this.doStep(step, fwd);
          plan.i++;
        } else if (me.moveContact === 'block' || (me.phase === 'recovery' && !me.moveContact)) {
          plan.i = plan.steps.length;
          if (me.moveContact === 'block') {
            // blocked: back off with a backstep sometimes instead of eating the punish
            if (chance(this.profile.mobility.backstep * this.D.mobility * 0.6)) { c.press('dash'); this.count('backstep'); }
            else if (chance(this.D.block)) this.recoverGuard = true;
          }
        }
      } else if (me.isNeutral()) {
        plan.i = plan.steps.length;
      }
    }

    // Training dummy: stand, block everything, or block randomly.
    updateDummy(p, dist) {
      const c = this.ctrl;
      this.state = 'DUMMY';
      if (this.dummy === 'stand') return;
      const threat = p.move && (p.phase === 'startup' || p.phase === 'active');
      if (this.dummy === 'block') {
        c.hold.add('block');
        if (p.move && p.move.level === 'low') this.crouchBlk = true;
        else if (p.move && p.move.level === 'overhead') this.crouchBlk = false;
        if (this.crouchBlk) c.hold.add('down');
        return;
      }
      if (threat && p.serial !== this.reacted) {
        this.reacted = p.serial;
        this.randomBlock = chance(0.5);
        this.crouchBlk = p.move.level === 'low';
      }
      if (this.randomBlock && (threat || this.me.state === 'blockstun')) {
        c.hold.add('block');
        if (this.crouchBlk) c.hold.add('down');
      }
    }

    debugText() {
      const p = this.perceived;
      const plan = this.plan ? this.plan.steps.map((s, i) => (i === this.plan.i ? '>' : '') + s).join(' ') : '-';
      return `${this.intent || '-'} / ${this.state}  sees:${p ? p.state + (p.phase ? '/' + p.phase : '') : '?'}  d:${Math.round(this.dist || 0)}  plan:${plan}`;
    }
  }

  SA.EnemyAI = EnemyAI;
  SA.AI_INTENTS = INTENTS;
  SA.normalizeAIProfile = normalizeProfile;
})(window.SA);
