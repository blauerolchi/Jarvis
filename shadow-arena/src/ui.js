'use strict';
/*
 * UI: HUD, announcer, combo counter, menus (keyboard + mouse), pause, results, debug overlay.
 * Everything is drawn on the canvas; no DOM elements during play.
 */
(function (SA) {
  const { clamp, lerp, easeOutCubic, easeOutBack } = SA.M;
  const W = SA.W, H = SA.H;

  // ---------- text helper with letter spacing ----------
  const widthCache = new Map();
  function text(ctx, str, x, y, o) {
    o = o || {};
    const font = `${o.italic ? 'italic ' : ''}${o.weight || 700} ${o.size || 32}px ${o.font || SA.FONT}`;
    ctx.font = font;
    ctx.textBaseline = o.baseline || 'middle';
    const sp = o.spacing || 0;
    ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    let total;
    let widths = null;
    if (sp) {
      const key = font + '|' + str;
      widths = widthCache.get(key);
      if (!widths) {
        widths = [];
        for (const ch of str) widths.push(ctx.measureText(ch).width);
        if (widthCache.size > 600) widthCache.clear();
        widthCache.set(key, widths);
      }
      total = widths.reduce((a, b) => a + b, 0) + sp * Math.max(0, widths.length - 1);
    } else {
      total = ctx.measureText(str).width;
    }
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    const draw = (s, px) => {
      if (o.stroke) { ctx.lineWidth = o.strokeWidth || 6; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, px, y); }
      ctx.fillStyle = o.color || '#fff';
      ctx.fillText(s, px, y);
    };
    if (!sp) draw(str, cx);
    else {
      let i = 0;
      for (const ch of str) { draw(ch, cx); cx += widths[i++] + sp; }
    }
    ctx.globalAlpha = 1;
    return total;
  }
  SA.text = text;

  function skewRect(ctx, x, y, w, h, skew) {
    ctx.beginPath();
    ctx.moveTo(x + skew, y);
    ctx.lineTo(x + w + skew, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  function brush(ctx, x, y, w, h, color, alpha) {
    // ink-brush like highlight stroke
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, SA.rgba(color, 0));
    g.addColorStop(0.08, SA.rgba(color, 0.95));
    g.addColorStop(0.75, SA.rgba(color, 0.85));
    g.addColorStop(1, SA.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.2);
    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.08, x + w, y + h * 0.1);
    ctx.lineTo(x + w * 0.97, y + h * 0.9);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 1.08, x + w * 0.02, y + h * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const ACCENT = '#d7263d';
  const GOLD = '#e9c27a';

  class Menu {
    constructor(items, o) {
      this.items = items;
      this.index = 0;
      this.o = Object.assign({ x: 170, y: 520, spacing: 70, size: 40, align: 'left', width: 520 }, o || {});
      this.rects = [];
      this.hl = null;
      this.onBack = this.o.onBack;
      this.fixIndex(1);
    }
    enabled(i) { const it = this.items[i]; return it && !(it.disabled && it.disabled()); }
    fixIndex(dir) {
      for (let k = 0; k < this.items.length && !this.enabled(this.index); k++) {
        this.index = (this.index + dir + this.items.length) % this.items.length;
      }
    }
    move(d) {
      const n = this.items.length;
      let i = this.index;
      for (let k = 0; k < n; k++) {
        i = (i + d + n) % n;
        if (this.enabled(i)) break;
      }
      if (i !== this.index) { this.index = i; SA.audio.play('ui_move'); }
    }
    handle(presses, mouse) {
      const it = () => this.items[this.index];
      for (const a of presses) {
        if (a === 'up') this.move(-1);
        else if (a === 'down') this.move(1);
        else if (a === 'left' && it().left) { it().left(); SA.audio.play('ui_move'); }
        else if (a === 'right' && it().right) { it().right(); SA.audio.play('ui_move'); }
        else if ((a === 'confirm' || a === 'light' || a === 'special') && this.enabled(this.index)) {
          const item = it();
          if (item.action) { SA.audio.play('ui_ok'); item.action(); }
          else if (item.right) { item.right(); SA.audio.play('ui_move'); }
          return true;
        } else if ((a === 'pause' || a === 'back' || a === 'heavy') && this.onBack) {
          SA.audio.play('ui_back');
          this.onBack();
          return true;
        }
      }
      if (mouse && (mouse.moved || mouse.clicked)) {
        for (let i = 0; i < this.rects.length; i++) {
          const r = this.rects[i];
          if (r && mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h && this.enabled(i)) {
            if (this.index !== i) { this.index = i; SA.audio.play('ui_move'); }
            if (mouse.clicked) {
              const item = this.items[i];
              if (item.action) { SA.audio.play('ui_ok'); item.action(); }
              else if (item.right) { item.right(); SA.audio.play('ui_move'); }
              return true;
            }
          }
        }
      }
      return false;
    }
    draw(ctx, t) {
      const o = this.o;
      const targetY = o.y + this.index * o.spacing;
      this.hl = this.hl === null ? targetY : lerp(this.hl, targetY, 0.3);
      const bx = o.align === 'center' ? o.x - o.width / 2 : o.x - 40;
      brush(ctx, bx, this.hl - o.size * 0.75, o.width + 60, o.size * 1.5, ACCENT, 0.85);
      this.rects.length = 0;
      const hasValues = this.items.some((it) => it.value);
      this.items.forEach((item, i) => {
        const y = o.y + i * o.spacing;
        const sel = i === this.index;
        const dis = item.disabled && item.disabled();
        const label = typeof item.label === 'function' ? item.label() : item.label;
        const val = item.value ? item.value() : null;
        const color = dis ? 'rgba(255,255,255,0.22)' : sel ? '#ffffff' : 'rgba(235,225,215,0.62)';
        const sx = sel ? 10 : 0;
        if ((val !== null || hasValues) && o.align !== 'center') {
          text(ctx, label, o.x + sx, y, { size: o.size * 0.8, weight: 700, spacing: 5, color });
          const vx = o.x + o.width - 20;
          if (val !== null) text(ctx, (item.left ? '‹  ' : '') + val + (item.right ? '  ›' : ''), vx, y, { size: o.size * 0.72, weight: 600, spacing: 3, color: sel ? GOLD : color, align: 'right' });
        } else {
          const lbl = val !== null ? `${label}  ‹ ${val} ›` : label;
          text(ctx, lbl, o.align === 'center' ? o.x : o.x + sx, y, { size: o.size, weight: 800, spacing: 8, color, align: o.align });
        }
        this.rects.push({ x: bx, y: y - o.spacing / 2, w: o.width + 60, h: o.spacing });
      });
    }
  }

  // Big touch-friendly cards laid out in a grid (main menu).
  class CardMenu {
    constructor(cards, o) {
      this.cards = cards;
      this.index = 0;
      this.o = Object.assign({ x: 120, y: 420, w: 500, h: 104, gapX: 30, gapY: 18 }, o || {});
      this.rects = [];
    }
    rect(c) {
      const o = this.o;
      return { x: o.x + c.col * (o.w + o.gapX), y: o.y + c.row * (o.h + o.gapY), w: o.w, h: o.h };
    }
    find(col, row) { return this.cards.findIndex((c) => c.col === col && c.row === row); }
    handle(presses, mouse) {
      const cur = this.cards[this.index];
      const go = (i) => { if (i >= 0 && i !== this.index) { this.index = i; SA.audio.play('ui_move'); } };
      for (const a of presses) {
        if (a === 'up') go(this.find(cur.col, cur.row - 1));
        else if (a === 'down') go(this.find(cur.col, cur.row + 1));
        else if (a === 'left') go(this.find(cur.col - 1, cur.row));
        else if (a === 'right') go(this.find(cur.col + 1, cur.row));
        else if (a === 'confirm' || a === 'light' || a === 'special') { SA.audio.play('ui_ok'); this.cards[this.index].action(); return true; }
      }
      if (mouse && (mouse.moved || mouse.clicked)) {
        for (let i = 0; i < this.cards.length; i++) {
          const r = this.rect(this.cards[i]);
          if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) {
            go(i);
            if (mouse.clicked) { SA.audio.play('ui_ok'); this.cards[i].action(); return true; }
          }
        }
      }
      return false;
    }
    draw(ctx, t) {
      this.cards.forEach((c, i) => {
        const r = this.rect(c), sel = i === this.index;
        const lift = sel ? -4 : 0;
        ctx.save();
        skewRect(ctx, r.x, r.y + lift, r.w, r.h, 16);
        if (sel) {
          const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
          g.addColorStop(0, 'rgba(215,38,61,0.95)');
          g.addColorStop(1, 'rgba(120,14,30,0.75)');
          ctx.fillStyle = g;
        } else ctx.fillStyle = 'rgba(10,6,12,0.66)';
        ctx.fill();
        ctx.strokeStyle = sel ? 'rgba(255,220,210,0.8)' : 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = sel ? '#ffffff' : c.accent || ACCENT;
        ctx.fillRect(r.x + 16, r.y + lift + 18, 5, r.h - 36);
        ctx.restore();
        text(ctx, c.label, r.x + 40, r.y + lift + r.h * 0.4, { size: 36, weight: 900, spacing: 7, color: sel ? '#fff' : 'rgba(240,232,224,0.9)' });
        const sub = typeof c.sub === 'function' ? c.sub() : c.sub;
        if (sub) text(ctx, sub, r.x + 42, r.y + lift + r.h * 0.74, { size: 17, weight: 600, spacing: 3, color: sel ? 'rgba(255,240,235,0.9)' : 'rgba(255,255,255,0.5)' });
        if (c.badge) {
          const b = c.badge();
          if (b) text(ctx, b, r.x + r.w - 20, r.y + lift + r.h * 0.4, { size: 20, weight: 800, spacing: 2, color: GOLD, align: 'right' });
        }
      });
    }
  }

  class UI {
    constructor(game) {
      this.game = game;
      this.t = 0;
      this.announce = null;
      this.banner = null;
      this.combo = [null, null];
      this.lag = [1, 1];
      this.lagDelay = [0, 0];
      this.hpShown = [1, 1];
      this.notice = [];
      this.screen = 'main';
      this.thumbs = {};
      this.selectRow = 0;
      this.buildMenus();
    }

    // ---------- menus ----------
    buildMenus() {
      const g = this.game, S = () => SA.Save.data;
      const diffs = ['easy', 'normal', 'hard'];
      const cycle = (arr, cur, d) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
      const pct = (v) => Math.round(v * 100) + '%';
      const vol = (key, d) => {
        S().settings[key] = clamp(Math.round((S().settings[key] + d) * 10) / 10, 0, 1);
        g.applySettings();
        SA.Save.save();
      };
      const P = () => S().progression;
      const onOff = (key) => ({ value: () => (S().settings[key] ? 'ON' : 'OFF'), left: () => this.toggle(key), right: () => this.toggle(key) });

      this.menus = {
        main: new CardMenu([
          { label: 'ARENA', col: 0, row: 0, action: () => SA.ArenaMode.start(g),
            sub: () => (P().bestStage ? `BEST STAGE ${P().bestStage}  ·  ${P().bossKills} BOSSES` : 'ENDLESS STAGES · BOSSES · REWARDS') },
          { label: 'FIGHT', col: 1, row: 0, action: () => this.go('select'), sub: 'BEST OF 3 · CLASSIC DUELS' },
          { label: 'SHOP', col: 0, row: 1, action: () => this.go('shop'), sub: 'WEAPONS · RANGED · SPECIALS', badge: () => SA.Save.data.player.coins + ' ¤' },
          { label: 'LOADOUT', col: 1, row: 1, action: () => this.go('loadout'),
            sub: () => { const e = SA.Save.equipped; return (SA.WEAPONS[e.primary] || SA.WEAPONS.fists).name.toUpperCase() + (e.ranged ? ' + ' + SA.RANGED[e.ranged].name.toUpperCase() : ''); } },
          { label: 'TRAINING', col: 0, row: 2, action: () => g.startTraining(), sub: 'PRACTICE · HITBOXES · COMBOS' },
          { label: 'PROFILE', col: 1, row: 2, action: () => this.go('profile'), sub: () => `LEVEL ${S().player.level}  ·  ${S().statistics.wins} WINS` },
          { label: 'SETTINGS', col: 0, row: 3, action: () => this.go('settings'), sub: 'AUDIO · GRAPHICS · TOUCH' },
          { label: 'CONTROLS', col: 1, row: 3, action: () => this.go('controls'), sub: 'KEYBOARD · TOUCH · COMBOS' },
        ], { x: 120, y: 452, w: 520, h: 104, gapX: 34, gapY: streamGap() }),

        settings: new Menu([
          { label: 'DIFFICULTY', value: () => SA.DIFFICULTY[P().difficulty].label,
            left: () => { P().difficulty = cycle(diffs, P().difficulty, -1); SA.Save.save(); },
            right: () => { P().difficulty = cycle(diffs, P().difficulty, 1); SA.Save.save(); } },
          { label: 'MASTER VOLUME', value: () => pct(S().settings.master), left: () => vol('master', -0.1), right: () => vol('master', 0.1) },
          { label: 'MUSIC VOLUME', value: () => pct(S().settings.music), left: () => vol('music', -0.1), right: () => vol('music', 0.1) },
          { label: 'SFX VOLUME', value: () => pct(S().settings.sfx), left: () => vol('sfx', -0.1), right: () => vol('sfx', 0.1) },
          { label: 'GRAPHICS', value: () => S().settings.graphics.toUpperCase(), left: () => this.cycleGraphics(-1), right: () => this.cycleGraphics(1) },
          Object.assign({ label: 'SCREEN SHAKE' }, onOff('shake')),
          Object.assign({ label: 'DAMAGE NUMBERS' }, onOff('damageNumbers')),
          Object.assign({ label: 'VIBRATION' }, onOff('vibration')),
          { label: 'TOUCH CONTROLS', value: () => S().settings.touchControls.toUpperCase(),
            left: () => { S().settings.touchControls = cycle(['auto', 'on', 'off'], S().settings.touchControls, -1); SA.Save.save(); },
            right: () => { S().settings.touchControls = cycle(['auto', 'on', 'off'], S().settings.touchControls, 1); SA.Save.save(); } },
          { label: 'TOUCH BUTTON SIZE', value: () => ({ 0.85: 'SMALL', 1: 'MEDIUM', 1.15: 'LARGE' })[S().settings.touchSize] || 'MEDIUM',
            left: () => { S().settings.touchSize = cycle([0.85, 1, 1.15], S().settings.touchSize, -1); SA.Save.save(); },
            right: () => { S().settings.touchSize = cycle([0.85, 1, 1.15], S().settings.touchSize, 1); SA.Save.save(); } },
          { label: () => (SA.Device.isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'), action: () => SA.Device.toggleFullscreen() },
          { label: () => (this.confirmReset ? 'TAP AGAIN TO ERASE ALL PROGRESS' : 'RESET PROGRESS'), action: () => {
            if (this.confirmReset) { SA.Save.resetProgress(); this.confirmReset = false; this.toast('PROGRESS RESET'); g.applySettings(); }
            else this.confirmReset = true;
          } },
          { label: 'BACK', action: () => this.go('main') },
        ], { x: 170, y: 290, spacing: 56, size: 32, width: 960, onBack: () => this.go('main') }),

        controls: new Menu([{ label: 'BACK', action: () => this.go('main') }],
          { x: 170, y: 1000, spacing: 60, size: 34, width: 260, onBack: () => this.go('main') }),
      };
      function streamGap() { return 18; }
    }

    toggle(key) {
      const s = SA.Save.data.settings;
      s[key] = !s[key];
      SA.Save.save();
      this.game.applySettings();
    }

    cycleGraphics(d) {
      const q = ['auto', 'high', 'medium', 'low'];
      const st = SA.Save.data.settings;
      st.graphics = q[(q.indexOf(st.graphics) + d + q.length) % q.length];
      SA.Save.save();
      this.game.applySettings(true);
    }

    cycleSpecial(d) {
      const inv = SA.Save.data.inventory;
      const all = Object.keys(SA.SPECIALS);
      let i = all.indexOf(inv.equipped.special);
      for (let k = 0; k < all.length; k++) {
        i = (i + d + all.length) % all.length;
        if (SA.Save.owns(all[i])) break;
      }
      inv.equipped.special = all[i];
      SA.Save.save();
    }

    go(screen) {
      if (screen === 'stats') screen = 'profile';
      this.screen = screen;
      this.confirmReset = false;
      if (screen === 'select') this.prepareSelect();
      if (this['enter_' + screen]) this['enter_' + screen]();
      const m = this.menus[screen];
      if (m) { m.hl = null; }
    }

    toast(msg) {
      this.notice.push({ text: msg, t: 0 });
    }

    // ---------- fight select ----------
    prepareSelect() {
      const S = SA.Save.data.progression;
      this.selArena = Math.max(0, SA.ARENA_ORDER.indexOf(S.lastArena));
      this.selectRow = 3;
      for (const id of SA.ARENA_ORDER) if (!this.thumbs[id]) this.thumbs[id] = this.renderThumb(id);
    }

    renderThumb(id) {
      const big = UI.thumbCanvas || (UI.thumbCanvas = SA.makeCanvas(W, H));
      const ctx = big.getContext('2d');
      const game = this.game;
      const arena = game.arena && game.arena.id === id ? game.arena : new SA.Arena(id);
      const cam = new SA.Camera();
      cam.x = 0; cam.zoom = 0.9; cam.y = cam.baseY(0.9);
      arena.build();
      arena.t = 3;
      arena.drawBack(ctx, cam);
      cam.apply(ctx);
      arena.drawGround(ctx, cam);
      arena.drawWeatherWorld(ctx, false);
      // opponent silhouette preview
      const oppId = SA.ARENAS[id].opponent;
      const f = SA.CHARACTERS[oppId] ? SA.createFighter(oppId, new SA.Controller()) : SA.EnemyGen.makeOpponent(oppId, 'normal', 7).fighter;
      f.reset(160, -1);
      const hero = SA.createFighter('mummy', new SA.Controller());
      hero.reset(-160, 1);
      for (const x of [f, hero]) {
        for (let i = 0; i < 30; i++) x.postUpdate(1, { arena });
        SA.Render.drawShadow(ctx, x, 0.5);
        SA.Render.drawFighter(ctx, x, arena.rims);
      }
      arena.drawWeatherWorld(ctx, true);
      SA.resetTransform(ctx);
      arena.drawFront(ctx, cam);
      const th = SA.makeCanvas(480, 270);
      th.getContext('2d').drawImage(big, 0, 0, 480, 270);
      if (arena !== game.arena) arena.dispose();
      return th;
    }

    selectInput(presses, mouse) {
      const S = SA.Save.data.progression;
      const n = SA.ARENA_ORDER.length;
      const rows = 4;
      const change = (d) => {
        if (this.selectRow === 0) { this.selArena = (this.selArena + d + n) % n; }
        else if (this.selectRow === 2) this.cycleSpecial(d);
        else if (this.selectRow === 1) {
          const diffs = ['easy', 'normal', 'hard'];
          S.difficulty = diffs[(diffs.indexOf(S.difficulty) + d + 3) % 3];
        }
        SA.audio.play('ui_move');
      };
      const start = () => {
        const id = SA.ARENA_ORDER[this.selArena];
        if (S.unlockedArenas.indexOf(id) < 0) { SA.audio.play('denied'); this.toast('ARENA LOCKED'); return; }
        S.lastArena = id;
        SA.Save.save();
        SA.audio.play('ui_ok');
        this.game.startFight(id);
      };
      for (const a of presses) {
        if (a === 'up') { this.selectRow = (this.selectRow + rows - 1) % rows; SA.audio.play('ui_move'); }
        else if (a === 'down') { this.selectRow = (this.selectRow + 1) % rows; SA.audio.play('ui_move'); }
        else if (a === 'left') change(-1);
        else if (a === 'right') change(1);
        else if (a === 'confirm' || a === 'light' || a === 'special') start();
        else if (a === 'pause' || a === 'back' || a === 'heavy') { SA.audio.play('ui_back'); this.go('main'); }
      }
      if (mouse && (mouse.moved || mouse.clicked) && this.selRects) {
        for (const r of this.selRects) {
          if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) {
            if (r.arena !== undefined) {
              this.selectRow = 0;
              if (mouse.clicked) {
                if (this.selArena === r.arena) start();
                else { this.selArena = r.arena; SA.audio.play('ui_move'); }
              }
            } else if (r.row !== undefined) {
              this.selectRow = r.row;
              if (mouse.clicked) { if (r.row === 3) start(); else change(1); }
            }
          }
        }
      }
    }

    menuInput(presses, mouse) {
      if (this.screen === 'select') { this.selectInput(presses, mouse); return; }
      if (this[this.screen + 'Input']) { this[this.screen + 'Input'](presses, mouse); return; }
      if (this.screen === 'main' && SA.Device.canFullscreen && mouse && mouse.clicked && this.fsRect) {
        const r = this.fsRect;
        if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) { SA.Device.toggleFullscreen(); return; }
      }
      const m = this.menus[this.screen];
      if (m) m.handle(presses, mouse);
    }

    // ---------- HUD events ----------
    showAnnounce(textStr, o) {
      this.announce = Object.assign({ text: textStr, t: 0, dur: 1.2, color: '#ffffff', size: 170, sub: null }, o || {});
    }
    showBanner(textStr, side, color) {
      this.banner = { text: textStr, side, color, t: 0 };
    }
    onComboHit(side, f) {
      const c = f.combo;
      if (c.hits < 2) return;
      this.combo[side] = { hits: c.hits, damage: c.damage, name: c.name, t: 0, pop: 0, ended: false };
    }
    onComboEnd(side) {
      if (this.combo[side]) this.combo[side].ended = true;
    }
    resetHud() {
      this.combo = [null, null];
      this.lag = [1, 1];
      this.lagDelay = [0, 0];
      this.announce = null;
      this.banner = null;
    }

    update(dt) {
      this.t += dt;
      if (this.announce) { this.announce.t += dt; if (this.announce.t > this.announce.dur) this.announce = null; }
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.3) this.banner = null; }
      for (let i = 0; i < 2; i++) {
        const c = this.combo[i];
        if (!c) continue;
        c.pop += dt;
        if (c.ended) { c.t += dt; if (c.t > 1.6) this.combo[i] = null; }
      }
      for (const n of this.notice) n.t += dt;
      this.notice = this.notice.filter((n) => n.t < 2.6);
      const g = this.game;
      if (g.p1 && g.p2) {
        [g.p1, g.p2].forEach((f, i) => {
          const r = f.hp / f.maxHp;
          this.hpShown[i] = r;
          if (r < this.lag[i]) {
            this.lagDelay[i] += dt;
            if (this.lagDelay[i] > 0.55) this.lag[i] = Math.max(r, this.lag[i] - dt * 0.9);
          } else { this.lag[i] = r; this.lagDelay[i] = 0; }
          if (f.isStunned()) this.lagDelay[i] = Math.min(this.lagDelay[i], 0.3);
        });
      }
    }

    // ---------- HUD drawing ----------
    drawHUD(ctx) {
      const g = this.game, m = g.match;
      if (!m) return;
      const topGrad = ctx.createLinearGradient(0, 0, 0, 190);
      topGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
      topGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, W, 190);
      const botGrad = ctx.createLinearGradient(0, H - 150, 0, H);
      botGrad.addColorStop(0, 'rgba(0,0,0,0)');
      botGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, H - 150, W, 150);

      this.drawBar(ctx, g.p1, 0);
      this.drawBar(ctx, g.p2, 1);

      // timer / mode
      const touch = g.input.touchActive;
      if (g.mode === 'training') {
        text(ctx, 'TRAINING', W / 2, 84, { size: 30, weight: 800, spacing: 8, color: GOLD, align: 'center' });
        if (!touch) text(ctx, 'ESC  OPTIONS   ·   R  RESET   ·   F2  HITBOXES', W / 2, H - 36, { size: 20, weight: 600, spacing: 3, color: 'rgba(255,255,255,0.55)', align: 'center' });
      } else {
        const tt = Math.max(0, Math.ceil(m.timer));
        const low = tt <= 10 && m.phase === 'fight';
        ctx.save();
        ctx.translate(W / 2, 88);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -58); ctx.lineTo(58, 0); ctx.lineTo(0, 58); ctx.lineTo(-58, 0); ctx.closePath();
        ctx.fillStyle = 'rgba(8,6,10,0.55)';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        const pulse = low ? 1 + 0.08 * Math.max(0, Math.sin(this.t * 10)) : 1;
        text(ctx, String(tt), W / 2, 90, { size: Math.round(56 * pulse), weight: 800, color: low ? '#ff5a4a' : '#ffffff', align: 'center' });
        // round pips (classic fight only)
        for (let side = 0; side < 2 && g.mode === 'fight'; side++) {
          for (let i = 0; i < 2; i++) {
            const x = side === 0 ? W / 2 - 110 - i * 34 : W / 2 + 110 + i * 34;
            const won = m.wins[side] > i;
            ctx.save();
            ctx.translate(x, 138);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = won ? GOLD : 'rgba(0,0,0,0.5)';
            ctx.strokeStyle = won ? '#fff3d0' : 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2;
            ctx.fillRect(-9, -9, 18, 18);
            ctx.strokeRect(-9, -9, 18, 18);
            ctx.restore();
            if (won) {
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = 0.5;
              ctx.drawImage(SA.glowSprite(GOLD), x - 26, 112, 52, 52);
              ctx.globalAlpha = 1;
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        }
        if (g.mode === 'arena') this.drawArenaInfo(ctx);
        else text(ctx, `ROUND ${m.round}`, W / 2, 172, { size: 18, weight: 700, spacing: 6, color: 'rgba(255,255,255,0.55)', align: 'center' });
      }

      this.drawEnergy(ctx, g.p1, 0);
      this.drawEnergy(ctx, g.p2, 1);
      if (!touch && g.mode === 'fight' && m.round === 1 && SA.Save.data.statistics.fights < 3 && m.phase !== 'matchEnd') {
        const a = clamp(Math.min(m.t / 0.5, (9 - m.t) / 1), 0, 1);
        if (a > 0) text(ctx, 'J  PUNCH   ·   K  HEAVY   ·   L  KICK   ·   U  BLOCK / PARRY   ·   I  DASH   ·   SPACE  SPECIAL', W / 2, H - 118,
          { size: 19, weight: 700, spacing: 3, color: 'rgba(255,255,255,0.7)', align: 'center', alpha: a });
      }
      this.drawCombo(ctx, 0);
      this.drawCombo(ctx, 1);
      this.drawBanner(ctx);
      this.drawAnnounce(ctx);
    }

    drawBar(ctx, f, side) {
      const bw = 740, bh = 32, y = 60, skew = 14;
      const x = side === 0 ? 100 : W - 100 - bw;
      const r = this.hpShown[side], lag = this.lag[side];
      ctx.save();
      skewRect(ctx, x - 4, y - 4, bw + 8, bh + 8, side === 0 ? skew : -skew);
      ctx.fillStyle = 'rgba(5,4,8,0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.stroke();
      skewRect(ctx, x, y, bw, bh, side === 0 ? skew : -skew);
      ctx.clip();
      const fillW = bw * r, lagW = bw * lag;
      const fx = side === 0 ? x : x + bw - fillW;
      const lx = side === 0 ? x : x + bw - lagW;
      ctx.fillStyle = '#b3202f';
      ctx.fillRect(lx - skew, y, lagW + skew * 2, bh);
      const low = r < 0.25;
      const gr = ctx.createLinearGradient(0, y, 0, y + bh);
      if (low) {
        const p = 0.5 + 0.5 * Math.sin(this.t * 8);
        gr.addColorStop(0, `rgb(255,${110 + p * 60},${90 + p * 40})`);
        gr.addColorStop(1, '#c0302a');
      } else {
        gr.addColorStop(0, '#fbf5e8');
        gr.addColorStop(0.55, '#ecd4a0');
        gr.addColorStop(1, '#b8904e');
      }
      ctx.fillStyle = gr;
      ctx.fillRect(fx - skew, y, fillW + skew * 2, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(fx - skew, y + 3, fillW + skew * 2, 3);
      if (f.def && f.def.phases) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        for (const ph of f.def.phases.slice(1)) {
          const px = side === 0 ? x + bw * ph.at : x + bw - bw * ph.at;
          ctx.fillRect(px - 2, y, 4, bh);
        }
      }
      ctx.restore();

      const nameX = side === 0 ? x + 4 : x + bw - 4;
      const align = side === 0 ? 'left' : 'right';
      text(ctx, f.name, nameX, y - 22, { size: 28, weight: 800, spacing: 7, color: '#ffffff', align });
      const nw = ctx.measureText(f.name).width + f.name.length * 7;
      const subX = side === 0 ? nameX + nw + 16 : nameX - nw - 16;
      text(ctx, (f.title || '').toUpperCase(), subX, y - 20, { size: 15, weight: 600, spacing: 3, color: 'rgba(255,255,255,0.45)', align });
      if (this.game.mode === 'fight' && side === 1) {
        text(ctx, SA.DIFFICULTY[this.game.difficulty].label, x + bw, y + bh + 22, { size: 15, weight: 700, spacing: 4, color: 'rgba(233,194,122,0.7)', align: 'right' });
      }
    }

    drawEnergy(ctx, f, side) {
      // on touch the bottom belongs to the controls: energy moves under the health bars
      const touch = this.game.input.touchActive;
      const bw = touch ? 420 : 520, bh = 16, y = touch ? 128 : H - 70, skew = 10;
      const x = side === 0 ? 100 : W - 100 - bw;
      const e = clamp(f.energy / 100, 0, 1);
      const full = e >= 1;
      ctx.save();
      skewRect(ctx, x - 3, y - 3, bw + 6, bh + 6, side === 0 ? skew : -skew);
      ctx.fillStyle = 'rgba(5,4,8,0.7)';
      ctx.fill();
      ctx.strokeStyle = full ? 'rgba(220,190,255,0.9)' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();
      skewRect(ctx, x, y, bw, bh, side === 0 ? skew : -skew);
      ctx.clip();
      const fw = bw * e;
      const fx = side === 0 ? x : x + bw - fw;
      const gr = ctx.createLinearGradient(x, 0, x + bw, 0);
      gr.addColorStop(0, '#5a2dbf'); gr.addColorStop(1, '#c9a8ff');
      ctx.fillStyle = full ? `hsl(${265 + Math.sin(this.t * 6) * 12},100%,${72 + Math.sin(this.t * 9) * 10}%)` : gr;
      ctx.fillRect(fx - skew, y, fw + skew * 2, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      for (let i = 1; i < 4; i++) ctx.fillRect(x + (bw * i) / 4 - 1, y, 3, bh);
      ctx.restore();
      if (full) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.t * 6);
        ctx.drawImage(SA.glowSprite('#9a6bff'), x - 40, y - 60, bw + 80, 136);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      const align = side === 0 ? 'left' : 'right';
      const lx = side === 0 ? x : x + bw;
      const special = SA.SPECIALS[f.specialId] ? SA.SPECIALS[f.specialId].name : '';
      if (full && f.isPlayer) text(ctx, `${special}  READY  ·  ${touch ? 'TAP SPECIAL' : 'SPACE'}`, lx, y - 20, { size: 19, weight: 800, spacing: 4, color: '#e6d6ff', align });
      else text(ctx, `ENERGY  ·  ${special}`, lx, y - 20, { size: 16, weight: 700, spacing: 4, color: 'rgba(230,214,255,0.55)', align });
    }

    drawCombo(ctx, side) {
      const c = this.combo[side];
      if (!c) return;
      const a = c.ended ? clamp(1 - (c.t - 1.0) / 0.6, 0, 1) : 1;
      const pop = 1 + 0.35 * Math.max(0, 1 - c.pop / 0.15);
      const x = side === 0 ? 100 : W - 100;
      const align = side === 0 ? 'left' : 'right';
      const y = 300;
      ctx.save();
      ctx.globalAlpha = a;
      const slide = c.ended ? (c.t > 1 ? (c.t - 1) * 80 : 0) : 0;
      const dx = side === 0 ? -slide : slide;
      ctx.translate(x + dx, y);
      ctx.scale(pop, pop);
      const w = text(ctx, String(c.hits), 0, 0, { size: 118, weight: 900, italic: true, color: GOLD, align, stroke: 'rgba(0,0,0,0.6)', strokeWidth: 8, alpha: a });
      const hx = side === 0 ? w + 14 : -w - 14;
      text(ctx, 'HIT', hx, -24, { size: 30, weight: 900, italic: true, spacing: 4, color: '#fff', align, stroke: 'rgba(0,0,0,0.6)', alpha: a });
      text(ctx, 'COMBO', hx, 12, { size: 30, weight: 900, italic: true, spacing: 4, color: '#fff', align, stroke: 'rgba(0,0,0,0.6)', alpha: a });
      ctx.restore();
      text(ctx, `${c.damage} DAMAGE`, x + dx, y + 76, { size: 26, weight: 800, spacing: 4, color: '#ffffff', align, stroke: 'rgba(0,0,0,0.6)', alpha: a });
      if (c.name) text(ctx, c.name, x + dx, y + 116, { size: 24, weight: 800, spacing: 6, color: '#ff5d6c', align, stroke: 'rgba(0,0,0,0.6)', alpha: a });
    }

    drawBanner(ctx) {
      const b = this.banner;
      if (!b) return;
      const t = b.t;
      const inT = easeOutCubic(clamp(t / 0.2, 0, 1));
      const out = clamp((t - 1.0) / 0.3, 0, 1);
      const y = H * 0.3;
      ctx.save();
      ctx.globalAlpha = 1 - out;
      const dir = b.side === 0 ? -1 : 1;
      const off = (1 - inT) * dir * W * 0.6 - out * dir * 200;
      ctx.translate(off, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      skewRect(ctx, -100, y - 55, W + 200, 110, 40);
      ctx.fill();
      ctx.fillStyle = b.color;
      ctx.fillRect(-100, y - 55, W + 200, 4);
      ctx.fillRect(-100, y + 51, W + 200, 4);
      text(ctx, b.text, W / 2, y + 2, { size: 76, weight: 900, italic: true, spacing: 14, color: '#ffffff', align: 'center', stroke: b.color, strokeWidth: 3 });
      ctx.restore();
    }

    drawAnnounce(ctx) {
      const a = this.announce;
      if (!a) return;
      const t = a.t;
      const inT = clamp(t / 0.25, 0, 1);
      const outT = clamp((t - (a.dur - 0.3)) / 0.3, 0, 1);
      const s = lerp(1.7, 1, easeOutBack(inT)) * (1 + outT * 0.3);
      const alpha = Math.min(inT * 1.5, 1) * (1 - outT);
      const y = H * 0.42;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (a.brush !== false) brush(ctx, W / 2 - 520, y - 95, 1040, 190, a.brushColor || ACCENT, 0.75 * alpha);
      ctx.translate(W / 2, y);
      ctx.scale(s, s);
      text(ctx, a.text, 0, 0, { size: a.size, weight: 900, italic: true, spacing: a.spacing || 18, color: a.color, align: 'center', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 10, alpha });
      ctx.restore();
      if (a.sub) text(ctx, a.sub, W / 2, y + 120, { size: 30, weight: 700, spacing: 10, color: 'rgba(255,255,255,0.85)', align: 'center', alpha });
    }

    // ---------- screens ----------
    drawMenuBackdrop(ctx, strength) {
      const g = ctx.createLinearGradient(0, 0, W * 0.75, 0);
      g.addColorStop(0, `rgba(4,2,6,${0.9 * strength})`);
      g.addColorStop(0.55, `rgba(4,2,6,${0.55 * strength})`);
      g.addColorStop(1, 'rgba(4,2,6,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    drawTitle(ctx, x, y, scale) {
      const s = scale || 1;
      // red sun behind the title
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.drawImage(SA.glowSprite('#ff3a2a'), x + 330 * s - 300 * s, y - 20 * s - 300 * s, 600 * s, 600 * s);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(x + 460 * s, y - 40 * s, 120 * s, 0, SA.TAU);
      ctx.fill();
      text(ctx, 'SHADOW', x, y, { size: 150 * s, weight: 900, spacing: 22 * s, color: '#f4ede4', stroke: 'rgba(0,0,0,0.5)', strokeWidth: 6 });
      text(ctx, 'ARENA', x + 6, y + 108 * s, { size: 64 * s, weight: 300, spacing: 58 * s, color: '#f4ede4' });
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x + 6, y + 160 * s, 120 * s, 4);
    }

    drawMenus(ctx) {
      const t = this.t;
      const scr = this.screen;
      this.drawMenuBackdrop(ctx, scr === 'main' ? 1 : 1.25);
      if (scr !== 'main') {
        ctx.fillStyle = 'rgba(3,2,6,0.55)';
        ctx.fillRect(0, 0, W, H);
      }
      if (scr === 'main') {
        this.drawTitle(ctx, 140, 205, 0.86);
        text(ctx, 'A SILHOUETTE FIGHTING GAME', 150, 375, { size: 18, weight: 600, spacing: 9, color: 'rgba(255,255,255,0.55)' });
        this.menus.main.draw(ctx, t);
        const touch = this.game.input.touchActive;
        text(ctx, touch ? 'TAP A CARD TO START' : 'ARROWS / WASD  SELECT    ·    ENTER / J  CONFIRM    ·    ESC  BACK', 150, H - 36,
          { size: 15, weight: 600, spacing: 4, color: 'rgba(255,255,255,0.4)' });
        if (SA.Device.canFullscreen) {
          const r = this.fsRect = { x: W - 330, y: H - 110, w: 250, h: 70 };
          ctx.save();
          skewRect(ctx, r.x, r.y, r.w, r.h, 12);
          ctx.fillStyle = 'rgba(10,6,12,0.7)'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
          text(ctx, SA.Device.isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN', r.x + r.w / 2 + 6, r.y + r.h / 2, { size: 19, weight: 800, spacing: 3, color: '#fff', align: 'center' });
        }
      } else if (scr === 'settings') {
        this.header(ctx, 'SETTINGS');
        this.menus.settings.draw(ctx, t);
        text(ctx, 'GRAPHICS: HIGH = all effects · MEDIUM = fewer particles · LOW = best for older tablets. Combat speed never changes.', 170, 1040, { size: 17, weight: 500, spacing: 1, color: 'rgba(255,255,255,0.45)' });
      } else if (scr === 'controls') {
        this.header(ctx, 'CONTROLS');
        this.drawControls(ctx, 170, 300);
        this.menus.controls.draw(ctx, t);
      } else if (scr === 'select') {
        this.drawSelect(ctx);
      } else if (this['draw_' + scr]) {
        this['draw_' + scr](ctx);
      }
      if (scr !== 'select') this.drawPlayerChip(ctx);
      this.drawNotices(ctx);
    }

    header(ctx, title) {
      text(ctx, title, 170, 190, { size: 72, weight: 900, spacing: 16, color: '#f4ede4' });
      ctx.fillStyle = ACCENT;
      ctx.fillRect(172, 240, 110, 4);
    }

    drawControls(ctx, x, y, weaponId) {
      const rows = [
        ['A / D', 'Move (← →)'], ['W', 'Jump (+ direction)'], ['S', 'Crouch'],
        ['J', 'Light attack'], ['K', 'Heavy attack'], ['L', 'Kick'],
        ['U', 'Block  (tap right before a hit = PARRY)'], ['S + U', 'Low block'],
        ['I', 'Dash forward (with →) · Evade back'], ['O', 'Throw / Shoot (ranged slot)'],
        ['P', 'Reload (firearms)'], ['SPACE', 'Special attack (full energy)'], ['ESC', 'Pause'],
      ];
      rows.forEach(([k, d], i) => {
        const yy = y + i * 44;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        skewRect(ctx, x, yy - 17, 140, 34, 8);
        ctx.fill();
        text(ctx, k, x + 74, yy, { size: 19, weight: 800, spacing: 3, color: GOLD, align: 'center' });
        text(ctx, d, x + 170, yy, { size: 21, weight: 600, spacing: 1, color: 'rgba(255,255,255,0.85)' });
      });
      const cx = x + 870;
      text(ctx, 'CONTEXT ACTIONS', cx, y, { size: 22, weight: 800, spacing: 6, color: '#ff5d6c' });
      const moves = [
        ['S + J / L', 'Low attack (block low!)'], ['S + K', 'Launcher / uppercut (anti-air)'],
        ['W + K', 'Overhead / rising heavy'], ['in air + J / K', 'Jump attack (overhead)'],
        ['I→ then J / K', 'Dash attack'], ['in air + O', 'Air throw'],
      ];
      moves.forEach(([k, d], i) => {
        text(ctx, k, cx, y + 42 + i * 38, { size: 19, weight: 800, spacing: 2, color: GOLD });
        text(ctx, d, cx + 200, y + 42 + i * 38, { size: 19, weight: 500, color: 'rgba(255,255,255,0.8)' });
      });
      const wCombos = weaponId && SA.Items.comboInputs(weaponId);
      text(ctx, wCombos ? SA.Items.get(weaponId).name.toUpperCase() + ' COMBOS' : 'FIST COMBOS', cx, y + 300, { size: 22, weight: 800, spacing: 6, color: '#ff5d6c' });
      const combos = wCombos || [
        ['J  J  K', 'Twin Dragon Palm'], ['J  L  L', 'Crescent Chain'], ['S+L  J', 'Rising Dragon'],
        ['S+K  W  L', 'Sky Hunter (juggle)'],
      ];
      combos.forEach(([k, d], i) => {
        text(ctx, k, cx, y + 342 + i * 38, { size: 19, weight: 800, spacing: 2, color: GOLD });
        text(ctx, d, cx + 200, y + 342 + i * 38, { size: 19, weight: 500, color: 'rgba(255,255,255,0.8)' });
      });
      text(ctx, 'Every weapon has its own chains — see MOVE LIST in the pause menu.', cx, y + 506, { size: 17, weight: 500, color: 'rgba(255,255,255,0.55)' });
      text(ctx, 'TOUCH  ·  left stick: move · up = jump · down = crouch · flick twice = dash  ·  right: buttons (hold BLOCK)', x, y + 610, { size: 18, weight: 600, spacing: 2, color: 'rgba(255,255,255,0.6)' });
      text(ctx, 'DEBUG  ·  F1 overlay  F2 hitboxes  F3 AI  F4 FPS   ·   DEV  F5 +1000 coins  F6 +1 level  F7 next stage  F8 boss', x, y + 648, { size: 16, weight: 600, spacing: 2, color: 'rgba(255,255,255,0.42)' });
    }

    drawSelect(ctx) {
      const S = SA.Save.data.progression, inv = SA.Save.data.inventory;
      this.header(ctx, 'CHOOSE YOUR BATTLE');
      this.selRects = [];
      const n = SA.ARENA_ORDER.length, perRow = 4;
      const cw = 360, ch = 202, gap = 26;
      const x0 = W / 2 - (perRow * cw + (perRow - 1) * gap) / 2;
      const y0 = 272;
      SA.ARENA_ORDER.forEach((id, i) => {
        const x = x0 + (i % perRow) * (cw + gap), y = y0 + Math.floor(i / perRow) * (ch + 58);
        const sel = i === this.selArena;
        const locked = S.unlockedArenas.indexOf(id) < 0;
        const lift = sel ? -8 : 0;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y + lift, cw, ch);
        ctx.save();
        ctx.globalAlpha = locked ? 0.3 : sel ? 1 : 0.7;
        if (this.thumbs[id]) ctx.drawImage(this.thumbs[id], x, y + lift, cw, ch);
        ctx.restore();
        ctx.strokeStyle = sel ? (this.selectRow === 0 ? '#ffffff' : GOLD) : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = sel ? 4 : 2;
        ctx.strokeRect(x, y + lift, cw, ch);
        const def = SA.ARENAS[id];
        if (locked) {
          text(ctx, 'LOCKED', x + cw / 2, y + lift + ch / 2 - 12, { size: 28, weight: 900, spacing: 8, color: '#ffffff', align: 'center' });
          text(ctx, i < 4 ? `WIN AT ${SA.ARENAS[SA.ARENA_ORDER[i - 1]].name}` : 'REACH IT IN ARENA MODE', x + cw / 2, y + lift + ch / 2 + 22, { size: 14, weight: 700, spacing: 2, color: 'rgba(255,255,255,0.7)', align: 'center' });
        }
        text(ctx, def.name, x + 4, y + ch + 24, { size: 19, weight: 800, spacing: 3, color: sel ? '#fff' : 'rgba(255,255,255,0.6)' });
        text(ctx, locked ? '???' : 'VS ' + SA.opponentName(def.opponent), x + cw - 4, y + ch + 24, { size: 15, weight: 700, spacing: 3, color: sel ? GOLD : 'rgba(233,194,122,0.5)', align: 'right' });
        this.selRects.push({ x, y: y - 8, w: cw, h: ch + 40, arena: i });
      });

      const def = SA.ARENAS[SA.ARENA_ORDER[this.selArena]];
      const locked = S.unlockedArenas.indexOf(def.id) < 0;
      const rows = [
        ['ARENA', def.name],
        ['DIFFICULTY', SA.DIFFICULTY[S.difficulty].label],
        ['SPECIAL', SA.SPECIALS[inv.equipped.special].name],
        [locked ? 'LOCKED' : 'START FIGHT', null],
      ];
      rows.forEach(([k, v], r) => {
        const y = 824 + r * 58;
        const sel = this.selectRow === r;
        if (sel) brush(ctx, W / 2 - 360, y - 26, 720, 52, ACCENT, 0.8);
        if (v === null) {
          text(ctx, k, W / 2, y, { size: 32, weight: 900, spacing: 12, color: sel ? '#fff' : 'rgba(255,255,255,0.7)', align: 'center' });
        } else {
          text(ctx, k, W / 2 - 320, y, { size: 22, weight: 700, spacing: 5, color: sel ? '#fff' : 'rgba(255,255,255,0.6)' });
          text(ctx, `‹  ${v}  ›`, W / 2 + 320, y, { size: 22, weight: 800, spacing: 4, color: sel ? GOLD : 'rgba(233,194,122,0.6)', align: 'right' });
        }
        this.selRects.push({ x: W / 2 - 360, y: y - 28, w: 720, h: 56, row: r });
      });
    }

    drawNotices(ctx) {
      this.notice.forEach((n, i) => {
        const a = clamp(Math.min(n.t / 0.2, (2.6 - n.t) / 0.4), 0, 1);
        const y = 120 + i * 56;
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        skewRect(ctx, W - 620, y - 24, 540, 48, 12);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        ctx.fillRect(W - 620, y - 24, 5, 48);
        ctx.globalAlpha = 1;
        text(ctx, n.text, W - 590, y, { size: 20, weight: 800, spacing: 4, color: '#fff', alpha: a });
      });
    }

    // pause / results overlay with a menu
    drawOverlayMenu(ctx, title, menu, sub) {
      ctx.fillStyle = 'rgba(3,2,6,0.72)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, title, W / 2, 250, { size: 96, weight: 900, italic: true, spacing: 20, color: '#f4ede4', align: 'center' });
      if (sub) text(ctx, sub, W / 2, 330, { size: 24, weight: 600, spacing: 6, color: 'rgba(255,255,255,0.6)', align: 'center' });
      menu.draw(ctx, this.t);
    }

    drawDebug(ctx) {
      const g = this.game, d = g.debug;
      if (d.fps || d.overlay) {
        text(ctx, `${Math.round(g.fps)} FPS`, W - 24, 24, { size: 18, weight: 700, color: g.fps < 55 ? '#ff6b5b' : '#7dff9a', align: 'right', font: 'monospace' });
      }
      if (d.overlay && g.p1) {
        const lines = [];
        const f = (x) => {
          const mv = x.move ? `${x.move.id} [${x.phase}] ${Math.floor(x.mt)}/${x.move.total}` : x.sp ? `special:${x.sp.id}/${x.sp.phase}` : '-';
          return [
            `${x.name}  state:${x.state} (${Math.floor(x.st)})  hp:${x.hp}  en:${Math.round(x.energy)}`,
            `  pos:${Math.round(x.x)},${Math.round(x.y)}  vel:${Math.round(x.vx)},${Math.round(x.vy)}  facing:${x.facing}  grounded:${x.grounded}`,
            `  anim:${x.animName || '-'}  move:${mv}  contact:${x.moveContact || '-'}  combo:${x.combo.hits}`,
            `  buffer: ${x.ctrl.describe()}  inv:${Math.max(0, Math.ceil(x.invuln))}  parryAge:${Math.min(99, Math.floor(x.parryAge))}`,
          ];
        };
        lines.push(...f(g.p1), ...f(g.p2));
        lines.push(`distance: ${Math.round(Math.abs(g.p1.x - g.p2.x))}   hitstop:${g.hitstop}   timescale:${g.timeScale.toFixed(2)}   particles:${g.particles.count}`);
        if (g.ai2) lines.push(`AI: ${g.ai2.debugText()}`);
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(90, 196, 1180, lines.length * 24 + 20);
        lines.forEach((l, i) => text(ctx, l, 104, 216 + i * 24, { size: 17, weight: 500, font: 'monospace', color: i >= 8 ? '#ffd27a' : '#d8f5ff' }));
      }
      if (d.ai && g.ai2 && g.p2) {
        const s = g.camera.worldToScreen(g.p2.skel.head.x, g.p2.skel.head.y - 70);
        text(ctx, g.ai2.state, s.x, s.y, { size: 24, weight: 900, spacing: 3, color: '#ffd27a', align: 'center', stroke: 'rgba(0,0,0,0.8)' });
        text(ctx, g.ai2.debugText(), s.x, s.y + 28, { size: 15, weight: 600, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.8)', strokeWidth: 4 });
      }
    }
  }

  UI.Menu = Menu;
  UI.CardMenu = CardMenu;
  UI.skewRect = skewRect;
  UI.brush = brush;
  UI.ACCENT = ACCENT;
  UI.GOLD = GOLD;
  SA.UI = UI;
})(window.SA);
