"""Collegamento tra l'emulatore Python e la pagina web (eseguito in Pyodide).

La ROM viene passata come bytes e tenuta solo in memoria: nessun file .sav
viene scritto, quindi chiudendo la pagina ROM e salvataggi vanno persi."""
import numpy as np
from memory import Memory
from cpu import CPU
from gpu import GPU
from timer import Timer

CYCLES_PER_FRAME = 70224


class WebEmulator:
    def __init__(self, rom_bytes):
        self.memory = Memory()
        self.memory.load_rom(bytes(rom_bytes))  # senza nome file: niente .sav
        self.cpu = CPU(self.memory)
        self.gpu = GPU(self.memory, headless=True)
        self.timer = Timer(self.memory)
        self.rgba = np.full((GPU.SCREEN_HEIGHT, GPU.SCREEN_WIDTH, 4), 255, dtype=np.uint8)

    def title(self):
        raw = bytes(self.memory.rom_data[0x134:0x144])
        return raw.split(b'\x00')[0].decode('ascii', 'replace').strip()

    def run_frame(self):
        """Esegue un frame e restituisce i pixel RGBA (160x144)."""
        cpu, timer, gpu = self.cpu, self.timer, self.gpu
        frame_cycles = 0
        while frame_cycles < CYCLES_PER_FRAME:
            cycles = cpu.step()
            timer.tick(cycles)
            gpu.tick(cycles)
            frame_cycles += cycles
            if gpu.frame_ready:
                break
        gpu.frame_ready = False
        self.rgba[:, :, :3] = gpu.frame_rgb()
        return self.rgba.tobytes()

    def set_key(self, group, bit, pressed):
        self.memory.set_joypad(group, bit, bool(pressed))
