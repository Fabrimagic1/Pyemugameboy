#!/usr/bin/env python3
"""Generatore dei dati di MONSTER DUNGEON (gioco Game Boy).

Produce:
  game/data.h        tabelle C: specie, mosse, tile, mappe
  docs/MOSTRI.md     elenco dei 120 mostri con statistiche e mosse
  docs/MOSSE.md      elenco mosse, tabella elementi, regole di apprendimento
Tutto il resto del gioco (sprite dei mostri, dungeon, nemici) e' procedurale a runtime.
"""
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ELEMENTS = ["TERRA", "ACQUA", "FUOCO", "VENTO"]
EL3 = ["TER", "ACQ", "FUO", "VEN"]
FAMILIES = 10
STAGES = 3
NSP = FAMILIES * STAGES  # 30
# elemento di ogni famiglia: 3 Terra, 2 Acqua, 3 Fuoco, 2 Vento
FAM_EL = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3]
FAM_STEM = ["GROK", "MOLD", "ROCC", "NELO", "MARI", "PIRO", "FIAM", "IGNI", "AERO", "ZEFI"]

# --------------------------------------------------------------- MOSSE
# (nome, potenza, precisione)
MOVES_EL = {
    0: [("SASSATA", 40, 100), ("RADICI", 45, 100), ("FRANA", 65, 95),
        ("SPINE", 60, 95), ("TERREMOTO", 95, 90), ("MONTAGNA", 110, 85)],
    1: [("SPRUZZO", 40, 100), ("BOLLA", 45, 100), ("ONDATA", 65, 95),
        ("GELO", 60, 95), ("TSUNAMI", 95, 90), ("ABISSO", 110, 85)],
    2: [("SCINTILLA", 40, 100), ("BRACE", 45, 100), ("FIAMMATA", 65, 95),
        ("LAVA", 60, 95), ("INFERNO", 95, 90), ("ERUZIONE", 110, 85)],
    3: [("SOFFIO", 40, 100), ("RAFFICA", 45, 100), ("TAGLIO", 65, 95),
        ("FULMINE", 60, 95), ("TORNADO", 95, 90), ("TEMPESTA", 110, 85)],
}
MOVES_NEUTRAL = [("COLPO", 40, 100), ("MORSO", 50, 100), ("CORNATA", 60, 95),
                 ("ASSALTO", 75, 90), ("TURBO", 90, 85), ("FINALE", 100, 80)]
TIER = ["BASE", "BASE", "MEDIA", "MEDIA", "FORTE", "ULTIMA"]

MOVES = []  # (nome, el, pow, acc)
for e in range(4):
    for n, p, a in MOVES_EL[e]:
        MOVES.append((n, e, p, a))
for n, p, a in MOVES_NEUTRAL:
    MOVES.append((n, 4, p, a))
NMV = len(MOVES)
LEARN_LV = [1, 8, 22, 40]

# ------------------------------------------------------------- SPECIE
SUFFIX = ["", "ON", "ORAX"]
BIAS = {  # hp, atk, def, spd
    0: (14, 0, 16, -22),
    1: (10, -4, 4, 2),
    2: (-6, 18, -8, 4),
    3: (-12, 2, -10, 24),
}
EVO_LV = [16, 36]

