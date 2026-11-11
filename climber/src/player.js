// ─────────────────────────────────────────────────────────────────────────────
// GIOCATORE — movimento SEGNAPOSTO su roccia 3D
// Questo file è pensato per essere sostituito con le tue meccaniche.
// Dal mondo usa solo:
//   world.sdf(x, y, z)          distanza dalla roccia (<0 dentro, >0 fuori)
//   world.normal(x, y, z, out)  normale della roccia più vicina (verso l'esterno)
//   world.materialAt(x, y, z)   materiale (ghiaccio, liane, lava…)
//   rules.js                    le stesse regole di stamina che usa il validatore
// Il corpo è fatto di due sfere (bacino e testa). Collisione = "se la sfera entra
// nella roccia, spingila fuori lungo la normale". Funziona con qualsiasi forma:
// pareti, cenge, spigoli, STRAPIOMBI e soffitti.
// ─────────────────────────────────────────────────────────────────────────────
import { CLIMB, MAT, MAT_INFO, STAND_UP, SEA, FOG, ITEMS, PITON_REST, steepFactor } from './rules.js';
import { environmentAt } from './generator.js';

const GRAVITY = 22;
const SUBSTEP = 1 / 120;
const R_BODY = 0.42, H_BODY = 0.5;     // sfera del bacino: centro a 0.5 m dai piedi
const R_HEAD = 0.32, H_HEAD = 1.45;
const WALK_UP = 0.62;                  // normale minima per stare in piedi (≈ 52°)

