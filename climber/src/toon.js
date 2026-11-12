// ─────────────────────────────────────────────────────────────────────────────
// STILE "TOON" (cel shading)
// Tre ingredienti dello stile alla Breath of the Wild:
//  1. luce a FASCE: invece di sfumare in modo continuo, la luce passa per pochi
//     gradini (gradientMap) → aspetto dipinto;
//  2. RIM LIGHT: un bordo chiaro dove la superficie è vista di taglio;
//  3. VENTO: i vertici in alto oscillano (chiome, foglie).
// Funziona solo con normali MORBIDE: vedi smoothGeometry().
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// STILE: 'real' (predefinito) = materiali fisici, luce morbida, riflessi del cielo;
//        'toon' (?style=toon)  = cel shading a fasce con luce di contorno.
// Tutto il gioco crea i materiali con toon(): cambiare stile è cambiare questa riga.
export const STYLE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('style') === 'toon' ? 'toon' : 'real';

export const windTime = { value: 0 };
let patchCount = 0;   // condiviso da tutti i materiali che oscillano

// gradino → luminosità. L'indice va da "controluce" (sinistra) a "in piena luce" (destra).
function ramp(stops, filter) {
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = filter; t.needsUpdate = true;
  return t;
}
export const RAMP_OBJECT = ramp([120, 126, 140, 190, 232, 245], THREE.NearestFilter);          // oggetti: 3 fasce nette
export const RAMP_TERRAIN = ramp([150, 156, 166, 190, 218, 238, 250, 255], THREE.LinearFilter); // terreno: più graduale

