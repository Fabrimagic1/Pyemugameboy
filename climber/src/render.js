// ─────────────────────────────────────────────────────────────────────────────
// RENDERING (three.js). Trasforma il "world" generato in mesh.
// Nessuna logica di gioco qui: solo grafica.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { MAT, MAT_INFO, SEA } from './rules.js';
import { FLAG_STAND } from './surface.js';
import { hash2 } from './rng.js';
import { environmentAt } from './generator.js';
import { addTriplanarDetail, proceduralDetail } from './assets.js';

const TAU = Math.PI * 2;
const ROWS_PER_CHUNK = 48;
export const ROUTE_COLORS = ['#ffffff', '#3fd0ff', '#ffd23f'];

const col = hex => new THREE.Color(hex);

// ── modelli procedurali degli oggetti: liste di primitive ───────────────────
// g: geometria, s: parametri, y/x/z: posizione, r: rotazione [x,y,z], sy: schiacciamento,
// c: colore, e: emissivo. Se in assets/manifest.json c'è un GLB con lo stesso nome,
// viene usato quello al posto di questa lista.
const fronds = (n, y, len, c) => Array.from({ length: n }, (_, k) => ({
  g: 'box', s: [0.5, 0.06, len], y, x: Math.sin((k / n) * Math.PI * 2) * len * 0.42, z: Math.cos((k / n) * Math.PI * 2) * len * 0.42,
  r: [0.45, (k / n) * Math.PI * 2, 0], c,
}));
const MODELS = {
  palm: [{ g: 'cyl', s: [0.14, 0.26, 3.2], y: 1.6, c: '#8a6b45', r: [0, 0, 0.06] }, { g: 'cyl', s: [0.12, 0.15, 3.0], y: 4.6, x: 0.2, c: '#7d5f3c', r: [0, 0, 0.14] },
    ...fronds(7, 6.1, 2.6, '#3f8f3a'), { g: 'sph', s: [0.35], y: 5.9, x: 0.35, c: '#5b4024' }],
  rock: [{ g: 'ico', s: [1.0], y: 0.3, c: '#8c8478', sy: 0.7, d: 1 }],
  jungleTree: [{ g: 'cyl', s: [0.3, 0.55, 8], y: 4, c: '#5a4630' }, { g: 'sph', s: [2.6], y: 8.6, c: '#2f6e2a', sy: 0.7, d: 1 },
    { g: 'sph', s: [1.9], y: 7.8, x: 1.8, c: '#3a7d2e', sy: 0.7, d: 1 }, { g: 'sph', s: [1.8], y: 7.6, x: -1.5, z: 1.0, c: '#2a6326', sy: 0.7, d: 1 }],
  bush: [{ g: 'sph', s: [0.9], y: 0.45, c: '#3a7d2e', sy: 0.7, d: 1 }, { g: 'sph', s: [0.6], y: 0.4, x: 0.7, c: '#2f6e2a', sy: 0.8, d: 1 }],
  giantMushroom: [{ g: 'cyl', s: [0.35, 0.55, 3.2], y: 1.6, c: '#e9e1d2' }, { g: 'sph', s: [2.4], y: 3.2, c: '#c2416a', sy: 0.42, d: 1 },
    { g: 'sph', s: [0.35], y: 4.1, x: 0.8, c: '#f4e9f0' }, { g: 'sph', s: [0.28], y: 3.9, x: -1.1, z: 0.6, c: '#f4e9f0' }, { g: 'sph', s: [0.3], y: 4.0, z: -1.0, c: '#f4e9f0' }],
  smallMushroom: [{ g: 'cyl', s: [0.08, 0.1, 0.5], y: 0.25, c: '#efe6d8' }, { g: 'sph', s: [0.3], y: 0.5, c: '#9a5bd1', sy: 0.5, e: 0.6 }],
  pine: [{ g: 'cyl', s: [0.18, 0.3, 4], y: 2, c: '#5b4632' }, { g: 'cone', s: [1.9, 3.2], y: 3.0, c: '#2e4d3a' }, { g: 'cone', s: [1.5, 2.8], y: 4.6, c: '#335a43' },
    { g: 'cone', s: [1.0, 2.2], y: 6.0, c: '#3a6649' }, { g: 'cone', s: [1.2, 0.5], y: 4.15, c: '#eef3f7' }],
  iceShard: [{ g: 'cone', s: [0.5, 2.4], y: 1.1, c: '#bfe4f5', e: 0.15 }, { g: 'cone', s: [0.3, 1.4], y: 0.6, x: 0.45, c: '#d4eef9', r: [0, 0, -0.35] }],
  cactus: [{ g: 'cyl', s: [0.32, 0.38, 3], y: 1.5, c: '#4f8a3a' }, { g: 'cyl', s: [0.2, 0.22, 1.2], y: 1.6, x: 0.55, c: '#4f8a3a', r: [0, 0, -1.2] },
    { g: 'cyl', s: [0.2, 0.22, 1.0], y: 2.3, x: 0.95, c: '#4f8a3a' }, { g: 'sph', s: [0.33], y: 3.0, c: '#4f8a3a' }],
  boulder: [{ g: 'ico', s: [1.6], y: 0.7, c: '#a4583a', sy: 0.75, d: 1 }, { g: 'ico', s: [0.7], y: 0.3, x: 1.4, c: '#8e4529', d: 1 }],
  obsidian: [{ g: 'cone', s: [0.6, 2.2], y: 1.0, c: '#1b1720' }, { g: 'cone', s: [0.4, 1.4], y: 0.6, x: 0.5, c: '#251f2b', r: [0, 0, -0.4] }],
  emberRock: [{ g: 'ico', s: [0.8], y: 0.3, c: '#3b2a26', d: 1 }, { g: 'ico', s: [0.35], y: 0.75, c: '#ff6a20', e: 2.5 }],
  summitRock: [{ g: 'ico', s: [0.7], y: 0.25, c: '#878c95', sy: 0.7, d: 1 }],
};

