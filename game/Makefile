# Richiede SDCC (>= 4.2, porta sm83): apt-get install sdcc
SDCC ?= sdcc
ROM  ?= ../roms/monster_dungeon.gb

all: $(ROM)

data.h: ../tools/gen_data.py
	python3 ../tools/gen_data.py

crt0.rel: crt0.s
	sdasgb -plosgff crt0.s

main.rel: main.c data.h
	$(SDCC) -msm83 --opt-code-size --no-std-crt0 -c main.c -o main.rel

main.ihx: crt0.rel main.rel
	sdldgb -n -m -i main.ihx -b _CODE=0x0200 -b _DATA=0xC000 -k /usr/share/sdcc/lib/sm83 -l sm83 crt0.rel main.rel

$(ROM): main.ihx
	makebin -s 32768 main.ihx main.bin
	python3 ../tools/fix_rom.py main.bin $(ROM)

clean:
	rm -f *.rel *.ihx *.bin *.lst *.sym *.map *.asm *.lk *.noi *.rst
