# GameBoy Emulator in Python No Working cause pc exception

A full-featured GameBoy emulator written in pure Python, supporting MBC1, save files, PPU, basic APU, and more.

## Requirements

- **Python** 3.8 or higher
- **pygame**
- **numpy**

## Installation

1. Clone or download this repository.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `roms/` folder and place your ROM files there (e.g. `pokemon_red.gb`).

## Usage

From the project root:
```bash
python main.py
```
1. When prompted, enter the ROM filename (e.g. `roms/pokemon_red.gb`).
2. Controls:
   - **A**: Z key
   - **B**: X key
   - **Select**: Backspace
   - **Start**: Enter
   - **Directional Pad**: Arrow keys
3. Save files (`.sav`) are created automatically next to the ROM.
4. Close the window or press Ctrl+C to exit; RAM is saved automatically.

## Project Structure

```
/gameboy_emulator/
├── main.py            # Entry point and main loop (cycle-accurate)
├── cpu.py             # CPU core, instructions, interrupts, timing
├── memory.py          # Memory map, MBC1, external RAM, save/load .sav
├── gpu.py             # PPU, background & sprite rendering via pygame
├── timer.py           # DIV/TIMA timer with interrupt generation
├── apu.py             # Basic Audio Processing Unit (square wave channel)
├── input_handler.py   # Keyboard-to-joypad mapping and Joypad interrupt
├── roms/              # Folder for your ROM files
├── requirements.txt   # Python dependencies
└── README.md          # This documentation
```

## Features

- **Cycle-accurate CPU** with complete opcode set, `EI`/`DI`, interrupt handling
- **MBC1** memory bank controller (ROM/RAM banking) and persistent save files
- **Full PPU emulation**: background, sprites, VBlank interrupt, 60 FPS rendering
- **Basic APU**: square wave channel for music and sound effects
- **DIV & TIMA timers** with proper interrupt generation
- **Keyboard input** mapped to GameBoy controls, with Joypad interrupt

## Legal & BIOS Notice

- This emulator does **not** include Nintendo’s proprietary BIOS; it uses a placeholder initialization to remain fully legal.
- **Game ROMs** are **not** included. Only load ROMs you legally own.
- **Test ROMs** and **homebrew** code (e.g. Blargg’s test ROMs) can be used freely.

## Contributing

Feel free to submit pull requests or report issues for:
- Additional APU channels (wave, noise)
- Enhanced PPU features (window, color palettes)
- Support for other MBC controllers (MBC3, MBC5)
- Improved timing accuracy and performance optimizations

Enjoy your retro gaming experience in Python! 🎮
