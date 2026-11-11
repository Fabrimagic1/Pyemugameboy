// Prova il generatore in Node, senza browser:
//   node climber/tools/test-gen.mjs [numero_di_seed]
// Controlla: determinismo (stesso seed → stessi macigni), vie per ogni tappa, tempi.
import { generateMountain } from '../src/generator.js';
import { MIN_ROUTES } from '../src/rules.js';

const digest = w => {
  let h = 2166136261;
  for (const b of w.boulders) for (const v of [b.x, b.y, b.z, b.s, b.shape, b.kind]) { h ^= Math.round(v * 1000); h = Math.imul(h, 16777619); }
  const u8 = new Uint8Array(w.top.H.buffer);
  for (let i = 0; i < u8.length; i += 7) { h ^= u8[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
};

const n = Number(process.argv[2] || 6);
let failures = 0;
for (let k = 0; k < n; k++) {
  const seed = k === 0 ? '2026-11-05' : `test-${k}`;
  const t = Date.now();
  const a = generateMountain(seed);
  const ms = Date.now() - t;
  const same = digest(a) === digest(generateMountain(seed));
  const segs = a.route.segments.map(s => `${s.ok ? '' : '✗'}${s.routes.map(r => r.kind[0]).join('')}(${s.repairs})`).join(' ');
  console.log(`${seed.padEnd(11)} ${ms}ms  H=${a.height.toFixed(0)}m R=${a.layout.baseRadius.toFixed(0)}m  ${a.layout.bands.map(x => x.id).join(' > ')}`);
  console.log(`            macigni=${a.stats.boulders} appoggi=${a.stats.rests}  vie per tappa [f=facile m=misto p=parete](riparazioni): ${segs}`);
  console.log(`            oggetti=${a.stats.props} cibo=${a.stats.food} valigie=${a.stats.luggage} deterministico=${same}  ${JSON.stringify(a.stats.timings)}`);
  if (!same || !a.stats.allOk) failures++;
}
console.log(failures ? `\n${failures} seed con problemi` : `\nTutti i seed: deterministici, almeno ${MIN_ROUTES} vie per ogni tappa.`);
process.exit(failures ? 1 : 0);
