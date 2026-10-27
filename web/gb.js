// Core dell'emulatore Game Boy (DMG) in JavaScript per la versione web.
// È un port dei moduli Python (cpu.py, memory.py, timer.py, gpu.py) con in più
// un'APU completa a 4 canali. Gira a piena velocità nel browser.
"use strict";

const CLOCK_HZ = 4194304;
const CYCLES_PER_FRAME = 70224;

// Valori dei registri IO dopo la boot ROM del DMG
const IO_DEFAULTS = {
  0xFF00: 0xCF, 0xFF0F: 0xE1, 0xFF10: 0x80, 0xFF11: 0xBF, 0xFF12: 0xF3,
  0xFF14: 0xBF, 0xFF16: 0x3F, 0xFF19: 0xBF, 0xFF1A: 0x7F, 0xFF1B: 0xFF,
  0xFF1C: 0x9F, 0xFF1E: 0xBF, 0xFF20: 0xFF, 0xFF23: 0xBF, 0xFF24: 0x77,
  0xFF25: 0xF3, 0xFF26: 0xF1, 0xFF40: 0x91, 0xFF41: 0x85, 0xFF47: 0xFC,
  0xFF48: 0xFF, 0xFF49: 0xFF,
};

// ---------------------------------------------------------------------------
// Memoria e cartridge (ROM-only, MBC1, MBC3 senza RTC, MBC5)
// ---------------------------------------------------------------------------
class Memory {
  constructor(romBytes) {
    if (romBytes.length < 0x150) throw new Error("File ROM troppo piccolo o non valido");
    const size = Math.ceil(romBytes.length / 0x4000) * 0x4000;
    this.rom = new Uint8Array(Math.max(size, 0x8000)).fill(0xFF);
    this.rom.set(romBytes);
    this.romBanks = this.rom.length / 0x4000;

    const type = this.rom[0x147];
    if (type === 0x00 || type === 0x08 || type === 0x09) this.mbc = 0;
    else if (type >= 0x01 && type <= 0x03) this.mbc = 1;
    else if (type >= 0x0F && type <= 0x13) this.mbc = 3;
    else if (type >= 0x19 && type <= 0x1E) this.mbc = 5;
    else {
      console.warn(`Tipo di cartridge 0x${type.toString(16)} non supportato, uso MBC1`);
      this.mbc = 1;
    }
    const ramMap = { 0: 0, 1: 1, 2: 1, 3: 4, 4: 16, 5: 8 };
    this.ramBankCount = ramMap[this.rom[0x149]] || 0;
    if (this.mbc === 0 && this.ramBankCount === 0 && (type === 0x08 || type === 0x09)) this.ramBankCount = 1;
    this.eram = new Uint8Array(this.ramBankCount * 0x2000).fill(0xFF);

    this.ramEnabled = false;
    this.romLow = 1;
    this.romHigh = 0;
    this.bankMode = 0;
    this.ramBank = 0;
    this.romOffset = 0x4000;

    this.mem = new Uint8Array(0x10000);
    for (const [addr, val] of Object.entries(IO_DEFAULTS)) this.mem[addr] = val;
    this.joyButtons = 0x0F;
    this.joyDirs = 0x0F;
    this.timer = null;
    this.apu = null;
    this.serial = [];
    this.updateRomOffset();
  }

