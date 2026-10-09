// Format de niveau sauvegardable (JSON versionné) + constructeur incrémental.
// Un niveau = une liste d'« éléments » ; chaque élément correspond à un appel de la classe Level
// (box, ball, ground, mover, seesaw, pendulum, bubble, checkpoint, sign, finish, backdrop) ou au
// triangle ajouté par l'éditeur. LevelBuilder garde la trace de ce que chaque élément a créé
// (corps physiques, objets 3D…) pour pouvoir l'enlever / le reconstruire seul.
import * as THREE from 'three';
import { Level, LAYER_Z, LAYER_DEPTH, groupsFor } from './level.js';

export const FORMAT = 'littlebigweb-level';
export const VERSION = 1;

const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- Matériau supplémentaire : le verre ----------

export function ensureEditorMaterials(mats) {
  if (mats.glass) return mats;
  mats.glass = {
    density: 2, friction: 0.3, scale: 2,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xd6f1ff, roughness: 0.05, metalness: 0, clearcoat: 1,
      transparent: true, opacity: 0.38, depthWrite: false,
    }),
  };
  return mats;
}

// ---------- Triangle (absent de Level : construit ici avec les mêmes briques) ----------

function zSpan(mask) {
  const zs = LAYER_Z.filter((_, i) => mask & (1 << i));
  const max = Math.max(...zs), min = Math.min(...zs);
  return { z: (max + min) / 2, depth: max - min + LAYER_DEPTH };
}

export function trianglePoints(w, h) {
  return [-w / 2, -h / 2, w / 2, -h / 2, 0, h / 2];
}

export function triangleGeometry(w, h, depth, scale = 1) {
  const p = trianglePoints(w, h);
  const shape = new THREE.Shape();
  shape.moveTo(p[0], p[1]);
  shape.lineTo(p[2], p[3]);
  shape.lineTo(p[4], p[5]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / scale, uv.getY(i) / scale);
  return geo;
}

function triangle(L, { x, y, w, h, angle = 0, layer = 1, mat = 'wood', type = 'fixed', density, friction, restitution = 0, grabbable }) {
  const R = L.R;
  const m = L.mats[mat];
  const mask = L.mask(layer);
  const body = L.body(type, x, y, angle);
  const collider = L.world.createCollider(
    R.ColliderDesc.convexHull(new Float32Array(trianglePoints(w, h)))
      .setDensity(density ?? m.density)
      .setFriction(friction ?? m.friction)
      .setRestitution(restitution)
      .setCollisionGroups(groupsFor(mask)),
    body,
  );
  const { z, depth } = zSpan(mask);
  const mesh = L.addMesh(new THREE.Mesh(triangleGeometry(w, h, depth, m.scale), m.material));
  mesh.position.set(x, y, z);
  mesh.rotation.z = angle;
  // kind 'box' : le jeu (attraper, changement de plan) utilise la boîte englobante.
  return L.register({
    kind: 'box', shape: 'tri', body, collider, mesh, w, h, mask, z, mat, type,
    grabbable: grabbable ?? type === 'dynamic',
  });
}

// ---------- Construction d'un élément ----------

const BUILD = {
  box: (L, it) => L.box(it),
  ball: (L, it) => L.ball(it),
  tri: (L, it) => triangle(L, it),
  ground: (L, it) => L.ground(it.x0, it.x1, it.top ?? 0),
  mover: (L, it) => L.mover(it.o, it.to, it.period ?? 5, it.phase ?? 0),
  seesaw: (L, it) => L.seesaw(it.x, it.y, it.w, it.layer ?? 1),
  pendulum: (L, it) => L.pendulum(it.ax, it.ay, it.len, it.layer ?? 1, it.r ?? 0.6),
  bubble: (L, it) => L.bubble(it.x, it.y, it.layer ?? 1, !!it.big),
  checkpoint: (L, it) => L.checkpoint(it.x, it.y ?? 0),
  sign: (L, it) => L.sign(it.x, it.text ?? '', it.y ?? 0),
  finish: (L, it) => L.finish(it.x),
  backdrop: (L) => L.backdrop(),
};

// Champs numériques obligatoires par type (validation au chargement).
const REQUIRED = {
  box: ['x', 'y', 'w', 'h'], ball: ['x', 'y', 'r'], tri: ['x', 'y', 'w', 'h'],
  ground: ['x0', 'x1'], mover: [], seesaw: ['x', 'y', 'w'], pendulum: ['ax', 'ay', 'len'],
  bubble: ['x', 'y'], checkpoint: ['x'], sign: ['x'], finish: ['x'], backdrop: [],
};

export const ITEM_TYPES = Object.keys(BUILD);

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

export function recordLevel(buildFn, name = 'Niveau') {
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
  };
  rec.bubbleLine = Level.prototype.bubbleLine;
  rec.bubbleArc = Level.prototype.bubbleArc;
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

