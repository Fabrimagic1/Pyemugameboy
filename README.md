# PyEmu Game Boy

A Game Boy (DMG) emulator written in Python, with a full-speed browser version.

### ▶ [Play in your browser](https://fabrimagic1.github.io/Pyemugameboy/)

Open the page, press **Carica ROM** and pick a `.gb` file from your computer. No installation needed.
The ROM stays only in the memory of that browser tab: it is never uploaded or saved, so closing the
page discards it together with any in-game saves.

- **Desktop version** (`main.py`): pure Python with pygame, about 50-70% of real speed
- **Browser version** (`web/`): JavaScript port of the same design, 60 FPS with full sound
- The CPU passes all of Blargg's `cpu_instrs` tests and the PPU renders `dmg-acid2` correctly

## Features

- **CPU**: complete SM83 instruction set (including the CB prefix), `HALT`, delayed `EI`, interrupts
- **Cartridges**: ROM-only, MBC1, MBC3 (without real-time clock) and MBC5
- **PPU**: background, window, sprites (8x8/8x16, 10 per line, DMG priority), LCD modes,
  STAT/LYC and VBlank interrupts, OAM DMA
- **Timers**: DIV and TIMA with interrupt generation
- **Input**: keyboard on desktop; keyboard, mouse and touch buttons in the browser
- **Sound**
  - Browser: all four channels (two square waves with sweep and envelope, wave, noise) with stereo mixing
  - Desktop: square channels 1 and 2 with length and envelope (runs silently without an audio device)
- **Saves**: battery-backed RAM is written to a `.sav` file next to the ROM (desktop version only)

## Controls

| Game Boy | Keyboard |
|----------|----------|
| D-pad    | Arrow keys |
| A        | Z |
| B        | X |
| Start    | Enter |
| Select   | Backspace |

In the desktop version, Esc closes the emulator.

## Desktop version

Requirements: **Python** 3.8 or higher, **pygame**, **numpy**.

```bash
pip install -r requirements.txt
python main.py roms/your_game.gb
```

You can also run `python main.py` and type the ROM path when prompted. Close the window, press Esc
or Ctrl+C to exit; battery-backed RAM is saved automatically.

## Browser version

The online version is published from the `gh-pages` branch. To run it locally, serve the project
over HTTP from its root:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/web/>.

## Project structure

```
├── main.py            # Desktop entry point and main loop
├── cpu.py             # CPU core: instructions, interrupts, timing
├── memory.py          # Memory map, MBC1/MBC3/MBC5, external RAM, .sav files, joypad
├── gpu.py             # PPU: LCD timing, background, window, sprites
├── timer.py           # DIV/TIMA timer with interrupt generation
├── apu.py             # Basic sound (square channels 1 and 2)
├── input_handler.py   # Keyboard-to-joypad mapping
├── web/
│   ├── index.html     # Browser interface
│   └── gb.js          # JavaScript port of the emulator with full APU
└── requirements.txt   # Python dependencies
```

## Legal notice

- This emulator does **not** include Nintendo's boot ROM; it starts from the post-boot register state.
- **Game ROMs are not included.** Only load ROMs you legally own.
- Test ROMs and homebrew games (e.g. Blargg's test ROMs) can be used freely.

## Contributing

Pull requests and issues are welcome, for example for:
- Wave and noise channels in the desktop version
- Game Boy Color support
- MBC3 real-time clock, MBC2
- Timing accuracy and performance
