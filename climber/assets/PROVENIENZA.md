# Asset Climber

Pacchetto locale preparato il 5 novembre 2026. Comprende 2 texture JPEG e
16 modelli GLB (15 oggetti ambientali e 1 personaggio).

## Provenienza e compatibilita

- `rock.jpg`, `ground.jpg`: generate con lo strumento integrato image_gen,
  convertite in JPEG 1024 x 1024. Prompt completi in `texture-prompts.json`.
  I prompt richiedono texture seamless; la continuita delle giunzioni deve
  ancora essere valutata nel materiale del gioco, con le sue ripetizioni e luci.
- GLB: modelli low-poly originali creati tramite codice, materiali PBR incorporati,
  senza texture o dipendenze esterne. Non sono output di un servizio AI 3D/Mixamo.
- Metri, Y verso l'alto, personaggio rivolto verso +Z, scala unitaria.
  I perni sono all'origine, alla base; ogni oggetto ha il vertice piu basso a Y=0.
- Personaggio in T-pose: 1,75 m, 17 ossa, skin glTF con pesi rigidi per parti
  facettate, mani con quattro dita e pollice, zaino e cappello.
- Clip nel personaggio: `Idle`, `Walking`, `Running`, `Climbing`, `Falling`.
  Sono cicli di base senza root motion; adattamento alla parete, IK delle mani,
  tremore da stamina e pausa delle mani sono responsabilita del controller.
- Fungo gigante: altezza esatta 3,70 m. Falò senza fiamma. Roccia lavica con
  materiale emissivo: l'alone luminoso richiede bloom nel renderer.
- Da 90 a 1056 triangoli per modello; misure e conteggi in `model-info.json`
  e conteggi effettivamente esportati in `validation.json`.

## File

| Utilizzo | File |
| --- | --- |
| Pareti | rock.jpg |
| Pianori | ground.jpg |
| Personaggio | climber.glb |
| Falò | campfire.glb |
| Spiaggia | palm.glb, beach_rock.glb |
| Giungla | jungle_tree.glb, bush.glb |
| Funghi | giant_mushroom.glb, small_mushrooms.glb |
| Ghiacciaio | snow_pine.glb, ice_crystals.glb |
| Altopiano rosso | cactus.glb, red_boulder.glb |
| Caldera | obsidian_spike.glb, glowing_lava_rock.glb |
| Vetta | snow_rock.glb, summit_flag.glb |

## Collegamento al gioco

Il repository e il README del branch `claude/eager-maxwell-b99zdb` non erano
presenti nello spazio di lavoro e non sono stati accessibili tramite il connettore.
Nomi e dimensioni non indicati nel messaggio sono quindi scelte provvisorie.
Non e stato inventato o sovrascritto un `manifest.json` con schema sconosciuto.
`asset-map.json` e un inventario neutro da tradurre nelle chiavi del manifest
esistente, NON un manifest gia compatibile e verificato.

Per integrare: copiare i JPEG e GLB nella cartella degli asset del repository,
associare i percorsi alle chiavi gia previste dal suo loader, verificare che il
controller selezioni le cinque clip con i nomi sopra. Il modello non richiede
Mixamo per queste animazioni di base. Il rig non e un rig Mixamo standard.

## Verifiche e anteprime

`preview-models.jpg` mostra i 16 modelli effettivamente letti dai GLB.
`preview-animations.jpg` mostra due pose per ogni clip, deformate usando skin
e matrici inverse contenute nel GLB. Le viste usano un renderer software e
non rappresentano luci, bloom o shader del gioco.

Controlli eseguiti: header e lunghezza GLB, intervalli binari e accessori,
valori finiti, normali unitarie, indici delle ossa e somme dei pesi,
quaternioni unitari, tempi ordinati e corrispondenza dei keyframe,
lettura di 5 pose per ogni animazione, misure e perni, formato dei JPEG.
Non sono una certificazione del Khronos Validator; manca la prova nel gioco.

Rigenerazione (Python con numpy e Pillow):

```powershell
python climber/tools/build_assets.py
python climber/tools/inspect_assets.py
```

I generatori non modificano le texture. Le palette dei modelli si trovano in
`tools/build_assets.py` e possono essere adattate al prefisso del README originale.