function primitive(p) {
  switch (p.g) {
    case 'cyl': return new THREE.CylinderGeometry(p.s[0], p.s[1], p.s[2], 7);
    case 'cone': return new THREE.ConeGeometry(p.s[0], p.s[1], 8);
    case 'sph': return p.d ? new THREE.IcosahedronGeometry(p.s[0], 1) : new THREE.SphereGeometry(p.s[0], 10, 7);
    case 'ico': return new THREE.IcosahedronGeometry(p.s[0], p.d || 0);
    case 'box': return new THREE.BoxGeometry(p.s[0], p.s[1], p.s[2]);
  }
}

// I GLB arrivano con materiali PBR: con centinaia di copie costano troppo.
// Per oggetti a colori piatti un Lambert flat è identico a vedersi e molto più leggero.
const lambertCache = new Map();
function toLambert(m) {
  if (m.map || m.isMeshLambertMaterial) return m;          // con texture: lascialo com'è
  if (!lambertCache.has(m)) lambertCache.set(m, new THREE.MeshLambertMaterial({
    color: m.color, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity ?? 1, flatShading: true,
    transparent: m.transparent, opacity: m.opacity, side: m.side,
  }));
  return lambertCache.get(m);
}

// Le parti di un oggetto (procedurale o GLB) come coppie {geometry, material, matrix}.
function modelParts(type, assets) {
  const ext = assets && assets.models[type];
  if (ext) {
    const parts = [];
    ext.scene.updateMatrixWorld(true);
    const S = new THREE.Matrix4().makeScale(ext.scale, ext.scale, ext.scale);
    ext.scene.traverse(o => {
      if (!o.isMesh) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();   // alcuni modelli AI non le hanno
      parts.push({ geometry: o.geometry, material: toLambert(o.material), matrix: S.clone().multiply(o.matrixWorld) });
    });
    return parts;
  }
  return (MODELS[type] || []).map(pt => ({
    geometry: primitive(pt),
    material: new THREE.MeshLambertMaterial({ color: pt.c, flatShading: true, emissive: pt.e ? pt.c : '#000000', emissiveIntensity: pt.e || 0 }),
    matrix: new THREE.Matrix4().compose(new THREE.Vector3(pt.x || 0, pt.y, pt.z || 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pt.r || [0, 0, 0]))), new THREE.Vector3(1, pt.sy || 1, 1)),
  }));
}

