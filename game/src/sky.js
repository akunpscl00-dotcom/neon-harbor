// Time of day: sky dome, sun and fill light, fog, and the city's night glow.
import * as THREE from 'three';
import { lampMaterials, windowMaterial } from './city.js';

// Colour keys over the day: [hour, sky top, horizon, sun colour, sun intensity, ambient]
const KEYS = [
  [0, '#0b0f2e', '#2a2350', '#6b7cff', 0.15, 0.35],
  [5, '#1a1842', '#7a4a6b', '#ff9a6b', 0.3, 0.4],
  [7, '#5aa6e8', '#ffcf9e', '#ffd6a0', 1.4, 0.7],
  [12, '#3d8fe0', '#bfe4ff', '#fff6e8', 2.2, 0.9],
  [16, '#4a8fd6', '#ffd9a8', '#ffe2b0', 2.0, 0.85],
  [18, '#4b4aa8', '#ff8a5c', '#ff9a55', 1.8, 0.7],
  [19.5, '#2a1e5c', '#ff5e7a', '#ff6a4a', 0.9, 0.5],
  [21, '#0f1236', '#4a2a6a', '#8a7cff', 0.25, 0.38],
  [24, '#0b0f2e', '#2a2350', '#6b7cff', 0.15, 0.35],
];

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35);
  if (vDir.y < 0.0) col = mix(horizon, horizon * 0.6, clamp(-vDir.y * 4.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

function lerpKey(hour) {
  let a = KEYS[0];
  let b = KEYS[1];
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    if (hour >= KEYS[i][0] && hour <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = (hour - a[0]) / (b[0] - a[0] || 1);
  const mix = (i) => new THREE.Color(a[i]).lerp(new THREE.Color(b[i]), t);
  return { top: mix(1), horizon: mix(2), sun: mix(3), intensity: a[4] + (b[4] - a[4]) * t, ambient: a[5] + (b[5] - a[5]) * t };
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 24, 16),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    scene.add(this.dome);
    this.hemi = new THREE.HemisphereLight('#bfe4ff', '#6b5a4a', 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -90; cam.right = 90; cam.top = 90; cam.bottom = -90; cam.near = 1; cam.far = 600;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.4;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog('#ffcf9e', 120, 900);
    this.night = 0;
  }

  /** Update for a clock hour (0..24) and centre the sun's shadow on the focus point. */
  update(hour, focus) {
    const k = lerpKey(hour);
    // the sun crosses from east to west and sits low and golden at dusk
    const angle = ((hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(angle);
    const dir = new THREE.Vector3(Math.cos(angle) * 0.9, Math.max(elevation, 0.08), 0.45).normalize();
    if (elevation < 0) dir.set(-0.4, 0.6, 0.5).normalize(); // moonlight
    this.uniforms.top.value.copy(k.top);
    this.uniforms.horizon.value.copy(k.horizon);
    this.uniforms.sunColor.value.copy(k.sun);
    this.uniforms.sunDir.value.copy(dir);
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.intensity;
    this.hemi.intensity = k.ambient;
    this.hemi.color.copy(k.top).lerp(new THREE.Color('#ffffff'), 0.5);
    this.hemi.groundColor.copy(k.horizon).multiplyScalar(0.5);
    this.scene.fog.color.copy(k.horizon);
    this.sun.position.set(focus.x + dir.x * 250, dir.y * 250, focus.z + dir.z * 250);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.dome.position.set(focus.x, 0, focus.z);
    this.night = Math.max(0, Math.min(1, (k.ambient < 0.6 ? (0.6 - k.ambient) / 0.22 : 0)));
    for (const mat of lampMaterials) mat.emissiveIntensity = this.night * 2.2;
    if (windowMaterial) windowMaterial.emissiveIntensity = this.night * 0.9;
  }
}

/** Clock text for an hour value. */
export function clockText(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
