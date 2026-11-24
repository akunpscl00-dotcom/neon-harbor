// Third-person camera: free mouse look on foot with an over-the-shoulder aim, a chase camera in cars
// that swings back behind the car on its own, speed widening, recoil and explosion shake.
import * as THREE from 'three';
import { getMouse } from './input.js';
import { solidAt } from './city.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.25;
    this.dist = 5;
    this.sensitivity = 0.0025;
    this.idle = 0;
    this.kick = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
  }

  snapBehind(heading) {
    this.yaw = heading;
    this.idle = 2;
  }

  update(dt, player, shake) {
    const mouse = getMouse();
    const moved = Math.abs(mouse.dx) + Math.abs(mouse.dy) > 0;
    this.yaw -= mouse.dx * this.sensitivity;
    this.pitch = Math.max(-0.35, Math.min(1.1, this.pitch + mouse.dy * this.sensitivity));
    this.idle = moved ? 0 : this.idle + dt;
    const v = player.vehicle;
    let target;
    let dist;
    let height;
    let side = 0;
    let fov = 62;
    if (v) {
      const speed = Math.abs(v.speed);
      // swing back behind the car once the mouse has been still
      if (this.idle > 1 && speed > 2) {
        const want = v.speed >= 0 ? v.heading : v.heading + Math.PI;
        this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 2.5);
        this.pitch += (0.2 - this.pitch) * Math.min(1, dt * 2);
      }
      target = new THREE.Vector3(v.x, 1.6, v.z);
      dist = 7.5 + v.model.len * 0.5 + speed * 0.06;
      height = 1.4;
      fov = 62 + Math.min(18, speed * 0.4);
    } else {
      const b = player.body;
      target = new THREE.Vector3(b.x, 1.65 + b.y, b.z);
      const aiming = b.aiming;
      dist = aiming ? 3.4 : 4.8;
      height = aiming ? 0.35 : 0.45;
      side = aiming ? 1.05 : 0.4;
      fov = aiming ? 52 : 62;
    }
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const want = new THREE.Vector3(
      target.x - fx * dist * cp + rx * side,
      target.y + height + sp * dist,
      target.z - fz * dist * cp + rz * side,
    );
    // pull in when a wall is between the camera and its subject
    let pull = 1;
    for (let t = 0.15; t <= 1; t += 0.08) {
      const x = target.x + (want.x - target.x) * t;
      const y = target.y + (want.y - target.y) * t;
      const z = target.z + (want.z - target.z) * t;
      if (solidAt(x, y, z)) { pull = Math.max(0.12, t - 0.1); break; }
    }
    want.lerpVectors(target, want, pull);
    want.y = Math.max(0.4, want.y);
    const k = v ? Math.min(1, dt * 9) : 1;
    this.pos.lerp(want, k);
    if (!v) this.pos.copy(want);
    this.kick = Math.max(0, this.kick - dt * 0.3);
    const lookAhead = new THREE.Vector3(target.x + rx * side + fx * 6, target.y + 0.4 - this.pitch * 2.2 + 2.2 * 0.25 + this.kick * 10, target.z + rz * side + fz * 6);
    this.camera.position.copy(this.pos);
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    }
    this.camera.lookAt(lookAhead);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }
}