rng = random.Random(20240601)
SPECIES = []
for f in range(FAMILIES):
    e = FAM_EL[f]
    weights = [rng.randint(60, 140) for _ in range(4)]
    for s in range(STAGES):
        total = 190 + 75 * s + rng.randint(-10, 18)
        ws = sum(weights)
        base = [total * w // ws + BIAS[e][i] for i, w in enumerate(weights)]
        base = [max(20, min(150, b)) for b in base]
        sp = f * 3 + s
        name = FAM_STEM[f] + SUFFIX[s]
        assert len(name) <= 8, name
        m0 = e * 6 + (f & 1)
        m1 = 24 + ((f + s) % 3)
        if f & 1:
            e2 = (e + 1 + (f % 3)) & 3
            m2 = e2 * 6 + 2 + ((f >> 1) & 1)
        else:
            m2 = e * 6 + 2 + ((f >> 1) & 1)
        m3 = e * 6 + (5 if s == 2 else 4)
        SPECIES.append(dict(id=sp, name=name, el=e, fam=f, stage=s,
                            base=base, moves=[m0, m1, m2, m3]))
assert len(SPECIES) == NSP
assert len({x["name"] for x in SPECIES}) == NSP

# --------------------------------------------------------------- FONT
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".####"],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
    "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
    ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    ",": [".....", ".....", ".....", ".....", "..#..", "..#..", ".#..."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    ".": [".....", ".....", ".....", ".....", ".....", "..##.", "..##."],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    ":": [".....", "..##.", "..##.", ".....", "..##.", "..##.", "....."],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
    ">": ["#....", "##...", "###..", "####.", "###..", "##...", "#...."],
    "<": ["....#", "...##", "..###", ".####", "..###", "...##", "....#"],
    "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"],
    "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
    "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
    "~": [".....", ".....", ".##.#", "#.##.", ".....", ".....", "....."],
}


def tile_from_rows(rows):
    out = []
    for r in rows:
        lo = hi = 0
        for ch in r:
            c = int(ch)
            lo = (lo << 1) | (c & 1)
            hi = (hi << 1) | (c >> 1)
        out += [lo, hi]
    return out


def font_tile(ch):
    g = FONT.get(ch)
    if g is None:
        return [0] * 16
    rows = []
    for r in g:
        rows.append("".join("3" if c == "#" else "0" for c in r) + "000")
    rows.append("00000000")
    return tile_from_rows(rows)


TILES = []  # lista di 16 byte
for code in range(32, 96):
    TILES.append(font_tile(chr(code)))
assert len(TILES) == 64

ART = {}
ART["GRASS"] = ["11111111", "12111121", "11111111", "11112111", "11111111",
                "12111111", "11111211", "11111111"]
ART["TREE"] = ["00222200", "02222220", "22322322", "22222222", "22232322",
               "02222220", "00033000", "00033000"]
ART["WATER"] = ["22222222", "21122112", "22222222", "22211222", "22222222",
                "11222211", "22222222", "22112222"]
ART["PATH"] = ["00000000", "00100000", "00000010", "00000000", "01000000",
               "00000000", "00001000", "00000000"]
ART["WALL"] = ["33333333", "00100010", "00100010", "33333333", "10001000",
               "10001000", "33333333", "00100010"]
ART["ROOF"] = ["22222222", "33333333", "22222222", "33333333", "22222222",
               "33333333", "22222222", "33333333"]
door = ["33333333", "32222223", "32222223", "32222223", "32222223",
        "32233223", "32222223", "32222223"]
ART["DOOR_GYM"] = door
ART["DOOR_HOUSE"] = door
ART["CAVE"] = ["11222211", "12333321", "23333332", "23333332", "23333332",
               "23333332", "23333332", "23333332"]
ART["FLOORIN"] = ["00000001", "00000001", "00000001", "00000001", "00000001",
                  "00000001", "00000001", "11111111"]
ART["DWALL"] = ["33333333", "32223222", "32223222", "33333333", "22232223",
                "22232223", "33333333", "32223222"]
ART["DFLOOR"] = ["11111111", "11011111", "11111111", "11111101", "11111111",
                 "10111111", "11111111", "11111011"]
ART["DOWN"] = ["11111111", "11133111", "11133111", "13333331", "11333311",
               "11133111", "11111111", "11111111"]
ART["UP"] = ["11111111", "11111111", "11133111", "11333311", "13333331",
             "11133111", "11133111", "11111111"]


def npc(bg, hat, body, face="0"):
    b = str(bg)
    return [b * 2 + hat * 2 + b * 2 + "", ]  # placeholder (overwritten below)


def npc_art(bg, hair, body, legs):
    b, h, f, c, l = str(bg), str(hair), "0", str(body), str(legs)
    return [b + b + b + h + h + b + b + b,
            b + b + h + h + h + h + b + b,
            b + b + h + f + f + h + b + b,
            b + b + b + f + f + b + b + b,
            b + b + c + c + c + c + b + b,
            b + c + c + c + c + c + c + b,
            b + b + c + b + b + c + b + b,
            b + b + l + b + b + l + b + b]


