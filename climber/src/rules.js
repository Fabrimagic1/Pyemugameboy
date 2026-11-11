// ─────────────────────────────────────────────────────────────────────────────
// REGOLE CONDIVISE
// Queste costanti sono usate SIA dal generatore SIA dal giocatore.
// È il punto chiave per una generazione procedurale "giusta": il generatore
// verifica che ogni tratto sia scalabile usando esattamente le stesse regole
// di stamina che userà il giocatore. Se cambi il movimento, aggiorna qui.
// ─────────────────────────────────────────────────────────────────────────────

// Il mondo è un'isola: x, z orizzontali, y in alto. La roccia è l'unione di un
// NUCLEO (heightmap a gradoni, una cella ogni CELL metri) e di migliaia di MACIGNI 3D.
export const CELL = 1.0;
export const SEA = -0.8;          // livello del mare

// Materiali della superficie (uno per cella).
export const MAT = { ROCK: 0, SAND: 1, ICE: 2, VINE: 3, LAVA: 4, SNOW: 5, MOSS: 6 };

// climb = moltiplicatore del consumo di stamina mentre ci si arrampica.
// Infinity = non attraversabile (il validatore lo evita, il giocatore si brucia).
export const MAT_INFO = [
  { name: 'roccia',   climb: 1.0,      color: null },
  { name: 'sabbia',   climb: 1.25,     color: [0.89, 0.81, 0.60] },
  { name: 'ghiaccio', climb: 1.6,      color: [0.78, 0.89, 0.96] },
  { name: 'liane',    climb: 0.55,     color: [0.24, 0.47, 0.17] },
  { name: 'lava',     climb: Infinity, color: [1.00, 0.36, 0.08] },
  { name: 'neve',     climb: 1.3,      color: [0.94, 0.96, 0.98] },
  { name: 'muschio',  climb: 0.9,      color: [0.33, 0.50, 0.24] },
];

// Parametri dell'arrampicata (unità: stamina 0..1, metri, secondi).
export const CLIMB = {
  speedUp: 2.0,          // m/s lungo la parete
  speedSide: 1.7,        // m/s in orizzontale
  drainPerMeter: 0.055,  // stamina per metro su roccia a 50°
  idleDrain: 0.025,      // stamina/s solo per restare attaccati
  steepK: 0.45,          // quanto costa in più una parete verticale (a 90°: ×1.45)
  overhangK: 1.0,        // e uno strapiombo (soffitto: +1)
  lungeCost: 0.2,        // scatto verso l'alto
  lungeSpeed: 8.0,
};

// Una superficie è "calpestabile" (ci si cammina e ci si riposa) se la componente
// verticale della normale è almeno STAND_UP (0.64 ≈ pendenza max 50°).
export const STAND_UP = 0.64;
export const STEP = 0.6;          // gradino superabile camminando

// Frazione di stamina che il validatore può spendere tra due punti di riposo.
// <1 lascia margine per afflizioni (freddo, fame, ferite) che riducono la barra.
export const ROUTE_SAFETY = 0.6;

// Vie alternative tra due falò: il generatore ne garantisce almeno MIN_ROUTES,
// distanti tra loro almeno ROUTE_SEPARATION metri (tranne vicino ai falò).
export const MIN_ROUTES = 2;
export const MAX_ROUTES = 3;
export const ROUTE_SEPARATION = 9;

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

// up = componente verticale della normale (1 = piano, 0 = muro verticale)
// oltre la verticale (up < 0) è uno STRAPIOMBO: costa ancora di più
export function steepFactor(up) {
  const ang = (Math.acos(Math.min(1, Math.max(0, up))) * 180) / Math.PI;
  return 1 + CLIMB.steepK * clamp01((ang - 50) / 40) + CLIMB.overhangK * Math.max(0, -up);
}

// Costo in stamina di un movimento in arrampicata di `dist` metri (3D).
export function climbCost(dist, matId, up) {
  return dist * (CLIMB.drainPerMeter * MAT_INFO[matId].climb * steepFactor(up) + CLIMB.idleDrain / CLIMB.speedUp);
}

// ── NEBBIA CHE SALE ──────────────────────────────────────────────────────────
// A ogni tappa (partenza, poi ogni falò) la nebbia aspetta `delay` secondi e poi
// sale di `speed` m/s fino a poco sotto il falò SUCCESSIVO, dove si ferma finché
// non lo raggiungi. Dentro la nebbia l'afflizione "nebbia" cresce di `drain`/s.
export const FOG = { delay: 75, speed: 0.25, margin: 1.5, drain: 0.03, recover: 0.012 };

// ── OGGETTI ──────────────────────────────────────────────────────────────────
export const ITEMS = {
  piton:   { name: 'Chiodo',     weight: 4,   start: 2 },   // F in parete: punto di riposo
  bandage: { name: 'Benda',      weight: 2.5, start: 1 },   // 1: cura le ferite
  drink:   { name: 'Energetico', weight: 2.5, start: 0 },   // 2: stamina piena + arrampicata meno faticosa
};
export const PITON_REST = 0.16;   // stamina/s recuperata appesi a un chiodo
