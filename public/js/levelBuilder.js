// Construit un niveau (données de levelFormat.js) dans le monde : physique Rapier + rendu Three.js.
// LevelBuilder garde la trace de ce que chaque élément a créé (corps, objets 3D…) pour pouvoir
// l'enlever / le reconstruire seul pendant l'édition, sans toucher au reste du niveau.
import * as THREE from 'three';
import { zSpan, groupsFor } from './utils.js';
import { FORMAT, VERSION } from './levelFormat.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

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

export class LevelBuilder {
  constructor(level) {
    this.L = level;
    this.items = [];
    this.handles = new Map(); // élément -> ce qu'il a créé
    this.name = 'Niveau';
    this.spawn = { x: 0, y: 0.8 };
  }

  // data : niveau validé par parseLevel().level
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
    // On intercepte L.body pour connaître les corps créés (y compris les ancres de joints).
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
