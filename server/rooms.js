// Salons multijoueur : code de 4 lettres, 4 joueurs max, le premier joueur est l'hôte.
// Le serveur ne simule rien : il relaie les messages et garde l'état partagé
// (bulles ramassées, checkpoint atteint) pour les joueurs qui arrivent en cours de partie.
const { WebSocketServer } = require('ws');

const MAX_PLAYERS = 4;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O (confusion avec 1 et 0)
const rooms = new Map();
let nextId = 1;

function makeCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[(Math.random() * LETTERS.length) | 0];
    if (!rooms.has(code)) return code;
  }
}

const cleanName = (n) => String(n ?? '').replace(/[<>]|\p{Cc}/gu, '').trim().slice(0, 16) || 'Sackboy';

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) if (p !== except) send(p.ws, data);
}

const info = (p) => ({ id: p.id, name: p.name, slot: p.slot });

function joinRoom(room, me, name) {
  const used = new Set([...room.players.values()].map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  Object.assign(me, { room, name: cleanName(name), slot });
  room.players.set(me.id, me);
  if (room.hostId == null) room.hostId = me.id;
  send(me.ws, {
    t: 'welcome', id: me.id, code: room.code, hostId: room.hostId, slot,
    players: [...room.players.values()].filter((p) => p !== me).map(info),
    bubbles: [...room.bubbles], cp: room.cp,
  });
  broadcast(room, { t: 'join', player: info(me) }, me);
  console.log(`  [${room.code}] ${me.name} a rejoint (${room.players.size}/${MAX_PLAYERS})`);
}

function leaveRoom(me) {
  const room = me.room;
  if (!room) return;
  me.room = null;
  room.players.delete(me.id);
  console.log(`  [${room.code}] ${me.name} est parti`);
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  // Migration d'hôte : le joueur arrivé le plus tôt prend le relais
  if (room.hostId === me.id) room.hostId = room.players.keys().next().value;
  broadcast(room, { t: 'leave', id: me.id, hostId: room.hostId });
}

function onMessage(me, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m.t !== 'string') return;
  const room = me.room;

  if (!room) {
    if (m.t === 'create') {
      const r = { code: makeCode(), players: new Map(), hostId: null, bubbles: new Set(), cp: 0 };
      rooms.set(r.code, r);
      joinRoom(r, me, m.name);
    } else if (m.t === 'join') {
      const r = rooms.get(String(m.code ?? '').toUpperCase().trim());
      if (!r) send(me.ws, { t: 'error', msg: 'Partie introuvable' });
      else if (r.players.size >= MAX_PLAYERS) send(me.ws, { t: 'error', msg: 'Partie pleine (4 joueurs max)' });
      else joinRoom(r, me, m.name);
    }
    return;
  }

  switch (m.t) {
    case 'p': // état du joueur (~20 Hz) : relayé tel quel aux autres
    case 'own':
    case 'unown':
      m.id = me.id;
      broadcast(room, m, me);
      break;
    case 'o': // transforms des objets : seul l'hôte fait autorité
      if (room.hostId !== me.id) return;
      m.id = me.id;
      broadcast(room, m, me);
      break;
    case 'b': { // bulle ramassée : la première demande gagne
      const i = m.i | 0;
      if (room.bubbles.has(i)) return;
      room.bubbles.add(i);
      broadcast(room, { t: 'b', i, id: me.id }, me);
      break;
    }
    case 'cp': { // checkpoint partagé : on ne recule jamais
      const i = m.i | 0;
      if (i <= room.cp) return;
      room.cp = i;
      broadcast(room, { t: 'cp', i, id: me.id }, me);
      break;
    }
  }
}

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('error', () => {}); // les erreurs d'écoute (port occupé) sont gérées par server.js
  wss.on('connection', (ws) => {
    const me = { id: nextId++, ws, room: null, alive: true };
    ws.me = me;
    ws.on('pong', () => { me.alive = true; });
    ws.on('message', (data) => onMessage(me, data.toString()));
    ws.on('close', () => leaveRoom(me));
    ws.on('error', () => {});
  });
  // Détecte les connexions mortes (onglet fermé brutalement, Wi-Fi coupé)
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.me.alive) { ws.terminate(); continue; }
      ws.me.alive = false;
      ws.ping();
    }
  }, 10000).unref();
  return wss;
}

module.exports = { attach };
