// ─────────────────────────────────────────────────────────────────────────────
// GENERATORE DELLA MONTAGNA — pipeline in 7 fasi
//
//   seed ─► 1 layout biomi ─► 2 rumore ─► 3 timbri (falò, cenge, nicchie)
//        ─► 4 cottura griglia ─► 5 materiali ─► 6 validazione + riparazione
//        ─► 7 oggetti (props) e cibo
//
// Ogni fase usa un RNG separato (rng.fork) così le fasi sono indipendenti.
// Il risultato è un oggetto "world" puro (nessuna dipendenza da three.js):
// lo puoi generare anche in Node (vedi tools/test-gen.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import { RNG, hashString, hash2 } from './rng.js';
import { Noise3 } from './noise.js';
import { BIOMES, BIOME_SLOTS } from './biomes.js';
import { Surface, FLAG_STAND } from './surface.js';
import { solveSegment } from './pathfind.js';
import { MAT, ROUTE_SAFETY } from './rules.js';

const TAU = Math.PI * 2;
const TRANSITION = 8;       // metri di sfumatura tra due biomi
const BUCKET = 8;           // metri per "secchiello" di timbri (accelerazione spaziale)

export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
};

// ── FASE 1: layout ───────────────────────────────────────────────────────────
// Per ogni slot sceglie un bioma, la sua altezza e quanto si stringe la montagna.
function buildLayout(rng) {
  const biomes = [];
  let y = 0, r = rng.range(132, 146);
  BIOME_SLOTS.forEach((slot, index) => {
    const id = slot.length === 1 ? slot[0] : rng.pick(slot);
    const def = BIOMES[id];
    const h = rng.range(def.height[0], def.height[1]);
    const r1 = r * rng.range(def.taper[0], def.taper[1]);
    biomes.push({ index, id, def, name: def.name, y0: y, y1: y + h, r0: r, r1, slot });
    y += h; r = r1;
  });
  return { biomes, height: y };
}

function biomeAtY(layout, y) {
  for (const b of layout.biomes) if (y < b.y1) return b;
  return layout.biomes[layout.biomes.length - 1];
}

// raggio di base "liscio" (senza gradoni né rumore)
function plainBase(b, y) {
  return b.r0 + (b.r1 - b.r0) * b.def.profile(clamp01((y - b.y0) / (b.y1 - b.y0)));
}

// Pesi di fusione dei biomi a una quota. La somma è sempre 1.
export function biomeWeights(layout, y) {
  const out = [], last = layout.biomes.length - 1;
  for (const b of layout.biomes) {
    let w = 1;
    if (b.index > 0) w *= smoothstep(b.y0 - TRANSITION / 2, b.y0 + TRANSITION / 2, y);
    if (b.index < last) w *= 1 - smoothstep(b.y1 - TRANSITION / 2, b.y1 + TRANSITION / 2, y);
    if (w > 1e-4) out.push([b, w]);
  }
  return out;
}

// ── FASE 3: timbri ───────────────────────────────────────────────────────────
// Strutture discrete sommate al rumore: cenge (ledge), mensole (cap), nicchie (alcove).
class StampSet {
  constructor() { this.list = []; this.buckets = new Map(); }
  add(s) {
    this.list.push(s);
    const lo = Math.floor((s.y - (s.thick || 0) - 1) / BUCKET);
    const hi = Math.floor((s.y + (s.h || 0) + 1) / BUCKET);
    for (let k = lo; k <= hi; k++) {
      if (!this.buckets.has(k)) this.buckets.set(k, []);
      this.buckets.get(k).push(s);
    }
    return s;
  }
  near(y) { return this.buckets.get(Math.floor(y / BUCKET)) || []; }
}

function stampOffset(stamps, theta, y, rowBase) {
  let pos = 0, neg = 0;
  for (const s of stamps.near(y)) {
    const dA = Math.abs(angDiff(theta, s.theta)) * rowBase;
    if (dA >= s.halfArc) continue;
    const dy = y - s.y;
    if (s.kind === 'alcove') {
      // nicchia scavata: pavimento piatto a quota s.y, alta s.h
      if (dy < 0 || dy > s.h) continue;
      const fa = smoothstep(s.halfArc, s.halfArc * 0.5, dA);
      const g = smoothstep(0, 0.45, dy) * smoothstep(s.h, s.h - 1.0, dy);
      neg = Math.min(neg, -s.depth * fa * g);
    } else {
      // cengia: sommità piatta a quota s.y, sotto si assottiglia nella parete (a cuneo)
      if (dy > 0.01 || dy < -s.thick) continue;
      const fa = s.kind === 'cap'
        ? Math.sqrt(Math.max(0, 1 - (dA / s.halfArc) ** 2))
        : smoothstep(s.halfArc, s.halfArc * 0.5, dA);
      const g = Math.pow(1 - -dy / s.thick, 0.6);
      pos = Math.max(pos, s.depth * fa * g);
    }
  }
  return pos + neg;
}

