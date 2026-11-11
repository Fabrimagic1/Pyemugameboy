// ─────────────────────────────────────────────────────────────────────────────
// GENERATORE DELLA MONTAGNA — "mucchio di macigni"
//
//   seed ─► 1 layout (fasce di bioma, spalle dei falò) ─► 2 NUCLEO a gradoni (heightmap)
//        ─► 3 MACIGNI: pochi modelli piazzati migliaia di volte sulle pareti del nucleo
//        ─► 4 campo di distanza (fisica 3D: strapiombi compresi)
//        ─► 5 cenge = facce dei macigni che guardano in alto ─► 6 vie + riparazioni
//        ─► 7 mappa delle cime, oggetti, cibo, valigie
//
// Il nucleo non si vede quasi mai: serve a rendere piena la montagna (niente buchi tra
// i macigni) e a dare il piano delle spalle dove stanno i falò. La forma che si vede e
// si scala è quella dei macigni.
// Il risultato è un oggetto "world" puro (nessuna dipendenza da three.js):
// lo puoi generare anche in Node (vedi tools/test-gen.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import { RNG, hashString } from './rng.js';
import { Noise3 } from './noise.js';
import { BIOMES, BIOME_SLOTS } from './biomes.js';
import { Terrain, FLAG_STAND } from './surface.js';
import { buildShapes, shapeDistance } from './boulders.js';
import { findRoute, RestGraph } from './pathfind.js';
import { MAT, CELL, SEA, STAND_UP, MIN_ROUTES, MAX_ROUTES, ROUTE_SEPARATION, ITEMS } from './rules.js';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const TOP_RADIUS = 7;      // raggio della cima
const BEACH = 42;          // larghezza della spiaggia attorno al monte
const GRID = 8;            // lato delle celle dell'indice spaziale dei macigni (m)
const REACH = 3;           // oltre questa distanza dalla roccia il campo viene troncato

export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function weighted(rng, weights) {
  const entries = Object.entries(weights);
  let t = rng.next() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { t -= w; if (t <= 0) return k; }
  return entries[entries.length - 1][0];
}

// ── FASE 1: layout ───────────────────────────────────────────────────────────
// Dal basso: per ogni slot un bioma, alto `height` e inclinato `angle`. Tra un bioma
// e l'altro una SPALLA piana. Il profilo è una spezzata (raggio, quota).
function buildLayout(rng) {
  const bands = [];
  let y = 3;
  BIOME_SLOTS.forEach((slot, index) => {
    const id = slot.length === 1 ? slot[0] : rng.pick(slot);
    const def = BIOMES[id], h = rng.range(def.height[0], def.height[1]);
    const last = index === BIOME_SLOTS.length - 1;
    bands.push({ index, id, def, name: def.name, slot, y0: y, y1: y + h,
      run: h / Math.tan(rng.range(def.angle[0], def.angle[1]) * DEG), shoulder: last ? 0 : rng.range(9, 12) });
    y += h;
  });
  // i raggi si calcolano dall'alto: cima, parete, spalla, parete, …
  let r = TOP_RADIUS;
  for (let k = bands.length - 1; k >= 0; k--) {
    const b = bands[k];
    b.r1 = r; b.r0 = r + b.run;
    r = b.r0 + (k > 0 ? bands[k - 1].shoulder : 0);
  }
  const R0 = bands[0].r0, top = y;
  const pts = [[0, top], [TOP_RADIUS, top]];
  for (let k = bands.length - 1; k >= 0; k--) { pts.push([bands[k].r0, bands[k].y0]); if (k > 0) pts.push([bands[k - 1].r1, bands[k - 1].y1]); }
  pts.push([R0 + BEACH, 0.3], [R0 + BEACH + 30, -5], [R0 + BEACH + 90, -14]);
  return { bands, sections: bands, pts, top, baseRadius: R0, islandRadius: R0 + BEACH };
}

