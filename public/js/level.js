// Construction des niveaux : objets physiques (Rapier 2D) + leur rendu 3D (Three.js).
// Comme dans LittleBigPlanet, le monde a 3 plans de profondeur : 0 = devant, 1 = milieu, 2 = fond.
import * as THREE from 'three';
import { flowerTextures, signTexture, skyTexture, hillsTexture } from './textures.js';
import { LAYER_Z, LAYER_DEPTH, ALL, groupsFor, zSpan, scaleBoxUVs } from './utils.js';

export { LAYER_Z, LAYER_DEPTH, ALL, groupsFor };

const GEM_COLORS = [0xe2574c, 0x4d8ad6, 0x5fb85a, 0xf2c94c, 0xb67ad6];

// Boîte dont les UV suivent la taille réelle : la texture garde la même échelle partout.
function boxGeometry(w, h, d, scale) {
  const geo = new THREE.BoxGeometry(w, h, d);
  scaleBoxUVs(geo.attributes.uv, w, h, d, scale);
  return geo;
}

export class Level {
  constructor(R, world, scene, mats) {
    this.R = R;
    this.world = world;
    this.scene = scene;
    this.mats = mats;
    this.objects = [];
    this.moving = [];
    this.kinematic = [];
    this.bubbles = [];
    this.checkpoints = [];
    this.ropes = [];
    this.spawn = { x: 0, y: 0.8 };
    this.finishX = Infinity;
    this.time = 0;

    this.flowers = flowerTextures();
    this.geo = {
      bubble: new THREE.SphereGeometry(0.34, 24, 16),
      gem: new THREE.OctahedronGeometry(0.14),
      flower: new THREE.PlaneGeometry(0.8, 0.8),
    };
    this.bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.38,
      iridescence: 1, iridescenceIOR: 1.3, clearcoat: 1, depthWrite: false,
    });
    this.gemMats = GEM_COLORS.map((c) => new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.2,
    }));
  }

  mask(layer) {
    if (layer === 'all') return ALL;
    if (Array.isArray(layer)) return layer.reduce((m, l) => m | (1 << l), 0);
    return 1 << layer;
  }

  body(type, x, y, angle = 0) {
    const R = this.R;
    let desc;
    if (type === 'dynamic') desc = R.RigidBodyDesc.dynamic().setCcdEnabled(true).setAngularDamping(0.3).setLinearDamping(0.05);
    else if (type === 'kinematic') desc = R.RigidBodyDesc.kinematicVelocityBased();
    else desc = R.RigidBodyDesc.fixed();
    desc.setTranslation(x, y).setRotation(angle);
    return this.world.createRigidBody(desc);
  }

  register(obj) {
    this.objects.push(obj);
    if (obj.type !== 'fixed') this.moving.push(obj);
    if (obj.type === 'kinematic') this.kinematic.push(obj);
    return obj;
  }

  addMesh(mesh, shadows = true) {
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  // ---------- Objets physiques ----------

  box({ x, y, w, h, angle = 0, layer = 'all', mat = 'wood', top, type = 'fixed', density, friction, restitution = 0, grabbable, path }) {
    const R = this.R;
    const m = this.mats[mat];
    const mask = this.mask(layer);
    const body = this.body(type, x, y, angle);
    const collider = this.world.createCollider(
      R.ColliderDesc.cuboid(w / 2, h / 2)
        .setDensity(density ?? m.density)
        .setFriction(friction ?? m.friction)
        .setRestitution(restitution)
        .setCollisionGroups(groupsFor(mask)),
      body,
    );
    const { z, depth } = zSpan(mask);
    let material = m.material;
    if (top) {
      const t = this.mats[top].material;
      material = [m.material, m.material, t, m.material, m.material, m.material];
    }
    const mesh = this.addMesh(new THREE.Mesh(boxGeometry(w, h, depth, m.scale), material));
    mesh.position.set(x, y, z);
    mesh.rotation.z = angle;
    return this.register({
      kind: 'box', body, collider, mesh, w, h, mask, z, mat, type, path,
      grabbable: grabbable ?? type === 'dynamic',
    });
  }

  ball({ x, y, r, layer = 1, mat = 'wood', type = 'dynamic', density, friction, restitution = 0.1, grabbable }) {
    const R = this.R;
    const m = this.mats[mat];
    const mask = this.mask(layer);
    const body = this.body(type, x, y);
    const collider = this.world.createCollider(
      R.ColliderDesc.ball(r)
        .setDensity(density ?? m.density)
        .setFriction(friction ?? m.friction)
        .setRestitution(restitution)
        .setCollisionGroups(groupsFor(mask)),
      body,
    );
    const { z, depth } = zSpan(mask);
    const geo = new THREE.CylinderGeometry(r, r, depth * 0.85, 40);
    geo.rotateX(Math.PI / 2);
    const mesh = this.addMesh(new THREE.Mesh(geo, m.material));
    mesh.position.set(x, y, z);
    return this.register({
      kind: 'ball', body, collider, mesh, r, mask, z, mat, type,
      grabbable: grabbable ?? type === 'dynamic',
    });
  }

  ground(x0, x1, top = 0) {
    const g = this.box({ x: (x0 + x1) / 2, y: top - 2.5, w: x1 - x0, h: 5, mat: 'darkcard', top: 'felt' });
    // Fleurs et touffes d'herbe en bordure, devant et derrière les plans jouables
    for (let x = x0 + 0.8; x < x1 - 0.5; x += 0.9 + Math.random() * 2.2) {
      for (const z of [2.0, -2.0]) {
        if (Math.random() < 0.35) continue;
        const tex = this.flowers[(Math.random() * this.flowers.length) | 0];
        const s = z > 0 ? 0.7 + Math.random() * 0.3 : 1 + Math.random() * 0.6;
        const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
        const f = this.addMesh(new THREE.Mesh(this.geo.flower, mat), false);
        f.scale.setScalar(s);
        f.position.set(x + Math.random() * 0.4, top + 0.4 * s - 0.04, z);
        f.rotation.y = (Math.random() - 0.5) * 0.5;
      }
    }
    return g;
  }

  mover(o, to, period = 5, phase = 0) {
    const obj = this.box({ ...o, type: 'kinematic' });
    obj.path = { ax: o.x, ay: o.y, bx: to.x, by: to.y, period, phase };
    return obj;
  }

  seesaw(x, y, w, layer = 1) {
    this.box({ x, y: y / 2 - 0.1, w: 0.35, h: y - 0.2, layer, mat: 'wood' });
    const plank = this.box({ x, y, w, h: 0.35, layer, mat: 'wood', type: 'dynamic', density: 1, grabbable: false });
    const anchor = this.body('fixed', x, y);
    const jd = this.R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 });
    jd.limitsEnabled = true;
    jd.limits = [-0.38, 0.38];
    this.world.createImpulseJoint(jd, anchor, plank.body, true);
    return plank;
  }

  pendulum(ax, ay, len, layer = 1, r = 0.6) {
    const anchor = this.body('fixed', ax, ay);
    const ball = this.ball({ x: ax, y: ay - len, r, layer, mat: 'sponge', density: 0.5, restitution: 0 });
    const jd = this.R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: len });
    this.world.createImpulseJoint(jd, anchor, ball.body, true);

    const z = LAYER_Z[layer];
    const beam = this.addMesh(new THREE.Mesh(boxGeometry(3, 0.4, 0.6, 2.5), this.mats.wood.material));
    beam.position.set(ax, ay + 0.2, z);
    const yarn = new THREE.MeshStandardMaterial({ color: 0xd64a3c, roughness: 1 });
    const rope = this.addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), yarn));
    this.ropes.push({ mesh: rope, ax, ay, obj: ball, z });
    return ball;
  }

  // ---------- Bulles de score, checkpoints, panneaux ----------

  bubble(x, y, layer = 1, big = false) {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(this.geo.bubble, this.bubbleMat);
    const gem = new THREE.Mesh(this.geo.gem, this.gemMats[(Math.random() * this.gemMats.length) | 0]);
    gem.castShadow = true;
    group.add(shell, gem);
    const scale = big ? 1.7 : 1;
    group.scale.setScalar(scale);
    group.position.set(x, y, LAYER_Z[layer]);
    this.scene.add(group);
    this.bubbles.push({ group, gem, x, y, layer, big, scale, phase: Math.random() * 6, collected: false, t: 0 });
  }

  bubbleLine(x0, x1, y, layer = 1, step = 1) {
    for (let x = x0; x <= x1 + 1e-6; x += step) this.bubble(x, y, layer);
  }

  bubbleArc(x0, x1, y, height, n, layer = 1) {
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      this.bubble(x0 + (x1 - x0) * k, y + Math.sin(k * Math.PI) * height, layer);
    }
  }

  checkpoint(x, y = 0) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(boxGeometry(2.2, 0.4, 0.8, 2), this.mats.cardboard.material);
    base.position.y = 0.2;
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a3b30, emissive: 0x8a3b30, emissiveIntensity: 0.25, roughness: 0.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.13, 12, 40), mat);
    ring.position.y = 1.55;
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.25 }),
    );
    glow.position.y = 1.55;
    for (const m of [base, ring]) { m.castShadow = true; m.receiveShadow = true; }
    group.add(base, ring, glow);
    group.position.set(x, y, -2.4);
    this.scene.add(group);
    const cp = { x, y: y + 1, group, ring, mat, glow, active: false };
    this.checkpoints.push(cp);
    return cp;
  }

  activateCheckpoint(cp) {
    for (const c of this.checkpoints) {
      c.active = false;
      c.mat.color.setHex(0x8a3b30);
      c.mat.emissive.setHex(0x8a3b30);
      c.glow.material.opacity = 0.25;
    }
    cp.active = true;
    cp.mat.color.setHex(0x52d36b);
    cp.mat.emissive.setHex(0x52d36b);
    cp.glow.material.opacity = 0.6;
  }

  sign(x, text, y = 0) {
    const post = this.addMesh(new THREE.Mesh(boxGeometry(0.2, 2.2, 0.2, 2.5), this.mats.wood.material));
    post.position.set(x, y + 1.1, -2.35);
    const face = new THREE.MeshStandardMaterial({ map: signTexture(text), roughness: 0.95 });
    const side = this.mats.cardboard.material;
    const board = this.addMesh(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.1), [side, side, side, side, face, side]));
    board.position.set(x, y + 2.5, -2.25);
    board.rotation.z = (Math.random() - 0.5) * 0.08;
  }

  finish(x) {
    this.finishX = x;
    for (const dx of [-2.2, 2.2]) {
      const post = this.addMesh(new THREE.Mesh(boxGeometry(0.35, 5.2, 0.35, 2.5), this.mats.wood.material));
      post.position.set(x + dx, 2.6, -2.4);
    }
    const face = new THREE.MeshStandardMaterial({ map: signTexture('ARRIVÉE !'), roughness: 0.95 });
    const side = this.mats.cardboard.material;
    const banner = this.addMesh(new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 0.15), [side, side, side, side, face, side]));
    banner.position.set(x, 4.9, -2.3);
  }

  backdrop() {
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 90),
      new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }),
    );
    sky.material.map.repeat.set(3, 1);
    sky.position.set(50, 12, -32);
    this.scene.add(sky);

    const hills = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 15),
      new THREE.MeshBasicMaterial({ map: hillsTexture(), transparent: true, fog: false }),
    );
    hills.material.map.repeat.set(5, 1);
    hills.position.set(50, 2.2, -12);
    this.scene.add(hills);
  }

  // ---------- Mise à jour ----------

  // Plates-formes mobiles : on calcule la vitesse qui les amène pile sur leur trajectoire.
  update(dt) {
    this.time += dt;
    for (const k of this.kinematic) {
      const p = k.path;
      const raw = 0.5 - 0.5 * Math.cos((this.time / p.period) * Math.PI * 2 + p.phase);
      const s = Math.min(1, Math.max(0, raw * 1.2 - 0.1)); // petite pause aux extrémités
      const tx = p.ax + (p.bx - p.ax) * s;
      const ty = p.ay + (p.by - p.ay) * s;
      const cur = k.body.translation();
      k.body.setLinvel({ x: (tx - cur.x) / dt, y: (ty - cur.y) / dt }, true);
    }
  }

  savePrev() {
    for (const o of this.moving) {
      const t = o.body.translation();
      o.px = t.x;
      o.py = t.y;
      o.pa = o.body.rotation();
    }
  }

  // Interpolation entre deux pas de physique : fluide même sur un écran 144 Hz.
  sync(alpha) {
    for (const o of this.moving) {
      const t = o.body.translation();
      const a = o.body.rotation();
      const px = o.px ?? t.x, py = o.py ?? t.y, pa = o.pa ?? a;
      const da = Math.atan2(Math.sin(a - pa), Math.cos(a - pa));
      o.mesh.position.x = px + (t.x - px) * alpha;
      o.mesh.position.y = py + (t.y - py) * alpha;
      o.mesh.rotation.z = pa + da * alpha;
    }
    for (const r of this.ropes) {
      const b = r.obj.mesh.position;
      const dx = b.x - r.ax, dy = b.y - r.ay;
      r.mesh.position.set(r.ax + dx / 2, r.ay + dy / 2, r.z);
      r.mesh.scale.y = Math.hypot(dx, dy);
      r.mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    }
  }

  animate(dt) {
    for (const b of this.bubbles) {
      if (b.collected) {
        if (b.group.visible) {
          b.t += dt;
          b.group.scale.setScalar(b.scale * (1 + b.t * 5));
          if (b.t > 0.14) b.group.visible = false;
        }
        continue;
      }
      b.group.position.y = b.y + Math.sin(this.time * 2 + b.phase) * 0.08;
      b.gem.rotation.y += dt * 2.5;
      b.gem.rotation.x += dt;
    }
    for (const cp of this.checkpoints) cp.ring.rotation.z += dt * (cp.active ? 1.6 : 0.3);
  }
}

