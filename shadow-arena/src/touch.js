'use strict';
/*
 * TouchControls: virtual analog joystick (left) + combat buttons (right) for tablets.
 *
 * Multitouch rules:
 * - every finger is tracked by pointerId; a finger owns exactly one control for its lifetime
 * - the joystick finger stays the joystick finger no matter where it moves
 * - a finger that slides from one button onto another presses the new one (fast chains)
 * - a finger leaving a hold button (BLOCK) releases it; pointercancel releases everything it owned
 * Joystick maps to the same actions as the keyboard (left/right/up/down), so the fighter logic
 * is shared 1:1 with desktop play. Context actions (low attack, dash attack, uppercut…) come from
 * the fighter reading held directions when a button is pressed.
 */
(function (SA) {
  const { clamp } = SA.M;

  // FIXED joystick: the base never moves, only the knob follows the finger inside the radius.
  // Response: 0–0.12 deadzone · 0.12–0.5 walk · 0.5–0.85 run · 0.85–1 sprint (see SA.Stick)
  const STICK = { x: 285, y: 790, r: 165, knob: 70, dead: 0.12, zoneX: 900, zoneY: 300 };
  const SIDE_ON = 0.12, DOWN_HOLD = 0.5, UP_HOLD = -0.55;
  SA.Stick = { DEAD: 0.12, WALK: 0.5, RUN: 0.85 };
  // gesture recognizer tuning
  const G = {
    zoneMag: 0.55,      // a direction zone (up / diagonal / down) is entered beyond this deflection
    centerMag: 0.3,     // back near the centre: gestures re-arm
    flickMs: 210,       // a flick is a short deflection that comes back (or lifts) within this time
    flickPeak: 0.72,
    doubleMs: 330,      // second flick in the same direction within this time = double flick
    tapMs: 230,         // ATTACK double tap -> heavy
  };

  // Only four combat buttons (concept art): big ATTACK, KICK, SHOOT, SPECIAL. Everything else
  // (jump, flips, rolls, dashes, fast fall, drop-through, heavy) comes from joystick gestures,
  // context and double taps.
  const BUTTONS = [
    { id: 'light', action: 'light', x: 1716, y: 868, r: 118, label: 'ATTACK', main: true, icon: 'blade' },
    { id: 'kick', action: 'kick', x: 1474, y: 952, r: 78, label: 'KICK', icon: 'kick' },
    { id: 'ranged', action: 'ranged', x: 1520, y: 712, r: 74, label: 'SHOOT', icon: 'gun' },
    { id: 'special', action: 'special', x: 1792, y: 600, r: 76, label: 'SPECIAL', icon: 'moon' },
  ];
  // button x positions are authored for 1920 and anchored to the right edge (wide phone canvases)
  for (const b of BUTTONS) b.rx = 1920 - b.x;
  const PAUSE = { rx: 52, y: 236, r: 40, get x() { return SA.W - this.rx; } };

  // angle of the stick in degrees: 0 = right, 90 = up, 180 = left, 270 = down
  function zoneOf(nx, ny, mag) {
    if (mag < G.zoneMag) return null;
    let a = Math.atan2(-ny, nx) * 180 / Math.PI;
    if (a < 0) a += 360;
    if (a >= 62 && a <= 118) return 'up';
    if (a > 25 && a < 62) return 'upR';
    if (a > 118 && a < 155) return 'upL';
    if (a >= 245 && a <= 295) return 'down';
    if (a > 205 && a < 245) return 'downL';
    if (a > 295 && a < 335) return 'downR';
    return a <= 25 || a >= 335 ? 'right' : 'left';
  }

  class TouchControls {
    constructor(game, input) {
      this.game = game;
      this.input = input;
      this.owned = new Map();              // pointerId -> 'stick' | 'pause' | 'void' | button
      this.buttons = BUTTONS.map((b) => Object.assign({ pointers: new Set(), pressedAt: 0 }, b));
      this.stick = { id: null, bx: STICK.x, by: STICK.y, x: 0, y: 0, nx: 0, ny: 0, mag: 0, zone: null, armed: true,
        g: { t0: 0, peak: 0, dir: 0, fired: false, active: false }, lastFlick: { dir: 0, t: -1e9 } };
      this.lastAttackTap = -1e9;
      this.hintT = 0;
    }

    // phones: same layout as the tablet, everything a quarter bigger for thumbs on a small screen
    get scale() { return (SA.Save.data.settings.touchSize || 1) * (SA.Device.isPhone ? 1.25 : 1); }

    // Is the in-fight overlay live right now?
    get active() {
      const g = this.game;
      if (!this.input.touchActive || g.scene !== 'fight' || g.paused || g.manualUi) return false;
      const m = g.match;
      return !!m && m.phase !== 'matchEnd' && !(g.arenaRun && g.arenaRun.screen);
    }

    visibleButtons() {
      const f = this.game.p1;
      const rw = f && f.rangedWeapon;
      return this.buttons.filter((b) => b.id !== 'ranged' || !!rw);
    }

    geom(b) {
      // scale buttons around the bottom-right corner so they stay reachable at any size
      const k = this.scale;
      return { x: SA.W - b.rx * k, y: SA.H - (SA.H - b.y) * k, r: b.r * k };
    }

    buttonAt(x, y, slack) {
      let best = null, bestD = Infinity;
      for (const b of this.visibleButtons()) {
        const g = this.geom(b);
        const d = Math.hypot(x - g.x, y - g.y);
        if (d < g.r * (slack || 1.12) && d < bestD) { best = b; bestD = d; }
      }
      return best;
    }

    down(id, x, y) {
      if (!this.active) return false;
      const k = this.scale;
      if (Math.hypot(x - PAUSE.x, y - PAUSE.y) < PAUSE.r * 1.4) {
        this.owned.set(id, 'pause');
        this.input.queue.push('pause');
        return true;
      }
      const b = this.buttonAt(x, y);
      if (b) { this.pressButton(b, id); return true; }
      if (x < STICK.zoneX * k + 120 && y > STICK.zoneY && this.stick.id === null) {
        // the first finger in the joystick zone owns the stick until it lifts; the base stays put
        const s = this.stick;
        s.id = id;
        s.bx = STICK.x * k;
        s.by = SA.H - (SA.H - STICK.y) * k;
        this.owned.set(id, 'stick');
        this.moveStick(x, y);
        return true;
      }
      // swallow stray touches during a fight so they never become UI taps
      this.owned.set(id, 'void');
      return true;
    }

    move(id, x, y) {
      const o = this.owned.get(id);
      if (!o) return false;
      if (o === 'stick') { this.moveStick(x, y); return true; }
      if (o === 'pause' || o === 'void') return true;
      const g = this.geom(o);
      if (Math.hypot(x - g.x, y - g.y) <= g.r * 1.35) return true;   // still on it (generous slack)
      const other = this.buttonAt(x, y, 1.0);
      this.releaseButton(o, id);
      if (other && other !== o) this.pressButton(other, id);
      else this.owned.set(id, 'void');
      return true;
    }

    up(id) {
      const o = this.owned.get(id);
      if (!o) return false;
      this.owned.delete(id);
      if (o === 'stick') this.resetStick();
      else if (o !== 'pause' && o !== 'void') this.releaseButton(o, id);
      return true;
    }

    // Buttons fire on pointerdown. ATTACK: the first tap is a light attack at once; a second tap
    // within ~230 ms becomes the heavy (the fighter cancels the light into the context heavy).
    pressButton(b, id) {
      const now = performance.now();
      b.pointers.add(id);
      b.pressedAt = now;
      this.owned.set(id, b);
      let action = b.action;
      if (b.id === 'light') {
        if (now - this.lastAttackTap < G.tapMs) { action = 'heavyTap'; this.lastAttackTap = -1e9; }
        else this.lastAttackTap = now;
      }
      this.input.queue.push(action);
      SA.Device.vibrate(8);
    }

    releaseButton(b, id) {
      b.pointers.delete(id);
    }

    // MovementGestureRecognizer: the stick moves in screen directions; every gesture is resolved
    // relative to the opponent at the moment it fires (F = toward the enemy, B = away), so a
    // flip / roll / dash means the same thing after the fighters switch sides.
    //   hold left / right ........ walk / run / sprint (deflection)
    //   up ....................... acrobatic jump          ↗ / ↖ .... front flip / backflip
    //   ↘ / ↙ .................... roll toward / away      down ..... crouch · fast fall · drop through
    //   short flick + back ....... dash / backstep         double flick: long dash / handspring
    // Gestures fire the moment the zone is reached (pointermove), never on pointerup.
    moveStick(x, y) {
      const s = this.stick, k = this.scale;
      const R = STICK.r * k;
      let dx = x - s.bx, dy = y - s.by;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      s.x = dx; s.y = dy;
      const mag = Math.min(1, d / R);
      const V = this.input.virtual;
      if (mag < STICK.dead) { s.nx = 0; s.ny = 0; }
      else {
        const m = (mag - STICK.dead) / (1 - STICK.dead);
        s.nx = (dx / (d || 1)) * m;
        s.ny = (dy / (d || 1)) * m;
      }
      const ux = d ? dx / d : 0, uy = d ? dy / d : 0;
      // ---- holds (continuous): left / right + up / down ----
      const hx = dx / R;
      const side = hx > SIDE_ON ? 1 : hx < -SIDE_ON ? -1 : 0;
      V.delete('left'); V.delete('right');
      if (side > 0) V.add('right'); else if (side < 0) V.add('left');
      s.mag = Math.min(1, Math.abs(hx));
      this.input.analogX = side ? s.mag : 1;
      if (uy * mag > DOWN_HOLD) V.add('down'); else V.delete('down');
      if (uy * mag < UP_HOLD) V.add('up'); else V.delete('up');
      this.recognize(ux, uy, mag);
    }

    recognize(ux, uy, mag) {
      const s = this.stick, Q = this.input.queue, now = performance.now();
      const f = this.game.p1;
      const air = f && !f.grounded;
      // re-arm near the centre
      if (mag < G.centerMag) {
        if (s.g.active) this.endFlick(now);
        s.armed = true;
        s.zone = null;
        return;
      }
      // a new deflection starts a possible flick
      if (!s.g.active) { s.g.active = true; s.g.t0 = now; s.g.peak = 0; s.g.fired = false; s.g.dir = 0; }
      s.g.peak = Math.max(s.g.peak, mag);
      const zone = zoneOf(ux, uy, mag);
      if (zone === 'right' || zone === 'left') s.g.dir = zone === 'right' ? 1 : -1;
      if (!zone || zone === s.zone) return;
      const prev = s.zone;
      s.zone = zone;
      const fac = f ? f.facing : 1;
      const fwd = (z) => ((z === 'upR' || z === 'downR') ? 1 : -1) * fac > 0;
      // zone actions fire once per entry (re-armed by the centre or by changing zone)
      // up in the air = double jump (diagonal: the held side gives it a direction)
      if (zone === 'up') { if (s.armed || prev !== 'up' || air) { Q.push('gJump'); s.g.fired = true; } }
      else if (zone === 'upR' || zone === 'upL') {
        Q.push(air ? 'gJump' : fwd(zone) ? 'gFlipF' : 'gFlipB'); s.g.fired = true;
      } else if (zone === 'downR' || zone === 'downL') {
        if (air) Q.push('gDown');
        else Q.push(fwd(zone) ? 'gRollF' : 'gRollB');
        s.g.fired = true;
      } else if (zone === 'down') { Q.push('gDown'); s.g.fired = true; }
      s.armed = false;
    }

    // a deflection came back to the centre (or the finger lifted): was it a flick?
    endFlick(now) {
      const s = this.stick, g = s.g;
      g.active = false;
      if (g.fired || !g.dir || now - g.t0 > G.flickMs || g.peak < G.flickPeak) return;
      const Q = this.input.queue;
      const lf = s.lastFlick;
      const f = this.game.p1;
      const fw = g.dir * (f ? f.facing : 1) > 0;
      if (lf.dir === g.dir && g.t0 - lf.t < G.doubleMs) {   // gap between the two flicks
        Q.push(fw ? 'gLongF' : 'gLongB');   // double flick: long dash toward / handspring away
        lf.t = -1e9;
      } else {
        Q.push(fw ? 'gDashF' : 'gDashB');   // flick: dash toward / backstep away (air: air dash)
        lf.dir = g.dir; lf.t = now;
      }
    }

    resetStick() {
      const s = this.stick;
      if (s.g.active) this.endFlick(performance.now());
      s.id = null; s.x = 0; s.y = 0; s.nx = 0; s.ny = 0; s.mag = 0; s.zone = null; s.armed = true;
      const V = this.input.virtual;
      V.delete('left'); V.delete('right'); V.delete('up'); V.delete('down');
      this.input.analogX = 1;
    }

    releaseAll() {
      for (const b of this.buttons) b.pointers.clear();
      this.owned.clear();
      this.input.virtual.clear();
      this.resetStick();
    }

    // ---------- drawing ----------
    // simple vector icons for the four buttons
    icon(ctx, kind, x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (kind === 'blade') {
        // curved crescent blade
        ctx.rotate(-0.7);
        ctx.beginPath();
        ctx.moveTo(-r * 0.05, r * 0.42);
        ctx.quadraticCurveTo(r * 0.5, -r * 0.1, r * 0.1, -r * 0.62);
        ctx.quadraticCurveTo(r * 0.22, -r * 0.1, -r * 0.18, r * 0.36);
        ctx.closePath(); ctx.fill();
        ctx.lineWidth = r * 0.1;
        ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.36); ctx.lineTo(-r * 0.3, r * 0.62); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.32, r * 0.36); ctx.lineTo(r * 0.06, r * 0.4); ctx.stroke();
      } else if (kind === 'kick') {
        ctx.lineWidth = r * 0.13;
        ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.5, r * 0.13, 0, SA.TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.32); ctx.lineTo(-r * 0.08, r * 0.08); ctx.lineTo(-r * 0.3, r * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.08, r * 0.06); ctx.lineTo(r * 0.55, -r * 0.18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.13, -r * 0.22); ctx.lineTo(r * 0.18, -r * 0.08); ctx.stroke();
      } else if (kind === 'gun') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.2); ctx.lineTo(r * 0.5, -r * 0.2); ctx.lineTo(r * 0.5, 0); ctx.lineTo(-r * 0.05, 0);
        ctx.lineTo(-r * 0.12, r * 0.45); ctx.lineTo(-r * 0.38, r * 0.45); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.5, 0);
        ctx.closePath(); ctx.fill();
      } else if (kind === 'moon') {
        ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, SA.TAU); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(r * 0.2, -r * 0.12, r * 0.42, 0, SA.TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }

    draw(ctx) {
      if (!this.active) return;
      const f = this.game.p1;
      const k = this.scale;
      const now = performance.now();
      ctx.save();
      // ---- fixed joystick ----
      const s = this.stick;
      const bx = STICK.x * k, by = SA.H - (SA.H - STICK.y) * k;
      const R = STICK.r * k;
      const live = s.id !== null;
      ctx.globalAlpha = live ? 0.9 : 0.6;
      ctx.fillStyle = 'rgba(10,8,14,0.32)';
      ctx.beginPath(); ctx.arc(bx, by, R, 0, SA.TAU); ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.arc(bx, by, R * 0.72, 0, SA.TAU); ctx.stroke();
      // direction ticks
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.save();
        ctx.translate(bx + Math.cos(a) * R * 0.86, by + Math.sin(a) * R * 0.86);
        ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.fill();
        ctx.restore();
      }
      // gesture hints (first seconds of a fight and in training): what each direction does
      const hint = this.game.mode === 'training' ? 0.55 : Math.max(0, 1 - (this.game.match ? this.game.match.t : 99) / 10) * 0.55;
      if (hint > 0.02) {
        const toR = !this.game.p1 || this.game.p1.facing > 0;
        const H = [['↑', 'JUMP', -90], ['↗', 'FLIP', -45], ['→', toR ? 'GO' : 'AWAY', 0], ['↘', 'ROLL', 45], ['↓', 'DROP', 90], ['↙', 'ROLL', 135], ['←', toR ? 'AWAY' : 'GO', 180], ['↖', 'FLIP', -135]];
        for (const [, label, deg] of H) {
          const a = deg * Math.PI / 180;
          SA.text(ctx, label, bx + Math.cos(a) * (R + 34 * k), by + Math.sin(a) * (R + 30 * k), { size: Math.round(17 * k), weight: 800, spacing: 2, color: '#ffffff', align: 'center', alpha: hint });
        }
      }
      // knob
      ctx.globalAlpha = live ? 0.98 : 0.75;
      const kx = bx + s.x, ky = by + s.y, kr = STICK.knob * k;
      const grad = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.35, kr * 0.1, kx, ky, kr);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.6, 'rgba(206,210,218,0.85)');
      grad.addColorStop(1, 'rgba(120,124,136,0.8)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(kx, ky, kr, 0, SA.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ---- four combat buttons ----
      for (const b of this.visibleButtons()) {
        const g = this.geom(b);
        const pressed = b.pointers.size > 0;
        const pulse = Math.max(0, 1 - (now - b.pressedAt) / 160);
        const r = g.r * (pressed ? 0.94 : 1);
        ctx.globalAlpha = pressed ? 0.98 : 0.8;
        ctx.fillStyle = pressed ? 'rgba(60,46,24,0.75)' : 'rgba(12,10,16,0.55)';
        ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, SA.TAU); ctx.fill();
        ctx.lineWidth = b.main ? 5 : 3;
        ctx.strokeStyle = b.main ? 'rgba(230,186,96,0.95)' : 'rgba(255,255,255,0.55)';
        ctx.stroke();
        if (b.main) {
          ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now / 400);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(SA.glowSprite('#e6b860'), g.x - r * 1.4, g.y - r * 1.4, r * 2.8, r * 2.8);
          ctx.globalCompositeOperation = 'source-over';
        }
        if (pulse > 0) {
          ctx.globalAlpha = pulse * 0.6;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(g.x, g.y, r + (1 - pulse) * 26, 0, SA.TAU); ctx.stroke();
        }
        if (b.id === 'special' && f) {
          const e = clamp(f.energy / 100, 0, 1);
          ctx.globalAlpha = 0.95;
          ctx.lineWidth = 6;
          ctx.strokeStyle = e >= 1 ? `rgba(200,190,255,${0.75 + 0.25 * Math.sin(now / 150)})` : 'rgba(154,140,255,0.7)';
          ctx.beginPath(); ctx.arc(g.x, g.y, r - 5, -Math.PI / 2, -Math.PI / 2 + SA.TAU * e); ctx.stroke();
        }
        if (b.id === 'ranged' && f && f.rangedWeapon) {
          const rs = f.rangedState;
          const cd = rs ? rs.cooldownFrac() : 0;
          if (cd > 0) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.arc(g.x, g.y, r - 3, -Math.PI / 2, -Math.PI / 2 + SA.TAU * cd); ctx.closePath(); ctx.fill();
          }
        }
        ctx.globalAlpha = pressed ? 1 : 0.92;
        this.icon(ctx, b.icon, g.x, g.y - r * 0.12, r * 0.62);
        SA.text(ctx, b.id === 'ranged' && f && f.rangedWeapon && f.rangedWeapon.kind === 'throw' ? 'THROW' : b.label, g.x, g.y + r * 0.56,
          { size: Math.round(r * (b.main ? 0.2 : 0.23)), weight: 900, spacing: 2, color: '#ffffff', align: 'center', alpha: pressed ? 1 : 0.9 });
      }

      // pause button
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(8,6,12,0.45)';
      ctx.beginPath(); ctx.arc(PAUSE.x, PAUSE.y, PAUSE.r, 0, SA.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(PAUSE.x - 11, PAUSE.y - 13, 7, 26);
      ctx.fillRect(PAUSE.x + 4, PAUSE.y - 13, 7, 26);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  TouchControls.BUTTONS = BUTTONS;
  TouchControls.STICK = STICK;
  SA.TouchControls = TouchControls;
})(window.SA);
