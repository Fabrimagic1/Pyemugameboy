# MONSTER DUNGEON - guida

Gioco per Game Boy (ROM `roms/monster_dungeon.gb`, 32 KB, salvataggio su batteria) scritto in C con SDCC.
Si gioca nell'emulatore del repository (`python main.py roms/monster_dungeon.gb`) o nella versione web (pulsante *Carica ROM*).

## Come si gioca
- **Croce**: muovi l'eroe / scorri i menu. **A**: parla, conferma. **B**: indietro. **Start**: menu (Mostri, Box, Stato, Salva).
- Parti a **Borgo Alba**: scegli uno tra 4 mostri iniziali (Terra, Acqua, Fuoco, Vento), livello 5.
- **Casa** (porta a destra): l'infermiera cura la squadra, il mercante vende sfere di cattura.
- **Palestra** (porta a sinistra): il **Capo Bruno** (specialista TERRA, 3 mostri) e' il primo capo da battere; ti da il Badge Terra.
- **Caverna** (angolo in basso a destra): dungeon **procedurale** a piani infiniti. Ogni piano e' diverso (stanze e corridoi
  generati dal seme della partita e dal numero del piano); piu' scendi, piu' i mostri sono forti (fino a Lv 100).
- Nei combattimenti selvatici puoi **catturare** i mostri con le sfere (piu' sono feriti, piu' e' facile). Fino a 6 in squadra, gli altri vanno nel **Box** (30).
- I mostri guadagnano XP, salgono fino al **livello 100** ed **evolvono** ai livelli 16 e 36.

## Il mondo dei mostri
- 120 mostri: 4 elementi x 10 famiglie x 3 stadi di evoluzione. Gli sprite 48x48 sono **generati proceduralmente** dal codice (forme,
  contorno, luci, texture e tratti distintivi dell'elemento), quindi non occupano spazio nella ROM.
- Ciclo degli elementi: **TERRA > ACQUA > FUOCO > VENTO > TERRA** (x2 / x0.5), bonus STAB x1.5.
- Mosse per mostro ed elemento: [MOSSE.md](MOSSE.md). Elenco completo dei mostri: [MOSTRI.md](MOSTRI.md).

## Compilare
```bash
sudo apt-get install sdcc
cd game && make
```
`tools/gen_data.py` genera `game/data.h` (tabelle, tile, mappe) e i documenti; `tools/headless.py` esegue la ROM senza finestra
con input da script e screenshot (utile per i test).
