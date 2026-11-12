// ─────────────────────────────────────────────────────────────────────────────
// AVVIO: seed → generazione → scena → loop di gioco
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { generateMountain } from './generator.js';
import { dailySeed } from './rng.js';
import { WorldView } from './render.js';
import { Character } from './character.js';
import { loadAssets } from './assets.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { Fog } from './fog.js';
import { Grass } from './grass.js';
import { STYLE } from './toon.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const seed = params.get('seed') || dailySeed();

function goSeed(s) { location.search = `?seed=${encodeURIComponent(s)}`; }
$('btn-today').onclick = () => { location.search = ''; };
$('btn-random').onclick = () => goSeed(Math.random().toString(36).slice(2, 8));
$('seed-form').onsubmit = e => { e.preventDefault(); const v = $('seed-input').value.trim(); if (v) goSeed(v); };
$('seed-input').value = seed;

setTimeout(start, 30); // lascia disegnare la schermata di caricamento

async function start() {
  const assets = await loadAssets();
  const world = generateMountain(seed);
  window.world = world; // comodo per esplorare dalla console del browser

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // resa "cinematografica": luci morbide, colori pieni
  renderer.toneMappingExposure = STYLE === 'real' ? 0.7 : 0.95;
  $('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 4000);
  const real = STYLE === 'real';
  // con lo stile realistico la luce d'ambiente viene soprattutto dal cielo (vedi sotto):
  // l'emisferica resta solo come riempimento leggero
  const hemi = new THREE.HemisphereLight('#dfefff', '#6b5a48', real ? 0.12 : 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(real ? '#fff1dc' : '#ffeccd', real ? 5.2 : 2.6);
  const sunDir = (real ? new THREE.Vector3(0.55, 0.6, 0.35) : new THREE.Vector3(0.5, 0.8, 0.3)).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(real ? 4096 : 2048, real ? 4096 : 2048);
  sun.shadow.normalBias = 0.05; sun.shadow.radius = 2.5;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const view = new WorldView(world, scene, assets);
  view.skyUniforms.sunDir.value.copy(sunDir);
  // CIELO ATMOSFERICO: simula la diffusione della luce nell'aria (cielo più chiaro all'orizzonte,
  // alone attorno al sole). Lo stesso cielo viene "fotografato" in una mappa d'ambiente che
  // illumina la scena da tutte le direzioni e si riflette su acqua e superfici lucide.
  if (real) {
    try {
      const { Sky } = await import('three/addons/objects/Sky.js');
      const mkSky = () => {
        const s = new Sky(); s.scale.setScalar(3500);
        Object.assign(s.material.uniforms.turbidity, { value: 5 }); s.material.uniforms.rayleigh.value = 1.4;
        s.material.uniforms.mieCoefficient.value = 0.004; s.material.uniforms.mieDirectionalG.value = 0.82;
        s.material.uniforms.sunPosition.value.copy(sunDir);
        return s;
      };
      const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene();
      envScene.add(mkSky());
      scene.environment = pmrem.fromScene(envScene, 0, 0.1, 4000).texture;
      pmrem.dispose();
      view.realSky = mkSky(); view.realSky.material.fog = false;
      scene.add(view.realSky);
      view.sky.visible = false;
    } catch (e) { console.warn('Cielo atmosferico non disponibile:', e.message || e); }
  }
  const player = new Player(world);
  const character = new Character(assets);
  scene.add(character.root);
  window.__char = character;
  window.view = view;   // per ispezionare la scena dalla console
  window.setCamera = (y, p) => { yaw = y; pitch = p; }; // utile per screenshot/debug dalla console
  const hud = new Hud(world);
  // erba: ?grass=0 la spegne, ?grass=2 la infittisce
  const grassQ = Number(params.get('grass') ?? 1);
  const grass = grassQ > 0 ? new Grass(world, scene, grassQ) : null;
  const fog = new Fog(world);
  player.fog = fog;
  window.fog = fog;

  // bloom: fa brillare lava, fuochi e oggetti emissivi (tasto B per spegnerlo, o ?fx=0)
  let composer = null, fx = params.get('fx') !== '0';
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'),
    ]);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.6, 1.5)); // soglia alta: solo lava e fuochi
    composer.addPass(new OutputPass());
  } catch (e) { console.warn('Bloom non disponibile:', e.message || e); }
  window.player = player;

  // ── input ──
  const keys = new Set();
  let mouseGrab = false, jumpQueued = false, orbit = params.has('orbit'), orbitT = 0;
  const pressed = new Set();   // tasti premuti in questo frame (azioni "una volta")
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
    if (e.code === 'KeyM') $('map').hidden = !$('map').hidden;
    if (e.code === 'KeyP') view.debug.visible = !view.debug.visible;
    if (e.code === 'KeyR') player.respawn();
    if (e.code === 'KeyH') $('help').hidden = !$('help').hidden;
    if (e.code === 'KeyO') orbit = !orbit;
    if (e.code === 'KeyB') fx = !fx;
    if (!e.repeat) pressed.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouseGrab = false; });
  const canvas = renderer.domElement;
  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
    if (e.button === 0) mouseGrab = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouseGrab = false; });

  // camera in terza persona
  let yaw = Math.atan2(world.spawn.x, world.spawn.z), pitch = 0.2, dist = 6;   // si guarda verso il monte
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-1.2, Math.min(1.3, pitch - e.movementY * 0.0025));
  });
  addEventListener('wheel', e => { dist = Math.max(2.5, Math.min(14, dist + Math.sign(e.deltaY) * 0.7)); });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    if (composer) composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  });

  const target = new THREE.Vector3(), look = new THREE.Vector3(), cam = new THREE.Vector3();
  const camN = [0, 0, 0];
  function placeCamera() {
    target.set(player.x, player.y + (player.mode === 'climb' ? 1.0 : 1.5), player.z);
    look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    // la camera si avvicina se c'è roccia in mezzo, ma mai fin dentro al personaggio:
    // sotto 2 m di distanza la si fa invece "scivolare" fuori dalla roccia lungo la normale
    let d = 0.4;
    for (; d < dist; d += 0.2) {
      cam.copy(target).addScaledVector(look, -d);
      if (world.sdf(cam.x, cam.y, cam.z) < 0.35) { d -= 0.2; break; }
    }
    cam.copy(target).addScaledVector(look, -Math.max(2, Math.min(d, dist)));
    for (let k = 0; k < 5; k++) {
      const s = world.sdf(cam.x, cam.y, cam.z);
      if (s >= 0.45) break;
      const n = world.normal(cam.x, cam.y, cam.z, camN);
      cam.x += n[0] * (0.45 - s); cam.y += n[1] * (0.45 - s); cam.z += n[2] * (0.45 - s);
    }
    camera.position.copy(cam);
    camera.lookAt(target);
  }

  $('loading').hidden = true;
  $('help').hidden = false;

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); // il primo timestamp può essere < last
    last = now;
    const k = c => keys.has(c);
    const input = {
      fwd: (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0),
      right: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
      jump: jumpQueued,
      sprint: k('ShiftLeft') || k('ShiftRight'),
      grab: mouseGrab || k('KeyE'),
      interact: pressed.has('KeyF'), use1: pressed.has('Digit1'), use2: pressed.has('Digit2'),
    };
    jumpQueued = false; pressed.clear();
    fog.update(dt, player);
    while (fog.events.length) player.say(fog.events.shift());
    player.update(dt, input, yaw);

    character.update(player, dt);
    if (orbit) {
      // vista orbitale: tutta la montagna da fuori, per studiare la generazione
      orbitT += dt * 0.1;
      const D = world.layout.islandRadius * 1.9;
      camera.position.set(Math.sin(orbitT) * D, world.height * 0.75, -Math.cos(orbitT) * D);
      camera.lookAt(0, world.height * 0.42, 0);
    } else placeCamera();
    sun.position.set(player.x, player.y, player.z).addScaledVector(sunDir, 120);
    sun.target.position.set(player.x, player.y, player.z);
    view.update(dt, camera, orbit, fog, { hemi, sun });
    view.syncItems(player);
    if (grass) grass.update(dt, player, 1.0);
    hud.update(player, fog);
    if (composer && fx) composer.render(); else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