// ── contesto di generazione ─────────────────────────────────────────────────
class Ctx {
  constructor(seed) {
    this.seed = seed;
    this.seedHash = hashString(seed);
    this.root = new RNG(this.seedHash);
    this.layout = buildLayout(this.root.fork('layout'));
    this.N = new Noise3(this.root.fork('noise'));
    this.shapes = buildShapes();
    const S = Math.ceil(this.layout.islandRadius + 70);
    this.S = S;
    this.core = new Terrain(-S, -S, Math.ceil((2 * S) / CELL) + 1, Math.ceil((2 * S) / CELL) + 1, CELL);
    this.boulders = [];
    // indice spaziale 3D: per ogni cella, i macigni che possono toccarla
    this.gx = Math.ceil((2 * S) / GRID); this.gy = Math.ceil((this.layout.top + 30) / GRID);
    this.cells = new Array(this.gx * this.gy * this.gx);
    this.hit = -1;      // ultimo macigno più vicino trovato da sdf() (-1 = nucleo)
  }

  // la pianta non è un cerchio: lobi e rientranze attorno al monte
  lobe(theta) {
    const c = Math.cos(theta), s = Math.sin(theta), N = this.N;
    return 1 + 0.17 * N.fbm(c * 1.3 + 4, s * 1.3 + 4, 0.3, 2) + 0.06 * N.fbm(c * 3.7, s * 3.7, 1.7, 2);
  }
  profile(rho) {
    const P = this.layout.pts;
    if (rho >= P[P.length - 1][0]) return P[P.length - 1][1];
    let k = 1;
    while (P[k][0] < rho) k++;
    const [ra, ya] = P[k - 1], [rb, yb] = P[k];
    return ya + ((yb - ya) * (rho - ra)) / Math.max(1e-6, rb - ra);
  }
  // quota del nucleo
  coreHeight(x, z) {
    const r = Math.hypot(x, z), th = Math.atan2(z, x);
    return this.profile(r / this.lobe(th)) + 0.25 * this.N.fbm(x * 0.08, 0.5, z * 0.08, 2);
  }
  bakeCore() {
    const T = this.core;
    for (let j = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++) T.H[j * T.nx + i] = this.coreHeight(T.xOf(i), T.zOf(j));
    T.computeDerived(0, T.nz - 1);
  }
  bandAt(y) {
    for (const b of this.layout.bands) if (y < b.y1) return b;
    return this.layout.bands[this.layout.bands.length - 1];
  }

  // ── macigni ────────────────────────────────────────────────────────────────
  // yaw attorno a y, poi inclinazione `tilt` attorno a un asse orizzontale `ta`
  addBoulder(shapeId, x, y, z, s, yaw, tilt, ta, kind, band, tag) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt), ax = Math.cos(ta), az = Math.sin(ta), omc = 1 - ct;
    // R = Rtilt(asse (ax,0,az)) · Ryaw
    const t = [ct + ax * ax * omc, -az * st, ax * az * omc, az * st, ct, -ax * st, az * ax * omc, ax * st, ct + az * az * omc];
    const yw = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    const m = new Float32Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] = t[i * 3] * yw[j] + t[i * 3 + 1] * yw[3 + j] + t[i * 3 + 2] * yw[6 + j];
    const b = { id: this.boulders.length, shape: shapeId, x, y, z, s, m, kind, band, tag };
    this.boulders.push(b);
    const rr = s + REACH, G = GRID, S = this.S;
    const i0 = Math.max(0, Math.floor((x - rr + S) / G)), i1 = Math.min(this.gx - 1, Math.floor((x + rr + S) / G));
    const j0 = Math.max(0, Math.floor((y - rr + 10) / G)), j1 = Math.min(this.gy - 1, Math.floor((y + rr + 10) / G));
    const k0 = Math.max(0, Math.floor((z - rr + S) / G)), k1 = Math.min(this.gx - 1, Math.floor((z + rr + S) / G));
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const c = (j * this.gx + k) * this.gx + i;
      (this.cells[c] || (this.cells[c] = [])).push(b.id);
    }
    return b;
  }

  // ── FASE 4: campo di distanza. <0 dentro la roccia, >0 fuori, troncato a REACH ──
  sdf(x, y, z) {
    const T = this.core, S = this.S;
    let d = REACH;
    this.hit = -1;
    const hc = T.height(x, z);
    if (hc > -19) {
      const g = Math.min(6, T.G[T.cell(x, z)]);
      const dc = (y - hc) / Math.sqrt(1 + g * g);
      if (dc < d) d = dc;
    }
    const i = Math.floor((x + S) / GRID), j = Math.floor((y + 10) / GRID), k = Math.floor((z + S) / GRID);
    if (i < 0 || j < 0 || k < 0 || i >= this.gx || j >= this.gy || k >= this.gx) return d;
    const list = this.cells[(j * this.gx + k) * this.gx + i];
    if (!list) return d;
    const B = this.boulders, shapes = this.shapes;
    for (let n = 0; n < list.length; n++) {
      const b = B[list[n]], dx = x - b.x, dy = y - b.y, dz = z - b.z;
      if (dx * dx + dy * dy + dz * dz > (b.s + d) * (b.s + d)) continue;
      const m = b.m, inv = 1 / b.s;   // punto nel sistema del macigno: R^T · (p − c) / s
      const lx = (m[0] * dx + m[3] * dy + m[6] * dz) * inv, ly = (m[1] * dx + m[4] * dy + m[7] * dz) * inv, lz = (m[2] * dx + m[5] * dy + m[8] * dz) * inv;
      const dd = shapeDistance(shapes[b.shape], lx, ly, lz) * b.s;
      if (dd < d) { d = dd; this.hit = b.id; }
    }
    return d;
  }
  normal(x, y, z, out = [0, 0, 0]) {
    const e = 0.06;
    const nx = this.sdf(x + e, y, z) - this.sdf(x - e, y, z), ny = this.sdf(x, y + e, z) - this.sdf(x, y - e, z), nz = this.sdf(x, y, z + e) - this.sdf(x, y, z - e);
    const l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    return out;
  }
  // materiale della roccia più vicina al punto
  materialAt(x, y, z) {
    this.sdf(x, y, z);
    if (this.hit >= 0) return this.boulders[this.hit].kind;
    return MAT[this.bandAt(y).def.topMat];
  }
  // scende in verticale da (x, yFrom, z) fino alla prima superficie
  dropTo(x, yFrom, z, yMin) {
    let y = yFrom;
    for (let n = 0; n < 200 && y > yMin; n++) {
      const d = this.sdf(x, y, z);
      if (d < 0.04) return y;
      y -= Math.max(0.04, d);
    }
    return null;
  }
}

