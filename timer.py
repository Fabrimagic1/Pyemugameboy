class Timer:
    """Registri DIV/TIMA/TMA/TAC con generazione dell'interrupt Timer."""

    TAC_PERIODS = (1024, 16, 64, 256)

    def __init__(self, memory):
        self.memory = memory
        self.div_counter = 0
        self.tima_counter = 0
        memory.timer = self

    def reset_div(self):
        # Una scrittura su DIV azzera il registro e il contatore interno
        self.div_counter = 0
        self.tima_counter = 0

    def tick(self, cycles):
        mem = self.memory.memory
        self.div_counter += cycles
        while self.div_counter >= 256:
            self.div_counter -= 256
            mem[0xFF04] = (mem[0xFF04] + 1) & 0xFF

        tac = mem[0xFF07]
        if tac & 0x04:
            period = self.TAC_PERIODS[tac & 0x03]
            self.tima_counter += cycles
            while self.tima_counter >= period:
                self.tima_counter -= period
                tima = mem[0xFF05] + 1
                if tima > 0xFF:
                    tima = mem[0xFF06]
                    mem[0xFF0F] |= 0x04
                mem[0xFF05] = tima
