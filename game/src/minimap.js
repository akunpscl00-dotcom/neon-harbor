// The map: one painted picture of Port Halcyon, shown as a rotating radar on the HUD and as the full map in the pause menu.
import { CITY, DISTRICTS, roadCenter, blockCenter } from './config.js';
import { getBlock } from './city.js';
import { PLACES } from './places.js';
import { STORY } from './missions.js';
import { vehicles } from './vehicle.js';

const MIN = -CITY.half - 70;
const SPAN = CITY.size + 140 + CITY.beach;
const RES = 1024;
const S = RES / SPAN;
let paper = null;

const toMap = (v) => (v - MIN) * S;

/** Paint the static city once. */
export function paintMap() {
  paper = document.createElement('canvas');
  paper.width = RES;
  paper.height = RES;
  const c = paper.getContext('2d');
  c.fillStyle = '#1f7f9a';
  c.fillRect(0, 0, RES, RES);
  c.fillStyle = '#f2d7a6';
  c.fillRect(toMap(-CITY.half - 20), toMap(CITY.half), (CITY.size + 40) * S, CITY.beach * S);
  c.fillStyle = '#3b3d48';
  c.fillRect(toMap(-CITY.half), toMap(-CITY.half), CITY.size * S, CITY.size * S);
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const b = getBlock(bx, bz);
      c.fillStyle = b.park ? '#5f9e55' : DISTRICTS[b.district].map;
      c.fillRect(toMap(blockCenter(bx) - CITY.block / 2), toMap(blockCenter(bz) - CITY.block / 2), CITY.block * S, CITY.block * S);
    }
  }
  c.strokeStyle = '#ffd16655';
  c.lineWidth = 1;
  for (let i = 0; i <= CITY.blocks; i += 1) {
    c.beginPath();
    c.moveTo(toMap(roadCenter(i)), toMap(-CITY.half));
    c.lineTo(toMap(roadCenter(i)), toMap(CITY.half));
    c.moveTo(toMap(-CITY.half), toMap(roadCenter(i)));
    c.lineTo(toMap(CITY.half), toMap(roadCenter(i)));
    c.stroke();
  }
  return paper;
}

