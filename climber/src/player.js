// ─────────────────────────────────────────────────────────────────────────────
// GIOCATORE — movimento SEGNAPOSTO
// Questo file è pensato per essere sostituito con le tue meccaniche.
// Dal mondo usa solo:
//   surface.radius(θ, y)     raggio della parete
//   surface.upNormal(θ, y)   quanto è "pavimento" (1) o "muro" (0) / soffitto (<0)
//   surface.material(θ, y)   materiale (ghiaccio, liane, lava…)
//   rules.js                 le stesse regole di stamina che usa il validatore
// Se cambi quanto costa arrampicarsi, cambialo in rules.js: così il generatore
// continuerà a garantire montagne scalabili con il TUO movimento.
// ─────────────────────────────────────────────────────────────────────────────
import { CLIMB, MAT, MAT_INFO, overhangFactor, islandFloor } from './rules.js';
import { environmentAt } from './generator.js';

const PAD = 0.38;      // raggio del corpo
const GRAVITY = 22;
const STEP = 0.75;     // gradino massimo superabile camminando
const SUBSTEP = 1 / 120;

export class Player {
  constructor(world) {
    this.world = world;
    this.S = world.surface;
    this.events = [];
    this.cold = 0; this.heat = 0; this.hunger = 0; this.injury = 0;
    this.checkpoint = null;
    this.won = false;
    this.time = 0;
    this.hurtCooldown = 0;
    this.gameplayProps = world.props.filter(p => p.type === 'giantMushroom' || p.type === 'cactus');
    this.respawn();
  }

  get maxStamina() { return Math.max(0, 1 - this.cold - this.heat - this.hunger - this.injury); }

  respawn() {
    const at = this.checkpoint ? this.checkpoint.spawn : this.world.spawn;
    this.x = at.x; this.y = at.y + 0.3; this.z = at.z;
    this.vx = this.vy = this.vz = 0;
    this.mode = 'walk';
    this.grounded = false;
    this.lunge = 0;
    this.stamina = this.maxStamina;
    this.yaw = 0;
  }

  say(text) { this.events.push(text); }

  update(dt, input, camYaw) {
    if (!(dt > 0)) return;
    this.time += dt;
    const n = Math.max(1, Math.ceil(dt / SUBSTEP)), h = dt / n;
    for (let k = 0; k < n; k++) {
      const inp = k === 0 ? input : { ...input, jump: false };
      if (this.mode === 'climb') this.climbStep(h, inp); else this.walkStep(h, inp, camYaw);
    }
    this.afflictions(dt);
    this.interactions(dt);
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

    this.x += this.vx * h; this.y += this.vy * h; this.z += this.vz * h;
    this.collide();

    if (inp.grab && this.stamina > 0.03 && this.wallInReach()) {
      this.mode = 'climb'; this.vx = this.vy = this.vz = 0;
    }
  }

  wallInReach() {
    const th = Math.atan2(this.z, this.x), r = Math.hypot(this.x, this.z);
    const s = Math.max(this.S.radius(th, this.y + 0.6), this.S.radius(th, this.y + 1.2));
    return r - s < PAD + 0.45 && this.S.upNormal(th, this.y + 1.0) < 0.6;
  }

  // Collisione con la parete: tutto in coordinate cilindriche.
  collide() {
    const S = this.S;
    const th = Math.atan2(this.z, this.x), c = Math.cos(th), s = Math.sin(th);
    let r = Math.hypot(this.x, this.z), y = this.y;
    const wasGrounded = this.grounded;
    const vyBefore = this.vy;
    this.grounded = false;
    const killInward = () => {
      const vr = this.vx * c + this.vz * s;
      if (vr < 0) { this.vx -= vr * c; this.vz -= vr * s; }
    };

    const fy = islandFloor(r);
    if (y <= fy) { y = fy; if (this.vy < 0) this.vy = 0; this.grounded = true; }

    // piedi dentro la roccia: prima prova a salire il gradino, altrimenti è un muro
    const sF = S.radius(th, y + 0.05);
    if (r < sF + PAD) {
      let up = -1;
      if (this.vy <= 1) for (let d = 0.05; d <= STEP; d += 0.05) {
        if (S.radius(th, y + 0.05 + d) + PAD <= r) { up = d; break; }
      }
      if (up >= 0 && S.upNormal(th, y + up - 0.05) > 0.45) {
        y += up; if (this.vy < 0) this.vy = 0; this.grounded = true;
      } else { r = sF + PAD; killInward(); }
    }
    for (const hgt of [0.8, 1.5]) {
      const sb = S.radius(th, y + hgt);
      if (r < sb + PAD) { r = sb + PAD; killInward(); }
    }
    // sonda sotto i piedi: c'è un pavimento appena sotto?
    if (!this.grounded && this.vy <= 0.01) {
      const below = S.radius(th, y - 0.08);
      if (below + PAD > r && S.upNormal(th, y - 0.08) > 0.5) { this.grounded = true; this.vy = 0; }
    }

    if (this.grounded && !wasGrounded) this.land(-vyBefore);
    this.x = r * c; this.z = r * s; this.y = y;
  }

