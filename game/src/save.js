// Saving and loading: progress, money, weapons, collectibles, stats and settings, kept in the browser.
const KEY = 'neon-harbor.save.v1';
const SETTINGS_KEY = 'neon-harbor.settings.v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

/** Snapshot of everything that should survive a reload. */
export function snapshot(game) {
  const p = game.player;
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    money: game.money,
    clock: game.clock,
    next: game.missions.next,
    player: { x: p.x, z: p.z, health: Math.max(1, p.health), armor: p.armor },
    owned: [...p.owned],
    ammo: Object.fromEntries(Object.entries(p.ammo).filter(([, v]) => Number.isFinite(v))),
    weapon: p.weapon,
    tokens: game.places.takenTokens(),
    stats: game.stats,
  };
}

export function writeSave(game) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot(game)));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'); } catch { return null; }
}

export function writeSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}
