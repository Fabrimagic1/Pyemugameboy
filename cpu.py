class CPU:
    """Core Sharp LR35902 (SM83) con set di istruzioni completo, prefisso CB,
    interrupt, HALT ed EI ritardato. step() restituisce i cicli (T-states)."""

    # Indici dei registri a 8 bit come codificati negli opcode: B C D E H L (HL) A
    B, C, D, E, H, L, HL_IND, A = range(8)

    FLAG_Z, FLAG_N, FLAG_H, FLAG_C = 0x80, 0x40, 0x20, 0x10

    def __init__(self, memory):
        self.memory = memory
        # Stato dei registri dopo la boot ROM del DMG (indice 6 non usato)
        self.r = [0x00, 0x13, 0x00, 0xD8, 0x01, 0x4D, 0x00, 0x01]
        self.f = 0xB0
        self.sp = 0xFFFE
        self.pc = 0x0100
        self.ime = False
        self.ime_pending = False
        self.halted = False
        self.running = True
        self._build_tables()

    # ------------------------------------------------------------------
    # Accesso ai registri
    # ------------------------------------------------------------------
    @property
    def registers(self):
        """Vista leggibile dei registri (per debug)."""
        r = self.r
        return {'A': r[7], 'F': self.f, 'B': r[0], 'C': r[1], 'D': r[2],
                'E': r[3], 'H': r[4], 'L': r[5], 'SP': self.sp, 'PC': self.pc}

    def get_hl(self):
        return (self.r[4] << 8) | self.r[5]

    def set_hl(self, v):
        self.r[4] = (v >> 8) & 0xFF
        self.r[5] = v & 0xFF

    def get_rr(self, i):
        # 0=BC 1=DE 2=HL 3=SP
        if i == 3:
            return self.sp
        return (self.r[i * 2] << 8) | self.r[i * 2 + 1]

    def set_rr(self, i, v):
        v &= 0xFFFF
        if i == 3:
            self.sp = v
        else:
            self.r[i * 2] = v >> 8
            self.r[i * 2 + 1] = v & 0xFF

    def get_r8(self, i):
        if i == 6:
            return self.memory.read_byte(self.get_hl())
        return self.r[i]

    def set_r8(self, i, v):
        if i == 6:
            self.memory.write_byte(self.get_hl(), v & 0xFF)
        else:
            self.r[i] = v & 0xFF

    def get_flag(self, flag):
        return bool(self.f & {'Z': 0x80, 'N': 0x40, 'H': 0x20, 'C': 0x10}[flag])

    def check_cond(self, cc):
        # 0=NZ 1=Z 2=NC 3=C
        if cc == 0:
            return not self.f & 0x80
        if cc == 1:
            return bool(self.f & 0x80)
        if cc == 2:
            return not self.f & 0x10
        return bool(self.f & 0x10)

    # ------------------------------------------------------------------
    # Fetch / stack
    # ------------------------------------------------------------------
    def fetch_byte(self):
        v = self.memory.read_byte(self.pc)
        self.pc = (self.pc + 1) & 0xFFFF
        return v

    def fetch_word(self):
        lo = self.fetch_byte()
        hi = self.fetch_byte()
        return (hi << 8) | lo

    def fetch_signed(self):
        v = self.fetch_byte()
        return v - 0x100 if v & 0x80 else v

    def push_word(self, val):
        self.sp = (self.sp - 1) & 0xFFFF
        self.memory.write_byte(self.sp, (val >> 8) & 0xFF)
        self.sp = (self.sp - 1) & 0xFFFF
        self.memory.write_byte(self.sp, val & 0xFF)

    def pop_word(self):
        lo = self.memory.read_byte(self.sp)
        self.sp = (self.sp + 1) & 0xFFFF
        hi = self.memory.read_byte(self.sp)
        self.sp = (self.sp + 1) & 0xFFFF
        return (hi << 8) | lo

    # ------------------------------------------------------------------
    # Interrupt e ciclo principale
    # ------------------------------------------------------------------
    def handle_interrupts(self):
        mem = self.memory
        pending = mem.read_byte(0xFF0F) & mem.read_byte(0xFFFF) & 0x1F
        if not pending:
            return 0
        # Qualsiasi interrupt in attesa risveglia la CPU da HALT, anche con IME=0
        self.halted = False
        if not self.ime:
            return 0
        self.ime = False
        for i in range(5):
            if pending & (1 << i):
                mem.write_byte(0xFF0F, mem.read_byte(0xFF0F) & ~(1 << i))
                self.push_word(self.pc)
                self.pc = 0x40 + i * 8
                return 20
        return 0

    def step(self):
        cycles = self.handle_interrupts()
        if cycles:
            return cycles
        if self.halted:
            return 4
        enable_ime = self.ime_pending
        opc = self.fetch_byte()
        cycles = self.ops[opc]()
        # EI ha effetto dopo l'istruzione successiva (a meno di un DI nel mezzo)
        if enable_ime and self.ime_pending:
            self.ime = True
            self.ime_pending = False
        return cycles

    # ------------------------------------------------------------------
    # ALU
    # ------------------------------------------------------------------
    def alu(self, op, v):
        a = self.r[7]
        if op == 0:    # ADD
            res = a + v
            self.f = ((0x80 if res & 0xFF == 0 else 0)
                      | (0x20 if (a & 0xF) + (v & 0xF) > 0xF else 0)
                      | (0x10 if res > 0xFF else 0))
        elif op == 1:  # ADC
            c = (self.f >> 4) & 1
            res = a + v + c
            self.f = ((0x80 if res & 0xFF == 0 else 0)
                      | (0x20 if (a & 0xF) + (v & 0xF) + c > 0xF else 0)
                      | (0x10 if res > 0xFF else 0))
        elif op == 2 or op == 7:  # SUB / CP
            res = a - v
            self.f = (0x40 | (0x80 if res & 0xFF == 0 else 0)
                      | (0x20 if (a & 0xF) < (v & 0xF) else 0)
                      | (0x10 if res < 0 else 0))
            if op == 7:
                return
        elif op == 3:  # SBC
            c = (self.f >> 4) & 1
            res = a - v - c
            self.f = (0x40 | (0x80 if res & 0xFF == 0 else 0)
                      | (0x20 if (a & 0xF) < (v & 0xF) + c else 0)
                      | (0x10 if res < 0 else 0))
        elif op == 4:  # AND
            res = a & v
            self.f = (0x80 if res == 0 else 0) | 0x20
        elif op == 5:  # XOR
            res = a ^ v
            self.f = 0x80 if res == 0 else 0
        else:          # OR
            res = a | v
            self.f = 0x80 if res == 0 else 0
        self.r[7] = res & 0xFF

    def cb_shift(self, op, v):
        c = self.f & 0x10
        if op == 0:    # RLC
            carry = v >> 7
            res = ((v << 1) | carry) & 0xFF
        elif op == 1:  # RRC
            carry = v & 1
            res = (v >> 1) | (carry << 7)
        elif op == 2:  # RL
            carry = v >> 7
            res = ((v << 1) | (1 if c else 0)) & 0xFF
        elif op == 3:  # RR
            carry = v & 1
            res = (v >> 1) | (0x80 if c else 0)
        elif op == 4:  # SLA
            carry = v >> 7
            res = (v << 1) & 0xFF
        elif op == 5:  # SRA
            carry = v & 1
            res = (v >> 1) | (v & 0x80)
        elif op == 6:  # SWAP
            carry = 0
            res = ((v << 4) | (v >> 4)) & 0xFF
        else:          # SRL
            carry = v & 1
            res = v >> 1
        self.f = (0x80 if res == 0 else 0) | (0x10 if carry else 0)
        return res

    def add_sp_signed(self):
        e = self.fetch_signed()
        sp = self.sp
        self.f = ((0x20 if (sp & 0xF) + (e & 0xF) > 0xF else 0)
                  | (0x10 if (sp & 0xFF) + (e & 0xFF) > 0xFF else 0))
        return (sp + e) & 0xFFFF

    # ------------------------------------------------------------------
    # Costruzione tabella opcode
    # ------------------------------------------------------------------
    def _build_tables(self):
        ops = [None] * 256
        cb = [None] * 256
        mem = self.memory
        r = self.r

        def illegal(opc):
            def f():
                # Sull'hardware reale un opcode illegale blocca la CPU:
                # restiamo fermi sullo stesso indirizzo invece di andare in crash.
                self.pc = (self.pc - 1) & 0xFFFF
                return 4
            return f

        for i in range(256):
            ops[i] = illegal(i)

        # --- 0x00-0x3F -------------------------------------------------
        def nop():
            return 4
        ops[0x00] = nop

        def stop():
            self.fetch_byte()
            return 4
        ops[0x10] = stop

        for rr in range(4):
            def ld_rr_nn(rr=rr):
                self.set_rr(rr, self.fetch_word())
                return 12

            def inc_rr(rr=rr):
                self.set_rr(rr, self.get_rr(rr) + 1)
                return 8

            def dec_rr(rr=rr):
                self.set_rr(rr, self.get_rr(rr) - 1)
                return 8

            def add_hl_rr(rr=rr):
                hl = self.get_hl()
                v = self.get_rr(rr)
                res = hl + v
                self.f = ((self.f & 0x80)
                          | (0x20 if (hl & 0xFFF) + (v & 0xFFF) > 0xFFF else 0)
                          | (0x10 if res > 0xFFFF else 0))
                self.set_hl(res)
                return 8

            ops[0x01 + rr * 16] = ld_rr_nn
            ops[0x03 + rr * 16] = inc_rr
            ops[0x0B + rr * 16] = dec_rr
            ops[0x09 + rr * 16] = add_hl_rr

        # LD (rr),A / LD A,(rr) con BC, DE, HL+, HL-
        def ind_addr(k):
            if k == 0:
                return self.get_rr(0)
            if k == 1:
                return self.get_rr(1)
            hl = self.get_hl()
            self.set_hl(hl + 1 if k == 2 else hl - 1)
            return hl

        for k in range(4):
            def ld_ind_a(k=k):
                mem.write_byte(ind_addr(k), r[7])
                return 8

            def ld_a_ind(k=k):
                r[7] = mem.read_byte(ind_addr(k))
                return 8

            ops[0x02 + k * 16] = ld_ind_a
            ops[0x0A + k * 16] = ld_a_ind

        def ld_nn_sp():
            addr = self.fetch_word()
            mem.write_byte(addr, self.sp & 0xFF)
            mem.write_byte((addr + 1) & 0xFFFF, self.sp >> 8)
            return 20
        ops[0x08] = ld_nn_sp

        for i in range(8):
            def inc_r(i=i):
                v = self.get_r8(i)
                res = (v + 1) & 0xFF
                self.f = ((self.f & 0x10) | (0x80 if res == 0 else 0)
                          | (0x20 if (v & 0xF) == 0xF else 0))
                self.set_r8(i, res)
                return 12 if i == 6 else 4

            def dec_r(i=i):
                v = self.get_r8(i)
                res = (v - 1) & 0xFF
                self.f = ((self.f & 0x10) | 0x40 | (0x80 if res == 0 else 0)
                          | (0x20 if (v & 0xF) == 0 else 0))
                self.set_r8(i, res)
                return 12 if i == 6 else 4

            def ld_r_n(i=i):
                self.set_r8(i, self.fetch_byte())
                return 12 if i == 6 else 8

            ops[0x04 + i * 8] = inc_r
            ops[0x05 + i * 8] = dec_r
            ops[0x06 + i * 8] = ld_r_n

        def rlca():
            a = r[7]
            c = a >> 7
            r[7] = ((a << 1) | c) & 0xFF
            self.f = 0x10 if c else 0
            return 4

        def rrca():
            a = r[7]
            c = a & 1
            r[7] = (a >> 1) | (c << 7)
            self.f = 0x10 if c else 0
            return 4

        def rla():
            a = r[7]
            c = a >> 7
            r[7] = ((a << 1) | (1 if self.f & 0x10 else 0)) & 0xFF
            self.f = 0x10 if c else 0
            return 4

        def rra():
            a = r[7]
            c = a & 1
            r[7] = (a >> 1) | (0x80 if self.f & 0x10 else 0)
            self.f = 0x10 if c else 0
            return 4

        def daa():
            a = r[7]
            f = self.f
            if not f & 0x40:
                if f & 0x10 or a > 0x99:
                    a += 0x60
                    f |= 0x10
                if f & 0x20 or (a & 0x0F) > 0x09:
                    a += 0x06
            else:
                if f & 0x10:
                    a -= 0x60
                if f & 0x20:
                    a -= 0x06
            a &= 0xFF
            r[7] = a
            self.f = (f & 0x50) | (0x80 if a == 0 else 0)
            return 4

        def cpl():
            r[7] ^= 0xFF
            self.f |= 0x60
            return 4

        def scf():
            self.f = (self.f & 0x80) | 0x10
            return 4

        def ccf():
            self.f = (self.f & 0x80) | ((self.f ^ 0x10) & 0x10)
            return 4

        ops[0x07] = rlca
        ops[0x0F] = rrca
        ops[0x17] = rla
        ops[0x1F] = rra
        ops[0x27] = daa
        ops[0x2F] = cpl
        ops[0x37] = scf
        ops[0x3F] = ccf

        def jr():
            e = self.fetch_signed()
            self.pc = (self.pc + e) & 0xFFFF
            return 12
        ops[0x18] = jr

        for cc in range(4):
            def jr_cc(cc=cc):
                e = self.fetch_signed()
                if self.check_cond(cc):
                    self.pc = (self.pc + e) & 0xFFFF
                    return 12
                return 8
            ops[0x20 + cc * 8] = jr_cc

        # --- 0x40-0x7F: LD r,r' -----------------------------------------
        for dst in range(8):
            for src in range(8):
                opc = 0x40 + dst * 8 + src
                if opc == 0x76:
                    continue
                if dst == 6 or src == 6:
                    def ld_r_r(dst=dst, src=src):
                        self.set_r8(dst, self.get_r8(src))
                        return 8
                else:
                    def ld_r_r(dst=dst, src=src):
                        r[dst] = r[src]
                        return 4
                ops[opc] = ld_r_r

        def halt():
            self.halted = True
            return 4
        ops[0x76] = halt

        # --- 0x80-0xBF: ALU A,r -----------------------------------------
        for op in range(8):
            for src in range(8):
                def alu_r(op=op, src=src):
                    self.alu(op, self.get_r8(src))
                    return 8 if src == 6 else 4
                ops[0x80 + op * 8 + src] = alu_r

            def alu_n(op=op):
                self.alu(op, self.fetch_byte())
                return 8
            ops[0xC6 + op * 8] = alu_n

        # --- 0xC0-0xFF --------------------------------------------------
        for cc in range(4):
            def ret_cc(cc=cc):
                if self.check_cond(cc):
                    self.pc = self.pop_word()
                    return 20
                return 8

            def jp_cc(cc=cc):
                addr = self.fetch_word()
                if self.check_cond(cc):
                    self.pc = addr
                    return 16
                return 12

            def call_cc(cc=cc):
                addr = self.fetch_word()
                if self.check_cond(cc):
                    self.push_word(self.pc)
                    self.pc = addr
                    return 24
                return 12

            ops[0xC0 + cc * 8] = ret_cc
            ops[0xC2 + cc * 8] = jp_cc
            ops[0xC4 + cc * 8] = call_cc

        for k in range(4):
            def pop(k=k):
                v = self.pop_word()
                if k == 3:
                    r[7] = v >> 8
                    self.f = v & 0xF0
                else:
                    self.set_rr(k, v)
                return 12

            def push(k=k):
                if k == 3:
                    self.push_word((r[7] << 8) | self.f)
                else:
                    self.push_word(self.get_rr(k))
                return 16

            ops[0xC1 + k * 16] = pop
            ops[0xC5 + k * 16] = push

        for n in range(8):
            def rst(n=n):
                self.push_word(self.pc)
                self.pc = n * 8
                return 16
            ops[0xC7 + n * 8] = rst

        def jp():
            self.pc = self.fetch_word()
            return 16

        def jp_hl():
            self.pc = self.get_hl()
            return 4

        def call():
            addr = self.fetch_word()
            self.push_word(self.pc)
            self.pc = addr
            return 24

        def ret():
            self.pc = self.pop_word()
            return 16

        def reti():
            self.pc = self.pop_word()
            self.ime = True
            return 16

        def ldh_n_a():
            mem.write_byte(0xFF00 | self.fetch_byte(), r[7])
            return 12

        def ldh_a_n():
            r[7] = mem.read_byte(0xFF00 | self.fetch_byte())
            return 12

        def ld_c_a():
            mem.write_byte(0xFF00 | r[1], r[7])
            return 8

        def ld_a_c():
            r[7] = mem.read_byte(0xFF00 | r[1])
            return 8

        def ld_nn_a():
            mem.write_byte(self.fetch_word(), r[7])
            return 16

        def ld_a_nn():
            r[7] = mem.read_byte(self.fetch_word())
            return 16

        def add_sp_e():
            self.sp = self.add_sp_signed()
            return 16

        def ld_hl_sp_e():
            self.set_hl(self.add_sp_signed())
            return 12

        def ld_sp_hl():
            self.sp = self.get_hl()
            return 8

        def di():
            self.ime = False
            self.ime_pending = False
            return 4

        def ei():
            self.ime_pending = True
            return 4

        def prefix_cb():
            return cb[self.fetch_byte()]()

        ops[0xC3] = jp
        ops[0xE9] = jp_hl
        ops[0xCD] = call
        ops[0xC9] = ret
        ops[0xD9] = reti
        ops[0xE0] = ldh_n_a
        ops[0xF0] = ldh_a_n
        ops[0xE2] = ld_c_a
        ops[0xF2] = ld_a_c
        ops[0xEA] = ld_nn_a
        ops[0xFA] = ld_a_nn
        ops[0xE8] = add_sp_e
        ops[0xF8] = ld_hl_sp_e
        ops[0xF9] = ld_sp_hl
        ops[0xF3] = di
        ops[0xFB] = ei
        ops[0xCB] = prefix_cb

        # --- Tabella CB ---------------------------------------------------
        for opc in range(256):
            reg = opc & 7
            y = (opc >> 3) & 7
            group = opc >> 6
            if group == 0:
                def f(op=y, reg=reg):
                    self.set_r8(reg, self.cb_shift(op, self.get_r8(reg)))
                    return 16 if reg == 6 else 8
            elif group == 1:
                def f(bit=y, reg=reg):
                    v = self.get_r8(reg)
                    self.f = ((self.f & 0x10) | 0x20
                              | (0 if v & (1 << bit) else 0x80))
                    return 12 if reg == 6 else 8
            elif group == 2:
                def f(bit=y, reg=reg):
                    self.set_r8(reg, self.get_r8(reg) & ~(1 << bit))
                    return 16 if reg == 6 else 8
            else:
                def f(bit=y, reg=reg):
                    self.set_r8(reg, self.get_r8(reg) | (1 << bit))
                    return 16 if reg == 6 else 8
            cb[opc] = f

        self.ops = ops
        self.cb_ops = cb
