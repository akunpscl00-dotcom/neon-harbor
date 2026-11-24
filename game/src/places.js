// Places in Port Halcyon the player can use: safehouse, gun shop, respray garage, salvage yard,
// the story's mission markers, Sun Token collectibles and dropped cash.
import * as THREE from 'three';
import { CITY, VEHICLES, blockCenter, roadCenter } from './config.js';
import { getBlock, sidewalkPoint } from './city.js';
import { wasPressed } from './input.js';
import { play } from './audio.js';
import { makeRng } from './random.js';

export const PLACES = {
  safehouse: { name: 'Bayview Apartments', x: blockCenter(2), z: blockCenter(7) - 30.2, color: '#3fd6c6', icon: 'H', foot: true },
  shop: { name: 'Lockbox Arms', x: blockCenter(6) + 30.2, z: blockCenter(6), color: '#ff6f61', icon: 'G', foot: true },
  respray: { name: 'Glossworks Respray', x: roadCenter(3), z: blockCenter(5), color: '#f15bb5', icon: 'P', car: true },
  salvage: { name: 'Rustline Salvage', x: roadCenter(1), z: blockCenter(2), color: '#ffbf69', icon: '$', car: true },
};
export const LANDMARKS = {
  diner: { name: 'Seagrass Diner', x: blockCenter(5), z: blockCenter(8) - 30.2 },
  hospital: { name: 'Saint Mira Medical', x: blockCenter(3), z: blockCenter(1) + 30.2 },
  precinct: { name: 'Harborside Precinct', x: blockCenter(6) - 30.2, z: blockCenter(4) },
  dex: { name: "Dex's container office", x: blockCenter(0) + 30.2, z: blockCenter(3) },
  tower: { name: 'Sundial Tower lobby', x: blockCenter(4) - 30.2, z: blockCenter(4) - 14 },
  yard: { name: 'Tidecutter yard', x: blockCenter(1), z: blockCenter(6) },
  garage: { name: 'Ferro Maritime garage', x: roadCenter(5), z: blockCenter(3) },
};

const ringGeo = new THREE.CylinderGeometry(1, 1, 1.4, 28, 1, true);
ringGeo.translate(0, 0.7, 0);
const gemGeo = new THREE.OctahedronGeometry(0.45);
const tokenGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.12, 20);
tokenGeo.rotateX(Math.PI / 2);
const cashGeo = new THREE.BoxGeometry(0.5, 0.25, 0.3);

/** A glowing ground ring with a spinning gem: used for every interactive spot and mission objective. */
export function makeMarker(scene, x, z, color, radius = 2) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.scale.set(radius, 1, radius);
  const gem = new THREE.Mesh(gemGeo, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.8 }));
  gem.position.y = 2.6;
  group.add(ring, gem);
  group.position.set(x, 0.05, z);
  scene.add(group);
  return { group, gem, ring, x, z, radius, color };
}

export class Places {
  constructor(game) {
    this.game = game;
    this.markers = {};
    for (const [id, place] of Object.entries(PLACES)) this.markers[id] = makeMarker(game.scene, place.x, place.z, place.color, place.car ? 4 : 1.6);
    this.tokens = [];
    this.cash = [];
    this.near = null;
    this.buildTokens();
  }

  buildTokens() {
    const rng = makeRng(4242);
    const mat = new THREE.MeshPhongMaterial({ color: '#ffd166', emissive: '#ff9f1c', emissiveIntensity: 0.6, shininess: 100 });
    for (let k = 0; k < 20; k += 1) {
      let x;
      let z;
      if (k < 4) {
        x = -CITY.half + 60 + k * 190 + rng() * 40;
        z = CITY.half + 22;
      } else {
        const bx = Math.floor(rng() * CITY.blocks);
        const bz = Math.floor(rng() * CITY.blocks);
        const p = sidewalkPoint(getBlock(bx, bz), rng());
        x = p.x;
        z = p.z;
      }
      const mesh = new THREE.Mesh(tokenGeo, mat);
      mesh.position.set(x, 1.3, z);
      this.game.scene.add(mesh);
      this.tokens.push({ x, z, mesh, taken: false });
    }
  }

  setTokensTaken(list) {
    this.tokens.forEach((t, i) => {
      t.taken = list.includes(i);
      t.mesh.visible = !t.taken;
    });
  }

  takenTokens() {
    return this.tokens.map((t, i) => (t.taken ? i : -1)).filter((i) => i >= 0);
  }

