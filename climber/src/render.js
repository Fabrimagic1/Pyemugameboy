// ─────────────────────────────────────────────────────────────────────────────
// RENDERING (three.js). Trasforma il "world" generato in mesh.
// Nessuna logica di gioco qui: solo grafica.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { MAT, MAT_INFO } from './rules.js';
import { FLAG_STAND } from './surface.js';
import { hash2 } from './rng.js';
import { environmentAt } from './generator.js';

const TAU = Math.PI * 2;
const ROWS_PER_CHUNK = 40;

const col = hex => new THREE.Color(hex);

// ── modelli degli oggetti: liste di primitive ────────────────────────────────
// g: tipo di geometria, s: parametri, y: altezza del centro, c: colore, e: emissivo
const MODELS = {
  palm:          [{ g: 'cyl', s: [0.18, 0.3, 6], y: 3, c: '#8a6b45' }, { g: 'cone', s: [2.8, 1.4], y: 6.3, c: '#3f8f3a' }],
  rock:          [{ g: 'ico', s: [1.0], y: 0.3, c: '#8c8478' }],
  jungleTree:    [{ g: 'cyl', s: [0.35, 0.55, 8], y: 4, c: '#5a4630' }, { g: 'sph', s: [3.2], y: 8.4, c: '#2f6e2a', sy: 0.75 }],
  bush:          [{ g: 'sph', s: [0.9], y: 0.5, c: '#3a7d2e', sy: 0.7 }],
  giantMushroom: [{ g: 'cyl', s: [0.4, 0.55, 3.2], y: 1.6, c: '#e9e1d2' }, { g: 'sph', s: [2.4], y: 3.2, c: '#c2416a', sy: 0.42 }],
  smallMushroom: [{ g: 'cyl', s: [0.08, 0.1, 0.5], y: 0.25, c: '#efe6d8' }, { g: 'sph', s: [0.3], y: 0.5, c: '#9a5bd1', sy: 0.5, e: 0.6 }],
  pine:          [{ g: 'cyl', s: [0.2, 0.3, 4], y: 2, c: '#5b4632' }, { g: 'cone', s: [1.7, 4], y: 3.6, c: '#2e4d3a' }, { g: 'cone', s: [1.2, 2.6], y: 5.4, c: '#335a43' }],
  iceShard:      [{ g: 'cone', s: [0.5, 2.4], y: 1.1, c: '#bfe4f5' }],
  cactus:        [{ g: 'cyl', s: [0.35, 0.4, 3], y: 1.5, c: '#4f8a3a' }, { g: 'cyl', s: [0.22, 0.25, 1.4], y: 1.9, x: 0.6, c: '#4f8a3a' }],
  boulder:       [{ g: 'ico', s: [1.6], y: 0.7, c: '#a4583a' }],
  obsidian:      [{ g: 'cone', s: [0.6, 2.2], y: 1.0, c: '#1b1720' }],
  emberRock:     [{ g: 'ico', s: [0.8], y: 0.3, c: '#3b2a26' }, { g: 'ico', s: [0.35], y: 0.75, c: '#ff6a20', e: 2.5 }],
  summitRock:    [{ g: 'ico', s: [0.7], y: 0.25, c: '#878c95' }],
};

function primitive(p) {
  switch (p.g) {
    case 'cyl': return new THREE.CylinderGeometry(p.s[0], p.s[1], p.s[2], 7);
    case 'cone': return new THREE.ConeGeometry(p.s[0], p.s[1], 8);
    case 'sph': return new THREE.SphereGeometry(p.s[0], 12, 8);
    case 'ico': return new THREE.IcosahedronGeometry(p.s[0], 0);
  }
}