ART["NPC_GUIDE1"] = npc_art(1, 3, 2, 3)
ART["NPC_GUIDE2"] = npc_art(1, 2, 3, 3)
ART["NPC_NURSE"] = npc_art(0, 2, 0, 2)
ART["NPC_MERCH"] = npc_art(0, 3, 2, 2)
ART["NPC_BOSS"] = ["03333330", "03233230", "02300320", "00300300",
                   "23322332", "23333332", "02222220", "03200230"]
ART["EXIT"] = ["33333333", "30000003", "30000003", "30000003", "30000003",
               "30033003", "30000003", "30000003"]
ART["COUNTER"] = ["33333333", "32222223", "32222223", "33333333", "00000000",
                  "00000000", "00000000", "00000000"]
ART["CARPET"] = ["22222222", "21111112", "21211212", "21111112", "21211212",
                 "21111112", "21211212", "21111112"]
ART["PILLAR"] = ["00333300", "00322300", "00322300", "00322300", "00322300",
                 "00322300", "00322300", "03333330"]
ART["FLOWER"] = ["11111111", "11131111", "11313111", "11131111", "11112111",
                 "11112111", "11111111", "11111111"]
ART["PLAYER"] = ["00333300", "03333330", "03111130", "03101030", "00111100",
                 "02222220", "02222220", "00300300"]

TILE_NAMES = ["GRASS", "TREE", "WATER", "PATH", "WALL", "ROOF", "DOOR_GYM",
              "DOOR_HOUSE", "CAVE", "FLOORIN", "DWALL", "DFLOOR", "DOWN", "UP",
              "NPC_GUIDE1", "NPC_GUIDE2", "NPC_NURSE", "NPC_MERCH", "NPC_BOSS",
              "EXIT", "COUNTER", "CARPET", "PILLAR", "FLOWER"]
TILE_ID = {}
for n in TILE_NAMES:
    TILE_ID[n] = len(TILES)
    TILES.append(tile_from_rows(ART[n]))
# eroe in stile Link: sprite OBJ 8x16 (coppie di tile, indice pari): fronte, schiena, profilo
if len(TILES) % 2:
    TILES.append([0] * 16)
HERO = {
    "DOWN": ["00022000", "00222200", "02222220", "22222222", "31111113", "31311313",
             "01111110", "00322300", "03222230", "32222223", "31222213", "03333330",
             "02222220", "02222220", "03300330", "03300330"],
    "UP": ["00022000", "00222200", "02222220", "22222222", "22222222", "21111112",
           "01111110", "00322300", "03322330", "32311323", "32311323", "03333330",
           "02222220", "02222220", "03300330", "03300330"],
    "SIDE": ["00022200", "00222220", "02222222", "22222220", "03111130", "03111310",
             "00111110", "00322300", "03222230", "03212230", "03222130", "03333330",
             "02222220", "02222220", "00333330", "00333330"],
}
TILE_ID["PLAYER"] = len(TILES)
for k in ("DOWN", "UP", "SIDE"):
    TILES.append(tile_from_rows(HERO[k][:8]))
    TILES.append(tile_from_rows(HERO[k][8:]))
# barra HP: 9 tile (0..8 pixel riempiti)
TILE_ID["BAR"] = len(TILES)
for k in range(9):
    rows = ["00000000"] * 2
    for y in range(4):
        if y in (0, 3):
            rows.append("33333333")
        else:
            rows.append("3" * 0 + "".join("3" if i < k else "0" for i in range(8)))
    rows += ["00000000"] * 2
    TILES.append(tile_from_rows(rows))
# cornice: TL T TR L R BL B BR
TILE_ID["BOX"] = len(TILES)


def frame_tile(top, bottom, left, right):
    rows = []
    for y in range(8):
        row = ["0"] * 8
        if top and y in (5, 6):
            row = ["3"] * 8
        if bottom and y in (1, 2):
            row = ["3"] * 8
        for x in range(8):
            if left and x in (5, 6):
                row[x] = "3"
            if right and x in (1, 2):
                row[x] = "3"
        rows.append("".join(row))
    return tile_from_rows(rows)


