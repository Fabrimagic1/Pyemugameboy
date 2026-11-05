// ─────────────────────────────────────────────────────────────────────────────
// GENERATORE DELLA MONTAGNA — pipeline in 7 fasi
//
//   seed ─► 1 layout (profilo avanti+salita) ─► 2 rumore
//        ─► 3 timbri (falò, passaggi = vie alternative, cenge) ─► 4 cottura heightmap
//        ─► 5 materiali ─► 6 validazione di PIÙ VIE + riparazione ─► 7 oggetti e cibo
//
// Il mondo è un corridoio: x laterale, z in avanti, y in alto. Si parte dalla
// spiaggia (z≈0) e la vetta è in fondo (z = length). Ogni fase usa un RNG
// separato (rng.fork) così le fasi sono indipendenti.
// Il risultato è un oggetto "world" puro (nessuna dipendenza da three.js):
// lo puoi generare anche in Node (vedi tools/test-gen.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import { RNG, hashString, hash2 } from './rng.js';
import { Noise3 } from './noise.js';
import { BIOMES, BIOME_SLOTS } from './biomes.js';
import { Terrain, FLAG_STAND } from './surface.js';
import { solveSegment } from './pathfind.js';
import { MAT, CELL, SEA, STEP, ROUTE_SAFETY, MIN_ROUTES, MAX_ROUTES, ROUTE_SEPARATION } from './rules.js';

const DEG = Math.PI / 180;
const TRANSITION = 10;   // metri di sfumatura tra due biomi
const BUCKET = 10;       // metri per "secchiello" di timbri (accelerazione spaziale)
const MAX_HW = 82;       // mezza larghezza massima del corridoio
const MARGIN_X = 26;

export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function weighted(rng, weights) {
  const entries = Object.entries(weights);
  let t = rng.next() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { t -= w; if (t <= 0) return k; }
  return entries[entries.length - 1][0];
}

// ── FASE 1: layout ───────────────────────────────────────────────────────────
// Il profilo "di base" è una spezzata (z, y): pianori poco inclinati e pareti
// ripide, bioma dopo bioma. È il motivo per cui si va sempre avanti E in salita.
function buildLayout(rng) {
  const sections = [], pts = [];
  let z = 0, y = 0.5;
  pts.push([z, y]);
  BIOME_SLOTS.forEach((slot, index) => {
    const id = slot.length === 1 ? slot[0] : rng.pick(slot);
    const def = BIOMES[id], st = def.steps;
    const last = index === BIOME_SLOTS.length - 1;
    let L = rng.range(def.length[0], def.length[1]);
    const startFlat = index === 0 ? def.beach : 12;
    const endFlat = last ? 14 : 26;           // il pianoro del falò
    const n = rng.int(st.count[0], st.count[1]);
    const cliffs = [];
    let run = 0;
    for (let k = 0; k < n; k++) {
      const Hc = rng.range(st.cliff[0], st.cliff[1]);
      const r = Hc / Math.tan(rng.range(st.angle[0], st.angle[1]) * DEG);
      cliffs.push({ Hc, run: r }); run += r;
    }
    L = Math.max(L, startFlat + endFlat + run + (n - 1) * 10);
    const floorTotal = L - startFlat - endFlat - run;
    const w = Array.from({ length: Math.max(1, n - 1) }, () => rng.range(0.6, 1.4));
    const ws = w.reduce((a, b) => a + b, 0);

    const sec = { index, id, def, name: def.name, slot, z0: z, y0: y, cliffs: [] };
    const floor = (len, slope) => { z += len; y += len * Math.tan(slope * DEG); pts.push([z, y]); };
    floor(startFlat, index === 0 ? 0.8 : 2);
    cliffs.forEach((c, k) => {
      const zB = z, yB = y;
      z += c.run; y += c.Hc; pts.push([z, y]);
      sec.cliffs.push({ index: k, zB, zT: z, yB, yT: y });
      if (k < n - 1) floor((floorTotal * w[k]) / ws, rng.range(st.slope[0], st.slope[1]));
    });
    floor(endFlat, 1.5);
    sec.z1 = z; sec.y1 = y;
    sec.fireZ = z - endFlat * 0.5;
    sections.push(sec);
  });
  return { sections, pts, length: z, top: y };
}