function blip(c, x, y, color, size, shape = 'dot', label = '') {
  c.fillStyle = color;
  c.strokeStyle = '#000a';
  c.lineWidth = 1.5;
  c.beginPath();
  if (shape === 'square') c.rect(x - size, y - size, size * 2, size * 2);
  else c.arc(x, y, size, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  if (label) {
    c.fillStyle = '#111';
    c.font = `bold ${Math.round(size * 1.3)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, x, y + 0.5);
  }
}

/** Everything that moves or matters, as [x, z, colour, size, shape, label, clampToEdge]. */
function collectBlips(game, time) {
  const list = [];
  for (const [id, p] of Object.entries(PLACES)) list.push([p.x, p.z, p.color, 6, 'square', p.icon, false, id]);
  const m = game.missions;
  if (!m.active && STORY[m.next]?.start) list.push([STORY[m.next].start.x, STORY[m.next].start.z, '#ffd166', 8, 'dot', STORY[m.next].giver[0], true]);
  for (const e of m.enemies) if (e.alive) list.push([e.x, e.z, '#ff3b3b', 4, 'dot', '', false]);
  const obj = m.objective();
  if (obj) list.push([obj.x, obj.z, '#ffd166', 7, 'dot', '', true]);
  const flash = Math.floor(time * 4) % 2 ? '#ff2d55' : '#2d7bff';
  for (const v of vehicles) if (v.model.police && !v.wrecked && v.siren) list.push([v.x, v.z, flash, 4.5, 'dot', '', false]);
  for (const c of game.police.cops) if (c.alive) list.push([c.x, c.z, flash, 3, 'dot', '', false]);
  if (game.player.vehicle === null) for (const v of vehicles) if (v.mission && !v.wrecked && v !== m.target) list.push([v.x, v.z, '#3fd6c6', 5, 'square', '', true]);
  return list;
}

/** Radar in the HUD corner, turned with the camera so forward is up. */
export function drawMinimap(canvas, game, yaw, time) {
  if (!paper) paintMap();
  const c = canvas.getContext('2d');
  const w = canvas.width;
  const p = game.player;
  const zoom = p.vehicle ? 1.3 + Math.min(0.9, Math.abs(p.vehicle.speed) / 40) : 1.25;
  const pxPerUnit = (w / 220) * 1.4 / zoom;
  const angle = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
  c.save();
  c.fillStyle = '#1f7f9a';
  c.fillRect(0, 0, w, w);
  c.beginPath();
  c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
  c.clip();
  c.translate(w / 2, w / 2);
  c.rotate(angle);
  c.scale(pxPerUnit / S, pxPerUnit / S);
  c.translate(-toMap(p.x), -toMap(p.z));
  c.drawImage(paper, 0, 0);
  c.restore();
  // blips, rotated into radar space and clamped to the rim when they matter
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radius = w / 2 - 10;
  for (const [x, z, color, size, shape, label, clamp] of collectBlips(game, time)) {
    const dx = (x - p.x) * pxPerUnit;
    const dz = (z - p.z) * pxPerUnit;
    let sx = dx * cos - dz * sin;
    let sy = dx * sin + dz * cos;
    const d = Math.hypot(sx, sy);
    if (d > radius) {
      if (!clamp) continue;
      sx = (sx / d) * radius;
      sy = (sy / d) * radius;
    }
    blip(c, w / 2 + sx, w / 2 + sy, color, size, shape, label);
  }
  // the player arrow points the way Nico (or the car) faces
  const heading = p.vehicle ? p.vehicle.heading : p.body.heading;
  const rel = angle + Math.atan2(Math.cos(heading), Math.sin(heading));
  c.save();
  c.translate(w / 2, w / 2);
  c.rotate(rel + Math.PI / 2);
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#000';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -9);
  c.lineTo(7, 7);
  c.lineTo(0, 3);
  c.lineTo(-7, 7);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
  // heat paints the rim in police colours
  if (game.police.level > 0) {
    c.strokeStyle = Math.floor(time * 3) % 2 ? '#ff2d55cc' : '#2d7bffcc';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = '#fff';
  c.font = 'bold 13px sans-serif';
  c.textAlign = 'center';
  c.fillText('N', w / 2 + Math.sin(-angle) * 0 + (radius - 2) * Math.cos(angle - Math.PI / 2), w / 2 + (radius - 2) * Math.sin(angle - Math.PI / 2) + 4);
}

/** The full map for the pause menu, with a legend. */
export function drawFullMap(canvas, game, time) {
  if (!paper) paintMap();
  const c = canvas.getContext('2d');
  const w = canvas.width;
  c.drawImage(paper, 0, 0, w, w);
  const k = w / RES;
  c.font = 'bold 15px sans-serif';
  c.textAlign = 'center';
  c.fillStyle = '#ffffffdd';
  const labels = [['Old Port', blockCenter(0) + 40, blockCenter(4)], ['Sundial Heights', blockCenter(4), blockCenter(3)], ['Coral Flats', blockCenter(4), blockCenter(7) + 10], ['Palmera Gardens', blockCenter(7) + 40, blockCenter(3)], ['Brightwater', blockCenter(4), blockCenter(0)], ['Halcyon Beach', 0, CITY.half + 24]];
  for (const [text, x, z] of labels) c.fillText(text, toMap(x) * k, toMap(z) * k);
  for (const [x, z, color, size, shape, label] of collectBlips(game, time)) blip(c, toMap(x) * k, toMap(z) * k, color, size + 1, shape, label);
  const p = game.player;
  blip(c, toMap(p.x) * k, toMap(p.z) * k, '#ffffff', 6, 'dot', '');
}