# corner: TL = top+left ma solo nell'angolo in basso-destra
def corner(tl=False, tr=False, bl=False, br=False):
    rows = [["0"] * 8 for _ in range(8)]
    for y in range(8):
        for x in range(8):
            if tl and ((y in (5, 6) and x >= 5) or (x in (5, 6) and y >= 5)):
                rows[y][x] = "3"
            if tr and ((y in (5, 6) and x <= 2) or (x in (1, 2) and y >= 5)):
                rows[y][x] = "3"
            if bl and ((y in (1, 2) and x >= 5) or (x in (5, 6) and y <= 2)):
                rows[y][x] = "3"
            if br and ((y in (1, 2) and x <= 2) or (x in (1, 2) and y <= 2)):
                rows[y][x] = "3"
    return tile_from_rows(["".join(r) for r in rows])


TILES += [corner(tl=True), frame_tile(1, 0, 0, 0), corner(tr=True),
          frame_tile(0, 0, 1, 0), frame_tile(0, 0, 0, 1),
          corner(bl=True), frame_tile(0, 1, 0, 0), corner(br=True)]
assert len(TILES) < 128, len(TILES)

# ------------------------------------------------------------- MAPPE
VILLAGE = [
    "TTTTTTTTTTTTTTTTTTTT",
    "T..f.........f.....T",
    "T..^^^^^^^..^^^^^..T",
    "T..#######..#####..T",
    "T..###G###..##H##..T",
    "T.....=.......=....T",
    "T.....=.......=....T",
    "T.================.T",
    "T..~~~...f.....f...T",
    "T.~~~~~.....f......T",
    "T.~~~~~..g.........T",
    "T...~..f...........T",
    "T..............TTTTT",
    "T......k.......TTCTT",
    "T..................T",
    "T..f...........f...T",
    "T..................T",
    "TTTTTTTTTTTTTTTTTTTT",
]
VMAP = {".": "GRASS", "T": "TREE", "~": "WATER", "=": "PATH", "#": "WALL",
        "^": "ROOF", "G": "DOOR_GYM", "H": "DOOR_HOUSE", "C": "CAVE",
        "f": "FLOWER", "g": "NPC_GUIDE1", "k": "NPC_GUIDE2"}
for r in VILLAGE:
    assert len(r) == 20, r
assert len(VILLAGE) == 18


def grid(fill):
    return [[fill] * 20 for _ in range(18)]


GYM = grid("WALL")
for y in range(1, 17):
    for x in range(1, 19):
        GYM[y][x] = "FLOORIN"
for y in range(2, 16):
    for x in range(8, 12):
        GYM[y][x] = "CARPET"
for y in (4, 7, 10, 13):
    GYM[y][4] = "PILLAR"
    GYM[y][15] = "PILLAR"
GYM[3][9] = "NPC_BOSS"
GYM[17][9] = "EXIT"

HOUSE = grid("WALL")
for y in range(2, 17):
    for x in range(2, 18):
        HOUSE[y][x] = "FLOORIN"
for x in (5, 7):
    HOUSE[5][x] = "COUNTER"
HOUSE[5][6] = "NPC_NURSE"
for x in (12, 14):
    HOUSE[5][x] = "COUNTER"
HOUSE[5][13] = "NPC_MERCH"
HOUSE[17][9] = "EXIT"
for y in range(2, 17):
    HOUSE[y][2] = "FLOORIN"


def emit_map(name, rows, conv):
    s = "static const unsigned char %s[18][20] = {\n" % name
    for r in rows:
        ids = [TILE_ID[conv(c)] for c in r]
        s += "  {" + ",".join(str(i) for i in ids) + "},\n"
    return s + "};\n"


