// ─────────────────────────────────────────────────────────────────────────────
// MACIGNI: pochi modelli, riusati migliaia di volte
// Ogni macigno è un POLIEDRO CONVESSO definito dai suoi piani (normale + distanza):
// un blocco tagliato da qualche colpo di scalpello. Da una sola definizione escono:
//   - la MESH da disegnare (con l'instancing: una chiamata per modello);
//   - la DISTANZA da un punto alla roccia, che per un convesso è semplicemente
//         d(p) = max_i ( n_i · p − d_i )
//     ed è tutto ciò che serve alla fisica (collisioni, arrampicata, strapiombi);
//   - le FACCE, da cui il generatore ricava le cenge (facce che guardano in alto).
// Raggio di ingombro = 1: la scala la decide chi lo piazza.
// ─────────────────────────────────────────────────────────────────────────────

const rnd = seed => { let s = (seed * 2654435761) >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// intersezione di tre piani (regola di Cramer); null se quasi paralleli
function meet(p, q, r) {
  const c = cross(q.n, r.n), det = dot(p.n, c);
  if (Math.abs(det) < 1e-7) return null;
  const a = cross(r.n, p.n), b = cross(p.n, q.n);
  return [(p.d * c[0] + q.d * a[0] + r.d * b[0]) / det, (p.d * c[1] + q.d * a[1] + r.d * b[1]) / det, (p.d * c[2] + q.d * a[2] + r.d * b[2]) / det];
}

// half = semiassi della scatola di partenza, cuts = quanti tagli, depth = quanto mordono
function makeShape(seed, half, cuts, depth) {
  const R = rnd(seed);
  let planes = [];
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach((n, k) =>
    planes.push({ n, d: half[k >> 1] * (0.88 + 0.24 * R()) }));
  for (let k = 0; k < cuts; k++) {
    const n = norm([R() * 2 - 1, (R() * 2 - 1) * 0.8, R() * 2 - 1]);
    const support = Math.abs(n[0]) * half[0] + Math.abs(n[1]) * half[1] + Math.abs(n[2]) * half[2];   // quanto sporge la scatola lungo n
    planes.push({ n, d: support * (1 - depth * (0.35 + 0.65 * R())) });
  }
  // vertici = punti d'incontro di tre piani che stanno dentro tutti gli altri
  const verts = [];
  for (let a = 0; a < planes.length; a++) for (let b = a + 1; b < planes.length; b++) for (let c = b + 1; c < planes.length; c++) {
    const v = meet(planes[a], planes[b], planes[c]);
    if (!v || planes.some(p => dot(p.n, v) - p.d > 1e-6)) continue;
    if (!verts.some(w => Math.hypot(w[0] - v[0], w[1] - v[1], w[2] - v[2]) < 1e-5)) verts.push(v);
  }
  // scala a raggio 1
  const rad = Math.max(...verts.map(v => Math.hypot(v[0], v[1], v[2])));
  verts.forEach(v => { v[0] /= rad; v[1] /= rad; v[2] /= rad; });
  planes.forEach(p => { p.d /= rad; });
  // facce: i vertici che giacciono su ogni piano, ordinati attorno alla normale
  const faces = [];
  for (const p of planes) {
    const on = verts.filter(v => Math.abs(dot(p.n, v) - p.d) < 1e-5);
    if (on.length < 3) continue;
    const c = [0, 1, 2].map(k => on.reduce((s, v) => s + v[k], 0) / on.length);
    const u = norm(cross(p.n, Math.abs(p.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), w = cross(p.n, u);
    on.sort((A, B) => Math.atan2(dot([A[0] - c[0], A[1] - c[1], A[2] - c[2]], w), dot([A[0] - c[0], A[1] - c[1], A[2] - c[2]], u))
                    - Math.atan2(dot([B[0] - c[0], B[1] - c[1], B[2] - c[2]], w), dot([B[0] - c[0], B[1] - c[1], B[2] - c[2]], u)));
    let area = 0;
    for (let k = 1; k < on.length - 1; k++) {
      const e1 = [on[k][0] - on[0][0], on[k][1] - on[0][1], on[k][2] - on[0][2]], e2 = [on[k + 1][0] - on[0][0], on[k + 1][1] - on[0][1], on[k + 1][2] - on[0][2]];
      const x = cross(e1, e2); area += 0.5 * Math.hypot(x[0], x[1], x[2]);
    }
    faces.push({ n: p.n, center: c, verts: on, area });
  }
  planes = faces.map(f => ({ n: f.n, d: dot(f.n, f.center) }));   // solo i piani che formano davvero una faccia
  // forma compatta per la fisica
  const P = new Float32Array(planes.length * 4);
  planes.forEach((p, k) => { P[k * 4] = p.n[0]; P[k * 4 + 1] = p.n[1]; P[k * 4 + 2] = p.n[2]; P[k * 4 + 3] = p.d; });
  return { planes: P, count: planes.length, faces };
}

// I modelli: blocchi, lastre (ottime cenge), pilastri, cunei.
export function buildShapes() {
  return [
    makeShape(1, [1, 0.8, 0.9], 7, 0.30),      // blocchi
    makeShape(2, [1, 0.75, 0.8], 9, 0.34),
    makeShape(3, [0.9, 0.9, 1], 8, 0.28),
    makeShape(4, [1, 0.7, 1], 10, 0.36),
    makeShape(5, [1, 0.42, 0.85], 6, 0.25),    // lastre
    makeShape(6, [1, 0.36, 1], 7, 0.22),
    makeShape(7, [0.6, 1, 0.65], 7, 0.28),     // pilastri
    makeShape(8, [1, 0.6, 0.7], 11, 0.42),     // cunei
  ];
}

// distanza con segno (unità locali) dal punto (x,y,z) alla forma
export function shapeDistance(shape, x, y, z) {
  const P = shape.planes;
  let m = -1e9;
  for (let k = 0; k < P.length; k += 4) {
    const d = P[k] * x + P[k + 1] * y + P[k + 2] * z - P[k + 3];
    if (d > m) m = d;
  }
  return m;
}

// ── Mesh "realistica" di un macigno ──────────────────────────────────────────
// La forma fisica resta il poliedro (piani). Per il disegno ogni faccia viene
// suddivisa `level` volte e i vertici vengono spostati un po' VERSO L'INTERNO:
//   - di più vicino a spigoli e angoli → spigoli arrotondati invece che a lama;
//   - con un rumore fine → superficie irregolare, non un piano perfetto.
// Lo spostamento dipende solo dalla posizione del punto, quindi le facce vicine
// restano cucite. Poi le normali vengono mediate tra i triangoli che condividono
// un vertice: sulle facce restano piatte, sugli spigoli sfumano.
// Ritorna { position, normal, index } (array tipizzati).
export function shapeMesh(shape, level = 2) {
  const P = shape.planes;
  const noise = (x, y, z) => Math.sin(x * 9.1 + y * 5.3) * Math.cos(z * 8.3 - y * 6.7) * 0.5 + Math.sin(x * 17.3 - z * 13.1 + y * 11.9) * 0.5;
  // triangoli di partenza
  let tris = [];
  for (const f of shape.faces) for (let k = 1; k < f.verts.length - 1; k++) tris.push([f.verts[0], f.verts[k], f.verts[k + 1]]);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (let l = 0; l < level; l++) {
    const next = [];
    for (const [a, b, c] of tris) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    tris = next;
  }
  // vertici unici (per posizione) → indice
  const map = new Map(), pos = [], index = [];
  const W = 0.16, ROUND = 0.035, ROUGH = 0.012;
  const idOf = v => {
    const key = `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) {
      let s = 0;                                   // quanti piani sono "vicini": 1 = faccia, 2 = spigolo, 3 = angolo
      for (let k = 0; k < P.length; k += 4) { const e = P[k + 3] - (P[k] * v[0] + P[k + 1] * v[1] + P[k + 2] * v[2]); const t = Math.max(0, 1 - e / W); s += t * t; }
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      const m = ROUND * Math.max(0, s - 1) + ROUGH * (1 + noise(v[0], v[1], v[2]));
      id = pos.length / 3;
      pos.push(v[0] - (v[0] / l) * m, v[1] - (v[1] / l) * m, v[2] - (v[2] / l) * m);
      map.set(key, id);
    }
    return id;
  };
  for (const [a, b, c] of tris) index.push(idOf(a), idOf(b), idOf(c));
  // normali mediate (pesate con l'area)
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = cross(e1, e2);
    for (const q of [a, b, c]) { nor[q] += n[0]; nor[q + 1] += n[1]; nor[q + 2] += n[2]; }
  }
  for (let i = 0; i < nor.length; i += 3) { const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
  return { position: new Float32Array(pos), normal: nor, index: pos.length / 3 > 65535 ? new Uint32Array(index) : new Uint16Array(index) };
}
