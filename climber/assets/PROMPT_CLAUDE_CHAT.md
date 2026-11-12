# Da incollare in Claude chat (o Cowork) per usare l'illimitato

La prova illimitata di Higgsfield vale in **Claude chat, Claude Cowork e ChatGPT**, non in Claude Code.
Apri una chat nuova con il **connettore Higgsfield attivo** e incolla tutto il blocco qui sotto.
Scade il **14 novembre**.

---

```
Usa il connettore Higgsfield con le mie generazioni ILLIMITATE (use_unlim: true) e NON spendere
crediti. Se per un'immagine l'illimitato non è disponibile, fermati e dimmelo invece di usare i crediti.

Genera queste 19 immagini per i modelli 3D di un gioco di arrampicata. Modello: gpt_image_2_6,
qualità high, formato 1:1. Usa generate_image_batch (massimo 12 per chiamata, quindi due chiamate),
poi jobs_wait, poi mostrami tutto con show_generation_by_ids.

PREFISSO DI STILE, identico in tutti i prompt (non cambiarlo, è ciò che rende coerente il set):
"realistic stylized 3D game asset reference, natural believable proportions, detailed materials,
single object centered, three-quarter view from slightly above, plain light grey background, soft
even studio lighting, no cast shadow on the ground, no text"

Per ogni immagine il prompt è: PREFISSO + descrizione.

 1. personaggio, vista frontale (non di tre quarti), T-pose:
    "full body mountain climber in T-pose facing the camera, arms straight out, orange technical
    jacket, dark blue trousers, brown gloves and boots, red beanie with pompom, goggles on forehead,
    big olive backpack with coiled rope, realistic adult proportions"
 2. personaggio, vista laterale, stessa posa e stesso abbigliamento di 1 (usa 1 come riferimento)
 3. personaggio, vista posteriore, stessa posa e stesso abbigliamento di 1 (usa 1 come riferimento)
 4. palma: "tropical palm tree with a gently curved trunk, lush arched fronds and coconuts"
 5. albero della giungla: "big jungle tree with thick trunk, visible roots and a wide lush layered canopy"
 6. cespuglio: "dense tropical bush with big glossy leaves"
 7. roccia da spiaggia: "smooth weathered beach boulder, warm grey-brown"
 8. fungo gigante: "giant mushroom, thick pale stem, wide pink-red cap with white spots"
 9. funghetti: "cluster of five small glowing purple mushrooms"
10. pino: "tall snowy pine tree, layered drooping branches with snow on top"
11. cristalli di ghiaccio: "cluster of sharp translucent blue ice crystals"
12. cactus: "saguaro cactus with two arms and small flowers"
13. masso rosso: "layered red sandstone boulder"
14. ossidiana: "cluster of glassy black obsidian spikes"
15. roccia lavica: "dark volcanic rock with glowing orange lava cracks"
16. roccia di vetta: "frosted grey rock with a snow cap"
17. falò: "campfire, ring of stones with crossed logs, NO flames"
18. bandiera: "tall metal pole with a yellow triangular flag, flag fully visible"
19. valigia: "old brown leather suitcase with metal corners and a handle, closed"

Quando sono pronte dammi i link di download di ogni immagine, uno per riga, con il numero e il nome.
Non generare altro.
```

---

## Dopo

1. Scarica le 19 immagini (o i link che ti dà Claude chat).
2. Caricale in Claude Code come hai fatto con lo zip, oppure incollami i link qui.
3. Da Claude Code lancio i modelli 3D a crediti: `tripo_h3_1_image_to_3d` (18 crediti l'uno), o
   `tripo_h3_1_multiview_to_3d` per il personaggio con le viste 1, 2 e 3 (geometria più precisa).
   Servono circa 340 crediti per tutto, quindi prima va ricaricato il saldo.
4. Per il personaggio c'è poi da aggiungere lo scheletro e le animazioni (idle, camminata, corsa,
   arrampicata, caduta).

Se la chat ha **Cowork con accesso ai file**, puoi chiedergli di salvare le immagini direttamente
nella cartella `climber/assets/ref/` del repository `fabrimagic1/pyemugameboy` (branch
`claude/eager-maxwell-b99zdb`): le trovo qui senza che tu debba caricare nulla.
