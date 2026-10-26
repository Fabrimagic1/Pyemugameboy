import numpy as np
import pygame


class SquareChannel:
    DUTY = (0.125, 0.25, 0.5, 0.75)

    def __init__(self, base):
        self.base = base          # 0xFF10 (canale 1) o 0xFF15 (canale 2)
        self.enabled = False
        self.volume = 0
        self.env_period = 0
        self.env_up = False
        self.env_timer = 0
        self.length = 0
        self.length_enabled = False
        self.phase = 0.0

    def trigger(self, mem):
        nrx1 = mem[self.base + 1]
        nrx2 = mem[self.base + 2]
        self.enabled = bool(nrx2 & 0xF8)   # DAC acceso
        if self.length == 0:
            self.length = 64 - (nrx1 & 0x3F)
        self.volume = nrx2 >> 4
        self.env_up = bool(nrx2 & 0x08)
        self.env_period = nrx2 & 0x07
        self.env_timer = self.env_period

    def step_length(self):
        if self.length_enabled and self.length > 0:
            self.length -= 1
            if self.length == 0:
                self.enabled = False

    def step_envelope(self):
        if not self.env_period:
            return
        self.env_timer -= 1
        if self.env_timer <= 0:
            self.env_timer = self.env_period
            if self.env_up and self.volume < 15:
                self.volume += 1
            elif not self.env_up and self.volume > 0:
                self.volume -= 1

    def render(self, mem, n, rate):
        if not self.enabled or self.volume == 0:
            return np.zeros(n, dtype=np.float32)
        val = ((mem[self.base + 4] & 0x07) << 8) | mem[self.base + 3]
        freq = 131072 / (2048 - val)
        if freq > rate / 2:
            return np.zeros(n, dtype=np.float32)
        duty = self.DUTY[mem[self.base + 1] >> 6]
        phases = (self.phase + np.arange(n) * freq / rate) % 1.0
        self.phase = (self.phase + n * freq / rate) % 1.0
        return np.where(phases < duty, 1.0, -1.0).astype(np.float32) * (self.volume / 15)


class APU:
    """APU semplificata: canali a onda quadra 1 e 2 con durata e inviluppo.
    Se non è disponibile un dispositivo audio l'emulazione prosegue muta."""

    SAMPLE_RATE = 44100
    CHUNK = 1024
    FRAME_SEQ_PERIOD = 8192  # 512 Hz

    def __init__(self, memory):
        self.memory = memory
        self.ch1 = SquareChannel(0xFF10)
        self.ch2 = SquareChannel(0xFF15)
        self.seq_clock = 0
        self.seq_step = 0
        self.check_clock = 0
        self.audio_ok = False
        try:
            pygame.mixer.init(frequency=self.SAMPLE_RATE, size=-16, channels=2,
                              buffer=self.CHUNK)
            init = pygame.mixer.get_init()
            if init:
                self.SAMPLE_RATE, _, self.out_channels = init
                self.chan = pygame.mixer.Channel(0)
                self.audio_ok = True
        except pygame.error as e:
            print(f"Audio non disponibile ({e}), emulazione senza suono.")
        memory.apu = self

    def on_write(self, address, value):
        mem = self.memory.memory
        if address == 0xFF26 and not value & 0x80:
            self.ch1.enabled = self.ch2.enabled = False
        for ch in (self.ch1, self.ch2):
            if address == ch.base + 1:
                ch.length = 64 - (value & 0x3F)
            elif address == ch.base + 2 and not value & 0xF8:
                ch.enabled = False
            elif address == ch.base + 4:
                ch.length_enabled = bool(value & 0x40)
                if value & 0x80 and mem[0xFF26] & 0x80:
                    ch.trigger(mem)

    def tick(self, cycles):
        self.seq_clock += cycles
        while self.seq_clock >= self.FRAME_SEQ_PERIOD:
            self.seq_clock -= self.FRAME_SEQ_PERIOD
            if self.seq_step % 2 == 0:
                self.ch1.step_length()
                self.ch2.step_length()
            if self.seq_step == 7:
                self.ch1.step_envelope()
                self.ch2.step_envelope()
            self.seq_step = (self.seq_step + 1) % 8

        if not self.audio_ok:
            return
        self.check_clock += cycles
        if self.check_clock < 4096:
            return
        self.check_clock = 0
        if self.chan.get_queue() is not None:
            return
        self._queue_chunk()

    def _queue_chunk(self):
        mem = self.memory.memory
        n = self.CHUNK
        if mem[0xFF26] & 0x80:
            wave = (self.ch1.render(mem, n, self.SAMPLE_RATE)
                    + self.ch2.render(mem, n, self.SAMPLE_RATE)) * 0.15
        else:
            wave = np.zeros(n, dtype=np.float32)
        samples = (wave * 32767).astype(np.int16)
        if self.out_channels > 1:
            samples = np.repeat(samples[:, None], self.out_channels, axis=1)
        sound = pygame.sndarray.make_sound(np.ascontiguousarray(samples))
        if self.chan.get_busy():
            self.chan.queue(sound)
        else:
            self.chan.play(sound)
