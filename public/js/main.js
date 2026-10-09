import * as THREE from 'three';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier2d-compat@0.14.0/rapier.es.js';
import { createMaterials, knitTexture, dotTexture } from './textures.js';
import { Level, LAYER_Z, groupsFor, buildLevel1 } from './level.js';
import { Sackboy } from './character.js';
import { Sfx } from './audio.js';
import {
  clamp, damp, approach, toLocal, toWorld, overlapsObject, nextCombo, bubblePoints, bubbleReached,
  formatTime, probeGround,
} from './utils.js';
import { Net } from './net.js';

const STEP = 1 / 60;
const SPEED = 7;
const JUMP = 12.5;
const GRAVITY = -32;
const COSTUMES = [0xc9a06a, 0xe0574b, 0x4d8ad6, 0x5fb85a, 0xa874d6, 0xf0c341, 0x5a5a5a];
const EMOTES = ['happy', 'sad', 'angry', 'surprised'];

const $ = (id) => document.getElementById(id);

const loading = $('loading');
loading.textContent = 'Chargement de la physique…';
await RAPIER.init();
await Promise.race([document.fonts.load('700 40px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);

// ---------- Rendu ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcde8ee);
scene.fog = new THREE.Fog(0xf3e2bf, 28, 75);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 250);
camera.position.set(0, 4, 15);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4a2b, 1.6));
const sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -12, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Monde ----------

const mats = createMaterials();
const world = new RAPIER.World({ x: 0, y: GRAVITY });
world.timestep = STEP;
const level = new Level(RAPIER, world, scene, mats);
buildLevel1(level);
level.activateCheckpoint(level.checkpoints[0]);

const sfx = new Sfx();

class Puffs {
  constructor(map) {
    this.map = map;
    this.items = [];
  }
  spawn(x, y, z, { n = 6, colors = [0xffffff], speed = 2, size = 0.35, life = 0.6, gravity = 0, up = 0.5 } = {}) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.map, color: colors[i % colors.length], transparent: true, depthWrite: false,
      }));
      s.position.set(x, y, z);
      s.scale.setScalar(size);
      scene.add(s);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.items.push({
        s, size, gravity, t: 0, life: life * (0.7 + Math.random() * 0.6),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 + up, vz: (Math.random() - 0.5) * speed * 0.5,
      });
    }
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.t += dt;
      if (p.t >= p.life) {
        scene.remove(p.s);
        p.s.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      const k = p.t / p.life;
      p.s.scale.setScalar(p.size * (1 + k));
      p.s.material.opacity = 1 - k;
    }
  }
}
const puffs = new Puffs(dotTexture());

// ---------- Joueur ----------

