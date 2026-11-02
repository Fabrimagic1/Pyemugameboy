# Mosse di MONSTER DUNGEON

## Elementi

Ciclo dei vantaggi: **TERRA > ACQUA > FUOCO > VENTO > TERRA**.

| Attacco \ Difesa | TERRA | ACQUA | FUOCO | VENTO |
|---|:-:|:-:|:-:|:-:|
| TERRA | x1 | x2 | x1 | x0.5 |
| ACQUA | x0.5 | x1 | x2 | x1 |
| FUOCO | x1 | x0.5 | x1 | x2 |
| VENTO | x2 | x1 | x0.5 | x1 |

Le mosse NEUTRE non hanno vantaggi ne' svantaggi. Una mossa dello stesso elemento del mostro che la usa ottiene il bonus **STAB x1.5**.

## Formula del danno

```
base  = ((2*Liv/5 + 2) * Potenza * ATT / DIF) / 50 + 2
danno = base * STAB * efficacia * casuale(0.85..1.00)
```

## Elenco mosse

### TERRA

| Mossa | Potenza | Precisione | Categoria |
|---|--:|--:|---|
| SASSATA | 40 | 100% | BASE |
| RADICI | 45 | 100% | BASE |
| FRANA | 65 | 95% | MEDIA |
| SPINE | 60 | 95% | MEDIA |
| TERREMOTO | 95 | 90% | FORTE |
| MONTAGNA | 110 | 85% | ULTIMA |

### ACQUA

| Mossa | Potenza | Precisione | Categoria |
|---|--:|--:|---|
| SPRUZZO | 40 | 100% | BASE |
| BOLLA | 45 | 100% | BASE |
| ONDATA | 65 | 95% | MEDIA |
| GELO | 60 | 95% | MEDIA |
| TSUNAMI | 95 | 90% | FORTE |
| ABISSO | 110 | 85% | ULTIMA |

### FUOCO

| Mossa | Potenza | Precisione | Categoria |
|---|--:|--:|---|
| SCINTILLA | 40 | 100% | BASE |
| BRACE | 45 | 100% | BASE |
| FIAMMATA | 65 | 95% | MEDIA |
| LAVA | 60 | 95% | MEDIA |
| INFERNO | 95 | 90% | FORTE |
| ERUZIONE | 110 | 85% | ULTIMA |

### VENTO

| Mossa | Potenza | Precisione | Categoria |
|---|--:|--:|---|
| SOFFIO | 40 | 100% | BASE |
| RAFFICA | 45 | 100% | BASE |
| TAGLIO | 65 | 95% | MEDIA |
| FULMINE | 60 | 95% | MEDIA |
| TORNADO | 95 | 90% | FORTE |
| TEMPESTA | 110 | 85% | ULTIMA |

### NEUTRE

| Mossa | Potenza | Precisione | Categoria |
|---|--:|--:|---|
| COLPO | 40 | 100% | BASE |
| MORSO | 50 | 100% | BASE |
| CORNATA | 60 | 95% | MEDIA |
| ASSALTO | 75 | 90% | MEDIA |
| TURBO | 90 | 85% | FORTE |
| FINALE | 100 | 80% | ULTIMA |

## Regole di apprendimento

Ogni specie ha 4 mosse che si sbloccano automaticamente salendo di livello:

| Slot | Livello | Mossa |
|---:|---:|---|
| 1 | 1 | mossa BASE del proprio elemento (Sassata/Radici, Spruzzo/Bolla, Scintilla/Brace, Soffio/Raffica; sceglie la famiglia) |
| 2 | 8 | mossa NEUTRA (Colpo, Morso o Cornata) |
| 3 | 22 | mossa MEDIA: del proprio elemento, oppure di un **elemento secondario** per le famiglie dispari |
| 4 | 40 | mossa FORTE del proprio elemento (la ULTIMA al terzo stadio) |

Quando un mostro evolve cambiano anche le mosse (es. al terzo stadio lo slot 4 diventa la mossa ULTIMA).

## Mosse per elemento del mostro

- **TERRA**: SASSATA, RADICI, FRANA, SPINE, TERREMOTO, MONTAGNA, ONDATA, GELO, FIAMMATA, LAVA, TAGLIO, COLPO, MORSO, CORNATA
- **ACQUA**: FRANA, SPRUZZO, BOLLA, ONDATA, GELO, TSUNAMI, ABISSO, FIAMMATA, LAVA, TAGLIO, FULMINE, COLPO, MORSO, CORNATA
- **FUOCO**: FRANA, SPINE, ONDATA, SCINTILLA, BRACE, FIAMMATA, LAVA, INFERNO, ERUZIONE, TAGLIO, FULMINE, COLPO, MORSO, CORNATA
- **VENTO**: FRANA, SPINE, ONDATA, GELO, FIAMMATA, SOFFIO, RAFFICA, TAGLIO, FULMINE, TORNADO, TEMPESTA, COLPO, MORSO, CORNATA
