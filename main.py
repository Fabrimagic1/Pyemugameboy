import os
import sys
import pygame
from memory import Memory
from cpu import CPU
from gpu import GPU
from timer import Timer
from apu import APU
from input_handler import InputHandler

CYCLES_PER_FRAME = 70224


def load_rom(memory, rom_path):
    if not os.path.exists(rom_path):
        print(f"Errore: ROM '{rom_path}' non trovata!")
        sys.exit(1)
    with open(rom_path, "rb") as f:
        rom_data = f.read()
    memory.load_rom(rom_data, rom_path)  # passiamo anche il nome per il save


def main():
    # ROM da riga di comando oppure chiesta all'utente
    if len(sys.argv) > 1:
        rom_path = sys.argv[1]
    else:
        rom_path = input(
            "Inserisci il nome della ROM da caricare (es: roms/pokemon_red.gb): "
        ).strip()

    # Inizializza componenti
    pygame.init()
    memory = Memory()
    load_rom(memory, rom_path)
    cpu = CPU(memory)
    gpu = GPU(memory)
    timer = Timer(memory)
    apu = APU(memory)
    input_handler = InputHandler(memory)

    print(f"Avvio emulazione ROM: {rom_path}")
    cycles_total = 0
    running = True
    try:
        while running and cpu.running:
            # Esegui istruzioni fino alla fine del frame (VBlank)
            frame_cycles = 0
            while frame_cycles < CYCLES_PER_FRAME:
                cycles = cpu.step()
                timer.tick(cycles)
                gpu.tick(cycles)
                apu.tick(cycles)
                frame_cycles += cycles
                if gpu.frame_ready:
                    break
            cycles_total += frame_cycles

            # Input e presentazione una volta per frame
            running = input_handler.update()
            gpu.render_screen()
    except KeyboardInterrupt:
        pass
    finally:
        # Al termine, salva automaticamente la RAM
        memory.save_ram()
        pygame.quit()

    print("Emulazione terminata.")
    print(f"Cicli totali eseguiti: {cycles_total}")


if __name__ == "__main__":
    main()