function nearSafeStamp(stamps, theta, y, rowBase) {
  for (const s of stamps.near(y)) {
    if (!s.safe) continue;
    if (y < s.y - 1.5 || y > s.y + (s.h || 0) + 1.5) continue;
    if (Math.abs(angDiff(theta, s.theta)) * rowBase < s.halfArc + 1.5) return true;
  }
  return false;
}

// ── contesto di generazione ─────────────────────────────────────────────────
class Ctx {
  constructor(seed) {
    this.seed = seed;
    this.seedHash = hashString(seed);
    this.root = new RNG(this.seedHash);
    this.layout = buildLayout(this.root.fork('layout'));
    this.N = new Noise3(this.root.fork('noise'));
    this.surf = new Surface(this.layout.height);
    this.stamps = new StampSet();
    const s = this.surf;
    this.cos = new Float64Array(s.W); this.sin = new Float64Array(s.W); this.wob = new Float64Array(s.W);
    for (let i = 0; i < s.W; i++) {
      const th = s.theta(i);
      this.cos[i] = Math.cos(th); this.sin[i] = Math.sin(th);
      // confini dei biomi ondulati: la quota del passaggio varia attorno alla montagna
      this.wob[i] = 5 * this.N.fbm(this.cos[i] * 1.5 + 50, 3.3, this.sin[i] * 1.5 + 50, 3);
    }
    this.rowBase = new Float64Array(s.rows);
    for (let j = 0; j < s.rows; j++) {
      const y = j * s.dy;
      this.rowBase[j] = y > this.layout.height ? 0 : plainBase(biomeAtY(this.layout, y), y);
    }
    this.p = { theta: 0, y: 0, t: 0, base: 0, x: 0, z: 0 };
  }

  // gradoni: "quantizza" la quota → il raggio resta costante (parete) e poi cala di colpo (cengia)
  terraceY(b, i, y) {
    const T = b.def.terrace;
    if (!T) return y;
    const jit = T.jitter * this.N.perlin(this.cos[i] * 2.2 + b.index * 17, y * 0.015, this.sin[i] * 2.2);
    const v = (y - b.y0 + jit) / T.step;
    const f = Math.floor(v);
    return b.y0 - jit + T.step * (f + smoothstep(1 - T.sharp, 1, v - f));
  }

  evalBiome(b, i, y) {
    const yq = this.terraceY(b, i, y);
    const base = b.r0 + (b.r1 - b.r0) * b.def.profile(clamp01((yq - b.y0) / (b.y1 - b.y0)));
    const p = this.p;
    p.t = clamp01((y - b.y0) / (b.y1 - b.y0));
    p.base = base;
    return base + b.def.shape(p, this.N) * Math.min(1, base / 10);
  }

