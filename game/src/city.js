// Port Halcyon itself: roads, sidewalks, districts, buildings, parks, palms, the beach and the sea,
// plus the colliders everything else bumps into.
import * as THREE from 'three';
import { CITY, DISTRICTS, PARKS, roadCenter, blockCenter, districtOfBlock } from './config.js';
import { BoxBatch, mergeParts, transform } from './batch.js';
import { makeRng } from './random.js';

const GRID = 16;
const colliders = [];
const grid = new Map();
const blocks = [];
export const lampMaterials = [];
export let windowMaterial = null;

function gridKey(ix, iz) {
  return ix * 4096 + iz;
}

/** Register a solid box (minX..maxX, minZ..maxZ, up to height h) for collisions and line of sight. */
export function addCollider(minX, maxX, minZ, maxZ, h, kind = 'building') {
  const box = { minX, maxX, minZ, maxZ, h, kind };
  colliders.push(box);
  for (let ix = Math.floor(minX / GRID); ix <= Math.floor(maxX / GRID); ix += 1) {
    for (let iz = Math.floor(minZ / GRID); iz <= Math.floor(maxZ / GRID); iz += 1) {
      const key = gridKey(ix, iz);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(box);
    }
  }
  return box;
}

function nearby(x, z) {
  return grid.get(gridKey(Math.floor(x / GRID), Math.floor(z / GRID))) ?? [];
}

/** Push a circle out of every solid box it overlaps. Returns the corrected position and the push normal. */
export function collideCircle(x, z, r, y = 0) {
  let hit = false;
  let nx = 0;
  let nz = 0;
  const seen = new Set();
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oz = -1; oz <= 1; oz += 1) {
      for (const box of nearby(x + ox * GRID, z + oz * GRID)) {
        if (seen.has(box) || box.h < y + 0.3) continue;
        seen.add(box);
        const cx = Math.max(box.minX, Math.min(x, box.maxX));
        const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
        let dx = x - cx;
        let dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) {
          // centre inside the box: leave by the nearest side
          const options = [[box.minX - r - x, 0], [box.maxX + r - x, 0], [0, box.minZ - r - z], [0, box.maxZ + r - z]];
          options.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          x += options[0][0];
          z += options[0][1];
          const len = Math.hypot(options[0][0], options[0][1]) || 1;
          nx = options[0][0] / len;
          nz = options[0][1] / len;
        } else {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          x = cx + dx * r;
          z = cz + dz * r;
          nx = dx;
          nz = dz;
        }
        hit = true;
      }
    }
  }
  const lim = limitWorld(x, z, r);
  if (lim.hit) { hit = true; nx = lim.nx; nz = lim.nz; }
  return { x: lim.x, z: lim.z, hit, nx, nz };
}

/** The sea walls: west, north and east at the city edge; to the south the beach runs down to the water. */
export function limitWorld(x, z, r) {
  const edge = CITY.half - r;
  const south = CITY.half + CITY.beach - 6 - r;
  let hit = false;
  let nx = 0;
  let nz = 0;
  if (x < -edge) { x = -edge; hit = true; nx = 1; }
  if (x > edge) { x = edge; hit = true; nx = -1; }
  if (z < -edge) { z = -edge; hit = true; nz = 1; }
  if (z > south) { z = south; hit = true; nz = -1; }
  return { x, z, hit, nx, nz };
}

/** True when the point is inside a solid box (bullets and line of sight). */
export function solidAt(x, y, z) {
  if (y < 0) return true;
  for (const box of nearby(x, z)) {
    if (y < box.h && x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) return true;
  }
  return false;
}

/** March along a segment and report whether a building blocks it. */
export function lineBlocked(ax, ay, az, bx, by, bz, step = 2) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.ceil(len / step);
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    if (solidAt(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return true;
  }
  return false;
}

