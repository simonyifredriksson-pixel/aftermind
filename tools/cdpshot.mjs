// cdpshot.mjs - screenshot a page once it says it is ready (window.__shotReady), via the DevTools protocol.
//   node tools/cdpshot.mjs "/?shot=at&x=..." out.png [timeoutSec] [w] [h]
// Starts `python -m http.server 8745` in the project if nothing answers there.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , url, out, tsec = '240', W = '1280', H = '720'] = process.argv;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function up(u) { try { await fetch(u); return true; } catch { return false; } }
if (!(await up('http://127.0.0.1:8746/'))) { spawn('node', ['tools/serve.mjs', '8746'], { cwd: root, detached: true, stdio: 'ignore' }).unref(); await sleep(1200); }
const port = 9300 + Math.floor(Math.random() * 500);
const ud = mkdtempSync(join(tmpdir(), 'amcdp'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let tgt;
  for (let k = 0; k < 200 && !tgt; k++) { await sleep(200); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); tgt = l.find(t => t.type === 'page'); } catch { } }
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description?.slice(0, 300)); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('CONSOLE', m.params.args.map(a => a.value || a.description).join(' ').slice(0, 300)); };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8746' + url });
  const t0 = Date.now(); let ready = false;
  while (Date.now() - t0 < +tsec * 1000) { await sleep(1000); const r = await send('Runtime.evaluate', { expression: '!!window.__shotReady' }); if (r?.result?.value) { ready = true; break; } }
  await sleep(500);
  const logs = await send('Runtime.evaluate', { expression: '(window.__logs||[]).slice(-12).join("\\n")' });
  if (logs?.result?.value) console.log(logs.result.value);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(s.data, 'base64'));
  console.log((ready ? 'ready' : 'TIMEOUT') + ' after ' + Math.round((Date.now() - t0) / 1000) + 's -> ' + out);
} catch (e) { console.log('cdpshot error', e.message); }
finally { try { ws?.close(); } catch { } chrome.kill(); }
process.exit(0);
