'use strict';
/*
 * The realm of the dead: eight Egyptian arenas.
 * Each arena = sky + 2–3 parallax layers (far / mid / near) + ground + blurred foreground,
 * live lights (torches, braziers), weather (sand, sandstorm, glyphs, spirit motes, scarabs) and rim light.
 * Order = FIGHT unlock chain (first four) and the arena ladder rotation.
 */
(function (SA) {
  const P = SA.ArenaPaint;
  const { LW, LH, GY, GW, GH } = P;
  const DEFS = SA.ARENAS;

  function sky(ctx, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, SA.H);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(-400, -200, SA.W + 800, SA.H + 400);
  }
  function sunDisc(ctx, x, y, r, core, glow, glowA) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glowA || 0.6;
    ctx.drawImage(SA.glowSprite(glow), x - r * 5.5, y - r * 5.5, r * 11, r * 11);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(SA.glowSprite(core), x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(x, y, r, 0, SA.TAU); ctx.fill();
  }
  function stars(ctx, n, seed) {
    const r = SA.M.seeded(seed);
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = 0.25 + r() * 0.7;
      ctx.fillStyle = r() < 0.2 ? '#bcd8ff' : '#ffffff';
      ctx.fillRect(r() * (SA.W + 400) - 200, r() * SA.H * 0.62, 1 + r() * 2, 1 + r() * 2);
    }
    ctx.globalAlpha = 1;
  }
  // sand / stone floor with perspective joints
  function floor(g, top, mid, bottom, line, glow, tiles) {
    const gr = g.createLinearGradient(0, 0, 0, GH);
    gr.addColorStop(0, top); gr.addColorStop(0.18, mid); gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, GW, GH);
    g.strokeStyle = line;
    g.lineWidth = 2;
    for (const y of [12, 34, 66, 116, 190, 290]) { g.beginPath(); g.moveTo(0, y); g.lineTo(GW, y); g.stroke(); }
    if (tiles) {
      for (let i = -16; i <= 16; i++) { g.beginPath(); g.moveTo(GW / 2 + i * 120, 0); g.lineTo(GW / 2 + i * 120 * 2.6, GH); g.stroke(); }
    }
    if (glow) P.glowAt(g, GW / 2 + glow[0], 18, glow[1], glow[2], glow[3]);
  }
  function sandRipples(g, rng, color) {
    g.strokeStyle = color;
    g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const y = 20 + Math.pow(rng(), 1.4) * (GH - 40);
      const x = rng() * GW, w = 60 + rng() * 200;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 4 - rng() * 4, x + w, y); g.stroke();
    }
  }

  // ======================= 1. DESERT TEMPLE =======================
  DEFS.desert_temple = {
    platforms: 'temple',
    id: 'desert_temple', name: 'DESERT TEMPLE', sub: 'The sun sets over the pyramids',
    opponent: 'tomb_guard', music: 'temple', ambience: 'wind', wind: -240,
    rims: [{ color: 'rgba(255,170,90,0.95)', dx: 3, dy: -2 }, { color: 'rgba(120,90,200,0.5)', dx: -3, dy: -1 }],
    shadow: 0.55, grade: ['rgba(255,130,40,0.07)', 'rgba(40,10,30,0.25)'],
    sun: { x: 0.62, y: -300 }, rays: { n: 7, alpha: 0.05, color: '#ffd08a', from: -2.3, step: 0.33, width: 0.07 },
    sandColor: '#f0c88a',
    skyStatic(ctx) {
      sky(ctx, [[0, '#1a0c24'], [0.28, '#4a1a3a'], [0.52, '#a8402e'], [0.72, '#e88a3a'], [0.88, '#ffc878'], [1, '#ffe0a8']]);
      sunDisc(ctx, SA.W * 0.62, SA.H * SA.GROUND_SCREEN - 300, 118, '#fff0c4', '#ff8a2a', 0.55);
    },
    skyLive(ctx, cam, t) {
      ctx.fillStyle = 'rgba(110,30,50,0.45)';
      for (let i = 0; i < 7; i++) {
        const y = 110 + i * 56 + Math.sin(i * 7.3) * 20;
        const x = ((i * 377 + t * (6 + i * 2)) % (SA.W + 900)) - 450 - cam.x * 0.03;
        ctx.beginPath(); ctx.ellipse(x, y, 320 + (i * 131) % 380, 6 + (i % 3) * 4, 0, 0, SA.TAU); ctx.fill();
      }
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        P.dunes(g, rng, GY - 250, 160, '#9a4a34', '#e0905a');
        P.pyramid(g, LW / 2 - 520, GY - 250, 640, 420, '#6a2c26', '#c06a3a', 1);
        P.pyramid(g, LW / 2 + 60, GY - 230, 420, 280, '#5e2a24', '#b0603a', 1);
        P.pyramid(g, LW / 2 + 820, GY - 240, 300, 190, '#562620', '#a0583a', 1);
        g.fillStyle = '#6a2a26';
        for (let i = 0; i < 9; i++) P.palm(g, rng, 200 + i * 320 + rng() * 80, GY - 190, 90 + rng() * 60);
        P.mistBand(g, GY - 80, 260, '#ff9a5a', 0.28);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        P.dunes(g, rng, GY - 30, 120, '#4a2016', null);
        g.fillStyle = '#2a120e';
        P.pylon(g, LW / 2 - 300, GY - 40, 820, 520, '#c9913a');
        g.fillStyle = '#2a120e';
        P.obelisk(g, LW / 2 + 360, GY - 40, 70, 560, '#e0a040');
        P.obelisk(g, LW / 2 - 980, GY - 40, 60, 460, '#e0a040');
        g.fillStyle = '#2a120e';
        for (const x of [-1300, 700, 1150]) P.palm(g, rng, LW / 2 + x, GY - 30, 360 + rng() * 120);
        g.fillStyle = '#2a120e';
        P.brazier(g, a, LW / 2 - 120, GY - 40, 1, '#ffb45c', 0.4);
        P.brazier(g, a, LW / 2 - 480, GY - 40, 1, '#ffb45c', 0.4);
        g.fillStyle = '#2a120e';
        g.fillRect(0, GY - 40, LW, 60);
        P.mistBand(g, GY, 170, '#ff8c50', 0.18);
      } },
      { p: 0.72, res: 0.8, paint(g, rng, a) {
        g.fillStyle = '#170906';
        for (const x of [-1320, -1060, 1040, 1300]) P.column(g, LW / 2 + x, GY - 60, 90, 560, '#6a3a1a');
        g.fillStyle = '#170906';
        g.fillRect(0, GY - 70, LW, 70);
        P.glyphPanel(g, rng, LW / 2 - 820, GY - 66, 360, 58, 'rgba(210,150,80,0.35)', 16);
        P.glyphPanel(g, rng, LW / 2 + 460, GY - 66, 360, 58, 'rgba(210,150,80,0.35)', 16);
        g.fillStyle = '#170906';
        P.brazier(g, a, LW / 2 - 760, GY - 60, 1.3, '#ffa04a', 0.72);
        P.brazier(g, a, LW / 2 + 720, GY - 60, 1.3, '#ffa04a', 0.72);
      } },
    ],
    ground(g, rng) {
      floor(g, '#8a4a2a', '#4a2414', '#0c0604', 'rgba(255,190,120,0.06)', [300, 700, '#ff8a3a', 0.18]);
      sandRipples(g, rng, 'rgba(255,200,140,0.08)');
      g.fillStyle = 'rgba(255,200,130,0.2)';
      g.fillRect(0, 0, GW, 3);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g, rng) {
      g.fillStyle = '#0c0503';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(LW / 2 + side * 1500, GY + 300);
        g.quadraticCurveTo(LW / 2 + side * 1250, GY + 40, LW / 2 + side * 1000, GY + 300);
        g.fill();
      }
      g.fillStyle = '#0c0503';
      P.palm(g, rng, LW / 2 - 1420, GY + 200, 900, 0.18);
    } },
    weather: ['sand', 'dust'],
  };

  // ======================= 2. NILE AT NIGHT =======================
  DEFS.nile_night = {
    platforms: 'bridge',
    id: 'nile_night', name: 'NILE AT NIGHT', sub: 'Moonlight on the river of life',
    opponent: 'desert_bandit', music: 'bamboo', ambience: 'night', wind: -80,
    rims: [{ color: 'rgba(170,205,255,0.95)', dx: -3, dy: -2 }],
    shadow: 0.45, grade: ['rgba(60,110,200,0.06)', 'rgba(0,5,20,0.35)'],
    reflective: true, reflectColor: '#0e1a2a',
    water: { p: 0.4, x: 520, y: -140, step: 11, w: 260, color: '#dfe8ff' },
    groundMist: { color: '#9ab6e0', a: 0.14 }, fireflyColor: '#e8f08a',
    skyStatic(ctx) {
      sky(ctx, [[0, '#02040b'], [0.4, '#0a1630'], [0.72, '#1a3050'], [0.9, '#2a4a66'], [1, '#34587a']]);
      stars(ctx, 260, 7);
      const mx = SA.W * 0.7, my = SA.H * SA.GROUND_SCREEN - 540;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(SA.glowSprite('#9ab8ff'), mx - 500, my - 500, 1000, 1000);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#eef3ff';
      ctx.beginPath(); ctx.arc(mx, my, 92, 0, SA.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(160,180,220,0.35)';
      for (const [dx, dy, r] of [[-26, -18, 16], [20, 22, 11], [30, -30, 8]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, SA.TAU); ctx.fill(); }
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        P.dunes(g, rng, GY - 250, 110, '#12223a', null);
        P.pyramid(g, LW / 2 - 820, GY - 250, 360, 230, '#0e1a2e', '#1c3150', -1);
        P.pyramid(g, LW / 2 - 480, GY - 250, 220, 140, '#0e1a2e', '#1c3150', -1);
        g.fillStyle = '#0e1a2e';
        P.pylon(g, LW / 2 + 560, GY - 250, 380, 220, null);
        P.obelisk(g, LW / 2 + 860, GY - 250, 26, 200, null);
        P.mistBand(g, GY - 200, 180, '#3a5a80', 0.25);
      } },
      { p: 0.4, res: 0.7, paint(g, rng) {
        // the river: dark water band with the far bank above it
        const wy = GY - 170;
        g.fillStyle = '#0a1422';
        g.fillRect(0, wy - 40, LW, 40);
        const gr = g.createLinearGradient(0, wy, 0, GY);
        gr.addColorStop(0, '#16304a'); gr.addColorStop(1, '#08101c');
        g.fillStyle = gr;
        g.fillRect(0, wy, LW, GY - wy);
        g.fillStyle = '#0a1422';
        for (let i = 0; i < 11; i++) P.palm(g, rng, 120 + i * 280 + rng() * 60, wy - 30, 160 + rng() * 90);
        // felucca
        const bx = LW / 2 - 200;
        g.beginPath(); g.moveTo(bx - 120, wy + 40); g.quadraticCurveTo(bx, wy + 70, bx + 130, wy + 36); g.lineTo(bx - 120, wy + 40); g.fill();
        g.fillRect(bx - 4, wy - 180, 6, 220);
        g.beginPath(); g.moveTo(bx + 2, wy - 176); g.lineTo(bx + 110, wy + 20); g.lineTo(bx + 2, wy + 10); g.closePath(); g.fill();
        // reeds
        g.strokeStyle = '#08101a'; g.lineWidth = 3;
        for (let i = 0; i < 90; i++) {
          const x = rng() * LW, h = 40 + rng() * 90;
          g.beginPath(); g.moveTo(x, GY); g.quadraticCurveTo(x + 6, GY - h * 0.6, x + (rng() - 0.5) * 30, GY - h); g.stroke();
          if (rng() < 0.4) { g.beginPath(); g.ellipse(x + (rng() - 0.5) * 30, GY - h - 8, 5, 12, 0, 0, SA.TAU); g.fillStyle = '#08101a'; g.fill(); }
        }
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#050a12';
        P.column(g, LW / 2 - 1100, GY - 20, 100, 440, null);
        g.fillRect(LW / 2 + 980, GY - 240, 110, 240);   // broken column
        g.fillRect(LW / 2 + 1100, GY - 90, 160, 90);
        g.fillStyle = '#050a12';
        P.palm(g, rng, LW / 2 - 1350, GY - 10, 620, 0.12);
        P.palm(g, rng, LW / 2 + 1330, GY - 10, 560, -0.15);
        g.fillRect(0, GY - 30, LW, 40);
      } },
    ],
    ground(g, rng) {
      floor(g, '#2a3a4a', '#16202c', '#04060a', 'rgba(170,200,255,0.06)', [420, 520, '#9ab8ff', 0.12], true);
      g.fillStyle = 'rgba(200,220,255,0.2)';
      g.fillRect(0, 0, GW, 3);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g, rng) {
      g.strokeStyle = '#020408'; g.lineWidth = 5;
      for (let i = 0; i < 70; i++) {
        const side = i < 35 ? -1 : 1;
        const x = LW / 2 + side * (1000 + rng() * 520);
        g.beginPath(); g.moveTo(x, GY + 320); g.quadraticCurveTo(x + (rng() - 0.5) * 40, GY + 120, x + (rng() - 0.5) * 80, GY - rng() * 140); g.stroke();
      }
    } },
    weather: ['fireflies'],
  };

  // ======================= 3. LOST PYRAMID =======================
  DEFS.lost_pyramid = {
    platforms: 'steps',
    id: 'lost_pyramid', name: 'LOST PYRAMID', sub: 'Torches in the sealed chamber',
    opponent: 'royal_guard', music: 'ruins', ambience: 'fire', wind: 20,
    rims: [{ color: 'rgba(255,160,80,0.95)', dx: 3, dy: -2 }, { color: 'rgba(255,120,60,0.45)', dx: -3, dy: -1 }],
    shadow: 0.6, grade: ['rgba(255,120,40,0.06)', 'rgba(10,4,0,0.3)'],
    floorGlow: true, dustColor: '#ffcf8a',
    skyStatic(ctx) {
      sky(ctx, [[0, '#070403'], [0.5, '#1a100a'], [1, '#2e1c0e']]);
      // sloped ceiling of the chamber
      ctx.fillStyle = '#0a0604';
      ctx.beginPath(); ctx.moveTo(-400, -200); ctx.lineTo(SA.W / 2, SA.H * 0.12); ctx.lineTo(SA.W + 400, -200); ctx.closePath(); ctx.fill();
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        g.fillStyle = '#20140a';
        g.fillRect(0, GY - 700, LW, 700);
        P.glyphPanel(g, rng, LW / 2 - 700, GY - 640, 1400, 380, 'rgba(160,110,60,0.3)', 30);
        g.fillStyle = '#140c06';
        // sarcophagus on a dais
        g.fillRect(LW / 2 - 200, GY - 150, 400, 150);
        g.fillRect(LW / 2 - 130, GY - 260, 260, 110);
        g.beginPath(); g.ellipse(LW / 2, GY - 260, 130, 40, 0, Math.PI, 0); g.fill();
        P.mistBand(g, GY - 60, 240, '#6a3a1a', 0.25);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        g.fillStyle = '#1c1008';
        for (let i = 0; i < 8; i++) P.column(g, 180 + i * 380, GY - 30, 110, 640, '#6a4a22');
        g.fillStyle = '#1c1008';
        for (let i = 0; i < 7; i++) P.torch(g, a, 370 + i * 380, GY - 420, 1, '#ffa040', 0.4);
        g.fillStyle = '#1c1008';
        g.fillRect(0, GY - 30, LW, 40);
      } },
      { p: 0.72, res: 0.8, paint(g, rng, a) {
        g.fillStyle = '#0d0704';
        P.column(g, LW / 2 - 1250, GY - 40, 170, 800, '#4a3018');
        P.column(g, LW / 2 + 1250, GY - 40, 170, 800, '#4a3018');
        g.fillStyle = '#0d0704';
        P.glyphPanel(g, rng, LW / 2 - 1330, GY - 700, 160, 560, 'rgba(200,140,70,0.25)', 22);
        P.glyphPanel(g, rng, LW / 2 + 1170, GY - 700, 160, 560, 'rgba(200,140,70,0.25)', 22);
        g.fillStyle = '#0d0704';
        P.brazier(g, a, LW / 2 - 820, GY - 40, 1.2, '#ffa040', 0.72);
        P.brazier(g, a, LW / 2 + 820, GY - 40, 1.2, '#ffa040', 0.72);
      } },
    ],
    ground(g, rng) {
      floor(g, '#5a3a20', '#2a1a0c', '#060402', 'rgba(255,190,120,0.07)', [0, 800, '#ff8a3a', 0.14], true);
      g.fillStyle = 'rgba(255,190,120,0.16)';
      g.fillRect(0, 0, GW, 3);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g) {
      g.fillStyle = '#030201';
      g.fillRect(LW / 2 - 1500, GY - 1000, 170, 1400);
      g.fillRect(LW / 2 + 1330, GY - 1000, 170, 1400);
    } },
    weather: ['dust'],
  };

  // ======================= 4. SCARAB CATACOMBS =======================
  DEFS.scarab_catacombs = {
    platforms: 'four',
    id: 'scarab_catacombs', name: 'SCARAB CATACOMBS', sub: 'Where the beetles guard the dead',
    opponent: 'scarab_warrior', music: 'neon', ambience: 'night', wind: 0,
    rims: [{ color: 'rgba(80,255,210,0.9)', dx: -3, dy: -2 }, { color: 'rgba(40,160,140,0.45)', dx: 3, dy: -1 }],
    shadow: 0.5, grade: ['rgba(20,200,160,0.05)', 'rgba(0,10,8,0.35)'],
    floorGlow: true, moteColor: '#6fffd8', scarabColor: '#081210',
    groundMist: { color: '#2fd8b0', a: 0.12 },
    skyStatic(ctx) {
      sky(ctx, [[0, '#010403'], [0.6, '#06120f'], [1, '#0c1e1a']]);
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        g.fillStyle = '#0a1614';
        g.fillRect(0, GY - 760, LW, 760);
        // wall niches with wrapped dead
        for (let row = 0; row < 3; row++) {
          for (let i = 0; i < 12; i++) {
            const x = 120 + i * 240 + (row % 2) * 110, y = GY - 700 + row * 200;
            g.fillStyle = '#040a08';
            g.beginPath(); g.moveTo(x, y + 150); g.lineTo(x, y + 30); g.quadraticCurveTo(x + 80, y - 30, x + 160, y + 30); g.lineTo(x + 160, y + 150); g.fill();
            g.fillStyle = '#3a4a3c';
            g.beginPath(); g.ellipse(x + 80, y + 120, 64, 16, 0, 0, SA.TAU); g.fill();
          }
        }
        P.mistBand(g, GY - 40, 280, '#1a6a58', 0.3);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        g.fillStyle = '#071210';
        for (let i = 0; i < 6; i++) {
          const x = 250 + i * 520;
          g.fillRect(x - 60, GY - 620, 120, 620);
          g.beginPath(); g.moveTo(x + 60, GY - 460); g.quadraticCurveTo(x + 260, GY - 700, x + 460, GY - 460); g.lineTo(x + 460, GY - 420); g.quadraticCurveTo(x + 260, GY - 640, x + 60, GY - 420); g.fill();
        }
        // glowing scarab relief
        const sx = LW / 2 + 60, sy = GY - 420;
        g.strokeStyle = '#2fd8b0'; g.lineWidth = 6;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(SA.glowSprite('#2fd8b0'), sx - 260, sy - 260, 520, 520);
        g.beginPath(); g.ellipse(sx, sy, 70, 95, 0, 0, SA.TAU); g.stroke();
        g.beginPath(); g.moveTo(sx, sy - 95); g.lineTo(sx, sy + 95); g.stroke();
        g.beginPath(); g.arc(sx, sy - 130, 34, 0, SA.TAU); g.stroke();
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(sx + s * 60, sy - 30); g.quadraticCurveTo(sx + s * 190, sy - 90, sx + s * 250, sy + 10); g.stroke(); }
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#071210';
        for (let i = 0; i < 5; i++) P.brazier(g, a, 380 + i * 560, GY - 30, 0.9, '#35f0c0', 0.4);
        g.fillStyle = '#071210';
        g.fillRect(0, GY - 30, LW, 40);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#030807';
        // bone piles and rubble
        for (const x of [-1200, -700, 900, 1300]) {
          for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(LW / 2 + x + (rng() - 0.5) * 220, GY - 20 - rng() * 60, 30 + rng() * 30, 10 + rng() * 10, rng() * 3, 0, SA.TAU); g.fill(); }
        }
        g.fillRect(LW / 2 - 1500, GY - 900, 200, 900);
        g.fillRect(LW / 2 + 1300, GY - 900, 200, 900);
      } },
    ],
    ground(g, rng) {
      floor(g, '#16302a', '#0a1a16', '#010302', 'rgba(80,255,210,0.05)', [-200, 700, '#2fd8b0', 0.14], true);
      for (let i = 0; i < 9; i++) P.glowAt(g, rng() * GW, 30 + rng() * 200, 120, '#2fd8b0', 0.08);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g, rng) {
      g.strokeStyle = '#010302'; g.lineWidth = 16;
      for (let i = 0; i < 6; i++) {
        const x = LW / 2 + (i < 3 ? -1 : 1) * (1100 + rng() * 380);
        g.beginPath(); g.moveTo(x, GY - 1000); g.quadraticCurveTo(x + (rng() - 0.5) * 200, GY - 600, x + (rng() - 0.5) * 120, GY - 300 - rng() * 300); g.stroke();
      }
    } },
    weather: ['motes', 'scarabs'],
  };

  // ======================= 5. TOMB OF ANUBIS =======================
  DEFS.tomb_anubis = {
    platforms: 'temple',
    id: 'tomb_anubis', name: 'TOMB OF ANUBIS', sub: 'The Guardian of the Dead is watching',
    opponent: 'anubis_acolyte', music: 'ruins', ambience: 'night', wind: 0,
    rims: [{ color: 'rgba(255,200,90,0.9)', dx: 3, dy: -2 }, { color: 'rgba(60,220,210,0.5)', dx: -3, dy: -1 }],
    shadow: 0.55, grade: ['rgba(200,150,40,0.05)', 'rgba(0,0,10,0.4)'],
    reflective: true, reflectColor: '#140e06', floorGlow: true, dustColor: '#ffd27a',
    groundMist: { color: '#3aa8a0', a: 0.1 },
    skyStatic(ctx) {
      sky(ctx, [[0, '#030306'], [0.6, '#0a0a12'], [1, '#161016']]);
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        g.fillStyle = '#0c0c14';
        g.fillRect(0, GY - 900, LW, 900);
        // colossal Anubis relief outlined in gold
        g.strokeStyle = 'rgba(220,170,70,0.4)'; g.lineWidth = 6;
        const x = LW / 2, y = GY - 180;
        g.save(); g.translate(x, y); g.scale(1.6, 1.6);
        g.beginPath();
        g.moveTo(-60, 0); g.lineTo(-50, -200); g.lineTo(-70, -260); g.lineTo(-30, -330); g.lineTo(20, -330);
        g.lineTo(26, -420); g.lineTo(36, -335); g.lineTo(60, -420); g.lineTo(66, -330); g.lineTo(140, -300); g.lineTo(130, -285); g.lineTo(60, -280); g.lineTo(60, -200); g.lineTo(70, 0);
        g.stroke();
        g.restore();
        P.glyphPanel(g, rng, 200, GY - 820, 700, 560, 'rgba(200,160,70,0.2)', 30);
        P.glyphPanel(g, rng, LW - 900, GY - 820, 700, 560, 'rgba(200,160,70,0.2)', 30);
        P.mistBand(g, GY - 40, 260, '#1a3a44', 0.3);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        g.fillStyle = '#08080e';
        for (let i = 0; i < 7; i++) P.column(g, 220 + i * 430, GY - 30, 100, 640, '#8a6a2a');
        g.fillStyle = '#08080e';
        P.jackalShrine(g, LW / 2 - 540, GY - 30, 1.1);
        P.jackalShrine(g, LW / 2 + 560, GY - 30, 1.1);
        g.strokeStyle = 'rgba(220,170,70,0.6)'; g.lineWidth = 3;
        for (const x of [-540, 560]) g.strokeRect(LW / 2 + x - 110, GY - 120, 220, 90);
        g.fillStyle = '#08080e';
        for (let i = 0; i < 6; i++) P.torch(g, a, 435 + i * 430, GY - 430, 1, '#ffb050', 0.4);
        g.fillStyle = '#08080e';
        g.fillRect(0, GY - 30, LW, 40);
      } },
      { p: 0.72, res: 0.8, paint(g, rng, a) {
        g.fillStyle = '#040408';
        g.fillStyle = '#040408';
        P.seatedStatue(g, LW / 2 - 1200, GY - 40, 1.6, 'jackal');
        P.seatedStatue(g, LW / 2 + 1200, GY - 40, 1.6, 'jackal');
        g.fillStyle = '#040408';
        P.brazier(g, a, LW / 2 - 760, GY - 40, 1.25, '#ffb050', 0.72);
        P.brazier(g, a, LW / 2 + 760, GY - 40, 1.25, '#ffb050', 0.72);
      } },
    ],
    ground(g, rng) {
      floor(g, '#1e1a22', '#0e0c12', '#020203', 'rgba(220,170,70,0.12)', [0, 700, '#c9a24e', 0.1], true);
      g.fillStyle = 'rgba(220,170,70,0.3)';
      g.fillRect(0, 0, GW, 3);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g) {
      g.fillStyle = '#010102';
      g.fillRect(LW / 2 - 1500, GY - 1000, 150, 1400);
      g.fillRect(LW / 2 + 1350, GY - 1000, 150, 1400);
    } },
    weather: ['dust'],
  };

  // ======================= 6. CHAOS DESERT =======================
  DEFS.chaos_desert = {
    platforms: 'steps',
    id: 'chaos_desert', name: 'CHAOS DESERT', sub: 'Set’s storm tears the sky apart',
    opponent: 'jackal_assassin', music: 'ruins', ambience: 'wind', wind: -420,
    rims: [{ color: 'rgba(255,110,60,0.9)', dx: 3, dy: -2 }, { color: 'rgba(200,180,255,0.4)', dx: -3, dy: -1 }],
    shadow: 0.45, grade: ['rgba(255,80,30,0.07)', 'rgba(20,0,0,0.35)'],
    lightning: true, sandColor: '#d89060',
    skyStatic(ctx) {
      sky(ctx, [[0, '#0a0305'], [0.35, '#2a0c0c'], [0.65, '#5a1a10'], [0.88, '#8a3a1a'], [1, '#a8522a']]);
    },
    skyLive(ctx, cam, t) {
      ctx.fillStyle = 'rgba(30,8,8,0.55)';
      for (let i = 0; i < 10; i++) {
        const y = 60 + i * 44 + Math.sin(i * 3.1) * 30;
        const x = ((i * 290 - t * (40 + i * 12)) % (SA.W + 1200) + SA.W + 1200) % (SA.W + 1200) - 600 - cam.x * 0.03;
        ctx.beginPath(); ctx.ellipse(x, y, 380 + (i * 97) % 300, 26 + (i % 3) * 12, 0, 0, SA.TAU); ctx.fill();
      }
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        P.dunes(g, rng, GY - 240, 150, '#5a2012', '#a04a24');
        g.fillStyle = '#3a140c';
        // broken pyramid
        g.beginPath(); g.moveTo(LW / 2 - 700, GY - 240); g.lineTo(LW / 2 - 460, GY - 470); g.lineTo(LW / 2 - 400, GY - 430); g.lineTo(LW / 2 - 340, GY - 480); g.lineTo(LW / 2 - 180, GY - 240); g.fill();
        g.fillStyle = '#3a140c';
        g.save(); g.translate(LW / 2 + 520, GY - 240); g.rotate(0.3); P.obelisk(g, 0, 0, 40, 300, null); g.restore();
        P.mistBand(g, GY - 60, 280, '#a0502a', 0.3);
      } },
      { p: 0.4, res: 0.7, paint(g, rng) {
        P.dunes(g, rng, GY - 20, 90, '#2a0c08', null);
        g.fillStyle = '#1e0806';
        P.standingGod(g, LW / 2 - 560, GY - 30, 1.5, 'set', true);
        P.standingGod(g, LW / 2 + 620, GY - 30, 1.5, 'set', true);
        for (let i = 0; i < 6; i++) {
          const x = 300 + i * 480 + rng() * 80, h = 140 + rng() * 300;
          g.fillRect(x, GY - h, 70, h);
          g.beginPath(); g.moveTo(x, GY - h); g.lineTo(x + 30, GY - h - 30 - rng() * 30); g.lineTo(x + 70, GY - h - 8); g.fill();
        }
        g.fillRect(0, GY - 30, LW, 40);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#0e0403';
        for (const x of [-1300, 1240]) {
          g.beginPath(); g.moveTo(LW / 2 + x - 180, GY); g.lineTo(LW / 2 + x - 120, GY - 180); g.lineTo(LW / 2 + x + 40, GY - 240); g.lineTo(LW / 2 + x + 200, GY - 120); g.lineTo(LW / 2 + x + 240, GY); g.fill();
        }
        g.save(); g.translate(LW / 2 + 900, GY - 20); g.rotate(-1.2); P.obelisk(g, 0, 0, 70, 420, null); g.restore();
      } },
    ],
    ground(g, rng) {
      floor(g, '#6a2e18', '#3a160c', '#080202', 'rgba(255,150,90,0.06)', null);
      sandRipples(g, rng, 'rgba(255,160,100,0.08)');
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        let x = rng() * GW, y = 10 + rng() * 60;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 80; y += 20 + rng() * 30; g.lineTo(x, y); }
        g.stroke();
      }
    },
    fg: { p: 1.35, res: 0.5, blur: 7, paint(g) {
      g.fillStyle = '#050101';
      for (const side of [-1, 1]) {
        g.beginPath(); g.moveTo(LW / 2 + side * 1500, GY + 300); g.quadraticCurveTo(LW / 2 + side * 1200, GY, LW / 2 + side * 950, GY + 300); g.fill();
      }
    } },
    weather: ['sandstorm'],
  };

  // ======================= 7. TEMPLE OF RA =======================
  DEFS.temple_ra = {
    platforms: 'four',
    id: 'temple_ra', name: 'TEMPLE OF RA', sub: 'Under the eye of the sun god',
    opponent: 'tomb_executioner', music: 'temple', ambience: 'wind', wind: -60,
    rims: [{ color: 'rgba(255,240,190,0.95)', dx: 3, dy: -2 }, { color: 'rgba(255,170,60,0.6)', dx: -3, dy: -1 }],
    shadow: 0.5, grade: ['rgba(255,190,80,0.08)', 'rgba(40,20,0,0.2)'],
    vignette: 'rgba(40,16,0,0.45)',
    sun: { x: 0.5, y: -470 }, rays: { n: 16, alpha: 0.075, color: '#fff0b0', from: -3.1, step: 0.2, width: 0.06 },
    reflective: true, reflectColor: '#3a1a06', floorGlow: true, glyphColor: '#fff0b0', dustColor: '#fff0c0',
    skyStatic(ctx) {
      sky(ctx, [[0, '#2a1206'], [0.3, '#8a4410'], [0.55, '#e09a30'], [0.8, '#ffdc8a'], [1, '#fff4d0']]);
      sunDisc(ctx, SA.W * 0.5, SA.H * SA.GROUND_SCREEN - 470, 190, '#fffbe8', '#ffb13a', 0.8);
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        P.pyramid(g, LW / 2, GY - 230, 900, 520, '#8a4a14', '#e0a040', -1);
        g.fillStyle = '#ffe9a8';
        g.beginPath(); g.moveTo(LW / 2 - 60, GY - 700); g.lineTo(LW / 2, GY - 750); g.lineTo(LW / 2 + 60, GY - 700); g.closePath(); g.fill();   // golden capstone
        g.fillStyle = '#7a3e10';
        for (const x of [-1100, -800, 800, 1100]) P.obelisk(g, LW / 2 + x, GY - 230, 40, 380, '#ffe08a');
        P.mistBand(g, GY - 60, 300, '#ffc060', 0.35);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        g.fillStyle = '#5a2a08';
        P.pylon(g, LW / 2, GY - 30, 1100, 560, '#ffd060');
        g.fillStyle = '#4a2206';
        P.standingGod(g, LW / 2 - 820, GY - 30, 1.8, 'falcon', true);
        P.standingGod(g, LW / 2 + 820, GY - 30, 1.8, 'falcon', true);
        g.fillStyle = '#4a2206';
        g.fillRect(0, GY - 30, LW, 40);
      } },
      { p: 0.72, res: 0.8, paint(g, rng, a) {
        g.fillStyle = '#2a1204';
        for (const x of [-1330, -1060, 1060, 1330]) P.column(g, LW / 2 + x, GY - 50, 110, 700, '#ffc850');
        g.fillStyle = '#2a1204';
        P.brazier(g, a, LW / 2 - 760, GY - 50, 1.3, '#ffd070', 0.72);
        P.brazier(g, a, LW / 2 + 760, GY - 50, 1.3, '#ffd070', 0.72);
      } },
    ],
    ground(g, rng) {
      floor(g, '#c08030', '#6a3a10', '#140802', 'rgba(255,230,160,0.14)', [0, 900, '#ffd070', 0.22], true);
      g.fillStyle = 'rgba(255,240,190,0.35)';
      g.fillRect(0, 0, GW, 4);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g) {
      g.fillStyle = '#140802';
      g.fillRect(LW / 2 - 1500, GY - 1000, 140, 1400);
      g.fillRect(LW / 2 + 1360, GY - 1000, 140, 1400);
    } },
    weather: ['glyphs', 'dust'],
  };

  // ======================= 8. HALL OF OSIRIS =======================
  DEFS.hall_osiris = {
    platforms: 'bridge',
    id: 'hall_osiris', name: 'HALL OF OSIRIS', sub: 'The heart is weighed against the feather',
    opponent: 'cursed_mummy', music: 'bamboo', ambience: 'night', wind: 0,
    rims: [{ color: 'rgba(120,255,160,0.85)', dx: -3, dy: -2 }, { color: 'rgba(230,190,90,0.6)', dx: 3, dy: -1 }],
    shadow: 0.5, grade: ['rgba(40,220,120,0.05)', 'rgba(0,10,4,0.4)'],
    reflective: true, reflectColor: '#06140c', floorGlow: true, moteColor: '#8fffb0',
    groundMist: { color: '#3ad890', a: 0.12 },
    skyStatic(ctx) {
      sky(ctx, [[0, '#010403'], [0.5, '#04140c'], [1, '#0a2418']]);
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        // endless columns fading into the dark
        for (let r = 0; r < 3; r++) {
          g.fillStyle = ['#07140e', '#0a1c14', '#0e241a'][r];
          for (let i = 0; i < 14; i++) P.column(g, 60 + i * 220 + r * 70, GY - 200 + r * 60, 50 + r * 10, 520 + r * 60, null);
        }
        // scales of Ma'at glowing above the altar
        const x = LW / 2, y = GY - 560;
        g.strokeStyle = '#d8b25a'; g.lineWidth = 6;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(SA.glowSprite('#9dff7a'), x - 300, y - 200, 600, 500);
        g.beginPath(); g.moveTo(x, y - 120); g.lineTo(x, y + 220); g.moveTo(x - 200, y - 60); g.lineTo(x + 200, y - 60); g.stroke();
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 200, y - 60); g.lineTo(x + s * 170, y + 40); g.lineTo(x + s * 230, y + 40); g.closePath(); g.stroke(); }
        g.globalCompositeOperation = 'source-over';
        P.mistBand(g, GY - 60, 300, '#1a6a3a', 0.3);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        g.fillStyle = '#04100a';
        for (let i = 0; i < 6; i++) P.column(g, 300 + i * 480, GY - 30, 130, 720, '#c9a24e');
        g.fillStyle = '#04100a';
        P.standingGod(g, LW / 2 - 260, GY - 30, 1.5, 'pharaoh', true);
        P.standingGod(g, LW / 2 + 260, GY - 30, 1.5, 'pharaoh', true);
        g.fillStyle = '#04100a';
        for (let i = 0; i < 5; i++) P.brazier(g, a, 540 + i * 480, GY - 30, 1, '#6aff9a', 0.4);
        g.fillStyle = '#04100a';
        g.fillRect(0, GY - 30, LW, 40);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#010604';
        P.column(g, LW / 2 - 1260, GY - 40, 180, 820, '#6a5a2a');
        P.column(g, LW / 2 + 1260, GY - 40, 180, 820, '#6a5a2a');
      } },
    ],
    ground(g, rng) {
      floor(g, '#12301e', '#081a10', '#010402', 'rgba(140,255,170,0.07)', [0, 800, '#6aff9a', 0.12], true);
      g.fillStyle = 'rgba(200,170,80,0.3)';
      g.fillRect(0, 0, GW, 3);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g) {
      g.fillStyle = '#000201';
      g.fillRect(LW / 2 - 1500, GY - 1000, 160, 1400);
      g.fillRect(LW / 2 + 1340, GY - 1000, 160, 1400);
    } },
    weather: ['motes'],
  };

  SA.ARENA_ORDER.push('desert_temple', 'nile_night', 'lost_pyramid', 'scarab_catacombs', 'tomb_anubis', 'chaos_desert', 'temple_ra', 'hall_osiris');
  // old (pre-Egypt) ids -> new arenas, used by the save migration
  SA.ARENA_RENAME = {
    temple: 'desert_temple', bamboo: 'nile_night', neon: 'scarab_catacombs', ruins: 'lost_pyramid',
    frozen: 'tomb_anubis', palace: 'temple_ra', ancient: 'chaos_desert', cyber: 'hall_osiris',
  };
})(window.SA);
