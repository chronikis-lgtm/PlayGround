// Unified keyboard / mouse / touch / gamepad input.
//
// Touch layout: left side of the screen is a movement stick, right side is an
// aim + fire stick. Both are dynamic, so they appear wherever the thumb lands.

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const AIM_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.view = { w: 480, h: 300 };
    this.keys = new Set();
    this.actions = [];
    this.enabled = false;
    this.coarse = false;
    this.onUiTap = null;

    this.mouse = { x: 0, y: 0, active: false, down: false };
    this.sticks = { move: null, aim: null };
    this.pointerSide = new Map();

    this.move = { x: 0, y: 0 };
    this.aimDir = null;
    this.firing = false;
    this.padStart = false;

    this.moveVec = { x: 0, y: 0 };
    this.aimVec = { x: 0, y: 0 };

    try {
      this.coarse = window.matchMedia('(pointer: coarse)').matches;
    } catch {}

    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
  }

  attach() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown, { passive: false });
    c.addEventListener('pointermove', this.onMove, { passive: false });
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  setView(view) {
    this.view = view;
  }

  setEnabled(value) {
    this.enabled = !!value;
    if (!this.enabled) {
      this.sticks.move = null;
      this.sticks.aim = null;
      this.mouse.down = false;
    }
  }

  rect() {
    return this.canvas.getBoundingClientRect();
  }

  toWorld(clientX, clientY) {
    const r = this.rect();
    return {
      x: ((clientX - r.left) / Math.max(1, r.width)) * this.view.w,
      y: ((clientY - r.top) / Math.max(1, r.height)) * this.view.h,
    };
  }

  stickRadius() {
    const base = Math.min(this.view.w, this.view.h);
    return Math.max(15, Math.min(28, base * 0.11));
  }

  onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const p = this.toWorld(e.clientX, e.clientY);

    if (e.pointerType === 'mouse') {
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.active = true;
    }

    if (this.onUiTap && this.onUiTap(p.x, p.y, e.pointerType)) return;
    if (!this.enabled) return;

    if (e.pointerType === 'mouse') {
      this.mouse.down = true;
      return;
    }

    const r = this.rect();
    const left = e.clientX < r.left + r.width / 2;
    let side = left ? 'move' : 'aim';
    if (this.sticks[side]) side = side === 'move' ? 'aim' : 'move';
    if (this.sticks[side]) return;

    const stick = {
      id: e.pointerId,
      side,
      baseX: p.x,
      baseY: p.y,
      knobX: p.x,
      knobY: p.y,
      dx: 0,
      dy: 0,
      mag: 0,
    };
    this.sticks[side] = stick;
    this.pointerSide.set(e.pointerId, side);
    this.coarse = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {}
  }

  onMove(e) {
    if (e.pointerType === 'mouse') {
      const p = this.toWorld(e.clientX, e.clientY);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.active = true;
      return;
    }
    const side = this.pointerSide.get(e.pointerId);
    if (!side) return;
    const stick = this.sticks[side];
    if (!stick) return;
    e.preventDefault();
    const p = this.toWorld(e.clientX, e.clientY);
    const radius = this.stickRadius();
    let dx = p.x - stick.baseX;
    let dy = p.y - stick.baseY;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    stick.dx = dx / radius;
    stick.dy = dy / radius;
    stick.mag = Math.min(1, dist / radius);
    stick.knobX = stick.baseX + dx;
    stick.knobY = stick.baseY + dy;
  }

  onUp(e) {
    if (e.pointerType === 'mouse') {
      this.mouse.down = false;
      return;
    }
    const side = this.pointerSide.get(e.pointerId);
    if (side) {
      this.sticks[side] = null;
      this.pointerSide.delete(e.pointerId);
    }
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {}
  }

  onKeyDown(e) {
    if (e.repeat) return;
    const code = e.code;
    if (MOVE_KEYS.has(code) || AIM_KEYS.has(code) || code === 'Space') {
      e.preventDefault();
    }
    this.keys.add(code);
    if (code === 'Enter') this.actions.push('start');
    else if (code === 'Escape' || code === 'KeyP') this.actions.push('pause');
    else if (code === 'KeyM') this.actions.push('mute');
    else if (code === 'KeyR') this.actions.push('restart');
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  onBlur() {
    this.keys.clear();
    this.mouse.down = false;
    this.sticks.move = null;
    this.sticks.aim = null;
    this.pointerSide.clear();
  }

  pollGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  update() {
    let mx = 0;
    let my = 0;
    let aim = null;
    let firing = false;

    // ----- movement -----
    const moveStick = this.sticks.move;
    if (moveStick && moveStick.mag > 0.12) {
      mx = moveStick.dx;
      my = moveStick.dy;
      const m = Math.hypot(mx, my);
      if (m > 1) {
        mx /= m;
        my /= m;
      }
    } else {
      if (this.keys.has('KeyA')) mx -= 1;
      if (this.keys.has('KeyD')) mx += 1;
      if (this.keys.has('KeyW')) my -= 1;
      if (this.keys.has('KeyS')) my += 1;
      const m = Math.hypot(mx, my);
      if (m > 1) {
        mx /= m;
        my /= m;
      }
    }

    // ----- aim -----
    const aimStick = this.sticks.aim;
    if (aimStick && aimStick.mag > 0.16) {
      const m = Math.hypot(aimStick.dx, aimStick.dy) || 1;
      aim = { x: aimStick.dx / m, y: aimStick.dy / m };
      firing = aimStick.mag > 0.26;
    } else {
      let ax = 0;
      let ay = 0;
      if (this.keys.has('ArrowLeft')) ax -= 1;
      if (this.keys.has('ArrowRight')) ax += 1;
      if (this.keys.has('ArrowUp')) ay -= 1;
      if (this.keys.has('ArrowDown')) ay += 1;
      if (ax || ay) {
        const m = Math.hypot(ax, ay);
        aim = { x: ax / m, y: ay / m };
        firing = true;
      }
    }

    // ----- gamepad -----
    const pad = this.pollGamepad();
    if (pad) {
      const lx = pad.axes[0] || 0;
      const ly = pad.axes[1] || 0;
      const lm = Math.hypot(lx, ly);
      if (!moveStick && lm > 0.22 && !this.keys.has('KeyA') && !this.keys.has('KeyD') && !this.keys.has('KeyW') && !this.keys.has('KeyS')) {
        const scale = Math.min(1, (lm - 0.18) / 0.7);
        mx = (lx / lm) * scale;
        my = (ly / lm) * scale;
      }
      const rx = pad.axes[2] || 0;
      const ry = pad.axes[3] || 0;
      const rm = Math.hypot(rx, ry);
      if (!aim && rm > 0.32) {
        aim = { x: rx / rm, y: ry / rm };
        firing = true;
      }
      if ((pad.buttons[7] && pad.buttons[7].value > 0.35) || (pad.buttons[6] && pad.buttons[6].value > 0.35)) {
        firing = true;
      }
      const start = !!(pad.buttons[9] && pad.buttons[9].pressed);
      const face = !!(pad.buttons[0] && pad.buttons[0].pressed);
      if ((start && !this.padStart) || (face && !this.enabled)) this.actions.push('start');
      this.padStart = start || face;
    } else {
      this.padStart = false;
    }

    if (this.keys.has('Space')) firing = true;
    if (this.mouse.active && this.mouse.down) firing = true;

    this.move.x = mx;
    this.move.y = my;
    this.aimDir = aim;
    this.firing = firing;

    if (mx || my) {
      const m = Math.hypot(mx, my) || 1;
      this.moveVec.x = mx / m;
      this.moveVec.y = my / m;
    } else {
      this.moveVec.x = 0;
      this.moveVec.y = 0;
    }
    if (aim) {
      this.aimVec.x = aim.x;
      this.aimVec.y = aim.y;
    }
  }
}
