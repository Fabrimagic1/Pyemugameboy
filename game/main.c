/* MONSTER DUNGEON - gioco per Game Boy (DMG), SDCC / sm83.
 * Villaggio, dungeon procedurale, 120 mostri di 4 elementi, cattura e crescita fino al Lv 100. */
#include "data.h"

typedef unsigned char u8;
typedef signed char s8;
typedef unsigned int u16;
typedef unsigned long u32;

#define R8(a) (*(volatile u8 *)(a))
#define JOY R8(0xFF00)
#define DIVR R8(0xFF04)
#define LCDC R8(0xFF40)
#define STAT R8(0xFF41)
#define LY R8(0xFF44)
#define BGP R8(0xFF47)
#define OBP0 R8(0xFF48)
#define OAM ((volatile u8 *)0xFE00)
#define VRAM ((volatile u8 *)0x8000)
#define BGMAP 0x9800

#define K_R 1
#define K_L 2
#define K_U 4
#define K_D 8
#define K_A 0x10
#define K_B 0x20
#define K_SEL 0x40
#define K_START 0x80

#define M_VILLAGE 0
#define M_GYM 1
#define M_HOUSE 2
#define M_DUNGEON 3

typedef struct {
    u8 sp, lv;
    u16 hp;
    u32 xp;
} Mon;

typedef struct {
    u8 m0, m1, np, nb, badge, spheres, maxfloor, pad;
    u16 gold, seed;
    Mon party[6];
    Mon box[30];
} Save;

/* ------------------------------------------------------------ stato */
static u16 rs;
static u8 key, kp;
static u8 map[18][20];
static u8 curmap, px, py, pdir, floorn;
static Mon party[6], box[30], epar[3];
static u8 np, nb, en, ei, act;
static u16 gold, runseed;
static u8 spheres, badge, maxfloor;
static char buf[44];
static u8 bl;
static u8 upx, upy, dnx, dny;
static Save sv;
static u8 sprflag;

static const char *const ELN[4] = {"TERRA", "ACQUA", "FUOCO", "VENTO"};
static const char *const EL3[4] = {"TER", "ACQ", "FUO", "VEN"};

/* ------------------------------------------------------------ base */
static u8 rnd(void) {
    rs ^= rs << 7;
    rs ^= rs >> 9;
    rs ^= rs << 8;
    return (u8)(rs ^ (rs >> 8));
}

static void wait_vbl(void) {
    while (LY >= 144) {}
    while (LY < 144) {}
}

static void poll(void) {
    u8 a, b, n;
    JOY = 0x20;
    a = JOY; a = JOY; a = JOY; a = JOY;
    JOY = 0x10;
    b = JOY; b = JOY; b = JOY; b = JOY;
    JOY = 0x30;
    n = (u8)((~a & 0x0F) | ((~b & 0x0F) << 4));
    kp = n & ~key;
    key = n;
}

static void frame(void) {
    wait_vbl();
    poll();
}

static void wait_a(void) {
    do { frame(); } while (!(kp & (K_A | K_B)));
}

static void lcd_off(void) {
    if (LCDC & 0x80) {
        wait_vbl();
        LCDC = 0;
    }
}

static void lcd_on(void) { LCDC = 0x97; }

static void vw(u16 a, u8 v) {
    while (STAT & 2) {}
    *(volatile u8 *)a = v;
}

static void put(u8 x, u8 y, u8 t) { vw(BGMAP + ((u16)y << 5) + x, t); }

static void txt(u8 x, u8 y, const char *s) {
    while (*s) {
        put(x++, y, (u8)(*s - 32));
        s++;
    }
}

static void num(u8 x, u8 y, u16 v, u8 w) {
    u8 i;
    for (i = w; i > 0; i--) {
        put(x + i - 1, y, (v || i == w) ? (u8)('0' + v % 10 - 32) : 0);
        v /= 10;
    }
}

static void pad(u8 x, u8 y, u8 n) {
    while (n--) put(x++, y, 0);
}

static void box_(u8 x, u8 y, u8 w, u8 h) {
    u8 i, j;
    for (j = 0; j < h; j++)
        for (i = 0; i < w; i++) {
            u8 t = 0;
            if (j == 0) t = (i == 0) ? T_BOX : (i == w - 1) ? T_BOX + 2 : T_BOX + 1;
            else if (j == h - 1) t = (i == 0) ? T_BOX + 5 : (i == w - 1) ? T_BOX + 7 : T_BOX + 6;
            else if (i == 0) t = T_BOX + 3;
            else if (i == w - 1) t = T_BOX + 4;
            put(x + i, y + j, t);
        }
}

static void cls(void) {
    u16 i;
    for (i = 0; i < 1024; i++) vw(BGMAP + i, 0);
    R8(0xFF42) = 0;
    R8(0xFF43) = 0;
}

static void load_tiles(void) {
    u16 i;
    for (i = 0; i < NTILES * 16; i++) VRAM[i] = TILEDATA[i];
}

static void oam_clear(void) {
    u8 i;
    for (i = 0; i < 160; i++) OAM[i] = 0;
}

static void spr_set(void) {
    OAM[0] = (u8)(py * 8 + 8);
    OAM[1] = (u8)(px * 8 + 8);
    OAM[2] = T_PLAYER + (pdir == 1 ? 2 : pdir >= 2 ? 4 : 0);
    OAM[3] = pdir == 2 ? 0x20 : 0;
}

static void spr_hide(void) {
    wait_vbl();
    OAM[0] = 0;
}

static void spr_show(void) {
    wait_vbl();
    spr_set();
}

/* suono semplice */
static void beep(u8 lo, u8 hi) {
    R8(0xFF26) = 0x80;
    R8(0xFF24) = 0x77;
    R8(0xFF25) = 0xFF;
    R8(0xFF10) = 0x00;
    R8(0xFF11) = 0x80;
    R8(0xFF12) = 0xA2;
    R8(0xFF13) = lo;
    R8(0xFF14) = 0x80 | hi;
}

/* ------------------------------------------------------------ testo */
static void bs(void) { bl = 0; buf[0] = 0; }
static void bc(const char *s) { while (*s) buf[bl++] = *s++; buf[bl] = 0; }
static void bn(u16 v) {
    char t[6];
    u8 i = 0;
    do { t[i++] = (char)('0' + v % 10); v /= 10; } while (v);
    while (i) buf[bl++] = t[--i];
    buf[bl] = 0;
}

/* messaggio nel riquadro in basso (righe 12-17); '\n' = a capo */
static void msg(const char *s) {
    u8 x = 1, y = 13;
    box_(0, 12, 20, 6);
    while (*s) {
        if (*s == '\n') { x = 1; y++; }
        else {
            put(x++, y, (u8)(*s - 32));
            if (!(key & K_A)) { frame(); }
        }
        s++;
    }
    put(18, 16, 30); /* freccia */
    wait_a();
}

