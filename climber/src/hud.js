// ─────────────────────────────────────────────────────────────────────────────
// HUD + MAPPA DI DEBUG
// La mappa (tasto M) mostra la montagna "srotolata": asse X = angolo θ,
// asse Y = quota. È il modo più rapido per capire cosa fa il generatore.
// ─────────────────────────────────────────────────────────────────────────────
import { MAT } from './rules.js';
import { FLAG_STAND } from './surface.js';

const $ = id => document.getElementById(id);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class Hud {
  constructor(world) {
    this.world = world;
    this.toasts = [];
    this.bar = {
      stamina: $('bar-stamina'), hunger: $('bar-hunger'), cold: $('bar-cold'),
      heat: $('bar-heat'), injury: $('bar-injury'),
    };
    $('seed-label').textContent = world.seed;
    this.buildMap();
    this.buildStats();
  }

  update(player) {
    const b = this.bar;
    b.stamina.style.width = `${Math.max(0, player.stamina) * 100}%`;
    b.hunger.style.width = `${player.hunger * 100}%`;
    b.cold.style.width = `${player.cold * 100}%`;
    b.heat.style.width = `${player.heat * 100}%`;
    b.injury.style.width = `${player.injury * 100}%`;
    b.stamina.classList.toggle('low', player.stamina < 0.2);
    $('alt').textContent = `${Math.max(0, player.y).toFixed(0)} m / ${this.world.height.toFixed(0)} m`;
    $('biome').textContent = player.env ? player.env.main.name : '';
    $('mode').textContent = player.mode === 'climb' ? 'arrampicata' : (player.warm ? 'al caldo del falò' : '');
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

  buildMap() {
    const w = this.world, s = w.surface, W = s.W;
    const rows = Math.ceil(w.height / s.dy) + 1;
    const cv = $('map-canvas');
    cv.width = W; cv.height = rows;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, rows);
    const pal = w.layout.biomes.map(b => ({ wall: hex(b.def.palette.wall), ledge: hex(b.def.palette.ledge) }));
    const MC = { [MAT.ICE]: [150, 210, 240], [MAT.VINE]: [60, 150, 50], [MAT.LAVA]: [255, 90, 20] };
    for (let j = 0; j < rows; j++) for (let i = 0; i < W; i++) {
      const c = j * W + i, o = ((rows - 1 - j) * W + i) * 4;
      const p = pal[s.B[c]];
      let rgb = MC[s.M[c]] || ((s.F[c] & FLAG_STAND) ? p.ledge : p.wall);
      const shade = s.DRDY[c] > 0.3 ? 0.6 : 1;   // strapiombi più scuri
      img.data[o] = rgb[0] * shade; img.data[o + 1] = rgb[1] * shade; img.data[o + 2] = rgb[2] * shade; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const Y = y => rows - 1 - y / s.dy;
    ctx.fillStyle = '#ffffff';
    for (const seg of w.route.segments) for (const [i, j] of seg.path) ctx.fillRect(i, rows - 1 - j, 1, 1);
    ctx.fillStyle = '#ff2bd6';
    for (const r of w.route.repairs) ctx.fillRect(s.col(r.theta) - 2, Y(r.y) - 4, 5, 5);
    ctx.fillStyle = '#ffa630';
    for (const f of w.campfires) { ctx.beginPath(); ctx.arc(s.col(f.theta), Y(f.y), 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = '13px sans-serif';
    for (const b of w.layout.biomes) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(2, Y(b.y1) + 2, ctx.measureText(b.name).width + 8, 17);
      ctx.fillStyle = '#fff'; ctx.fillText(b.name, 6, Y(b.y1) + 15);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, Y(b.y1), W, 1);
    }
    $('map-wrap').style.setProperty('--ar', W / rows);
    this.mapRows = rows;
    this.overlay = $('map-overlay');
    this.overlay.width = W; this.overlay.height = rows;
  }

  drawPlayer(p) {
    const s = this.world.surface, ctx = this.overlay.getContext('2d');
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const x = s.col(Math.atan2(p.z, p.x)), y = this.mapRows - 1 - p.y / s.dy;
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe600'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  buildStats() {
    const w = this.world, st = w.stats;
    const lines = [
      `seed "${w.seed}" → hash ${w.seedHash.toString(16)}`,
      `altezza ${w.height.toFixed(1)} m · griglia ${w.surface.W}×${w.surface.rows} = ${st.cells.toLocaleString('it')} celle`,
      ...w.layout.biomes.map(b => `${b.y0.toFixed(0).padStart(3)}–${b.y1.toFixed(0).padEnd(3)} m  ${b.name}` +
        (b.slot.length > 1 ? `  (scelto tra: ${b.slot.join(', ')})` : '')),
      `strutture sparse: ${st.features} · oggetti: ${st.props} · cibo: ${st.food}`,
      `percorso: ${w.route.segments.map(g => `${g.ok ? '✓' : '✗'}${g.repairs}`).join('  ')}  (riparazioni per tratto)`,
      `tempi (ms): ${Object.entries(st.timings).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    ];
    $('map-stats').textContent = lines.join('\n');
  }
}
