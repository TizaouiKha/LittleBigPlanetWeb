// Petit serveur local sans dépendance : sert le dossier public/.
// Il accueillera aussi le multijoueur en ligne plus tard.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) {
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

function listen(port) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE') listen(port + 1);
    else throw e;
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  LittleBigWeb tourne sur ${url}\n  (ferme cette fenetre pour arreter le jeu)\n`);
    if (process.argv.includes('--no-open')) return;
    const cmd =
      process.platform === 'win32' ? `start "" "${url}"` :
      process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  });
}

listen(Number(process.env.PORT) || 3000);
