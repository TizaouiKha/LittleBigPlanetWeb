// Test de bout en bout : server.js + Chrome headless piloté par CDP (WebSocket global de Node).
// Usage : npm run test:e2e   (variables : E2E_PORT, CDP_PORT, CHROME_PATH, E2E_TIMEOUT)
// Ajouter une étape : step('description', async () => { ... }) dans la section « Scénario ».
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, ROOT } from './helpers/server.mjs';

const HTTP_PORT = Number(process.env.E2E_PORT) || 3300;
const CDP_PORT = Number(process.env.CDP_PORT) || 9666;
const STEP_TIMEOUT = Number(process.env.E2E_TIMEOUT) || 20000;
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
// Erreurs console tolérées (expressions régulières sur le texte).
const IGNORED_ERRORS = [/favicon\.ico/];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------- Processus enfants (toujours nettoyés) ----------

let server = null;
let browser = null;
let profileDir = null;
let ws = null;

function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else proc.kill('SIGKILL');
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch { /* déjà fermé */ }
  killTree(browser);
  if (server) await Promise.race([server.stop(), sleep(3000)]);
  if (profileDir) {
    // Chrome peut garder des fichiers verrouillés quelques instants après sa mort
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* tant pis */ }
  }
}
process.on('exit', () => { killTree(browser); if (server) killTree(server.proc); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup().finally(() => process.exit(130)); });

// ---------- CDP ----------

