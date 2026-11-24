// Heat (the wanted level) and the Halcyon Police Department: witnesses, pursuit cruisers, officers
// on foot who arrest or shoot, and how heat cools once the player slips out of sight.
import { CITY, HEAT, nodePos } from './config.js';
import { Vehicle, vehicles } from './vehicle.js';
import { Human } from './human.js';
import { lineBlocked, nearestNode } from './city.js';
import { steerToward, DIRS } from './traffic.js';
import { play } from './audio.js';
import { rand } from './random.js';
import * as THREE from 'three';

const eye = new THREE.Vector3();
const aim = new THREE.Vector3();
const muzzle = new THREE.Vector3();

/**
 * Shared on-foot gunfight brain for officers and gang members: close to a preferred range,
 * keep line of sight, fire in bursts with distance-based accuracy.
 */
export function updateShooter(h, dt, game, opts) {
  const p = game.player;
  const dx = p.x - h.x;
  const dz = p.z - h.z;
  const d = Math.hypot(dx, dz);
  h.heading = Math.atan2(dx, dz);
  const wantRange = opts.range;
  const blocked = lineBlocked(h.x, 1.6, h.z, p.x, 1.4, p.z);
  if (d > wantRange || blocked) {
    h.speed = opts.run ?? 5.5;
    h.aiming = false;
    const res = game.moveHuman(h, Math.sin(h.heading) * h.speed * dt, Math.cos(h.heading) * h.speed * dt);
    if (res.hit) h.heading += 0.9;
  } else {
    h.speed = 0;
  }
  if (!opts.shoot || blocked || d > wantRange + 25) { h.aiming = false; return d; }
  h.aiming = true;
  h.cool = (h.cool ?? rand() * 1.2) - dt;
  if (h.cool <= 0) {
    h.cool = opts.interval + rand() * 0.6;
    eye.set(h.x, 1.55, h.z);
    const miss = Math.min(0.9, 0.2 + d / 60 + (p.vehicle ? 0.15 : 0) + (p.body.speed > 5 ? 0.2 : 0));
    aim.set(p.x - h.x, 1.2 - 1.55, p.z - h.z).normalize();
    if (rand() < miss) { aim.x += (rand() - 0.5) * 0.3; aim.y += (rand() - 0.3) * 0.2; aim.z += (rand() - 0.5) * 0.3; aim.normalize(); }
    muzzle.set(h.x + Math.sin(h.heading) * 0.6 + Math.cos(h.heading) * -0.35, 1.5, h.z + Math.cos(h.heading) * 0.6 - Math.sin(h.heading) * -0.35);
    game.combat.shoot(h, opts.weapon, eye, aim, muzzle, false);
  }
  return d;
}