// ── FASE 3: timbri ───────────────────────────────────────────────────────────
// Tutti i timbri vivono nel sistema "raddrizzato" (x, z') in cui le pareti sono
// linee dritte; poi lo spostamento shift(x, z) le fa ondulare nel mondo reale.
class StampSet {
  constructor() { this.list = []; this.buckets = new Map(); }
  add(s) {
    this.list.push(s);
    for (let k = Math.floor(s.zmin / BUCKET); k <= Math.floor(s.zmax / BUCKET); k++) {
      if (!this.buckets.has(k)) this.buckets.set(k, []);
      this.buckets.get(k).push(s);
    }
    return s;
  }
  near(zp) { return this.buckets.get(Math.floor(zp / BUCKET)) || EMPTY; }
}
const EMPTY = [];

// Applica i timbri a una quota h nel punto (x, z').
function applyStamps(stamps, x, zp, h) {
  for (const s of stamps.near(zp)) {
    if (x < s.xmin || x > s.xmax || zp < s.zmin || zp > s.zmax) continue;
    switch (s.kind) {
      case 'ramp': {
        // cengia in diagonale: sale lungo x e si appoggia alla parete
        const t0 = (x - s.x0) / (s.x1 - s.x0);
        let ry = s.yB + (s.yT - s.yB) * clamp01(s.dir > 0 ? t0 : 1 - t0);
        ry -= Math.max(0, s.zA - s.w - zp) * 2.5 + Math.max(0, s.x0 - x, x - s.x1) * 2.5;
        if (ry > h) h = ry;
        break;
      }
      case 'stairs': {
        // parete a gradoni: pedate piatte (riposo) e alzate ripide
        const q = clamp01((zp - s.zS) / (s.zB - s.zS)) * s.n;
        const f = Math.min(Math.floor(q), s.n - 1);
        let ys = s.yB + ((s.yT - s.yB) * (f + smoothstep(0.7, 1, q - f))) / s.n;
        ys -= Math.max(0, Math.abs(x - s.xc) - s.hw) * 2.5 + Math.max(0, s.zS - zp) * 2.5;
        if (ys > h) h = ys;
        break;
      }
      case 'gully': {
        // canalone: taglia la parete con un piano meno ripido
        const gy = s.yB + Math.max(0, zp - s.zA) * s.tan + Math.max(0, Math.abs(x - s.xc) - s.hw) * 3;
        if (gy < h) h = gy;
        break;
      }
      case 'notch': {
        // cengia/nicchia: spiana la parete alla quota `level` (solo ciò che sta sopra)
        const d = Math.hypot(x - s.x, zp - s.zp);
        if (d < s.r && h > s.level) h = s.level + (h - s.level) * smoothstep(s.r * 0.6, s.r, d);
        break;
      }
      case 'flat': {
        // spianata (falò, vetta)
        const d = Math.hypot(x - s.x, zp - s.zp);
        if (d < s.r) h = s.level + (h - s.level) * smoothstep(s.r * 0.65, s.r, d);
        break;
      }
    }
  }
  return h;
}

function stampInfo(stamps, x, zp) {
  let mat = -1, safe = false;
  for (const s of stamps.near(zp)) {
    if (x < s.xmin || x > s.xmax || zp < s.zmin || zp > s.zmax) continue;
    if (s.safe) safe = true;
    if (s.kind === 'gully' && Math.abs(x - s.xc) < s.hw + 0.6 && zp > s.zA - 0.5) mat = s.mat;
  }
  return { mat, safe };
}

