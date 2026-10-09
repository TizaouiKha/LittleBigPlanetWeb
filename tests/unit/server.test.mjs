// Tests du serveur statique (server.js) lancé sur un port libre.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../helpers/server.mjs';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

// Requête HTTP brute : contrairement à fetch, le chemin est envoyé tel quel (pas de normalisation des "..").
function get(rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.port, path: rawPath, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('sert index.html sur /', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.match(r.body, /<title>LittleBigWeb<\/title>/);
});

test('sert les modules JS avec le bon type MIME', async () => {
  const r = await get('/js/main.js');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/javascript/);
});

test('404 sur un fichier absent', async () => {
  const r = await get('/nexiste-pas.js');
  assert.equal(r.status, 404);
});

test('refuse la traversée de chemin', async (t) => {
  for (const p of ['/..%2fserver.js', '/..%2f..%2fpackage.json', '/js/..%2f..%2fserver.js', '/..%5cserver.js']) {
    await t.test(p, async () => {
      const r = await get(p);
      assert.equal(r.status, 403, `${p} -> ${r.status}`);
      assert.doesNotMatch(r.body, /createServer/);
    });
  }
});

test('refuse un dossier voisin dont le nom commence comme public/', async () => {
  // public/../public-secret/x se normalise en ".../public-secret/x", qui commence par ".../public".
  const r = await get('/..%2fpublic-secret%2fx.txt');
  assert.equal(r.status, 403);
});

test('une URL mal encodée ne fait pas planter le serveur', async () => {
  const r = await get('/%E0%A4%A');
  assert.equal(r.status, 400);
  const ok = await get('/');
  assert.equal(ok.status, 200);
  assert.ok(srv.alive, 'le serveur doit toujours tourner');
});

test('un octet nul dans le chemin ne fait pas planter le serveur', async () => {
  const r = await get('/index.html%00.js');
  assert.ok(r.status >= 400 && r.status < 500, `statut ${r.status}`);
  assert.ok(srv.alive, 'le serveur doit toujours tourner');
});
