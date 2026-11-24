// Nico Vale, the player: walking, sprinting, jumping, stealing and driving cars, weapons and health.
import * as THREE from 'three';
import { PLAYER, WEAPONS, WEAPON_ORDER } from './config.js';
import { Human } from './human.js';
import { vehicles } from './vehicle.js';
import { isDown, wasPressed, axis, getMouse } from './input.js';
import { play, cycleRadio } from './audio.js';

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();
const muzzle = new THREE.Vector3();

export class Player {
  constructor(game, x, z) {
    this.game = game;
    this.body = new Human(game.scene, 'player', x, z);
    this.body.health = PLAYER.maxHealth;
    this.body.isPlayer = true;
    this.vehicle = null;
    this.armor = 0;
    this.ammo = { fists: Infinity, pistol: 0, smg: 0, shotgun: 0 };
    this.owned = new Set(['fists']);
    this.weapon = 'fists';
    this.mag = 0;
    this.reload = 0;
    this.cooldown = -1;
    this.hurtFlash = 0;
    this.enterTarget = null;
  }

  get x() { return this.vehicle ? this.vehicle.x : this.body.x; }
  get z() { return this.vehicle ? this.vehicle.z : this.body.z; }
  get health() { return this.body.health; }
  set health(v) { this.body.health = v; }
  get alive() { return this.body.alive; }

  giveWeapon(id, ammo) {
    this.owned.add(id);
    this.ammo[id] = (this.ammo[id] === Infinity ? 0 : this.ammo[id]) + ammo;
    if (this.weapon === 'fists') this.selectWeapon(id);
  }

  selectWeapon(id) {
    if (!this.owned.has(id)) return;
    this.weapon = id;
    const w = WEAPONS[id];
    this.mag = w.mag ? Math.min(w.mag, this.ammo[id]) : 0;
    this.body.setArmed(!w.melee);
    play('click');
  }

  cycleWeapon(step) {
    const list = WEAPON_ORDER.filter((id) => this.owned.has(id));
    const index = list.indexOf(this.weapon);
    this.selectWeapon(list[(index + step + list.length) % list.length]);
  }

  takeDamage(amount) {
    if (!this.body.alive || this.game.mode !== 'play') return;
    if (this.armor > 0) {
      const soak = Math.min(this.armor, amount * 0.65);
      this.armor -= soak;
      amount -= soak;
    }
    this.body.health -= amount;
    this.hurtFlash = 0.5;
    play('hurt');
    if (this.body.health <= 0) {
      this.body.health = 0;
      if (this.vehicle) this.exitVehicle(true);
      this.body.alive = false;
      this.game.onDeath();
    }
  }

