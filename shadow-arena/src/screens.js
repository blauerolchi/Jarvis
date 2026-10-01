'use strict';
/*
 * Progression screens (canvas UI, keyboard + touch):
 *   SHOP (categories, card list, detail card with live weapon preview, BUY / EQUIP / TRY)
 *   LOADOUT (primary / ranged / special / cosmetic)
 *   PROFILE (level, XP, currencies, records)
 *   Arena overlays: stage info in the HUD, reward screen, run-over screen
 */
(function (SA) {
  const { clamp, lerp } = SA.M;
  const UI = SA.UI;
  const W = SA.W, H = SA.H;
  const text = SA.text;
  const { skewRect, brush, ACCENT, GOLD } = UI;
  const RARITY = SA.BALANCE.weapons.rarityColor;
  const CAT_LABEL = { weapons: 'WEAPONS', throwables: 'THROWN', firearms: 'RELICS', specials: 'SPECIALS', cosmetics: 'COSMETICS' };

  function hit(m, r) { return m && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h; }

  function button(ctx, r, label, o) {
    o = o || {};
    ctx.save();
    skewRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = o.disabled ? 'rgba(40,36,44,0.7)' : o.primary ? ACCENT : 'rgba(10,6,12,0.75)';
    ctx.fill();
    ctx.strokeStyle = o.disabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    text(ctx, label, r.x + r.w / 2 + 6, r.y + r.h / 2, { size: o.size || 26, weight: 900, spacing: 5, color: o.disabled ? 'rgba(255,255,255,0.35)' : '#fff', align: 'center' });
  }

  function coinIcon(ctx, x, y, r) {
    ctx.fillStyle = '#e9b43a';
    ctx.beginPath(); ctx.arc(x, y, r, 0, SA.TAU); ctx.fill();
    ctx.strokeStyle = '#fff0b8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, SA.TAU); ctx.stroke();
  }

  // live preview fighter holding an item
  function makePreview(loadout) {
    const eq = SA.Save.equipped;
    const f = SA.createFighter('mummy', new SA.Controller(), {
      weapon: loadout.weapon || eq.primary, ranged: loadout.ranged === undefined ? eq.ranged : loadout.ranged,
      special: eq.special, cosmetic: loadout.cosmetic || eq.cosmetic,
    });
    f.reset(0, 1);
    return f;
  }

  function drawPreview(ctx, f, x, y, scale, dt) {
    f.postUpdate(dt * 60, { arena: null });
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 2, 110, 16, 0, 0, SA.TAU); ctx.fill();
    ctx.globalAlpha = 1;
    SA.Render.drawFighter(ctx, f, [{ color: 'rgba(255,150,90,0.9)', dx: 3, dy: -2 }, { color: 'rgba(120,180,255,0.6)', dx: -3, dy: -1 }]);
    ctx.restore();
  }

  Object.assign(UI.prototype, {
    // ---------- player chip (level / xp / coins) ----------
    drawPlayerChip(ctx) {
      const p = SA.Progression.progress(), coins = SA.Save.data.player.coins;
      const x = W - 520, y = 44;
      ctx.save();
      skewRect(ctx, x, y, 440, 74, 14);
      ctx.fillStyle = 'rgba(8,6,10,0.72)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(x + 50, y + 37);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(-24, -24, 48, 48);
      ctx.restore();
      text(ctx, String(p.level), x + 50, y + 38, { size: 26, weight: 900, color: '#fff', align: 'center' });
      text(ctx, 'LEVEL', x + 92, y + 22, { size: 14, weight: 800, spacing: 3, color: 'rgba(255,255,255,0.6)' });
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 92, y + 40, 170, 10);
      ctx.fillStyle = GOLD;
      ctx.fillRect(x + 92, y + 40, 170 * clamp(p.frac, 0, 1), 10);
      text(ctx, `${p.xp} / ${p.need} XP`, x + 92, y + 60, { size: 12, weight: 700, spacing: 1, color: 'rgba(255,255,255,0.5)' });
      coinIcon(ctx, x + 300, y + 37, 14);
      text(ctx, String(coins), x + 322, y + 38, { size: 28, weight: 900, color: '#ffe39a' });
    },

    // ---------- SHOP ----------
    enter_shop() {
      this.shop = this.shop || { cat: 0, index: 0, scroll: 0 };
      this.shop.index = 0;
      this.shop.scroll = 0;
      this.shop.msg = null;
      this.shopPreview();
    },
    shopItems() { return SA.Shop.items(SA.Shop.CATEGORIES[this.shop.cat]); },
    shopSelected() { return this.shopItems()[this.shop.index]; },
    shopPreview() {
      const id = this.shopSelected();
      const cat = SA.Items.category(id);
      const lo = {};
      if (cat === 'weapons') lo.weapon = id;
      if (cat === 'throwables' || cat === 'firearms') lo.ranged = id;
      if (cat === 'cosmetics') lo.cosmetic = id;
      this.shop.preview = makePreview(lo);
    },
    shopAction(kind) {
      const id = this.shopSelected();
      if (!id) return;
      const st = SA.Shop.status(id);
      const it = SA.Items.get(id);
      if (kind === 'try') {
        const cat = SA.Items.category(id);
        if (cat === 'weapons' || cat === 'throwables' || cat === 'firearms' || cat === 'specials') {
          this.game.startTraining({ tryItem: id });
        }
        return;
      }
      if (st === 'owned') { SA.Shop.equip(id); SA.audio.play('ui_ok'); this.toast(it.name.toUpperCase() + ' EQUIPPED'); return; }
      if (st === 'equipped') {
        if (SA.Shop.slotOf(id) === 'ranged') { SA.Shop.unequipRanged(); this.toast('RANGED SLOT EMPTY'); }
        return;
      }
      const r = SA.Shop.buy(id);
      if (r.ok) {
        SA.audio.play('purchase');
        SA.Shop.equip(id);
        this.toast(it.name.toUpperCase() + ' BOUGHT & EQUIPPED');
        for (const e of r.extra || []) this.toast('BONUS: ' + e.toUpperCase());
      } else {
        SA.audio.play('denied');
        this.toast(r.reason === 'level' ? `REQUIRES LEVEL ${it.levelRequired}` : r.reason === 'coins' ? 'NOT ENOUGH COINS' : 'ALREADY OWNED');
      }
      this.shopPreview();
    },
    shopInput(presses, mouse) {
      const sh = this.shop, items = this.shopItems();
      const setIdx = (i) => {
        i = clamp(i, 0, items.length - 1);
        if (i !== sh.index) { sh.index = i; SA.audio.play('ui_move'); this.shopPreview(); }
      };
      const setCat = (c) => {
        c = (c + SA.Shop.CATEGORIES.length) % SA.Shop.CATEGORIES.length;
        sh.cat = c; sh.index = 0; sh.scroll = 0; SA.audio.play('ui_move'); this.shopPreview();
      };
      for (const a of presses) {
        if (a === 'up') setIdx(sh.index - 1);
        else if (a === 'down') setIdx(sh.index + 1);
        else if (a === 'left') setCat(sh.cat - 1);
        else if (a === 'right') setCat(sh.cat + 1);
        else if (a === 'confirm' || a === 'light') this.shopAction('main');
        else if (a === 'try' || a === 'kick') this.shopAction('try');
        else if (a === 'pause' || a === 'back' || a === 'heavy') { SA.audio.play('ui_back'); this.go('main'); return; }
      }
      if (!mouse) return;
      // drag / wheel scroll the list
      if (mouse.dragging && mouse.dragY && mouse.x < 860) sh.scroll = clamp(sh.scroll - mouse.dragY, 0, Math.max(0, items.length * 108 - 650));
      if (mouse.wheel) sh.scroll = clamp(sh.scroll + mouse.wheel, 0, Math.max(0, items.length * 108 - 650));
      if (!mouse.clicked) return;
      (this.shopRects || []).forEach((r) => {
        if (!hit(mouse, r)) return;
        if (r.tab !== undefined) setCat(r.tab);
        else if (r.item !== undefined) setIdx(r.item);
        else if (r.btn) this.shopAction(r.btn);
        else if (r.back) { SA.audio.play('ui_back'); this.go('main'); }
      });
    },
    draw_shop(ctx) {
      const sh = this.shop;
      this.header(ctx, 'SHOP');
      const rects = this.shopRects = [];
      // tabs
      SA.Shop.CATEGORIES.forEach((c, i) => {
        const r = { x: 150 + i * 262, y: 272, w: 246, h: 64, tab: i };
        ctx.save();
        skewRect(ctx, r.x, r.y, r.w, r.h, 12);
        ctx.fillStyle = i === sh.cat ? ACCENT : 'rgba(10,6,12,0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        text(ctx, CAT_LABEL[c], r.x + r.w / 2 + 6, r.y + r.h / 2, { size: 21, weight: 900, spacing: 4, color: '#fff', align: 'center' });
        rects.push(r);
      });
      // list (clipped, scrollable)
      const items = this.shopItems();
      const listY = 360, listH = 660;
      const want = sh.index * 108;
      if (want < sh.scroll) sh.scroll = want;
      if (want + 96 > sh.scroll + listH) sh.scroll = want + 96 - listH;
      ctx.save();
      ctx.beginPath(); ctx.rect(130, listY - 6, 740, listH + 12); ctx.clip();
      items.forEach((id, i) => {
        const it = SA.Items.get(id);
        const y = listY + i * 108 - sh.scroll;
        if (y < listY - 110 || y > listY + listH) return;
        const r = { x: 150, y, w: 700, h: 96, item: i };
        const sel = i === sh.index;
        const st = SA.Shop.status(id);
        ctx.save();
        skewRect(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fillStyle = sel ? 'rgba(60,18,26,0.92)' : 'rgba(10,6,12,0.72)';
        ctx.fill();
        ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = sel ? 3 : 2;
        ctx.stroke();
        ctx.fillStyle = RARITY[it.rarity] || '#aaa';
        ctx.fillRect(r.x + 10, r.y + 12, 6, r.h - 24);
        ctx.restore();
        // icon
        const w = SA.WEAPONS[id];
        ctx.save();
        if (w && w.geom) SA.Render.drawWeaponIcon(ctx, w, r.x + 80, r.y + 50, 110, '#d8d2c8');
        else this.drawItemGlyph(ctx, id, r.x + 80, r.y + 48);
        ctx.restore();
        text(ctx, it.name.toUpperCase(), r.x + 160, r.y + 34, { size: 24, weight: 900, spacing: 3, color: st === 'locked' ? 'rgba(255,255,255,0.4)' : '#fff' });
        text(ctx, it.rarity.toUpperCase(), r.x + 160, r.y + 66, { size: 15, weight: 800, spacing: 3, color: RARITY[it.rarity] });
        let tag, col = '#fff';
        if (st === 'equipped') { tag = 'EQUIPPED'; col = '#7dff9a'; }
        else if (st === 'owned') { tag = 'OWNED'; col = GOLD; }
        else if (st === 'locked') { tag = `LV ${it.levelRequired}`; col = 'rgba(255,255,255,0.45)'; }
        else { tag = it.price + ' ¤'; col = st === 'poor' ? '#ff6b5b' : '#ffe39a'; }
        text(ctx, tag, r.x + r.w - 26, r.y + r.h / 2, { size: 22, weight: 900, spacing: 2, color: col, align: 'right' });
        rects.push(r);
      });
      ctx.restore();
      // scroll hint
      if (items.length * 108 > listH) {
        const frac = sh.scroll / (items.length * 108 - listH);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(878, listY, 6, listH);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(878, listY + (listH - 80) * frac, 6, 80);
      }
      this.drawShopDetail(ctx, rects);
      const back = { x: 150, y: 1030, w: 200, h: 44, back: true };
      text(ctx, '‹  BACK', back.x, back.y + 20, { size: 20, weight: 800, spacing: 4, color: 'rgba(255,255,255,0.6)' });
      rects.push(back);
      if (!this.game.input.touchActive) text(ctx, '↑↓ ITEM   ·   ←→ CATEGORY   ·   ENTER BUY / EQUIP   ·   L TRY', W - 80, H - 30, { size: 15, weight: 600, spacing: 3, color: 'rgba(255,255,255,0.4)', align: 'right' });
    },
    drawShopDetail(ctx, rects) {
      const id = this.shopSelected();
      if (!id) return;
      const it = SA.Items.get(id), cat = SA.Items.category(id), st = SA.Shop.status(id);
      const x = 920, y = 350, w = 880, h = 670;
      ctx.save();
      skewRect(ctx, x, y, w, h, 14);
      ctx.fillStyle = 'rgba(8,6,10,0.8)'; ctx.fill();
      ctx.strokeStyle = RARITY[it.rarity]; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      // preview stage
      const g = ctx.createRadialGradient(x + 230, y + 300, 20, x + 230, y + 300, 260);
      g.addColorStop(0, 'rgba(215,38,61,0.25)'); g.addColorStop(1, 'rgba(215,38,61,0)');
      ctx.fillStyle = g; ctx.fillRect(x + 20, y + 20, 420, 380);
      if (this.shop.preview) drawPreview(ctx, this.shop.preview, x + 230, y + 390, 1.05, 1 / 60);
      text(ctx, it.name.toUpperCase(), x + 450, y + 70, { size: 38, weight: 900, spacing: 4, color: '#fff' });
      text(ctx, `${it.rarity.toUpperCase()}  ·  ${CAT_LABEL[cat]}`, x + 452, y + 112, { size: 17, weight: 800, spacing: 3, color: RARITY[it.rarity] });
      const desc = it.desc || (cat === 'specials' ? SA.SPECIALS[id].desc : cat === 'cosmetics' ? 'Recolors your sash, eyes and trails.' : '');
      this.wrap(ctx, desc, x + 452, y + 160, 400, 26, { size: 18, weight: 500, color: 'rgba(255,255,255,0.75)' });
      // stats
      const stats = SA.Items.statsFor(id);
      if (stats) {
        [['DAMAGE', stats.damage], ['SPEED', stats.speed], ['RANGE', stats.range]].forEach(([k, v], i) => {
          const sy = y + 440 + i * 40;
          text(ctx, k, x + 40, sy, { size: 17, weight: 800, spacing: 3, color: 'rgba(255,255,255,0.6)' });
          for (let b = 0; b < 10; b++) {
            ctx.fillStyle = b < v ? (b < 7 ? GOLD : '#ff8a5a') : 'rgba(255,255,255,0.12)';
            ctx.fillRect(x + 170 + b * 32, sy - 9, 26, 18);
          }
        });
      }
      const eff = SA.Items.effectText(id);
      if (eff) this.wrap(ctx, eff, x + 40, y + (stats ? 570 : 450), 800, 24, { size: 17, weight: 600, color: 'rgba(255,220,180,0.85)' });
      // requirement / price line
      const lvlOk = SA.Save.data.player.level >= it.levelRequired;
      text(ctx, `LEVEL ${it.levelRequired}`, x + 40, y + 624, { size: 20, weight: 900, spacing: 3, color: lvlOk ? '#7dff9a' : '#ff6b5b' });
      if (!SA.Save.owns(id)) {
        coinIcon(ctx, x + 220, y + 624, 12);
        text(ctx, String(it.price), x + 240, y + 625, { size: 22, weight: 900, color: SA.Save.data.player.coins >= it.price ? '#ffe39a' : '#ff6b5b' });
      }
      // buttons
      let label = 'BUY', disabled = false;
      if (st === 'owned') label = 'EQUIP';
      else if (st === 'equipped') { label = SA.Shop.slotOf(id) === 'ranged' ? 'UNEQUIP' : 'EQUIPPED'; disabled = label === 'EQUIPPED'; }
      else if (st === 'locked') { label = 'LOCKED'; disabled = true; }
      else if (st === 'poor') { label = 'BUY'; disabled = true; }
      const b1 = { x: x + w - 330, y: y + h - 96, w: 290, h: 70, btn: 'main' };
      button(ctx, b1, label, { primary: !disabled, disabled });
      rects.push(b1);
      if (cat !== 'cosmetics') {
        const b2 = { x: x + w - 520, y: y + h - 96, w: 170, h: 70, btn: 'try' };
        button(ctx, b2, 'TRY', {});
        rects.push(b2);
      }
    },
    drawItemGlyph(ctx, id, x, y) {
      const cat = SA.Items.category(id);
      ctx.save();
      ctx.translate(x, y);
      if (cat === 'throwables' || cat === 'firearms') {
        const r = SA.RANGED[id];
        ctx.fillStyle = '#d8d2c8';
        if (r.kind === 'gun') {
          const big = r.proj.count ? 1.2 : r.id === 'revolver' ? 1.05 : 1;
          ctx.fillRect(-36 * big, -10, 64 * big, 16);
          ctx.fillRect(-36 * big, -10, 18, 36);
          if (r.id === 'crossbow') { ctx.strokeStyle = '#d8d2c8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(22, -2, 26, -1.2, 1.2); ctx.stroke(); }
          if (r.id === 'energy_pistol') { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SA.glowSprite('#35f0ff'), 10, -24, 44, 44); }
        } else if (r.proj.type === 'shuriken') {
          ctx.beginPath();
          for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a + 0.78) * 8, Math.sin(a + 0.78) * 8); }
          ctx.fill();
        } else if (r.proj.type === 'boomerang') {
          ctx.strokeStyle = '#d8d2c8'; ctx.lineWidth = 9; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(0, 8, 26, 3.6, 5.8); ctx.stroke();
        } else {
          ctx.rotate(-0.5);
          ctx.fillRect(-30, -4, 26, 8);
          ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(32, 0); ctx.lineTo(-4, 9); ctx.fill();
          if (r.proj.explode) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SA.glowSprite('#ff7a2a'), -46, -16, 32, 32); }
        }
      } else if (cat === 'specials') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(SA.glowSprite('#9a6bff'), -40, -40, 80, 80);
        ctx.strokeStyle = '#e6d6ff'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, 24, -1.2, 1.9); ctx.stroke();
      } else if (cat === 'cosmetics') {
        const c = SA.COSMETICS[id];
        ctx.fillStyle = c.wrap || c.accent;
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, SA.TAU); ctx.fill();
        ctx.fillStyle = c.eye;
        ctx.fillRect(4, -6, 16, 5);
      } else {
        ctx.fillStyle = '#d8d2c8';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, SA.TAU); ctx.fill();
      }
      ctx.restore();
    },
    wrap(ctx, str, x, y, maxW, lh, o) {
      if (!str) return y;
      ctx.font = `${o.weight || 500} ${o.size || 18}px ${SA.FONT}`;
      const words = str.split(' ');
      let line = '';
      for (const wd of words) {
        const test = line ? line + ' ' + wd : wd;
        if (ctx.measureText(test).width > maxW && line) {
          text(ctx, line, x, y, o);
          line = wd; y += lh;
        } else line = test;
      }
      if (line) text(ctx, line, x, y, o);
      return y + lh;
    },

    // ---------- LOADOUT ----------
    enter_loadout() {
      const inv = SA.Save.data.inventory;
      const cyc = (slot, list, allowNone) => (d) => {
        const opts = allowNone ? [null].concat(list) : list;
        let i = opts.indexOf(inv.equipped[slot]);
        i = (i + d + opts.length) % opts.length;
        inv.equipped[slot] = opts[i];
        SA.Save.save();
        this.loadoutPreview = makePreview({});
      };
      const owned = (cat) => SA.Shop.owned(cat);
      const primary = cyc('primary', owned('weapons'));
      const ranged = cyc('ranged', owned('throwables').concat(owned('firearms')), true);
      const special = cyc('special', owned('specials'));
      const cos = cyc('cosmetic', owned('cosmetics'));
      this.menus.loadout = new UI.Menu([
        { label: 'PRIMARY', value: () => SA.WEAPONS[inv.equipped.primary].name.toUpperCase(), left: () => primary(-1), right: () => primary(1) },
        { label: 'RANGED', value: () => (inv.equipped.ranged ? SA.RANGED[inv.equipped.ranged].name.toUpperCase() : 'NONE'), left: () => ranged(-1), right: () => ranged(1) },
        { label: 'SPECIAL', value: () => SA.SPECIALS[inv.equipped.special].name, left: () => special(-1), right: () => special(1) },
        { label: 'COSMETIC', value: () => SA.COSMETICS[inv.equipped.cosmetic].name.toUpperCase(), left: () => cos(-1), right: () => cos(1) },
        { label: 'ENTER THE ARENA', action: () => SA.ArenaMode.start(this.game) },
        { label: 'SHOP', action: () => this.go('shop') },
        { label: 'BACK', action: () => this.go('main') },
      ], { x: 170, y: 330, spacing: 74, size: 36, width: 820, onBack: () => this.go('main') });
      this.loadoutPreview = makePreview({});
    },
    loadoutInput(presses, mouse) { this.menus.loadout.handle(presses, mouse); },
    draw_loadout(ctx) {
      this.header(ctx, 'LOADOUT');
      this.menus.loadout.draw(ctx, this.t);
      const x = 1180, y = 280;
      ctx.save();
      skewRect(ctx, x, y, 620, 720, 14);
      ctx.fillStyle = 'rgba(8,6,10,0.75)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      if (this.loadoutPreview) drawPreview(ctx, this.loadoutPreview, x + 320, y + 470, 1.25, 1 / 60);
      const eq = SA.Save.equipped;
      const st = SA.Items.statsFor(eq.primary);
      if (st) {
        [['DAMAGE', st.damage], ['SPEED', st.speed], ['RANGE', st.range]].forEach(([k, v], i) => {
          const sy = y + 540 + i * 38;
          text(ctx, k, x + 60, sy, { size: 16, weight: 800, spacing: 3, color: 'rgba(255,255,255,0.6)' });
          for (let b = 0; b < 10; b++) {
            ctx.fillStyle = b < v ? GOLD : 'rgba(255,255,255,0.12)';
            ctx.fillRect(x + 190 + b * 34, sy - 9, 28, 18);
          }
        });
      }
      this.wrap(ctx, SA.WEAPONS[eq.primary].desc, x + 60, y + 670, 520, 24, { size: 16, weight: 500, color: 'rgba(255,255,255,0.6)' });
      text(ctx, 'Buy more gear in the SHOP. Skill beats stats: weapons change how you fight, not just how hard you hit.', 170, 900, { size: 18, weight: 500, color: 'rgba(255,255,255,0.45)' });
    },

    // ---------- PROFILE ----------
    enter_profile() {
      this.menus.profile = new UI.Menu([{ label: 'BACK', action: () => this.go('main') }],
        { x: 170, y: 1000, spacing: 60, size: 34, width: 260, onBack: () => this.go('main') });
    },
    profileInput(presses, mouse) { this.menus.profile.handle(presses, mouse); },
    draw_profile(ctx) {
      this.header(ctx, 'PROFILE');
      const D = SA.Save.data, s = D.statistics, P = D.progression, pl = D.player;
      const p = SA.Progression.progress();
      // level card
      ctx.save();
      ctx.translate(290, 400);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(-70, -70, 140, 140);
      ctx.restore();
      text(ctx, String(pl.level), 290, 402, { size: 72, weight: 900, color: '#fff', align: 'center' });
      text(ctx, 'LEVEL', 420, 360, { size: 22, weight: 900, spacing: 6, color: 'rgba(255,255,255,0.6)' });
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(420, 386, 560, 20);
      ctx.fillStyle = GOLD; ctx.fillRect(420, 386, 560 * clamp(p.frac, 0, 1), 20);
      text(ctx, `${p.xp} / ${p.need} XP TO LEVEL ${pl.level + 1}`, 420, 430, { size: 17, weight: 700, spacing: 2, color: 'rgba(255,255,255,0.6)' });
      coinIcon(ctx, 1110, 395, 18);
      text(ctx, String(pl.coins), 1140, 396, { size: 44, weight: 900, color: '#ffe39a' });
      text(ctx, `LIFETIME ${pl.lifetimeCoins}`, 1140, 440, { size: 16, weight: 700, spacing: 3, color: 'rgba(255,255,255,0.5)' });
      const rows = [
        ['BEST ARENA STAGE', P.bestStage], ['ARENA WINS', P.totalArenaWins], ['BOSS KILLS', P.bossKills], ['ARENA RUNS', P.arenaRuns],
        ['FIGHTS', s.fights], ['VICTORIES', s.wins], ['DEFEATS', s.losses], ['K.O.s', s.kos],
        ['HIGHEST COMBO', s.maxCombo + ' HITS'], ['BIGGEST COMBO DAMAGE', s.maxDamage], ['PARRIES', s.parries], ['SPECIALS LANDED', s.specialsLanded],
      ];
      rows.forEach(([k, v], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 170 + col * 800, y = 520 + row * 64;
        text(ctx, k, x, y, { size: 19, weight: 700, spacing: 4, color: 'rgba(255,255,255,0.55)' });
        text(ctx, String(v), x + 680, y, { size: 32, weight: 800, color: '#f4ede4', align: 'right' });
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y + 24, 680, 2);
      });
      const bosses = SA.BOSS_ORDER.map((b) => `${SA.BOSSES[b].name} ${P.bossesDefeated[b] ? '×' + P.bossesDefeated[b] : '—'}`).join('   ·   ');
      text(ctx, 'BOSSES  ' + bosses, 170, 930, { size: 15, weight: 700, spacing: 2, color: 'rgba(255,255,255,0.45)' });
      this.menus.profile.draw(ctx, this.t);
    },

    // ---------- ARENA HUD ----------
    drawArenaInfo(ctx) {
      const g = this.game, run = g.arenaRun;
      if (!run) return;
      const e = run.enemy;
      text(ctx, `STAGE ${run.stage}`, W / 2, 168, { size: 24, weight: 900, spacing: 6, color: e.kind === 'boss' ? '#ff5a4a' : e.kind === 'elite' ? GOLD : '#fff', align: 'center' });
      const nx = SA.ArenaMode.nextLabel(run.stage);
      text(ctx, nx, W / 2, 196, { size: 14, weight: 800, spacing: 3, color: 'rgba(255,255,255,0.55)', align: 'center' });
      // player side: streak + run coins
      const ly = 140;
      text(ctx, `STREAK ${run.streak}   ·   ${run.coins} ¤`, 160, ly, { size: 16, weight: 800, spacing: 3, color: GOLD });
      // enemy side: type chips
      const chips = [e.label].concat(e.modifiers.map((m) => SA.ELITE_MODIFIERS[m].label));
      let cx = W - 160;
      for (let i = chips.length - 1; i >= 0; i--) {
        const c = chips[i];
        ctx.font = `800 15px ${SA.FONT}`;
        const w = ctx.measureText(c).width + c.length * 2 + 26;
        ctx.save();
        skewRect(ctx, cx - w, ly - 15, w, 30, 8);
        ctx.fillStyle = i === 0 ? (e.kind === 'boss' ? '#a0141e' : e.kind === 'elite' ? '#8a6414' : 'rgba(20,14,24,0.85)') : 'rgba(20,14,24,0.85)';
        ctx.fill();
        ctx.restore();
        text(ctx, c, cx - w / 2 + 3, ly, { size: 15, weight: 800, spacing: 2, color: '#fff', align: 'center' });
        cx -= w + 8;
      }
    },

    drawArenaOverlay(ctx) {
      const g = this.game, run = g.arenaRun;
      if (!run || !run.screen) return;
      const a = clamp(run.screenT / 0.4, 0, 1);
      ctx.fillStyle = `rgba(3,2,6,${0.78 * a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      if (run.screen === 'reward') {
        const r = run.reward, e = run.enemy;
        text(ctx, 'VICTORY', W / 2, 170, { size: 120, weight: 900, italic: true, spacing: 22, color: '#f4e2b8', align: 'center', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 8, alpha: a });
        text(ctx, `STAGE ${run.stage} CLEARED${e.kind === 'boss' ? '  ·  BOSS DEFEATED' : e.kind === 'elite' ? '  ·  ELITE DEFEATED' : ''}`, W / 2, 262, { size: 24, weight: 800, spacing: 6, color: 'rgba(255,255,255,0.75)', align: 'center', alpha: a });
        const count = clamp((run.screenT - 0.3) / 0.8, 0, 1);
        coinIcon(ctx, W / 2 - 170, 352, 22);
        text(ctx, `+ ${Math.round(r.coins * count)} COINS`, W / 2 - 136, 354, { size: 48, weight: 900, color: '#ffe39a', alpha: a });
        text(ctx, `+ ${Math.round(r.xp * count)} XP`, W / 2 - 136, 420, { size: 40, weight: 900, color: '#bfe6ff', alpha: a });
        let y = 488;
        if (r.streakBonus) { text(ctx, `STREAK BONUS +${Math.round(r.streakBonus * 100)} %`, W / 2, y, { size: 24, weight: 900, spacing: 4, color: GOLD, align: 'center', alpha: a }); y += 38; }
        if (r.perfectBonus) { text(ctx, `PERFECT +${Math.round(r.perfectBonus * 100)} %`, W / 2, y, { size: 24, weight: 900, spacing: 4, color: '#ffe39a', align: 'center', alpha: a }); y += 38; }
        for (const u of run.levelUps || []) {
          const pulse = 0.7 + 0.3 * Math.sin(this.t * 6);
          text(ctx, `LEVEL UP!  LV ${u.level}  ·  +${u.coins} COINS`, W / 2, y + 10, { size: 32, weight: 900, spacing: 6, color: `rgba(255,${190 + Math.round(pulse * 6) * 10},120,1)`, align: 'center', alpha: a });
          y += 44;
          if (u.unlocks.length) { text(ctx, 'NEW IN SHOP: ' + u.unlocks.join(', ').toUpperCase(), W / 2, y, { size: 18, weight: 700, spacing: 2, color: 'rgba(255,255,255,0.75)', align: 'center', alpha: a }); y += 34; }
        }
        const p = SA.Progression.progress();
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(W / 2 - 300, 700, 600, 14);
        ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 300, 700, 600 * clamp(p.frac, 0, 1), 14);
        text(ctx, `LEVEL ${p.level}   ·   STREAK ${run.streak}   ·   RUN ${run.coins} COINS   ·   ${SA.ArenaMode.nextLabel(run.stage)}`, W / 2, 742, { size: 18, weight: 800, spacing: 3, color: 'rgba(255,255,255,0.7)', align: 'center', alpha: a });
      } else {
        text(ctx, run.retired ? 'RUN ENDED' : 'ARENA RUN OVER', W / 2, 180, { size: 100, weight: 900, italic: true, spacing: 16, color: run.retired ? '#f4e2b8' : '#ff5a5a', align: 'center', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 8, alpha: a });
        const rows = [
          ['REACHED STAGE', run.stage], ['WINS', run.wins], ['BOSSES DEFEATED', run.bosses],
          ['COINS EARNED', run.coins], ['XP EARNED', run.xp], ['BEST STAGE', SA.Save.data.progression.bestStage],
        ];
        rows.forEach(([k, v], i) => {
          const y = 320 + i * 64;
          text(ctx, k, W / 2 - 330, y, { size: 24, weight: 800, spacing: 5, color: 'rgba(255,255,255,0.6)', alpha: a });
          text(ctx, String(v), W / 2 + 330, y, { size: 36, weight: 900, color: '#f4ede4', align: 'right', alpha: a });
        });
        if (run.record) {
          text(ctx, 'NEW RECORD', W / 2, 720, { size: 30, weight: 900, spacing: 10, color: GOLD, align: 'center', alpha: a });
        }
        text(ctx, 'Coins and XP you earned are saved.', W / 2, 752, { size: 17, weight: 600, color: 'rgba(255,255,255,0.5)', align: 'center', alpha: a });
      }
      ctx.globalAlpha = 1;
      if (run.menu && run.screenT > 0.6) run.menu.draw(ctx, this.t);
    },
  });
})(window.SA);
