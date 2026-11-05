// ─────────────────────────────────────────────────────────────────────────────
// SUPERFICIE "COTTA" (baked)
// Il generatore valuta funzioni costose (rumore, biomi, timbri) UNA volta e
// salva il risultato in una griglia. Fisica, rendering, validatore e minimappa
// leggono tutti la stessa griglia → ciò che vedi è esattamente ciò che tocchi.
//
// Coordinate: θ = angolo attorno all'asse della montagna, y = quota,
// r = distanza dall'asse. La parete è r = R(θ, y).
// ─────────────────────────────────────────────────────────────────────────────
import { GRID_W, GRID_DY, STAND_UP } from './rules.js';

const TAU = Math.PI * 2;
export const FLAG_STAND = 1;

export class Surface {
  constructor(height) {
    this.W = GRID_W;
    this.dy = GRID_DY;
    this.height = height;
    this.rows = Math.ceil(height / GRID_DY) + 2;
    const n = this.W * this.rows;
    this.R = new Float32Array(n);     // raggio della parete
    this.M = new Uint8Array(n);       // materiale
    this.B = new Uint8Array(n);       // indice del bioma (con dithering ai confini)
    this.F = new Uint8Array(n);       // flag (calpestabile, ...)
    this.UP = new Float32Array(n);    // componente verticale della normale
    this.DRDY = new Float32Array(n);  // pendenza dR/dy (>0 = strapiombo)
  }

  idx(i, j) {
    const W = this.W;
    i %= W; if (i < 0) i += W;
    return j * W + i;
  }
  theta(i) { return (i / this.W) * TAU; }
  col(theta) {
    let u = (theta / TAU) * this.W;
    u %= this.W; if (u < 0) u += this.W;
    return u;
  }
  arcStep(r) { return (TAU / this.W) * Math.max(r, 0.5); }

  // Raggio interpolato bilinearmente (usato dalla fisica).
  radius(theta, y) {
    let v = y / this.dy;
    if (v < 0) v = 0;
    const j0 = Math.floor(v);
    if (j0 >= this.rows - 1) return 0;
    const fy = v - j0;
    const u = this.col(theta);
    const i0 = Math.floor(u) % this.W, i1 = (i0 + 1) % this.W, fx = u - Math.floor(u);
    const W = this.W, R = this.R, a = j0 * W, b = a + W;
    const r0 = R[a + i0] + (R[a + i1] - R[a + i0]) * fx;
    const r1 = R[b + i0] + (R[b + i1] - R[b + i0]) * fx;
    return r0 + (r1 - r0) * fy;
  }

  dRdy(theta, y, h = 0.25) {
    return (this.radius(theta, y + h) - this.radius(theta, y - h)) / (2 * h);
  }

  // Componente verticale della normale della superficie F = r - R(θ,y) = 0.
  upNormal(theta, y) {
    const r = Math.max(this.radius(theta, y), 0.5);
    const e = 0.004;
    const a = (this.radius(theta + e, y) - this.radius(theta - e, y)) / (2 * e * r);
    const d = this.dRdy(theta, y);
    return -d / Math.sqrt(1 + a * a + d * d);
  }

  cell(theta, y) {
    const i = Math.round(this.col(theta)) % this.W;
    const j = Math.min(this.rows - 1, Math.max(0, Math.round(y / this.dy)));
    return j * this.W + i;
  }
  material(theta, y) { return this.M[this.cell(theta, y)]; }
  biome(theta, y) { return this.B[this.cell(theta, y)]; }

  // Prima quota (salendo da yFrom) in cui la parete è "dentro" il raggio r:
  // cioè l'altezza del pavimento sotto un punto a distanza r dall'asse.
  groundHeight(theta, r, yFrom, yTo, step = 0.05) {
    for (let y = yFrom; y <= yTo; y += step) if (this.radius(theta, y) <= r) return y;
    return null;
  }

  toWorld(theta, y, r) {
    return { x: r * Math.cos(theta), y, z: r * Math.sin(theta) };
  }

  // Ricalcola pendenze, normali e "calpestabilità" per le righe [j0, j1].
  computeDerived(j0, j1) {
    const W = this.W, R = this.R, dy = this.dy, dA = TAU / W;
    j0 = Math.max(1, j0); j1 = Math.min(this.rows - 2, j1);
    for (let j = j0; j <= j1; j++) {
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        const r = R[c];
        const d = (R[c + W] - R[c - W]) / (2 * dy);
        const l = R[j * W + ((i + W - 1) % W)], rr = R[j * W + ((i + 1) % W)];
        const a = (rr - l) / (2 * dA * Math.max(r, 1));
        const up = -d / Math.sqrt(1 + a * a + d * d);
        this.DRDY[c] = d;
        this.UP[c] = up;
        this.F[c] = up >= STAND_UP && r > 0.3 ? FLAG_STAND : 0;
      }
    }
    if (j0 === 1) for (let i = 0; i < W; i++) {
      this.DRDY[i] = this.DRDY[W + i]; this.UP[i] = this.UP[W + i]; this.F[i] = this.F[W + i];
    }
  }
}
