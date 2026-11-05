// ─────────────────────────────────────────────────────────────────────────────
// BIOMI (dati + piccole funzioni)
//
// La montagna è una pila di "slot". Ogni giorno, per ogni slot, il seed
// sceglie UNA delle alternative (es. Giungla oppure Bosco dei Funghi).
// Per aggiungere un bioma: scrivi una nuova voce qui e mettila in uno slot.
//
// Campi:
//   height   [min,max]  altezza del bioma in metri
//   taper    [min,max]  raggio_in_cima / raggio_alla_base (quanto si stringe)
//   profile  t→[0,1]    curva del raggio di base dentro al bioma (t = 0..1)
//   terrace  {step, sharp, jitter} gradoni: pareti verticali + cenge orizzontali
//   stamps   strutture discrete (cenge, nicchie, funghi a mensola) per m² di parete
//   shape(p,N)          rumore che sposta la parete (metri, + = verso l'esterno)
//   material(p,N,c)     materiale della cella (c.flat = calpestabile)
//   props               oggetti decorativi/gameplay da spargere
//   temperature         -1 freddo … +1 caldo (afflizioni del giocatore)
//
//   p = { theta, y, t, base, x, z }  (x,z: punto sul cilindro, per il rumore)
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
    height: [42, 54], taper: [0.42, 0.47], profile: t => Math.pow(t, 0.6),
    terrace: { step: 4, sharp: 0.6, jitter: 3 },
    temperature: 0,
    sky: { top: '#4f9be0', bottom: '#cde8fb', fog: '#c4e2f6', far: 520 },
    palette: { wall: '#8f8270', wall2: '#6f6455', ledge: '#cdbb88' },
    stamps: [{ kind: 'ledge', density: 0.0022, depth: [1.4, 2.8], halfArc: [2, 5], thick: [1.5, 3] }],
    shape(p, N) {
      return 2.2 * N.fbm(p.x * 0.035, p.y * 0.035, p.z * 0.035, 4)
           + 0.5 * N.fbm(p.x * 0.18, p.y * 0.18, p.z * 0.18, 2);
    },
    material(p, N, c) {
      if (c.flat) return p.y < 14 || N.perlin(p.x * 0.05, p.y * 0.05, p.z * 0.05) > 0.1 ? MAT.SAND : MAT.MOSS;
      return MAT.ROCK;
    },
    props: [
      { type: 'palm', minDepth: 2.0, spacing: 9, tries: 320, scale: [0.8, 1.3] },
      { type: 'rock', minDepth: 1.0, spacing: 5, tries: 260, scale: [0.6, 1.4] },
    ],
  },

  jungle: {
    name: 'Giungla',
    height: [75, 92], taper: [0.86, 0.9], profile: t => t,
    terrace: { step: 11, sharp: 0.18, jitter: 6 },
    temperature: 0.15,
    sky: { top: '#3d8fcf', bottom: '#bfe3d0', fog: '#a3d1b5', far: 280 },
    palette: { wall: '#5d5a48', wall2: '#454536', ledge: '#4f8a35' },
    stamps: [{ kind: 'ledge', density: 0.0034, depth: [1.5, 3.2], halfArc: [2, 5], thick: [2, 4] }],
    shape(p, N) {
      return 1.8 * N.fbm(p.x * 0.05, p.y * 0.03, p.z * 0.05, 4)
           + 1.2 * N.ridged(p.x * 0.09, p.y * 0.02, p.z * 0.09, 2);
    },
    material(p, N, c) {
      if (c.flat) return MAT.MOSS;
      // strisce verticali di liane: alta frequenza in orizzontale, bassa in verticale
      return N.perlin(p.x * 0.35, p.y * 0.04, p.z * 0.35) > 0.25 ? MAT.VINE : MAT.ROCK;
    },
    props: [
      { type: 'jungleTree', minDepth: 2.2, spacing: 8, tries: 520, scale: [0.8, 1.3] },
      { type: 'bush', minDepth: 1.0, spacing: 3.5, tries: 600, scale: [0.6, 1.3] },
    ],
  },

  fungal: {
    name: 'Bosco dei Funghi',
    height: [75, 92], taper: [0.86, 0.9], profile: t => t,
    terrace: null,
    temperature: 0.1,
    sky: { top: '#5a6fb8', bottom: '#d6c6e8', fog: '#b9a9d6', far: 250 },
    palette: { wall: '#5b4e5e', wall2: '#463c4a', ledge: '#8a6d9c' },
    // "cap" = mensola sottile e tondeggiante, come i funghi a mensola sui tronchi
    stamps: [{ kind: 'cap', density: 0.0036, depth: [2.2, 4.5], halfArc: [2.5, 5], thick: [1.0, 1.6] }],
    shape(p, N) {
      return 2.4 * N.fbm(p.x * 0.04, p.y * 0.04, p.z * 0.04, 5);
    },
    material(p, N, c) {
      return MAT.ROCK; // il colore viene dalla palette (pareti viola, mensole lilla)
    },
    props: [
      { type: 'giantMushroom', minDepth: 2.6, spacing: 9, tries: 420, scale: [0.8, 1.2] },
      { type: 'smallMushroom', minDepth: 1.0, spacing: 2.5, tries: 700, scale: [0.6, 1.4] },
    ],
  },

  alpine: {
    name: 'Ghiacciaio',
    height: [85, 102], taper: [0.8, 0.86], profile: t => t,
    terrace: null,
    temperature: -1,
    sky: { top: '#6d8fb3', bottom: '#e3edf5', fog: '#dbe6ef', far: 230 },
    palette: { wall: '#6c727c', wall2: '#50555e', ledge: '#eef3f7' },
    // poche cenge: qui il validatore dovrà spesso intervenire scavando nicchie
    stamps: [
      { kind: 'ledge', density: 0.0007, depth: [1.2, 2.2], halfArc: [1.5, 3.5], thick: [1.5, 2.5] },
      { kind: 'alcove', density: 0.0005, depth: [1.5, 2.5], halfArc: [1.5, 3], h: [2.2, 3.2] },
    ],
    shape(p, N) {
      return 6.5 * N.ridged(p.x * 0.022, p.y * 0.018, p.z * 0.022, 3) - 3.2
           + 1.0 * N.fbm(p.x * 0.15, p.y * 0.15, p.z * 0.15, 2);
    },
    material(p, N, c) {
      if (c.flat) return MAT.SNOW;
      return N.fbm(p.x * 0.06, p.y * 0.06, p.z * 0.06, 2) > 0.18 ? MAT.ICE : MAT.ROCK;
    },
    props: [
      { type: 'pine', minDepth: 1.8, spacing: 7, tries: 320, scale: [0.7, 1.2] },
      { type: 'iceShard', minDepth: 1.0, spacing: 5, tries: 260, scale: [0.6, 1.3] },
    ],
  },

  mesa: {
    name: 'Altopiano Rosso',
    height: [75, 92], taper: [0.7, 0.76], profile: t => t,
    terrace: { step: 7, sharp: 0.07, jitter: 4 },   // gradoni netti: strati di arenaria
    temperature: 1,
    sky: { top: '#4a8fd6', bottom: '#f6d9a8', fog: '#efcf9f', far: 340 },
    palette: {
      wall: '#b5603a', wall2: '#8e4529', ledge: '#d79a5d',
      bands: ['#b5603a', '#c9794a', '#9c4c2e', '#d38b57', '#a8553a'], bandHeight: 1.6,
    },
    stamps: [{ kind: 'ledge', density: 0.0008, depth: [1.5, 2.5], halfArc: [2, 4], thick: [1.5, 2.5] }],
    shape(p, N) {
      return 1.2 * N.fbm(p.x * 0.03, p.y * 0.01, p.z * 0.03, 3)
           + 0.4 * N.fbm(p.x * 0.25, p.y * 0.05, p.z * 0.25, 2);
    },
    material(p, N, c) { return MAT.ROCK; },
    props: [
      { type: 'cactus', minDepth: 1.4, spacing: 6, tries: 380, scale: [0.7, 1.3] },
      { type: 'boulder', minDepth: 1.6, spacing: 7, tries: 240, scale: [0.6, 1.3] },
    ],
  },

  caldera: {
    name: 'Caldera',
    height: [55, 68], taper: [0.78, 0.84],
    // il raggio si allarga vicino alla cima: l'orlo del cratere sporge (strapiombo)
    profile: t => t - 0.55 * Math.exp(-(((t - 0.84) / 0.08) ** 2)),
    terrace: { step: 9, sharp: 0.2, jitter: 5 },
    temperature: 0.7,
    sky: { top: '#3b2f3a', bottom: '#c96f45', fog: '#7a4a3c', far: 210 },
    palette: { wall: '#3a3433', wall2: '#262222', ledge: '#5a4a44' },
    stamps: [{ kind: 'ledge', density: 0.0012, depth: [1.4, 2.6], halfArc: [2, 4], thick: [1.5, 3] }],
    shape(p, N) {
      // solchi verticali (dove scorre la lava)
      const g = N.ridged(p.x * 0.06, p.y * 0.012, p.z * 0.06, 2);
      return 1.8 * N.fbm(p.x * 0.04, p.y * 0.04, p.z * 0.04, 4) - 5.6 * Math.max(0, g - 0.75);
    },
    material(p, N, c) {
      if (c.flat) return MAT.ROCK;
      const g = N.ridged(p.x * 0.06, p.y * 0.012, p.z * 0.06, 2);
      // la lava solo dove anche un secondo rumore è alto → canali spezzati, non muri invalicabili
      return g > 0.86 && N.perlin(p.x * 0.05, p.y * 0.04, p.z * 0.05) > 0.05 ? MAT.LAVA : MAT.ROCK;
    },
    props: [
      { type: 'obsidian', minDepth: 1.2, spacing: 5, tries: 300, scale: [0.6, 1.4] },
      { type: 'emberRock', minDepth: 1.0, spacing: 6, tries: 220, scale: [0.6, 1.2] },
    ],
  },

  summit: {
    name: 'Vetta',
    height: [40, 52], taper: [0.06, 0.09], profile: t => Math.pow(t, 1.35),
    terrace: null,
    temperature: -0.8,
    sky: { top: '#1f4f8f', bottom: '#bcd3ea', fog: '#c9d8e8', far: 320 },
    palette: { wall: '#7a7f88', wall2: '#5c6068', ledge: '#eef3f7' },
    stamps: [{ kind: 'ledge', density: 0.0012, depth: [1.2, 2.0], halfArc: [1.5, 3], thick: [1.5, 2.5] }],
    shape(p, N) {
      return (1 - p.t) * (4 * N.ridged(p.x * 0.05, p.y * 0.03, p.z * 0.05, 3) - 2);
    },
    material(p, N, c) {
      if (c.flat) return MAT.SNOW;
      return N.perlin(p.x * 0.08, p.y * 0.08, p.z * 0.08) > 0.3 ? MAT.ICE : MAT.ROCK;
    },
    props: [
      { type: 'summitRock', minDepth: 1.0, spacing: 5, tries: 160, scale: [0.5, 1.0] },
    ],
  },
};
