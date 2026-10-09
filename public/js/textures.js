// Toutes les textures sont dessinées à la volée dans des canvas : aucun fichier image.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, n, colors, max = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = rand(0.6, max);
    g.fillRect(Math.random() * w, Math.random() * h, r, r);
  }
}

// Dessine une forme aux 9 positions décalées pour que la texture se répète sans couture.
function wrapped(s, x, y, draw) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) draw(x + dx, y + dy);
}

function stitches(g, path, color = 'rgba(255,255,255,0.75)', width = 3) {
  g.save();
  g.setLineDash([9, 7]);
  g.lineWidth = width;
  g.lineCap = 'round';
  g.strokeStyle = color;
  path();
  g.stroke();
  g.restore();
}

// ---------- Matériaux du niveau ----------

function cardboardCanvas(base = '#c4925a') {
  const [c, g] = canvas(256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) {
    const grad = g.createLinearGradient(x, 0, x + 8, 0);
    grad.addColorStop(0, 'rgba(255,235,190,0.16)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(80,45,15,0.16)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 8, 256);
  }
  for (let i = 0; i < 6; i++) {
    const x = rand(0, 256), y = rand(0, 256), r = rand(10, 40);
    wrapped(256, x, y, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(90,55,20,0.12)');
      grad.addColorStop(1, 'rgba(90,55,20,0)');
      g.fillStyle = grad;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  speckle(g, 256, 256, 2200, ['rgba(80,48,18,0.35)', 'rgba(255,238,205,0.3)'], 2);
  return c;
}

function woodCanvas() {
  const [c, g] = canvas(256);
  g.fillStyle = '#b7773f';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const light = Math.random() > 0.5;
    g.strokeStyle = light ? `rgba(255,215,160,${rand(0.05, 0.16)})` : `rgba(85,40,12,${rand(0.06, 0.18)})`;
    g.lineWidth = rand(1, 2.5);
    const ph = rand(0, TAU), amp = rand(1, 3.5);
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) {
      const yy = y + Math.sin((x / 256) * TAU * 2 + ph) * amp;
      x ? g.lineTo(x, yy) : g.moveTo(x, yy);
    }
    g.stroke();
  }
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    g.fillStyle = 'rgba(60,28,8,0.55)';
    g.fillRect(0, y, 256, 2);
    g.fillRect((row * 97 + 40) % 256, y, 2, 64);
    g.fillStyle = 'rgba(255,220,170,0.2)';
    g.fillRect(0, y + 2, 256, 1);
  }
  for (let i = 0; i < 4; i++) {
    wrapped(256, rand(0, 256), rand(0, 256), (x, y) => {
      g.fillStyle = 'rgba(70,32,10,0.45)';
      g.beginPath();
      g.ellipse(x, y, rand(5, 9), rand(2, 4), 0, 0, TAU);
      g.fill();
    });
  }
  return c;
}