export class WorldView {
  constructor(world, scene, assets = { models: {}, textures: {} }) {
    this.world = world;
    this.scene = scene;
    this.assets = assets;
    this.buildMountain();
    this.buildIsland();
    this.buildProps();
    this.buildCampfires();
    this.buildFood();
    this.buildSummit();
    this.buildSky();
    this.buildFog();
    this.buildClouds();
    this.buildLuggage();
    this.pitonGroup = new THREE.Group(); scene.add(this.pitonGroup);
    this.buildDebug();
    this.time = 0;
  }

  // ── il terreno: heightmap → vertici, a blocchi di righe ────────────────────
  buildMountain() {
    const w = this.world, T = w.terrain, nx = T.nx, H = T.H;
    const pal = w.layout.sections.map(b => ({
      wall: col(b.def.palette.wall), wall2: col(b.def.palette.wall2), ledge: col(b.def.palette.ledge),
      bands: b.def.palette.bands ? b.def.palette.bands.map(col) : null, bandH: b.def.palette.bandHeight,
    }));
    const matCol = MAT_INFO.map(m => (m.color ? new THREE.Color().setRGB(...m.color, THREE.SRGBColorSpace) : null));
    matCol[MAT.LAVA] = new THREE.Color(3.0, 0.7, 0.08); // >1: "brilla" anche senza luce
    const seabed = col('#c9b27a');
    const N = w.noise, tmp = new THREE.Color();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // dettaglio triplanare: texture tue (assets/manifest.json) o procedurali
    const tx = this.assets.textures;
    addTriplanarDetail(mat, tx.rock || proceduralDetail('rock', 256, 3), tx.ground || proceduralDetail('ground', 256, 7));
    this.mountain = new THREE.Group();

    for (let j0 = 0; j0 < T.nz - 1; j0 += ROWS_PER_CHUNK) {
      const j1 = Math.min(T.nz - 1, j0 + ROWS_PER_CHUNK);
      const nr = j1 - j0 + 1;
      const pos = new Float32Array(nr * nx * 3), nor = new Float32Array(nr * nx * 3), clr = new Float32Array(nr * nx * 3);
      for (let jj = 0; jj < nr; jj++) {
        const j = j0 + jj, jm = Math.max(0, j - 1), jp = Math.min(T.nz - 1, j + 1);
        for (let i = 0; i < nx; i++) {
          const v = (jj * nx + i) * 3, c = j * nx + i, y = H[c];
          const im = Math.max(0, i - 1), ip = Math.min(nx - 1, i + 1);
          pos[v] = T.xOf(i); pos[v + 1] = y; pos[v + 2] = T.zOf(j);
          // normale dal gradiente della heightmap
          const gx = (H[j * nx + ip] - H[j * nx + im]) / ((ip - im) * T.C);
          const gz = (H[jp * nx + i] - H[jm * nx + i]) / ((jp - jm) * T.C);
          const nl = Math.hypot(gx, 1, gz);
          nor[v] = -gx / nl; nor[v + 1] = 1 / nl; nor[v + 2] = -gz / nl;
          // colore: materiale > piano > bande > parete (con variazione e finta occlusione)
          const pl = pal[T.B[c]], m = T.M[c];
          if (y < SEA + 0.3) tmp.copy(seabed);
          else if (matCol[m]) tmp.copy(matCol[m]);
          else if (T.F[c] & FLAG_STAND) tmp.copy(pl.ledge);
          else if (pl.bands) tmp.copy(pl.bands[(((Math.floor((y + 2 * N.perlin(i * 0.05, 0.5, j * 0.01)) / pl.bandH)) % pl.bands.length) + pl.bands.length) % pl.bands.length]);
          else tmp.copy(pl.wall).lerp(pl.wall2, 0.5 + 0.5 * N.perlin(i * 0.11, y * 0.15, j * 0.07));
          const around = (H[j * nx + ip] + H[j * nx + im] + H[jp * nx + i] + H[jm * nx + i]) / 4;
          const ao = Math.min(1.08, Math.max(0.6, 1 - (around - y) * 0.12));
          const k = ao * (0.9 + 0.2 * hash2(i, j, 7));
          clr[v] = tmp.r * k; clr[v + 1] = tmp.g * k; clr[v + 2] = tmp.b * k;
        }
      }
      const idx = [];
      for (let jj = 0; jj < nr - 1; jj++) for (let i = 0; i < nx - 1; i++) {
        const a = jj * nx + i, b = a + 1, c2 = a + nx, d = c2 + 1;
        idx.push(a, c2, b, b, c2, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.mountain.add(mesh);
    }
    this.scene.add(this.mountain);
  }

  buildIsland() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: '#27a9c9', roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.82 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, SEA, this.world.length / 2);
    this.scene.add(water);
  }

