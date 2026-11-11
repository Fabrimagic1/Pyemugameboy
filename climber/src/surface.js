// ─────────────────────────────────────────────────────────────────────────────
// TERRENO "COTTO" (baked heightmap)
// Il generatore valuta funzioni costose (rumore, biomi, timbri) UNA volta e
// salva il risultato in una griglia. Fisica, rendering, validatore e mappa
// leggono tutti la stessa griglia → ciò che vedi è esattamente ciò che tocchi.
//
// Coordinate: x = laterale, z = avanti (dalla spiaggia verso la vetta), y = quota.
// ─────────────────────────────────────────────────────────────────────────────
import { CELL, STAND_UP, SEA } from './rules.js';

export const FLAG_STAND = 1;

export class Terrain {
  constructor(x0, z0, nx, nz, cell = CELL) {
    this.C = cell;
    this.x0 = x0; this.z0 = z0;
    this.nx = nx; this.nz = nz;
    const n = nx * nz;
    this.H = new Float32Array(n);     // quota
    this.G = new Float32Array(n);     // pendenza |∇h| (serve alla distanza dal nucleo)
    this.M = new Uint8Array(n);       // materiale
    this.B = new Uint8Array(n);       // bioma (con dithering ai confini)
    this.F = new Uint8Array(n);       // flag (calpestabile)
    this.UP = new Float32Array(n);    // componente verticale della normale
  }

  xOf(i) { return this.x0 + i * this.C; }
  zOf(j) { return this.z0 + j * this.C; }
  colOf(x) { return Math.round((x - this.x0) / this.C); }
  rowOf(z) { return Math.round((z - this.z0) / this.C); }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz; }

  // Quota interpolata bilinearmente (usata dalla fisica).
  height(x, z) {
    let u = (x - this.x0) / this.C, v = (z - this.z0) / this.C;
    if (u < 0 || v < 0 || u > this.nx - 1.001 || v > this.nz - 1.001) return -20;
    const i = Math.floor(u), j = Math.floor(v);
    u -= i; v -= j;
    const H = this.H, a = j * this.nx + i, b = a + this.nx;
    const h0 = H[a] + (H[a + 1] - H[a]) * u;
    const h1 = H[b] + (H[b + 1] - H[b]) * u;
    return h0 + (h1 - h0) * v;
  }

  gradient(x, z, e = 0.3) {
    return [
      (this.height(x + e, z) - this.height(x - e, z)) / (2 * e),
      (this.height(x, z + e) - this.height(x, z - e)) / (2 * e),
    ];
  }

  // 1 = piano, 0 = verticale
  upNormal(x, z) {
    const [gx, gz] = this.gradient(x, z);
    return 1 / Math.sqrt(1 + gx * gx + gz * gz);
  }

  cell(x, z) {
    const i = Math.min(this.nx - 1, Math.max(0, this.colOf(x)));
    const j = Math.min(this.nz - 1, Math.max(0, this.rowOf(z)));
    return j * this.nx + i;
  }
  material(x, z) { return this.M[this.cell(x, z)]; }
  biome(x, z) { return this.B[this.cell(x, z)]; }

  // Ricalcola normali e "calpestabilità" per le righe [j0, j1].
  computeDerived(j0, j1) {
    const nx = this.nx, H = this.H, C2 = 2 * this.C;
    j0 = Math.max(0, j0); j1 = Math.min(this.nz - 1, j1);
    for (let j = j0; j <= j1; j++) {
      const jm = Math.max(0, j - 1), jp = Math.min(this.nz - 1, j + 1);
      for (let i = 0; i < nx; i++) {
        const im = Math.max(0, i - 1), ip = Math.min(nx - 1, i + 1);
        const gx = (H[j * nx + ip] - H[j * nx + im]) / C2;
        const gz = (H[jp * nx + i] - H[jm * nx + i]) / C2;
        const c = j * nx + i;
        const up = 1 / Math.sqrt(1 + gx * gx + gz * gz);
        this.UP[c] = up; this.G[c] = Math.hypot(gx, gz);
        this.F[c] = up >= STAND_UP && H[c] > SEA + 0.15 ? FLAG_STAND : 0;
      }
    }
  }
}