/** Block coordinates under a world point, or null on a road. */
export function blockAt(x, z) {
  const fx = (x + CITY.half - CITY.road) / CITY.cell;
  const fz = (z + CITY.half - CITY.road) / CITY.cell;
  const bx = Math.floor(fx);
  const bz = Math.floor(fz);
  if (bx < 0 || bz < 0 || bx >= CITY.blocks || bz >= CITY.blocks) return null;
  if (fx - bx > CITY.block / CITY.cell || fz - bz > CITY.block / CITY.cell) return null;
  return blocks[bx][bz];
}

/** District name for any world point (roads take the nearest block's district). */
export function districtAt(x, z) {
  if (z > CITY.half) return 'Halcyon Beach';
  const bx = Math.max(0, Math.min(CITY.blocks - 1, Math.round((x - blockCenter(0)) / CITY.cell)));
  const bz = Math.max(0, Math.min(CITY.blocks - 1, Math.round((z - blockCenter(0)) / CITY.cell)));
  return DISTRICTS[blocks[bx][bz].district].name;
}

export function getBlock(bx, bz) {
  return blocks[bx][bz];
}

/** Nearest intersection indices to a point. */
export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(CITY.blocks, Math.round((x - roadCenter(0)) / CITY.cell)));
  const j = Math.max(0, Math.min(CITY.blocks, Math.round((z - roadCenter(0)) / CITY.cell)));
  return { i, j };
}

/** True when the point is on asphalt (between sidewalks). */
export function onRoad(x, z) {
  return blockAt(x, z) === null && Math.abs(x) < CITY.half && Math.abs(z) < CITY.half;
}

function makeWindowTextures() {
  const size = 256;
  const base = document.createElement('canvas');
  base.width = size;
  base.height = size;
  const glow = document.createElement('canvas');
  glow.width = size;
  glow.height = size;
  const b = base.getContext('2d');
  const g = glow.getContext('2d');
  b.fillStyle = '#ffffff';
  b.fillRect(0, 0, size, size);
  g.fillStyle = '#000000';
  g.fillRect(0, 0, size, size);
  const rng = makeRng(77);
  const cols = 4;
  const rows = 4;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * (size / cols) + 10;
      const y = r * (size / rows) + 14;
      const w = size / cols - 20;
      const h = size / rows - 30;
      const grad = b.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#3b4f73');
      grad.addColorStop(0.5, '#7aa5c9');
      grad.addColorStop(1, '#2c3a57');
      b.fillStyle = grad;
      b.fillRect(x, y, w, h);
      b.fillStyle = '#ffffff55';
      b.fillRect(x, y + h, w, 4);
      if (rng() < 0.45) {
        g.fillStyle = rng() < 0.5 ? '#ffd58a' : '#ffe9c4';
        g.fillRect(x, y, w, h);
      }
    }
  }
  const map = new THREE.CanvasTexture(base);
  const emissive = new THREE.CanvasTexture(glow);
  for (const tex of [map, emissive]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  return { map, emissive };
}

function makeAsphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#4a4b55';
  x.fillRect(0, 0, 256, 256);
  const rng = makeRng(5);
  for (let i = 0; i < 2600; i += 1) {
    const v = 60 + Math.floor(rng() * 40);
    x.fillStyle = `rgb(${v},${v},${v + 8})`;
    x.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(CITY.size / 12, CITY.size / 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addPalm(list, x, z, rng, scale = 1) {
  list.push({ x, z, h: (6 + rng() * 4) * scale, lean: (rng() - 0.5) * 0.25, rot: rng() * Math.PI * 2 });
}

function buildLot(batch, rng, district, x, z, w, d, palms) {
  const info = DISTRICTS[district];
  const color = new THREE.Color(info.palette[Math.floor(rng() * info.palette.length)]);
  const [hMin, hMax] = info.heights;
  let h = hMin + rng() * (hMax - hMin);
  if (district === 'heights' && rng() < 0.3) h *= 0.55;
  const tile = district === 'palmera' ? [6, 4] : [12, 16];
  batch.add(x, h / 2, z, w, h, d, color, tile);
  addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
  // stepped crowns on taller towers, rooftop boxes on everything
  if (h > 30 && rng() < 0.7) {
    const h2 = h * (0.12 + rng() * 0.2);
    batch.add(x, h + h2 / 2, z, w * 0.7, h2, d * 0.7, color.clone().offsetHSL(0, 0, 0.06), tile);
    if (rng() < 0.5) batch.add(x, h + h2 + 3, z, 0.6, 6, 0.6, '#d8d8d8');
  }
  const roofColor = color.clone().multiplyScalar(0.7);
  for (let i = 0; i < 2; i += 1) {
    batch.add(x + (rng() - 0.5) * w * 0.5, h + 0.7, z + (rng() - 0.5) * d * 0.5, 2 + rng() * 2, 1.4, 2 + rng() * 2, roofColor);
  }
  // shop awnings on the street-level faces of shorter buildings
  if (h < 40 && district !== 'palmera' && district !== 'port') {
    const aw = new THREE.Color(['#ff6f61', '#2ec4b6', '#ffbf69', '#cb997e'][Math.floor(rng() * 4)]);
    batch.add(x, 3.4, z + d / 2 + 0.8, w * 0.8, 0.25, 1.6, aw);
    batch.add(x, 3.4, z - d / 2 - 0.8, w * 0.8, 0.25, 1.6, aw);
  }
  if (district === 'palmera' || district === 'coral') {
    if (rng() < 0.7) addPalm(palms, x + w / 2 + 1.5, z + d / 2 + 1.5, rng);
  }
}

function buildBlock(batches, rng, bx, bz, palms, lamps) {
  const cx = blockCenter(bx);
  const cz = blockCenter(bz);
  const district = districtOfBlock(bx, bz);
  const park = PARKS.find(([px, pz]) => px === bx && pz === bz);
  const block = { bx, bz, cx, cz, district, park: park ? park[2] : null };
  blocks[bx][bz] = block;
  const inner = CITY.block - CITY.sidewalk * 2;
  batches.ground.add(cx, 0.12, cz, CITY.block, 0.24, CITY.block, '#cfc6b8');
  if (park) {
    batches.ground.quad(cx, 0.26, cz, inner, inner, '#6fae5a');
    batches.ground.quad(cx, 0.27, cz, inner, 4, '#e2d2b0');
    batches.ground.quad(cx, 0.27, cz, 4, inner, '#e2d2b0');
    batches.city.add(cx, 0.8, cz, 9, 1.2, 9, '#d9e4ee');
    batches.city.add(cx, 1.6, cz, 2, 3, 2, '#bfe3f0');
    addCollider(cx - 4.5, cx + 4.5, cz - 4.5, cz + 4.5, 1.4, 'fountain');
    for (let i = 0; i < 14; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = 12 + rng() * 14;
      addPalm(palms, cx + Math.cos(a) * r, cz + Math.sin(a) * r, rng, 1.1);
    }
    return;
  }
  const lots = district === 'heights' ? 2 : district === 'palmera' ? 3 : district === 'port' ? 2 : rng() < 0.5 ? 2 : 3;
  const gap = district === 'palmera' ? 6 : 4;
  const size = (inner - gap * (lots - 1)) / lots;
  if (district === 'port') {
    // one long warehouse and a container yard
    const wx = cx - inner / 4;
    batches.city.add(wx, 6, cz, inner / 2 - 2, 12, inner - 4, new THREE.Color(DISTRICTS.port.palette[Math.floor(rng() * 5)]), [12, 16]);
    batches.city.add(wx, 12.6, cz, inner / 2 - 4, 1.2, inner - 6, '#8a8f99');
    addCollider(wx - (inner / 2 - 2) / 2, wx + (inner / 2 - 2) / 2, cz - (inner - 4) / 2, cz + (inner - 4) / 2, 13);
    batches.ground.quad(cx + inner / 4, 0.26, cz, inner / 2, inner, '#a39f97');
    const containerColors = ['#d1495b', '#00798c', '#edae49', '#30638e', '#6a994e'];
    for (let row = 0; row < 3; row += 1) {
      for (let stack = 0; stack < 2; stack += 1) {
        const x = cx + 6 + row * 7;
        const z = cz - 16 + stack * 20;
        const levels = 1 + Math.floor(rng() * 3);
        for (let l = 0; l < levels; l += 1) batches.city.add(x, 1.3 + l * 2.6, z, 2.5, 2.5, 12, containerColors[Math.floor(rng() * 5)]);
        addCollider(x - 1.3, x + 1.3, z - 6, z + 6, levels * 2.6);
      }
    }
    return;
  }
  for (let i = 0; i < lots; i += 1) {
    for (let j = 0; j < lots; j += 1) {
      const x = cx - inner / 2 + size / 2 + i * (size + gap);
      const z = cz - inner / 2 + size / 2 + j * (size + gap);
      if (district === 'palmera') {
        batches.ground.quad(x, 0.26, z, size + 2, size + 2, '#86b86a');
        buildLot(batches.city, rng, district, x, z, size * 0.75, size * 0.7, palms);
      } else if (bx === 4 && bz === 4 && i === 0 && j === 0) {
        // Sundial Tower: the tallest thing in Port Halcyon, a gold ring at its crown
        const w = size;
        batches.city.add(x, 80, z, w, 160, w, '#9cc9e3', [12, 16]);
        batches.city.add(x, 166, z, w * 0.6, 12, w * 0.6, '#ffd166', [12, 16]);
        batches.city.add(x, 180, z, 1, 16, 1, '#ffffff');
        addCollider(x - w / 2, x + w / 2, z - w / 2, z + w / 2, 172);
      } else {
        buildLot(batches.city, rng, district, x, z, size, size, palms);
      }
    }
  }
  // street palms along the curb in the sunny districts
  if (district === 'coral' || district === 'palmera' || district === 'bright') {
    const edge = CITY.block / 2 - 1.2;
    for (let k = -2; k <= 2; k += 1) {
      if (rng() < 0.55) addPalm(palms, cx + k * 12, cz + edge, rng);
      if (rng() < 0.55) addPalm(palms, cx + edge, cz + k * 12, rng);
    }
  }
  lamps.push([cx - CITY.block / 2 + 1, cz - CITY.block / 2 + 1], [cx + CITY.block / 2 - 1, cz + CITY.block / 2 - 1]);
}

function buildRoadPaint(batch) {
  const n = CITY.blocks;
  for (let i = 0; i <= n; i += 1) {
    const c = roadCenter(i);
    for (let s = 0; s < n; s += 1) {
      const a = roadCenter(s) + CITY.road / 2 + 2;
      const b = roadCenter(s + 1) - CITY.road / 2 - 2;
      for (let t = a; t < b; t += 7) {
        batch.quad(c, 0.02, t + 1.5, 0.3, 3, '#ffd166');
        batch.quad(t + 1.5, 0.02, c, 3, 0.3, '#ffd166');
      }
    }
    for (let j = 0; j <= n; j += 1) {
      const z = roadCenter(j);
      // zebra crossings on each side of every intersection
      for (let k = -3; k <= 3; k += 1) {
        batch.quad(c + k * 2, 0.021, z - CITY.road / 2 - 1.2, 1, 2.4, '#f1f1f1');
        batch.quad(c + k * 2, 0.021, z + CITY.road / 2 + 1.2, 1, 2.4, '#f1f1f1');
        batch.quad(c - CITY.road / 2 - 1.2, 0.021, z + k * 2, 2.4, 1, '#f1f1f1');
        batch.quad(c + CITY.road / 2 + 1.2, 0.021, z + k * 2, 2.4, 1, '#f1f1f1');
      }
    }
  }
}

function buildPalms(scene, palms) {
  const trunk = new THREE.CylinderGeometry(0.18, 0.32, 1, 6);
  trunk.translate(0, 0.5, 0);
  const frondParts = [];
  for (let k = 0; k < 7; k += 1) {
    const leaf = new THREE.BoxGeometry(0.9, 0.08, 3.6);
    leaf.translate(0, 0, 1.8);
    frondParts.push({ geometry: leaf, matrix: transform(0, 0, 0, 0.45, (k / 7) * Math.PI * 2, 0), color: k % 2 ? '#3f8f3a' : '#57a843' });
  }
  frondParts.push({ geometry: new THREE.SphereGeometry(0.45, 6, 4), color: '#6b4f2a' });
  const crown = mergeParts(frondParts);
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: '#9c7a54' }), palms.length);
  const crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ vertexColors: true }), palms.length);
  const m = new THREE.Matrix4();
  palms.forEach((p, index) => {
    m.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.lean, p.rot, 0)), new THREE.Vector3(1, p.h, 1));
    trunkMesh.setMatrixAt(index, m);
    const top = new THREE.Vector3(0, p.h, 0).applyEuler(new THREE.Euler(p.lean, p.rot, 0));
    m.compose(new THREE.Vector3(p.x + top.x, top.y, p.z + top.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), new THREE.Vector3(1.2, 1.2, 1.2));
    crownMesh.setMatrixAt(index, m);
    addCollider(p.x - 0.35, p.x + 0.35, p.z - 0.35, p.z + 0.35, 4, 'palm');
  });
  trunkMesh.castShadow = true;
  crownMesh.castShadow = true;
  scene.add(trunkMesh, crownMesh);
}