// ── FASE 3a: falò sulle spalle, vetta, partenza ─────────────────────────────
function placeCampfires(ctx, rng) {
  const L = ctx.layout, fires = [];
  let theta = rng.range(0, TAU);
  const spawnTheta = theta;
  for (let k = 0; k < L.bands.length - 1; k++) {
    theta = (theta + rng.range(-1.6, 1.6) + TAU) % TAU;
    const rho = (L.bands[k].r1 + L.bands[k + 1].r0) / 2, r = rho * ctx.lobe(theta);
    fires.push({ index: k, theta, x: Math.cos(theta) * r, z: Math.sin(theta) * r, y: L.bands[k].y1, band: k });
  }
  const peak = { x: 0, z: 0, y: L.top };
  const rs = (L.baseRadius + 16) * ctx.lobe(spawnTheta);
  const spawn = { x: Math.cos(spawnTheta) * rs, z: Math.sin(spawnTheta) * rs, theta: spawnTheta };
  return { fires, peak, spawn };
}

// ── FASE 3b: macigni sulle pareti ───────────────────────────────────────────
function placeBoulders(ctx, rng, fires) {
  const L = ctx.layout;
  const SLABS = [4, 5], ANY = [0, 1, 2, 3, 4, 5, 6, 7];
  for (const b of L.bands) {
    const B = b.def.boulder, sAvg = (B.size[0] + B.size[1]) / 2;
    const area = TAU * ((b.r0 + b.r1) / 2) * Math.hypot(b.y1 - b.y0, b.run);
    const n = Math.round((B.density * area) / (1.25 * sAvg * sAvg));
    for (let k = 0; k < n; k++) {
      const theta = rng.range(0, TAU), t = rng.range(-0.04, 1.0), s = rng.range(B.size[0], B.size[1]) * (1 - 0.25 * t * (b.index === L.bands.length - 1 ? 1 : 0));
      const y = b.y0 + t * (b.y1 - b.y0), r = (b.r0 + (b.r1 - b.r0) * t) * ctx.lobe(theta) + s * rng.range(-0.05, 0.3);
      const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
      // niente macigni addosso ai falò
      if (fires.some(f => Math.hypot(f.x - x, f.z - z) < s + 6 && Math.abs(f.y - y) < s + 5)) continue;
      const flat = rng.chance(B.flat);
      const sp = b.def.special, u = rng.next();
      const kind = u < (sp.ice || 0) ? MAT.ICE : u < (sp.ice || 0) + (sp.vine || 0) ? MAT.VINE : u < (sp.ice || 0) + (sp.vine || 0) + (sp.lava || 0) ? MAT.LAVA : MAT.ROCK;
      ctx.addBoulder(flat && rng.chance(0.5) ? rng.pick(SLABS) : rng.pick(ANY), x, y, z, s, rng.range(0, TAU),
        (flat ? rng.range(0, 5) : rng.range(6, B.tilt)) * DEG, rng.range(0, TAU), kind, b.index, 'wall');
    }
  }
  // qualche masso sparso sulla spiaggia
  for (let k = 0; k < 70; k++) {
    const theta = rng.range(0, TAU), r = rng.range(L.baseRadius + 3, L.islandRadius - 8) * ctx.lobe(theta), s = rng.range(1.2, 3.2);
    const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
    ctx.addBoulder(rng.pick(ANY), x, ctx.coreHeight(x, z) + s * 0.15, z, s, rng.range(0, TAU), rng.range(0, 20) * DEG, rng.range(0, TAU), MAT.ROCK, 0, 'beach');
  }
}