// ---------- Niveau 1 : "Le Jardin en Carton" ----------

export function buildLevel1(L) {
  L.spawn = { x: 0, y: 0.8 };
  L.backdrop();

  // Murs de fin de niveau et sol (avec deux trous !)
  L.box({ x: -12.5, y: 6, w: 1, h: 16, mat: 'darkcard' });
  L.box({ x: 126.5, y: 6, w: 1, h: 16, mat: 'darkcard' });
  L.ground(-13, 30);
  L.ground(34.5, 71);
  L.ground(79, 127);

  L.checkpoint(0);
  L.checkpoint(36.5);
  L.checkpoint(81);

  // --- Zone 1 : apprendre à bouger
  L.sign(3, 'Q / D pour bouger\nESPACE pour sauter');
  L.bubbleLine(2.5, 5.5, 1.0, 1);

  L.box({ x: 7, y: 0.6, w: 1.2, h: 1.2, layer: 1, mat: 'cardboard', type: 'dynamic' });
  L.box({ x: 7, y: 1.8, w: 1.2, h: 1.2, layer: 1, mat: 'cardboard', type: 'dynamic' });
  L.box({ x: 8.25, y: 0.6, w: 1.2, h: 1.2, layer: 1, mat: 'cardboard', type: 'dynamic' });
  L.box({ x: 10, y: 0.5, w: 1, h: 1, layer: 0, mat: 'cardboard', type: 'dynamic' });
  L.bubble(7, 3.3, 1);

  // --- Zone 2 : les plans de profondeur
  L.sign(11.5, 'Z / S pour changer\nde plan (fond / devant)');
  L.box({ x: 14, y: 1, w: 3, h: 2, layer: 2, mat: 'wood' });
  L.box({ x: 17.5, y: 2, w: 3, h: 4, layer: 2, mat: 'wood' });
  L.bubble(14, 2.6, 2);
  L.bubbleLine(16.5, 18.5, 4.6, 2);
  L.box({ x: 16, y: 2.0, w: 2.4, h: 0.4, layer: 0, mat: 'cardboard' });
  L.bubble(16, 2.9, 0, true);

  // --- Zone 3 : la balançoire
  L.seesaw(24, 1.0, 7, 1);
  L.box({ x: 21.3, y: 2, w: 0.9, h: 0.9, layer: 1, mat: 'metal', type: 'dynamic' });
  L.bubble(24, 3.4, 1);
  L.bubble(27, 2.6, 1);

  // --- Trou n°1 : saut ou navette au fond
  L.bubbleArc(30.8, 33.7, 1.8, 1.4, 4, 1);
  L.mover({ x: 31.2, y: -0.25, w: 2.4, h: 0.5, layer: 2, mat: 'wood' }, { x: 33.3, y: -0.25 }, 4);
  L.bubble(32.25, 1, 2);

  // --- Zone 4 : l'éponge et le mur
  L.sign(39, 'Maintiens SHIFT\npour attraper l\'éponge');
  L.box({ x: 41, y: 0.75, w: 1.5, h: 1.5, layer: 1, mat: 'sponge', type: 'dynamic' });
  L.box({ x: 46, y: 1.8, w: 1, h: 3.6, mat: 'wood' });
  L.bubble(46, 4.5, 1, true);

  // --- Zone 5 : rampe, roue et ascenseur
  L.box({ x: 53.5, y: 0.6, w: 7, h: 0.4, angle: 0.22, layer: 1, mat: 'wood' });
  L.bubbleArc(51, 56, 1.6, 0.8, 3, 1);
  L.ball({ x: 50, y: 0.9, r: 0.9, layer: 2, mat: 'cardboard' });
  L.bubble(50, 2.6, 2);

  L.sign(59.5, 'Prends l\'ascenseur !');
  L.mover({ x: 62.3, y: -0.18, w: 2.4, h: 0.4, layer: 1, mat: 'metal' }, { x: 62.3, y: 5.4 }, 7);
  L.bubble(62.3, 2.5, 1);
  L.bubble(62.3, 4.2, 1);
  L.box({ x: 67.5, y: 5.35, w: 7, h: 0.5, layer: [1, 2], mat: 'wood' });
  L.bubbleLine(65, 70, 6.4, 1);
  L.bubble(67.5, 6.7, 2, true);

  // --- Trou n°2 : se balancer... ou prendre la navette devant
  L.sign(68.5, 'Attrape l\'éponge (SHIFT)\net balance-toi !', 5.6);
  L.sign(67, 'Trop risqué ?\nNavette devant (S)');
  L.pendulum(75, 11.5, 5.5, 1);
  L.bubbleArc(72.5, 77.5, 4.6, 1.2, 5, 1);
  L.mover({ x: 72.5, y: -0.25, w: 2.6, h: 0.5, layer: 0, mat: 'wood' }, { x: 77.5, y: -0.25 }, 5);
  L.bubble(75, 1, 0);

  // --- Zone 6 : la pyramide de cartons
  L.sign(84.5, 'Fais tomber\nla pyramide !');
  const s = 1.1;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 4 - row; i++) {
      L.box({ x: 89 + (i - (3 - row) / 2) * s * 1.02, y: s / 2 + row * s, w: s, h: s, layer: 1, mat: 'cardboard', type: 'dynamic' });
    }
  }
  L.bubble(89, 5.3, 1, true);
  L.bubbleLine(92, 94, 0.9, 1);

  // --- Zone 7 : escalier du fond
  L.box({ x: 97, y: 1.2, w: 2, h: 0.3, layer: 2, mat: 'wood' });
  L.box({ x: 100, y: 2.6, w: 2, h: 0.3, layer: 2, mat: 'wood' });
  L.box({ x: 103, y: 4.0, w: 2, h: 0.3, layer: 2, mat: 'wood' });
  L.bubble(97, 2.1, 2);
  L.bubble(100, 3.5, 2);
  L.bubble(103, 4.9, 2);
  L.bubble(105.6, 5.8, 2, true);

  L.box({ x: 108, y: 0.6, w: 1.2, h: 1.2, layer: 1, mat: 'metal', type: 'dynamic' });

  // --- Ligne d'arrivée : une rangée de bulles par plan
  for (let layer = 0; layer < 3; layer++) L.bubbleLine(111, 114, 1, layer);
  L.finish(118);
}
