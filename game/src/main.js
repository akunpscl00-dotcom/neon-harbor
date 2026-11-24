// Neon Harbor: boots the city and every system, runs the frame loop, and owns the game's modes
// (title, play, pause, shop, flatlined), money, the clock, saving and respawning.
import * as THREE from 'three';
import { CLOCK, blockCenter, roadCenter } from './config.js';
import { buildCity, collideCircle, districtAt } from './city.js';
import { Sky } from './sky.js';
import { Effects } from './effects.js';
import { Traffic } from './traffic.js';
import { Pedestrians, vehicleStrikes } from './peds.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { Places, PLACES, LANDMARKS } from './places.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { CameraRig } from './camera.js';
import { Vehicle, vehicles, separateVehicles } from './vehicle.js';
import { initInput, wasPressed, endFrame, lockPointer, unlockPointer } from './input.js';
import { initAudio, play, setEngine, setSiren, setRadioEnabled, volume, setVolumes } from './audio.js';
import { readSave, writeSave, readSettings } from './save.js';
import { stageShot } from './shots.js';

const freshStats = () => ({ missions: 0, carsStolen: 0, carsSold: 0, distance: 0, kills: 0, maxHeat: 0, deaths: 0, busts: 0, playTime: 0 });

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2400);
    this.rig = new CameraRig(this.camera);
    buildCity(this.scene);
    this.sky = new Sky(this.scene);
    this.effects = new Effects(this.scene);
    this.traffic = new Traffic(this.scene);
    this.peds = new Pedestrians(this.scene);
    this.police = new Police(this);
    this.combat = new Combat(this);
    this.player = new Player(this, PLACES.safehouse.x, PLACES.safehouse.z + 2);
    this.places = new Places(this);
    this.missions = new Missions(this);
    this.hud = new Hud(this);
    this.menu = new Menu(this);
    this.money = 0;
    this.clock = CLOCK.start;
    this.time = 0;
    this.stats = freshStats();
    this.mode = 'title';
    this.sirenLevel = 0;
    this.deadTimer = 0;
    this.titleAngle = 0;
    const settings = readSettings();
    if (settings) {
      Object.assign(volume, { master: settings.master, music: settings.music, sfx: settings.sfx });
      this.rig.sensitivity = settings.sensitivity ?? this.rig.sensitivity;
    }
    initInput(this.canvas);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', () => { initAudio(); setVolumes(); });
    this.canvas.addEventListener('click', () => { if (this.mode === 'play') lockPointer(); });
    this.resize();
    this.player.body.group.visible = false;
    this.last = performance.now();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onKey(e) {
    initAudio();
    if (this.mode === 'title') {
      if (document.getElementById('pause').classList.contains('hidden')) this.menu.titleKey(e.code);
      else if (e.code === 'Escape') this.menu.closePause();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.mode === 'play') this.pause();
      else if (this.mode === 'pause') this.resume();
      else if (this.mode === 'shop') this.menu.closeShop();
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'play') lockPointer(); else unlockPointer();
    setRadioEnabled(mode === 'play' && !!this.player.vehicle);
  }

  pause() {
    this.setMode('pause');
    this.menu.openPause();
    play('click');
  }

  resume() {
    this.menu.closePause();
    this.setMode('play');
  }

  addMoney(amount) {
    this.money = Math.max(0, this.money + amount);
    if (amount > 0) this.hud.feed(`+$${amount.toLocaleString('en-US')}`);
  }

  /** Move a person by (dx, dz), or to (x, z), sliding along walls and off car bodies. */
  moveHuman(h, dx, dz, x = h.x + dx, z = h.z + dz) {
    let res = collideCircle(x, z, 0.4, h.y);
    for (const v of vehicles) {
      if (v === h.vehicle) continue;
      const ox = res.x - v.x;
      const oz = res.z - v.z;
      if (ox * ox + oz * oz > 16) continue;
      const along = ox * v.forwardX + oz * v.forwardZ;
      const side = ox * -v.forwardZ + oz * v.forwardX;
      const hl = v.model.len / 2 + 0.35;
      const hw = v.model.wid / 2 + 0.35;
      if (Math.abs(along) < hl && Math.abs(side) < hw && h.y < v.model.hgt) {
        const pushA = hl - Math.abs(along);
        const pushS = hw - Math.abs(side);
        if (pushS < pushA) {
          const s = Math.sign(side) * pushS;
          res = { ...res, x: res.x - v.forwardZ * s, z: res.z + v.forwardX * s, hit: true };
        } else {
          const s = Math.sign(along) * pushA;
          res = { ...res, x: res.x + v.forwardX * s, z: res.z + v.forwardZ * s, hit: true };
        }
      }
    }
    h.x = res.x;
    h.z = res.z;
    return res;
  }

  // ---- starting, saving, respawning ----
  resetWorld() {
    this.police.reset();
    this.missions.abort('');
    for (const v of [...vehicles]) v.remove();
    for (const ped of this.peds.list) ped.remove();
    this.peds.list = [];
    for (const e of this.missions.enemies) e.remove();
    this.missions.enemies = [];
    this.hud.setObjective('', '');
    this.hud.subtitle('');
    if (this.player.vehicle) this.player.exitVehicle(true);
  }

  placePlayer(x, z, heading = 0) {
    const b = this.player.body;
    b.x = x;
    b.z = z;
    b.y = 0;
    b.heading = heading;
    b.alive = true;
    b.fall = 0;
    b.group.rotation.x = 0;
    b.group.visible = true;
    b.inVehicle = false;
    this.rig.snapBehind(heading);
  }

  startPlaying() {
    this.menu.hideTitle();
    this.menu.closePause();
    this.hud.show(true);
    this.hud.showVehicle(null);
    this.setMode('play');
  }

  newGame() {
    this.resetWorld();
    this.money = 250;
    this.clock = CLOCK.start;
    this.stats = freshStats();
    const p = this.player;
    p.owned = new Set(['fists']);
    p.ammo = { fists: Infinity, pistol: 0, smg: 0, shotgun: 0 };
    p.selectWeapon('fists');
    p.armor = 0;
    p.body.health = 100;
    this.places.setTokensTaken([]);
    this.placePlayer(PLACES.safehouse.x, PLACES.safehouse.z - 1.5, Math.PI);
    // a car waiting at the curb outside Bayview
    const car = new Vehicle(this.scene, 'vela', '#3fd6c6', roadCenter(2) + 6.3, blockCenter(6) + 22, Math.PI);
    car.parked = true;
    this.missions.next = 0;
    this.startPlaying();
    this.missions.begin(0);
  }

  continueGame() {
    const save = readSave();
    if (!save) { this.newGame(); return; }
    this.resetWorld();
    const p = this.player;
    this.money = save.money;
    this.clock = save.clock;
    this.stats = { ...freshStats(), ...save.stats };
    p.owned = new Set(save.owned);
    p.ammo = { fists: Infinity, pistol: 0, smg: 0, shotgun: 0, ...save.ammo };
    p.selectWeapon(save.weapon);
    p.armor = save.player.armor;
    p.body.health = save.player.health;
    this.places.setTokensTaken(save.tokens);
    this.missions.next = save.next;
    this.placePlayer(save.player.x, save.player.z, 0);
    this.missions.refreshStartMarker();
    this.startPlaying();
    this.hud.big('WELCOME BACK', 'Port Halcyon');
  }

  saveGame(auto = false) {
    const ok = writeSave(this);
    this.hud.feed(ok ? (auto ? 'Autosaved' : 'Game saved') : 'Could not save in this browser');
  }

  quitToTitle() {
    this.menu.closePause();
    this.resetWorld();
    this.hud.show(false);
    this.player.body.group.visible = false;
    this.mode = 'title';
    unlockPointer();
    this.menu.showTitle();
  }

  onDeath() {
    this.stats.deaths += 1;
    this.mode = 'dead';
    this.deadTimer = 4;
    this.missions.abort('Nico went down');
    this.hud.big('FLATLINED', 'Saint Mira Medical will patch you up');
    play('fail');
  }

  onBusted() {
    if (this.mode !== 'play') return;
    this.stats.busts += 1;
    this.mode = 'dead';
    this.busted = true;
    this.deadTimer = 4;
    if (this.player.vehicle) this.player.exitVehicle(true);
    this.missions.abort('Nico was arrested');
    this.hud.big('CUFFED', 'Harborside Precinct keeps your hardware');
    play('fail');
  }

  respawn() {
    const busted = this.busted;
    this.busted = false;
    this.police.reset();
    const fee = Math.min(1000, Math.round(this.money * 0.1));
    this.addMoney(-fee);
    const p = this.player;
    if (busted) {
      p.owned = new Set(['fists']);
      p.selectWeapon('fists');
    }
    p.body.health = 100;
    const at = busted ? LANDMARKS.precinct : LANDMARKS.hospital;
    this.placePlayer(at.x, at.z, 0);
    this.clock = (this.clock + 6) % 24;
    this.mode = 'play';
    this.hud.feed(`${busted ? 'Bail' : 'Hospital bill'}: $${fee}`);
  }

  // ---- the frame ----
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.render();
    endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Advance the whole world by dt seconds. */
  step(dt) {
    this.time += dt;
    if (this.mode === 'title') { this.stepTitle(dt); return; }
    if (this.mode === 'pause' || this.mode === 'shop') return;
    const p = this.player;
    this.stats.playTime += dt;
    this.clock = (this.clock + (dt * CLOCK.minutesPerSecond) / 60) % 24;
    if (this.mode === 'dead') {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
    } else {
      const wasIn = !!p.vehicle;
      p.update(dt, this.rig);
      if (wasIn !== !!p.vehicle) setRadioEnabled(!!p.vehicle);
    }
    this.stepWorld(dt, p);
    this.places.update(dt, this.time);
    this.missions.update(dt);
    if (this.mode === 'play') this.hud.district(districtAt(p.x, p.z));
    this.rig.update(dt, p, this.effects.shake);
    this.hud.update(dt, this.rig.yaw, this.time);
    const v = p.vehicle;
    setEngine(!!v && this.mode === 'play', v ? Math.min(1, Math.abs(v.speed) / v.model.maxSpeed) : 0, v ? v.throttle ?? 0 : 0);
    setSiren(this.sirenLevel);
  }

  /** The parts of the world that run in every mode but pause: traffic, people, police, effects. */
  stepWorld(dt, p) {
    const focus = { x: p.x, z: p.z };
    const people = [...this.peds.list, ...this.police.cops, ...this.missions.enemies, p.body];
    this.traffic.update(dt, focus, people, this.sky.night);
    if (this.mode !== 'title') this.police.update(dt);
    this.peds.update(dt, focus);
    this.combat.updateWrecks(dt);
    for (const [a, b, speed] of separateVehicles()) {
      if (speed < 4) continue;
      const mine = a.driver === 'player' || b.driver === 'player';
      a.damage(speed * 0.8);
      b.damage(speed * 0.8);
      if (mine) {
        play('crash');
        const other = a.driver === 'player' ? b : a;
        other.lastHitByPlayer = true;
        if (other.model.police) this.police.crime('copcar', other.x, other.z);
        else this.police.crime('ram', other.x, other.z);
        if (other.ai) other.ai.panic = 4;
        this.effects.sparks((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2, 12);
        this.effects.shake = Math.max(this.effects.shake, Math.min(0.6, speed / 25));
      } else if (speed > 8) play('crash', Math.hypot(a.x - p.x, a.z - p.z));
    }
    for (const hit of vehicleStrikes(people, dt)) {
      if (hit.human === p.body) { p.takeDamage(hit.speed * 2.5); continue; }
      play('punch', Math.hypot(hit.human.x - p.x, hit.human.z - p.z));
      this.effects.blood(hit.human.x, 1, hit.human.z);
      if (hit.vehicle.driver === 'player') {
        if (hit.killed) this.stats.kills += 1;
        this.police.crime(hit.human.kind === 'cop' ? (hit.killed ? 'killcop' : 'hurtcop') : hit.killed ? 'kill' : 'assault', hit.human.x, hit.human.z);
        this.peds.panic(hit.human.x, hit.human.z, 25);
      }
    }
    for (const v of vehicles) {
      if (!v.ai && v.driver !== 'player' && v.driver !== 'cop') {
        // empty cars roll to a stop
        v.drive(dt, { throttle: 0, brake: 0, steer: 0, handbrake: true });
        v.setLights(this.sky.night, false);
      }
      if (v.horn > 0) {
        if (v.horn === 3) play('horn', Math.hypot(v.x - p.x, v.z - p.z));
        v.horn -= dt;
      }
      v.updateVisual(this.time);
    }
    this.effects.update(dt);
    this.sky.update(this.clock, focus);
  }

  /** Behind the title screen: the city lives on while the camera circles Sundial Heights at golden hour. */
  stepTitle(dt) {
    this.titleAngle += dt * 0.05;
    const cx = blockCenter(4);
    const cz = blockCenter(5);
    const p = this.player;
    p.body.x = cx + Math.sin(this.titleAngle) * 60;
    p.body.z = cz + Math.cos(this.titleAngle) * 60;
    this.stepWorld(dt, p);
    this.camera.position.set(cx + Math.sin(this.titleAngle) * 150, 55, cz + Math.cos(this.titleAngle) * 150);
    this.camera.lookAt(cx, 30, cz);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
window.neonHarbor = game;
const params = new URLSearchParams(location.search);
if (params.has('shot')) {
  stageShot(game, params.get('shot'));
} else {
  game.menu.showTitle();
  requestAnimationFrame((t) => game.frame(t));
}
