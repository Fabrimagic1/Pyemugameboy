// ─────────────────────────────────────────────────────────────────────────────
// BIOMI = FASCE DI QUOTA di un'unica montagna-isola
//
// La montagna è una pila di "slot"; ogni giorno, per ogni slot, il seed sceglie
// UNA delle alternative (es. Giungla oppure Bosco dei Funghi). Ogni bioma è una
// PARETE alta decine di metri, coperta di macigni; in cima a ogni bioma c'è una
// SPALLA piana (qualche metro) dove sta il falò, poi ricomincia la scalata.
//
// Campi:
//   height   [min,max]  altezza della parete del bioma (m)
//   angle    [min,max]  inclinazione media della parete (°)
//   boulder  size: raggio dei macigni, tilt: quanto possono essere inclinati (°),
//            density: copertura (1 = uno strato pieno), flat: quota di macigni
//            appoggiati "in piano" (cima orizzontale = cengia sicura)
//   rock / top          colore dei fianchi e di ciò che si posa sulle facce in piano
//                       (il materiale dipende dalla PENDENZA di ogni faccia)
//   special  quota di macigni particolari: ice (scivoloso), vine (liane, facile), lava (brucia)
//   grass / props       erba e oggetti sulle cime piane
//   temperature         -1 freddo … +1 caldo (afflizioni del giocatore)
// ─────────────────────────────────────────────────────────────────────────────
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
    height: [24, 30], angle: [62, 68],
    boulder: { size: [3.2, 6.5], tilt: 28, density: 1.25, flat: 0.55 },
    rock: '#8d8779', top: '#e3bd72', topMat: 'SAND',
    special: {},
    temperature: 0,
    sky: { top: '#3f97ea', bottom: '#cfeeff', fog: '#c9e8f8', far: 620 },
    grass: { color: '#7fb842', density: 0.35, height: 0.34 },
    props: [
      { type: 'palm', spacing: 9, tries: 500, scale: [0.8, 1.3] },
      { type: 'rock', spacing: 6, tries: 260, scale: [0.6, 1.3] },
    ],
  },
  jungle: {
    name: 'Giungla',
    height: [52, 62], angle: [70, 76],
    boulder: { size: [3.6, 7.5], tilt: 30, density: 1.3, flat: 0.5 },
    rock: '#6f6a55', top: '#5aa83a', topMat: 'MOSS',
    special: { vine: 0.22 },
    temperature: 0.15,
    sky: { top: '#3a93dc', bottom: '#c8efd6', fog: '#b0dcc0', far: 340 },
    grass: { color: '#3f9a34', density: 1.0, height: 0.5 },
    props: [
      { type: 'jungleTree', spacing: 7, tries: 900, scale: [0.6, 1.0] },
      { type: 'bush', spacing: 3.5, tries: 900, scale: [0.6, 1.3] },
    ],
  },
  fungal: {
    name: 'Bosco dei Funghi',
    height: [52, 62], angle: [70, 76],
    boulder: { size: [3.6, 7.0], tilt: 26, density: 1.3, flat: 0.55 },
    rock: '#62507a', top: '#a07fc4', topMat: 'MOSS',
    special: {},
    temperature: 0.1,
    sky: { top: '#5a6fb8', bottom: '#d6c6e8', fog: '#b9a9d6', far: 280 },
    grass: { color: '#9a78c8', density: 0.8, height: 0.36 },
    props: [
      { type: 'giantMushroom', spacing: 9, tries: 600, scale: [0.7, 1.1] },
      { type: 'smallMushroom', spacing: 2.5, tries: 900, scale: [0.6, 1.4] },
    ],
  },
  alpine: {
    name: 'Ghiacciaio',
    height: [56, 66], angle: [72, 78],
    boulder: { size: [4.0, 8.0], tilt: 32, density: 1.25, flat: 0.5 },
    rock: '#6f7f98', top: '#f2f7fb', topMat: 'SNOW',
    special: { ice: 0.2 },
    temperature: -1,
    sky: { top: '#5b8fc9', bottom: '#e6f1fa', fog: '#dde9f3', far: 300 },
    grass: null,
    props: [
      { type: 'pine', spacing: 6, tries: 600, scale: [0.6, 1.0] },
      { type: 'iceShard', spacing: 5, tries: 350, scale: [0.6, 1.3] },
    ],
  },
  mesa: {
    name: 'Altopiano Rosso',
    height: [54, 64], angle: [74, 80],
    boulder: { size: [3.8, 7.5], tilt: 16, density: 1.3, flat: 0.7 },   // blocchi squadrati e ordinati
    rock: '#b5603a', top: '#e0a264', topMat: 'SAND',
    special: {},
    temperature: 1,
    sky: { top: '#4a8fd6', bottom: '#f6d9a8', fog: '#efcf9f', far: 380 },
    grass: { color: '#c2a64e', density: 0.25, height: 0.38 },
    props: [
      { type: 'cactus', spacing: 6, tries: 500, scale: [0.7, 1.3] },
      { type: 'boulder', spacing: 7, tries: 250, scale: [0.6, 1.2] },
    ],
  },
  caldera: {
    name: 'Caldera',
    height: [46, 56], angle: [70, 76],
    boulder: { size: [3.6, 7.5], tilt: 34, density: 1.3, flat: 0.5 },
    rock: '#3c3236', top: '#5e4a48', topMat: 'ROCK',
    special: { lava: 0.07 },
    temperature: 0.7,
    sky: { top: '#3a2a3c', bottom: '#e07a45', fog: '#8a4f3c', far: 260 },
    grass: null,
    props: [
      { type: 'obsidian', spacing: 5, tries: 400, scale: [0.6, 1.4] },
      { type: 'emberRock', spacing: 6, tries: 300, scale: [0.6, 1.2] },
    ],
  },
  summit: {
    name: 'Vetta',
    height: [36, 44], angle: [72, 78],
    boulder: { size: [3.2, 6.5], tilt: 30, density: 1.3, flat: 0.5 },
    rock: '#7d8696', top: '#f4f8fc', topMat: 'SNOW',
    special: { ice: 0.15 },
    temperature: -0.8,
    sky: { top: '#1f4f8f', bottom: '#bcd3ea', fog: '#c9d8e8', far: 380 },
    grass: null,
    props: [{ type: 'summitRock', spacing: 5, tries: 200, scale: [0.5, 1.0] }],
  },
};
