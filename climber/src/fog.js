// ─────────────────────────────────────────────────────────────────────────────
// NEBBIA CHE SALE (logica; il disegno è in render.js)
// È la "pressione" del gioco: non puoi restare fermo troppo a lungo in una tappa.
// tappa 0 = dalla spiaggia al falò 1, tappa 1 = dal falò 1 al falò 2, …
// ─────────────────────────────────────────────────────────────────────────────
import { FOG, SEA } from './rules.js';

export class Fog {
  constructor(world) {
    this.world = world;
    this.level = SEA - 4;          // quota della superficie della nebbia
    this.stage = 0;
    this.timer = FOG.delay;
    this.rising = false;
    this.events = [];
  }

  // quota a cui la nebbia si ferma in questa tappa: appena sotto il prossimo falò
  get target() {
    const f = this.world.campfires[this.stage];
    return f ? f.y - FOG.margin : this.world.peak.y - 6;
  }

  update(dt, player) {
    const reached = player.checkpoint ? player.checkpoint.index + 1 : 0;
    if (reached > this.stage) {                 // nuovo falò acceso: nuova tappa, nuova attesa
      this.stage = reached; this.timer = FOG.delay; this.rising = false;
    }
    if (this.timer > 0) { this.timer -= dt; return; }
    if (!this.rising && this.level < this.target - 0.5) { this.rising = true; this.events.push('La nebbia sta salendo!'); }
    this.level = Math.min(this.target, this.level + FOG.speed * dt);
    if (this.level >= this.target) this.rising = false;
  }

  contains(y) { return y + 1.0 < this.level; }

  // dopo uno svenimento: la nebbia torna sotto l'ultimo falò e aspetta di nuovo
  reset(player) {
    const base = player.checkpoint ? player.checkpoint.y : SEA;
    this.level = Math.min(this.level, base - 8);
    this.timer = FOG.delay; this.rising = false;
  }
}
