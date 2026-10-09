// Co-op en ligne (jusqu'à 4 joueurs) par WebSocket, branché sur main.js par quelques hooks.
//
// Qui fait autorité sur quoi :
// - chaque client simule SON perso et envoie son état ~20 Hz ; les autres persos sont affichés
//   avec ~100 ms de retard (interpolation) et existent dans la physique locale sous forme de
//   capsules cinématiques : on peut se sauter dessus, se pousser et s'attraper (à sens unique :
//   on s'accroche à l'autre, sans le tirer).
// - l'hôte fait autorité sur les objets dynamiques : il diffuse ~15 Hz les objets éveillés
//   (+ tous les objets chaque seconde) ; les autres clients les simulent aussi mais les
//   ramènent en douceur vers l'état de l'hôte.
// - attraper un objet quand on n'est pas l'hôte : on en prend la propriété ("own") le temps de
//   la prise. On le simule localement et on diffuse sa position avec son propre état ; l'hôte
//   arrête de le diffuser et suit nos valeurs. Au lâcher ("unown"), l'hôte reprend la main.
// - bulles et checkpoints : le serveur garde l'état partagé (la première demande gagne).
import * as THREE from 'three';
import { Sackboy } from './character.js';
import { knitTexture } from './textures.js';
import { LAYER_Z, groupsFor } from './level.js';

const SEND_DT = 0.05;   // état du joueur : 20 Hz
const OBJ_DT = 1 / 15;  // objets (hôte) : 15 Hz
const FULL_DT = 1;      // instantané complet des objets, même endormis
const INTERP = 0.1;     // retard d'affichage des autres joueurs (s)
const SLOT_COSTUMES = [0, 2, 3, 1]; // une couleur par place : beige, bleu, vert, rouge

const r3 = (v) => Math.round(v * 1000) / 1000;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const nowS = () => performance.now() / 1000;

export class Net {
  // g = { RAPIER, world, scene, camera, level, player, sack, COSTUMES, EMOTES, hooks }
  // hooks = { start, release, toast, getScore, remoteCollect(i, by), setCheckpoint(i, by) }
  constructor(g) {
    Object.assign(this, g);
    this.ws = null;
    this.online = false;
    this.id = null;
    this.hostId = null;
    this.code = null;
    this.remotes = new Map();
    this.owned = new Map();   // index d'objet -> id du joueur (non-hôte) qui le tient
    this.targets = new Map(); // index d'objet -> transform reçu à suivre
    this.myOwn = -1;
    this.sendT = 0;
    this.objT = 0;
    this.fullT = 0;
    this.listT = 0;
    this.v = new THREE.Vector3();
    this.initUi();
    window.__lbwNet = this; // pratique pour déboguer depuis la console
  }

  get isHost() { return !this.online || this.id === this.hostId; }

  // ---------- Écran titre ----------