let msgId = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function onMessage(ev) {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(`${p.method} : ${m.error.message}`));
    else p.resolve(m.result);
    return;
  }
  const report = (text) => { if (!IGNORED_ERRORS.some((re) => re.test(text))) errors.push(text); };
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    report(`[exception] ${d.exception?.description || d.text}`);
  } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) {
    report(`[console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    report(`[log] ${m.params.entry.text} ${m.params.entry.url || ''}`);
  }
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`evaluate(${expression}) : ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

const getState = () => evaluate('window.__lbw?.getState() ?? null');

const KEYS = {
  Enter: [13, 'Enter'], Space: [32, ' '], KeyA: [65, 'a'], KeyD: [68, 'd'], KeyW: [87, 'w'], KeyS: [83, 's'],
  ShiftLeft: [16, 'Shift'], KeyR: [82, 'r'], KeyC: [67, 'c'],
};
const key = (type, code) => send('Input.dispatchKeyEvent', {
  type, code, key: KEYS[code][1], windowsVirtualKeyCode: KEYS[code][0], nativeVirtualKeyCode: KEYS[code][0],
});
const keyDown = (code) => key('keyDown', code);
const keyUp = (code) => key('keyUp', code);
async function tap(code, ms = 60) { await keyDown(code); await sleep(ms); await keyUp(code); }

// Attend qu'une condition sur l'état du jeu soit vraie ; renvoie l'état.
async function waitFor(desc, pred, timeout = STEP_TIMEOUT) {
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await getState();
    if (s && pred(s)) return s;
    if (errors.length) break;
    await sleep(50);
  }
  throw new Error(`délai dépassé : ${desc}\n  dernier état : ${JSON.stringify(s)}`);
}

async function screenshot(name) {
  try {
    const dir = path.join(ROOT, 'tests', 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(dir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  } catch { return null; }
}

// ---------- Démarrage ----------

async function launch() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('Aucun Chrome/Edge trouvé (définis CHROME_PATH)');
  server = await startServer({ port: HTTP_PORT });
  log(`serveur : ${server.url}`);
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbw-e2e-'));
  browser = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`,
    '--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: 'ignore' });
  log(`navigateur : ${path.basename(exe)} (pid ${browser.pid})`);

  let page;
  for (let i = 0; i < 80 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
      page = targets.find((t) => t.type === 'page');
    } catch { /* pas encore prêt */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error(`CDP injoignable sur le port ${CDP_PORT}`);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket CDP en erreur')), { once: true });
  });
  ws.addEventListener('message', onMessage);
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
}

// ---------- Scénario ----------

const steps = [];
const step = (name, fn) => steps.push({ name, fn });

step('écran titre chargé', async () => {
  await send('Page.navigate', { url: `${server.url}/` });
  const t0 = Date.now();
  // Les librairies viennent du CDN : on laisse du temps au premier chargement
  while (Date.now() - t0 < 45000) {
    const txt = await evaluate('document.getElementById("loading")?.textContent ?? ""').catch(() => '');
    if (txt.includes('jouer')) break;
    if (txt.startsWith('Erreur') || txt.startsWith('Impossible')) throw new Error(`chargement : ${txt}`);
    if (errors.length) break;
    await sleep(200);
  }
  const s = await waitFor('hook __lbw disponible, état "title"', (st) => st.state === 'title', 2000);
  if (s.totalBubbles <= 0) throw new Error('aucune bulle dans le niveau');
});

step('démarrage (Entrée)', async () => {
  await tap('Enter');
  await waitFor('état "play"', (s) => s.state === 'play');
  const hudHidden = await evaluate('document.getElementById("hud").classList.contains("hidden")');
  if (hudHidden) throw new Error('le HUD devrait être visible');
  await waitFor('joueur au sol', (s) => s.grounded);
});

let x0 = 0;
step('déplacement à droite (D) et collecte d\'une bulle', async () => {
  x0 = (await getState()).x;
  await keyDown('KeyD');
  try {
    await waitFor('x augmente', (s) => s.x > x0 + 1);
    // Une rangée de bulles attend le joueur entre x = 2.5 et 5.5
    await waitFor('score > 0', (s) => s.score > 0 && s.got > 0);
  } finally {
    await keyUp('KeyD');
  }
  const hud = await evaluate('document.getElementById("score-val").textContent');
  if (!(Number(hud) > 0)) throw new Error(`HUD score = ${hud}`);
});

step('saut (Espace)', async () => {
  const s0 = await waitFor('au sol avant le saut', (s) => s.grounded);
  await keyDown('Space');
  try {
    await waitFor('le joueur monte', (s) => s.y > s0.y + 1 && !s.grounded);
  } finally {
    await keyUp('Space');
  }
  await waitFor('retombe au sol', (s) => s.grounded && Math.abs(s.y - s0.y) < 0.2);
});

step('changement de plan (Z/W puis S)', async () => {
  await tap('KeyW');
  await waitFor('plan du fond (2)', (s) => s.layer === 2, 5000);
  const on = await evaluate('document.querySelector("#layers .on")?.dataset.layer');
  if (on !== '2') throw new Error(`indicateur de plan = ${on}`);
  await tap('KeyS');
  await waitFor('retour au plan du milieu (1)', (s) => s.layer === 1, 5000);
  await tap('KeyS');
  await waitFor('plan de devant (0)', (s) => s.layer === 0, 5000);
});

step('aucune erreur dans la page', async () => {
  await sleep(300);
  if (errors.length) throw new Error('erreurs');
});

// ---------- Exécution ----------

let failed = 0;
let passed = 0;
const t0 = Date.now();
try {
  await launch();
  for (const { name, fn } of steps) {
    const ts = Date.now();
    try {
      await fn();
      if (errors.length) throw new Error('erreur(s) dans la page');
      passed++;
      log(`  ok   ${name} (${Date.now() - ts} ms)`);
    } catch (e) {
      failed++;
      log(`  ÉCHEC ${name}\n       ${e.message}`);
      const shot = await screenshot('e2e-failure');
      if (shot) log(`       capture : ${shot}`);
      break; // les étapes suivantes dépendent de celle-ci
    }
  }
} catch (e) {
  failed++;
  log(`  ÉCHEC démarrage : ${e.message}`);
} finally {
  if (errors.length) log('Erreurs de la page :\n  ' + errors.join('\n  '));
  await cleanup();
}
log(`\ne2e : ${failed ? 'ÉCHEC' : 'OK'} — ${passed}/${steps.length} étapes réussies en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exitCode = failed ? 1 : 0;