/* menu verticale: restituisce indice o 0xFF (B) */
static u8 vmenu(u8 x, u8 y, u8 n, const char *const *it, u8 sel, u8 canb) {
    u8 i;
    for (i = 0; i < n; i++) txt(x + 1, y + i, it[i]);
    for (;;) {
        for (i = 0; i < n; i++) put(x, y + i, i == sel ? 30 : 0);
        frame();
        if ((kp & K_U) && sel > 0) sel--;
        else if ((kp & K_D) && sel + 1 < n) sel++;
        else if (kp & K_A) return sel;
        else if ((kp & K_B) && canb) return 0xFF;
    }
}

/* ------------------------------------------------------------ mostri */
static u16 mstat(u8 sp, u8 i, u8 lv) {
    u16 v = (u16)SP_BASE[sp][i] * lv / 50;
    return i == 0 ? v + lv + 10 : v + 5;
}

static u32 need(u8 lv) { return (u32)lv * lv * lv / 2; }
static u8 stage_of(u8 sp) { return sp % 3; }
static u8 elem_of(u8 sp) { return FAM_EL[sp / 3]; }

static void mk(Mon *m, u8 sp, u8 lv) {
    m->sp = sp;
    m->lv = lv;
    m->xp = need(lv);
    m->hp = mstat(sp, 0, lv);
}

static u16 maxhp(Mon *m) { return mstat(m->sp, 0, m->lv); }

static u8 nmoves(Mon *m) {
    return m->lv >= 40 ? 4 : m->lv >= 22 ? 3 : m->lv >= 8 ? 2 : 1;
}

static void heal_all(void) {
    u8 i;
    for (i = 0; i < np; i++) party[i].hp = maxhp(&party[i]);
}

static u8 alive_count(void) {
    u8 i, c = 0;
    for (i = 0; i < np; i++) if (party[i].hp) c++;
    return c;
}

/* sprite procedurale 32x32 (16 tile) generato dall'id della specie */
static u16 sg;
static u8 sgr(void) {
    sg ^= sg << 7;
    sg ^= sg >> 9;
    sg ^= sg << 8;
    return (u8)(sg ^ (sg >> 8));
}

/* ---- sprite procedurale 48x48: forme sovrapposte, contorno, luce/ombra, texture ---- */
static const u8 CIRC[17] = {32,32,32,31,31,30,30,29,28,26,25,23,21,19,15,11,0};
static u8 hm[48][24], ho[48][24];

static void blob(s8 cx, s8 cy, u8 rx, u8 ry) {
    s8 dy;
    if (!ry) return;
    for (dy = -(s8)ry; dy <= (s8)ry; dy++) {
        s8 y = cy + dy, x0, x1, x;
        u8 ad = dy < 0 ? -dy : dy;
        u16 w;
        if (y < 0 || y > 47) continue;
        w = (u16)rx * CIRC[(u8)((u16)ad * 16 / ry)] / 32;
        x0 = cx - (s8)w; x1 = cx + (s8)w;
        if (x0 < 0) x0 = 0;
        if (x1 > 23) x1 = 23;
        for (x = x0; x <= x1; x++) hm[y][x] = 1;
    }
}

static u8 mget(s8 y, s8 x) {
    if (y < 0 || y > 47) return 0;
    if (x < 0) x = -x - 1;
    if (x > 23) return 0;
    return hm[y][x];
}

static void rect(u8 y, u8 x, u8 h, u8 w, u8 col) {
    u8 i, j;
    for (i = 0; i < h; i++)
        for (j = 0; j < w; j++)
            if (y + i < 48 && x + j < 24) ho[y + i][x + j] = col;
}

static void rbox(u8 x0, u8 y0, u8 x1, u8 y1) {
    u8 x, y;
    for (y = y0; y <= y1 && y < 48; y++)
        for (x = x0; x <= x1 && x < 24; x++)
            if (!((y == y0 || y == y1) && x == x1)) hm[y][x] = 1;
}