  land(speed) {
    if (speed > 13) {
      const dmg = (speed - 13) * 0.03;
      this.injury += dmg;
      this.say(dmg > 0.25 ? 'Brutta caduta! Ferita grave' : 'Ahi! Ferita');
    }
  }

  // ── arrampicata ─────────────────────────────────────────────────────────────
  climbStep(h, inp) {
    const S = this.S;
    let th = Math.atan2(this.z, this.x), r = Math.hypot(this.x, this.z), y = this.y;
    if (!inp.grab || this.stamina <= 0) {
      if (this.stamina <= 0) this.say('Stamina finita!');
      return this.release(1.5);
    }
    let vy = inp.fwd * CLIMB.speedUp, vs = inp.right * CLIMB.speedSide;
    if (inp.jump && this.stamina > CLIMB.lungeCost * 0.5) { this.lunge = 0.3; this.stamina -= CLIMB.lungeCost; }
    let paid = true;
    if (this.lunge > 0) { vy = CLIMB.lungeSpeed; this.lunge -= h; paid = false; }

    const ny = y + vy * h;
    const nth = th - (vs * h) / Math.max(r, 1);   // "destra" guardando la parete = θ decrescente
    const mat = S.material(nth, ny + 0.9);
    const dist = Math.hypot(vy * h, vs * h);
    if (paid) this.stamina -= dist * CLIMB.drainPerMeter * MAT_INFO[mat].climb * overhangFactor(S.dRdy(nth, ny + 0.9));
    this.stamina -= CLIMB.idleDrain * h;
    if (mat === MAT.LAVA) { this.injury += 0.35 * h; if (this.hurtCooldown <= 0) { this.say('Lava! Ti bruci'); this.hurtCooldown = 1.5; } }

    // scavalcare il bordo di una cengia: un po' più verso l'interno c'è roccia
    // con la cima piatta tra le ginocchia e la testa? Allora ci si tira su.
    if (vy > 0) {
      const rIn = S.radius(nth, ny + 1.4) + PAD + 0.3;
      let gh = null;
      for (let yy = ny + 1.4; yy >= ny + 0.4; yy -= 0.05) if (S.radius(nth, yy) > rIn) { gh = yy; break; }
      if (gh !== null && S.upNormal(nth, gh) > 0.55 && S.radius(nth, gh + 1.0) + PAD < rIn) {
        this.x = rIn * Math.cos(nth); this.z = rIn * Math.sin(nth); this.y = gh + 0.1;
        this.mode = 'walk'; this.vx = this.vz = 0; this.vy = 0; this.lunge = 0;
        return;
      }
    }
    const top = Math.max(S.radius(nth, ny + 0.1), S.radius(nth, ny + 0.9), S.radius(nth, ny + 1.6));
    if (top <= 0.5) return this.release(0);
    if (ny <= islandFloor(r) + 0.02 && vy < 0) return this.release(0);
    const nr = top + PAD;
    this.x = nr * Math.cos(nth); this.z = nr * Math.sin(nth); this.y = ny;
    this.yaw = Math.atan2(Math.cos(nth), Math.sin(nth));       // guarda la parete
    if (vy <= 0 && S.upNormal(nth, ny + 0.05) > 0.7) { this.mode = 'walk'; this.vy = 0; } // piedi su un pendio
  }

  release(push) {
    const th = Math.atan2(this.z, this.x);
    this.mode = 'walk';
    this.vx = Math.cos(th) * push; this.vz = Math.sin(th) * push;
    this.vy = Math.max(0, this.lunge > 0 ? 4 : 0);
    this.lunge = 0;
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
    this.hurtCooldown -= dt;
    this.stamina = Math.min(this.stamina, this.maxStamina);
    if (this.maxStamina <= 0.02) {
      this.say('Sei svenuto… ti risvegli all\'ultimo falò');
      this.cold = this.heat = 0; this.injury = 0.1; this.hunger = Math.min(this.hunger, 0.3);
      this.respawn();
    }
    if (this.y < -0.6) { this.say('In acqua! Si riparte'); this.respawn(); }
    if (!this.won && this.y > this.world.height - 3) { this.won = true; this.say('VETTA RAGGIUNTA!'); }
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
