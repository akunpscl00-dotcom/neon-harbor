// Geometry batching: many boxes merged into one mesh (one draw call), plus a merge for small templates.
import * as THREE from 'three';

const FACES = [
  // normal, then the four corners as unit-cube signs (counter-clockwise seen from outside)
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], wall: 'z' },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], wall: 'z' },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], wall: 'x' },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], wall: 'x' },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], wall: null },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], wall: null },
];

export class BoxBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
  }

  /**
   * Add an axis-aligned box centred at (x, y, z) with full size (sx, sy, sz).
   * Walls get UVs in metres divided by `tile` (so a window texture repeats per floor); roofs sample the corner.
   */
  add(x, y, z, sx, sy, sz, color, tile = null, skipBottom = true) {
    const col = color instanceof THREE.Color ? color : new THREE.Color(color);
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    for (let f = 0; f < FACES.length; f += 1) {
      if (skipBottom && f === 5) continue;
      const face = FACES[f];
      const corner = face.c.map(([a, b, c]) => [x + a * hx, y + b * hy, z + c * hz]);
      const width = face.wall === 'x' ? sx : sz;
      const uv = face.c.map(([a, b, c], index) => {
        if (!tile || !face.wall) return [0.01, 0.01];
        const u = (index === 1 || index === 2 ? width : 0) / tile[0];
        const v = (b > 0 ? sy : 0) / tile[1];
        return [u, v];
      });
      const order = [0, 1, 2, 0, 2, 3];
      for (const k of order) {
        this.positions.push(corner[k][0], corner[k][1], corner[k][2]);
        this.normals.push(face.n[0], face.n[1], face.n[2]);
        this.uvs.push(uv[k][0], uv[k][1]);
        this.colors.push(col.r, col.g, col.b);
      }
    }
  }

  /** Flat horizontal quad (road paint, sand, grass) at height y. */
  quad(x, y, z, sx, sz, color) {
    const col = new THREE.Color(color);
    const hx = sx / 2;
    const hz = sz / 2;
    const pts = [[x - hx, z + hz], [x + hx, z + hz], [x + hx, z - hz], [x - hx, z - hz]];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      this.positions.push(pts[k][0], y, pts[k][1]);
      this.normals.push(0, 1, 0);
      this.uvs.push(0.01, 0.01);
      this.colors.push(col.r, col.g, col.b);
    }
  }

  build(material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry, material);
  }
}

/** Merge several geometries (each with an optional matrix and colour) into one non-indexed geometry with vertex colours. */
export function mergeParts(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  for (const part of parts) {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    if (part.matrix) geometry.applyMatrix4(part.matrix);
    const color = new THREE.Color(part.color ?? '#ffffff');
    const pos = geometry.getAttribute('position');
    const nor = geometry.getAttribute('normal');
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** Matrix helper: translate, rotate (Euler xyz) and scale. */
export function transform(x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  return m;
}