// ── contesto di generazione ─────────────────────────────────────────────────
class Ctx {
  constructor(seed) {
    this.seed = seed;
    this.seedHash = hashString(seed);
    this.root = new RNG(this.seedHash);
    this.layout = buildLayout(this.root.fork('layout'));
    this.N = new Noise3(this.root.fork('noise'));
    const L = this.layout.length, W = MAX_HW + MARGIN_X;
    this.T = new Terrain(-W, -45, Math.ceil((2 * W) / CELL) + 1, Math.ceil((L + 85) / CELL) + 1);
    this.stamps = new StampSet();
    this.p = { x: 0, y: 0, z: 0, t: 0 };
  }

  // il corridoio si stringe man mano che si sale, fino alla vetta
  halfWidth(z) {
    const L = this.layout.length, t = clamp01(z / L);
    return Math.min(MAX_HW - 50 * t, 9 + Math.max(0, L - z) * 1.3);
  }

  // ondulazione delle pareti: a bassa frequenza (curve) + media (speroni)
  shift(x, z) {
    const N = this.N;
    return 7 * N.fbm(x * 0.012 + 3.1, z * 0.008, 1.7, 2) + 2.5 * N.fbm(x * 0.05 + 11, z * 0.02, 5.1, 2);
  }
  realZ(x, zp) { let z = zp; for (let k = 0; k < 5; k++) z = zp + this.shift(x, z); return z; }

  profile(zp) {
    const P = this.layout.pts;
    if (zp <= 0) return P[0][1] + zp * 0.05;           // la spiaggia scende in mare
    if (zp >= P[P.length - 1][0]) return P[P.length - 1][1];
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][0] <= zp) lo = m; else hi = m; }
    const [za, ya] = P[lo], [zb, yb] = P[hi];
    return ya + ((yb - ya) * (zp - za)) / (zb - za);
  }

  // Pesi di fusione dei biomi (somma 1), in funzione di z'.
  weights(zp) {
    const out = [], S = this.layout.sections, last = S.length - 1;
    for (const b of S) {
      let w = 1;
      if (b.index > 0) w *= smoothstep(b.z0 - TRANSITION / 2, b.z0 + TRANSITION / 2, zp);
      if (b.index < last) w *= 1 - smoothstep(b.z1 - TRANSITION / 2, b.z1 + TRANSITION / 2, zp);
      if (w > 1e-4) out.push([b, w]);
    }
    return out;
  }

  // ── FASE 4: cottura delle righe [j0, j1] ───────────────────────────────────
  bakeRows(j0, j1) {
    const T = this.T, nx = T.nx, p = this.p, L = this.layout.length, N = this.N;
    j0 = Math.max(0, j0); j1 = Math.min(T.nz - 1, j1);
    for (let j = j0; j <= j1; j++) {
      const z = T.zOf(j);
      const hw = this.halfWidth(z);
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i, x = T.xOf(i);
        const s = this.shift(x, z), zp = z - s;
        T.SH[c] = s;
        const base = this.profile(zp);
        p.x = x; p.y = base; p.z = z;
        let h = base;
        for (const [b, w] of this.weights(zp)) {
          p.t = clamp01((zp - b.z0) / (b.z1 - b.z0));
          h += w * b.def.shape(p, N);
        }
        h = applyStamps(this.stamps, x, zp, h);
        // ai lati il corridoio cade in mare: bordo irregolare (rumore) e fianchi a scarpata
        const side = x < 0 ? -1 : 1;
        const d = Math.abs(x) - hw - 9 * N.fbm(z * 0.015 + side * 40, 2.2, x * 0.01, 3);
        if (d > 0) h -= d * (0.9 + 0.6 * N.perlin(z * 0.03, side * 9.1, 4.4)) + 0.02 * d * d;
        if (z > L) h -= (z - L) * 1.8;            // dietro la vetta si precipita
        T.H[c] = Math.max(h, -14);
      }
    }
  }

  // ── FASE 5: materiali (dopo le normali, perché dipendono da "calpestabile") ─
  paintRows(j0, j1) {
    const T = this.T, nx = T.nx, p = this.p;
    j0 = Math.max(0, j0); j1 = Math.min(T.nz - 1, j1);
    for (let j = j0; j <= j1; j++) {
      const z = T.zOf(j);
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i, x = T.xOf(i), zp = z - T.SH[c];
        // scelta del bioma con dithering: ai confini le celle si mescolano a "puntini"
        let best = null, bestV = -1;
        for (const [b, w] of this.weights(zp)) {
          const v = w + (hash2(i, j * 7 + b.index, this.seedHash) - 0.5) * 0.6;
          if (v > bestV) { bestV = v; best = b; }
        }
        T.B[c] = best.index;
        p.x = x; p.y = T.H[c]; p.z = z; p.t = clamp01((zp - best.z0) / (best.z1 - best.z0));
        const flat = (T.F[c] & FLAG_STAND) !== 0;
        let m = best.def.material(p, this.N, { flat, up: T.UP[c] });
        const info = stampInfo(this.stamps, x, zp);
        if (info.mat >= 0 && !flat) m = info.mat;
        if (m === MAT.LAVA && info.safe) m = MAT.ROCK;
        T.M[c] = m;
      }
    }
  }

  rebuild(j0, j1) {
    this.bakeRows(j0, j1);
    this.T.computeDerived(j0 - 1, j1 + 1);
    this.paintRows(j0 - 1, j1 + 1);
  }
}

