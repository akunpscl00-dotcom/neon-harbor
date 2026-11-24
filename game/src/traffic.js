// Civilian traffic: cars that follow the street grid in their lane, turn at junctions, brake for
// obstacles, plus cars parked at the curb. Spawns around the player and recycles what falls behind.
import { CITY, TRAFFIC_MODELS, VEHICLES, nodePos } from './config.js';
import { Vehicle, vehicles } from './vehicle.js';
import { rand, pick, chance } from './random.js';

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const LANE = 4;
const MOVING = 18;
const PARKED = 10;

function laneOffset(dir) {
  const [dx, dz] = DIRS[dir];
  return [-dz * LANE, dx * LANE];
}

function approachPoint(i, j, dir) {
  const p = nodePos(i, j);
  const [ox, oz] = laneOffset(dir);
  const [dx, dz] = DIRS[dir];
  return { x: p.x + ox - dx * 11, z: p.z + oz - dz * 11, node: [i, j], dir };
}

function exitPoint(i, j, dir) {
  const p = nodePos(i, j);
  const [ox, oz] = laneOffset(dir);
  const [dx, dz] = DIRS[dir];
  return { x: p.x + ox + dx * 10, z: p.z + oz + dz * 10 };
}

function validDirs(i, j, from) {
  const out = [];
  for (let d = 0; d < 4; d += 1) {
    if (from !== undefined && d === (from + 2) % 4) continue;
    const ni = i + DIRS[d][0];
    const nj = j + DIRS[d][1];
    if (ni < 0 || nj < 0 || ni > CITY.blocks || nj > CITY.blocks) continue;
    out.push(d);
  }
  return out;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Steering value (-1..1, +1 = right) that turns a car toward a point, and the heading error. */
export function steerToward(v, tx, tz) {
  const want = Math.atan2(tx - v.x, tz - v.z);
  const diff = wrap(want - v.heading);
  return { steer: Math.max(-1, Math.min(1, -diff * 2.2)), diff };
}

/** Clear distance ahead of a car before the nearest car or person in its path (Infinity if clear). */
export function clearAhead(v, people, range = 16) {
  const fx = v.forwardX;
  const fz = v.forwardZ;
  let best = Infinity;
  const test = (x, z, width) => {
    const dx = x - v.x;
    const dz = z - v.z;
    const along = dx * fx + dz * fz;
    if (along <= 0 || along > range) return;
    const side = Math.abs(dx * -fz + dz * fx);
    if (side < width) best = Math.min(best, along);
  };
  for (const o of vehicles) if (o !== v && !o.hidden) test(o.x, o.z, 2.3);
  for (const p of people) if (p.alive && !p.inVehicle) test(p.x, p.z, 1.6);
  return best;
}

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.honkTimer = 0;
  }

  /** Spawn one moving car on a lane somewhere in the ring around (fx, fz). */
  spawnMoving(fx, fz, minDist = 70, maxDist = 170) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const i = Math.floor(rand() * (CITY.blocks + 1));
      const j = Math.floor(rand() * (CITY.blocks + 1));
      const dirs = validDirs(i, j);
      const dir = pick(dirs);
      const ni = i + DIRS[dir][0];
      const nj = j + DIRS[dir][1];
      const a = nodePos(i, j);
      const t = 0.3 + rand() * 0.4;
      const [ox, oz] = laneOffset(dir);
      const x = a.x + (DIRS[dir][0] * CITY.cell * t) + ox;
      const z = a.z + (DIRS[dir][1] * CITY.cell * t) + oz;
      const d = Math.hypot(x - fx, z - fz);
      if (d < minDist || d > maxDist) continue;
      if (vehicles.some((o) => Math.hypot(o.x - x, o.z - z) < 10)) continue;
      const modelId = pick(TRAFFIC_MODELS);
      const car = new Vehicle(this.scene, modelId, pick(VEHICLES[modelId].colors), x, z, Math.atan2(DIRS[dir][0], DIRS[dir][1]));
      car.driver = 'ai';
      car.ai = { queue: [approachPoint(ni, nj, dir)], cruise: 10 + rand() * 5 };
      const sp = car.ai.cruise * 0.8;
      car.vx = DIRS[dir][0] * sp;
      car.vz = DIRS[dir][1] * sp;
      return car;
    }
    return null;
  }

  spawnParked(fx, fz) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const i = Math.floor(rand() * (CITY.blocks + 1));
      const j = Math.floor(rand() * CITY.blocks);
      const a = nodePos(i, j);
      const side = chance(0.5) ? 1 : -1;
      const x = a.x + side * 6.3;
      const z = a.z + 14 + rand() * (CITY.cell - 28);
      const d = Math.hypot(x - fx, z - fz);
      if (d < 60 || d > 160) continue;
      if (vehicles.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
      const modelId = pick(TRAFFIC_MODELS);
      const car = new Vehicle(this.scene, modelId, pick(VEHICLES[modelId].colors), x, z, side > 0 ? 0 : Math.PI);
      car.parked = true;
      return car;
    }
    return null;
  }

  /** Drive every AI car one step. people: humans to brake for. */
  update(dt, focus, people, night) {
    const moving = vehicles.filter((v) => v.ai && v.driver === 'ai');
    const parked = vehicles.filter((v) => v.parked && !v.driver);
    if (moving.length < MOVING) this.spawnMoving(focus.x, focus.z);
    if (parked.length < PARKED) this.spawnParked(focus.x, focus.z);
    for (const v of [...vehicles]) {
      const d = Math.hypot(v.x - focus.x, v.z - focus.z);
      if (v.driver !== 'player' && !v.keep && d > 240) { v.remove(); continue; }
      if (v.driver !== 'ai' || !v.ai) continue;
      this.driveAI(v, dt, people, night);
    }
  }

  driveAI(v, dt, people, night) {
    const ai = v.ai;
    let target = ai.queue[0];
    if (!target) return;
    if (Math.hypot(target.x - v.x, target.z - v.z) < 4.5) {
      ai.queue.shift();
      if (target.node) {
        const [i, j] = target.node;
        const nd = pick(validDirs(i, j, target.dir));
        ai.queue.push(exitPoint(i, j, nd), approachPoint(i + DIRS[nd][0], j + DIRS[nd][1], nd));
      }
      target = ai.queue[0];
    }
    const { steer, diff } = steerToward(v, target.x, target.z);
    let want = ai.cruise * (Math.abs(diff) > 0.4 ? 0.55 : 1);
    const gap = ai.reckless ? Infinity : clearAhead(v, people);
    if (gap < 14) want = Math.min(want, Math.max(0, (gap - 5) * 1.2));
    if (ai.panic > 0) { ai.panic -= dt; want = ai.cruise * 1.8; }
    const fwd = v.speed;
    const controls = { throttle: fwd < want ? 1 : 0, brake: fwd > want + 1.5 ? 1 : 0, steer, handbrake: false };
    if (gap < 6 && fwd < 1) {
      controls.throttle = 0;
      controls.brake = 0;
      v.vx *= 0.9; v.vz *= 0.9;
      ai.blocked = (ai.blocked ?? 0) + dt;
    } else ai.blocked = 0;
    v.braking = controls.brake > 0 || gap < 10;
    v.drive(dt, controls);
    v.setLights(night, v.braking);
    if (ai.blocked > 2.5 && v.horn <= 0) v.horn = 3;
  }
}
