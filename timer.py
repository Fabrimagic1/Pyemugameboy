class Timer:
    def __init__(self, memory):
        self.memory = memory
        self.div_counter = 0
        self.tima_counter = 0

    def tick(self, cycles):
        self.div_counter += cycles
        if self.div_counter >= 256:
            self.div_counter -= 256
            div = self.memory.read_byte(0xFF04)
            self.memory.write_byte(0xFF04, (div+1)&0xFF)

        tac = self.memory.read_byte(0xFF07)
        if tac&0x04:
            thresh={0:1024,1:16,2:64,3:256}[tac&0x03]
            self.tima_counter += cycles
            while self.tima_counter>=thresh:
                self.tima_counter-=thresh
                tima=self.memory.read_byte(0xFF05)+1
                if tima>0xFF:
                    tima=self.memory.read_byte(0xFF06)
                    self.memory.write_byte(0xFF0F, self.memory.read_byte(0xFF0F)|0x04)
                self.memory.write_byte(0xFF05, tima)