// ── FASE 5: cenge. Ogni faccia di macigno che guarda in alto ed è libera sopra ──
function collectRests(ctx, top, fires, peak, spawn) {
  const nodes = [], shapes = ctx.shapes;
  const free = (x, y, z) => ctx.sdf(x, y + 0.95, z) > 0.42 && ctx.sdf(x, y + 1.6, z) > 0.3;
  const addBoulderRests = b => {
    if (b.kind === MAT.LAVA) return;
    const m = b.m;
    for (const f of shapes[b.shape].faces) {
      const ny = m[3] * f.n[0] + m[4] * f.n[1] + m[5] * f.n[2];
      if (ny < 0.8 || f.area * b.s * b.s < 2.2) continue;
      const c = f.center;
      const x = b.x + b.s * (m[0] * c[0] + m[1] * c[1] + m[2] * c[2]), y = b.y + b.s * (m[3] * c[0] + m[4] * c[1] + m[5] * c[2]), z = b.z + b.s * (m[6] * c[0] + m[7] * c[1] + m[8] * c[2]);
      if (y < SEA + 0.5 || !free(x, y, z)) continue;
      nodes.push({ x, y, z, kind: b.kind, b: b.id, r: Math.min(4, 0.75 * Math.sqrt((f.area * b.s * b.s) / Math.PI)) });
    }
  };
  ctx.boulders.forEach(addBoulderRests);
  // tutte le superfici calpestabili VISIBILI DALL'ALTO (dalla mappa delle cime), un nodo ogni 2 m:
  // cime e falde dei macigni, spiaggia, spalle. Le facce qui sopra aggiungono quelle sotto uno strapiombo.
  for (let j = 1; j < top.nz - 1; j++) for (let i = 1; i < top.nx - 1; i++) {
    const c = j * top.nx + i, onCore = top.G[c] === 0, step = onCore ? 4 : 2;   // sui piani larghi bastano meno nodi
    if (i % step || j % step) continue;
    if (!(top.F[c] & FLAG_STAND) || top.UP[c] < 0.72 || top.H[c] < SEA + 0.6 || top.M[c] === MAT.LAVA) continue;
    const x = top.xOf(i), z = top.zOf(j);
    if (free(x, top.H[c], z)) nodes.push({ x, y: top.H[c], z, kind: top.M[c], b: -1, r: onCore ? 2.2 : 1.1 });
  }
  const special = p => { nodes.push({ x: p.x, y: p.y, z: p.z, kind: MAT.ROCK, b: -1, r: 2, fixed: true }); return nodes.length - 1; };
  spawn.node = special(spawn);
  for (const f of fires) f.node = special(f);
  peak.node = special(peak);
  return { nodes, addBoulderRests };
}

