import numpy as np
import pygame


class GPU:
    """PPU: modi LCD, LY/LYC, interrupt VBlank/STAT, rendering di sfondo,
    finestra e sprite per scanline (vettorizzato con numpy)."""

    SCREEN_WIDTH = 160
    SCREEN_HEIGHT = 144
    SCALE = 3

    MODE_HBLANK, MODE_VBLANK, MODE_OAM, MODE_TRANSFER = 0, 1, 2, 3

    COLORS = np.array([(224, 248, 208), (136, 192, 112),
                       (52, 104, 86), (8, 24, 32)], dtype=np.uint8)

    def __init__(self, memory, headless=False):
        self.memory = memory
        self.vram = np.frombuffer(memory.memory, dtype=np.uint8)  # vista "live"
        self.headless = headless
        if not headless:
            pygame.display.init()
            self.screen = pygame.display.set_mode(
                (self.SCREEN_WIDTH * self.SCALE, self.SCREEN_HEIGHT * self.SCALE))
            pygame.display.set_caption('Gameboy Emulator')
            self.surface = pygame.Surface((self.SCREEN_WIDTH, self.SCREEN_HEIGHT))
        self.clock = pygame.time.Clock()
        self.mode = self.MODE_OAM
        self.mode_clock = 0
        self.line = 0
        self.window_line = 0
        self.frame_ready = False
        self.stat_line = False
        self.lcd_was_on = True
        # Framebuffer di indici di colore (0-3) già passati per la palette
        self.framebuffer = np.zeros((self.SCREEN_HEIGHT, self.SCREEN_WIDTH), dtype=np.uint8)
        self._xs = np.arange(self.SCREEN_WIDTH, dtype=np.int32)

    # ------------------------------------------------------------------
    # Temporizzazione
    # ------------------------------------------------------------------
    def _set_ly(self, ly):
        self.line = ly
        self.memory.memory[0xFF44] = ly

    def _set_mode(self, mode):
        self.mode = mode
        mem = self.memory.memory
        mem[0xFF41] = (mem[0xFF41] & 0xFC) | mode

    def _update_stat(self):
        mem = self.memory.memory
        stat = mem[0xFF41]
        if self.line == mem[0xFF45]:
            stat |= 0x04
        else:
            stat &= ~0x04
        mem[0xFF41] = stat
        # L'interrupt STAT scatta sul fronte di salita della linea combinata
        line = bool((stat & 0x40 and stat & 0x04)
                    or (stat & 0x08 and self.mode == self.MODE_HBLANK)
                    or (stat & 0x10 and self.mode == self.MODE_VBLANK)
                    or (stat & 0x20 and self.mode == self.MODE_OAM))
        if line and not self.stat_line:
            mem[0xFF0F] |= 0x02
        self.stat_line = line

    def tick(self, cycles):
        mem = self.memory.memory
        if not mem[0xFF40] & 0x80:
            # LCD spento: LY=0, modo 0
            if self.lcd_was_on:
                self.lcd_was_on = False
                self.mode_clock = 0
                self._set_ly(0)
                self._set_mode(self.MODE_HBLANK)
                self.stat_line = False
            return
        if not self.lcd_was_on:
            self.lcd_was_on = True
            self.mode_clock = 0
            self.window_line = 0
            self._set_mode(self.MODE_OAM)
            self._update_stat()

        self.mode_clock += cycles
        while True:
            if self.mode == self.MODE_OAM:
                if self.mode_clock < 80:
                    break
                self.mode_clock -= 80
                self._set_mode(self.MODE_TRANSFER)
            elif self.mode == self.MODE_TRANSFER:
                if self.mode_clock < 172:
                    break
                self.mode_clock -= 172
                self.draw_scanline()
                self._set_mode(self.MODE_HBLANK)
                self._update_stat()
            elif self.mode == self.MODE_HBLANK:
                if self.mode_clock < 204:
                    break
                self.mode_clock -= 204
                self._set_ly(self.line + 1)
                if self.line == 144:
                    self._set_mode(self.MODE_VBLANK)
                    mem[0xFF0F] |= 0x01
                    self.frame_ready = True
                else:
                    self._set_mode(self.MODE_OAM)
                self._update_stat()
            else:  # VBLANK
                if self.mode_clock < 456:
                    break
                self.mode_clock -= 456
                if self.line >= 153:
                    self._set_ly(0)
                    self.window_line = 0
                    self._set_mode(self.MODE_OAM)
                else:
                    self._set_ly(self.line + 1)
                self._update_stat()

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------
    @staticmethod
    def _palette(value):
        return np.array([(value >> (i * 2)) & 0x03 for i in range(4)], dtype=np.uint8)

    def _tile_row_colors(self, map_base, tile_x, tile_y_line, signed, xbits):
        """Restituisce gli indici colore (0-3) per una riga di pixel."""
        vram = self.vram
        tile_ids = vram[map_base + ((tile_y_line >> 3) & 31) * 32 + ((tile_x >> 3) & 31)].astype(np.int32)
        if signed:
            tile_ids = np.where(tile_ids > 127, tile_ids - 256, tile_ids)
            addr = 0x9000 + tile_ids * 16
        else:
            addr = 0x8000 + tile_ids * 16
        addr = addr + (tile_y_line & 7) * 2
        lo = vram[addr]
        hi = vram[addr + 1]
        bit = 7 - xbits
        return ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1)

    def draw_scanline(self):
        mem = self.memory.memory
        ly = self.line
        if ly >= self.SCREEN_HEIGHT:
            return
        lcdc = mem[0xFF40]
        signed = not lcdc & 0x10
        bg_colors = np.zeros(self.SCREEN_WIDTH, dtype=np.uint8)

        if lcdc & 0x01:
            # Sfondo
            scy, scx = mem[0xFF42], mem[0xFF43]
            map_base = 0x9C00 if lcdc & 0x08 else 0x9800
            xs = (self._xs + scx) & 0xFF
            y = (ly + scy) & 0xFF
            bg_colors = self._tile_row_colors(map_base, xs, y, signed, xs & 7).astype(np.uint8)

            # Finestra
            wy, wx = mem[0xFF4A], mem[0xFF4B] - 7
            if lcdc & 0x20 and ly >= wy and wx < self.SCREEN_WIDTH:
                start = max(wx, 0)
                wxs = self._xs[start:] - wx
                win_map = 0x9C00 if lcdc & 0x40 else 0x9800
                bg_colors[start:] = self._tile_row_colors(
                    win_map, wxs, self.window_line, signed, wxs & 7)
                self.window_line += 1

        line = self._palette(mem[0xFF47])[bg_colors]

        if lcdc & 0x02:
            self._draw_sprites(ly, lcdc, line, bg_colors)

        self.framebuffer[ly] = line

    def _draw_sprites(self, ly, lcdc, line, bg_colors):
        mem = self.memory.memory
        height = 16 if lcdc & 0x04 else 8
        # Al massimo 10 sprite per linea, in ordine di OAM
        sprites = []
        for i in range(0xFE00, 0xFEA0, 4):
            sy = mem[i] - 16
            if sy <= ly < sy + height:
                sprites.append((mem[i + 1] - 8, i))
                if len(sprites) == 10:
                    break
        # Priorità DMG: X minore vince, a parità vince l'indice OAM minore.
        # Disegniamo dal meno prioritario al più prioritario.
        sprites.sort(key=lambda s: (s[0], s[1]), reverse=True)
        pal0 = self._palette(mem[0xFF48])
        pal1 = self._palette(mem[0xFF49])
        for sx, i in sprites:
            sy = mem[i] - 16
            tile = mem[i + 2]
            attr = mem[i + 3]
            row = ly - sy
            if attr & 0x40:
                row = height - 1 - row
            if height == 16:
                tile &= 0xFE
            addr = 0x8000 + tile * 16 + row * 2
            lo, hi = mem[addr], mem[addr + 1]
            pal = pal1 if attr & 0x10 else pal0
            behind_bg = attr & 0x80
            for col in range(8):
                x = sx + col
                if not 0 <= x < self.SCREEN_WIDTH:
                    continue
                bit = col if attr & 0x20 else 7 - col
                cn = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1)
                if cn == 0:
                    continue
                if behind_bg and bg_colors[x] != 0:
                    continue
                line[x] = pal[cn]

    def render_screen(self, limit_fps=True):
        self.frame_ready = False
        if not self.headless:
            if not self.memory.memory[0xFF40] & 0x80:
                rgb = np.broadcast_to(self.COLORS[0], (self.SCREEN_WIDTH, self.SCREEN_HEIGHT, 3))
            else:
                rgb = self.COLORS[self.framebuffer.T]
            pygame.surfarray.blit_array(self.surface, rgb)
            pygame.transform.scale(self.surface, self.screen.get_size(), self.screen)
            pygame.display.flip()
        if limit_fps:
            self.clock.tick(60)
