'use strict';
/*
 * Fighter rendering — stylised dark-fantasy Egypt.
 *
 * Fighters are painted with materials instead of flat silhouettes: a dark body underneath, linen
 * bandage wraps (with torn gaps that show the body), cloth, bronze / gold armour and glowing eyes.
 * Every look is data (SA.CHARACTERS / enemy generator):
 *   look.kind   mummy | undead | human | beast | god     (what the limbs are made of)
 *   look.mat    { skin, wrap, metal, cloth, eye }         (palette)
 *   look.wraps  0..1 bandage coverage, look.tatters 0..1 torn bands
 *   look.accessories  typed pieces (nemes, shield, jackal head, pauldron, collar …) and verlet ropes
 *                     (loose bandage ends, sashes) that trail behind every movement.
 * Rim lights, afterimages, hit flashes and the menu silhouettes use the fast flat-silhouette path.
 */
(function (SA) {
  const { clamp } = SA.M;
  const shade = (c, a) => SA.M.shade(c, a);

  // ---------- cloth / loose bandages ----------
  class Rope {
    constructor(n, seg) {
      this.n = n;
      this.seg = seg;
      this.pts = [];
      for (let i = 0; i < n; i++) this.pts.push({ x: 0, y: 0, px: 0, py: 0 });
      this.ready = false;
    }
    reset(x, y) {
      for (const p of this.pts) { p.x = p.px = x; p.y = p.py = y; }
      this.ready = true;
    }
    update(ax, ay, dt, windX, lift) {
      if (!this.ready) this.reset(ax, ay);
      const pts = this.pts;
      pts[0].x = pts[0].px = ax;
      pts[0].y = pts[0].py = ay;
      const g = 1500 * dt * dt;
      const w = windX * dt * dt;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.93, vy = (p.y - p.py) * 0.93;
        p.px = p.x; p.py = p.y;
        p.x += vx + w * (0.6 + i * 0.12);
        p.y += vy + g - lift * dt * dt;
      }
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const diff = (d - this.seg) / d;
          if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
          else {
            a.x += dx * diff * 0.5; a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
          }
          if (b.y > -2) b.y = -2;
        }
      }
      // big teleports (special) shouldn't stretch the cloth across the screen
      const last = pts[pts.length - 1];
      if (Math.abs(last.x - ax) > this.seg * this.n * 2) this.reset(ax, ay);
    }
    // tapered ribbon; bandage ropes get a frayed, slightly darker tip
    draw(ctx, w0, w1, color, tip) {
      const pts = this.pts;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        ctx.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1));
        if (tip && i === pts.length - 1) ctx.strokeStyle = tip;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
  }

  // local (facing space) -> world
  function lw(f, lx, ly) {
    const sx = f.facing * f.spinScale * f.scaleX * f.look.scale, sy = f.scaleY * f.look.scale;
    return { x: f.x + lx * sx, y: f.y + ly * sy };
  }

  function createAccessories(f) {
    const list = [];
    for (const a of f.look.accessories || []) {
      const item = Object.assign({}, a);
      if (a.rope) item.ropes = a.rope.map((r) => new Rope(r.n, r.seg));
      list.push(item);
    }
    f.accessories = list;
  }

  function resetAccessories(f) {
    for (const a of f.accessories || []) if (a.ropes) for (const r of a.ropes) r.ready = false;
  }

  function anchorOf(f, a, i) {
    const L = f.local;
    const r = a.rope[i];
    const off = r.at || [0, 0];
    const base = L[r.anchor || a.anchor || 'head'];
    return lw(f, base.x + off[0], base.y + off[1]);
  }

  // Loose cloth reacts to the fighter's speed: dashes and specials whip the bandages back.
  function updateAccessories(f, dt, arena) {
    if (!f.accessories) createAccessories(f);
    const wind = (arena && arena.wind) || 0;
    const fast = f.state === 'dash' || f.state === 'sprint' || f.state === 'roll' || f.state === 'special';
    const drag = -f.vx * (fast ? 0.75 : 0.45);
    const lift = f.state === 'special' ? 2600 : fast ? 900 : 0;
    for (const a of f.accessories) {
      if (!a.ropes) continue;
      a.ropes.forEach((r, i) => {
        const p = anchorOf(f, a, i);
        r.update(p.x, p.y, dt, wind * (a.windMul || 1) + drag, (a.lift || 0) + lift);
      });
    }
  }

  // ---------- geometry helpers ----------
  // tapered segment + full round caps: joints (knees, elbows) stay closed at any bend
  function limbPath(ctx, a, b, w0, w1) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const nx = -dy / d, ny = dx / d;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w0 / 2, a.y + ny * w0 / 2);
    ctx.lineTo(b.x + nx * w1 / 2, b.y + ny * w1 / 2);
    ctx.lineTo(b.x - nx * w1 / 2, b.y - ny * w1 / 2);
    ctx.lineTo(a.x - nx * w0 / 2, a.y - ny * w0 / 2);
    ctx.closePath();
    ctx.moveTo(a.x + w0 / 2, a.y);
    ctx.arc(a.x, a.y, w0 / 2, 0, SA.TAU);
    ctx.moveTo(b.x + w1 / 2, b.y);
    ctx.arc(b.x, b.y, w1 / 2, 0, SA.TAU);
  }
  function limb(ctx, a, b, w0, w1) { limbPath(ctx, a, b, w0, w1); ctx.fill(); }

  function dot(ctx, p, r) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, SA.TAU);
    ctx.fill();
  }

  function torsoPath(ctx, hip, neck, waist, chest, sc) {
    const dx = neck.x - hip.x, dy = neck.y - hip.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const ux = dx / d, uy = dy / d;
    const nx = -uy, ny = ux;
    const sh = { x: hip.x + ux * d * 0.84, y: hip.y + uy * d * 0.84 };
    const mid = { x: hip.x + ux * d * 0.5, y: hip.y + uy * d * 0.5 };
    const w = waist / 2, c = chest / 2;
    ctx.beginPath();
    ctx.moveTo(hip.x + nx * w, hip.y + ny * w);
    ctx.quadraticCurveTo(mid.x + nx * (c * 0.95), mid.y + ny * (c * 0.95), sh.x + nx * c, sh.y + ny * c);
    ctx.quadraticCurveTo(neck.x + nx * c * 0.9 + ux * 10 * sc, neck.y + ny * c * 0.9 + uy * 10 * sc, neck.x + ux * 4, neck.y + uy * 4);
    ctx.quadraticCurveTo(neck.x - nx * c * 0.9 + ux * 10 * sc, neck.y - ny * c * 0.9 + uy * 10 * sc, sh.x - nx * c, sh.y - ny * c);
    ctx.quadraticCurveTo(mid.x - nx * (c * 0.95), mid.y - ny * (c * 0.95), hip.x - nx * w, hip.y - ny * w);
    ctx.closePath();
    ctx.moveTo(hip.x + w * 1.08, hip.y);
    ctx.arc(hip.x, hip.y, w * 1.08, 0, SA.TAU);
  }
  function torso(ctx, hip, neck, waist, chest, sc) { torsoPath(ctx, hip, neck, waist, chest, sc); ctx.fill(); }

  // deterministic noise for bandage patterns (same pattern every frame)
  function hash(a, b) {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ---------- palette ----------
  const KIND_DEFAULTS = {
    mummy: { skin: '#1a1511', wrap: '#c7b48c', metal: '#d4a84a', cloth: '#6b1f1a', eye: '#4ff0dc', wraps: 1, tatters: 0.16 },
    undead: { skin: '#2a2622', wrap: '#6d6152', metal: '#7d6a45', cloth: '#3b3226', eye: '#6fe8d8', wraps: 0.45, tatters: 0.4 },
    human: { skin: '#3a2618', wrap: '#b58e5a', metal: '#b09a6a', cloth: '#d8ccb0', eye: '#ffcf6a', wraps: 0.12, tatters: 0.3 },
    beast: { skin: '#141414', wrap: '#2a2a2a', metal: '#6a6a50', cloth: '#221a14', eye: '#ff4a3a', wraps: 0, tatters: 0 },
    god: { skin: '#0e0c10', wrap: '#2a2230', metal: '#e0b24a', cloth: '#1a1622', eye: '#ffd24a', wraps: 0, tatters: 0 },
  };

  function paletteOf(look) {
    if (look._pal && look._pal.src === look.mat) return look._pal;
    const d = KIND_DEFAULTS[look.kind] || KIND_DEFAULTS.human;
    const m = Object.assign({}, d, look.mat || {});
    const pal = {
      src: look.mat, kind: look.kind,
      skin: m.skin, skinBack: shade(m.skin, -0.35),
      wrap: m.wrap, wrapBack: shade(m.wrap, -0.42), wrapDark: shade(m.wrap, -0.22), wrapLight: shade(m.wrap, 0.12),
      metal: m.metal, metalDark: shade(m.metal, -0.35), metalLight: shade(m.metal, 0.35),
      cloth: m.cloth, clothBack: shade(m.cloth, -0.35),
      eye: look.eye || m.eye,
      wraps: look.wraps !== undefined ? look.wraps : d.wraps,
      tatters: look.tatters !== undefined ? look.tatters : d.tatters,
    };
    look._pal = pal;
    return pal;
  }
  SA.lookPalette = paletteOf;

  // ---------- weapons ----------
  const ELEMENT_GLOW = { fire: '#ff7a2a', frost: '#8fe3ff', shock: '#9fd0ff', shadow: '#b58cff' };

  function seg(ctx, ax, ay, bx, by, w) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // Draws a weapon from hand h to tip t (butt u behind the hand). detail = edge highlight + element glow.
  // col: metal colour (or a flat silhouette colour for rims / ghosts); grip: handle colour.
  function drawWeaponShape(ctx, w, h, t, u, col, detail, sc, grip) {
    const dx = t.x - h.x, dy = t.y - h.y;
    const L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L;       // along the blade
    const nx = -uy, ny = ux;              // perpendicular
    const gripCol = grip || col;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const k = sc || 1;
    const edge = [];                      // points for the edge highlight
    switch (w.look) {
      case 'khopesh': {
        // Egyptian sickle-sword: straight shaft, then a deep hooked blade
        ctx.strokeStyle = gripCol;
        seg(ctx, h.x, h.y, u.x, u.y, 7 * k);
        ctx.strokeStyle = col;
        const s0 = { x: h.x + ux * 8, y: h.y + uy * 8 };
        const s1 = { x: h.x + dx * 0.42, y: h.y + dy * 0.42 };
        seg(ctx, s0.x, s0.y, s1.x, s1.y, 8 * k);
        ctx.beginPath();
        ctx.moveTo(s1.x + nx * 5 * k, s1.y + ny * 5 * k);
        ctx.quadraticCurveTo(h.x + dx * 0.78 + nx * 34 * k, h.y + dy * 0.78 + ny * 34 * k, t.x - nx * 6 * k, t.y - ny * 6 * k);
        ctx.quadraticCurveTo(t.x + nx * 10 * k + ux * 8, t.y + ny * 10 * k + uy * 8, t.x + nx * 18 * k, t.y + ny * 18 * k);
        ctx.quadraticCurveTo(h.x + dx * 0.76 + nx * 16 * k, h.y + dy * 0.76 + ny * 16 * k, s1.x - nx * 5 * k, s1.y - ny * 5 * k);
        ctx.closePath(); ctx.fill();
        edge.push([s1.x + nx * 6 * k, s1.y + ny * 6 * k], [h.x + dx * 0.78 + nx * 30 * k, h.y + dy * 0.78 + ny * 30 * k], [t.x - nx * 4 * k, t.y - ny * 4 * k]);
        break;
      }
      case 'katana': case 'dagger': {
        const wide = (w.look === 'dagger' ? 8 : 7) * k;
        ctx.strokeStyle = gripCol;
        seg(ctx, h.x, h.y, u.x, u.y, 7 * k);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(h.x + ux * 6, h.y + uy * 6, 4 * k, 11 * k, Math.atan2(uy, ux), 0, SA.TAU); ctx.fill();
        const bend = L * (w.look === 'dagger' ? 0.02 : 0.06);
        ctx.beginPath();
        ctx.moveTo(h.x + ux * 8 + nx * wide / 2, h.y + uy * 8 + ny * wide / 2);
        ctx.quadraticCurveTo(h.x + dx * 0.55 + nx * (wide / 2 + bend), h.y + dy * 0.55 + ny * (wide / 2 + bend), t.x, t.y);
        ctx.quadraticCurveTo(h.x + dx * 0.55 + nx * (bend - wide / 2), h.y + dy * 0.55 + ny * (bend - wide / 2), h.x + ux * 8 - nx * wide / 2, h.y + uy * 8 - ny * wide / 2);
        ctx.closePath(); ctx.fill();
        edge.push([h.x + ux * 12 + nx * (wide / 2 - 1), h.y + uy * 12 + ny * (wide / 2 - 1)], [h.x + dx * 0.55 + nx * (wide / 2 + bend - 1), h.y + dy * 0.55 + ny * (wide / 2 + bend - 1)], [t.x, t.y]);
        break;
      }
      case 'greatsword': case 'axe': {
        ctx.strokeStyle = gripCol;
        seg(ctx, h.x, h.y, u.x, u.y, 9 * k);
        ctx.strokeStyle = col;
        if (w.look === 'greatsword') {
          seg(ctx, h.x + nx * 22 * k, h.y + ny * 22 * k, h.x - nx * 22 * k, h.y - ny * 22 * k, 9 * k);
          const w0 = 22 * k, w1 = 12 * k;
          ctx.beginPath();
          ctx.moveTo(h.x + ux * 6 + nx * w0 / 2, h.y + uy * 6 + ny * w0 / 2);
          ctx.lineTo(t.x - ux * 22 + nx * w1 / 2, t.y - uy * 22 + ny * w1 / 2);
          ctx.lineTo(t.x, t.y);
          ctx.lineTo(t.x - ux * 22 - nx * w1 / 2, t.y - uy * 22 - ny * w1 / 2);
          ctx.lineTo(h.x + ux * 6 - nx * w0 / 2, h.y + uy * 6 - ny * w0 / 2);
          ctx.closePath(); ctx.fill();
          edge.push([h.x + ux * 10 + nx * (w0 / 2 - 2), h.y + uy * 10 + ny * (w0 / 2 - 2)], [t.x - ux * 22 + nx * (w1 / 2 - 1), t.y - uy * 22 + ny * (w1 / 2 - 1)], [t.x, t.y]);
        } else {
          ctx.strokeStyle = gripCol;
          seg(ctx, h.x, h.y, t.x, t.y, 9 * k);
          const c = { x: t.x - ux * 26, y: t.y - uy * 26 };
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(c.x - ux * 34 + nx * 6, c.y - uy * 34 + ny * 6);
          ctx.quadraticCurveTo(c.x + nx * 78 * k, c.y + ny * 78 * k, c.x + ux * 36 + nx * 6, c.y + uy * 36 + ny * 6);
          ctx.quadraticCurveTo(c.x + nx * 40 * k, c.y + ny * 40 * k, c.x - ux * 34 + nx * 6, c.y - uy * 34 + ny * 6);
          ctx.fill();
          edge.push([c.x - ux * 30 + nx * 20 * k, c.y - uy * 30 + ny * 20 * k], [c.x + nx * 62 * k, c.y + ny * 62 * k], [c.x + ux * 32 + nx * 20 * k, c.y + uy * 32 + ny * 20 * k]);
        }
        break;
      }
      case 'staff': case 'ankh': case 'scepter': {
        ctx.strokeStyle = gripCol;
        seg(ctx, u.x, u.y, t.x, t.y, 10 * k);
        ctx.strokeStyle = col;
        for (const e of [u, t]) seg(ctx, e.x - ux * 10, e.y - uy * 10, e.x, e.y, 13 * k);
        if (w.look === 'ankh') {
          // ankh head: a loop over a cross bar
          ctx.lineWidth = 7 * k;
          seg(ctx, t.x - ux * 14 + nx * 18 * k, t.y - uy * 14 + ny * 18 * k, t.x - ux * 14 - nx * 18 * k, t.y - uy * 14 - ny * 18 * k, 7 * k);
          ctx.beginPath();
          ctx.ellipse(t.x + ux * 12 * k, t.y + uy * 12 * k, 15 * k, 11 * k, Math.atan2(uy, ux), 0, SA.TAU);
          ctx.stroke();
        } else if (w.look === 'scepter') {
          // was-sceptre: animal head at the top, forked foot
          ctx.beginPath();
          ctx.moveTo(t.x - nx * 5 * k, t.y - ny * 5 * k);
          ctx.lineTo(t.x + ux * 10 * k + nx * 20 * k, t.y + uy * 10 * k + ny * 20 * k);
          ctx.lineTo(t.x + ux * 4 * k + nx * 4 * k, t.y + uy * 4 * k + ny * 4 * k);
          ctx.closePath(); ctx.fill();
          seg(ctx, u.x, u.y, u.x - ux * 14 * k + nx * 9 * k, u.y - uy * 14 * k + ny * 9 * k, 5 * k);
          seg(ctx, u.x, u.y, u.x - ux * 14 * k - nx * 9 * k, u.y - uy * 14 * k - ny * 9 * k, 5 * k);
        }
        break;
      }
      case 'spear': {
        ctx.strokeStyle = gripCol;
        seg(ctx, u.x, u.y, t.x - ux * 30, t.y - uy * 30, 8 * k);
        ctx.strokeStyle = col;
        const b0 = { x: t.x - ux * 42, y: t.y - uy * 42 };
        ctx.beginPath();
        ctx.moveTo(b0.x, b0.y);
        ctx.quadraticCurveTo(b0.x + ux * 14 + nx * 13 * k, b0.y + uy * 14 + ny * 13 * k, t.x, t.y);
        ctx.quadraticCurveTo(b0.x + ux * 14 - nx * 13 * k, b0.y + uy * 14 - ny * 13 * k, b0.x, b0.y);
        ctx.fill();
        seg(ctx, b0.x + nx * 12 * k, b0.y + ny * 12 * k, b0.x - nx * 12 * k, b0.y - ny * 12 * k, 5 * k);
        edge.push([b0.x + ux * 6 + nx * 7 * k, b0.y + uy * 6 + ny * 7 * k], [t.x, t.y]);
        break;
      }
      case 'hammer': case 'mace': {
        ctx.strokeStyle = gripCol;
        seg(ctx, u.x, u.y, t.x, t.y, 9 * k);
        ctx.fillStyle = col;
        if (w.look === 'mace') {
          // pear-shaped stone / bronze mace head with a band
          ctx.beginPath();
          ctx.ellipse(t.x - ux * 4, t.y - uy * 4, 30 * k, 24 * k, Math.atan2(uy, ux), 0, SA.TAU);
          ctx.fill();
          ctx.strokeStyle = shade(col.length === 7 ? col : '#888888', -0.3);
          seg(ctx, t.x - ux * 22 + nx * 20 * k, t.y - uy * 22 + ny * 20 * k, t.x - ux * 22 - nx * 20 * k, t.y - uy * 22 - ny * 20 * k, 5 * k);
          edge.push([t.x + nx * 20 * k, t.y + ny * 20 * k], [t.x + ux * 22 + nx * 6 * k, t.y + uy * 22 + ny * 6 * k]);
        } else {
          ctx.save();
          ctx.translate(t.x, t.y);
          ctx.rotate(Math.atan2(uy, ux));
          ctx.fillRect(-26 * k, -34 * k, 44 * k, 68 * k);
          ctx.restore();
          edge.push([t.x - ux * 24 + nx * 33 * k, t.y - uy * 24 + ny * 33 * k], [t.x + ux * 16 + nx * 33 * k, t.y + uy * 16 + ny * 33 * k]);
        }
        break;
      }
      case 'scythe': {
        ctx.strokeStyle = gripCol;
        seg(ctx, u.x, u.y, t.x, t.y, 8 * k);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(t.x + nx * 4, t.y + ny * 4);
        ctx.quadraticCurveTo(t.x - ux * 30 + nx * 70 * k, t.y - uy * 30 + ny * 70 * k, t.x - ux * 95 * k + nx * 40 * k, t.y - uy * 95 * k + ny * 40 * k);
        ctx.quadraticCurveTo(t.x - ux * 24 + nx * 44 * k, t.y - uy * 24 + ny * 44 * k, t.x - nx * 4, t.y - ny * 4);
        ctx.fill();
        edge.push([t.x + nx * 8, t.y + ny * 8], [t.x - ux * 30 + nx * 64 * k, t.y - uy * 30 + ny * 64 * k], [t.x - ux * 90 * k + nx * 40 * k, t.y - uy * 90 * k + ny * 40 * k]);
        break;
      }
      case 'baton': {
        seg(ctx, u.x, u.y, t.x, t.y, 11 * k);
        edge.push([h.x + ux * 20, h.y + uy * 20], [t.x, t.y]);
        break;
      }
      default:
        seg(ctx, h.x, h.y, t.x, t.y, 7 * k);
    }
    if (!detail) return;
    if (edge.length) {
      ctx.strokeStyle = 'rgba(255,240,205,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(edge[0][0], edge[0][1]);
      for (let i = 1; i < edge.length; i++) ctx.lineTo(edge[i][0], edge[i][1]);
      ctx.stroke();
    }
    const glow = ELEMENT_GLOW[w.element];
    if (glow || w.look === 'baton') {
      const c = glow || '#9fd0ff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(performance.now() / 90);
      ctx.strokeStyle = c;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(h.x + ux * L * 0.3, h.y + uy * L * 0.3); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(SA.glowSprite(c), t.x - 26, t.y - 26, 52, 52);
      ctx.restore();
    }
    if (w.rarity === 'legendary') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18;
      ctx.drawImage(SA.glowSprite(glow || '#ffb340'), (h.x + t.x) / 2 - L * 0.6, (h.y + t.y) / 2 - L * 0.6, L * 1.2, L * 1.2);
      ctx.restore();
    }
  }

  function drawWeapons(ctx, P, w, col, which, detail, sc, grip) {
    if (!w || !w.geom) return;
    if (which === 'B' && w.geom.dual) drawWeaponShape(ctx, w, P.handB, P.tipB, P.handB, col, detail, sc, grip);
    if (which === 'F') drawWeaponShape(ctx, w, P.handF, P.tip, P.butt, col, detail, sc, grip);
  }

  // ---------- flat silhouette (rims, afterimages, flashes, shadows) ----------
  function drawFlat(ctx, P, look, colFront, colBack, w) {
    const b = (look.bulk || 1) * look.scale;
    if (w) drawWeapons(ctx, P, w, colBack, 'B', false, look.scale);
    ctx.fillStyle = colBack;
    limb(ctx, P.sh, P.elbB, 24 * b, 18 * b);
    limb(ctx, P.elbB, P.handB, 18 * b, 13 * b);
    dot(ctx, P.handB, 12 * b);
    limb(ctx, P.hip, P.kneeB, 34 * b, 23 * b);
    limb(ctx, P.kneeB, P.footB, 23 * b, 14 * b);
    limb(ctx, P.footB, P.toeB, 14 * b, 8 * b);
    ctx.fillStyle = colFront;
    torso(ctx, P.hip, P.neck, 38 * b, 62 * b, b);
    limb(ctx, P.neck, P.head, 18 * b, 16 * b);
    dot(ctx, P.head, SA.DIM.headR * look.scale * (look.headScale || 1));
    limb(ctx, P.hip, P.kneeF, 34 * b, 23 * b);
    limb(ctx, P.kneeF, P.footF, 23 * b, 14 * b);
    limb(ctx, P.footF, P.toeF, 14 * b, 8 * b);
    limb(ctx, P.sh, P.elbF, 24 * b, 18 * b);
    limb(ctx, P.elbF, P.handF, 18 * b, 13 * b);
    if (w) drawWeapons(ctx, P, w, colFront, 'F', false, look.scale);
    ctx.fillStyle = colFront;
    dot(ctx, P.handF, 12.5 * b);
  }

  // ---------- material body ----------
  const fullDetail = () => !SA.GFX || SA.GFX.fighterDetail !== false;

  // one limb: skin, bandage bands across it (torn in places), then a shadow side for volume
  function matLimb(ctx, a, b, w0, w1, pal, back, seed, wrapK, sc) {
    limbPath(ctx, a, b, w0, w1);
    ctx.fillStyle = back ? pal.skinBack : pal.skin;
    ctx.fill();
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 0.001;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const W = Math.max(w0, w1) * 0.62;
    const detail = fullDetail();
    if (wrapK > 0) {
      ctx.save();
      limbPath(ctx, a, b, w0, w1);
      ctx.clip();
      const spacing = 8.5 * sc, band = 6.4 * sc;
      ctx.lineWidth = band;
      ctx.lineCap = 'butt';
      let i = 0;
      for (let t = -w0 * 0.5; t < L + w1 * 0.5; t += spacing, i++) {
        const r = hash(seed, i);
        if (r < pal.tatters || r > 0.02 + wrapK + pal.tatters) continue;        // torn band / unwrapped part
        const sl = (hash(seed + 7, i) - 0.5) * 0.8;
        const cx = a.x + ux * t, cy = a.y + uy * t;
        ctx.strokeStyle = back ? pal.wrapBack : (i % 3 === 0 ? pal.wrapDark : pal.wrap);
        ctx.beginPath();
        ctx.moveTo(cx + nx * W + ux * sl * W, cy + ny * W + uy * sl * W);
        ctx.lineTo(cx - nx * W - ux * sl * W, cy - ny * W - uy * sl * W);
        ctx.stroke();
      }
      if (detail) {
        // volume: the far side of the limb falls into shadow
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(a.x + nx * W * 0.35, a.y + ny * W * 0.35);
        ctx.lineTo(b.x + nx * W * 0.35, b.y + ny * W * 0.35);
        ctx.lineTo(b.x + nx * W * 1.5, b.y + ny * W * 1.5);
        ctx.lineTo(a.x + nx * W * 1.5, a.y + ny * W * 1.5);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (detail) {
      ctx.save();
      limbPath(ctx, a, b, w0, w1);
      ctx.clip();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(a.x + nx * W * 0.3, a.y + ny * W * 0.3);
      ctx.lineTo(b.x + nx * W * 0.3, b.y + ny * W * 0.3);
      ctx.lineTo(b.x + nx * W * 1.5, b.y + ny * W * 1.5);
      ctx.lineTo(a.x + nx * W * 1.5, a.y + ny * W * 1.5);
      ctx.fill();
      ctx.restore();
    }
  }

  function matTorso(ctx, P, pal, b, wrapK, sc) {
    torsoPath(ctx, P.hip, P.neck, 38 * b, 62 * b, b);
    ctx.fillStyle = pal.skin;
    ctx.fill();
    if (wrapK <= 0) return;
    ctx.save();
    torsoPath(ctx, P.hip, P.neck, 38 * b, 62 * b, b);
    ctx.clip();
    const dx = P.neck.x - P.hip.x, dy = P.neck.y - P.hip.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    ctx.lineWidth = 7.5 * sc;
    let i = 0;
    for (let t = -20 * sc; t < L + 10; t += 9.5 * sc, i++) {
      const r = hash(91, i);
      if (r < pal.tatters * 0.8 || r > 0.05 + wrapK + pal.tatters) continue;
      const sl = (hash(33, i) - 0.5) * 0.9 + (i % 2 ? 0.25 : -0.25);          // criss-cross wrapping
      const cx = P.hip.x + ux * t, cy = P.hip.y + uy * t;
      ctx.strokeStyle = i % 4 === 0 ? pal.wrapDark : i % 4 === 2 ? pal.wrapLight : pal.wrap;
      ctx.beginPath();
      ctx.moveTo(cx + nx * 50 * sc + ux * sl * 30 * sc, cy + ny * 50 * sc + uy * sl * 30 * sc);
      ctx.lineTo(cx - nx * 50 * sc - ux * sl * 30 * sc, cy - ny * 50 * sc - uy * sl * 30 * sc);
      ctx.stroke();
    }
    if (fullDetail()) {
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(P.hip.x + nx * 8 * sc, P.hip.y + ny * 8 * sc);
      ctx.lineTo(P.neck.x + nx * 8 * sc, P.neck.y + ny * 8 * sc);
      ctx.lineTo(P.neck.x + nx * 60 * sc, P.neck.y + ny * 60 * sc);
      ctx.lineTo(P.hip.x + nx * 60 * sc, P.hip.y + ny * 60 * sc);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function headFrame(f, P) {
    // unit vectors of the head: forward (face) and up, derived from neck->head
    P = P || f.skel;
    const dx = P.head.x - P.neck.x, dy = P.head.y - P.neck.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;          // up
    const dirX = f.facing * Math.sign(f.spinScale || 1);
    let fx = -uy, fy = ux;
    if (fx * dirX < 0) { fx = -fx; fy = -fy; }
    return { ux, uy, fx, fy };
  }

  function matHead(ctx, f, P, pal, wrapK, sc) {
    const hr = SA.DIM.headR * sc * (f.look.headScale || 1);
    ctx.fillStyle = pal.skin;
    dot(ctx, P.head, hr);
    if (wrapK <= 0) return;
    const hf = headFrame(f, P);
    ctx.save();
    ctx.beginPath(); ctx.arc(P.head.x, P.head.y, hr, 0, SA.TAU); ctx.clip();
    ctx.lineWidth = 6 * sc;
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;                           // eye slit stays open
      const r = hash(57, i + 3);
      if (r < pal.tatters * 0.6) continue;
      const cx = P.head.x + hf.ux * i * 6.5 * sc, cy = P.head.y + hf.uy * i * 6.5 * sc;
      const sl = (hash(12, i + 3) - 0.5) * 0.7;
      ctx.strokeStyle = i % 2 ? pal.wrap : pal.wrapDark;
      ctx.beginPath();
      ctx.moveTo(cx - hf.fx * hr * 1.2 + hf.ux * sl * 8, cy - hf.fy * hr * 1.2 + hf.uy * sl * 8);
      ctx.lineTo(cx + hf.fx * hr * 1.2 - hf.ux * sl * 8, cy + hf.fy * hr * 1.2 - hf.uy * sl * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- typed accessories ----------
  // layer: back (before the body) · body (over torso) · head (over the head) · front (over the front arm)
  const LAYER = {
    shield: 'backArm', quiver: 'back', scarabShell: 'back', robe: 'body', kilt: 'body', collar: 'body', belt: 'body', amulet: 'body',
    nemes: 'head', turban: 'head', jackalMask: 'head', jackalHead: 'head', cobraHood: 'headBack', execHood: 'head', mandibles: 'head',
    crocHead: 'head', lionHead: 'head', falconHead: 'head', setHead: 'head', sunDisc: 'headBack', atef: 'head', mane: 'headBack',
    pauldron: 'front', bracers: 'front', wings: 'back',
    hat: 'head', horns: 'head', hood: 'head', helmet: 'head', topknot: 'head',
  };

  function drawTyped(ctx, f, P, a, pal, flat) {
    const look = f.look, sc = look.scale, b = sc * (look.bulk || 1);
    const hf = headFrame(f, P);
    const hr = SA.DIM.headR * sc * (look.headScale || 1);
    const col = (c) => flat || c;
    const H = P.head, N = P.neck;
    // helper: point in head space (fx = forward, ux = up), in head-radius units
    const hp = (fwd, up) => ({ x: H.x + hf.fx * fwd * hr + hf.ux * up * hr, y: H.y + hf.fy * fwd * hr + hf.uy * up * hr });
    const poly = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.fill(); };
    switch (a.type) {
      case 'nemes': {
        // striped royal headcloth: flares behind the head, lappets hang to the shoulders
        ctx.fillStyle = col(a.color || pal.cloth);
        poly([hp(0.9, 0.5), hp(0.2, 1.25), hp(-0.9, 1.0), hp(-1.9, -0.9), hp(-1.3, -1.6), hp(-0.4, -0.8), hp(0.8, -0.2)]);
        if (!flat && a.stripe) {
          ctx.strokeStyle = a.stripe; ctx.lineWidth = 2.5 * sc;
          for (let i = 0; i < 4; i++) {
            const p0 = hp(-0.2 - i * 0.35, 1.05 - i * 0.05), p1 = hp(-0.6 - i * 0.35, -0.8 - i * 0.2);
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
          }
        }
        break;
      }
      case 'turban': {
        ctx.fillStyle = col(a.color || pal.cloth);
        ctx.beginPath(); ctx.ellipse(hp(-0.1, 0.45).x, hp(-0.1, 0.45).y, hr * 1.2, hr * 0.85, Math.atan2(hf.uy, hf.ux) + Math.PI / 2, 0, SA.TAU); ctx.fill();
        poly([hp(0.95, -0.1), hp(0.5, -0.9), hp(0.2, -0.3)]);   // face veil
        break;
      }
      case 'jackalMask': case 'jackalHead': {
        // long snout forward, two tall ears — the jackal silhouette
        ctx.fillStyle = col(a.color || '#0c0a0e');
        ctx.beginPath(); ctx.arc(H.x, H.y, hr * 1.08, 0, SA.TAU); ctx.fill();
        poly([hp(0.5, 0.35), hp(2.3, -0.05), hp(2.2, -0.35), hp(0.6, -0.55)]);
        poly([hp(-0.1, 0.7), hp(0.05, 2.5), hp(0.45, 0.9)]);
        poly([hp(-0.55, 0.6), hp(-0.55, 2.35), hp(-0.1, 0.85)]);
        if (!flat && a.trim) {
          ctx.strokeStyle = a.trim; ctx.lineWidth = 2.5 * sc;
          const p0 = hp(0.6, 0.3), p1 = hp(2.2, -0.1);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
          const e0 = hp(-0.3, 0.9), e1 = hp(-0.35, 2.1);
          ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.stroke();
        }
        break;
      }
      case 'crocHead': {
        ctx.fillStyle = col(a.color || '#1c2a1c');
        ctx.beginPath(); ctx.arc(H.x, H.y, hr * 1.15, 0, SA.TAU); ctx.fill();
        poly([hp(0.4, 0.45), hp(3.1, 0.05), hp(3.2, -0.3), hp(0.5, -0.7)]);
        if (!flat) {
          ctx.fillStyle = a.teeth || '#e8dcc0';
          for (let i = 0; i < 6; i++) { const p = hp(0.9 + i * 0.36, -0.28); ctx.fillRect(p.x - 1.5, p.y - 1, 3 * sc, 5 * sc); }
        }
        break;
      }
      case 'lionHead': case 'mane': {
        ctx.fillStyle = col(a.color || '#6a4318');
        if (a.type === 'mane') {
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * SA.TAU;
            const r = hr * (i % 2 ? 1.55 : 2.0);
            const x = H.x - hf.fx * hr * 0.3 + Math.cos(ang) * r, y = H.y - hf.fy * hr * 0.3 + Math.sin(ang) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(H.x, H.y, hr * 1.1, 0, SA.TAU); ctx.fill();
          poly([hp(0.4, 0.4), hp(1.5, 0.05), hp(1.45, -0.45), hp(0.4, -0.7)]);
          poly([hp(-0.2, 0.8), hp(0.0, 1.5), hp(0.35, 0.95)]);
        }
        break;
      }
      case 'falconHead': {
        ctx.fillStyle = col(a.color || '#2a2016');
        ctx.beginPath(); ctx.arc(H.x, H.y, hr * 1.1, 0, SA.TAU); ctx.fill();
        poly([hp(0.6, 0.35), hp(1.7, 0.0), hp(1.35, -0.55), hp(0.7, -0.35)]);   // hooked beak
        if (!flat) {
          ctx.strokeStyle = a.mark || '#1a4a8a'; ctx.lineWidth = 3 * sc;      // eye of Horus marking
          const p0 = hp(0.35, 0.05), p1 = hp(0.2, -0.75);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        break;
      }
      case 'setHead': {
        ctx.fillStyle = col(a.color || '#3a1410');
        ctx.beginPath(); ctx.arc(H.x, H.y, hr * 1.05, 0, SA.TAU); ctx.fill();
        poly([hp(0.5, 0.2), hp(2.0, -0.45), hp(1.8, -0.75), hp(0.5, -0.6)]);   // curved snout
        poly([hp(-0.3, 0.8), hp(-0.2, 2.0), hp(0.25, 2.1), hp(0.15, 0.9)]);    // square-tipped ears
        poly([hp(-0.75, 0.6), hp(-0.7, 1.9), hp(-0.3, 2.0), hp(-0.35, 0.8)]);
        break;
      }
      case 'sunDisc': {
        const c = hp(-0.1, 2.1);
        if (!flat) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.55;
          ctx.drawImage(SA.glowSprite(a.glow || '#ffb13a'), c.x - hr * 3, c.y - hr * 3, hr * 6, hr * 6);
          ctx.restore();
        }
        ctx.fillStyle = col(a.color || '#f0b43a');
        ctx.beginPath(); ctx.arc(c.x, c.y, hr * 1.05, 0, SA.TAU); ctx.fill();
        break;
      }
      case 'atef': {
        ctx.fillStyle = col(a.color || '#e8e0cc');
        poly([hp(-0.6, 0.5), hp(-0.3, 2.6), hp(0.3, 2.6), hp(0.6, 0.5)]);
        ctx.fillStyle = col(a.feather || '#d8b25a');
        poly([hp(-1.1, 0.6), hp(-0.7, 2.4), hp(-0.55, 0.6)]);
        poly([hp(1.1, 0.6), hp(0.7, 2.4), hp(0.55, 0.6)]);
        break;
      }
      case 'cobraHood': {
        ctx.fillStyle = col(a.color || '#1d3a26');
        ctx.beginPath(); ctx.ellipse(hp(-0.5, 0.1).x, hp(-0.5, 0.1).y, hr * 1.9, hr * 1.3, Math.atan2(hf.uy, hf.ux), 0, SA.TAU); ctx.fill();
        if (!flat && a.scale) {
          ctx.fillStyle = a.scale;
          for (let i = 0; i < 3; i++) { const p = hp(-1.1 + i * 0.1, 0.6 - i * 0.5); ctx.beginPath(); ctx.arc(p.x, p.y, 3 * sc, 0, SA.TAU); ctx.fill(); }
        }
        break;
      }
      case 'execHood': {
        ctx.fillStyle = col(a.color || '#0e0c0e');
        poly([hp(1.1, 0.2), hp(0.3, 1.2), hp(-0.6, 2.2), hp(-1.3, 0.3), hp(-0.9, -1.2), hp(0.9, -0.8)]);
        break;
      }
      case 'mandibles': {
        ctx.fillStyle = col(a.color || '#1a2a28');
        poly([hp(0.7, -0.2), hp(1.7, 0.3), hp(1.2, -0.3)]);
        poly([hp(0.7, -0.5), hp(1.7, -1.0), hp(1.2, -0.4)]);
        break;
      }
      case 'shield': {
        // round bronze-rimmed hide shield strapped to the back arm
        const c = { x: (P.elbB.x + P.handB.x) / 2, y: (P.elbB.y + P.handB.y) / 2 };
        ctx.fillStyle = col(a.rim || pal.metal);
        ctx.beginPath(); ctx.ellipse(c.x, c.y, 34 * sc, 46 * sc, 0, 0, SA.TAU); ctx.fill();
        if (!flat) {
          ctx.fillStyle = a.color || '#5c4a2c';
          ctx.beginPath(); ctx.ellipse(c.x, c.y, 29 * sc, 41 * sc, 0, 0, SA.TAU); ctx.fill();
          ctx.fillStyle = a.rim || pal.metal;
          ctx.beginPath(); ctx.arc(c.x, c.y, 7 * sc, 0, SA.TAU); ctx.fill();
        }
        break;
      }
      case 'quiver': {
        const s0 = { x: P.sh.x - hf.fx * 18 * sc, y: P.sh.y - hf.fy * 18 * sc };
        ctx.strokeStyle = col(a.color || '#4a3220'); ctx.lineWidth = 12 * sc; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s0.x - hf.fx * 10, s0.y - 30 * sc); ctx.lineTo(P.hip.x - hf.fx * 26 * sc, P.hip.y - 10 * sc); ctx.stroke();
        break;
      }
      case 'scarabShell': {
        // big beetle carapace over the back: a very different silhouette
        const dx = P.neck.x - P.hip.x, dy = P.neck.y - P.hip.y;
        const c = { x: P.hip.x + dx * 0.55 - hf.fx * 26 * b, y: P.hip.y + dy * 0.55 - hf.fy * 26 * b };
        ctx.fillStyle = col(a.color || '#1f3f3a');
        ctx.beginPath(); ctx.ellipse(c.x, c.y, 44 * b, 74 * b, Math.atan2(dy, dx) + Math.PI / 2 + 0.2 * f.facing, 0, SA.TAU); ctx.fill();
        if (!flat) {
          ctx.strokeStyle = a.rim || '#58c8a8'; ctx.lineWidth = 3 * sc;
          ctx.beginPath(); ctx.moveTo(c.x + dx * 0.55, c.y + dy * 0.55); ctx.lineTo(c.x - dx * 0.55, c.y - dy * 0.55); ctx.stroke();
          ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(c.x + dx * 0.25 + hf.fx * 8, c.y + dy * 0.25, 10 * b, 22 * b, Math.atan2(dy, dx), 0, SA.TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'wings': {
        // folded falcon wings behind the shoulders (Horus)
        ctx.fillStyle = col(a.color || '#3a2a1a');
        const s = P.sh;
        poly([{ x: s.x - hf.fx * 10, y: s.y - 10 * sc }, { x: s.x - hf.fx * 120 * sc, y: s.y - 90 * sc }, { x: s.x - hf.fx * 150 * sc, y: s.y + 40 * sc }, { x: s.x - hf.fx * 40 * sc, y: s.y + 120 * sc }]);
        break;
      }
      case 'kilt': {
        // shendyt: pleated linen skirt from the hip
        const h = P.hip;
        const kx = (P.kneeF.x + P.kneeB.x) / 2, ky = Math.max(P.kneeF.y, P.kneeB.y);
        ctx.fillStyle = col(a.color || pal.cloth);
        poly([{ x: h.x - 26 * b, y: h.y - 12 * b }, { x: h.x + 26 * b, y: h.y - 12 * b },
          { x: kx + 34 * b + (P.kneeF.x - h.x) * 0.2, y: h.y + (ky - h.y) * 0.7 }, { x: kx - 34 * b + (P.kneeB.x - h.x) * 0.2, y: h.y + (ky - h.y) * 0.7 }]);
        if (!flat) {
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(h.x + i * 9 * b, h.y - 8 * b); ctx.lineTo(h.x + i * 13 * b + (kx - h.x) * 0.5, h.y + (ky - h.y) * 0.66); ctx.stroke(); }
        }
        break;
      }
      case 'robe': {
        const h = P.hip;
        const fy = Math.max(P.footF.y, P.footB.y) - 10 * sc;
        ctx.fillStyle = col(a.color || pal.cloth);
        poly([{ x: h.x - 30 * b, y: h.y - 30 * b }, { x: h.x + 30 * b, y: h.y - 30 * b },
          { x: P.footF.x + 26 * b, y: fy }, { x: P.footB.x - 26 * b, y: fy }]);
        break;
      }
      case 'belt': {
        ctx.strokeStyle = col(a.color || pal.metal); ctx.lineWidth = 9 * b; ctx.lineCap = 'butt';
        const dx = P.neck.x - P.hip.x, dy = P.neck.y - P.hip.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const c = { x: P.hip.x + dx * 0.1, y: P.hip.y + dy * 0.1 };
        ctx.beginPath(); ctx.moveTo(c.x + nx * 24 * b, c.y + ny * 24 * b); ctx.lineTo(c.x - nx * 24 * b, c.y - ny * 24 * b); ctx.stroke();
        if (!flat && a.flap) {
          // hanging front flap of dark cloth
          ctx.fillStyle = a.flap;
          const fx = f.facing * f.spinScale;
          poly([{ x: c.x + fx * 4 * b, y: c.y }, { x: c.x + fx * 24 * b, y: c.y }, { x: c.x + fx * 20 * b + (P.kneeF.x - P.hip.x) * 0.3, y: c.y + 48 * b }, { x: c.x + fx * 6 * b, y: c.y + 46 * b }]);
        }
        break;
      }
      case 'collar': case 'amulet': {
        const dx = P.neck.x - P.hip.x, dy = P.neck.y - P.hip.y;
        const c = { x: P.hip.x + dx * 0.8 + hf.fx * 8 * sc, y: P.hip.y + dy * 0.8 + hf.fy * 8 * sc };
        if (a.type === 'collar') {
          // usekh: broad beaded collar
          ctx.fillStyle = col(a.color || pal.metal);
          ctx.beginPath(); ctx.ellipse(c.x, c.y + 4 * sc, 30 * b, 15 * b, Math.atan2(dy, dx) + Math.PI / 2, 0, SA.TAU); ctx.fill();
          if (!flat && a.gem) { ctx.fillStyle = a.gem; ctx.beginPath(); ctx.ellipse(c.x, c.y + 4 * sc, 22 * b, 8 * b, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI); ctx.fill(); }
        } else {
          // scarab amulet on a cord
          ctx.fillStyle = col(a.color || pal.metal);
          ctx.beginPath(); ctx.ellipse(c.x, c.y + 14 * sc, 8 * sc, 10 * sc, 0, 0, SA.TAU); ctx.fill();
          if (!flat) { ctx.fillStyle = a.gem || '#2fd8c8'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 14 * sc, 4 * sc, 6 * sc, 0, 0, SA.TAU); ctx.fill(); }
        }
        break;
      }
      case 'pauldron': {
        // asymmetric layered bronze plates on the front shoulder: key part of the mummy's silhouette
        const s = P.sh, e = P.elbF;
        const dx = e.x - s.x, dy = e.y - s.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L;
        const ang = Math.atan2(uy, ux);
        ctx.fillStyle = col(a.color || pal.metal);
        for (let i = 0; i < 3; i++) {
          const c = { x: s.x + ux * (i * 9 - 4) * b, y: s.y + uy * (i * 9 - 4) * b };
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, (15 - i * 2.5) * b, (21 - i * 3) * b, ang, 0, SA.TAU);
          ctx.fill();
          if (!flat) { ctx.fillStyle = i % 2 ? pal.metal : pal.metalDark; }
        }
        if (!flat) {
          ctx.strokeStyle = pal.metalLight; ctx.lineWidth = 2 * sc;
          ctx.beginPath(); ctx.ellipse(s.x - ux * 4 * b, s.y - uy * 4 * b, 14 * b, 20 * b, ang, -1.9, -0.2); ctx.stroke();
          ctx.fillStyle = a.gem || '#2fd8c8';
          ctx.beginPath(); ctx.arc(s.x - ux * 3 * b, s.y - uy * 3 * b, 3.5 * sc, 0, SA.TAU); ctx.fill();
        }
        break;
      }
      case 'bracers': {
        ctx.strokeStyle = col(a.color || pal.metal); ctx.lineCap = 'butt';
        for (const [e, h, w] of [[P.elbF, P.handF, 21], [P.elbB, P.handB, 19]]) {
          const x0 = e.x + (h.x - e.x) * 0.55, y0 = e.y + (h.y - e.y) * 0.55, x1 = e.x + (h.x - e.x) * 0.8, y1 = e.y + (h.y - e.y) * 0.8;
          ctx.lineWidth = w * b;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
        break;
      }
      // legacy shapes (still used by a few looks)
      case 'hat': case 'horns': case 'hood': case 'helmet': case 'topknot': {
        ctx.fillStyle = col(a.color || pal.cloth);
        if (a.type === 'hood') { ctx.beginPath(); ctx.arc(H.x - hf.fx * 3, H.y - hf.fy * 3, hr * 1.28, 0, SA.TAU); ctx.fill(); }
        else if (a.type === 'helmet') { ctx.beginPath(); ctx.arc(H.x, H.y, hr * 1.18, 0, SA.TAU); ctx.fill(); }
        else if (a.type === 'topknot') dot(ctx, hp(-0.3, 1.3), 8 * sc);
        else if (a.type === 'horns') { poly([hp(-0.2, 0.7), hp(0.4, 2.0), hp(0.3, 0.8)]); }
        else poly([hp(2.8, 0.2), hp(0, 1.4), hp(-2.8, 0.2)]);
        break;
      }
    }
    void N;
  }

  function drawLayer(ctx, f, P, layer, pal, flat) {
    for (const a of f.accessories || []) {
      if (a.ropes || !a.type) continue;
      if ((LAYER[a.type] || 'head') !== layer) continue;
      drawTyped(ctx, f, P, a, pal, flat);
    }
  }

  function drawRopes(ctx, f, front, flat, pal) {
    const sc = f.look.scale;
    for (const a of f.accessories || []) {
      if (!a.ropes || !!a.front !== front) continue;
      const c = flat || a.color || pal.wrap;
      const tip = flat ? null : (a.tip || (a.bandage ? pal.wrapDark : null));
      a.ropes.forEach((r, i) => r.draw(ctx, a.rope[i].w0 * sc, a.rope[i].w1 * sc, c, tip));
    }
  }

  // Full material body, back to front.
  function drawMaterial(ctx, f) {
    const look = f.look, P = f.skel, pal = paletteOf(look);
    const sc = look.scale, b = (look.bulk || 1) * sc;
    const wk = pal.wraps;
    const metal = (f.weapon && f.weapon.metal) || '#c9a25a';
    const grip = (f.weapon && f.weapon.grip) || '#3a2616';

    drawRopes(ctx, f, false, null, pal);
    drawLayer(ctx, f, P, 'back', pal, null);
    drawLayer(ctx, f, P, 'headBack', pal, null);
    if (f.weapon) drawWeapons(ctx, P, f.weapon, shade(metal, -0.25), 'B', true, sc, shade(grip, -0.2));
    // far limbs (darker)
    matLimb(ctx, P.sh, P.elbB, 24 * b, 18 * b, pal, true, 11, wk, sc);
    matLimb(ctx, P.elbB, P.handB, 18 * b, 13 * b, pal, true, 12, wk, sc);
    ctx.fillStyle = pal.skinBack; dot(ctx, P.handB, 12 * b);
    drawLayer(ctx, f, P, 'backArm', pal, null);
    matLimb(ctx, P.hip, P.kneeB, 34 * b, 23 * b, pal, true, 13, wk, sc);
    matLimb(ctx, P.kneeB, P.footB, 23 * b, 14 * b, pal, true, 14, wk, sc);
    matLimb(ctx, P.footB, P.toeB, 14 * b, 8 * b, pal, true, 15, wk * 0.6, sc);
    // body
    matTorso(ctx, P, pal, b, wk, sc);
    matLimb(ctx, P.neck, P.head, 18 * b, 16 * b, pal, false, 16, wk, sc);
    matHead(ctx, f, P, pal, wk, sc);
    drawLayer(ctx, f, P, 'body', pal, null);
    drawLayer(ctx, f, P, 'head', pal, null);
    // near limbs
    matLimb(ctx, P.hip, P.kneeF, 34 * b, 23 * b, pal, false, 21, wk, sc);
    matLimb(ctx, P.kneeF, P.footF, 23 * b, 14 * b, pal, false, 22, wk, sc);
    matLimb(ctx, P.footF, P.toeF, 14 * b, 8 * b, pal, false, 23, wk * 0.6, sc);
    matLimb(ctx, P.sh, P.elbF, 24 * b, 18 * b, pal, false, 24, wk, sc);
    matLimb(ctx, P.elbF, P.handF, 18 * b, 13 * b, pal, false, 25, wk, sc);
    if (f.weapon) drawWeapons(ctx, P, f.weapon, metal, 'F', true, sc, grip);
    ctx.fillStyle = wk > 0.5 ? pal.wrap : pal.skin;
    dot(ctx, P.handF, 12.5 * b);
    drawLayer(ctx, f, P, 'front', pal, null);
    drawRopes(ctx, f, true, null, pal);
    // cursed / elemental fists: the hands smoulder
    const el = f.weapon && !f.weapon.geom && f.weapon.element;
    if (el) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(performance.now() / 110);
      const g = SA.glowSprite(ELEMENT_GLOW[el] || '#b58cff');
      for (const h of [P.handF, P.handB]) ctx.drawImage(g, h.x - 24 * sc, h.y - 24 * sc, 48 * sc, 48 * sc);
      ctx.restore();
    }
  }

  // flat silhouette incl. typed accessories and ropes (rims / hit flash / slow tint / menus)
  function drawSilhouetteFull(ctx, f, P, color) {
    const pal = paletteOf(f.look);
    drawRopes(ctx, f, false, color, pal);
    drawLayer(ctx, f, P, 'back', pal, color);
    drawLayer(ctx, f, P, 'headBack', pal, color);
    drawLayer(ctx, f, P, 'backArm', pal, color);
    drawFlat(ctx, P, f.look, color, color, f.weapon);
    drawLayer(ctx, f, P, 'body', pal, color);
    drawLayer(ctx, f, P, 'head', pal, color);
    drawLayer(ctx, f, P, 'front', pal, color);
    drawRopes(ctx, f, true, color, pal);
  }

  // Glowing eyes: brightness follows the energy meter.
  function drawEyes(ctx, f) {
    const look = f.look;
    const pal = paletteOf(look);
    const eye = pal.eye;
    if (!eye) return;
    const P = f.skel, sc = look.scale * (look.headScale || 1);
    const hf = headFrame(f);
    const hr = SA.DIM.headR * sc;
    const fwd = look.eyeFwd || 0.5;
    const ex = P.head.x + hf.fx * hr * fwd + hf.ux * 3 * sc;
    const ey = P.head.y + hf.fy * hr * fwd + hf.uy * 3 * sc;
    const e = clamp((f.energy || 0) / 100, 0, 1);
    const glow = 0.5 + e * 0.5 + (f.state === 'special' ? 0.4 : 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.45 * glow, 0, 1);
    const g = SA.glowSprite(eye);
    const gs = (22 + e * 18) * sc;
    ctx.drawImage(g, ex - gs, ey - gs, gs * 2, gs * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = look.eyeCore || '#ffffff';
    ctx.lineWidth = 3 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - hf.fx * 7 * sc, ey - hf.fy * 7 * sc);
    ctx.lineTo(ex + hf.fx * 4 * sc - hf.ux * 1.5, ey + hf.fy * 4 * sc - hf.uy * 1.5);
    ctx.stroke();
    ctx.strokeStyle = eye;
    ctx.lineWidth = 1.5 * sc;
    ctx.stroke();
  }

  SA.Render = {
    Rope, createAccessories, resetAccessories, updateAccessories,

    drawShadow(ctx, f, strength) {
      const h = clamp(-f.y / 500, 0, 1);
      const w = (90 + (f.state === 'down' || f.state === 'ko' ? 90 : 0)) * (1 - h * 0.6) * f.look.scale * (0.6 + 0.4 * (f.look.bulk || 1));
      ctx.globalAlpha = (strength || 0.5) * (1 - h * 0.7);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(f.skel.hip.x, 2, w, 13 * (1 - h * 0.5), 0, 0, SA.TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    },

    // rims: [{color, dx, dy}] light edges drawn by offsetting the silhouette
    drawFighter(ctx, f, rims, alpha) {
      const look = f.look;
      let jitter = 0;
      if (f.hitShake > 0) {
        jitter = Math.sin(performance.now() * 0.09) * 7 * (f.hitShake / (f.hitShakeMax || 1));
        ctx.save();
        ctx.translate(jitter, 0);
      }
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      if (rims) {
        for (const r of rims) {
          ctx.save();
          ctx.translate(r.dx, r.dy);
          drawSilhouetteFull(ctx, f, f.skel, r.color);
          ctx.restore();
        }
      }
      if (look.kind) drawMaterial(ctx, f);
      else {
        drawSilhouetteFull(ctx, f, f.skel, look.body);
        drawFlat(ctx, f.skel, look, look.body, look.back, f.weapon);
      }
      ctx.globalAlpha = 1;
      drawEyes(ctx, f);
      this.drawStatus(ctx, f);
      if (f.hitFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = f.hitFlash * 0.55;
        drawFlat(ctx, f.skel, look, '#fff2e0', '#fff2e0', f.weapon);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (jitter) ctx.restore();
      this.drawTrail(ctx, f);
    },

    drawSilhouette(ctx, f, color) {
      drawSilhouetteFull(ctx, f, f.skel, color);
    },

    drawWeaponIcon(ctx, w, x, y, len, color) {
      if (!w || !w.geom) return false;
      const h = { x: x - len * 0.35, y: y + len * 0.2 }, t = { x: x + len * 0.45, y: y - len * 0.25 };
      const L = Math.hypot(t.x - h.x, t.y - h.y);
      const u = { x: h.x - (t.x - h.x) / L * (w.geom.back / w.geom.len) * len * 0.5, y: h.y - (t.y - h.y) / L * (w.geom.back / w.geom.len) * len * 0.5 };
      drawWeaponShape(ctx, w, h, t, u, color || w.metal || '#c9a25a', true, len / 160, color || w.grip || '#3a2616');
      return true;
    },

    // status visuals: energy shield bubble, chill tint
    drawStatus(ctx, f) {
      if (f.shieldT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.12 * Math.sin(performance.now() / 70);
        ctx.strokeStyle = '#6fe8ff';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(f.skel.hip.x, f.skel.hip.y - 60, 120 * f.look.scale, 190 * f.look.scale, 0, 0, SA.TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.12;
        ctx.drawImage(SA.glowSprite('#35f0ff'), f.skel.hip.x - 150, f.skel.hip.y - 260, 300, 400);
        ctx.restore();
      }
      if (f.slowT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25;
        drawFlat(ctx, f.skel, f.look, '#5fb8ff', '#5fb8ff', null);
        ctx.restore();
      }
    },

    // afterimages: sand-coloured for the mummy (dash / sprint trail), accent for everyone else
    drawGhosts(ctx, f) {
      if (!f.ghosts.length) return;
      ctx.globalCompositeOperation = 'lighter';
      const col = f.look.trail || f.look.accent;
      for (const g of f.ghosts) {
        ctx.globalAlpha = clamp(g.life, 0, 1) * 0.3;
        drawFlat(ctx, g.pts, f.look, col, col, f.weapon);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },

    drawTrail(ctx, f) {
      const t = f.trail;
      if (t.length < 2) return;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const n = t.length;
      for (let i = 1; i < n; i++) {
        if (Math.abs(t[i].x - t[i - 1].x) + Math.abs(t[i].y - t[i - 1].y) < 3) continue;
        const u = i / (n - 1);
        ctx.globalAlpha = u * 0.5;
        ctx.strokeStyle = i > n - 3 ? '#fff4dc' : f.look.trail || f.look.accent;
        ctx.lineWidth = 3 + u * 16;
        ctx.beginPath();
        ctx.moveTo(t[i - 1].x, t[i - 1].y);
        ctx.lineTo(t[i].x, t[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
})(window.SA);
