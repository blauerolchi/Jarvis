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
      this.lead = 0; this.speedZoom = 0; this.look = 0; this.dzx = this.x;
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
        // weighted midpoint (the player a little heavier) with a dead zone: small movements inside
        // it don't move the camera at all, outside it the camera follows smoothly
        let lead = 0, fast = 0, look = 0;
        for (let fi = 0; fi < 2; fi++) {
          const f = fi ? b : a;
          const st = f.state;
          if (st === 'dash' || st === 'sprint' || st === 'run' || st === 'roll') lead += clamp(f.vx * 0.035, -55, 55);
          if (st === 'sprint' || (st === 'dash' && Math.abs(f.vx) > 1200)) fast = Math.max(fast, 0.6);
        }
        // subtle vertical look: up while rising high, down on a dive / fast fall (the player only)
        if (!a.grounded) look = a.vy < -700 ? -28 : (a.dive || a.fastFall) ? 30 : 0;
        this.lead = damp(this.lead, clamp(lead, -70, 70), 3, dt);
        this.look = damp(this.look || 0, look, 3, dt);
        this.speedZoom = damp(this.speedZoom, fast, 2, dt);
        const mid = a.x * 0.56 + b.x * 0.44 + this.lead;
        const DZ = 70;
        if (this.dzx === undefined) this.dzx = mid;
        if (mid > this.dzx + DZ) this.dzx = mid - DZ;
        else if (mid < this.dzx - DZ) this.dzx = mid + DZ;
        tx = this.dzx;
        tz = this.targetZoom(Math.abs(a.x - b.x)) - this.speedZoom * 0.04;
        // vertical: platforms / air. Zoom out so both fighters (heads + a margin) fit; the view only
        // lifts once someone is clearly up high (vertical dead zone)
        const top = Math.min(a.grounded ? a.y : a.y + 60, b.grounded ? b.y : b.y + 60), bottom = Math.max(a.y, b.y);
        const need = (bottom - top) + 470;
        tz = Math.max(0.74, Math.min(tz, SA.H * 0.97 / need));
        if (top < -240) tz -= Math.min(0.08, (-240 - top) / 3500);
        ty = Math.min(this.baseY(tz), top < -170 ? (top - 290 + bottom + 170) / 2 : this.baseY(tz)) + this.look;
      }
      const k = this.focus ? 5 : 4.2;
      this.x = damp(this.x, tx, k, dt);
      this.zoom = damp(this.zoom, tz, this.focus ? 4 : 2.2, dt);
      this.y = damp(this.y, ty, this.focus ? 6 : 3.4, dt);

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
