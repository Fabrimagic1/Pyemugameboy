import pygame

class GPU:
    SCREEN_WIDTH = 160
    SCREEN_HEIGHT = 144

    def __init__(self, memory):
        self.memory = memory
        pygame.init()
        self.screen = pygame.display.set_mode((self.SCREEN_WIDTH * 2, self.SCREEN_HEIGHT * 2))
        pygame.display.set_caption('Gameboy Emulator')
        self.clock = pygame.time.Clock()
        self.mode = 2
        self.mode_clock = 0
        self.line = 0
        self.framebuffer = [[(255,255,255) for _ in range(self.SCREEN_WIDTH)] for _ in range(self.SCREEN_HEIGHT)]

    def tick(self, cycles):
        self.mode_clock += cycles
        if self.mode == 2 and self.mode_clock >= 80:
            self.mode_clock -= 80; self.mode = 3
        elif self.mode == 3 and self.mode_clock >= 172:
            self.mode_clock -= 172; self.mode = 0; self.draw_scanline()
        elif self.mode == 0 and self.mode_clock >= 204:
            self.mode_clock -= 204; self.line +=1; self.memory.write_byte(0xFF44, self.line)
            if self.line == 144:
                self.mode = 1
                flags = self.memory.read_byte(0xFF0F); self.memory.write_byte(0xFF0F, flags|0x01)
                self.render_screen()
            else:
                self.mode = 2
        elif self.mode == 1 and self.mode_clock >= 456:
            self.mode_clock -= 456; self.line +=1; self.memory.write_byte(0xFF44, self.line)
            if self.line>153:
                self.mode = 2; self.line = 0; self.memory.write_byte(0xFF44, self.line)
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit(); exit()

    def draw_scanline(self):
        if self.memory.read_byte(0xFF40)&0x01:
            self.draw_background()
            self.draw_sprites()

    def draw_background(self):
        scy, scx = self.memory.read_byte(0xFF42), self.memory.read_byte(0xFF43)
        ly = self.memory.read_byte(0xFF44); lcdc = self.memory.read_byte(0xFF40)
        tile_map = 0x9C00 if lcdc&0x08 else 0x9800
        tile_data = 0x8000 if lcdc&0x10 else 0x8800
        for x in range(self.SCREEN_WIDTH):
            map_x, map_y = (x+scx)&0xFF, (ly+scy)&0xFF
            row, col = map_y//8, map_x//8
            tbl = tile_map + row*32 + col
            idx = self.memory.read_byte(tbl)
            if tile_data==0x8800: idx=(idx^0x80)-0x80
            loc = tile_data + idx*16; loff=(map_y%8)*2
            b1=self.memory.read_byte(loc+loff); b2=self.memory.read_byte(loc+loff+1)
            pal=self.memory.read_byte(0xFF47)
            for bit in range(8):
                cn=((b2>>(7-bit))&1)<<1|((b1>>(7-bit))&1)
                self.framebuffer[ly][x]=self.get_color(cn,pal)

    def draw_sprites(self):
        lcdc = self.memory.read_byte(0xFF40)
        if not lcdc&0x02: return
        sz=16 if lcdc&0x04 else 8
        for i in range(0,160,4):
            y=self.memory.read_byte(0xFE00+i)-16; x=self.memory.read_byte(0xFE00+i+1)-8
            ti=self.memory.read_byte(0xFE00+i+2); at=self.memory.read_byte(0xFE00+i+3)
            pr=bool(at&0x80); fx=bool(at&0x20); fy=bool(at&0x40)
            pal_reg=0xFF49 if at&0x10 else 0xFF47
            for row in range(sz):
                ln=sz-1-row if fy else row
                b1=self.memory.read_byte(0x8000+ti*16+ln*2); b2=self.memory.read_byte(0x8000+ti*16+ln*2+1)
                for col in range(8):
                    bit=col if fx else 7-col
                    cn=((b2>>bit)&1)<<1|((b1>>bit)&1)
                    if cn==0: continue
                    colr=self.get_color(cn,self.memory.read_byte(pal_reg))
                    dx,dy=x+col,y+row
                    if 0<=dx<self.SCREEN_WIDTH and 0<=dy<self.SCREEN_HEIGHT:
                        if not pr or self.framebuffer[dy][dx]==(255,255,255):
                            self.framebuffer[dy][dx]=colr

    def get_color(self,color_num,palette):
        v=(palette>>(color_num*2))&0x03
        return [(255,255,255),(192,192,192),(96,96,96),(0,0,0)][v]

    def render_screen(self):
        for y in range(self.SCREEN_HEIGHT):
            for x in range(self.SCREEN_WIDTH):
                pygame.draw.rect(self.screen,self.framebuffer[y][x],pygame.Rect(x*2,y*2,2,2))
        pygame.display.flip(); self.clock.tick(60)
