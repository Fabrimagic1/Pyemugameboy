// ─────────────────────────────────────────────────────────────────────────────
// CASUALITÀ DETERMINISTICA
// Tutta la generazione parte da UNA stringa (il seed). Stesso seed → stessa
// montagna, su ogni PC. Il "seed del giorno" è la data UTC: così tutti i
// giocatori del mondo scalano la stessa montagna nello stesso giorno.
// ─────────────────────────────────────────────────────────────────────────────

// Hash di una stringa in un intero a 32 bit (variante di MurmurHash3).
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// Hash veloce di due interi (per dettagli per-cella senza consumare l'RNG).
export function hash2(i, j, seed) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function dailySeed(date = new Date()) {
  return date.toISOString().slice(0, 10); // "2026-11-05"
}

// Generatore mulberry32: piccolo, veloce, abbastanza buono per i giochi.
export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }
  nextU32() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  next() { return this.nextU32() / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  // "Fork": un RNG indipendente per ogni fase della generazione.
  // Se aggiungi un oggetto nella fase "props", la forma della montagna
  // (fase "noise") NON cambia, perché usa un altro flusso di numeri.
  fork(label) { return new RNG(hashString(this.seed + ':' + label)); }
}