static void gen_sprite(u8 sp, u8 base) {
    u8 el = FAM_EL[sp / 3], fam = sp / 3, stg = sp % 3;
    u8 bx = 0, by = 33, bh = 0, ey = 14, ex = 3;
    u8 top = 0, wx = 0, pal, hl, bc, pat, fs, ms;
    u8 y, x, ty, tx, i, cx0;
    sg = 0x9E37 ^ ((u16)el * 977 + fam * 131 + 7);
    sgr(); sgr();
    for (y = 0; y < 48; y++) for (x = 0; x < 24; x++) hm[y][x] = 0;
    cx0 = sgr() % 3;
    /* ---- scheletro: un archetipo di corpo per famiglia ---- */
    switch (fam) {
    case 0: /* tondo */
        blob(0, 30, 11 + stg * 2 + cx0, 10 + stg * 2 + cx0);
        blob(5, 44, 5, 4); blob(13 + stg, 30, 4, 6);
        bx = 7; bh = 8; ey = 24; ex = 4; break;
    case 1: /* bipede */
        blob(0, 32, 8 + stg, 9 + stg); blob(0, 14, 8 + stg / 2, 7); blob(0, 21, 5, 4);
        blob(11 + stg, 29, 3, 8); blob(5, 43, 4, 6);
        bx = 5; bh = 7; ey = 12; ex = 3; break;
    case 2: /* serpente */
        blob(0, 10, 6 + stg, 6); blob(0, 20, 5, 6); blob(0, 29, 8 + stg, 6);
        blob(0, 39, 11 + stg, 7); blob(0, 46, 8, 2); blob(8 + stg, 12, 4, 5);
        bx = 6; by = 38; bh = 8; ey = 9; ex = 2; break;
    case 3: /* quadrupede */
        blob(0, 35, 14 + stg, 9 + stg); blob(0, 21, 8 + stg, 7); blob(6, 13, 3, 6);
        blob(10, 45, 4, 3); blob(4, 45, 3, 3); blob(16, 36, 3, 5);
        bx = 8; by = 38; bh = 6; ey = 20; ex = 3; break;
    case 4: /* uccello */
        blob(0, 32, 10 + stg, 11); blob(0, 14, 7, 6); blob(0, 20, 5, 4); blob(0, 18, 3, 3);
        blob(14 + stg, 30, 4, 10 + stg); blob(4, 45, 3, 3); blob(0, 7, 2, 4 + stg * 2);
        bx = 6; by = 35; bh = 8; ey = 12; ex = 3; break;
    case 5: /* insetto */
        blob(0, 13, 9 + stg, 8); blob(0, 22, 4, 3); blob(0, 29, 7, 7); blob(0, 41, 6 + stg, 6);
        blob(5, 3, 1, 5); blob(9, 26, 4, 2); blob(10, 33, 5, 2); blob(9, 40, 4, 2);
        ey = 11; ex = 4; break;
    case 6: /* pesce / lumaca */
        blob(0, 31, 16, 9 + stg); blob(0, 19, 3, 6 + stg); blob(0, 44, 8, 4);
        blob(16, 30, 3, 4);
        bx = 9; by = 34; bh = 6; ey = 26; ex = 5; break;
    case 7: /* golem */
        rbox(0, 10, 6 + stg, 21); rbox(0, 22, 11 + stg, 38); rbox(12 + stg, 22, 15 + stg, 36);
        blob(14 + stg, 40, 4, 4); rbox(2, 39, 8, 46);
        bx = 5; by = 30; bh = 6; ey = 14; ex = 2; break;
    case 8: /* sfera fluttuante */
        blob(0, 23, 12 + stg * 2, 12 + stg);
        blob(3, 41, 2, 7); blob(8, 40, 2, 7); blob(13, 37, 2, 5);
        ey = 21; ex = 0; break;
    default: /* drago */
        blob(0, 19, 4, 10); blob(0, 11, 7, 6); blob(0, 15, 4, 4);
        blob(12, 29, 6 + stg, 11 + stg); blob(0, 35, 10, 9); blob(9, 45, 4, 3);
        blob(5, 6, 2, 6);
        bx = 6; by = 37; bh = 8; ey = 10; ex = 2; break;
    }
    /* limiti del corpo */
    for (y = 0; y < 48; y++)
        for (x = 0; x < 24; x++)
            if (hm[y][x]) {
                if (!top) top = y + 1;
                if (x > wx && y > 16 && y < 40) wx = x;
            }
    top = top ? top - 1 : 0;
    /* tratti dell'elemento (ancorati al corpo) */
    if (el == 0) {
        blob(4, top + 2, 3, 7 + stg * 2); blob(wx - 2, 22, 5, 4 + stg); blob(wx - 4, 38, 4, 3);
    } else if (el == 1) {
        blob(wx, 28, 3, 8 + stg * 2); blob(0, top + 1, 3, 6 + stg * 2); blob(wx - 3, 42, 3, 4);
    } else if (el == 2) {
        blob(0, top + 1, 3, 8 + stg * 3); blob(5, top + 3, 2, 6 + stg * 2); blob(wx - 1, 40, 3, 7 + stg * 2);
    } else {
        blob(wx + 3, 20, 5 + stg, 10 + stg * 2); blob(wx + 2, 36, 4, 4 + stg);
        blob(2, top, 2, 6);
    }
    /* evoluzione: spuntoni e corna in piu' */
    if (stg > 0) { blob(wx - 1, 24, 3, 4); blob(7, top + 1, 2, 5); }
    if (stg > 1) { blob(wx + 1, 18, 3, 6); blob(10, top + 4, 2, 7); blob(2, top - 1, 2, 5); }
    /* colori del corpo */
    pal = (fam + el) % 3;
    hl = pal == 1 ? 1 : 0;
    bc = pal == 0 ? 1 : 2;
    pat = (fam * 7 + el * 3) % 5;
    /* contorno, luce, ombra, pattern */
    for (y = 0; y < 48; y++)
        for (x = 0; x < 24; x++) {
            u8 col;
            if (!hm[y][x]) { ho[y][x] = 0; continue; }
            if (!mget(y - 1, x) || !mget(y + 1, x) || !mget(y, x - 1) || !mget(y, x + 1)) {
                ho[y][x] = 3; continue;
            }
            col = bc;
            if (pat == 1 && y % 8 == 3) col = 2;
            else if (pat == 2 && ((x * 5 + y * 3 + fam) % 13) == 0) col = 2;
            else if (pat == 3 && (y & 3) == 0 && ((x + ((y >> 2) & 1) * 2) & 3) == 0) col = hl;
            else if (pat == 4 && x % 8 == 4 && y > 20) col = 2;
            if (!mget(y - 3, x - 3) || !mget(y - 2, x - 4) || !mget(y - 4, x - 1)) col = hl;
            else if (!mget(y + 3, x + 3) || !mget(y + 4, x + 1) || !mget(y + 1, x + 4))
                col = pal == 0 ? 2 : ((x + y) & 1 ? 3 : 2);
            if (el == 0 && ((x * 3 + y * 5 + fam) % 17) == 0) col = 2;
            else if (el == 2 && y < top + 14 && ((x + y) & 3) == 0) col = hl;
            else if (el == 3 && ((x + y) % 9) == 0) col = hl;
            ho[y][x] = col;
        }
    /* pancia chiara ellittica con righe */
    if (bh) {
        s8 dy;
        for (dy = -(s8)bh; dy <= (s8)bh; dy++) {
            u8 ad = dy < 0 ? -dy : dy;
            u8 w = (u8)((u16)bx * CIRC[(u8)((u16)ad * 16 / bh)] / 32);
            s8 yy = by + dy;
            for (x = 0; x < w; x++)
                if (yy > 0 && yy < 47 && ho[yy][x] != 3 && hm[yy][x])
                    ho[yy][x] = (dy > 0 && !(dy & 3)) ? 1 : 0;
        }
    }
    /* faccia: occhi (4 stili) e bocca (3 stili) */
    fs = (fam + el + (fam >> 1)) & 3;
    ms = (fam + stg) % 3;
    if (fam == 8) fs = 2;
    if (fs == 2) {                     /* ciclope */
        rect(ey - 1, 0, 5, 5, 0);
        rect(ey, 0, 3, 3, 3);
        ho[ey + 1][0] = 0;
        rect(ey - 2, 0, 1, 5, 3);
    } else if (fs == 0) {              /* occhi tondi */
        rect(ey - 1, ex, 4, 4, 0);
        rect(ey, ex, 3, 2, 3);
        ho[ey][ex] = 0;
    } else if (fs == 1) {              /* occhi arrabbiati */
        rect(ey, ex, 3, 4, 0);
        rect(ey + 1, ex + 1, 2, 2, 3);
        rect(ey - 1, ex, 1, 5, 3);
        ho[ey][ex + 3] = 3;
    } else {                           /* occhi piccoli e vivaci */
        rect(ey, ex, 3, 4, 0);
        rect(ey + 1, ex + 1, 2, 2, 3);
        if (stg) rect(ey - 1, ex, 1, 5, 3);
    }
    y = ey + 5 + (fam == 0 || fam == 6 ? 1 : 0);
    if (fam != 4 && fam != 5 && fam != 8) {
        if (ms == 0) rect(y, 0, 1, 4 + stg, 3);
        else if (ms == 1) { rect(y, 0, 2, 5, 3); ho[y + 1][1] = 0; ho[y + 1][3] = 0; ho[y][2] = 0; }
        else { rect(y, 0, 1, 5, 3); ho[y + 1][4] = 3; ho[y + 1][0] = 3; }
    }
    /* impacchetta in tile 2bpp, 6x6 */
    for (ty = 0; ty < 6; ty++)
        for (tx = 0; tx < 6; tx++) {
            volatile u8 *d = VRAM + ((u16)(base + ty * 6 + tx) << 4);
            for (y = 0; y < 8; y++) {
                u8 lo = 0, hi = 0;
                for (i = 0; i < 8; i++) {
                    u8 xf = tx * 8 + i;
                    u8 xh = xf >= 24 ? xf - 24 : 23 - xf;
                    u8 col = ho[ty * 8 + y][xh];
                    lo = (lo << 1) | (col & 1);
                    hi = (hi << 1) | (col >> 1);
                }
                d[y * 2] = lo;
                d[y * 2 + 1] = hi;
            }
        }
}

