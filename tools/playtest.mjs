// Play-test driver (development only, not part of the game): serves game/, opens the real start
// screen in headless Chromium and plays it with real keyboard and mouse events sent over the
// DevTools protocol: New Game, walk, steal the nearest car, drive, shoot, raise heat, pause, save.
// It prints the page's errors and a state line after each step, and can save a frame per step.
//   node tools/playtest.mjs [--frames]
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gameDir = join(root, 'game');
const chrome = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const saveFrames = process.argv.includes('--frames');
const frameDir = '/tmp/nh-playtest';
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
}).listen(8766, '127.0.0.1');

const browser = spawn(chrome, [
  '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=9334', '--user-data-dir=/tmp/nh-play', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
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
    return JSON.stringify({ mode: g.mode, x: Math.round(v ? v.x : b.x), z: Math.round(v ? v.z : b.z),
      car: v ? (v.model.name ?? v.kind) + ' ' + Math.round(Math.abs(v.speed) * 3.6) + 'kmh' : null, hp: Math.round(p.health),
      heat: g.police.level, cruisers: g.police.cruisers.length, cops: g.police.cops.length, money: g.money, weapon: p.weapon,
      ammo: p.ammo[p.weapon] === Infinity ? '-' : p.ammo[p.weapon],
      mission: g.missions.active ? g.missions.active.index + ':' + g.missions.stage : null,
      objective: document.getElementById('hud-mission-text').textContent.slice(0, 60),
      subtitle: document.getElementById('hud-subtitle').textContent.slice(0, 50),
      prompt: document.getElementById('hud-prompt').textContent.slice(0, 50) }); })()`);
  console.log(`${String(step).padStart(2)} ${label.padEnd(26)} ${state}`);
  if (saveFrames) {
    await evaluate('window.neonHarbor.render()');
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
    writeFileSync(join(frameDir, `${String(step).padStart(2, '0')}-${label.replace(/\W+/g, '_')}.jpg`), Buffer.from(r.result.data, 'base64'));
  }
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
for (let i = 0; i < 60 && !(await evaluate('!!window.neonHarbor')); i += 1) await sleep(500);
await sleep(3000);
await send('Runtime.evaluate', { expression: PAGE_HELPERS, awaitPromise: true });
await report('title screen');

const clicked = await evaluate(`(() => { const b = [...document.querySelectorAll('#title-menu button, #title-menu *')].find((e) => /new game/i.test(e.textContent) && e.children.length === 0); if (!b) return false; b.click(); return true; })()`);
console.log('   new game button found:', clicked);
await play([], 1);
await report('new game');
for (let i = 0; i < 12 && (await evaluate(`!!document.getElementById('hud-subtitle').textContent`)); i += 1) await play([], 2);
await report('intro dialogue done');
await play(['KeyE'], 0.1); await play([], 0.5);
console.log('   save slot after E at Bayview:', await evaluate(`Object.keys(localStorage).map((k) => k + ' ' + localStorage.getItem(k).length + 'B').join(', ') || 'none'`));
await report('save at safehouse (E)');
await play(['KeyW'], 3);
await report('walk forward 3 s');
await play(['KeyW', 'ShiftLeft'], 3);
await report('sprint 3 s');
await play(['Space'], 0.1); await play([], 0.8);
await report('jump');

const target = await evaluate(`(() => { const g = window.neonHarbor; const b = g.player.body; let best = null, bd = 1e9;
  for (const v of window.__vehicles) { if (v.driver === 'cop' || v.wrecked || v.model.police) continue; const d = Math.hypot(v.x - b.x, v.z - b.z); if (d < bd) { bd = d; best = v; } }
  if (!best) return null; best.speed = 0; best.vx = 0; best.vz = 0;
  b.x = best.x + Math.cos(best.heading) * 2.4; b.z = best.z - Math.sin(best.heading) * 2.4; return Math.round(bd); })()`);
console.log('   nearest civilian car was', target, 'm away (player placed beside it)');
await play(['KeyF'], 0.1); await play([], 2.5);
await report('steal car (F)');
await play(['KeyW'], 4);
await report('drive 4 s');
await play(['KeyW', 'KeyD'], 1.5);
await report('drive + steer right');
await play(['KeyS'], 3);
await report('brake / reverse');
await play(['KeyF'], 0.1); await play([], 1.5);
await report('get out (F)');

await evaluate(`window.neonHarbor.player.giveWeapon('pistol', 48); window.neonHarbor.player.selectWeapon('pistol');`);
await play([], 0.5, { aim: true });
await play([], 2, { aim: true, fire: true });
await report('aim + fire pistol');
await play([], 6);
await report('6 s after gunfire');
await evaluate('window.neonHarbor.police.setLevel(3)');
await play([], 10);
await report('heat 3, 10 s later');
await play(['KeyW', 'ShiftLeft'], 6);
await report('run from police 6 s');
await play([], 30);
await report('30 s more');
await play(['Escape'], 0.1);
await report('pause (Esc)');
await play(['Escape'], 0.1);
await report('resume (Esc)');

console.log(`done: ${errors} page error(s)`);
ws.close();
browser.kill();
server.close();