export class Police {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.unseen = 0;
    this.cops = [];
    this.cruisers = [];
    this.spawnTimer = 0;
    this.lastCrime = {};
    this.bustTimer = 0;
    this.seen = false;
  }

  /** Is anything of the police within sight of the point? */
  witnessed(x, z, range = 55) {
    for (const v of vehicles) {
      if (!v.model.police || v.wrecked) continue;
      if (Math.hypot(v.x - x, v.z - z) < range && !lineBlocked(v.x, 1.5, v.z, x, 1.5, z)) return true;
    }
    for (const c of this.cops) {
      if (c.alive && Math.hypot(c.x - x, c.z - z) < range && !lineBlocked(c.x, 1.6, c.z, x, 1.5, z)) return true;
    }
    return false;
  }

  setLevel(level) {
    const next = Math.max(0, Math.min(HEAT.max, level));
    if (next > this.level) {
      play('heat');
      this.game.stats.maxHeat = Math.max(this.game.stats.maxHeat, next);
    }
    if (next === 0 && this.level > 0) this.standDown();
    this.level = next;
    this.unseen = 0;
  }

  /** Report a crime by the player at (x, z). */
  crime(kind, x, z) {
    const now = this.game.time;
    if (this.lastCrime[kind] && now - this.lastCrime[kind] < 1.5 && kind !== 'killcop') return;
    this.lastCrime[kind] = now;
    const seen = this.witnessed(x, z);
    const L = this.level;
    switch (kind) {
      case 'gunfire': if (seen || L > 0) this.setLevel(Math.max(L, 1)); break;
      case 'assault': if (seen) this.setLevel(Math.max(L, 1)); break;
      case 'kill': this.setLevel(seen ? Math.max(L + 1, 2) : Math.max(L, 1)); break;
      case 'carjack': if (seen) this.setLevel(Math.max(L, 1)); break;
      case 'hurtcop': this.setLevel(Math.max(L, 2)); break;
      case 'killcop': this.setLevel(Math.max(L + 1, 3)); break;
      case 'copcar': this.setLevel(Math.max(L, 2)); break;
      case 'explosion': this.setLevel(Math.max(L, 2)); break;
      case 'ram': if (seen) this.setLevel(Math.max(L, 1)); break;
      default: break;
    }
    if (seen && this.level > 0) this.unseen = 0;
  }

  /** Heat back to zero: pursuers turn into ordinary traffic, officers go back to patrol. */
  standDown() {
    for (const v of this.cruisers) {
      if (v.wrecked || v.driver !== 'cop') continue;
      v.siren = false;
      v.driver = 'ai';
      const n = nearestNode(v.x, v.z);
      v.ai = { queue: [{ ...nodePos(n.i, n.j), node: [n.i, n.j], dir: 0 }], cruise: 12 };
    }
    this.cruisers = [];
    for (const c of this.cops) c.calm = true;
  }

  spawnCruiser() {
    const p = this.game.player;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const i = Math.floor(rand() * (CITY.blocks + 1));
      const j = Math.floor(rand() * (CITY.blocks + 1));
      const pos = nodePos(i, j);
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d < 85 || d > 170) continue;
      if (vehicles.some((o) => Math.hypot(o.x - pos.x, o.z - pos.z) < 8)) continue;
      const v = new Vehicle(this.game.scene, 'cruiser', null, pos.x, pos.z, Math.atan2(p.x - pos.x, p.z - pos.z));
      v.driver = 'cop';
      v.siren = true;
      v.crew = 2;
      v.stuck = 0;
      this.cruisers.push(v);
      return v;
    }
    return null;
  }

  spawnCopAt(x, z) {
    const cop = new Human(this.game.scene, 'cop', x, z, rand);
    cop.setArmed(true);
    this.cops.push(cop);
    return cop;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.cruisers = this.cruisers.filter((v) => vehicles.includes(v));
    // cruisers whose crew got out and that the chase left far behind go back to the pool
    for (const v of [...this.cruisers]) {
      if (v.driver !== 'cop' && Math.hypot(v.x - p.x, v.z - p.z) > 140 && v !== p.vehicle) {
        v.remove();
        this.cruisers.splice(this.cruisers.indexOf(v), 1);
      }
    }
    // heat cools off only while no officer can see the player
    this.seen = false;
    if (this.level > 0) {
      this.seen = this.witnessed(p.x, p.z, 70);
      if (this.seen) this.unseen = 0;
      else {
        this.unseen += dt;
        if (this.unseen > HEAT.cooldown[this.level]) this.setLevel(0);
      }
      const active = this.cruisers.filter((v) => !v.wrecked && v.driver === 'cop').length;
      const onScene = this.cruisers.filter((v) => !v.wrecked).length + this.cops.filter((c) => c.alive).length / 2;
      this.spawnTimer -= dt;
      if (active < HEAT.cops[this.level] && onScene < HEAT.cops[this.level] + 2 && this.spawnTimer <= 0) {
        this.spawnTimer = 3.5 - this.level * 0.4;
        this.spawnCruiser();
      }
    }
    let nearestSiren = Infinity;
    for (const v of this.cruisers) {
      if (v.driver !== 'cop' || v.wrecked) continue;
      nearestSiren = Math.min(nearestSiren, Math.hypot(v.x - p.x, v.z - p.z));
      this.drivePursuit(v, dt);
    }
    g.sirenLevel = this.level > 0 ? Math.max(0, 1 - nearestSiren / 150) : 0;
    this.updateCops(dt);
  }

  drivePursuit(v, dt) {
    const g = this.game;
    const p = g.player;
    const tx = p.x + (p.vehicle ? p.vehicle.vx * 0.7 : 0);
    const tz = p.z + (p.vehicle ? p.vehicle.vz * 0.7 : 0);
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    let { steer } = steerToward(v, tx, tz);
    let throttle = 1;
    let brake = 0;
    if (v.reverse > 0) {
      v.reverse -= dt;
      steer = -steer;
      throttle = 0;
      brake = 1;
    } else if (!p.vehicle && d < 22) {
      throttle = 0;
      brake = 1;
      if (Math.abs(v.speed) < 1.5 && v.crew > 0) this.unload(v);
    } else if (d < 30 && !p.vehicle) throttle = 0.4;
    if (throttle > 0 && Math.abs(v.speed) < 1.2) {
      v.stuck += dt;
      if (v.stuck > 1.4) { v.reverse = 1.1; v.stuck = 0; }
    } else v.stuck = 0;
    v.braking = brake > 0;
    v.drive(dt, { throttle, brake, steer, handbrake: false });
    v.setLights(g.sky.night, v.braking);
  }

  unload(v) {
    const left = v.doorPoint();
    const right = { x: v.x * 2 - left.x, z: v.z * 2 - left.z };
    for (let k = 0; k < v.crew; k += 1) {
      const door = k === 0 ? left : right;
      const cop = this.spawnCopAt(door.x, door.z);
      cop.heading = v.heading;
    }
    v.crew = 0;
    v.driver = null;
    v.siren = true;
    v.keep = false;
    play('door');
  }

  updateCops(dt) {
    const g = this.game;
    const p = g.player;
    let busting = false;
    for (const cop of [...this.cops]) {
      const d = Math.hypot(cop.x - p.x, cop.z - p.z);
      if ((!cop.alive && cop.deadTime > 25) || d > 200) {
        cop.remove();
        this.cops.splice(this.cops.indexOf(cop), 1);
        continue;
      }
      if (cop.alive) {
        if (this.level === 0 || cop.calm) {
          cop.aiming = false;
          cop.speed = 1.4;
          if (rand() < dt * 0.4) cop.heading += (rand() - 0.5) * 2;
          g.moveHuman(cop, Math.sin(cop.heading) * cop.speed * dt, Math.cos(cop.heading) * cop.speed * dt);
          if (this.level > 0) cop.calm = false;
        } else {
          const shoot = HEAT.shoot[this.level] && !g.player.surrendering;
          const dist = updateShooter(cop, dt, g, { range: shoot ? 14 : 1.6, shoot, weapon: this.level >= 4 ? 'smg' : 'pistol', interval: this.level >= 4 ? 0.5 : 1.1, run: 6 });
          if (dist < 2.6 && (!p.vehicle || Math.abs(p.vehicle.speed) < 1.5) && this.level <= 2) busting = true;
        }
      }
      cop.animate(dt);
      cop.sync();
    }
    // officers within reach of a slow player make the arrest
    if (busting) {
      this.bustTimer += dt;
      if (this.bustTimer > 1.8) { this.bustTimer = 0; g.onBusted(); }
    } else this.bustTimer = Math.max(0, this.bustTimer - dt);
  }

  /** Clear everything (respawn, load, mission reset). */
  reset() {
    for (const c of this.cops) c.remove();
    this.cops = [];
    for (const v of this.cruisers) v.remove();
    this.cruisers = [];
    this.level = 0;
    this.unseen = 0;
    this.bustTimer = 0;
  }
}

export { DIRS };