static void put_sprite(u8 x, u8 y, u8 base) {
    u8 i, j;
    for (j = 0; j < 6; j++)
        for (i = 0; i < 6; i++) put(x + i, y + j, base + j * 6 + i);
}

static void bar(u8 x, u8 y, u16 hp, u16 mx) {
    u16 f = (u16)((u32)hp * 64 / mx);
    u8 i;
    if (hp && !f) f = 1;
    for (i = 0; i < 8; i++) {
        u8 t = f >= 8 ? 8 : (u8)f;
        f -= t;
        put(x + i, y, T_BAR + t);
    }
}

static void put_name(u8 x, u8 y, u8 sp) {
    const char *n = SP_NAME[sp];
    u8 i = 0;
    while (n[i]) { put(x + i, y, (u8)(n[i] - 32)); i++; }
    pad(x + i, y, 8 - i);
}

/* ------------------------------------------------------------ progressione */
static void give_xp(Mon *m, u32 amt) {
    m->xp += amt;
    while (m->lv < 100 && m->xp >= need(m->lv + 1)) {
        u16 o = maxhp(m);
        m->lv++;
        if (m->hp) m->hp += maxhp(m) - o;
        beep(0x00, 0x07);
        bs(); bc(SP_NAME[m->sp]); bc(" SALE AL\nLIVELLO "); bn(m->lv); bc("!");
        msg(buf);
        if ((stage_of(m->sp) == 0 && m->lv >= 16) || (stage_of(m->sp) == 1 && m->lv >= 36)) {
            u8 old = m->sp;
            u16 o2 = maxhp(m);
            m->sp++;
            if (m->hp) m->hp += maxhp(m) - o2;
            bs(); bc(SP_NAME[old]); bc(" SI EVOLVE\nIN "); bc(SP_NAME[m->sp]); bc("!");
            msg(buf);
            sprflag = 1;
        }
    }
}

/* ------------------------------------------------------------ schermate mostro */
static void detail(Mon *m) {
    u8 i, n = nmoves(m);
    lcd_off();
    cls();
    box_(0, 0, 20, 18);
    put_name(2, 1, m->sp);
    txt(11, 1, "LV");
    num(14, 1, m->lv, 3);
    txt(2, 3, ELN[elem_of(m->sp)]);
    txt(10, 3, "STADIO ");
    put(17, 3, '1' + stage_of(m->sp) - 32);
    txt(2, 5, "PS"); num(5, 5, m->hp, 3); txt(8, 5, "/"); num(9, 5, maxhp(m), 3);
    txt(2, 6, "ATT"); num(6, 6, mstat(m->sp, 1, m->lv), 3);
    txt(11, 6, "DIF"); num(15, 6, mstat(m->sp, 2, m->lv), 3);
    txt(2, 7, "VEL"); num(6, 7, mstat(m->sp, 3, m->lv), 3);
    txt(2, 9, "XP"); num(5, 9, (u16)(m->xp > 65535 ? 65535 : m->xp), 5);
    txt(11, 9, "MAX65535");
    txt(2, 11, "MOSSE:");
    for (i = 0; i < 4; i++) {
        u8 mv = SP_MV[m->sp][i];
        txt(2, 12 + i, i < n ? MV_NAME[mv] : "----------");
        txt(13, 12 + i, MV_EL[mv] < 4 ? EL3[MV_EL[mv]] : "NEU");
        num(16, 12 + i, MV_POW[mv], 3);
    }
    txt(2, 16, "SBLOCCO LV 8 22 40");
    lcd_on();
    do { frame(); } while (!(kp & (K_A | K_B)));
}

static void party_view(void) {
    /* nessuna selezione: usato dal menu principale */
    u8 sel = 0, i;
    for (;;) {
        lcd_off();
        cls();
        box_(0, 0, 20, 18);
        txt(2, 1, "I TUOI MOSTRI");
        for (i = 0; i < np; i++) {
            put_name(3, 3 + i * 2, party[i].sp);
            txt(12, 3 + i * 2, "L"); num(13, 3 + i * 2, party[i].lv, 3);
            num(3, 4 + i * 2, party[i].hp, 3); txt(6, 4 + i * 2, "/"); num(7, 4 + i * 2, maxhp(&party[i]), 3);
            txt(12, 4 + i * 2, EL3[elem_of(party[i].sp)]);
        }
        txt(1, 16, "A:INFO SEL:IN TESTA");
        lcd_on();
        for (;;) {
            for (i = 0; i < np; i++) put(1, 3 + i * 2, i == sel ? 30 : 0);
            frame();
            if ((kp & K_U) && sel > 0) sel--;
            else if ((kp & K_D) && sel + 1 < np) sel++;
            else if (kp & K_B) return;
            else if (kp & K_A) { detail(&party[sel]); break; }
            else if ((kp & K_SEL) && sel > 0) {
                Mon t; t = party[0]; party[0] = party[sel]; party[sel] = t;
                sel = 0;
                break;
            }
        }
    }
}

/* scelta di un mostro per il cambio in battaglia: indice o 0xFF */
static u8 pick_alive(u8 canb) {
    u8 sel = 0, i;
    lcd_off();
    cls();
    box_(0, 0, 20, 18);
    txt(2, 1, "CHI MANDI?");
    for (i = 0; i < np; i++) {
        put_name(3, 3 + i * 2, party[i].sp);
        txt(12, 3 + i * 2, "L"); num(13, 3 + i * 2, party[i].lv, 3);
        if (party[i].hp) { num(3, 4 + i * 2, party[i].hp, 3); txt(6, 4 + i * 2, "/"); num(7, 4 + i * 2, maxhp(&party[i]), 3); }
        else txt(3, 4 + i * 2, "KO");
        txt(12, 4 + i * 2, EL3[elem_of(party[i].sp)]);
    }
    lcd_on();
    for (;;) {
        for (i = 0; i < np; i++) put(1, 3 + i * 2, i == sel ? 30 : 0);
        frame();
        if ((kp & K_U) && sel > 0) sel--;
        else if ((kp & K_D) && sel + 1 < np) sel++;
        else if ((kp & K_B) && canb) return 0xFF;
        else if (kp & K_A) {
            if (party[sel].hp == 0 || sel == act) continue;
            return sel;
        }
    }
}

