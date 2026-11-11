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
