// Fonctions pures partagées (aucune dépendance à Three.js ni au DOM) : testables sous Node.
// Les fonctions physiques reçoivent RAPIER et le monde en paramètre.

// ---------- Maths ----------

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Lissage exponentiel indépendant du framerate.
export const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
// Avance v vers t d'au plus d.
export const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

// ---------- Plans de profondeur ----------

// Comme dans LittleBigPlanet, le monde a 3 plans : 0 = devant, 1 = milieu, 2 = fond.
export const LAYER_Z = [1.4, 0, -1.4];
export const LAYER_DEPTH = 1.3;
export const ALL = 0b111;
// Groupes de collision Rapier : 16 bits d'appartenance + 16 bits de filtre.
export const groupsFor = (mask) => (mask << 16) | mask;

// Position z et épaisseur d'un objet qui couvre les plans du masque.
export function zSpan(mask) {
  const zs = LAYER_Z.filter((_, i) => mask & (1 << i));
  const max = Math.max(...zs);
  const min = Math.min(...zs);
  return { z: (max + min) / 2, depth: max - min + LAYER_DEPTH };
}

// UV d'une BoxGeometry mises à l'échelle de la taille réelle (uv : attribut avec getX/getY/setXY).
// Ordre des faces Three.js : +x, -x, +y, -y, +z, -z.
export function scaleBoxUVs(uv, w, h, d, scale) {
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / scale, (uv.getY(i) * dims[f][1]) / scale);
    }
  }
  return uv;
}

// ---------- Repères des objets ----------

// o : objet du niveau ({ body } avec translation() et rotation()).
export function toLocal(o, p) {
  const t = o.body.translation(), a = -o.body.rotation();
  const dx = p.x - t.x, dy = p.y - t.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function toWorld(o, l) {
  const t = o.body.translation(), a = o.body.rotation();
  return { x: t.x + l.x * Math.cos(a) - l.y * Math.sin(a), y: t.y + l.x * Math.sin(a) + l.y * Math.cos(a) };
}

// La boîte alignée (centre cx, cy ; demi-tailles hx, hy) chevauche-t-elle l'objet ?
export function overlapsObject(o, cx, cy, hx, hy) {
  const t = o.body.translation();
  if (o.kind === 'ball') {
    const dx = Math.max(Math.abs(t.x - cx) - hx, 0), dy = Math.max(Math.abs(t.y - cy) - hy, 0);
    return dx * dx + dy * dy < o.r * o.r;
  }
  // Test des axes séparateurs entre la boîte du joueur et la boîte (éventuellement penchée) de l'objet
  const a = o.body.rotation();
  const c = Math.cos(a), s = Math.sin(a);
  const ox = o.w / 2, oy = o.h / 2;
  const axes = [[1, 0], [0, 1], [c, s], [-s, c]];
  for (const [nx, ny] of axes) {
    const pr = hx * Math.abs(nx) + hy * Math.abs(ny);
    const po = ox * Math.abs(c * nx + s * ny) + oy * Math.abs(-s * nx + c * ny);
    if (Math.abs((t.x - cx) * nx + (t.y - cy) * ny) > pr + po) return false;
  }
  return true;
}

// ---------- Score ----------

export const COMBO_WINDOW = 0.7;

// Combo : +1 si la bulle précédente a été prise il y a moins de COMBO_WINDOW secondes.
export const nextCombo = (combo, now, lastCollect) => (now - lastCollect < COMBO_WINDOW ? combo + 1 : 0);

// Points d'une bulle : x2 tous les 3 combos, plafonné à x5.
export function bubblePoints(big, combo) {
  const mult = 1 + Math.min(Math.floor(combo / 3), 4);
  return { points: (big ? 50 : 10) * mult, mult };
}

// Le joueur (px, py) touche-t-il la bulle (bx, by) ? Zone elliptique, plus large pour les grosses bulles.
export function bubbleReached(bx, by, big, px, py) {
  const k = big ? 1.3 : 1;
  const dx = (bx - px) / (0.8 * k), dy = (by - py) / (1.05 * k);
  return dx * dx + dy * dy < 1;
}

// Un checkpoint s'active quand on le dépasse, seulement s'il est plus loin que le point de réapparition actuel.
export function checkpointReached(cp, pos, respawnX) {
  return !cp.active && cp.x > respawnX && pos.x > cp.x - 0.5 && Math.abs(pos.y - cp.y) < 6;
}

export const formatTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- Physique ----------

// Sonde au sol : 3 rayons sous les pieds. Renvoie le corps touché, ou null.
export function probeGround(R, world, pos, groups, exclude) {
  for (const ox of [-0.3, 0, 0.3]) {
    const ray = new R.Ray({ x: pos.x + ox, y: pos.y }, { x: 0, y: -1 });
    const hit = world.castRay(ray, 0.95, true, R.QueryFilterFlags.EXCLUDE_SENSORS, groups, exclude);
    if (hit && (hit.timeOfImpact ?? hit.toi) < 0.88) return hit.collider.parent();
  }
  return null;
}