// ── FASE 6: vie. Più vie per tappa; se mancano, si aggiunge un APPOGGIO (una lastra) ──
function validateRoutes(ctx, rests, fires, peak, spawn) {
  const graph = new RestGraph(rests.nodes, (x, y, z) => ctx.sdf(x, y, z));
  const stops = [spawn, ...fires, peak], segments = [], repairs = [];
  for (let k = 0; k < stops.length - 1; k++) {
    const from = stops[k], to = stops[k + 1], routes = [];
    const blocked = new Set();
    let segRepairs = 0;
    for (let r = 0; r < MAX_ROUTES; r++) {
      let res;
      for (let iter = 0; iter < 60; iter++) {
        res = findRoute(graph, from.node, to.node, blocked);
        if (res.path || r >= MIN_ROUTES) break;
        // RIPARAZIONE: una lastra piana a portata di braccio dal punto raggiunto più vicino al traguardo
        const a = graph.nodes[res.closest];
        const dx = to.x - a.x, dy = to.y - a.y, dz = to.z - a.z, dl = Math.hypot(dx, dy, dz) || 1;
        let qx = a.x + (dx / dl) * 3.4, qy = a.y + Math.max(1.2, (dy / dl) * 3.4), qz = a.z + (dz / dl) * 3.4;
        const n = [0, 0, 0];
        for (let it = 0; it < 6; it++) {           // porta il punto sulla superficie
          const d = ctx.sdf(qx, qy, qz); ctx.normal(qx, qy, qz, n);
          qx -= n[0] * d; qz -= n[2] * d;
        }
        const hl = Math.hypot(n[0], n[2]) || 1, s = 2.3, shape = ctx.shapes[5];
        const topFace = shape.faces.reduce((p, f) => (f.n[1] > p.n[1] ? f : p));
        const b = ctx.addBoulder(5, qx + (n[0] / hl) * 0.9, qy - topFace.center[1] * s, qz + (n[2] / hl) * 0.9, s, ctx.root.fork('rep' + repairs.length).range(0, TAU), 0, 0, MAT.ROCK, ctx.bandAt(qy).index, 'repair');
        const before = graph.nodes.length;
        rests.addBoulderRests(b);
        if (graph.nodes.length === before) graph.nodes.push({ x: b.x, y: qy, z: b.z, kind: MAT.ROCK, b: b.id, r: 1.2 });   // appoggio comunque valido
        graph.refresh(before);
        repairs.push({ segment: k, route: r, x: b.x, y: qy, z: b.z });
        segRepairs++;
      }
      if (!res.path) break;
      routes.push(describeRoute(graph, res, r));
      // la via successiva non può usare gli appoggi di questa (tranne vicino ai falò)
      for (const i of res.path) {
        const p = graph.nodes[i];
        if (p.fixed) continue;
        for (const j of graph.near(p.x, p.y, p.z, ROUTE_SEPARATION)) {
          const q = graph.nodes[j];
          if (q.fixed || Math.hypot(q.x - from.x, q.y - from.y, q.z - from.z) < 16 || Math.hypot(q.x - to.x, q.y - to.y, q.z - to.z) < (k === stops.length - 2 ? 26 : 16)) continue;
          blocked.add(j);
        }
      }
    }
    segments.push({ index: k, ok: routes.length >= MIN_ROUTES, routes, repairs: segRepairs, from, to });
  }
  return { segments, repairs, graph };
}

function describeRoute(graph, res, index) {
  const pts = res.path.map(i => graph.nodes[i]);
  let walk = 0, climb = 0, climbGain = 0, vine = 0, ice = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (res.types[k - 1] === 'climb') { climb += d; climbGain += Math.max(0, b.y - a.y); if (b.kind === MAT.VINE) vine += d; if (b.kind === MAT.ICE) ice += d; }
    else walk += d;
  }
  const gain = Math.max(1, pts[pts.length - 1].y - pts[0].y), frac = Math.min(1, climbGain / gain);
  return { index, label: String.fromCharCode(65 + index), points: pts.map(p => [p.x, p.y, p.z]), nodes: res.path,
    walk, climb, vine, ice, climbFrac: frac, hops: pts.length, kind: frac < 0.45 ? 'facile' : frac < 0.8 ? 'misto' : 'parete' };
}