// ── FASE 3a: falò alla fine di ogni bioma + spianata della vetta ────────────
function placeCampfires(ctx, rng) {
  const fires = [];
  const S = ctx.layout.sections;
  for (const sec of S.slice(0, -1)) {
    const x = rng.range(-1, 1) * ctx.halfWidth(sec.fireZ) * 0.35;
    const level = ctx.profile(sec.fireZ);
    ctx.stamps.add({ kind: 'flat', tag: 'campfire', x, zp: sec.fireZ, level, r: 9, safe: true,
      xmin: x - 9, xmax: x + 9, zmin: sec.fireZ - 9, zmax: sec.fireZ + 9 });
    fires.push({ index: sec.index, x, zp: sec.fireZ, level, section: sec.index });
  }
  const last = S[S.length - 1];
  const zp = last.z1 - 7, level = ctx.profile(zp) + 1;
  ctx.stamps.add({ kind: 'flat', tag: 'peak', x: 0, zp, level, r: 6, safe: true, xmin: -6, xmax: 6, zmin: zp - 6, zmax: zp + 6 });
  return { fires, peak: { x: 0, zp, level } };
}

// ── FASE 3b: passaggi (vie alternative) e cenge naturali su ogni parete ─────
function placePassages(ctx, rng) {
  const passages = [];
  let notches = 0;
  for (const sec of ctx.layout.sections) {
    const def = sec.def;
    for (const c of sec.cliffs) {
      const H = c.yT - c.yB, hw = ctx.halfWidth((c.zB + c.zT) / 2) - 14;
      const n = rng.int(def.passages.count[0], def.passages.count[1]);
      const xs = [];
      for (let t = 0; t < 40 && xs.length < n; t++) {
        const x = rng.range(-hw, hw);
        if (xs.every(o => Math.abs(o - x) > 30)) xs.push(x);
      }
      // tipi DIVERSI sulla stessa parete: così le vie alternative hanno carattere diverso
      const pool = { ...def.passages.weights };
      for (const x of xs) {
        const type = Object.keys(pool).length ? weighted(rng, pool) : weighted(rng, def.passages.weights);
        delete pool[type];
        const e = H / 2.5 + 1; // margine del bordo dei timbri che si alzano
        if (type === 'ramp') {
          const len = Math.min(48, H / Math.tan(rng.range(18, 28) * DEG));
          const dir = rng.chance(0.5) ? 1 : -1, w = rng.range(2.2, 3.2);
          ctx.stamps.add({ kind: 'ramp', x0: x - len / 2, x1: x + len / 2, dir, zA: c.zB, zB: c.zT, w, yB: c.yB, yT: c.yT, safe: true,
            xmin: x - len / 2 - e, xmax: x + len / 2 + e, zmin: c.zB - w - e, zmax: c.zT + 0.5 });
        } else if (type === 'stairs') {
          const k = Math.max(2, Math.round(H / rng.range(3.2, 4.5))), hwS = rng.range(2.5, 4.5), zS = c.zB - k * 1.5;
          ctx.stamps.add({ kind: 'stairs', xc: x, hw: hwS, zS, zB: c.zT, yB: c.yB, yT: c.yT, n: k, safe: true,
            xmin: x - hwS - e, xmax: x + hwS + e, zmin: zS - e, zmax: c.zT + 0.5 });
        } else {
          const tan = Math.tan(rng.range(50, 58) * DEG), hwG = rng.range(1.6, 2.8), zEnd = c.zB + H / tan + 1;
          ctx.stamps.add({ kind: 'gully', xc: x, hw: hwG, zA: c.zB, zEnd, yB: c.yB, yT: c.yT, tan, mat: def.gullyMat,
            xmin: x - hwG - H / 3 - 1, xmax: x + hwG + H / 3 + 1, zmin: c.zB - 1, zmax: zEnd });
        }
        passages.push({ section: sec.index, cliff: c.index, type, x, zp: (c.zB + c.zT) / 2, y: (c.yB + c.yT) / 2 });
      }
      // cenge naturali sparse sulla parete (punti di riposo)
      const count = Math.round(2 * (hw + 14) * H * def.notches);
      for (let k = 0; k < count; k++) {
        const x = rng.range(-hw - 14, hw + 14), f = rng.range(0.15, 0.85), r = rng.range(1.2, 2.2);
        const zp = c.zB + f * (c.zT - c.zB);
        ctx.stamps.add({ kind: 'notch', x, zp, level: c.yB + f * H, r, xmin: x - r, xmax: x + r, zmin: zp - r, zmax: zp + r });
        notches++;
      }
    }
  }
  return { passages, notches };
}