function metalCanvas() {
  const [c, g] = canvas(256);
  g.fillStyle = '#9aa4ad';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${rand(0, 0.08)})` : `rgba(0,0,0,${rand(0, 0.08)})`;
    g.fillRect(0, y, 256, 1);
  }
  g.strokeStyle = 'rgba(35,40,45,0.6)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 253);
  const rivets = [14, 128, 242];
  for (const x of rivets) for (const y of rivets) {
    if (x === 128 && y === 128) continue;
    const grad = g.createRadialGradient(x - 1.5, y - 1.5, 0, x, y, 6);
    grad.addColorStop(0, '#f4f6f8');
    grad.addColorStop(0.6, '#8a949c');
    grad.addColorStop(1, '#4a5258');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, 5.5, 0, TAU);
    g.fill();
  }
  return c;
}

function spongeCanvas() {
  const [c, g] = canvas(256);
  g.fillStyle = '#f3c443';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1500, ['rgba(255,240,170,0.5)', 'rgba(190,130,20,0.3)'], 2.5);
  for (let i = 0; i < 150; i++) {
    const r = rand(2, 9);
    wrapped(256, rand(0, 256), rand(0, 256), (x, y) => {
      g.fillStyle = '#c99320';
      g.beginPath();
      g.ellipse(x, y, r, r * rand(0.6, 1), 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,240,180,0.6)';
      g.beginPath();
      g.ellipse(x, y + r * 0.55, r * 0.7, r * 0.25, 0, 0, Math.PI);
      g.fill();
    });
  }
  return c;
}

function feltCanvas() {
  const [c, g] = canvas(256);
  g.fillStyle = '#57a443';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const x = rand(0, 256), y = rand(0, 256), a = rand(0, TAU), l = rand(2, 6);
    g.strokeStyle = Math.random() > 0.5 ? 'rgba(190,240,150,0.16)' : 'rgba(20,70,15,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

export function createMaterials() {
  const defs = {
    cardboard: { canvas: cardboardCanvas(), roughness: 0.95, density: 0.6, friction: 0.8, scale: 2 },
    darkcard: { canvas: cardboardCanvas('#8f6238'), roughness: 1, density: 1, friction: 0.8, scale: 3 },
    wood: { canvas: woodCanvas(), roughness: 0.8, density: 1.2, friction: 0.7, scale: 2.5 },
    metal: { canvas: metalCanvas(), roughness: 0.35, metalness: 0.75, density: 5, friction: 0.35, scale: 2 },
    sponge: { canvas: spongeCanvas(), roughness: 1, density: 0.3, friction: 1, scale: 1.5, bump: 3 },
    felt: { canvas: feltCanvas(), roughness: 1, density: 1, friction: 0.9, scale: 2 },
  };
  const mats = {};
  for (const [name, d] of Object.entries(defs)) {
    const map = texture(d.canvas);
    const bumpMap = texture(d.canvas, { srgb: false });
    mats[name] = {
      ...d,
      material: new THREE.MeshStandardMaterial({
        map,
        bumpMap,
        bumpScale: d.bump ?? 1.5,
        roughness: d.roughness,
        metalness: d.metalness ?? 0,
      }),
    };
  }
  return mats;
}

// ---------- Personnage ----------

export function knitTexture() {
  const [c, g] = canvas(128);
  g.fillStyle = '#f2ece2';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      for (const side of [-1, 1]) {
        g.save();
        g.translate(col * 16 + 8 + side * 3.6, row * 16 + 8);
        g.rotate(side * 0.5);
        const grad = g.createLinearGradient(-3.5, 0, 3.5, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0.28)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0.28)');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(0, 0, 3.4, 8.6, 0, 0, TAU);
        g.fill();
        g.restore();
      }
    }
  }
  speckle(g, 128, 128, 500, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.2)'], 1.5);
  const t = texture(c);
  t.repeat.set(5, 4);
  return t;
}

// ---------- Effets / décor ----------

export function dotTexture() {
  const [c, g] = canvas(64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return texture(c, { repeat: false });
}

export function flowerTextures() {
  const variants = [
    { petal: '#e2574c', center: '#f2c94c' },
    { petal: '#6fa8e8', center: '#fff2c4' },
    { petal: '#f29ac0', center: '#f2c94c' },
    { tuft: true },
  ];
  return variants.map((v) => {
    const [c, g] = canvas(128);
    if (v.tuft) {
      g.fillStyle = '#4e9a3b';
      for (let i = 0; i < 7; i++) {
        const x = 24 + i * 13;
        g.beginPath();
        g.moveTo(x - 7, 128);
        g.quadraticCurveTo(x + rand(-10, 10), 70, x + rand(-14, 14), rand(30, 60));
        g.quadraticCurveTo(x + 3, 90, x + 7, 128);
        g.fill();
      }
    } else {
      g.strokeStyle = '#3f8a30';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(64, 128);
      g.quadraticCurveTo(58, 90, 64, 52);
      g.stroke();
      g.fillStyle = '#4e9a3b';
      g.beginPath();
      g.ellipse(80, 98, 16, 7, -0.5, 0, TAU);
      g.fill();
      g.fillStyle = v.petal;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        g.beginPath();
        g.arc(64 + Math.cos(a) * 20, 44 + Math.sin(a) * 20, 15, 0, TAU);
        g.fill();
      }
      g.fillStyle = v.center;
      g.beginPath();
      g.arc(64, 44, 13, 0, TAU);
      g.fill();
      stitches(g, () => { g.beginPath(); g.arc(64, 44, 31, 0, TAU); }, 'rgba(255,255,255,0.7)', 2.5);
    }
    const t = texture(c, { repeat: false });
    return t;
  });
}

export function signTexture(text) {
  const [c, g] = canvas(512, 256);
  g.drawImage(cardboardCanvas('#d8b07a'), 0, 0, 512, 256);
  g.drawImage(cardboardCanvas('#d8b07a'), 256, 0, 256, 256);
  stitches(g, () => {
    g.beginPath();
    g.roundRect(14, 14, 484, 228, 18);
  }, 'rgba(90,55,25,0.7)', 3);
  const lines = text.split('\n');
  const size = lines.length > 2 ? 40 : 46;
  g.font = `700 ${size}px Fredoka, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#3b2716';
  lines.forEach((line, i) => {
    g.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * size * 1.15, 470);
  });
  return texture(c, { repeat: false });
}

