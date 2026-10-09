// Petit serveur local : sert le dossier public/ et héberge le multijoueur (WebSocket sur /ws).
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const rooms = require('./server/rooms');

const ROOT = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    pathname = null;
  }
  // URL mal encodée (ex. %E0%A4%A) ou octet nul : sans ce garde-fou, le serveur plantait.
  if (pathname === null || pathname.includes('\0')) {
    res.writeHead(400);
    return res.end();
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  // ROOT + séparateur : sinon un dossier voisin comme "public-xxx" passerait le test.
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Introuvable');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

rooms.attach(server);

// Adresses à donner aux amis sur le même réseau (Wi-Fi / câble)
function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

function listen(port) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE') listen(port + 1);
    else throw e;
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  LittleBigWeb tourne sur ${url}`);
    const lan = lanUrls(port);
    if (lan.length) {
      console.log('\n  Pour jouer a plusieurs sur le meme reseau, tes amis ouvrent :');
      for (const u of lan) console.log(`    ${u}`);
      console.log('  (si le pare-feu Windows demande, autorise Node.js sur les reseaux prives)');
    }
    console.log('\n  (ferme cette fenetre pour arreter le jeu)\n');
    if (process.argv.includes('--no-open')) return;
    const cmd =
      process.platform === 'win32' ? `start "" "${url}"` :
      process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  });
}

listen(Number(process.env.PORT) || 3000);
