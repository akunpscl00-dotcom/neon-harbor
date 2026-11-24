// Menus: the title screen, the pause menu (map, story, stats, settings, controls, save/load) and the Lockbox Arms shop.
import { SHOP_ITEMS, WEAPONS } from './config.js';
import { hasSave, readSave, writeSettings } from './save.js';
import { drawFullMap } from './minimap.js';
import { play, volume, setVolumes } from './audio.js';
import { STORY } from './missions.js';

const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Walk / drive'],
  ['Mouse', 'Look and aim (click the game to capture the mouse)'],
  ['Left click', 'Fire / punch'],
  ['Right click', 'Aim over the shoulder'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / handbrake'],
  ['F', 'Get in, jack or leave a car'],
  ['E', 'Use (shop, safehouse, respray, salvage)'],
  ['R', 'Reload / change radio station'],
  ['H', 'Horn'],
  ['1-4, wheel', 'Choose weapon'],
  ['Esc / P', 'Pause menu, map and save'],
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.tab = 'map';
    this.titleIndex = 0;
    $('pause').addEventListener('click', (e) => e.stopPropagation());
  }

  // ---- title ----
  showTitle() {
    $('title').classList.remove('hidden');
    const items = [
      ['Continue', () => this.game.continueGame(), !hasSave()],
      ['New Game', () => this.game.newGame(), false],
      ['Controls', () => this.openInfo('controls'), false],
      ['Credits', () => this.openInfo('credits'), false],
    ];
    const menu = $('title-menu');
    menu.innerHTML = '';
    this.titleButtons = items.map(([label, action, disabled], i) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener('click', () => { play('click'); action(); });
      b.addEventListener('mouseenter', () => { this.titleIndex = i; this.markTitle(); });
      menu.appendChild(b);
      return b;
    });
    this.titleIndex = hasSave() ? 0 : 1;
    this.markTitle();
  }

  markTitle() {
    this.titleButtons.forEach((b, i) => b.classList.toggle('sel', i === this.titleIndex));
  }

  titleKey(code) {
    if (!this.titleButtons) return;
    const n = this.titleButtons.length;
    const step = code === 'ArrowDown' || code === 'KeyS' ? 1 : code === 'ArrowUp' || code === 'KeyW' ? -1 : 0;
    if (step) {
      do { this.titleIndex = (this.titleIndex + step + n) % n; } while (this.titleButtons[this.titleIndex].disabled);
      this.markTitle();
      play('click');
    }
    if (code === 'Enter' || code === 'Space') this.titleButtons[this.titleIndex].click();
  }

  hideTitle() {
    $('title').classList.add('hidden');
  }

  openInfo(which) {
    this.tab = which;
    this.infoOnly = true;
    $('pause').classList.remove('hidden');
    this.renderPause();
  }

  // ---- pause ----
  openPause() {
    this.infoOnly = false;
    this.tab = 'map';
    $('pause').classList.remove('hidden');
    this.renderPause();
  }

  closePause() {
    $('pause').classList.add('hidden');
  }

  renderPause() {
    const tabs = this.infoOnly
      ? [[this.tab, this.tab === 'controls' ? 'Controls' : 'Credits'], ['back', 'Back']]
      : [['map', 'Map'], ['story', 'Story'], ['stats', 'Stats'], ['settings', 'Settings'], ['controls', 'Controls'], ['game', 'Game']];
    const bar = $('pause-tabs');
    bar.innerHTML = '';
    for (const [id, label] of tabs) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('sel', id === this.tab);
      b.addEventListener('click', () => {
        play('click');
        if (id === 'back') { this.closePause(); return; }
        this.tab = id;
        this.renderPause();
      });
      bar.appendChild(b);
    }
    const body = $('pause-body');
    body.innerHTML = '';
    const g = this.game;
    if (this.tab === 'map') {
      const c = document.createElement('canvas');
      c.width = 520;
      c.height = 520;
      body.appendChild(c);
      drawFullMap(c, g, g.time);
    } else if (this.tab === 'story') {
      const log = g.missions.briefLog();
      const next = STORY[g.missions.next];
      body.innerHTML = `<div class="log"><h3>Nico Vale &middot; Port Halcyon</h3>${log.map((m) => `<p><b>${m.title}.</b> ${m.text}</p>`).join('') || '<p>Nico just got off the bus at Bayview.</p>'}
        ${next ? `<h3>Next</h3><p><b>${next.title}</b> &middot; ${next.giver === 'Nico' ? 'in progress' : `see ${next.giver} (yellow ${next.giver[0]} on the map)`}</p>` : '<h3>Story complete</h3><p>The Ferro Ledger is out. Sun Tokens and the city are still waiting.</p>'}</div>`;
    } else if (this.tab === 'stats') {
      const s = g.stats;
      const rows = [
        ['Missions passed', `${s.missions} / ${STORY.length}`], ['Cash', `$${g.money.toLocaleString('en-US')}`], ['Sun Tokens', `${g.places.takenTokens().length} / 20`],
        ['Cars stolen', s.carsStolen], ['Cars sold to Rustline', s.carsSold], ['Distance driven', `${(s.distance / 1000).toFixed(1)} km`],
        ['Takedowns', s.kills], ['Highest heat', s.maxHeat], ['Times flatlined', s.deaths], ['Times arrested', s.busts], ['Time on the streets', `${Math.floor(s.playTime / 60)} min`],
      ];
      body.innerHTML = `<table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
    } else if (this.tab === 'settings') {
      body.innerHTML = '';
      const add = (label, value, min, max, step, onInput) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span>${label}</span>`;
        const input = document.createElement('input');
        Object.assign(input, { type: 'range', min, max, step, value });
        input.addEventListener('input', () => { onInput(Number(input.value)); this.saveSettings(); });
        row.appendChild(input);
        body.appendChild(row);
      };
      add('Master volume', volume.master, 0, 1, 0.05, (v) => { volume.master = v; setVolumes(); });
      add('Radio volume', volume.music, 0, 1, 0.05, (v) => { volume.music = v; setVolumes(); });
      add('Effects volume', volume.sfx, 0, 1, 0.05, (v) => { volume.sfx = v; setVolumes(); });
      add('Mouse sensitivity', g.rig.sensitivity * 1000, 0.8, 6, 0.1, (v) => { g.rig.sensitivity = v / 1000; });
      add('Time of day', g.clock, 0, 23.9, 0.1, (v) => { g.clock = v; });
    } else if (this.tab === 'controls') {
      body.innerHTML = `<table>${CONTROLS.map(([k, v]) => `<tr><td>${v}</td><td>${k}</td></tr>`).join('')}</table>`;
    } else if (this.tab === 'credits') {
      body.innerHTML = `<div class="log"><h3>Neon Harbor</h3><p>An original open-world crime game set in the fictional coastal city of Port Halcyon.</p>
        <p>City, characters, vehicles, story, radio music and sound are all made for this game, procedurally, in code. Rendering by three.js (MIT).</p>
        <p>Made by an AI agent for the make.fun bounty.</p></div>`;
    } else if (this.tab === 'game') {
      const save = readSave();
      body.innerHTML = '';
      const info = document.createElement('p');
      info.textContent = save ? `Last save: ${new Date(save.savedAt).toLocaleString()} \u00b7 mission ${Math.min(save.next + 1, STORY.length)}` : 'No save yet. Save here or at the Bayview safehouse (H on the map).';
      body.appendChild(info);
      const buttons = [
        ['Resume', () => g.resume()],
        ['Save game', () => { g.saveGame(); this.renderPause(); }],
        ['Load last save', () => g.continueGame(), !save],
        ['Quit to title', () => g.quitToTitle()],
      ];
      for (const [label, action, disabled] of buttons) {
        const b = document.createElement('button');
        b.textContent = label;
        b.disabled = !!disabled;
        b.style.display = 'block';
        b.style.margin = '8px 0';
        b.style.width = '280px';
        b.addEventListener('click', () => { play('click'); action(); });
        body.appendChild(b);
      }
    }
  }

  saveSettings() {
    writeSettings({ master: volume.master, music: volume.music, sfx: volume.sfx, sensitivity: this.game.rig.sensitivity });
  }

  // ---- shop ----
  openShop() {
    const g = this.game;
    g.setMode('shop');
    $('shop').classList.remove('hidden');
    this.renderShop();
  }

  renderShop() {
    const g = this.game;
    const p = g.player;
    const body = $('shop-body');
    body.innerHTML = `<p>Cash: <b>$${g.money.toLocaleString('en-US')}</b></p>`;
    for (const item of SHOP_ITEMS) {
      const owned = item.weapon && p.owned.has(item.weapon);
      const needs = item.ammoFor && !p.owned.has(item.ammoFor);
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${item.label}${owned ? ' (owned)' : ''}</span>`;
      const b = document.createElement('button');
      b.textContent = `$${item.price}`;
      b.disabled = owned || needs || g.money < item.price || (item.armor && p.armor >= 100);
      b.addEventListener('click', () => {
        if (g.money < item.price) return;
        g.addMoney(-item.price);
        if (item.weapon) p.giveWeapon(item.weapon, item.ammo);
        if (item.ammoFor) p.ammo[item.ammoFor] += item.ammo;
        if (item.armor) p.armor = 100;
        play('cash');
        this.renderShop();
      });
      row.appendChild(b);
      body.appendChild(row);
    }
    const close = document.createElement('button');
    close.textContent = 'Leave (Esc)';
    close.addEventListener('click', () => this.closeShop());
    body.appendChild(close);
  }

  closeShop() {
    $('shop').classList.add('hidden');
    this.game.setMode('play');
  }
}

export { WEAPONS };
