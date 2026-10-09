// Lance server.js dans un processus enfant (sans ouvrir de navigateur) et attend qu'il écoute.
// Réutilisable par tous les tests : const srv = await startServer(); ... await srv.stop();
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Demande un port libre au système.
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function startServer({ port, env = {}, timeout = 10000 } = {}) {
  port ??= await freePort();
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--no-open'], {
    cwd: ROOT,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = new Promise((r) => proc.once('exit', r));
  const actualPort = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server.js n'a pas démarré :\n${output}`)), timeout);
    const onData = (d) => {
      output += d;
      const m = output.match(/localhost:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d) => { output += d; });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server.js s'est arrêté (code ${code}) :\n${output}`));
    });
  });
  return {
    proc,
    port: actualPort,
    url: `http://localhost:${actualPort}`,
    get output() { return output; },
    get alive() { return proc.exitCode === null && proc.signalCode === null; },
    async stop() {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill();
      await exited;
    },
  };
}
