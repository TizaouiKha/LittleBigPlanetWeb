// Mode création façon « Popit » : on met le jeu en pause et on construit le niveau à la souris.
// L'éditeur ne manipule que les données du niveau (LevelBuilder) ; main.js lui donne la caméra
// et quelques fonctions (rejouer, toast, sons) via des hooks.
import * as THREE from 'three';
import { LAYER_Z, ALL, clamp, zSpan as zSpanMask } from './utils.js';
import { parseLevel, blankLevel, translateItem, serializeLevel } from './levelFormat.js';
import { triangleGeometry } from './levelBuilder.js';

const MATERIALS = [
  { id: 'cardboard', label: 'Carton' },
  { id: 'wood', label: 'Bois' },
  { id: 'metal', label: 'Métal' },
  { id: 'sponge', label: 'Éponge' },
  { id: 'glass', label: 'Verre' },
];
const BRUSHES = [
  { id: 'square', label: 'Carré', group: 'shape' },
  { id: 'rect', label: 'Rectangle', group: 'shape' },
  { id: 'circle', label: 'Cercle', group: 'shape' },
  { id: 'tri', label: 'Triangle', group: 'shape' },
  { id: 'bubble', label: 'Bulle', group: 'object' },
  { id: 'bigbubble', label: 'Grosse bulle', group: 'object' },
  { id: 'checkpoint', label: 'Checkpoint', group: 'object' },
  { id: 'finish', label: 'Arrivée', group: 'object' },
];
const TOOLS = [
  { id: 'place', label: 'Placer', key: 'P', color: '#5fb85a' },
  { id: 'move', label: 'Déplacer', key: 'G', color: '#4d8ad6' },
  { id: 'delete', label: 'Supprimer', key: 'X', color: '#e2574c' },
  { id: 'duplicate', label: 'Dupliquer', key: 'C', color: '#f2c94c' },
];
const LAYERS = [
  { id: 0, label: 'Devant', key: '1' },
  { id: 1, label: 'Milieu', key: '2' },
  { id: 2, label: 'Fond', key: '3' },
  { id: 'all', label: 'Les 3', key: '4' },
];
const GLASS_COLOR = 0xbfe6f7;
const STORE = 'lbw-levels';
const DRAFT = 'lbw-editor-draft';
const SNAP = 0.25;
const ROT_STEP = Math.PI / 12; // 15°
const MIN_SIZE = 0.25, MAX_SIZE = 8;

const snap = (v) => Math.round(v / SNAP) * SNAP;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const zSpan = (layer) => zSpanMask(layer === 'all' ? ALL : 1 << layer);

