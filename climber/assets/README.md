# Asset

## Stato attuale

Il pacchetto del 5 novembre 2026 è integrato: 2 texture, 15 oggetti e il personaggio animato.
Provenienza e dettagli sono in `PROVENIENZA.md`, misure e triangoli in `model-info.json`, le
anteprime in `preview-models.jpg` e `preview-animations.jpg`. Gli script che li rigenerano sono
`tools/build_assets.py` e `tools/inspect_assets.py` (richiedono numpy e Pillow).

Corrispondenza tra file e chiavi del gioco, come scritta in `manifest.json`:

| File | Chiave | Note |
|---|---|---|
| `rock.jpg` / `ground.jpg` | `rock` / `ground` | dettaglio triplanare, normalizzato sulla luminosità media |
| `climber.glb` | `character` | clip Idle/Walking/Running/Climbing/Falling; inclinazione verso la parete e tremore aggiunti dal gioco |
| `campfire.glb` | `campfire` | la fiamma e la luce restano procedurali |
| `palm.glb`, `beach_rock.glb` | `palm`, `rock` | |
| `jungle_tree.glb`, `bush.glb` | `jungleTree` (scala 1,4), `bush` | |
| `giant_mushroom.glb`, `small_mushrooms.glb` | `giantMushroom`, `smallMushroom` | il fungo gigante è alto 3,7 m (rimbalzo) |
| `snow_pine.glb`, `ice_crystals.glb` | `pine` (scala 1,15), `iceShard` | |
| `cactus.glb`, `red_boulder.glb` | `cactus`, `boulder` | |
| `obsidian_spike.glb`, `glowing_lava_rock.glb` | `obsidian`, `emberRock` | |
| `snow_rock.glb`, `summit_flag.glb` | `summitRock`, `summitFlag` | |

Tutti i modelli vengono ammorbiditi (normali ricalcolate) e passati a materiali toon
(`src/toon.js`); con `"flat": true` nel manifest restano sfaccettati, come i cristalli. Palma,
albero della giungla, cespuglio e pino ora sono procedurali (`src/flora.js`): i loro GLB restano
nella cartella e si riattivano rimettendoli nel manifest. Per tornare a un oggetto
procedurale, togli la sua riga dal manifest.

---

## Specifiche (per sostituire o aggiungere asset)

Il gioco funziona già senza asset esterni: tutto è procedurale. Ogni asset che aggiungi qui
**sostituisce** la sua versione procedurale. Puoi aggiungerli uno alla volta.

## Come aggiungerne uno

1. Metti il file in questa cartella (GLB per i modelli, JPG/PNG per le texture).
2. Aggiungilo in `manifest.json` (prendi `manifest.example.json` come esempio):
   ```json
   { "models": { "palm": "models/palm.glb" }, "textures": {}, "character": null }
   ```
3. Ricarica la pagina. Se qualcosa non va, la console del browser dice quale file non è stato
   caricato. In quel caso resta la versione procedurale.

## Regole comuni a tutti i modelli 3D

- Formato **GLB** (glTF binario), texture incluse nel file.
- **Unità in metri**, con le dimensioni indicate sotto. Se il modello esce nella scala sbagliata,
  correggi con `"scale"` nel manifest invece di rigenerarlo.
- **Perno (origine) al centro della base**, appoggiato a terra (y = 0), con l'**alto lungo +Y**.
- **Low poly**: 500–3000 triangoli per gli oggetti (ce ne sono centinaia di copie instanziate),
  5–15k per il personaggio.
- Un solo materiale per modello se possibile, texture 512–1024 px.
- Stile coerente per tutto. Usa lo stesso prefisso in ogni prompt, ad esempio:
  > *stylized low-poly 3D game asset, soft hand-painted colors, chunky shapes, clean silhouette,
  > no background, single object*

Strumenti adatti: Meshy, Tripo, Rodin (Hyper3D), Luma Genie per i modelli; un generatore di
immagini con opzione "seamless/tileable" per le texture.

---

## 1. Personaggio: `models/climber.glb` (il più importante)

