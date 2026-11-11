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
export function toon({ rim = 0.3, sway = 0, swayBase = 0, ramp: r = RAMP_OBJECT, patch = null, ...params } = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: r, ...params });
  // three.js riusa il programma compilato tra materiali "uguali", e per lui due materiali con la
  // stessa onBeforeCompile (stesso testo) lo sono, anche se le costanti iniettate sono diverse.
  // Senza una chiave propria, un oggetto può ritrovarsi con lo shader di un altro (es. quello dei macigni).
  const key = `toon|${rim}|${sway}|${swayBase}|${patch ? ++patchCount : 0}`;
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
    color: m.color, map: m.map || null, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity ?? 1,
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
