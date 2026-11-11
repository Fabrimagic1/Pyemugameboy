// ─────────────────────────────────────────────────────────────────────────────
// BIOMI (dati + piccole funzioni)
//
// Il mondo va AVANTI (asse z) ma soprattutto IN ALTO: dalla spiaggia alla vetta.
// È una sequenza di "slot"; ogni giorno, per ogni slot, il seed sceglie UNA
// delle alternative (es. Giungla oppure Bosco dei Funghi).
// Ogni bioma è una GRANDE PARETE: tanti salti di roccia separati solo da cenge
// strette. Il tratto piano largo c'è solo alla fine del bioma, dove sta il falò.
//
// Campi principali:
//   face     height: altezza totale della parete del bioma (m)
//            cliff: altezza di ogni salto, angle: inclinazione (°)
//            ledge: profondità delle cenge tra un salto e l'altro, slope: loro pendenza (°)
//   bays     quante baie/speroni piegano la parete (rientranze e sporgenze in pianta)
//   coves    ripari scavati alla base dei salti, per metro di larghezza
//   passages count: quanti "passaggi" per salto (vie alternative)
//            weights: probabilità dei tipi:
//              ramp   = cengia in diagonale lungo la parete (si sale camminando)
//              stairs = parete a gradoni con punti di riposo
//              gully  = canalone meno ripido (con liane nella giungla)
//   notches  cenge naturali per m² di parete (punti di riposo sparsi)
//   shape(p,N)        rumore che alza/abbassa il terreno (metri)
//   material(p,N,c)   materiale della cella (c.flat = calpestabile)
//   grass             erba: colore, densità (0..1), altezza; onRock = anche sui pianori di roccia
//   props             oggetti da spargere
//   temperature       -1 freddo … +1 caldo (afflizioni del giocatore)
//
//   p = { x, y, z, t }   (y = quota di base, t = 0..1 dentro al bioma)
// ─────────────────────────────────────────────────────────────────────────────
import { MAT } from './rules.js';

export const BIOME_SLOTS = [
  ['shore'],
  ['jungle', 'fungal'],
  ['alpine', 'mesa'],
  ['caldera'],
  ['summit'],
];

