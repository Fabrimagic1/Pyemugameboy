#!/usr/bin/env python3
"""Esegue una ROM nell'emulatore senza finestra, con input da script e screenshot.
Uso: headless.py ROM "script" out_prefix
script: sequenza di token separati da spazio: 'wN' attende N frame, 'tasto:N' preme per N frame.
tasti: a b start select up down left right; 'shot' salva uno screenshot."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
from PIL import Image
from memory import Memory
from cpu import CPU
from gpu import GPU
from timer import Timer

KEYS = {"a": (0, 0), "b": (0, 1), "select": (0, 2), "start": (0, 3),
        "right": (1, 0), "left": (1, 1), "up": (1, 2), "down": (1, 3)}
PAL = np.array([(224, 248, 208), (136, 192, 112), (52, 104, 86), (8, 24, 32)], dtype=np.uint8)


class Runner:
    def __init__(self, rom):
        self.mem = Memory()
        self.mem.load_rom(open(rom, "rb").read(), None)
        self.cpu = CPU(self.mem)
        self.gpu = GPU(self.mem, headless=True)
        self.timer = Timer(self.mem)
        self.shots = 0

    def frame(self):
        n = 0
        while n < 70224:
            c = self.cpu.step()
            self.timer.tick(c)
            self.gpu.tick(c)
            n += c
            if self.gpu.frame_ready:
                self.gpu.frame_ready = False
                break

    def shot(self, path):
        img = PAL[self.gpu.framebuffer]
        Image.fromarray(img).resize((480, 432), Image.NEAREST).save(path)

    def run(self, script, prefix):
        for tok in script.split():
            if tok == "shot":
                self.shot("%s_%02d.png" % (prefix, self.shots)); self.shots += 1
            elif tok[0] == "w":
                for _ in range(int(tok[1:])): self.frame()
            else:
                k, n = tok.split(":")
                g, b = KEYS[k]
                self.mem.set_joypad(g, b, True)
                for _ in range(int(n)): self.frame()
                self.mem.set_joypad(g, b, False)
                for _ in range(3): self.frame()


if __name__ == "__main__":
    r = Runner(sys.argv[1])
    r.run(sys.argv[2], sys.argv[3])
    print("PC=%04X" % r.cpu.pc if hasattr(r.cpu, "pc") else "done")
