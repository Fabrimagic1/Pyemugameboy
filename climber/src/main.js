// ─────────────────────────────────────────────────────────────────────────────
// AVVIO: seed → generazione → scena → loop di gioco
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { generateMountain } from './generator.js';
import { dailySeed } from './rng.js';
import { WorldView, buildPlayerMesh } from './render.js';
import { Player } from './player.js';
import { Hud } from './hud.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const seed = params.get('seed') || dailySeed();

function goSeed(s) { location.search = `?seed=${encodeURIComponent(s)}`; }
$('btn-today').onclick = () => { location.search = ''; };
$('btn-random').onclick = () => goSeed(Math.random().toString(36).slice(2, 8));
$('seed-form').onsubmit = e => { e.preventDefault(); const v = $('seed-input').value.trim(); if (v) goSeed(v); };
$('seed-input').value = seed;

setTimeout(start, 30); // lascia disegnare la schermata di caricamento

function start() {
  const world = generateMountain(seed);
  window.world = world; // comodo per esplorare dalla console del browser

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 4000);
  scene.add(new THREE.HemisphereLight('#dfefff', '#6b5a48', 1.1));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
  const sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const view = new WorldView(world, scene);
  const player = new Player(world);
  const pmesh = buildPlayerMesh();
  scene.add(pmesh);
  const hud = new Hud(world);
  window.player = player;

  // ── input ──
  const keys = new Set();
  let mouseGrab = false, jumpQueued = false, orbit = params.has('orbit'), orbitT = 0;
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
    if (e.code === 'KeyM') $('map').hidden = !$('map').hidden;
    if (e.code === 'KeyP') view.debug.visible = !view.debug.visible;
    if (e.code === 'KeyR') player.respawn();
    if (e.code === 'KeyH') $('help').hidden = !$('help').hidden;
    if (e.code === 'KeyO') orbit = !orbit;
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
  let yaw = Math.PI, pitch = 0.2, dist = 6;   // si guarda in avanti, verso la vetta
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-1.2, Math.min(1.3, pitch - e.movementY * 0.0025));
  });
  addEventListener('wheel', e => { dist = Math.max(2.5, Math.min(14, dist + Math.sign(e.deltaY) * 0.7)); });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  });

  const T = world.terrain;
  const target = new THREE.Vector3(), look = new THREE.Vector3(), cam = new THREE.Vector3();
  function placeCamera() {
    target.set(player.x, player.y + 1.5, player.z);
    look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    // accorcia la distanza se la camera finirebbe dentro la roccia
    let d = 0.3;
    for (; d < dist; d += 0.2) {
      cam.copy(target).addScaledVector(look, -d);
      if (T.height(cam.x, cam.z) + 0.4 > cam.y) { d -= 0.2; break; }
    }
    camera.position.copy(target).addScaledVector(look, -Math.max(0.3, d));
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
    };
    jumpQueued = false;
    player.update(dt, input, yaw);

    // in arrampicata il corpo sta staccato dalla parete lungo la normale
    const off = player.mode === 'climb' ? 0.45 : 0;
    pmesh.position.set(player.x + player.nx * off, player.y + (player.mode === 'climb' ? -0.6 : 0), player.z + player.nz * off);
    pmesh.rotation.y = player.yaw;
    if (orbit) {
      // vista orbitale: tutta la montagna da fuori, per studiare la generazione
      orbitT += dt * 0.1;
      const L = world.length, D = L * 0.75, cz = L * 0.5;
      camera.position.set(Math.sin(orbitT) * D, world.height * 1.1, cz - Math.cos(orbitT) * D);
      camera.lookAt(0, world.height * 0.35, cz);
    } else placeCamera();
    sun.position.set(player.x, player.y, player.z).addScaledVector(sunDir, 120);
    sun.target.position.set(player.x, player.y, player.z);
    view.update(dt, camera, orbit);
    hud.update(player);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
