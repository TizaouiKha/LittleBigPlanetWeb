// Tests de la logique pure (public/js/utils.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp, damp, approach, LAYER_Z, LAYER_DEPTH, ALL, groupsFor, zSpan, scaleBoxUVs, toLocal, toWorld,
  overlapsObject, nextCombo, bubblePoints, bubbleReached, checkpointReached, formatTime,
} from '../../public/js/utils.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
// Faux objet de niveau : seul body.translation()/rotation() est utilisé.
const obj = (x, y, angle = 0, extra = {}) => ({
  body: { translation: () => ({ x, y }), rotation: () => angle },
  ...extra,
});

describe('maths', () => {
  test('clamp', () => {
    assert.equal(clamp(5, 0, 1), 1);
    assert.equal(clamp(-5, 0, 1), 0);
    assert.equal(clamp(0.5, 0, 1), 0.5);
  });

  test('damp : converge vers la cible sans la dépasser', () => {
    assert.equal(damp(0, 10, 5, 0), 0);
    const v = damp(0, 10, 5, 0.1);
    assert.ok(v > 0 && v < 10);
    near(damp(0, 10, 5, 100), 10);
    // indépendant du framerate : 2 pas de dt/2 = 1 pas de dt
    near(damp(damp(0, 10, 5, 0.05), 10, 5, 0.05), damp(0, 10, 5, 0.1));
  });

  test('approach : avance d\'au plus d, sans dépasser', () => {
    assert.equal(approach(0, 10, 3), 3);
    assert.equal(approach(9, 10, 3), 10);
    assert.equal(approach(10, 0, 3), 7);
    assert.equal(approach(1, 0, 3), 0);
    assert.equal(approach(4, 4, 3), 4);
  });

  test('formatTime', () => {
    assert.equal(formatTime(0), '00:00');
    assert.equal(formatTime(59.99), '00:59');
    assert.equal(formatTime(61), '01:01');
    assert.equal(formatTime(600), '10:00');
  });
});

describe('plans', () => {
  test('groupsFor : appartenance (16 bits hauts) = filtre (16 bits bas)', () => {
    assert.equal(groupsFor(0b010), 0x0002_0002);
    assert.equal(groupsFor(ALL), 0x0007_0007);
    // deux plans différents ne partagent aucun bit
    assert.equal(groupsFor(1 << 0) & groupsFor(1 << 2), 0);
  });

  test('zSpan : un seul plan', () => {
    for (let i = 0; i < 3; i++) {
      const s = zSpan(1 << i);
      assert.equal(s.z, LAYER_Z[i]);
      assert.equal(s.depth, LAYER_DEPTH);
    }
  });

  test('zSpan : plusieurs plans', () => {
    const all = zSpan(ALL);
    near(all.z, 0);
    near(all.depth, 2.8 + LAYER_DEPTH);
    const back = zSpan(0b110);
    near(back.z, -0.7);
    near(back.depth, 1.4 + LAYER_DEPTH);
  });
});

describe('scaleBoxUVs', () => {
  // Attribut UV factice : 6 faces x 4 sommets, UV de base (0..1)
  const fakeUV = () => {
    const base = [[0, 1], [1, 1], [0, 0], [1, 0]];
    const data = Array.from({ length: 24 }, (_, i) => [...base[i % 4]]);
    return { data, getX: (i) => data[i][0], getY: (i) => data[i][1], setXY: (i, x, y) => { data[i] = [x, y]; } };
  };

  test('chaque face reçoit ses dimensions réelles / scale', () => {
    const uv = scaleBoxUVs(fakeUV(), 4, 2, 1, 2);
    const maxOf = (f) => [Math.max(...uv.data.slice(f * 4, f * 4 + 4).map((p) => p[0])), Math.max(...uv.data.slice(f * 4, f * 4 + 4).map((p) => p[1]))];
    assert.deepEqual(maxOf(0), [0.5, 1]); // +x : d x h
    assert.deepEqual(maxOf(1), [0.5, 1]); // -x
    assert.deepEqual(maxOf(2), [2, 0.5]); // +y : w x d
    assert.deepEqual(maxOf(3), [2, 0.5]); // -y
    assert.deepEqual(maxOf(4), [2, 1]); // +z : w x h
    assert.deepEqual(maxOf(5), [2, 1]); // -z
  });
});

describe('repères', () => {
  test('toLocal / toWorld sont inverses', () => {
    const o = obj(3, -2, 0.7);
    for (const p of [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: -3.2, y: 7.5 }]) {
      const back = toWorld(o, toLocal(o, p));
      near(back.x, p.x);
      near(back.y, p.y);
    }
  });

  test('toLocal tient compte de la rotation', () => {
    const l = toLocal(obj(1, 1, Math.PI / 2), { x: 1, y: 2 });
    near(l.x, 1);
    near(l.y, 0);
  });
});