const player = {
  layer: 1, facing: 1, grounded: false, coyote: 0, jumpBuf: 0, jumpCut: false,
  joint: null, grabbed: null, relVx: 0, lastVy: 0, z: LAYER_Z[1],
  respawn: { ...level.spawn }, prev: { ...level.spawn },
  costume: 0, emote: 0,
};
player.body = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(level.spawn.x, level.spawn.y).lockRotations().setCcdEnabled(true),
);
player.collider = world.createCollider(
  RAPIER.ColliderDesc.capsule(0.35, 0.42)
    .setFriction(0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setDensity(1.5)
    .setCollisionGroups(groupsFor(1 << 1)),
  player.body,
);

const sack = new Sackboy(knitTexture());
scene.add(sack.root);

// ---------- État de la partie ----------

let state = 'title';
let score = 0;
let combo = 0;
let lastCollect = -10;
let runTime = 0;
let simTime = 0;
let got = 0;
let cpIndex = 0;
const totalBubbles = level.bubbles.length;

// ---------- Entrées clavier / souris / manette ----------

const keys = new Set();
let mouseGrab = false;
let pad = null;

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // saisie du pseudo / du code
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  press(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseGrab = false; });
addEventListener('mousedown', (e) => {
  if (state === 'title') { if (!e.target.closest?.('#menu')) start(); return; }
  if (e.button === 0) mouseGrab = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseGrab = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

// Avec e.code, les touches suivent la position physique : WASD en QWERTY = ZQSD en AZERTY.
function press(code) {
  if (state === 'title') {
    if (code === 'Enter' || code === 'Space') start();
    return;
  }
  if (state === 'finished') {
    if (code === 'Enter') location.reload();
    return;
  }
  switch (code) {
    case 'Space': player.jumpBuf = 0.12; break;
    case 'KeyW': case 'ArrowUp': changeLayer(+1); break;
    case 'KeyS': case 'ArrowDown': changeLayer(-1); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      setEmote(Number(code.slice(5)) - 1); break;
    case 'KeyC': nextCostume(); break;
    case 'KeyM': toast(sfx.toggleMusic() ? 'Musique ON' : 'Musique OFF', 900); break;
    case 'KeyR': respawn(false); break;
  }
}

function readInput() {
  if (state !== 'play') return { x: 0, jump: false, grab: false };
  let x = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  let jump = keys.has('Space');
  let grab = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyE') || mouseGrab;
  if (pad) {
    if (Math.abs(pad.x) > 0.25) x = pad.x;
    jump ||= pad.jump;
    grab ||= pad.grab;
  }
  return { x: clamp(x, -1, 1), jump, grab };
}

function pollPad() {
  const gp = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
  if (!gp) { pad = null; return; }
  const b = (i) => !!gp.buttons[i]?.pressed;
  const ay = gp.axes[1] ?? 0;
  const s = {
    x: gp.axes[0] ?? 0, jump: b(0), grab: b(4) || b(5) || b(6) || b(7),
    up: b(12) || ay < -0.7, down: b(13) || ay > 0.7,
    start: b(9), left: b(14), right: b(15), y: b(3),
  };
  const p = pad || {};
  const edge = (k) => s[k] && !p[k];
  if (state === 'title' && (edge('jump') || edge('start'))) start();
  else if (state === 'finished' && (edge('start') || edge('jump'))) location.reload();
  else if (state === 'play') {
    if (edge('jump')) player.jumpBuf = 0.12;
    if (edge('up')) changeLayer(+1);
    if (edge('down')) changeLayer(-1);
    if (edge('left')) setEmote((player.emote + 3) % 4);
    if (edge('right')) setEmote((player.emote + 1) % 4);
    if (edge('y')) nextCostume();
  }
  pad = s;
}

function setEmote(i) {
  player.emote = i;
  sack.setEmote(EMOTES[i]);
}

function nextCostume() {
  player.costume = (player.costume + 1) % COSTUMES.length;
  sack.setColor(COSTUMES[player.costume]);
  const p = player.body.translation();
  puffs.spawn(p.x, p.y, player.z, { n: 10, colors: [COSTUMES[player.costume]], speed: 2.5 });
  sfx.whoosh();
}

// ---------- Actions du joueur ----------

// Attraper = créer un pivot physique entre la main et le point le plus proche de l'objet.
function tryGrab(pos) {
  const hand = { x: pos.x + player.facing * 0.6, y: pos.y + 0.05 };
  let best = null, bestD = 0.45;
  for (const o of [...level.objects, ...net.grabTargets()]) {
    if (!o.grabbable || !(o.mask & (1 << player.layer))) continue;
    const l = toLocal(o, hand);
    let cp;
    if (o.kind === 'box') {
      cp = { x: clamp(l.x, -o.w / 2, o.w / 2), y: clamp(l.y, -o.h / 2, o.h / 2) };
    } else {
      const d = Math.hypot(l.x, l.y);
      cp = d <= o.r ? l : { x: (l.x / d) * o.r, y: (l.y / d) * o.r };
    }
    const d = Math.hypot(l.x - cp.x, l.y - cp.y);
    if (d < bestD) { bestD = d; best = { o, cp }; }
  }
  if (!best) return;
  const wp = toWorld(best.o, best.cp);
  const jd = RAPIER.JointData.revolute({ x: wp.x - pos.x, y: wp.y - pos.y }, best.cp);
  player.joint = world.createImpulseJoint(jd, player.body, best.o.body, true);
  player.grabbed = best.o;
  sfx.grab();
}

function release() {
  if (!player.joint) return;
  world.removeImpulseJoint(player.joint, true);
  player.joint = null;
  player.grabbed = null;
  sfx.release();
}

function changeLayer(dir) {
  const target = player.layer + dir;
  const pos = player.body.translation();
  const bit = 1 << target;
  const blocked = target < 0 || target > 2 ||
    level.objects.some((o) => (o.mask & bit) && overlapsObject(o, pos.x, pos.y, 0.38, 0.72));
  if (blocked) { sfx.nope(); return; }
  release();
  setLayer(target);
  sfx.whoosh();
}

function setLayer(l) {
  player.layer = l;
  player.collider.setCollisionGroups(groupsFor(1 << l));
  document.querySelectorAll('#layers div').forEach((d) => d.classList.toggle('on', Number(d.dataset.layer) === l));
}

function respawn(fell) {
  release();
  const r = player.respawn;
  player.body.setTranslation({ x: r.x, y: r.y }, true);
  player.body.setLinvel({ x: 0, y: 0 }, true);
  player.prev = { x: r.x, y: r.y };
  setLayer(1);
  player.z = LAYER_Z[1];
  combo = 0;
  sfx.poof();
  puffs.spawn(r.x, r.y, player.z, { n: 14, speed: 3, size: 0.6, life: 0.8 });
  if (fell) toast('Oups !', 900);
}

// ---------- Physique du joueur (à chaque pas fixe) ----------

function playerStep(dt) {
  const b = player.body;
  const pos = b.translation();
  const vel = b.linvel();
  const inp = readInput();
  const groups = groupsFor(1 << player.layer);

  // Sonde au sol : 3 rayons sous les pieds
  const ground = vel.y < 4 ? probeGround(RAPIER, world, pos, groups, player.collider) : null;
  const wasGrounded = player.grounded;
  player.grounded = !!ground;
  if (player.grounded && !wasGrounded && player.lastVy < -7) {
    sack.land(-player.lastVy);
    sfx.land(-player.lastVy);
    puffs.spawn(pos.x, pos.y - 0.7, player.z, { n: 6, colors: [0xf3e6c8], speed: 2.5, up: 0.3 });
  }

  // Sur une plate-forme mobile, on avance avec elle
  let base = { x: 0, y: 0 };
  const onMover = ground?.isKinematic();
  if (onMover) base = ground.linvel();

  if (inp.grab && !player.grabbed) tryGrab(pos);
  else if (!inp.grab && player.grabbed) release();
  if (inp.x !== 0 && !player.grabbed) player.facing = Math.sign(inp.x);

  let vx = vel.x, vy = vel.y;
  const swinging = player.grabbed && !player.grounded;
  if (swinging) {
    b.applyImpulse({ x: inp.x * 9 * dt, y: 0 }, true);
  } else {
    const accel = player.grounded ? 80 : 35;
    let target = inp.x * SPEED * (player.grabbed ? 0.75 : 1) + base.x;
    if (!player.grounded && inp.x === 0) target = vx;
    vx = approach(vx, target, accel * dt);
    if (onMover && vy <= base.y + 0.5) vy = base.y;
  }

  player.coyote = player.grounded ? 0.1 : player.coyote - dt;
  player.jumpBuf -= dt;
  if (player.jumpBuf > 0 && player.coyote > 0 && !swinging) {
    vy = JUMP + Math.max(0, base.y);
    player.coyote = 0;
    player.jumpBuf = 0;
    player.jumpCut = true;
    player.grounded = false;
    sfx.jump();
    puffs.spawn(pos.x, pos.y - 0.7, player.z, { n: 4, colors: [0xf3e6c8], speed: 1.5, up: 0.2 });
  }
  // Saut variable : relâcher Espace coupe le saut
  if (player.jumpCut && !inp.jump && vy > 0) { vy *= 0.5; player.jumpCut = false; }
  if (vy <= 0) player.jumpCut = false;
  vy = Math.max(vy, -28);

  if (!swinging) b.setLinvel({ x: vx, y: vy }, true);
  player.relVx = vx - base.x;
  player.lastVy = vy;
  player.input = inp;
}

function gameplayStep() {
  const pos = player.body.translation();

  if (pos.y < -14) respawn(true);

  // On n'avance que vers un checkpoint plus loin (sinon les anciens se réactivaient en boucle)
  level.checkpoints.forEach((cp, i) => {
    if (i > cpIndex && pos.x > cp.x - 0.5 && Math.abs(pos.y - cp.y) < 6) {
      setCheckpoint(i);
      net.checkpoint(i);
    }
  });

  level.bubbles.forEach((b, i) => {
    if (b.collected || b.layer !== player.layer) return;
    if (bubbleReached(b.x, b.group.position.y, b.big, pos.x, pos.y)) {
      collect(b);
      net.bubble(i);
    }
  });

  if (state === 'play' && pos.x > level.finishX) finish();
}

function collect(b) {
  b.collected = true;
  combo = nextCombo(combo, simTime, lastCollect);
  lastCollect = simTime;
  const { points, mult } = bubblePoints(b.big, combo);
  score += points;
  got++;
  sfx.pop(1 + Math.min(combo, 12) * 0.06);
  const color = b.gem.material.color.getHex();
  puffs.spawn(b.x, b.group.position.y, b.group.position.z, { n: b.big ? 14 : 7, colors: [color, 0xffffff], speed: 3, size: 0.22 });
  popup(`+${points}${mult > 1 ? ` x${mult}` : ''}`, b.x, b.group.position.y, b.group.position.z, b.big || mult > 1);
  const el = $('score');
  $('score-val').textContent = score;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// Checkpoint atteint (par moi, ou par un autre joueur : by = son pseudo ; null = silencieux)
function setCheckpoint(i, by) {
  const cp = level.checkpoints[i];
  if (!cp || i <= cpIndex) return;
  cpIndex = i;
  level.activateCheckpoint(cp);
  player.respawn = { x: cp.x, y: cp.y };
  if (by === null) return;
  sfx.checkpoint();
  toast(by ? `Checkpoint ! (${by})` : 'Checkpoint !');
}

// Bulle ramassée par un autre joueur : elle disparaît ici aussi (sans points)
function remoteCollect(i, by) {
  const b = level.bubbles[i];
  if (!b || b.collected) return;
  b.collected = true;
  if (by == null) { b.group.visible = false; return; }
  sfx.pop(0.8);
  puffs.spawn(b.x, b.group.position.y, b.group.position.z, { n: 6, colors: [b.gem.material.color.getHex(), 0xffffff], speed: 3, size: 0.22 });
}

function finish() {
  state = 'finished';
  release();
  sfx.finish();
  const p = player.body.translation();
  for (let i = 0; i < 4; i++) {
    setTimeout(() => puffs.spawn(p.x + (Math.random() - 0.5) * 6, p.y + 4, 0, {
      n: 25, colors: [0xe2574c, 0x4d8ad6, 0x5fb85a, 0xf2c94c, 0xb67ad6], speed: 7, size: 0.18, life: 1.8, gravity: -6, up: 3,
    }), i * 250);
  }
  let best = 0;
  try {
    best = Math.max(score, Number(localStorage.getItem('lbw-best-1')) || 0);
    localStorage.setItem('lbw-best-1', best);
  } catch { best = score; }
  setTimeout(() => {
    $('end-score').textContent = score;
    $('end-bubbles').textContent = `${got} / ${totalBubbles}`;
    $('end-time').textContent = formatTime(runTime);
    $('end-best').textContent = best;
    $('end').classList.remove('hidden');
  }, 1400);
}

// ---------- HUD ----------

const popups = [];
function popup(text, x, y, z, big) {
  const el = document.createElement('div');
  el.className = 'popup' + (big ? ' big' : '');
  el.textContent = text;
  $('popups').appendChild(el);
  popups.push({ el, pos: new THREE.Vector3(x, y, z), t: 0 });
}

function updatePopups(dt) {
  const v = new THREE.Vector3();
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt;
    if (p.t > 1.1) { p.el.remove(); popups.splice(i, 1); continue; }
    v.copy(p.pos);
    v.y += 0.4 + p.t * 1.4;
    v.project(camera);
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
    const sc = p.t < 0.12 ? 0.5 + p.t * 4 : 1;
    p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${sc})`;
    p.el.style.opacity = String(1 - Math.max(0, p.t - 0.6) / 0.5);
  }
}

let toastTimer = 0;
function toast(text, ms = 1300) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function start() {
  if (state !== 'title') return;
  state = 'play';
  sfx.init();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  setLayer(1);
  setTimeout(() => $('hint').classList.add('fade'), 12000);
  toast('C\'est parti !');
}

// ---------- Boucle principale ----------

const camTarget = new THREE.Vector3(level.spawn.x + 2, 2.5, 0);
let acc = 0;
let last = performance.now();
let clock = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  clock += dt;
  pollPad();

  if (state !== 'title') {
    acc += dt;
    while (acc >= STEP) {
      const p = player.body.translation();
      player.prev = { x: p.x, y: p.y };
      level.savePrev();
      playerStep(STEP);
      level.update(STEP);
      net.step(STEP);
      world.step();
      simTime += STEP;
      gameplayStep();
      acc -= STEP;
    }
    if (state === 'play') runTime += dt;
  }
  const alpha = acc / STEP;

  level.sync(alpha);
  level.animate(dt);
  puffs.update(dt);

  const cur = player.body.translation();
  const px = player.prev.x + (cur.x - player.prev.x) * alpha;
  const py = player.prev.y + (cur.y - player.prev.y) * alpha;
  player.z = damp(player.z, LAYER_Z[player.layer], 12, dt);
  sack.root.position.set(px, py, player.z);
  sack.update(dt, {
    speed: Math.abs(player.relVx),
    grounded: player.grounded,
    vy: player.body.linvel().y,
    facing: player.facing,
    moving: Math.abs(player.input?.x ?? 0) > 0.1,
    grabbing: !!player.grabbed,
  });
  net.update(dt);

  // Caméra
  if (state === 'title') {
    camera.position.set(px + 1.5 + Math.sin(clock * 0.3) * 1.5, py + 2.6, 11.5);
    camera.lookAt(px + 1.2, py + 1.2, 0);
  } else {
    const vx = player.body.linvel().x;
    camTarget.x = damp(camTarget.x, Math.max(px + player.facing * 1.2 + vx * 0.15, -4), 3, dt);
    camTarget.y = damp(camTarget.y, Math.max(py, 0.8) + 1.4, 3, dt);
    camera.position.set(camTarget.x, camTarget.y + 1.3, 14.5);
    camera.lookAt(camTarget.x, camTarget.y, 0);
  }
  sun.position.set(px + 8, py + 16, 12);
  sun.target.position.set(px, py, 0);

  if (state === 'play') $('timer').textContent = formatTime(runTime);
  updatePopups(dt);
  renderer.render(scene, camera);
}

// Hook de test en lecture seule (utilisé par tests/e2e.mjs).
window.__lbw = {
  getState() {
    const p = player.body.translation();
    return {
      state, score, combo, got, totalBubbles, runTime,
      x: p.x, y: p.y, layer: player.layer, grounded: player.grounded, grabbing: !!player.grabbed,
    };
  },
};

// ---------- Réseau (co-op en ligne, voir net.js) ----------

const net = new Net({
  RAPIER, world, scene, camera, level, player, sack, COSTUMES, EMOTES,
  hooks: { start, release, toast, getScore: () => score, remoteCollect, setCheckpoint },
});

loading.textContent = 'Entrée pour jouer en solo, ou choisis ci-dessous';
loading.classList.add('ready');
requestAnimationFrame(frame);
