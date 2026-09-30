'use strict';
/*
 * Fighter rendering: tapered-limb silhouettes with rim light, glowing eyes,
 * verlet cloth accessories (headband tails, ponytail, coat), strike trails and afterimages.
 */
(function (SA) {
  const { clamp } = SA.M;

  // ---------- cloth ----------
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
    draw(ctx, w0, w1, color) {
      const pts = this.pts;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        ctx.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1));
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
    const off = a.rope[i].at || [0, 0];
    const base = L[a.anchor || 'head'];
    return lw(f, base.x + off[0], base.y + off[1]);
  }

  function updateAccessories(f, dt, arena) {
    if (!f.accessories) createAccessories(f);
    const wind = (arena && arena.wind) || 0;
    for (const a of f.accessories) {
      if (!a.ropes) continue;
      a.ropes.forEach((r, i) => {
        const p = anchorOf(f, a, i);
        r.update(p.x, p.y, dt, wind * (a.windMul || 1) - f.vx * 0.4, a.lift || 0);
      });
    }
  }

  // ---------- body ----------
  function limb(ctx, a, b, w0, w1) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const nx = -dy / d, ny = dx / d;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w0 / 2, a.y + ny * w0 / 2);
    ctx.lineTo(b.x + nx * w1 / 2, b.y + ny * w1 / 2);
    ctx.lineTo(b.x - nx * w1 / 2, b.y - ny * w1 / 2);
    ctx.lineTo(a.x - nx * w0 / 2, a.y - ny * w0 / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(a.x, a.y, w0 / 2, 0, SA.TAU);
    ctx.arc(b.x, b.y, w1 / 2, 0, SA.TAU);
    ctx.fill();
  }

  function dot(ctx, p, r) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, SA.TAU);
    ctx.fill();
  }

  function torso(ctx, hip, neck, waist, chest, sc) {
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
    ctx.fill();
    dot(ctx, hip, w * 1.08);
  }

  // ---------- weapons ----------
  const ELEMENT_GLOW = { fire: '#ff7a2a', frost: '#8fe3ff', shock: '#9fd0ff', shadow: '#b58cff' };

  function seg(ctx, ax, ay, bx, by, w) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // Draws a weapon from hand h to tip t (butt u behind the hand). detail = steel edge + element glow.
  function drawWeaponShape(ctx, w, h, t, u, col, detail, sc) {
    const dx = t.x - h.x, dy = t.y - h.y;
    const L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L;       // along the blade
    const nx = -uy, ny = ux;              // perpendicular
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const k = sc || 1;
    const edge = [];                      // points for the steel highlight
    switch (w.look) {
      case 'katana': case 'dagger': {
        const wide = (w.look === 'dagger' ? 8 : 7) * k;
        seg(ctx, h.x, h.y, u.x, u.y, 7 * k);                                  // handle
        ctx.beginPath(); ctx.ellipse(h.x + ux * 6, h.y + uy * 6, 4 * k, 11 * k, Math.atan2(uy, ux), 0, SA.TAU); ctx.fill(); // guard
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
        seg(ctx, h.x, h.y, u.x, u.y, 9 * k);
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
          seg(ctx, h.x, h.y, t.x, t.y, 9 * k);
          const c = { x: t.x - ux * 26, y: t.y - uy * 26 };
          ctx.beginPath();
          ctx.moveTo(c.x - ux * 34 + nx * 6, c.y - uy * 34 + ny * 6);
          ctx.quadraticCurveTo(c.x + nx * 78 * k, c.y + ny * 78 * k, c.x + ux * 36 + nx * 6, c.y + uy * 36 + ny * 6);
          ctx.quadraticCurveTo(c.x + nx * 40 * k, c.y + ny * 40 * k, c.x - ux * 34 + nx * 6, c.y - uy * 34 + ny * 6);
          ctx.fill();
          edge.push([c.x - ux * 30 + nx * 20 * k, c.y - uy * 30 + ny * 20 * k], [c.x + nx * 62 * k, c.y + ny * 62 * k], [c.x + ux * 32 + nx * 20 * k, c.y + uy * 32 + ny * 20 * k]);
        }
        break;
      }
      case 'staff': {
        ctx.strokeStyle = w.color && detail ? w.color : col;
        seg(ctx, u.x, u.y, t.x, t.y, 10 * k);
        ctx.strokeStyle = col;
        for (const e of [u, t]) seg(ctx, e.x - ux * 10, e.y - uy * 10, e.x, e.y, 13 * k);
        break;
      }
      case 'spear': {
        seg(ctx, u.x, u.y, t.x - ux * 30, t.y - uy * 30, 8 * k);
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
      case 'hammer': {
        seg(ctx, u.x, u.y, t.x, t.y, 9 * k);
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(Math.atan2(uy, ux));
        ctx.fillRect(-26 * k, -34 * k, 44 * k, 68 * k);
        ctx.restore();
        edge.push([t.x - ux * 24 + nx * 33 * k, t.y - uy * 24 + ny * 33 * k], [t.x + ux * 16 + nx * 33 * k, t.y + uy * 16 + ny * 33 * k]);
        break;
      }
      case 'scythe': {
        seg(ctx, u.x, u.y, t.x, t.y, 8 * k);
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
      ctx.strokeStyle = 'rgba(232,238,248,0.55)';
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

  function drawWeapons(ctx, P, w, col, which, detail, sc) {
    if (!w || !w.geom) return;
    if (which === 'B' && w.geom.dual) drawWeaponShape(ctx, w, P.handB, P.tipB, P.handB, col, detail, sc);
    if (which === 'F') drawWeaponShape(ctx, w, P.handF, P.tip, P.butt, col, detail, sc);
  }

  // Draws the silhouette from world points P. colFront for near limbs & torso, colBack for far limbs.
  function drawBody(ctx, P, look, colFront, colBack, w, detail) {
    const b = (look.bulk || 1) * look.scale;
    if (w) drawWeapons(ctx, P, w, colBack, 'B', detail, look.scale);
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
    const hr = SA.DIM.headR * look.scale;
    dot(ctx, P.head, hr);
    limb(ctx, P.hip, P.kneeF, 34 * b, 23 * b);
    limb(ctx, P.kneeF, P.footF, 23 * b, 14 * b);
    limb(ctx, P.footF, P.toeF, 14 * b, 8 * b);
    limb(ctx, P.sh, P.elbF, 24 * b, 18 * b);
    limb(ctx, P.elbF, P.handF, 18 * b, 13 * b);
    if (w) drawWeapons(ctx, P, w, colFront, 'F', detail, look.scale);
    ctx.fillStyle = colFront;
    dot(ctx, P.handF, 12.5 * b);
  }

  function headFrame(f) {
    // unit vectors of the head: forward (face) and up, derived from neck->head
    const P = f.skel;
    const dx = P.head.x - P.neck.x, dy = P.head.y - P.neck.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;          // up
    const dirX = f.facing * Math.sign(f.spinScale || 1);
    // forward is perpendicular to up, pointing along facing
    let fx = -uy, fy = ux;
    if (fx * dirX < 0) { fx = -fx; fy = -fy; }
    return { ux, uy, fx, fy };
  }

  function drawAccessories(ctx, f, color, front) {
    const P = f.skel, look = f.look, sc = look.scale;
    const hf = headFrame(f);
    const hr = SA.DIM.headR * sc;
    for (const a of f.accessories || []) {
      if (!!a.front !== front) continue;
      if (a.ropes) {
        a.ropes.forEach((r, i) => r.draw(ctx, a.rope[i].w0 * sc, a.rope[i].w1 * sc, a.color || color));
      } else if (a.type === 'hat') {
        const cx = P.head.x + hf.ux * hr * 0.55, cy = P.head.y + hf.uy * hr * 0.55;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx + hf.fx * 62 * sc - hf.ux * 6, cy + hf.fy * 62 * sc - hf.uy * 6);
        ctx.quadraticCurveTo(cx + hf.ux * 22 * sc, cy + hf.uy * 22 * sc, cx + hf.ux * 30 * sc + hf.fx * 3, cy + hf.uy * 30 * sc + hf.fy * 3);
        ctx.quadraticCurveTo(cx + hf.ux * 22 * sc, cy + hf.uy * 22 * sc, cx - hf.fx * 62 * sc - hf.ux * 6, cy - hf.fy * 62 * sc - hf.uy * 6);
        ctx.closePath();
        ctx.fill();
      } else if (a.type === 'horns') {
        ctx.fillStyle = color;
        for (const side of [-1, 1]) {
          const bx = P.head.x + hf.ux * hr * 0.7 + hf.fx * side * 10 * sc;
          const by = P.head.y + hf.uy * hr * 0.7 + hf.fy * side * 10 * sc;
          ctx.beginPath();
          ctx.moveTo(bx - hf.fx * 7, by - hf.fy * 7);
          ctx.quadraticCurveTo(bx + hf.ux * 26 * sc + hf.fx * side * 14 * sc, by + hf.uy * 26 * sc + hf.fy * side * 14 * sc,
            bx + hf.ux * 34 * sc + hf.fx * side * 26 * sc, by + hf.uy * 34 * sc + hf.fy * side * 26 * sc);
          ctx.quadraticCurveTo(bx + hf.ux * 16 * sc + hf.fx * side * 6 * sc, by + hf.uy * 16 * sc + hf.fy * side * 6 * sc, bx + hf.fx * 7, by + hf.fy * 7);
          ctx.closePath();
          ctx.fill();
        }
      } else if (a.type === 'hood') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(P.head.x - hf.fx * 3, P.head.y - hf.fy * 3, hr * 1.28, 0, SA.TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(P.head.x - hf.fx * hr * 1.2, P.head.y - hf.fy * hr * 1.2);
        ctx.lineTo(P.head.x - hf.fx * hr * 1.4 - hf.ux * hr * 2.4, P.head.y - hf.fy * hr * 1.4 - hf.uy * hr * 2.4);
        ctx.lineTo(P.neck.x + hf.fx * hr * 0.4, P.neck.y + hf.fy * hr * 0.4);
        ctx.fill();
      } else if (a.type === 'helmet') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(P.head.x, P.head.y, hr * 1.18, 0, SA.TAU);
        ctx.fill();
        ctx.fillRect(P.head.x - hr * 1.3, P.head.y - hr * 0.2, hr * 2.6, hr * 0.5);
        const cx = P.head.x + hf.ux * hr * 1.1, cy = P.head.y + hf.uy * hr * 1.1;
        ctx.beginPath();
        ctx.moveTo(cx - hf.fx * 10, cy - hf.fy * 10);
        ctx.lineTo(cx + hf.ux * 26 * sc, cy + hf.uy * 26 * sc);
        ctx.lineTo(cx + hf.fx * 10, cy + hf.fy * 10);
        ctx.fill();
      } else if (a.type === 'topknot') {
        ctx.fillStyle = color;
        dot(ctx, { x: P.head.x + hf.ux * (hr + 6) - hf.fx * 6, y: P.head.y + hf.uy * (hr + 6) - hf.fy * 6 }, 8 * sc);
      }
    }
  }

  function drawEyes(ctx, f) {
    const look = f.look;
    if (!look.eye) return;
    const P = f.skel, sc = look.scale;
    const hf = headFrame(f);
    const ex = P.head.x + hf.fx * 11 * sc + hf.ux * 3 * sc;
    const ey = P.head.y + hf.fy * 11 * sc + hf.uy * 3 * sc;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    const g = SA.glowSprite(look.eye);
    ctx.drawImage(g, ex - 13, ey - 13, 26, 26);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = look.eyeCore || '#ffffff';
    ctx.lineWidth = 3 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - hf.fx * 6 * sc, ey - hf.fy * 6 * sc);
    ctx.lineTo(ex + hf.fx * 3 * sc - hf.ux * 1.5, ey + hf.fy * 3 * sc - hf.uy * 1.5);
    ctx.stroke();
    if (look.visor) {
      ctx.strokeStyle = look.eye;
      ctx.lineWidth = 5 * sc;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(P.head.x - hf.fx * 12 * sc + hf.ux * 3, P.head.y - hf.fy * 12 * sc + hf.uy * 3);
      ctx.lineTo(ex + hf.fx * 8 * sc, ey + hf.fy * 8 * sc);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  SA.Render = {
    Rope, createAccessories, resetAccessories, updateAccessories,

    drawShadow(ctx, f, strength) {
      const h = clamp(-f.y / 500, 0, 1);
      const w = (90 + (f.state === 'down' || f.state === 'ko' ? 90 : 0)) * (1 - h * 0.6) * f.look.scale;
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
          drawAccessories(ctx, f, r.color, false);
          drawBody(ctx, f.skel, look, r.color, r.color, f.weapon, false);
          drawAccessories(ctx, f, r.color, true);
          ctx.restore();
        }
      }
      drawAccessories(ctx, f, look.body, false);
      drawBody(ctx, f.skel, look, look.body, look.back, f.weapon, true);
      drawAccessories(ctx, f, look.body, true);
      ctx.globalAlpha = 1;
      drawEyes(ctx, f);
      this.drawStatus(ctx, f);
      if (f.hitFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = f.hitFlash * 0.55;
        drawBody(ctx, f.skel, look, '#fff2e0', '#fff2e0', f.weapon, false);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (jitter) ctx.restore();
      this.drawTrail(ctx, f);
    },

    drawSilhouette(ctx, f, color) {
      drawAccessories(ctx, f, color, false);
      drawBody(ctx, f.skel, f.look, color, color, f.weapon, false);
      drawAccessories(ctx, f, color, true);
    },

    drawWeaponIcon(ctx, w, x, y, len, color) {
      if (!w || !w.geom) return false;
      const h = { x: x - len * 0.35, y: y + len * 0.2 }, t = { x: x + len * 0.45, y: y - len * 0.25 };
      const L = Math.hypot(t.x - h.x, t.y - h.y);
      const u = { x: h.x - (t.x - h.x) / L * (w.geom.back / w.geom.len) * len * 0.5, y: h.y - (t.y - h.y) / L * (w.geom.back / w.geom.len) * len * 0.5 };
      drawWeaponShape(ctx, w, h, t, u, color || '#15131c', true, len / 160);
      return true;
    },

    // status visuals: energy shield bubble, burning, chill tint
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
        drawBody(ctx, f.skel, f.look, '#5fb8ff', '#5fb8ff', null, false);
        ctx.restore();
      }
    },

    drawGhosts(ctx, f) {
      if (!f.ghosts.length) return;
      ctx.globalCompositeOperation = 'lighter';
      for (const g of f.ghosts) {
        ctx.globalAlpha = clamp(g.life, 0, 1) * 0.35;
        drawBody(ctx, g.pts, f.look, f.look.accent, f.look.accent, f.weapon, false);
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
        ctx.strokeStyle = i > n - 3 ? '#ffffff' : f.look.trail || f.look.accent;
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