# ---------------------------------------------------------- OUTPUT C
def write_data_h():
    o = []
    o.append("/* GENERATO da tools/gen_data.py - non modificare a mano */\n")
    o.append("#ifndef DATA_H\n#define DATA_H\n")
    o.append("#define NSP %d\n#define NMV %d\n" % (NSP, NMV))
    for n in TILE_NAMES:
        o.append("#define T_%s %d\n" % (n, TILE_ID[n]))
    o.append("#define T_PLAYER %d\n" % TILE_ID["PLAYER"])
    o.append("#define T_BAR %d\n#define T_BOX %d\n" % (TILE_ID["BAR"], TILE_ID["BOX"]))
    o.append("#define NTILES %d\n" % len(TILES))
    o.append("static const unsigned char TILEDATA[%d] = {\n" % (len(TILES) * 16))
    for t in TILES:
        o.append(",".join(str(b) for b in t) + ",\n")
    o.append("};\n")
    o.append("static const char SP_NAME[NSP][9] = {\n")
    for s in SPECIES:
        o.append('  "%s",\n' % s["name"])
    o.append("};\n")
    o.append("static const unsigned char FAM_EL[10] = {%s};\n" % ",".join(str(x) for x in FAM_EL))
    o.append("static const unsigned char SP_BASE[NSP][4] = {\n")
    for s in SPECIES:
        o.append("  {%s},\n" % ",".join(str(b) for b in s["base"]))
    o.append("};\n")
    o.append("static const unsigned char SP_MV[NSP][4] = {\n")
    for s in SPECIES:
        o.append("  {%s},\n" % ",".join(str(b) for b in s["moves"]))
    o.append("};\n")
    o.append("static const char MV_NAME[NMV][10] = {\n")
    for m in MOVES:
        o.append('  "%s",\n' % m[0])
    o.append("};\n")
    o.append("static const unsigned char MV_EL[NMV] = {%s};\n" % ",".join(str(m[1]) for m in MOVES))
    o.append("static const unsigned char MV_POW[NMV] = {%s};\n" % ",".join(str(m[2]) for m in MOVES))
    o.append("static const unsigned char MV_ACC[NMV] = {%s};\n" % ",".join(str(m[3]) for m in MOVES))
    o.append("static const unsigned char MV_LV[4] = {%s};\n" % ",".join(str(x) for x in LEARN_LV))
    o.append(emit_map("MAP_VILLAGE", VILLAGE, lambda c: VMAP[c]))
    o.append(emit_map("MAP_GYM", GYM, lambda c: c))
    o.append(emit_map("MAP_HOUSE", HOUSE, lambda c: c))
    o.append("#endif\n")
    with open(os.path.join(ROOT, "game", "data.h"), "w") as f:
        f.write("".join(o))


def mv_label(i):
    n, e, p, a = MOVES[i]
    return "%s (%s, pot. %d, prec. %d%%)" % (n, ELEMENTS[e] if e < 4 else "NEUTRO", p, a)


