// ─────────────────────────────────────────────────────────────────────────────
// VEGETAZIONE PROCEDURALE "ORGANICA"
// Alberi fatti come li farebbe un modellatore in stile dipinto:
//  - TRONCO: un tubo curvo che si assottiglia, con la base allargata (radici);
//  - CHIOMA: masse arrotondate ("blob") deformate da rumore, con normali
//    "sferizzate" (puntano via dal centro della massa) → luce morbida, niente facce;
//  - COLORE nei vertici: scuro sotto e dentro, chiaro sopra dove batte il sole.
// Ogni tipo ha più VARIANTI (seed diversi) così il bosco non è fatto di copie.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';

const rng = seed => { let s = (seed * 2654435761) >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const n3 = (x, y, z) => Math.sin(x * 1.7 + y * 2.3) * Math.cos(z * 1.9 - y * 1.1) * 0.6 + Math.sin(x * 3.1 - z * 2.7 + y * 0.7) * 0.4;
const C = h => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// colora i vertici con fn(colore, x, y, z, normaleY)
function paint(geo, fn, kind = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
  geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(p.count).fill(kind), 1));   // 0 = corteccia, 1 = foglie
  for (let i = 0; i < p.count; i++) {
    fn(col, p.getX(i), p.getY(i), p.getZ(i), n.getY(i));
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const ramp3 = (col, a, b, c, t) => (t < 0.5 ? col.copy(a).lerp(b, Math.max(0, t) * 2) : col.copy(b).lerp(c, Math.min(1, (t - 0.5) * 2)));

// massa arrotondata e irregolare, centrata nell'origine
function blob(r, { detail = 2, squash = 1, rough = 0.2, seed = 1 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = r * (1 + rough * n3(x * 2.2 + seed, y * 2.2 + seed * 0.3, z * 2.2 - seed * 0.7));
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {   // normali sferizzate
    v.set(n.getX(i), n.getY(i), n.getZ(i));
    w.set(p.getX(i), p.getY(i) / squash, p.getZ(i)).normalize();
    v.lerp(w, 0.6).normalize(); n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// tubo lungo una serie di punti, con raggio per punto; normali morbide
function tube(pts, radii, sides = 8) {
  const pos = [], idx = [], t = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  pts.forEach((p, i) => {
    t.copy(pts[Math.min(pts.length - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize();
    u.crossVectors(t, Math.abs(t.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)).normalize();
    v.crossVectors(t, u);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, c = Math.cos(a) * radii[i], s = Math.sin(a) * radii[i];
      pos.push(p.x + u.x * c + v.x * s, p.y + u.y * c + v.y * s, p.z + u.z * c + v.z * s);
    }
  });
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
    idx.push(a, b, c, b, d, c);
  }
  const top = pos.length / 3, last = pts[pts.length - 1];
  pos.push(last.x, last.y, last.z);
  for (let k = 0; k < sides; k++) idx.push((pts.length - 1) * sides + k, (pts.length - 1) * sides + ((k + 1) % sides), top);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// foglia lunga e arcuata (palma): nastro con nervatura centrale rialzata
function frond(origin, dir, length, width, droop) {
  const pos = [], idx = [], N = 7, side = V(-dir.z, 0, dir.x);
  for (let i = 0; i <= N; i++) {
    const s = i / N, w = width * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.92 + 0.08)), 0.7) * 0.5;
    const c = V(origin.x + dir.x * length * s, origin.y + 0.9 * s - droop * s * s, origin.z + dir.z * length * s);
    pos.push(c.x - side.x * w, c.y - 0.1, c.z - side.z * w, c.x, c.y + 0.06, c.z, c.x + side.x * w, c.y - 0.1, c.z + side.z * w);
  }
  for (let i = 0; i < N; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const BARK = [C('#4a3323'), C('#6b4a31'), C('#8a6846')];
const bark = geo => paint(geo, (col, x, y, z) => ramp3(col, BARK[0], BARK[1], BARK[2], 0.45 + 0.4 * n3(x * 3, y * 0.8, z * 3)), 0);
const leaves = (geo, pal, r) => paint(geo, (col, x, y, z, ny) =>
  ramp3(col, pal[0], pal[1], pal[2], 0.5 + 0.38 * (y / r) + 0.22 * ny + 0.12 * n3(x, y, z)));
const done = parts => mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false);

function jungleTree(seed) {
  const R = rng(seed), H = 5.4 + R() * 1.8, lean = (R() - 0.5) * 1.4, lz = (R() - 0.5) * 0.8;
  const pal = [C('#1d5a2c'), C('#3f9a3c'), C('#a3d957')];
  const tp = [V(0, -0.3, 0), V(0, 0.5, 0), V(lean * 0.25, H * 0.4, lz * 0.3), V(lean * 0.65, H * 0.75, lz * 0.7), V(lean, H, lz)];
  const parts = [bark(tube(tp, [0.95, 0.55, 0.45, 0.36, 0.26], 9))];
  const n = 6 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R(), d = 1.0 + R() * 2.0, r = 1.5 + R() * 1.0;
    const c = V(lean + Math.cos(a) * d, H + 0.6 + R() * 1.8 - d * 0.3, lz + Math.sin(a) * d);
    parts.push(bark(tube([tp[3], V((tp[3].x + c.x) / 2, (tp[3].y + c.y) / 2 + 0.3, (tp[3].z + c.z) / 2), c], [0.2, 0.13, 0.07], 6)));
    parts.push(leaves(blob(r, { seed: seed * 7 + k, squash: 0.78, rough: 0.22 }), pal, r).translate(c.x, c.y, c.z));
  }
  parts.push(leaves(blob(2.3, { seed: seed * 13, squash: 0.8 }), pal, 2.3).translate(lean, H + 1.9, lz));
  return done(parts);
}

function palm(seed) {
  const R = rng(seed), H = 5.2 + R() * 1.4, bend = 1.2 + R() * 1.6;
  const pal = [C('#1f6b34'), C('#44a544'), C('#b5dc5c')];
  const pts = [], rad = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(V(bend * t * t, H * t - 0.2, 0)); rad.push(0.34 - 0.17 * t + (i === 0 ? 0.14 : 0)); }
  const parts = [paint(tube(pts, rad, 8), (col, x, y) => ramp3(col, BARK[0], BARK[2], C('#a88a5c'), 0.5 + 0.35 * Math.sin(y * 9)), 0)];
  const crown = pts[7], n = 9 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R() * 0.4, L = 2.6 + R() * 0.9;
    parts.push(leaves(frond(crown, V(Math.cos(a), 0, Math.sin(a)), L, 0.95, 1.7 + R() * 0.9), pal, 1.2).translate(0, 0, 0));
  }
  for (let k = 0; k < 3; k++) parts.push(paint(blob(0.19, { detail: 1, rough: 0.05 }), col => col.set('#5b3d22'), 0).translate(crown.x + Math.cos(k * 2.1) * 0.25, crown.y - 0.22, Math.sin(k * 2.1) * 0.25));
  return done(parts);
}

function pine(seed) {
  const R = rng(seed), H = 6.2 + R() * 1.6, tiers = 5;
  const green = [C('#16402e'), C('#25634a'), C('#3f8a63')], snow = C('#f4f9fd');
  const parts = [bark(tube([V(0, -0.3, 0), V(0, 0.4, 0), V(0, H * 0.6, 0), V(0, H, 0)], [0.42, 0.26, 0.16, 0.04], 7))];
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1), r = 2.1 - 1.5 * t + R() * 0.2, h = 2.3 - 0.8 * t, y0 = 1.3 + t * (H - 2.6);
    let g = new THREE.ConeGeometry(r, h, 12, 3, true);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {   // orlo irregolare e cadente
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), low = Math.max(0, 0.5 - (y / h + 0.5));
      const k2 = 1 + low * (0.35 * Math.sin(a * 5 + seed + k) + 0.2 * Math.sin(a * 9 + k * 2));
      p.setXYZ(i, x * k2, y - low * 0.5 * (1 + Math.sin(a * 5 + seed + k)), z * k2);
    }
    g.computeVertexNormals();
    paint(g, (col, x, y, z) => {   // neve sulla parte alta di ogni balza
      const f = y / h + 0.5 + 0.18 * n3(x * 2, y, z * 2);
      if (f > 0.52) col.copy(snow).lerp(green[2], Math.max(0, 0.75 - f) * 2);
      else ramp3(col, green[0], green[1], green[2], f * 1.6);
    });
    parts.push(g.translate(0, y0 + h / 2, 0));
  }
  return done(parts);
}

