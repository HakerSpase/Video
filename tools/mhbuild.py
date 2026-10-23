#!/usr/bin/env python3
"""Реалистичные персонажи из базы MakeHuman (CC0) → lib/humans/<name>.js для lib/human3d.js.

    python3 tools/mhbuild.py MH_DATA_DIR lib/humans

MH_DATA_DIR — папка makehuman/data из https://github.com/makehumancommunity/makehuman
(нужны 3dobjs/base.obj, rigs/default.mhskel, rigs/default_weights.mhw, targets/macrodetails,
targets/expression/units/caucasian, eyes/high-poly).

Что делает: смешивает макро-таргеты (пол, возраст, мышцы, вес, рост, пропорции) как MakeHuman,
считает суставы скелета по сдвинутой сетке, сворачивает лицевые кости и пальцы ног в родителей,
оставляет по 4 веса на вершину, добавляет «одежду» — оболочки поверх тела по областям костей,
глаза (high-poly прокси) и морфы мимики (грустные брови, закрытые глаза, опущенные углы рта).
Размеры в метрах, Y вверх, лицом к +Z.
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np

D = None  # папка данных MakeHuman

CHARS = {
    # Денис: 24 года, худой, жилистый, выше среднего
    "denis": dict(gender=1.0, age_years=24, muscle=0.62, weight=0.4, height=0.45, proportions=0.6,
                  outfit="soldier"),
    # медик / Шах / другие бойцы — чуть другие пропорции
    "soldier2": dict(gender=1.0, age_years=38, muscle=0.55, weight=0.6, height=0.45, proportions=0.5,
                     outfit="soldier"),
    # Соня: 6 лет
    "sonya": dict(gender=0.0, age_years=6, muscle=0.5, weight=0.45, height=0.8, proportions=0.5,
                  outfit="child"),
}

# Оболочки одежды: (имя, категории костей, толщина в м, материал)
OUTFITS = {
    "soldier": [
        ("jacket", {"torso", "neck_low", "upperarm", "lowerarm"}, 0.016, 1, 6),
        ("pants", {"pelvis", "upperleg", "lowerleg", "ankle", "pelvis_top"}, 0.010, 2, 4),  # ботинки — отдельной геометрией в human3d.js
    ],
    "child": [
        ("jacket", {"torso", "neck_low", "upperarm", "lowerarm", "pelvis_top"}, 0.03, 1, 30),
        ("pants", {"pelvis", "upperleg", "lowerleg", "ankle", "pelvis_top"}, 0.010, 2, 4),  # ботинки — отдельной геометрией в human3d.js
    ],
}
MATS = ["skin", "jacket", "pants", "boots", "gloves", "eye", "lash"]


def read_obj(path):
    vs, vts, faces, groups = [], [], [], []
    g = None
    for line in open(path, encoding="utf-8"):
        if line.startswith("v "):
            vs.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            vts.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("g "):
            g = line.split()[1]
        elif line.startswith("f "):
            idx = []
            for tok in line.split()[1:]:
                p = tok.split("/")
                idx.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else -1))
            faces.append(idx)
            groups.append(g)
    return np.array(vs), np.array(vts) if vts else np.zeros((0, 2)), faces, groups


def read_target(name):
    p = D / "targets" / (name + ".target")
    if not p.exists():
        return None
    idx, d = [], []
    for line in open(p, encoding="utf-8"):
        if not line.strip() or line.startswith("#"):
            continue
        a = line.split()
        idx.append(int(a[0]))
        d.append([float(a[1]), float(a[2]), float(a[3])])
    return np.array(idx, dtype=np.int64), np.array(d)


def macro_vals(c):
    v = {}
    g = c["gender"]
    v["male"], v["female"] = g, 1 - g
    y = c["age_years"]
    age = (y - 1) / (11 - 1) * 0.1875 if y < 11 else (0.1875 + (y - 11) / (25 - 11) * 0.3125 if y < 25 else 0.5 + (y - 25) / (90 - 25) * 0.5)
    if age < 0.5:
        v["old"] = 0.0
        v["baby"] = max(0.0, 1 - age * 5.333)
        v["young"] = max(0.0, (age - 0.1875) * 3.2)
        v["child"] = max(0.0, min(1.0, 5.333 * age) - v["young"])
    else:
        v["child"] = v["baby"] = 0.0
        v["old"] = max(0.0, age * 2 - 1)
        v["young"] = 1 - v["old"]
    for key, lo, mid, hi in (("muscle", "minmuscle", "averagemuscle", "maxmuscle"), ("weight", "minweight", "averageweight", "maxweight")):
        x = c[key]
        v[hi] = max(0.0, x * 2 - 1)
        v[lo] = max(0.0, 1 - x * 2)
        v[mid] = 1 - v[hi] - v[lo]
    h = c["height"]
    v["maxheight"], v["minheight"] = max(0.0, h * 2 - 1), max(0.0, 1 - h * 2)
    p = c["proportions"]
    v["idealproportions"], v["uncommonproportions"] = max(0.0, p * 2 - 1), max(0.0, 1 - p * 2)
    v["caucasian"], v["african"], v["asian"] = 1.0, 0.0, 0.0
    return v


def apply_macros(V, c):
    v = macro_vals(c)
    V = V.copy()
    G, A = ("female", "male"), ("baby", "child", "young", "old")
    M, W = ("minmuscle", "averagemuscle", "maxmuscle"), ("minweight", "averageweight", "maxweight")
    jobs = []
    for e in ("caucasian",):
        for g in G:
            for a in A:
                jobs.append((f"macrodetails/{e}-{g}-{a}", v[e] * v[g] * v[a]))
    for g in G:
        for a in A:
            for m in M:
                for w in W:
                    base = v[g] * v[a] * v[m] * v[w]
                    jobs.append((f"macrodetails/universal-{g}-{a}-{m}-{w}", base))
                    for hh in ("minheight", "maxheight"):
                        jobs.append((f"macrodetails/height/{g}-{a}-{m}-{w}-{hh}", base * v[hh]))
                    for pp in ("idealproportions", "uncommonproportions"):
                        jobs.append((f"macrodetails/proportions/{g}-{a}-{m}-{w}-{pp}", base * v[pp]))
    for name, wgt in jobs:
        if wgt < 1e-4:
            continue
        t = read_target(name)
        if t is None or not len(t[0]):
            continue
        V[t[0]] += wgt * t[1]
    return V


def vertex_normals(V, tris):
    n = np.zeros_like(V)
    a, b, cc = V[tris[:, 0]], V[tris[:, 1]], V[tris[:, 2]]
    fn = np.cross(b - a, cc - a)
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.maximum(l, 1e-9)


# какие кости оставить (остальные сливаются в ближайшего оставленного предка)
KEEP_PREFIX = ("root", "spine", "neck", "head", "jaw", "clavicle", "shoulder01", "upperarm", "lowerarm", "wrist",
               "finger", "metacarpal", "pelvis", "upperleg", "lowerleg", "foot", "breast", "eye.")


def bone_cat(name):
    n = name
    if n.startswith(("spine", "breast", "clavicle", "shoulder01")):
        return "torso"
    if n == "root":
        return "pelvis_top"
    if n.startswith("pelvis"):
        return "pelvis"
    if n.startswith("neck01"):
        return "neck_low"
    if n.startswith("neck"):
        return "neck"
    if n.startswith("upperarm"):
        return "upperarm"
    if n.startswith("lowerarm"):
        return "lowerarm"
    if n.startswith(("wrist", "finger", "metacarpal")):
        return "hand"
    if n.startswith("upperleg"):
        return "upperleg"
    if n.startswith("lowerleg02"):
        return "ankle"
    if n.startswith("lowerleg"):
        return "lowerleg"
    if n.startswith(("foot", "toe")):
        return "foot"
    return "head"


def mhclo_fit(path, V):
    """Подгонка прокси (глаза) к сдвинутой сетке, как proxy.py MakeHuman."""
    lines = open(path, encoding="utf-8").read().split("\n")
    scale = {}
    refs = []
    obj = None
    mode = None
    for ln in lines:
        a = ln.split()
        if not a or a[0].startswith("#"):
            continue
        if a[0] in ("x_scale", "y_scale", "z_scale"):
            scale[a[0][0]] = (int(a[1]), int(a[2]), float(a[3]))
        elif a[0] == "obj_file":
            obj = a[1]
        elif a[0] == "verts":
            mode = "v"
        elif a[0] in ("weights", "delete_verts"):
            mode = None
        elif mode == "v" and len(a) >= 9 and a[0].lstrip("-").isdigit():
            refs.append([int(a[0]), int(a[1]), int(a[2]), float(a[3]), float(a[4]), float(a[5]), float(a[6]), float(a[7]), float(a[8])])
        elif mode == "v" and len(a) == 1 and a[0].isdigit():
            refs.append([int(a[0]), int(a[0]), int(a[0]), 1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    s = []
    for ax, k in (("x", 0), ("y", 1), ("z", 2)):
        i1, i2, den = scale[ax]
        s.append(abs(V[i1, k] - V[i2, k]) / den)
    R = np.array(refs)
    i = R[:, :3].astype(int)
    w = R[:, 3:6]
    off = R[:, 6:9] * np.array(s)
    P = w[:, 0:1] * V[i[:, 0]] + w[:, 1:2] * V[i[:, 1]] + w[:, 2:3] * V[i[:, 2]] + off
    pv, pvt, pf, _ = read_obj(Path(path).parent / obj)
    return P, pvt, pf, i, w


def eye_tex():
    import io
    from PIL import Image
    im = Image.open(D / "eyes" / "materials" / "brown_eye.png").convert("RGBA").resize((512, 512))
    a = np.asarray(im).astype(np.float32)
    g = a[:, :, :3].mean(axis=2, keepdims=True)
    a[:, :, :3] = g + (a[:, :, :3] - g) * 0.35  # приглушённая радужка (серо-карие)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
    bio = io.BytesIO()
    im.save(bio, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(bio.getvalue()).decode()


def b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()


def build(name, c, out):
    V0, VT, F, G = read_obj(D / "3dobjs" / "base.obj")
    V = apply_macros(V0, c)
    skel = json.loads((D / "rigs" / "default.mhskel").read_text())
    wts = json.loads((D / "rigs" / "default_weights.mhw").read_text())["weights"]

    # суставы
    J = {k: V[np.array(v)].mean(axis=0) for k, v in skel["joints"].items()}
    bones = skel["bones"]
    order = []

    def visit(b):
        if b in order:
            return
        p = bones[b]["parent"]
        if p:
            visit(p)
        order.append(b)

    for b in bones:
        visit(b)
    keep = [b for b in order if b.startswith(KEEP_PREFIX)]
    kept = set(keep)

    def kept_anc(b):
        while b not in kept:
            b = bones[b]["parent"]
        return b

    bi = {b: i for i, b in enumerate(keep)}
    nV = len(V)
    W = np.zeros((nV, len(keep)))
    for b, lst in wts.items():
        if b not in bones:
            continue
        k = bi[kept_anc(b)]
        for vi, w in lst:
            W[vi, k] += w
    # области лица по весам лицевых костей: губы, веки, щетина, волосистая часть головы
    FA = np.zeros((nV, 5))
    for b, lst in wts.items():
        col = 0 if b.startswith(("oris",)) else 1 if b.startswith(("orbicularis",)) else 4 if b.startswith(("oculi",)) else -1
        if col < 0:
            continue
        for vi, w in lst:
            FA[vi, col] += w
    eyeL, eyeR = J[bones["eye.L"]["head"]], J[bones["eye.R"]["head"]]
    ec = (eyeL + eyeR) / 2
    jawb = J[bones["jaw"]["head"]]
    headW = W[:, keep.index("head")] + W[:, keep.index("jaw")] if "jaw" in keep else W[:, keep.index("head")]
    eye_d = np.linalg.norm(eyeL - eyeR)  # ~0.6 дм у взрослого
    # щетина: низ лица ниже носа, спереди и по бокам челюсти, шея спереди сверху
    yy = (V[:, 1] - ec[1]) / eye_d
    zz = (V[:, 2] - ec[2]) / eye_d
    FA[:, 2] = np.clip((-0.9 - yy) * 2.0, 0, 1) * np.clip((yy + 3.2) * 2.0, 0, 1) * np.clip((zz + 1.6) * 1.5, 0, 1) * np.clip(headW + W[:, [i for i, b in enumerate(keep) if b.startswith("neck")]].sum(axis=1) * 0.6, 0, 1)
    FA[:, 2] *= 1 - np.clip(FA[:, 0] * 3, 0, 1)
    # волосы: выше линии бровей +0.9 и не на лбу; затылок ниже
    front = np.clip((zz - 0.2) * 2.0, 0, 1)
    FA[:, 3] = np.clip(headW * 1.5, 0, 1) * np.clip((yy - 0.9) * 2.5 + (1 - front) * np.clip((yy + 0.2) * 1.5, 0, 1), 0, 1)
    FA[:, 3] = np.maximum(FA[:, 3], np.clip(headW, 0, 1) * np.clip((-zz - 0.6) * 1.5, 0, 1) * np.clip((yy + 1.2) * 1.5, 0, 1))
    # брови: полоса над глазом
    ax = np.abs(V[:, 0] - ec[0]) / eye_d
    FA[:, 4] = np.clip((yy - 0.55) * 6, 0, 1) * np.clip((0.95 - yy) * 6, 0, 1) * np.clip((1.25 - ax) * 4, 0, 1) * np.clip((ax - 0.12) * 5, 0, 1) * np.clip((zz + 0.2) * 3, 0, 1)
    FA = np.clip(FA, 0, 1)
    # категория вершины = категория кости с наибольшим весом
    cats = [bone_cat(b) for b in keep]
    domin = W.argmax(axis=1)
    vcat = np.array([cats[d] for d in domin])
    # топ-4
    top = np.argsort(-W, axis=1)[:, :4]
    tw = np.take_along_axis(W, top, axis=1)
    tw = tw / np.maximum(tw.sum(axis=1, keepdims=True), 1e-9)

    # грани тела (+ ресницы), треугольники
    body_q = [(f, g) for f, g in zip(F, G) if g == "body"]
    lash_q = [(f, g) for f, g in zip(F, G) if g and "eyelashes" in g]

    def tri(faces):
        t = []
        for f, _ in faces:
            for k in range(1, len(f) - 1):
                t.append((f[0], f[k], f[k + 1]))
        return t

    body_t = tri(body_q)
    tris_v = np.array([[a[0], b[0], cc[0]] for a, b, cc in body_t])
    N = vertex_normals(V, tris_v)

    # морфы мимики (только тело)
    morph_names = {
        "sad": [("expression/units/caucasian/eyebrows-left-inner-up", 1.0), ("expression/units/caucasian/eyebrows-right-inner-up", 1.0),
                ("expression/units/caucasian/mouth-depression", 0.6)],
        "closed": [("expression/units/caucasian/eye-left-closure", 1.0), ("expression/units/caucasian/eye-right-closure", 1.0)],
        "slit": [("expression/units/caucasian/eye-left-slit", 1.0), ("expression/units/caucasian/eye-right-slit", 1.0)],
        "frown": [("expression/units/caucasian/eyebrows-left-down", 1.0), ("expression/units/caucasian/eyebrows-right-down", 1.0),
                  ("expression/units/caucasian/mouth-compression", 0.5)],
        "open": [("expression/units/caucasian/mouth-open", 0.35)],
    }
    morphs = {}
    for mn, parts in morph_names.items():
        dlt = np.zeros_like(V)
        for tn, k in parts:
            t = read_target(tn)
            if t is not None and len(t[0]):
                dlt[t[0]] += k * t[1]
        morphs[mn] = dlt

    SC = 0.1  # дециметры → метры
    pos, nor, uv, skI, skW, rest, fa, idx, mvals = [], [], [], [], [], [], [], [], {k: [] for k in morphs}
    vmap = {}

    def emit(vi, ti, m, P=None, Nn=None, si=None, sw=None, push=0.0, key=None, mdelta=True, UV=None):
        k = key or (vi, ti, m)
        if k in vmap:
            return vmap[k]
        p = (P if P is not None else V[vi]) * SC
        nn = Nn if Nn is not None else N[vi]
        p = p + nn * push
        pos.append(p)
        nor.append(nn)
        uv.append(UV if UV is not None else (VT[ti] if ti >= 0 and ti < len(VT) else (0, 0)))
        skI.append(si if si is not None else top[vi])
        skW.append(sw if sw is not None else tw[vi])
        rest.append(p)
        fa.append(FA[vi] if (vi >= 0 and m == 0) else np.zeros(5))
        for mn in morphs:
            mvals[mn].append(morphs[mn][vi] * SC if (mdelta and vi >= 0) else np.zeros(3))
        vmap[k] = len(pos) - 1
        return vmap[k]

    groups = []  # (start, count, mat)

    def add_group(m, triangles):
        start = len(idx)
        for t in triangles:
            idx.extend(t)
        if len(idx) > start:
            groups.append((start, len(idx) - start, m))

    # одежда: какие вершины покрыты
    shells = OUTFITS[c["outfit"]]
    covered = np.zeros(nV, dtype=bool)
    shell_tris = []
    for sname, scats, thick, m, smooth in shells:
        mask = np.isin(vcat, list(scats))
        ts = [t for t in body_t if all(mask[x[0]] for x in t)]
        shell_tris.append((sname, m, thick, ts, smooth))
        if sname != "gloves":
            covered |= mask

    # кожа: убираем только грани глубоко под одеждой (2 кольца от края оставляем — без щелей)
    nb0 = [set() for _ in range(nV)]
    for a, b, cc in tris_v:
        nb0[a].update((b, cc)); nb0[b].update((a, cc)); nb0[cc].update((a, b))
    deep = covered.copy()
    for _ in range(3):
        deep = np.array([deep[i] and all(deep[j] for j in nb0[i]) for i in range(nV)])
    deep |= np.isin(vcat, ["foot"])  # ступни скрыты ботинками (human3d.js)
    skin_tris = []
    for t in body_t:
        if not all(deep[x[0]] for x in t):
            skin_tris.append(tuple(emit(x[0], x[1], 0) for x in t))
    add_group(0, skin_tris)

    # сглаженные нормали для оболочек — толщина вдоль нормали, сглаженной по соседям
    nb = [[] for _ in range(nV)]
    for a, b, cc in tris_v:
        nb[a] += [b, cc]
        nb[b] += [a, cc]
        nb[cc] += [a, b]
    Ns = N.copy()
    for _ in range(4):
        Ns = np.array([Ns[[i] + nb[i]].mean(axis=0) if nb[i] else Ns[i] for i in range(nV)])
        Ns /= np.maximum(np.linalg.norm(Ns, axis=1, keepdims=True), 1e-9)
    footMin = V[:, 1].min()
    for sname, m, thick, ts, smooth in shell_tris:
        # ткань не повторяет рельеф тела: сглаживаем оболочку (Лаплас внутри области), потом раздуваем
        tv = np.array([[x[0] for x in t] for t in ts])
        reg = np.unique(tv)
        Pn = V.copy()
        nbr = {i: set() for i in reg}
        for a, b, cc in tv:
            nbr[a].update((b, cc)); nbr[b].update((a, cc)); nbr[cc].update((a, b))
        nl = [(i, np.array(sorted(nbr[i]))) for i in reg]
        # Таубин (λ/μ): сглаживает без усадки
        ii = np.array([i for i, _ in nl])
        rows = np.repeat(np.arange(len(nl)), [len(nn) for _, nn in nl])
        cols = np.concatenate([nn for _, nn in nl])
        cnt = np.array([len(nn) for _, nn in nl], dtype=float)[:, None]
        for it in range(smooth * 2):
            lam = 0.5 if it % 2 == 0 else -0.53
            acc = np.zeros((len(nl), 3))
            np.add.at(acc, rows, Pn[cols])
            Pn[ii] = Pn[ii] + lam * (acc / cnt - Pn[ii])
        print("  ", sname, "region", len(reg), "smooth shift dm %.3f" % np.linalg.norm(Pn[reg] - V[reg], axis=1).mean())
        Nn = vertex_normals(Pn, tv)
        Pn = Pn + Nn * (thick / SC)
        if sname == "boots":
            # подошва: плоская, на земле
            Pn[reg, 1] = np.maximum(Pn[reg, 1], footMin - 0.12)
        tt = []
        for t in ts:
            tt.append(tuple(emit(x[0], x[1], m, P=Pn[x[0]], Nn=Nn[x[0]], key=(x[0], x[1], m), mdelta=False) for x in t))
        # край ткани (рёбра, принадлежащие одному треугольнику) замыкаем «манжетой» до тела — без щелей
        ecount = {}
        for t in ts:
            for k in range(3):
                a, b = t[k], t[(k + 1) % 3]
                key = (min(a[0], b[0]), max(a[0], b[0]))
                ecount.setdefault(key, []).append((a, b))
        for key, lst in ecount.items():
            if len(lst) != 1:
                continue
            a, b = lst[0]
            oa = emit(a[0], a[1], m, P=Pn[a[0]], Nn=Nn[a[0]], key=(a[0], a[1], m), mdelta=False)
            ob = emit(b[0], b[1], m, P=Pn[b[0]], Nn=Nn[b[0]], key=(b[0], b[1], m), mdelta=False)
            ia = emit(a[0], a[1], m, P=V[a[0]] - N[a[0]] * 0.03, Nn=-Nn[a[0]], key=(a[0], a[1], m, "in"), mdelta=False)
            ib = emit(b[0], b[1], m, P=V[b[0]] - N[b[0]] * 0.03, Nn=-Nn[b[0]], key=(b[0], b[1], m, "in"), mdelta=False)
            tt.append((oa, ob, ib))
            tt.append((oa, ib, ia))
        add_group(m, tt)

    # ресницы (геометрия-помощник базы)
    lt = tri(lash_q)
    add_group(6, [tuple(emit(x[0], x[1], 6) for x in t) for t in lt])

    # глаза
    ep = D / "eyes" / "high-poly" / "high-poly.mhclo"
    if ep.exists():
        P, pvt, pf, ri, rw = mhclo_fit(ep, V)
        etris = []
        for f in pf:
            for k in range(1, len(f) - 1):
                etris.append((f[0], f[k], f[k + 1]))
        # нормали глаз
        et = np.array([[a[0], b[0], cc[0]] for a, b, cc in etris])
        EN = vertex_normals(P, et)
        out_t = []
        for t in etris:
            tt = []
            for vi, ti in t:
                # кость глаза: ближайшая по позиции (eye.L / eye.R)
                side = "eye.L" if P[vi, 0] > 0 else "eye.R"
                si = np.array([bi[side], 0, 0, 0])
                sw = np.array([1.0, 0, 0, 0])
                tt.append(emit(-1, -1, 5, P=P[vi], Nn=EN[vi], si=si, sw=sw, key=("eye", vi, ti), mdelta=False, UV=pvt[ti] if ti >= 0 else (0, 0)))
            out_t.append(tuple(tt))
        add_group(5, out_t)

    # кости: голова, родитель, хвост
    bout = []
    for b in keep:
        h = J[bones[b]["head"]] * SC
        t = J[bones[b]["tail"]] * SC
        p = bones[b]["parent"]
        bout.append({"name": b, "parent": bi[kept_anc(p)] if p else -1, "head": [round(x, 5) for x in h], "tail": [round(x, 5) for x in t]})

    P = np.array(pos, dtype=np.float32)
    data = {
        "name": name,
        "config": c,
        "height": float(P[:, 1].max() - V[:, 1].min() * SC),
        "minY": float(V[:, 1].min() * SC),  # низ босой ступни
        "bones": bout,
        "groups": [[int(a), int(b), MATS[m]] for a, b, m in groups],
        "position": b64(P),
        "normal": b64(np.array(nor, dtype=np.float32)),
        "uv": b64(np.array(uv, dtype=np.float32)),
        "skinIndex": b64(np.array(skI, dtype=np.uint16)),
        "skinWeight": b64(np.array(skW, dtype=np.float32)),
        "index": b64(np.array(idx, dtype=np.uint32)),
        "face": b64((np.array(fa)[:, :4] * 255).astype(np.uint8)),
        "brow": b64((np.array(fa)[:, 4] * 255).astype(np.uint8)),
        "joints": {k: [round(float(x) * SC, 4) for x in J[bones[b]["head"]]] for k, b in (("eyeL", "eye.L"), ("eyeR", "eye.R"), ("head", "head"), ("jaw", "jaw"))},
        "morphs": {k: b64(np.array(v, dtype=np.float32)) for k, v in mvals.items()},
        "count": len(pos),
        "eyeTex": eye_tex(),
    }
    out.mkdir(parents=True, exist_ok=True)
    js = "/* сгенерировано tools/mhbuild.py из базы MakeHuman (CC0) */\n(window.HUMANS = window.HUMANS || {})[" + json.dumps(name) + "] = " + json.dumps(data) + ";\n"
    (out / f"{name}.js").write_text(js)
    print(name, "verts", len(pos), "tris", len(idx) // 3, "bones", len(keep), "height %.2f m" % data["height"], "size %.1f MB" % (len(js) / 1e6))


def main():
    global D
    D = Path(sys.argv[1])
    out = Path(sys.argv[2])
    only = sys.argv[3:] or list(CHARS)
    for n in only:
        build(n, CHARS[n], out)


if __name__ == "__main__":
    main()
