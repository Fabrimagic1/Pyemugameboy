import pygame

# Tasto -> (gruppo, bit). Gruppo 0 = pulsanti, 1 = direzioni
KEY_MAP = {
    pygame.K_z: (0, 0),          # A
    pygame.K_x: (0, 1),          # B
    pygame.K_BACKSPACE: (0, 2),  # Select
    pygame.K_RETURN: (0, 3),     # Start
    pygame.K_RIGHT: (1, 0),
    pygame.K_LEFT: (1, 1),
    pygame.K_UP: (1, 2),
    pygame.K_DOWN: (1, 3),
}


class InputHandler:
    """Legge gli eventi di pygame e aggiorna lo stato del joypad in memoria.
    update() restituisce False quando l'utente chiude la finestra."""

    def __init__(self, memory):
        self.memory = memory

    def update(self):
        mem = self.memory
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                return False
            if event.type in (pygame.KEYDOWN, pygame.KEYUP) and event.key in KEY_MAP:
                group, bit = KEY_MAP[event.key]
                mask = 1 << bit
                pressed = event.type == pygame.KEYDOWN
                if group == 0:
                    old = mem.joypad_buttons
                    mem.joypad_buttons = (old & ~mask) if pressed else (old | mask)
                else:
                    old = mem.joypad_dirs
                    mem.joypad_dirs = (old & ~mask) if pressed else (old | mask)
                if pressed and old & mask:
                    mem.request_interrupt(4)  # Joypad
        return True
