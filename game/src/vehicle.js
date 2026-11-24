// Cars: low-poly bodies, arcade driving physics with drift, damage, smoke and explosions.
import * as THREE from 'three';
import { VEHICLES } from './config.js';
import { collideCircle } from './city.js';

const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: '#1c1c1c' });
const glassMat = new THREE.MeshPhongMaterial({ color: '#1d2b45', shininess: 120, specular: '#ffffff' });
const charMat = new THREE.MeshLambertMaterial({ color: '#2a2422' });
const trimMat = new THREE.MeshLambertMaterial({ color: '#d9d9d9' });
const bodyMats = new Map();

function bodyMat(color) {
  if (!bodyMats.has(color)) bodyMats.set(color, new THREE.MeshPhongMaterial({ color, shininess: 70, specular: '#ffffff' }));
  return bodyMats.get(color);
}

export const vehicles = [];

export class Vehicle {
  constructor(scene, modelId, color, x, z, heading) {
    const model = VEHICLES[modelId];
    this.scene = scene;
    this.modelId = modelId;
    this.model = model;
    this.color = color ?? model.colors[0];
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.steerVisual = 0;
    this.health = 100;
    this.wrecked = false;
    this.burning = 0;
    this.driver = null; // 'player', 'ai', 'cop' or null
    this.siren = false;
    this.horn = 0;
    this.radius = Math.max(model.len, model.wid) / 2;
    this.wheelSpin = 0;
    this.smokeTimer = 0;
    this.group = this.buildMesh();
    scene.add(this.group);
    this.sync();
    vehicles.push(this);
  }

