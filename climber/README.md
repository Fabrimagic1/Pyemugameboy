# Cima Procedurale

Un prototipo di gioco di arrampicata in 3D per browser, con una montagna **generata proceduralmente
a biomi sovrapposti** che cambia ogni giorno (stesso seed → stessa montagna per tutti).
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
| **M** | mappa della generazione (la montagna "srotolata") |
| **P** | mostra in 3D il percorso garantito e le riparazioni |
| **O** | vista orbitale di tutta la montagna |
| R / H | torna all'ultimo falò / nascondi aiuto |

Per provare il generatore senza browser: `node climber/tools/test-gen.mjs 20` (verifica
determinismo e scalabilità su 20 seed).

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

Tutto è in `src/generator.js` (≈470 righe) e non dipende da three.js. Le fasi:

```
seed ─► 1 layout ─► 2 rumore ─► 3 timbri ─► 4 cottura ─► 5 materiali ─► 6 validazione ─► 7 oggetti
```

### 0. Seed e RNG (`src/rng.js`)
`hashString("2026-11-05")` → intero a 32 bit → generatore `mulberry32`. Ogni fase usa
`rng.fork("nome-fase")`: un flusso di numeri indipendente. **Perché è importante:** se aggiungi un
tipo di oggetto nella fase 7, la forma della montagna (fasi 1–5) non cambia. Senza i fork, ogni
modifica sposterebbe tutti i numeri casuali successivi e cambierebbe tutto.

### 1. Layout dei biomi (`buildLayout`, dati in `src/biomes.js`)
`BIOME_SLOTS` elenca gli slot dal basso verso l'alto. Per ogni slot il seed sceglie un bioma,
un'altezza (`height: [min,max]`) e quanto si stringe la montagna (`taper`). Il raggio in cima a un
bioma diventa il raggio alla base del successivo, quindi la forma è continua.

### 2. Rappresentazione: la montagna è una funzione `r = R(θ, y)`
Invece di voxel o mesh libere, la parete è una **superficie in coordinate cilindriche**: per ogni
angolo θ e quota y c'è un raggio. È semplice da generare, da collidere e da analizzare, permette
strapiombi "verso l'esterno" (il raggio cresce salendo) e si srotola in un'immagine 2D (la mappa M).
Limite: niente grotte passanti o archi. Per quelli servirebbe un campo di distanza (SDF) 3D.

Il raggio di una cella è:

```
R = Σ_biomi peso(y) · [ base_bioma(gradoni(y)) + forma_bioma(θ, y) ] · lobi(θ, y) + timbri(θ, y)
```