function buildLamps(scene, lamps) {
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  pole.translate(0, 3.5, 0);
  const arm = new THREE.BoxGeometry(0.2, 0.2, 2.2);
  arm.translate(0, 7, 1);
  const head = new THREE.BoxGeometry(0.7, 0.25, 0.9);
  head.translate(0, 6.85, 2);
  const poleGeo = mergeParts([{ geometry: pole, color: '#3d405b' }, { geometry: arm, color: '#3d405b' }]);
  const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), lamps.length);
  const bulb = new THREE.MeshLambertMaterial({ color: '#fff3d1', emissive: '#ffcf7a', emissiveIntensity: 0 });
  lampMaterials.push(bulb);
  const headMesh = new THREE.InstancedMesh(head, bulb, lamps.length);
  const m = new THREE.Matrix4();
  lamps.forEach(([x, z], index) => {
    const yaw = Math.atan2(-x, -z);
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2), 0)), new THREE.Vector3(1, 1, 1));
    poleMesh.setMatrixAt(index, m);
    headMesh.setMatrixAt(index, m);
  });
  scene.add(poleMesh, headMesh);
}

function buildCoast(scene, batches, palms, rng) {
  const sandTop = CITY.half;
  batches.ground.quad(0, 0.05, sandTop + CITY.beach / 2, CITY.size + 40, CITY.beach, '#f2d7a6');
  batches.ground.quad(0, 0.08, sandTop + 5, CITY.size, 6, '#c8a27a');
  for (let x = -CITY.half + 10; x < CITY.half; x += 18) {
    addPalm(palms, x + rng() * 6, sandTop + 12 + rng() * 6, rng, 1.15);
    if (rng() < 0.5) {
      // beach umbrellas
      const ux = x + 8;
      const uz = sandTop + 28 + rng() * 8;
      batches.city.add(ux, 1.2, uz, 0.15, 2.4, 0.15, '#ffffff');
      batches.city.add(ux, 2.4, uz, 3, 0.25, 3, ['#ff6f61', '#2ec4b6', '#ffd166'][Math.floor(rng() * 3)]);
    }
  }
  // sea walls with a railing on the other three sides
  const e = CITY.half;
  batches.city.add(-e - 1, 0.6, 0, 2, 1.2, CITY.size + 4, '#bdb6a8');
  batches.city.add(e + 1, 0.6, 0, 2, 1.2, CITY.size + 4, '#bdb6a8');
  batches.city.add(0, 0.6, -e - 1, CITY.size + 4, 1.2, 2, '#bdb6a8');
  // gantry cranes on the Old Port quay
  for (let k = 0; k < 4; k += 1) {
    const z = -260 + k * 150;
    const x = -e - 8;
    batches.city.add(x - 4, 14, z - 5, 1.2, 28, 1.2, '#f4a261');
    batches.city.add(x - 4, 14, z + 5, 1.2, 28, 1.2, '#f4a261');
    batches.city.add(x + 4, 14, z - 5, 1.2, 28, 1.2, '#f4a261');
    batches.city.add(x + 4, 14, z + 5, 1.2, 28, 1.2, '#f4a261');
    batches.city.add(x - 6, 28.5, z, 34, 2, 3, '#e76f51');
    batches.city.add(x + 4, 25, z, 6, 5, 4, '#264653');
  }
  const waterMat = new THREE.MeshPhongMaterial({ color: '#2a9fb8', shininess: 90, specular: '#ffe3b0', transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.5;
  water.receiveShadow = false;
  scene.add(water);
  // a few cargo ships and an island on the horizon
  for (let k = 0; k < 3; k += 1) {
    batches.city.add(-e - 180 - k * 90, 4, -150 + k * 220, 26, 8, 90, '#2b2d42');
    batches.city.add(-e - 180 - k * 90, 11, -150 + k * 220 + 30, 20, 8, 16, '#edf2f4');
  }
  return water;
}

/** Build the whole city into the scene and return the handles other systems need. */
export function buildCity(scene) {
  const rng = makeRng(20261124);
  for (let i = 0; i < CITY.blocks; i += 1) blocks.push([]);
  const tex = makeWindowTextures();
  windowMaterial = new THREE.MeshLambertMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true });
  const batches = { city: new BoxBatch(), ground: new BoxBatch(), paint: new BoxBatch() };
  const palms = [];
  const lamps = [];
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) buildBlock(batches, rng, bx, bz, palms, lamps);
  }
  buildRoadPaint(batches.paint);
  const water = buildCoast(scene, batches, palms, rng);

  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(CITY.size + 4, CITY.size + 4), new THREE.MeshLambertMaterial({ map: makeAsphaltTexture() }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  const cityMesh = batches.city.build(windowMaterial);
  cityMesh.castShadow = true;
  cityMesh.receiveShadow = true;
  const groundMesh = batches.ground.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  groundMesh.receiveShadow = true;
  const paintMesh = batches.paint.build(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 }));
  paintMesh.receiveShadow = true;
  scene.add(cityMesh, groundMesh, paintMesh);
  buildPalms(scene, palms);
  buildLamps(scene, lamps);
  return { water, palms: palms.length, colliders: colliders.length };
}

/** A random point on a sidewalk ring of a block (pedestrians walk these). */
export function sidewalkPoint(block, t) {
  const half = CITY.block / 2 - CITY.sidewalk / 2;
  const side = Math.floor(t * 4) % 4;
  const f = (t * 4) % 1;
  const a = -half + f * half * 2;
  if (side === 0) return { x: block.cx + a, z: block.cz - half };
  if (side === 1) return { x: block.cx + half, z: block.cz + a };
  if (side === 2) return { x: block.cx - a, z: block.cz + half };
  return { x: block.cx - half, z: block.cz - a };
}

/** Every block, for spawners. */
export function allBlocks() {
  return blocks.flat();
}
