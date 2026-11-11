# Asset con Higgsfield

## Stato

| Cosa | Stato | Dove |
|---|---|---|
| 14 texture del terreno (roccia + cima per 7 biomi) | **fatte** e collegate al gioco | `tex/` |
| Immagini di riferimento per i modelli 3D | da fare (gratis con la prova illimitata, vedi sotto) | — |
| Modelli 3D (personaggio, oggetti, falò) | da fare, servono crediti | — |

Le texture sono state generate con GPT Image 2.6 a qualità media (0,5 crediti l'una, 7 in tutto).

## Perché non tutto da Claude Code

- La **prova illimitata** di Higgsfield vale solo in Claude chat, Claude Cowork e ChatGPT. Da Claude
  Code (dove gira questa sessione) si possono spendere solo i crediti.
- L'illimitato copre immagini, video e audio. **Nessun modello 3D è incluso**: si pagano sempre.

Costi dei modelli 3D (preventivi di Higgsfield, per singolo modello):

| Modello | Crediti |
|---|---|
| Tripo, da testo, qualità base | 5 |
| Tripo H3.1, da immagine, dettaglio massimo | 18 |
| Meshy 6, da testo | 25 |
| Meshy 7, da immagine | 38 |

Per i 16 modelli a qualità alta (immagine di riferimento + Tripo H3.1) servono circa 290 crediti.

## Passo 1 — immagini di riferimento (gratis, da Claude chat)

Apri **claude.ai** con il connettore Higgsfield e incolla questo, una richiesta per volta o tutte
insieme. Chiedi esplicitamente di **usare le generazioni illimitate**.

Prefisso di stile, uguale per tutte (tienilo identico: è ciò che rende coerente il set):

> stylized hand-painted 3D game asset, soft cel-shaded look, rounded organic shapes, rich saturated
> colors, single object centered, three-quarter view from slightly above, plain light grey
> background, soft even studio lighting, no cast shadow on the ground, no text

Modello consigliato: `gpt_image_2_6`, qualità `high`, formato 1:1.

| Chiave nel gioco | Dopo il prefisso aggiungi |
|---|---|
| `character` | full body mountain climber in T-pose facing the camera, arms straight out, orange jacket, dark blue trousers, brown gloves and boots, red beanie with pompom, goggles on forehead, big backpack with coiled rope (per questo: vista frontale, non di tre quarti) |
| `palm` | tropical palm tree with a gently curved trunk, lush arched fronds and coconuts |
| `jungleTree` | big jungle tree with thick trunk, visible roots and a wide lush layered canopy |
| `bush` | dense tropical bush with big glossy leaves |
| `rock` | smooth weathered beach boulder, warm grey-brown |
| `giantMushroom` | giant mushroom, thick pale stem, wide pink-red cap with white spots |
| `smallMushroom` | cluster of five small glowing purple mushrooms |
| `pine` | tall snowy pine tree, layered drooping branches with snow on top |
| `iceShard` | cluster of sharp translucent blue ice crystals |
| `cactus` | saguaro cactus with two arms and small flowers |
| `boulder` | layered red sandstone boulder |
| `obsidian` | cluster of glassy black obsidian spikes |
| `emberRock` | dark volcanic rock with glowing orange lava cracks |
| `summitRock` | frosted grey rock with a snow cap |
| `campfire` | campfire, ring of stones with crossed logs, NO flames |
| `summitFlag` | tall metal pole with a yellow triangular flag |

Scarica le immagini e caricale nella sessione di Claude Code (come hai fatto con lo zip).

## Passo 2 — modelli 3D (a crediti, da Claude Code)

Con le immagini di riferimento e i crediti, da qui si lancia per ognuna:

- modello `tripo_h3_1_image_to_3d`, `geometry_quality: detailed`, `texture_quality: detailed`,
  `pbr: true` (18 crediti);
- per il personaggio: `meshy_v7_image_to_3d` con `pose_mode: t-pose`, `enable_rigging: true`, poi
  le animazioni (idle, camminata, corsa, arrampicata, caduta) con `3d_rigging`.

I GLB vanno in questa cartella e in `manifest.json` con la chiave della tabella: il gioco li
ammorbidisce e li passa al materiale toon da solo.

## Come sono usate le texture nel gioco

`manifest.json` → `biomeTextures`. `src/render.js` le impacchetta in due texture a strati (una
per la roccia, una per le cime): ogni macigno usa la roccia del suo bioma sui fianchi, proiettata
dai tre assi, e la cima sulle facce che guardano in alto. La ripetizione è a specchio, quindi non
si vedono giunzioni anche se una texture non è perfettamente seamless.