| | |
|---|---|
| Dimensioni | alto ~1,75 m |
| Posa | T-pose o A-pose per il rigging |
| Orientamento | guarda verso **+Z** (standard glTF). Il gioco lo gira di 180° (`rotateY`) |
| Triangoli | 5–15k |
| Animazioni (in loop) | `Idle`, `Walking`, `Running`, `Climbing`, `Falling` |

Prompt:
> *stylized low-poly 3D character, cheerful mountain climber/scout, orange jacket, dark blue
> trousers, brown gloves and boots, red beanie with pompom, goggles on forehead, big backpack with
> coiled rope, T-pose, full body, game ready*

Le AI generative di solito danno un modello **statico**, senza scheletro. Per animarlo:

1. carica il modello su **Mixamo** (gratuito), che fa il rigging automatico;
2. scarica queste animazioni sullo stesso scheletro: *Idle*, *Walking*, *Running*,
   *Climbing* (o *Climbing Up Wall*) e *Falling Idle*;
3. uniscile in un solo GLB con Blender (importa gli FBX ed esporta in glTF binario), oppure
   esporta i nomi che preferisci e scrivili in `"clips"` nel manifest.

L'animazione di arrampicata viene messa in pausa quando sei fermo sulla parete e accelerata
quando ti muovi. Finché non c'è, resta il personaggio procedurale con le mani animate.

## 2. Texture del terreno (le più visibili)

Servono **seamless/tileable**, 1024×1024. Vengono usate come *dettaglio* in scala di grigi che
moltiplica i colori dei biomi, quindi il colore conta poco: conta il disegno (crepe, granuli). Deve
essere ben contrastato e con luminosità media vicino al 50 %.

| File | Dove | Prompt |
|---|---|---|
| `textures/rock.jpg` | pareti (proiezione triplanare) | *seamless tileable texture, stylized rock cliff surface, cracks and layered strata, hand-painted, top-down flat lighting, no shadows* |
| `textures/ground.jpg` | pianori | *seamless tileable texture, stylized ground with small pebbles, soil and short grass tufts, hand-painted, top-down, flat lighting* |

## 3. Oggetti dei biomi: `models/<nome>.glb`

Il nome del file è libero, ma la **chiave nel manifest** deve essere esattamente questa.

| Chiave | Bioma | Dimensioni | Prompt (dopo il prefisso di stile) |
|---|---|---|---|
| `palm` | Spiaggia | alta 6–7 m | *tropical palm tree, slightly curved trunk, coconuts* |
| `rock` | Spiaggia | 1–1,5 m | *smooth beach boulder, grey-brown* |
| `jungleTree` | Giungla | alta 9–10 m, chioma Ø 6 m | *jungle tree, thick trunk with roots, lush round canopy* |
| `bush` | Giungla | 1 m | *dense tropical bush with big leaves* |
| `giantMushroom` | Funghi | alto **3,7 m**, cappello Ø 4,5 m | *giant mushroom, pink-red cap with white spots, thick pale stem* (l'altezza del cappello conta: ci si rimbalza sopra) |
| `smallMushroom` | Funghi | 0,5 m | *small glowing purple mushroom cluster* |
| `pine` | Ghiacciaio | alto 6–7 m | *snowy pine tree, snow on branches* |
| `iceShard` | Ghiacciaio | 2,5 m | *cluster of blue ice crystals* |
| `cactus` | Altopiano Rosso | alto 3 m | *saguaro cactus with two arms* (fa danno se lo tocchi) |
| `boulder` | Altopiano Rosso | 2 m | *red sandstone boulder, layered* |
| `obsidian` | Caldera | 2,2 m | *black obsidian spike cluster, glassy* |
| `emberRock` | Caldera | 1 m | *dark volcanic rock with glowing orange lava cracks* (usa un materiale emissivo) |
| `summitRock` | Vetta | 0,8 m | *frosted grey rock with snow cap* |
| `campfire` | Falò | Ø 1,6 m | *campfire, ring of stones and crossed logs, NO flames* (la fiamma e la luce restano procedurali) |

## Ordine consigliato

1. le due texture del terreno, che cambiano subito l'aspetto di tutta la montagna;
2. il personaggio;
3. il falò e gli oggetti dei biomi.
