// Prova il generatore in Node, senza browser:
//   node climber/tools/test-gen.mjs [numero_di_seed]
// Controlla: determinismo (stesso seed → stessa griglia), percorso valido, tempi.
import { generateMountain } from '../src/generator.js';

function digest(arr) {
  let h = 2166136261;
  const u8 = new Uint8Array(arr.buffer);
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

const n = Number(process.argv[2] || 8);
let failures = 0;
for (let k = 0; k < n; k++) {
  const seed = k === 0 ? '2026-11-05' : `test-${k}`;
  const t = Date.now();
  const a = generateMountain(seed);
  const ms = Date.now() - t;
  const b = generateMountain(seed);
  const same = digest(a.surface.R) === digest(b.surface.R) && digest(a.surface.M) === digest(b.surface.M);
  const biomes = a.layout.biomes.map(x => x.id).join(' > ');
  const segs = a.route.segments.map(s => `${s.ok ? 'ok' : 'NO'}(${s.repairs})`).join(' ');
  console.log(`${seed.padEnd(11)} ${ms}ms  H=${a.height.toFixed(0)}m  ${biomes}`);
  console.log(`            tratti: ${segs}  props=${a.stats.props} cibo=${a.stats.food} deterministico=${same}`);
  console.log(`            tempi: ${JSON.stringify(a.stats.timings)}`);
  if (!same || !a.stats.allReachable) failures++;
}
console.log(failures ? `\n${failures} seed con problemi` : '\nTutti i seed sono deterministici e scalabili.');
process.exit(failures ? 1 : 0);