describe('overlapsObject', () => {
  const box = (x, y, w, h, angle = 0) => obj(x, y, angle, { kind: 'box', w, h });
  const ball = (x, y, r) => obj(x, y, 0, { kind: 'ball', r });

  test('boîte alignée', () => {
    assert.equal(overlapsObject(box(0, 0, 2, 2), 0, 0, 0.5, 0.5), true);
    assert.equal(overlapsObject(box(0, 0, 2, 2), 1.4, 0, 0.5, 0.5), true);
    assert.equal(overlapsObject(box(0, 0, 2, 2), 1.6, 0, 0.5, 0.5), false);
    assert.equal(overlapsObject(box(0, 0, 2, 2), 0, -1.6, 0.5, 0.5), false);
  });

  test('boîte penchée (SAT)', () => {
    // Carré de côté 2 tourné de 45° : demi-diagonale ≈ 1.414
    const diamond = box(0, 0, 2, 2, Math.PI / 4);
    assert.equal(overlapsObject(diamond, 1.8, 0, 0.5, 0.5), true); // 1.8 - 0.5 < 1.414
    assert.equal(overlapsObject(diamond, 2.0, 0, 0.5, 0.5), false);
    // coin de la boîte du joueur près du bord incliné : pas de contact alors que les AABB se touchent
    assert.equal(overlapsObject(diamond, 1.2, 1.2, 0.3, 0.3), false);
  });

  test('balle', () => {
    assert.equal(overlapsObject(ball(0, 0, 1), 1.4, 0, 0.5, 0.5), true);
    assert.equal(overlapsObject(ball(0, 0, 1), 1.6, 0, 0.5, 0.5), false);
    // près du coin de la boîte : distance au coin, pas à l'AABB
    assert.equal(overlapsObject(ball(0, 0, 1), 1.3, 1.3, 0.5, 0.5), false);
  });
});

describe('score', () => {
  test('nextCombo : +1 dans la fenêtre, remis à 0 sinon', () => {
    assert.equal(nextCombo(0, 10, -10), 0);
    assert.equal(nextCombo(0, 10.5, 10), 1);
    assert.equal(nextCombo(4, 10.69, 10), 5);
    assert.equal(nextCombo(4, 10.75, 10), 0);
  });

  test('bubblePoints : multiplicateur tous les 3 combos, plafonné à x5', () => {
    assert.deepEqual(bubblePoints(false, 0), { points: 10, mult: 1 });
    assert.deepEqual(bubblePoints(false, 2), { points: 10, mult: 1 });
    assert.deepEqual(bubblePoints(false, 3), { points: 20, mult: 2 });
    assert.deepEqual(bubblePoints(true, 6), { points: 150, mult: 3 });
    assert.deepEqual(bubblePoints(false, 12), { points: 50, mult: 5 });
    assert.deepEqual(bubblePoints(true, 99), { points: 250, mult: 5 });
  });

  test('bubbleReached : ellipse, plus large pour les grosses bulles', () => {
    assert.equal(bubbleReached(0, 0, false, 0, 0), true);
    assert.equal(bubbleReached(0, 0, false, 0.79, 0), true);
    assert.equal(bubbleReached(0, 0, false, 0.81, 0), false);
    assert.equal(bubbleReached(0, 0, false, 0, 1.0), true);
    assert.equal(bubbleReached(0, 0, true, 1.0, 0), true);
    assert.equal(bubbleReached(0, 0, true, 1.05, 0), false);
  });
});

describe('checkpoints', () => {
  const cps = () => [0, 36.5, 81].map((x) => ({ x, y: 1, active: x === 0 }));

  // Simule la boucle de gameplayStep sur une position donnée.
  const step = (list, pos, respawn) => {
    let activations = 0;
    for (const cp of list) {
      if (checkpointReached(cp, pos, respawn.x)) {
        list.forEach((c) => { c.active = false; });
        cp.active = true;
        respawn.x = cp.x;
        activations++;
      }
    }
    return activations;
  };

  test('s\'active en le dépassant, pas avant', () => {
    const list = cps();
    const respawn = { x: 0 };
    assert.equal(step(list, { x: 30, y: 0.8 }, respawn), 0);
    assert.equal(step(list, { x: 36.2, y: 0.8 }, respawn), 1);
    assert.equal(respawn.x, 36.5);
  });

  test('régression : un checkpoint dépassé ne se réactive pas en boucle', () => {
    const list = cps();
    const respawn = { x: 0 };
    step(list, { x: 37, y: 0.8 }, respawn);
    // Avant correctif : à chaque pas, le checkpoint 0 (inactif, derrière) se réactivait, puis le 1.
    for (let i = 0; i < 10; i++) assert.equal(step(list, { x: 37 + i * 0.1, y: 0.8 }, respawn), 0);
    assert.equal(respawn.x, 36.5);
    assert.deepEqual(list.map((c) => c.active), [false, true, false]);
  });

  test('ignoré si le joueur est trop haut ou trop bas', () => {
    assert.equal(checkpointReached({ x: 10, y: 1, active: false }, { x: 11, y: 8 }, 0), false);
  });
});
