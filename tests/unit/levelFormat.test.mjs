// Format de niveau JSON (mode création) : enregistrement, sérialisation, chargement, validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT, VERSION, recordLevel, parseLevel, serializeLevel, blankLevel, translateItem, ITEM_TYPES,
} from '../../public/js/levelFormat.js';

// Petit niveau écrit en code, comme buildLevel1.
function sampleBuild(L) {
  L.spawn = { x: 1, y: 2 };
  L.backdrop();
  L.ground(-5, 20);
  L.box({ x: 3, y: 0.5, w: 1, h: 1, layer: 1, mat: 'cardboard', type: 'dynamic' });
  L.ball({ x: 6, y: 1, r: 0.5, layer: 2, mat: 'metal' });
  L.mover({ x: 8, y: 0, w: 2, h: 0.4, layer: 0, mat: 'wood' }, { x: 10, y: 0 }, 4);
  L.seesaw(12, 1, 6, 1);
  L.pendulum(14, 8, 4, 1);
  L.bubbleLine(2, 4, 1, 1);
  L.checkpoint(0);
  L.sign(5, 'Bonjour\nle monde');
  L.finish(18);
}

const bubbleLine = function (x0, x1, y, layer = 1, step = 1) {
  for (let x = x0; x <= x1 + 1e-6; x += step) this.bubble(x, y, layer);
};

test('recordLevel transforme les appels Level en éléments', () => {
  const lvl = recordLevel(sampleBuild, 'Essai', { bubbleLine });
  assert.equal(lvl.format, FORMAT);
  assert.equal(lvl.version, VERSION);
  assert.deepEqual(lvl.spawn, { x: 1, y: 2 });
  const types = lvl.items.map((it) => it.t);
  assert.deepEqual(types, [
    'backdrop', 'ground', 'box', 'ball', 'mover', 'seesaw', 'pendulum',
    'bubble', 'bubble', 'bubble', 'checkpoint', 'sign', 'finish',
  ]);
  for (const t of types) assert.ok(ITEM_TYPES.includes(t));
  assert.deepEqual(lvl.items[4], {
    t: 'mover', o: { x: 8, y: 0, w: 2, h: 0.4, layer: 0, mat: 'wood' }, to: { x: 10, y: 0 }, period: 4, phase: 0,
  });
});

test('aller-retour JSON : serializeLevel puis parseLevel redonne le même niveau', () => {
  const lvl = recordLevel(sampleBuild, 'Essai', { bubbleLine });
  const { level, skipped } = parseLevel(serializeLevel(lvl));
  assert.equal(skipped, 0);
  assert.deepEqual(level, lvl);
});

test('parseLevel accepte aussi un objet et le copie (pas de partage de références)', () => {
  const lvl = blankLevel('Vierge');
  const { level } = parseLevel(lvl);
  level.items[1].x = 999;
  assert.notEqual(lvl.items[1].x, 999);
});

test('parseLevel refuse les fichiers étrangers, JSON cassés et versions futures', () => {
  assert.throws(() => parseLevel('{pas du json'), /JSON invalide/);
  assert.throws(() => parseLevel({ hello: 1 }), /pas un niveau/);
  assert.throws(() => parseLevel({ format: FORMAT, version: VERSION + 1, items: [] }), /trop récent/);
  assert.throws(() => parseLevel({ format: FORMAT, version: 0, items: [] }), /Version/);
});

test('parseLevel ignore les éléments invalides et borne les champs', () => {
  const { level, skipped } = parseLevel({
    format: FORMAT, version: 1, name: 'x'.repeat(200), spawn: { x: 'a' },
    items: [
      { t: 'box', x: 0, y: 0, w: 1, h: 1 },
      { t: 'box', x: 0, y: 0, w: -1, h: 1 }, // taille négative
      { t: 'ball', x: 0, y: 0 }, // rayon manquant
      { t: 'inconnu', x: 0 },
      { t: 'toString', x: 0 }, // pas un type (propriété héritée)
      { t: 'bubble', x: 1, y: 1, layer: 7 }, // plan inexistant
      { t: 'sign', x: 0, text: 'y'.repeat(300) },
      null,
    ],
  });
  assert.equal(skipped, 6);
  assert.equal(level.items.length, 2);
  assert.equal(level.items[1].text.length, 80);
  assert.equal(level.name.length, 60);
  assert.deepEqual(level.spawn, { x: 0, y: 0.8 });
});

test('translateItem déplace chaque type selon ses propres champs', () => {
  const lvl = recordLevel(sampleBuild, 'Essai', { bubbleLine });
  const byType = Object.fromEntries(lvl.items.map((it) => [it.t, it]));
  for (const it of Object.values(byType)) translateItem(it, 2, 1);
  assert.deepEqual([byType.ground.x0, byType.ground.x1, byType.ground.top], [-3, 22, 1]);
  assert.deepEqual([byType.box.x, byType.box.y], [5, 1.5]);
  assert.deepEqual([byType.mover.o.x, byType.mover.to.x, byType.mover.to.y], [10, 12, 1]);
  assert.deepEqual([byType.pendulum.ax, byType.pendulum.ay], [16, 9]);
  assert.equal(byType.finish.x, 20);
  assert.deepEqual(byType.backdrop, { t: 'backdrop' });
});
