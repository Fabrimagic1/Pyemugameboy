import os
import atexit

# Valori dei registri IO dopo la boot ROM del DMG
_IO_DEFAULTS = {
    0xFF00: 0xCF, 0xFF05: 0x00, 0xFF06: 0x00, 0xFF07: 0x00, 0xFF0F: 0xE1,
    0xFF10: 0x80, 0xFF11: 0xBF, 0xFF12: 0xF3, 0xFF14: 0xBF, 0xFF16: 0x3F,
    0xFF19: 0xBF, 0xFF1A: 0x7F, 0xFF1B: 0xFF, 0xFF1C: 0x9F, 0xFF1E: 0xBF,
    0xFF20: 0xFF, 0xFF23: 0xBF, 0xFF24: 0x77, 0xFF25: 0xF3, 0xFF26: 0xF1,
    0xFF40: 0x91, 0xFF41: 0x85, 0xFF47: 0xFC, 0xFF48: 0xFF, 0xFF49: 0xFF,
}


class Memory:
    """Mappa di memoria del Game Boy con supporto ROM-only, MBC1, MBC3 e MBC5,
    RAM esterna con salvataggio .sav, DMA OAM, joypad e porta seriale."""

    def __init__(self):
        # ROM e stato del cartridge
        self.rom_data = bytearray(0x8000)
        self.rom_filename = None
        self.mbc = 0             # 0 = nessuno, 1 = MBC1, 3 = MBC3, 5 = MBC5
        self.has_battery = False
        self.rom_bank_count = 2
        # Registri MBC
        self.ram_enabled = False
        self.rom_bank_low = 1
        self.rom_bank_high = 0
        self.bank_mode = 0       # MBC1: 0 = ROM banking, 1 = RAM banking
        self.ram_bank = 0
        self.rom_offset = 0x4000  # offset della bank mappata in 0x4000-0x7FFF
        # RAM esterna
        self.ram_bank_count = 0
        self.ram_banks = []
        # VRAM, WRAM, OAM, IO, HRAM, IE (indirizzati direttamente)
        self.memory = bytearray(0x10000)
        for addr, val in _IO_DEFAULTS.items():
            self.memory[addr] = val
        # Joypad: bit a 0 = tasto premuto (bit 0..3)
        self.joypad_buttons = 0x0F   # A, B, Select, Start
        self.joypad_dirs = 0x0F      # Destra, Sinistra, Su, Giù
        # Collegamenti ad altri componenti (impostati da main)
        self.timer = None
        self.apu = None
        # Output della porta seriale (usato dalle ROM di test)
        self.serial_output = []
        self._save_registered = False

    # ------------------------------------------------------------------
    # Caricamento ROM e salvataggi
    # ------------------------------------------------------------------
    def load_rom(self, rom_bytes: bytes, filename: str = None):
        if len(rom_bytes) < 0x150:
            raise ValueError("File ROM troppo piccolo o non valido")
        self.rom_data = bytearray(rom_bytes)
        # Arrotonda a un multiplo di 16KB
        if len(self.rom_data) % 0x4000:
            self.rom_data.extend(b'\xFF' * (0x4000 - len(self.rom_data) % 0x4000))
        self.rom_bank_count = max(2, len(self.rom_data) // 0x4000)
        if filename:
            self.rom_filename = filename

        cart_type = self.rom_data[0x147]
        if cart_type == 0x00 or cart_type in (0x08, 0x09):
            self.mbc = 0
        elif cart_type in (0x01, 0x02, 0x03):
            self.mbc = 1
        elif 0x0F <= cart_type <= 0x13:
            self.mbc = 3
        elif 0x19 <= cart_type <= 0x1E:
            self.mbc = 5
        else:
            print(f"Attenzione: tipo di cartridge 0x{cart_type:02X} non supportato, uso MBC1")
            self.mbc = 1
        self.has_battery = cart_type in (0x03, 0x06, 0x09, 0x0D, 0x0F, 0x10,
                                         0x13, 0x1B, 0x1E, 0xFF)

        # Numero di RAM banks dall'header (0x149)
        ram_size_code = self.rom_data[0x149]
        ram_bank_map = {0: 0, 1: 1, 2: 1, 3: 4, 4: 16, 5: 8}
        self.ram_bank_count = ram_bank_map.get(ram_size_code, 0)
        self.ram_banks = [bytearray(b'\xFF' * 0x2000) for _ in range(self.ram_bank_count)]
        self._update_rom_offset()
        self._load_save()
        if not self._save_registered:
            atexit.register(self.save_ram)
            self._save_registered = True

    def _sav_name(self):
        return os.path.splitext(self.rom_filename)[0] + '.sav'

    def _load_save(self):
        if not self.rom_filename or not self.has_battery or self.ram_bank_count == 0:
            return
        sav_name = self._sav_name()
        if os.path.exists(sav_name):
            with open(sav_name, 'rb') as f:
                data = f.read()
            for i in range(self.ram_bank_count):
                start = i * 0x2000
                self.ram_banks[i][:] = data[start:start + 0x2000].ljust(0x2000, b'\xFF')

    def save_ram(self):
        if not self.rom_filename or not self.has_battery or self.ram_bank_count == 0:
            return
        with open(self._sav_name(), 'wb') as f:
            for bank in self.ram_banks:
                f.write(bank)

    # ------------------------------------------------------------------
    # MBC
    # ------------------------------------------------------------------
    def _update_rom_offset(self):
        if self.mbc == 1:
            bank = (self.rom_bank_low & 0x1F) | (self.rom_bank_high << 5)
        elif self.mbc == 3:
            bank = self.rom_bank_low & 0x7F
        elif self.mbc == 5:
            bank = self.rom_bank_low | (self.rom_bank_high << 8)
        else:
            bank = 1
        bank %= self.rom_bank_count
        self.rom_offset = bank * 0x4000

    def _current_ram_bank(self):
        if self.mbc == 1:
            bank = self.rom_bank_high if self.bank_mode else 0
        else:
            bank = self.ram_bank
        return bank % self.ram_bank_count

    def _write_mbc(self, address, value):
        if self.mbc == 0:
            return
        if address < 0x2000:
            self.ram_enabled = (value & 0x0F) == 0x0A
        elif address < 0x4000:
            if self.mbc == 1:
                self.rom_bank_low = (value & 0x1F) or 1
            elif self.mbc == 3:
                self.rom_bank_low = (value & 0x7F) or 1
            else:  # MBC5
                if address < 0x3000:
                    self.rom_bank_low = value
                else:
                    self.rom_bank_high = value & 0x01
            self._update_rom_offset()
        elif address < 0x6000:
            if self.mbc == 1:
                self.rom_bank_high = value & 0x03
                self._update_rom_offset()
            else:
                # MBC3: 0x00-0x03 RAM bank, 0x08-0x0C registri RTC (non emulati)
                self.ram_bank = value & 0x0F
        else:
            if self.mbc == 1:
                self.bank_mode = value & 0x01

    def _ram_accessible(self):
        if not self.ram_enabled or self.ram_bank_count == 0:
            return False
        if self.mbc == 3 and self.ram_bank > 3:
            return False  # registro RTC selezionato
        return True

    # ------------------------------------------------------------------
    # Lettura / scrittura
    # ------------------------------------------------------------------
    def read_byte(self, address: int) -> int:
        if address < 0x4000:
            if self.mbc == 1 and self.bank_mode:
                bank = (self.rom_bank_high << 5) % self.rom_bank_count
                return self.rom_data[bank * 0x4000 + address]
            return self.rom_data[address]
        if address < 0x8000:
            return self.rom_data[self.rom_offset + address - 0x4000]
        if address < 0xA000:
            return self.memory[address]
        if address < 0xC000:
            if self._ram_accessible():
                return self.ram_banks[self._current_ram_bank()][address - 0xA000]
            return 0xFF
        if address < 0xE000:
            return self.memory[address]
        if address < 0xFE00:
            return self.memory[address - 0x2000]  # echo RAM
        if address < 0xFF00:
            return self.memory[address] if address < 0xFEA0 else 0xFF
        if address == 0xFF00:
            sel = self.memory[0xFF00] & 0x30
            res = 0x0F
            if not sel & 0x10:
                res &= self.joypad_dirs
            if not sel & 0x20:
                res &= self.joypad_buttons
            return 0xC0 | sel | res
        if address == 0xFF0F:
            return self.memory[address] | 0xE0
        if address == 0xFF41:
            return self.memory[address] | 0x80
        if address <= 0xFFFF:
            return self.memory[address]
        raise ValueError(f"Indirizzo fuori range: {hex(address)}")

    def write_byte(self, address: int, value: int):
        value &= 0xFF
        if address < 0x8000:
            self._write_mbc(address, value)
        elif address < 0xA000:
            self.memory[address] = value
        elif address < 0xC000:
            if self._ram_accessible():
                self.ram_banks[self._current_ram_bank()][address - 0xA000] = value
        elif address < 0xE000:
            self.memory[address] = value
        elif address < 0xFE00:
            self.memory[address - 0x2000] = value  # echo RAM
        elif address < 0xFF00:
            if address < 0xFEA0:
                self.memory[address] = value
        elif address == 0xFF00:
            self.memory[address] = value & 0x30
        elif address == 0xFF02:
            self.memory[address] = value
            if value & 0x81 == 0x81:
                # Trasferimento seriale istantaneo senza cavo collegato
                self.serial_output.append(chr(self.memory[0xFF01]))
                self.memory[0xFF01] = 0xFF
                self.memory[0xFF02] = value & 0x7F
                self.memory[0xFF0F] |= 0x08
        elif address == 0xFF04:
            self.memory[address] = 0
            if self.timer:
                self.timer.reset_div()
        elif 0xFF10 <= address < 0xFF40:
            self.memory[address] = value
            if self.apu:
                self.apu.on_write(address, value)
        elif address == 0xFF41:
            self.memory[address] = (self.memory[address] & 0x07) | (value & 0x78)
        elif address == 0xFF44:
            pass  # LY è di sola lettura
        elif address == 0xFF46:
            self.memory[address] = value
            src = value << 8
            for i in range(0xA0):
                self.memory[0xFE00 + i] = self.read_byte(src + i)
        elif address <= 0xFFFF:
            self.memory[address] = value
        else:
            raise ValueError(f"Indirizzo fuori range: {hex(address)}")

    def set_joypad(self, group, bit, pressed):
        """Aggiorna un tasto. group 0 = pulsanti (A, B, Select, Start),
        group 1 = direzioni (Destra, Sinistra, Su, Giù)."""
        mask = 1 << bit
        old = self.joypad_buttons if group == 0 else self.joypad_dirs
        new = (old & ~mask) if pressed else (old | mask)
        if group == 0:
            self.joypad_buttons = new
        else:
            self.joypad_dirs = new
        if pressed and old & mask:
            self.request_interrupt(4)  # Joypad

    def request_interrupt(self, bit):
        self.memory[0xFF0F] |= 1 << bit