function bush(seed) {
  const R = rng(seed), pal = [C('#1f5e2d'), C('#3f9a3c'), C('#9bd655')], parts = [];
  const n = 4 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const a = R() * 6.28, d = k ? 0.35 + R() * 0.5 : 0, r = 0.45 + R() * 0.4;
    parts.push(leaves(blob(r, { seed: seed * 5 + k, squash: 0.85, rough: 0.25 }), pal, r).translate(Math.cos(a) * d, r * 0.75, Math.sin(a) * d));
  }
  return done(parts);
}

// tipo → { varianti, costruttore, opzioni del materiale }
export const FLORA = {
  jungleTree: { variants: 4, build: jungleTree, mat: { sway: 0.012, swayBase: 3 } },
  palm:       { variants: 3, build: palm, mat: { sway: 0.016, swayBase: 2.5, side: THREE.DoubleSide } },
  pine:       { variants: 3, build: pine, mat: { sway: 0.006, swayBase: 2 } },
  bush:       { variants: 3, build: bush, mat: { sway: 0.03, swayBase: 0.2 } },
};

// Texture vere su corteccia e foglie (assets/manifest.json → textures.bark / textures.foliage):
// proiezione triplanare in spazio dell'oggetto, quindi senza coordinate UV. Il colore dei vertici
// (scuro sotto, chiaro sopra) viene usato come luminosità, così la chioma resta sfumata.
function treeTextures(tx) {
  if (!tx || !tx.bark || !tx.foliage) return null;
  return shader => {
    shader.uniforms.uBark = { value: tx.bark }; shader.uniforms.uLeaf = { value: tx.foliage };
    shader.uniforms.uBarkAvg = { value: tx.bark.userData.avgLum || 0.3 }; shader.uniforms.uLeafAvg = { value: tx.foliage.userData.avgLum || 0.3 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind; varying float vKind; varying vec3 vOP; varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = aKind; vOP = position; vON = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vKind; varying vec3 vOP; varying vec3 vON;
        uniform sampler2D uBark; uniform sampler2D uLeaf; uniform float uBarkAvg; uniform float uLeafAvg;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 bw = pow(abs(vON), vec3(3.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 b = texture2D(uBark, vec2(vOP.x + vOP.z, vOP.y) * 0.9).rgb;               // solchi verticali
          vec3 l = texture2D(uLeaf, vOP.zy * 0.42).rgb * bw.x + texture2D(uLeaf, vOP.xz * 0.42).rgb * bw.y + texture2D(uLeaf, vOP.xy * 0.42).rgb * bw.z;
          float v = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));                    // luminosità dal colore dei vertici
          vec3 tex = mix(l / uLeafAvg * 0.55, b / uBarkAvg * 0.5, 1.0 - step(0.5, vKind));
          vec3 tint = diffuseColor.rgb / max(v, 0.02);                                   // tinta (verde, marrone…)
          diffuseColor.rgb = clamp(tex, 0.0, 2.0) * mix(vec3(1.0), tint, 0.55) * v * 2.2;
        }`);
  };
}

const built = new Map();
export function floraPart(type, variant, tx = null) {
  const key = type + '|' + variant;
  if (!built.has(key)) {
    const f = FLORA[type], patch = treeTextures(tx);
    built.set(key, { geometry: f.build(variant * 31 + type.length * 7 + 1), material: toon({ vertexColors: true, rim: 0.22, patch, ...f.mat }), matrix: new THREE.Matrix4() });
  }
  return built.get(key);
}
