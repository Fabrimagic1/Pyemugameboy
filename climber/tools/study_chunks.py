"""Esperimento per lo studio sulla generazione (docs/STUDIO_GENERAZIONE.md).

Ipotesi: una montagna "alla PEAK" non nasce da una funzione continua con gradoni,
ma dall'UNIONE di tanti blocchi di roccia (macigni) appoggiati su una sagoma guida.
Qui lo proviamo nel modo più economico possibile, su una heightmap:
    quota(x, z) = max( isola, max_i blocco_i(x, z) )
e disegniamo il risultato con un piccolo renderer prospettico, colorando per pendenza
(piano = sabbia, ripido = roccia) come si vede nelle foto del gioco.

Uso:  python3 climber/tools/study_chunks.py [seed] [uscita.png]
Richiede numpy e Pillow. Non tocca il gioco.
"""
import sys, math
import numpy as np
from PIL import Image

seed = int(sys.argv[1]) if len(sys.argv) > 1 else 7
out = sys.argv[2] if len(sys.argv) > 2 else 'climber/docs/studio_macigni.png'
rng = np.random.default_rng(seed)

N, CELL = 520, 0.4                      # griglia 208 x 208 m
ax = (np.arange(N) - N / 2) * CELL
X, Z = np.meshgrid(ax, ax)
R = np.hypot(X, Z)

# 1) SAGOMA GUIDA: un'isola bassa di sabbia + un monte a cupola ripida (non si vede mai:
#    serve solo a dire a che quota deve stare la cima di ogni blocco)
H_TOP, R_BASE = 78.0, 62.0
def envelope(x, z):
    r = np.hypot(x * 1.0, z * 1.15)
    return H_TOP * np.clip(1 - (r / R_BASE) ** 1.7, 0, None)
island = 3.5 * np.clip(1 - (R / 100) ** 3, 0, None) + 0.6 * np.sin(X * 0.09) * np.cos(Z * 0.11)
height = island.copy()
kind = np.zeros((N, N), np.uint8)       # 0 isola, 1 macigno, 2 colonna

# 2) MACIGNI: scatole arrotondate (superellisse), ruotate e un po' inclinate
def stamp(cx, cz, top, a, b, rot, tilt_x, tilt_z, p, k):
    r = max(a, b) * 1.6
    i0, i1 = max(0, int((cx - r - ax[0]) / CELL)), min(N, int((cx + r - ax[0]) / CELL) + 1)
    j0, j1 = max(0, int((cz - r - ax[0]) / CELL)), min(N, int((cz + r - ax[0]) / CELL) + 1)
    x, z = X[j0:j1, i0:i1] - cx, Z[j0:j1, i0:i1] - cz
    c, s = math.cos(rot), math.sin(rot)
    u, v = (x * c + z * s) / a, (-x * s + z * c) / b
    d = (np.abs(u) ** p + np.abs(v) ** p) ** (1 / p)          # 1 = bordo del blocco
    h = top + tilt_x * u * a + tilt_z * v * b - 0.9 * d ** 6   # cima quasi piana, spigoli smussati
    h = np.where(d > 1, top - 0.9 - (d - 1) * min(a, b) * 9, h)  # fianchi quasi verticali
    sub = height[j0:j1, i0:i1]
    m = h > sub
    sub[m] = h[m]; kind[j0:j1, i0:i1][m] = k

count = 0
for _ in range(900):
    ang, rad = rng.uniform(0, 2 * math.pi), R_BASE * math.sqrt(rng.uniform(0, 1.0))
    cx, cz = math.cos(ang) * rad, math.sin(ang) * rad / 1.15
    e = float(envelope(cx, cz))
    if e < 2: continue
    size = rng.uniform(4.5, 11) * (0.75 + 0.5 * (1 - e / H_TOP))     # più grossi in basso
    stamp(cx, cz, e + rng.uniform(-2.5, 3.5), size, size * rng.uniform(0.55, 1.0), rng.uniform(0, math.pi),
          rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng.uniform(2.6, 4.5), 1)
    count += 1

# 3) COLONNE chiare a gruppi, ai piedi del monte (dettaglio ricorrente nelle foto)
for _ in range(26):
    ang, rad = rng.uniform(0, 2 * math.pi), rng.uniform(R_BASE * 0.75, R_BASE * 1.15)
    gx, gz = math.cos(ang) * rad, math.sin(ang) * rad
    for _ in range(rng.integers(4, 11)):
        cx, cz = gx + rng.normal(0, 2.4), gz + rng.normal(0, 2.4)
        j, i = int((cz - ax[0]) / CELL), int((cx - ax[0]) / CELL)
        if 0 <= i < N and 0 <= j < N:
            stamp(cx, cz, height[j, i] + rng.uniform(1.5, 7), 0.8, 0.8, rng.uniform(0, 1.5), 0, 0, 6, 2)

# 4) COLORE PER PENDENZA: il materiale non è "dipinto" dal bioma, dipende dalla normale
gz_, gx_ = np.gradient(height, CELL)
nl = np.sqrt(gx_ ** 2 + gz_ ** 2 + 1)
nx, ny, nz = -gx_ / nl, 1 / nl, -gz_ / nl
sand, rock, column = np.array([222, 170, 92.]), np.array([128, 124, 114.]), np.array([196, 196, 190.])
t = np.clip((ny - 0.72) / 0.14, 0, 1)[..., None]
col = rock * (1 - t) + sand * t
col[kind == 2] = column
sun = np.array([0.45, 0.75, -0.5]); sun /= np.linalg.norm(sun)
lit = np.clip(nx * sun[0] + ny * sun[1] + nz * sun[2], 0, 1)
shade = np.where(lit > 0.55, 1.0, np.where(lit > 0.25, 0.8, 0.58))[..., None]   # luce a fasce (toon)
col = col * shade
sea = height < 0.35
col[sea] = np.array([70, 170, 190.])

# 5) RENDERER PROSPETTICO minimale ("voxel space"): per ogni colonna dello schermo un raggio
#    avanza sulla heightmap e disegna dal basso verso l'alto ciò che sporge sopra l'orizzonte corrente
W, Hh = 960, 600
img = np.zeros((Hh, W, 3), np.uint8)
ys = np.arange(Hh)[:, None]
img[:] = ((np.array([150, 205, 215.]) * (1 - ys / Hh) + np.array([205, 232, 232.]) * (ys / Hh))[:, None, :]).astype(np.uint8)
cam = np.array([0.0, 46.0, -150.0]); fov, horizon = 0.62, Hh * 0.40
for sx in range(W):
    a = (sx / W - 0.5) * 2 * fov
    dx, dz = math.sin(a), math.cos(a)
    ybuf, dist = Hh, 6.0
    while dist < 300 and ybuf > 0:
        px, pz = cam[0] + dx * dist, cam[2] + dz * dist
        i, j = int((px - ax[0]) / CELL), int((pz - ax[0]) / CELL)
        if 0 <= i < N and 0 <= j < N:
            sy = int(horizon - (height[j, i] - cam[1]) / (dist * math.cos(a)) * 520)
            if sy < ybuf:
                fog = min(0.5, dist / 700)
                c = col[j, i] * (1 - fog) + np.array([190, 222, 226.]) * fog
                img[max(sy, 0):ybuf, sx] = c
                ybuf = max(sy, 0)
        dist += 0.25 + dist * 0.004
Image.fromarray(img).save(out)
steep = float(np.mean(ny[kind == 1] < 0.72))
print(f'blocchi: {count}, quota massima: {height.max():.0f} m, superficie dei blocchi ripida (da scalare): {steep:.0%}, immagine: {out}')