  initUi() {
    const $ = (id) => document.getElementById(id);
    const ui = this.ui = {
      name: $('net-name'), code: $('net-code'), status: $('net-status'),
      players: $('players'), feed: $('feed'), tags: $('tags'),
      buttons: [$('btn-solo'), $('btn-create'), $('btn-join')],
    };
    try { ui.name.value = localStorage.getItem('lbw-name') || ''; } catch {}
    const preset = new URLSearchParams(location.search).get('code');
    if (preset) ui.code.value = preset.toUpperCase().slice(0, 4);
    for (const b of ui.buttons) b.disabled = false;
    $('btn-solo').addEventListener('click', () => this.startGame());
    $('btn-create').addEventListener('click', () => this.connect({ t: 'create' }));
    $('btn-join').addEventListener('click', () => {
      const code = ui.code.value.trim().toUpperCase();
      if (code.length !== 4) return this.status('Entre le code à 4 lettres', true);
      this.connect({ t: 'join', code });
    });
    ui.code.addEventListener('input', () => { ui.code.value = ui.code.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    ui.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
    ui.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') ui.name.blur(); });
  }

  status(text, err = false) {
    this.ui.status.textContent = text;
    this.ui.status.classList.toggle('err', err);
  }

  startGame() {
    document.activeElement?.blur?.();
    this.hooks.start();
  }

  feed(text) {
    const el = document.createElement('div');
    el.textContent = text;
    this.ui.feed.appendChild(el);
    while (this.ui.feed.children.length > 5) this.ui.feed.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 4500);
    setTimeout(() => el.remove(), 5200);
  }

  // ---------- Connexion ----------

  connect(first) {
    if (this.ws) return;
    const name = this.ui.name.value.trim().slice(0, 16) || 'Sackboy';
    try { localStorage.setItem('lbw-name', name); } catch {}
    this.myName = name;
    this.lastErr = null;
    for (const b of this.ui.buttons) b.disabled = true;
    this.status('Connexion…');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ ...first, name }));
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.onMessage(m);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.online) return this.goOffline('Connexion au serveur perdue : tu continues en solo');
      for (const b of this.ui.buttons) b.disabled = false;
      this.status(this.lastErr || 'Serveur injoignable', true);
    };
  }

  send(m) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  goOffline(msg) {
    this.online = false;
    for (const r of [...this.remotes.values()]) this.removeRemote(r);
    this.owned.clear();
    this.targets.clear();
    this.myOwn = -1;
    this.ui.players.classList.add('hidden');
    this.myTag?.remove();
    this.myTag = null;
    this.feed(msg);
  }

  onMessage(m) {
    switch (m.t) {
      case 'error':
        this.lastErr = m.msg;
        this.ws?.close();
        break;
      case 'welcome': this.onWelcome(m); break;
      case 'join':
        this.addRemote(m.player);
        this.feed(`${m.player.name} a rejoint la partie`);
        this.fullT = 0; // l'hôte envoie tout de suite l'état complet des objets
        break;
      case 'leave': {
        const r = this.remotes.get(m.id);
        if (r) {
          this.feed(`${r.name} a quitté la partie`);
          this.removeRemote(r);
        }
        for (const [i, id] of this.owned) if (id === m.id) { this.owned.delete(i); this.targets.delete(i); }
        const wasHost = this.isHost;
        this.hostId = m.hostId;
        if (!wasHost && this.isHost) {
          this.targets.clear();
          this.myOwn = -1;
          this.fullT = 0;
          this.feed('Tu es maintenant l\'hôte de la partie');
        }
        break;
      }
      case 'p': this.onPlayerState(m); break;
      case 'o': this.onObjects(m); break;
      case 'own':
        this.owned.set(m.i, m.id);
        if (this.myOwn === m.i) this.myOwn = -1; // deux mains sur le même objet : le dernier gagne
        break;
      case 'unown':
        if (this.owned.get(m.i) === m.id) {
          this.owned.delete(m.i);
          if (this.isHost) this.targets.delete(m.i);
        }
        break;
      case 'b': this.hooks.remoteCollect(m.i, this.remotes.get(m.id)?.name); break;
      case 'cp': this.hooks.setCheckpoint(m.i, this.remotes.get(m.id)?.name ?? '?'); break;
    }
  }

  onWelcome(m) {
    this.online = true;
    this.id = m.id;
    this.hostId = m.hostId;
    this.code = m.code;
    this.slot = m.slot;
    const { player, sack, level } = this;
    player.costume = SLOT_COSTUMES[m.slot] ?? 0;
    sack.setColor(this.COSTUMES[player.costume]);
    // Chacun apparaît un peu décalé pour ne pas naître les uns dans les autres
    const sx = level.spawn.x + m.slot * 0.9, sy = level.spawn.y;
    player.body.setTranslation({ x: sx, y: sy }, true);
    player.prev = { x: sx, y: sy };
    for (const p of m.players) this.addRemote(p);
    for (const i of m.bubbles) this.hooks.remoteCollect(i, null);
    if (m.cp > 0) this.hooks.setCheckpoint(m.cp, null);
    this.myTag = this.makeTag(this.myName);
    this.ui.players.classList.remove('hidden');
    this.renderList();
    try { history.replaceState(null, '', `?code=${m.code}`); } catch {}
    this.startGame();
    this.feed(this.isHost ? `Partie créée ! Code : ${m.code}` : `Tu as rejoint la partie ${m.code}`);
  }

  // ---------- Autres joueurs ----------

  makeTag(name) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.textContent = name;
    this.ui.tags.appendChild(el);
    return el;
  }

  addRemote(p) {
    if (this.remotes.has(p.id)) return;
    const { RAPIER, world, level } = this;
    const costume = SLOT_COSTUMES[p.slot] ?? 0;
    const sack = new Sackboy(knitTexture());
    sack.setColor(this.COSTUMES[costume]);
    this.scene.add(sack.root);
    const x = level.spawn.x + p.slot * 0.9, y = level.spawn.y;
    sack.root.position.set(x, y, LAYER_Z[1]);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(x, y));
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.35, 0.42).setFriction(0.4).setCollisionGroups(groupsFor(1 << 1)),
      body,
    );
    this.remotes.set(p.id, {
      id: p.id, name: p.name, slot: p.slot, sack, body, collider,
      tag: this.makeTag(p.name), snaps: [], offset: null, last: null,
      layer: 1, z: LAYER_Z[1], costume, emote: 0, score: 0,
      // Cible "attrapable" au format des objets du niveau (voir tryGrab dans main.js)
      grab: { kind: 'box', w: 0.76, h: 1.54, grabbable: true, mask: 1 << 1, body, remote: true },
    });
    this.renderList();
  }

  removeRemote(r) {
    if (this.player.grabbed === r.grab) this.hooks.release();
    this.world.removeRigidBody(r.body);
    this.scene.remove(r.sack.root);
    r.tag.remove();
    this.remotes.delete(r.id);
    this.renderList();
  }

  onPlayerState(m) {
    const r = this.remotes.get(m.id);
    if (!r) return;
    // Horloge : on estime le décalage entre l'horloge de l'émetteur et la nôtre
    const est = nowS() - m.ts;
    r.offset = r.offset == null || est < r.offset ? est : r.offset + (est - r.offset) * 0.05;
    m.lt = m.ts + r.offset;
    r.snaps.push(m);
    if (r.snaps.length > 30) r.snaps.shift();
    r.last = m;
    if (m.h && this.owned.get(m.h[0]) === m.id) this.setTarget(m.h);
  }

  // Position d'un joueur distant à l'instant t (horloge locale), interpolée dans le buffer
  sample(r, t) {
    const s = r.snaps;
    if (t <= s[0].lt) return s[0];
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1], b = s[i];
      if (a.lt <= t && t <= b.lt) {
        const k = (t - a.lt) / Math.max(b.lt - a.lt, 1e-4);
        return { ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, vy: a.vy + (b.vy - a.vy) * k };
      }
    }
    const b = s[s.length - 1];
    const e = Math.min(t - b.lt, 0.15); // petite extrapolation si un paquet est en retard
    return { ...b, x: b.x + b.vx * e, y: b.y + b.vy * e };
  }

  // Pour tryGrab : on peut s'accrocher aux autres joueurs
  grabTargets() {
    if (!this.online) return [];
    return [...this.remotes.values()].map((r) => r.grab);
  }

  // ---------- Objets ----------

  setTarget(e) {
    const [i, x, y, a, vx, vy, w] = e;
    if (!this.level.objects[i]) return;
    this.targets.set(i, { x, y, a, vx, vy, w, recv: nowS() });
  }

  onObjects(m) {
    if (this.isHost) return;
    if (Math.abs(this.level.time - m.time) > 0.12) this.level.time = m.time; // plates-formes en phase
    for (const e of m.o) {
      if (e[0] === this.myOwn || this.owned.has(e[0])) continue;
      this.setTarget(e);
    }
  }

  bubble(i) { if (this.online) this.send({ t: 'b', i }); }
  checkpoint(i) { if (this.online) this.send({ t: 'cp', i }); }

  // ---------- À chaque pas de physique, juste avant world.step() ----------

  step(dt) {
    if (!this.online) return;
    const t = nowS();
    for (const r of this.remotes.values()) {
      if (!r.snaps.length) continue;
      const s = this.sample(r, t - INTERP);
      const cur = r.body.translation();
      if (Math.hypot(s.x - cur.x, s.y - cur.y) > 2.5) {
        r.body.setTranslation({ x: s.x, y: s.y }, true);
        r.body.setLinvel({ x: 0, y: 0 }, true);
      } else {
        r.body.setLinvel({ x: (s.x - cur.x) / dt, y: (s.y - cur.y) / dt }, true);
      }
      if (s.l !== r.layer) {
        r.layer = s.l;
        r.collider.setCollisionGroups(groupsFor(1 << s.l));
        r.grab.mask = 1 << s.l;
      }
      if (this.player.grabbed === r.grab && r.layer !== this.player.layer) this.hooks.release();
    }

    // Objets : on suit l'état de l'hôte (ou du joueur qui tient l'objet)
    for (const [i, tg] of this.targets) {
      if (i === this.myOwn) continue;
      if (this.isHost && !this.owned.has(i)) { this.targets.delete(i); continue; }
      const b = this.level.objects[i].body;
      const age = Math.min(t - tg.recv, 0.2);
      const tx = tg.x + tg.vx * age, ty = tg.y + tg.vy * age, ta = tg.a + tg.w * age;
      const c = b.translation(), a = b.rotation();
      const err = Math.hypot(tx - c.x, ty - c.y);
      if (err > 2) {
        b.setTranslation({ x: tx, y: ty }, true);
        b.setRotation(ta, true);
      } else {
        const k = 0.2;
        const da = Math.atan2(Math.sin(ta - a), Math.cos(ta - a));
        b.setTranslation({ x: c.x + (tx - c.x) * k, y: c.y + (ty - c.y) * k }, true);
        b.setRotation(a + da * k, true);
      }
      b.setLinvel({ x: tg.vx, y: tg.vy }, true);
      b.setAngvel(tg.w, true);
      if (t - tg.recv > 1.5 && err < 0.02) this.targets.delete(i);
    }
  }

  // ---------- À chaque image : envoi réseau + rendu des autres joueurs ----------

  update(dt) {
    if (!this.online) return;
    const t = nowS();
    const { player, level } = this;

    // Prise d'objet par un non-hôte : on en devient propriétaire le temps de la prise
    const g = player.grabbed && !player.grabbed.remote ? level.objects.indexOf(player.grabbed) : -1;
    const own = this.isHost ? -1 : g;
    if (own !== this.myOwn) {
      if (this.myOwn >= 0) this.send({ t: 'unown', i: this.myOwn });
      if (own >= 0) { this.send({ t: 'own', i: own }); this.targets.delete(own); }
      this.myOwn = own;
    }

    this.sendT += dt;
    if (this.sendT >= SEND_DT) {
      this.sendT = 0;
      const p = player.body.translation(), v = player.body.linvel();
      const m = {
        t: 'p', ts: r3(t), x: r3(p.x), y: r3(p.y), vx: r3(v.x), vy: r3(v.y),
        l: player.layer, f: player.facing, g: player.grounded ? 1 : 0,
        mv: Math.abs(player.input?.x ?? 0) > 0.1 ? 1 : 0, s: r3(Math.abs(player.relVx)),
        gr: player.grabbed ? 1 : 0, e: player.emote, c: player.costume, sc: this.hooks.getScore(),
      };
      if (this.myOwn >= 0) m.h = this.objState(this.myOwn);
      this.send(m);
    }

    this.objT += dt;
    this.fullT -= dt;
    if (this.isHost && this.remotes.size && this.objT >= OBJ_DT) {
      this.objT = 0;
      const full = this.fullT <= 0;
      if (full) this.fullT = FULL_DT;
      const o = [];
      level.objects.forEach((obj, i) => {
        if (obj.type !== 'dynamic' || this.owned.has(i)) return;
        if (!full && obj.body.isSleeping()) return;
        o.push(this.objState(i));
      });
      if (o.length) this.send({ t: 'o', time: r3(level.time), o });
    }

    // Rendu des autres joueurs
    for (const r of this.remotes.values()) {
      if (!r.snaps.length) continue;
      const s = this.sample(r, t - INTERP);
      r.z = damp(r.z, LAYER_Z[s.l] ?? 0, 12, dt);
      r.sack.root.position.set(s.x, s.y, r.z);
      if (s.c !== r.costume && this.COSTUMES[s.c] != null) { r.costume = s.c; r.sack.setColor(this.COSTUMES[s.c]); this.renderList(); }
      if (s.e !== r.emote && this.EMOTES[s.e]) { r.emote = s.e; r.sack.setEmote(this.EMOTES[s.e]); }
      if (r.last && r.last.sc !== r.score) { r.score = r.last.sc; this.renderList(); }
      r.sack.update(dt, { speed: s.s, grounded: !!s.g, vy: s.vy, facing: s.f, moving: !!s.mv, grabbing: !!s.gr });
      this.placeTag(r.tag, r.sack.root.position, r.costume);
    }
    if (this.myTag) this.placeTag(this.myTag, this.sack.root.position, player.costume);

    this.listT -= dt;
    if (this.listT <= 0) { this.listT = 0.5; this.renderList(); }
  }

  objState(i) {
    const b = this.level.objects[i].body;
    const p = b.translation(), v = b.linvel();
    return [i, r3(p.x), r3(p.y), r3(b.rotation()), r3(v.x), r3(v.y), r3(b.angvel())];
  }

  placeTag(el, pos, costume) {
    const v = this.v.set(pos.x, pos.y + 1.15, pos.z).project(this.camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.background = hex(this.COSTUMES[costume] ?? 0x888888);
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(${sx | 0}px, ${sy | 0}px) translate(-50%, -100%)`;
  }

  // Liste des joueurs dans le HUD (couleur, pseudo, score, hôte)
  renderList() {
    if (!this.online) return;
    const rows = [
      { id: this.id, name: `${this.myName} (toi)`, costume: this.player.costume, score: this.hooks.getScore() },
      ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, costume: r.costume, score: r.score })),
    ];
    const key = JSON.stringify([rows, this.hostId, this.code]);
    if (key === this.listKey) return;
    this.listKey = key;
    const el = this.ui.players;
    el.replaceChildren();
    const head = document.createElement('div');
    head.className = 'code';
    head.append('Partie ');
    const b = document.createElement('b');
    b.textContent = this.code;
    head.append(b, ` · ${rows.length}/4`);
    el.append(head);
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = hex(this.COSTUMES[r.costume] ?? 0x888888);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = (r.id === this.hostId ? '👑 ' : '') + r.name;
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = r.score;
      row.append(dot, name, pts);
      el.append(row);
    }
  }
}