export class Player {
  constructor(world) {
    this.world = world;
    this.events = [];
    this.cold = 0; this.heat = 0; this.hunger = 0; this.injury = 0; this.mist = 0;
    this.fog = null;                 // impostata da main.js
    this.inventory = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.start]));
    this.pitons = [];                // chiodi piantati in parete
    this.boost = 0;                  // secondi di effetto dell'energetico
    this.marshmallow = 0;            // attesa prima del prossimo marshmallow
    this.hint = '';                  // suggerimento contestuale per l'HUD
    this.checkpoint = null;
    this.won = false;
    this.time = 0;
    this.hurtCooldown = 0;
    this.n = [0, 1, 0];              // normale della roccia sotto/davanti al giocatore
    this.gameplayProps = world.props.filter(p => p.type === 'giantMushroom' || p.type === 'cactus');
    this.respawn();
  }

  get maxStamina() { return Math.max(0, 1 - this.cold - this.heat - this.hunger - this.injury - this.mist); }

  respawn() {
    const at = this.checkpoint ? this.checkpoint.spawn : this.world.spawn;
    this.x = at.x; this.z = at.z;
    this.y = (this.world.dropTo(at.x, at.y + 3, at.z, at.y - 4) ?? at.y) + 0.1;
    this.vx = this.vy = this.vz = 0;
    this.mode = 'walk';
    this.grounded = false;
    this.lunge = 0;
    this.stamina = this.maxStamina;
    // guarda verso il monte
    this.yaw = Math.atan2(this.x, this.z);
    this.nx = 0; this.ny = 1; this.nz = 0;
  }

  say(text) { this.events.push(text); }

  update(dt, input, camYaw) {
    if (!(dt > 0)) return;
    this.time += dt;
    const n = Math.max(1, Math.ceil(dt / SUBSTEP)), h = dt / n;
    for (let k = 0; k < n; k++) {
      const inp = k === 0 ? input : { ...input, jump: false };
      if (this.mode === 'climb') this.climbStep(h, inp, camYaw); else this.walkStep(h, inp, camYaw);
    }
    this.nx = this.n[0]; this.ny = this.n[1]; this.nz = this.n[2];   // per il disegno
    this.afflictions(dt);
    this.interactions(dt);
    this.useItems(input);
    if (this.mode !== 'climb') this.onPiton = false;
  }

  // spinge fuori dalla roccia la sfera centrata a quota `hgt` sopra i piedi; ritorna la normale se toccava
  pushOut(hgt, r) {
    const W = this.world, d = W.sdf(this.x, this.y + hgt, this.z);
    if (d >= r) return null;
    const n = W.normal(this.x, this.y + hgt, this.z, [0, 0, 0]), k = r - d;
    this.x += n[0] * k; this.y += n[1] * k; this.z += n[2] * k;
    return n;
  }

  // ── camminata / salto ───────────────────────────────────────────────────────
  walkStep(h, inp, camYaw) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);  // avanti della camera
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);   // destra della camera
    let wx = fx * inp.fwd + rx * inp.right, wz = fz * inp.fwd + rz * inp.right;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const moving = wl > 0.1;
    const sprint = inp.sprint && moving && this.grounded && this.stamina > 0.05;
    const speed = sprint ? 7.2 : 4.4;
    const accel = this.grounded ? 14 : 3.5;
    this.vx += (wx * speed - this.vx) * Math.min(1, accel * h);
    this.vz += (wz * speed - this.vz) * Math.min(1, accel * h);
    this.vy -= GRAVITY * h;
    if (moving) this.yaw = Math.atan2(-wx, -wz);

    if (inp.jump && this.grounded && this.stamina > 0.05) {
      this.vy = 7.2; this.stamina -= 0.05; this.grounded = false;
    }
    if (sprint) this.stamina -= 0.1 * h;
    else if (this.grounded) this.stamina += 0.24 * h;
    this.stamina = Math.min(this.stamina, this.maxStamina);

    const wasGrounded = this.grounded, vyBefore = this.vy;
    this.x += this.vx * h; this.y += this.vy * h; this.z += this.vz * h;
    this.grounded = false;
    // "incolla" a terra in discesa: se il suolo è appena sotto, scendi con lui
    if (wasGrounded && this.vy <= 0 && this.world.sdf(this.x, this.y + H_BODY - 0.3, this.z) < R_BODY) this.y -= 0.02;

    // più passate: in un angolo tra pavimento e pendio la prima spinta può portare contro l'altro
    for (const [hgt, r] of [[H_BODY, R_BODY], [H_BODY, R_BODY], [H_BODY, R_BODY], [H_HEAD, R_HEAD]]) {
      const n = this.pushOut(hgt, r);
      if (!n) continue;
      if (hgt === H_BODY) { this.n[0] = n[0]; this.n[1] = n[1]; this.n[2] = n[2]; }
      if (n[1] >= WALK_UP && hgt === H_BODY) {            // pavimento
        this.grounded = true; if (this.vy < 0) this.vy = 0;
      } else {                                            // muro, soffitto o pendio ripido: togli la velocità contro la roccia
        const vn = this.vx * n[0] + this.vy * n[1] + this.vz * n[2];
        if (vn < 0) { this.vx -= n[0] * vn; this.vy -= n[1] * vn; this.vz -= n[2] * vn; }
      }
    }
    if (this.grounded && !wasGrounded) this.land(-vyBefore);
    if (inp.grab && this.stamina > 0.03) this.tryGrab();
  }

  // C'è roccia ripida a portata di mano (a qualsiasi altezza del corpo)?
  tryGrab() {
    const W = this.world;
    for (const hgt of [1.0, 1.45, 0.55]) {
      const d = W.sdf(this.x, this.y + hgt, this.z);
      if (d > R_BODY + 0.55) continue;
      const n = W.normal(this.x, this.y + hgt, this.z, [0, 0, 0]);
      if (n[1] >= WALK_UP) continue;
      // il punto di presa diventa il centro del corpo in arrampicata
      this.y += hgt - 0.9;
      const k = d - R_BODY;
      this.x -= n[0] * k; this.y -= n[1] * k; this.z -= n[2] * k;
      this.n = n;
      this.mode = 'climb'; this.vx = this.vy = this.vz = 0;
      return true;
    }
    return false;
  }

  land(speed) {
    if (speed > 13) {
      const dmg = (speed - 13) * 0.03;
      this.injury += dmg;
      this.say(dmg > 0.25 ? 'Brutta caduta! Ferita grave' : 'Ahi! Ferita');
    }
  }

  // ── arrampicata: il corpo (sfera a 0.9 m dai piedi) resta a contatto con la roccia ──
  climbStep(h, inp, camYaw) {
    const W = this.world, HC = 0.9;
    if (!inp.grab || this.stamina <= 0) {
      if (this.stamina <= 0) this.say('Stamina finita!');
      return this.release(2);
    }
    if (inp.jump && this.stamina > CLIMB.lungeCost * 0.5) { this.lunge = 0.3; this.stamina -= CLIMB.lungeCost; }
    const n = this.n;
    // "su" lungo la parete = la verticale proiettata sul piano tangente. Su soffitti e
    // pavimenti (dove la proiezione sparisce) si usa la direzione in cui guarda la camera.
    let ux = -n[0] * n[1], uy = 1 - n[1] * n[1], uz = -n[2] * n[1], ul = Math.hypot(ux, uy, uz);
    if (ul < 0.25) {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), fd = fx * n[0] + fz * n[2];
      ux = fx - n[0] * fd; uy = -n[1] * fd; uz = fz - n[2] * fd; ul = Math.hypot(ux, uy, uz) || 1;
    }
    ux /= ul; uy /= ul; uz /= ul;
    const rx = n[1] * uz - n[2] * uy, ry = n[2] * ux - n[0] * uz, rz = n[0] * uy - n[1] * ux;   // destra = n × su
    let up = inp.fwd * CLIMB.speedUp, side = inp.right * CLIMB.speedSide, paid = true;
    if (this.lunge > 0) { up = CLIMB.lungeSpeed; this.lunge -= h; paid = false; }
    const ox = this.x, oy = this.y, oz = this.z;
    this.x += (ux * up + rx * side) * h; this.y += (uy * up + ry * side) * h; this.z += (uz * up + rz * side) * h;
    // riporta il corpo a contatto: così si girano gli spigoli e si passa sotto gli strapiombi
    for (let k = 0; k < 2; k++) {
      const d = W.sdf(this.x, this.y + HC, this.z);
      W.normal(this.x, this.y + HC, this.z, n);
      const e = d - R_BODY;
      this.x -= n[0] * e; this.y -= n[1] * e; this.z -= n[2] * e;
    }
    const dist = Math.hypot(this.x - ox, this.y - oy, this.z - oz);
    const mat = W.materialAt(this.x, this.y + HC, this.z);
    if (paid) this.stamina -= dist * CLIMB.drainPerMeter * MAT_INFO[mat].climb * steepFactor(n[1]) * (this.boost > 0 ? 0.6 : 1);
    // appesi a un chiodo ci si riposa invece di consumare
    this.onPiton = this.pitons.some(q => Math.hypot(q.x - this.x, q.y - this.y - HC, q.z - this.z) < 1.2);
    if (this.onPiton) this.stamina = Math.min(this.maxStamina, this.stamina + PITON_REST * h);
    else this.stamina -= CLIMB.idleDrain * h * (n[1] < -0.2 ? 2 : 1);   // appesi a un soffitto ci si stanca di più
    if (mat === MAT.LAVA) { this.injury += 0.35 * h; if (this.hurtCooldown <= 0) { this.say('Lava! Ti bruci'); this.hurtCooldown = 1.5; } }
    if (this.y < SEA - 0.5) return this.release(0);
    this.yaw = Math.atan2(n[0], n[2]);            // guarda la parete
    // arrivati su una superficie camminabile (cima del macigno, cengia) → in piedi
    if (n[1] >= STAND_UP && (up >= 0 || n[1] > 0.85)) {
      this.y += HC - H_BODY;                        // i piedi tornano sotto il corpo
      this.mode = 'walk'; this.vx = this.vy = this.vz = 0; this.lunge = 0; this.grounded = true;
    }
  }

  release(push) {
    const n = this.n;
    this.mode = 'walk';
    this.vx = n[0] * push; this.vz = n[2] * push;   // ci si stacca dalla parete
    this.vy = this.lunge > 0 ? 4 : 0;
    this.lunge = 0;
    this.grounded = false;
  }

  // ── afflizioni: riducono la barra massima (come fame/freddo/ferite) ──────────
  afflictions(dt) {
    const env = environmentAt(this.world, this.y);
    this.env = env;
    const near = this.world.campfires.find(f => Math.hypot(f.pos.x - this.x, f.pos.y - this.y, f.pos.z - this.z) < 7);
    this.warm = !!near;
    const T = env.temperature;
    if (near) {
      if (this.checkpoint !== near) { this.checkpoint = near; this.say('Falò raggiunto: checkpoint salvato'); }
      this.cold = Math.max(0, this.cold - 0.06 * dt);
      this.heat = Math.max(0, this.heat - 0.06 * dt);
      this.injury = Math.max(0, this.injury - 0.01 * dt);
    } else {
      if (T < -0.2) this.cold += 0.0045 * -T * dt; else this.cold = Math.max(0, this.cold - 0.01 * dt);
      if (T > 0.4) this.heat += 0.004 * T * dt; else this.heat = Math.max(0, this.heat - 0.01 * dt);
    }
    this.hunger += 0.0011 * dt;
    // nebbia: dentro logora, fuori passa piano
    this.inFog = !!this.fog && this.fog.contains(this.y);
    if (this.inFog) this.mist += FOG.drain * dt; else this.mist = Math.max(0, this.mist - FOG.recover * dt);
    this.boost = Math.max(0, this.boost - dt);
    this.marshmallow = Math.max(0, this.marshmallow - dt);
    this.hurtCooldown -= dt;
    this.stamina = Math.min(this.stamina, this.maxStamina);
    if (this.maxStamina <= 0.02) {
      this.say('Sei svenuto… ti risvegli all\'ultimo falò');
      this.cold = this.heat = this.mist = 0; this.injury = 0.1; this.hunger = Math.min(this.hunger, 0.3);
      if (this.fog) this.fog.reset(this);
      this.respawn();
    }
    if (this.y < SEA - 0.4) { this.say('In acqua! Si riparte'); this.respawn(); }
    const pk = this.world.peak;
    if (!this.won && Math.hypot(this.x - pk.x, this.z - pk.z) < 7 && this.y > pk.y - 1.5) { this.won = true; this.say('VETTA RAGGIUNTA!'); }
  }

  // ── oggetti: F interagisce, 1 benda, 2 energetico ───────────────────────────
  useItems(inp) {
    const inv = this.inventory;
    const bag = this.world.luggage.find(l => !l.opened && Math.hypot(l.x - this.x, l.y - this.y, l.z - this.z) < 2.4);
    this.hint = bag ? 'F: apri la valigia'
      : this.warm && this.marshmallow <= 0 ? 'F: arrostisci un marshmallow'
      : this.mode === 'climb' && inv.piton > 0 && !this.onPiton ? `F: pianta un chiodo (${inv.piton})` : '';
    if (inp.interact) {
      if (bag) {
        bag.opened = true; inv[bag.item]++;
        this.say(`Valigia: ${ITEMS[bag.item].name}!`);
      } else if (this.warm && this.marshmallow <= 0) {
        this.hunger = Math.max(0, this.hunger - 0.15); this.marshmallow = 25;
        this.say('Marshmallow! −fame');
      } else if (this.mode === 'climb' && inv.piton > 0) {
        inv.piton--;
        this.pitons.push({ x: this.x - this.n[0] * 0.42, y: this.y + 0.9 - this.n[1] * 0.42, z: this.z - this.n[2] * 0.42, nx: this.n[0], ny: this.n[1], nz: this.n[2] });
        this.say('Chiodo piantato: qui ti riposi');
      }
    }
    if (inp.use1 && inv.bandage > 0 && this.injury > 0.02) {
      inv.bandage--; this.injury = Math.max(0, this.injury - 0.3); this.say('Benda: −ferite');
    }
    if (inp.use2 && inv.drink > 0) {
      inv.drink--; this.boost = 25; this.stamina = this.maxStamina; this.say('Energetico! Stamina piena');
    }
  }

  interactions(dt) {
    for (const f of this.world.food) {
      if (f.taken) continue;
      if (Math.hypot(f.x - this.x, f.y - (this.y + 0.6), f.z - this.z) < 1.3) {
        f.taken = true;
        this.hunger = Math.max(0, this.hunger - 0.3);
        this.stamina = Math.min(this.maxStamina, this.stamina + 0.3);
        this.say('Cibo! −fame');
      }
    }
    for (const p of this.gameplayProps) {
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d > 4) continue;
      if (p.type === 'giantMushroom') {
        const capTop = p.y + 3.7 * p.scale;
        if (d < 2.2 * p.scale && this.vy < -1 && this.y < capTop + 0.2 && this.y > capTop - 0.8) {
          this.vy = 16; this.y = capTop + 0.2; this.mode = 'walk';
          this.say('Boing!');
        }
      } else if (p.type === 'cactus' && d < 0.8 * p.scale && this.y < p.y + 3 * p.scale && this.hurtCooldown <= 0) {
        this.injury += 0.06; this.hurtCooldown = 1;
        this.vx = (this.x - p.x) * 6; this.vz = (this.z - p.z) * 6;
        this.say('Cactus! Punto');
      }
    }
  }
}
