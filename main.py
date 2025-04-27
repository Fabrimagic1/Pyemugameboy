import os
from memory import Memory
from cpu import CPU
from gpu import GPU
from timer import Timer
from apu import APU
from input_handler import InputHandler

def load_rom(memory, rom_path):
    if not os.path.exists(rom_path):
        print(f"Errore: ROM '{rom_path}' non trovata!")
        exit(1)
    with open(rom_path, "rb") as f:
        rom_data = f.read()
    memory.load_rom(rom_data, rom_path)  # passiamo anche il nome per il save

def main():
    # Chiedi all'utente la ROM
    rom_path = input(
        "Inserisci il nome della ROM da caricare (es: pokemon_red.gb): "
    ).strip()

    # Inizializza componenti
    memory = Memory()
    load_rom(memory, rom_path)
    cpu = CPU(memory)
    gpu = GPU(memory)
    timer = Timer(memory)
    apu = APU(memory)
    input_handler = InputHandler(memory)

    # Loop principale con ciclo-accurato
    print(f"Avvio emulazione ROM: {rom_path}")
    cycles_total = 0
    while cpu.running:
        # Gestione input/tasti
        input_handler.update()

        # Esegui un'istruzione e ottieni cicli impiegati
        cycles = cpu.step()
        cycles_total += cycles

        # Aggiorna i componenti con lo stesso numero di cicli
        timer.tick(cycles)
        gpu.tick(cycles)
        apu.tick(cycles)

    # Al termine, salva automaticamente la RAM
    memory.save_ram()

    print("Emulazione terminata.")
    print(f"Istruzione totali eseguite: {cycles_total}")

if __name__ == "__main__":
    main()
