import os
import atexit

class Memory:
    def __init__(self):
        # Register auto-save at exit
        atexit.register(self.save_ram)
        # ROM data e caratteristiche MBC1
        self.rom_data = bytearray()
        self.rom_filename = None
        # MBC1 registers
        self.ram_enabled = False
        self.rom_bank_low5 = 1
        self.rom_bank_high2 = 0
        self.bank_mode = 0  # 0 = ROM banking, 1 = RAM banking
        # RAM banks
        self.ram_bank_count = 0
        self.ram_banks = []
        # Memoria IO e VRAM/OAM
        self.memory = [0x00] * 0x10000

    def load_rom(self, rom_bytes: bytes, filename: str = None):
        # Carica ROM e inizializza MBC1/RAM estesa
        self.rom_data = bytearray(rom_bytes)
        if filename:
            self.rom_filename = filename
        # Determina numero di RAM banks dal header (0x149)
        ram_size_code = self.rom_data[0x149]
        ram_bank_map = {0:0, 1:1, 2:1, 3:4, 4:16, 5:8}
        self.ram_bank_count = ram_bank_map.get(ram_size_code, 0)
        self.ram_banks = [bytearray(0x2000) for _ in range(self.ram_bank_count)]
        # Carica stato RAM da file .sav se esiste
        self._load_save()

    def _load_save(self):
        if not self.rom_filename or self.ram_bank_count == 0:
            return
        sav_name = os.path.splitext(self.rom_filename)[0] + '.sav'
        if os.path.exists(sav_name):
            data = open(sav_name, 'rb').read()
            for i in range(self.ram_bank_count):
                start = i * 0x2000
                end = start + 0x2000
                self.ram_banks[i][:] = data[start:end].ljust(0x2000, b'\xFF')

    def save_ram(self):
        if not self.rom_filename or self.ram_bank_count == 0:
            return
        sav_name = os.path.splitext(self.rom_filename)[0] + '.sav'
        with open(sav_name, 'wb') as f:
            for bank in self.ram_banks:
                f.write(bank)

    def _current_rom_bank(self) -> int:
        # Calcola numero della ROM bank corrente (MBC1)
        bank = self.rom_bank_low5 | (self.rom_bank_high2 << 5)
        mask = max(1, len(self.rom_data) // 0x4000)
        return bank % mask

    def read_byte(self, address: int) -> int:
        # ROM area 0x0000-0x3FFF (bank 0)
        if 0x0000 <= address < 0x4000:
            return self.rom_data[address]
        # ROM area 0x4000-0x7FFF (bank switchable)
        if 0x4000 <= address < 0x8000:
            bank = self._current_rom_bank()
            idx = bank * 0x4000 + (address - 0x4000)
            return self.rom_data[idx] if idx < len(self.rom_data) else 0xFF
        # RAM external 0xA000-0xBFFF
        if 0xA000 <= address < 0xC000:
            if self.ram_enabled and self.ram_bank_count > 0:
                bank = self.rom_bank_high2 if self.bank_mode else 0
                offset = address - 0xA000
                return self.ram_banks[bank][offset]
            return 0xFF
        # IO, VRAM, OAM, work RAM
        if 0x0000 <= address < 0x10000:
            return self.memory[address]
        raise ValueError(f"Indirizzo fuori range: {hex(address)}")