// ── FASE 7a: mappa delle cime. Per ogni cella, la superficie più alta (per erba, oggetti, mappa) ──
function bakeTop(ctx, T = null, x0 = -1e9, x1 = 1e9, z0 = -1e9, z1 = 1e9) {
  const C = ctx.core, n = [0, 0, 0];
  if (!T) T = new Terrain(C.x0, C.z0, C.nx, C.nz, C.C);
  const lim = ctx.layout.islandRadius + 4;
  const ia = Math.max(0, T.colOf(x0)), ib = Math.min(T.nx - 1, T.colOf(x1)), ja = Math.max(0, T.rowOf(z0)), jb = Math.min(T.nz - 1, T.rowOf(z1));
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
    const c = j * T.nx + i, x = T.xOf(i), z = T.zOf(j), hc = C.H[c];
    let y = hc, up = C.UP[c], id = -1;
    if (Math.hypot(x, z) < lim) {
      const top = ctx.dropTo(x, Math.min(ctx.layout.top + 9, hc + 34), z, hc - 0.5);
      if (top !== null && top > hc + 0.08) { y = top; id = ctx.hit; up = ctx.normal(x, y, z, n)[1]; }
    }
    T.H[c] = y; T.UP[c] = up; T.G[c] = id >= 0 ? 1 : 0;   // G = 1 se la cima è un macigno, 0 se è il nucleo
    const band = id >= 0 ? ctx.boulders[id].band : ctx.bandAt(y - 0.5).index;
    T.B[c] = band;
    T.M[c] = id >= 0 ? ctx.boulders[id].kind : MAT[ctx.layout.bands[band].def.topMat];
    T.F[c] = up >= STAND_UP && y > SEA + 0.15 ? FLAG_STAND : 0;
  }
  return T;
}

// ── FASE 7b: oggetti ─────────────────────────────────────────────────────────
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

// Posto adatto a un oggetto: cima piana, libera sopra, non lava.
function flatSpot(ctx, top, x, z, minUp = 0.86) {
  const c = top.cell(x, z);
  if (!(top.F[c] & FLAG_STAND) || top.UP[c] < minUp || top.M[c] === MAT.LAVA || top.H[c] < SEA + 0.6) return null;
  const y = ctx.dropTo(x, top.H[c] + 1.2, z, top.H[c] - 1);
  if (y === null || ctx.sdf(x, y + 1.3, z) < 0.5) return null;
  return { y, band: top.B[c] };
}

function scatterProps(ctx, rng, top, fires) {
  const hash = new SpatialHash(4), props = [], L = ctx.layout;
  for (const f of fires) hash.add({ x: f.x, y: f.y, z: f.z, spacing: 5 });
  for (const b of L.bands) {
    const rMax = (b.index === 0 ? L.islandRadius - 6 : b.r0 + 6) * 1.25, rMin = Math.max(0, b.r1 - 14);
    for (const rule of b.def.props || []) {
      for (let t = 0; t < rule.tries; t++) {
        const th = rng.range(0, TAU), r = Math.sqrt(rng.range(rMin * rMin, rMax * rMax));
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        const spot = flatSpot(ctx, top, x, z);
        if (!spot || spot.band !== b.index || !hash.free(x, spot.y, z, rule.spacing)) continue;
        const prop = { type: rule.type, x, y: spot.y, z, yaw: rng.range(0, TAU), scale: rng.range(rule.scale[0], rule.scale[1]), spacing: rule.spacing * 0.5 };
        hash.add(prop); props.push(prop);
      }
    }
  }
  return { props, hash };
}

// Cibo e valigie sugli appoggi delle vie (chi segue una via li trova) e vicino ai falò.
function placeLoot(ctx, rng, top, fires, segments, hash) {
  const food = [], luggage = [];
  const weights = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.weight]));
  const tryAt = (x, z, list, make, spacing) => {
    const spot = flatSpot(ctx, top, x, z, 0.8);
    if (!spot || !hash.free(x, spot.y, z, spacing)) return false;
    const o = make(spot.y); o.spacing = spacing; hash.add(o); list.push(o);
    return true;
  };
  for (const f of fires) {
    for (let k = 0, placed = 0; k < 14 && placed < 2; k++) {
      const a = rng.range(0, TAU), r = rng.range(3, 5.5);
      if (tryAt(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, luggage, y => ({ x: f.x + Math.cos(a) * r, y, z: f.z + Math.sin(a) * r, yaw: rng.range(0, TAU), item: weighted(rng, weights), opened: false }), 2.2)) placed++;
    }
  }
  for (const seg of segments) for (const route of seg.routes) {
    const P = route.points;
    [[0.35, food], [0.7, food], [0.52, luggage]].forEach(([f, list]) => {
      const [x, , z] = P[Math.min(P.length - 2, Math.max(1, Math.floor(f * P.length)))];
      const ox = x + rng.range(-0.5, 0.5), oz = z + rng.range(-0.5, 0.5);
      if (list === food) tryAt(ox, oz, food, y => ({ type: 'food', x: ox, y: y + 0.45, z: oz, taken: false }), 2.5);
      else tryAt(ox, oz, luggage, y => ({ x: ox, y, z: oz, yaw: rng.range(0, TAU), item: weighted(rng, weights), opened: false }), 2.2);
    });
  }
  return { food, luggage };
}

