'use strict';
/*
 * Keyboard / mouse / touch input.
 * - keydown and pointerdown events are captured instantly and queued as "presses" (never lost mid-frame)
 * - held keys / held touch buttons are tracked as state sets
 * - every touch pointer is tracked by its pointerId, so a finger on the joystick is never released
 *   by another finger pressing a button (true multitouch)
 * - Controller is the per-fighter interface (buffered presses + held set). The AI drives the
 *   exact same Controller type, so it plays by the same rules as the human.
 */
(function (SA) {
  const KEYMAP = {
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyJ: 'light', KeyK: 'heavy', KeyL: 'kick',
    KeyU: 'block', KeyI: 'dash',
    KeyO: 'ranged', KeyP: 'reload',
    Space: 'special',
    Escape: 'pause',
    Enter: 'confirm', NumpadEnter: 'confirm',
    Backspace: 'back',
    KeyR: 'reset', KeyT: 'try',
    F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4', F5: 'f5', F6: 'f6', F7: 'f7', F8: 'f8',
  };
  SA.KEYMAP = KEYMAP;

  const TAP_SLOP = 26;      // logical px a finger may move and still count as a tap
  const TAP_TIME = 600;     // ms

  class InputManager {
    constructor(canvas) {
      this.canvas = canvas;
      this.codes = new Set();
      this.heldActions = new Set();
      this.virtual = new Set();         // actions held by on-screen touch controls
      this.analogX = 1;                 // joystick deflection (1 = full) for analog walking
      this.queue = [];
      this.mouse = { x: -1, y: -1, clicked: false, moved: false, dragY: 0, dragX: 0, wheel: 0 };
      this.pointers = new Map();        // UI pointers (taps / drags) by pointerId
      this.touch = null;                // SA.TouchControls, attached by the game
      this.lastDevice = SA.Device.isTouch ? 'touch' : 'keyboard';

      window.addEventListener('keydown', (e) => {
        const a = KEYMAP[e.code];
        if (a) e.preventDefault();
        if (SA.audio) SA.audio.unlock();
        this.lastDevice = 'keyboard';
        if (!a || e.repeat) return;
        this.codes.add(e.code);
        this.refreshHeld();
        this.queue.push(a);
      }, { passive: false });

      window.addEventListener('keyup', (e) => {
        if (!KEYMAP[e.code]) return;
        e.preventDefault();
        this.codes.delete(e.code);
        this.refreshHeld();
      });

      const releaseAll = () => {
        this.codes.clear();
        this.refreshHeld();
        this.pointers.clear();
        if (this.touch) this.touch.releaseAll();
      };
      window.addEventListener('blur', releaseAll);
      document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

      const opts = { passive: false };
      window.addEventListener('pointerdown', (e) => this.onDown(e), opts);
      window.addEventListener('pointermove', (e) => this.onMove(e), opts);
      window.addEventListener('pointerup', (e) => this.onUp(e, false), opts);
      window.addEventListener('pointercancel', (e) => this.onUp(e, true), opts);
      window.addEventListener('lostpointercapture', (e) => { if (e.pointerType !== 'mouse') this.onUp(e, true); }, opts);
      window.addEventListener('wheel', (e) => { this.mouse.wheel += e.deltaY; }, { passive: true });
      window.addEventListener('contextmenu', (e) => e.preventDefault());
      // iOS/Android browser gestures
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('dblclick', (e) => e.preventDefault());
    }

    toLocal(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * SA.W,
        y: ((e.clientY - r.top) / r.height) * SA.H,
      };
    }

    onDown(e) {
      if (SA.audio) SA.audio.unlock();
      const p = this.toLocal(e);
      if (e.pointerType === 'mouse') {
        this.lastDevice = this.lastDevice === 'touch' ? 'touch' : 'mouse';
        this.mouse.x = p.x; this.mouse.y = p.y;
        if (e.button === 0) {
          this.mouse.clicked = true;
          this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), mouse: true });
        }
        return;
      }
      e.preventDefault();
      this.lastDevice = 'touch';
      // capture the finger: moves / lifts outside the canvas still reach us (no stuck joystick)
      try { if (e.target && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      if (this.touch && this.touch.down(e.pointerId, p.x, p.y)) return;
      this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now() });
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.moved = true;
    }

    onMove(e) {
      const p = this.toLocal(e);
      if (e.pointerType !== 'mouse') {
        e.preventDefault();
        if (this.touch && this.touch.move(e.pointerId, p.x, p.y)) return;
      }
      const ptr = this.pointers.get(e.pointerId);
      if (ptr) {
        this.mouse.dragY += p.y - ptr.y;
        this.mouse.dragX += p.x - ptr.x;
        ptr.x = p.x; ptr.y = p.y;
      }
      if (e.pointerType === 'mouse' || ptr) {
        this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.moved = true;
      }
    }

    onUp(e, cancelled) {
      if (e.pointerType !== 'mouse') {
        e.preventDefault();
        if (this.touch && this.touch.up(e.pointerId)) return;
      }
      const ptr = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!ptr || ptr.mouse || cancelled) return;
      const moved = Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy);
      if (moved < TAP_SLOP && performance.now() - ptr.t0 < TAP_TIME) {
        this.mouse.x = ptr.x; this.mouse.y = ptr.y;
        this.mouse.clicked = true;
      }
    }

    refreshHeld() {
      this.heldActions.clear();
      for (const c of this.codes) this.heldActions.add(KEYMAP[c]);
    }

    held(a) { return this.heldActions.has(a) || this.virtual.has(a); }

    drain() {
      const q = this.queue;
      this.queue = [];
      return q;
    }

    takeMouse() {
      const m = this.mouse;
      const out = { x: m.x, y: m.y, clicked: m.clicked, moved: m.moved, dragY: m.dragY, dragX: m.dragX, wheel: m.wheel, dragging: this.pointers.size > 0 };
      m.clicked = false; m.moved = false; m.dragY = 0; m.dragX = 0; m.wheel = 0;
      return out;
    }

    // Show touch controls? 'auto' follows the last used device.
    get touchActive() {
      const mode = SA.Save.data.settings.touchControls;
      if (mode === 'on') return true;
      if (mode === 'off') return false;
      return this.lastDevice === 'touch';
    }
  }

  const FIGHT_ACTIONS = ['left', 'right', 'up', 'down', 'light', 'heavy', 'kick', 'block', 'dash', 'special', 'ranged', 'reload'];

  class Controller {
    constructor() {
      this.buf = [];
      this.hold = new Set();
      this.analog = 1;
      this.stick = false;
    }
    held(a) { return this.hold.has(a); }
    press(a) {
      this.buf.push({ a, age: 0 });
      if (this.buf.length > 16) this.buf.shift();
    }
    // Ages buffered presses; called once per simulation tick (not during hit stop).
    tick(ts) {
      let j = 0;
      for (let i = 0; i < this.buf.length; i++) {
        const b = this.buf[i];
        b.age += ts;
        if (b.age <= SA.BUFFER_FRAMES) this.buf[j++] = b;
      }
      this.buf.length = j;
    }
    has(a) {
      for (const b of this.buf) if (b.a === a) return true;
      return false;
    }
    consume(a) {
      for (let i = 0; i < this.buf.length; i++) {
        if (this.buf[i].a === a) {
          this.buf.splice(i, 1);
          return true;
        }
      }
      return false;
    }
    clearBuffer() { this.buf.length = 0; }
    clear() {
      this.buf.length = 0;
      this.hold.clear();
    }
    describe() {
      return this.buf.map((b) => b.a + '(' + Math.floor(b.age) + ')').join(' ') || '-';
    }
  }

  // Human controller: mirrors keyboard + touch state into a Controller each tick.
  class PlayerController extends Controller {
    constructor(input) {
      super();
      this.input = input;
    }
    sync(presses) {
      this.hold.clear();
      for (const a of FIGHT_ACTIONS) if (this.input.held(a)) this.hold.add(a);
      // keyboard: digital (walk -> run -> sprint by hold time); joystick: analog deflection picks the tier
      const kb = this.input.heldActions.has('left') || this.input.heldActions.has('right');
      this.stick = !kb && (this.input.virtual.has('left') || this.input.virtual.has('right'));
      this.analog = this.stick ? this.input.analogX : 1;
      for (const a of presses) if (FIGHT_ACTIONS.indexOf(a) >= 0) this.press(a);
    }
  }

  SA.InputManager = InputManager;
  SA.Controller = Controller;
  SA.PlayerController = PlayerController;
  SA.FIGHT_ACTIONS = FIGHT_ACTIONS;
})(window.SA);