  /** The nearest car the player could get into. */
  nearbyVehicle() {
    let best = null;
    let bestD = 4.2;
    for (const v of vehicles) {
      if (v.wrecked) continue;
      const d = Math.hypot(v.x - this.body.x, v.z - this.body.z) - v.model.wid / 2;
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  enterVehicle(v) {
    const g = this.game;
    if (v.driver === 'ai' || v.driver === 'cop') {
      // pull the driver out: a civilian runs, an officer fights
      const door = v.doorPoint();
      if (v.driver === 'cop') {
        const cop = g.police.spawnCopAt(door.x, door.z);
        cop.calm = false;
        v.crew = 0;
        g.police.crime('hurtcop', v.x, v.z);
      } else {
        g.peds.spawnAt(door.x, door.z, true);
        g.police.crime('carjack', v.x, v.z);
      }
      g.stats.carsStolen += 1;
      g.hud.feed(`Jacked a ${v.model.name}`);
    } else if (!v.playerOwned) {
      g.stats.carsStolen += 1;
    }
    v.driver = 'player';
    v.ai = null;
    v.parked = false;
    v.siren = false;
    v.keep = true;
    v.playerOwned = true;
    this.vehicle = v;
    this.body.inVehicle = true;
    this.body.group.visible = false;
    this.body.vehicle = v;
    play('door');
    g.hud.showVehicle(v);
  }

  exitVehicle(force = false) {
    const v = this.vehicle;
    if (!v) return;
    if (!force && Math.abs(v.speed) > 14) return;
    const door = v.doorPoint();
    const res = this.game.moveHuman(this.body, 0, 0, door.x, door.z);
    this.body.x = res.x;
    this.body.z = res.z;
    this.body.heading = v.heading;
    this.body.inVehicle = false;
    this.body.vehicle = null;
    this.body.group.visible = true;
    v.driver = null;
    v.keep = true;
    this.vehicle = null;
    play('door');
    this.game.hud.showVehicle(null);
  }

  update(dt, cam) {
    const g = this.game;
    const mouse = getMouse();
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.cooldown -= dt;
    if (!this.body.alive) { this.body.animate(dt); this.body.sync(); return; }
    if (mouse.wheel) this.cycleWeapon(mouse.wheel);
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((code, i) => { if (wasPressed(code)) this.selectWeapon(WEAPON_ORDER[i]); });
    if (wasPressed('KeyF')) {
      if (this.vehicle) this.exitVehicle();
      else {
        const v = this.nearbyVehicle();
        if (v) this.enterVehicle(v);
      }
    }
    if (this.vehicle) this.updateDriving(dt, cam);
    else this.updateOnFoot(dt, cam);
    this.updateWeapon(dt, cam, mouse);
  }

  updateDriving(dt, cam) {
    const v = this.vehicle;
    const throttle = isDown('KeyW') || isDown('ArrowUp') ? 1 : 0;
    const brake = isDown('KeyS') || isDown('ArrowDown') ? 1 : 0;
    const steer = axis('KeyA', 'KeyD') + axis('ArrowLeft', 'ArrowRight');
    const handbrake = isDown('Space');
    const impact = v.drive(dt, { throttle, brake, steer: Math.max(-1, Math.min(1, steer)), handbrake });
    v.braking = brake > 0 && v.speed > 1;
    v.setLights(this.game.sky.night, v.braking);
    v.throttle = throttle;
    if (impact > 5) {
      play('crash');
      this.game.effects.sparks(v.x + v.forwardX * 2, 0.6, v.z + v.forwardZ * 2, 10);
      this.game.effects.shake = Math.max(this.game.effects.shake, Math.min(0.8, impact / 25));
      if (impact > 16) this.takeDamage((impact - 16) * 0.8);
    }
    if ((handbrake || v.drift > 4) && Math.abs(v.speed) > 8) this.game.effects.tireSmoke(v.x - v.forwardX * 2, v.z - v.forwardZ * 2);
    if (wasPressed('KeyH')) { play('horn'); this.game.peds.panic(v.x, v.z, 10); }
    if (wasPressed('KeyR')) this.game.hud.toast(cycleRadio());
    this.game.stats.distance += Math.abs(v.speed) * dt;
    this.body.x = v.x;
    this.body.z = v.z;
    this.body.heading = v.heading;
  }

  updateOnFoot(dt, cam) {
    const b = this.body;
    const f = axis('KeyS', 'KeyW');
    const s = axis('KeyA', 'KeyD');
    const run = isDown('ShiftLeft') || isDown('ShiftRight');
    const aiming = getMouse().right || this.cooldown > -0.4;
    const yaw = cam.yaw;
    let mx = Math.sin(yaw) * f - Math.cos(yaw) * s;
    let mz = Math.cos(yaw) * f + Math.sin(yaw) * s;
    const len = Math.hypot(mx, mz);
    const speed = len > 0 ? (run && !aiming ? PLAYER.run : PLAYER.walk) : 0;
    if (len > 0) { mx /= len; mz /= len; }
    b.speed += (speed - b.speed) * Math.min(1, dt * 10);
    if (aiming && this.weapon !== 'fists') b.heading = yaw;
    else if (len > 0) {
      const want = Math.atan2(mx, mz);
      b.heading += Math.atan2(Math.sin(want - b.heading), Math.cos(want - b.heading)) * Math.min(1, dt * 12);
    }
    b.aiming = aiming && this.weapon !== 'fists';
    // gravity and jumping
    if (wasPressed('Space') && b.y <= 0.001) b.vy = 5.2;
    b.vy -= 14 * dt;
    b.y = Math.max(0, b.y + b.vy * dt);
    if (b.y === 0) b.vy = 0;
    this.game.moveHuman(b, mx * b.speed * dt, mz * b.speed * dt);
    b.animate(dt);
    b.sync();
  }

  updateWeapon(dt, cam, mouse) {
    const w = WEAPONS[this.weapon];
    const b = this.body;
    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) this.mag = Math.min(w.mag, this.ammo[this.weapon]);
      return;
    }
    if (!this.vehicle && wasPressed('KeyR') && w.mag && this.mag < w.mag && this.ammo[this.weapon] > this.mag) { this.reload = 1.2; play('click'); return; }
    const wants = w.rate < 0.2 ? mouse.left : mouse.clicked || mouse.left;
    if (!wants || this.cooldown > 0) return;
    if (this.vehicle && (w.melee || this.weapon === 'shotgun')) return;
    this.cooldown = w.rate;
    if (w.melee) {
      b.armR.rotation.x = -Math.PI / 2;
      this.game.combat.melee(b, true);
      return;
    }
    if (this.mag <= 0) {
      if (this.ammo[this.weapon] > 0) this.reload = 1.2; else play('empty');
      return;
    }
    this.mag -= 1;
    this.ammo[this.weapon] -= 1;
    cam.camera.getWorldPosition(eye);
    cam.camera.getWorldDirection(dir);
    // start the ray at the player so nothing between the camera and Nico is hit
    const skip = eye.distanceTo(new THREE.Vector3(b.x, 1.5, b.z));
    eye.addScaledVector(dir, skip * 0.9);
    const hx = this.vehicle ? this.vehicle.x : b.x;
    const hz = this.vehicle ? this.vehicle.z : b.z;
    muzzle.set(hx + Math.sin(b.heading) * 0.7 + Math.cos(b.heading) * -0.37, this.vehicle ? 1.6 : 1.5, hz + Math.cos(b.heading) * 0.7 - Math.sin(b.heading) * -0.37);
    const hit = this.game.combat.shoot(b, this.weapon, eye, dir, muzzle, true);
    if (hit) this.game.hud.hitMarker();
    cam.kick += w.pellets ? 0.05 : 0.015;
  }
}
