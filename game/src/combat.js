// Weapons and hits: hitscan shots against people, cars and buildings, melee, and car explosions.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { solidAt } from './city.js';
import { vehicles } from './vehicle.js';
import { play } from './audio.js';

const tmpDir = new THREE.Vector3();

/** First building or ground hit along a ray, by marching: distance or Infinity. */
function worldHit(o, d, range) {
  for (let t = 0.5; t < range; t += 0.6) {
    if (solidAt(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) return t;
  }
  return Infinity;
}

export class Combat {
  constructor(game) {
    this.game = game;
  }

  /** Every person who can be shot right now. */
  targets() {
    const g = this.game;
    return [...g.peds.list, ...g.police.cops, ...g.missions.enemies, g.player.body];
  }

  /**
   * Fire one shot (or a shotgun's pellets) from `muzzle` along `dir` (unit Vector3), aiming from `eye`.
   * `shooter` is the Human firing (it is never hit by its own shot).
   */
  shoot(shooter, weaponId, eye, dir, muzzle, isPlayer) {
    const w = WEAPONS[weaponId];
    const g = this.game;
    const pellets = w.pellets ?? 1;
    const dist = isPlayer ? 0 : Math.hypot(shooter.x - g.player.x, shooter.z - g.player.z);
    play(w.sound, dist);
    g.effects.muzzle(muzzle.x, muzzle.y, muzzle.z);
    let anyHit = false;
    for (let p = 0; p < pellets; p += 1) {
      tmpDir.copy(dir);
      tmpDir.x += (Math.random() - 0.5) * w.spread * 2;
      tmpDir.y += (Math.random() - 0.5) * w.spread * 2;
      tmpDir.z += (Math.random() - 0.5) * w.spread * 2;
      tmpDir.normalize();
      const result = this.trace(shooter, eye, tmpDir, w.range);
      const end = { x: eye.x + tmpDir.x * result.t, y: eye.y + tmpDir.y * result.t, z: eye.z + tmpDir.z * result.t };
      g.effects.tracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
      if (result.human) {
        anyHit = true;
        g.effects.blood(end.x, end.y, end.z);
        this.hurt(result.human, w.damage, shooter, isPlayer);
      } else if (result.vehicle) {
        anyHit = true;
        g.effects.sparks(end.x, end.y, end.z, 5);
        play('hit', dist);
        result.vehicle.damage(w.damage * 0.35);
        if (isPlayer) result.vehicle.lastHitByPlayer = true;
        if (isPlayer && result.vehicle.model.police) g.police.crime('copcar', end.x, end.z);
      } else if (result.t < w.range) {
        g.effects.sparks(end.x, end.y, end.z, 3);
        g.effects.dust(end.x, end.y, end.z);
      }
    }
    if (isPlayer) {
      g.peds.panic(shooter.x, shooter.z, 40);
      g.police.crime('gunfire', shooter.x, shooter.z);
    } else {
      g.peds.panic(shooter.x, shooter.z, 25);
    }
    return anyHit;
  }

  trace(shooter, o, d, range) {
    let best = { t: worldHit(o, d, range) };
    for (const h of this.targets()) {
      if (h === shooter || !h.alive || h.inVehicle) continue;
      const t = h.rayHit(o, d);
      if (t > 0 && t < best.t) best = { t, human: h };
    }
    for (const v of vehicles) {
      if (shooter.vehicle === v) continue;
      const t = v.rayHit(o, d);
      if (t > 0 && t < best.t) {
        // shooting through a car's window can hit the driver
        if (v.driver === 'player' && shooter !== this.game.player.body && Math.random() < 0.5) best = { t, human: this.game.player.body };
        else best = { t, vehicle: v };
      }
    }
    if (best.t === Infinity) best.t = range;
    return best;
  }

  /** Damage a person and report crimes and kills. */
  hurt(human, amount, attacker, byPlayer) {
    const g = this.game;
    if (human === g.player.body) { g.player.takeDamage(amount); return; }
    const killed = human.damage(amount, attacker?.x, attacker?.z);
    if (human.onHurt) human.onHurt(attacker);
    if (byPlayer) {
      if (human.kind === 'cop') g.police.crime(killed ? 'killcop' : 'hurtcop', human.x, human.z);
      else if (human.kind === 'ped') g.police.crime(killed ? 'kill' : 'assault', human.x, human.z);
      if (killed) {
        g.stats.kills += 1;
        if (human.kind === 'ped' && Math.random() < 0.6) g.places.dropCash(human.x, human.z, 10 + Math.floor(Math.random() * 40));
      }
    }
  }

  /** A punch in front of the attacker. */
  melee(attacker, byPlayer) {
    const w = WEAPONS.fists;
    const fx = Math.sin(attacker.heading);
    const fz = Math.cos(attacker.heading);
    let hit = false;
    for (const h of this.targets()) {
      if (h === attacker || !h.alive || h.inVehicle) continue;
      const dx = h.x - attacker.x;
      const dz = h.z - attacker.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      this.hurt(h, w.damage, attacker, byPlayer);
      h.x += fx * 0.6;
      h.z += fz * 0.6;
      hit = true;
      break;
    }
    play(hit ? 'punch' : 'click');
    if (hit && byPlayer) this.game.peds.panic(attacker.x, attacker.z, 12);
    return hit;
  }

  /** Burning wrecks blow up after a few seconds and take their surroundings with them. */
  updateWrecks(dt) {
    const g = this.game;
    for (const v of [...vehicles]) {
      if (v.health < 40 && !v.wrecked) {
        v.smokeTimer -= dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = v.health < 15 ? 0.05 : 0.12;
          g.effects.carSmoke(v.x + v.forwardX * v.model.len * 0.4, 1.3, v.z + v.forwardZ * v.model.len * 0.4, v.health < 15);
        }
        if (v.health < 15) v.damage(dt * 2);
      }
      if (!v.wrecked || v.exploded) continue;
      v.burning -= dt;
      v.smokeTimer -= dt;
      if (v.smokeTimer <= 0) { v.smokeTimer = 0.05; g.effects.carSmoke(v.x, 1.4, v.z, true); }
      if (v.burning > 0 && v.health > -1) {
        // a car shot to pieces goes up almost at once
        if (v.burning > 1.2) v.burning = 1.2;
      }
      if (v.burning <= 0) this.explode(v);
    }
  }

  explode(v) {
    const g = this.game;
    v.exploded = true;
    g.effects.explosion(v.x, 0.5, v.z);
    play('explosion', Math.hypot(v.x - g.player.x, v.z - g.player.z));
    v.vx += (Math.random() - 0.5) * 4;
    v.vz += (Math.random() - 0.5) * 4;
    g.peds.panic(v.x, v.z, 60);
    for (const h of this.targets()) {
      if (!h.alive) continue;
      const d = Math.hypot(h.x - v.x, h.z - v.z);
      if (h === g.player.body && g.player.vehicle === v) { g.player.takeDamage(200); continue; }
      if (d < 9 && !h.inVehicle) this.hurt(h, (9 - d) * 18, null, v.lastHitByPlayer);
    }
    for (const o of vehicles) {
      if (o === v || o.wrecked) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d < 9) {
        o.damage((9 - d) * 9);
        if (v.lastHitByPlayer) o.lastHitByPlayer = true;
      }
    }
    if (g.player.vehicle && g.player.vehicle !== v) {
      const d = Math.hypot(g.player.x - v.x, g.player.z - v.z);
      if (d < 7) g.player.takeDamage((7 - d) * 4);
    }
    if (v.lastHitByPlayer) g.police.crime(v.model.police ? 'killcop' : 'explosion', v.x, v.z);
  }
}
