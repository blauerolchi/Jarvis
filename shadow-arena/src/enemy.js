'use strict';
/*
 * Combat AI.
 * - Perception: the AI sees a snapshot of the opponent from `react` frames ago (human reaction
 *   time). It only observes animation state (move, phase, position) - never raw inputs.
 * - It plays through a normal Controller: holds directions and presses buttons, so all frame
 *   data, buffers and recovery rules apply to it exactly like to the player.
 * - States: IDLE APPROACH RETREAT ATTACK COMBO BLOCK DODGE PUNISH RECOVER
 */
(function (SA) {
  const { rand, chance, weighted } = SA.M;

  const DIFFICULTY = SA.DIFFICULTY = {
    easy: { label: 'EASY', react: 24, block: 0.2, lowRead: 0.3, parry: 0, dodge: 0.05, punish: 0.25, antiAir: 0.12,
      comboDepth: 1, comboChance: 0.3, think: [26, 44], aggression: 0.75, mistakes: 0.25, spacing: 70, safe: false, guard: 0.4, anticipate: 0.02 },
    normal: { label: 'NORMAL', react: 15, block: 0.5, lowRead: 0.55, parry: 0.05, dodge: 0.15, punish: 0.55, antiAir: 0.4,
      comboDepth: 2, comboChance: 0.6, think: [14, 26], aggression: 1, mistakes: 0.08, spacing: 35, safe: false, guard: 1, anticipate: 0.06 },
    hard: { label: 'HARD', react: 10, block: 0.72, lowRead: 0.82, parry: 0.2, dodge: 0.28, punish: 0.88, antiAir: 0.65,
      comboDepth: 3, comboChance: 0.85, think: [8, 15], aggression: 1.1, mistakes: 0.02, spacing: 14, safe: true, guard: 1.6, anticipate: 0.12 },
  };

  // approximate threat reach of each move (distance between fighters)
  const REACH = {
    jab: 240, jab2: 250, heavy: 290, finisher: 290, kick: 290, spinKick: 290, lowKick: 280,
    crouchJab: 235, uppercut: 210, airPunch: 260, flyingKick: 300, dashPunch: 470, slideKick: 520,
  };

  const COMBOS = [
    ['light', 'light', 'heavy'],
    ['light', 'kick', 'kick'],
    ['kick', 'kick'],
    ['dkick', 'light'],
    ['dlight', 'dkick', 'light'],
    ['light', 'light'],
  ];

  class EnemyAI {
    constructor(me, opp, game, opts) {
      this.me = me;
      this.opp = opp;
      this.game = game;
      this.ctrl = me.ctrl;
      this.setDifficulty(opts.difficulty || 'normal');
      this.profile = opts.profile || SA.CHARACTERS.dummy.ai;
      this.mode = opts.mode || 'fight'; // fight | dummy | demo
      this.dummy = opts.dummy || 'stand';
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
      this.desired = this.profile ? this.profile.range : 240;
    }

    observe() {
      const o = this.opp;
      const attacking = o.state === 'attack' || o.state === 'special';
      if (attacking && (o.move !== this.lastMove || o.mt < this.lastMt || (o.state === 'special' && this.lastMove !== 'special'))) this.serial++;
      this.lastMove = o.state === 'special' ? 'special' : attacking ? o.move : null;
      this.lastMt = o.mt;
      if (!o.grounded && !this.wasAir) this.airSerial++;
      this.wasAir = !o.grounded;
      this.history.push({
        x: o.x, y: o.y, vx: o.vx, state: o.state, grounded: o.grounded,
        move: o.state === 'attack' ? o.move : null, phase: o.phase, mt: o.mt,
        contact: o.moveContact, serial: this.serial, air: this.airSerial,
        sp: o.state === 'special' && o.sp ? o.sp.phase : null,
      });
      if (this.history.length > 40) this.history.shift();
      const i = Math.max(0, this.history.length - 1 - Math.round(this.D.react));
      this.perceived = this.history[i];
    }

    keys() {
      return this.me.facing > 0 ? ['right', 'left'] : ['left', 'right'];
    }

    update(ts) {
      const c = this.ctrl, me = this.me, game = this.game;
      c.hold.clear();
      if (this.forceHold) for (const a of this.forceHold) c.hold.add(a); // test hook
      if (game.fightLocked || me.hp <= 0) { this.plan = null; return; }
      this.observe();
      const p = this.perceived;
      if (!p) return;
      this.timer -= ts;
      const dist = Math.abs(p.x - me.x);
      this.dist = dist;

      if (this.mode === 'dummy' && this.dummy !== 'cpu') { this.updateDummy(p, dist); return; }

      const canAct = me.isNeutral() || me.state === 'run';
      if (canAct || me.state === 'blockstun') this.react(p, dist);

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
          if (this.blockTimer <= 0 && me.state !== 'blockstun') this.enter('IDLE', rand(2, 8));
          break;

        case 'DODGE':
          if (me.state !== 'evade' && me.state !== 'dash') this.enter('RECOVER', rand(4, 10));
          break;

        case 'ATTACK': case 'COMBO': case 'PUNISH':
          this.runPlan(fwd, back, dist);
          break;

        case 'APPROACH':
          c.hold.add(fwd);
          if (dist > 620 && canAct && chance(0.02 * this.aggr())) { c.press('dash'); }
          if (dist <= this.desired + 20 || this.timer <= 0) this.enter('IDLE', rand(...this.D.think) * 0.5);
          break;

        case 'RETREAT':
          c.hold.add(back);
          if (this.timer <= 0 || Math.abs(me.x) > SA.WALL - 60) this.enter('IDLE', rand(...this.D.think));
          break;

        case 'RECOVER':
          if (me.isStunned() || me.state === 'down' || me.state === 'getup') { this.timer = Math.max(this.timer, 4); break; }
          if (this.recoverGuard) { c.hold.add('block'); }
          if (this.timer <= 0) this.enter('IDLE', 0);
          break;

        case 'IDLE':
        default:
          if (canAct) this.footsies(dist, fwd, back);
          if (this.timer <= 0 && canAct) this.decide(p, dist);
          break;
      }

      // being hit resets intentions
      if (me.isStunned() && this.state !== 'RECOVER') {
        this.plan = null;
        this.recoverGuard = chance(this.D.block * 0.8);
        this.enter('RECOVER', rand(6, 16));
      }
    }

    aggr() { return (this.profile.aggression || 0.6) * this.D.aggression; }

    enter(state, timer) {
      this.state = state;
      this.timer = timer || 0;
      if (state !== 'BLOCK') this.parryAt = -1;
    }

    // Reactive layer: blocks / dodges / punishes / anti-airs what it has *seen*.
    react(p, dist) {
      const D = this.D, c = this.ctrl, me = this.me;
      const threat = (p.move && (p.phase === 'startup' || p.phase === 'active')) || (p.sp === 'charge' || p.sp === 'dash' || p.sp === 'rise');
      if (threat && p.serial !== this.reacted) {
        this.reacted = p.serial;
        const reach = p.sp ? 900 : (REACH[p.move.id] || 260);
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
          } else if (r < D.parry + block + dodge && p.phase !== 'active') {
            this.enter('DODGE');
            c.hold.add(this.keys()[1]);
            c.press('dash');
            this.plan = null;
          }
        }
      }

      // anticipation: the opponent walks into striking range -> maybe guard before they swing
      if (this.state === 'IDLE' && !p.move && !p.sp && p.state === 'walk' && dist < 280 && Math.abs(p.vx) > 50 &&
          Math.sign(me.x - p.x) === Math.sign(p.vx) && chance(D.anticipate)) {
        this.enter('BLOCK');
        this.blockTimer = rand(14, 30);
        this.crouchBlk = chance(0.3);
      }

      // punish whiffed moves and parried/staggered opponents
      const whiffed = (p.move && p.phase === 'recovery' && !p.contact) || p.state === 'stagger' || p.state === 'landing' || p.sp === 'whiff' || p.sp === 'blocked';
      if (whiffed && p.serial !== this.punished && this.state !== 'PUNISH') {
        this.punished = p.serial;
        const sure = p.state === 'stagger';
        if (chance(sure ? Math.max(D.punish, 0.6) : D.punish)) {
          let steps;
          if (dist < 215) steps = this.comboSteps(true);
          else if (dist < 285) steps = ['kick', 'kick'];
          else if (dist < 470) steps = ['dash', 'light'];
          if (steps) this.startPlan('PUNISH', steps);
        }
      }

      // anti-air
      if (!p.grounded && p.air !== this.antiAired && (p.state === 'air' || p.state === 'attack') && dist < 340) {
        const approaching = Math.sign(me.x - p.x) === Math.sign(p.vx) || Math.abs(p.vx) < 50;
        if (approaching) {
          this.antiAired = p.air;
          if (chance(D.antiAir)) this.startPlan('ATTACK', ['dheavy']);
          else if (chance(D.block)) {
            this.enter('BLOCK');
            this.blockTimer = 30;
            this.crouchBlk = false;
          }
        }
      }
    }

    comboSteps(punish) {
      const D = this.D;
      let steps = SA.M.pick(punish ? COMBOS.slice(0, 3) : COMBOS);
      const depth = chance(D.comboChance) ? D.comboDepth : 1;
      return steps.slice(0, Math.max(1, depth));
    }

    startPlan(state, steps) {
      this.plan = { steps, i: 0, wait: 0 };
      this.enter(state, 90);
    }

    // Executes one step: presses buttons through the controller.
    doStep(step, fwd) {
      const c = this.ctrl;
      if (step === 'dash') { c.hold.add(fwd); c.press('dash'); return; }
      if (step === 'jump') { c.hold.add(fwd); c.press('up'); return; }
      if (step === 'special') { c.press('special'); return; }
      if (step[0] === 'd' && step !== 'dash') { c.hold.add('down'); c.press(step.slice(1)); return; }
      c.press(step);
    }

    runPlan(fwd, back, dist) {
      const me = this.me, plan = this.plan, c = this.ctrl;
      if (!plan) { this.enter('RECOVER', rand(4, 10)); return; }
      const step = plan.steps[plan.i];
      const prev = plan.i > 0 ? plan.steps[plan.i - 1] : null;
      if (prev === 'dash' && (me.state === 'dash' || me.state === 'run')) c.hold.add(fwd);
      if (prev === 'jump' && (me.state === 'prejump' || me.state === 'air')) c.hold.add(fwd);

      if (!step) {
        // plan finished: wait for the last action to end
        if (me.isNeutral()) this.enter('RECOVER', rand(4, 12) * (this.D.safe ? 1 : 1.5));
        return;
      }
      if (plan.i === 0) {
        if (me.isNeutral() || me.state === 'run') {
          if (step[0] === 'd' && step !== 'dash') c.hold.add('down');
          this.doStep(step, fwd);
          plan.i++;
        }
        return;
      }
      if (prev === 'dash') {
        if (me.state === 'dash' || me.state === 'run') {
          if (dist < 330 || me.st > 10) { this.doStep(step, fwd); plan.i++; }
        } else if (me.isNeutral()) this.plan.i = plan.steps.length;
        return;
      }
      if (prev === 'jump') {
        if (me.state === 'air' && (dist < 250 || me.vy > 150)) { this.doStep(step, fwd); plan.i++; }
        else if (me.isNeutral()) this.plan.i = plan.steps.length;
        return;
      }
      // a clean hit with full energy: cancel straight into the special
      if (me.state === 'attack' && me.moveContact === 'hit' && me.energy >= 100 && this.diffName !== 'easy' && chance(0.08)) {
        c.press('special');
        plan.i = plan.steps.length;
        return;
      }
      // chained attacks: continue only after contact; hard AI stops when blocked
      if (me.state === 'attack') {
        if (me.moveContact === 'hit' || (me.moveContact === 'block' && !this.D.safe && chance(0.5))) {
          if (step[0] === 'd' && step !== 'dash') c.hold.add('down');
          this.doStep(step, fwd);
          plan.i++;
        } else if (me.moveContact === 'block' || (me.phase === 'recovery' && !me.moveContact)) {
          plan.i = plan.steps.length;
          if (me.moveContact === 'block' && chance(this.D.block)) {
            this.recoverGuard = true;
          }
        }
      } else if (me.isNeutral()) {
        plan.i = plan.steps.length;
      }
    }

    // Small movements around the preferred range so the AI never stands still like a statue.
    footsies(dist, fwd, back) {
      const c = this.ctrl;
      this.moveTimer -= 1;
      if (this.moveTimer <= 0) {
        const want = this.desired + rand(-1, 1) * this.D.spacing;
        if (dist > want + 50) this.moveDir = 1;
        else if (dist < want - 60) this.moveDir = -1;
        else this.moveDir = weighted([[2, 0], [1, 1], [1, -1]]);
        this.moveTimer = rand(8, 26);
      }
      if (Math.abs(this.me.x) > SA.WALL - 80 && this.moveDir < 0) this.moveDir = 0;
      if (this.moveDir > 0) c.hold.add(fwd);
      else if (this.moveDir < 0) c.hold.add(back);
    }

    decide(p, dist) {
      const D = this.D, prof = this.profile, w = prof.weights, me = this.me;
      const aggr = this.aggr();
      this.timer = rand(D.think[0], D.think[1]);
      this.desired = prof.range + rand(-1, 1) * D.spacing;

      if (p.state === 'down' || p.state === 'getup' || p.state === 'ko') {
        if (dist > 330) this.enter('APPROACH', 40);
        return;
      }
      if (me.energy >= 100) {
        const storm = me.specialId === 'storm';
        const inRange = storm ? dist < 260 : dist < 560 && dist > 110;
        if (inRange && chance(0.3 * aggr)) {
          this.startPlan('ATTACK', ['special']);
          return;
        }
      }
      if (chance(D.mistakes)) {
        this.startPlan('ATTACK', [SA.M.pick(['heavy', 'kick', 'dkick', 'light'])]);
        return;
      }
      const lowHp = me.hp / me.maxHp < 0.3;

      let choice;
      if (dist > 560) {
        choice = weighted([[3, 'approach'], [w.dashPunch * aggr * 0.4, 'dashIn'], [0.4, 'wait']]);
      } else if (dist > 300) {
        choice = weighted([
          [2.2, 'approach'],
          [w.dashPunch * aggr, 'dashPunch'],
          [w.slideKick * aggr, 'slideKick'],
          [w.jumpIn * aggr * (prof.jumpiness * 4), 'jumpIn'],
          [1.2 * (1.2 - aggr), 'wait'],
          [lowHp ? 1 : 0.3, 'retreat'],
        ]);
      } else {
        choice = weighted([
          [w.combo * aggr, 'combo'],
          [w.jab, 'jab'],
          [dist > 180 ? w.kick : w.kick * 0.4, 'kick'],
          [w.lowKick, 'lowKick'],
          [w.heavy * aggr, 'heavy'],
          [(1.3 * (1.3 - aggr) + (lowHp ? 1 : 0)) * D.guard, 'guard'],
          [0.6 * (prof.dodgeMul || 1), 'backoff'],
          [0.4, 'crouchJab'],
        ]);
      }

      const [fwd] = this.keys();
      switch (choice) {
        case 'approach': this.enter('APPROACH', rand(20, 50)); break;
        case 'dashIn': this.ctrl.hold.add(fwd); this.ctrl.press('dash'); this.enter('IDLE', 20); break;
        case 'dashPunch': this.startPlan('ATTACK', ['dash', 'light']); break;
        case 'slideKick': this.startPlan('ATTACK', ['dash', 'kick']); break;
        case 'jumpIn': this.startPlan('ATTACK', ['jump', chance(0.6) ? 'kick' : 'light']); break;
        case 'wait': this.enter('IDLE', rand(10, 30)); break;
        case 'retreat': this.enter('RETREAT', rand(15, 35)); break;
        case 'combo': this.startPlan('COMBO', this.comboSteps(false)); break;
        case 'jab': this.startPlan('ATTACK', ['light']); break;
        case 'kick': this.startPlan('ATTACK', ['kick']); break;
        case 'lowKick': this.startPlan('ATTACK', chance(D.comboChance) ? ['dkick', 'light'] : ['dkick']); break;
        case 'heavy': this.startPlan('ATTACK', ['heavy']); break;
        case 'crouchJab': this.startPlan('ATTACK', ['dlight']); break;
        case 'guard':
          this.enter('BLOCK');
          this.blockTimer = rand(18, 40);
          this.crouchBlk = chance(0.35);
          break;
        case 'backoff':
          this.enter('DODGE');
          this.ctrl.hold.add(this.keys()[1]);
          this.ctrl.press('dash');
          break;
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
      return `${this.state}  sees:${p ? p.state + (p.phase ? '/' + p.phase : '') : '?'}  d:${Math.round(this.dist || 0)}  plan:${plan}`;
    }
  }

  SA.EnemyAI = EnemyAI;
})(window.SA);
