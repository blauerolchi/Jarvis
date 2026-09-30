'use strict';
/* Additional procedural arenas for the arena ladder: Frozen Mountain, Burning Palace, Ancient Ruins, Cyber Arena. */
(function (SA) {
  const { rand } = SA.M;
  const { ridge, mistBand, roof, pagoda, hall, torii, pine, stoneLantern, glowAt, neonText, LW, LH, GY, GW, GH } = SA.ArenaPaint;
  const DEFS = SA.ARENAS;

  function grad(ctx, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, SA.H);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(-400, -200, SA.W + 800, SA.H + 400);
  }

  DEFS.frozen = {
    id: 'frozen', name: 'FROZEN MOUNTAIN', sub: 'Thin air, heavy blows',
    opponent: 'royal_guard', music: 'bamboo', ambience: 'wind', wind: -140,
    rims: [{ color: 'rgba(210,235,255,0.95)', dx: -3, dy: -2 }],
    shadow: 0.5, grade: ['rgba(120,170,255,0.05)'],
    sun: { x: 0.7, y: -470 },
    skyStatic(ctx) {
      grad(ctx, [[0, '#18233a'], [0.4, '#3c5676'], [0.72, '#9fb7cf'], [0.9, '#dfe8f2'], [1, '#eef3f8']]);
      const sx = SA.W * 0.7, sy = SA.H * SA.GROUND_SCREEN - 470;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;
      ctx.drawImage(SA.glowSprite('#fff4dc'), sx - 420, sy - 420, 840, 840);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,250,240,0.85)';
      ctx.beginPath(); ctx.arc(sx, sy, 70, 0, SA.TAU); ctx.fill();
    },
    skyLive(ctx, cam, t) {
      ctx.fillStyle = 'rgba(230,238,248,0.35)';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 460 + t * (12 + i * 3)) % (SA.W + 1000)) - 500;
        ctx.beginPath(); ctx.ellipse(x, 140 + i * 58, 320 + i * 30, 22, 0, 0, SA.TAU); ctx.fill();
      }
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        ridge(g, rng, GY - 360, 330, '#dde6ef', 0.7);
        ridge(g, rng, GY - 240, 220, '#a9bacb', 1.1);
        mistBand(g, GY - 40, 320, '#e8eef5', 0.45);
      } },
      { p: 0.4, res: 0.6, paint(g, rng) {
        g.fillStyle = '#34465a'; g.strokeStyle = '#34465a';
        for (let i = 0; i < 16; i++) pine(g, rng, rng() * LW, GY - 10, 260 + rng() * 260);
        g.fillStyle = '#2c3c4e';
        torii(g, LW / 2 + 380, GY - 10, 360, 320);
        g.fillStyle = 'rgba(240,246,252,0.8)';
        for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(rng() * LW, GY - rng() * 300, 30 + rng() * 40, 6, 0, 0, SA.TAU); g.fill(); }
        mistBand(g, GY + 10, 200, '#dfe8f0', 0.5);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#1b2533';
        for (let i = 0; i < 10; i++) {
          const x = rng() * LW, w = 120 + rng() * 240, h = 60 + rng() * 120;
          g.beginPath(); g.moveTo(x - w / 2, GY); g.lineTo(x - w / 4, GY - h); g.lineTo(x + w / 5, GY - h * 0.8); g.lineTo(x + w / 2, GY); g.fill();
          g.fillStyle = '#e9f0f7';
          g.beginPath(); g.moveTo(x - w / 4 - 10, GY - h + 6); g.lineTo(x - w / 4, GY - h - 4); g.lineTo(x + w / 5, GY - h * 0.8 - 4); g.lineTo(x + w / 5 + 8, GY - h * 0.8 + 8); g.fill();
          g.fillStyle = '#1b2533';
        }
        stoneLantern(g, LW / 2 - 700, GY, 1.2, '#ffd9a0');
      } },
    ],
    ground(g, rng) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#e9f0f7'); gr.addColorStop(0.18, '#b9c8d8'); gr.addColorStop(1, '#4a5a6c');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '120,150,190'},${0.15 + rng() * 0.2})`;
        g.beginPath(); g.ellipse(rng() * GW, 10 + rng() * GH, 20 + rng() * 60, 3 + rng() * 6, 0, 0, SA.TAU); g.fill();
      }
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g, rng) {
      g.fillStyle = '#101820'; g.strokeStyle = '#101820';
      pine(g, rng, LW / 2 - 1420, GY + 350, 1300);
      pine(g, rng, LW / 2 + 1440, GY + 350, 1200);
    } },
    weather: 'snow',
  };

  DEFS.palace = {
    id: 'palace', name: 'BURNING PALACE', sub: 'The throne room is on fire',
    opponent: 'tomb_executioner', music: 'ruins', ambience: 'fire', wind: 90,
    rims: [{ color: 'rgba(255,130,50,0.95)', dx: -3, dy: -1 }, { color: 'rgba(255,60,20,0.6)', dx: 3, dy: -2 }],
    shadow: 0.5, grade: ['rgba(255,70,10,0.07)'],
    skyStatic(ctx) {
      grad(ctx, [[0, '#0b0203'], [0.45, '#2e0806'], [0.72, '#7a1c08'], [0.9, '#d8521a'], [1, '#ff8a3a']]);
    },
    skyLive(ctx, cam, t) {
      ctx.fillStyle = 'rgba(25,8,6,0.55)';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 420 + t * (16 + i * 5)) % (SA.W + 1200)) - 600 - cam.x * 0.05;
        ctx.beginPath(); ctx.ellipse(x, 200 + (i % 3) * 120, 420, 110, 0.12, 0, SA.TAU); ctx.fill();
      }
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng, a) {
        a.farFires = [];
        g.fillStyle = '#2a0906';
        for (let i = 0; i < 6; i++) {
          const x = 200 + i * 480 + rng() * 100;
          pagoda(g, x, GY - 60, 150 + rng() * 60, 3 + Math.floor(rng() * 3), 70);
          a.farFires.push([x - LW / 2, -200 - rng() * 120]);
        }
        mistBand(g, GY - 40, 320, '#ff5a1a', 0.3);
      } },
      { p: 0.4, res: 0.7, paint(g, rng, a) {
        a.fires = [];
        g.fillStyle = '#1b0605';
        hall(g, LW / 2 - 60, GY - 30, 900, 640);
        for (const x of [-900, 820]) { g.fillStyle = '#1b0605'; pagoda(g, LW / 2 + x, GY - 20, 200, 4, 100); }
        // hanging banners
        for (let i = 0; i < 6; i++) {
          const x = LW / 2 - 330 + i * 130;
          g.fillStyle = '#6b0a0a';
          g.fillRect(x, GY - 420, 44, 190);
          g.beginPath(); g.moveTo(x, GY - 230); g.lineTo(x + 22, GY - 205); g.lineTo(x + 44, GY - 230); g.fill();
        }
        for (let i = 0; i < 8; i++) a.fires.push([rng() * LW - LW / 2, -rng() * 380 - 60]);
        mistBand(g, GY, 200, '#ff4a10', 0.22);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#0d0302';
        g.fillRect(0, GY - 80, LW, 80);
        for (let x = 60; x < LW; x += 170) g.fillRect(x, GY - 120, 26, 44);
        for (const x of [LW / 2 - 760, LW / 2 + 740]) {
          g.fillRect(x - 30, GY - 160, 60, 160);
          g.fillRect(x - 55, GY - 185, 110, 30);
          glowAt(g, x, GY - 200, 150, '#ff7a2a', 0.8);
        }
      } },
    ],
    ground(g, rng) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#4a140c'); gr.addColorStop(0.12, '#240807'); gr.addColorStop(1, '#060101');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      g.strokeStyle = 'rgba(255,140,70,0.08)';
      g.lineWidth = 2;
      for (let i = -16; i <= 16; i++) { g.beginPath(); g.moveTo(GW / 2 + i * 120, 0); g.lineTo(GW / 2 + i * 300, GH); g.stroke(); }
      glowAt(g, GW / 2, 10, 900, '#ff5a1a', 0.2);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g) {
      g.fillStyle = '#030000';
      g.fillRect(LW / 2 - 1500, GY - 1000, 130, 1400);
      g.fillRect(LW / 2 + 1380, GY - 1000, 130, 1400);
      g.fillRect(LW / 2 - 1500, GY - 1000, 3000, 60);
    } },
    weather: 'embers',
  };

  DEFS.ancient = {
    id: 'ancient', name: 'ANCIENT RUINS', sub: 'Where old gods sleep under moss',
    opponent: 'desert_archer', music: 'temple', ambience: 'wind', wind: -70,
    rims: [{ color: 'rgba(255,220,140,0.9)', dx: 3, dy: -2 }],
    shadow: 0.5, grade: ['rgba(255,200,90,0.05)'],
    sun: { x: 0.58, y: -380 },
    skyStatic(ctx) {
      grad(ctx, [[0, '#1d2a2a'], [0.4, '#4a6660'], [0.72, '#b7b07a'], [0.9, '#f0d890'], [1, '#ffe6a8']]);
      const sx = SA.W * 0.58, sy = SA.H * SA.GROUND_SCREEN - 380;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(SA.glowSprite('#ffd27a'), sx - 600, sy - 600, 1200, 1200);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath(); ctx.arc(sx, sy, 100, 0, SA.TAU); ctx.fill();
    },
    layers: [
      { p: 0.12, res: 0.5, paint(g, rng) {
        ridge(g, rng, GY - 300, 240, '#7f968c', 0.5);
        g.fillStyle = '#6d857b';
        // stepped pyramid
        for (let i = 0; i < 6; i++) g.fillRect(LW / 2 - 260 + i * 30, GY - 230 - i * 40, 520 - i * 60, 42);
        mistBand(g, GY - 40, 300, '#f0d890', 0.35);
      } },
      { p: 0.4, res: 0.7, paint(g, rng) {
        g.fillStyle = '#2c3a34';
        for (let i = 0; i < 10; i++) {
          const x = 150 + i * 290 + rng() * 60, h = 250 + rng() * 380;
          g.fillRect(x, GY - h, 60, h);
          g.fillRect(x - 14, GY - h - 18, 88, 22);
          if (rng() < 0.4) g.fillRect(x - 14, GY - h - 60, 330, 36);
        }
        g.strokeStyle = '#1e2a22';
        g.lineWidth = 5;
        for (let i = 0; i < 26; i++) {
          const x = rng() * LW;
          g.beginPath(); g.moveTo(x, GY - 500 - rng() * 200); g.quadraticCurveTo(x + rand(-40, 40), GY - 300, x + rand(-30, 30), GY - 120 - rng() * 100); g.stroke();
        }
        mistBand(g, GY, 200, '#c8c080', 0.22);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#151c18';
        // giant fallen stone head
        const sx = LW / 2 - 800;
        g.beginPath(); g.ellipse(sx, GY - 110, 170, 130, -0.2, 0, SA.TAU); g.fill();
        g.fillRect(sx - 60, GY - 40, 200, 40);
        for (let i = 0; i < 12; i++) {
          const x = rng() * LW, w = 90 + rng() * 200, h = 30 + rng() * 80;
          g.beginPath(); g.moveTo(x - w / 2, GY); g.lineTo(x - w / 3, GY - h); g.lineTo(x + w / 4, GY - h * 0.8); g.lineTo(x + w / 2, GY); g.fill();
        }
        g.fillRect(LW / 2 + 760, GY - 420, 90, 420);
      } },
    ],
    ground(g, rng) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#6a7250'); gr.addColorStop(0.14, '#3a4230'); gr.addColorStop(1, '#0e120c');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      for (let i = 0; i < 120; i++) {
        g.fillStyle = `rgba(${rng() < 0.6 ? '60,90,40' : '120,110,80'},${0.25 + rng() * 0.35})`;
        g.beginPath(); g.ellipse(rng() * GW, 10 + rng() * GH, 14 + rng() * 50, 3 + rng() * 7, 0, 0, SA.TAU); g.fill();
      }
      glowAt(g, GW / 2 + 200, 20, 800, '#ffd27a', 0.14);
    },
    fg: { p: 1.35, res: 0.5, blur: 6, paint(g, rng) {
      g.fillStyle = '#0a0f0a';
      for (let i = 0; i < 50; i++) {
        const side = i < 25 ? -1 : 1;
        const x = LW / 2 + side * rand(900, 1500);
        g.beginPath(); g.moveTo(x - 12, GY + 300); g.quadraticCurveTo(x + rand(-40, 40), GY + 120, x + rand(-60, 60), GY + rand(0, 100)); g.lineTo(x + 12, GY + 300); g.fill();
      }
      g.strokeStyle = '#0a0f0a'; g.lineWidth = 10;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(LW / 2 + 1100 + i * 60, GY - 1000); g.quadraticCurveTo(LW / 2 + 1200, GY - 700, LW / 2 + 1150 + i * 40, GY - 500 + i * 40); g.stroke(); }
    } },
    weather: 'dust',
  };

  DEFS.cyber = {
    id: 'cyber', name: 'CYBER ARENA', sub: 'Live on every screen in the city',
    opponent: 'serpent_priest', music: 'neon', ambience: 'rain', wind: 0,
    rims: [{ color: 'rgba(53,240,255,0.95)', dx: -3, dy: -1 }, { color: 'rgba(255,43,214,0.8)', dx: 3, dy: -1 }],
    reflective: true, shadow: 0.35, grade: ['rgba(40,120,255,0.05)'],
    skyStatic(ctx) {
      grad(ctx, [[0, '#010308'], [0.5, '#04142a'], [0.78, '#08304a'], [0.92, '#0d4a66'], [1, '#12607e']]);
    },
    layers: [
      { p: 0.1, res: 0.5, paint(g, rng) {
        let x = 0;
        while (x < LW) {
          const w = 90 + rng() * 200, h = 300 + rng() * 650;
          g.fillStyle = '#061426';
          g.fillRect(x, GY - h, w, h);
          g.fillStyle = 'rgba(53,240,255,0.35)';
          for (let y = GY - h + 20; y < GY; y += 40) if (rng() < 0.5) g.fillRect(x + 6, y, w - 12, 2);
          x += w + rng() * 30;
        }
        mistBand(g, GY - 50, 380, '#1a6a8a', 0.35);
      } },
      { p: 0.35, res: 0.7, paint(g, rng, a) {
        a.signs = [];
        g.fillStyle = '#040b16';
        // stadium stands
        g.beginPath(); g.moveTo(0, GY); g.lineTo(0, GY - 420); g.lineTo(LW, GY - 420); g.lineTo(LW, GY); g.fill();
        g.fillStyle = '#071526';
        for (let r = 0; r < 6; r++) g.fillRect(0, GY - 400 + r * 60, LW, 8);
        const words = ['ARENA', 'LIVE', 'VS', 'ONLINE', 'FIGHT', 'NEON'];
        const colors = ['#35f0ff', '#ff2bd6', '#ffd23f', '#7cff6b'];
        for (let i = 0; i < 6; i++) {
          const x = 260 + i * 480, c = colors[i % colors.length];
          g.fillStyle = '#02060c';
          g.fillRect(x - 120, GY - 700, 240, 110);
          neonText(g, words[i], x, GY - 645, 56, c, false);
          a.signs.push({ x: x - LW / 2, color: c, w: 160 });
        }
        mistBand(g, GY, 160, '#0a2a40', 0.5);
      } },
      { p: 0.72, res: 0.8, paint(g, rng) {
        g.fillStyle = '#02050b';
        for (const x of [LW / 2 - 820, LW / 2 - 420, LW / 2 + 420, LW / 2 + 820]) {
          g.fillRect(x - 22, GY - 300, 44, 300);
          g.fillStyle = 'rgba(53,240,255,0.7)';
          g.fillRect(x - 4, GY - 290, 8, 280);
          glowAt(g, x, GY - 150, 120, '#35f0ff', 0.3);
          g.fillStyle = '#02050b';
        }
        g.fillRect(0, GY - 40, LW, 40);
        g.fillStyle = 'rgba(255,43,214,0.7)';
        g.fillRect(0, GY - 40, LW, 4);
      } },
    ],
    ground(g) {
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, '#0a2236'); gr.addColorStop(0.15, '#06121e'); gr.addColorStop(1, '#010306');
      g.fillStyle = gr;
      g.fillRect(0, 0, GW, GH);
      g.strokeStyle = 'rgba(53,240,255,0.22)';
      g.lineWidth = 2;
      for (const y of [8, 26, 56, 100, 170, 270, 400]) { g.beginPath(); g.moveTo(0, y); g.lineTo(GW, y); g.stroke(); }
      for (let i = -18; i <= 18; i++) { g.beginPath(); g.moveTo(GW / 2 + i * 100, 0); g.lineTo(GW / 2 + i * 320, GH); g.stroke(); }
    },
    fg: { p: 1.35, res: 0.5, blur: 5, paint(g) {
      g.fillStyle = '#010204';
      g.fillRect(LW / 2 - 1500, GY - 1000, 120, 1400);
      g.fillRect(LW / 2 + 1390, GY - 1000, 120, 1400);
    } },
    weather: 'data',
  };

  SA.ARENA_ORDER.push('frozen', 'palace', 'ancient', 'cyber');
})(window.SA);
