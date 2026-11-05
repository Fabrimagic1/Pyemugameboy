// Prova il generatore in Node, senza browser:
//   node climber/tools/test-gen.mjs [numero_di_seed]
// Controlla: determinismo (stesso seed → stesso terreno), vie valide per ogni tratto, tempi.
import { generateMountain } from '../src/generator.js';
import { MIN_ROUTES } from '../src/rules.js';

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
  const same = digest(a.terrain.H) === digest(b.terrain.H) && digest(a.terrain.M) === digest(b.terrain.M);
  const biomes = a.layout.sections.map(x => x.id).join(' > ');
  const segs = a.route.segments.map(s => `${s.ok ? '' : '✗'}${s.routes.map(r => r.kind[0]).join('')}(${s.repairs})`).join(' ');
  console.log(`${seed.padEnd(11)} ${ms}ms  L=${a.length.toFixed(0)}m H=${a.height.toFixed(0)}m  ${biomes}`);
  console.log(`            vie per tratto [s=sentiero m=misto p=parete](riparazioni): ${segs}`);
  console.log(`            props=${a.stats.props} cibo=${a.stats.food} passaggi=${a.stats.passages} deterministico=${same}  ${JSON.stringify(a.stats.timings)}`);
  if (!same || !a.stats.allOk) failures++;
}
console.log(failures ? `\n${failures} seed con problemi` : `\nTutti i seed: deterministici, almeno ${MIN_ROUTES} vie per ogni tratto.`);
process.exit(failures ? 1 : 0);
