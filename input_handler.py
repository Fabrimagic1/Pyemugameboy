import pygame

class InputHandler:
    def __init__(self, memory):
        self.memory = memory
        self.keys = set()

    def update(self):
        for event in pygame.event.get():
            if event.type==pygame.QUIT:
                pygame.quit(); exit()
            if event.type==pygame.KEYDOWN:
                self.keys.add(event.key)
            if event.type==pygame.KEYUP and event.key in self.keys:
                self.keys.remove(event.key)
        joy = self.memory.read_byte(0xFF00)
        rb = not bool(joy&0x20)
        rd = not bool(joy&0x10)
        res = 0x0F
        if rb:
            if pygame.K_z in self.keys: res&=~1
            if pygame.K_x in self.keys: res&=~2
            if pygame.K_BACKSPACE in self.keys: res&=~4
            if pygame.K_RETURN in self.keys: res&=~8
        if rd:
            if pygame.K_RIGHT in self.keys: res&=~1
            if pygame.K_LEFT in self.keys: res&=~2
            if pygame.K_UP in self.keys: res&=~4
            if pygame.K_DOWN in self.keys: res&=~8
        # set interrupt Joypad if pressed
        if res != (joy&0x0F):
            flags = self.memory.read_byte(0xFF0F)
            self.memory.write_byte(0xFF0F, flags|0x10)
        self.memory.write_byte(0xFF00, (joy&0xF0)|res)
