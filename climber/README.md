# Cima Procedurale

Un prototipo di gioco di arrampicata in 3D per browser, con una montagna **generata proceduralmente
a biomi impilati**: un'isola da scalare da ogni lato, dalla spiaggia alla vetta, fatta di **macigni accatastati**,
con più vie tra un falò e l'altro. Cambia ogni giorno (stesso seed → stessa montagna per tutti).
Lo scopo è didattico: il codice della generazione è commentato riga per riga, e il movimento del
giocatore è un segnaposto pensato per essere sostituito con le tue meccaniche.

```bash
# dalla radice del repository
python -m http.server 8000
```

Poi apri <http://localhost:8000/climber/> (serve internet per scaricare three.js dal CDN).
`?seed=qualcosa` per una montagna specifica, `?orbit` per partire in vista orbitale.

| Tasto | Azione |
|-------|--------|
| clic | cattura il mouse |
| WASD / Shift / Spazio | muoviti / corri / salta |
| tieni **clic sinistro** o **E** vicino a una parete | arrampicati (Spazio = scatto verso l'alto) |
| **M** | mappa della generazione (vista dall'alto, profilo, elenco delle vie) |
| **P** | mostra in 3D le vie garantite e le riparazioni |
| **O** | vista orbitale di tutta la montagna |
| **F** | apri una valigia · pianta un chiodo in parete · marshmallow al falò |
| **1** / **2** | benda (cura le ferite) / energetico (stamina piena) |
| **B** | bloom sì/no (`?fx=0` per partire senza) |
| R / H | torna all'ultimo falò / nascondi aiuto |

Per provare il generatore senza browser: `node climber/tools/test-gen.mjs 20` (verifica su 20 seed
il determinismo e che ogni tratto abbia almeno 2 vie).

---

## 1. Cosa si sa di PEAK (e cosa no)

Il codice sorgente di PEAK (Aggro Crab + Landfall, 2025, Unity) non è pubblico. Qui **non c'è
codice del gioco**: decompilare il gioco e riusarne il codice o gli asset violerebbe copyright ed
EULA, e comunque non servirebbe a capire il *design*, che è la parte interessante. Quello che
segue è ciò che si osserva giocando e che gli sviluppatori hanno detto pubblicamente, più le mie
ipotesi (segnalate come tali).

Osservabile:

- **Una montagna al giorno, uguale per tutti.** La mappa cambia ogni 24 ore e tutti i giocatori
  hanno la stessa. È il classico *seed del giorno*: un numero derivato dalla data guida tutta la
  generazione.
- **Biomi impilati in verticale**, sempre nello stesso ordine di "slot": riva → zona tropicale (in
  certe versioni alternata con una variante) → zona alpina **oppure** zona desertica (alternate da
  un giorno all'altro) → caldera vulcanica → cima. Ogni slot ha uno o più biomi possibili.
- **Falò ai confini tra i biomi**: checkpoint, calore, momento di sosta. Dividono la scalata in
  tratti.
- **Stamina come risorsa centrale**: arrampicarsi la consuma; fame, freddo, caldo, veleno e ferite
  "mangiano" la parte destra della barra e riducono il massimo.
- **La montagna è sempre scalabile** e ogni bioma ha regole sue (ghiaccio, liane, lava, sole).

Ipotesi ragionevoli (non confermate) su come l'hanno fatto in poco tempo:

- È molto probabile un approccio **ibrido**: pezzi costruiti a mano (scogliere, strutture, set di
  oggetti) **posizionati e combinati proceduralmente** dal seed, piuttosto che geometria 100%
  generata da rumore. È il modo più rapido per avere varietà controllata in poche settimane.
- Lo stesso eseguibile su tutti i PC + lo stesso seed basta a garantire montagne identiche.

Questo prototipo ricrea **lo stesso tipo di struttura** (seed giornaliero, slot di biomi con
varianti, falò ai confini, stamina con afflizioni, garanzia di scalabilità) con una tecnica tutta
procedurale, più facile da studiare. Nomi, grafica e livelli sono originali.

---

## 2. La pipeline di generazione

La montagna è un **mucchio di macigni**: pochi modelli di roccia, riusati migliaia di volte con
posizione, rotazione e scala diverse. Lo studio che ha portato a questa scelta è in
[`docs/STUDIO_GENERAZIONE.md`](docs/STUDIO_GENERAZIONE.md). Tutto è in `src/generator.js` e non
dipende da three.js.

```
seed ─► 1 layout ─► 2 nucleo ─► 3 macigni ─► 4 campo di distanza ─► 5 cenge ─► 6 vie ─► 7 oggetti
```

### 0. Seed e RNG (`src/rng.js`)
`hashString("2026-11-05")` → intero a 32 bit → generatore `mulberry32`. Ogni fase usa
`rng.fork("nome-fase")`: un flusso di numeri indipendente, così cambiare una fase non sposta i
numeri casuali delle altre.

### 1. Layout: fasce di bioma e spalle (`buildLayout`, dati in `src/biomes.js`)
La montagna è un'isola, scalabile da ogni lato. `BIOME_SLOTS` elenca gli slot dal basso; per ogni
slot il seed sceglie un bioma, la sua altezza (25–65 m) e l'inclinazione della parete (68–86°).
In cima a ogni bioma c'è una **spalla** piana solo nel settore del falò, più qualche terrazzino
sparso: niente anelli regolari. La pendenza cambia lato per lato, la cima è spostata rispetto alla
base (il monte pende) e il confine tra i biomi è frastagliato. In tutto ≈ 240 m di quota su ≈ 60 m
di raggio alla base: una torre.

### 2. Il nucleo (`bakeCore`)
Una heightmap a gradoni (pareti ripide e spalle piane), con la pianta deformata da "lobi" di
rumore per non essere un cerchio. **Non è la forma che si vede**: serve a riempire la montagna
(niente buchi tra i macigni) e a dare il piano delle spalle.

### 3. I macigni (`src/boulders.js`, `placeBoulders`)
Ogni modello è un **poliedro convesso**: una scatola tagliata da 6–11 piani a caso. Da quella sola
definizione escono tre cose:
- la **mesh** (32–48 triangoli), disegnata con l'instancing: una chiamata per modello;
- la **distanza** da un punto alla roccia, che per un convesso è `max_i (n_i · p − d_i)`;
- le **facce**, da cui si ricavano le cenge.

Ci sono 8 modelli (blocchi, lastre, pilastri, cunei). `placeBoulders` ne appoggia ≈ 3500 (macigni
grossi più uno strato di lastre piccole che sporgono come mensole) sulle
pareti del nucleo: per ogni bioma il seed sceglie punto, modello, scala, rotazione e inclinazione.
Una parte è messa "in piano" (`flat`), così la cima è una cengia sicura; il resto è inclinato a
caso e crea falde, spigoli e **strapiombi**. Alcuni macigni sono speciali: ghiacciati, coperti di
liane, o di lava.

### 4. Campo di distanza (`sdf`, `normal`)
`world.sdf(x, y, z)` = distanza dalla roccia più vicina (negativa dentro): il minimo tra il nucleo
e i macigni vicini, trovati con una griglia 3D a celle di 8 m. È tutta la fisica che serve: la
collisione è "se la sfera entra nella roccia, spingila fuori lungo la normale", e vale per pareti,
spigoli, strapiombi e soffitti senza casi speciali.

### 5. Cenge (`bakeTop`, `collectRests`)
Non sono disegnate: sono le superfici in piano che capitano. `bakeTop` calcola per ogni cella di
1 m la **superficie più alta** (scendendo dall'alto nel campo di distanza); ogni punto calpestabile
e libero sopra diventa un **appoggio** (≈ 10.000). Si aggiungono le facce in piano dei macigni che
stanno sotto uno strapiombo. La stessa mappa delle cime serve a erba, oggetti e mappa (tasto M).

### 6. Vie (`validateRoutes` + `src/pathfind.js`)
Il validatore lavora su un **grafo di appoggi**: da un appoggio si passa a un altro camminando
(vicini e alla stessa quota), saltando giù, o **arrampicando**, se il tratto di parete tra i bordi
delle due cenge sta nel budget di stamina (`climbReach`, con le stesse regole del giocatore in
`src/rules.js`: ghiaccio ×1,6, liane ×0,55, ≈ 6 m su roccia). Una via è un cammino nel grafo.
- Per ogni tappa (spiaggia → falò 1 → … → vetta) si cerca la via A, si vietano gli appoggi entro
  `ROUTE_SEPARATION` da lei (tranne vicino ai falò) e si cerca la B, poi la C.
- Se le vie sono meno di `MIN_ROUTES` (2), si **aggiunge un appoggio**: una lastra piana a portata
  di braccio dal punto raggiunto più vicino al traguardo. Con i macigni succede di rado: di solito
  0–8 lastre su tutta la montagna.
- Le vie verificate sono solo una garanzia: si può salire da qualunque lato.

### 7. Oggetti, cibo e valigie (`scatterProps`, `placeLoot`)
Si provano posizioni casuali e si tengono quelle su una cima piana, libera sopra, nel bioma giusto
e a distanza minima dagli altri oggetti. Cibo e valigie stanno sugli appoggi delle vie verificate e
vicino ai falò.

### Materiale per pendenza
Come nel gioco originale, il colore non è dipinto per zone: ogni macigno ha il colore di roccia
del suo bioma, e lo shader mette il colore "di cima" (sabbia, muschio, neve, cenere) sulle facce
che guardano in alto (`buildMountain` in `src/render.js`).

### Nebbia che sale (`src/fog.js`, parametri `FOG` in `src/rules.js`)
È la pressione del gioco. A ogni tappa (alla partenza, poi a ogni falò acceso) la nebbia aspetta
`delay` secondi, poi sale di `speed` m/s fino a poco sotto il falò **successivo** e lì si ferma
finché non lo raggiungi. Dentro la nebbia cresce l'afflizione viola "nebbia", che riduce la barra
come le altre; fuori passa lentamente. Se svieni, la nebbia torna sotto l'ultimo falò.

### Oggetti (`ITEMS` in `src/rules.js`, logica in `player.js`)
- **Chiodo** (F in parete): resta piantato dove sei; appeso a un chiodo recuperi stamina. Si parte con 2.
- **Benda** (1): toglie il 30 % di ferite. **Energetico** (2): stamina piena e arrampicata meno
  faticosa per 25 s.
- **Marshmallow** (F vicino a un falò): toglie fame, uno ogni 25 s.

---

## 3. Struttura dei file

```
climber/
├── index.html          HUD, mappa, import di three.js
├── assets/             ★ modelli e texture opzionali (vedi assets/README.md)
├── src/
│   ├── rules.js        ★ regole condivise: griglia, materiali, costi di stamina
│   ├── rng.js          seed, hash, RNG con fork
│   ├── noise.js        Perlin 3D, fbm, ridged
│   ├── biomes.js       ★ definizione dei biomi e degli slot (dati + piccole funzioni)
│   ├── boulders.js     ★ i modelli di macigno: poliedri convessi (mesh + distanza + facce)
│   ├── surface.js      griglia a celle (nucleo e mappa delle cime)
│   ├── generator.js    ★ la pipeline: nucleo, macigni, campo di distanza, cenge, vie
│   ├── pathfind.js     ★ grafo degli appoggi e ricerca delle vie
│   ├── render.js       mesh three.js (terreno a blocchi, oggetti instanziati, cielo)
│   ├── fog.js          nebbia che sale a ogni tappa
│   ├── player.js       movimento segnaposto + afflizioni e oggetti
│   ├── character.js    personaggio: scheletro procedurale animato (mani in parete) o GLB con animazioni
│   ├── assets.js       caricamento di assets/manifest.json, texture triplanari del terreno
│   ├── hud.js          barra stamina/afflizioni, mappa dall'alto, profilo, elenco vie
│   └── main.js         avvio, input, camera, loop
└── tools/test-gen.mjs  test in Node: determinismo + scalabilità
```

Dalla console del browser puoi esplorare tutto: `world.layout.biomes`, `world.route.segments`,
`world.sdf(x, y, z)`, `world.graph`, `world.boulders`, `world.stats`.

---

## 4. Mettere il tuo movimento

`player.js` è isolato. Dal mondo usa solo:

```js
world.sdf(x, y, z)           // distanza dalla roccia: <0 dentro, >0 fuori
world.normal(x, y, z, out)   // normale della roccia più vicina (verso l'esterno)
world.materialAt(x, y, z)    // MAT.ICE, MAT.VINE, MAT.LAVA, ...
```

Il segnaposto è fatto di due sfere (bacino e testa) spinte fuori dalla roccia. In arrampicata il
corpo resta a contatto con la superficie e si muove nel piano tangente: così gira gli spigoli,
passa sotto gli strapiombi (che costano di più) e torna in piedi da solo quando la roccia torna
in piano.

e da `main.js` riceve `update(dt, input, camYaw)` con `input = { fwd, right, jump, sprint, grab }`.
Puoi riscriverlo da zero tenendo la stessa interfaccia (posizione in `x, y, z`, `stamina`, `mode`,
`events` per i messaggi). Ricordati di allineare `CLIMB` in `rules.js` a quello che fa davvero il
tuo personaggio: ad esempio, se aggiungi un rampino che fa salire di 6 m gratis, il validatore può
saperlo e permettere pareti più lunghe tra un riposo e l'altro.

### Stile grafico: realistico (predefinito) o cartone
`?style=toon` torna al cel shading; senza parametri si usa lo stile **realistico**. Tutto il gioco
crea i materiali con `toon()` in `src/toon.js`: lo stile è deciso lì, in un punto solo.

Cosa rende l'aspetto realistico (`STYLE = 'real'`):
- **Materiali fisici** (`MeshStandardMaterial`): la luce sfuma in modo naturale invece che a fasce.
- **Cielo atmosferico** (`Sky` di three.js): diffusione della luce nell'aria, alone attorno al sole.
  Lo stesso cielo viene "fotografato" in una mappa d'ambiente che illumina tutta la scena e si
  riflette su acqua e superfici lucide. Esposizione e tone mapping (ACES) sono regolati in `main.js`.
- **Macigni arrotondati** (`shapeMesh` in `src/boulders.js`): ogni faccia del poliedro viene
  suddivisa, i vertici vengono spinti verso l'interno vicino a spigoli e angoli (spigoli smussati)
  e con un rumore fine (superficie irregolare); le normali sono mediate, quindi piatte sulle facce e
  sfumate sugli spigoli. `?detail=2` (predefinito, ≈ 580 triangoli per macigno), `?detail=1`
  (≈ 140, più leggero), `?detail=0` (facce piatte).
- **Rilievo** (bump mapping nello shader dei macigni): l'altezza è la luminosità della texture, quindi
  le crepe diventano incavi che prendono luce e ombra.
- **Texture vere** da Higgsfield: roccia e cima per bioma, corteccia e fogliame per gli alberi
  (proiezione triplanare, senza UV).
- **Acqua** con mappa di normali che scorre e riflessi del cielo.
- **Ombre** a 4096 px con `normalBias`.

Altre tecniche, valide in entrambi gli stili:
- **Normali morbide** (`smoothGeometry`): i modelli GLB low-poly non sono più sfaccettati.
- **Vegetazione procedurale** (`src/flora.js`): tronchi a tubo curvo, chiome di masse arrotondate,
  palme con foglie arcuate, pini a balze; più varianti per tipo, vento nel vertex shader.
- **Erba** (`src/grass.js`): ciuffi instanziati a piastrelle attorno al giocatore, con vento e
  piegatura al passaggio. `?grass=0` la spegne, `?grass=2` la infittisce.

Il nucleo (la heightmap sotto i macigni) taglia ogni quadrato di griglia lungo la diagonale di minor
salto: sulle pareti ripide evita i "denti a sega".

### Il personaggio
`src/character.js` costruisce uno scheletro di gruppi annidati (spalla → gomito → mano, anca →
ginocchio → piede) e lo anima in base allo stato del giocatore:
- **camminata/corsa**: gambe e braccia che oscillano in base alla distanza percorsa;
- **arrampicata**: corpo inclinato verso la parete, **mani alternate** (una si allunga verso
  l'alto mentre l'altra tira) e piedi che spingono in opposizione. La fase avanza solo quando ti
  muovi, quindi se sei fermo le mani restano ferme; con la stamina sotto il 25 % le braccia
  **tremano**;
- **in aria**: braccia aperte e gambe piegate.

Se metti un personaggio GLB con animazioni in `assets/manifest.json`, viene usato quello.

## 5. Asset

Gli asset low-poly sono inclusi in `assets/`: personaggio animato, 15 oggetti dei biomi e 2 texture
del terreno. Senza di loro il gioco torna alle versioni procedurali. In `assets/README.md` c'è l'elenco degli asset da far generare
a un'AI, con dimensioni, perno, numero di triangoli e un prompt per ciascuno: personaggio, 2 texture
del terreno, 14 oggetti dei biomi, falò. Ogni file che aggiungi in `assets/manifest.json`
sostituisce la sua versione procedurale.

## 6. Aggiungere un bioma

1. Aggiungi una voce in `BIOMES` (`src/biomes.js`) copiando una esistente: altezza, restringimento,
   `shape`, `material`, `stamps`, `props`, colori, temperatura.
2. Mettila in uno slot di `BIOME_SLOTS`, ad esempio `['alpine', 'mesa', 'tuoBioma']`.
3. Se usa oggetti nuovi, aggiungi il modello in `MODELS` (`src/render.js`).
4. Lancia `node climber/tools/test-gen.mjs 30`: per ogni tratto vedi quante vie ci sono e di che
   tipo (s/m/p), e quante riparazioni sono servite. Se sono tante, il bioma ha pochi passaggi o
   punti di riposo naturali (va bene se è voluto, come nel ghiacciaio).

## 7. Idee per continuare

- Generare in un **Web Worker** (ora la generazione blocca la pagina per ~1 s).
- Sostituire la heightmap con un **SDF 3D** per avere strapiombi, grotte e archi.
- Passaggi speciali che il validatore conosce: funghi-trampolino, corde, rampini (archi extra nel grafo).
- Pezzi fatti a mano ("prefab") posizionati dal seed, come probabilmente fa PEAK: basta un nuovo
  tipo di timbro che copia una piccola griglia di raggi disegnata a mano.
- Multiplayer: con lo stesso seed, tutti i client generano la stessa montagna senza scambiarsi
  dati. Attenzione: `Math.sin`/`Math.pow` possono differire di pochissimo tra browser; per un
  determinismo bit per bit servono funzioni proprie o aritmetica intera.
