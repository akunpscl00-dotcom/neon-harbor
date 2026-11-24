// Seeded random numbers, so the city and the screenshot scenes come out the same every time.

let state = 0x9e3779b9;

/** Reset the shared generator to a seed. */
export function seed(value) {
  state = (value >>> 0) || 1;
}

/** Uniform number in [0, 1) from the shared generator (mulberry32). */
export function rand() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(min, max) {
  return min + rand() * (max - min);
}

export function int(min, max) {
  return Math.floor(range(min, max + 1));
}

export function pick(list) {
  return list[Math.floor(rand() * list.length)];
}

export function chance(p) {
  return rand() < p;
}

/** A separate generator, for layout that must not shift when gameplay randomness changes. */
export function makeRng(value) {
  let s = (value >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
