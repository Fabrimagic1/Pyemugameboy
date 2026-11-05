// ─────────────────────────────────────────────────────────────────────────────
// REGOLE CONDIVISE
// Queste costanti sono usate SIA dal generatore SIA dal giocatore.
// È il punto chiave per una generazione procedurale "giusta": il generatore
// verifica che la montagna sia scalabile usando esattamente le stesse regole
// di stamina che userà il giocatore. Se cambi il movimento, aggiorna qui.
// ─────────────────────────────────────────────────────────────────────────────

// La montagna è una funzione r = R(θ, y) campionata su una griglia:
// GRID_W colonne attorno alla montagna, una riga ogni GRID_DY metri di quota.
export const GRID_W = 512;
export const GRID_DY = 0.5;

// Materiali della superficie (uno per cella della griglia).
export const MAT = { ROCK: 0, SAND: 1, ICE: 2, VINE: 3, LAVA: 4, SNOW: 5, MOSS: 6 };

// climb = moltiplicatore del consumo di stamina mentre ci si arrampica.
// Infinity = non attraversabile (il validatore lo evita, il giocatore si brucia).
export const MAT_INFO = [
  { name: 'roccia',   climb: 1.0,      color: null },
  { name: 'sabbia',   climb: 1.25,     color: [0.89, 0.81, 0.60] },
  { name: 'ghiaccio', climb: 1.9,      color: [0.78, 0.89, 0.96] },
  { name: 'liane',    climb: 0.55,     color: [0.24, 0.47, 0.17] },
  { name: 'lava',     climb: Infinity, color: [1.00, 0.36, 0.08] },
  { name: 'neve',     climb: 1.3,      color: [0.94, 0.96, 0.98] },
  { name: 'muschio',  climb: 0.9,      color: [0.33, 0.50, 0.24] },
];

// Parametri dell'arrampicata (unità: stamina 0..1, metri, secondi).
export const CLIMB = {
  speedUp: 2.0,          // m/s in verticale
  speedSide: 1.7,        // m/s in orizzontale
  drainPerMeter: 0.055,  // stamina consumata per metro su roccia verticale
  idleDrain: 0.025,      // stamina/s solo per restare attaccati
  overhangK: 1.6,        // quanto pesano gli strapiombi
  overhangMax: 2.6,      // moltiplicatore massimo (soffitto)
  lungeCost: 0.2,        // scatto verso l'alto
  lungeSpeed: 8.0,
};

// Una superficie è "calpestabile" (ci si può riposare) se la componente verticale
// della sua normale è almeno STAND_UP (0.64 ≈ pendenza max 50°).
export const STAND_UP = 0.64;

// Frazione di stamina che il validatore può spendere tra due punti di riposo.
// <1 lascia margine per afflizioni (freddo, fame, ferite) che riducono la barra.
export const ROUTE_SAFETY = 0.6;

// dR/dy > 0 vuol dire che salendo la parete "esce" verso di te: strapiombo.
export function overhangFactor(dRdy) {
  return dRdy <= 0 ? 1 : Math.min(CLIMB.overhangMax, 1 + dRdy * CLIMB.overhangK);
}

// Costo in stamina di un movimento in arrampicata di `dist` metri.
export function climbCost(dist, matId, dRdy, vertical) {
  const f = MAT_INFO[matId].climb * overhangFactor(dRdy);
  const speed = vertical ? CLIMB.speedUp : CLIMB.speedSide;
  return dist * (CLIMB.drainPerMeter * f + CLIMB.idleDrain / speed);
}

// Pavimento dell'isola attorno alla montagna (spiaggia che scende in mare).
export function islandFloor(r) {
  if (r < 215) return 0;
  if (r < 240) return -((r - 215) / 25) * 1.5;
  return -1.5 - ((r - 240) / 60) * 4.5;
}
