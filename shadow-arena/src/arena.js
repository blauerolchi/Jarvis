'use strict';
/*
 * Procedural arenas. Static scenery is painted once into offscreen parallax layers;
 * weather, light flicker and sway are drawn live.
 *
 * Layer space: LW x LH, world x = 0 at LW/2, world ground (y = 0) at GY.
 * A layer with parallax p scrolls and zooms by factor p relative to the world camera.
 */
(function (SA) {
  const { rand, clamp, lerp } = SA.M;
  const LW = 3000, LH = 1300, GY = 1000;
  const GW = 3000, GH = 440;

  // ---------- painting helpers ----------
  function ridge(g, rng, baseY, amp, color, freq) {
    const a = rng() * 10, b = rng() * 10, c = rng() * 10;
    const f = freq || 1;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, LH);
    for (let x = 0; x <= LW; x += 12) {
      const h = 0.55 * Math.sin(x * 0.0021 * f + a) + 0.3 * Math.sin(x * 0.0057 * f + b) + 0.15 * Math.sin(x * 0.017 * f + c);
      g.lineTo(x, baseY - amp * (0.5 + 0.5 * h));
    }
    g.lineTo(LW, LH);
    g.closePath();
    g.fill();
  }

  function mistBand(g, y, h, color, alpha) {
    const gr = g.createLinearGradient(0, y - h, 0, y);
    gr.addColorStop(0, SA.rgba(color, 0));
    gr.addColorStop(1, SA.rgba(color, alpha));
    g.fillStyle = gr;
    g.fillRect(0, y - h, LW, h);
    g.fillStyle = SA.rgba(color, alpha);
    g.fillRect(0, y, LW, LH - y);
  }

  function roof(g, cx, y, w, h) {
    const L = cx - w / 2, R = cx + w / 2;
    g.beginPath();
    g.moveTo(L, y - h * 0.28);
    g.quadraticCurveTo(cx - w * 0.44, y + h * 0.02, cx - w * 0.36, y);
    g.lineTo(cx + w * 0.36, y);
    g.quadraticCurveTo(cx + w * 0.44, y + h * 0.02, R, y - h * 0.28);
    g.quadraticCurveTo(cx + w * 0.3, y - h * 0.32, cx + w * 0.15, y - h);
    g.lineTo(cx - w * 0.15, y - h);
    g.quadraticCurveTo(cx - w * 0.3, y - h * 0.32, L, y - h * 0.28);
    g.closePath();
    g.fill();
  }

  function pagoda(g, cx, baseY, w, tiers, tierH) {
    for (let i = 0; i < tiers; i++) {
      const y = baseY - i * tierH;
      const bw = w * 0.5 * (1 - i * 0.07);
      g.fillRect(cx - bw / 2, y - tierH * 0.62, bw, tierH * 0.62);
      roof(g, cx, y - tierH * 0.55, w * (1 - i * 0.09), tierH * 0.5);
    }
    const top = baseY - tiers * tierH + tierH * 0.1;
    g.fillRect(cx - 3, top - tierH * 1.4, 6, tierH * 1.4);
    for (let r = 0; r < 5; r++) g.fillRect(cx - 9 + r, top - tierH * 0.3 - r * tierH * 0.2, 18 - r * 2, 4);
  }

  function hall(g, cx, baseY, w, h) {
    // platform steps
    g.fillRect(cx - w * 0.55, baseY - h * 0.08, w * 1.1, h * 0.08);
    g.fillRect(cx - w * 0.5, baseY - h * 0.14, w, h * 0.07);
    // pillars & wall
    const top = baseY - h * 0.55;
    g.fillRect(cx - w * 0.42, top, w * 0.84, h * 0.42);
    // lower roof
    roof(g, cx, top + h * 0.02, w * 1.15, h * 0.28);
    // upper story & roof
    g.fillRect(cx - w * 0.26, top - h * 0.34, w * 0.52, h * 0.3);
    roof(g, cx, top - h * 0.3, w * 0.8, h * 0.33);
    // ridge ornaments
    g.fillRect(cx - w * 0.13, top - h * 0.64, 8, h * 0.05);
    g.fillRect(cx + w * 0.13 - 8, top - h * 0.64, 8, h * 0.05);
  }

  function torii(g, cx, baseY, w, h) {
    const pw = w * 0.07;
    g.beginPath();
    g.moveTo(cx - w * 0.36, baseY);
    g.lineTo(cx - w * 0.33 - pw, baseY - h * 0.86);
    g.lineTo(cx - w * 0.33, baseY - h * 0.86);
    g.lineTo(cx - w * 0.36 + pw, baseY);
    g.closePath();
    g.moveTo(cx + w * 0.36, baseY);
    g.lineTo(cx + w * 0.33 + pw, baseY - h * 0.86);
    g.lineTo(cx + w * 0.33, baseY - h * 0.86);
    g.lineTo(cx + w * 0.36 - pw, baseY);
    g.closePath();
    g.fill();
    // nuki
    g.fillRect(cx - w * 0.44, baseY - h * 0.72, w * 0.88, h * 0.055);
    // gakuzuka
    g.fillRect(cx - pw * 0.4, baseY - h * 0.88, pw * 0.8, h * 0.17);
    // kasagi (curved top beam)
    g.beginPath();
    g.moveTo(cx - w * 0.56, baseY - h * 1.0);
    g.quadraticCurveTo(cx, baseY - h * 0.86, cx + w * 0.56, baseY - h * 1.0);
    g.lineTo(cx + w * 0.5, baseY - h * 0.9);
    g.quadraticCurveTo(cx, baseY - h * 0.8, cx - w * 0.5, baseY - h * 0.9);
    g.closePath();
    g.fill();
  }

  function pine(g, rng, x, baseY, h) {
    g.lineCap = 'round';
    g.lineWidth = h * 0.05;
    g.beginPath();
    g.moveTo(x, baseY);
    const lean = rand(-0.2, 0.2);
    g.quadraticCurveTo(x + h * lean, baseY - h * 0.5, x + h * lean * 2, baseY - h);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const t = 0.35 + i * 0.1;
      const bx = x + h * lean * 2 * t + (i % 2 ? 1 : -1) * rng() * h * 0.35;
      const by = baseY - h * t - rng() * 20;
      g.lineWidth = h * 0.018;
      g.beginPath();
      g.moveTo(x + h * lean * 2 * t, baseY - h * t);
      g.lineTo(bx, by);
      g.stroke();
      const cw = h * (0.18 + rng() * 0.14);
      g.beginPath();
      g.ellipse(bx, by, cw, cw * 0.28, 0, 0, SA.TAU);
      g.ellipse(bx + cw * 0.3, by - cw * 0.15, cw * 0.6, cw * 0.22, 0, 0, SA.TAU);
      g.fill();
    }
  }

  function stoneLantern(g, x, baseY, s, glow) {
    g.fillRect(x - 22 * s, baseY - 14 * s, 44 * s, 14 * s);
    g.fillRect(x - 8 * s, baseY - 80 * s, 16 * s, 66 * s);
    g.fillRect(x - 20 * s, baseY - 92 * s, 40 * s, 12 * s);
    g.fillRect(x - 16 * s, baseY - 130 * s, 32 * s, 38 * s);
    roof(g, x, baseY - 128 * s, 70 * s, 30 * s);
    g.fillRect(x - 4 * s, baseY - 172 * s, 8 * s, 14 * s);
    if (glow) {
      const fs = g.fillStyle;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(SA.glowSprite(glow), x - 60 * s, baseY - 170 * s, 120 * s, 120 * s);
      g.fillStyle = glow;
      g.fillRect(x - 9 * s, baseY - 124 * s, 18 * s, 22 * s);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = fs;
    }
  }

  function bamboo(g, rng, x, baseY, h, w, leaves) {
    g.fillRect(x - w / 2, baseY - h, w, h);
    const seg = rand(70, 110);
    const fs = g.fillStyle;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = baseY - seg; y > baseY - h; y -= seg) g.fillRect(x - w / 2 - 1.5, y, w + 3, Math.max(2, w * 0.18));
    g.fillStyle = fs;
    if (!leaves) return;
    for (let i = 0; i < leaves; i++) {
      const ly = baseY - h * (0.3 + rng() * 0.7);
      const dir = rng() < 0.5 ? -1 : 1;
      for (let k = 0; k < 4; k++) {
        const len = rand(40, 90);
        g.save();
        g.translate(x, ly + k * 8);
        g.rotate(dir * (0.5 + k * 0.25) + rand(-0.1, 0.1));
        g.beginPath();
        g.ellipse(dir * len / 2, 0, len / 2, 4 + rng() * 3, 0, 0, SA.TAU);
        g.fill();
        g.restore();
      }
    }
  }

  function glowAt(g, x, y, r, color, alpha) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.drawImage(SA.glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function neonText(g, text, x, y, size, color, vertical) {
    g.save();
    g.font = `800 ${size}px ${SA.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = size * 0.6;
    g.fillStyle = color;
    if (vertical) {
      for (let i = 0; i < text.length; i++) g.fillText(text[i], x, y + i * size * 1.02);
    } else {
      g.fillText(text, x, y);
    }
    g.shadowBlur = size * 0.2;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.55;
    if (vertical) for (let i = 0; i < text.length; i++) g.fillText(text[i], x, y + i * size * 1.02);
    else g.fillText(text, x, y);
    g.restore();
  }

  // ---------- arena definitions ----------
  const DEFS = {};

  DEFS.temple = {
    id: 'temple', name: 'SUNSET TEMPLE', sub: 'Where the last light burns',
    opponent: 'ronin', music: 'temple', ambience: 'wind', wind: -260,
    rims: [{ color: 'rgba(255,160,90,0.95)', dx: 3, dy: -2 }],
    shadow: 0.55, grade: ['rgba(255,120,40,0.07)', 'rgba(40,0,30,0.25)'],
    sun: { x: 0.63, y: -330 },
    skyStatic(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, SA.H);
      g.addColorStop(0, '#1b0a22'); g.addColorStop(0.3, '#4f1432'); g.addColorStop(0.55, '#a8323b');
      g.addColorStop(0.72, '#ec7a38'); g.addColorStop(0.86, '#ffc06e'); g.addColorStop(1, '#ffd79a');
      ctx.fillStyle = g;
      ctx.fillRect(-400, -200, SA.W + 800, SA.H + 400);
      const sx = SA.W * 0.63, sy = SA.H * SA.GROUND_SCREEN - 330;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(SA.glowSprite('#ff7a2a'), sx - 700, sy - 700, 1400, 1400);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(SA.glowSprite('#ffb35a'), sx - 330, sy - 330, 660, 660);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff0c4';
      ctx.beginPath(); ctx.arc(sx, sy, 128, 0, SA.TAU); ctx.fill();
    },
    skyLive(ctx, cam, t) {
      // cloud streaks
      ctx.fillStyle = 'rgba(90,20,50,0.55)';
      for (let i = 0; i < 9; i++) {
        const y = 120 + i * 52 + Math.sin(i * 7.3) * 20;
        const x = ((i * 377 + t * (8 + i * 2)) % (SA.W + 900)) - 450 - cam.x * 0.03;
        const w = 300 + (i * 131) % 380;
        ctx.beginPath(); ctx.ellipse(x, y, w, 7 + (i % 3) * 4, 0, 0, SA.TAU); ctx.fill();
      }
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        ridge(g, rng, GY - 330, 250, '#8e3848', 0.8);
        g.fillStyle = '#6b2640';
        pagoda(g, LW / 2 + 520, GY - 430, 90, 5, 34);
        ridge(g, rng, GY - 200, 170, '#62203a', 1.2);
        mistBand(g, GY - 60, 260, '#ff9a5a', 0.28);
      } },
      { p: 0.4, res: 0.7, paint(g, rng) {
        g.fillStyle = '#2d0c1e';
        hall(g, LW / 2 - 380, GY - 40, 760, 560);
        pagoda(g, LW / 2 + 560, GY - 30, 230, 5, 108);
        g.strokeStyle = g.fillStyle;
        pine(g, rng, LW / 2 - 1060, GY - 20, 520);
        pine(g, rng, LW / 2 + 1050, GY - 20, 470);
        pine(g, rng, LW / 2 + 180, GY - 30, 360);
        g.fillRect(0, GY - 40, LW, 60);
        for (const [x, s] of [[-760, 0.9], [60, 0.8], [880, 0.9]]) {
          g.fillStyle = '#2d0c1e';
          stoneLantern(g, LW / 2 + x, GY - 38, s, '#ffb45c');
        }
        mistBand(g, GY, 170, '#ff8c50', 0.2);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#16060f';
        torii(g, LW / 2 - 60, GY - 10, 640, 560);
        // low temple wall
        g.fillRect(0, GY - 70, LW, 70);
        for (let x = 40; x < LW; x += 130) g.fillRect(x, GY - 96, 22, 30);
        g.fillRect(0, GY - 104, LW, 12);
        stoneLantern(g, LW / 2 - 820, GY - 60, 1.3, '#ffa04a');
        stoneLantern(g, LW / 2 + 760, GY - 60, 1.3, '#ffa04a');
        g.strokeStyle = '#16060f';
        pine(g, rng, LW / 2 - 1300, GY - 60, 700);
        pine(g, rng, LW / 2 + 1330, GY - 60, 650);
      } },
    ],
    ground(g, rng) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#3a1618'); gr.addColorStop(0.15, '#241012'); gr.addColorStop(1, '#070304');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      g.strokeStyle = 'rgba(255,170,110,0.07)';
      g.lineWidth = 2;
      for (const y of [10, 30, 62, 110, 180, 280]) { g.beginPath(); g.moveTo(0, y); g.lineTo(GW, y); g.stroke(); }
      for (let i = -16; i <= 16; i++) {
        g.beginPath();
        g.moveTo(GW / 2 + i * 110, 0);
        g.lineTo(GW / 2 + i * 110 * 2.6, GH);
        g.stroke();
      }
      glowAt(g, GW / 2 + 300, 18, 700, '#ff8a3a', 0.18);
      g.fillStyle = 'rgba(255,190,120,0.18)';
      g.fillRect(0, 0, GW, 3);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g, rng) {
      g.fillStyle = '#0a0306';
      // hanging maple branch top-left
      g.strokeStyle = '#0a0306';
      g.lineWidth = 26;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(LW / 2 - 1500, GY - 980); g.quadraticCurveTo(LW / 2 - 1100, GY - 930, LW / 2 - 850, GY - 800); g.stroke();
      for (let i = 0; i < 70; i++) {
        const t = rng();
        const x = lerp(LW / 2 - 1450, LW / 2 - 820, t) + rand(-60, 60);
        const y = lerp(GY - 960, GY - 790, t) + rand(-40, 70);
        g.save(); g.translate(x, y); g.rotate(rand(0, 6));
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * SA.TAU;
          g.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
          g.lineTo(Math.cos(a + 0.6) * 8, Math.sin(a + 0.6) * 8);
        }
        g.fill(); g.restore();
      }
      // grass tufts
      for (let i = 0; i < 60; i++) {
        const side = i < 30 ? -1 : 1;
        const x = LW / 2 + side * rand(900, 1500);
        g.beginPath();
        g.moveTo(x - 10, GY + 300);
        g.quadraticCurveTo(x + rand(-30, 30), GY + 150, x + rand(-50, 50), GY + rand(20, 120));
        g.lineTo(x + 10, GY + 300);
        g.fill();
      }
    } },
    weather: 'leaves',
  };

  DEFS.bamboo = {
    id: 'bamboo', name: 'MOONLIT BAMBOO', sub: 'Silence between the stalks',
    opponent: 'kitsune', music: 'bamboo', ambience: 'night', wind: -90,
    rims: [{ color: 'rgba(170,210,255,0.95)', dx: -3, dy: -2 }],
    shadow: 0.45, grade: ['rgba(60,110,200,0.06)', 'rgba(0,5,20,0.35)'],
    skyStatic(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, SA.H);
      g.addColorStop(0, '#02040b'); g.addColorStop(0.4, '#0a1428'); g.addColorStop(0.7, '#17304c'); g.addColorStop(0.9, '#294d72'); g.addColorStop(1, '#2f5578');
      ctx.fillStyle = g;
      ctx.fillRect(-400, -200, SA.W + 800, SA.H + 400);
      const rng = SA.M.seeded(7);
      for (let i = 0; i < 300; i++) {
        ctx.globalAlpha = 0.25 + rng() * 0.7;
        ctx.fillStyle = '#dfe9ff';
        const s = rng() < 0.1 ? 3 : 2;
        ctx.fillRect(rng() * (SA.W + 400) - 200, rng() * SA.H * 0.7 * rng(), s, s);
      }
      ctx.globalAlpha = 1;
      const mx = SA.W * 0.3, my = SA.H * 0.25;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.drawImage(SA.glowSprite('#7fa8ff'), mx - 520, my - 520, 1040, 1040);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(SA.glowSprite('#cfe0ff'), mx - 200, my - 200, 400, 400);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#eef4ff';
      ctx.beginPath(); ctx.arc(mx, my, 92, 0, SA.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(160,180,210,0.25)';
      for (const [dx, dy, r] of [[-30, -20, 18], [25, 15, 26], [10, -40, 10], [-20, 35, 12]]) {
        ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, SA.TAU); ctx.fill();
      }
    },
    skyLive(ctx, cam, t) {
      ctx.fillStyle = 'rgba(14,28,52,0.7)';
      for (let i = 0; i < 5; i++) {
        const x = ((i * 510 + t * (10 + i * 3)) % (SA.W + 1000)) - 500;
        ctx.beginPath(); ctx.ellipse(x, 150 + i * 60, 260 + i * 40, 16, 0, 0, SA.TAU); ctx.fill();
      }
    },
    layers: [
      { p: 0.1, res: 0.5, paint(g, rng) {
        ridge(g, rng, GY - 300, 260, '#2a4666', 0.7);
        ridge(g, rng, GY - 180, 160, '#1d3452', 1.1);
        mistBand(g, GY - 40, 300, '#7fa0c8', 0.3);
      } },
      { p: 0.38, res: 0.6, sway: 0.01, paint(g, rng) {
        g.fillStyle = '#10243a';
        for (let i = 0; i < 70; i++) bamboo(g, rng, rng() * LW, GY, 700 + rng() * 500, 8 + rng() * 12, 3);
        mistBand(g, GY, 260, '#6d8fb5', 0.35);
      } },
      { p: 0.7, res: 0.8, sway: 0.018, paint(g, rng) {
        g.fillStyle = '#07131f';
        for (let i = 0; i < 34; i++) bamboo(g, rng, rng() * LW, GY, 900 + rng() * 400, 16 + rng() * 16, 4);
        // small shrine
        g.fillStyle = '#060f19';
        g.fillRect(LW / 2 - 700, GY - 110, 90, 110);
        roof(g, LW / 2 - 655, GY - 106, 170, 60);
        stoneLantern(g, LW / 2 + 620, GY, 1, '#bfe0ff');
        mistBand(g, GY + 30, 180, '#7897bd', 0.25);
      } },
    ],
    ground(g, rng) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#1d2f44'); gr.addColorStop(0.1, '#0f1b2a'); gr.addColorStop(1, '#03060b');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(${rng() < 0.5 ? '20,40,30' : '40,60,80'},${0.3 + rng() * 0.4})`;
        g.beginPath();
        g.ellipse(rng() * GW, 8 + rng() * GH, 10 + rng() * 40, 3 + rng() * 6, 0, 0, SA.TAU);
        g.fill();
      }
      glowAt(g, GW / 2 - 400, 20, 800, '#6f9cdc', 0.12);
      g.fillStyle = 'rgba(180,210,255,0.14)';
      g.fillRect(0, 0, GW, 3);
    },
    fg: { p: 1.4, res: 0.5, blur: 5, sway: 0.025, paint(g, rng) {
      g.fillStyle = '#02060b';
      for (const x of [-1420, -1250, 1230, 1400, -1500, 1500]) bamboo(g, rng, LW / 2 + x, GY + 400, 1500, 50 + rng() * 20, 5);
    } },
    weather: 'fireflies',
  };

  DEFS.neon = {
    id: 'neon', name: 'NEON RAIN', sub: 'District 9, after midnight',
    opponent: 'volt', music: 'neon', ambience: 'rain', wind: -60,
    rims: [{ color: 'rgba(60,235,255,0.9)', dx: -3, dy: -1 }, { color: 'rgba(255,60,200,0.9)', dx: 3, dy: -1 }],
    reflective: true, shadow: 0.35, grade: ['rgba(180,40,255,0.06)', 'rgba(5,0,20,0.35)'],
    skyStatic(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, SA.H);
      g.addColorStop(0, '#040209'); g.addColorStop(0.45, '#12082a'); g.addColorStop(0.72, '#2c0f40'); g.addColorStop(0.88, '#521a5e'); g.addColorStop(1, '#6a2466');
      ctx.fillStyle = g;
      ctx.fillRect(-400, -200, SA.W + 800, SA.H + 400);
    },
    layers: [
      { p: 0.1, res: 0.5, paint(g, rng, a) {
        let x = 0;
        a.antennas = [];
        while (x < LW) {
          const w = 60 + rng() * 140, h = 250 + rng() * 620;
          g.fillStyle = '#170c2c';
          g.fillRect(x, GY - h, w, h);
          if (rng() < 0.3) { g.fillRect(x + w / 2 - 2, GY - h - 60, 4, 60); a.antennas.push([x + w / 2 - LW / 2, -h - 60]); }
          for (let wy = GY - h + 12; wy < GY - 10; wy += 16) {
            for (let wx = x + 8; wx < x + w - 8; wx += 12) {
              if (rng() < 0.22) {
                g.fillStyle = SA.M.pick(['rgba(255,210,120,0.55)', 'rgba(120,220,255,0.5)', 'rgba(255,120,220,0.45)']);
                g.fillRect(wx, wy, 5, 7);
              }
            }
          }
          x += w + rng() * 20;
        }
        mistBand(g, GY - 60, 420, '#8a2a86', 0.35);
      } },
      { p: 0.35, res: 0.7, paint(g, rng, a) {
        a.signs = [];
        let x = 0;
        const words = ['HOTEL', 'BAR', 'NOODLE', '24H', 'DOJO', 'ARCADE', 'SUSHI', 'CLUB'];
        const colors = ['#ff2bd6', '#35f0ff', '#ffd23f', '#ff4d6d', '#7cff6b', '#b46bff'];
        let wi = 0;
        while (x < LW) {
          const w = 160 + rng() * 220, h = 420 + rng() * 520;
          g.fillStyle = '#0d0719';
          g.fillRect(x, GY - h, w, h);
          g.fillStyle = 'rgba(255,255,255,0.03)';
          for (let wy = GY - h + 20; wy < GY - 60; wy += 34) g.fillRect(x + 10, wy, w - 20, 2);
          if (rng() < 0.85) {
            const c = colors[(wi * 7 + 3) % colors.length];
            const word = words[wi % words.length];
            wi++;
            if (rng() < 0.5) {
              const sy = GY - h + 60 + rng() * 150;
              g.fillStyle = '#05030a';
              g.fillRect(x + w / 2 - 30, sy - 40, 60, word.length * 46 + 30);
              neonText(g, word, x + w / 2, sy, 44, c, true);
              a.signs.push({ x: x + w / 2 - LW / 2, color: c, w: 50 });
            } else {
              const sy = GY - h * (0.35 + rng() * 0.3);
              g.strokeStyle = c;
              g.lineWidth = 4;
              g.shadowColor = c; g.shadowBlur = 20;
              g.strokeRect(x + 14, sy - 34, w - 28, 68);
              g.shadowBlur = 0;
              neonText(g, word, x + w / 2, sy, 40, c, false);
              a.signs.push({ x: x + w / 2 - LW / 2, color: c, w: w * 0.6 });
            }
          }
          x += w + 30 + rng() * 60;
        }
        mistBand(g, GY, 200, '#3b1250', 0.5);
      } },
      { p: 0.72, res: 0.8, paint(g, rng, a) {
        g.fillStyle = '#07040e';
        // elevated rail
        g.fillRect(0, GY - 820, LW, 60);
        g.fillRect(0, GY - 760, LW, 14);
        for (let x = 120; x < LW; x += 520) {
          g.fillRect(x, GY - 760, 70, 760);
          g.fillRect(x - 30, GY - 780, 130, 30);
        }
        // street lamps
        a.lamps = [];
        for (let x = 380; x < LW; x += 780) {
          g.fillRect(x, GY - 430, 10, 430);
          g.fillRect(x - 60, GY - 440, 70, 10);
          a.lamps.push(x - 55 - LW / 2);
          glowAt(g, x - 55, GY - 425, 60, '#ffe0a8', 0.9);
        }
        // vending machines
        for (const vx of [LW / 2 - 560, LW / 2 + 420]) {
          g.fillStyle = '#0a0a18';
          g.fillRect(vx, GY - 170, 90, 170);
          g.fillStyle = 'rgba(80,220,255,0.55)';
          g.fillRect(vx + 10, GY - 160, 70, 90);
          glowAt(g, vx + 45, GY - 115, 140, '#35f0ff', 0.35);
          g.fillStyle = '#07040e';
        }
        // cables
        g.strokeStyle = '#07040e';
        g.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.moveTo(0, GY - 700 + i * 30);
          g.quadraticCurveTo(LW / 2, GY - 560 + i * 40, LW, GY - 720 + i * 25);
          g.stroke();
        }
      } },
    ],
    ground(g, rng) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#1d1030'); gr.addColorStop(0.12, '#0f0a1a'); gr.addColorStop(1, '#020104');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = 0; x < GW; x += 260) g.fillRect(x, 150, 120, 6);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(140,90,200,0.08)';
        g.beginPath();
        g.ellipse(rng() * GW, 20 + rng() * GH * 0.8, 60 + rng() * 160, 6 + rng() * 14, 0, 0, SA.TAU);
        g.fill();
      }
    },
    fg: { p: 1.35, res: 0.5, blur: 5, paint(g) {
      g.fillStyle = '#020105';
      g.fillRect(LW / 2 - 1500, GY - 1000, 110, 1400);
      g.fillRect(LW / 2 + 1400, GY - 1000, 120, 1400);
      g.strokeStyle = '#020105';
      g.lineWidth = 6;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(LW / 2 - 1500, GY - 950 + i * 40);
        g.quadraticCurveTo(LW / 2, GY - 760 + i * 50, LW / 2 + 1500, GY - 960 + i * 30);
        g.stroke();
      }
    } },
    weather: 'rain',
  };

  DEFS.ruins = {
    id: 'ruins', name: 'EMBER RUINS', sub: 'The city that would not stop burning',
    opponent: 'oni', music: 'ruins', ambience: 'fire', wind: 120,
    rims: [{ color: 'rgba(255,120,40,0.95)', dx: -3, dy: -1 }, { color: 'rgba(255,70,20,0.7)', dx: 3, dy: -2 }],
    shadow: 0.5, grade: ['rgba(255,60,0,0.06)', 'rgba(20,0,0,0.35)'],
    skyStatic(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, SA.H);
      g.addColorStop(0, '#060101'); g.addColorStop(0.4, '#1d0504'); g.addColorStop(0.68, '#4a0f07'); g.addColorStop(0.85, '#9c2e0c'); g.addColorStop(1, '#e0601e');
      ctx.fillStyle = g;
      ctx.fillRect(-400, -200, SA.W + 800, SA.H + 400);
    },
    skyLive(ctx, cam, t) {
      ctx.fillStyle = 'rgba(20,6,4,0.55)';
      for (let i = 0; i < 7; i++) {
        const x = ((i * 430 + t * (14 + i * 4)) % (SA.W + 1200)) - 600 - cam.x * 0.05;
        const y = 180 + (i % 3) * 110;
        ctx.beginPath(); ctx.ellipse(x, y, 380, 90 + (i % 2) * 40, 0.1, 0, SA.TAU); ctx.fill();
      }
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng, a) {
        a.farFires = [];
        let x = 0;
        while (x < LW) {
          const w = 80 + rng() * 160, h = 180 + rng() * 420;
          g.fillStyle = '#2a0906';
          g.beginPath();
          g.moveTo(x, GY);
          g.lineTo(x, GY - h);
          const steps = 4;
          for (let s = 1; s <= steps; s++) g.lineTo(x + (w * s) / steps, GY - h + (rng() - 0.3) * 90);
          g.lineTo(x + w, GY);
          g.fill();
          for (let k = 0; k < 6; k++) {
            if (rng() < 0.5) {
              g.fillStyle = `rgba(255,${120 + rng() * 80},40,${0.4 + rng() * 0.5})`;
              g.fillRect(x + 10 + rng() * (w - 20), GY - h * rng() * 0.8 - 10, 6, 9);
            }
          }
          if (rng() < 0.35) a.farFires.push([x + w / 2 - LW / 2, -h * 0.5]);
          x += w + rng() * 40;
        }
        mistBand(g, GY - 40, 320, '#ff5a1a', 0.3);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        g.fillStyle = '#180604';
        a.fires = [];
        // broken colonnade
        for (let i = 0; i < 9; i++) {
          const x = 200 + i * 320 + rng() * 60;
          const h = 180 + rng() * 420;
          g.fillRect(x, GY - h, 56, h);
          g.fillRect(x - 12, GY - h, 80, 16);
          g.beginPath();
          g.moveTo(x, GY - h);
          g.lineTo(x + 20, GY - h - 30 - rng() * 40);
          g.lineTo(x + 56, GY - h - 10);
          g.fill();
          if (rng() < 0.6) a.fires.push([x + 28 - LW / 2, -rng() * 40 - 10]);
        }
        // collapsed arch
        g.beginPath();
        g.moveTo(LW / 2 - 300, GY);
        g.lineTo(LW / 2 - 300, GY - 380);
        g.quadraticCurveTo(LW / 2 - 60, GY - 620, LW / 2 + 120, GY - 470);
        g.lineTo(LW / 2 + 100, GY - 420);
        g.quadraticCurveTo(LW / 2 - 60, GY - 540, LW / 2 - 220, GY - 360);
        g.lineTo(LW / 2 - 220, GY);
        g.fill();
        g.fillRect(0, GY - 30, LW, 40);
        mistBand(g, GY, 200, '#ff4a10', 0.2);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#0c0302';
        for (let i = 0; i < 14; i++) {
          const x = rng() * LW, w = 90 + rng() * 220, h = 30 + rng() * 90;
          g.beginPath();
          g.moveTo(x - w / 2, GY);
          g.lineTo(x - w / 4, GY - h);
          g.lineTo(x + w / 5, GY - h * 0.7);
          g.lineTo(x + w / 2, GY);
          g.fill();
        }
        // fallen guardian statue head
        const sx = LW / 2 + 820;
        g.beginPath(); g.arc(sx, GY - 120, 120, Math.PI, 0); g.fill();
        g.fillRect(sx - 120, GY - 120, 240, 120);
        roof(g, sx - 60, GY - 210, 120, 50);
        // broken pillar
        g.fillRect(LW / 2 - 880, GY - 520, 80, 520);
        g.beginPath(); g.moveTo(LW / 2 - 880, GY - 520); g.lineTo(LW / 2 - 850, GY - 580); g.lineTo(LW / 2 - 800, GY - 540); g.fill();
      } },
    ],
    ground(g, rng) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#3a120a'); gr.addColorStop(0.12, '#1f0906'); gr.addColorStop(1, '#050101');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30; i++) {
        let x = rng() * GW, y = 10 + rng() * GH * 0.7;
        g.strokeStyle = `rgba(255,${80 + rng() * 60},20,${0.25 + rng() * 0.35})`;
        g.lineWidth = 1 + rng() * 2;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += rand(-60, 60); y += rand(-4, 12); g.lineTo(x, y); }
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      glowAt(g, GW / 2, 10, 900, '#ff5a1a', 0.15);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g, rng) {
      g.fillStyle = '#030000';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(LW / 2 + side * 1500, GY + 400);
        g.lineTo(LW / 2 + side * 1500, GY - 150);
        g.lineTo(LW / 2 + side * 1300, GY + 40);
        g.lineTo(LW / 2 + side * 1150, GY + 400);
        g.fill();
      }
      g.fillRect(LW / 2 - 1500, GY - 1000, 120, 700);
    } },
    weather: 'embers',
  };

  SA.ARENA_ORDER = ['temple', 'bamboo', 'neon', 'ruins'];
  SA.ARENAS = DEFS;
  SA.ArenaPaint = { ridge, mistBand, roof, pagoda, hall, torii, pine, stoneLantern, bamboo, glowAt, neonText, LW, LH, GY, GW, GH };

  // ---------- runtime ----------
  class Arena {
    constructor(id) {
      this.def = DEFS[id] || DEFS.temple;
      this.id = this.def.id;
      this.name = this.def.name;
      this.rims = this.def.rims;
      this.wind = this.def.wind;
      this.reflective = !!this.def.reflective;
      this.t = 0;
      this.built = false;
      this.weather = [];
      this.splashes = [];
    }

    build() {
      if (this.built) return;
      const d = this.def;
      const all = d.layers.map((L, i) => this.paintLayer(L, 101 + i * 17));
      // the far layer barely moves: bake it into the sky cache
      this.farLayer = all[0].p <= 0.15 ? all.shift() : null;
      this.layers = all;
      if (d.fg) this.fg = this.paintLayer(d.fg, 999);
      this.buildSkyCache();
      this.buildOverlay();
      const res = 0.8;
      this.groundCanvas = SA.makeCanvas(GW * res, GH * res);
      const g = this.groundCanvas.getContext('2d');
      g.scale(res, res);
      d.ground.call(this, g, SA.M.seeded(55));
      this.groundRes = res;
      this.initWeather();
      this.built = true;
    }

    paintLayer(L, seed) {
      const c = SA.makeCanvas(LW * L.res, LH * L.res);
      const g = c.getContext('2d');
      g.scale(L.res, L.res);
      g.lineJoin = 'round';
      L.paint.call(this, g, SA.M.seeded(seed), this);
      let canvas = c;
      if (L.blur && 'filter' in g) {
        const b = SA.makeCanvas(c.width, c.height);
        const bg = b.getContext('2d');
        bg.filter = `blur(${L.blur * L.res}px)`;
        bg.drawImage(c, 0, 0);
        canvas = b;
      }
      return { canvas, p: L.p, res: L.res, sway: L.sway || 0, runs: this.findRuns(canvas) };
    }

    // Rows of non-empty content so mostly transparent layers don't blit the whole screen.
    findRuns(canvas) {
      const cols = 24, rows = 13;
      const probe = SA.makeCanvas(cols, rows);
      const pg = probe.getContext('2d');
      pg.drawImage(canvas, 0, 0, cols, rows);
      let data;
      try { data = pg.getImageData(0, 0, cols, rows).data; } catch (e) { return null; }
      const runs = [];
      const cw = canvas.width / cols, ch = canvas.height / rows;
      for (let r = 0; r < rows; r++) {
        let a = -1, b = -1;
        for (let c = 0; c < cols; c++) {
          if (data[(r * cols + c) * 4 + 3] > 0) { if (a < 0) a = c; b = c; }
        }
        if (a < 0) continue;
        a = Math.max(0, a - 1); b = Math.min(cols - 1, b + 1);
        runs.push({ sx: Math.floor(a * cw), sy: Math.floor(r * ch), sw: Math.ceil((b - a + 1) * cw), sh: Math.ceil(ch) });
      }
      for (const r of runs) {
        r.sw = Math.min(r.sw, canvas.width - r.sx);
        r.sh = Math.min(r.sh, canvas.height - r.sy);
      }
      return runs;
    }

    buildSkyCache() {
      const res = 0.5, PX = 260, PY = 90;
      const c = SA.makeCanvas((SA.W + PX * 2) * res, (SA.H + PY * 2) * res);
      const g = c.getContext('2d');
      g.scale(res, res);
      g.translate(PX, PY);
      this.def.skyStatic(g, this);
      if (this.farLayer) {
        const L = this.farLayer;
        g.drawImage(L.canvas, SA.W / 2 - LW / 2, SA.H * SA.GROUND_SCREEN - GY, LW, LH);
      }
      this.skyCache = { canvas: c, PX, PY };
    }

    buildOverlay() {
      const c = SA.makeCanvas(SA.W / 2, SA.H / 2);
      const g = c.getContext('2d');
      g.fillStyle = this.def.grade[0];
      g.fillRect(0, 0, c.width, c.height);
      const gr = g.createRadialGradient(c.width / 2, c.height / 2, SA.H * 0.18, c.width / 2, c.height / 2, SA.W * 0.3);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = gr;
      g.fillRect(0, 0, c.width, c.height);
      this.overlay = c;
    }

    dispose() {
      this.layers = null;
      this.fg = null;
      this.farLayer = null;
      this.skyCache = null;
      this.overlay = null;
      this.groundCanvas = null;
      this.built = false;
    }

    // screen transform of a parallax layer
    xf(cam, p) {
      const z = 1 + (cam.viewZoom() - 1) * p;
      const base = SA.H * SA.GROUND_SCREEN;
      const gy = base + (cam.groundScreenY() - base) * p;
      const cx = SA.W / 2 - cam.x * p * z + cam.sx * p;
      return { z, gy, cx };
    }

    drawLayer(ctx, L, cam) {
      const { z, gy, cx } = this.xf(cam, L.p);
      if (L.sway) {
        const k = Math.sin(this.t * 0.8 + L.p * 3) * L.sway + Math.sin(this.t * 2.1) * L.sway * 0.25;
        const q = ctx.canvas.width / SA.W;
        ctx.setTransform(q, 0, k * q, q, -k * gy * q, 0);
      } else {
        SA.resetTransform(ctx);
      }
      const x0 = cx - (LW / 2) * z, y0 = gy - GY * z;
      if (L.runs) {
        const k = z / L.res;
        for (const r of L.runs) {
          const dx0 = Math.round(x0 + r.sx * k), dx1 = Math.round(x0 + (r.sx + r.sw) * k);
          const dy0 = Math.round(y0 + r.sy * k), dy1 = Math.round(y0 + (r.sy + r.sh) * k);
          if (dx1 < 0 || dx0 > SA.W || dy1 < 0 || dy0 > SA.H) continue;
          ctx.drawImage(L.canvas, r.sx, r.sy, r.sw, r.sh, dx0, dy0, dx1 - dx0, dy1 - dy0);
        }
      } else {
        ctx.drawImage(L.canvas, x0, y0, LW * z, LH * z);
      }
      SA.resetTransform(ctx);
    }

    update(dt, cam) {
      this.t += dt;
      this.updateWeather(dt, cam);
    }

    // screen-space background: sky + parallax layers
    drawBack(ctx, cam) {
      if (!this.built) this.build();
      SA.resetTransform(ctx);
      const sc = this.skyCache;
      const base = SA.H * SA.GROUND_SCREEN;
      const shiftX = clamp(-cam.x * 0.08 + cam.sx * 0.1, -sc.PX, sc.PX);
      const shiftY = clamp((cam.groundScreenY() - base) * 0.1, -sc.PY, sc.PY);
      ctx.drawImage(sc.canvas, -sc.PX + shiftX, -sc.PY + shiftY, SA.W + sc.PX * 2, SA.H + sc.PY * 2);
      if (this.def.sun) this.sun = { x: SA.W * this.def.sun.x + shiftX, y: base + this.def.sun.y + shiftY };
      if (this.def.skyLive) this.def.skyLive(ctx, cam, this.t, this);
      for (const L of this.layers) this.drawLayer(ctx, L, cam);
      this.drawLiveLights(ctx, cam);
    }

    drawLiveLights(ctx, cam) {
      const id = this.id;
      ctx.globalCompositeOperation = 'lighter';
      if (this.fires || this.farFires) {
        let f = this.xf(cam, 0.4);
        (this.fires || []).forEach(([x, y], i) => {
          const fl = 0.55 + 0.25 * Math.sin(this.t * 9 + i * 2.1) + 0.2 * Math.sin(this.t * 23 + i);
          const s = f.z * 150;
          ctx.globalAlpha = clamp(fl, 0, 1) * 0.8;
          ctx.drawImage(SA.glowSprite('#ff6a1a'), f.cx + x * f.z - s, f.gy + y * f.z - s * 1.2, s * 2, s * 2);
        });
        f = this.xf(cam, 0.12);
        (this.farFires || []).forEach(([x, y], i) => {
          const s = f.z * 120;
          ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.t * 5 + i);
          ctx.drawImage(SA.glowSprite('#ff4a10'), f.cx + x * f.z - s, f.gy + y * f.z - s, s * 2, s * 2);
        });
      } else if (this.signs) {
        const f = this.xf(cam, 0.1);
        (this.antennas || []).forEach(([x, y], i) => {
          if (Math.sin(this.t * 3 + i * 1.7) > 0.6) {
            ctx.globalAlpha = 0.9;
            ctx.drawImage(SA.glowSprite('#ff2a2a'), f.cx + x * f.z - 10, f.gy + y * f.z - 10, 20, 20);
          }
        });
        // lamp light cones
        const n = this.xf(cam, 0.72);
        for (const x of this.lamps || []) {
          const lx = n.cx + x * n.z, ly = n.gy - 425 * n.z;
          const gr = ctx.createLinearGradient(0, ly, 0, n.gy);
          gr.addColorStop(0, 'rgba(255,220,160,0.18)');
          gr.addColorStop(1, 'rgba(255,220,160,0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(lx - 12 * n.z, ly);
          ctx.lineTo(lx + 12 * n.z, ly);
          ctx.lineTo(lx + 170 * n.z, n.gy);
          ctx.lineTo(lx - 170 * n.z, n.gy);
          ctx.fill();
        }
        // a flickering sign
        if (this.signs && this.signs.length) {
          const s = this.signs[3 % this.signs.length];
          const m = this.xf(cam, 0.35);
          const on = Math.sin(this.t * 17) > -0.2 || Math.sin(this.t * 3.3) > 0.4;
          if (on) {
            ctx.globalAlpha = 0.25;
            const r = 200 * m.z;
            ctx.drawImage(SA.glowSprite(s.color), m.cx + s.x * m.z - r, m.gy - 520 * m.z - r, r * 2, r * 2);
          }
        }
      } else if (this.sun && (!SA.GFX || SA.GFX.rays)) {
        // soft god rays from the sun
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#ffd08a';
        for (let i = 0; i < 6; i++) {
          const a = -2.2 + i * 0.35 + Math.sin(this.t * 0.2 + i) * 0.04;
          ctx.beginPath();
          ctx.moveTo(this.sun.x, this.sun.y);
          ctx.lineTo(this.sun.x + Math.cos(a) * 2200, this.sun.y + Math.sin(a) * 2200);
          ctx.lineTo(this.sun.x + Math.cos(a + 0.08) * 2200, this.sun.y + Math.sin(a + 0.08) * 2200);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // world space (camera applied): ground plane + neon reflections
    drawGround(ctx, cam) {
      ctx.drawImage(this.groundCanvas, -GW / 2, 0, GW, GH);
      if (this.signs) {
        // neon reflections streak down the wet street
        const m = this.xf(cam, 0.35);
        const z = cam.viewZoom();
        ctx.save();
        SA.resetTransform(ctx);
        ctx.globalCompositeOperation = 'lighter';
        const gy = cam.groundScreenY();
        for (const s of this.signs) {
          const sx = m.cx + s.x * m.z;
          if (sx < -200 || sx > SA.W + 200) continue;
          const w = s.w * m.z * (0.9 + 0.15 * Math.sin(this.t * 2 + s.x));
          ctx.globalAlpha = 0.28;
          ctx.drawImage(SA.glowSprite(s.color, 0.1), sx - w, gy - 30 * z, w * 2, 330 * z);
        }
        ctx.restore();
      }
    }

    // screen space, in front of fighters
    drawFront(ctx, cam) {
      this.drawWeather(ctx, cam, true);
      if (this.fg && (!SA.GFX || SA.GFX.foreground)) this.drawLayer(ctx, this.fg, cam);
      SA.resetTransform(ctx);
      ctx.drawImage(this.overlay, 0, 0, SA.W, SA.H);
    }

    // ---------- weather ----------
    initWeather() {
      const w = this.def.weather;
      this.weather = [];
      const base = { leaves: 46, fireflies: 40, rain: 320, embers: 90, snow: 180, dust: 60, data: 70 }[w] || 0;
      const n = Math.round(base * ((SA.GFX && SA.GFX.weather) || 1));
      for (let i = 0; i < n; i++) this.weather.push(this.newParticle(w, true));
    }

    newParticle(type, scatter) {
      const p = { type, depth: Math.random() };
      if (type === 'rain') {
        p.x = rand(0, SA.W + 300);
        p.y = scatter ? rand(-SA.H, SA.H) : rand(-300, -20);
        p.len = 20 + p.depth * 40;
        p.v = 1500 + p.depth * 1200;
      } else if (type === 'leaves') {
        p.x = rand(-1500, 1500);
        p.y = scatter ? rand(-1100, 0) : rand(-1300, -1000);
        p.vx = rand(-160, -60); p.vy = rand(60, 130);
        p.rot = rand(0, 6); p.vr = rand(-3, 3); p.size = rand(6, 11) * (0.7 + p.depth * 0.8);
        p.color = SA.M.pick(['#c23a1e', '#e2622a', '#8a1d1d', '#f0a040', '#3a0d0d']);
        p.front = p.depth > 0.8;
      } else if (type === 'fireflies') {
        p.x = rand(-1300, 1300); p.y = rand(-500, -20);
        p.ph = rand(0, 10); p.sp = rand(0.3, 1);
        p.front = p.depth > 0.85;
      } else if (type === 'snow') {
        p.x = rand(-1500, 1500);
        p.y = scatter ? rand(-1200, 0) : rand(-1300, -1100);
        p.vx = rand(-80, -20); p.vy = rand(60, 160) * (0.6 + p.depth * 0.7);
        p.size = rand(2, 5) * (0.6 + p.depth);
        p.ph = rand(0, 10);
        p.front = p.depth > 0.82;
      } else if (type === 'dust' || type === 'data') {
        p.x = rand(-1400, 1400);
        p.y = scatter ? rand(-900, 0) : rand(-60, 20);
        p.vx = rand(-20, 20); p.vy = type === 'data' ? -rand(40, 120) : -rand(5, 25);
        p.size = rand(2, 5) * (0.6 + p.depth);
        p.ph = rand(0, 10);
        p.front = p.depth > 0.85;
      } else if (type === 'embers') {
        p.x = rand(-1400, 1400);
        p.y = scatter ? rand(-1100, 0) : rand(0, 80);
        p.vx = rand(-30, 80); p.vy = -rand(60, 200);
        p.size = rand(2, 5) * (0.6 + p.depth);
        p.ph = rand(0, 10);
        p.ash = Math.random() < 0.3;
        p.front = p.depth > 0.75;
        if (p.ash) { p.vy = rand(40, 110); p.y = scatter ? rand(-1100, 0) : -1100; }
      }
      return p;
    }

    updateWeather(dt, cam) {
      const w = this.def.weather;
      for (let i = 0; i < this.weather.length; i++) {
        const p = this.weather[i];
        if (w === 'rain') {
          p.y += p.v * dt;
          p.x += this.wind * 2 * dt;
          if (p.y > SA.H + 50) {
            this.weather[i] = this.newParticle(w, false);
            if (p.depth > 0.4 && this.splashes.length < 60 && cam) {
              const z = cam.viewZoom();
              this.splashes.push({ x: cam.x + (p.x - SA.W / 2) / z, y: rand(4, 120), life: 0 });
            }
          }
        } else if (w === 'leaves') {
          p.x += (p.vx + Math.sin(this.t * 2 + p.rot) * 40) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > 30 || p.x < -1700) this.weather[i] = this.newParticle(w, false);
        } else if (w === 'fireflies') {
          p.ph += dt * p.sp;
          p.x += Math.sin(p.ph * 1.3) * 25 * dt;
          p.y += Math.cos(p.ph) * 18 * dt;
        } else if (w === 'snow') {
          p.ph += dt;
          p.x += (p.vx + Math.sin(p.ph * 1.7) * 30 + this.wind * 0.2) * dt;
          p.y += p.vy * dt;
          if (p.y > 20 || p.x < -1700) this.weather[i] = this.newParticle(w, false);
        } else if (w === 'dust' || w === 'data') {
          p.ph += dt;
          p.x += (p.vx + Math.sin(p.ph) * 12) * dt;
          p.y += p.vy * dt;
          if (p.y < -1000) this.weather[i] = this.newParticle(w, false);
        } else if (w === 'embers') {
          p.ph += dt;
          p.x += (p.vx + Math.sin(p.ph * 3) * 30 + this.wind * 0.3) * dt;
          p.y += p.vy * dt;
          if (p.y < -1200 || p.y > 20 || Math.abs(p.x) > 1600) this.weather[i] = this.newParticle(w, false);
        }
      }
      for (const s of this.splashes) s.life += dt;
      this.splashes = this.splashes.filter((s) => s.life < 0.3);
    }

    // world-space weather behind fighters (called with camera transform)
    drawWeatherWorld(ctx, front) {
      const w = this.def.weather;
      if (w === 'leaves') {
        for (const p of this.weather) {
          if (!!p.front !== front) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.55 + 0.45 * Math.sin(p.rot * 2));
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, SA.TAU);
          ctx.fill();
          ctx.restore();
        }
      } else if (w === 'snow') {
        ctx.fillStyle = '#f2f7ff';
        for (const p of this.weather) {
          if (!!p.front !== front) continue;
          ctx.globalAlpha = 0.55 + p.depth * 0.4;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, SA.TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (w === 'dust' || w === 'data') {
        ctx.globalCompositeOperation = 'lighter';
        const col = w === 'data' ? '#35f0ff' : '#ffe6a0';
        for (const p of this.weather) {
          if (!!p.front !== front) continue;
          ctx.globalAlpha = (0.25 + 0.35 * Math.max(0, Math.sin(p.ph * 2))) * (w === 'data' ? 1.4 : 1);
          if (w === 'data') { ctx.fillStyle = p.depth > 0.5 ? '#35f0ff' : '#ff2bd6'; ctx.fillRect(p.x, p.y, p.size * 1.6, p.size * 1.6); }
          else ctx.drawImage(SA.glowSprite(col), p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else if (w === 'fireflies' || w === 'embers') {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.weather) {
          if (!!p.front !== front) continue;
          if (w === 'fireflies') {
            const a = 0.35 + 0.65 * Math.max(0, Math.sin(p.ph * 3));
            ctx.globalAlpha = a;
            ctx.drawImage(SA.glowSprite('#d8ff8a'), p.x - 14, p.y - 14, 28, 28);
          } else if (p.ash) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#6a5a55';
            ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
            ctx.globalCompositeOperation = 'lighter';
          } else {
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(p.ph * 6);
            const s = p.size * 4;
            ctx.drawImage(SA.glowSprite('#ff8a2a'), p.x - s, p.y - s, s * 2, s * 2);
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (this.def.weather === 'rain' && !front) {
        ctx.strokeStyle = 'rgba(200,180,255,0.5)';
        ctx.lineWidth = 2;
        for (const s of this.splashes) {
          const u = s.life / 0.3;
          ctx.globalAlpha = 1 - u;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, 4 + u * 22, 1 + u * 4, 0, 0, SA.TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // ground fog for the bamboo forest
      if (this.id === 'bamboo') {
        for (let i = 0; i < 6; i++) {
          if ((i % 3 === 0) !== front) continue;
          const x = ((i * 520 + this.t * (18 + i * 5)) % 3200) - 1600;
          ctx.globalAlpha = front ? 0.1 : 0.16;
          ctx.drawImage(SA.glowSprite('#a8c4e6', 0.4), x - 500, -140, 1000, 220);
        }
        ctx.globalAlpha = 1;
      }
    }

    // screen-space weather in front of everything
    drawWeather(ctx, cam, front) {
      if (this.def.weather !== 'rain') return;
      SA.resetTransform(ctx);
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? 'rgba(210,200,255,0.42)' : 'rgba(170,150,230,0.22)';
        ctx.lineWidth = pass ? 2 : 1;
        ctx.beginPath();
        for (const p of this.weather) {
          if ((p.depth > 0.6) !== !!pass) continue;
          const dx = this.wind * 2 / p.v * p.len;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + dx, p.y + p.len);
        }
        ctx.stroke();
      }
    }
  }

  SA.Arena = Arena;
})(window.SA);
