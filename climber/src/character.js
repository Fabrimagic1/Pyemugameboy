// ─────────────────────────────────────────────────────────────────────────────
// PERSONAGGIO
// Due modi:
//  1. procedurale (default): uno scheletro fatto di Group annidati (spalla →
//     gomito → mano, anca → ginocchio → piede) animato a mano in base allo stato
//     del giocatore: si vedono le MANI che si alternano sulla parete.
//  2. modello GLB con animazioni (se in assets/manifest.json c'è "character"):
//     usa AnimationMixer e sceglie la clip (idle/walk/run/climb/fall).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { toon, softenScene, refineSkinned, applyMaterialTextures, STYLE } from './toon.js';

const lam = (color, extra = {}) => toon({ color, rim: 0.35, ...extra });

function limb(radiusTop, radiusBottom, length, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 7), mat);
  m.position.y = -length / 2;   // pende dal giunto
  m.castShadow = true;
  return m;
}

export class Character {
  constructor(assets) {
    this.assets = assets;
    this.root = new THREE.Group();
    this.walkPhase = 0; this.climbPhase = 0; this.time = 0;
    this.last = null;
    if (assets && assets.character) this.buildFromModel(assets.character);
    else this.buildProcedural();
  }

  buildProcedural() {
    const jacket = lam('#e8742a'), pants = lam('#34475a'), skin = lam('#f0c39a'), glove = lam('#5a3a24'),
      boot = lam('#4a3020'), hat = lam('#c23b3b'), packM = lam('#6d5a3a'), dark = lam('#1d2a36');
    const P = this.parts = {};
    const pelvis = P.pelvis = new THREE.Group();
    pelvis.position.y = 0.92;
    this.root.add(pelvis);
    // busto
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 3, 8), jacket);
    torso.position.y = 0.3; torso.scale.set(1.1, 1, 0.8); torso.castShadow = true;
    pelvis.add(torso);
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), pants);
    hips.position.y = 0.02; pelvis.add(hips);
    // testa con berretto e occhiali
    const head = P.head = new THREE.Group();
    head.position.y = 0.72; pelvis.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin); face.castShadow = true; head.add(face);
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hat);
    beanie.position.y = 0.02; head.add(beanie);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), lam('#f2f2f2')); pom.position.y = 0.17; head.add(pom);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.06), dark); goggles.position.set(0, 0.01, -0.13); head.add(goggles);
    // zaino con corda arrotolata
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.2), packM);
    pack.position.set(0, 0.32, 0.22); pack.castShadow = true; pelvis.add(pack);
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 5, 12), lam('#d9c27a'));
    rope.position.set(0, 0.6, 0.22); rope.rotation.x = Math.PI / 2; pelvis.add(rope);
    // braccia: spalla → gomito → mano
    for (const side of [-1, 1]) {
      const k = side < 0 ? 'L' : 'R';
      const sh = P['shoulder' + k] = new THREE.Group();
      sh.position.set(side * 0.27, 0.52, 0); pelvis.add(sh);
      sh.add(limb(0.07, 0.06, 0.3, jacket));
      const el = P['elbow' + k] = new THREE.Group();
      el.position.y = -0.3; sh.add(el);
      el.add(limb(0.055, 0.05, 0.27, jacket));
      const hand = P['hand' + k] = new THREE.Group();
      hand.position.y = -0.29; el.add(hand);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.06), glove); palm.position.y = -0.04; palm.castShadow = true; hand.add(palm);
      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.05), glove); fingers.position.set(0, -0.12, -0.015); fingers.rotation.x = 0.5; hand.add(fingers);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), glove); thumb.position.set(-side * 0.06, -0.04, -0.03); thumb.rotation.z = side * 0.6; hand.add(thumb);
      // gambe: anca → ginocchio → piede
      const hip = P['hip' + k] = new THREE.Group();
      hip.position.set(side * 0.1, -0.02, 0); pelvis.add(hip);
      hip.add(limb(0.085, 0.07, 0.42, pants));
      const kn = P['knee' + k] = new THREE.Group();
      kn.position.y = -0.42; hip.add(kn);
      kn.add(limb(0.07, 0.06, 0.42, pants));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.24), boot);
      foot.position.set(0, -0.44, -0.05); foot.castShadow = true; kn.add(foot);
    }
  }

  buildFromModel(def) {
    const model = def.scene;
    model.rotation.y = ((def.rotateY ?? 180) * Math.PI) / 180;   // i GLB guardano verso +Z, noi verso -Z
    model.scale.setScalar(def.scale ?? 1);
    // le mesh con skin si deformano: il bounding box statico non basta per il culling
    softenScene(model, { rim: 0.12 });   // normali morbide + toon, come il resto del mondo
    // più triangoli e forme a capsula invece di scatole (?char=0 per il modello originale)
    const refine = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('char') ?? 1) : 1;
    if (refine > 0) model.traverse(o => { if (o.isSkinnedMesh) o.geometry = refineSkinned(o.geometry, refine, 3); });
    // tessuto e pelle reali (Higgsfield): assets/manifest.json → textures.char_*
    const tx = (this.assets && this.assets.textures) || {};
    if (STYLE === 'real') applyMaterialTextures(model, {
      shirt: { map: tx.char_jacket, scale: 1.4, bump: 0.18, roughness: 0.82 },
      pants: { map: tx.char_trousers, scale: 1.6, bump: 0.15, roughness: 0.9 },
      skin: { map: tx.char_skin, scale: 1.2, bump: 0.05, roughness: 0.55 },
      pack: { map: tx.char_canvas, scale: 1.4, bump: 0.15, roughness: 0.92 },
      boots: { roughness: 0.55 },
    });
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // gruppo intermedio per inclinare il corpo verso la parete (le clip non lo fanno)
    this.lean = new THREE.Group();
    this.lean.position.y = 0.9;      // ruota attorno al bacino, non ai piedi
    model.position.y = -0.9;
    this.lean.add(model);
    this.root.add(this.lean);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    const clips = def.clips || {};
    for (const key of ['idle', 'walk', 'run', 'climb', 'fall']) {
      const clip = THREE.AnimationClip.findByName(def.animations, clips[key] || key);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    this.current = null;
  }

  // posizione e animazione dal giocatore
  update(p, dt) {
    this.time += dt;
    const moved = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y, p.z - this.last.z) : 0;
    this.last = { x: p.x, y: p.y, z: p.z };
    const climbing = p.mode === 'climb';

    // posizione del corpo
    if (climbing) {
      // in arrampicata p è il punto del corpo a contatto: i piedi stanno sotto, staccati dalla roccia
      const hl = Math.hypot(p.nx, p.nz);
      this.root.position.set(p.x + p.nx * 0.12, p.y - 0.15, p.z + p.nz * 0.12);
      this.wallLean = Math.atan2(hl, Math.max(0.05, p.ny)) ;   // 90° = parete verticale
    } else {
      this.root.position.set(p.x, p.y, p.z);
    }
    this.root.rotation.y = p.yaw;

    if (this.mixer) return this.updateModel(p, dt, moved, climbing);
    const P = this.parts, s = Math.sin, t = this.time;
    const set = (o, x, y = 0, z = 0) => o.rotation.set(x, y, z);
    // tremolio quando la stamina è quasi finita (come in PEAK)
    const shake = climbing && p.stamina < 0.25 ? (0.25 - p.stamina) * 0.6 : 0;
    const tr = () => (Math.random() - 0.5) * shake;

    if (climbing) {
      this.climbPhase += moved * 3.2;
      const c = this.climbPhase, lunge = p.lunge > 0;
      P.pelvis.rotation.set(-(Math.PI / 2 - this.wallLean) * 0.8, 0, 0);   // inclinato verso la parete
      P.pelvis.position.y = 0.92 + 0.05 * s(c * 2);
      // mani alternate: una si allunga in alto mentre l'altra tira
      const reach = lunge ? 0.0 : 0.45;
      set(P.shoulderL, 2.7 + reach * s(c) + tr(), 0, -0.15 + tr());
      set(P.shoulderR, 2.7 - reach * s(c) + tr(), 0, 0.15 + tr());
      set(P.elbowL, 0.25 + 0.55 * (0.5 - 0.5 * s(c)));
      set(P.elbowR, 0.25 + 0.55 * (0.5 + 0.5 * s(c)));
      set(P.handL, -0.6); set(P.handR, -0.6);
      // piedi alternati (opposti alle mani)
      set(P.hipL, 0.55 - 0.45 * s(c), 0, -0.12); set(P.kneeL, -0.9 + 0.6 * s(c));
      set(P.hipR, 0.55 + 0.45 * s(c), 0, 0.12); set(P.kneeR, -0.9 - 0.6 * s(c));
      set(P.head, 0.35);   // guarda in alto
      return;
    }

    P.pelvis.rotation.set(0, 0, 0);
    P.head.rotation.set(0, 0, 0);
    const speed = moved / Math.max(dt, 1e-3);
    if (!p.grounded && Math.abs(p.vy) > 2) {
      // in aria: braccia aperte, gambe piegate
      set(P.shoulderL, 2.0, 0, -0.7); set(P.shoulderR, 2.0, 0, 0.7);
      set(P.elbowL, 0.4); set(P.elbowR, 0.4);
      set(P.hipL, 0.5); set(P.kneeL, -0.8); set(P.hipR, 0.2); set(P.kneeR, -0.5);
      P.pelvis.position.y = 0.92;
      return;
    }
    this.walkPhase += moved * 2.6;
    const w = this.walkPhase, amp = Math.min(1, speed / 4.4) * (speed > 6 ? 0.85 : 0.6);
    const breathe = 0.02 * s(t * 2);
    P.pelvis.position.y = 0.92 + Math.abs(s(w)) * 0.04 * amp + breathe;
    set(P.hipL, s(w) * amp); set(P.hipR, -s(w) * amp);
    set(P.kneeL, -Math.max(0, -s(w + 0.6)) * 1.1 * amp - 0.05);
    set(P.kneeR, -Math.max(0, s(w + 0.6)) * 1.1 * amp - 0.05);
    set(P.shoulderL, -s(w) * amp * 0.8 + breathe, 0, -0.08);
    set(P.shoulderR, s(w) * amp * 0.8 + breathe, 0, 0.08);
    set(P.elbowL, 0.25 + 0.3 * amp); set(P.elbowR, 0.25 + 0.3 * amp);
    set(P.handL, 0); set(P.handR, 0);
  }

  updateModel(p, dt, moved, climbing) {
    const speed = moved / Math.max(dt, 1e-3);
    let want = 'idle';
    if (climbing) want = 'climb';
    else if (!p.grounded && Math.abs(p.vy) > 2) want = 'fall';
    else if (speed > 6) want = 'run';
    else if (speed > 0.5) want = 'walk';
    if (!this.actions[want]) want = this.actions.idle ? 'idle' : Object.keys(this.actions)[0];
    const a = this.actions[want];
    if (a && this.current !== a) {
      a.reset().fadeIn(0.2).play();
      if (this.current) this.current.fadeOut(0.2);
      this.current = a;
    }
    if (a) a.timeScale = climbing ? Math.min(1.5, speed / 1.5) : 1;   // in parete: ferma se non ti muovi
    this.mixer.update(dt);
    // inclinazione verso la parete + tremore quando la stamina è quasi finita (come nel procedurale)
    const shake = climbing && p.stamina < 0.25 ? (0.25 - p.stamina) * 0.25 : 0;
    const lean = climbing ? -(Math.PI / 2 - this.wallLean) * 0.6 : 0;
    this.lean.rotation.set(lean + (Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake);
  }
}
