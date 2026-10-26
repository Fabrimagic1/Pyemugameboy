# GameBoy Emulator in Python

A GameBoy (DMG) emulator written in Python, supporting ROM-only/MBC1/MBC3/MBC5 cartridges, save files, PPU (background, window, sprites), a basic APU, and more.

The CPU passes all of Blargg's `cpu_instrs` tests and the PPU renders `dmg-acid2` correctly. Being pure Python it runs at roughly 50-70% of real speed on a modern PC.

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
python main.py roms/pokemon_red.gb
```
1. Pass the ROM path as an argument, or run `python main.py` and enter it when prompted.
2. Controls:
   - **A**: Z key
   - **B**: X key
   - **Select**: Backspace
   - **Start**: Enter
   - **Directional Pad**: Arrow keys
3. Save files (`.sav`) are created automatically next to the ROM.
4. Close the window, press Esc or Ctrl+C to exit; battery-backed RAM is saved automatically.

## Browser version (temporary ROMs)

The `web/` folder runs the same Python emulator in the browser through [Pyodide](https://pyodide.org).
You pick a ROM file from your computer: it stays only in the memory of that browser tab, is never
uploaded to a server and is never saved. Closing or reloading the page discards the ROM and any
in-game saves.

The page must be served over HTTP (Web Workers don't run from `file://`). From the project root:
```bash
python -m http.server 8000
```
Then open <http://localhost:8000/web/> and press **Carica ROM** (or drag a `.gb` file onto the page).
Keyboard controls are the same as the desktop version; on-screen buttons work with mouse and touch.
The same folder also works on GitHub Pages if Pages is enabled for the repository root.
Sound is not available in the browser version.

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
├── web/               # Browser version (Pyodide): index.html, worker.js, emu_web.py
├── roms/              # Folder for your ROM files
├── requirements.txt   # Python dependencies
└── README.md          # This documentation
```

## Features

- **CPU** with the complete opcode set (including CB prefix), `HALT`, delayed `EI`, interrupt handling
- **MBC1, MBC3 (without RTC) and MBC5** memory bank controllers and persistent save files
- **PPU emulation**: background, window, sprites (8x8/8x16, 10 per line), LCD modes, STAT/LYC and VBlank interrupts, OAM DMA, 60 FPS rendering
- **Basic APU**: square wave channels 1 and 2 with length and volume envelope (runs silently if no audio device is available)
- **DIV & TIMA timers** with proper interrupt generation
- **Keyboard input** mapped to GameBoy controls, with Joypad interrupt

## Legal & BIOS Notice

- This emulator does **not** include Nintendo’s proprietary BIOS; it uses a placeholder initialization to remain fully legal.
- **Game ROMs** are **not** included. Only load ROMs you legally own.
- **Test ROMs** and **homebrew** code (e.g. Blargg’s test ROMs) can be used freely.

## Contributing

Feel free to submit pull requests or report issues for:
- Additional APU channels (wave, noise)
- Enhanced PPU features (Game Boy Color palettes)
- MBC3 real-time clock, MBC2
- Improved timing accuracy and performance optimizations

Enjoy your retro gaming experience in Python! 🎮
