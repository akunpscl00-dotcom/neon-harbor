// Visual effects: smoke, fire, sparks, blood, muzzle flashes, bullet tracers and explosions.
import * as THREE from 'three';

const VERT = `attribute float size; attribute vec4 tint; varying vec4 vTint;
void main(){ vTint = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (420.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = `varying vec4 vTint; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; float a = smoothstep(0.5, 0.15, d); gl_FragColor = vec4(vTint.rgb, vTint.a * a); }`;

class ParticlePool {
  constructor(scene, capacity, additive) {
    this.capacity = capacity;
    this.items = [];
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.tint = new Float32Array(capacity * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4));
    this.geometry = geometry;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(p) {
    if (this.items.length >= this.capacity) this.items.shift();
    this.items.push({ ...p, age: 0 });
  }

  update(dt) {
    const alive = [];
    for (const p of this.items) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= (p.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; p.vz *= 1 - p.drag * dt; }
      alive.push(p);
    }
    this.items = alive;
    for (let i = 0; i < this.capacity; i += 1) {
      const p = this.items[i];
      if (!p) { this.size[i] = 0; this.tint[i * 4 + 3] = 0; continue; }
      const t = p.age / p.life;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.size * (1 + (p.grow ?? 0) * t);
      const c = p.color;
      const e = p.endColor ?? c;
      this.tint[i * 4] = c[0] + (e[0] - c[0]) * t;
      this.tint[i * 4 + 1] = c[1] + (e[1] - c[1]) * t;
      this.tint[i * 4 + 2] = c[2] + (e[2] - c[2]) * t;
      this.tint[i * 4 + 3] = p.alpha * (1 - t);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.tint.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new ParticlePool(scene, 500, false);
    this.glow = new ParticlePool(scene, 600, true);
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(40 * 6);
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracers = [];
    this.tracerLines = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ color: '#ffe8a3', transparent: true, opacity: 0.9 }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    this.flash = new THREE.PointLight('#ffb35c', 0, 14, 1.6);
    scene.add(this.flash);
    this.boom = new THREE.PointLight('#ff7a2e', 0, 60, 1.4);
    scene.add(this.boom);
    this.shake = 0;
  }

  muzzle(x, y, z) {
    this.flash.position.set(x, y, z);
    this.flash.intensity = 30;
    for (let i = 0; i < 4; i += 1) {
      this.glow.emit({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.07, size: 0.6, color: [1, 0.85, 0.4], alpha: 1 });
    }
  }

  tracer(ax, ay, az, bx, by, bz) {
    this.tracers.push({ a: [ax, ay, az], b: [bx, by, bz], life: 0.06 });
    if (this.tracers.length > 40) this.tracers.shift();
  }

  sparks(x, y, z, count = 8) {
    for (let i = 0; i < count; i += 1) {
      this.glow.emit({ x, y, z, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 8, gravity: 14, life: 0.35, size: 0.18, color: [1, 0.8, 0.35], endColor: [1, 0.3, 0.1], alpha: 1 });
    }
  }

  dust(x, y, z) {
    for (let i = 0; i < 3; i += 1) {
      this.smoke.emit({ x, y, z, vx: (Math.random() - 0.5), vy: 1 + Math.random(), vz: (Math.random() - 0.5), life: 0.7, size: 0.5, grow: 2, color: [0.75, 0.7, 0.62], alpha: 0.6 });
    }
  }

  blood(x, y, z) {
    for (let i = 0; i < 10; i += 1) {
      this.smoke.emit({ x, y, z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4, gravity: 12, life: 0.45, size: 0.22, color: [0.62, 0.02, 0.05], alpha: 0.95 });
    }
  }

  tireSmoke(x, z) {
    this.smoke.emit({ x: x + (Math.random() - 0.5), y: 0.3, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5), vy: 0.8, vz: (Math.random() - 0.5), life: 1.2, size: 1, grow: 2.5, color: [0.9, 0.9, 0.92], alpha: 0.35 });
  }

  carSmoke(x, y, z, fire) {
    this.smoke.emit({ x, y, z, vx: (Math.random() - 0.5) * 0.6, vy: 2 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 2, size: 1.1, grow: 3, color: fire ? [0.2, 0.18, 0.18] : [0.55, 0.55, 0.58], alpha: 0.55 });
    if (fire) this.glow.emit({ x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: 0, vy: 2.5, vz: 0, life: 0.5, size: 1.2, grow: -0.5, color: [1, 0.6, 0.15], endColor: [0.9, 0.15, 0.05], alpha: 0.9 });
  }

  explosion(x, y, z) {
    this.boom.position.set(x, y + 2, z);
    this.boom.intensity = 400;
    this.shake = Math.max(this.shake, 1);
    for (let i = 0; i < 70; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 12;
      this.glow.emit({ x, y: y + 1, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 10, vz: Math.sin(a) * s, drag: 3, life: 0.6 + Math.random() * 0.5, size: 2.4, grow: 1, color: [1, 0.85, 0.45], endColor: [0.8, 0.15, 0.02], alpha: 1 });
    }
    for (let i = 0; i < 40; i += 1) {
      this.smoke.emit({ x: x + (Math.random() - 0.5) * 3, y: y + 1, z: z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 5, drag: 1, life: 2.5 + Math.random() * 1.5, size: 3, grow: 2, color: [0.25, 0.22, 0.22], alpha: 0.7 });
    }
    this.sparks(x, y + 1, z, 30);
  }

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 600);
    this.boom.intensity = Math.max(0, this.boom.intensity - dt * 500);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.tracers = this.tracers.filter((t) => (t.life -= dt) > 0);
    this.tracerPos.fill(0);
    this.tracers.forEach((t, i) => {
      this.tracerPos.set(t.a, i * 6);
      this.tracerPos.set(t.b, i * 6 + 3);
    });
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.setDrawRange(0, this.tracers.length * 2);
  }
}
