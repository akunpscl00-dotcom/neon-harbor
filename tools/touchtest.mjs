// Touch play-test (development only, not part of the game): like playtest.mjs, but as a phone in
// landscape (915x412, touch emulation) driven only by real touch events over the DevTools
// protocol: tap New Game, walk with the left stick, drag to look, tap the buttons, get in a car,
// drive and steer with the stick, get out, punch, pause and resume with the II button.
//   node tools/touchtest.mjs [--frames]
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gameDir = join(root, 'game');
const chrome = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const saveFrames = process.argv.includes('--frames');
const frameDir = '/tmp/nh-touchtest';
if (saveFrames) mkdirSync(frameDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(gameDir, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(gameDir) || !existsSync(file) || !statSync(file).isFile()) {
    console.log('  [404]', path);
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}).listen(8768, '127.0.0.1');

const browser = spawn(chrome, [
  '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--window-size=915,412', '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=9336', '--user-data-dir=/tmp/nh-touch', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:9336/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('chrome did not start');
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
let errors = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    console.log(`  [page ${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors += 1;
    console.log('  [page error]', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
});
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

// The headless software renderer draws a frame in about a second, far too slow to play in real
// time, so the driver stops the page's frame loop and steps the game itself at 30 Hz. Input still
// goes through the game's real listeners: KeyboardEvent and MouseEvent dispatched on the window.
const PAGE_HELPERS = `(async () => {
  const g = window.neonHarbor;
  const input = await import('./src/input.js');
  window.__vehicles = (await import('./src/vehicle.js')).vehicles;
  g.frame = () => {};
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const btn = (type, button) => window.dispatchEvent(new MouseEvent(type, { button, bubbles: true }));
  window.__play = (codes, seconds, opts = {}) => {
    codes.forEach((c) => key('keydown', c));
    if (opts.aim) btn('mousedown', 2);
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n; i += 1) {
      if (opts.fire && i % 6 === 0) btn('mousedown', 0);
      if (opts.fire && i % 6 === 3) btn('mouseup', 0);
      g.step(1 / 30);
      input.endFrame();
    }
    codes.forEach((c) => key('keyup', c));
    if (opts.aim) btn('mouseup', 2);
    if (opts.fire) btn('mouseup', 0);
  };
  return true;
})()`;
const play = (codes, seconds, opts = {}) => evaluate(`window.__play(${JSON.stringify(codes)}, ${seconds}, ${JSON.stringify(opts)})`);


let step = 0;
async function report(label) {
  step += 1;
  const state = await evaluate(`(() => { const g = window.neonHarbor; if (!g) return 'no game';
    const p = g.player, v = p.vehicle, b = p.body;
    return JSON.stringify({ mode: g.mode, x: +(v ? v.x : b.x).toFixed(1), z: +(v ? v.z : b.z).toFixed(1), yaw: +g.rig.yaw.toFixed(2),
      car: v ? Math.round(Math.abs(v.speed) * 3.6) + 'kmh head ' + v.heading.toFixed(2) : null, hp: Math.round(p.health), weapon: p.weapon,
      touch: document.documentElement.classList.contains('touch'), layer: !document.getElementById('touch').classList.contains('hidden'),
      buttons: [...document.querySelectorAll('.tbtn')].filter((e) => !e.classList.contains('hidden')).map((e) => e.textContent).join('|') }); })()`);
  console.log(`${String(step).padStart(2)} ${label.padEnd(24)} ${state}`);
  if (saveFrames) {
    await evaluate('window.neonHarbor.render()');
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    writeFileSync(join(frameDir, `${String(step).padStart(2, '0')}-${label.replace(/\W+/g, '_')}.jpg`), Buffer.from(r.result.data, 'base64'));
  }
  return JSON.parse(state);
}
const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const center = (sel) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const tap = async (sel, holdSteps = 2) => {
  const c = await center(sel); if (!c) { console.log('   no element', sel); return; }
  await touch('touchStart', [[c[0], c[1], 7]]); await play([], holdSteps / 30); await touch('touchEnd', []); await play([], 2 / 30);
};
// hold the left stick pushed by (dx, dy) pixels for some seconds, optionally with a second finger on a button
async function stick(dx, dy, seconds, extra) {
  const sx = 120, sy = 300;
  const pts = [[sx, sy, 1]];
  await touch('touchStart', pts);
  const moved = [[sx + dx, sy + dy, 1]];
  await touch('touchMove', moved);
  if (extra) { const c = await center(extra); moved.push([c[0], c[1], 2]); await touch('touchStart', moved); }
  await play([], seconds);
  await touch('touchEnd', []);
  await play([], 2 / 30);
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 915, height: 412, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
await send('Page.navigate', { url: 'http://127.0.0.1:8768/index.html' });
for (let i = 0; i < 60 && !(await evaluate('!!window.neonHarbor')); i += 1) await sleep(500);
await sleep(3000);
await send('Runtime.evaluate', { expression: PAGE_HELPERS, awaitPromise: true });
console.log('   pointer coarse:', await evaluate(`matchMedia('(pointer: coarse)').matches`), 'touch class:', await evaluate(`document.documentElement.classList.contains('touch')`));
await report('title screen');

// tap "New Game" with a real touch
const ng = await evaluate(`(() => { const b = [...document.querySelectorAll('#title-menu button')].find((e) => /new game/i.test(e.textContent)); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
await touch('touchStart', [[ng[0], ng[1], 9]]); await touch('touchEnd', []);
await play([], 1);
await report('tap New Game');
for (let i = 0; i < 12 && (await evaluate(`!!document.getElementById('hud-subtitle').textContent`)); i += 1) await play([], 2);
let s0 = await report('intro done');
let s = s0;
await stick(0, -60, 3);
let s1 = await report('stick forward 3 s');
console.log('   moved on foot:', Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1), 'm');
await stick(0, -60, 3, '.tbtn-run');
await tap('.tbtn-run'); // Lari is a toggle: turn it on, walk, then off
await stick(0, -60, 2); await tap('.tbtn-run');
let s2 = await report('run (Lari) 2 s');
console.log('   moved:', Math.hypot(s2.x - s1.x, s2.z - s1.z).toFixed(1), 'm');
// look: drag a finger across the right side
await touch('touchStart', [[600, 200, 3]]);
for (let i = 1; i <= 10; i += 1) { await touch('touchMove', [[600 + i * 15, 200, 3]]); await play([], 1 / 30); }
await touch('touchEnd', []);
let s3 = await report('drag to look');
console.log('   yaw change:', (s3.yaw - s2.yaw).toFixed(2), 'rad');
await tap('.tbtn-jump'); await play([], 0.6);
await report('tap Lompat');
await tap('.tbtn-fire', 4); await play([], 0.5);
await report('tap Pukul');
await tap('.tbtn-weapon'); await report('tap Senjata');

const target = await evaluate(`(() => { const g = window.neonHarbor; const b = g.player.body; let best = null, bd = 1e9;
  for (const v of window.__vehicles) { if (v.driver === 'cop' || v.wrecked || v.model.police) continue; const d = Math.hypot(v.x - b.x, v.z - b.z); if (d < bd) { bd = d; best = v; } }
  if (!best) return null; best.speed = 0; best.vx = 0; best.vz = 0;
  b.x = best.x + Math.cos(best.heading) * 2.4; b.z = best.z - Math.sin(best.heading) * 2.4; return Math.round(bd); })()`);
console.log('   nearest civilian car', target, 'm away (player placed beside it)');
await tap('.tbtn-car'); await play([], 2.5);
let c0 = await report('tap Masuk Mobil');
await stick(0, -60, 4);
let c1 = await report('stick forward = gas 4 s');
console.log('   car moved:', Math.hypot(c1.x - c0.x, c1.z - c0.z).toFixed(1), 'm');
await stick(55, -40, 1.5);
let c2 = await report('stick up-right = steer');
await tap('.tbtn-horn'); await tap('.tbtn-reload');
await stick(0, 60, 2);
await report('stick back = brake');
await tap('.tbtn-car'); await play([], 1.5);
await report('tap Keluar');
await tap('#touch-pause');
await report('tap II (pause)');
await tap('#touch-pause');
await report('tap X (resume)');
// portrait: the rotate hint shows
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
await play([], 0.2);
console.log('   portrait hint visible:', await evaluate(`getComputedStyle(document.getElementById('touch-rotate')).display`));
if (saveFrames) { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(join(frameDir, 'portrait.jpg'), Buffer.from(r.result.data, 'base64')); }

console.log(`done: ${errors} page error(s)`);
ws.close();
browser.kill();
server.close();
