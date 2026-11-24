// All sound is synthesised live with Web Audio: engine, sirens, guns, crashes, UI, and two radio stations.
import { RADIO } from './config.js';

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noise = null;
let engine = null;
let siren = null;
let radio = { station: 0, nextNote: 0, step: 0, timer: null, enabled: false };
export const volume = { master: 0.8, music: 0.5, sfx: 0.9 };

/** Create the audio graph; must run from a user gesture. Safe to call again. */
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume.master;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = volume.sfx;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = volume.music;
  musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  buildEngine();
  buildSiren();
  radio.timer = setInterval(scheduleRadio, 60);
}

export function setVolumes() {
  if (!ctx) return;
  master.gain.value = volume.master;
  sfxBus.gain.value = volume.sfx;
  musicBus.gain.value = volume.music;
}

function buildEngine() {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const sub = ctx.createOscillator();
  sub.type = 'square';
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;
  osc.connect(filter);
  sub.connect(subGain).connect(filter);
  filter.connect(gain).connect(sfxBus);
  osc.start();
  sub.start();
  engine = { osc, sub, filter, gain };
}

function buildSiren() {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 700;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.9;
  const depth = ctx.createGain();
  depth.gain.value = 260;
  lfo.connect(depth).connect(osc.frequency);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(sfxBus);
  osc.start();
  lfo.start();
  siren = { gain };
}

/** Engine note: rpm 0..1, on = player is driving. */
export function setEngine(on, rpm, throttle) {
  if (!engine) return;
  const t = ctx.currentTime;
  engine.gain.gain.setTargetAtTime(on ? 0.09 + throttle * 0.06 : 0, t, 0.08);
  const f = 38 + rpm * 120;
  engine.osc.frequency.setTargetAtTime(f, t, 0.05);
  engine.sub.frequency.setTargetAtTime(f / 2, t, 0.05);
  engine.filter.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 600, t, 0.05);
}

/** Siren loudness 0..1 from the nearest pursuing cruiser. */
export function setSiren(level) {
  if (!siren) return;
  siren.gain.gain.setTargetAtTime(level * 0.08, ctx.currentTime, 0.2);
}

function noiseBurst(duration, freq, q, gainValue, type = 'bandpass', when = 0) {
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter).connect(gain).connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.05);
}

function tone(freq, duration, type, gainValue, when = 0, slideTo = null, bus = sfxBus) {
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(bus);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** One-shot sound effect; distance (metres) softens it. */
export function play(name, distance = 0) {
  if (!ctx) return;
  const v = Math.max(0.05, 1 - distance / 120);
  switch (name) {
    case 'pistol': noiseBurst(0.18, 1400, 0.8, 0.9 * v); tone(160, 0.12, 'square', 0.25 * v, 0, 60); break;
    case 'smg': noiseBurst(0.09, 1800, 1, 0.6 * v); tone(200, 0.06, 'square', 0.15 * v, 0, 90); break;
    case 'shotgun': noiseBurst(0.35, 700, 0.6, 1.2 * v); tone(90, 0.3, 'sawtooth', 0.35 * v, 0, 40); break;
    case 'punch': noiseBurst(0.08, 400, 2, 0.6 * v); break;
    case 'hit': noiseBurst(0.06, 2500, 3, 0.3 * v); break;
    case 'crash': noiseBurst(0.4, 500, 0.7, 0.9 * v, 'lowpass'); noiseBurst(0.25, 3000, 2, 0.3 * v); break;
    case 'explosion': noiseBurst(1.6, 180, 0.5, 1.6 * v, 'lowpass'); tone(70, 1.2, 'sine', 0.8 * v, 0, 30); break;
    case 'horn': tone(392, 0.35, 'square', 0.12 * v); tone(494, 0.35, 'square', 0.1 * v); break;
    case 'door': noiseBurst(0.1, 900, 3, 0.4 * v); tone(120, 0.08, 'sine', 0.3 * v); break;
    case 'pickup': tone(880, 0.12, 'triangle', 0.25); tone(1320, 0.18, 'triangle', 0.22, 0.08); break;
    case 'cash': tone(1046, 0.1, 'square', 0.12); tone(1568, 0.25, 'square', 0.12, 0.07); break;
    case 'hurt': tone(220, 0.2, 'sawtooth', 0.18, 0, 110); break;
    case 'click': tone(660, 0.05, 'triangle', 0.15); break;
    case 'heat': tone(523, 0.18, 'square', 0.12); tone(392, 0.25, 'square', 0.12, 0.16); break;
    case 'pass': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.2, i * 0.12)); break;
    case 'fail': [392, 330, 262].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.12, i * 0.18)); break;
    case 'empty': tone(1200, 0.03, 'square', 0.08); break;
    default: break;
  }
}

// ---- radio: a small step sequencer per station ----
const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
const PROGRESSIONS = { minor: [0, 5, 2, 6], major: [0, 4, 5, 3] };
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function setRadioEnabled(on) {
  radio.enabled = on;
  if (ctx && on) radio.nextNote = Math.max(radio.nextNote, ctx.currentTime + 0.05);
}

export function cycleRadio() {
  radio.station = (radio.station + 1) % RADIO.length;
  if (ctx) radio.nextNote = ctx.currentTime + 0.1;
  play('click');
  return RADIO[radio.station].name;
}

export function radioName() {
  return RADIO[radio.station].name;
}

function scheduleRadio() {
  if (!ctx || !radio.enabled) return;
  const st = RADIO[radio.station];
  if (!st.bpm) return;
  const stepTime = 60 / st.bpm / 4;
  const scale = SCALES[st.mode];
  const prog = PROGRESSIONS[st.mode];
  while (radio.nextNote < ctx.currentTime + 0.2) {
    const when = radio.nextNote - ctx.currentTime;
    const s = radio.step % 16;
    const bar = Math.floor(radio.step / 16) % 4;
    const degree = prog[bar];
    const rootNote = st.root + scale[degree % 7];
    // drums
    if (s % 4 === 0) tone(st.mode === 'minor' ? 110 : 90, 0.25, 'sine', 0.5, when, 40, musicBus);
    if (s === 4 || s === 12) noiseBurstMusic(0.18, 1800, when, 0.25);
    if (s % 2 === 1) noiseBurstMusic(0.04, 8000, when, 0.07);
    // bass
    if (s % 2 === 0) tone(midi(rootNote - 12 + (s % 8 === 6 ? 7 : 0)), stepTime * 1.8, 'sawtooth', 0.09, when, null, musicBus);
    // pads on the bar
    if (s === 0) {
      for (const k of [0, 2, 4]) tone(midi(st.root + 12 + scale[(degree + k) % 7]), stepTime * 15, 'triangle', 0.035, when, null, musicBus);
    }
    // lead arpeggio, seeded by the step so it repeats like a hook
    if ((st.mode === 'minor' && s % 2 === 0) || (st.mode === 'major' && [0, 3, 6, 10, 12].includes(s))) {
      const k = [0, 2, 4, 2, 5, 4, 2, 1][(s / 2 + bar) % 8 | 0];
      tone(midi(st.root + 24 + scale[(degree + k) % 7]), stepTime * 1.4, 'square', 0.025, when, null, musicBus);
    }
    radio.nextNote += stepTime;
    radio.step += 1;
  }
}

function noiseBurstMusic(duration, freq, when, gainValue) {
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter).connect(gain).connect(musicBus);
  src.start(t);
  src.stop(t + duration + 0.05);
}
