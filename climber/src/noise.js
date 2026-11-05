// ─────────────────────────────────────────────────────────────────────────────
// RUMORE (Perlin 3D "improved", con permutazione generata dal seed)
// Usiamo il 3D anche se la parete è 2D (θ, y): campionando il rumore nel punto
// (cos θ·r, y, sin θ·r) il pattern si richiude attorno alla montagna senza
// cuciture e ha la stessa scala in tutte le direzioni.
// ─────────────────────────────────────────────────────────────────────────────

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);
function grad(h, x, y, z) {
  h &= 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export class Noise3 {
  constructor(rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  // Valore in circa [-1, 1].
  perlin(x, y, z) {
    const P = this.perm;
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    X &= 255; Y &= 255; Z &= 255;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
    const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    return lerp(w,
      lerp(v, lerp(u, grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z)),
              lerp(u, grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z))),
      lerp(v, lerp(u, grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1)),
              lerp(u, grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1))));
  }

  // Fractal Brownian Motion: somma di ottave → dettagli a più scale. ~[-1, 1]
  fbm(x, y, z, octaves = 4) {
    let sum = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.perlin(x, y, z);
      norm += amp; amp *= 0.5; x *= 2; y *= 2; z *= 2;
    }
    return sum / norm;
  }

  // Ridged noise: creste affilate (ottimo per montagne e canali). [0, 1]
  ridged(x, y, z, octaves = 3) {
    let sum = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.perlin(x, y, z));
      sum += amp * n * n;
      norm += amp; amp *= 0.5; x *= 2; y *= 2; z *= 2;
    }
    return sum / norm;
  }
}
