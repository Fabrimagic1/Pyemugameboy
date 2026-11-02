#!/usr/bin/env python3
"""Calcola checksum dell'header e globale di una ROM Game Boy da 32KB."""
import sys

src, dst = sys.argv[1], sys.argv[2]
rom = bytearray(open(src, "rb").read())
rom += bytes(max(0, 32768 - len(rom)))
chk = 0
for b in rom[0x134:0x14D]:
    chk = (chk - b - 1) & 0xFF
rom[0x14D] = chk
rom[0x14E] = rom[0x14F] = 0
g = sum(rom) & 0xFFFF
rom[0x14E], rom[0x14F] = g >> 8, g & 0xFF
open(dst, "wb").write(rom)
print("ROM %s: %d byte, checksum header %02X" % (dst, len(rom), chk))