export function skyTexture() {
  const [c, g] = canvas(1024, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#8ccbe6');
  grad.addColorStop(0.55, '#cde8ee');
  grad.addColorStop(1, '#f7e3bb');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  speckle(g, 1024, 512, 4000, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.03)'], 2);

  // Soleil en feutrine
  g.fillStyle = '#ffd86b';
  g.beginPath();
  g.arc(770, 130, 62, 0, TAU);
  g.fill();
  stitches(g, () => { g.beginPath(); g.arc(770, 130, 52, 0, TAU); }, 'rgba(255,255,255,0.8)');

  // Nuages en coton
  const clouds = [[140, 110, 1], [430, 70, 0.8], [600, 190, 0.7], [930, 90, 0.9]];
  for (const [x, y, s] of clouds) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (const [dx, dy, r] of [[-50, 10, 30], [-15, -12, 40], [30, 0, 34], [60, 14, 24], [0, 18, 30]]) {
      g.moveTo(x + dx * s + r * s, y + dy * s);
      g.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
    }
    g.fill();
  }

  // Collines lointaines
  g.fillStyle = '#a9cf8f';
  g.beginPath();
  g.moveTo(0, 512);
  for (let x = 0; x <= 1024; x += 8) {
    const y = 400 - Math.sin((x / 1024) * TAU * 2) * 28 - Math.sin((x / 1024) * TAU * 5 + 1) * 12;
    g.lineTo(x, y);
  }
  g.lineTo(1024, 512);
  g.fill();
  return texture(c);
}

export function hillsTexture() {
  const [c, g] = canvas(1024, 256);
  const hill = (x) => 120 - Math.sin((x / 1024) * TAU * 3) * 35 - Math.sin((x / 1024) * TAU * 7 + 2) * 12;

  // Arbres "sucettes"
  for (const x of [90, 330, 520, 760, 940]) {
    const base = hill(x) + 10;
    g.fillStyle = '#7a5230';
    g.fillRect(x - 6, base - 70, 12, 72);
    g.fillStyle = '#3f8a35';
    g.beginPath();
    g.arc(x, base - 92, 38, 0, TAU);
    g.fill();
    stitches(g, () => { g.beginPath(); g.arc(x, base - 92, 30, 0, TAU); }, 'rgba(255,255,255,0.55)', 2.5);
  }

  g.fillStyle = '#6fae55';
  g.beginPath();
  g.moveTo(0, 256);
  for (let x = 0; x <= 1024; x += 4) g.lineTo(x, hill(x));
  g.lineTo(1024, 256);
  g.fill();
  stitches(g, () => {
    g.beginPath();
    for (let x = 0; x <= 1024; x += 4) x ? g.lineTo(x, hill(x) + 10) : g.moveTo(x, hill(x) + 10);
  }, 'rgba(255,255,255,0.6)');
  const t = texture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