  dropCash(x, z, amount) {
    const mesh = new THREE.Mesh(cashGeo, new THREE.MeshLambertMaterial({ color: '#58d68d', emissive: '#1e8449', emissiveIntensity: 0.5 }));
    mesh.position.set(x, 0.35, z);
    this.game.scene.add(mesh);
    this.cash.push({ x, z, amount, mesh, age: 0 });
  }

  update(dt, time) {
    const g = this.game;
    const p = g.player;
    for (const m of Object.values(this.markers)) {
      m.gem.rotation.y = time * 2;
      m.gem.position.y = 2.6 + Math.sin(time * 3) * 0.2;
      m.ring.material.opacity = 0.35 + Math.sin(time * 4) * 0.1;
    }
    for (const [i, t] of this.tokens.entries()) {
      if (t.taken) continue;
      t.mesh.rotation.y = time * 2.5 + i;
      if (Math.hypot(t.x - p.x, t.z - p.z) < 2.2) {
        t.taken = true;
        t.mesh.visible = false;
        g.addMoney(100);
        play('pickup');
        const count = this.takenTokens().length;
        g.hud.feed(`Sun Token ${count}/20`);
        if (count === 20) { g.addMoney(5000); g.hud.big('ALL SUN TOKENS', '+$5,000'); }
      }
    }
    for (const c of [...this.cash]) {
      c.age += dt;
      c.mesh.rotation.y = time * 3;
      if (Math.hypot(c.x - p.x, c.z - p.z) < 1.6 && !p.vehicle) {
        g.addMoney(c.amount);
        play('cash');
        this.removeCash(c);
      } else if (c.age > 40) this.removeCash(c);
    }
    this.near = null;
    for (const [id, place] of Object.entries(PLACES)) {
      const m = this.markers[id];
      if (Math.hypot(m.x - p.x, m.z - p.z) > m.radius + 0.5) continue;
      if (place.foot && p.vehicle) continue;
      if (place.car && !p.vehicle) continue;
      this.near = id;
    }
    this.prompt();
    if (this.near && wasPressed('KeyE')) this.use(this.near);
  }

  removeCash(c) {
    this.game.scene.remove(c.mesh);
    this.cash.splice(this.cash.indexOf(c), 1);
  }

  prompt() {
    const g = this.game;
    if (!this.near) return;
    const v = g.player.vehicle;
    const text = {
      safehouse: '<kbd>E</kbd> Save game at Bayview Apartments',
      shop: '<kbd>E</kbd> Browse Lockbox Arms',
      respray: `<kbd>E</kbd> Respray and lose the heat ($${g.police.level > 0 ? 250 : 100})`,
      salvage: v ? `<kbd>E</kbd> Sell the ${v.model.name} for $${this.salvageValue(v)}` : '',
    }[this.near];
    g.hud.setPrompt(text);
  }

  salvageValue(v) {
    return Math.round(((VEHICLES[v.modelId].value || 200) * Math.max(0.2, v.health / 100)) / 10) * 10;
  }

  use(id) {
    const g = this.game;
    const p = g.player;
    if (id === 'safehouse') {
      g.saveGame();
      g.hud.big('GAME SAVED', 'Bayview Apartments');
    } else if (id === 'shop') {
      g.menu.openShop();
    } else if (id === 'respray') {
      const price = g.police.level > 0 ? 250 : 100;
      if (g.money < price) { g.hud.toast('Not enough cash'); play('fail'); return; }
      g.addMoney(-price);
      const v = p.vehicle;
      const colors = VEHICLES[v.modelId].colors;
      const next = ['#ff6f61', '#3fd6c6', '#ffd166', '#9b5de5', '#f15bb5', '#f8f9fa'][Math.floor(Math.random() * 6)];
      v.group.traverse((child) => {
        if (child.isMesh && child.material.color && child.material.color.getHexString() === new THREE.Color(v.color).getHexString()) {
          child.material = child.material.clone();
          child.material.color.set(next);
        }
      });
      v.color = colors.includes(next) ? next : next;
      v.health = 100;
      g.police.setLevel(0);
      play('cash');
      g.hud.big('FRESH PAINT', 'The heat is off');
    } else if (id === 'salvage') {
      const v = p.vehicle;
      if (v.model.police || v.mission) { g.hud.toast('Rustline won\u2019t touch that one'); return; }
      const value = this.salvageValue(v);
      p.exitVehicle(true);
      v.remove();
      g.addMoney(value);
      g.stats.carsSold += 1;
      play('cash');
      g.hud.big('SOLD', `+$${value}`);
    }
  }
}