// Materiale toon con rim light e (opzionale) oscillazione al vento.
// sway = ampiezza in metri per metro di altezza sopra swayBase.
export function toon({ rim = 0.3, sway = 0, swayBase = 0, ramp: r = RAMP_OBJECT, patch = null, roughness = 0.88, ...params } = {}) {
  const real = STYLE === 'real';
  if (real) rim = 0;   // la luce di contorno è un effetto da cartone
  const m = real
    ? new THREE.MeshStandardMaterial({ roughness, metalness: 0, envMapIntensity: 0.32, ...params })
    : new THREE.MeshToonMaterial({ gradientMap: r, ...params });
  // three.js riusa il programma compilato tra materiali "uguali", e per lui due materiali con la
  // stessa onBeforeCompile (stesso testo) lo sono, anche se le costanti iniettate sono diverse.
  // Senza una chiave propria, un oggetto può ritrovarsi con lo shader di un altro (es. quello dei macigni).
  const key = `${STYLE}|${rim}|${sway}|${swayBase}|${patch ? ++patchCount : 0}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = shader => {
    if (rim > 0) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
      outgoingLight += diffuseColor.rgb * rimF * ${rim.toFixed(3)};
      #include <opaque_fragment>`);
    if (sway > 0) {
      shader.uniforms.uWindTime = windTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 swP = instanceMatrix[3].xyz;
          #else
            vec3 swP = vec3(0.0);
          #endif
          float swA = max(0.0, position.y - ${swayBase.toFixed(2)}) * ${sway.toFixed(4)};
          transformed.x += sin(uWindTime * 1.3 + swP.x * 0.35 + swP.z * 0.21 + position.y * 0.4) * swA;
          transformed.z += cos(uWindTime * 1.1 + swP.z * 0.30 + position.y * 0.3) * swA * 0.7;`);
    }
    if (patch) patch(shader);
  };
  return m;
}

// Converte un materiale qualunque (PBR dei GLB, Lambert…) in toon mantenendo colore ed emissione.
const cache = new Map();
export function toToon(m, opts = {}) {
  if (m.isMeshToonMaterial) return m;
  const key = m.uuid + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, toon({
    name: m.name, color: m.color, map: m.map || null, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity ?? 1,
    ...(STYLE === 'real' && m.roughness !== undefined ? { roughness: Math.max(0.6, m.roughness) } : {}),
    transparent: m.transparent, opacity: m.opacity, side: m.side, ...opts,
  }));
  return cache.get(key);
}

// Normali morbide: i modelli low-poly hanno vertici duplicati con una normale per
// faccia (aspetto spigoloso). Unendo i vertici e ricalcolando le normali, la luce
// scorre liscia sulla superficie senza aggiungere un solo triangolo.
export function smoothGeometry(geo) {
  const g = geo.clone();
  g.deleteAttribute('normal');
  const out = mergeVertices(g, 1e-4);
  out.computeVertexNormals();
  return out;
}

// Ammorbidisce e "toonifica" un'intera scena caricata da GLB (falò, bandiera, personaggio).
// Con le mesh con scheletro funziona uguale: i pesi delle ossa viaggiano con i vertici.
export function softenScene(scene, opts = {}) {
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.geometry = smoothGeometry(o.geometry);
    o.material = Array.isArray(o.material) ? o.material.map(m => toToon(m, opts)) : toToon(o.material, opts);
    o.castShadow = true;
  });
  return scene;
}

// ── Personaggio: più triangoli e forme più morbide, senza perdere lo scheletro ──
// I modelli low-poly hanno arti fatti di scatole. Qui ogni triangolo viene diviso in 4 (con i
// pesi delle ossa ereditati dagli estremi di ogni spigolo) e poi si leviga con Taubin (due passi:
// uno che arrotonda, uno che compensa il restringimento). Il risultato: braccia e gambe a
// capsula, stessa animazione. Funziona perché ogni parte è rigida su un solo osso.
export function refineSkinned(geo, steps = 1, smooth = 3) {
  let g = geo;
  for (let s = 0; s < steps; s++) {
    const idx = g.index.array, attrs = Object.entries(g.attributes), vcount = g.attributes.position.count;
    const out = attrs.map(([, a]) => ({ a, data: Array.from(a.array) })), mid = new Map(), tris = [];
    const edge = (i, j) => {
      const key = i < j ? i * 1e6 + j : j * 1e6 + i;
      let m = mid.get(key);
      if (m === undefined) {
        m = out[0].data.length / out[0].a.itemSize;
        out.forEach(({ a, data }, k) => {
          const isIdx = attrs[k][0] === 'skinIndex';
          for (let c = 0; c < a.itemSize; c++) data.push(isIdx ? a.array[i * a.itemSize + c] : (a.array[i * a.itemSize + c] + a.array[j * a.itemSize + c]) / 2);
        });
        mid.set(key, m);
      }
      return m;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2], ab = edge(a, b), bc = edge(b, c), ca = edge(c, a);
      tris.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const ng = new THREE.BufferGeometry();
    out.forEach(({ a, data }, k) => ng.setAttribute(attrs[k][0], new THREE.BufferAttribute(new a.array.constructor(data), a.itemSize)));
    ng.setIndex(new THREE.BufferAttribute(new Uint32Array(tris), 1));
    g = ng;
  }
  // adiacenza per levigare
  const P = g.attributes.position, n = P.count, nb = Array.from({ length: n }, () => new Set());
  const I = g.index.array;
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { nb[I[t + k]].add(I[t + (k + 1) % 3]); nb[I[t + (k + 1) % 3]].add(I[t + k]); }
  const pos = P.array, tmp = new Float32Array(pos.length);
  const pass = f => {
    for (let v = 0; v < n; v++) {
      const s = nb[v]; if (!s.size) { tmp.set(pos.subarray(v * 3, v * 3 + 3), v * 3); continue; }
      let x = 0, y = 0, z = 0; for (const w of s) { x += pos[w * 3]; y += pos[w * 3 + 1]; z += pos[w * 3 + 2]; }
      const k = 1 / s.size;
      tmp[v * 3] = pos[v * 3] + f * (x * k - pos[v * 3]); tmp[v * 3 + 1] = pos[v * 3 + 1] + f * (y * k - pos[v * 3 + 1]); tmp[v * 3 + 2] = pos[v * 3 + 2] + f * (z * k - pos[v * 3 + 2]);
    }
    pos.set(tmp);
  };
  for (let s = 0; s < smooth; s++) { pass(0.5); pass(-0.53); }
  g.computeVertexNormals();
  return g;
}

// Texture di tessuto/pelle per nome di materiale del GLB, in proiezione triplanare nello spazio
// dell'oggetto (la posizione prima dello skinning: la texture segue il corpo mentre si muove).
//   spec[nome] = { map, scale, bump, roughness, tint }
export function applyMaterialTextures(root, spec) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      // il pacchetto del personaggio ha scritto i colori sRGB nel campo lineare di glTF:
      // letti come lineari vengono pastello. Qui si riportano ai valori voluti (una volta sola).
      if (!m.userData.srgbFixed) { m.color.convertSRGBToLinear(); m.userData.srgbFixed = true; }
      const s = spec[m.name]; if (!s) return;
      m.color.multiplyScalar(s.exposure ?? 1);
      if (s.roughness !== undefined && m.roughness !== undefined) m.roughness = s.roughness;
      if (s.tint) m.color.multiply(s.tint);
      if (!s.map) return;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = shader => {
        prev && prev(shader);
        shader.uniforms.uTex = { value: s.map }; shader.uniforms.uAvg = { value: s.map.userData.avgLum || 0.4 };
        shader.uniforms.uScale = { value: s.scale || 3 }; shader.uniforms.uBump = { value: s.bump || 0 };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvON = normal;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON; uniform sampler2D uTex; uniform float uAvg; uniform float uScale; uniform float uBump;\nfloat gH = 0.0;')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            if (uBump > 0.0) {
              vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
              float dhx = dFdx(gH), dhy = dFdy(gH);
              vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
              float det = dot(dpx, r1);
              normal = normalize(abs(det) * normal - uBump * sign(det) * (dhx * r1 + dhy * r2));
            }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            {
              vec3 bw = pow(abs(vON), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
              vec3 t = texture2D(uTex, vOP.zy * uScale, 1.8).rgb * bw.x + texture2D(uTex, vOP.xz * uScale, 1.8).rgb * bw.y + texture2D(uTex, vOP.xy * uScale, 1.8).rgb * bw.z;   // bias 1.8 = sfocata, niente mosaico
              float l = dot(t, vec3(0.299, 0.587, 0.114)) / uAvg;     // solo la luminosità: il colore lo dà il materiale
              diffuseColor.rgb *= mix(1.0, clamp(l, 0.5, 1.5), 0.6);
              gH = l;
            }`);
      };
      m.customProgramCacheKey = () => 'ctex|' + m.name;
      m.needsUpdate = true;
    });
  });
}