static void box_screen(void) {
    u8 sel = 0, top = 0, i;
    if (!nb) {
        lcd_off(); cls(); lcd_on();
        msg("IL BOX E' VUOTO.\nI MOSTRI IN PIU'\nVANNO QUI.");
        return;
    }
    for (;;) {
        lcd_off();
        cls();
        box_(0, 0, 20, 18);
        txt(2, 1, "BOX");
        num(15, 1, nb, 2);
        for (i = 0; i < 12 && top + i < nb; i++) {
            put_name(3, 3 + i, box[top + i].sp);
            txt(12, 3 + i, "L"); num(13, 3 + i, box[top + i].lv, 3);
            txt(17, 3 + i, EL3[elem_of(box[top + i].sp)]);
        }
        txt(1, 16, "A:PORTA IN SQUADRA");
        lcd_on();
        for (;;) {
            for (i = 0; i < 12 && top + i < nb; i++) put(1, 3 + i, top + i == sel ? 30 : 0);
            frame();
            if ((kp & K_U) && sel > 0) { sel--; if (sel < top) { top = sel; break; } }
            else if ((kp & K_D) && sel + 1 < nb) { sel++; if (sel >= top + 12) { top++; break; } }
            else if (kp & K_B) return;
            else if (kp & K_A) {
                Mon t;
                u8 w;
                if (np < 6) {
                    party[np++] = box[sel];
                } else {
                    act = 0xFF;
                    w = pick_alive(1);
                    if (w == 0xFF) { w = 5; }
                    t = party[w]; party[w] = box[sel]; box[sel] = t;
                    break;
                }
                for (i = sel; i + 1 < nb; i++) box[i] = box[i + 1];
                nb--;
                if (sel >= nb && sel) sel--;
                break;
            }
        }
        if (!nb) return;
    }
}

/* ------------------------------------------------------------ battaglia */
static Mon *me, *fo;

static void hud(void) {
    put_name(1, 1, fo->sp);
    txt(1, 2, "L"); num(2, 2, fo->lv, 3);
    txt(6, 2, EL3[elem_of(fo->sp)]);
    bar(1, 3, fo->hp, maxhp(fo));
    put_name(8, 8, me->sp);
    txt(8, 9, "L"); num(9, 9, me->lv, 3);
    txt(13, 9, EL3[elem_of(me->sp)]);
    bar(8, 10, me->hp, maxhp(me));
    txt(8, 11, "PS"); num(11, 11, me->hp, 3); txt(14, 11, "/"); num(15, 11, maxhp(me), 3);
}

static void scene(void) {
    lcd_off();
    cls();
    gen_sprite(fo->sp, 128);
    gen_sprite(me->sp, 164);
    put_sprite(13, 0, 128);
    put_sprite(1, 6, 164);
    box_(0, 12, 20, 6);
    hud();
    lcd_on();
}

static u16 calc_dmg(Mon *a, Mon *d, u8 mv, u8 *eff) {
    u8 el = MV_EL[mv], ae = elem_of(a->sp), de = elem_of(d->sp);
    u32 dm = (u32)(2 * a->lv / 5 + 2) * MV_POW[mv] * mstat(a->sp, 1, a->lv) / mstat(d->sp, 2, d->lv) / 50 + 2;
    *eff = 1;
    if (el == ae) dm = dm * 3 / 2;
    if (el < 4) {
        if (((el + 1) & 3) == de) { dm *= 2; *eff = 2; }
        else if (((de + 1) & 3) == el) { dm /= 2; *eff = 0; }
    }
    dm = dm * (85 + rnd() % 16) / 100;
    if (dm < 1) dm = 1;
    return (u16)dm;
}

static void attack(Mon *a, Mon *d, u8 mv) {
    u8 eff;
    u16 dm;
    bs(); bc(SP_NAME[a->sp]); bc(" USA\n"); bc(MV_NAME[mv]); bc("!");
    msg(buf);
    if (rnd() % 100 >= MV_ACC[mv]) {
        msg("MA MANCA IL\nBERSAGLIO!");
        return;
    }
    dm = calc_dmg(a, d, mv, &eff);
    beep(0x40, 0x06);
    d->hp = dm >= d->hp ? 0 : d->hp - dm;
    hud();
    if (eff == 2) { bs(); bc("SUPEREFFICACE!\n"); bn(dm); bc(" DANNI"); msg(buf); }
    else if (eff == 0) { bs(); bc("POCO EFFICACE...\n"); bn(dm); bc(" DANNI"); msg(buf); }
    else { bs(); bn(dm); bc(" DANNI!"); msg(buf); }
}

static u8 pick_move_foe(void) {
    return SP_MV[fo->sp][rnd() % nmoves(fo)];
}

static u8 move_menu(void) {
    u8 n = nmoves(me), i, sel = 0;
    box_(0, 12, 20, 6);
    for (i = 0; i < n; i++) {
        u8 mv = SP_MV[me->sp][i];
        txt(3, 13 + i, MV_NAME[mv]);
        txt(14, 13 + i, MV_EL[mv] < 4 ? EL3[MV_EL[mv]] : "NEU");
    }
    for (;;) {
        for (i = 0; i < n; i++) put(2, 13 + i, i == sel ? 30 : 0);
        frame();
        if ((kp & K_U) && sel > 0) sel--;
        else if ((kp & K_D) && sel + 1 < n) sel++;
        else if (kp & K_B) return 0xFF;
        else if (kp & K_A) return SP_MV[me->sp][sel];
    }
}

static u8 action_menu(void) {
    static const u8 XS[4] = {2, 11, 2, 11};
    static const u8 YS[4] = {14, 14, 15, 15};
    static const char *const L[4] = {"LOTTA", "MOSTRI", "SFERA", "FUGA"};
    u8 sel = 0, i;
    box_(0, 12, 20, 6);
    for (i = 0; i < 4; i++) txt(XS[i] + 1, YS[i], L[i]);
    txt(1, 13, "COSA FA");
    txt(9, 13, SP_NAME[me->sp]);
    for (;;) {
        for (i = 0; i < 4; i++) put(XS[i], YS[i], i == sel ? 30 : 0);
        frame();
        if (kp & K_R) sel |= 1;
        else if (kp & K_L) sel &= 2;
        else if (kp & K_D) sel |= 2;
        else if (kp & K_U) sel &= 1;
        else if (kp & K_A) return sel;
    }
}

static void add_caught(Mon *m) {
    if (np < 6) party[np++] = *m;
    else if (nb < 30) box[nb++] = *m;
}

