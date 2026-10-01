'use strict';
/*
 * Pooled particle system + effect presets (SA.FX).
 * Types: spark (motion streak), glow, flash, ring, dust, shard, ray, text, slash
 */
(function (SA) {
  const { rand } = SA.M;

  const DUMMY = { alive: false };

  class ParticleSystem {
    constructor(max) {
      this.pool = [];
      for (let i = 0; i < (max || 700); i++) this.pool.push({ alive: false });
      this.cursor = 0;
      this.count = 0;
    }

    spawn(p) {
      // graphics preset: thin out decorative particles, never gameplay text
      const q = SA.GFX ? SA.GFX.particles : 1;
      if (q < 1 && p.type !== 'text' && Math.random() > q) return DUMMY;
      const pool = this.pool;
      let o = null;
      for (let i = 0; i < pool.length; i++) {
        const c = pool[(this.cursor + i) % pool.length];
        if (!c.alive) { o = c; this.cursor = (this.cursor + i + 1) % pool.length; break; }
      }
      if (!o) { o = pool[this.cursor]; this.cursor = (this.cursor + 1) % pool.length; }
      o.alive = true;
      o.type = p.type || 'glow';
      o.x = p.x; o.y = p.y; o.ox = p.x; o.oy = p.y;
      o.vx = p.vx || 0; o.vy = p.vy || 0;
      o.life = 0; o.max = p.life || 0.4;
      o.size = p.size || 10; o.grow = p.grow || 0;
      o.color = p.color || '#ffffff';
      o.drag = p.drag || 0; o.grav = p.grav || 0;
      o.rot = p.rot || 0; o.vr = p.vr || 0;
      o.add = p.add !== undefined ? p.add : true;
      o.alpha = p.alpha !== undefined ? p.alpha : 1;
      o.text = p.text || '';
      o.len = p.len || 1;
      o.front = p.front !== undefined ? p.front : true;
      o.world = p.world !== undefined ? p.world : true;
      return o;
    }

    update(dt) {
      let n = 0;
      for (let i_p = 0, a_p = this.pool; i_p < a_p.length; i_p++) { const p = a_p[i_p];
        if (!p.alive) continue;
        p.life += dt;
        if (p.life >= p.max) { p.alive = false; continue; }
        n++;
        if (p.drag) {
          const d = Math.exp(-p.drag * dt);
          p.vx *= d; p.vy *= d;
        }
        p.vy += p.grav * dt;
        p.ox = p.x; p.oy = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.size += p.grow * dt;
      }
      this.count = n;
    }

    clear() { for (let i_p = 0, a_p = this.pool; i_p < a_p.length; i_p++) { const p = a_p[i_p]; p.alive = false; } }

    // start of a simulation step: particles that don't move this step must not be blended
    snapshot() { for (let i_p = 0, a_p = this.pool; i_p < a_p.length; i_p++) { const p = a_p[i_p]; if (p.alive) { p.ox = p.x; p.oy = p.y; } } }

    draw(ctx, front) {
      // normal blended first, additive second (fewer composite switches)
      for (let pass = 0; pass < 2; pass++) {
        const additive = pass === 1;
        ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
        const a = this.alpha === undefined ? 1 : this.alpha;
        for (let i_p = 0, a_p = this.pool; i_p < a_p.length; i_p++) { const p = a_p[i_p];
          if (!p.alive || p.add !== additive || p.front !== front || !p.world) continue;
          if (a < 1) {
            // render interpolation between the last two simulation steps
            const x = p.x, y = p.y;
            p.x = p.ox + (x - p.ox) * a; p.y = p.oy + (y - p.oy) * a;
            this.drawOne(ctx, p);
            p.x = x; p.y = y;
          } else this.drawOne(ctx, p);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    drawOne(ctx, p) {
      const u = p.life / p.max;
      const fade = 1 - u;
      switch (p.type) {
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(90, sp * 0.028 * p.len) * fade + 2;
          ctx.globalAlpha = p.alpha * fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (0.4 + fade * 0.6);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case 'glow': {
          // large additive sprites are the most expensive thing to rasterise: keep them bounded
          const s = Math.min(170, p.size * (1 - u * 0.5));
          ctx.globalAlpha = p.alpha * fade;
          ctx.drawImage(SA.glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case 'flash': {
          const s = Math.min(240, p.size * (0.6 + SA.M.easeOutCubic(u) * 0.8));
          ctx.globalAlpha = p.alpha * Math.pow(fade, 1.6);
          ctx.drawImage(SA.glowSprite(p.color, 0.08), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case 'ring': {
          const r = p.size * (0.2 + SA.M.easeOutCubic(u) * 0.8);
          ctx.globalAlpha = p.alpha * fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, p.len * fade);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * (p.rot || 1), 0, 0, SA.TAU);
          ctx.stroke();
          break;
        }
        case 'dust': {
          const s = p.size * (0.5 + u * 0.9);
          ctx.globalAlpha = p.alpha * fade * 0.55;
          ctx.drawImage(SA.glowSprite(p.color, 0.3), p.x - s, p.y - s * 0.7, s * 2, s * 1.4);
          break;
        }
        case 'shard': {
          ctx.globalAlpha = p.alpha * fade;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          ctx.restore();
          break;
        }
        case 'ray': {
          const len = p.size * (0.3 + SA.M.easeOutCubic(u) * 0.7);
          ctx.globalAlpha = p.alpha * fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.len * fade + 0.5;
          ctx.beginPath();
          const c = Math.cos(p.rot), s = Math.sin(p.rot);
          ctx.moveTo(p.x + c * len * 0.35, p.y + s * len * 0.35);
          ctx.lineTo(p.x + c * len, p.y + s * len);
          ctx.stroke();
          break;
        }
        case 'slash': {
          // crescent streak
          ctx.globalAlpha = p.alpha * fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.len * fade + 1;
          ctx.beginPath();
          const r = p.size * (0.7 + u * 0.5);
          ctx.arc(p.x, p.y, r, p.rot - 0.9, p.rot + 0.9);
          ctx.stroke();
          break;
        }
        case 'glyph': {
          // glowing hieroglyph (magic, specials, the mummy's special-ready aura)
          ctx.globalAlpha = p.alpha * (u < 0.2 ? u / 0.2 : fade);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1.5, p.size * 0.1);
          ctx.lineCap = 'round';
          SA.ArenaPaint.glyph(ctx, p.len | 0, p.x, p.y, p.size);
          break;
        }
        case 'text': {
          const pop = u < 0.12 ? SA.M.easeOutBack(u / 0.12) : 1;
          ctx.globalAlpha = p.alpha * (u > 0.7 ? (1 - u) / 0.3 : 1);
          ctx.font = `800 ${Math.round(p.size * pop)}px ${SA.FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 6;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
          break;
        }
      }
    }
  }

  SA.FX = {
    hit(ps, x, y, dir, power, color) {
      const n = Math.round(8 + power * 16);
      for (let i = 0; i < n; i++) {
        const a = (dir > 0 ? 0 : Math.PI) + rand(-1.1, 1.1);
        const sp = rand(500, 1500) * (0.6 + power * 0.6);
        ps.spawn({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, drag: 7, grav: 900,
          life: rand(0.12, 0.3) * (0.8 + power * 0.4), size: rand(2.5, 5), color: i % 3 === 0 ? '#ffffff' : color, len: 1.2 });
      }
      ps.spawn({ type: 'flash', x, y, size: 70 + power * 110, life: 0.14 + power * 0.06, color: '#fff4dc' });
      ps.spawn({ type: 'flash', x, y, size: 120 + power * 160, life: 0.22, color, alpha: 0.6 });
      ps.spawn({ type: 'ring', x, y, size: 60 + power * 120, life: 0.25, color: '#ffffff', len: 5 + power * 4, alpha: 0.8, rot: 0.8 });
      if (power > 0.7) {
        for (let i = 0; i < 8; i++) {
          const a = rand(0, SA.TAU);
          ps.spawn({ type: 'ray', x, y, rot: a, size: rand(120, 220) * power, life: 0.18, color: '#fff2d0', len: 4, alpha: 0.9 });
        }
      }
      for (let i = 0; i < 4 + power * 6; i++) {
        ps.spawn({ type: 'glow', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: dir * rand(50, 300), vy: rand(-300, 60),
          drag: 3, life: rand(0.3, 0.6), size: rand(6, 14), color });
      }
    },

    block(ps, x, y, dir, power) {
      const c = '#8fd6ff';
      for (let i = 0; i < 10 + power * 8; i++) {
        const a = (dir > 0 ? Math.PI : 0) + rand(-1.3, 1.3);
        const sp = rand(400, 1000);
        ps.spawn({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 8, grav: 600,
          life: rand(0.1, 0.22), size: rand(2, 4), color: i % 2 ? '#ffffff' : c });
      }
      ps.spawn({ type: 'flash', x, y, size: 80 + power * 60, life: 0.12, color: c });
      ps.spawn({ type: 'ring', x, y, size: 70 + power * 40, life: 0.2, color: c, len: 6, rot: 1.6 });
    },

    parry(ps, x, y) {
      ps.spawn({ type: 'flash', x, y, size: 320, life: 0.35, color: '#fff6d8' });
      ps.spawn({ type: 'flash', x, y, size: 520, life: 0.5, color: '#ffd36b', alpha: 0.5 });
      for (let r = 0; r < 3; r++) {
        ps.spawn({ type: 'ring', x, y, size: 180 + r * 110, life: 0.35 + r * 0.12, color: r ? '#ffd36b' : '#ffffff', len: 10 - r * 2, rot: 1 });
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * SA.TAU + rand(-0.1, 0.1);
        ps.spawn({ type: 'ray', x, y, rot: a, size: rand(220, 380), life: 0.3, color: '#fff3c4', len: 5 });
      }
      for (let i = 0; i < 26; i++) {
        const a = rand(0, SA.TAU), sp = rand(300, 1100);
        ps.spawn({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5, grav: 400,
          life: rand(0.25, 0.5), size: rand(2, 4), color: i % 2 ? '#ffe39a' : '#ffffff' });
      }
    },

    // dive impact: flat shock ring on the floor, a sand fountain and crescent sparks
    impact(ps, x, y, power, color) {
      ps.spawn({ type: 'flash', x, y: y - 10, size: 160 + power * 200, life: 0.18, color: '#fff4dc', alpha: 0.8 });
      for (let r = 0; r < (power > 0.8 ? 3 : 2); r++) {
        ps.spawn({ type: 'ring', x, y: y - 4, size: 120 + power * 140 + r * 80, life: 0.26 + r * 0.08, color: r ? color : '#ffffff', len: 7 - r * 2, alpha: 0.85, rot: 0.3 });
      }
      const n = Math.round(10 + power * 18);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        ps.spawn({ type: 'dust', x: x + side * rand(10, 60), y: y - rand(0, 10), vx: side * rand(200, 700) * power, vy: -rand(150, 600) * power,
          drag: 3, grav: 900, life: rand(0.5, 0.9), size: rand(20, 42) * (0.6 + power * 0.5), color: '#c8a878', add: false, alpha: 0.75, front: i % 3 === 0 });
      }
      for (let i = 0; i < 6 + power * 10; i++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2), sp = rand(500, 1300) * power;
        ps.spawn({ type: 'spark', x, y: y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 6, grav: 1500, life: rand(0.18, 0.35), size: rand(2.5, 4.5), color: i % 2 ? color : '#ffffff', len: 1.3 });
      }
    },

    dust(ps, x, y, amount, dir) {
      const n = Math.round(4 + amount * 8);
      for (let i = 0; i < n; i++) {
        ps.spawn({ type: 'dust', x: x + rand(-25, 25), y: y - rand(0, 12), vx: (dir || rand(-1, 1)) * rand(40, 260) * amount + rand(-60, 60),
          vy: -rand(20, 120) * amount, drag: 3.5, life: rand(0.4, 0.9), size: rand(18, 38) * (0.6 + amount * 0.5),
          color: '#b8a898', add: false, alpha: 0.7, front: false });
      }
    },

    slash(ps, x, y, dir, color) {
      ps.spawn({ type: 'slash', x, y, size: rand(70, 110), rot: dir > 0 ? rand(-0.6, 0.6) : Math.PI + rand(-0.6, 0.6), life: 0.2, color: '#ffffff', len: 7 });
      ps.spawn({ type: 'slash', x, y, size: rand(90, 140), rot: dir > 0 ? rand(-0.6, 0.6) : Math.PI + rand(-0.6, 0.6), life: 0.26, color, len: 10, alpha: 0.8 });
    },

    aura(ps, x, y, color) {
      ps.spawn({ type: 'glow', x: x + rand(-40, 40), y: y - rand(0, 280), vx: rand(-30, 30), vy: -rand(80, 240),
        life: rand(0.4, 0.8), size: rand(8, 20), color, drag: 1 });
    },

    special(ps, x, y, color) {
      ps.spawn({ type: 'flash', x, y: y - 150, size: 420, life: 0.45, color, alpha: 0.7 });
      for (let r = 0; r < 3; r++) ps.spawn({ type: 'ring', x, y: y - 150, size: 250 + r * 120, life: 0.4 + r * 0.1, color, len: 8, rot: 1 });
      for (let i = 0; i < 30; i++) {
        const a = rand(0, SA.TAU), sp = rand(200, 700);
        ps.spawn({ type: 'glow', x, y: y - 150, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: rand(0.4, 0.8), size: rand(8, 18), color });
      }
    },

    ko(ps, x, y) {
      ps.spawn({ type: 'flash', x, y, size: 700, life: 0.6, color: '#ffffff', alpha: 0.8 });
      for (let r = 0; r < 4; r++) ps.spawn({ type: 'ring', x, y, size: 300 + r * 160, life: 0.5 + r * 0.15, color: r % 2 ? '#ff3b3b' : '#ffffff', len: 12, rot: 1 });
      for (let i = 0; i < 24; i++) {
        ps.spawn({ type: 'ray', x, y, rot: rand(0, SA.TAU), size: rand(300, 600), life: 0.45, color: '#ffffff', len: 6 });
      }
    },

    muzzle(ps, x, y, dir, color) {
      ps.spawn({ type: 'flash', x, y, size: 90, life: 0.08, color: '#fff4dc' });
      ps.spawn({ type: 'flash', x: x + dir * 20, y, size: 120, life: 0.1, color, alpha: 0.7 });
      for (let i = 0; i < 7; i++) {
        const a = (dir > 0 ? 0 : Math.PI) + rand(-0.35, 0.35);
        ps.spawn({ type: 'spark', x, y, vx: Math.cos(a) * rand(600, 1400), vy: Math.sin(a) * rand(600, 1400), drag: 9, life: rand(0.06, 0.14), size: 3, color });
      }
      ps.spawn({ type: 'dust', x, y, vx: dir * 80, vy: -40, drag: 2, life: 0.5, size: 22, color: '#9a9aa2', add: false, alpha: 0.5 });
    },

    projectileTrail(ps, x, y, color, type) {
      ps.spawn({ type: type === 'rocket' ? 'dust' : 'glow', x, y, vx: rand(-30, 30), vy: rand(-30, 30), drag: 2, life: type === 'rocket' ? 0.5 : 0.25,
        size: type === 'rocket' ? 18 : 12, color: type === 'rocket' ? '#8a8a90' : color, add: type !== 'rocket', alpha: 0.7, front: true });
    },

    spark(ps, x, y, color) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + rand(-1, 1);
        ps.spawn({ type: 'spark', x, y, vx: Math.cos(a) * rand(200, 500), vy: Math.sin(a) * rand(200, 500), drag: 6, grav: 900, life: rand(0.1, 0.25), size: 2.5, color });
      }
    },

    explosion(ps, x, y, r) {
      ps.spawn({ type: 'flash', x, y, size: r * 1.8, life: 0.25, color: '#fff0c8' });
      ps.spawn({ type: 'flash', x, y, size: r * 2.6, life: 0.4, color: '#ff7a2a', alpha: 0.7 });
      ps.spawn({ type: 'ring', x, y, size: r * 1.4, life: 0.35, color: '#ffd08a', len: 10, rot: 1 });
      for (let i = 0; i < 22; i++) {
        const a = rand(0, SA.TAU), sp = rand(300, 1100);
        ps.spawn({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, drag: 5, grav: 900, life: rand(0.2, 0.45), size: rand(2, 5), color: i % 2 ? '#ffd08a' : '#ff5a1a' });
      }
      for (let i = 0; i < 10; i++) {
        ps.spawn({ type: 'dust', x: x + rand(-r / 2, r / 2), y: y + rand(-r / 3, r / 3), vx: rand(-120, 120), vy: -rand(40, 160), drag: 2, life: rand(0.6, 1.1), size: rand(40, 70), color: '#3a3232', add: false, alpha: 0.7 });
      }
    },

    shock(ps, x, y) {
      for (let i = 0; i < 6; i++) {
        const a = rand(0, SA.TAU);
        ps.spawn({ type: 'ray', x, y, rot: a, size: rand(80, 150), life: 0.18, color: '#bfe6ff', len: 3 });
      }
      ps.spawn({ type: 'flash', x, y, size: 110, life: 0.15, color: '#9fd0ff' });
    },

    burn(ps, x, y) {
      for (let i = 0; i < 2; i++) {
        ps.spawn({ type: 'glow', x: x + rand(-30, 30), y: y + rand(-60, 40), vx: rand(-20, 20), vy: -rand(80, 180), drag: 1, life: rand(0.3, 0.6), size: rand(8, 14), color: '#ff7a2a' });
      }
    },

    telegraph(ps, f, color) {
      const x = f.skel.head.x, y = f.skel.head.y;
      ps.spawn({ type: 'flash', x, y, size: 140, life: 0.35, color });
      ps.spawn({ type: 'ring', x: f.x, y: f.y - 150, size: 260, life: 0.45, color, len: 6, rot: 1.2 });
    },

    smoke(ps, x, y, color) {
      for (let i = 0; i < 16; i++) {
        ps.spawn({ type: 'dust', x: x + rand(-50, 50), y: y - rand(0, 300), vx: rand(-160, 160), vy: -rand(20, 120), drag: 2, life: rand(0.5, 0.9), size: rand(30, 60), color: '#1a1420', add: false, alpha: 0.8 });
      }
      ps.spawn({ type: 'flash', x, y: y - 150, size: 260, life: 0.3, color, alpha: 0.6 });
    },

    // hieroglyphs bursting outward / rising (specials, boss magic)
    glyphBurst(ps, x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, SA.TAU), sp = rand(80, speed || 380);
        ps.spawn({ type: 'glyph', x: x + rand(-30, 30), y: y + rand(-40, 40), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, drag: 2.2,
          life: rand(0.6, 1.1), size: rand(18, 30), color, len: Math.floor(rand(0, 8)) });
      }
    },
    glyphRise(ps, x, y, color) {
      ps.spawn({ type: 'glyph', x: x + rand(-70, 70), y: y - rand(20, 260), vx: rand(-20, 20), vy: -rand(40, 90), drag: 0.5,
        life: rand(0.7, 1.2), size: rand(14, 22), color, len: Math.floor(rand(0, 8)), alpha: 0.8 });
    },
    // ground warning ring for incoming boss strikes (lightning, dives, beams)
    marker(ps, x, color, life) {
      ps.spawn({ type: 'ring', x, y: -4, size: 150, life: life || 0.6, color, len: 6, rot: 0.22, alpha: 0.9 });
      ps.spawn({ type: 'flash', x, y: -10, size: 140, life: life || 0.6, color, alpha: 0.35 });
    },
    // sand kicked up behind a dash / sprint
    sandTrail(ps, x, y, dir, color) {
      for (let i = 0; i < 3; i++) {
        ps.spawn({ type: 'dust', x: x + rand(-20, 20), y: y - rand(0, 40), vx: -dir * rand(60, 220), vy: -rand(10, 90), drag: 2.5, life: rand(0.35, 0.7),
          size: rand(16, 32), color: color || '#caa46a', add: false, alpha: 0.55 });
      }
    },
    // soul wisps (Anubis / Osiris summons)
    wisp(ps, x, y, color) {
      ps.spawn({ type: 'glow', x: x + rand(-12, 12), y: y + rand(-12, 12), vx: rand(-40, 40), vy: -rand(30, 90), drag: 2, life: rand(0.3, 0.6), size: rand(10, 18), color });
    },

    coinBurst(ps, x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2), sp = rand(300, 900);
        ps.spawn({ type: 'glow', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 1400, drag: 1, life: rand(0.6, 1), size: rand(8, 14), color: '#ffd23f', world: true });
      }
    },

    damageNumber(ps, x, y, dmg, color, big) {
      ps.spawn({ type: 'text', x: x + rand(-20, 20), y, vy: -140, drag: 2.5, life: 0.9, size: big ? 46 : 34, text: String(dmg), color, add: false });
    },

    label(ps, x, y, text, color, scale) {
      ps.spawn({ type: 'text', x, y, vy: -90, drag: 3, life: 1.0, size: 40 * (scale || 1), text, color, add: false });
    },
  };

  SA.ParticleSystem = ParticleSystem;
})(window.SA);
