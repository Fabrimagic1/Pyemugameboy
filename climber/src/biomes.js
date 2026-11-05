// ─────────────────────────────────────────────────────────────────────────────
// BIOMI (dati + piccole funzioni)
//
// Il mondo va AVANTI (asse z) e IN SALITA: dalla spiaggia alla vetta lontana.
// È una sequenza di "slot"; ogni giorno, per ogni slot, il seed sceglie UNA
// delle alternative (es. Giungla oppure Bosco dei Funghi).
// Ogni bioma è una serie di gradini: PIANORO (si cammina) → PARETE (si scala)
// → pianoro → parete … e finisce con un pianoro largo dove c'è il falò.
//
// Campi principali:
//   length   [min,max]   lunghezza in avanti (m)
//   steps    count: numero di pareti, cliff: altezza delle pareti,
//            angle: inclinazione delle pareti (°), slope: pendenza dei pianori (°)
//   passages count: quanti "passaggi" per parete (vie alternative)
//            weights: probabilità dei tipi:
//              ramp   = cengia in diagonale lungo la parete (si sale camminando)
//              stairs = parete a gradoni con punti di riposo
//              gully  = canalone meno ripido (con liane nella giungla)
//   notches  cenge naturali per m² di parete (punti di riposo sparsi)
//   shape(p,N)        rumore che alza/abbassa il terreno (metri)
//   material(p,N,c)   materiale della cella (c.flat = calpestabile)
//   props             oggetti da spargere sui pianori
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
    length: [70, 85], beach: 28,
    steps: { count: [3, 4], cliff: [3, 7], angle: [64, 74], slope: [4, 10] },
    passages: { count: [2, 3], weights: { ramp: 3, stairs: 1, gully: 1 } },
    notches: 0.0060,
    temperature: 0,
    sky: { top: '#4f9be0', bottom: '#cde8fb', fog: '#c4e2f6', far: 620 },
    palette: { wall: '#8f8270', wall2: '#6f6455', ledge: '#cdbb88' },
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
    length: [85, 105],
    steps: { count: [5, 7], cliff: [8, 15], angle: [70, 80], slope: [6, 14] },
    passages: { count: [2, 3], weights: { ramp: 0.6, stairs: 1, gully: 3 } },
    notches: 0.0060,
    temperature: 0.15,
    sky: { top: '#3d8fcf', bottom: '#bfe3d0', fog: '#a3d1b5', far: 300 },
    palette: { wall: '#5d5a48', wall2: '#454536', ledge: '#4f8a35' },
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
    length: [85, 105],
    steps: { count: [5, 7], cliff: [7, 13], angle: [72, 82], slope: [5, 12] },
    passages: { count: [2, 3], weights: { ramp: 0.8, stairs: 3, gully: 1 } },
    notches: 0.0090,
    temperature: 0.1,
    sky: { top: '#5a6fb8', bottom: '#d6c6e8', fog: '#b9a9d6', far: 280 },
    palette: { wall: '#5b4e5e', wall2: '#463c4a', ledge: '#8a6d9c' },
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
    length: [80, 100],
    // poche pareti ma alte, e pochi passaggi: qui il validatore lavora di più
    steps: { count: [4, 6], cliff: [12, 20], angle: [72, 82], slope: [12, 20] },
    passages: { count: [2, 3], weights: { ramp: 1, stairs: 2, gully: 1 } },
    notches: 0.0022,
    temperature: -1,
    sky: { top: '#6d8fb3', bottom: '#e3edf5', fog: '#dbe6ef', far: 260 },
    palette: { wall: '#6c727c', wall2: '#50555e', ledge: '#eef3f7' },
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
    length: [85, 105],
    // tante pareti basse e verticali (strati di arenaria), pianori quasi piatti
    steps: { count: [7, 9], cliff: [7, 11], angle: [78, 84], slope: [2, 6] },
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
    length: [70, 90],
    steps: { count: [4, 5], cliff: [10, 18], angle: [68, 78], slope: [10, 16] },
    passages: { count: [2, 3], weights: { ramp: 0.8, stairs: 1, gully: 2 } },
    notches: 0.0045,
    temperature: 0.7,
    sky: { top: '#3b2f3a', bottom: '#c96f45', fog: '#7a4a3c', far: 240 },
    palette: { wall: '#3a3433', wall2: '#262222', ledge: '#5a4a44' },
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
    length: [55, 70],
    steps: { count: [3, 4], cliff: [10, 16], angle: [70, 80], slope: [20, 28] },
    passages: { count: [2, 3], weights: { ramp: 1, stairs: 2, gully: 1 } },
    notches: 0.0045,
    temperature: -0.8,
    sky: { top: '#1f4f8f', bottom: '#bcd3ea', fog: '#c9d8e8', far: 380 },
    palette: { wall: '#7a7f88', wall2: '#5c6068', ledge: '#eef3f7' },
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