function setData(item, data) {
  for (const k of Object.keys(item)) delete item[k];
  Object.assign(item, clone(data));
}

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export class Editor {
  // opts : { builder, mats, scene, camera, renderer, player, level1, hooks: { restart, toast, sfx, exit } }
  constructor(opts) {
    Object.assign(this, opts);
    this.active = false;
    this.tool = 'place';
    this.brush = 'square';
    this.mat = 'cardboard';
    this.size = 1;
    this.angle = 0;
    this.layer = 1;
    this.dynamic = true;
    this.cam = { x: 0, y: 2, dist: 14.5 };
    this.held = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.hovered = null;
    this.drag = null;
    this.pan = null;
    this.hasMouse = false;
    this.ndc = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this.draftTimer = 0;

    this.helper = new THREE.Box3Helper(new THREE.Box3(), 0xffffff);
    this.helper.material.depthTest = false;
    this.helper.renderOrder = 10;
    this.helper.visible = false;
    this.scene.add(this.helper);
    this.ghost = null;
    this.ghostKey = '';

    this.buildUI();
    this.bindInput();
  }

  // ---------- Entrée / sortie du mode ----------

  enter() {
    if (this.active) return;
    this.active = true;
    const p = this.player.body.translation();
    this.cam.x = p.x;
    this.cam.y = Math.max(p.y, 0.8) + 1.4;
    this.layer = this.player.layer;
    document.body.classList.add('editing');
    this.ui.classList.remove('hidden');
    this.syncUI();
    this.hooks.toast('Mode création', 900);
  }

  exit() {
    if (!this.active) return;
    this.endDrag();
    this.pan = null;
    this.active = false;
    this.held.clear();
    this.hovered = null;
    this.helper.visible = false;
    if (this.ui.contains(document.activeElement)) document.activeElement.blur();
    if (this.ghost) this.ghost.visible = false;
    document.body.classList.remove('editing');
    this.ui.classList.add('hidden');
    this.saveDraft();
  }

  // ---------- Interface ----------

  buildUI() {
    const swatch = (id) => {
      if (id === 'glass') return 'linear-gradient(135deg, #eaf8ff 0%, #bfe6f7 45%, #ffffff 55%, #a9d8ee 100%)';
      try { return `url(${this.mats[id].material.map.image.toDataURL()}) center / 160%`; } catch { return '#c4925a'; }
    };
    const ui = document.createElement('div');
    ui.id = 'editor';
    ui.className = 'hidden';
    ui.innerHTML = `
      <div id="ed-tools" class="panel ed-panel">
        <div class="ed-logo">Popit</div>
        ${TOOLS.map((t) => `<button class="ed-tool" data-tool="${t.id}" style="--c:${t.color}" title="${t.label} (${t.key})">
          <span class="ed-dot"></span>${t.label}<kbd>${t.key}</kbd></button>`).join('')}
        <div class="ed-row">
          <button data-act="undo" title="Annuler (Ctrl+Z)">↶ Annuler</button>
          <button data-act="redo" title="Rétablir (Ctrl+Y)">↷</button>
        </div>
        <button class="ed-big" data-act="play" title="Retour au jeu (Tab)">▶ Jouer <kbd>Tab</kbd></button>
        <button data-act="restart" title="Réinitialise tous les objets et le joueur">⟲ Rejouer depuis le début</button>
      </div>

      <div id="ed-file" class="panel ed-panel">
        <label class="ed-label">Niveau</label>
        <input id="ed-name" maxlength="40" spellcheck="false">
        <button data-act="save" title="Sauver dans le navigateur (Ctrl+S)">Sauver</button>
        <select id="ed-slots" title="Niveaux sauvés dans ce navigateur"></select>
        <div class="ed-row">
          <button data-act="load">Charger</button>
          <button data-act="forget" title="Effacer cette sauvegarde">✕</button>
        </div>
        <div class="ed-row">
          <button data-act="export" title="Télécharger un fichier .json">Exporter</button>
          <button data-act="import" title="Ouvrir un fichier .json">Importer</button>
          <input id="ed-file-input" type="file" accept=".json,application/json" hidden>
        </div>
        <div class="ed-row">
          <button data-act="new">Nouveau</button>
          <button data-act="level1">Niveau 1</button>
        </div>
      </div>

      <div id="ed-palette" class="panel ed-panel">
        <section><h3>Matériau <kbd>M</kbd></h3><div class="ed-grid">
          ${MATERIALS.map((m) => `<button class="ed-mat" data-mat="${m.id}" title="${m.label}">
            <span class="ed-swatch" style="background:${swatch(m.id)}"></span>${m.label}</button>`).join('')}
        </div></section>
        <section><h3>Forme <kbd>N</kbd></h3><div class="ed-grid">
          ${BRUSHES.filter((b) => b.group === 'shape').map((b) => `<button class="ed-brush" data-brush="${b.id}" title="${b.label}">
            <span class="ed-shape ed-${b.id}"></span>${b.label}</button>`).join('')}
        </div></section>
        <section><h3>Objets</h3><div class="ed-grid">
          ${BRUSHES.filter((b) => b.group === 'object').map((b) => `<button class="ed-brush" data-brush="${b.id}" title="${b.label}">
            <span class="ed-shape ed-${b.id}"></span>${b.label}</button>`).join('')}
        </div></section>
        <section><h3>Plan</h3><div class="ed-grid">
          ${LAYERS.map((l) => `<button class="ed-layer" data-layer="${l.id}">${l.label}<kbd>${l.key}</kbd></button>`).join('')}
        </div></section>
        <section><h3>Réglages</h3><div class="ed-grid ed-col">
          <button data-act="dynamic" id="ed-dyn" title="Statique ou dynamique (T)"></button>
          <button data-act="playerlayer" title="Utiliser le plan où se trouve le joueur">Plan du joueur<kbd>0</kbd></button>
        </div></section>
        <section><div class="ed-readout" id="ed-readout"></div></section>
      </div>

      <div id="ed-help" class="panel">
        <b>Clic</b> outil · <b>Molette</b> taille · <b>R/F</b> ou <b>Shift+molette</b> rotation ·
        <b>Ctrl+molette</b> zoom · <b>ZQSD/flèches</b> ou <b>clic droit</b> glisser la vue ·
        <b>Suppr</b> effacer · <b>T</b> fixe/dynamique · <b>Ctrl+Z</b> annuler · <b>Tab</b> jouer
      </div>
      <div id="popit-cursor"></div>`;
    document.body.appendChild(ui);
    this.ui = ui;
    this.cursorEl = ui.querySelector('#popit-cursor');
    this.nameEl = ui.querySelector('#ed-name');
    this.slotsEl = ui.querySelector('#ed-slots');
    this.fileEl = ui.querySelector('#ed-file-input');
    this.nameEl.value = this.builder.name;

    ui.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      else if (b.dataset.mat) { this.mat = b.dataset.mat; if (BRUSHES.find((x) => x.id === this.brush).group !== 'shape') this.brush = 'square'; this.setTool('place'); }
      else if (b.dataset.brush) { this.brush = b.dataset.brush; this.setTool('place'); }
      else if (b.dataset.layer) this.layer = b.dataset.layer === 'all' ? 'all' : Number(b.dataset.layer);
      else if (b.dataset.act) this.action(b.dataset.act);
      b.blur();
      this.syncUI();
    });
    // Les clics sur l'interface ne doivent pas déclencher d'outil sur le canvas
    ui.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.fileEl.addEventListener('change', async () => {
      const f = this.fileEl.files[0];
      this.fileEl.value = '';
      if (!f) return;
      try {
        this.loadLevel(parseLevel(await f.text()));
      } catch (err) {
        this.hooks.toast(err.message, 2200);
        this.hooks.sfx.nope();
      }
    });
    this.refreshSlots();
  }

  syncUI() {
    const q = (s) => this.ui.querySelectorAll(s);
    q('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.tool));
    q('[data-mat]').forEach((b) => b.classList.toggle('on', b.dataset.mat === this.mat));
    q('[data-brush]').forEach((b) => b.classList.toggle('on', b.dataset.brush === this.brush));
    q('[data-layer]').forEach((b) => b.classList.toggle('on', String(this.layer) === b.dataset.layer));
    const dyn = this.ui.querySelector('#ed-dyn');
    dyn.textContent = this.dynamic ? 'Dynamique' : 'Fixe (statique)';
    dyn.classList.toggle('on', this.dynamic);
    this.ui.querySelector('#ed-readout').innerHTML =
      `Taille <b>${this.size.toFixed(2)}</b><br>Rotation <b>${Math.round((this.angle * 180) / Math.PI)}°</b>`;
    this.ui.querySelector('[data-act="undo"]').disabled = !this.undoStack.length;
    this.ui.querySelector('[data-act="redo"]').disabled = !this.redoStack.length;
    const t = TOOLS.find((x) => x.id === this.tool);
    this.cursorEl.style.setProperty('--c', t.color);
  }

  setTool(t) {
    this.endDrag();
    this.tool = t;
    this.syncUI();
  }

  refreshSlots() {
    const store = readStore();
    let draft = null;
    try { draft = localStorage.getItem(DRAFT); } catch { /* stockage indisponible : on ignore */ }
    const names = Object.keys(store).sort((a, b) => (store[b].savedAt ?? 0) - (store[a].savedAt ?? 0));
    this.slotsEl.innerHTML =
      (names.length || draft ? '' : '<option value="">(aucune sauvegarde)</option>') +
      names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
      (draft ? '<option value="__draft__">Brouillon automatique</option>' : '');
  }

  action(act) {
    const { toast, sfx } = this.hooks;
    switch (act) {
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'play': this.hooks.exit(); break;
      case 'restart': this.hooks.restart(); this.hooks.exit(); break;
      case 'dynamic': this.dynamic = !this.dynamic; break;
      case 'playerlayer': this.layer = this.player.layer; break;
      case 'save': this.save(); break;
      case 'load': {
        const key = this.slotsEl.value;
        if (!key) { sfx.nope(); break; }
        try {
          const raw = key === '__draft__' ? localStorage.getItem(DRAFT) : readStore()[key]?.data;
          this.loadLevel(parseLevel(raw));
        } catch (err) { toast(err.message, 2200); sfx.nope(); }
        break;
      }
      case 'forget': {
        const key = this.slotsEl.value;
        if (!key) break;
        if (key === '__draft__') { try { localStorage.removeItem(DRAFT); } catch { /* stockage indisponible : on ignore */ } } else {
          const store = readStore();
          delete store[key];
          writeStore(STORE, store);
        }
        this.refreshSlots();
        toast('Sauvegarde effacée', 1000);
        break;
      }
      case 'export': this.exportFile(); break;
      case 'import': this.fileEl.click(); break;
      case 'new': this.loadLevel(parseLevel(blankLevel())); break;
      case 'level1': this.loadLevel(parseLevel(this.level1)); break;
    }
    this.syncUI();
  }

  currentName() {
    const n = this.nameEl.value.trim() || 'Mon niveau';
    this.builder.name = n;
    return n;
  }

  save() {
    const name = this.currentName();
    const store = readStore();
    store[name] = { savedAt: Date.now(), data: this.builder.toJSON() };
    if (writeStore(STORE, store)) {
      this.hooks.toast('Niveau sauvé !', 1100);
      this.hooks.sfx.checkpoint();
    } else {
      this.hooks.toast('Sauvegarde impossible', 1600);
    }
    this.refreshSlots();
    this.slotsEl.value = name;
  }

  exportFile() {
    const name = this.currentName();
    const blob = new Blob([serializeLevel(this.builder.toJSON())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w\-àâäéèêëîïôöùûüç ]+/gi, '_').trim() || 'niveau'}.lbw.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.hooks.toast('Niveau exporté', 1000);
  }

  // Charge un niveau ({ level, skipped } renvoyé par parseLevel) et repart de son début.
  loadLevel({ level, skipped }) {
    this.endDrag();
    this.hovered = null;
    this.builder.load(level);
    this.undoStack = [];
    this.redoStack = [];
    this.nameEl.value = level.name;
    this.hooks.restart();
    const p = this.player.body.translation();
    this.cam.x = p.x;
    this.cam.y = p.y + 1.4;
    this.hooks.toast(skipped ? `Chargé (${skipped} objet(s) ignoré(s))` : `« ${level.name} »`, 1400);
    this.saveDraft();
    this.syncUI();
  }

  saveDraft() {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      try { localStorage.setItem(DRAFT, JSON.stringify(this.builder.toJSON())); } catch { /* stockage indisponible : on ignore */ }
      this.refreshSlots();
    }, 400);
  }

  // ---------- Annuler / rétablir ----------

  commit(op) {
    this.undoStack.push(op);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.saveDraft();
    this.syncUI();
  }

  applyOp(op, undo) {
    const b = this.builder;
    if (op.type === 'add') undo ? b.remove(op.item) : b.add(op.item, op.index);
    else if (op.type === 'remove') undo ? b.add(op.item, op.index) : b.remove(op.item);
    else if (op.type === 'modify') { setData(op.item, undo ? op.before : op.after); b.update(op.item); }
    this.hovered = null;
  }

  undo() {
    this.endDrag();
    const op = this.undoStack.pop();
    if (!op) { this.hooks.sfx.nope(); return; }
    this.applyOp(op, true);
    this.redoStack.push(op);
    this.hooks.sfx.release();
    this.saveDraft();
    this.syncUI();
  }

  redo() {
    this.endDrag();
    const op = this.redoStack.pop();
    if (!op) { this.hooks.sfx.nope(); return; }
    this.applyOp(op, false);
    this.undoStack.push(op);
    this.hooks.sfx.grab();
    this.saveDraft();
    this.syncUI();
  }

  // ---------- Objets ----------

  makeItem(x, y) {
    x = r3(snap(x));
    y = r3(snap(y));
    const s = this.size, a = r3(this.angle), layer = this.layer;
    const phys = { layer, mat: this.mat, type: this.dynamic ? 'dynamic' : 'fixed' };
    switch (this.brush) {
      case 'square': return { t: 'box', x, y, w: s, h: s, angle: a, ...phys };
      case 'rect': return { t: 'box', x, y, w: r3(s * 2), h: r3(s / 2), angle: a, ...phys };
      case 'circle': return { t: 'ball', x, y, r: r3(s / 2), ...phys };
      case 'tri': return { t: 'tri', x, y, w: s, h: s, angle: a, ...phys };
      case 'bubble': return { t: 'bubble', x, y, layer: layer === 'all' ? 1 : layer, big: false };
      case 'bigbubble': return { t: 'bubble', x, y, layer: layer === 'all' ? 1 : layer, big: true };
      case 'checkpoint': return { t: 'checkpoint', x, y };
      case 'finish': return { t: 'finish', x };
    }
    return null;
  }

  // Position actuelle (après physique) d'un objet dynamique recopiée dans ses données.
  capturePose(item) {
    const o = this.builder.mainObject(item);
    if (!o || o.type !== 'dynamic') return;
    const t = o.body.translation();
    item.x = r3(t.x);
    item.y = r3(t.y);
    if (item.t !== 'ball') item.angle = r3(o.body.rotation());
  }

  place(p) {
    const item = this.makeItem(p.x, p.y);
    if (!item) return;
    this.builder.add(item);
    this.commit({ type: 'add', item, index: this.builder.items.indexOf(item) });
    this.hooks.sfx.pop(0.8 + Math.random() * 0.3);
  }

  remove(item) {
    const before = clone(item);
    const index = this.builder.remove(item);
    if (index < 0) return;
    setData(item, before);
    this.commit({ type: 'remove', item, index });
    this.hovered = null;
    this.hooks.sfx.poof();
  }

  startDrag(item, point, isNew = false) {
    const before = clone(item);
    this.capturePose(item);
    this.builder.update(item);
    this.drag = { item, before, base: clone(item), start: point, z: point.z, dx: 0, dy: 0, isNew, changed: isNew };
    this.hooks.sfx.grab();
  }

  duplicate(item, point) {
    const copy = clone(item);
    const o = this.builder.mainObject(item);
    if (o && o.type === 'dynamic') {
      const t = o.body.translation();
      copy.x = r3(t.x); copy.y = r3(t.y);
      if (copy.t !== 'ball') copy.angle = r3(o.body.rotation());
    }
    translateItem(copy, 1, 0);
    this.builder.add(copy);
    this.startDrag(copy, { x: point.x + 1, y: point.y, z: point.z }, true);
  }

  dragTo(p) {
    const d = this.drag;
    const dx = snap(p.x - d.start.x), dy = snap(p.y - d.start.y);
    if (dx === d.dx && dy === d.dy) return;
    d.dx = dx;
    d.dy = dy;
    this.reshapeDragged();
  }

  // Reconstruit l'objet glissé à partir de sa base + déplacement courant.
  reshapeDragged() {
    const d = this.drag;
    const data = clone(d.base);
    translateItem(data, d.dx, d.dy);
    for (const k of ['x', 'y', 'x0', 'x1', 'top', 'ax', 'ay']) if (typeof data[k] === 'number') data[k] = r3(data[k]);
    setData(d.item, data);
    this.builder.update(d.item);
    d.changed = true;
  }

  endDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.isNew) this.commit({ type: 'add', item: d.item, index: this.builder.items.indexOf(d.item) });
    else if (d.changed) this.commit({ type: 'modify', item: d.item, before: d.before, after: clone(d.item) });
    this.hooks.sfx.release();
  }

  rotate(dir) {
    const step = dir * ROT_STEP;
    const d = this.drag;
    if (d) {
      if (!('angle' in d.base) && !['box', 'tri'].includes(d.base.t)) return;
      d.base.angle = r3(((d.base.angle ?? 0) + step) % (Math.PI * 2));
      this.reshapeDragged();
    } else {
      this.angle = r3(((this.angle + step) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
      this.syncUI();
    }
  }

  resize(dir) {
    const d = this.drag;
    if (d) {
      const f = dir > 0 ? 1.1 : 1 / 1.1;
      const b = d.base;
      if (b.t === 'box' || b.t === 'tri') {
        b.w = r3(clamp(b.w * f, 0.2, 40));
        b.h = r3(clamp(b.h * f, 0.2, 40));
      } else if (b.t === 'ball') {
        b.r = r3(clamp(b.r * f, 0.1, 20));
      } else return;
      this.reshapeDragged();
    } else {
      const step = this.size >= 2 ? 0.5 : 0.25;
      this.size = clamp(this.size + dir * step, MIN_SIZE, MAX_SIZE);
      this.syncUI();
    }
  }

  // ---------- Entrées ----------

  bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    el.addEventListener('pointerleave', () => { this.hasMouse = false; this.cursorEl.style.opacity = '0'; });
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
  }

  setMouse(e) {
    this.hasMouse = true;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.cursorEl.style.opacity = '1';
    this.cursorEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  }

  // Point du monde sous la souris, sur le plan z donné.
  worldAt(z) {
    this.ray.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.ray.ray;
    const t = (z - origin.z) / direction.z;
    return { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z };
  }

  layerZ() {
    return this.layer === 'all' ? 0 : LAYER_Z[this.layer];
  }

  pick() {
    this.ray.setFromCamera(this.ndc, this.camera);
    const roots = [];
    for (const it of this.builder.items) if (it.t !== 'backdrop') roots.push(...this.builder.nodesOf(it));
    const hits = this.ray.intersectObjects(roots, true);
    for (const h of hits) {
      let o = h.object, visible = true;
      while (o) { if (!o.visible) { visible = false; break; } o = o.parent; }
      if (!visible) continue;
      const item = this.builder.itemOf(h.object);
      if (item) return { item, point: h.point };
    }
    return null;
  }

  onPointerDown(e) {
    if (!this.active) return;
    this.setMouse(e);
    e.preventDefault();
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    if (e.button === 2 || e.button === 1) {
      this.pan = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y };
      return;
    }
    if (e.button !== 0) return;
    if (this.tool === 'place') {
      this.place(this.worldAt(this.layerZ()));
      return;
    }
    const hit = this.pick();
    if (!hit) { this.hooks.sfx.nope(); return; }
    if (this.tool === 'delete') this.remove(hit.item);
    else if (this.tool === 'move') this.startDrag(hit.item, hit.point);
    else if (this.tool === 'duplicate') this.duplicate(hit.item, hit.point);
    this.syncUI();
  }

  onPointerMove(e) {
    if (!this.active) return;
    this.setMouse(e);
    if (this.pan) {
      const k = (2 * this.cam.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / innerHeight;
      this.cam.x = this.pan.cx - (e.clientX - this.pan.sx) * k;
      this.cam.y = this.pan.cy + (e.clientY - this.pan.sy) * k;
    }
  }

  onPointerUp(e) {
    if (!this.active) return;
    if (e.button === 2 || e.button === 1) { this.pan = null; return; }
    if (e.button === 0) { this.endDrag(); this.syncUI(); }
  }

  onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    const dir = -Math.sign(e.deltaY || e.deltaX);
    if (!dir) return;
    if (e.ctrlKey) this.cam.dist = clamp(this.cam.dist * (dir > 0 ? 0.9 : 1.1), 7, 45);
    else if (e.shiftKey || e.altKey) this.rotate(dir);
    else this.resize(dir);
  }

  // Appelé par main.js pour chaque touche en mode création (Tab est géré par main.js).
  onKeyDown(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.code === 'Enter' || e.code === 'Escape') e.target.blur();
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
    this.held.add(e.code);
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
      else if (k === 's') { e.preventDefault(); this.save(); }
      return;
    }
    if (e.repeat && !['r', 'f'].includes(k)) return;
    switch (e.code) {
      case 'Digit1': this.layer = 0; break;
      case 'Digit2': this.layer = 1; break;
      case 'Digit3': this.layer = 2; break;
      case 'Digit4': this.layer = 'all'; break;
      case 'Digit0': this.layer = this.player.layer; break;
      case 'Delete': case 'Backspace': {
        const d = this.drag;
        this.drag = null;
        if (d?.isNew) { this.builder.remove(d.item); this.hooks.sfx.poof(); break; }
        if (d) { setData(d.item, d.before); this.builder.update(d.item); }
        const it = d?.item ?? this.hoverItem();
        if (it) this.remove(it); else this.hooks.sfx.nope();
        break;
      }
      case 'Escape': this.endDrag(); this.setTool('place'); break;
    }
    switch (k) {
      case 'p': this.setTool('place'); break;
      case 'g': this.setTool('move'); break;
      case 'x': this.setTool('delete'); break;
      case 'c': this.setTool('duplicate'); break;
      case 'r': this.rotate(1); break;
      case 'f': this.rotate(-1); break;
      case 't': this.dynamic = !this.dynamic; break;
      case 'm': {
        const i = MATERIALS.findIndex((m) => m.id === this.mat);
        this.mat = MATERIALS[(i + 1) % MATERIALS.length].id;
        if (BRUSHES.find((b) => b.id === this.brush).group !== 'shape') this.brush = 'square';
        this.setTool('place');
        break;
      }
      case 'n': {
        const shapes = BRUSHES.filter((b) => b.group === 'shape');
        const i = shapes.findIndex((b) => b.id === this.brush);
        this.brush = shapes[(i + 1) % shapes.length].id;
        this.setTool('place');
        break;
      }
    }
    this.syncUI();
  }

  hoverItem() {
    if (!this.hasMouse) return null;
    return this.pick()?.item ?? null;
  }

  // ---------- Mise à jour (chaque image, physique en pause) ----------

  update(dt) {
    // Vue : ZQSD / flèches / stick gauche
    let vx = 0, vy = 0;
    const h = this.held;
    if (!h.has('ControlLeft') && !h.has('ControlRight')) {
      if (h.has('KeyA') || h.has('ArrowLeft')) vx -= 1;
      if (h.has('KeyD') || h.has('ArrowRight')) vx += 1;
      if (h.has('KeyW') || h.has('ArrowUp')) vy += 1;
      if (h.has('KeyS') || h.has('ArrowDown')) vy -= 1;
    }
    const gp = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
    if (gp) {
      if (Math.abs(gp.axes[0] ?? 0) > 0.25) vx = gp.axes[0];
      if (Math.abs(gp.axes[1] ?? 0) > 0.25) vy = -gp.axes[1];
    }
    const speed = this.cam.dist * 0.9;
    this.cam.x += vx * speed * dt;
    this.cam.y = clamp(this.cam.y + vy * speed * dt, -10, 60);
    this.camera.position.set(this.cam.x, this.cam.y + 1.3 * (this.cam.dist / 14.5), this.cam.dist);
    this.camera.lookAt(this.cam.x, this.cam.y, 0);
    this.camera.updateMatrixWorld();

    if (this.drag && this.hasMouse) this.dragTo(this.worldAt(this.drag.z));

    // Survol
    let hov = null;
    if (this.hasMouse && !this.pan && this.tool !== 'place') hov = this.drag?.item ?? this.pick()?.item ?? null;
    this.hovered = hov;
    if (hov) {
      const box = this.helper.box.makeEmpty();
      for (const n of this.builder.nodesOf(hov)) box.expandByObject(n);
      const color = this.tool === 'delete' ? 0xe2574c : this.tool === 'duplicate' ? 0xf2c94c : 0x4d8ad6;
      this.helper.material.color.setHex(color);
      this.helper.visible = !box.isEmpty();
    } else this.helper.visible = false;

    this.updateGhost();
  }

  ghostSpec() {
    const it = this.makeItem(0, 0);
    return { it, key: JSON.stringify(it) };
  }

  updateGhost() {
    const show = this.active && this.tool === 'place' && this.hasMouse && !this.pan;
    if (!show) { if (this.ghost) this.ghost.visible = false; return; }
    const { it, key } = this.ghostSpec();
    if (key !== this.ghostKey) {
      this.disposeGhost();
      this.ghost = this.makeGhost(it);
      this.ghostKey = key;
      this.scene.add(this.ghost);
    }
    const p = this.worldAt(this.layerZ());
    const x = snap(p.x), y = snap(p.y);
    const g = this.ghost;
    g.visible = true;
    if (it.t === 'checkpoint') g.position.set(x, y, -2.4);
    else if (it.t === 'finish') g.position.set(x, 0, -2.4);
    else if (it.t === 'bubble') g.position.set(x, y, LAYER_Z[it.layer]);
    else g.position.set(x, y, zSpan(it.layer).z);
  }

  disposeGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    this.ghost.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.ghost = null;
  }

  makeGhost(it) {
    const g = new THREE.Group();
    const m = this.mats[it.mat];
    const fill = new THREE.MeshBasicMaterial({
      color: it.mat === 'glass' ? GLASS_COLOR : 0xffffff,
      map: it.mat && it.mat !== 'glass' ? m?.material.map ?? null : null,
      transparent: true, opacity: 0.55, depthWrite: false,
    });
    const add = (geo, x = 0, y = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, fill.clone());
      mesh.position.set(x, y, 0);
      mesh.rotation.z = rz;
      mesh.renderOrder = 5;
      g.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.12, gapSize: 0.08, depthTest: false, transparent: true }),
      );
      edges.computeLineDistances();
      edges.position.copy(mesh.position);
      edges.rotation.z = rz;
      edges.renderOrder = 6;
      g.add(edges);
    };
    const depth = it.layer !== undefined ? zSpan(it.layer).depth : 1;
    switch (it.t) {
      case 'box': add(new THREE.BoxGeometry(it.w, it.h, depth), 0, 0, it.angle); break;
      case 'tri': add(triangleGeometry(it.w, it.h, depth), 0, 0, it.angle); break;
      case 'ball': {
        const geo = new THREE.CylinderGeometry(it.r, it.r, depth * 0.85, 32);
        geo.rotateX(Math.PI / 2);
        add(geo);
        break;
      }
      case 'bubble': add(new THREE.SphereGeometry(0.34 * (it.big ? 1.7 : 1), 16, 12)); break;
      case 'checkpoint':
        add(new THREE.BoxGeometry(2.2, 0.4, 0.8), 0, 0.2);
        add(new THREE.TorusGeometry(0.95, 0.13, 8, 32), 0, 1.55);
        break;
      case 'finish':
        add(new THREE.BoxGeometry(0.35, 5.2, 0.35), -2.2, 2.6);
        add(new THREE.BoxGeometry(0.35, 5.2, 0.35), 2.2, 2.6);
        add(new THREE.BoxGeometry(5.2, 1.6, 0.15), 0, 4.9);
        break;
    }
    fill.dispose();
    return g;
  }
}
