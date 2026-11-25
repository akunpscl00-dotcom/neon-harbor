// Touch controls for phones and tablets: a floating stick on the left half (walk, or steer and
// throttle in a car), drag anywhere else on the right to look, and thumb buttons for the actions.
// Everything feeds input.js, the same state the keyboard and mouse fill, so no game logic changes.
// Shown only on touch screens (or with ?touch=1 in the address).
import { touchKey, setStick, addLook, touchButton, touchWheel, touchReleaseAll } from './input.js';

const LOOK_GAIN = 1.7; // touch-drag pixels to mouse pixels
const STICK_RADIUS = 56;
const HELD_CODES = ['KeyW', 'KeyS', 'ShiftLeft', 'Space', 'KeyF', 'KeyE', 'KeyR', 'KeyH'];

export function touchWanted() {
  const params = new URLSearchParams(location.search);
  if (params.has('touch')) return params.get('touch') !== '0';
  if (!window.matchMedia) return false;
  // phones and tablets: the main pointer is a finger (a touchscreen laptop keeps mouse and keyboard)
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches);
}

// Each button: id, label on foot, label in a car (null hides it there), and what it does.
//   key: a virtual key held while the thumb is down   tap: a one-shot action
//   toggle: stays on until tapped again               look: dragging on it also turns the camera
const BUTTONS = [
  { id: 'fire', foot: 'Serang', car: null, mouse: 0, look: true },
  { id: 'aim', foot: 'Bidik', car: null, toggleMouse: 2 },
  { id: 'jump', foot: 'Lompat', car: 'Rem Tangan', key: 'Space' },
  { id: 'car', foot: 'Masuk Mobil', car: 'Keluar', key: 'KeyF' },
  { id: 'run', foot: 'Lari', car: null, toggleKey: 'ShiftLeft' },
  { id: 'use', foot: 'Pakai', car: null, key: 'KeyE' },
  { id: 'weapon', foot: 'Senjata', car: null, tap: () => touchWheel(1) },
  { id: 'reload', foot: 'Isi Peluru', car: 'Radio', key: 'KeyR' },
  { id: 'horn', foot: null, car: 'Klakson', key: 'KeyH' },
];

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.enabled = touchWanted();
    if (!this.enabled) return;
    document.documentElement.classList.add('touch');
    this.toggles = { run: false, aim: false };
    this.stickId = null;
    this.lookIds = new Map(); // pointerId -> last x, y
    this.build();
    this.wantFullscreen = true;
    // first tap anywhere (the title menu too): go fullscreen and hold landscape where the phone allows it
    window.addEventListener('pointerdown', () => this.goFullscreen(), { capture: true });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
  }

  goFullscreen() {
    if (!this.wantFullscreen) return;
    this.wantFullscreen = false;
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => { /* the browser said no: play in the window */ });
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div id="touch-look"></div>
      <div id="touch-stick-zone"><div id="touch-stick-base"><div id="touch-stick-knob"></div></div></div>
      <div id="touch-buttons"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.base = root.querySelector('#touch-stick-base');
    this.knob = root.querySelector('#touch-stick-knob');

    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'touch-pause';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Jeda / menu');
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // the same path as the Esc key: pause, resume, or close the shop
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape', bubbles: true }));
    });
    document.body.appendChild(pauseBtn);
    this.pauseBtn = pauseBtn;

    const hint = document.createElement('div');
    hint.id = 'touch-rotate';
    hint.innerHTML = '<div class="phone"></div><div>Putar HP ke posisi miring (landscape) biar enak mainnya</div>';
    document.body.appendChild(hint);

    const wrap = root.querySelector('#touch-buttons');
    this.buttons = BUTTONS.map((def) => {
      const b = document.createElement('div');
      b.className = `tbtn tbtn-${def.id}`;
      b.dataset.id = def.id;
      wrap.appendChild(b);
      this.wireButton(b, def);
      return { el: b, def };
    });

    this.wireStick(root.querySelector('#touch-stick-zone'));
    this.wireLook(root.querySelector('#touch-look'));
    this.update();
  }

  wireButton(el, def) {
    let lookId = null;
    let last = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
      el.classList.add('down');
      if (def.key) touchKey(def.key, true);
      if (def.mouse !== undefined) touchButton(def.mouse, true);
      if (def.tap) def.tap();
      if (def.toggleKey) {
        this.toggles[def.id] = !this.toggles[def.id];
        touchKey(def.toggleKey, this.toggles[def.id]);
      }
      if (def.toggleMouse !== undefined) {
        this.toggles[def.id] = !this.toggles[def.id];
        touchButton(def.toggleMouse, this.toggles[def.id]);
      }
      if (def.look) { lookId = e.pointerId; last = [e.clientX, e.clientY]; }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId || !last) return;
      addLook((e.clientX - last[0]) * LOOK_GAIN, (e.clientY - last[1]) * LOOK_GAIN);
      last = [e.clientX, e.clientY];
    });
    const up = (e) => {
      el.classList.remove('down');
      if (def.key) touchKey(def.key, false);
      if (def.mouse !== undefined) touchButton(def.mouse, false);
      if (e && e.pointerId === lookId) { lookId = null; last = null; }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  wireStick(zone) {
    const move = (e) => {
      const dx = e.clientX - this.origin[0];
      const dy = e.clientY - this.origin[1];
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      const kx = dx * k;
      const ky = dy * k;
      this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
      let x = kx / STICK_RADIUS;
      let y = -ky / STICK_RADIUS;
      // a small dead zone so a resting thumb does not creep
      if (Math.hypot(x, y) < 0.15) { x = 0; y = 0; }
      this.stick = [x, y];
      setStick(x, y);
      this.syncDriveKeys();
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* fine */ }
      const r = zone.getBoundingClientRect();
      // the stick appears under the thumb, kept fully inside its zone
      const ox = Math.max(r.left + STICK_RADIUS + 10, Math.min(r.right - STICK_RADIUS - 10, e.clientX));
      const oy = Math.max(r.top + STICK_RADIUS + 10, Math.min(r.bottom - STICK_RADIUS - 10, e.clientY));
      this.origin = [ox, oy];
      this.base.style.left = `${ox - r.left}px`;
      this.base.style.top = `${oy - r.top}px`;
      this.base.classList.add('active');
      move(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) move(e); });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stick = [0, 0];
      setStick(0, 0);
      this.syncDriveKeys();
      this.knob.style.transform = '';
      this.base.classList.remove('active');
      this.base.style.left = '';
      this.base.style.top = '';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  /** In a car the stick's forward / back is the gas and brake keys (the car reads those as on / off). */
  syncDriveKeys() {
    const inCar = !!this.game.player.vehicle;
    const y = this.stick ? this.stick[1] : 0;
    touchKey('KeyW', inCar && y > 0.3);
    touchKey('KeyS', inCar && y < -0.3);
  }

  wireLook(area) {
    area.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { area.setPointerCapture(e.pointerId); } catch { /* fine */ }
      this.lookIds.set(e.pointerId, [e.clientX, e.clientY]);
    });
    area.addEventListener('pointermove', (e) => {
      const last = this.lookIds.get(e.pointerId);
      if (!last) return;
      addLook((e.clientX - last[0]) * LOOK_GAIN, (e.clientY - last[1]) * LOOK_GAIN);
      this.lookIds.set(e.pointerId, [e.clientX, e.clientY]);
    });
    const end = (e) => this.lookIds.delete(e.pointerId);
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
  }

  releaseAll() {
    if (!this.enabled) return;
    touchReleaseAll(HELD_CODES);
    this.toggles.run = false;
    this.toggles.aim = false;
    this.stickId = null;
    this.stick = [0, 0];
    this.lookIds.clear();
    this.buttons.forEach(({ el }) => el.classList.remove('down'));
    if (this.knob) this.knob.style.transform = '';
    if (this.base) this.base.classList.remove('active');
  }

  /** Call once a frame: show the layer only while playing, and label the buttons for foot or car. */
  update() {
    if (!this.enabled) return;
    const g = this.game;
    const playing = g.mode === 'play';
    if (playing !== this.wasPlaying) {
      this.root.classList.toggle('hidden', !playing);
      if (!playing) this.releaseAll();
      this.wasPlaying = playing;
    }
    const menuOpen = g.mode === 'pause' || g.mode === 'shop';
    this.pauseBtn.classList.toggle('hidden', !(playing || menuOpen));
    this.pauseBtn.textContent = menuOpen ? 'X' : 'II';
    const inCar = !!g.player.vehicle;
    if (inCar !== this.wasInCar) {
      this.wasInCar = inCar;
      if (inCar) { // leave the on-foot toggles off in a car
        if (this.toggles.aim) { this.toggles.aim = false; touchButton(2, false); }
        if (this.toggles.run) { this.toggles.run = false; touchKey('ShiftLeft', false); }
      }
      this.syncDriveKeys();
      this.buttons.forEach(({ el, def }) => {
        const label = inCar ? def.car : def.foot;
        el.textContent = label ?? '';
        el.classList.toggle('hidden', !label);
      });
    }
    if (!inCar) {
      const fire = this.buttons.find((b) => b.def.id === 'fire');
      const fists = g.player.weapon === 'fists';
      const want = fists ? 'Pukul' : 'Tembak';
      if (fire.el.textContent !== want) fire.el.textContent = want;
    }
    this.buttons.forEach(({ el, def }) => {
      if (def.toggleKey || def.toggleMouse !== undefined) el.classList.toggle('on', !!this.toggles[def.id]);
    });
  }
}
