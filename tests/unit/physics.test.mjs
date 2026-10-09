// Physique clé avec le vrai Rapier 2D (même version que le CDN du jeu) : plans de collision et sonde au sol.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier2d-compat';
import { ALL, groupsFor, probeGround } from '../../public/js/utils.js';

before(async () => {
  await RAPIER.init();
});

// Monde minimal : mêmes réglages que main.js / level.js.
function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -32 });
  world.timestep = 1 / 60;
  return world;
}

function addBox(world, { x, y, w, h, mask }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2).setCollisionGroups(groupsFor(mask)), body);
  return { body, collider };
}

function addPlayer(world, x, y, layer = 1) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).lockRotations().setCcdEnabled(true),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.35, 0.42).setFriction(0).setDensity(1.5).setCollisionGroups(groupsFor(1 << layer)),
    body,
  );
  return { body, collider, layer };
}

const run = (world, seconds) => { for (let i = 0; i < seconds * 60; i++) world.step(); };

test('le joueur se pose sur un sol "all"', () => {
  const world = makeWorld();
  addBox(world, { x: 0, y: -2.5, w: 20, h: 5, mask: ALL }); // dessus à y = 0
  const p = addPlayer(world, 0, 3);
  run(world, 2);
  const y = p.body.translation().y;
  // centre de la capsule = demi-hauteur 0.35 + rayon 0.42 au-dessus du sol
  assert.ok(Math.abs(y - 0.77) < 0.05, `y = ${y}`);
});

test('le joueur traverse un objet d\'un autre plan', () => {
  const world = makeWorld();
  addBox(world, { x: 0, y: -2.5, w: 20, h: 5, mask: ALL });
  addBox(world, { x: 0, y: 2, w: 4, h: 0.4, mask: 1 << 2 }); // plate-forme au fond
  const p = addPlayer(world, 0, 4, 1); // joueur au milieu, au-dessus
  run(world, 2);
  assert.ok(p.body.translation().y < 1, 'il doit tomber jusqu\'au sol');
});

test('le joueur est arrêté par un objet de son plan', () => {
  const world = makeWorld();
  addBox(world, { x: 0, y: -2.5, w: 20, h: 5, mask: ALL });
  addBox(world, { x: 0, y: 2, w: 4, h: 0.4, mask: 1 << 1 });
  const p = addPlayer(world, 0, 4, 1);
  run(world, 2);
  assert.ok(Math.abs(p.body.translation().y - 2.97) < 0.05, `y = ${p.body.translation().y}`);
});

test('un mur d\'un autre plan ne bloque pas, un mur du même plan si', () => {
  for (const [wallMask, blocked] of [[1 << 0, false], [1 << 1, true], [ALL, true]]) {
    const world = makeWorld();
    addBox(world, { x: 0, y: -2.5, w: 40, h: 5, mask: ALL });
    addBox(world, { x: 3, y: 2, w: 0.5, h: 4, mask: wallMask });
    const p = addPlayer(world, 0, 0.8, 1);
    for (let i = 0; i < 120; i++) {
      p.body.setLinvel({ x: 7, y: p.body.linvel().y }, true);
      world.step();
    }
    const x = p.body.translation().x;
    assert.equal(x < 3, blocked, `mur masque ${wallMask} : x = ${x}`);
  }
});

test('changer de plan change les collisions', () => {
  const world = makeWorld();
  addBox(world, { x: 0, y: -2.5, w: 20, h: 5, mask: ALL });
  addBox(world, { x: 0, y: 2, w: 4, h: 0.4, mask: 1 << 2 });
  const p = addPlayer(world, 0, 4, 2); // au fond : repose sur la plate-forme
  run(world, 1.5);
  assert.ok(p.body.translation().y > 2.5);
  p.collider.setCollisionGroups(groupsFor(1 << 1)); // passe au milieu (comme setLayer)
  run(world, 1.5);
  assert.ok(p.body.translation().y < 1);
});

test('sonde au sol : détecte le sol "all" et ignore les autres plans', () => {
  const world = makeWorld();
  const ground = addBox(world, { x: 0, y: -2.5, w: 20, h: 5, mask: ALL });
  const p = addPlayer(world, 0, 3);
  world.step(); // met à jour la structure de requêtes

  // En l'air : rien sous les pieds
  assert.equal(probeGround(RAPIER, world, p.body.translation(), groupsFor(1 << 1), p.collider), null);

  run(world, 2);
  const hit = probeGround(RAPIER, world, p.body.translation(), groupsFor(1 << 1), p.collider);
  assert.ok(hit, 'le sol doit être détecté');
  assert.equal(hit.handle, ground.body.handle);
});

test('sonde au sol : une plate-forme d\'un autre plan n\'est pas un sol', () => {
  const world = makeWorld();
  const back = addBox(world, { x: 0, y: 0, w: 4, h: 0.4, mask: 1 << 2 }); // dessus à 0.2
  world.step();
  const pos = { x: 0, y: 0.97 };
  assert.equal(probeGround(RAPIER, world, pos, groupsFor(1 << 1), undefined), null);
  const hit = probeGround(RAPIER, world, pos, groupsFor(1 << 2), undefined);
  assert.equal(hit?.handle, back.body.handle);
});
