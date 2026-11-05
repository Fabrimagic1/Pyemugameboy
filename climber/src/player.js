// ─────────────────────────────────────────────────────────────────────────────
// GIOCATORE — movimento SEGNAPOSTO
// Questo file è pensato per essere sostituito con le tue meccaniche.
// Dal mondo usa solo:
//   terrain.height(x, z)     quota del terreno
//   terrain.gradient(x, z)   pendenza [dh/dx, dh/dz] (verso dove si sale)
//   terrain.upNormal(x, z)   1 = piano, 0 = parete verticale
//   terrain.material(x, z)   materiale (ghiaccio, liane, lava…)
//   rules.js                 le stesse regole di stamina che usa il validatore
// Se cambi quanto costa arrampicarsi, cambialo in rules.js: così il generatore
// continuerà a garantire vie scalabili con il TUO movimento.
// ─────────────────────────────────────────────────────────────────────────────
import { CLIMB, MAT, MAT_INFO, STAND_UP, STEP, SEA, steepFactor } from './rules.js';
import { environmentAt } from './generator.js';

const GRAVITY = 22;
const SUBSTEP = 1 / 120;
const WALK_UP = 0.6;    // oltre questa pendenza non si cammina in salita: si scala

export class Player {
  constructor(world) {
    this.world = world;
    this.T = world.terrain;
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
    this.x = at.x; this.z = at.z; this.y = this.T.height(at.x, at.z) + 0.2;
    this.vx = this.vy = this.vz = 0;
    this.mode = 'walk';
    this.grounded = false;
    this.lunge = 0;
    this.stamina = this.maxStamina;
    this.yaw = Math.PI;   // guarda in avanti (+z)
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
    const [gx, gz] = this.T.gradient(this.x, this.z), l = Math.hypot(gx, 1, gz);
    this.nx = -gx / l; this.ny = 1 / l; this.nz = -gz / l;   // normale (per il disegno)
    this.afflictions(dt);
    this.interactions(dt);
  }

  // ── camminata / salto ───────────────────────────────────────────────────────
  walkStep(h, inp, camYaw) {
    const T = this.T;
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

    // movimento orizzontale: bloccato da pareti e pendii troppo ripidi (si scivola di lato)
    const tryMove = (nx, nz) => {
      const g = T.height(nx, nz);
      if (g > this.y + STEP) return false;
      if (g > this.y + 0.02 && T.upNormal(nx, nz) < WALK_UP) return false;
      return true;
    };
    const nx = this.x + this.vx * h, nz = this.z + this.vz * h;
    if (tryMove(nx, nz)) { this.x = nx; this.z = nz; }
    else if (tryMove(nx, this.z)) { this.x = nx; this.vz = 0; }
    else if (tryMove(this.x, nz)) { this.z = nz; this.vx = 0; }
    else { this.vx = this.vz = 0; }

    // verticale
    const wasGrounded = this.grounded, vyBefore = this.vy;
    this.y += this.vy * h;
    const g = T.height(this.x, this.z);
    this.grounded = false;
    if (this.y <= g || (wasGrounded && this.vy <= 0 && this.y - g < 0.35)) {
      this.y = g; if (this.vy < 0) this.vy = 0; this.grounded = true;   // "incolla" in discesa
    }
    // su un pendio troppo ripido si scivola giù
    if (this.grounded && T.upNormal(this.x, this.z) < 0.5) {
      const [gx, gz] = T.gradient(this.x, this.z);
      this.vx -= gx * 9 * h; this.vz -= gz * 9 * h;
    }
    if (this.grounded && !wasGrounded) this.land(-vyBefore);

    if (inp.grab && this.stamina > 0.03) this.tryGrab(camYaw);
  }