  buildProps() {
    const byType = new Map();
    for (const p of this.world.props) {
      if (!byType.has(p.type)) byType.set(p.type, []);
      byType.get(p.type).push(p);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [type, list] of byType) {
      for (const part of modelParts(type, this.assets)) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((p, k) => {
          q.setFromAxisAngle(up, p.yaw);
          m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale)).multiply(part.matrix);
          mesh.setMatrixAt(k, m4);
        });
        mesh.castShadow = true;
        this.scene.add(mesh);
      }
    }
  }

  buildCampfires() {
    this.fires = [];
    const logMat = new THREE.MeshLambertMaterial({ color: '#5a3b22' });
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
    const stoneMat = new THREE.MeshLambertMaterial({ color: '#77716a', flatShading: true });
    for (const f of this.world.campfires) {
      const g = new THREE.Group();
      g.position.set(f.pos.x, f.pos.y, f.pos.z);
      const ext = this.assets.models.campfire;
      if (ext) { const m = ext.scene.clone(); m.scale.setScalar(ext.scale); g.add(m); }
      for (let k = 0; k < 9 && !ext; k++) {
        const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), stoneMat);
        st.position.set(Math.cos((k / 9) * Math.PI * 2) * 0.85, 0.08, Math.sin((k / 9) * Math.PI * 2) * 0.85);
        st.scale.y = 0.6; g.add(st);
      }
      for (let k = 0; k < 3 && !ext; k++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), logMat);
        log.rotation.z = Math.PI / 2; log.rotation.y = (k / 3) * Math.PI; log.position.y = 0.12;
        g.add(log);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), flameMat);
      flame.position.y = 0.6; g.add(flame);
      const light = new THREE.PointLight('#ff9b4a', 18, 18, 1.6);
      light.position.y = 1.2; g.add(light);
      this.scene.add(g);
      this.fires.push({ flame, light });
    }
  }

  buildFood() {
    const food = this.world.food;
    this.foodMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.28, 1),
      new THREE.MeshLambertMaterial({ color: '#e23b4b', emissive: '#e23b4b', emissiveIntensity: 0.5 }), Math.max(1, food.length));
    this.foodMesh.count = food.length;
    this.updateFood();
    this.scene.add(this.foodMesh);
  }
  updateFood() {
    const m4 = new THREE.Matrix4();
    this.world.food.forEach((f, k) => {
      m4.makeTranslation(f.x, f.y + Math.sin(this.time * 2 + k) * 0.1, f.z);
      if (f.taken) m4.makeScale(0, 0, 0);
      this.foodMesh.setMatrixAt(k, m4);
    });
    this.foodMesh.instanceMatrix.needsUpdate = true;
  }

  buildSummit() {
    const g = new THREE.Group();
    g.position.set(this.world.peak.x, this.world.peak.y, this.world.peak.z);
    const ext = this.assets.models.summitFlag;
    if (ext) {
      // il modello ha già asta e bandiera: la facciamo oscillare tutta insieme
      this.flag = ext.scene.clone(); this.flag.scale.setScalar(ext.scale);
      this.flag.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.add(this.flag);
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.5, 6), new THREE.MeshLambertMaterial({ color: '#dddddd' }));
      pole.position.y = 1.75; g.add(pole);
      this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: '#e8452c', side: THREE.DoubleSide }));
      this.flag.position.set(0.8, 3, 0); g.add(this.flag);
    }
    this.scene.add(g);
  }

  buildSky() {
    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyUniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          float h = clamp(d.y * 1.4 + 0.25, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(h, 0.8));
          float s = max(dot(d, sunDir), 0.0);
          c += vec3(1.0, 0.86, 0.62) * (pow(s, 600.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);  // disco + alone
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog('#ffffff', 40, 400);
    this.envColors = this.world.layout.sections.map(b => ({
      top: col(b.def.sky.top), bottom: col(b.def.sky.bottom), fog: col(b.def.sky.fog), far: b.def.sky.far,
    }));
  }

  // ── nebbia che sale: strati orizzontali semitrasparenti con rumore animato ──
  buildFog() {
    this.fogTime = { value: 0 };
    this.fogColor = new THREE.Color('#d9e2ec');
    this.fogLayers = new THREE.Group();
    const geo = new THREE.PlaneGeometry(2400, 2400);
    const N = 7;
    for (let k = 0; k < N; k++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
        uniforms: { time: this.fogTime, color: { value: this.fogColor }, layer: { value: k / (N - 1) } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float time; uniform vec3 color; uniform float layer; varying vec3 vW;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ return 0.55*noise(p) + 0.3*noise(p*2.1+3.7) + 0.15*noise(p*4.3+9.1); }
          void main(){
            vec2 q = vW.xz * 0.035 + vec2(time * 0.03, time * 0.017) + layer * 5.3;
            float n = fbm(q);
            // lo strato in cima è a ciuffi, quelli sotto sempre più pieni
            float a = mix(smoothstep(0.42, 0.75, n) * 0.5, 0.55, layer);
            gl_FragColor = vec4(color * (0.92 + 0.12 * n), a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; m.position.y = -k * 0.8; m.renderOrder = 5;
      this.fogLayers.add(m);
    }
    this.scene.add(this.fogLayers);
  }

  // ── nuvole: una fascia a ogni confine tra biomi, ai lati della montagna ─────
  buildClouds() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    for (let k = 0; k < 9; k++) {   // qualche sbuffo sovrapposto
      const x = 64 + Math.cos(k * 2.4) * 26 * (k ? 1 : 0), y = 68 + Math.sin(k * 1.7) * 12 * (k ? 1 : 0), r = k ? 26 + (k % 3) * 6 : 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.6 });
    this.clouds = new THREE.Group();
    const w = this.world;
    let seed = w.seedHash >>> 0;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const f of [...w.campfires, w.peak]) {
      for (let k = 0; k < 18; k++) {
        const side = rnd() < 0.5 ? -1 : 1, sp = new THREE.Sprite(mat);
        sp.position.set(side * (170 + rnd() * 300), f.y - 4 + rnd() * 26, f.z - 60 + rnd() * 240);
        const sc = 50 + rnd() * 70; sp.scale.set(sc * 1.7, sc * 0.75, 1);
        sp.userData.drift = 0.6 + rnd();
        this.clouds.add(sp);
      }
    }
    this.scene.add(this.clouds);
  }

  // ── valigie ────────────────────────────────────────────────────────────────
  buildLuggage() {
    const body = new THREE.MeshLambertMaterial({ color: '#b5533c', flatShading: true });
    const trim = new THREE.MeshLambertMaterial({ color: '#e8c26a', flatShading: true });
    this.bags = this.world.luggage.map(l => {
      const g = new THREE.Group();
      g.position.set(l.x, l.y, l.z); g.rotation.y = l.yaw;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.6), body); base.position.y = 0.17; base.castShadow = true;
      const lid = new THREE.Group(); lid.position.set(0, 0.34, -0.3);
      const lidBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.6), body); lidBox.position.set(0, 0.11, 0.3); lidBox.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.64), trim); band.position.y = 0.34;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 10, Math.PI), trim); handle.position.set(0, 0.22, 0.6);
      lid.add(lidBox, handle); g.add(base, band, lid);
      this.scene.add(g);
      return { data: l, lid };
    });
  }

  syncItems(player) {
    for (const b of this.bags) {
      const target = b.data.opened ? -1.9 : 0;                    // il coperchio si apre
      b.lid.rotation.x += (target - b.lid.rotation.x) * 0.15;
    }
    while (this.pitonGroup.children.length < player.pitons.length) {
      const q = player.pitons[this.pitonGroup.children.length];
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 6), new THREE.MeshLambertMaterial({ color: '#c9ced3', flatShading: true }));
      m.position.set(q.x + q.nx * 0.12, q.y + q.ny * 0.12, q.z + q.nz * 0.12);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-q.nx, -q.ny, -q.nz));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 5, 10), new THREE.MeshLambertMaterial({ color: '#e8c26a' }));
      ring.position.y = -0.25; m.add(ring);
      this.pitonGroup.add(m);
    }
  }

  // vie garantite (P) e riparazioni: strumenti per capire la generazione
  buildDebug() {
    const T = this.world.terrain;
    this.debug = new THREE.Group();
    for (const seg of this.world.route.segments) for (const route of seg.routes) {
      const pts = route.path.filter((_, k) => k % 2 === 0).map(([i, j]) =>
        new THREE.Vector3(T.xOf(i), T.H[j * T.nx + i] + 0.5, T.zOf(j)));
      if (pts.length > 1) this.debug.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: ROUTE_COLORS[route.index], depthTest: false, transparent: true, opacity: 0.9 })));
    }
    const mk = new THREE.MeshBasicMaterial({ color: '#ff2bd6', depthTest: false });
    const geo = new THREE.SphereGeometry(0.5, 8, 6);
    for (const r of this.world.route.repairs) {
      const m = new THREE.Mesh(geo, mk);
      m.position.set(r.x, r.y + 0.6, r.z);
      this.debug.add(m);
    }
    this.debug.visible = false;
    this.debug.renderOrder = 10;
    this.scene.add(this.debug);
  }

  update(dt, camera, orbit = false, mist = null, lights = null) {
    this.time += dt;
    // cielo e nebbia sfumano con la quota della camera
    const env = environmentAt(this.world, camera.position.x, camera.position.z);
    const top = new THREE.Color(0, 0, 0), bottom = new THREE.Color(0, 0, 0), fog = new THREE.Color(0, 0, 0);
    let far = 0;
    for (const [b, w] of env.weights) {
      const e = this.envColors[b.index];
      top.r += e.top.r * w; top.g += e.top.g * w; top.b += e.top.b * w;
      bottom.r += e.bottom.r * w; bottom.g += e.bottom.g * w; bottom.b += e.bottom.b * w;
      fog.r += e.fog.r * w; fog.g += e.fog.g * w; fog.b += e.fog.b * w;
      far += e.far * w;
    }
    this.skyUniforms.top.value.copy(top);
    this.skyUniforms.bottom.value.copy(bottom);
    this.scene.fog.color.copy(fog);
    this.scene.fog.far = far;
    this.scene.fog.near = far * 0.15;
    if (orbit) { this.scene.fog.near = 2000; this.scene.fog.far = 5000; }
    // luce d'ambiente del bioma: cielo dall'alto, colore del terreno dal basso
    if (lights) {
      lights.hemi.color.copy(bottom).lerp(top, 0.25).lerp(new THREE.Color('#ffffff'), 0.45);
      lights.hemi.groundColor.copy(fog).multiplyScalar(0.55);
    }
    // nebbia che sale: gli strati seguono la camera in xz; sotto la superficie non si vede quasi nulla
    if (mist) {
      this.fogTime.value += dt;
      this.fogColor.copy(fog).lerp(new THREE.Color('#e6edf3'), 0.6);
      this.fogLayers.position.set(camera.position.x, mist.level, camera.position.z);
      const depth = mist.level - camera.position.y;
      if (depth > 0 && !orbit) {
        const k = Math.min(1, depth / 3);
        this.scene.fog.color.lerp(this.fogColor, k);
        this.scene.fog.near = this.scene.fog.near * (1 - k) + 1 * k;
        this.scene.fog.far = this.scene.fog.far * (1 - k) + 26 * k;
      }
    }
    for (const c of this.clouds.children) c.position.z += c.userData.drift * dt * 0.8;
    this.sky.position.copy(camera.position);
    for (const f of this.fires) {
      const k = 1 + 0.15 * Math.sin(this.time * 17 + f.light.id) + 0.1 * Math.sin(this.time * 7.3);
      f.flame.scale.set(1, k, 1);
      f.light.intensity = 16 * k;
    }
    this.flag.rotation.y = Math.sin(this.time * 2) * (this.assets.models.summitFlag ? 0.12 : 0.3);
    if (this.world.food.length) this.updateFood();
  }
}

