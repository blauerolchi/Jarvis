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
    }

    baseY(zoom) {
      return -(SA.GROUND_SCREEN - 0.5) * SA.H / zoom;
    }

    snap(a, b) {
      this.x = (a.x + b.x) / 2;
      this.zoom = this.targetZoom(Math.abs(a.x - b.x));
      this.y = this.baseY(this.zoom);
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
        tx = (a.x + b.x) / 2;
        tz = this.targetZoom(Math.abs(a.x - b.x));
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