  title() {
    let s = "";
    for (let i = 0x134; i < 0x144; i++) {
      const c = this.rom[i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  updateRomOffset() {
    let bank;
    if (this.mbc === 1) bank = (this.romLow & 0x1F) | (this.romHigh << 5);
    else if (this.mbc === 3) bank = this.romLow & 0x7F;
    else if (this.mbc === 5) bank = this.romLow | (this.romHigh << 8);
    else bank = 1;
    this.romOffset = (bank % this.romBanks) * 0x4000;
  }

  ramAccessible() {
    if (!this.ramEnabled || this.ramBankCount === 0) return false;
    return !(this.mbc === 3 && this.ramBank > 3);  // registri RTC non emulati
  }

  ramIndex(addr) {
    const bank = this.mbc === 1 ? (this.bankMode ? this.romHigh : 0) : this.ramBank;
    return (bank % this.ramBankCount) * 0x2000 + (addr - 0xA000);
  }

  writeMbc(addr, v) {
    if (this.mbc === 0) return;
    if (addr < 0x2000) {
      this.ramEnabled = (v & 0x0F) === 0x0A;
    } else if (addr < 0x4000) {
      if (this.mbc === 1) this.romLow = (v & 0x1F) || 1;
      else if (this.mbc === 3) this.romLow = (v & 0x7F) || 1;
      else if (addr < 0x3000) this.romLow = v;
      else this.romHigh = v & 0x01;
      this.updateRomOffset();
    } else if (addr < 0x6000) {
      if (this.mbc === 1) {
        this.romHigh = v & 0x03;
        this.updateRomOffset();
      } else {
        this.ramBank = v & 0x0F;
      }
    } else if (this.mbc === 1) {
      this.bankMode = v & 0x01;
    }
  }

  read(a) {
    if (a < 0x4000) {
      if (this.mbc === 1 && this.bankMode) {
        return this.rom[((this.romHigh << 5) % this.romBanks) * 0x4000 + a];
      }
      return this.rom[a];
    }
    if (a < 0x8000) return this.rom[this.romOffset + a - 0x4000];
    if (a < 0xA000) return this.mem[a];
    if (a < 0xC000) return this.ramAccessible() ? this.eram[this.ramIndex(a)] : 0xFF;
    if (a < 0xE000) return this.mem[a];
    if (a < 0xFE00) return this.mem[a - 0x2000];
    if (a < 0xFF00) return a < 0xFEA0 ? this.mem[a] : 0xFF;
    if (a === 0xFF00) {
      const sel = this.mem[0xFF00] & 0x30;
      let res = 0x0F;
      if (!(sel & 0x10)) res &= this.joyDirs;
      if (!(sel & 0x20)) res &= this.joyButtons;
      return 0xC0 | sel | res;
    }
    if (a === 0xFF0F) return this.mem[a] | 0xE0;
    if (a === 0xFF41) return this.mem[a] | 0x80;
    if (a >= 0xFF10 && a < 0xFF40 && this.apu) return this.apu.read(a);
    return this.mem[a];
  }

  write(a, v) {
    v &= 0xFF;
    if (a < 0x8000) this.writeMbc(a, v);
    else if (a < 0xA000) this.mem[a] = v;
    else if (a < 0xC000) { if (this.ramAccessible()) this.eram[this.ramIndex(a)] = v; }
    else if (a < 0xE000) this.mem[a] = v;
    else if (a < 0xFE00) this.mem[a - 0x2000] = v;
    else if (a < 0xFF00) { if (a < 0xFEA0) this.mem[a] = v; }
    else if (a === 0xFF00) this.mem[a] = v & 0x30;
    else if (a === 0xFF02) {
      this.mem[a] = v;
      if ((v & 0x81) === 0x81) {
        this.serial.push(String.fromCharCode(this.mem[0xFF01]));
        this.mem[0xFF01] = 0xFF;
        this.mem[0xFF02] = v & 0x7F;
        this.mem[0xFF0F] |= 0x08;
      }
    } else if (a === 0xFF04) {
      this.mem[a] = 0;
      if (this.timer) this.timer.resetDiv();
    } else if (a >= 0xFF10 && a < 0xFF40) {
      if (this.apu) this.apu.write(a, v);
      else this.mem[a] = v;
    } else if (a === 0xFF41) {
      this.mem[a] = (this.mem[a] & 0x07) | (v & 0x78);
    } else if (a === 0xFF44) {
      // LY è di sola lettura
    } else if (a === 0xFF46) {
      this.mem[a] = v;
      const src = v << 8;
      for (let i = 0; i < 0xA0; i++) this.mem[0xFE00 + i] = this.read(src + i);
    } else {
      this.mem[a] = v;
    }
  }

  setJoypad(group, bit, pressed) {
    const mask = 1 << bit;
    const old = group === 0 ? this.joyButtons : this.joyDirs;
    const val = pressed ? old & ~mask : old | mask;
    if (group === 0) this.joyButtons = val;
    else this.joyDirs = val;
    if (pressed && (old & mask)) this.mem[0xFF0F] |= 0x10;
  }
}

// ---------------------------------------------------------------------------
// CPU Sharp LR35902 (SM83)
// ---------------------------------------------------------------------------
class CPU {
  constructor(m) {
    this.m = m;
    // B C D E H L - A  (indice 6 = (HL), non usato)
    this.r = new Uint8Array([0x00, 0x13, 0x00, 0xD8, 0x01, 0x4D, 0x00, 0x01]);
    this.f = 0xB0;
    this.sp = 0xFFFE;
    this.pc = 0x0100;
    this.ime = false;
    this.imePending = false;
    this.halted = false;
    this.build();
  }

  hl() { return (this.r[4] << 8) | this.r[5]; }
  setHL(v) { this.r[4] = v >> 8; this.r[5] = v; }
  getRR(i) { return i === 3 ? this.sp : (this.r[i * 2] << 8) | this.r[i * 2 + 1]; }
  setRR(i, v) {
    v &= 0xFFFF;
    if (i === 3) this.sp = v;
    else { this.r[i * 2] = v >> 8; this.r[i * 2 + 1] = v; }
  }
  get8(i) { return i === 6 ? this.m.read(this.hl()) : this.r[i]; }
  set8(i, v) { if (i === 6) this.m.write(this.hl(), v & 0xFF); else this.r[i] = v; }
  cond(cc) {
    switch (cc) {
      case 0: return !(this.f & 0x80);
      case 1: return (this.f & 0x80) !== 0;
      case 2: return !(this.f & 0x10);
      default: return (this.f & 0x10) !== 0;
    }
  }
  fetch() { const v = this.m.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }
  fetchS() { const v = this.fetch(); return v < 128 ? v : v - 256; }
  push(v) {
    this.sp = (this.sp - 1) & 0xFFFF; this.m.write(this.sp, v >> 8);
    this.sp = (this.sp - 1) & 0xFFFF; this.m.write(this.sp, v & 0xFF);
  }
  pop() {
    const lo = this.m.read(this.sp); this.sp = (this.sp + 1) & 0xFFFF;
    const hi = this.m.read(this.sp); this.sp = (this.sp + 1) & 0xFFFF;
    return (hi << 8) | lo;
  }

  interrupts() {
    const mm = this.m.mem;
    const pending = mm[0xFF0F] & mm[0xFFFF] & 0x1F;
    if (!pending) return 0;
    this.halted = false;  // un interrupt in attesa risveglia da HALT anche con IME=0
    if (!this.ime) return 0;
    this.ime = false;
    for (let i = 0; i < 5; i++) {
      if (pending & (1 << i)) {
        mm[0xFF0F] &= ~(1 << i);
        this.push(this.pc);
        this.pc = 0x40 + i * 8;
        return 20;
      }
    }
    return 0;
  }

  step() {
    const c = this.interrupts();
    if (c) return c;
    if (this.halted) return 4;
    const enableIme = this.imePending;
    const cycles = this.ops[this.fetch()]();
    // EI ha effetto dopo l'istruzione successiva (a meno di un DI nel mezzo)
    if (enableIme && this.imePending) { this.ime = true; this.imePending = false; }
    return cycles;
  }

  alu(op, v) {
    const a = this.r[7];
    let res, c;
    switch (op) {
      case 0: // ADD
        res = a + v;
        this.f = ((res & 0xFF) === 0 ? 0x80 : 0) | ((a & 0xF) + (v & 0xF) > 0xF ? 0x20 : 0) | (res > 0xFF ? 0x10 : 0);
        break;
      case 1: // ADC
        c = (this.f >> 4) & 1;
        res = a + v + c;
        this.f = ((res & 0xFF) === 0 ? 0x80 : 0) | ((a & 0xF) + (v & 0xF) + c > 0xF ? 0x20 : 0) | (res > 0xFF ? 0x10 : 0);
        break;
      case 2: case 7: // SUB / CP
        res = a - v;
        this.f = 0x40 | ((res & 0xFF) === 0 ? 0x80 : 0) | ((a & 0xF) < (v & 0xF) ? 0x20 : 0) | (res < 0 ? 0x10 : 0);
        if (op === 7) return;
        break;
      case 3: // SBC
        c = (this.f >> 4) & 1;
        res = a - v - c;
        this.f = 0x40 | ((res & 0xFF) === 0 ? 0x80 : 0) | ((a & 0xF) < (v & 0xF) + c ? 0x20 : 0) | (res < 0 ? 0x10 : 0);
        break;
      case 4: res = a & v; this.f = (res === 0 ? 0x80 : 0) | 0x20; break;
      case 5: res = a ^ v; this.f = res === 0 ? 0x80 : 0; break;
      default: res = a | v; this.f = res === 0 ? 0x80 : 0; break;
    }
    this.r[7] = res;
  }

  cbShift(op, v) {
    const c = this.f & 0x10;
    let res, carry;
    switch (op) {
      case 0: carry = v >> 7; res = ((v << 1) | carry) & 0xFF; break;          // RLC
      case 1: carry = v & 1; res = (v >> 1) | (carry << 7); break;             // RRC
      case 2: carry = v >> 7; res = ((v << 1) | (c ? 1 : 0)) & 0xFF; break;    // RL
      case 3: carry = v & 1; res = (v >> 1) | (c ? 0x80 : 0); break;           // RR
      case 4: carry = v >> 7; res = (v << 1) & 0xFF; break;                    // SLA
      case 5: carry = v & 1; res = (v >> 1) | (v & 0x80); break;               // SRA
      case 6: carry = 0; res = ((v << 4) | (v >> 4)) & 0xFF; break;            // SWAP
      default: carry = v & 1; res = v >> 1; break;                             // SRL
    }
    this.f = (res === 0 ? 0x80 : 0) | (carry ? 0x10 : 0);
    return res;
  }

  addSpSigned() {
    const e = this.fetchS();
    const sp = this.sp;
    this.f = ((sp & 0xF) + (e & 0xF) > 0xF ? 0x20 : 0) | ((sp & 0xFF) + (e & 0xFF) > 0xFF ? 0x10 : 0);
    return (sp + e) & 0xFFFF;
  }

  build() {
    const ops = new Array(256);
    const cb = new Array(256);
    const m = this.m;
    const r = this.r;

    // Opcode illegale: la CPU reale si blocca, restiamo sullo stesso indirizzo
    for (let i = 0; i < 256; i++) ops[i] = () => { this.pc = (this.pc - 1) & 0xFFFF; return 4; };

    ops[0x00] = () => 4;
    ops[0x10] = () => { this.fetch(); return 4; };  // STOP

    for (let rr = 0; rr < 4; rr++) {
      ops[0x01 + rr * 16] = () => { this.setRR(rr, this.fetch16()); return 12; };
      ops[0x03 + rr * 16] = () => { this.setRR(rr, this.getRR(rr) + 1); return 8; };
      ops[0x0B + rr * 16] = () => { this.setRR(rr, this.getRR(rr) - 1); return 8; };
      ops[0x09 + rr * 16] = () => {
        const hl = this.hl(), v = this.getRR(rr), res = hl + v;
        this.f = (this.f & 0x80) | ((hl & 0xFFF) + (v & 0xFFF) > 0xFFF ? 0x20 : 0) | (res > 0xFFFF ? 0x10 : 0);
        this.setHL(res & 0xFFFF);
        return 8;
      };
    }

    // LD (rr),A / LD A,(rr) con BC, DE, HL+, HL-
    const indAddr = (k) => {
      if (k < 2) return this.getRR(k);
      const hl = this.hl();
      this.setHL((k === 2 ? hl + 1 : hl - 1) & 0xFFFF);
      return hl;
    };
    for (let k = 0; k < 4; k++) {
      ops[0x02 + k * 16] = () => { m.write(indAddr(k), r[7]); return 8; };
      ops[0x0A + k * 16] = () => { r[7] = m.read(indAddr(k)); return 8; };
    }

    ops[0x08] = () => {
      const a = this.fetch16();
      m.write(a, this.sp & 0xFF);
      m.write((a + 1) & 0xFFFF, this.sp >> 8);
      return 20;
    };

    for (let i = 0; i < 8; i++) {
      ops[0x04 + i * 8] = () => {
        const v = this.get8(i), res = (v + 1) & 0xFF;
        this.f = (this.f & 0x10) | (res === 0 ? 0x80 : 0) | ((v & 0xF) === 0xF ? 0x20 : 0);
        this.set8(i, res);
        return i === 6 ? 12 : 4;
      };
      ops[0x05 + i * 8] = () => {
        const v = this.get8(i), res = (v - 1) & 0xFF;
        this.f = (this.f & 0x10) | 0x40 | (res === 0 ? 0x80 : 0) | ((v & 0xF) === 0 ? 0x20 : 0);
        this.set8(i, res);
        return i === 6 ? 12 : 4;
      };
      ops[0x06 + i * 8] = () => { this.set8(i, this.fetch()); return i === 6 ? 12 : 8; };
    }

    ops[0x07] = () => { const a = r[7], c = a >> 7; r[7] = (a << 1) | c; this.f = c ? 0x10 : 0; return 4; };       // RLCA
    ops[0x0F] = () => { const a = r[7], c = a & 1; r[7] = (a >> 1) | (c << 7); this.f = c ? 0x10 : 0; return 4; };  // RRCA
    ops[0x17] = () => {                                                                                              // RLA
      const a = r[7], c = a >> 7;
      r[7] = (a << 1) | (this.f & 0x10 ? 1 : 0);
      this.f = c ? 0x10 : 0;
      return 4;
    };
    ops[0x1F] = () => {                                                                                              // RRA
      const a = r[7], c = a & 1;
      r[7] = (a >> 1) | (this.f & 0x10 ? 0x80 : 0);
      this.f = c ? 0x10 : 0;
      return 4;
    };
    ops[0x27] = () => {                                                                                              // DAA
      let a = r[7], f = this.f;
      if (!(f & 0x40)) {
        if ((f & 0x10) || a > 0x99) { a += 0x60; f |= 0x10; }
        if ((f & 0x20) || (a & 0x0F) > 0x09) a += 0x06;
      } else {
        if (f & 0x10) a -= 0x60;
        if (f & 0x20) a -= 0x06;
      }
      a &= 0xFF;
      r[7] = a;
      this.f = (f & 0x50) | (a === 0 ? 0x80 : 0);
      return 4;
    };
    ops[0x2F] = () => { r[7] ^= 0xFF; this.f |= 0x60; return 4; };                                   // CPL
    ops[0x37] = () => { this.f = (this.f & 0x80) | 0x10; return 4; };                                  // SCF
    ops[0x3F] = () => { this.f = (this.f & 0x80) | ((this.f ^ 0x10) & 0x10); return 4; };             // CCF

    ops[0x18] = () => { const e = this.fetchS(); this.pc = (this.pc + e) & 0xFFFF; return 12; };
    for (let cc = 0; cc < 4; cc++) {
      ops[0x20 + cc * 8] = () => {
        const e = this.fetchS();
        if (this.cond(cc)) { this.pc = (this.pc + e) & 0xFFFF; return 12; }
        return 8;
      };
    }

    // LD r,r'
    for (let dst = 0; dst < 8; dst++) {
      for (let src = 0; src < 8; src++) {
        const opc = 0x40 + dst * 8 + src;
        if (opc === 0x76) continue;
        if (dst === 6 || src === 6) ops[opc] = () => { this.set8(dst, this.get8(src)); return 8; };
        else ops[opc] = () => { r[dst] = r[src]; return 4; };
      }
    }
    ops[0x76] = () => { this.halted = true; return 4; };

    // ALU A,r / ALU A,n
    for (let op = 0; op < 8; op++) {
      for (let src = 0; src < 8; src++) {
        ops[0x80 + op * 8 + src] = () => { this.alu(op, this.get8(src)); return src === 6 ? 8 : 4; };
      }
      ops[0xC6 + op * 8] = () => { this.alu(op, this.fetch()); return 8; };
    }

    for (let cc = 0; cc < 4; cc++) {
      ops[0xC0 + cc * 8] = () => {
        if (this.cond(cc)) { this.pc = this.pop(); return 20; }
        return 8;
      };
      ops[0xC2 + cc * 8] = () => {
        const a = this.fetch16();
        if (this.cond(cc)) { this.pc = a; return 16; }
        return 12;
      };
      ops[0xC4 + cc * 8] = () => {
        const a = this.fetch16();
        if (this.cond(cc)) { this.push(this.pc); this.pc = a; return 24; }
        return 12;
      };
    }

    for (let k = 0; k < 4; k++) {
      ops[0xC1 + k * 16] = () => {
        const v = this.pop();
        if (k === 3) { r[7] = v >> 8; this.f = v & 0xF0; }
        else this.setRR(k, v);
        return 12;
      };
      ops[0xC5 + k * 16] = () => {
        this.push(k === 3 ? (r[7] << 8) | this.f : this.getRR(k));
        return 16;
      };
    }

    for (let n = 0; n < 8; n++) ops[0xC7 + n * 8] = () => { this.push(this.pc); this.pc = n * 8; return 16; };

    ops[0xC3] = () => { this.pc = this.fetch16(); return 16; };
    ops[0xE9] = () => { this.pc = this.hl(); return 4; };
    ops[0xCD] = () => { const a = this.fetch16(); this.push(this.pc); this.pc = a; return 24; };
    ops[0xC9] = () => { this.pc = this.pop(); return 16; };
    ops[0xD9] = () => { this.pc = this.pop(); this.ime = true; return 16; };
    ops[0xE0] = () => { m.write(0xFF00 | this.fetch(), r[7]); return 12; };
    ops[0xF0] = () => { r[7] = m.read(0xFF00 | this.fetch()); return 12; };
    ops[0xE2] = () => { m.write(0xFF00 | r[1], r[7]); return 8; };
    ops[0xF2] = () => { r[7] = m.read(0xFF00 | r[1]); return 8; };
    ops[0xEA] = () => { m.write(this.fetch16(), r[7]); return 16; };
    ops[0xFA] = () => { r[7] = m.read(this.fetch16()); return 16; };
    ops[0xE8] = () => { this.sp = this.addSpSigned(); return 16; };
    ops[0xF8] = () => { this.setHL(this.addSpSigned()); return 12; };
    ops[0xF9] = () => { this.sp = this.hl(); return 8; };
    ops[0xF3] = () => { this.ime = false; this.imePending = false; return 4; };
    ops[0xFB] = () => { this.imePending = true; return 4; };
    ops[0xCB] = () => cb[this.fetch()]();

    for (let opc = 0; opc < 256; opc++) {
      const reg = opc & 7, y = (opc >> 3) & 7, group = opc >> 6;
      if (group === 0) {
        cb[opc] = () => { this.set8(reg, this.cbShift(y, this.get8(reg))); return reg === 6 ? 16 : 8; };
      } else if (group === 1) {
        cb[opc] = () => {
          const v = this.get8(reg);
          this.f = (this.f & 0x10) | 0x20 | (v & (1 << y) ? 0 : 0x80);
          return reg === 6 ? 12 : 8;
        };
      } else if (group === 2) {
        cb[opc] = () => { this.set8(reg, this.get8(reg) & ~(1 << y)); return reg === 6 ? 16 : 8; };
      } else {
        cb[opc] = () => { this.set8(reg, this.get8(reg) | (1 << y)); return reg === 6 ? 16 : 8; };
      }
    }
    this.ops = ops;
  }
}

// ---------------------------------------------------------------------------
// Timer DIV/TIMA
// ---------------------------------------------------------------------------
class Timer {
  constructor(m) {
    this.m = m;
    this.div = 0;
    this.tima = 0;
    m.timer = this;
  }
  resetDiv() { this.div = 0; this.tima = 0; }
  tick(cycles) {
    const mm = this.m.mem;
    this.div += cycles;
    while (this.div >= 256) {
      this.div -= 256;
      mm[0xFF04] = (mm[0xFF04] + 1) & 0xFF;
    }
    const tac = mm[0xFF07];
    if (tac & 0x04) {
      const period = [1024, 16, 64, 256][tac & 3];
      this.tima += cycles;
      while (this.tima >= period) {
        this.tima -= period;
        let t = mm[0xFF05] + 1;
        if (t > 0xFF) { t = mm[0xFF06]; mm[0xFF0F] |= 0x04; }
        mm[0xFF05] = t;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PPU
// ---------------------------------------------------------------------------
// Colori in formato ABGR (little endian) per Uint32Array su ImageData
const SHADES = [0xFFD0F8E0, 0xFF70C088, 0xFF566834, 0xFF201808];

class PPU {
  constructor(m) {
    this.m = m;
    this.mode = 2;
    this.clock = 0;
    this.line = 0;
    this.winLine = 0;
    this.statLine = false;
    this.lcdWasOn = true;
    this.work = new Uint32Array(160 * 144);
    this.display = new Uint32Array(160 * 144).fill(SHADES[0]);
    this.frameCount = 0;
    this.bg = new Uint8Array(160);
  }

  setLY(ly) { this.line = ly; this.m.mem[0xFF44] = ly; }
  setMode(mode) { this.mode = mode; const mm = this.m.mem; mm[0xFF41] = (mm[0xFF41] & 0xFC) | mode; }

  updateStat() {
    const mm = this.m.mem;
    let stat = mm[0xFF41];
    if (this.line === mm[0xFF45]) stat |= 0x04; else stat &= ~0x04;
    mm[0xFF41] = stat;
    const line = ((stat & 0x40) && (stat & 0x04)) || ((stat & 0x08) && this.mode === 0)
      || ((stat & 0x10) && this.mode === 1) || ((stat & 0x20) && this.mode === 2);
    if (line && !this.statLine) mm[0xFF0F] |= 0x02;
    this.statLine = !!line;
  }

  tick(cycles) {
    const mm = this.m.mem;
    if (!(mm[0xFF40] & 0x80)) {
      if (this.lcdWasOn) {
        this.lcdWasOn = false;
        this.clock = 0;
        this.setLY(0);
        this.setMode(0);
        this.statLine = false;
        this.display.fill(SHADES[0]);
        this.frameCount++;
      }
      return;
    }
    if (!this.lcdWasOn) {
      this.lcdWasOn = true;
      this.clock = 0;
      this.winLine = 0;
      this.setMode(2);
      this.updateStat();
    }
    this.clock += cycles;
    for (;;) {
      if (this.mode === 2) {
        if (this.clock < 80) break;
        this.clock -= 80;
        this.setMode(3);
      } else if (this.mode === 3) {
        if (this.clock < 172) break;
        this.clock -= 172;
        this.drawScanline();
        this.setMode(0);
        this.updateStat();
      } else if (this.mode === 0) {
        if (this.clock < 204) break;
        this.clock -= 204;
        this.setLY(this.line + 1);
        if (this.line === 144) {
          this.setMode(1);
          mm[0xFF0F] |= 0x01;
          this.display.set(this.work);
          this.frameCount++;
        } else {
          this.setMode(2);
        }
        this.updateStat();
      } else {
        if (this.clock < 456) break;
        this.clock -= 456;
        if (this.line >= 153) {
          this.setLY(0);
          this.winLine = 0;
          this.setMode(2);
        } else {
          this.setLY(this.line + 1);
        }
        this.updateStat();
      }
    }
  }

  tilePixel(map, px, py, signed) {
    const mm = this.m.mem;
    const id = mm[map + ((py >> 3) & 31) * 32 + ((px >> 3) & 31)];
    const addr = (signed ? 0x9000 + ((id << 24) >> 24) * 16 : 0x8000 + id * 16) + (py & 7) * 2;
    const bit = 7 - (px & 7);
    return ((mm[addr] >> bit) & 1) | (((mm[addr + 1] >> bit) & 1) << 1);
  }

  drawScanline() {
    const mm = this.m.mem;
    const ly = this.line;
    if (ly >= 144) return;
    const lcdc = mm[0xFF40];
    const signed = !(lcdc & 0x10);
    const bg = this.bg;
    bg.fill(0);
    if (lcdc & 0x01) {
      const scy = mm[0xFF42], scx = mm[0xFF43];
      const map = lcdc & 0x08 ? 0x9C00 : 0x9800;
      const y = (ly + scy) & 0xFF;
      for (let x = 0; x < 160; x++) bg[x] = this.tilePixel(map, (x + scx) & 0xFF, y, signed);
      const wy = mm[0xFF4A], wx = mm[0xFF4B] - 7;
      if ((lcdc & 0x20) && ly >= wy && wx < 160) {
        const wmap = lcdc & 0x40 ? 0x9C00 : 0x9800;
        for (let x = Math.max(wx, 0); x < 160; x++) bg[x] = this.tilePixel(wmap, x - wx, this.winLine, signed);
        this.winLine++;
      }
    }
    const out = this.work;
    const base = ly * 160;
    const bgp = mm[0xFF47];
    for (let x = 0; x < 160; x++) out[base + x] = SHADES[(bgp >> (bg[x] * 2)) & 3];
    if (lcdc & 0x02) this.drawSprites(ly, lcdc, base);
  }

  drawSprites(ly, lcdc, base) {
    const mm = this.m.mem;
    const height = lcdc & 0x04 ? 16 : 8;
    const sprites = [];
    for (let i = 0xFE00; i < 0xFEA0 && sprites.length < 10; i += 4) {
      const sy = mm[i] - 16;
      if (sy <= ly && ly < sy + height) sprites.push(i);
    }
    // Priorità DMG: X minore vince, a parità indice OAM minore. Disegna dal meno prioritario.
    sprites.sort((a, b) => (mm[b + 1] - mm[a + 1]) || (b - a));
    for (const i of sprites) {
      const sy = mm[i] - 16, sx = mm[i + 1] - 8, attr = mm[i + 3];
      let tile = mm[i + 2];
      let row = ly - sy;
      if (attr & 0x40) row = height - 1 - row;
      if (height === 16) tile &= 0xFE;
      const addr = 0x8000 + tile * 16 + row * 2;
      const lo = mm[addr], hi = mm[addr + 1];
      const pal = mm[attr & 0x10 ? 0xFF49 : 0xFF48];
      for (let col = 0; col < 8; col++) {
        const x = sx + col;
        if (x < 0 || x >= 160) continue;
        const bit = attr & 0x20 ? col : 7 - col;
        const cn = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
        if (cn === 0) continue;
        if ((attr & 0x80) && this.bg[x] !== 0) continue;
        this.work[base + x] = SHADES[(pal >> (cn * 2)) & 3];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// APU: 2 onde quadre (la prima con sweep), onda programmabile, rumore
// ---------------------------------------------------------------------------
const DUTY = [
  [0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 0],
];
// Bit sempre a 1 in lettura per FF10-FF2F
const APU_READ_MASK = [
  0x80, 0x3F, 0x00, 0xFF, 0xBF, 0xFF, 0x3F, 0x00, 0xFF, 0xBF,
  0x7F, 0xFF, 0x9F, 0xFF, 0xBF, 0xFF, 0xFF, 0x00, 0x00, 0xBF,
  0x00, 0x00, 0x70, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
];
const NOISE_DIVISORS = [8, 16, 32, 48, 64, 80, 96, 112];

function newChannel() {
  return {
    enabled: false, dac: false, length: 0, lengthEn: false,
    vol: 0, envUp: false, envPeriod: 0, envTimer: 0,
    freq: 0, timer: 0, pos: 0, duty: 0,
  };
}

class APU {
  constructor(m, sampleRate, onSamples) {
    this.m = m;
    this.mm = m.mem;
    this.sampleRate = sampleRate || 48000;
    this.onSamples = onSamples || null;
    this.power = true;
    this.sq1 = newChannel();
    this.sq2 = newChannel();
    this.wave = newChannel();
    this.noise = newChannel();
    this.wave.volShift = 4;
    this.wave.sample = 0;
    this.noise.lfsr = 0x7FFF;
    this.noise.period = 8;
    this.sweepTimer = 0;
    this.sweepEn = false;
    this.shadow = 0;
    this.seqCounter = 0;
    this.seqStep = 0;
    this.sampleAcc = 0;
    this.chunk = 1024;
    this.buffer = new Float32Array(this.chunk * 2);
    this.bufPos = 0;
    this.capL = 0;
    this.capR = 0;
    this.hpCharge = Math.pow(0.999958, CLOCK_HZ / this.sampleRate);
    m.apu = this;
    // Ricava lo stato interno dai valori iniziali dei registri
    for (let a = 0xFF10; a <= 0xFF25; a++) {
      if (a !== 0xFF14 && a !== 0xFF19 && a !== 0xFF1E && a !== 0xFF23) this.write(a, this.mm[a]);
    }
  }

  read(a) {
    if (a === 0xFF26) {
      return (this.power ? 0x80 : 0) | 0x70 | (this.sq1.enabled ? 1 : 0) | (this.sq2.enabled ? 2 : 0)
        | (this.wave.enabled ? 4 : 0) | (this.noise.enabled ? 8 : 0);
    }
    if (a < 0xFF30) return this.mm[a] | APU_READ_MASK[a - 0xFF10];
    return this.mm[a];
  }

  write(a, v) {
    const mm = this.mm;
    if (a === 0xFF26) {
      const on = (v & 0x80) !== 0;
      if (!on && this.power) {
        for (let i = 0xFF10; i <= 0xFF25; i++) mm[i] = 0;
        for (const ch of [this.sq1, this.sq2, this.wave, this.noise]) {
          ch.enabled = false; ch.dac = false; ch.lengthEn = false;
        }
      } else if (on && !this.power) {
        this.seqStep = 0;
        this.sq1.duty = this.sq2.duty = 0;
      }
      this.power = on;
      mm[0xFF26] = v & 0x80;
      return;
    }
    if (a >= 0xFF30) { mm[a] = v; return; }  // wave RAM
    if (!this.power) return;
    mm[a] = v;
    switch (a) {
      case 0xFF11: case 0xFF16: {
        const ch = a === 0xFF11 ? this.sq1 : this.sq2;
        ch.duty = v >> 6;
        ch.length = 64 - (v & 0x3F);
        break;
      }
      case 0xFF12: case 0xFF17: case 0xFF21: {
        const ch = a === 0xFF12 ? this.sq1 : a === 0xFF17 ? this.sq2 : this.noise;
        ch.dac = (v & 0xF8) !== 0;
        if (!ch.dac) ch.enabled = false;
        break;
      }
      case 0xFF13: this.sq1.freq = (this.sq1.freq & 0x700) | v; break;
      case 0xFF18: this.sq2.freq = (this.sq2.freq & 0x700) | v; break;
      case 0xFF1D: this.wave.freq = (this.wave.freq & 0x700) | v; break;
      case 0xFF14: case 0xFF19: case 0xFF1E: {
        const ch = a === 0xFF14 ? this.sq1 : a === 0xFF19 ? this.sq2 : this.wave;
        ch.freq = (ch.freq & 0xFF) | ((v & 0x07) << 8);
        ch.lengthEn = (v & 0x40) !== 0;
        if (v & 0x80) {
          if (ch === this.wave) this.triggerWave();
          else this.triggerSquare(ch, a - 2);
        }
        break;
      }
      case 0xFF1A:
        this.wave.dac = (v & 0x80) !== 0;
        if (!this.wave.dac) this.wave.enabled = false;
        break;
      case 0xFF1B: this.wave.length = 256 - v; break;
      case 0xFF1C: this.wave.volShift = [4, 0, 1, 2][(v >> 5) & 3]; break;
      case 0xFF20: this.noise.length = 64 - (v & 0x3F); break;
      case 0xFF22: this.noise.period = NOISE_DIVISORS[v & 7] << (v >> 4); break;
      case 0xFF23:
        this.noise.lengthEn = (v & 0x40) !== 0;
        if (v & 0x80) this.triggerNoise();
        break;
    }
  }

  loadEnvelope(ch, nrx2) {
    ch.vol = nrx2 >> 4;
    ch.envUp = (nrx2 & 0x08) !== 0;
    ch.envPeriod = nrx2 & 0x07;
    ch.envTimer = ch.envPeriod;
  }

  triggerSquare(ch, nrx2Addr) {
    ch.enabled = ch.dac;
    if (ch.length === 0) ch.length = 64;
    ch.timer = (2048 - ch.freq) * 4;
    this.loadEnvelope(ch, this.mm[nrx2Addr]);
    if (ch === this.sq1) {
      const nr10 = this.mm[0xFF10];
      const period = (nr10 >> 4) & 7, shift = nr10 & 7;
      this.shadow = ch.freq;
      this.sweepTimer = period || 8;
      this.sweepEn = period > 0 || shift > 0;
      if (shift) this.sweepCalc();
    }
  }

  triggerWave() {
    const ch = this.wave;
    ch.enabled = ch.dac;
    if (ch.length === 0) ch.length = 256;
    ch.timer = (2048 - ch.freq) * 2;
    ch.pos = 0;
  }

  triggerNoise() {
    const ch = this.noise;
    ch.enabled = ch.dac;
    if (ch.length === 0) ch.length = 64;
    ch.lfsr = 0x7FFF;
    ch.timer = ch.period;
    this.loadEnvelope(ch, this.mm[0xFF21]);
  }

  sweepCalc() {
    const nr10 = this.mm[0xFF10];
    const shift = nr10 & 7;
    const delta = this.shadow >> shift;
    const nf = nr10 & 0x08 ? this.shadow - delta : this.shadow + delta;
    if (nf > 2047) this.sq1.enabled = false;
    return nf;
  }

  clockSweep() {
    if (--this.sweepTimer > 0) return;
    const nr10 = this.mm[0xFF10];
    const period = (nr10 >> 4) & 7, shift = nr10 & 7;
    this.sweepTimer = period || 8;
    if (!this.sweepEn || !period) return;
    const nf = this.sweepCalc();
    if (nf <= 2047 && shift) {
      this.shadow = nf;
      this.sq1.freq = nf;
      this.mm[0xFF13] = nf & 0xFF;
      this.mm[0xFF14] = (this.mm[0xFF14] & ~7) | (nf >> 8);
      this.sweepCalc();
    }
  }

  clockLength(ch) {
    if (ch.lengthEn && ch.length > 0 && --ch.length === 0) ch.enabled = false;
  }

  clockEnvelope(ch) {
    if (!ch.envPeriod) return;
    if (--ch.envTimer > 0) return;
    ch.envTimer = ch.envPeriod;
    if (ch.envUp && ch.vol < 15) ch.vol++;
    else if (!ch.envUp && ch.vol > 0) ch.vol--;
  }

  stepSequencer() {
    const s = this.seqStep;
    if ((s & 1) === 0) {
      this.clockLength(this.sq1); this.clockLength(this.sq2);
      this.clockLength(this.wave); this.clockLength(this.noise);
    }
    if (s === 2 || s === 6) this.clockSweep();
    if (s === 7) {
      this.clockEnvelope(this.sq1); this.clockEnvelope(this.sq2); this.clockEnvelope(this.noise);
    }
    this.seqStep = (s + 1) & 7;
  }

  tick(cycles) {
    if (this.power) {
      this.seqCounter += cycles;
      if (this.seqCounter >= 8192) { this.seqCounter -= 8192; this.stepSequencer(); }

      const s1 = this.sq1, s2 = this.sq2, w = this.wave, n = this.noise;
      if (s1.enabled) {
        s1.timer -= cycles;
        while (s1.timer <= 0) { s1.timer += (2048 - s1.freq) * 4; s1.pos = (s1.pos + 1) & 7; }
      }
      if (s2.enabled) {
        s2.timer -= cycles;
        while (s2.timer <= 0) { s2.timer += (2048 - s2.freq) * 4; s2.pos = (s2.pos + 1) & 7; }
      }
      if (w.enabled) {
        w.timer -= cycles;
        while (w.timer <= 0) {
          w.timer += (2048 - w.freq) * 2;
          w.pos = (w.pos + 1) & 31;
          const byte = this.mm[0xFF30 + (w.pos >> 1)];
          w.sample = w.pos & 1 ? byte & 0x0F : byte >> 4;
        }
      }
      if (n.enabled) {
        n.timer -= cycles;
        while (n.timer <= 0) {
          n.timer += n.period;
          const x = (n.lfsr & 1) ^ ((n.lfsr >> 1) & 1);
          n.lfsr = (n.lfsr >> 1) | (x << 14);
          if (this.mm[0xFF22] & 0x08) n.lfsr = (n.lfsr & ~0x40) | (x << 6);
        }
      }
    }
    if (!this.onSamples) return;
    this.sampleAcc += cycles * this.sampleRate;
    while (this.sampleAcc >= CLOCK_HZ) {
      this.sampleAcc -= CLOCK_HZ;
      this.outputSample();
    }
  }

  outputSample() {
    let left = 0, right = 0;
    if (this.power) {
      const mm = this.mm;
      const s1 = this.sq1, s2 = this.sq2, w = this.wave, n = this.noise;
      const o1 = s1.enabled && DUTY[s1.duty][s1.pos] ? s1.vol : 0;
      const o2 = s2.enabled && DUTY[s2.duty][s2.pos] ? s2.vol : 0;
      const o3 = w.enabled ? w.sample >> w.volShift : 0;
      const o4 = n.enabled && !(n.lfsr & 1) ? n.vol : 0;
      const nr51 = mm[0xFF25], nr50 = mm[0xFF24];
      if (nr51 & 0x10) left += o1;
      if (nr51 & 0x20) left += o2;
      if (nr51 & 0x40) left += o3;
      if (nr51 & 0x80) left += o4;
      if (nr51 & 0x01) right += o1;
      if (nr51 & 0x02) right += o2;
      if (nr51 & 0x04) right += o3;
      if (nr51 & 0x08) right += o4;
      left *= (((nr50 >> 4) & 7) + 1) / (8 * 40);
      right *= ((nr50 & 7) + 1) / (8 * 40);
    }
    // Filtro passa-alto per eliminare la componente continua (come l'hardware)
    const outL = left - this.capL;
    this.capL = left - outL * this.hpCharge;
    const outR = right - this.capR;
    this.capR = right - outR * this.hpCharge;
    this.buffer[this.bufPos++] = outL;
    this.buffer[this.bufPos++] = outR;
    if (this.bufPos >= this.buffer.length) {
      this.onSamples(this.buffer);
      this.buffer = new Float32Array(this.chunk * 2);
      this.bufPos = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Sistema completo
// ---------------------------------------------------------------------------
class GameBoy {
  constructor(romBytes, options = {}) {
    this.memory = new Memory(romBytes);
    this.cpu = new CPU(this.memory);
    this.timer = new Timer(this.memory);
    this.ppu = new PPU(this.memory);
    this.apu = new APU(this.memory, options.sampleRate, options.onSamples);
    this.extraCycles = 0;
  }

  title() { return this.memory.title(); }

  // Esegue circa `budget` cicli (gli eccessi vengono recuperati alla chiamata successiva)
  runCycles(budget) {
    const cpu = this.cpu, timer = this.timer, ppu = this.ppu, apu = this.apu;
    let done = this.extraCycles;
    while (done < budget) {
      const c = cpu.step();
      timer.tick(c);
      ppu.tick(c);
      apu.tick(c);
      done += c;
    }
    this.extraCycles = done - budget;
  }

  runFrame() { this.runCycles(CYCLES_PER_FRAME); }

  setKey(group, bit, pressed) { this.memory.setJoypad(group, bit, pressed); }

  // Identifica la ROM, per non caricare uno stato salvato con un altro gioco
  romId() {
    const rom = this.memory.rom;
    return { title: this.title(), checksum: (rom[0x14E] << 8) | rom[0x14F], size: rom.length };
  }

  // Stato completo della macchina come oggetto JSON (la ROM non è inclusa)
  saveState() {
    return {
      format: "pyemu-gameboy-state",
      version: STATE_VERSION,
      rom: this.romId(),
      memory: snapshot(this.memory, STATE_SKIP.memory),
      cpu: snapshot(this.cpu, STATE_SKIP.cpu),
      timer: snapshot(this.timer, STATE_SKIP.timer),
      ppu: snapshot(this.ppu, STATE_SKIP.ppu),
      apu: snapshot(this.apu, STATE_SKIP.apu),
      extraCycles: this.extraCycles,
    };
  }

  loadState(state) {
    if (!state || state.format !== "pyemu-gameboy-state") {
      throw new Error("Il file non è uno stato salvato di questo emulatore");
    }
    if (state.version !== STATE_VERSION) {
      throw new Error(`Versione dello stato non supportata (${state.version})`);
    }
    const id = this.romId();
    if (state.rom.checksum !== id.checksum || state.rom.size !== id.size) {
      throw new Error(`Lo stato è stato salvato con un'altra ROM ("${state.rom.title}")`);
    }
    restore(this.memory, state.memory);
    restore(this.cpu, state.cpu);
    restore(this.timer, state.timer);
    restore(this.ppu, state.ppu);
    restore(this.apu, state.apu);
    this.extraCycles = state.extraCycles;
  }
}

// ---------------------------------------------------------------------------
// Stati salvati: serializzazione generica dei campi dei componenti
// ---------------------------------------------------------------------------
const STATE_VERSION = 1;
// Campi da non salvare: ROM, riferimenti ad altri componenti, tasti premuti ora,
// parametri dell'uscita audio che dipendono dal browser
const STATE_SKIP = {
  memory: ["rom", "serial", "joyButtons", "joyDirs"],
  cpu: [],
  timer: [],
  ppu: ["work", "display", "bg"],  // rigenerati al frame successivo
  apu: ["mm", "sampleRate", "hpCharge", "chunk", "buffer", "bufPos"],
};

function toBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(text) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function snapshot(obj, skip) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (skip.includes(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (v instanceof Uint8Array) out[k] = { u8: toBase64(v) };
    else if (v instanceof Uint32Array) out[k] = { u32: toBase64(new Uint8Array(v.buffer)) };
    else if (v && v.constructor === Object) out[k] = snapshot(v, []);
  }
  return out;
}

function restore(obj, data) {
  for (const [k, v] of Object.entries(data)) {
    if (!(k in obj)) continue;
    if (v && v.u8 !== undefined) obj[k].set(fromBase64(v.u8));
    else if (v && v.u32 !== undefined) obj[k].set(new Uint32Array(fromBase64(v.u32).buffer));
    else if (v && typeof v === "object") restore(obj[k], v);
    else obj[k] = v;
  }
}

if (typeof module !== "undefined") module.exports = { GameBoy, CLOCK_HZ, CYCLES_PER_FRAME, SHADES };
