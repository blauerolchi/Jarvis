'use strict';
/*
 * Keyboard/mouse input.
 * - keydown events are captured instantly and queued as "presses" (never lost, even mid-frame)
 * - held keys are tracked as a state set
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
    Space: 'special',
    Escape: 'pause',
    Enter: 'confirm', NumpadEnter: 'confirm',
    Backspace: 'back',
    KeyR: 'reset',
    F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4',
  };
  SA.KEYMAP = KEYMAP;

  class InputManager {
    constructor(canvas) {
      this.canvas = canvas;
      this.codes = new Set();
      this.heldActions = new Set();
      this.queue = [];
      this.mouse = { x: -1, y: -1, clicked: false, moved: false };

      window.addEventListener('keydown', (e) => {
        const a = KEYMAP[e.code];
        if (a) e.preventDefault();
        if (SA.audio) SA.audio.unlock();
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

      window.addEventListener('blur', () => {
        this.codes.clear();
        this.refreshHeld();
      });

      const toLocal = (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - r.left) / r.width) * SA.W;
        this.mouse.y = ((e.clientY - r.top) / r.height) * SA.H;
      };
      canvas.addEventListener('mousemove', (e) => { toLocal(e); this.mouse.moved = true; });
      canvas.addEventListener('mousedown', (e) => {
        toLocal(e);
        if (SA.audio) SA.audio.unlock();
        if (e.button === 0) this.mouse.clicked = true;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    refreshHeld() {
      this.heldActions.clear();
      for (const c of this.codes) this.heldActions.add(KEYMAP[c]);
    }

    held(a) { return this.heldActions.has(a); }

    drain() {
      const q = this.queue;
      this.queue = [];
      return q;
    }

    takeMouse() {
      const m = { x: this.mouse.x, y: this.mouse.y, clicked: this.mouse.clicked, moved: this.mouse.moved };
      this.mouse.clicked = false;
      this.mouse.moved = false;
      return m;
    }
  }

  const FIGHT_ACTIONS = ['left', 'right', 'up', 'down', 'light', 'heavy', 'kick', 'block', 'dash', 'special'];

  class Controller {
    constructor() {
      this.buf = [];
      this.hold = new Set();
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

  // Human controller: mirrors the keyboard state into a Controller each tick.
  class PlayerController extends Controller {
    constructor(input) {
      super();
      this.input = input;
    }
    sync(presses) {
      this.hold.clear();
      for (const a of FIGHT_ACTIONS) if (this.input.held(a)) this.hold.add(a);
      for (const a of presses) if (FIGHT_ACTIONS.indexOf(a) >= 0) this.press(a);
    }
  }

  SA.InputManager = InputManager;
  SA.Controller = Controller;
  SA.PlayerController = PlayerController;
  SA.FIGHT_ACTIONS = FIGHT_ACTIONS;
})(window.SA);
