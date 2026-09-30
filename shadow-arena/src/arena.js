'use strict';
/*
 * Procedural arenas. Static scenery is painted once into offscreen parallax layers;
 * weather, flickering fire light, lightning, water shimmer and sun rays are drawn live.
 *
 * Layer space: LW x LH, world x = 0 at LW/2, world ground (y = 0) at GY.
 * A layer with parallax p scrolls and zooms by factor p relative to the world camera.
 * The Egyptian arena definitions live in arenas_egypt.js and use the painters in SA.ArenaPaint.
 */
(function (SA) {
  const { rand, clamp } = SA.M;
  const LW = 3000, LH = 1300, GY = 1000;
  const GW = 3000, GH = 440;

  // ---------- generic painting helpers ----------
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

  // smooth sand dunes: long soft crests
  function dunes(g, rng, baseY, amp, color, lit) {
    const a = rng() * 10, b = rng() * 10;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, LH);
    const pts = [];
    for (let x = 0; x <= LW; x += 10) {
      const h = 0.7 * Math.sin(x * 0.0016 + a) + 0.3 * Math.sin(x * 0.0043 + b);
      const y = baseY - amp * (0.5 + 0.5 * h);
      pts.push([x, y]);
      g.lineTo(x, y);
    }
    g.lineTo(LW, LH);
    g.closePath();
    g.fill();
    if (lit) {
      // sunlit crest line
      g.strokeStyle = lit;
      g.lineWidth = 3;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + 2) : g.moveTo(x, y + 2)));
      g.stroke();
    }
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

  function glowAt(g, x, y, r, color, alpha) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.drawImage(SA.glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---------- Egyptian architecture ----------
  // pyramid with a sunlit face (side: +1 light from the right, -1 from the left)
  function pyramid(g, cx, baseY, w, h, dark, lit, side) {
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(cx - w / 2, baseY); g.lineTo(cx, baseY - h); g.lineTo(cx + w / 2, baseY); g.closePath(); g.fill();
    if (lit) {
      const s = side || 1;
      g.fillStyle = lit;
      g.beginPath(); g.moveTo(cx, baseY - h); g.lineTo(cx + s * w / 2, baseY); g.lineTo(cx + s * w * 0.08, baseY); g.closePath(); g.fill();
    }
  }

  function obelisk(g, x, baseY, w, h, tip) {
    g.beginPath();
    g.moveTo(x - w / 2, baseY); g.lineTo(x - w * 0.34, baseY - h); g.lineTo(x, baseY - h - w * 0.55);
    g.lineTo(x + w * 0.34, baseY - h); g.lineTo(x + w / 2, baseY); g.closePath(); g.fill();
    if (tip) {
      const fs = g.fillStyle;
      g.fillStyle = tip;
      g.beginPath(); g.moveTo(x - w * 0.34, baseY - h); g.lineTo(x, baseY - h - w * 0.55); g.lineTo(x + w * 0.34, baseY - h); g.closePath(); g.fill();
      g.fillStyle = fs;
    }
  }

  // temple gateway: two battered towers with a cavetto cornice and a gate between them
  function pylon(g, cx, baseY, w, h, trim) {
    const tw = w * 0.4;
    for (const s of [-1, 1]) {
      const x0 = cx + s * (w * 0.1), x1 = cx + s * (w * 0.1 + tw);
      g.beginPath();
      g.moveTo(Math.min(x0, x1), baseY);
      g.lineTo(Math.max(x0, x1), baseY);
      g.lineTo(Math.max(x0, x1) - s * tw * 0.12 * (s > 0 ? 1 : -1), baseY - h);
      g.lineTo(Math.min(x0, x1) + s * tw * 0.12 * (s > 0 ? -1 : 1), baseY - h);
      g.closePath(); g.fill();
      // cornice lip
      g.fillRect(Math.min(x0, x1) - 6 + (s > 0 ? tw * 0.1 : 0), baseY - h - 18, tw * 0.92, 18);
    }
    // gate + lintel
    g.fillRect(cx - w * 0.12, baseY - h * 0.62, w * 0.24, h * 0.62);
    g.fillRect(cx - w * 0.16, baseY - h * 0.68, w * 0.32, h * 0.08);
    if (trim) {
      const fs = g.fillStyle;
      g.fillStyle = trim;
      for (const s of [-1, 1]) {
        const x0 = cx + s * (w * 0.1 + tw * 0.5);
        g.fillRect(x0 - tw * 0.34, baseY - h * 0.9, tw * 0.68, 4);
        g.fillRect(x0 - tw * 0.3, baseY - h * 0.5, tw * 0.6, 3);
      }
      // winged sun disc above the gate
      g.beginPath(); g.arc(cx, baseY - h * 0.64, h * 0.025, 0, SA.TAU); g.fill();
      g.fillRect(cx - w * 0.1, baseY - h * 0.645, w * 0.2, 3);
      g.fillStyle = fs;
    }
  }

  // papyrus column: shaft with bands, flared capital, abacus
  function column(g, x, baseY, w, h, bands) {
    g.fillRect(x - w / 2, baseY - h, w, h);
    g.beginPath();
    g.moveTo(x - w * 0.5, baseY - h);
    g.quadraticCurveTo(x - w * 0.95, baseY - h - w * 0.35, x - w * 0.85, baseY - h - w * 0.75);
    g.lineTo(x + w * 0.85, baseY - h - w * 0.75);
    g.quadraticCurveTo(x + w * 0.95, baseY - h - w * 0.35, x + w * 0.5, baseY - h);
    g.closePath(); g.fill();
    g.fillRect(x - w * 0.6, baseY - h - w * 0.95, w * 1.2, w * 0.22);
    g.fillRect(x - w * 0.62, baseY - w * 0.18, w * 1.24, w * 0.18);
    if (bands) {
      const fs = g.fillStyle;
      g.fillStyle = bands;
      for (let i = 0; i < 3; i++) g.fillRect(x - w / 2, baseY - h + 8 + i * 10, w, 4);
      g.fillRect(x - w / 2, baseY - h * 0.45, w, 3);
      g.fillStyle = fs;
    }
  }

  function palm(g, rng, x, baseY, h, lean) {
    const l = lean === undefined ? (rng() - 0.5) * 0.5 : lean;
    const tx = x + h * l, ty = baseY - h;
    g.lineCap = 'round';
    g.lineWidth = h * 0.045;
    g.strokeStyle = g.fillStyle;
    g.beginPath(); g.moveTo(x, baseY); g.quadraticCurveTo(x + h * l * 0.2, baseY - h * 0.55, tx, ty); g.stroke();
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.42 + (rng() - 0.5) * 0.2;
      const len = h * (0.36 + rng() * 0.16);
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.5 + len * 0.35;
      g.lineWidth = h * 0.02;
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.6 - len * 0.1, ex, ey); g.stroke();
      g.lineWidth = h * 0.008;
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        const px = tx + (ex - tx) * t, py = ty + (ey - ty) * t - Math.sin(t * Math.PI) * len * 0.12;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + (rng() - 0.3) * 18, py + 14 + rng() * 10); g.stroke();
      }
    }
  }

  // small glyph shapes for wall reliefs and floating magic (drawn with the current stroke/fill style)
  function glyph(g, kind, x, y, s) {
    g.beginPath();
    switch (kind % 8) {
      case 0: g.arc(x, y - s * 0.55, s * 0.28, 0, SA.TAU); g.moveTo(x, y - s * 0.27); g.lineTo(x, y + s * 0.5); g.moveTo(x - s * 0.3, y - s * 0.1); g.lineTo(x + s * 0.3, y - s * 0.1); break;  // ankh
      case 1: g.ellipse(x, y, s * 0.45, s * 0.2, 0, 0, SA.TAU); g.moveTo(x + s * 0.12, y); g.arc(x, y, s * 0.1, 0, SA.TAU); g.moveTo(x - s * 0.1, y + s * 0.2); g.lineTo(x - s * 0.3, y + s * 0.5); break; // eye
      case 2: g.moveTo(x - s * 0.5, y); for (let i = 0; i < 4; i++) g.lineTo(x - s * 0.5 + (i + 0.5) * s * 0.25, y + (i % 2 ? -1 : 1) * s * 0.15); g.lineTo(x + s * 0.5, y); break; // water
      case 3: g.ellipse(x, y, s * 0.18, s * 0.5, 0, 0, SA.TAU); break;                      // feather
      case 4: g.ellipse(x, y, s * 0.3, s * 0.4, 0, 0, SA.TAU); g.moveTo(x, y - s * 0.4); g.lineTo(x, y + s * 0.4); break; // scarab
      case 5: g.arc(x, y, s * 0.32, 0, SA.TAU); g.moveTo(x + s * 0.08, y); g.arc(x, y, s * 0.08, 0, SA.TAU); break;      // sun
      case 6: g.moveTo(x - s * 0.4, y + s * 0.4); g.lineTo(x - s * 0.1, y - s * 0.3); g.lineTo(x + s * 0.3, y - s * 0.4); g.moveTo(x - s * 0.1, y - s * 0.3); g.lineTo(x + s * 0.4, y + s * 0.2); break; // bird
      default: g.moveTo(x - s * 0.3, y + s * 0.5); g.lineTo(x - s * 0.3, y - s * 0.5); g.lineTo(x + s * 0.3, y - s * 0.5); g.lineTo(x + s * 0.3, y + s * 0.5); break; // shrine
    }
    g.stroke();
  }

  function glyphPanel(g, rng, x, y, w, h, color, s) {
    const sz = s || 22;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, sz * 0.09);
    g.lineCap = 'round';
    for (let cx = x + sz * 0.6; cx < x + w - sz * 0.4; cx += sz * 1.25) {
      g.beginPath(); g.moveTo(cx - sz * 0.62, y); g.lineTo(cx - sz * 0.62, y + h); g.stroke();       // column rule
      for (let cy = y + sz * 0.7; cy < y + h - sz * 0.4; cy += sz * 1.15) glyph(g, Math.floor(rng() * 8), cx, cy, sz);
    }
    g.restore();
  }

  // statues (silhouettes in the current fill style)
  function seatedStatue(g, x, baseY, s, head) {
    g.fillRect(x - 70 * s, baseY - 120 * s, 140 * s, 120 * s);                  // throne
    g.fillRect(x - 46 * s, baseY - 260 * s, 92 * s, 150 * s);                   // torso
    g.fillRect(x - 60 * s, baseY - 140 * s, 140 * s, 40 * s);                   // lap
    g.fillRect(x + 40 * s, baseY - 140 * s, 36 * s, 140 * s);                   // shins
    const hy = baseY - 300 * s;
    g.beginPath(); g.arc(x, hy, 36 * s, 0, SA.TAU); g.fill();
    headShape(g, x, hy, s, head);
  }

  function standingGod(g, x, baseY, s, head, staff) {
    g.fillRect(x - 30 * s, baseY - 170 * s, 24 * s, 170 * s);
    g.fillRect(x + 6 * s, baseY - 170 * s, 24 * s, 170 * s);
    g.beginPath(); g.moveTo(x - 50 * s, baseY - 170 * s); g.lineTo(x + 50 * s, baseY - 170 * s); g.lineTo(x + 40 * s, baseY - 330 * s); g.lineTo(x - 40 * s, baseY - 330 * s); g.closePath(); g.fill();
    g.fillRect(x - 58 * s, baseY - 340 * s, 116 * s, 30 * s);
    const hy = baseY - 370 * s;
    g.beginPath(); g.arc(x, hy, 30 * s, 0, SA.TAU); g.fill();
    headShape(g, x, hy, s, head);
    if (staff) { g.fillRect(x + 70 * s, baseY - 430 * s, 10 * s, 430 * s); g.fillRect(x + 56 * s, baseY - 440 * s, 38 * s, 12 * s); }
  }

  function headShape(g, x, hy, s, head) {
    g.beginPath();
    if (head === 'jackal') {
      g.moveTo(x + 10 * s, hy - 6 * s); g.lineTo(x + 78 * s, hy + 6 * s); g.lineTo(x + 70 * s, hy + 18 * s); g.lineTo(x + 10 * s, hy + 18 * s);
      g.moveTo(x - 20 * s, hy - 20 * s); g.lineTo(x - 12 * s, hy - 90 * s); g.lineTo(x + 6 * s, hy - 24 * s);
      g.moveTo(x + 4 * s, hy - 22 * s); g.lineTo(x + 18 * s, hy - 92 * s); g.lineTo(x + 28 * s, hy - 20 * s);
    } else if (head === 'falcon') {
      g.moveTo(x + 20 * s, hy - 10 * s); g.lineTo(x + 58 * s, hy + 6 * s); g.lineTo(x + 30 * s, hy + 22 * s);
      g.moveTo(x + 44 * s, hy - 60 * s); g.arc(x, hy - 60 * s, 44 * s, 0, SA.TAU);                // sun disc
    } else if (head === 'set') {
      g.moveTo(x + 14 * s, hy); g.lineTo(x + 70 * s, hy + 22 * s); g.lineTo(x + 60 * s, hy + 32 * s); g.lineTo(x + 10 * s, hy + 18 * s);
      g.rect(x - 22 * s, hy - 86 * s, 14 * s, 60 * s); g.rect(x + 2 * s, hy - 86 * s, 14 * s, 60 * s);
    } else if (head === 'lion') {
      g.arc(x - 8 * s, hy + 4 * s, 58 * s, 0, SA.TAU);
    } else {
      // pharaoh nemes + beard
      g.moveTo(x - 58 * s, hy + 60 * s); g.lineTo(x - 40 * s, hy - 40 * s); g.lineTo(x + 40 * s, hy - 40 * s); g.lineTo(x + 58 * s, hy + 60 * s);
      g.rect(x - 6 * s, hy + 30 * s, 12 * s, 36 * s);
    }
    g.fill();
  }

  // recumbent jackal (Anubis) on a shrine chest
  function jackalShrine(g, x, baseY, s) {
    g.fillRect(x - 110 * s, baseY - 90 * s, 220 * s, 90 * s);
    g.fillRect(x - 124 * s, baseY - 100 * s, 248 * s, 14 * s);
    g.beginPath();
    g.moveTo(x - 100 * s, baseY - 100 * s); g.quadraticCurveTo(x - 90 * s, baseY - 170 * s, x + 20 * s, baseY - 160 * s);
    g.lineTo(x + 60 * s, baseY - 230 * s); g.lineTo(x + 70 * s, baseY - 300 * s); g.lineTo(x + 84 * s, baseY - 236 * s);
    g.lineTo(x + 96 * s, baseY - 300 * s); g.lineTo(x + 104 * s, baseY - 228 * s); g.lineTo(x + 160 * s, baseY - 206 * s);
    g.lineTo(x + 150 * s, baseY - 190 * s); g.lineTo(x + 96 * s, baseY - 180 * s); g.lineTo(x + 90 * s, baseY - 100 * s);
    g.closePath(); g.fill();
  }

  // brazier / torch with a live flickering light registered on the arena
  function brazier(g, a, x, baseY, s, color, p) {
    g.fillRect(x - 4 * s, baseY - 90 * s, 8 * s, 90 * s);
    g.fillRect(x - 26 * s, baseY - 8 * s, 52 * s, 8 * s);
    g.beginPath(); g.moveTo(x - 34 * s, baseY - 110 * s); g.lineTo(x + 34 * s, baseY - 110 * s); g.lineTo(x + 20 * s, baseY - 88 * s); g.lineTo(x - 20 * s, baseY - 88 * s); g.closePath(); g.fill();
    flame(g, x, baseY - 110 * s, s, color);
    a.lights.push({ x: x - LW / 2, y: baseY - GY - 130 * s, p, color, r: 170 * s });
  }
  function torch(g, a, x, y, s, color, p) {
    g.fillRect(x - 5 * s, y, 10 * s, 50 * s);
    g.fillRect(x - 12 * s, y, 24 * s, 8 * s);
    flame(g, x, y, s * 0.7, color);
    a.lights.push({ x: x - LW / 2, y: y - GY - 20 * s, p, color, r: 130 * s });
  }
  function flame(g, x, y, s, color) {
    const fs = g.fillStyle;
    g.globalCompositeOperation = 'lighter';
    g.drawImage(SA.glowSprite(color), x - 80 * s, y - 100 * s, 160 * s, 160 * s);
    g.globalCompositeOperation = 'source-over';
    // tongue of fire: deep orange outside, yellow-white core
    const gr = g.createLinearGradient(0, y, 0, y - 56 * s);
    gr.addColorStop(0, '#ff6a14'); gr.addColorStop(0.6, color); gr.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - 17 * s, y);
    g.quadraticCurveTo(x - 20 * s, y - 26 * s, x - 3 * s, y - 58 * s);
    g.quadraticCurveTo(x + 2 * s, y - 34 * s, x + 9 * s, y - 44 * s);
    g.quadraticCurveTo(x + 22 * s, y - 20 * s, x + 17 * s, y);
    g.closePath(); g.fill();
    g.fillStyle = '#fff2c8';
    g.beginPath(); g.moveTo(x - 7 * s, y); g.quadraticCurveTo(x - 4 * s, y - 20 * s, x + 1 * s, y - 28 * s); g.quadraticCurveTo(x + 8 * s, y - 14 * s, x + 7 * s, y); g.closePath(); g.fill();
    g.fillStyle = fs;
  }

  // ---------- arena registry (filled by arenas_egypt.js) ----------
  const DEFS = {};
  SA.ARENA_ORDER = [];
  SA.ARENAS = DEFS;
  SA.ArenaPaint = {
    ridge, dunes, mistBand, glowAt, pyramid, obelisk, pylon, column, palm, glyph, glyphPanel,
    seatedStatue, standingGod, headShape, jackalShrine, brazier, torch, flame, LW, LH, GY, GW, GH,
  };

  // ---------- runtime ----------
  class Arena {
    constructor(id) {
      this.def = DEFS[id] || DEFS[(SA.ARENA_RENAME || {})[id]] || DEFS[SA.ARENA_ORDER[0]];
      this.id = this.def.id;
      this.name = this.def.name;
      this.rims = this.def.rims;
      this.wind = this.def.wind;
      this.reflective = !!this.def.reflective;
      this.t = 0;
      this.built = false;
      this.weather = [];
      this.splashes = [];
      this.lights = [];
      this.flashA = 0;
      this.boltT = 2 + Math.random() * 3;
      this.bolt = null;
    }

    build() {
      if (this.built) return;
      const d = this.def;
      this.lights = [];
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
      d.ground.call(this, g, SA.M.seeded(55), this);
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
      gr.addColorStop(1, this.def.vignette || 'rgba(0,0,0,0.55)');
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
      // lightning (chaos desert, Set)
      if (this.def.lightning || this.forceLightning) {
        this.boltT -= dt;
        this.flashA = Math.max(0, this.flashA - dt * 3.2);
        if (this.boltT <= 0) {
          this.boltT = (this.forceLightning ? 1.2 : 2.5) + Math.random() * 4;
          this.flashA = 1;
          const pts = [];
          let x = rand(SA.W * 0.1, SA.W * 0.9), y = -20;
          while (y < SA.H * 0.55) { pts.push([x, y]); x += rand(-60, 60); y += rand(30, 70); }
          this.bolt = { pts, life: 0.25 };
          SA.audio && SA.audio.play && SA.audio.play('thunder', 0.5);
        }
        if (this.bolt) { this.bolt.life -= dt; if (this.bolt.life <= 0) this.bolt = null; }
      }
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
      if (this.bolt) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(230,220,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        this.bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      for (const L of this.layers) this.drawLayer(ctx, L, cam);
      this.drawLiveLights(ctx, cam);
    }

    drawLiveLights(ctx, cam) {
      ctx.globalCompositeOperation = 'lighter';
      // flickering fire light (torches, braziers)
      this.lights.forEach((L, i) => {
        const f = this.xf(cam, L.p);
        const fl = 0.6 + 0.22 * Math.sin(this.t * 9 + i * 2.1) + 0.18 * Math.sin(this.t * 23 + i);
        const s = f.z * L.r;
        ctx.globalAlpha = clamp(fl, 0, 1) * (L.a || 0.7);
        ctx.drawImage(SA.glowSprite(L.color), f.cx + L.x * f.z - s, f.gy + L.y * f.z - s, s * 2, s * 2);
      });
      // moonlight / sunlight shimmer on water
      const W = this.def.water;
      if (W) {
        const f = this.xf(cam, W.p);
        const cx = f.cx + W.x * f.z;
        for (let i = 0; i < 9; i++) {
          const y = f.gy + (W.y + i * W.step) * f.z;
          const w = (W.w - i * 8 + Math.sin(this.t * 2.2 + i * 1.7) * 18) * f.z;
          ctx.globalAlpha = (0.32 - i * 0.025) * (0.75 + 0.25 * Math.sin(this.t * 3 + i));
          ctx.fillStyle = W.color;
          ctx.fillRect(cx - w / 2 + Math.sin(this.t * 1.3 + i) * 8, y, w, 3 * f.z);
        }
      }
      // god rays from the sun
      const R = this.def.rays;
      if (this.sun && R && (!SA.GFX || SA.GFX.rays)) {
        ctx.globalAlpha = R.alpha;
        ctx.fillStyle = R.color;
        for (let i = 0; i < R.n; i++) {
          const a = R.from + i * R.step + Math.sin(this.t * 0.2 + i) * 0.04;
          ctx.beginPath();
          ctx.moveTo(this.sun.x, this.sun.y);
          ctx.lineTo(this.sun.x + Math.cos(a) * 2400, this.sun.y + Math.sin(a) * 2400);
          ctx.lineTo(this.sun.x + Math.cos(a + R.width) * 2400, this.sun.y + Math.sin(a + R.width) * 2400);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // world space (camera applied): ground plane
    drawGround(ctx, cam) {
      ctx.drawImage(this.groundCanvas, -GW / 2, 0, GW, GH);
      // live floor glow from the braziers on polished floors
      if (this.def.floorGlow && this.lights.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const L of this.lights) {
          if (L.p < 0.6) continue;
          const x = L.x * (1 / L.p) * 0.9;
          ctx.globalAlpha = 0.12 + 0.05 * Math.sin(this.t * 8 + x);
          ctx.drawImage(SA.glowSprite(L.color, 0.2), x - 160, -10, 320, 120);
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
      if (this.flashA > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(210,200,255,${this.flashA * 0.22})`;
        ctx.fillRect(0, 0, SA.W, SA.H);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // ---------- weather ----------
    weatherTypes() {
      const w = this.def.weather;
      return Array.isArray(w) ? w : w ? [w] : [];
    }

    initWeather() {
      this.weather = [];
      const BASE = { leaves: 46, fireflies: 40, rain: 320, embers: 90, snow: 180, dust: 60, data: 70, sand: 130, sandstorm: 240, glyphs: 26, motes: 50, scarabs: 12 };
      for (const w of this.weatherTypes()) {
        const n = Math.round((BASE[w] || 0) * ((SA.GFX && SA.GFX.weather) || 1));
        for (let i = 0; i < n; i++) this.weather.push(this.newParticle(w, true));
      }
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
        p.color = SA.M.pick(['#c2a03e', '#8a6a2a', '#6a8a3a']);
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
      } else if (type === 'dust' || type === 'data' || type === 'motes' || type === 'glyphs') {
        p.x = rand(-1400, 1400);
        p.y = scatter ? rand(-900, 0) : rand(-60, 20);
        p.vx = rand(-20, 20); p.vy = type === 'data' ? -rand(40, 120) : type === 'motes' ? -rand(20, 60) : type === 'glyphs' ? -rand(12, 30) : -rand(5, 25);
        p.size = rand(2, 5) * (0.6 + p.depth);
        p.ph = rand(0, 10);
        p.kind = Math.floor(rand(0, 8));
        p.front = p.depth > 0.85;
      } else if (type === 'sand' || type === 'sandstorm') {
        const storm = type === 'sandstorm';
        p.x = rand(-1600, 1600);
        p.y = scatter ? -Math.pow(Math.random(), 1.8) * (storm ? 900 : 600) : -Math.pow(Math.random(), 1.8) * 600;
        p.vx = -(storm ? rand(700, 1300) : rand(160, 420)) * (0.5 + p.depth);
        p.vy = rand(-20, 30);
        p.len = (storm ? 30 : 10) * (0.5 + p.depth);
        p.size = rand(1.2, 2.6) * (0.6 + p.depth);
        p.ph = rand(0, 10);
        p.front = p.depth > 0.8;
      } else if (type === 'scarabs') {
        p.x = rand(-1200, 1200);
        p.y = rand(8, 90);
        p.dir = Math.random() < 0.5 ? -1 : 1;
        p.v = rand(20, 55);
        p.ph = rand(0, 10);
        p.front = false;
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
      for (let i = 0; i < this.weather.length; i++) {
        const p = this.weather[i];
        const w = p.type;
        if (w === 'rain') {
          p.y += p.v * dt;
          p.x += this.wind * 2 * dt;
          if (p.y > SA.H + 50) this.weather[i] = this.newParticle(w, false);
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
        } else if (w === 'dust' || w === 'data' || w === 'motes' || w === 'glyphs') {
          p.ph += dt;
          p.x += (p.vx + Math.sin(p.ph) * 12) * dt;
          p.y += p.vy * dt;
          if (p.y < -1000) this.weather[i] = this.newParticle(w, false);
        } else if (w === 'sand' || w === 'sandstorm') {
          p.ph += dt;
          p.x += (p.vx + this.wind * 0.3) * dt;
          p.y += (p.vy + Math.sin(p.ph * 2.3) * 24) * dt;
          if (p.x < -1800 || p.x > 1800) { const q = this.newParticle(w, false); q.x = p.vx < 0 ? 1700 : -1700; this.weather[i] = q; }
        } else if (w === 'scarabs') {
          p.ph += dt * 12;
          p.x += p.dir * p.v * dt;
          if (Math.random() < 0.004) p.dir = -p.dir;
          if (Math.abs(p.x) > 1400) p.dir = -Math.sign(p.x);
        } else if (w === 'embers') {
          p.ph += dt;
          p.x += (p.vx + Math.sin(p.ph * 3) * 30 + this.wind * 0.3) * dt;
          p.y += p.vy * dt;
          if (p.y < -1200 || p.y > 20 || Math.abs(p.x) > 1600) this.weather[i] = this.newParticle(w, false);
        }
      }
    }

    // world-space weather (called with camera transform)
    drawWeatherWorld(ctx, front) {
      const sandCol = this.def.sandColor || '#e8c58a';
      for (const p of this.weather) {
        if (!!p.front !== front) continue;
        const w = p.type;
        if (w === 'leaves') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.55 + 0.45 * Math.sin(p.rot * 2));
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, SA.TAU); ctx.fill();
          ctx.restore();
        } else if (w === 'snow') {
          ctx.fillStyle = '#f2f7ff';
          ctx.globalAlpha = 0.55 + p.depth * 0.4;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, SA.TAU); ctx.fill();
        } else if (w === 'sand' || w === 'sandstorm') {
          ctx.strokeStyle = sandCol;
          ctx.globalAlpha = (w === 'sandstorm' ? 0.45 : 0.35) * (0.5 + p.depth * 0.5);
          ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02 - p.len, p.y); ctx.stroke();
        } else if (w === 'scarabs') {
          // small beetles scuttling over the floor
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = this.def.scarabColor || '#0e1a18';
          ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.dir, 1);
          ctx.beginPath(); ctx.ellipse(0, -5, 9, 5, 0, 0, SA.TAU); ctx.fill();
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
          for (let k = -1; k <= 1; k++) {
            const l = Math.sin(p.ph + k) * 3;
            ctx.beginPath(); ctx.moveTo(k * 4, -3); ctx.lineTo(k * 4 + l, 2); ctx.stroke();
          }
          ctx.fillStyle = '#35f0c8'; ctx.globalAlpha = 0.5;
          ctx.fillRect(-2, -8, 4, 2);
          ctx.restore();
        } else if (w === 'dust' || w === 'data' || w === 'motes' || w === 'glyphs') {
          ctx.globalCompositeOperation = 'lighter';
          if (w === 'glyphs') {
            ctx.globalAlpha = 0.25 + 0.35 * Math.max(0, Math.sin(p.ph * 1.5));
            ctx.strokeStyle = this.def.glyphColor || '#ffd27a';
            ctx.lineWidth = 2;
            glyph(ctx, p.kind, p.x, p.y, 14 + p.depth * 14);
          } else {
            const col = w === 'data' ? '#35f0ff' : w === 'motes' ? (this.def.moteColor || '#8fffb0') : (this.def.dustColor || '#ffe6a0');
            ctx.globalAlpha = (0.25 + 0.35 * Math.max(0, Math.sin(p.ph * 2))) * (w === 'motes' ? 1.3 : 1);
            const s = p.size * (w === 'motes' ? 4 : 3);
            ctx.drawImage(SA.glowSprite(col), p.x - s, p.y - s, s * 2, s * 2);
          }
          ctx.globalCompositeOperation = 'source-over';
        } else if (w === 'fireflies') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(p.ph * 3));
          ctx.drawImage(SA.glowSprite(this.def.fireflyColor || '#d8ff8a'), p.x - 14, p.y - 14, 28, 28);
          ctx.globalCompositeOperation = 'source-over';
        } else if (w === 'embers') {
          if (p.ash) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#6a5a55';
            ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
          } else {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(p.ph * 6);
            const s = p.size * 4;
            ctx.drawImage(SA.glowSprite('#ff8a2a'), p.x - s, p.y - s, s * 2, s * 2);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
      ctx.globalAlpha = 1;
      // ground mist
      if (this.def.groundMist) {
        const m = this.def.groundMist;
        for (let i = 0; i < 6; i++) {
          if ((i % 3 === 0) !== front) continue;
          const x = ((i * 520 + this.t * (18 + i * 5)) % 3200) - 1600;
          ctx.globalAlpha = front ? m.a * 0.6 : m.a;
          ctx.drawImage(SA.glowSprite(m.color, 0.4), x - 500, -140, 1000, 220);
        }
        ctx.globalAlpha = 1;
      }
    }

    // screen-space weather in front of everything (rain streaks, sandstorm haze bands)
    drawWeather(ctx, cam, front) {
      const types = this.weatherTypes();
      if (types.indexOf('sandstorm') >= 0) {
        SA.resetTransform(ctx);
        const col = this.def.sandColor || '#e8c58a';
        for (let i = 0; i < 4; i++) {
          const x = ((-this.t * (260 + i * 90) + i * 700) % (SA.W + 1600)) + SA.W + 800;
          ctx.globalAlpha = 0.08 + 0.04 * Math.sin(this.t + i);
          ctx.drawImage(SA.glowSprite(col, 0.3), (x % (SA.W + 1600)) - 800, SA.H * (0.35 + i * 0.12), 1400, 260);
        }
        ctx.globalAlpha = 1;
      }
      if (types.indexOf('rain') < 0) return;
      SA.resetTransform(ctx);
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? 'rgba(210,200,255,0.42)' : 'rgba(170,150,230,0.22)';
        ctx.lineWidth = pass ? 2 : 1;
        ctx.beginPath();
        for (const p of this.weather) {
          if (p.type !== 'rain' || (p.depth > 0.6) !== !!pass) continue;
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