  // C'è una parete davanti (nella direzione della camera o del movimento)?
  tryGrab(camYaw) {
    const T = this.T;
    for (const yaw of [camYaw, this.yaw]) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (let d = 0.3; d <= 1.2; d += 0.15) {
        const px = this.x + fx * d, pz = this.z + fz * d;
        if (T.height(px, pz) > this.y + 0.9 && T.upNormal(px, pz) < STAND_UP) {
          // attaccati al punto della parete all'altezza attuale
          let a = 0, b = d;
          for (let k = 0; k < 10; k++) {
            const m = (a + b) / 2;
            if (T.height(this.x + fx * m, this.z + fz * m) > this.y + 0.3) b = m; else a = m;
          }
          this.x += fx * b; this.z += fz * b; this.y = T.height(this.x, this.z);
          this.mode = 'climb'; this.vx = this.vy = this.vz = 0;
          return true;
        }
      }
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

  // ── arrampicata: ci si muove SULLA superficie, lungo la pendenza ────────────
  climbStep(h, inp) {
    const T = this.T;
    if (!inp.grab || this.stamina <= 0) {
      if (this.stamina <= 0) this.say('Stamina finita!');
      return this.release(2);
    }
    if (inp.jump && this.stamina > CLIMB.lungeCost * 0.5) { this.lunge = 0.3; this.stamina -= CLIMB.lungeCost; }

    const [gx, gz] = T.gradient(this.x, this.z);
    const gl = Math.hypot(gx, gz);
    if (gl < 0.05) return this.release(0);
    const ux = gx / gl, uz = gz / gl;           // direzione (orizzontale) in cui si sale
    const rx = -uz, rz = ux;                    // destra guardando la parete
    let up = inp.fwd * CLIMB.speedUp, side = inp.right * CLIMB.speedSide, paid = true;
    if (this.lunge > 0) { up = CLIMB.lungeSpeed; this.lunge -= h; paid = false; }
    // spostamento lungo la superficie: in orizzontale si avanza di 1/√(1+g²) per metro
    const sUp = (up * h) / Math.sqrt(1 + gl * gl);
    const nx = this.x + ux * sUp + rx * side * h, nz = this.z + uz * sUp + rz * side * h;
    const ny = T.height(nx, nz);
    const dist = Math.hypot(nx - this.x, ny - this.y, nz - this.z);
    const mat = T.material(nx, nz), upN = T.upNormal(nx, nz);
    if (paid) this.stamina -= dist * CLIMB.drainPerMeter * MAT_INFO[mat].climb * steepFactor(upN);
    this.stamina -= CLIMB.idleDrain * h;
    if (mat === MAT.LAVA) { this.injury += 0.35 * h; if (this.hurtCooldown <= 0) { this.say('Lava! Ti bruci'); this.hurtCooldown = 1.5; } }
    if (ny < SEA) return this.release(0);
    this.x = nx; this.z = nz; this.y = ny;
    this.yaw = Math.atan2(-ux, -uz);            // guarda la parete
    // arrivati su terreno camminabile (cima della parete, cengia) → si torna a piedi
    if (upN >= STAND_UP && (up >= 0 || upN > 0.85)) { this.mode = 'walk'; this.vy = 0; this.lunge = 0; this.grounded = true; }
  }

  release(push) {
    const [gx, gz] = this.T.gradient(this.x, this.z), gl = Math.hypot(gx, gz) || 1;
    this.mode = 'walk';
    this.vx = (-gx / gl) * push; this.vz = (-gz / gl) * push;   // ci si stacca dalla parete
    this.vy = this.lunge > 0 ? 4 : 0;
    this.y += 0.05;
    this.lunge = 0;
    this.grounded = false;
  }

  // ── afflizioni: riducono la barra massima (come fame/freddo/ferite) ──────────
  afflictions(dt) {
    const env = environmentAt(this.world, this.x, this.z);
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
    if (this.y < SEA + 0.2 && this.T.height(this.x, this.z) < SEA) { this.say('In acqua! Si riparte'); this.respawn(); }
    const pk = this.world.peak;
    if (!this.won && Math.hypot(this.x - pk.x, this.z - pk.z) < 6 && this.y > pk.y - 2) { this.won = true; this.say('VETTA RAGGIUNTA!'); }
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
