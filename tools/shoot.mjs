// Screenshot tool (development only, not part of the game): serves game/, opens each scene from
// shots.json in headless Chrome over the DevTools protocol, waits for window.__shotReady and saves a
// JPEG straight from the browser into screenshots/. Prints the page's console so errors show up.
//   node tools/shoot.mjs [sceneName ...]
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gameDir = join(root, 'game');
// Default: the Playwright headless Chromium shell installed in the user's cache (this VM's system
// Chrome refuses WebGL); CHROME=<path> overrides it.
const chrome = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const only = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(gameDir, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(gameDir) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}).listen(8765, '127.0.0.1');

const browser = spawn(chrome, [
  '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=9333', '--user-data-dir=/tmp/nh-chrome', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
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
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled') console.log('  [page]', msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') console.log('  [page error]', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

for (const shot of shots) {
  if (only.length && !only.some((n) => shot.name.includes(n))) continue;
  console.log(`scene ${shot.name} (${shot.query})`);
  await send('Page.navigate', { url: `http://127.0.0.1:8765/index.html${shot.query}` });
  let ready = false;
  const started = Date.now();
  while (Date.now() - started < 240000) {
    await sleep(1000);
    const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true' });
    if (r.result?.result?.value === true) { ready = true; break; }
  }
  if (!ready) { console.log('  timed out'); continue; }
  await sleep(1500);
  for (const quality of [88, 82, 76, 70, 62, 55]) {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality });
    const bytes = Buffer.from(r.result.data, 'base64');
    if (bytes.length <= 250 * 1024 || quality === 55) {
      writeFileSync(join(root, 'screenshots', shot.name), bytes);
      console.log(`  saved screenshots/${shot.name}: ${bytes.length} bytes at quality ${quality}`);
      break;
    }
  }
}
ws.close();
browser.kill();
server.close();
