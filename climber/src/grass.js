// ─────────────────────────────────────────────────────────────────────────────
// ERBA
// Tecnica classica dei giochi open world:
//  - un CIUFFO (3 fili incrociati, pochi triangoli) disegnato migliaia di volte
//    con l'instancing: una sola chiamata di disegno per piastrella;
//  - il mondo è diviso in PIASTRELLE; esistono solo quelle vicine al giocatore e
//    vengono riempite quando entrano nel raggio (poche per frame, niente scatti);
//  - il VENTO e la piegatura al passaggio del giocatore sono calcolati nel vertex
//    shader: costano zero alla CPU;
//  - colore sfumato dalla base (scura) alla punta (chiara), tinta per bioma.
// Dove cresce e quanto è fitta lo decide il bioma (`grass` in biomes.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { FLAG_STAND } from './surface.js';
import { MAT, SEA } from './rules.js';
import { hash2 } from './rng.js';

const TILE = 10;           // lato della piastrella (m)

function clumpGeometry() {
  // un filo: striscia che si stringe verso la punta e si incurva in avanti
  const pos = [], uv = [], idx = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI + 0.3, cx = Math.cos(a), cz = Math.sin(a), base = pos.length / 3;
    const lean = 0.22 + b * 0.07, ox = Math.cos(a * 2.3) * 0.1, oz = Math.sin(a * 1.7) * 0.1;
    for (let k = 0; k <= 3; k++) {
      const t = k / 3, w = 0.032 * (1 - t * 0.85), f = lean * t * t;
      pos.push(ox + cx * w - cz * f, t, oz + cz * w + cx * f, ox - cx * w - cz * f, t, oz - cz * w + cx * f);
      uv.push(0, t, 1, t);
    }
    for (let k = 0; k < 3; k++) { const i = base + k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(world, scene, quality = 1) {
    this.world = world;
    this.T = world.terrain;
    this.quality = quality;
    this.radius = quality >= 2 ? 48 : 36;
    this.perSide = Math.round(TILE / (quality >= 2 ? 0.2 : 0.26));   // candidati per lato di piastrella
    this.capacity = this.perSide * this.perSide;
    this.defs = world.layout.bands.map(s => s.def.grass ? { ...s.def.grass, base: new THREE.Color(s.def.grass.color) } : null);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uRadius: { value: this.radius }, uLight: { value: 1 },
    }]);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, fog: true, side: THREE.DoubleSide,
      vertexShader: `
        uniform float time; uniform vec3 uPlayer; uniform float uRadius;
        varying vec3 vCol; varying float vT;
        #include <fog_pars_vertex>
        void main() {
          vT = uv.y;
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          vec3 root = instanceMatrix[3].xyz;
          float bend = vT * vT, ph = root.x * 0.25 + root.z * 0.18;
          // vento: due onde a frequenze diverse + una raffica lenta che attraversa il prato
          float gust = 0.6 + 0.4 * sin(time * 0.5 + root.x * 0.05 + root.z * 0.08);
          wp.x += (sin(time * 1.7 + ph) * 0.16 + sin(time * 3.1 + ph * 1.7) * 0.06) * bend * gust;
          wp.z += cos(time * 1.3 + ph * 1.3) * 0.10 * bend * gust;
          // il giocatore schiaccia l'erba attorno a sé
          vec2 d = wp.xz - uPlayer.xz; float dl = length(d);
          float push = smoothstep(1.3, 0.1, dl) * bend * step(abs(root.y - uPlayer.y), 1.5);
          wp.xz += (d / max(dl, 0.001)) * push * 0.55; wp.y -= push * 0.3;
          // lontano dal giocatore l'erba si abbassa fino a sparire (niente bordo netto)
          float fade = 1.0 - smoothstep(uRadius * 0.72, uRadius, distance(root.xz, uPlayer.xz));
          fade *= smoothstep(0.6, 2.2, distance(root, cameraPosition));   // niente fili in faccia alla telecamera
          wp.y = mix(root.y, wp.y, fade);
          vCol = instanceColor;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uLight;
        varying vec3 vCol; varying float vT;
        #include <fog_pars_fragment>
        void main() {
          vec3 tip = vCol * 1.4 + vec3(0.08, 0.10, 0.0);
          vec3 c = mix(vCol * 0.45, tip, vT * vT * 0.9 + vT * 0.1) * uLight;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.geometry = clumpGeometry();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tiles = new Map();     // "tx,tz" → mesh
    this.pool = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.col = new THREE.Color();
  }

  // riempie una piastrella: griglia di candidati spostati a caso, filtrati dalle regole del bioma
  fill(mesh, tx, tz) {
    const T = this.T, N = this.perSide, step = TILE / N, up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const gi = tx * N + a, gj = tz * N + b;
      const x = tx * TILE + (a + hash2(gi, gj, 11)) * step, z = tz * TILE + (b + hash2(gi, gj, 23)) * step;
      const c = T.cell(x, z);
      if (!(T.F[c] & FLAG_STAND) || T.H[c] < SEA + 0.4 || T.UP[c] < 0.78) continue;
      const def = this.defs[T.B[c]];
      if (!def) continue;
      const m = T.M[c];
      // cresce sul muschio; nei biomi aridi anche sulla sabbia in cima ai macigni (non sulla spiaggia)
      if (!(m === MAT.MOSS || (m === MAT.SAND && T.H[c] > 4.5))) continue;
      // chiazze: un rumore a bassa frequenza dirada l'erba qua e là
      const patch = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.19 + Math.sin(x * 0.13) * 2);
      if (hash2(gi, gj, 37) > def.density * (0.45 + 0.9 * patch)) continue;
      const h = def.height * (0.6 + 0.8 * hash2(gi, gj, 41)) * (0.7 + 0.6 * patch);
      this.q.setFromAxisAngle(up, hash2(gi, gj, 53) * 6.283);
      // quota esatta: si scende fino alla roccia vera (la mappa delle cime è a celle di 1 m)
      const gy = this.world.dropTo(x, T.H[c] + 0.8, z, T.H[c] - 0.8);
      if (gy === null) continue;
      this.m4.compose(new THREE.Vector3(x, gy - 0.03, z), this.q, new THREE.Vector3(1.15, h, 1.15));
      mesh.setMatrixAt(n, this.m4);
      const v = 0.8 + 0.4 * hash2(gi, gj, 67);
      mesh.setColorAt(n, this.col.copy(def.base).multiplyScalar(v));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = n > 0;
  }

  update(dt, player, light = 1) {
    this.uniforms.time.value += dt;
    this.uniforms.uPlayer.value.set(player.x, player.y, player.z);
    this.uniforms.uLight.value = light;
    const R = Math.ceil(this.radius / TILE), cx = Math.floor(player.x / TILE), cz = Math.floor(player.z / TILE);
    // via le piastrelle uscite dal raggio
    for (const [key, mesh] of this.tiles) {
      const [tx, tz] = key.split(',').map(Number);
      if (Math.abs(tx - cx) > R + 1 || Math.abs(tz - cz) > R + 1) { mesh.visible = false; this.pool.push(mesh); this.tiles.delete(key); }
    }
    // dentro quelle nuove: al massimo 3 per frame, dalla più vicina
    const todo = [];
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const key = `${cx + a},${cz + b}`;
      if (!this.tiles.has(key)) todo.push([a * a + b * b, cx + a, cz + b, key]);
    }
    todo.sort((p, q) => p[0] - q[0]);
    for (const [, tx, tz, key] of todo.slice(0, 3)) {
      let mesh = this.pool.pop();
      if (!mesh) {
        mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
      this.fill(mesh, tx, tz);
      this.tiles.set(key, mesh);
    }
  }
}
