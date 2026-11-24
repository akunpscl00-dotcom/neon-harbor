// Shared constants for Port Halcyon: city layout, districts, vehicles, weapons, places and tuning.

export const CITY = {
  blocks: 9,
  block: 64,
  road: 16,
  sidewalk: 3.5,
  beach: 46,
};
CITY.cell = CITY.block + CITY.road;
CITY.size = CITY.blocks * CITY.cell + CITY.road;
CITY.half = CITY.size / 2;

/** Centre line of road number i (0..blocks), on either axis. */
export function roadCenter(i) {
  return -CITY.half + CITY.road / 2 + i * CITY.cell;
}
/** Centre of block number i (0..blocks-1), on either axis. */
export function blockCenter(i) {
  return roadCenter(i) + CITY.cell / 2;
}
/** Intersection (i, j) as a world point. */
export function nodePos(i, j) {
  return { x: roadCenter(i), z: roadCenter(j) };
}

export const DISTRICTS = {
  port: { name: 'Old Port', map: '#6b6f86', heights: [6, 14], palette: ['#b9a58f', '#8f9aa6', '#c98c6b', '#a7b3a0', '#d3c1a2'] },
  heights: { name: 'Sundial Heights', map: '#7c6c9c', heights: [40, 110], palette: ['#7fb2d6', '#9cc9e3', '#d9e4ee', '#86a9c9', '#f3d9b8'] },
  coral: { name: 'Coral Flats', map: '#c98a7c', heights: [10, 34], palette: ['#ffb4a2', '#ffd6a5', '#bde0c6', '#fdf1d6', '#f7a6c1', '#a8dadc'] },
  palmera: { name: 'Palmera Gardens', map: '#7fa27a', heights: [5, 10], palette: ['#fff1d0', '#f7cfd8', '#cde7d8', '#f9e2ae', '#e8d5f2'] },
  bright: { name: 'Brightwater', map: '#8b8aa0', heights: [14, 40], palette: ['#f2c6a0', '#e6e1d3', '#b7d3c9', '#f4a988', '#c9c1e6', '#f6e3b4'] },
};

/** District key for block coordinates. */
export function districtOfBlock(bx, bz) {
  if (bx <= 1) return 'port';
  if (bz >= 7) return 'coral';
  if (bx >= 7) return 'palmera';
  if (bx >= 3 && bx <= 5 && bz >= 2 && bz <= 5) return 'heights';
  return 'bright';
}

/** Blocks kept open as parks or plazas instead of buildings. */
export const PARKS = [
  [4, 6, 'Lumen Park'],
  [6, 2, 'Saltgrass Commons'],
  [2, 4, 'Pier Plaza'],
];

export const VEHICLES = {
  vela: { name: 'Vela Coupe', len: 4.4, wid: 1.9, hgt: 1.25, cabin: 0.5, maxSpeed: 38, accel: 14, grip: 7.5, value: 900, colors: ['#ff6f61', '#ffd166', '#06d6a0', '#ffffff', '#118ab2'] },
  marlin: { name: 'Marlin Sedan', len: 4.8, wid: 2.0, hgt: 1.4, cabin: 0.55, maxSpeed: 33, accel: 11, grip: 7, value: 700, colors: ['#e9ecef', '#495057', '#9d4edd', '#2a9d8f', '#e76f51', '#264653'] },
  tidewater: { name: 'Tidewater Van', len: 5.4, wid: 2.2, hgt: 2.3, cabin: 0.75, maxSpeed: 26, accel: 8, grip: 6, value: 500, colors: ['#f1faee', '#a8dadc', '#ffb703', '#8ecae6'] },
  sabre: { name: 'Sabre GT', len: 4.6, wid: 2.0, hgt: 1.1, cabin: 0.42, maxSpeed: 52, accel: 22, grip: 8.5, value: 2600, colors: ['#ef233c', '#fca311', '#00f5d4', '#f72585'] },
  dune: { name: 'Dune Pickup', len: 5.2, wid: 2.1, hgt: 1.7, cabin: 0.45, maxSpeed: 31, accel: 11, grip: 6.5, value: 650, colors: ['#bc6c25', '#606c38', '#dda15e', '#fefae0'] },
  cruiser: { name: 'Halcyon PD Cruiser', len: 4.9, wid: 2.0, hgt: 1.45, cabin: 0.55, maxSpeed: 44, accel: 17, grip: 8, value: 0, colors: ['#f8f9fa'], police: true },
  courier: { name: 'Ferro Courier', len: 5.0, wid: 2.1, hgt: 1.5, cabin: 0.55, maxSpeed: 40, accel: 15, grip: 7.5, value: 0, colors: ['#1b1b2f'] },
};
export const TRAFFIC_MODELS = ['vela', 'marlin', 'marlin', 'tidewater', 'dune', 'vela', 'sabre'];

export const WEAPONS = {
  fists: { name: 'Fists', damage: 14, rate: 0.45, range: 2.2, melee: true },
  pistol: { name: 'P9 Pocket', damage: 26, rate: 0.26, range: 90, spread: 0.012, mag: 12, sound: 'pistol' },
  smg: { name: 'Rattler SMG', damage: 15, rate: 0.085, range: 70, spread: 0.035, mag: 30, sound: 'smg' },
  shotgun: { name: 'Breaker 12', damage: 13, pellets: 7, rate: 0.85, range: 35, spread: 0.09, mag: 6, sound: 'shotgun' },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

export const SHOP_ITEMS = [
  { id: 'pistol', label: 'P9 Pocket pistol', price: 300, weapon: 'pistol', ammo: 36 },
  { id: 'pistolAmmo', label: 'P9 ammo (48)', price: 80, ammoFor: 'pistol', ammo: 48 },
  { id: 'smg', label: 'Rattler SMG', price: 1200, weapon: 'smg', ammo: 90 },
  { id: 'smgAmmo', label: 'Rattler ammo (120)', price: 160, ammoFor: 'smg', ammo: 120 },
  { id: 'shotgun', label: 'Breaker 12 shotgun', price: 1600, weapon: 'shotgun', ammo: 24 },
  { id: 'shotgunAmmo', label: 'Breaker shells (24)', price: 140, ammoFor: 'shotgun', ammo: 24 },
  { id: 'armor', label: 'Kevlar vest', price: 450, armor: 100 },
];

/** Heat (wanted level) tuning, index by level 0..5. */
export const HEAT = {
  cops: [0, 2, 3, 4, 6, 8],
  shoot: [false, false, true, true, true, true],
  cooldown: [0, 14, 20, 28, 36, 45],
  max: 5,
};

export const RADIO = [
  { name: 'Halcyon Wave 96.4', bpm: 104, root: 45, mode: 'minor' },
  { name: 'Low Tide FM 88.1', bpm: 84, root: 50, mode: 'major' },
  { name: 'Radio Off', bpm: 0 },
];

export const PLAYER = { walk: 4.2, run: 8.2, radius: 0.45, maxHealth: 100 };
export const CLOCK = { start: 17.25, minutesPerSecond: 1 };
export const WORLD_LIMIT = CITY.half + CITY.beach - 4;