  buildMesh() {
    const m = this.model;
    const g = new THREE.Group();
    const body = bodyMat(this.color);
    const lower = m.hgt * 0.5;
    const add = (geometry, material, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(m.wid, lower, m.len), body, 0, 0.35 + lower / 2, 0);
    let cabinLen = m.len * m.cabin;
    let cabinZ = -m.len * 0.06;
    if (this.modelId === 'tidewater') { cabinLen = m.len * 0.86; cabinZ = -m.len * 0.04; }
    if (this.modelId === 'dune') { cabinZ = m.len * 0.08; }
    const cabinH = m.hgt * 0.45;
    add(new THREE.BoxGeometry(m.wid * 0.86, cabinH, cabinLen), glassMat, 0, 0.35 + lower + cabinH / 2, cabinZ);
    add(new THREE.BoxGeometry(m.wid * 0.88, 0.08, cabinLen * 0.92), body, 0, 0.35 + lower + cabinH + 0.04, cabinZ);
    if (this.modelId === 'dune') {
      add(new THREE.BoxGeometry(m.wid, 0.4, 0.12), body, 0, 0.35 + lower + 0.2, -m.len / 2 + 0.06);
    }
    if (this.modelId === 'sabre') {
      add(new THREE.BoxGeometry(m.wid * 0.9, 0.08, 0.5), trimMat, 0, 0.35 + lower + 0.35, -m.len / 2 + 0.3);
      add(new THREE.BoxGeometry(0.1, 0.35, 0.1), trimMat, -0.6, 0.35 + lower + 0.17, -m.len / 2 + 0.3);
      add(new THREE.BoxGeometry(0.1, 0.35, 0.1), trimMat, 0.6, 0.35 + lower + 0.17, -m.len / 2 + 0.3);
    }
    if (m.police) {
      add(new THREE.BoxGeometry(m.wid + 0.02, lower * 0.5, m.len * 0.55), bodyMat('#14213d'), 0, 0.35 + lower * 0.55, -0.1);
      this.barRed = new THREE.MeshLambertMaterial({ color: '#ff2d55', emissive: '#ff2d55', emissiveIntensity: 0 });
      this.barBlue = new THREE.MeshLambertMaterial({ color: '#2d7bff', emissive: '#2d7bff', emissiveIntensity: 0 });
      const y = 0.35 + lower + cabinH + 0.16;
      add(new THREE.BoxGeometry(0.6, 0.18, 0.3), this.barRed, -0.35, y, cabinZ);
      add(new THREE.BoxGeometry(0.6, 0.18, 0.3), this.barBlue, 0.35, y, cabinZ);
    }
    this.headMat = new THREE.MeshLambertMaterial({ color: '#fff9e0', emissive: '#fff2c0', emissiveIntensity: 0.2 });
    this.tailMat = new THREE.MeshLambertMaterial({ color: '#b3001b', emissive: '#ff1a1a', emissiveIntensity: 0.2 });
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.42, 0.18, 0.06), this.headMat, side * (m.wid / 2 - 0.3), 0.35 + lower * 0.7, m.len / 2 + 0.01);
      add(new THREE.BoxGeometry(0.42, 0.16, 0.06), this.tailMat, side * (m.wid / 2 - 0.3), 0.35 + lower * 0.75, -m.len / 2 - 0.01);
    }
    this.wheels = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (m.wid / 2 - 0.12), 0.38, sz * (m.len / 2 - 0.85));
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.castShadow = true;
      pivot.add(wheel);
      g.add(pivot);
      this.wheels.push({ pivot, wheel, front: sz > 0 });
    }
    return g;
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }

  /**
   * One physics step. controls: throttle (0..1), brake (0..1, reverses when stopped), steer (-1 left .. 1 right), handbrake.
   * Returns the strongest impact speed this step (for damage, sparks and sounds).
   */
  drive(dt, controls) {
    const m = this.model;
    let impact = 0;
    if (this.wrecked) controls = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let rx = -fz;
    let rz = fx;
    let forward = this.vx * fx + this.vz * fz;
    let lateral = this.vx * rx + this.vz * rz;
    const top = m.maxSpeed * (this.health < 30 ? 0.7 : 1);
    if (controls.throttle > 0) {
      const room = Math.max(0, 1 - forward / top);
      forward += m.accel * controls.throttle * (0.35 + room * 0.65) * dt * (forward < 0 ? 2.2 : 1);
    }
    if (controls.brake > 0) {
      if (forward > 0.5) forward -= 30 * controls.brake * dt;
      else forward = Math.max(-top * 0.32, forward - m.accel * 0.6 * controls.brake * dt);
    }
    if (!controls.throttle && !controls.brake) forward -= Math.sign(forward) * Math.min(Math.abs(forward), 3.2 * dt);
    forward -= forward * 0.06 * dt;
    if (controls.handbrake) forward -= Math.sign(forward) * Math.min(Math.abs(forward), 9 * dt);
    // steering grows with speed then tightens again at the top end
    const speedFactor = Math.min(1, Math.abs(forward) / 7) * (1 - 0.45 * Math.min(1, Math.abs(forward) / top));
    const targetYaw = -controls.steer * 2.3 * speedFactor * Math.sign(forward || 1) * (controls.handbrake ? 1.35 : 1);
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, dt * 8);
    this.heading += this.yawRate * dt;
    this.steerVisual += (controls.steer - this.steerVisual) * Math.min(1, dt * 10);
    const grip = controls.handbrake ? 1.4 : m.grip;
    lateral *= Math.exp(-grip * dt);
    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    rx = -fz;
    rz = fx;
    this.vx = fx * forward + rx * lateral;
    this.vz = fz * forward + rz * lateral;
    this.drift = Math.abs(lateral);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // two circles along the body against the city
    const off = m.len / 2 - m.wid / 2;
    for (const s of [1, -1]) {
      const cx = this.x + fx * off * s;
      const cz = this.z + fz * off * s;
      const res = collideCircle(cx, cz, m.wid / 2 + 0.15, 0.2);
      if (res.hit) {
        this.x += res.x - cx;
        this.z += res.z - cz;
        const into = this.vx * res.nx + this.vz * res.nz;
        if (into < 0) {
          this.vx -= res.nx * into * 1.35;
          this.vz -= res.nz * into * 1.35;
          impact = Math.max(impact, -into);
        }
      }
    }
    if (impact > 6) this.damage((impact - 6) * 2.6);
    this.speed = this.vx * fx + this.vz * fz;
    this.wheelSpin += this.speed * dt / 0.38;
    return impact;
  }

  damage(amount) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.wreck();
    }
  }

  wreck() {
    this.wrecked = true;
    this.siren = false;
    this.burning = 6;
    this.exploded = false;
    this.group.traverse((child) => {
      if (child.isMesh && child.material !== wheelMat) child.material = charMat;
    });
  }

  setLights(night, braking) {
    this.headMat.emissiveIntensity = this.wrecked ? 0 : 0.2 + night * 1.8;
    this.tailMat.emissiveIntensity = this.wrecked ? 0 : (braking ? 1.6 : 0.2 + night * 0.8);
  }

  updateVisual(time) {
    for (const w of this.wheels) {
      w.wheel.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -this.steerVisual * 0.45;
    }
    if (this.barRed) {
      const phase = Math.floor(time * 6) % 2;
      this.barRed.emissiveIntensity = this.siren && phase === 0 ? 3 : 0;
      this.barBlue.emissiveIntensity = this.siren && phase === 1 ? 3 : 0;
    }
    this.group.rotation.z = Math.max(-0.08, Math.min(0.08, this.yawRate * this.speed * 0.006));
    this.sync();
  }

  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
  }

  /** Ray (origin o, unit d) against a box around the car body: hit distance or -1. */
  rayHit(o, d) {
    const m = this.model;
    const c = Math.cos(-this.heading);
    const s = Math.sin(-this.heading);
    const lx = o.x - this.x;
    const lz = o.z - this.z;
    const ox = lx * c + lz * s;
    const oz = -lx * s + lz * c;
    const dx = d.x * c + d.z * s;
    const dz = -d.x * s + d.z * c;
    const min = [-m.wid / 2, 0.3, -m.len / 2];
    const max = [m.wid / 2, 0.3 + m.hgt, m.len / 2];
    const org = [ox, o.y, oz];
    const dir = [dx, d.y, dz];
    let t0 = 0;
    let t1 = 1e9;
    for (let i = 0; i < 3; i += 1) {
      if (Math.abs(dir[i]) < 1e-8) {
        if (org[i] < min[i] || org[i] > max[i]) return -1;
        continue;
      }
      let a = (min[i] - org[i]) / dir[i];
      let b = (max[i] - org[i]) / dir[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return -1;
    }
    return t0;
  }

  /** Where a driver gets out (the left door). */
  doorPoint() {
    const side = this.model.wid / 2 + 0.9;
    return { x: this.x + Math.cos(this.heading) * side, z: this.z - Math.sin(this.heading) * side };
  }

  remove() {
    this.scene.remove(this.group);
    const index = vehicles.indexOf(this);
    if (index >= 0) vehicles.splice(index, 1);
  }
}

