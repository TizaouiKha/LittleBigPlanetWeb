// Le petit bonhomme en tissu, construit avec des formes simples et animé à la main.
import * as THREE from 'three';

const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

export class Sackboy {
  constructor(knit) {
    this.t = 0;
    this.phase = 0;
    this.yaw = 0.5;
    this.squash = 0;
    this.blink = 2;

    // root = centre de la capsule physique, body = pieds (pour écraser depuis le sol)
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = -0.77;
    this.root.add(this.pivot);
    this.pivot.add(this.body);

    this.cloth = new THREE.MeshStandardMaterial({ color: 0xc9a06a, map: knit, bumpMap: knit, bumpScale: 3, roughness: 1 });
    const seam = new THREE.MeshStandardMaterial({ color: 0x6e4f2f, roughness: 1 });
    const ink = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.2 });
    const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4c4c4, roughness: 0.3, metalness: 0.9 });

    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // Torse + fermeture éclair
    const torso = mesh(new THREE.CapsuleGeometry(0.25, 0.18, 6, 16), this.cloth, this.body, 0, 0.55, 0);
    torso.scale.set(1.05, 1, 0.85);
    mesh(new THREE.BoxGeometry(0.035, 0.3, 0.02), steel, this.body, 0, 0.6, 0.212);
    mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), steel, this.body, 0, 0.78, 0.222);

    // Tête
    this.head = new THREE.Group();
    this.head.position.y = 1.13;
    this.body.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.4, 32, 24), this.cloth, this.head);
    skull.scale.set(1, 0.95, 0.95);
    const ring = mesh(new THREE.TorusGeometry(0.4, 0.013, 6, 48), seam, this.head);
    ring.scale.set(1, 0.95, 1);

    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Group();
      e.position.set(s * 0.14, 0.05, 0.335);
      this.head.add(e);
      const ball = mesh(new THREE.SphereGeometry(0.07, 16, 12), ink, e);
      ball.scale.set(1, 1.15, 0.6);
      mesh(new THREE.SphereGeometry(0.022, 8, 6), shine, e, 0.022, 0.03, 0.035);
      return e;
    });
    this.brows = [-1, 1].map((s) => {
      const b = mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), ink, this.head, s * 0.14, 0.19, 0.33);
      b.userData.side = s;
      return b;
    });
    this.mouth = mesh(new THREE.TorusGeometry(0.1, 0.017, 8, 20, Math.PI), ink, this.head);
    this.mouthO = mesh(new THREE.SphereGeometry(0.055, 12, 10), ink, this.head, 0, -0.14, 0.34);
    this.mouthO.scale.set(1, 1.3, 0.4);

    // Bras et jambes (des pivots pour les animer)
    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.27, 0.78, 0);
      this.body.add(shoulder);
      mesh(new THREE.CapsuleGeometry(0.085, 0.22, 4, 10), this.cloth, shoulder, 0, -0.19, 0);
      mesh(new THREE.SphereGeometry(0.1, 14, 10), this.cloth, shoulder, 0, -0.38, 0);
      shoulder.userData.side = s;
      return shoulder;
    });
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13, 0.36, 0);
      this.body.add(hip);
      mesh(new THREE.CapsuleGeometry(0.105, 0.14, 4, 10), this.cloth, hip, 0, -0.16, 0);
      const foot = mesh(new THREE.SphereGeometry(0.12, 14, 10), this.cloth, hip, 0, -0.29, 0.03);
      foot.scale.set(1, 0.7, 1.3);
      return hip;
    });

    this.setEmote('happy');
  }

  setColor(hex) {
    this.cloth.color.setHex(hex);
  }

  setEmote(name) {
    this.emote = name;
    const sad = name === 'sad';
    this.mouth.visible = name !== 'surprised';
    this.mouthO.visible = name === 'surprised';
    this.mouth.rotation.set(sad ? -0.3 : 0.3, 0, sad ? 0 : Math.PI);
    this.mouth.position.set(0, sad ? -0.17 : -0.08, 0.35);
    for (const b of this.brows) {
      const s = b.userData.side;
      b.visible = name !== 'happy';
      b.rotation.z = name === 'angry' ? s * 0.45 : sad ? -s * 0.35 : 0;
      b.position.y = name === 'surprised' ? 0.23 : 0.19;
    }
  }

  land(impact) {
    this.squash = Math.min(0.32, impact * 0.016);
  }

  // s = { speed, grounded, vy, facing, moving, grabbing }
  update(dt, s) {
    this.t += dt;

    const yawTarget = s.facing * (s.moving || s.grabbing ? 1.2 : 0.5);
    this.yaw = damp(this.yaw, yawTarget, 10, dt);
    this.pivot.rotation.y = this.yaw;

    const sp = Math.min(s.speed / 7, 1);
    if (s.grounded && sp > 0.05) this.phase += dt * (5 + 9 * sp);

    let legL, legR, armL, armR, spread = 0.25, lean = 0;
    if (s.grounded) {
      const w = Math.sin(this.phase) * sp;
      legL = w * 0.9;
      legR = -w * 0.9;
      armL = -w * 0.9;
      armR = w * 0.9;
      lean = sp * 0.12;
    } else {
      const rising = s.vy > 0;
      legL = rising ? -0.7 : -0.2;
      legR = rising ? 0.4 : 0.3;
      armL = armR = rising ? -2.6 : -2.0;
      spread = 0.6 + Math.sin(this.t * 22) * 0.12;
    }
    if (s.grabbing) {
      armL = armR = -1.45;
      spread = 0.1;
    }

    const k = 16;
    const [aL, aR] = this.arms;
    aL.rotation.x = damp(aL.rotation.x, armL, k, dt);
    aR.rotation.x = damp(aR.rotation.x, armR, k, dt);
    aL.rotation.z = damp(aL.rotation.z, -spread, k, dt);
    aR.rotation.z = damp(aR.rotation.z, spread, k, dt);
    this.legs[0].rotation.x = damp(this.legs[0].rotation.x, legL, k, dt);
    this.legs[1].rotation.x = damp(this.legs[1].rotation.x, legR, k, dt);
    this.body.rotation.x = damp(this.body.rotation.x, lean, 8, dt);

    // Rebond de marche, écrasement à l'atterrissage, étirement en saut
    const bob = s.grounded ? Math.abs(Math.sin(this.phase)) * 0.06 * sp : 0;
    this.body.position.y = -0.77 + bob;
    this.squash = damp(this.squash, 0, 9, dt);
    const stretch = !s.grounded && s.vy > 5 ? -0.08 : 0;
    const q = this.squash + stretch;
    this.body.scale.set(1 + q * 0.5, 1 - q, 1 + q * 0.5);

    // Petite vie : tête qui se balance, clignement des yeux
    this.head.rotation.z = Math.sin(this.t * 1.3) * 0.05;
    this.head.rotation.x = damp(this.head.rotation.x, s.grounded ? 0 : -0.15, 6, dt);
    this.blink -= dt;
    const closed = this.blink > 0 && this.blink < 0.12;
    if (this.blink <= 0) this.blink = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, closed ? 0.1 : 1, 40, dt);
  }
}
