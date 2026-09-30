'use strict';
/*
 * Game: fixed-step loop, scenes (menus / fight / arena / training), round flow, hit stop,
 * slow motion, rendering order, graphics presets, touch overlay, stats, rewards & unlocks.
 */
(function (SA) {
  const { clamp, approach } = SA.M;

  // Graphics presets. Combat simulation is identical on every preset (fixed 60 Hz step).
  const GFX = {
    high: { res: 1, particles: 1, weather: 1, foreground: true, reflections: true, rays: true, ghosts: true, rims: 2 },
    medium: { res: 0.8, particles: 0.6, weather: 0.6, foreground: true, reflections: true, rays: false, ghosts: true, rims: 1 },
    low: { res: 0.6, particles: 0.35, weather: 0.3, foreground: false, reflections: false, rays: false, ghosts: false, rims: 1 },
  };

  const FACE_DEADZONE = 14;   // px the opponent must be behind before a fighter turns around

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      SA.game = this;
      SA.Save.load();
      this.input = new SA.InputManager(canvas);
      this.touch = new SA.TouchControls(this, this.input);
      this.input.touch = this.touch;
      this.camera = new SA.Camera();
      this.particles = new SA.ParticleSystem(900);
      this.projectiles = new SA.ProjectileSystem(SA.BALANCE.ranged.maxProjectiles);
      this.debug = { overlay: false, hitboxes: false, ai: false, fps: false };
      this.scene = 'menu';
      this.mode = 'demo';
      this.hitstop = 0;
      this.timeScale = 1;
      this.slowTimer = 0;
      this.slowScale = 1;
      this.darken = 0;
      this.fps = 60;
      this.acc = 0;
      this.last = performance.now();
      this.paused = false;
      this.fade = 0;
      this.transition = null;
      this.bossFx = null;
      this.arenaRun = null;
      this.training = { infiniteHp: true, infiniteEnergy: true, dummy: 'stand', tryItem: null };
      this.ui = new SA.UI(this);
      this.applySettings(true);
      this.fitCanvas();
      window.addEventListener('resize', () => this.fitCanvas());
      window.addEventListener('orientationchange', () => setTimeout(() => this.fitCanvas(), 200));
      this.setupWorld({ mode: 'demo', arena: SA.Save.data.progression.lastArena || 'temple' });
      this.fade = 1;
      this.transition = { phase: 'in' };
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------- display ----------
    // CSS size keeps 16:9 inside the safe area; the backing store follows devicePixelRatio (max 2).
    fitCanvas() {
      const stage = this.canvas.parentElement;
      const cs = getComputedStyle(stage);
      const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const w = Math.max(1, Math.min(aw, ah * 16 / 9)), h = w * 9 / 16;
      this.canvas.style.width = Math.round(w) + 'px';
      this.canvas.style.height = Math.round(h) + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.deviceScale = Math.min(1, (w * dpr) / SA.W);
      this.updateRenderScale();
      if (SA.Device.isPortrait && SA.Device.isTouch && this.scene === 'fight' && !this.paused && this.pauseAllowed()) this.pause();
    }

    updateRenderScale() {
      const q = Math.max(0.4, (this.deviceScale || 1) * SA.GFX.res * (this.autoScale || 1));
      const rounded = Math.round(q * 20) / 20;
      if (this.renderScale === rounded) return;
      this.renderScale = rounded;
      this.canvas.width = Math.round(SA.W * rounded);
      this.canvas.height = Math.round(SA.H * rounded);
    }

    applySettings(gfxChanged) {
      const s = SA.Save.data.settings;
      SA.audio.setVolumes({ master: s.master, sfx: s.sfx, music: s.music });
      this.camera.shakeEnabled = s.shake;
      if (gfxChanged || !SA.GFX) {
        const preset = s.graphics === 'auto' ? (SA.Device.isTouch ? 'medium' : 'high') : s.graphics;
        SA.GFX = GFX[preset] || GFX.high;
        this.autoScale = 1;
        this.updateRenderScale();
        if (this.arena && this.arena.built) this.arena.initWeather();
      }
    }

    // AUTO graphics: if the frame rate stays low during a fight, lower resolution and effects.
    autoQuality(dt) {
      if (SA.Save.data.settings.graphics !== 'auto' || this.manual) return;
      if (this.fps < 48 && this.scene === 'fight') this.slowFor = (this.slowFor || 0) + dt;
      else this.slowFor = 0;
      if (this.slowFor > 3) {
        this.slowFor = -3;
        if (SA.GFX === GFX.high) SA.GFX = GFX.medium;
        else if (SA.GFX === GFX.medium) SA.GFX = GFX.low;
        else if ((this.autoScale || 1) > 0.7) this.autoScale = (this.autoScale || 1) * 0.85;
        else return;
        this.updateRenderScale();
        this.ui.toast('GRAPHICS LOWERED FOR SMOOTHNESS');
      }
    }

    get fightLocked() {
      if (this.mode !== 'fight' && this.mode !== 'arena') return false;
      return !this.match || this.match.phase !== 'fight';
    }

    get silentSfx() { return this.mode === 'demo'; }

    // ---------- world setup ----------
    playerLoadout() {
      const eq = SA.Save.data.inventory.equipped;
      const lo = { weapon: eq.primary, ranged: eq.ranged, special: eq.special, cosmetic: eq.cosmetic };
      const t = this.mode === 'training' && this.training.tryItem;
      if (t) {
        const cat = SA.Items.category(t);
        if (cat === 'weapons') { lo.weapon = t; if (SA.WEAPONS[t].special) lo.special = SA.WEAPONS[t].special; }
        else if (cat === 'throwables' || cat === 'firearms') lo.ranged = t;
        else if (cat === 'specials') lo.special = t;
      }
      return lo;
    }

    setupWorld(o) {
      const P = SA.Save.data.progression;
      this.mode = o.mode;
      const arenaId = o.arena || 'temple';
      if (!this.arena || this.arena.id !== arenaId) {
        if (this.arena) this.arena.dispose();
        this.arena = new SA.Arena(arenaId);
      }
      this.arena.build();
      this.difficulty = o.difficulty || P.difficulty;
      this.projectiles.clear();
      this.bossFx = null;

      const demo = this.mode === 'demo';
      const pc = demo ? new SA.Controller() : new SA.PlayerController(this.input);
      if (demo) {
        const w = SA.M.pick(['katana', 'fists', 'spear', 'dual_blades', 'war_hammer']);
        this.p1 = SA.createFighter('shadow', pc, { weapon: w, special: 'rush' });
      } else {
        const lo = this.playerLoadout();
        this.p1 = SA.createFighter('shadow', pc, { isPlayer: true, weapon: lo.weapon, ranged: lo.ranged, special: lo.special, cosmetic: lo.cosmetic });
      }

      let profile;
      if (this.mode === 'arena' && o.enemy) {
        this.enemyDef = o.enemy;
        this.p2 = SA.EnemyGen.createFighter(o.enemy, new SA.Controller());
        profile = o.enemy.ai;
      } else {
        this.enemyDef = null;
        const oppId = this.mode === 'training' ? 'dummy' : SA.ARENAS[arenaId].opponent;
        const demoWeapon = demo ? SA.M.pick(['fists', 'katana', 'bo_staff', 'great_sword']) : null;
        this.p2 = SA.createFighter(oppId, new SA.Controller(), {
          special: oppId === 'kitsune' || oppId === 'oni' ? 'storm' : 'rush', weapon: demoWeapon || undefined,
        });
        profile = SA.CHARACTERS[oppId].ai;
      }
      this.p1.game = this.p2.game = this;
      this.p1.side = 0; this.p2.side = 1;

      if (this.mode === 'arena') {
        const AIClass = o.enemy.kind === 'boss' ? SA.BossAI : SA.EnemyAI;
        this.ai2 = new AIClass(this.p2, this.p1, this, { params: o.enemy.params, profile, abilities: o.enemy.abilities, mode: 'fight' });
        if (o.enemy.kind === 'boss') this.bossFx = { phase: 0, tint: o.enemy.tint, fx: o.enemy.fx };
      } else {
        this.ai2 = new SA.EnemyAI(this.p2, this.p1, this, {
          difficulty: demo ? 'hard' : this.difficulty, profile,
          mode: this.mode === 'training' ? 'dummy' : 'fight', dummy: this.training.dummy,
        });
      }
      this.ai1 = demo ? new SA.EnemyAI(this.p1, this.p2, this, { difficulty: 'hard', profile: SA.CHARACTERS.volt.ai }) : null;

      const timed = this.mode === 'fight' || this.mode === 'arena';
      this.match = { round: 1, wins: [0, 0], timer: 60, phase: timed ? 'intro' : 'fight', t: 0, stage: 0, stats: { maxCombo: 0, damage: 0, parries: 0 } };
      this.resetRound();
      if (this.mode === 'arena' && this.arenaRun) this.p1.energy = this.arenaRun.energy || 0;
      this.particles.clear();
      this.ui.resetHud();
      this.paused = false;
      this.touch.releaseAll();

      const boss = this.mode === 'arena' && o.enemy.kind === 'boss';
      SA.audio.startMusic(demo ? 'menu' : boss ? 'boss' : SA.ARENAS[arenaId].music);
      SA.audio.setAmbience(SA.ARENAS[arenaId].ambience);
      SA.audio.setMusicIntensity(1);
    }

    resetRound() {
      const keepEnergy = [this.p1.energy, this.p2.energy];
      this.p1.reset(-320, 1);
      this.p2.reset(320, -1);
      const timed = this.mode === 'fight' || this.mode === 'arena';
      if (timed) { this.p1.energy = keepEnergy[0]; this.p2.energy = keepEnergy[1]; }
      else { this.p1.energy = this.mode === 'training' ? 100 : 0; this.p2.energy = 0; }
      this.p2.infiniteHp = !timed;
      this.p1.infiniteHp = !timed;
      this.ai2.reset();
      if (this.ai1) this.ai1.reset();
      this.camera.focus = null;
      this.camera.snap(this.p1, this.p2);
      this.hitstop = 0;
      this.slowTimer = 0;
      this.timeScale = 1;
      this.darken = 0;
      this.projectiles.clear();
      for (const f of [this.p1, this.p2]) f.postUpdate(1, this);
      const m = this.match;
      const B = SA.BALANCE.arena;
      m.timer = this.mode === 'arena' ? (this.enemyDef && this.enemyDef.kind === 'boss' ? B.bossRoundTime : B.roundTime) : 60;
      m.t = 0;
      m.stage = 0;
      m.phase = timed ? 'intro' : 'fight';
      if (timed && m.round === 1) {
        for (const f of [this.p1, this.p2]) {
          f.setState('intro');
          SA.Anim.copyPose(f.pose, SA.POSES.attention);
          f.postUpdate(1, this);
        }
      }
    }

    startFight(arenaId) {
      this.arenaRun = null;
      this.transitionTo(() => {
        this.scene = 'fight';
        this.setupWorld({ mode: 'fight', arena: arenaId });
      });
    }

    startTraining(opts) {
      const P = SA.Save.data.progression;
      this.arenaRun = null;
      this.training.tryItem = (opts && opts.tryItem) || null;
      this.transitionTo(() => {
        this.scene = 'fight';
        this.setupWorld({ mode: 'training', arena: P.lastArena || 'temple' });
        this.buildTrainingMenu();
        if (this.training.tryItem) this.ui.toast('TRYING ' + SA.Items.get(this.training.tryItem).name.toUpperCase());
      });
    }

    toMenu(screen) {
      this.transitionTo(() => {
        this.scene = 'menu';
        this.paused = false;
        this.arenaRun = null;
        this.training.tryItem = null;
        this.setupWorld({ mode: 'demo', arena: SA.Save.data.progression.lastArena || 'temple' });
        this.ui.go(screen || 'main');
      });
    }

    transitionTo(cb) {
      if (this.transition && this.transition.phase === 'out') return;
      this.transition = { phase: 'out', cb };
    }

    // ---------- pause / training / results menus ----------
    pauseAllowed() {
      const m = this.match;
      return m && m.phase !== 'matchEnd' && !(this.arenaRun && this.arenaRun.screen);
    }

    pause() {
      this.paused = true;
      this.showMoves = false;
      this.buildPauseMenu();
      this.p1.ctrl.clear();
      this.touch.releaseAll();
    }

    buildPauseMenu() {
      const training = this.mode === 'training';
      const T = this.training;
      const items = [{ label: 'RESUME', action: () => { this.paused = false; } }];
      if (training) {
        const dummies = ['stand', 'block', 'random', 'cpu'];
        const names = { stand: 'STAND', block: 'BLOCK ALL', random: 'RANDOM BLOCK', cpu: 'CPU FIGHTS' };
        const cyc = (d) => {
          T.dummy = dummies[(dummies.indexOf(T.dummy) + d + dummies.length) % dummies.length];
          this.ai2.dummy = T.dummy;
          this.ai2.reset();
        };
        items.push(
          { label: 'DUMMY', value: () => names[T.dummy], left: () => cyc(-1), right: () => cyc(1) },
          { label: 'INFINITE HEALTH', value: () => (T.infiniteHp ? 'ON' : 'OFF'), left: () => { T.infiniteHp = !T.infiniteHp; }, right: () => { T.infiniteHp = !T.infiniteHp; } },
          { label: 'INFINITE ENERGY', value: () => (T.infiniteEnergy ? 'ON' : 'OFF'), left: () => { T.infiniteEnergy = !T.infiniteEnergy; }, right: () => { T.infiniteEnergy = !T.infiniteEnergy; } },
          { label: 'DAMAGE NUMBERS', value: () => (SA.Save.data.settings.damageNumbers ? 'ON' : 'OFF'), left: () => this.ui.toggle('damageNumbers'), right: () => this.ui.toggle('damageNumbers') },
          { label: 'SHOW HITBOXES', value: () => (this.debug.hitboxes ? 'ON' : 'OFF'), left: () => { this.debug.hitboxes = !this.debug.hitboxes; }, right: () => { this.debug.hitboxes = !this.debug.hitboxes; } },
          { label: 'RESET POSITION', action: () => { this.resetRound(); this.paused = false; } },
        );
      } else if (this.mode === 'arena') {
        items.push({ label: 'END RUN', action: () => { this.paused = false; SA.ArenaMode.end(this, true); } });
      } else {
        items.push({ label: 'RESTART MATCH', action: () => { this.paused = false; this.startFight(this.arena.id); } });
      }
      items.push(
        { label: 'MOVE LIST', action: () => { this.showMoves = true; } },
        { label: SA.Device.isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN', action: () => SA.Device.toggleFullscreen() },
        { label: 'QUIT TO MENU', action: () => this.toMenu() },
      );
      this.pauseMenu = new SA.UI.Menu(items, {
        x: SA.W / 2 - 330, y: training ? 380 : 420, spacing: 62, size: 34, width: 660,
        onBack: () => { this.paused = false; },
      });
    }

    buildTrainingMenu() { this.buildPauseMenu(); }

    buildResultsMenu(won) {
      const P = SA.Save.data.progression;
      const idx = SA.ARENA_ORDER.indexOf(this.arena.id);
      const next = SA.ARENA_ORDER[idx + 1];
      const items = [{ label: 'REMATCH', action: () => this.startFight(this.arena.id) }];
      if (won && next && P.unlockedArenas.indexOf(next) >= 0) {
        items.push({ label: 'NEXT ARENA', action: () => { P.lastArena = next; SA.Save.save(); this.startFight(next); } });
      }
      items.push({ label: 'MAIN MENU', action: () => this.toMenu() });
      this.resultsMenu = new SA.UI.Menu(items, { x: SA.W / 2, y: 780, spacing: 72, size: 38, width: 520, align: 'center' });
    }

    // ---------- effects API used by combat ----------
    impactFlash(v) { this.flash = Math.max(this.flash || 0, v); }
    hitStop(frames) { this.hitstop = Math.max(this.hitstop, Math.round(frames)); }
    shake(v) { this.camera.addTrauma(v); }
    slowMo(scale, dur) {
      if (this.slowTimer > 0) this.slowScale = Math.min(this.slowScale, scale);
      else this.slowScale = scale;
      this.slowTimer = Math.max(this.slowTimer, dur);
    }
    label(textStr, x, y, color, fighter, scale) {
      SA.FX.label(this.particles, x, y, textStr, color, scale);
    }

    get ranked() { return this.mode === 'fight' || this.mode === 'arena'; }

    onHit(a, b, dmg, m, hit) {
      const S = SA.Save.data;
      if (S.settings.damageNumbers || this.mode === 'training') {
        SA.FX.damageNumber(this.particles, hit.x, hit.y - 40, dmg, hit.region === 'head' ? '#ffd36b' : '#ffffff', dmg >= 80);
      }
      let bestLen = 0;
      for (const c of SA.COMBO_NAMES) {
        const seq = a.combo.seq;
        if (seq.length < c.seq.length || c.seq.length <= bestLen) continue;
        let ok = true;
        for (let i = 0; i < c.seq.length; i++) if (seq[seq.length - c.seq.length + i] !== c.seq[i]) { ok = false; break; }
        if (ok) { a.combo.name = c.name; bestLen = c.seq.length; }
      }
      this.ui.onComboHit(a.side, a);
      if (a.isPlayer && this.ranked) {
        this.match.stats.damage += dmg;
        SA.Save.stat('totalDamage', dmg);
      }
      if (this.ranked) SA.audio.setMusicIntensity(this.bossFx ? 1 + this.bossFx.phase * 0.3 : 1);
    }
    onBlock() {}
    onParry(defender) {
      if (defender.isPlayer && this.ranked) {
        this.match.stats.parries++;
        SA.Save.stat('parries');
      }
    }
    onSpecialStart(f) {
      this.darken = 1;
      this.slowMo(0.3, 0.32);
      this.camera.punch(0.12);
      this.shake(0.2);
      SA.audio.play('special');
      SA.FX.special(this.particles, f.x, f.y, f.look.accent);
      this.ui.showBanner(SA.SPECIALS[f.specialId].name, f.side, f.look.accent);
      if (f.isPlayer) SA.Device.vibrate(25);
    }
    onSpecialLanded(f) {
      if (f.isPlayer && this.ranked) SA.Save.stat('specialsLanded');
    }

    endCombo(a) {
      const c = a.combo;
      if (c.hits >= 2) {
        this.ui.onComboEnd(a.side);
        if (a.isPlayer && this.ranked) {
          SA.Save.stat('maxCombo', c.hits, 'max');
          SA.Save.stat('maxDamage', c.damage, 'max');
          this.match.stats.maxCombo = Math.max(this.match.stats.maxCombo, c.hits);
        }
      }
      a.startCombo();
    }

    // ---------- loop ----------
    frame(now) {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (dt > 0) this.fps = this.fps * 0.93 + (1 / dt) * 0.07;
      this.acc += dt;
      let steps = 0;
      if (this.manual) this.acc = 0; // tests step the simulation themselves
      while (this.acc >= SA.STEP && steps < 5) {
        this.tick();
        this.acc -= SA.STEP;
        steps++;
      }
      if (steps >= 5) this.acc = 0;
      this.updateTransition(dt);
      this.autoQuality(dt);
      this.ui.update(dt);
      this.render();
      requestAnimationFrame((t) => this.frame(t));
    }

    updateTransition(dt) {
      const tr = this.transition;
      if (!tr) return;
      if (tr.phase === 'out') {
        this.fade = Math.min(1, this.fade + dt * 4);
        if (this.fade >= 1) {
          tr.cb();
          this.transition = { phase: 'in' };
        }
      } else {
        this.fade = Math.max(0, this.fade - dt * 2.5);
        if (this.fade <= 0) this.transition = null;
      }
    }

    tick() {
      const presses = this.input.drain();
      const mouse = this.input.takeMouse();
      this.handleDebugKeys(presses);
      if (this.transition && this.transition.phase === 'out') { this.updateWorld(); return; }

      if (this.scene !== 'fight') {
        this.ui.menuInput(presses, mouse);
        this.updateWorld();
        return;
      }

      const m = this.match;
      const run = this.arenaRun;
      if (run && run.screen) {
        run.screenT = (run.screenT || 0) + SA.STEP;   // fixed 60 Hz, independent of display refresh rate
        if (run.menu && run.screenT > 0.6) run.menu.handle(presses, mouse);
        this.updateWorld();
        return;
      }
      if (m.phase === 'matchEnd') {
        if (this.resultsMenu && m.t > 1.2) this.resultsMenu.handle(presses, mouse);
        this.updateWorld();
        return;
      }
      if (this.paused) {
        if (this.showMoves) {
          if (presses.some((a) => a === 'pause' || a === 'confirm' || a === 'back' || a === 'light' || a === 'heavy') || (mouse && mouse.clicked)) {
            this.showMoves = false;
            SA.audio.play('ui_back');
          }
        } else if (this.pauseMenu) {
          this.pauseMenu.handle(presses, mouse);
        }
        return;
      }
      if (presses.indexOf('pause') >= 0) {
        this.pause();
        SA.audio.play('ui_ok');
        return;
      }
      if (this.mode === 'training' && presses.indexOf('reset') >= 0) this.resetRound();
      if (this.p1.ctrl.sync) this.p1.ctrl.sync(presses);
      this.updateWorld();
    }

    handleDebugKeys(presses) {
      for (const a of presses) {
        if (a === 'f1') this.debug.overlay = !this.debug.overlay;
        else if (a === 'f2') this.debug.hitboxes = !this.debug.hitboxes;
        else if (a === 'f3') this.debug.ai = !this.debug.ai;
        else if (a === 'f4') this.debug.fps = !this.debug.fps;
        // ---- DEVELOPMENT CHEATS (for testing progression; not part of normal play) ----
        else if (a === 'f5') { SA.Progression.addCoins(1000); SA.Save.save(); this.ui.toast('DEV: +1000 COINS'); }
        else if (a === 'f6') { const p = SA.Save.data.player; SA.Progression.addXp(SA.Progression.xpToNext(p.level) - p.xp); SA.Save.save(); this.ui.toast('DEV: LEVEL ' + p.level); }
        else if (a === 'f7') { SA.ArenaMode.skipStage(this); this.ui.toast('DEV: STAGE SKIPPED'); }
        else if (a === 'f8') {
          if (this.mode === 'arena' && this.arenaRun) SA.ArenaMode.spawnBoss(this);
          else SA.ArenaMode.start(this, { stage: 10, forceBoss: true });
          this.ui.toast('DEV: BOSS');
        }
      }
    }

    updateWorld() {
      const p1 = this.p1, p2 = this.p2, cam = this.camera;
      const realDt = SA.STEP;
      for (const f of [p1, p2]) {
        if (f.hitShake > 0) f.hitShake--;
        if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - realDt * 7);
      }
      if (this.hitstop > 0) {
        this.hitstop--;
        this.flash = Math.max(0, (this.flash || 0) - realDt * 1.5);
        this.particles.update(realDt * 0.2);
        cam.update(realDt, p1, p2);
        return;
      }
      if (this.slowTimer > 0) {
        this.slowTimer -= realDt;
        this.timeScale = this.slowScale;
      } else {
        this.timeScale = approach(this.timeScale, 1, realDt * 3);
      }
      const ts = this.timeScale;
      const dt = realDt * ts;

      if (this.ai1) this.ai1.update(ts);
      this.ai2.update(ts);
      p1.update(ts, this);
      p2.update(ts, this);
      SA.Physics.separate(p1, p2);
      SA.Physics.limitSeparation(p1, p2);
      this.updateFacing(p1, p2);
      this.updateFacing(p2, p1);
      p1.postUpdate(ts, this);
      p2.postUpdate(ts, this);

      // resolve both attacks against the same snapshot so trades are possible
      const h1 = p1.activeHit(), h2 = p2.activeHit();
      if (h1) SA.Combat.check(p1, p2, this, h1);
      if (h2) SA.Combat.check(p2, p1, this, h2);
      this.projectiles.update(dt, this);

      for (const [a, b] of [[p1, p2], [p2, p1]]) {
        if (a.combo.hits > 0 && !b.isStunned()) this.endCombo(a);
        if (a.energy >= 100 && Math.random() < 0.4 * ts) SA.FX.aura(this.particles, a.x, a.y, a.look.accent);
      }
      if (this.bossFx && this.bossFx.phase > 0 && Math.random() < 0.25 * this.bossFx.phase) {
        SA.FX.aura(this.particles, p2.x, p2.y, p2.look.accent);
      }

      this.updateMatch(dt, realDt);

      this.particles.update(dt);
      this.arena.update(dt, cam);
      cam.update(realDt, p1, p2);
      this.darken = Math.max(0, this.darken - realDt * 1.6);
      this.flash = Math.max(0, (this.flash || 0) - realDt * 4);
    }

    // Turn to face the opponent once it is clearly behind (deadzone = no left/right flicker when the
    // two stand on top of each other). Walking / idle turns play a short pivot, never block input.
    updateFacing(f, o) {
      if (!f.grounded) return;
      const st = f.state;
      if (!(f.isNeutral() || st === 'landing' || st === 'prejump' || st === 'getup' || st === 'run' || st === 'sprint')) return;
      const dx = o.x - f.x;
      if (dx * f.facing >= -FACE_DEADZONE) return;
      f.facing = -f.facing;
      if (st === 'run' || st === 'sprint') { f.setState('walk'); f.fwdT = 0; }
      f.turnT = 7;
      if (st === 'walk' || st === 'run' || st === 'idle') SA.FX.dust(this.particles, f.x, 0, 0.45, f.facing);
    }

    // ---------- match flow ----------
    updateMatch(dt, realDt) {
      const m = this.match, p1 = this.p1, p2 = this.p2;
      m.t += realDt;

      if (!this.ranked) {
        // demo & training: nobody dies, health and energy refill
        for (const f of [p1, p2]) {
          if (f.hp <= 0) f.hp = 1;
          const refill = this.mode === 'demo' ? f.hp < f.maxHp * 0.35 : (f === p2 ? this.training.infiniteHp : true);
          if (refill && !f.isStunned() && f.state !== 'down' && f.hp < f.maxHp) {
            f.refillT = (f.refillT || 0) + realDt;
            if (f.refillT > 0.9) { f.hp = f.maxHp; f.refillT = 0; }
          } else f.refillT = 0;
        }
        if (this.mode === 'training' && this.training.infiniteEnergy && p1.state !== 'special') p1.energy = 100;
        if (this.mode === 'training') p2.infiniteHp = this.training.infiniteHp;
        if (this.mode === 'training' && !p2.infiniteHp && p2.hp <= 0) p2.hp = 1;
        return;
      }

      const arena = this.mode === 'arena';
      switch (m.phase) {
        case 'intro':
          if (m.stage === 0) {
            m.stage = 1;
            if (arena) {
              const e = this.enemyDef, run = this.arenaRun;
              const boss = e.kind === 'boss';
              this.ui.showAnnounce(boss ? 'BOSS' : `STAGE ${run.stage}`, {
                dur: 1.5, size: boss ? 190 : 150, color: boss ? '#ff4a3a' : e.kind === 'elite' ? '#ffd27a' : '#ffffff',
                sub: `${e.name.toUpperCase()}${e.title && boss ? '  ·  ' + e.title.toUpperCase() : ''}`,
              });
              SA.audio.play(boss ? 'roar' : 'gong');
            } else {
              this.ui.showAnnounce(m.round === 3 ? 'FINAL ROUND' : `ROUND ${m.round}`, { dur: 1.35, size: m.round === 3 ? 140 : 170, sub: m.round === 1 ? `${p1.name}  VS  ${p2.name}` : null });
              SA.audio.play('gong');
            }
          }
          if (m.stage === 1 && m.t > 1.6) {
            m.stage = 2;
            this.ui.showAnnounce('FIGHT!', { dur: 0.8, size: 200, color: '#fff4de', brushColor: '#b01d31' });
            SA.audio.play('fight');
            this.shake(0.25);
          }
          if (m.t > 2.1) {
            m.phase = 'fight';
            for (const f of [p1, p2]) if (f.state === 'intro') f.setState('idle');
            p1.ctrl.clearBuffer();
            p2.ctrl.clearBuffer();
          }
          break;

        case 'fight':
          m.timer -= dt;
          if (p1.hp <= 0 || p2.hp <= 0) this.startKO();
          else if (m.timer <= 0) {
            m.timer = 0;
            m.phase = 'timeup';
            m.t = 0;
            this.ui.showAnnounce('TIME', { dur: 1.6, size: 180 });
            SA.audio.play('gong');
          }
          break;

        case 'ko':
          if (m.t > 3.1) this.endRound();
          break;

        case 'timeup':
          if (m.t > 1.8) this.endRound();
          break;

        case 'roundEnd':
          if (arena) {
            if (m.t > 2.2 && !m.arenaDone) {
              m.arenaDone = true;
              if (m.lastWinner === 0) SA.ArenaMode.onWin(this, m.perfect);
              else SA.ArenaMode.onLoss(this);
              if (m.lastWinner === 0) SA.FX.coinBurst(this.particles, p1.x, p1.y - 200, 24);
            }
          } else if (m.t > 3.0) {
            if (m.wins[0] >= 2 || m.wins[1] >= 2) this.endMatch();
            else {
              m.round++;
              this.resetRound();
              this.ui.resetHud();
              this.particles.clear();
            }
          }
          break;

        case 'matchEnd':
          break;
      }
    }

    startKO() {
      const m = this.match, p1 = this.p1, p2 = this.p2;
      m.phase = 'ko';
      m.t = 0;
      const loser = p1.hp <= 0 ? p1 : p2;
      this.slowMo(0.22, 1.5);
      this.camera.focus = { x: loser.x, zoom: 1.32, y: -40 };
      SA.FX.ko(this.particles, loser.skel.hip.x, loser.y - 160);
      SA.audio.play(loser.isBoss ? 'boss_impact' : 'ko');
      if (loser.isBoss) SA.audio.play('ko');
      SA.audio.setMusicIntensity(0);
      this.ui.showAnnounce(p1.hp <= 0 && p2.hp <= 0 ? 'DOUBLE K.O.' : 'K.O.', { dur: 2.6, size: 230, color: '#ff4040', brushColor: '#1a0000' });
      this.shake(0.6);
      SA.Device.vibrate(loser === p1 ? [40, 30, 60] : 30);
    }

    endRound() {
      const m = this.match, p1 = this.p1, p2 = this.p2;
      const r1 = p1.hp / p1.maxHp, r2 = p2.hp / p2.maxHp;
      let winner = null;
      if (r1 > r2) winner = 0; else if (r2 > r1) winner = 1;
      if (this.mode === 'arena' && winner === null) winner = 1;   // a draw ends the run
      m.phase = 'roundEnd';
      m.t = 0;
      m.lastWinner = winner;
      this.camera.focus = null;
      const S = SA.Save;
      if (winner === null) {
        m.wins[0]++; m.wins[1]++;
        this.ui.showAnnounce('DRAW', { dur: 2.2 });
      } else {
        m.wins[winner]++;
        const w = winner === 0 ? p1 : p2, l = winner === 0 ? p2 : p1;
        const perfect = w.hp >= w.maxHp;
        m.perfect = winner === 0 && perfect;
        if (w.hp > 0 && (w.isNeutral() || w.state === 'hitstun' || w.state === 'blockstun')) { w.cancelMove(); w.setState('victory'); }
        if (l.hp > 0 && l.state !== 'down') { l.cancelMove(); l.setState('defeat'); }
        this.camera.focus = { x: w.x, zoom: 1.2, y: -20 };
        this.ui.showAnnounce(perfect ? 'PERFECT' : `${w.name} WINS`, { dur: 2.4, size: perfect ? 180 : w.name.length > 12 ? 90 : 120, color: perfect ? '#ffe39a' : '#ffffff', spacing: 12 });
        if (winner === 0) {
          S.stat('roundsWon');
          if (l.hp <= 0) S.stat('kos');
          if (perfect) S.stat('perfects');
        } else S.stat('roundsLost');
      }
      this.projectiles.clear();
      S.save();
    }

    endMatch() {
      const m = this.match;
      const S = SA.Save, D = S.data, R = SA.BALANCE.rewards;
      const won = m.wins[0] >= 2 && m.wins[0] > m.wins[1];
      m.phase = 'matchEnd';
      m.t = 0;
      m.won = won;
      this.ui.announce = null;
      this.ui.combo = [null, null];
      m.unlocks = [];
      S.stat('fights');
      S.stat(won ? 'wins' : 'losses');
      // the classic fight also feeds the progression a little
      const mul = SA.BALANCE.arena.rewardMul[D.progression.difficulty] || 1;
      m.coins = Math.round((won ? R.fightWin : R.fightLoss) * mul);
      m.xp = Math.round((won ? R.fightXpWin : R.fightXpLoss) * mul);
      SA.Progression.addCoins(m.coins);
      m.levelUps = SA.Progression.addXp(m.xp);
      if (won) {
        const P = D.progression;
        P.arenaWins[this.arena.id] = (P.arenaWins[this.arena.id] || 0) + 1;
        const idx = SA.ARENA_ORDER.indexOf(this.arena.id);
        const next = idx < 3 ? SA.ARENA_ORDER[idx + 1] : null;
        if (next && S.unlockArena(next)) m.unlocks.push('NEW ARENA  ·  ' + SA.ARENAS[next].name);
      }
      for (const u of m.levelUps) m.unlocks.push(`LEVEL UP  ·  LV ${u.level}  ·  +${u.coins} COINS`);
      S.save();
      if (m.unlocks.length) SA.audio.play('unlock');
      this.buildResultsMenu(won);
      SA.audio.setMusicIntensity(0.3);
    }

    // ---------- rendering ----------
    render() {
      const ctx = this.ctx, cam = this.camera, arena = this.arena, p1 = this.p1, p2 = this.p2;
      SA.resetTransform(ctx);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      arena.drawBack(ctx, cam);

      cam.apply(ctx);
      arena.drawGround(ctx, cam);
      if (arena.reflective && SA.GFX.reflections) {
        ctx.save();
        ctx.scale(1, -0.55);
        ctx.globalAlpha = 0.22;
        for (const f of [p1, p2]) SA.Render.drawSilhouette(ctx, f, '#1a0f2a');
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      for (const f of [p1, p2]) if (!f.vanished) SA.Render.drawShadow(ctx, f, arena.def.shadow);
      arena.drawWeatherWorld(ctx, false);

      if (this.darken > 0) {
        ctx.save();
        SA.resetTransform(ctx);
        ctx.fillStyle = `rgba(4,0,10,${0.6 * clamp(this.darken, 0, 1)})`;
        ctx.fillRect(0, 0, SA.W, SA.H);
        ctx.restore();
      }

      this.particles.draw(ctx, false);
      SA.Render.drawGhosts(ctx, p1);
      SA.Render.drawGhosts(ctx, p2);
      // the attacker is drawn on top so strikes overlap the victim
      const order = p1.state === 'attack' || p1.state === 'special' ? [p2, p1] : [p1, p2];
      const rims = SA.GFX.rims > 1 ? arena.rims : arena.rims.slice(0, 1);
      for (const f of order) if (!f.vanished) SA.Render.drawFighter(ctx, f, rims);
      this.projectiles.draw(ctx);
      this.particles.draw(ctx, true);
      if (this.debug.hitboxes) this.drawHitboxes(ctx);
      arena.drawWeatherWorld(ctx, true);

      SA.resetTransform(ctx);
      arena.drawFront(ctx, cam);
      if (this.bossFx && this.bossFx.tint) {
        const [r, g, b] = this.bossFx.tint;
        const a = 0.04 + this.bossFx.phase * 0.04 + (this.bossFx.phase > 1 ? 0.02 * Math.sin(performance.now() / 180) : 0);
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillRect(0, 0, SA.W, SA.H);
      }
      if (this.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,236,210,${this.flash})`;
        ctx.fillRect(0, 0, SA.W, SA.H);
        ctx.globalCompositeOperation = 'source-over';
      }

      if (this.scene === 'fight') {
        this.ui.drawHUD(ctx);
        this.touch.draw(ctx);
        const m = this.match;
        if (m.phase === 'matchEnd' && m.t > 0.8) this.drawResults(ctx);
        if (this.arenaRun && this.arenaRun.screen) this.ui.drawArenaOverlay(ctx);
        if (this.paused) {
          if (this.showMoves) {
            ctx.fillStyle = 'rgba(3,2,6,0.88)';
            ctx.fillRect(0, 0, SA.W, SA.H);
            this.ui.header(ctx, 'MOVE LIST');
            this.ui.drawControls(ctx, 170, 300, this.p1.weapon.id);
            SA.text(ctx, 'ESC / ENTER / TAP  BACK', SA.W / 2, SA.H - 50, { size: 18, weight: 700, spacing: 5, color: 'rgba(255,255,255,0.5)', align: 'center' });
          } else if (this.pauseMenu) {
            this.ui.drawOverlayMenu(ctx, this.mode === 'training' ? 'TRAINING' : 'PAUSED', this.pauseMenu, this.mode === 'training' ? '← → CHANGE OPTION' : null);
          }
        }
      } else {
        this.ui.drawMenus(ctx);
      }
      this.ui.drawDebug(ctx);

      if (this.fade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
        ctx.fillRect(0, 0, SA.W, SA.H);
      }
    }

    drawResults(ctx) {
      const m = this.match;
      const a = clamp((m.t - 0.8) / 0.5, 0, 1);
      ctx.fillStyle = `rgba(3,2,6,${0.7 * a})`;
      ctx.fillRect(0, 0, SA.W, SA.H);
      ctx.globalAlpha = a;
      SA.text(ctx, m.won ? 'VICTORY' : 'DEFEAT', SA.W / 2, 230, { size: 150, weight: 900, italic: true, spacing: 26, color: m.won ? '#f4e2b8' : '#ff5a5a', align: 'center', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 10, alpha: a });
      const st = m.stats;
      const line = `MAX COMBO  ${st.maxCombo}     ·     DAMAGE DEALT  ${st.damage}     ·     PARRIES  ${st.parries}     ·     ROUNDS  ${m.wins[0]} - ${m.wins[1]}`;
      SA.text(ctx, line, SA.W / 2, 350, { size: 22, weight: 700, spacing: 3, color: 'rgba(255,255,255,0.75)', align: 'center', alpha: a });
      SA.text(ctx, `+ ${m.coins} COINS    ·    + ${m.xp} XP`, SA.W / 2, 410, { size: 30, weight: 900, spacing: 4, color: '#ffe39a', align: 'center', alpha: a });
      (m.unlocks || []).forEach((u, i) => {
        const y = 490 + i * 56;
        const p = 0.6 + 0.4 * Math.sin(this.ui.t * 4 + i);
        SA.text(ctx, u, SA.W / 2, y, { size: 28, weight: 900, spacing: 8, color: `rgba(255,${200 + p * 40},${120 + p * 60},1)`, align: 'center', alpha: a });
      });
      ctx.globalAlpha = 1;
      if (this.resultsMenu && m.t > 1.2) this.resultsMenu.draw(ctx, this.ui.t);
    }

    // F2: movement collider (blue), hurtboxes (green), attack hitbox (red, close-range box dashed),
    // projectiles (yellow), weapon ranges (orange ticks) and the distance readout.
    drawHitboxes(ctx) {
      const p1 = this.p1, p2 = this.p2;
      for (const f of [p1, p2]) {
        const b = f.body;
        ctx.lineWidth = 2;
        ctx.strokeStyle = b.pass ? 'rgba(80,160,255,0.35)' : 'rgba(80,160,255,0.95)';
        ctx.fillStyle = 'rgba(80,160,255,0.08)';
        ctx.fillRect(f.x - b.w / 2, f.y - b.h, b.w, b.h);
        ctx.strokeRect(f.x - b.w / 2, f.y - b.h, b.w, b.h);
        ctx.strokeStyle = f.canBeHit() ? 'rgba(60,255,120,0.9)' : 'rgba(150,150,150,0.7)';
        for (const k of ['head', 'torso', 'legs']) {
          const r = f.hurt[k];
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
        const h = f.activeHit();
        if (h) {
          ctx.fillStyle = 'rgba(255,40,40,0.3)';
          ctx.fillRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
          ctx.strokeStyle = 'rgba(255,60,60,1)';
          ctx.strokeRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
          if (h.near) {
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(h.near.x, h.near.y, h.near.w, h.near.h);
            ctx.setLineDash([]);
          }
        }
        // facing arrow
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y - b.h - 14); ctx.lineTo(f.x + f.facing * 40, f.y - b.h - 14);
        ctx.lineTo(f.x + f.facing * 30, f.y - b.h - 22);
        ctx.stroke();
        // weapon ranges on the ground: min / optimal / max
        const R = f.weapon && f.weapon.ranges;
        if (R) {
          ctx.strokeStyle = 'rgba(255,160,40,0.8)';
          for (const [v, hgt] of [[R.min, 10], [R.opt, 22], [R.max, 14]]) {
            const x = f.x + f.facing * v;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -hgt); ctx.stroke();
          }
        }
      }
      ctx.strokeStyle = 'rgba(255,220,60,0.95)';
      for (const p of this.projectiles.pool) {
        if (!p.alive) continue;
        const r = this.projectiles.rect(p);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
      const d = Math.abs(p2.x - p1.x), minD = SA.Physics.minDistance(p1, p2);
      const mx = (p1.x + p2.x) / 2;
      SA.text(ctx, `DIST ${Math.round(d)}  ·  MIN ${Math.round(minD)}  ·  FACING ${p1.facing > 0 ? '→' : '←'} ${p2.facing > 0 ? '→' : '←'}`, mx, 36,
        { size: 20, weight: 800, spacing: 2, color: d < minD - 1 ? '#ff6060' : '#9fd8ff', align: 'center' });
    }
  }

  Game.GFX = GFX;
  SA.Game = Game;

  window.addEventListener('load', () => {
    const canvas = document.getElementById('game');
    try {
      SA.game = new Game(canvas);
    } catch (e) {
      const el = document.getElementById('boot-error');
      if (el) { el.textContent = 'Shadow Arena failed to start: ' + e.message; el.style.display = 'block'; }
      throw e;
    }
  });
})(window.SA);