// ── PIPELINE COMPLETA ───────────────────────────────────────────────────────
export function generateMountain(seed) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const timings = {};
  let t = now();
  const lap = name => { const n = now(); timings[name] = Math.round(n - t); t = n; };

  const ctx = new Ctx(String(seed));
  ctx.bakeCore();
  lap('nucleo');

  const { fires, peak, spawn } = placeCampfires(ctx, ctx.root.fork('campfires'));
  placeBoulders(ctx, ctx.root.fork('boulders'), fires);
  spawn.y = ctx.coreHeight(spawn.x, spawn.z);
  lap('macigni');

  const top = bakeTop(ctx);
  lap('mappa cime');
  const rests = collectRests(ctx, top, fires, peak, spawn);
  lap('cenge');
  const route = validateRoutes(ctx, rests, fires, peak, spawn);
  for (const b of ctx.boulders) if (b.tag === 'repair') bakeTop(ctx, top, b.x - b.s, b.x + b.s, b.z - b.s, b.z + b.s);
  lap('vie');

  for (const f of [...fires, peak]) {
    f.pos = { x: f.x, y: f.y, z: f.z };
    f.spawn = { x: f.x + 2.4, y: f.y, z: f.z - 1.2 };
  }
  const { props, hash } = scatterProps(ctx, ctx.root.fork('props'), top, fires);
  const { food, luggage } = placeLoot(ctx, ctx.root.fork('loot'), top, fires, route.segments, hash);
  lap('oggetti');

  const L = ctx.layout;
  return {
    seed: ctx.seed, seedHash: ctx.seedHash,
    layout: L, height: L.top, size: ctx.S,
    core: ctx.core, top, terrain: top, noise: ctx.N,
    shapes: ctx.shapes, boulders: ctx.boulders,
    campfires: fires, peak, spawn, props, food, luggage,
    route: { segments: route.segments, repairs: route.repairs },
    graph: route.graph,   // grafo degli appoggi (utile per studiare le vie dalla console)
    // ── interfaccia per la fisica ──
    sdf: (x, y, z) => ctx.sdf(x, y, z),
    normal: (x, y, z, out) => ctx.normal(x, y, z, out),
    materialAt: (x, y, z) => ctx.materialAt(x, y, z),
    dropTo: (x, y, z, yMin) => ctx.dropTo(x, y, z, yMin),
    bandAt: y => ctx.bandAt(y),
    stats: {
      timings,
      boulders: ctx.boulders.length, shapes: ctx.shapes.length,
      rests: rests.nodes.length,
      repairs: route.repairs.length,
      allOk: route.segments.every(g => g.ok),
      routes: route.segments.map(g => g.routes.length),
      props: props.length, food: food.length, luggage: luggage.length,
    },
  };
}

// Parametri ambientali (cielo, nebbia, temperatura) fusi in base alla QUOTA.
export function environmentAt(world, y) {
  const bands = world.layout.bands, weights = [];
  for (const b of bands) {
    let w = 1;
    if (b.index > 0) w *= smoothstep(b.y0 - 5, b.y0 + 5, y);
    if (b.index < bands.length - 1) w *= 1 - smoothstep(b.y1 - 5, b.y1 + 5, y);
    if (w > 1e-4) weights.push([b, w]);
  }
  let temperature = 0;
  for (const [b, w] of weights) temperature += w * b.def.temperature;
  const main = weights.reduce((a, c) => (c[1] > a[1] ? c : a))[0];
  return { temperature, weights, main };
}