- **profilo di base** (`profile`): come si restringe il bioma (la vetta è una guglia `t^1.35`,
  l'orlo della caldera sporge con una gaussiana).
- **gradoni** (`terrace`): la quota viene "quantizzata" → il raggio resta costante (parete
  verticale) e poi cala di colpo (cengia). Con `jitter` le cenge salgono e scendono attorno alla
  montagna. È così che la spiaggia e l'altopiano rosso hanno gli strati.
- **forma** (`shape`): rumore Perlin 3D campionato in `(cos θ·r, y, sin θ·r)`, così il pattern si
  richiude attorno alla montagna senza cuciture. `fbm` per roccia irregolare, `ridged` per creste
  e canali.
- **fusione tra biomi**: nei `TRANSITION` metri al confine i due biomi vengono mescolati con pesi
  che sommano a 1; la quota del confine ondula con θ (`wob`) così il passaggio non è un anello
  perfetto.

### 3. Timbri (`StampSet`, `stampOffset`)
Strutture discrete aggiunte sopra il rumore, sparse con una densità per m² di parete:
- `ledge`: cengia con la cima piatta e il sotto a cuneo;
- `cap`: mensola sottile e tonda (i funghi a mensola);
- `alcove`: nicchia scavata con il pavimento piatto.

I **falò** sono timbri `ledge` grandi messi esattamente ai confini tra i biomi. I timbri sono
indicizzati in "secchielli" di 8 m di quota, così ogni cella controlla solo quelli vicini.

### 4. Cottura (`bakeRows`) — la parte costosa
Tutto quanto sopra viene valutato **una sola volta** per ogni cella di una griglia 512 × ~700
(una riga ogni 0,5 m) e salvato in `Float32Array`. Da qui in poi nessuno ricalcola il rumore:
fisica, grafica, validatore e mappa leggono la stessa griglia (`src/surface.js`), quindi ciò che
vedi è esattamente ciò che tocchi. Poi `computeDerived` calcola per ogni cella la pendenza `dR/dy`
(>0 = strapiombo) e la normale: se la componente verticale supera `STAND_UP` la cella è
**calpestabile** (ci si può riposare).

### 5. Materiali (`paintRows`)
Ogni bioma decide il materiale della cella (`material(p, N, c)`): ghiaccio dove un rumore è alto,
strisce verticali di liane (rumore con alta frequenza in orizzontale e bassa in verticale), lava
nei solchi della caldera, neve sulle cenge. Ai confini il bioma della cella viene scelto con un
**dithering** casuale pesato, così i colori si mescolano "a puntini" invece di avere una linea.

### 6. Validazione e riparazione (`validateRoute` + `src/pathfind.js`) — la garanzia
È la fase che rende la generazione *giusta* e non solo bella. Per ogni tratto (spiaggia → falò 1,
falò 1 → falò 2, …, ultimo falò → cima) il validatore chiede: *un giocatore con la barra piena
riesce a passare?*

- È un **Dijkstra sulla griglia** in cui il costo è la *stamina consumata dall'ultimo riposo*.
  Muoversi su una cella calpestabile riporta il costo a 0; arrampicarsi costa secondo
  `climbCost()` in `src/rules.js` (ghiaccio ×1,9, liane ×0,55, strapiombi fino a ×2,6, la lava non
  si attraversa). Se il costo supera `ROUTE_SAFETY` (60 % della barra, per lasciare margine alle
  afflizioni) quella mossa non è possibile.
- Se il falò successivo non si raggiunge, il **riparatore** prende la cella di parete raggiungibile
  più vicina all'obiettivo e ci **scava una nicchia** (un punto di riposo). Il percorso fino a lì
  resta valido, quindi ogni riparazione fa avanzare. Si ricuoce solo la striscia di righe
  toccata e si ripete.
- Le nicchie di riparazione sono i quadratini magenta nella mappa (M) e le sfere magenta in 3D (P).
  Nel ghiacciaio, che ha poche cenge naturali, ne vedrai una "scala"; nell'altopiano a gradoni
  spesso nessuna.

Il punto chiave è che **generatore e giocatore usano le stesse regole** (`src/rules.js`). Se cambi
il movimento, cambia lì i costi e il generatore continuerà a garantire montagne scalabili con il
tuo movimento.

### 7. Oggetti e cibo (`scatterProps`, `placeFood`)
"Dart throwing" (la versione semplice del Poisson-disc sampling): per ogni regola del bioma si
provano `tries` posizioni casuali e si tengono solo quelle su una cengia abbastanza profonda
(`minDepth`), nel bioma giusto e a distanza minima `spacing` dagli altri oggetti (hash spaziale).
Il **cibo** viene messo lungo il percorso validato: chi segue la via "giusta" lo trova.

---

## 3. Struttura dei file

```
climber/
├── index.html          HUD, mappa, import di three.js
├── src/
│   ├── rules.js        ★ regole condivise: griglia, materiali, costi di stamina
│   ├── rng.js          seed, hash, RNG con fork
│   ├── noise.js        Perlin 3D, fbm, ridged
│   ├── biomes.js       ★ definizione dei biomi e degli slot (dati + piccole funzioni)
│   ├── surface.js      la griglia cotta e le query (raggio, normale, materiale…)
│   ├── generator.js    ★ la pipeline in 7 fasi
│   ├── pathfind.js     ★ validatore (Dijkstra con riposi)
│   ├── render.js       mesh three.js (montagna a blocchi, oggetti instanziati, cielo)
│   ├── player.js       movimento segnaposto: da sostituire
│   ├── hud.js          barra stamina/afflizioni, mappa di debug
│   └── main.js         avvio, input, camera, loop
└── tools/test-gen.mjs  test in Node: determinismo + scalabilità
```

Dalla console del browser puoi esplorare tutto: `world.layout.biomes`, `world.route.segments`,
`world.surface.radius(θ, y)`, `world.stats`.

---

## 4. Mettere il tuo movimento

`player.js` è isolato. Dal mondo usa solo:

```js
const S = world.surface;
S.radius(theta, y)     // raggio della parete a quell'angolo/quota
S.upNormal(theta, y)   // 1 = pavimento, 0 = muro, <0 = soffitto
S.material(theta, y)   // MAT.ICE, MAT.VINE, MAT.LAVA, ...
// collisione: un punto (x, y, z) è dentro la roccia se hypot(x, z) < S.radius(atan2(z, x), y)
```

e da `main.js` riceve `update(dt, input, camYaw)` con `input = { fwd, right, jump, sprint, grab }`.
Puoi riscriverlo da zero tenendo la stessa interfaccia (posizione in `x, y, z`, `stamina`, `mode`,
`events` per i messaggi). Ricordati di allineare `CLIMB` in `rules.js` a quello che fa davvero il
tuo personaggio: ad esempio, se aggiungi un rampino che fa salire di 6 m gratis, il validatore può
saperlo e permettere pareti più lunghe tra un riposo e l'altro.

## 5. Aggiungere un bioma

1. Aggiungi una voce in `BIOMES` (`src/biomes.js`) copiando una esistente: altezza, restringimento,
   `shape`, `material`, `stamps`, `props`, colori, temperatura.
2. Mettila in uno slot di `BIOME_SLOTS`, ad esempio `['alpine', 'mesa', 'tuoBioma']`.
3. Se usa oggetti nuovi, aggiungi il modello in `MODELS` (`src/render.js`).
4. Lancia `node climber/tools/test-gen.mjs 30` per vedere quante riparazioni servono: se sono
   tante, il bioma ha pochi punti di riposo naturali (va bene se è voluto).

## 6. Idee per continuare

- Generare in un **Web Worker** (ora la generazione blocca la pagina per ~1 s).
- Sostituire la superficie cilindrica con un **SDF 3D** per avere grotte e archi.
- Pezzi fatti a mano ("prefab") posizionati dal seed, come probabilmente fa PEAK: basta un nuovo
  tipo di timbro che copia una piccola griglia di raggi disegnata a mano.
- Multiplayer: con lo stesso seed, tutti i client generano la stessa montagna senza scambiarsi
  dati. Attenzione: `Math.sin`/`Math.pow` possono differire di pochissimo tra browser; per un
  determinismo bit per bit servono funzioni proprie o aritmetica intera.