// ── FASE 6: validazione di PIÙ VIE e riparazione ─────────────────────────────
// Per ogni tratto (falò → falò) cerchiamo la via 1. Poi "vietiamo" un corridoio
// largo ROUTE_SEPARATION attorno a lei e cerchiamo la via 2, e così via.
// Se le vie trovate sono meno di MIN_ROUTES, il riparatore scava cenge DENTRO
// la zona ancora libera: così crea una via nuova e diversa, non rinforza la vecchia.
function cellsNear(T, x, z, r, pred = () => true) {
  const out = [];
  const i0 = T.colOf(x - r), i1 = T.colOf(x + r), j0 = T.rowOf(z - r), j1 = T.rowOf(z + r);
  for (let j = Math.max(0, j0); j <= Math.min(T.nz - 1, j1); j++)
    for (let i = Math.max(0, i0); i <= Math.min(T.nx - 1, i1); i++)
      if (Math.hypot(T.xOf(i) - x, T.zOf(j) - z) <= r && pred(i, j)) out.push([i, j]);
  return out;
}

// Vietiamo solo i tratti in cui la via SUPERA UNA PARETE (zona della parete in z'):
// i pianori si possono condividere, ma ogni parete va salita in un punto diverso.
function markCorridor(T, mask, path, radius, keepFree, cliffZones) {
  const rc = Math.ceil(radius / T.C);
  for (let k = 0; k < path.length; k += 2) {
    const [pi, pj] = path[k];
    const zp = T.zOf(pj) - T.SH[pj * T.nx + pi];
    if (!cliffZones.some(([a, b]) => zp >= a && zp <= b)) continue;
    for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
      if (di * di + dj * dj > rc * rc) continue;
      const i = pi + di, j = pj + dj;
      if (!T.inside(i, j)) continue;
      const x = T.xOf(i), z = T.zOf(j), c = j * T.nx + i, czp = z - T.SH[c];
      if (keepFree.some(p => Math.hypot(x - p.x, z - p.z) < p.r)) continue;
      // si vieta solo la fascia della parete, non i pianori: si può sempre attraversare di lato
      if (!cliffZones.some(([a, b]) => czp >= a + 1 && czp <= b - 1)) continue;
      mask[c] = 1;
    }
  }
}

