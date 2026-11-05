// ─────────────────────────────────────────────────────────────────────────────
// VALIDATORE DI PERCORSO
// Domanda: "un giocatore con la barra di stamina piena può andare dal falò A
// al falò B?" Ogni cella della heightmap è un punto del terreno. Camminare su
// celle calpestabili non costa nulla e AZZERA la stamina usata (ti riposi);
// arrampicarsi costa stamina secondo le regole di rules.js.
//
// È un Dijkstra in cui la chiave = stamina consumata dall'ultimo riposo.
// Le chiavi sono intere (stamina × Q) e usiamo una coda a "secchielli"
// (algoritmo di Dial): molto più veloce di un heap per costi piccoli.
// `blocked` permette di vietare celle: serve per cercare vie ALTERNATIVE.
// ─────────────────────────────────────────────────────────────────────────────
import { FLAG_STAND } from './surface.js';
import { MAT, SEA, STEP, climbCost } from './rules.js';

const Q = 400; // risoluzione: 1 unità = 1/400 di stamina
const DROP = 3.5; // si può saltare giù da 3.5 m senza ferirsi

export function solveSegment(T, { startCells, isGoal, target, j0, j1, budget, blocked }) {
  const nx = T.nx, rowsN = j1 - j0 + 1, N = nx * rowsN;
  const H = T.H, M = T.M, F = T.F, UP = T.UP, C = T.C;
  const maxKey = Math.ceil(budget * Q);
  const key = new Int32Array(N).fill(0x7fffffff);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const buckets = Array.from({ length: maxKey + 1 }, () => []);
  const heads = new Int32Array(maxKey + 1); // code FIFO: a parità di costo vince il percorso più corto
  const highLimit = Math.floor(maxKey * 0.85);
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  const DD = [C, C, C, C, C * Math.SQRT2, C * Math.SQRT2, C * Math.SQRT2, C * Math.SQRT2];

  // Chiave di arrivo nella cella gn partendo da g (con chiave k). -1 = impossibile.
  function arrive(g, gn, k, dxz) {
    if (blocked && blocked[gn]) return -1;
    const hn = H[gn];
    if (hn < SEA + 0.15 || M[gn] === MAT.LAVA) return -1;
    const dh = hn - H[g];
    if ((F[gn] & FLAG_STAND) && dh <= STEP && dh >= -DROP) return 0;   // si cammina: riposo
    const nk = k + Math.max(1, Math.round(climbCost(Math.hypot(dxz, dh), M[gn], UP[gn]) * Q));
    return nk > maxKey ? -1 : nk;            // stamina finita: non si passa
  }

  for (const [i, j] of startCells) {
    if (j < j0 || j > j1) continue;
    const c = (j - j0) * nx + i;
    key[c] = 0; buckets[0].push(c);
  }

  // Dijkstra con "insieme chiuso": ogni cella viene fissata la prima volta che esce
  // dalla coda. Arrivare su terreno piano riporta la chiave a 0, quindi l'ordine non
  // è perfettamente monotono: il risultato è leggermente prudente (può sottostimare
  // cosa è raggiungibile, mai sovrastimarlo) — un percorso trovato è sempre valido.
  let cur = 0, goal = -1, visited = 0;
  const cand = [];   // [distanza dall'obiettivo, cella] per il riparatore
  for (;;) {
    while (cur <= maxKey && heads[cur] === buckets[cur].length) cur++;
    if (cur > maxKey) break;
    const c = buckets[cur][heads[cur]++];
    if (closed[c] || key[c] !== cur) continue;
    closed[c] = 1;
    visited++;
    const i = c % nx, j = j0 + ((c / nx) | 0);
    const g = j * nx + i;
    if (isGoal(i, j)) { goal = c; break; }
    if (!(F[g] & FLAG_STAND) && cur <= highLimit)
      cand.push([Math.hypot(T.xOf(i) - target.x, T.zOf(j) - target.z, H[g] - target.y), c]);
    for (let k = 0; k < 8; k++) {
      const ni = i + DI[k], nj = j + DJ[k];
      if (ni < 0 || ni >= nx || nj < j0 || nj > j1) continue;
      const cn = (nj - j0) * nx + ni;
      if (closed[cn]) continue;
      const nk = arrive(g, nj * nx + ni, cur, DD[k]);
      if (nk < 0 || nk >= key[cn]) continue;
      key[cn] = nk; parent[cn] = c; buckets[nk].push(cn);
      if (nk < cur) cur = nk;
    }
  }

  const toIJ = c => [c % nx, j0 + ((c / nx) | 0)];
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
