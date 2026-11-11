// ─────────────────────────────────────────────────────────────────────────────
// HUD + MAPPA DI DEBUG
// La mappa (tasto M) mostra il terreno visto dall'alto (avanti = in alto),
// con le VIE garantite di ogni tratto in colori diversi, e il profilo
// altimetrico: avanti → e in salita ↑. È il modo più rapido per capire cosa fa il generatore.
// ─────────────────────────────────────────────────────────────────────────────
import { MAT, SEA } from './rules.js';
import { FLAG_STAND } from './surface.js';
import { ROUTE_COLORS } from './render.js';

const $ = id => document.getElementById(id);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PASSAGE_NAMES = { ramp: 'cengia diagonale', stairs: 'gradoni', gully: 'canalone' };

export class Hud {
  constructor(world) {
    this.world = world;
    this.bar = {
      stamina: $('bar-stamina'), hunger: $('bar-hunger'), cold: $('bar-cold'),
      heat: $('bar-heat'), injury: $('bar-injury'), mist: $('bar-mist'),
    };
    $('seed-label').textContent = world.seed;
    this.buildMap();
    this.buildProfile();
    this.buildStats();
  }

  update(player, fog) {
    const b = this.bar;
    b.mist.style.width = `${player.mist * 100}%`;
    b.stamina.style.width = `${Math.max(0, player.stamina) * 100}%`;
    b.hunger.style.width = `${player.hunger * 100}%`;
    b.cold.style.width = `${player.cold * 100}%`;
    b.heat.style.width = `${player.heat * 100}%`;
    b.injury.style.width = `${player.injury * 100}%`;
    b.stamina.classList.toggle('low', player.stamina < 0.2);
    $('alt').textContent = `${Math.max(0, player.y).toFixed(0)} m / ${this.world.height.toFixed(0)} m`;
    $('biome').textContent = player.env ? player.env.main.name : '';
    $('mode').textContent = player.inFog ? 'NELLA NEBBIA!' : player.onPiton ? 'appeso al chiodo (riposo)'
      : player.mode === 'climb' ? 'arrampicata' : (player.warm ? 'al caldo del falò' : '');
    // oggetti e suggerimento
    const inv = player.inventory;
    $('inv-text').textContent = `Chiodi ${inv.piton} [F]  ·  Bende ${inv.bandage} [1]  ·  Energetico ${inv.drink} [2]` + (player.boost > 0 ? `  ·  carica ${player.boost.toFixed(0)}s` : '');
    $('hint').textContent = player.hint; $('hint').hidden = !player.hint;
    // nebbia: quanto è sotto di te, o tra quanto parte
    if (fog) {
      const gap = player.y - fog.level, el = $('fogmeter');
      el.textContent = fog.timer > 0 ? `nebbia tra ${Math.ceil(fog.timer)} s` : gap > 0 ? `nebbia ${gap.toFixed(0)} m sotto${fog.rising ? ' ▲' : ''}` : 'sei nella nebbia';
      el.classList.toggle('danger', fog.timer <= 0 && gap < 12);
    }
    while (player.events.length) this.toast(player.events.shift());
    if (player.won) $('win').hidden = false;
    if (!$('map').hidden) this.drawPlayer(player);
  }

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // vista dall'alto con ombreggiatura del rilievo
  buildMap() {
    const w = this.world, T = w.terrain, nx = T.nx, nz = T.nz;
    const cv = $('map-canvas');
    cv.width = nx; cv.height = nz;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(nx, nz);
    const pal = w.layout.sections.map(b => ({ wall: hex(b.def.palette.wall), ledge: hex(b.def.palette.ledge) }));
    const MC = { [MAT.ICE]: [150, 210, 240], [MAT.VINE]: [60, 150, 50], [MAT.LAVA]: [255, 90, 20], [MAT.SNOW]: [240, 244, 248], [MAT.SAND]: [226, 207, 152] };
    const L = [-0.5, 0.75, -0.45];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i, o = ((nz - 1 - j) * nx + i) * 4, H = T.H;
      let rgb;
      if (H[c] < SEA) rgb = [42, 110, 160];
      else rgb = MC[T.M[c]] || ((T.F[c] & FLAG_STAND) ? pal[T.B[c]].ledge : pal[T.B[c]].wall);
      const gx = (H[c + (i < nx - 1 ? 1 : 0)] - H[c - (i > 0 ? 1 : 0)]) / (2 * T.C);
      const gz = (H[c + (j < nz - 1 ? nx : 0)] - H[c - (j > 0 ? nx : 0)]) / (2 * T.C);
      const nl = Math.hypot(gx, 1, gz);
      const shade = 0.55 + 0.6 * Math.max(0, (-gx * L[0] + L[1] - gz * L[2]) / nl);
      img.data[o] = rgb[0] * shade; img.data[o + 1] = rgb[1] * shade; img.data[o + 2] = rgb[2] * shade; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapCtx = ctx;
    const px = x => (x - T.x0) / T.C, pz = z => nz - 1 - (z - T.z0) / T.C;
    this.px = px; this.pz = pz;
    for (const seg of w.route.segments) for (const route of seg.routes) {
      ctx.strokeStyle = ROUTE_COLORS[route.index]; ctx.lineWidth = 2.5; ctx.beginPath();
      route.path.forEach(([i, j], k) => (k ? ctx.lineTo(i, nz - 1 - j) : ctx.moveTo(i, nz - 1 - j)));
      ctx.stroke();
    }
    ctx.fillStyle = '#ff2bd6';
    for (const r of w.route.repairs) ctx.fillRect(px(r.x) - 2, pz(r.z) - 2, 5, 5);
    ctx.fillStyle = '#ffa630';
    for (const f of w.campfires) { ctx.beginPath(); ctx.arc(px(f.x), pz(f.z), 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e8452c';
    ctx.beginPath(); ctx.arc(px(w.peak.x), pz(w.peak.z), 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 15px sans-serif';
    for (const b of w.layout.sections) {
      const y = pz(b.z0) - 8;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(4, y - 14, ctx.measureText(b.name).width + 8, 19);
      ctx.fillStyle = '#fff'; ctx.fillText(b.name, 8, y);
    }
    $('map-wrap').style.setProperty('--ar', nx / nz);
    this.overlay = $('map-overlay');
    this.overlay.width = nx; this.overlay.height = nz;
  }

  // profilo altimetrico: avanti (z) → e quota (y) ↑, con le vie
  buildProfile() {
    const w = this.world, T = w.terrain, cv = $('profile-canvas');
    const W = cv.width = 640, Hh = cv.height = 220, pad = 18;
    const ctx = cv.getContext('2d');
    const sx = z => pad + ((z - T.z0) / (T.nz * T.C)) * (W - 2 * pad);
    const sy = y => Hh - pad - (Math.max(SEA, y) / (w.height + 10)) * (Hh - 2 * pad);
    ctx.fillStyle = '#1b2733'; ctx.fillRect(0, 0, W, Hh);
    ctx.fillStyle = '#5d6670';
    ctx.beginPath(); ctx.moveTo(sx(T.z0), sy(SEA));
    for (let j = 0; j < T.nz; j += 2) {
      let m = -20; for (let i = 0; i < T.nx; i += 3) m = Math.max(m, T.H[j * T.nx + i]);
      ctx.lineTo(sx(T.zOf(j)), sy(m));
    }
    ctx.lineTo(sx(T.zOf(T.nz - 1)), sy(SEA)); ctx.fill();
    for (const seg of w.route.segments) for (const route of seg.routes) {
      ctx.strokeStyle = ROUTE_COLORS[route.index]; ctx.lineWidth = 1.5; ctx.beginPath();
      route.path.forEach(([i, j], k) => { const X = sx(T.zOf(j)), Y = sy(T.H[j * T.nx + i]); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    ctx.fillStyle = '#ffa630';
    for (const f of w.campfires) { ctx.beginPath(); ctx.arc(sx(f.z), sy(f.y), 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#aab3bd'; ctx.font = '11px sans-serif';
    ctx.fillText('avanti →', W - 70, Hh - 4); ctx.fillText('↑ quota', 4, 12);
  }

  drawPlayer(p) {
    const ctx = this.overlay.getContext('2d');
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe600'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.px(p.x), this.pz(p.z), 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  buildStats() {
    const w = this.world, st = w.stats;
    const names = w.layout.sections.map(b => b.name).concat(['Vetta']);
    const lines = [
      `seed "${w.seed}" → hash ${w.seedHash.toString(16)}`,
      `lunghezza ${w.length.toFixed(0)} m · quota vetta ${w.height.toFixed(0)} m · griglia ${w.terrain.nx}×${w.terrain.nz}`,
      ...w.layout.sections.map(b => `${b.name.padEnd(17)} ${b.cliffs.length} pareti` +
        (b.slot.length > 1 ? `  (scelto tra: ${b.slot.join(', ')})` : '')),
      `passaggi: ${st.passages} · cenge naturali: ${st.notches} · riparazioni: ${st.repairs}`,
      '',
      'VIE PER TRATTO',
      ...w.route.segments.map((g, k) => `${k === 0 ? 'Partenza' : 'Falò ' + k} → ${k === w.route.segments.length - 1 ? 'Vetta' : 'Falò ' + (k + 1)}` +
        ` (${names[k]})${g.repairs ? `, ${g.repairs} riparaz.` : ''}\n` +
        g.routes.map(r => `   ${r.label}: ${r.kind.padEnd(8)} ${r.side.padEnd(8)} dislivello in arrampicata ${Math.round(r.climbFrac * 100)}%` +
          (r.vine > 5 ? ' · liane' : '') + (r.ice > 5 ? ' · ghiaccio' : '')).join('\n')),
      '',
      `tempi (ms): ${Object.entries(st.timings).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    ];
    $('map-stats').textContent = lines.join('\n');
  }
}
