// The HUD: money, clock, heat, weapon, health and armour, vehicle and radio, mission objective,
// subtitles, feed, prompts and the big centre-screen titles.
import { WEAPONS } from './config.js';
import { clockText } from './sky.js';
import { drawMinimap } from './minimap.js';
import { radioName } from './audio.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.minimap = $('hud-minimap');
    this.bigTimer = 0;
    this.districtTimer = 0;
    this.lastDistrict = '';
    this.prompt = '';
    this.promptSet = false;
    this.shownMoney = 0;
    this.hitTimer = 0;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  setObjective(title, text) {
    $('hud-mission-title').textContent = title;
    $('hud-mission-text').textContent = text;
    $('hud-objective').classList.toggle('empty', !title);
  }

  setTimer(seconds) {
    $('hud-timer').textContent = seconds === null ? '' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  subtitle(html) {
    $('hud-subtitle').innerHTML = html;
  }

  setPrompt(html) {
    this.prompt = html;
    this.promptSet = true;
  }

  feed(text) {
    const el = document.createElement('div');
    el.textContent = text;
    $('hud-feed').appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while ($('hud-feed').children.length > 5) $('hud-feed').firstChild.remove();
  }

  toast(text) {
    this.feed(text);
  }

  big(title, sub = '') {
    const el = $('hud-big');
    el.innerHTML = `${title}<small>${sub}</small>`;
    el.classList.add('show');
    this.bigTimer = 3.2;
  }

  hitMarker() {
    this.hitTimer = 0.15;
  }

  showVehicle(v) {
    $('hud-vehicle').classList.toggle('hidden', !v);
    if (v) {
      $('hud-vehicle-name').textContent = v.model.name;
      $('hud-radio').textContent = radioName();
    }
  }

  district(name) {
    if (name === this.lastDistrict) return;
    this.lastDistrict = name;
    $('hud-district').textContent = name;
    $('hud-district').classList.add('show');
    this.districtTimer = 3.5;
  }

  update(dt, yaw, time) {
    const g = this.game;
    const p = g.player;
    this.shownMoney += (g.money - this.shownMoney) * Math.min(1, dt * 6);
    if (Math.abs(g.money - this.shownMoney) < 1) this.shownMoney = g.money;
    $('hud-money').textContent = `$${Math.round(this.shownMoney).toLocaleString('en-US')}`;
    $('hud-clock').textContent = clockText(g.clock);
    const heat = g.police.level;
    let stars = '';
    for (let i = 1; i <= 5; i += 1) stars += `<span class="${i <= heat ? 'on' : 'off'}">\u25C6</span>`;
    const wanted = $('hud-wanted');
    wanted.innerHTML = stars;
    wanted.classList.toggle('flash', heat > 0 && !g.police.seen);
    const w = WEAPONS[p.weapon];
    $('hud-weapon-name').textContent = w.name;
    $('hud-ammo').textContent = w.melee ? '' : p.reload > 0 ? 'reloading' : `${p.mag} / ${Math.max(0, p.ammo[p.weapon] - p.mag)}`;
    $('hud-health').style.width = `${Math.max(0, p.health)}%`;
    $('hud-armor').style.width = `${Math.max(0, p.armor)}%`;
    if (p.vehicle) {
      $('hud-speed').textContent = `${Math.round(Math.abs(p.vehicle.speed) * 3.6)} km/h`;
      $('hud-radio').textContent = radioName();
    }
    $('hud-damage').style.opacity = String(Math.min(1, p.hurtFlash * 2 + (p.health < 25 ? 0.35 + Math.sin(time * 6) * 0.15 : 0)));
    $('hud-crosshair').classList.toggle('hidden', !(p.body.aiming || (p.vehicle && p.weapon !== 'fists')));
    this.hitTimer -= dt;
    $('hud-crosshair').classList.toggle('hit', this.hitTimer > 0);
    $('hud-prompt').innerHTML = this.promptSet ? this.prompt : this.defaultPrompt();
    this.promptSet = false;
    this.bigTimer -= dt;
    if (this.bigTimer <= 0) $('hud-big').classList.remove('show');
    this.districtTimer -= dt;
    if (this.districtTimer <= 0) $('hud-district').classList.remove('show');
    drawMinimap(this.minimap, g, yaw, time);
  }

  defaultPrompt() {
    const p = this.game.player;
    if (p.vehicle || !p.alive) return '';
    const v = p.nearbyVehicle();
    if (!v) return '';
    return v.driver ? `<kbd>F</kbd> Jack the ${v.model.name}` : `<kbd>F</kbd> Get in the ${v.model.name}`;
  }
}
