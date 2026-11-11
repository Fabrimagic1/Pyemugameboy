// ─────────────────────────────────────────────────────────────────────────────
// VIE SUL MUCCHIO DI MACIGNI
// Con i macigni le cenge non sono disegnate: sono le facce piane che capitano.
// Quindi il validatore lavora su un GRAFO DI APPOGGI:
//   nodo  = un punto dove si può stare in piedi e riposare (stamina piena)
//   arco  = si può andare da un appoggio all'altro
//            · camminando (vicini e quasi alla stessa quota) o saltando giù: gratis
//            · arrampicando: solo se la distanza sta nel budget di stamina,
//              calcolato con le stesse regole del giocatore (rules.js)
// Una via è un cammino nel grafo: ogni tratto in parete parte e arriva su un riposo.
// ─────────────────────────────────────────────────────────────────────────────
import { CLIMB, MAT_INFO, ROUTE_SAFETY } from './rules.js';

const HASH = 4;        // lato delle celle dell'indice (m)
const DETOUR = 1.25;   // in parete non si va in linea retta: margine sul percorso
const DROP = 3.5;      // si può saltare giù da 3.5 m senza ferirsi
const MAX_R = 4;       // raggio massimo considerato per una cengia

// quanti metri si possono scalare tra due riposi su un dato materiale
export function climbReach(kind) {
  const perMeter = CLIMB.drainPerMeter * MAT_INFO[kind].climb * 1.25 + CLIMB.idleDrain / CLIMB.speedUp;
  return ROUTE_SAFETY / (DETOUR * perMeter);
}

export class RestGraph {
  constructor(nodes, sdf) {
    this.nodes = nodes; this.sdf = sdf;
    this.map = new Map(); this.cache = new Map();
    this.reach = MAT_INFO.map((m, k) => (Number.isFinite(m.climb) ? climbReach(k) : 0));
    this.maxReach = Math.max(...this.reach);
    this.refresh(0);
  }
  key(x, y, z) { return ((Math.floor(x / HASH) + 512) * 1024 + Math.floor(y / HASH) + 64) * 1024 + Math.floor(z / HASH) + 512; }
  // indicizza i nodi da `from` in poi (dopo una riparazione) e dimentica gli archi dei vicini
  refresh(from) {
    for (let i = from; i < this.nodes.length; i++) {
      const p = this.nodes[i], k = this.key(p.x, p.y, p.z);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(i);
      if (from > 0) for (const j of this.near(p.x, p.y, p.z, this.maxReach + 2 * MAX_R)) this.cache.delete(j);
    }
  }
  near(x, y, z, r) {
    const out = [], n = Math.ceil(r / HASH), cx = Math.floor(x / HASH), cy = Math.floor(y / HASH), cz = Math.floor(z / HASH);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let c = -n; c <= n; c++) {
      const list = this.map.get(((cx + a + 512) * 1024 + cy + b + 64) * 1024 + cz + c + 512);
      if (!list) continue;
      for (const i of list) { const p = this.nodes[i]; if ((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 <= r * r) out.push(i); }
    }
    return out;
  }
  // archi uscenti dal nodo i: [destinazione, 'walk' | 'climb']
  edges(i) {
    if (this.cache.has(i)) return this.cache.get(i);
    const a = this.nodes[i], out = [];
    for (const j of this.near(a.x, a.y, a.z, this.maxReach + 2 * MAX_R)) {
      if (j === i) continue;
      const b = this.nodes[j], dy = b.y - a.y, hd = Math.hypot(b.x - a.x, b.z - a.z);
      // ogni appoggio è una superficie larga r: si cammina fino al suo bordo, poi si scala
      const gap = Math.max(0, hd - a.r - b.r);
      if ((gap <= 1.2 && Math.abs(dy) <= 0.8) || (dy < 0 && dy >= -DROP && gap <= 1.5)) { out.push([j, 'walk']); continue; }
      if (Math.hypot(gap, dy) > this.reach[b.kind] || dy < -6) continue;
      // il tratto deve restare vicino alla roccia: non si scala nel vuoto
      let ok = true;
      for (const t of [0.25, 0.5, 0.75]) if (this.sdf(a.x + (b.x - a.x) * t, a.y + dy * t + 0.6, a.z + (b.z - a.z) * t) > 2.2) { ok = false; break; }
      if (ok) out.push([j, 'climb']);
    }
    this.cache.set(i, out);
    return out;
  }
}

// Cammino con meno tratti da `start` a `goal` (BFS). Se non esiste, `closest` è il nodo
// raggiunto più vicino al traguardo: lì il generatore aggiunge un appoggio.
export function findRoute(graph, start, goal, blocked, avoid) {
  const prev = new Map([[start, [-1, '']]]), queue = [start], g = graph.nodes[goal];
  let closest = start, best = Infinity;
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (i === goal) break;
    const p = graph.nodes[i], d = Math.hypot(p.x - g.x, (p.y - g.y) * 1.3, p.z - g.z);
    if (d < best && !(avoid && avoid.has(i))) { best = d; closest = i; }   // avoid: punti da cui si è già provato a riparare
    for (const [j, type] of graph.edges(i)) {
      if (prev.has(j) || (blocked && blocked.has(j) && j !== goal)) continue;
      prev.set(j, [i, type]); queue.push(j);
    }
  }
  if (!prev.has(goal)) return { path: null, closest, visited: prev.size };
  const path = [], types = [];
  for (let i = goal; i !== -1; i = prev.get(i)[0]) { path.push(i); if (prev.get(i)[0] !== -1) types.push(prev.get(i)[1]); }
  return { path: path.reverse(), types: types.reverse(), closest, visited: prev.size };
}