  // ── FASE 4: cottura delle righe [j0, j1] ───────────────────────────────────
  bakeRows(j0, j1) {
    const s = this.surf, W = s.W, H = this.layout.height, p = this.p;
    j0 = Math.max(0, j0); j1 = Math.min(s.rows - 1, j1);
    for (let j = j0; j <= j1; j++) {
      const y = j * s.dy, rb = this.rowBase[j];
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        if (y > H) { s.R[c] = 0; continue; }
        p.theta = s.theta(i); p.y = y;
        p.x = this.cos[i] * rb; p.z = this.sin[i] * rb;
        let r = 0;
        for (const [b, w] of biomeWeights(this.layout, y + this.wob[i])) r += w * this.evalBiome(b, i, y);
        // "lobi": variazione a bassissima frequenza → sezione non circolare, speroni e valli
        r *= 1 + 0.16 * this.N.fbm(this.cos[i] * 1.3 + 9, y * 0.006, this.sin[i] * 1.3 + 9, 2);
        r += stampOffset(this.stamps, p.theta, y, rb);
        s.R[c] = Math.max(r, y > H - 0.6 ? 0 : 0.5);
      }
    }
  }

  // ── FASE 5: materiali (dopo le derivate, perché dipendono da "calpestabile") ─
  paintRows(j0, j1) {
    const s = this.surf, W = s.W, p = this.p;
    j0 = Math.max(0, j0); j1 = Math.min(s.rows - 1, j1);
    for (let j = j0; j <= j1; j++) {
      const y = j * s.dy, rb = this.rowBase[j];
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        // scelta del bioma con dithering: ai confini le celle si mescolano a "puntini"
        let best = null, bestV = -1;
        for (const [b, w] of biomeWeights(this.layout, y + this.wob[i])) {
          const v = w + (hash2(i, j * 7 + b.index, this.seedHash) - 0.5) * 0.6;
          if (v > bestV) { bestV = v; best = b; }
        }
        s.B[c] = best.index;
        p.theta = s.theta(i); p.y = y; p.x = this.cos[i] * rb; p.z = this.sin[i] * rb;
        p.t = clamp01((y - best.y0) / (best.y1 - best.y0)); p.base = rb;
        let m = best.def.material(p, this.N, { flat: (s.F[c] & FLAG_STAND) !== 0, up: s.UP[c] });
        if (m === MAT.LAVA && nearSafeStamp(this.stamps, p.theta, y, rb)) m = MAT.ROCK;
        s.M[c] = m;
      }
    }
  }

  rebuild(j0, j1) {
    this.bakeRows(j0, j1);
    this.surf.computeDerived(j0 - 1, j1 + 1);
    this.paintRows(j0 - 1, j1 + 1);
  }
}

// ── FASE 3a: falò ai confini tra biomi ──────────────────────────────────────
function placeCampfires(ctx, rng) {
  const out = [];
  let theta = rng.range(0, TAU);
  const spawnTheta = theta;
  const bs = ctx.layout.biomes;
  for (let k = 0; k < bs.length - 1; k++) {
    // ogni falò si sposta un po' attorno alla montagna rispetto al precedente
    theta = (theta + rng.range(-2.0, 2.0) + TAU) % TAU;
    const y = Math.round(bs[k].y1 / ctx.surf.dy) * ctx.surf.dy;
    const halfArc = 7;
    const stamp = ctx.stamps.add({ kind: 'ledge', tag: 'campfire', theta, y, halfArc, depth: 5, thick: 8, safe: true });
    out.push({ index: k, theta, y, halfArc, stamp, biome: bs[k].index });
  }
  return { campfires: out, spawnTheta };
}

// ── FASE 3b: strutture sparse nei biomi ─────────────────────────────────────
function placeFeatures(ctx, rng) {
  let count = 0;
  for (const b of ctx.layout.biomes) {
    for (const st of b.def.stamps || []) {
      const area = (b.y1 - b.y0) * TAU * (b.r0 + b.r1) * 0.5;
      const n = Math.round(area * st.density);
      for (let k = 0; k < n; k++) {
        const y = Math.round(rng.range(b.y0 + 3, b.y1 - 3) / ctx.surf.dy) * ctx.surf.dy;
        const s = {
          kind: st.kind, tag: b.id, theta: rng.range(0, TAU), y,
          halfArc: rng.range(st.halfArc[0], st.halfArc[1]),
          depth: rng.range(st.depth[0], st.depth[1]),
        };
        if (st.thick) s.thick = rng.range(st.thick[0], st.thick[1]);
        if (st.h) s.h = rng.range(st.h[0], st.h[1]);
        ctx.stamps.add(s); count++;
      }
    }
  }
  return count;
}

// ── FASE 6: validazione e riparazione ───────────────────────────────────────
function cellsWhere(surf, j0, j1, pred) {
  const out = [];
  for (let j = Math.max(0, j0); j <= Math.min(surf.rows - 1, j1); j++)
    for (let i = 0; i < surf.W; i++) if (pred(i, j)) out.push([i, j]);
  return out;
}

