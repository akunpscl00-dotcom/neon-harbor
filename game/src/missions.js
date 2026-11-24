// The story of Nico Vale and the Ferro Ledger: five missions built from small stage steps
// (talk, get a car, go somewhere against the clock, fight, steal, lose the heat, chase).
import { CITY, roadCenter, blockCenter } from './config.js';
import { LANDMARKS, PLACES, makeMarker } from './places.js';
import { Human } from './human.js';
import { Vehicle } from './vehicle.js';
import { updateShooter } from './police.js';
import { nearestNode } from './city.js';
import { DIRS } from './traffic.js';
import { play } from './audio.js';
import { rand } from './random.js';

const L = LANDMARKS;
const yardX = blockCenter(1) + 14;
const yardZ = blockCenter(6);

export const STORY = [
  {
    id: 'homecoming',
    title: 'Homecoming',
    giver: 'Nico',
    start: null,
    summary: 'Nico came home to Port Halcyon. Aunt Ines told him Odile Ferro has bought the harbour board and wants the diner\u2019s block.',
    stages: [
      { type: 'talk', lines: [['Nico', 'Three years away and Port Halcyon still smells like sunscreen and diesel.'], ['Nico', 'Aunt Ines said to come straight to the diner. I need wheels.']] },
      { type: 'vehicle', text: 'Get a car: walk up to one and press F.' },
      { type: 'goto', text: 'Drive to the Seagrass Diner in Coral Flats.', at: L.diner, radius: 5 },
      { type: 'talk', lines: [['Ines', 'Nico! Look at you, skinny as a pier post.'], ['Ines', 'Odile Ferro bought the harbour board. Now she wants my block.'], ['Ines', 'Dex Okafor still runs the Old Port. He has work, and you need money.']] },
      { type: 'reward', money: 500 },
    ],
  },
  {
    id: 'paper',
    title: 'Paper Route',
    giver: 'Dex',
    start: L.dex,
    summary: 'A rush delivery for Dex: Ferro\u2019s own paperwork, dropped at Sundial Tower. Dex paid in cash and a P9 Pocket.',
    stages: [
      { type: 'talk', lines: [['Dex', 'Nico Vale, back from the dead. Still drive like rent\u2019s due?'], ['Dex', 'Parcel on the quay for a client in Sundial Tower. Late and they don\u2019t pay.']] },
      { type: 'goto', text: 'Pick up the parcel on the quay.', at: { x: roadCenter(0) + 4, z: blockCenter(4) }, radius: 4 },
      { type: 'goto', text: 'Deliver the parcel to the Sundial Tower lobby.', at: L.tower, radius: 5, timer: 110 },
      { type: 'talk', lines: [['Dex', 'Clean. Client says it was Ferro\u2019s paperwork. That woman has enemies everywhere.']] },
      { type: 'reward', money: 1200, weapon: ['pistol', 48] },
    ],
  },
  {
    id: 'tide',
    title: 'Tide Breakers',
    giver: 'Dex',
    start: L.dex,
    summary: 'Nico broke up the Tidecutters\u2019 yard. Their manifest lists the Seagrass Diner as \u201ccleared for demolition\u201d.',
    stages: [
      { type: 'talk', lines: [['Dex', 'The Tidecutters move Ferro\u2019s crates through a yard by the docks.'], ['Dex', 'Take the P9. Clear them out and bring me their manifest.']] },
      { type: 'goto', text: 'Head to the Tidecutter yard in the Old Port.', at: { x: yardX - 4, z: yardZ - 30 }, radius: 7 },
      { type: 'kill', text: 'Take out the Tidecutters.', spawn: [[yardX, yardZ - 10], [yardX + 6, yardZ], [yardX - 4, yardZ + 8], [yardX + 10, yardZ + 14], [yardX + 2, yardZ - 20]] },
      { type: 'goto', text: 'Grab the manifest.', at: { x: yardX, z: yardZ }, radius: 2.5, foot: true },
      { type: 'talk', lines: [['Nico', 'Ferro Maritime, shipment seven... it lists the diner as cleared for demolition.']] },
      { type: 'reward', money: 2000, weapon: ['smg', 90] },
    ],
  },
  {
    id: 'heatwave',
    title: 'Heatwave',
    giver: 'Ines',
    start: L.diner,
    summary: 'Nico stole Commissioner Ferro\u2019s Sabre GT from her own garage, shook off half the police force and gave it to Dex.',
    stages: [
      { type: 'talk', lines: [['Ines', 'A man came by with a contract today. I told him where to put it.'], ['Nico', 'Ferro keeps a Sabre GT at her garage. Let\u2019s see how she likes losing something.']] },
      { type: 'spawnCar', model: 'sabre', color: '#f72585', at: L.garage, heading: 0 },
      { type: 'enterCar', text: 'Steal Ferro\u2019s Sabre GT from the Ferro Maritime garage.' },
      { type: 'heat', level: 3 },
      { type: 'loseHeat', text: 'Lose the police. Stay out of their sight.' },
      { type: 'goto', text: 'Deliver the Sabre to Dex in the Old Port.', at: L.dex, radius: 6, car: true },
      { type: 'talk', lines: [['Dex', 'You stole the commissioner\u2019s car? Beautiful. Insane, but beautiful.']] },
      { type: 'reward', money: 3000 },
    ],
  },
  {
    id: 'ledger',
    title: 'The Ferro Ledger',
    giver: 'Dex',
    start: L.dex,
    summary: 'Nico wrecked Ferro\u2019s courier and brought her ledger to Ines: every bribe, every name. Port Halcyon is still theirs.',
    stages: [
      { type: 'talk', lines: [['Dex', 'Ferro\u2019s courier is taking her ledger to a boat tonight. Every bribe, every name.'], ['Dex', 'Stop that car and the harbour board goes down with her.']] },
      { type: 'chase', text: 'Wreck Ferro\u2019s courier before it reaches the water.', model: 'courier' },
      { type: 'goto', text: 'Grab the ledger from the wreck.', at: 'wreck', radius: 3.5, foot: true },
      { type: 'heat', level: 2 },
      { type: 'goto', text: 'Get the ledger to Ines at the Seagrass Diner.', at: L.diner, radius: 5 },
      { type: 'talk', lines: [['Ines', 'This is enough to bury her. The papers, the TV, all of it.'], ['Nico', 'Port Halcyon is still ours, t\u00eda.'], ['Ines', 'Then go enjoy it. The sun\u2019s going down and you earned the view.']] },
      { type: 'reward', money: 5000 },
    ],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.next = 0;
    this.active = null;
    this.stage = 0;
    this.enemies = [];
    this.marker = null;
    this.startMarker = null;
    this.timer = 0;
    this.talkIndex = 0;
    this.talkTime = 0;
    this.car = null;
    this.target = null;
    this.wreckAt = null;
  }

  get current() { return this.active ? STORY[this.active.index] : null; }

  objective() {
    if (!this.active) return null;
    const st = this.current.stages[this.stage];
    if (!st) return null;
    if (this.markerPos) return this.markerPos;
    if (st.type === 'kill') {
      const alive = this.enemies.find((e) => e.alive);
      return alive ? { x: alive.x, z: alive.z } : null;
    }
    if (st.type === 'enterCar' && this.car) return { x: this.car.x, z: this.car.z };
    if (st.type === 'chase' && this.target) return { x: this.target.x, z: this.target.z };
    return null;
  }

  refreshStartMarker() {
    if (this.startMarker) { this.game.scene.remove(this.startMarker.group); this.startMarker = null; }
    const m = STORY[this.next];
    if (!this.active && m && m.start) this.startMarker = makeMarker(this.game.scene, m.start.x, m.start.z, '#ffd166', 2.2);
  }

  begin(index) {
    const g = this.game;
    this.active = { index };
    this.stage = -1;
    if (this.startMarker) { g.scene.remove(this.startMarker.group); this.startMarker = null; }
    g.hud.big(STORY[index].title.toUpperCase(), `Mission ${index + 1} of ${STORY.length}`);
    play('pass');
    this.advance();
  }

  clearStage() {
    const g = this.game;
    if (this.marker) { g.scene.remove(this.marker.group); this.marker = null; }
    this.markerPos = null;
    this.timer = 0;
  }

  advance() {
    const g = this.game;
    this.clearStage();
    this.stage += 1;
    const st = this.current.stages[this.stage];
    if (!st) { this.complete(); return; }
    g.hud.setObjective(this.current.title, st.text ?? '');
    switch (st.type) {
      case 'talk': this.talkIndex = -1; this.talkTime = 0; break;
      case 'goto': {
        const at = st.at === 'wreck' ? this.wreckAt : st.at;
        this.markerPos = at;
        this.marker = makeMarker(g.scene, at.x, at.z, '#ffd166', st.radius * 0.6);
        if (st.timer) this.timer = st.timer;
        break;
      }
      case 'kill':
        for (const [x, z] of st.spawn) {
          const h = new Human(g.scene, 'thug', x, z, rand);
          h.setArmed(true);
          h.awake = false;
          h.onHurt = () => { for (const e of this.enemies) e.awake = true; };
          this.enemies.push(h);
        }
        break;
      case 'spawnCar':
        this.car = new Vehicle(g.scene, st.model, st.color, st.at.x, st.at.z, st.heading);
        this.car.keep = true;
        this.car.mission = true;
        this.advance();
        return;
      case 'heat':
        g.police.setLevel(st.level);
        this.advance();
        return;
      case 'chase': this.spawnTarget(st.model); break;
      case 'reward': {
        if (st.money) g.addMoney(st.money);
        if (st.weapon) g.player.giveWeapon(st.weapon[0], st.weapon[1]);
        this.advance();
        return;
      }
      default: break;
    }
  }

  spawnTarget(model) {
    const g = this.game;
    const p = g.player;
    // start a few junctions ahead of the player, heading away
    const n = nearestNode(p.x, p.z);
    const i = Math.min(CITY.blocks, n.i + (n.i < 5 ? 1 : -1));
    const j = Math.min(CITY.blocks, n.j + (n.j < 5 ? 2 : -2));
    const dir = j < CITY.blocks ? 1 : 3;
    const x = roadCenter(i) - 4 * DIRS[dir][1];
    const z = roadCenter(j);
    const v = new Vehicle(g.scene, model, null, x, z, 0);
    v.driver = 'ai';
    v.keep = true;
    v.mission = true;
    v.health = 140;
    v.heading = Math.atan2(DIRS[dir][0], DIRS[dir][1]);
    v.ai = { queue: [{ x: roadCenter(i) - 4 * DIRS[dir][1], z: roadCenter(j + DIRS[dir][1]) - 11 * DIRS[dir][1], node: [i, j + DIRS[dir][1]], dir }], cruise: 24, reckless: true };
    this.target = v;
  }

  complete() {
    const g = this.game;
    const m = this.current;
    g.hud.setObjective('', '');
    g.hud.big('MISSION PASSED', m.title);
    play('pass');
    g.stats.missions += 1;
    this.log = this.log ?? [];
    this.next = Math.max(this.next, this.active.index + 1);
    this.active = null;
    this.cleanup();
    if (this.next >= STORY.length) setTimeout(() => g.hud.big('PORT HALCYON IS YOURS', 'Story complete. Keep exploring.'), 3500);
    this.refreshStartMarker();
    g.saveGame(true);
  }

  fail(reason) {
    const g = this.game;
    if (!this.active) return;
    g.hud.big('MISSION FAILED', reason);
    play('fail');
    g.hud.setObjective('', '');
    this.active = null;
    this.cleanup();
    this.refreshStartMarker();
  }

  cleanup() {
    this.clearStage();
    for (const e of this.enemies) if (!e.alive || Math.hypot(e.x - this.game.player.x, e.z - this.game.player.z) > 60) e.remove();
    this.enemies = this.enemies.filter((e) => e.group.parent);
    if (this.car && this.car.driver !== 'player') { this.car.remove(); }
    this.car = null;
    if (this.target && !this.target.wrecked) this.target.remove();
    this.target = null;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    // enemies fight whether or not their stage is current
    for (const e of [...this.enemies]) {
      if (e.alive) {
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < 40) e.awake = true;
        if (e.awake && p.alive) updateShooter(e, dt, g, { range: 13, shoot: true, weapon: 'pistol', interval: 1.3, run: 5 });
      }
      e.animate(dt);
      e.sync();
      if (!e.alive && e.deadTime > 30) { e.remove(); this.enemies.splice(this.enemies.indexOf(e), 1); }
    }
    if (!this.active) {
      const m = STORY[this.next];
      if (m && this.startMarker && Math.hypot(m.start.x - p.x, m.start.z - p.z) < 3 && g.police.level === 0) this.begin(this.next);
      else if (m && this.startMarker && Math.hypot(m.start.x - p.x, m.start.z - p.z) < 3) g.hud.setPrompt('Lose the heat before starting a mission');
      return;
    }
    const st = this.current.stages[this.stage];
    if (!st) return;
    if (this.timer > 0) {
      this.timer -= dt;
      g.hud.setTimer(this.timer);
      if (this.timer <= 0) { this.fail('Out of time'); return; }
    } else g.hud.setTimer(null);
    switch (st.type) {
      case 'talk': {
        this.talkTime -= dt;
        if (this.talkTime <= 0) {
          this.talkIndex += 1;
          const line = st.lines[this.talkIndex];
          if (!line) { g.hud.subtitle(''); this.advance(); return; }
          g.hud.subtitle(`<b>${line[0]}:</b> ${line[1]}`);
          this.talkTime = 2 + line[1].length * 0.045;
        }
        break;
      }
      case 'vehicle': if (p.vehicle) this.advance(); break;
      case 'goto': {
        const at = this.markerPos;
        if (st.car && !p.vehicle) g.hud.setObjective(this.current.title, 'Get back in a car.');
        else if (st.car && this.car && p.vehicle !== this.car) g.hud.setObjective(this.current.title, 'Get back in the Sabre.');
        else g.hud.setObjective(this.current.title, st.text);
        const ok = (!st.car || (p.vehicle && (!this.car || p.vehicle === this.car))) && (!st.foot || !p.vehicle);
        if (ok && Math.hypot(at.x - p.x, at.z - p.z) < st.radius) this.advance();
        if (this.car && this.car.wrecked) this.fail('The Sabre was wrecked');
        break;
      }
      case 'kill':
        g.hud.setObjective(this.current.title, `${st.text} (${this.enemies.filter((e) => e.alive).length} left)`);
        if (this.enemies.every((e) => !e.alive)) this.advance();
        break;
      case 'enterCar':
        if (this.car.wrecked) this.fail('The Sabre was wrecked');
        else if (p.vehicle === this.car) this.advance();
        break;
      case 'loseHeat':
        if (this.car && this.car.wrecked) this.fail('The Sabre was wrecked');
        else if (g.police.level === 0) this.advance();
        break;
      case 'chase': {
        const t = this.target;
        if (t.wrecked) {
          this.wreckAt = { x: t.x + Math.cos(t.heading) * 3, z: t.z - Math.sin(t.heading) * 3 };
          this.advance();
        } else if (Math.hypot(t.x - p.x, t.z - p.z) > 280) this.fail('The courier got away');
        break;
      }
      default: break;
    }
  }

  /** Called when the player dies or is arrested. */
  abort(reason) {
    if (this.active) this.fail(reason);
  }

  briefLog() {
    return STORY.slice(0, this.next).map((m) => ({ title: m.title, text: m.summary }));
  }
}

export { PLACES };
