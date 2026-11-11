// ─────────────────────────────────────────────────────────────────────────────
// ASSET ESTERNI (opzionali)
// Legge assets/manifest.json. Tutto ciò che è elencato lì viene caricato e
// sostituisce la versione procedurale; ciò che manca resta procedurale.
// Così puoi aggiungere i modelli generati con l'AI uno alla volta.
// Vedi assets/README.md per l'elenco degli asset e le specifiche.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export async function loadAssets(base = 'assets/') {
  const out = { models: {}, textures: {}, character: null };
  let manifest;
  try {
    const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) return out;
    manifest = await r.json();
  } catch { return out; }

  const models = Object.entries(manifest.models || {});
  if (models.length || manifest.character) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const load = file => new Promise((res, rej) => loader.load(base + file, res, undefined, rej));
    await Promise.all(models.map(async ([name, def]) => {
      const d = typeof def === 'string' ? { file: def } : def;
      try {
        const gltf = await load(d.file);
        out.models[name] = { scene: gltf.scene, scale: d.scale ?? 1, flat: !!d.flat };
      } catch (e) { console.warn(`Modello "${name}" non caricato (${d.file}):`, e.message || e); }
    }));
    if (manifest.character) {
      const d = manifest.character;
      try {
        const gltf = await load(d.file);
        out.character = { ...d, scene: gltf.scene, animations: gltf.animations };
      } catch (e) { console.warn('Personaggio non caricato:', e.message || e); }
    }
  }

  const tl = new THREE.TextureLoader();
  await Promise.all(Object.entries(manifest.textures || {}).map(([name, file]) => new Promise(res => {
    tl.load(base + file, tex => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.userData.avgLum = averageLuminance(tex.image);
      tex.anisotropy = 8;
      out.textures[name] = tex; res();
    }, undefined, () => { console.warn(`Texture "${name}" non caricata (${file})`); res(); });
  })));
  return out;
}

// Luminosità media di un'immagine: serve a usare la texture come dettaglio
// "centrato su 1", così una texture scura non scurisce tutto il terreno.
function averageLuminance(image) {
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const ctx = cv.getContext('2d'); ctx.drawImage(image, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return Math.max(0.05, s / (d.length / 4) / 255);
  } catch { return 0.5; }
}

// Texture di dettaglio procedurali (grigie, ripetibili) usate se non ne fornisci tu.
export function proceduralDetail(kind, size = 256, seed = 1) {
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // rumore a valori su reticolo periodico → texture senza cuciture
  const octave = cells => {
    const g = Array.from({ length: cells * cells }, rnd);
    return (x, y) => {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const o = [4, 8, 16, 32, 64].map(octave);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v;
    if (kind === 'rock') {
      // strati + crepe (ridged)
      const n = o[0](x, y) * 0.35 + o[1](x, y) * 0.25 + o[2](x, y) * 0.2 + o[3](x, y) * 0.12 + o[4](x, y) * 0.08;
      const crack = 1 - Math.abs(o[2](x, y) * 2 - 1);
      v = 0.6 + (n - 0.5) * 0.55 - Math.pow(crack, 22) * 0.25 + (rnd() - 0.5) * 0.06;
    } else {
      // terreno: macchie e granuli
      const n = o[1](x, y) * 0.4 + o[3](x, y) * 0.3 + o[4](x, y) * 0.3;
      v = 0.6 + (n - 0.5) * 0.5 + (rnd() - 0.5) * 0.12;
    }
    const c = Math.max(0, Math.min(255, v * 255)), i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.userData.avgLum = averageLuminance(cv);
  return tex;
}

// Aggiunge al materiale del terreno una texture "triplanare": proiettata dai
// tre assi e mescolata secondo la normale, così non si stira sulle pareti.
// Le pareti usano `rock`, i pianori `ground`. Le texture vengono usate come
// dettaglio in scala di grigi (diviso per la luminosità media) che moltiplica
// il colore dei vertici: i colori dei biomi restano, la texture aggiunge il disegno.
export function addTriplanarDetail(material, rock, ground, scale = 0.3, strength = 0.6) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uRock = { value: rock };
    shader.uniforms.uGround = { value: ground };
    shader.uniforms.uScale = { value: scale };
    shader.uniforms.uStrength = { value: strength };
    shader.uniforms.uRockAvg = { value: rock.userData.avgLum || 0.5 };
    shader.uniforms.uGroundAvg = { value: ground.userData.avgLum || 0.5 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNorm;
uniform sampler2D uRock; uniform sampler2D uGround; uniform float uScale; uniform float uStrength;
uniform float uRockAvg; uniform float uGroundAvg;
float tpLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 bw = pow(abs(vWNorm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float r = tpLum(texture2D(uRock, vWPos.zy * uScale).rgb) * bw.x
          + tpLum(texture2D(uRock, vWPos.xz * uScale).rgb) * bw.y
          + tpLum(texture2D(uRock, vWPos.xy * uScale).rgb) * bw.z;
  float g = tpLum(texture2D(uGround, vWPos.xz * uScale * 1.6).rgb);
  float d = mix(r / uRockAvg, g / uGroundAvg, smoothstep(0.55, 0.8, vWNorm.y));
  diffuseColor.rgb *= mix(1.0, clamp(d, 0.3, 1.8), uStrength);
}`);
  };
}