/* 0 = vinto/fuga, 1 = sconfitto, 2 = catturato */
static u8 battle(u8 trainer) {
    u8 i;
    ei = 0;
    fo = &epar[0];
    act = 0;
    while (party[act].hp == 0) act++;
    me = &party[act];
    sprflag = 0;
    scene();
    if (trainer) { bs(); bc("IL CAPO MANDA\n"); bc(SP_NAME[fo->sp]); bc("!"); }
    else { bs(); bc("UN "); bc(SP_NAME[fo->sp]); bc(" SELVATICO\nAPPARE!"); }
    msg(buf);
    for (;;) {
        u8 a, pm, em, pfirst, did = 0;
        a = action_menu();
        em = pick_move_foe();
        if (a == 0) {
            pm = move_menu();
            if (pm == 0xFF) continue;
            {
                u16 ps = mstat(me->sp, 3, me->lv), es = mstat(fo->sp, 3, fo->lv);
                pfirst = ps > es || (ps == es && (rnd() & 1));
            }
            if (pfirst) {
                attack(me, fo, pm);
                if (fo->hp) attack(fo, me, em);
            } else {
                attack(fo, me, em);
                if (me->hp) attack(me, fo, pm);
            }
            did = 1;
        } else if (a == 1) {
            u8 w = pick_alive(1);
            if (w == 0xFF) { scene(); continue; }
            act = w;
            me = &party[act];
            scene();
            bs(); bc("VAI, "); bc(SP_NAME[me->sp]); bc("!");
            msg(buf);
            attack(fo, me, em);
            did = 1;
        } else if (a == 2) {
            u16 hp, mx, p;
            if (trainer) { msg("NON PUOI RUBARE I\nMOSTRI DEGLI\nALTRI ALLENATORI!"); continue; }
            if (!spheres) { msg("NON HAI PIU' SFERE!\nCOMPRANE ALLA CASA."); continue; }
            spheres--;
            msg("LANCI UNA SFERA...");
            hp = fo->hp; mx = maxhp(fo);
            p = 25 + (u16)((u32)(mx - hp) * 65 / mx);
            if (stage_of(fo->sp) == 0) p += 10;
            else if (stage_of(fo->sp) == 2) p -= 12;
            if (rnd() % 100 < p) {
                beep(0x00, 0x07);
                bs(); bc("PRESO! "); bc(SP_NAME[fo->sp]); bc("\nE' TUO!");
                msg(buf);
                add_caught(fo);
                if (nb == 30 && np == 6) {}
                return 2;
            }
            msg("E' USCITO DALLA\nSFERA!");
            attack(fo, me, em);
            did = 1;
        } else {
            if (trainer) { msg("NON SI SCAPPA DA UN\nCAPO PALESTRA!"); continue; }
            {
                u16 ps = mstat(me->sp, 3, me->lv), es = mstat(fo->sp, 3, fo->lv);
                if (rnd() % 100 < (ps >= es ? 90 : 55)) {
                    msg("FUGA RIUSCITA!");
                    return 0;
                }
            }
            msg("NON RIESCI A\nFUGGIRE!");
            attack(fo, me, em);
            did = 1;
        }
        (void)did;
        /* fine turno: controlli */
        if (fo->hp == 0) {
            u32 xp = (u32)(60 + stage_of(fo->sp) * 40) * fo->lv / 5;
            u16 g = 5 + fo->lv * 2;
            if (trainer) { xp = xp * 3 / 2; g = 80; }
            bs(); bc(SP_NAME[fo->sp]); bc(" E' KO!\n+"); bn((u16)xp); bc(" XP  +"); bn(g); bc(" ORO");
            msg(buf);
            gold = (u16)(gold + g < gold ? 65535 : gold + g);
            if (me->hp) give_xp(me, xp);
            ei++;
            if (ei >= en) return 0;
            fo = &epar[ei];
            scene();
            bs(); bc("IL CAPO MANDA\n"); bc(SP_NAME[fo->sp]); bc("!");
            msg(buf);
            continue;
        }
        if (me->hp == 0) {
            bs(); bc(SP_NAME[me->sp]); bc(" E' KO!");
            msg(buf);
            if (!alive_count()) return 1;
            do { i = pick_alive(0); } while (i == 0xFF);
            act = i;
            me = &party[act];
            scene();
            continue;
        }
        if (sprflag) { sprflag = 0; scene(); }
    }
}

/* ------------------------------------------------------------ mondo */
static const u8 SOLID_T[] = {T_TREE, T_WATER, T_WALL, T_ROOF, T_DWALL, T_NPC_GUIDE1, T_NPC_GUIDE2,
                             T_NPC_NURSE, T_NPC_MERCH, T_NPC_BOSS, T_COUNTER, T_PILLAR};

static u8 solid(u8 t) {
    u8 i;
    for (i = 0; i < sizeof(SOLID_T); i++) if (SOLID_T[i] == t) return 1;
    return 0;
}

static void draw_map(void) {
    u8 x, y;
    for (y = 0; y < 18; y++)
        for (x = 0; x < 20; x++) put(x, y, map[y][x]);
}

static void redraw_rows(u8 y0, u8 y1) {
    u8 x, y;
    for (y = y0; y < y1; y++)
        for (x = 0; x < 20; x++) put(x, y, map[y][x]);
}

static void world_restore(void) {
    redraw_rows(12, 18);
    spr_show();
}

static void load_map(u8 m) {
    u8 x, y;
    const u8 (*src)[20] = 0;
    curmap = m;
    if (m == M_VILLAGE) src = MAP_VILLAGE;
    else if (m == M_GYM) src = MAP_GYM;
    else if (m == M_HOUSE) src = MAP_HOUSE;
    if (src)
        for (y = 0; y < 18; y++)
            for (x = 0; x < 20; x++) map[y][x] = src[y][x];
}

static void show_world(void) {
    lcd_off();
    cls();
    draw_map();
    oam_clear();
    spr_set();
    lcd_on();
}

static void enter_map(u8 m, u8 x, u8 y) {
    load_map(m);
    px = x; py = y;
    show_world();
}

static void place_beside(u8 x, u8 y) {
    static const s8 DX[4] = {1, -1, 0, 0};
    static const s8 DY[4] = {0, 0, 1, -1};
    u8 i;
    px = x; py = y;
    for (i = 0; i < 4; i++) {
        u8 t = map[y + DY[i]][x + DX[i]];
        if (t == T_DFLOOR) { px = x + DX[i]; py = y + DY[i]; return; }
    }
}

static void gen_dungeon(u8 arrive_up) {
    u8 x, y, i, cx[5], cy[5];
    u16 save = rs;
    rs = runseed ^ ((u16)floorn * 2531 + 77);
    if (!rs) rs = 1;
    for (y = 0; y < 18; y++) for (x = 0; x < 20; x++) map[y][x] = T_DWALL;
    {
        u8 zo[6], t;
        for (i = 0; i < 6; i++) zo[i] = i;
        for (i = 5; i > 0; i--) { u8 j = rnd() % (i + 1); t = zo[i]; zo[i] = zo[j]; zo[j] = t; }
        for (i = 0; i < 5; i++) {
            u8 zx = (zo[i] % 3) * 6 + 1, zy = (zo[i] / 3) * 8 + 1;
            u8 w = 3 + rnd() % 3, h = 3 + rnd() % 4;
            u8 rx = zx + rnd() % (6 - w + 1), ry = zy + rnd() % (8 - h + 1);
            for (y = ry; y < ry + h; y++) for (x = rx; x < rx + w; x++) map[y][x] = T_DFLOOR;
            cx[i] = rx + w / 2; cy[i] = ry + h / 2;
            if (i) {
                x = cx[i - 1]; y = cy[i - 1];
                while (x != cx[i]) { map[y][x] = T_DFLOOR; x += (x < cx[i]) ? 1 : -1; }
                while (y != cy[i]) { map[y][x] = T_DFLOOR; y += (y < cy[i]) ? 1 : -1; }
                map[y][x] = T_DFLOOR;
            }
        }
    }
    upx = cx[0]; upy = cy[0];
    dnx = cx[4]; dny = cy[4];
    if (dnx == upx && dny == upy) { dnx = cx[3]; dny = cy[3]; }
    if (dnx == upx && dny == upy) { dnx = upx + 1; dny = upy; map[dny][dnx] = T_DFLOOR; }
    map[upy][upx] = T_UP;
    map[dny][dnx] = T_DOWN;
    rs = save ^ DIVR;
    if (!rs) rs = 1;
    curmap = M_DUNGEON;
    if (arrive_up) place_beside(upx, upy);
    else place_beside(dnx, dny);
    if (floorn > maxfloor) maxfloor = floorn;
}