def write_docs():
    d = os.path.join(ROOT, "docs")
    os.makedirs(d, exist_ok=True)
    o = ["# Bestiario di MONSTER DUNGEON\n\n"]
    o.append("30 mostri: 10 famiglie x 3 stadi (3 di Terra, 2 di Acqua, 3 di Fuoco, 2 di Vento). Ogni famiglia si evolve al "
             "livello **%d** (stadio 2) e al livello **%d** (stadio 3). I mostri salgono "
             "fino al livello **100**.\n\n" % tuple(EVO_LV))
    o.append("Le statistiche base sono `PS / ATT / DIF / VEL`; a livello L: "
             "`stat = base*L/50 + 5` e `PS = base*L/50 + L + 10`.\n\n")
    o.append("Le mosse si sbloccano ai livelli **%s**. Vedi [MOSSE.md](MOSSE.md).\n\n"
             % ", ".join(str(x) for x in LEARN_LV))
    for e in range(4):
        o.append("## %s\n\n" % ELEMENTS[e])
        o.append("| ID | Nome | Fam. | Stadio | PS | ATT | DIF | VEL | Mossa Lv%d | Mossa Lv%d | Mossa Lv%d | Mossa Lv%d |\n"
                 % tuple(LEARN_LV))
        o.append("|---:|------|-----:|-------:|---:|----:|----:|----:|---|---|---|---|\n")
        for s in SPECIES:
            if s["el"] != e:
                continue
            b = s["base"]
            o.append("| %d | %s | %d | %d | %d | %d | %d | %d | %s |\n" % (
                s["id"] + 1, s["name"], s["fam"] + 1, s["stage"] + 1,
                b[0], b[1], b[2], b[3],
                " | ".join(MOVES[m][0] for m in s["moves"])))
        o.append("\nLinee evolutive:\n\n")
        for f in range(FAMILIES):
            names = [x["name"] for x in SPECIES if x["el"] == e and x["fam"] == f]
            o.append("- %s\n" % " -> ".join(names))
        o.append("\n")
    with open(os.path.join(d, "MOSTRI.md"), "w") as f:
        f.write("".join(o))

    o = ["# Mosse di MONSTER DUNGEON\n\n"]
    o.append("## Elementi\n\nCiclo dei vantaggi: **TERRA > ACQUA > FUOCO > VENTO > TERRA**.\n\n")
    o.append("| Attacco \\ Difesa | TERRA | ACQUA | FUOCO | VENTO |\n|---|:-:|:-:|:-:|:-:|\n")
    for a in range(4):
        row = []
        for t in range(4):
            if ((a + 1) & 3) == t:
                row.append("x2")
            elif ((t + 1) & 3) == a:
                row.append("x0.5")
            else:
                row.append("x1")
        o.append("| %s | %s |\n" % (ELEMENTS[a], " | ".join(row)))
    o.append("\nLe mosse NEUTRE non hanno vantaggi ne' svantaggi. Una mossa dello stesso "
             "elemento del mostro che la usa ottiene il bonus **STAB x1.5**.\n\n")
    o.append("## Formula del danno\n\n```\nbase  = ((2*Liv/5 + 2) * Potenza * ATT / DIF) / 50 + 2\n"
             "danno = base * STAB * efficacia * casuale(0.85..1.00)\n```\n\n")
    o.append("## Elenco mosse\n\n")
    for e in range(5):
        o.append("### %s\n\n| Mossa | Potenza | Precisione | Categoria |\n|---|--:|--:|---|\n"
                 % (ELEMENTS[e] if e < 4 else "NEUTRE"))
        for i, m in enumerate(MOVES):
            if m[1] == e:
                o.append("| %s | %d | %d%% | %s |\n" % (m[0], m[2], m[3], TIER[i % 6]))
        o.append("\n")
    o.append("## Regole di apprendimento\n\nOgni specie ha 4 mosse che si sbloccano "
             "automaticamente salendo di livello:\n\n")
    o.append("| Slot | Livello | Mossa |\n|---:|---:|---|\n")
    o.append("| 1 | %d | mossa BASE del proprio elemento (Sassata/Radici, Spruzzo/Bolla, Scintilla/Brace, Soffio/Raffica; sceglie la famiglia) |\n" % LEARN_LV[0])
    o.append("| 2 | %d | mossa NEUTRA (Colpo, Morso o Cornata) |\n" % LEARN_LV[1])
    o.append("| 3 | %d | mossa MEDIA: del proprio elemento, oppure di un **elemento secondario** per le famiglie dispari |\n" % LEARN_LV[2])
    o.append("| 4 | %d | mossa FORTE del proprio elemento (la ULTIMA al terzo stadio) |\n\n" % LEARN_LV[3])
    o.append("Quando un mostro evolve cambiano anche le mosse (es. al terzo stadio lo slot 4 "
             "diventa la mossa ULTIMA).\n\n")
    o.append("## Mosse per elemento del mostro\n\n")
    for e in range(4):
        pool = set()
        for s in SPECIES:
            if s["el"] == e:
                pool.update(s["moves"])
        o.append("- **%s**: %s\n" % (ELEMENTS[e], ", ".join(MOVES[m][0] for m in sorted(pool))))
    with open(os.path.join(d, "MOSSE.md"), "w") as f:
        f.write("".join(o))


if __name__ == "__main__":
    write_data_h()
    write_docs()
    print("tiles:", len(TILES), "specie:", NSP, "mosse:", NMV)
