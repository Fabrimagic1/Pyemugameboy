import pygame
import numpy as np

class APU:
    SAMPLE_RATE = 44100

    def __init__(self, memory):
        self.memory = memory
        pygame.mixer.init(frequency=self.SAMPLE_RATE, size=-16, channels=1)
        self.buf_size = 2048
        self.buffer = np.zeros(self.buf_size, dtype=np.int16)
        self.sound = pygame.sndarray.make_sound(self.buffer)
        self.chan = self.sound.play(-1)
        self.phase = 0
        self.freq = 440
        self.enabled = False

    def tick(self, cycles):
        nr52 = self.memory.read_byte(0xFF26)
        self.enabled = bool(nr52&0x80)
        if not self.enabled: return
        nr13 = self.memory.read_byte(0xFF13)
        nr14 = self.memory.read_byte(0xFF14)
        val = ((nr14&0x07)<<8)|nr13
        if val: self.freq=131072/(2048-val)
        if not self.chan.get_queue():
            t = (np.arange(self.buf_size)+self.phase)/self.SAMPLE_RATE
            wave = 32767*np.sign(np.sin(2*np.pi*self.freq*t))
            self.buffer[:] = wave.astype(np.int16)
            self.phase = (self.phase+self.buf_size)%self.SAMPLE_RATE
            self.sound = pygame.sndarray.make_sound(self.buffer)
            self.chan.queue(self.sound)