function classifyRoute(T, path, index) {
  let walk = 0, climb = 0, vine = 0, ice = 0, sx = 0, maxY = -Infinity, climbGain = 0;
  for (let k = 1; k < path.length; k++) {
    const [ai, aj] = path[k - 1], [bi, bj] = path[k];
    const a = aj * T.nx + ai, b = bj * T.nx + bi;
    const dxz = T.C * Math.hypot(bi - ai, bj - aj), dh = T.H[b] - T.H[a];
    const d = Math.hypot(dxz, dh);
    if ((T.F[b] & FLAG_STAND) && dh <= STEP) walk += d;
    else { climb += d; climbGain += Math.max(0, dh); if (T.M[b] === MAT.VINE) vine += d; if (T.M[b] === MAT.ICE) ice += d; }
    sx += T.xOf(bi); maxY = Math.max(maxY, T.H[b]);
  }
  // quanta parte del dislivello si guadagna arrampicando (il resto camminando su cenge/rampe)
  const [si, sj] = path[0], [ei, ej] = path[path.length - 1];
  const gain = Math.max(1, T.H[ej * T.nx + ei] - T.H[sj * T.nx + si]);
  const frac = Math.min(1, climbGain / gain), mx = sx / Math.max(1, path.length - 1);
  const kind = frac < 0.3 ? 'sentiero' : frac < 0.65 ? 'misto' : 'parete';
  const side = mx < -12 ? 'sinistra' : mx > 12 ? 'destra' : 'centro';
  return { index, path, walk, climb, vine, ice, climbFrac: frac, meanX: mx, kind, side, label: String.fromCharCode(65 + index) };
}

