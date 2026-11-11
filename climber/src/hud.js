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

  // vista dall'alto della mappa delle cime, con ombreggiatura del rilievo
  buildMap() {
    const w = this.world, T = w.top, nx = T.nx, nz = T.nz;
    const cv = $('map-canvas');
    cv.width = nx; cv.height = nz;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(nx, nz);
    const pal = w.layout.bands.map(b => ({ rock: hex(b.def.rock), top: hex(b.def.top) }));
    const MC = { [MAT.ICE]: [150, 210, 240], [MAT.VINE]: [60, 150, 50], [MAT.LAVA]: [255, 90, 20] };
    const L = [-0.5, 0.75, -0.45], H = T.H;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i, o = ((nz - 1 - j) * nx + i) * 4;
      let rgb = H[c] < SEA ? [42, 130, 160] : MC[T.M[c]] || ((T.F[c] & FLAG_STAND) ? pal[T.B[c]].top : pal[T.B[c]].rock);
      const gx = Math.max(-3, Math.min(3, (H[c + (i < nx - 1 ? 1 : 0)] - H[c - (i > 0 ? 1 : 0)]) / (2 * T.C)));
      const gz = Math.max(-3, Math.min(3, (H[c + (j < nz - 1 ? nx : 0)] - H[c - (j > 0 ? nx : 0)]) / (2 * T.C)));
      const shade = 0.55 + 0.6 * Math.max(0, (-gx * L[0] + L[1] - gz * L[2]) / Math.hypot(gx, 1, gz));
      img.data[o] = rgb[0] * shade; img.data[o + 1] = rgb[1] * shade; img.data[o + 2] = rgb[2] * shade; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const px = x => (x - T.x0) / T.C, pz = z => nz - 1 - (z - T.z0) / T.C;
    this.px = px; this.pz = pz;
    for (const seg of w.route.segments) for (const route of seg.routes) {
      ctx.strokeStyle = ROUTE_COLORS[route.index]; ctx.lineWidth = 1.6; ctx.beginPath();
      route.points.forEach(([x, , z], k) => (k ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z))));
      ctx.stroke();
    }
    ctx.fillStyle = '#ff2bd6';
    for (const r of w.route.repairs) ctx.fillRect(px(r.x) - 1.5, pz(r.z) - 1.5, 4, 4);
    ctx.fillStyle = '#ffa630';
    for (const f of w.campfires) { ctx.beginPath(); ctx.arc(px(f.x), pz(f.z), 4.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e8452c';
    ctx.beginPath(); ctx.arc(px(w.peak.x), pz(w.peak.z), 4.5, 0, Math.PI * 2); ctx.fill();
    $('map-wrap').style.setProperty('--ar', nx / nz);
    this.overlay = $('map-overlay');
    this.overlay.width = nx; this.overlay.height = nz;
  }

  // profilo: la sagoma della montagna vista di lato, con le vie (quota in funzione della distanza dal centro)
  buildProfile() {
    const w = this.world, T = w.top, cv = $('profile-canvas');
    const W = cv.width = 640, Hh = cv.height = 240, pad = 16, R = w.layout.islandRadius + 10;
    const ctx = cv.getContext('2d');
    const sx = r => W / 2 + (r / R) * (W / 2 - pad), sy = y => Hh - pad - (Math.max(SEA, y) / (w.height + 12)) * (Hh - 2 * pad);
    ctx.fillStyle = '#1b2733'; ctx.fillRect(0, 0, W, Hh);
    const pal = w.layout.bands.map(b => b.def.rock);
    for (let i = 0; i < T.nx; i++) {            // sagoma: per ogni x la cima più alta lungo z
      let m = -20, band = 0;
      for (let j = 0; j < T.nz; j += 2) { const c = j * T.nx + i; if (T.H[c] > m) { m = T.H[c]; band = T.B[c]; } }
      if (m < SEA) continue;
      ctx.fillStyle = pal[band]; ctx.fillRect(sx(T.xOf(i)), sy(m), Math.ceil((W - 2 * pad) / (2 * R)) + 1, sy(SEA) - sy(m));
    }
    for (const seg of w.route.segments) for (const route of seg.routes) {
      ctx.strokeStyle = ROUTE_COLORS[route.index]; ctx.lineWidth = 1.3; ctx.beginPath();
      route.points.forEach(([x, y], k) => (k ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffa630';
    for (const f of w.campfires) { ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#aab3bd'; ctx.font = '11px sans-serif'; ctx.fillText('↑ quota · vista di lato', 4, 12);
  }

  drawPlayer(p) {
    const ctx = this.overlay.getContext('2d');
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe600'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.px(p.x), this.pz(p.z), 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  buildStats() {
    const w = this.world, st = w.stats;
    const names = w.layout.bands.map(b => b.name);
    const lines = [
      `seed "${w.seed}" → hash ${w.seedHash.toString(16)}`,
      `quota vetta ${w.height.toFixed(0)} m · raggio alla base ${w.layout.baseRadius.toFixed(0)} m`,
      `${st.boulders} macigni da ${st.shapes} modelli · ${st.rests} appoggi · ${st.repairs} appoggi aggiunti`,
      ...w.layout.bands.map(b => `${b.y0.toFixed(0).padStart(3)}–${b.y1.toFixed(0).padEnd(3)} m  ${b.name}` + (b.slot.length > 1 ? `  (scelto tra: ${b.slot.join(', ')})` : '')),
      '',
      'VIE PER TAPPA',
      ...w.route.segments.map((g, k) => `${k === 0 ? 'Spiaggia' : 'Falò ' + k} → ${k === w.route.segments.length - 1 ? 'Vetta' : 'Falò ' + (k + 1)}` +
        ` (${names[k]})${g.repairs ? `, ${g.repairs} appoggi aggiunti` : ''}\n` +
        g.routes.map(r => `   ${r.label}: ${r.kind.padEnd(7)} ${r.hops} appoggi · in parete ${Math.round(r.climb)} m` +
          (r.vine > 4 ? ' · liane' : '') + (r.ice > 4 ? ' · ghiaccio' : '')).join('\n')),
      '',
      `tempi (ms): ${Object.entries(st.timings).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    ];
    $('map-stats').textContent = lines.join('\n');
  }
}