function validateRoute(ctx, campfires, spawnTheta) {
  const s = ctx.surf, H = ctx.layout.height, dy = s.dy;
  const inFire = (f, slack = 0.6) => (i, j) =>
    (s.F[j * s.W + i] & FLAG_STAND) && Math.abs(j * dy - f.y) <= 1.0 &&
    Math.abs(angDiff(s.theta(i), f.theta)) * ctx.rowBase[j] <= f.halfArc * slack;

  const segments = [];
  const repairs = [];
  let startY = 0;
  let startCells = cellsWhere(s, 0, 2, (i, j) =>
    Math.abs(angDiff(s.theta(i), spawnTheta)) * ctx.rowBase[j] < 14);

  for (let k = 0; k <= campfires.length; k++) {
    const last = k === campfires.length;
    const goalY = last ? H - 2.5 : campfires[k].y;
    const isGoal = last ? (i, j) => j * dy >= goalY : inFire(campfires[k]);
    const target = last ? { y: H, theta: 0, top: true } : campfires[k];
    const j0 = Math.max(0, Math.floor(startY / dy) - 6);
    const j1 = Math.min(s.rows - 2, Math.ceil(goalY / dy) + 8);
    let res, segRepairs = 0;
    const tried = [];
    for (let iter = 0; iter < 80; iter++) {
      res = solveSegment(s, { startCells, isGoal, target, j0, j1, budget: ROUTE_SAFETY });
      if (res.ok) break;
      // RIPARAZIONE: scava una nicchia (punto di riposo) nella cella di parete
      // raggiungibile più vicina all'obiettivo. Il percorso fin lì resta valido,
      // quindi ogni giro avvicina il traguardo. Saltiamo i punti già tentati.
      const pick = res.candidates.find(([ci, cj]) => !tried.some(([ti, tj]) =>
        Math.abs(cj - tj) * dy < 2.5 && Math.abs(angDiff(s.theta(ci), s.theta(ti))) * ctx.rowBase[cj] < 2.5));
      if (!pick) break;
      const [hi, hj] = pick;
      tried.push(pick);
      const stamp = ctx.stamps.add({
        kind: 'alcove', tag: 'repair', theta: s.theta(hi), y: hj * dy,
        // più la parete strapiomba, più a fondo bisogna scavare per avere un pavimento piatto
        halfArc: 1.8, depth: 1.6 + 2.2 * Math.max(0, s.DRDY[hj * s.W + hi]), h: 2.4, safe: true,
      });
      ctx.rebuild(hj - 1, hj + 7);
      repairs.push({ segment: k, theta: stamp.theta, y: stamp.y });
      segRepairs++;
    }
    segments.push({
      index: k, from: startY, to: goalY, ok: res.ok, repairs: segRepairs,
      visited: res.visited, path: res.path,
    });
    if (!last) {
      startY = campfires[k].y;
      startCells = cellsWhere(s, Math.floor(startY / dy) - 2, Math.ceil(startY / dy) + 2, inFire(campfires[k], 0.8));
    }
  }
  return { segments, repairs };
}

