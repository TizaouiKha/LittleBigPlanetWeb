// Format de niveau sauvegardable (JSON versionné). Module pur (sans Three.js ni Rapier) :
// testé sous Node dans tests/unit/levelFormat.test.mjs.
//
// Un niveau = { format, version, name, spawn: {x, y}, items: [...] } ; chaque élément « t »
// correspond à un appel de la classe Level (box, ball, ground, mover, seesaw, pendulum, bubble,
// checkpoint, sign, finish, backdrop) ou au triangle de l'éditeur (tri). Voir levelBuilder.js
// pour la reconstruction dans le monde 3D / physique.

export const FORMAT = 'littlebigweb-level';
export const VERSION = 1;

const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Champs numériques obligatoires par type (validation au chargement).
const REQUIRED = {
  box: ['x', 'y', 'w', 'h'], ball: ['x', 'y', 'r'], tri: ['x', 'y', 'w', 'h'],
  ground: ['x0', 'x1'], mover: [], seesaw: ['x', 'y', 'w'], pendulum: ['ax', 'ay', 'len'],
  bubble: ['x', 'y'], checkpoint: ['x'], sign: ['x'], finish: ['x'], backdrop: [],
};

export const ITEM_TYPES = Object.keys(REQUIRED);

// Déplacement d'un élément (dans les données).
export function translateItem(it, dx, dy) {
  switch (it.t) {
    case 'ground': it.x0 += dx; it.x1 += dx; it.top = (it.top ?? 0) + dy; break;
    case 'mover': it.o.x += dx; it.o.y += dy; it.to.x += dx; it.to.y += dy; break;
    case 'pendulum': it.ax += dx; it.ay += dy; break;
    case 'finish': it.x += dx; break;
    case 'backdrop': break;
    default: it.x += dx; it.y = (it.y ?? 0) + dy;
  }
}

// ---------- Enregistrement d'un niveau écrit en code (ex. buildLevel1) ----------

// buildFn reçoit un « faux » Level qui note chaque appel. helpers : méthodes composées à
// réutiliser telles quelles (ex. Level.prototype.bubbleLine / bubbleArc, qui appellent this.bubble).
export function recordLevel(buildFn, name = 'Niveau', helpers = {}) {
  const items = [];
  const rec = {
    spawn: { x: 0, y: 0.8 },
    box: (o) => items.push({ t: 'box', ...clone(o) }),
    ball: (o) => items.push({ t: 'ball', ...clone(o) }),
    ground: (x0, x1, top = 0) => items.push({ t: 'ground', x0, x1, top }),
    mover: (o, to, period = 5, phase = 0) => items.push({ t: 'mover', o: clone(o), to: clone(to), period, phase }),
    seesaw: (x, y, w, layer = 1) => items.push({ t: 'seesaw', x, y, w, layer }),
    pendulum: (ax, ay, len, layer = 1, r = 0.6) => items.push({ t: 'pendulum', ax, ay, len, layer, r }),
    bubble: (x, y, layer = 1, big = false) => items.push({ t: 'bubble', x, y, layer, big }),
    checkpoint: (x, y = 0) => items.push({ t: 'checkpoint', x, y }),
    sign: (x, text, y = 0) => items.push({ t: 'sign', x, y, text }),
    finish: (x) => items.push({ t: 'finish', x }),
    backdrop: () => items.push({ t: 'backdrop' }),
    ...helpers,
  };
  buildFn(rec);
  return { format: FORMAT, version: VERSION, name, spawn: { ...rec.spawn }, items };
}

export function blankLevel(name = 'Mon niveau') {
  return {
    format: FORMAT, version: VERSION, name, spawn: { x: 0, y: 0.8 },
    items: [
      { t: 'backdrop' },
      { t: 'box', x: -12.5, y: 6, w: 1, h: 16, mat: 'darkcard' },
      { t: 'ground', x0: -13, x1: 60, top: 0 },
      { t: 'checkpoint', x: 0, y: 0 },
    ],
  };
}

// ---------- Validation / migration ----------

function validLayer(l) {
  if (l === undefined || l === 'all') return true;
  if (Array.isArray(l)) return l.length > 0 && l.every((v) => [0, 1, 2].includes(v));
  return [0, 1, 2].includes(l);
}

export function validItem(it) {
  if (!it || typeof it !== 'object' || !Object.hasOwn(REQUIRED, it.t)) return false;
  if (!REQUIRED[it.t].every((k) => num(it[k]))) return false;
  if (it.t === 'mover') {
    if (!it.o || !it.to || ![it.o.x, it.o.y, it.o.w, it.o.h, it.to.x, it.to.y].every(num)) return false;
    if (!validLayer(it.o.layer)) return false;
  }
  if (!validLayer(it.layer)) return false;
  for (const k of ['w', 'h', 'r', 'len']) if (it[k] !== undefined && !(it[k] > 0 && it[k] < 500)) return false;
  if (it.text !== undefined) it.text = String(it.text).slice(0, 80);
  return true;
}

// Lit un niveau (objet ou texte JSON). Renvoie { level, skipped } (éléments invalides ignorés)
// ou lève une Error au message lisible.
export function parseLevel(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { throw new Error('Fichier illisible (JSON invalide).'); }
  }
  if (!data || data.format !== FORMAT) throw new Error("Ce fichier n'est pas un niveau LittleBigWeb.");
  if (!Number.isInteger(data.version) || data.version < 1) throw new Error('Version de niveau inconnue.');
  if (data.version > VERSION) throw new Error(`Niveau trop récent (version ${data.version}).`);
  // (migrations futures : if (data.version === 1) data = migrate1to2(data) …)
  const raw = Array.isArray(data.items) ? data.items : [];
  const items = raw.map((it) => (it && typeof it === 'object' ? clone(it) : null)).filter(validItem);
  const spawn = data.spawn && num(data.spawn.x) && num(data.spawn.y) ? { x: data.spawn.x, y: data.spawn.y } : { x: 0, y: 0.8 };
  return {
    level: { format: FORMAT, version: VERSION, name: String(data.name || 'Sans titre').slice(0, 60), spawn, items },
    skipped: raw.length - items.length,
  };
}

// Texte JSON d'un niveau (export fichier).
export function serializeLevel(level) {
  return JSON.stringify({ format: FORMAT, version: VERSION, name: level.name, spawn: level.spawn, items: level.items }, null, 1);
}