/** Push overlapping cars apart and trade momentum; returns collisions as [a, b, impactSpeed]. */
export function separateVehicles() {
  const hits = [];
  for (let i = 0; i < vehicles.length; i += 1) {
    const a = vehicles[i];
    for (let j = i + 1; j < vehicles.length; j += 1) {
      const b = vehicles[j];
      const dx0 = b.x - a.x;
      const dz0 = b.z - a.z;
      if (dx0 * dx0 + dz0 * dz0 > 64) continue;
      let worst = 0;
      for (const sa of [0.5, -0.5]) {
        for (const sb of [0.5, -0.5]) {
          const ax = a.x + a.forwardX * (a.model.len / 2 - a.model.wid / 2) * sa * 2;
          const az = a.z + a.forwardZ * (a.model.len / 2 - a.model.wid / 2) * sa * 2;
          const bx = b.x + b.forwardX * (b.model.len / 2 - b.model.wid / 2) * sb * 2;
          const bz = b.z + b.forwardZ * (b.model.len / 2 - b.model.wid / 2) * sb * 2;
          const dx = bx - ax;
          const dz = bz - az;
          const r = (a.model.wid + b.model.wid) / 2 + 0.1;
          const d = Math.hypot(dx, dz);
          if (d >= r || d < 1e-4) continue;
          const nx = dx / d;
          const nz = dz / d;
          const push = (r - d) / 2;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
          const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (rel < 0) {
            const k = rel * 0.75;
            a.vx += nx * k; a.vz += nz * k;
            b.vx -= nx * k; b.vz -= nz * k;
            worst = Math.max(worst, -rel);
          }
        }
      }
      if (worst > 0) hits.push([a, b, worst]);
    }
  }
  return hits;
}