function validateRoutes(ctx, fires, peak) {
  const T = ctx.T, segments = [], repairs = [];
  const mask = new Uint8Array(T.nx * T.nz);
  // zone delle pareti (in z'), allargate per includere rampe e gradoni davanti alla base
  const cliffZones = ctx.layout.sections.flatMap(sec => sec.cliffs.map(c => [c.zB - 9, c.zT + 2])); // [a+1, b-1] = celle vietate
  let start = { x: 0, z: 6 };
  let startCells = cellsNear(T, 0, 6, 14, (i, j) => T.F[j * T.nx + i] & FLAG_STAND);

  const goals = fires.map(f => ({ x: f.x, z: f.z, y: f.y, r: 5 })).concat([{ x: peak.x, z: peak.z, y: peak.y, r: 5 }]);
  goals.forEach((goal, k) => {
    const isGoal = (i, j) => (T.F[j * T.nx + i] & FLAG_STAND) && Math.hypot(T.xOf(i) - goal.x, T.zOf(j) - goal.z) <= goal.r;
    const j0 = Math.max(0, T.rowOf(Math.min(start.z, goal.z) - 30));
    const j1 = Math.min(T.nz - 1, T.rowOf(Math.max(start.z, goal.z) + 25));
    mask.fill(0, j0 * T.nx, (j1 + 1) * T.nx);
    // vicino ai falò le vie convergono (come in PEAK); verso la vetta ancora di più
    const keepFree = [{ ...start, r: 18 }, { ...goal, r: k === goals.length - 1 ? 32 : 18 }];
    const routes = [];
    let segRepairs = 0;

    for (let r = 0; r < MAX_ROUTES; r++) {
      const tried = [];
      let res;
      for (let iter = 0; iter < 100; iter++) {
        res = solveSegment(T, { startCells, isGoal, target: goal, j0, j1, budget: ROUTE_SAFETY, blocked: r > 0 ? mask : null });
        if (res.ok || r >= MIN_ROUTES) break;            // le vie "extra" non si riparano: o ci sono o no
        const pick = res.candidates.find(([ci, cj]) => !tried.some(([ti, tj]) => Math.hypot(ci - ti, cj - tj) * T.C < 2.5));
        if (!pick || tried.length >= 70) break;
        tried.push(pick);
        // RIPARAZIONE: una cengia appena sopra la cella raggiunta più vicina al traguardo
        const [ci, cj] = pick, c = cj * T.nx + ci, x = T.xOf(ci), z = T.zOf(cj);
        const [gx, gz] = T.gradient(x, z), gl = Math.hypot(gx, gz) || 1;
        const cx = x + (gx / gl) * 0.7, cz = z + (gz / gl) * 0.7, zp = cz - T.SH[c];
        ctx.stamps.add({ kind: 'notch', tag: 'repair', x: cx, zp, level: T.H[c], r: 1.6, safe: true,
          xmin: cx - 1.6, xmax: cx + 1.6, zmin: zp - 1.6, zmax: zp + 1.6 });
        ctx.rebuild(T.rowOf(cz) - 5, T.rowOf(cz) + 5);
        repairs.push({ segment: k, route: r, x: cx, z: cz, y: T.H[c] });
        segRepairs++;
      }
      if (!res.ok) break;
      routes.push(classifyRoute(T, res.path, r));
      markCorridor(T, mask, res.path, ROUTE_SEPARATION, keepFree, cliffZones);
    }
    segments.push({ index: k, ok: routes.length >= MIN_ROUTES, routes, repairs: segRepairs, from: start, to: goal });
    start = goal;
    startCells = cellsNear(T, goal.x, goal.z, 6, (i, j) => T.F[j * T.nx + i] & FLAG_STAND);
  });
  return { segments, repairs };
}

// ── FASE 7: oggetti ─────────────────────────────────────────────────────────
// Prova `tries` posizioni casuali; tiene solo quelle che rispettano le regole
// (bioma giusto, terreno piano, distanza minima dagli altri). È "dart throwing",
// la versione semplice del Poisson-disc sampling.
class SpatialHash {
  constructor(size) { this.size = size; this.map = new Map(); }
  add(o) {
    const k = `${Math.floor(o.x / this.size)},${Math.floor(o.z / this.size)}`;
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(o);
  }
  free(x, y, z, dist) {
    const S = this.size, n = Math.ceil(dist / S), cx = Math.floor(x / S), cz = Math.floor(z / S);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
      const list = this.map.get(`${cx + a},${cz + b}`);
      if (!list) continue;
      for (const o of list) {
        const d = Math.max(dist, o.spacing || 0);
        if ((o.x - x) ** 2 + (o.y - y) ** 2 + (o.z - z) ** 2 < d * d) return false;
      }
    }
    return true;
  }
}

function scatterProps(ctx, rng, fires) {
  const T = ctx.T, hash = new SpatialHash(4), props = [];
  for (const f of fires) hash.add({ x: f.x, y: f.y, z: f.z, spacing: 6 });
  for (const sec of ctx.layout.sections) {
    for (const rule of sec.def.props || []) {
      for (let t = 0; t < rule.tries; t++) {
        const zp = rng.range(sec.z0, sec.z1), x = rng.range(-1, 1) * ctx.halfWidth(zp);
        const z = zp + ctx.shift(x, zp);
        const c = T.cell(x, z);
        if (T.B[c] !== sec.index || !(T.F[c] & FLAG_STAND) || T.H[c] < SEA + 0.6) continue;
        if (T.upNormal(x, z) < 0.8) continue;
        const y = T.height(x, z);
        if (!hash.free(x, y, z, rule.spacing)) continue;
        const prop = { type: rule.type, x, y, z, yaw: rng.range(0, Math.PI * 2),
          scale: rng.range(rule.scale[0], rule.scale[1]), spacing: rule.spacing * 0.5 };
        hash.add(prop); props.push(prop);
      }
    }
  }
  return { props, hash };
}

