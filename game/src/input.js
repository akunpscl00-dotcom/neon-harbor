// Keyboard and mouse: held keys, presses this frame, pointer-lock mouse look and buttons.
// The touch layer (touch.js) feeds the same state: virtual keys, an analog stick and look drags.

const held = new Set();
const pressed = new Set();
const mouse = { dx: 0, dy: 0, left: false, right: false, clicked: false, wheel: 0 };
let canvas = null;
// analog stick from the touch joystick: x right, y forward, each -1..1 (0, 0 when released)
const stick = { x: 0, y: 0 };

export function initInput(element) {
  canvas = element;
  window.addEventListener('keydown', (event) => {
    if (!held.has(event.code)) pressed.add(event.code);
    held.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      mouse.dx += event.movementX;
      mouse.dy += event.movementY;
    }
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) { mouse.left = true; mouse.clicked = true; }
    if (event.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.left = false;
    if (event.button === 2) mouse.right = false;
  });
  window.addEventListener('wheel', (event) => { mouse.wheel += Math.sign(event.deltaY); }, { passive: true });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
}

export function isDown(code) {
  return held.has(code);
}

export function wasPressed(code) {
  return pressed.has(code);
}

/** Axis from two key codes: -1, 0 or 1. */
export function axis(negative, positive) {
  const keys = (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
  let analog = 0;
  if (negative === 'KeyA' && positive === 'KeyD') analog = stick.x;
  else if (negative === 'KeyS' && positive === 'KeyW') analog = stick.y;
  return Math.max(-1, Math.min(1, keys + analog));
}

// ---- touch feed (touch.js) ----

/** Press or release a virtual key, exactly as a keydown / keyup of that code. */
export function touchKey(code, down) {
  if (down) {
    if (!held.has(code)) pressed.add(code);
    held.add(code);
  } else held.delete(code);
}

/** Set the analog stick (x right, y forward, -1..1). */
export function setStick(x, y) {
  stick.x = x;
  stick.y = y;
}

/** Add a camera drag in mouse-pixel units. */
export function addLook(dx, dy) {
  mouse.dx += dx;
  mouse.dy += dy;
}

/** Hold or release a mouse button: 0 fire, 2 aim. */
export function touchButton(button, down) {
  if (button === 0) { if (down) mouse.clicked = true; mouse.left = down; }
  if (button === 2) mouse.right = down;
}

/** One weapon-cycle step, as a mouse-wheel notch. */
export function touchWheel(step) {
  mouse.wheel += step;
}

/** Release everything the touch layer holds (mode change, lost focus). */
export function touchReleaseAll(codes) {
  codes.forEach((c) => held.delete(c));
  stick.x = 0;
  stick.y = 0;
  mouse.left = false;
  mouse.right = false;
}

export function getMouse() {
  return mouse;
}

export function lockPointer() {
  if (canvas && document.pointerLockElement !== canvas && canvas.requestPointerLock) {
    try { canvas.requestPointerLock(); } catch { /* not allowed yet */ }
  }
}

export function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

export function pointerLocked() {
  return document.pointerLockElement === canvas;
}

/** Call once at the end of every frame. */
export function endFrame() {
  pressed.clear();
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.clicked = false;
  mouse.wheel = 0;
}

/** Drive input from code (the screenshot scenes use it). */
export function simulateHold(code, down) {
  if (down) held.add(code); else held.delete(code);
}
