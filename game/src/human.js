// Low-poly people: the player, pedestrians, police officers and gang members share this body.
import * as THREE from 'three';

const geo = {
  torso: new THREE.BoxGeometry(0.56, 0.66, 0.3),
  head: new THREE.BoxGeometry(0.3, 0.32, 0.3),
  hair: new THREE.BoxGeometry(0.32, 0.1, 0.32),
  cap: new THREE.BoxGeometry(0.34, 0.1, 0.42),
  leg: new THREE.BoxGeometry(0.22, 0.9, 0.24),
  arm: new THREE.BoxGeometry(0.17, 0.66, 0.18),
  gun: new THREE.BoxGeometry(0.08, 0.12, 0.42),
};
geo.leg.translate(0, -0.45, 0);
geo.arm.translate(0, -0.3, 0);
geo.gun.translate(0, -0.6, 0.16);

const mats = new Map();
function mat(color) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }));
  return mats.get(color);
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const SHIRTS = ['#ff6f61', '#ffd166', '#06d6a0', '#118ab2', '#ffffff', '#f4a6c1', '#9b5de5', '#f15bb5', '#fee440', '#00bbf9'];
const PANTS = ['#2b2d42', '#3d5a80', '#e9d8a6', '#6c757d', '#9c6644', '#264653'];
const HAIR = ['#2b2118', '#5a3825', '#d4a373', '#111111', '#a44a3f'];

export const LOOKS = {
  player: { shirt: '#ff6f61', pants: '#f1faee', skin: '#c68642', hair: '#111111' },
  cop: { shirt: '#1d3557', pants: '#14213d', skin: null, hair: null, cap: '#14213d' },
  thug: { shirt: '#2ec4b6', pants: '#222222', skin: null, hair: null, cap: '#0b6e4f' },
};

export class Human {
  constructor(scene, kind, x, z, rng = Math.random) {
    this.scene = scene;
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.health = kind === 'cop' ? 70 : kind === 'thug' ? 60 : 40;
    this.alive = true;
    this.speed = 0;
    this.phase = rng() * 6;
    this.fall = 0;
    this.deadTime = 0;
    this.aiming = false;
    this.armed = false;
    const base = LOOKS[kind] ?? {};
    const r = (list) => list[Math.floor(rng() * list.length)];
    const look = {
      shirt: base.shirt ?? r(SHIRTS),
      pants: base.pants ?? r(PANTS),
      skin: base.skin ?? r(SKIN),
      hair: base.hair ?? r(HAIR),
      cap: base.cap,
    };
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    this.torso = new THREE.Mesh(geo.torso, mat(look.shirt));
    this.torso.position.y = 1.28;
    this.head = new THREE.Mesh(geo.head, mat(look.skin));
    this.head.position.y = 1.8;
    const top = new THREE.Mesh(look.cap ? geo.cap : geo.hair, mat(look.cap ?? look.hair));
    top.position.set(0, 0.18, look.cap ? 0.05 : 0);
    this.head.add(top);
    this.legL = new THREE.Mesh(geo.leg, mat(look.pants));
    this.legR = new THREE.Mesh(geo.leg, mat(look.pants));
    this.legL.position.set(-0.14, 0.95, 0);
    this.legR.position.set(0.14, 0.95, 0);
    this.armL = new THREE.Mesh(geo.arm, mat(look.shirt));
    this.armR = new THREE.Mesh(geo.arm, mat(look.shirt));
    this.armL.position.set(-0.37, 1.58, 0);
    this.armR.position.set(0.37, 1.58, 0);
    this.gun = new THREE.Mesh(geo.gun, mat('#1b1b1b'));
    this.gun.visible = false;
    this.armR.add(this.gun);
    g.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR);
    for (const child of g.children) child.castShadow = true;
    this.group = g;
    scene.add(g);
    this.sync();
  }

  setArmed(armed) {
    this.armed = armed;
    this.gun.visible = armed;
  }

  /** Walk cycle and pose for this frame. */
  animate(dt) {
    if (!this.alive) {
      this.fall = Math.min(1, this.fall + dt * 3);
      this.group.rotation.x = (-Math.PI / 2) * (1 - (1 - this.fall) * (1 - this.fall));
      this.group.position.y = this.y + 0.18 * this.fall;
      this.deadTime += dt;
      return;
    }
    const amount = Math.min(1, this.speed / 4);
    this.phase += dt * (4 + this.speed * 1.6);
    const swing = Math.sin(this.phase) * 0.75 * amount;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    if (this.aiming) {
      this.armR.rotation.x = -Math.PI / 2;
      this.armL.rotation.x = -Math.PI / 2.4;
      this.armL.rotation.z = -0.5;
    } else {
      this.armR.rotation.x = swing * 0.8;
      this.armL.rotation.z = 0;
    }
    this.torso.position.y = 1.28 + Math.abs(Math.sin(this.phase)) * 0.04 * amount;
  }

  sync() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
  }

  /** Apply damage; returns true on the hit that kills. */
  damage(amount, fromX, fromZ) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      this.speed = 0;
      if (fromX !== undefined) this.heading = Math.atan2(fromX - this.x, fromZ - this.z);
      this.sync();
      return true;
    }
    return false;
  }

  /** Distance from a ray (origin o, unit direction d) to this body: returns the hit distance or -1. */
  rayHit(o, d) {
    if (!this.alive) return -1;
    const cx = this.x - o.x;
    const cy = this.y + 1.1 - o.y;
    const cz = this.z - o.z;
    const t = cx * d.x + cy * d.y + cz * d.z;
    if (t < 0) return -1;
    const px = cx - d.x * t;
    const py = (cy - d.y * t) / 1.9;
    const pz = cz - d.z * t;
    return px * px + py * py + pz * pz < 0.2 ? t : -1;
  }

  remove() {
    this.scene.remove(this.group);
  }
}