// Il cibo va lungo le vie validate: chi segue una via "giusta" lo trova.
function placeFood(ctx, rng, segments, hash) {
  const T = ctx.T, food = [];
  for (const seg of segments) for (const route of seg.routes) {
    const rests = route.path.filter(([i, j]) => T.F[j * T.nx + i] & FLAG_STAND);
    for (const f of [0.35, 0.7]) {
      if (rests.length < 20) break;
      const [i, j] = rests[Math.floor(f * rests.length)];
      const x = T.xOf(i) + rng.range(-0.3, 0.3), z = T.zOf(j) + rng.range(-0.3, 0.3);
      const y = T.height(x, z) + 0.45;
      if (!hash.free(x, y, z, 3)) continue;
      const item = { type: 'food', x, y, z, taken: false };
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
  const T = ctx.T;
  lap('layout+rumore');

  const { fires, peak } = placeCampfires(ctx, ctx.root.fork('campfires'));
  const { passages, notches } = placePassages(ctx, ctx.root.fork('features'));
  lap('timbri');

  ctx.bakeRows(0, T.nz - 1);
  lap('cottura');
  T.computeDerived(0, T.nz - 1);
  ctx.paintRows(0, T.nz - 1);
  lap('materiali');

  // posizioni reali (dopo l'ondulazione) di falò e vetta
  for (const f of [...fires, peak]) {
    f.z = ctx.realZ(f.x, f.zp);
    f.y = T.height(f.x, f.z);
  }
  for (const p of passages) p.z = ctx.realZ(p.x, p.zp);
  const route = validateRoutes(ctx, fires, peak);
  lap('validazione');

  for (const f of [...fires, peak]) {
    f.y = T.height(f.x, f.z);
    f.pos = { x: f.x, y: f.y, z: f.z };
    const sx = f.x + 2.6, sz = f.z - 1.2;
    f.spawn = { x: sx, y: T.height(sx, sz), z: sz };
  }
  const { props, hash } = scatterProps(ctx, ctx.root.fork('props'), fires);
  const food = placeFood(ctx, ctx.root.fork('food'), route.segments, hash);
  lap('oggetti');

  const spawn = { x: 0, y: T.height(0, 6), z: 6 };

  return {
    seed: ctx.seed, seedHash: ctx.seedHash,
    layout: ctx.layout, length: ctx.layout.length, height: peak.y,
    terrain: T, noise: ctx.N,
    campfires: fires, peak, spawn, props, food, passages,
    route,
    // per sapere in che bioma si è (cielo, temperatura): pesi in funzione di (x, z)
    weightsAt: (x, z) => ctx.weights(z - ctx.shift(x, z)),
    stats: {
      timings,
      cells: T.nx * T.nz,
      notches, passages: passages.length,
      repairs: route.repairs.length,
      allOk: route.segments.every(g => g.ok),
      routes: route.segments.map(g => g.routes.length),
      props: props.length,
      food: food.length,
    },
  };
}

// Parametri ambientali (cielo, nebbia, temperatura) fusi in base alla posizione.
export function environmentAt(world, x, z) {
  const weights = world.weightsAt(x, z);
  let temperature = 0;
  for (const [b, w] of weights) temperature += w * b.def.temperature;
  const main = weights.reduce((a, c) => (c[1] > a[1] ? c : a))[0];
  return { temperature, weights, main };
}