export class WorldView {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.buildMountain();
    this.buildIsland();
    this.buildProps();
    this.buildCampfires();
    this.buildFood();
    this.buildSummit();
    this.buildSky();
    this.buildDebug();
    this.time = 0;
  }

  // ── la montagna: griglia (θ, y) → vertici, a blocchi di righe ──────────────
  buildMountain() {
    const w = this.world, s = w.surface, W = s.W, R = s.R;
    const pal = w.layout.biomes.map(b => ({
      wall: col(b.def.palette.wall), wall2: col(b.def.palette.wall2), ledge: col(b.def.palette.ledge),
      bands: b.def.palette.bands ? b.def.palette.bands.map(col) : null, bandH: b.def.palette.bandHeight,
    }));
    const matCol = MAT_INFO.map(m => (m.color ? new THREE.Color().setRGB(...m.color, THREE.SRGBColorSpace) : null));
    matCol[MAT.LAVA] = new THREE.Color(3.0, 0.7, 0.08); // >1: "brilla" anche senza luce
    const N = w.noise, tmp = new THREE.Color();
    const P = (i, j) => {
      const jj = Math.min(s.rows - 1, Math.max(0, j));
      const r = R[jj * W + ((i % W) + W) % W], th = (i / W) * TAU;
      return [r * Math.cos(th), jj * s.dy, r * Math.sin(th)];
    };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mountain = new THREE.Group();
    const lastRow = Math.min(s.rows - 1, Math.ceil(w.height / s.dy) + 1);

    for (let j0 = 0; j0 < lastRow; j0 += ROWS_PER_CHUNK) {
      const j1 = Math.min(lastRow, j0 + ROWS_PER_CHUNK);
      const nr = j1 - j0 + 1, nc = W + 1;
      const pos = new Float32Array(nr * nc * 3), nor = new Float32Array(nr * nc * 3), clr = new Float32Array(nr * nc * 3);
      for (let jj = 0; jj < nr; jj++) {
        const j = j0 + jj, y = j * s.dy;
        for (let i = 0; i < nc; i++) {
          const v = (jj * nc + i) * 3, ii = i % W, c = j * W + ii;
          const p = P(i, j);
          pos[v] = p[0]; pos[v + 1] = p[1]; pos[v + 2] = p[2];
          // normale = prodotto vettoriale delle tangenti (verticale × orizzontale)
          const a = P(i + 1, j), b = P(i - 1, j), u = P(i, j + 1), d = P(i, j - 1);
          const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2];
          const vx = u[0] - d[0], vy = u[1] - d[1], vz = u[2] - d[2];
          let nx = vy * tz - vz * ty, ny = vz * tx - vx * tz, nz = vx * ty - vy * tx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nor[v] = nx / nl; nor[v + 1] = ny / nl; nor[v + 2] = nz / nl;
          // colore: materiale > cengia > bande > parete (con variazione e finta occlusione)
          const pl = pal[s.B[c]], m = s.M[c];
          if (matCol[m]) tmp.copy(matCol[m]);
          else if (s.F[c] & FLAG_STAND) tmp.copy(pl.ledge);
          else if (pl.bands) tmp.copy(pl.bands[(((Math.floor((y + 2 * N.perlin(ii * 0.05, 0.5, j * 0.01)) / pl.bandH)) % pl.bands.length) + pl.bands.length) % pl.bands.length]);
          else tmp.copy(pl.wall).lerp(pl.wall2, 0.5 + 0.5 * N.perlin(ii * 0.11, j * 0.07, 3.7));
          const around = (R[j * W + ((ii + 1) % W)] + R[j * W + ((ii + W - 1) % W)] +
            R[Math.min(s.rows - 1, j + 1) * W + ii] + R[Math.max(0, j - 1) * W + ii]) / 4;
          const ao = Math.min(1.08, Math.max(0.6, 1 - (around - R[c]) * 0.15));
          const k = ao * (0.9 + 0.2 * hash2(ii, j, 7));
          clr[v] = tmp.r * k; clr[v + 1] = tmp.g * k; clr[v + 2] = tmp.b * k;
        }
      }
      const idx = [];
      for (let jj = 0; jj < nr - 1; jj++) for (let i = 0; i < W; i++) {
        const a = jj * nc + i, b = a + 1, c2 = a + nc, d = c2 + 1;
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
    const pts = [[0, 0], [215, 0], [240, -1.5], [300, -6], [420, -14]].map(([r, y]) => new THREE.Vector2(r, y));
    const ground = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), new THREE.MeshLambertMaterial({ color: '#e2cf98', side: THREE.DoubleSide }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1400, 64),
      new THREE.MeshStandardMaterial({ color: '#2a86c0', roughness: 0.25, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.8;
    this.scene.add(water);
  }

  buildProps() {
    const byType = new Map();
    for (const p of this.world.props) {
      if (!byType.has(p.type)) byType.set(p.type, []);
      byType.get(p.type).push(p);
    }
    const m4 = new THREE.Matrix4(), part = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [type, list] of byType) {
      for (const pt of MODELS[type] || []) {
        const mat = new THREE.MeshLambertMaterial({ color: pt.c, emissive: pt.e ? pt.c : '#000000', emissiveIntensity: pt.e || 0 });
        const mesh = new THREE.InstancedMesh(primitive(pt), mat, list.length);
        part.compose(new THREE.Vector3(pt.x || 0, pt.y, 0), new THREE.Quaternion(), new THREE.Vector3(1, pt.sy || 1, 1));
        list.forEach((p, k) => {
          q.setFromAxisAngle(up, p.yaw);
          m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale)).multiply(part);
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
    for (const f of this.world.campfires) {
      const g = new THREE.Group();
      g.position.set(f.pos.x, f.pos.y, f.pos.z);
      for (let k = 0; k < 3; k++) {
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
    g.position.set(0, this.world.height - 0.4, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.5, 6), new THREE.MeshLambertMaterial({ color: '#dddddd' }));
    pole.position.y = 1.75; g.add(pole);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: '#e8452c', side: THREE.DoubleSide }));
    this.flag.position.set(0.8, 3, 0); g.add(this.flag);
    this.scene.add(g);
  }

  buildSky() {
    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyUniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.4+0.25,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
    }));
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog('#ffffff', 40, 400);
    this.envColors = this.world.layout.biomes.map(b => ({
      top: col(b.def.sky.top), bottom: col(b.def.sky.bottom), fog: col(b.def.sky.fog), far: b.def.sky.far,
    }));
  }

  // percorso garantito (P) e riparazioni (B): strumenti per capire la generazione
  buildDebug() {
    const s = this.world.surface;
    this.debug = new THREE.Group();
    for (const seg of this.world.route.segments) {
      const pts = seg.path.filter((_, k) => k % 3 === 0).map(([i, j]) => {
        const th = s.theta(i), y = j * s.dy, r = s.R[j * s.W + i] + 0.6;
        return new THREE.Vector3(r * Math.cos(th), y + 0.2, r * Math.sin(th));
      });
      if (pts.length > 1) this.debug.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.8 })));
    }
    const mk = new THREE.MeshBasicMaterial({ color: '#ff2bd6', depthTest: false });
    const geo = new THREE.SphereGeometry(0.5, 8, 6);
    for (const r of this.world.route.repairs) {
      const rad = s.radius(r.theta, r.y + 1) + 0.6;
      const m = new THREE.Mesh(geo, mk);
      m.position.set(rad * Math.cos(r.theta), r.y + 0.8, rad * Math.sin(r.theta));
      this.debug.add(m);
    }
    this.debug.visible = false;
    this.debug.renderOrder = 10;
    this.scene.add(this.debug);
  }

  update(dt, camera, orbit = false) {
    this.time += dt;
    // cielo e nebbia sfumano con la quota della camera
    const env = environmentAt(this.world, camera.position.y);
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
    this.sky.position.copy(camera.position);
    for (const f of this.fires) {
      const k = 1 + 0.15 * Math.sin(this.time * 17 + f.light.id) + 0.1 * Math.sin(this.time * 7.3);
      f.flame.scale.set(1, k, 1);
      f.light.intensity = 16 * k;
    }
    this.flag.rotation.y = Math.sin(this.time * 2) * 0.3;
    if (this.world.food.length) this.updateFood();
  }
}

export function buildPlayerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.95, 4, 10), new THREE.MeshLambertMaterial({ color: '#f08a24' }));
  body.position.y = 0.82; body.castShadow = true; g.add(body);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), new THREE.MeshLambertMaterial({ color: '#7b4a2a' }));
  pack.position.set(0, 1.0, 0.32); pack.castShadow = true; g.add(pack);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.12), new THREE.MeshLambertMaterial({ color: '#203040' }));
  visor.position.set(0, 1.42, -0.3); g.add(visor);
  return g;
}