static void show_floor_name(void) {
    bs(); bc("CAVERNA - PIANO "); bn(floorn);
    msg(buf);
}

static void enter_dungeon(u8 arrive_up) {
    gen_dungeon(arrive_up);
    show_world();
}

static void whiteout(void) {
    msg("TUTTI I TUOI\nMOSTRI SONO KO...\nTI SVEGLI A CASA.");
    heal_all();
    gold /= 2;
    enter_map(M_VILLAGE, 14, 5);
}

static void do_battle(u8 trainer) {
    u8 r;
    spr_hide();
    r = battle(trainer);
    if (r == 1) { whiteout(); return; }
    if (curmap == M_DUNGEON) {
        lcd_off(); cls(); draw_map(); lcd_on();
    } else {
        lcd_off(); cls(); draw_map(); lcd_on();
    }
    spr_show();
}

static void wild_encounter(void) {
    u16 lv = 2 + (u16)floorn * 2 + rnd() % 3;
    u8 fam = rnd() % 10, stg;
    if (lv > 100) lv = 100;
    stg = lv >= 36 ? 2 : lv >= 16 ? 1 : 0;
    if (stg && (rnd() & 3) == 0) stg--;
    mk(&epar[0], fam * 3 + stg, (u8)lv);
    en = 1;
    do_battle(0);
}

static void shop(void) {
    static const char *const IT[3] = {"SFERA   30G", "5 SFERE 130G", "ESCI"};
    u8 c;
    for (;;) {
        box_(0, 8, 20, 10);
        txt(2, 9, "NEGOZIO");
        txt(2, 10, "ORO"); num(6, 10, gold, 5);
        txt(12, 10, "SFERE"); num(17, 10, spheres, 2);
        c = vmenu(2, 12, 3, IT, 0, 1);
        if (c == 0xFF || c == 2) break;
        {
            u16 cost = c == 0 ? 30 : 130;
            u8 n = c == 0 ? 1 : 5;
            if (gold < cost) { msg("NON HAI ABBASTANZA\nORO!"); }
            else if (spheres + n > 99) { msg("NE HAI GIA' ABBASTANZA!"); }
            else { gold -= cost; spheres += n; beep(0x80, 0x06); }
        }
    }
}

static void save_game(void) {
    u16 i;
    u8 *s = (u8 *)&sv, *d = (u8 *)0xA000;
    sv.m0 = 'M'; sv.m1 = 'D';
    sv.np = np; sv.nb = nb; sv.badge = badge; sv.spheres = spheres; sv.maxfloor = maxfloor;
    sv.gold = gold; sv.seed = runseed;
    for (i = 0; i < 6; i++) sv.party[i] = party[i];
    for (i = 0; i < 30; i++) sv.box[i] = box[i];
    R8(0x0000) = 0x0A;
    for (i = 0; i < sizeof(Save); i++) d[i] = s[i];
    R8(0x0000) = 0;
}

static u8 load_game(void) {
    u16 i;
    u8 *s = (u8 *)&sv, *d = (u8 *)0xA000;
    R8(0x0000) = 0x0A;
    for (i = 0; i < sizeof(Save); i++) s[i] = d[i];
    R8(0x0000) = 0;
    if (sv.m0 != 'M' || sv.m1 != 'D' || sv.np == 0 || sv.np > 6 || sv.nb > 30) return 0;
    np = sv.np; nb = sv.nb; badge = sv.badge; spheres = sv.spheres; maxfloor = sv.maxfloor;
    gold = sv.gold; runseed = sv.seed;
    for (i = 0; i < 6; i++) party[i] = sv.party[i];
    for (i = 0; i < 30; i++) box[i] = sv.box[i];
    return 1;
}

static void status_screen(void) {
    lcd_off();
    cls();
    box_(0, 0, 20, 18);
    txt(2, 2, "STATO ALLENATORE");
    txt(2, 5, "ORO"); num(10, 5, gold, 5);
    txt(2, 7, "SFERE"); num(10, 7, spheres, 2);
    txt(2, 9, "MOSTRI SQUADRA"); num(17, 9, np, 1);
    txt(2, 11, "MOSTRI NEL BOX"); num(17, 11, nb, 2);
    txt(2, 13, "PIANO MASSIMO"); num(17, 13, maxfloor, 2);
    txt(2, 15, badge ? "BADGE TERRA: SI" : "BADGE TERRA: NO");
    lcd_on();
    do { frame(); } while (!(kp & (K_A | K_B)));
}

static void start_menu(void) {
    static const char *const IT[5] = {"MOSTRI", "BOX", "STATO", "SALVA", "CHIUDI"};
    u8 c;
    for (;;) {
        box_(12, 0, 8, 8);
        c = vmenu(12, 1, 5, IT, 0, 1);
        if (c == 0xFF || c == 4) break;
        if (c == 0) { party_view(); show_world(); }
        else if (c == 1) { box_screen(); show_world(); }
        else if (c == 2) { status_screen(); show_world(); }
        else if (c == 3) {
            if (curmap == M_DUNGEON) msg("NON PUOI SALVARE\nNELLA CAVERNA!");
            else { save_game(); msg("PARTITA SALVATA!"); }
            world_restore();
        }
        if (c < 3) { box_(12, 0, 8, 8); }
    }
    redraw_rows(0, 9);
    world_restore();
}

static void gym_talk(void) {
    u8 i;
    if (badge) {
        msg("BRUNO: HAI GIA' IL\nBADGE TERRA!\nSEI UN VERO\nCAMPIONE!");
        return;
    }
    msg("BRUNO: SONO IL CAPO\nDI BORGO ALBA!\nLA TERRA E' LA MIA\nFORZA!");
    msg("BRUNO: FATTI AVANTI\nE MOSTRAMI IL\nVALORE DEI TUOI\nMOSTRI!");
    mk(&epar[0], 0, 7);
    mk(&epar[1], 3, 8);
    mk(&epar[2], 7, 11);
    en = 3;
    do_battle(1);
    if (curmap != M_GYM) return;
    if (epar[2].hp == 0 && alive_count()) {
        badge = 1;
        gold += 300;
        spheres += 5;
        msg("BRUNO: INCREDIBILE!\nTI DO IL BADGE\nTERRA, 300 ORO\nE 5 SFERE!");
        msg("IL CAMMINO VERSO LA\nCAVERNA PROFONDA\nTI ATTENDE...");
    }
    (void)i;
    world_restore();
}

