'use strict';
/* Dynamic fighting-game camera: frames both fighters, zooms with distance, shakes and punches. */
(function (SA) {
  const { clamp, damp, noise1 } = SA.M;

  class Camera {
    constructor() {
      this.x = 0;
      this.zoom = 1;
      this.y = this.baseY(1);
      this.trauma = 0;
      this.zoomKick = 0;
      this.focus = null;       // {x, y, zoom} cinematic override (KO)
      this.shakeEnabled = true;
      this.t = 0;
      this.sx = 0; this.sy = 0; this.sr = 0;
      this.lead = 0;           // look-ahead in the direction of fast movement (dashes, sprints)
      this.speedZoom = 0;      // zooms out a little while someone sprints
    }

    baseY(zoom) {
      return -(SA.GROUND_SCREEN - 0.5) * SA.H / zoom;
    }

    snap(a, b) {
      this.x = (a.x + b.x) / 2;
      this.zoom = this.targetZoom(Math.abs(a.x - b.x));
      this.y = this.baseY(this.zoom);
      this.lead = 0; this.speedZoom = 0;
      this.snapshotRender();
    }

    targetZoom(dist) {
      return clamp(1.42 - (dist - 160) / 1000 * 0.62, 0.84, 1.36);
    }

    update(dt, a, b) {
      this.t += dt;
      let tx, tz, ty;
      if (this.focus) {
        tx = this.focus.x;
        tz = this.focus.zoom;
        ty = this.baseY(tz) + (this.focus.y || 0);
      } else {
        // lead: the camera drifts ahead of a dashing / sprinting fighter, so the move feels fast
        let lead = 0, fast = 0;
        for (const f of [a, b]) {
          const st = f.state;
          if (st === 'dash' || st === 'sprint' || st === 'run' || st === 'roll' || (st === 'bossmove' && Math.abs(f.vx) > 1200)) lead += clamp(f.vx * 0.06, -110, 110);
          if (st === 'sprint' || (st === 'dash' && Math.abs(f.vx) > 1200)) fast = Math.max(fast, 1);
          else if (st === 'run') fast = Math.max(fast, 0.5);
        }
        this.lead = damp(this.lead, clamp(lead, -130, 130), 4, dt);
        this.speedZoom = damp(this.speedZoom, fast, 3, dt);
        tx = (a.x + b.x) / 2 + this.lead;
        tz = this.targetZoom(Math.abs(a.x - b.x)) - this.speedZoom * 0.05;
        const top = Math.min(a.y, b.y);
        if (top < -220) tz -= Math.min(0.18, (-220 - top) / 2000);
        ty = this.baseY(tz) + Math.min(0, top + 220) * 0.35;
      }
      const k = this.focus ? 5 : 7;
      this.x = damp(this.x, tx, k, dt);
      this.zoom = damp(this.zoom, tz, this.focus ? 4 : 3.2, dt);
      this.y = damp(this.y, ty, 6, dt);

      this.zoomKick = damp(this.zoomKick, 0, 9, dt);
      this.trauma = Math.max(0, this.trauma - dt * 1.7);

      const z = this.viewZoom();
      const half = SA.W / 2 / z;
      this.x = clamp(this.x, -SA.ARENA_HALF + half, SA.ARENA_HALF - half);

      const s = this.shakeEnabled ? this.trauma * this.trauma : 0;
      this.sx = s * 38 * noise1(this.t * 32);
      this.sy = s * 30 * noise1(this.t * 32 + 100);
      this.sr = s * 0.025 * noise1(this.t * 24 + 200);
    }

    viewZoom() { return this.zoom + this.zoomKick; }

    // render interpolation (see Fighter.beginRender): previous tick -> current tick
    snapshotRender() {
      this._p = this._p || {};
      const p = this._p;
      p.x = this.x; p.y = this.y; p.zoom = this.zoom; p.zk = this.zoomKick; p.sx = this.sx; p.sy = this.sy; p.sr = this.sr;
    }
    beginRender(a) {
      const p = this._p;
      this._on = !!p && a < 1;
      if (!this._on) return;
      const c = this._c || (this._c = {});
      c.x = this.x; c.y = this.y; c.zoom = this.zoom; c.zk = this.zoomKick; c.sx = this.sx; c.sy = this.sy; c.sr = this.sr;
      const L = (u, v) => u + (v - u) * a;
      this.x = L(p.x, c.x); this.y = L(p.y, c.y); this.zoom = L(p.zoom, c.zoom); this.zoomKick = L(p.zk, c.zk);
      this.sx = L(p.sx, c.sx); this.sy = L(p.sy, c.sy); this.sr = L(p.sr, c.sr);
    }
    endRender() {
      if (!this._on) return;
      const c = this._c;
      this.x = c.x; this.y = c.y; this.zoom = c.zoom; this.zoomKick = c.zk; this.sx = c.sx; this.sy = c.sy; this.sr = c.sr;
      this._on = false;
    }

    addTrauma(v) { this.trauma = clamp(this.trauma + v, 0, 1); }
    punch(v) { this.zoomKick = Math.min(0.2, this.zoomKick + v); }

    // Ground line in screen space (used by parallax layers).
    groundScreenY() {
      return SA.H / 2 + (0 - this.y) * this.viewZoom() + this.sy;
    }

    apply(ctx) {
      const z = this.viewZoom();
      SA.resetTransform(ctx);
      ctx.translate(SA.W / 2 + this.sx, SA.H / 2 + this.sy);
      if (this.sr) ctx.rotate(this.sr);
      ctx.scale(z, z);
      ctx.translate(-this.x, -this.y);
    }

    worldToScreen(x, y) {
      const z = this.viewZoom();
      return { x: SA.W / 2 + (x - this.x) * z + this.sx, y: SA.H / 2 + (y - this.y) * z + this.sy };
    }
  }

  SA.Camera = Camera;
})(window.SA);