export const BIOMES = {
  shore: {
    name: 'Spiaggia',
    grass: { color: '#7fb842', density: 0.75, height: 0.34 },
    beach: 26,
    face: { height: [20, 28], cliff: [3, 7], angle: [64, 74], ledge: [4, 8], slope: [3, 9] },
    bays: [2, 3], coves: 0.03,
    passages: { count: [2, 3], weights: { ramp: 3, stairs: 1, gully: 1 } },
    notches: 0.0060,
    temperature: 0,
    sky: { top: '#3f97ea', bottom: '#cfeeff', fog: '#c9e8f8', far: 620 },
    palette: { wall: '#a8937a', wall2: '#86725c', ledge: '#ecd9a0' },
    gullyMat: MAT.ROCK,
    shape(p, N) {
      return 0.9 * N.fbm(p.x * 0.04, p.y * 0.05, p.z * 0.04, 4) + 0.25 * N.fbm(p.x * 0.2, p.y * 0.2, p.z * 0.2, 2);
    },
    material(p, N, c) {
      if (c.flat) return p.y < 3 || N.perlin(p.x * 0.05, p.y * 0.05, p.z * 0.05) > 0.15 ? MAT.SAND : MAT.MOSS;
      return MAT.ROCK;
    },
    props: [
      { type: 'palm', spacing: 8, tries: 700, scale: [0.8, 1.3] },
      { type: 'rock', spacing: 5, tries: 500, scale: [0.6, 1.4] },
    ],
  },

  jungle: {
    name: 'Giungla',
    grass: { color: '#3f9a34', density: 1.0, height: 0.5 },
    face: { height: [75, 90], cliff: [8, 14], angle: [72, 82], ledge: [3.4, 5.5], slope: [4, 12] },
    bays: [3, 4], coves: 0.03,
    passages: { count: [2, 3], weights: { ramp: 0.6, stairs: 1, gully: 3 } },
    notches: 0.0060,
    temperature: 0.15,
    sky: { top: '#3a93dc', bottom: '#c8efd6', fog: '#b0dcc0', far: 340 },
    palette: { wall: '#6b6248', wall2: '#4c4a35', ledge: '#5aa83a' },
    gullyMat: MAT.VINE,
    shape(p, N) {
      return 1.2 * N.fbm(p.x * 0.05, p.y * 0.04, p.z * 0.05, 4) + 0.6 * N.ridged(p.x * 0.09, p.y * 0.03, p.z * 0.09, 2);
    },
    material(p, N, c) {
      if (c.flat) return MAT.MOSS;
      // strisce verticali di liane: alta frequenza in orizzontale, bassa in verticale
      return N.perlin(p.x * 0.35, p.y * 0.04, p.z * 0.35) > 0.25 ? MAT.VINE : MAT.ROCK;
    },
    props: [
      { type: 'jungleTree', spacing: 7, tries: 1400, scale: [0.8, 1.3] },
      { type: 'bush', spacing: 3.5, tries: 1400, scale: [0.6, 1.3] },
    ],
  },

  fungal: {
    name: 'Bosco dei Funghi',
    grass: { color: '#9a78c8', density: 0.8, height: 0.36, onRock: true },
    face: { height: [75, 90], cliff: [7, 12], angle: [72, 82], ledge: [3.6, 6], slope: [3, 10] },
    bays: [3, 4], coves: 0.035,
    passages: { count: [2, 3], weights: { ramp: 0.8, stairs: 3, gully: 1 } },
    notches: 0.0090,
    temperature: 0.1,
    sky: { top: '#5a6fb8', bottom: '#d6c6e8', fog: '#b9a9d6', far: 280 },
    palette: { wall: '#62507a', wall2: '#473a5c', ledge: '#a07fc4' },
    gullyMat: MAT.MOSS,
    shape(p, N) {
      return 1.4 * N.fbm(p.x * 0.04, p.y * 0.04, p.z * 0.04, 5);
    },
    material(p, N, c) { return MAT.ROCK; },
    props: [
      { type: 'giantMushroom', spacing: 9, tries: 900, scale: [0.8, 1.2] },
      { type: 'smallMushroom', spacing: 2.5, tries: 1400, scale: [0.6, 1.4] },
    ],
  },

  alpine: {
    name: 'Ghiacciaio',
    // poche pareti ma alte, e pochi passaggi: qui il validatore lavora di più
    face: { height: [85, 100], cliff: [10, 16], angle: [72, 82], ledge: [3.4, 5.2], slope: [8, 16] },
    bays: [2, 4], coves: 0.02,
    passages: { count: [2, 3], weights: { ramp: 1, stairs: 2, gully: 1 } },
    notches: 0.0022,
    temperature: -1,
    sky: { top: '#5b8fc9', bottom: '#e6f1fa', fog: '#dde9f3', far: 300 },
    palette: { wall: '#6f7f98', wall2: '#52607a', ledge: '#f2f7fb' },
    gullyMat: MAT.SNOW,
    shape(p, N) {
      return 2.0 * N.ridged(p.x * 0.03, p.y * 0.03, p.z * 0.03, 3) - 1 + 0.4 * N.fbm(p.x * 0.15, p.y * 0.15, p.z * 0.15, 2);
    },
    material(p, N, c) {
      if (c.flat) return MAT.SNOW;
      return N.fbm(p.x * 0.06, p.y * 0.06, p.z * 0.06, 2) > 0.15 ? MAT.ICE : MAT.ROCK;
    },
    props: [
      { type: 'pine', spacing: 6, tries: 900, scale: [0.7, 1.2] },
      { type: 'iceShard', spacing: 5, tries: 500, scale: [0.6, 1.3] },
    ],
  },

  mesa: {
    name: 'Altopiano Rosso',
    grass: { color: '#c2a64e', density: 0.3, height: 0.38, onRock: true },
    // tante pareti basse e verticali (strati di arenaria), pianori quasi piatti
    face: { height: [80, 95], cliff: [7, 11], angle: [80, 86], ledge: [3.2, 5], slope: [1, 5] },
    bays: [3, 5], coves: 0.04,
    passages: { count: [2, 3], weights: { ramp: 1.5, stairs: 1, gully: 1 } },
    notches: 0.0030,
    temperature: 1,
    sky: { top: '#4a8fd6', bottom: '#f6d9a8', fog: '#efcf9f', far: 380 },
    palette: {
      wall: '#b5603a', wall2: '#8e4529', ledge: '#d79a5d',
      bands: ['#b5603a', '#c9794a', '#9c4c2e', '#d38b57', '#a8553a'], bandHeight: 1.4,
    },
    gullyMat: MAT.SAND,
    shape(p, N) {
      return 0.6 * N.fbm(p.x * 0.03, p.y * 0.01, p.z * 0.03, 3);
    },
    material(p, N, c) { return MAT.ROCK; },
    props: [
      { type: 'cactus', spacing: 6, tries: 800, scale: [0.7, 1.3] },
      { type: 'boulder', spacing: 7, tries: 450, scale: [0.6, 1.3] },
    ],
  },

  caldera: {
    name: 'Caldera',
    face: { height: [65, 80], cliff: [9, 14], angle: [70, 80], ledge: [3.4, 5.5], slope: [6, 14] },
    bays: [2, 4], coves: 0.03,
    passages: { count: [2, 3], weights: { ramp: 0.8, stairs: 1, gully: 2 } },
    notches: 0.0045,
    temperature: 0.7,
    sky: { top: '#3a2a3c', bottom: '#e07a45', fog: '#8a4f3c', far: 260 },
    palette: { wall: '#3c3236', wall2: '#261f24', ledge: '#5e4a48' },
    gullyMat: MAT.ROCK,
    shape(p, N) {
      // solchi in discesa (dove scorre la lava): bassa frequenza lungo z
      const g = N.ridged(p.x * 0.07, 0.5, p.z * 0.012, 2);
      return 1.2 * N.fbm(p.x * 0.04, p.y * 0.04, p.z * 0.04, 4) - 3.5 * Math.max(0, g - 0.75);
    },
    material(p, N, c) {
      const g = N.ridged(p.x * 0.07, 0.5, p.z * 0.012, 2);
      // la lava solo dove anche un secondo rumore è alto → fiumi spezzati, non muri invalicabili
      return g > 0.88 && N.perlin(p.x * 0.05, p.y * 0.04, p.z * 0.05) > 0.05 ? MAT.LAVA : MAT.ROCK;
    },
    props: [
      { type: 'obsidian', spacing: 5, tries: 600, scale: [0.6, 1.4] },
      { type: 'emberRock', spacing: 6, tries: 450, scale: [0.6, 1.2] },
    ],
  },

  summit: {
    name: 'Vetta',
    face: { height: [50, 60], cliff: [8, 13], angle: [72, 80], ledge: [3.2, 4.8], slope: [10, 18] },
    bays: [1, 2], coves: 0.03,
    passages: { count: [2, 3], weights: { ramp: 1, stairs: 2, gully: 1 } },
    notches: 0.0045,
    temperature: -0.8,
    sky: { top: '#1f4f8f', bottom: '#bcd3ea', fog: '#c9d8e8', far: 380 },
    palette: { wall: '#7d8696', wall2: '#5b6474', ledge: '#f4f8fc' },
    gullyMat: MAT.SNOW,
    shape(p, N) {
      return 1.6 * N.ridged(p.x * 0.05, p.y * 0.03, p.z * 0.05, 3) - 0.8;
    },
    material(p, N, c) {
      if (c.flat) return MAT.SNOW;
      return N.perlin(p.x * 0.08, p.y * 0.08, p.z * 0.08) > 0.3 ? MAT.ICE : MAT.ROCK;
    },
    props: [
      { type: 'summitRock', spacing: 5, tries: 300, scale: [0.5, 1.0] },
    ],
  },
};
