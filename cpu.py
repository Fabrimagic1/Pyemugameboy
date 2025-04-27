class CPU:
    # Tempo in cicli per ogni opcode
    CYCLES = {
        0x00:4, 0x76:4, 0xFB:4, 0xF3:4,
        # LD r, imm8
        0x06:8,0x0E:8,0x16:8,0x1E:8,0x26:8,0x2E:8,0x3E:8,
        # LD r, r'
        **{opc:4 for opc in [0x78,0x79,0x7A,0x7B,0x7C,0x7D,0x7F,
                            0x40,0x41,0x42,0x43,0x44,0x45,0x47]},
        # ADD A,r / imm8
        0x87:4,0x80:4,0x81:4,0x82:4,0x83:4,0x84:4,0x85:4,0xC6:8,
        # SUB A,r / imm8
        0x97:4,0x90:4,0x91:4,0x92:4,0x93:4,0x94:4,0x95:4,0xD6:8,
        # INC r
        0x04:4,0x0C:4,0x14:4,0x1C:4,0x24:4,0x2C:4,0x3C:4,
        # DEC r
        0x05:4,0x0D:4,0x15:4,0x1D:4,0x25:4,0x2D:4,0x3D:4,
        # AND / OR / XOR
        0xA0:4,0xA1:4,0xA2:4,0xA3:4,0xA4:4,0xA5:4,0xA7:4,0xE6:8,
        0xB0:4,0xB1:4,0xB2:4,0xB3:4,0xB4:4,0xB5:4,0xB7:4,0xF6:8,
        0xA8:4,0xA9:4,0xAA:4,0xAB:4,0xAC:4,0xAD:4,0xAF:4,0xEE:8,
        # JP
        0xC3:16,0xC2:16,0xCA:16,0xD2:16,0xDA:16,
        # JR
        0x18:12,0x20:12,0x28:12,0x30:12,0x38:12,
        # CALL/RET
        0xCD:24,0xC9:16
    }

    def __init__(self, memory):
        self.memory = memory
        self.registers = {'A':0x01,'F':0xB0,'B':0x00,'C':0x13,
                          'D':0x00,'E':0xD8,'H':0x01,'L':0x4D,
                          'SP':0xFFFE,'PC':0x0100}
        self.ime = True
        self.running = True

    def fetch_byte(self):
        v = self.memory.read_byte(self.registers['PC'])
        self.registers['PC'] += 1
        return v

    def fetch_word(self):
        lo = self.fetch_byte(); hi = self.fetch_byte()
        return (hi << 8) | lo

    def set_flag(self, flag, cond):
        m = {'Z':0x80,'N':0x40,'H':0x20,'C':0x10}[flag]
        if cond: self.registers['F'] |= m
        else:    self.registers['F'] &= ~m
        self.registers['F'] &= 0xF0

    def get_flag(self, flag):
        return bool(self.registers['F'] & 
                    {'Z':0x80,'N':0x40,'H':0x20,'C':0x10}[flag])

    def push_word(self, val):
        self.registers['SP'] -= 2
        self.memory.write_byte(self.registers['SP'], val & 0xFF)
        self.memory.write_byte(self.registers['SP']+1, (val>>8)&0xFF)

    def pop_word(self):
        lo = self.memory.read_byte(self.registers['SP'])
        hi = self.memory.read_byte(self.registers['SP']+1)
        self.registers['SP'] += 2
        return (hi<<8) | lo

    def handle_interrupts(self):
        if not self.ime: return
        flags = self.memory.read_byte(0xFF0F)
        ena = self.memory.read_byte(0xFFFF)
        req = flags & ena
        if req:
            self.ime = False
            for i,vec in enumerate([0x40,0x48,0x50,0x58,0x60]):
                if req & (1<<i):
                    self.push_word(self.registers['PC'])
                    self.registers['PC'] = vec
                    self.memory.write_byte(0xFF0F, flags & ~(1<<i))
                    break

    def execute_instruction(self, opc):
        match opc:
            case 0x00: pass  # NOP
            case 0x76: self.running = False  # HALT
            case 0xFB: self.ime = True       # EI
            case 0xF3: self.ime = False      # DI
            # ... (altre istruzioni) ...
            case _: raise NotImplementedError(f"Opcode {hex(opc)} non implementato")

    def step(self):
        self.handle_interrupts()
        opc = self.fetch_byte()
        self.execute_instruction(opc)
        return self.CYCLES.get(opc, 4)