function validItem(it) {
  if (!it || typeof it !== 'object' || !REQUIRED[it.t]) return false;
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

// Lit un niveau (objet ou texte JSON) ; lève une Error au message lisible si invalide.
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
  const skipped = raw.length - items.length;
  const spawn = data.spawn && num(data.spawn.x) && num(data.spawn.y) ? { x: data.spawn.x, y: data.spawn.y } : { x: 0, y: 0.8 };
  return {
    level: { format: FORMAT, version: VERSION, name: String(data.name || 'Sans titre').slice(0, 60), spawn, items },
    skipped,
  };
}

// ---------- Constructeur incrémental ----------

export class LevelBuilder {
  constructor(level) {
    this.L = level;
    this.items = [];
    this.handles = new Map(); // élément -> ce qu'il a créé
    this.name = 'Niveau';
    this.spawn = { x: 0, y: 0.8 };
  }

  load(data) {
    this.clear();
    this.name = data.name;
    this.spawn = { ...data.spawn };
    this.L.spawn = { ...data.spawn };
    this.items = clone(data.items);
    for (const it of this.items) this.build(it);
    this.refresh();
  }

  toJSON() {
    return { format: FORMAT, version: VERSION, name: this.name, spawn: { ...this.spawn }, items: clone(this.items) };
  }

  rebuildAll() {
    for (const it of this.items) this.unbuild(it);
    for (const it of this.items) this.build(it);
    this.refresh();
  }

  clear() {
    for (const it of this.items) this.unbuild(it);
    this.items = [];
    this.refresh();
  }

  add(it, index = this.items.length) {
    this.items.splice(index, 0, it);
    this.build(it);
    this.refresh();
    return it;
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i < 0) return -1;
    this.unbuild(it);
    this.items.splice(i, 1);
    this.refresh();
    return i;
  }

  // Reconstruit un élément après modification de ses données.
  update(it) {
    this.unbuild(it);
    this.build(it);
    this.refresh();
  }

  build(it) {
    const L = this.L;
    for (const o of it.t === 'mover' ? [it, it.o] : [it]) {
      if (o.mat && !L.mats[o.mat]) o.mat = 'cardboard';
      if (o.top && !L.mats[o.top]) delete o.top;
    }
    const lens = {
      objects: L.objects.length, bubbles: L.bubbles.length,
      checkpoints: L.checkpoints.length, ropes: L.ropes.length, nodes: L.scene.children.length,
    };
    const bodies = [];
    const origBody = L.body;
    L.body = (...a) => { const b = origBody.apply(L, a); bodies.push(b); return b; };
    try {
      BUILD[it.t](L, it);
    } finally {
      L.body = origBody;
    }
    const h = {
      bodies,
      objects: L.objects.slice(lens.objects),
      bubbles: L.bubbles.slice(lens.bubbles),
      checkpoints: L.checkpoints.slice(lens.checkpoints),
      ropes: L.ropes.slice(lens.ropes),
      nodes: L.scene.children.slice(lens.nodes),
    };
    for (const n of h.nodes) n.traverse((o) => { o.userData.editItem = it; });
    this.handles.set(it, h);
    return h;
  }

  unbuild(it) {
    const h = this.handles.get(it);
    if (!h) return;
    const L = this.L;
    for (const b of h.bodies) L.world.removeRigidBody(b);
    const drop = (arr, list) => {
      if (!list.length) return arr;
      const s = new Set(list);
      return arr.filter((o) => !s.has(o));
    };
    L.objects = drop(L.objects, h.objects);
    L.moving = drop(L.moving, h.objects);
    L.kinematic = drop(L.kinematic, h.objects);
    L.bubbles = drop(L.bubbles, h.bubbles);
    L.checkpoints = drop(L.checkpoints, h.checkpoints);
    L.ropes = drop(L.ropes, h.ropes);
    const shared = this.sharedResources();
    for (const n of h.nodes) {
      L.scene.remove(n);
      n.traverse((o) => {
        if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          if (shared.has(m)) continue;
          if (m.map && !shared.has(m.map)) m.map.dispose();
          m.dispose();
        }
      });
    }
    this.handles.delete(it);
  }

  sharedResources() {
    if (this._shared) return this._shared;
    const L = this.L;
    const s = new Set([...Object.values(L.geo), L.bubbleMat, ...L.gemMats, ...L.flowers]);
    for (const m of Object.values(L.mats)) {
      s.add(m.material);
      if (m.material.map) s.add(m.material.map);
      if (m.material.bumpMap) s.add(m.material.bumpMap);
    }
    this._shared = s;
    return s;
  }

  // Ligne d'arrivée : la plus proche du départ parmi celles du niveau.
  refresh() {
    this._shared = null;
    const xs = this.items.filter((it) => it.t === 'finish').map((it) => it.x);
    this.L.finishX = xs.length ? Math.min(...xs) : Infinity;
  }

  itemOf(object3d) {
    return object3d?.userData?.editItem ?? null;
  }

  nodesOf(it) {
    return this.handles.get(it)?.nodes ?? [];
  }

  // Corps principal d'un élément simple (boîte, balle, triangle), pour lire sa position actuelle.
  mainObject(it) {
    const h = this.handles.get(it);
    return h && ['box', 'ball', 'tri'].includes(it.t) ? h.objects[0] : null;
  }
}
