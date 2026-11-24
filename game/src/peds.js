// Pedestrians: people strolling the sidewalk rings, who scatter at gunfire and can be run down.
import { CITY } from './config.js';
import { Human } from './human.js';
import { allBlocks, sidewalkPoint, collideCircle } from './city.js';
import { vehicles } from './vehicle.js';
import { rand, pick, chance } from './random.js';

const MAX_PEDS = 34;
const PERIMETER = 4 * (CITY.block - CITY.sidewalk);

export class Pedestrians {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  spawn(focus) {
    const candidates = allBlocks().filter((b) => {
      const d = Math.hypot(b.cx - focus.x, b.cz - focus.z);
      return d > 30 && d < 150;
    });
    if (!candidates.length) return;
    const block = pick(candidates);
    const t = rand();
    const p = sidewalkPoint(block, t);
    if (Math.hypot(p.x - focus.x, p.z - focus.z) < 35) return;
    const ped = new Human(this.scene, 'ped', p.x, p.z, rand);
    ped.block = block;
    ped.t = t;
    ped.dirSign = chance(0.5) ? 1 : -1;
    ped.walkSpeed = 1.2 + rand() * 0.6;
    ped.offset = (rand() - 0.5) * 1.6;
    ped.state = 'walk';
    ped.idle = 0;
    this.list.push(ped);
  }

  /** A frightened person at a spot (a carjacked driver). */
  spawnAt(x, z, flee) {
    const ped = new Human(this.scene, 'ped', x, z, rand);
    ped.state = flee ? 'flee' : 'free';
    ped.fleeTime = 6;
    ped.fromX = x - 1;
    ped.fromZ = z - 1;
    this.list.push(ped);
    return ped;
  }

  /** Everyone within radius of (x, z) runs away from it. */
  panic(x, z, radius) {
    for (const ped of this.list) {
      if (!ped.alive) continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) {
        ped.state = 'flee';
        ped.fleeTime = 5 + rand() * 4;
        ped.fromX = x;
        ped.fromZ = z;
      }
    }
  }

  update(dt, focus) {
    if (this.list.filter((p) => p.alive).length < MAX_PEDS && chance(0.5)) this.spawn(focus);
    for (const ped of [...this.list]) {
      const d = Math.hypot(ped.x - focus.x, ped.z - focus.z);
      if (d > 180 || (!ped.alive && ped.deadTime > 30)) {
        ped.remove();
        this.list.splice(this.list.indexOf(ped), 1);
        continue;
      }
      if (ped.alive) this.think(ped, dt);
      ped.animate(dt);
      ped.sync();
    }
  }

  think(ped, dt) {
    if (ped.state === 'walk') {
      if (ped.idle > 0) { ped.idle -= dt; ped.speed = 0; return; }
      if (chance(dt * 0.03)) ped.idle = 2 + rand() * 4;
      ped.t = (ped.t + (ped.dirSign * ped.walkSpeed * dt) / PERIMETER + 1) % 1;
      const p = sidewalkPoint(ped.block, ped.t);
      // keep a personal offset from the sidewalk's centre line
      const toCx = ped.block.cx - p.x;
      const toCz = ped.block.cz - p.z;
      const len = Math.hypot(toCx, toCz) || 1;
      const nx = p.x + (toCx / len) * ped.offset * 0.5;
      const nz = p.z + (toCz / len) * ped.offset * 0.5;
      const mx = nx - ped.x;
      const mz = nz - ped.z;
      if (mx * mx + mz * mz > 1e-6) ped.heading = Math.atan2(mx, mz);
      ped.x = nx;
      ped.z = nz;
      ped.speed = ped.walkSpeed;
      return;
    }
    // fleeing or wandering free: run away, steering round buildings
    if (ped.state === 'flee') {
      ped.fleeTime -= dt;
      const away = Math.atan2(ped.x - ped.fromX, ped.z - ped.fromZ);
      ped.heading += Math.atan2(Math.sin(away - ped.heading), Math.cos(away - ped.heading)) * Math.min(1, dt * 4);
      ped.speed = 6.5;
      if (ped.fleeTime <= 0) { ped.state = 'free'; ped.speed = 1.6; }
    } else {
      ped.speed = 1.6;
      if (chance(dt * 0.3)) ped.heading += (rand() - 0.5) * 1.5;
    }
    const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
    const res = collideCircle(nx, nz, 0.4, 0.5);
    if (res.hit) ped.heading += 1.2;
    ped.x = res.x;
    ped.z = res.z;
  }
}

/**
 * Cars knocking people down: any moving car overlapping a person hurts them.
 * Returns a list of { human, vehicle, killed } for the crime and sound systems.
 */
export function vehicleStrikes(humans, dt) {
  const events = [];
  for (const h of humans) if (h.hitCooldown > 0) h.hitCooldown -= dt;
  for (const v of vehicles) {
    const sp = Math.hypot(v.vx, v.vz);
    if (sp < 3.5) continue;
    for (const h of humans) {
      if (!h.alive || h.inVehicle || h.hitCooldown > 0) continue;
      const dx = h.x - v.x;
      const dz = h.z - v.z;
      if (dx * dx + dz * dz > 16) continue;
      // in the car's own frame
      const along = dx * v.forwardX + dz * v.forwardZ;
      const side = dx * -v.forwardZ + dz * v.forwardX;
      if (Math.abs(along) > v.model.len / 2 + 0.4 || Math.abs(side) > v.model.wid / 2 + 0.4) continue;
      // the player's own body takes the hit through Player.takeDamage (armor, death screen), never here
      const killed = h.isPlayer ? false : h.damage(sp * 6, v.x, v.z);
      // shove them out of the way
      h.x += (side >= 0 ? 1 : -1) * -v.forwardZ * 1.2;
      h.z += (side >= 0 ? 1 : -1) * v.forwardX * 1.2;
      h.hitCooldown = 0.5;
      events.push({ human: h, vehicle: v, killed, speed: sp });
    }
  }
  return events;
}
