// ─────────────────────────────────────────────────────────────────────────────
// VALIDATORE DI PERCORSO
// Domanda: "un giocatore con la barra di stamina piena può andare dal falò A
// al falò B?" Ogni cella della griglia è un punto della parete. Muoversi su
// una cella calpestabile non costa nulla e AZZERA la stamina usata (ti riposi);
// muoversi sulla parete costa stamina secondo le regole di rules.js.
//
// È un Dijkstra in cui la chiave = stamina consumata dall'ultimo riposo.
// Le chiavi sono intere (stamina × Q) e usiamo una coda a "secchielli"
// (algoritmo di Dial): molto più veloce di un heap per costi piccoli.
// ─────────────────────────────────────────────────────────────────────────────
import { FLAG_STAND } from './surface.js';
import { MAT, climbCost } from './rules.js';

const Q = 400; // risoluzione: 1 unità = 1/400 di stamina

export function solveSegment(surf, { startCells, isGoal, target, j0, j1, budget }) {
  const W = surf.W, rowsN = j1 - j0 + 1, N = W * rowsN;
  const R = surf.R, M = surf.M, F = surf.F, D = surf.DRDY, dy = surf.dy;
  const maxKey = Math.ceil(budget * Q);
  const key = new Int32Array(N).fill(0x7fffffff);
  const buckets = Array.from({ length: maxKey + 1 }, () => []);
  const heads = new Int32Array(maxKey + 1); // code FIFO: a parità di costo vince il percorso più corto
  const highLimit = Math.floor(maxKey * 0.85);
  const NI = [1, -1, 0, 0], NJ = [0, 0, 1, -1];

  // Chiave di arrivo nella cella gn partendo da g (con chiave k). -1 = impossibile.
  function arrive(g, gn, k, vertical) {
    if (R[gn] <= 0.3 || M[gn] === MAT.LAVA) return -1;
    if (F[gn] & FLAG_STAND) return 0;          // riposo: la stamina si ricarica
    const step = vertical ? dy : surf.arcStep(R[gn]);
    const cost = climbCost(Math.hypot(step, R[gn] - R[g]), M[gn], D[gn], vertical);
    const nk = k + Math.max(1, Math.round(cost * Q));
    return nk > maxKey ? -1 : nk;              // stamina finita: non si passa
  }

  for (const [i, j] of startCells) {
    const c = (j - j0) * W + i;
    key[c] = 0; buckets[0].push(c);
  }

  // Dijkstra con "insieme chiuso": ogni cella viene fissata la prima volta che esce
  // dalla coda. Arrivare su una cengia riporta la chiave a 0 (bucket 0), quindi
  // l'ordine non è perfettamente monotono: il risultato è leggermente prudente
  // (può sottostimare cosa è raggiungibile, mai sovrastimarlo) — per un
  // generatore è la direzione giusta: un percorso trovato è sempre valido.
  const closed = new Uint8Array(N);
  const parent = new Int32Array(N).fill(-1);
  let cur = 0, goal = -1, visited = 0;
  const cand = [];   // [distanza dall'obiettivo, cella] per il riparatore
  for (;;) {
    while (cur <= maxKey && heads[cur] === buckets[cur].length) cur++;
    if (cur > maxKey) break;
    const c = buckets[cur][heads[cur]++];
    if (closed[c] || key[c] !== cur) continue;
    closed[c] = 1;
    visited++;
    const i = c % W, j = j0 + ((c / W) | 0);
    const g = j * W + i;
    if (isGoal(i, j)) { goal = c; break; }
    // la cella di parete raggiunta (con margine) più vicina all'obiettivo:
    // se il tratto è impossibile, il "riparatore" scaverà lì un punto di riposo
    if (!(F[g] & FLAG_STAND) && cur <= highLimit && target) {
      cand.push([Math.hypot(j * dy - target.y, target.top ? 0 : angArc(surf.theta(i), target.theta, R[g])), c]);
    }
    for (let k = 0; k < 4; k++) {
      const nj = j + NJ[k];
      if (nj < j0 || nj > j1) continue;
      const ni = (i + NI[k] + W) % W;
      const cn = (nj - j0) * W + ni;
      if (closed[cn]) continue;
      const nk = arrive(g, nj * W + ni, cur, k >= 2);
      if (nk < 0 || nk >= key[cn]) continue;
      key[cn] = nk; parent[cn] = c; buckets[nk].push(cn);
      if (nk < cur) cur = nk;
    }
  }

  const toIJ = c => [c % W, j0 + ((c / W) | 0)];
  const path = [];
  for (let c = goal; c >= 0; c = parent[c]) path.push(toIJ(c));
  path.reverse();
  let candidates = [];
  if (goal < 0) {
    cand.sort((a, b) => a[0] - b[0]);
    candidates = cand.slice(0, 4000).map(([, c]) => toIJ(c));
  }
  return { ok: goal >= 0, path, candidates, visited };
}

function angArc(a, b, r) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d * r;
}
