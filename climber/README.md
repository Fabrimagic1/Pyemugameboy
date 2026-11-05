# Cima Procedurale

Un prototipo di gioco di arrampicata in 3D per browser, con una montagna **generata proceduralmente
a biomi in sequenza**: si va avanti e in salita dalla spiaggia alla vetta, con **più vie diverse**
tra un falò e l'altro. Cambia ogni giorno (stesso seed → stessa montagna per tutti).
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

Tutto è in `src/generator.js` e non dipende da three.js. Le fasi:

```
seed ─► 1 layout ─► 2 rumore ─► 3 timbri ─► 4 cottura ─► 5 materiali ─► 6 più vie ─► 7 oggetti
```

### 0. Seed e RNG (`src/rng.js`)
`hashString("2026-11-05")` → intero a 32 bit → generatore `mulberry32`. Ogni fase usa
`rng.fork("nome-fase")`: un flusso di numeri indipendente. **Perché è importante:** se aggiungi un
tipo di oggetto nella fase 7, la forma della montagna (fasi 1–5) non cambia. Senza i fork, ogni
modifica sposterebbe tutti i numeri casuali successivi e cambierebbe tutto.

### 1. Layout: avanti e in salita (`buildLayout`, dati in `src/biomes.js`)
Il mondo è un **corridoio**: `x` laterale, `z` in avanti, `y` in alto. Si parte dalla spiaggia
(z ≈ 0) e la vetta è in fondo, visibile da lontano. `BIOME_SLOTS` elenca gli slot in ordine; per
ogni slot il seed sceglie un bioma e costruisce il suo pezzo di **profilo altimetrico**: una
spezzata fatta di

```
pianoro (si cammina, poco inclinato) → parete (si scala, 62–84°) → pianoro → parete → … → pianoro del falò
```

Numero di pareti, altezze, inclinazioni e lunghezza dei pianori vengono dai dati del bioma
(`steps`). La montagna è ripida: circa 400 m in avanti per 300–350 m di salita (≈ 38° di media),
con pianori corti (7–20 m) tra pareti di 8–20 m. Il ghiacciaio ha poche pareti alte, l'altopiano rosso tante pareti basse e verticali.
È questa struttura a far sì che si vada **sempre avanti e in salita**. Il profilo si vede nella
mappa (tasto M, grafico in alto a destra).

### 2. Rappresentazione: heightmap `y = h(x, z)` + ondulazione
Il terreno è una heightmap (una cella ogni 0,6 m). Il profilo da solo darebbe pareti dritte come
gradini di una scala, quindi si usa un trucco: `z' = z − shift(x, z)`, dove `shift` è rumore a bassa
frequenza. Il profilo viene valutato in `z'` e così le pareti si piegano in curve e speroni.
Tutti i timbri (fase 3) lavorano nel sistema "raddrizzato" `(x, z')`, dove le pareti sono linee
dritte e posizionare un passaggio è banale.

```
h = profilo(z') + Σ_biomi peso(z') · forma_bioma(x, y, z) + timbri(x, z') − caduta_ai_lati(x)
```

- **forma** (`shape`): rumore Perlin 3D (`fbm` per roccia irregolare, `ridged` per creste e solchi);
- **fusione tra biomi**: nei `TRANSITION` metri al confine i biomi si mescolano con pesi che sommano a 1;
- **lati**: oltre la mezza larghezza del corridoio (che si stringe salendo) il terreno scende in
  mare con un bordo irregolare.

Limite di una heightmap: niente strapiombi né grotte. Per quelli servirebbe un campo di distanza (SDF) 3D.

### 3. Timbri: falò, passaggi e cenge (`placeCampfires`, `placePassages`)
- **Falò**: una spianata in fondo a ogni bioma; la vetta ha la sua spianata con la bandiera.
- **Passaggi** (fino a 3 per parete, a ≥ 30 m di distanza, **di tipo diverso sulla stessa parete**):
  - `ramp`, cengia diagonale: sale lungo la parete, si fa camminando ma è lunga e va di lato;
  - `stairs`, gradoni: alzate di 3–4 m con pedate piatte dove riposarsi;
  - `gully`, canalone: un taglio a 50–58° invece di 75°, con liane nella giungla (costano meno).
- **Cenge naturali** (`notch`): piccole spianate sparse sulle pareti, densità per m² dal bioma.

### 4. Cottura (`bakeRows`), la parte costosa
Tutto quanto sopra viene valutato **una sola volta** per ogni cella (≈ 360 × 1300) e salvato in
`Float32Array`. Da lì in poi nessuno ricalcola il rumore: fisica, grafica, validatore e mappa
leggono la stessa griglia (`src/surface.js`), quindi ciò che vedi è esattamente ciò che tocchi.
Poi `computeDerived` calcola la normale: se la sua componente verticale supera `STAND_UP` (≈ 50°)
la cella è **calpestabile** (ci si cammina e ci si riposa), altrimenti è parete.