// ── FASE 7: oggetti ─────────────────────────────────────────────────────────
// Prova `tries` posizioni casuali; tiene solo quelle che rispettano le regole
// (bioma giusto, cengia abbastanza profonda, distanza minima dagli altri).
// È "dart throwing", la versione semplice del Poisson-disc sampling.
class SpatialHash {
  constructor(size) { this.size = size; this.map = new Map(); }
  key(x, y, z) { return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`; }
  add(o) {
    const k = this.key(o.x, o.y, o.z);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(o);
  }
  free(x, y, z, dist) {
    const n = Math.ceil(dist / this.size), S = this.size;
    const cx = Math.floor(x / S), cy = Math.floor(y / S), cz = Math.floor(z / S);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let c = -n; c <= n; c++) {
      const list = this.map.get(`${cx + a},${cy + b},${cz + c}`);
      if (!list) continue;
      for (const o of list) {
        const d = Math.max(dist, o.spacing || 0);
        if ((o.x - x) ** 2 + (o.y - y) ** 2 + (o.z - z) ** 2 < d * d) return false;
      }
    }
    return true;
  }
}

// Trova un punto su cui appoggiare un oggetto vicino alla cella calpestabile (θ, y).
function ledgeSpot(surf, theta, y, minDepth) {
  const rWall = surf.radius(theta, y + 1.0);
  const rEdge = surf.radius(theta, y - 0.5);
  const depth = rEdge - rWall;
  if (depth < minDepth) return null;
  const r = rWall + Math.min(depth * 0.5, depth - 0.6);
  const yg = surf.groundHeight(theta, r, y - 2, y + 2);
  if (yg === null || surf.upNormal(theta, yg - 0.05) < 0.6) return null;
  return { r, y: yg, depth };
}

function scatterProps(ctx, rng, campfires) {
  const s = ctx.surf, hash = new SpatialHash(4), props = [];
  for (const f of campfires) hash.add({ ...s.toWorld(f.theta, f.y, f.pos.r), spacing: 6 });
  for (const b of ctx.layout.biomes) {
    for (const rule of b.def.props || []) {
      for (let t = 0; t < rule.tries; t++) {
        const theta = rng.range(0, TAU);
        const y = rng.range(b.y0, b.y1);
        const c = s.cell(theta, y);
        if (s.B[c] !== b.index || !(s.F[c] & FLAG_STAND)) continue;
        const spot = ledgeSpot(s, theta, y, rule.minDepth);
        if (!spot) continue;
        const w = s.toWorld(theta, spot.y, spot.r);
        if (!hash.free(w.x, w.y, w.z, rule.spacing)) continue;
        const prop = { type: rule.type, ...w, theta, r: spot.r, yaw: rng.range(0, TAU),
          scale: rng.range(rule.scale[0], rule.scale[1]), spacing: rule.spacing * 0.5 };
        hash.add(prop); props.push(prop);
      }
    }
  }
  return { props, hash };
}

// Il cibo va lungo il percorso validato: così chi segue la via "giusta" lo trova.
function placeFood(ctx, rng, segments, hash) {
  const s = ctx.surf, food = [];
  for (const seg of segments) {
    const rests = seg.path.filter(([i, j]) => s.F[j * s.W + i] & FLAG_STAND);
    const n = Math.min(4, Math.floor(rests.length / 40));
    for (let k = 1; k <= n; k++) {
      const [i, j] = rests[Math.floor((k / (n + 1)) * rests.length)];
      const theta = s.theta(i) + rng.range(-0.004, 0.004);
      const spot = ledgeSpot(s, theta, j * s.dy, 0.8);
      if (!spot) continue;
      const w = s.toWorld(theta, spot.y + 0.4, spot.r);
      if (!hash.free(w.x, w.y, w.z, 3)) continue;
      const item = { type: 'food', ...w, theta, r: spot.r, taken: false };
      hash.add(item); food.push(item);
    }
  }
  return food;
}

// ── PIPELINE COMPLETA ───────────────────────────────────────────────────────
export function generateMountain(seed) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const timings = {};
  let t = now();
  const lap = name => { const n = now(); timings[name] = Math.round(n - t); t = n; };

  const ctx = new Ctx(String(seed));
  const s = ctx.surf;
  lap('layout+rumore');

  const { campfires, spawnTheta } = placeCampfires(ctx, ctx.root.fork('campfires'));
  const featureCount = placeFeatures(ctx, ctx.root.fork('features'));
  lap('timbri');

  ctx.bakeRows(0, s.rows - 1);
  lap('cottura');
  s.computeDerived(0, s.rows - 1);
  ctx.paintRows(0, s.rows - 1);
  lap('materiali');

  const route = validateRoute(ctx, campfires, spawnTheta);
  lap('validazione');

  for (const f of campfires) {
    const rWall = s.radius(f.theta, f.y + 1.5);
    const r = rWall + 3;
    const y = s.groundHeight(f.theta, r, f.y - 3, f.y + 3) ?? f.y;
    f.pos = { r, y, ...s.toWorld(f.theta, y, r) };
    // punto di rinascita: accanto al fuoco, non dentro
    const th2 = f.theta + 2.4 / r, r2 = rWall + 2;
    const y2 = s.groundHeight(th2, r2, f.y - 3, f.y + 3) ?? y;
    f.spawn = { r: r2, y: y2, ...s.toWorld(th2, y2, r2) };
  }
  const { props, hash } = scatterProps(ctx, ctx.root.fork('props'), campfires);
  const food = placeFood(ctx, ctx.root.fork('food'), route.segments, hash);
  lap('oggetti');

  const r0 = s.radius(spawnTheta, 0.2) + 14;
  const spawn = { theta: spawnTheta, r: r0, ...s.toWorld(spawnTheta, 0, r0) };

  return {
    seed: ctx.seed, seedHash: ctx.seedHash,
    layout: ctx.layout, height: ctx.layout.height,
    surface: s, noise: ctx.N, rowBase: ctx.rowBase,
    stamps: ctx.stamps.list,
    campfires, spawn, props, food,
    route,
    stats: {
      timings,
      cells: s.W * s.rows,
      features: featureCount,
      repairs: route.repairs.length,
      allReachable: route.segments.every(g => g.ok),
      props: props.length,
      food: food.length,
    },
  };
}

// Parametri ambientali (cielo, nebbia, temperatura) fusi in base alla quota.
export function environmentAt(world, y) {
  const env = { temperature: 0, weights: biomeWeights(world.layout, y) };
  for (const [b, w] of env.weights) env.temperature += w * b.def.temperature;
  env.main = env.weights.reduce((a, c) => (c[1] > a[1] ? c : a))[0];
  return env;
}
