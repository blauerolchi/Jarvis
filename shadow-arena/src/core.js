'use strict';
/*
 * Shared namespace, constants and math helpers.
 * The game uses classic scripts (no ES modules) so that index.html runs directly from file://.
 */
window.SA = window.SA || {};

(function (SA) {
  // Logical canvas: always 1080 high. 16:9 / 16:10 screens use 1920 wide; wider phone screens
  // (19.5:9, 20:9 …) get a wider logical canvas so the game fills the whole display instead of
  // being letterboxed. Decided once at load from the landscape aspect (rotation never changes it).
  (function () {
    const a = Math.max(screen.width || 16, screen.height || 9) / Math.max(1, Math.min(screen.width || 16, screen.height || 9));
    const vw = Math.max(window.innerWidth || 16, window.innerHeight || 9) / Math.max(1, Math.min(window.innerWidth || 16, window.innerHeight || 9));
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    const asp = touch ? Math.max(a, vw) : vw;
    SA.W = Math.round(Math.min(2.2, Math.max(16 / 9, asp)) * 1080 / 2) * 2;
  })();
  SA.H = 1080;
  SA.STEP = 1 / 60;            // fixed simulation step; all frame data is in 60 fps frames
  SA.ARENA_HALF = 1250;        // world x range is [-ARENA_HALF, ARENA_HALF], ground is y = 0 (up is negative)
  SA.WALL = SA.ARENA_HALF - 70;
  SA.MAX_SEPARATION = 1150;    // camera wall: fighters can never be further apart than this
  SA.GRAVITY = 3400;
  SA.BUFFER_FRAMES = 10;        // input buffer window (150 ms): early presses fire the moment it's possible
  SA.PARRY_WINDOW = 9;         // block pressed at most this many frames before the hit = parry
  SA.GROUND_SCREEN = 0.83;     // ground line sits at 83% of screen height
  SA.TAU = Math.PI * 2;

  SA.M = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    invLerp: (a, b, v) => (b === a ? 0 : (v - a) / (b - a)),
    damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    sign: (v) => (v < 0 ? -1 : 1),
    approach(v, target, delta) {
      if (v < target) return Math.min(v + delta, target);
      return Math.max(v - delta, target);
    },
    smooth: (t) => t * t * (3 - 2 * t),
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInCubic: (t) => t * t * t,
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    // options: [[weight, value], ...]
    weighted(options) {
      let total = 0;
      for (const o of options) total += Math.max(0, o[0]);
      let r = Math.random() * total;
      for (const o of options) {
        r -= Math.max(0, o[0]);
        if (r <= 0) return o[1];
      }
      return options[options.length - 1][1];
    },
    overlap: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
    intersect(a, b) {
      const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
      const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
      return w > 0 && h > 0 ? { x, y, w, h } : null;
    },
    // Deterministic PRNG so procedural backgrounds look the same every time.
    seeded(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    // cheap smooth 1D noise for camera shake / sway
    noise1(x) {
      const i = Math.floor(x), f = x - i;
      const h = (n) => {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return (s - Math.floor(s)) * 2 - 1;
      };
      const u = f * f * (3 - 2 * f);
      return h(i) * (1 - u) + h(i + 1) * u;
    },
  };

  // All drawing uses 1920x1080 logical coordinates; the backing canvas may be smaller (render scale).
  SA.resetTransform = function (ctx) {
    const q = ctx.canvas.width / SA.W;
    ctx.setTransform(q, 0, 0, q, 0, 0);
  };

  SA.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };

  // Cached radial glow sprites, tinted per color. Much cheaper than shadowBlur at runtime.
  const glowCache = new Map();
  SA.glowSprite = function (color, hardness) {
    const key = color + '|' + (hardness || 0);
    let c = glowCache.get(key);
    if (c) return c;
    c = SA.makeCanvas(128, 128);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, color);
    grad.addColorStop(hardness || 0.25, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 1;
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowCache.set(key, c);
    return c;
  };

  // lighten (amt > 0) or darken (amt < 0) a #rrggbb color
  SA.M.shade = function (hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
    const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  };

  SA.rgba = function (hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // Device helpers: touch detection, fullscreen, orientation, haptics.
  SA.Device = {
    isTouch: ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0,
    // phone: a touch screen whose short side is small. Same controls as the tablet, scaled up.
    isPhone: (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0) &&
      Math.min(screen.width || 9999, screen.height || 9999) < 560,
    get isPortrait() { return window.innerHeight > window.innerWidth * 1.05; },
    get isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
    get canFullscreen() {
      const d = document.documentElement;
      return !!(d.requestFullscreen || d.webkitRequestFullscreen);
    },
    // the browser allows it here (an embedded preview / iframe without permission does not)
    get fullscreenAllowed() { return document.fullscreenEnabled !== false || !!document.webkitFullscreenEnabled; },
    toggleFullscreen() {
      if (!this.fullscreenAllowed) { this.fsBlockedT = performance.now(); return; }
      try {
        if (this.isFullscreen) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
          return;
        }
        const d = document.documentElement;
        const req = d.requestFullscreen || d.webkitRequestFullscreen;
        const p = req.call(d, { navigationUI: 'hide' });
        const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } };
        if (p && p.then) p.then(lock).catch(() => { this.fsBlockedT = performance.now(); }); else lock();
      } catch (e) { this.fsBlockedT = performance.now(); /* fullscreen not available (e.g. inside an iframe) */ }
    },
    vibrate(pattern) {
      if (!SA.Save || !SA.Save.data.settings.vibration) return;
      try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ }
    },
  };

  SA.FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
  SA.FONT_TITLE = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
})(window.SA);