### 5. Materiali (`paintRows`)
Ogni bioma decide il materiale della cella: ghiaccio dove un rumore è alto, strisce verticali di
liane, fiumi di lava nei solchi della caldera, neve sui pianori; i canaloni impongono il loro.
Ai confini il bioma della cella viene scelto con un **dithering** pesato, così i colori si
mescolano "a puntini" invece di avere una linea.

### 6. Più vie garantite (`validateRoutes` + `src/pathfind.js`)
È la fase che rende la generazione *giusta* e non solo bella. Per ogni tratto (spiaggia → falò 1,
falò 1 → falò 2, …, ultimo falò → vetta):

1. **Via A**: un **Dijkstra sulla griglia** in cui il costo è la *stamina consumata dall'ultimo
   riposo*. Camminare su terreno piano riporta il costo a 0; arrampicarsi costa secondo
   `climbCost()` in `src/rules.js` (ghiaccio ×1,9, liane ×0,55, parete verticale ×1,6; la lava e
   l'acqua non si attraversano). Una mossa che supera `ROUTE_SAFETY` (60 % della barra, per lasciare
   margine alle afflizioni) non è possibile.
2. **Via B, C…**: si **vietano** le celle di parete entro `ROUTE_SEPARATION` (11 m) dai punti in cui
   la via A supera una parete, e si cerca di nuovo. I pianori restano condivisibili: le vie
   possono attraversarsi, ma **ogni parete va salita in un punto diverso**. Vicino ai falò e alla
   vetta non si vieta niente, perché lì le vie convergono.
3. Se le vie trovate sono meno di `MIN_ROUTES` (2), il **riparatore** prende la cella di parete
   raggiungibile più vicina al traguardo *nella zona ancora libera* e ci scava una piccola cengia.
   Il percorso fino a lì resta valido, quindi ogni riparazione fa avanzare, e siccome lavora fuori
   dal corridoio vietato **crea una via nuova** invece di rinforzare quella vecchia. La terza via
   non viene mai riparata: o la montagna la offre o no.
4. Ogni via viene classificata in base a quanta parte del dislivello si guadagna arrampicando:
   **sentiero** (< 30 %), **misto**, **parete** (> 65 %). Nella mappa M trovi l'elenco per tratto
   ("A: sentiero sinistra · B: parete centro…") e le vie colorate (bianco, azzurro, giallo); in 3D
   con il tasto P.

Il punto chiave è che **generatore e giocatore usano le stesse regole** (`src/rules.js`). Se cambi
il movimento, cambia lì i costi e il generatore continuerà a garantire vie scalabili con il tuo
movimento.

### 7. Oggetti e cibo (`scatterProps`, `placeFood`)
"Dart throwing" (la versione semplice del Poisson-disc sampling): per ogni regola del bioma si
provano `tries` posizioni casuali e si tengono solo quelle su terreno piano, nel bioma giusto e a
distanza minima `spacing` dagli altri oggetti (hash spaziale). Il **cibo** viene messo lungo
**ogni** via validata, così anche la via difficile ha le sue ricompense.

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
│   ├── surface.js      la heightmap cotta e le query (quota, pendenza, materiale…)
│   ├── generator.js    ★ la pipeline in 7 fasi
│   ├── pathfind.js     ★ validatore (Dijkstra con riposi e celle vietate)
│   ├── render.js       mesh three.js (terreno a blocchi, oggetti instanziati, cielo)
│   ├── player.js       movimento segnaposto: da sostituire
│   ├── character.js    personaggio: scheletro procedurale animato (mani in parete) o GLB con animazioni
│   ├── assets.js       caricamento di assets/manifest.json, texture triplanari del terreno
│   ├── hud.js          barra stamina/afflizioni, mappa dall'alto, profilo, elenco vie
│   └── main.js         avvio, input, camera, loop
└── tools/test-gen.mjs  test in Node: determinismo + scalabilità
```

Dalla console del browser puoi esplorare tutto: `world.layout.biomes`, `world.route.segments`,
`world.terrain.height(x, z)`, `world.stats`.

---

## 4. Mettere il tuo movimento

`player.js` è isolato. Dal mondo usa solo:

```js
const T = world.terrain;
T.height(x, z)      // quota del terreno
T.gradient(x, z)    // [dh/dx, dh/dz]: la direzione in cui si sale
T.upNormal(x, z)    // 1 = piano, 0 = parete verticale
T.material(x, z)    // MAT.ICE, MAT.VINE, MAT.LAVA, ...
```

Il segnaposto cammina finché la pendenza lo permette. In arrampicata si muove *sulla* superficie
lungo il gradiente (avanti = su, A/D = di lato) e torna a camminare da solo quando il terreno
torna piano, cioè quando arriva in cima alla parete o su una cengia.

e da `main.js` riceve `update(dt, input, camYaw)` con `input = { fwd, right, jump, sprint, grab }`.
Puoi riscriverlo da zero tenendo la stessa interfaccia (posizione in `x, y, z`, `stamina`, `mode`,
`events` per i messaggi). Ricordati di allineare `CLIMB` in `rules.js` a quello che fa davvero il
tuo personaggio: ad esempio, se aggiungi un rampino che fa salire di 6 m gratis, il validatore può
saperlo e permettere pareti più lunghe tra un riposo e l'altro.

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