static void house_talk(u8 t) {
    if (t == T_NPC_NURSE) {
        msg("INFERMIERA: CURO I\nTUOI MOSTRI...");
        heal_all();
        beep(0x00, 0x07);
        msg("ECCO FATTO!\nTORNA QUANDO VUOI!");
    } else {
        msg("MERCANTE: BENVENUTO!\nSFERE PER CATTURARE\nI MOSTRI!");
        shop();
    }
    world_restore();
}

static void interact(void) {
    s8 dx = 0, dy = 0;
    u8 t;
    if (pdir == 0) dy = 1; else if (pdir == 1) dy = -1; else if (pdir == 2) dx = -1; else dx = 1;
    if ((px == 0 && dx < 0) || (py == 0 && dy < 0) || px + dx > 19 || py + dy > 17) return;
    t = map[py + dy][px + dx];
    if (t == T_NPC_GUIDE1) {
        msg("VECCHIO: I MOSTRI\nHANNO 4 ELEMENTI:\nTERRA BATTE ACQUA,\nACQUA BATTE FUOCO,");
        msg("FUOCO BATTE VENTO,\nVENTO BATTE TERRA!\nSFIDA BRUNO NELLA\nPALESTRA!");
        world_restore();
    } else if (t == T_NPC_GUIDE2) {
        msg("RAGAZZO: NELLA\nCAVERNA A SUD-EST\nVIVONO MOSTRI\nSELVATICI!");
        msg("INDEBOLISCILI E\nUSA LE SFERE PER\nCATTURARLI! SCENDI\nPIU' IN BASSO...");
        world_restore();
    } else if (t == T_NPC_BOSS) {
        gym_talk();
    } else if (t == T_NPC_NURSE || t == T_NPC_MERCH) {
        house_talk(t);
    }
}

static void on_step(u8 t) {
    if (t == T_DOOR_GYM) enter_map(M_GYM, 9, 16);
    else if (t == T_DOOR_HOUSE) enter_map(M_HOUSE, 9, 16);
    else if (t == T_EXIT) {
        if (curmap == M_GYM) enter_map(M_VILLAGE, 6, 5);
        else enter_map(M_VILLAGE, 14, 5);
    } else if (t == T_CAVE) {
        floorn = 1;
        enter_dungeon(1);
        show_floor_name();
        world_restore();
    } else if (t == T_DOWN) {
        floorn++;
        enter_dungeon(1);
        show_floor_name();
        world_restore();
    } else if (t == T_UP) {
        if (floorn <= 1) {
            enter_map(M_VILLAGE, 17, 14);
        } else {
            floorn--;
            enter_dungeon(0);
            show_floor_name();
            world_restore();
        }
    } else if (curmap == M_DUNGEON && (rnd() % 11) == 0) {
        wild_encounter();
    }
}

static void world(void) {
    u8 cd = 0;
    for (;;) {
        frame();
        if (kp & K_START) { start_menu(); continue; }
        if (kp & K_A) { interact(); continue; }
        if (cd) { cd--; continue; }
        if (key & (K_R | K_L | K_U | K_D)) {
            s8 dx = 0, dy = 0;
            u8 nx, ny, t;
            if (key & K_D) { dy = 1; pdir = 0; }
            else if (key & K_U) { dy = -1; pdir = 1; }
            else if (key & K_L) { dx = -1; pdir = 2; }
            else { dx = 1; pdir = 3; }
            cd = 7;
            if ((px == 0 && dx < 0) || (py == 0 && dy < 0)) continue;
            nx = px + dx; ny = py + dy;
            if (nx > 19 || ny > 17) continue;
            t = map[ny][nx];
            if (solid(t)) continue;
            px = nx; py = ny;
            spr_show();
            on_step(t);
        }
    }
}

/* ------------------------------------------------------------ avvio */
static void title(void) {
    u8 sp, c;
    static const char *const IT[2] = {"NUOVA PARTITA", "CONTINUA"};
    lcd_off();
    cls();
    sg = 0;
    box_(0, 0, 20, 18);
    txt(3, 2, "MONSTER DUNGEON");
    txt(3, 4, "30 MOSTRI");
    txt(3, 5, "4 ELEMENTI");
    txt(3, 6, "FINO AL LV 100");
    sp = 26;
    gen_sprite(sp, 128);
    put_sprite(7, 7, 128);
    txt(5, 14, "PREMI START");
    lcd_on();
    rs = 0xACE1;
    do {
        frame();
        rs ^= (u16)DIVR * 257 + 31;
    } while (!(kp & (K_START | K_A)));
    runseed = rs;
    if (!rs) rs = 1;
    lcd_off(); cls(); lcd_on();
    {
        Save probe;
        u8 *d = (u8 *)0xA000;
        R8(0x0000) = 0x0A;
        probe.m0 = d[0]; probe.m1 = d[1];
        R8(0x0000) = 0;
        if (probe.m0 == 'M' && probe.m1 == 'D') {
            box_(3, 6, 14, 5);
            c = vmenu(4, 7, 2, IT, 1, 0);
            if (c == 1 && load_game()) { lcd_off(); cls(); lcd_on(); return; }
        }
    }
    {
        static const char *const ST[4] = {"GROK   TERRA", "NELO   ACQUA", "PIRO   FUOCO", "AERO   VENTO"};
        lcd_off(); cls(); lcd_on();
        msg("VECCHIO: BENVENUTO\nA BORGO ALBA!\nSCEGLI IL TUO\nPRIMO COMPAGNO.");
        box_(2, 3, 16, 6);
        c = 0;
        c = vmenu(3, 4, 4, ST, 0, 0);
    }
    np = 0; nb = 0;
    mk(&party[0], c == 0 ? 0 : c == 1 ? 9 : c == 2 ? 15 : 24, 5);
    np = 1;
    gold = 100; spheres = 5; badge = 0; maxfloor = 0;
    bs(); bc(SP_NAME[party[0].sp]); bc(" TI SEGUE!\nALLENATI NELLA\nCAVERNA E SCONFIGGI\nIL CAPO BRUNO!");
    msg(buf);
}

void main(void) {
    LCDC = 0;
    BGP = 0xE4;
    OBP0 = 0xE4;
    R8(0xFF42) = 0; R8(0xFF43) = 0;
    load_tiles();
    oam_clear();
    lcd_on();
    title();
    px = 10; py = 8; pdir = 0;
    load_map(M_VILLAGE);
    show_world();
    world();
}
