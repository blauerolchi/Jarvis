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
  const STICK = { x: 270, y: 800, r: 150, knob: 66, dead: 0.12, zoneX: 900, zoneY: 300 };
  const JUMP_ON = -0.55, JUMP_OFF = -0.35, DOWN_ON = 0.5, SIDE_ON = 0.12;
  SA.Stick = { DEAD: 0.12, WALK: 0.5, RUN: 0.85 };
  const FLICK = 0.78, FLICK_MS = 290;

  const BUTTONS = [
    { id: 'light', action: 'light', x: 1702, y: 858, r: 104, label: 'PUNCH', main: true },
    { id: 'heavy', action: 'heavy', x: 1502, y: 728, r: 74, label: 'HEAVY' },
    { id: 'kick', action: 'kick', x: 1484, y: 936, r: 74, label: 'KICK' },
    { id: 'block', action: 'block', x: 1712, y: 638, r: 74, label: 'BLOCK', hold: true },
    { id: 'dash', action: 'dash', x: 1300, y: 986, r: 60, label: 'DASH' },
    { id: 'special', action: 'special', x: 1856, y: 548, r: 62, label: 'SPECIAL' },
    { id: 'ranged', action: 'ranged', x: 1312, y: 806, r: 64, label: 'THROW' },
    { id: 'reload', action: 'reload', x: 1184, y: 690, r: 50, label: 'RELOAD' },
  ];
  const PAUSE = { x: 1860, y: 178, r: 44 };

  class TouchControls {
    constructor(game, input) {
      this.game = game;
      this.input = input;
      this.owned = new Map();              // pointerId -> 'stick' | 'pause' | 'void' | button
      this.buttons = BUTTONS.map((b) => Object.assign({ pointers: new Set(), pressedAt: 0 }, b));
      this.stick = { id: null, bx: STICK.x, by: STICK.y, x: 0, y: 0, nx: 0, ny: 0, up: false, lastSide: 0, flick: { dir: 0, t: 0 } };
    }

    get scale() { return SA.Save.data.settings.touchSize || 1; }

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
      return this.buttons.filter((b) => {
        if (b.id === 'ranged') return !!rw;
        if (b.id === 'reload') return !!(rw && rw.magazine);
        return true;
      });
    }

    geom(b) {
      // scale buttons around the bottom-right corner so they stay reachable at any size
      const k = this.scale;
      return { x: SA.W - (SA.W - b.x) * k, y: SA.H - (SA.H - b.y) * k, r: b.r * k };
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

    pressButton(b, id) {
      b.pointers.add(id);
      b.pressedAt = performance.now();
      this.owned.set(id, b);
      this.input.queue.push(b.action);
      if (b.hold) this.input.virtual.add(b.action);
      SA.Device.vibrate(8);
    }

    releaseButton(b, id) {
      b.pointers.delete(id);
      if (b.hold && b.pointers.size === 0) this.input.virtual.delete(b.action);
    }

    moveStick(x, y) {
      const s = this.stick, k = this.scale;
      const R = STICK.r * k;
      let dx = x - s.bx, dy = y - s.by;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      s.x = dx; s.y = dy;
      const mag = Math.min(1, d / R);
      const V = this.input.virtual;
      if (mag < STICK.dead) {
        s.nx = 0; s.ny = 0;
      } else {
        // rescale so the deadzone edge maps to 0
        const m = (mag - STICK.dead) / (1 - STICK.dead);
        s.nx = (dx / (d || 1)) * m;
        s.ny = (dy / (d || 1)) * m;
      }
      // raw horizontal deflection decides the direction: movement starts right after the deadzone
      const hx = dx / R;
      const side = hx > SIDE_ON ? 1 : hx < -SIDE_ON ? -1 : 0;
      V.delete('left'); V.delete('right');
      if (side > 0) V.add('right'); else if (side < 0) V.add('left');
      // horizontal deflection in raw stick units (0..1): the fighter picks walk / run / sprint from it
      s.mag = Math.min(1, Math.abs(hx));
      this.input.analogX = side ? s.mag : 1;

      if (s.ny > DOWN_ON) V.add('down'); else V.delete('down');
      if (!s.up && s.ny < JUMP_ON) {
        s.up = true;
        V.add('up');
        this.input.queue.push('up');
      } else if (s.up && s.ny > JUMP_OFF) {
        s.up = false;
        V.delete('up');
      }

      // double flick left/right = dash (the fighter decides dash vs. evade from the held direction)
      const hard = s.nx > FLICK ? 1 : s.nx < -FLICK ? -1 : 0;
      if (hard && hard !== s.lastSide) {
        const now = performance.now();
        if (s.flick.dir === hard && now - s.flick.t < FLICK_MS) {
          this.input.queue.push('step');
          s.flick.t = 0;
        } else {
          s.flick.dir = hard; s.flick.t = now;
        }
      }
      s.lastSide = hard;
    }

    resetStick() {
      const s = this.stick;
      s.id = null; s.x = 0; s.y = 0; s.nx = 0; s.ny = 0; s.mag = 0; s.up = false; s.lastSide = 0;
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
    labelFor(b, f) {
      const w = f && f.weapon, rw = f && f.rangedWeapon;
      if (b.id === 'light') return (w && w.touch && w.touch.light) || 'PUNCH';
      if (b.id === 'heavy') return (w && w.touch && w.touch.heavy) || 'HEAVY';
      if (b.id === 'ranged') return rw ? (rw.kind === 'gun' ? 'SHOOT' : 'THROW') : '';
      if (b.id === 'dash') {
        const s = this.stick;
        if (!f) return 'DODGE';
        if (s.ny > SIDE_ON) return 'ROLL';
        return s.nx * f.facing > SIDE_ON ? 'DASH' : s.nx * f.facing < -SIDE_ON ? 'FLIP' : 'DODGE';
      }
      return b.label;
    }

    draw(ctx) {
      if (!this.active) return;
      const f = this.game.p1;
      const k = this.scale;
      const now = performance.now();
      ctx.save();
      // joystick
      const s = this.stick;
      const bx = STICK.x * k, by = SA.H - (SA.H - STICK.y) * k;   // fixed base
      const R = STICK.r * k;
      ctx.globalAlpha = s.id !== null ? 0.85 : 0.5;
      ctx.fillStyle = 'rgba(8,6,12,0.35)';
      ctx.beginPath(); ctx.arc(bx, by, R, 0, SA.TAU); ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(bx, by, R * STICK.dead + 4, 0, SA.TAU); ctx.stroke();
      // sprint ring: pushing past it runs at full speed
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = s.mag >= SA.Stick.RUN ? 'rgba(255,214,140,0.55)' : 'rgba(255,255,255,0.1)';
      ctx.beginPath(); ctx.arc(bx, by, R * SA.Stick.RUN, 0, SA.TAU); ctx.stroke();
      ctx.setLineDash([]);
      // direction ticks
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.save();
        ctx.translate(bx + Math.cos(a) * R * 0.8, by + Math.sin(a) * R * 0.8);
        ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = s.id !== null ? 0.95 : 0.6;
      const kx = bx + s.x, ky = by + s.y;
      const grad = ctx.createRadialGradient(kx - 12, ky - 12, 4, kx, ky, STICK.knob * k);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(215,38,61,0.55)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(kx, ky, STICK.knob * k, 0, SA.TAU); ctx.fill();

      // buttons
      for (const b of this.visibleButtons()) {
        const g = this.geom(b);
        const pressed = b.pointers.size > 0;
        const pulse = Math.max(0, 1 - (now - b.pressedAt) / 160);
        const r = g.r * (pressed ? 0.94 : 1);
        ctx.globalAlpha = pressed ? 0.95 : 0.62;
        ctx.fillStyle = pressed ? 'rgba(215,38,61,0.5)' : b.main ? 'rgba(20,10,16,0.45)' : 'rgba(8,6,12,0.38)';
        ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, SA.TAU); ctx.fill();
        ctx.lineWidth = b.main ? 4 : 3;
        ctx.strokeStyle = pressed ? 'rgba(255,220,200,0.95)' : 'rgba(255,255,255,0.38)';
        ctx.stroke();
        if (pulse > 0) {
          ctx.globalAlpha = pulse * 0.6;
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(g.x, g.y, r + (1 - pulse) * 26, 0, SA.TAU); ctx.stroke();
        }
        if (b.id === 'special' && f) {
          const e = clamp(f.energy / 100, 0, 1);
          ctx.globalAlpha = 0.95;
          ctx.lineWidth = 7;
          ctx.strokeStyle = e >= 1 ? `hsl(${265 + Math.sin(now / 150) * 15},100%,75%)` : 'rgba(154,107,255,0.8)';
          ctx.beginPath(); ctx.arc(g.x, g.y, r - 6, -Math.PI / 2, -Math.PI / 2 + SA.TAU * e); ctx.stroke();
        }
        if (b.id === 'ranged' && f && f.rangedWeapon) {
          const rs = f.rangedState;
          const cd = rs ? rs.cooldownFrac() : 0;
          if (cd > 0) {
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.arc(g.x, g.y, r - 3, -Math.PI / 2, -Math.PI / 2 + SA.TAU * cd); ctx.closePath(); ctx.fill();
          }
          if (rs) SA.text(ctx, rs.label(), g.x, g.y + r * 0.42, { size: Math.round(r * 0.3), weight: 800, color: '#ffd27a', align: 'center', alpha: 0.95 });
        }
        const label = this.labelFor(b, f);
        SA.text(ctx, label, g.x, g.y - (b.id === 'ranged' ? r * 0.08 : 0), {
          size: Math.round(r * (label.length > 6 ? 0.25 : 0.32)), weight: 900, spacing: 2, color: '#ffffff', align: 'center', alpha: pressed ? 1 : 0.85,
        });
      }

      // pause button
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(8,6,12,0.45)';
      ctx.beginPath(); ctx.arc(PAUSE.x, PAUSE.y, PAUSE.r, 0, SA.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(PAUSE.x - 12, PAUSE.y - 15, 8, 30);
      ctx.fillRect(PAUSE.x + 4, PAUSE.y - 15, 8, 30);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  TouchControls.BUTTONS = BUTTONS;
  TouchControls.STICK = STICK;
  SA.TouchControls = TouchControls;
})(window.SA);
