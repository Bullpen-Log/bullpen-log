"""
다저스타디움 3D — Blender 블록아웃(1차). Blender 4.2 LTS 에서 화면 없이 돌린다:

  blender -b --factory-startup -P scripts/stadium/build_dodger.py -- --blend out.blend --renders out_dir

다시 돌려도 중복이 생기지 않는다(우리 컬렉션 · 메시 · 재질을 지우고 새로 짓는다).
자료와 근거는 docs/designs/dodger-stadium-3d.md, 평면은 dodger-osm.json(© OpenStreetMap 기여자, ODbL).

좌표(미터): 원점 = 홈플레이트 뒤 꼭짓점, +X = 가운데 쪽(a), +Y = 3루 쪽(= −b, b 는 1루 쪽), +Z = 위.
glTF 로 내보내면 (X, Z, −Y) = (a, 높이, b) — three 쪽에서 y 축 180° 돌려 무대 좌표(x 홈 쪽, 1루 −z)에 맞춘다.

블록아웃 원칙: 모양 · 치수 검증이 먼저라 의자 · 계단은 아직 없다(층은 경사 덩어리). 추정값은 EST 로 표시.
"""

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import random
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


DATA = json.load(open(os.path.join(HERE, 'dodger-osm.json'), encoding='utf-8'))
AXIS = math.radians(DATA['axis_deg_ccw_from_east'])

COLLS = [
    'Field',
    'Infield',
    'Outfield',
    'Fences',
    'Lower_Seating',
    'Upper_Seating',
    'Stadium_Architecture',
    'Dugouts',
    'Lighting_Structures',
    'Details',
]
EXTRA = ['Reference', 'Cameras']
Q = math.pi / 4


def P(a, b, z=0.0):
    """경기장 좌표(a 가운데 쪽, b 1루 쪽, z 위) → Blender"""
    return Vector((a, -b, z))


# ───────────── 준비: 지우고 다시 ─────────────


def reset():
    for name in COLLS + EXTRA:
        c = bpy.data.collections.get(name)
        if c:
            for o in list(c.all_objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(c)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.curves):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    for o in list(bpy.context.scene.collection.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for name in COLLS + EXTRA:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)


def mat(name, rgb, rough=0.8):
    m = bpy.data.materials.get('BO_' + name) or bpy.data.materials.new('BO_' + name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mesh_obj(name, coll, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.data.collections[coll].objects.link(ob)
    return ob


def prism(name, coll, poly, z0, ztop, material):
    """평면 다각형(경기장 좌표) → 기둥. ztop 은 숫자 또는 (a, b) → 높이 함수(기울어진 지붕)"""
    n = len(poly)
    top = (lambda a, b: ztop) if not callable(ztop) else ztop
    verts = [P(a, b, z0) for a, b in poly] + [P(a, b, top(a, b)) for a, b in poly]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    ob = mesh_obj(name, coll, verts, faces, material)
    fix_normals(ob)
    return ob


def fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


# ───────────── 규격 ─────────────

# 외야 펜스(홈에서, m) — 가운데 선에서 각(도) → 거리. 0° 122(400ft) · 22.5° 114.3(375ft) 공식, 15° 117.6 · 30° 112.4 은 OSM 실측(±3m), 45° 100.6(330ft)
FENCE = [(0, 122.0), (15, 117.6), (22.5, 114.3), (30, 112.4), (45, 100.6)]


def fence_r(th):
    """가운데 선에서 θ(라디안, 1루 쪽 +) — 점들 사이를 매끈한 3차(카트멀-롬, 0° 에서 대칭)로"""
    d = min(45.0, abs(math.degrees(th)))
    xs = [-p[0] for p in FENCE[1:][::-1]] + [p[0] for p in FENCE]
    ys = [p[1] for p in FENCE[1:][::-1]] + [p[1] for p in FENCE]
    i = max(0, min(len(xs) - 2, next(k for k in range(len(xs) - 1) if xs[k + 1] >= d)))
    x0, x1 = xs[i], xs[i + 1]
    t = (d - x0) / (x1 - x0)
    p0 = ys[max(0, i - 1)]
    p1, p2 = ys[i], ys[i + 1]
    p3 = ys[min(len(ys) - 1, i + 2)]
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)


def wall_h(th):
    """펜스 높이 — 폴 근처 4ft, 나머지 8ft(EST: Baseball Data Hub)"""
    t = abs(math.degrees(th)) / 45
    return 2.44 - 1.22 * min(1, max(0, (t - 0.72) / 0.1))


BACKSTOP = 16.8  # 55ft


def foul_w(r):
    """파울 벽까지(파울선에서, m) — OSM: 30m 까지 15~17, 50m 7.6, 60m 5, 70m 넘어 2"""
    if r <= 28:
        return BACKSTOP
    u = min(1, (r - 28) / 44)
    return BACKSTOP + (2.2 - BACKSTOP) * u * u * (3 - 2 * u)


# ───────────── 관중석 앞 선(파울 벽 · 홈 뒤 호 · 폴 너머 외야 펜스를 따라) ─────────────

END_THETA = math.radians(37.6)  # OSM: 관중석 끝 — 폴을 지나 펜스를 따라 가운데 쪽 7.4° 까지
END_NORMAL = math.radians(67.9)  # OSM: 관중석 끝 선의 방향(경기장 좌표 a 에서)


def front_line():
    """한쪽(1루, b > 0) 앞 선 — (a, b, 바깥 법선 각, reach). reach = 파울선을 따라 간 거리(폴 너머는 100.6 + 펜스 길이)"""
    pts = []
    for i in range(0, 46):
        t = math.radians(180 - i)  # 홈 뒤 호 180° → 135°
        pts.append((BACKSTOP * math.cos(t), BACKSTOP * math.sin(t), t, 0.0))
    pts = pts[::-1][:-1][::-1]  # 135° 쪽 끝은 아래 선 첫 점과 같다
    d = (math.cos(Q), math.sin(Q))
    n = (-math.sin(Q), math.cos(Q))
    for r in [x * 1.0 for x in range(0, 99)] + [99.0]:
        f = foul_w(r)
        pts.append((r * d[0] + f * n[0], r * d[1] + f * n[1], math.radians(135), r))
    for k in range(1, 9):
        th = Q - (Q - END_THETA) * k / 8
        R = fence_r(th) + 0.6
        ang = math.radians(135) + (END_NORMAL - math.radians(135)) * k / 8
        pts.append((R * math.cos(th), R * math.sin(th), ang, 100.6 + R * (Q - th)))
    # 홈 뒤 호의 법선은 반지름 방향, 선은 135°
    return pts


def full_front():
    one = front_line()
    other = [(a, -b, -ang, r) for a, b, ang, r in one[::-1]]
    return other + one[1:]


# ───────────── 층(블록아웃 단면) ─────────────

SLAB = 1.0
SEAT_COUNT = {}
ATLAS = [None]
SEAT_PTS = {}
SEAT_AO = {}
# 꼭대기 49.4m(LA 카운티 건물 높이) 에 맞춘 높이 — 층 높이 · 튀어나온 길이는 사진 어림(EST)
DECKS = [
    dict(key='field', w0=0.0, z0=0.6, w1=26.0, z1=7.5, reach=999),
    dict(key='loge', w0=13.0, z0=9.5, w1=28.0, z1=15.0, reach=999),
    dict(key='club', w0=22.0, z0=17.5, w1=28.0, z1=20.0, reach=30),
    dict(key='reserve', w0=26.0, z0=23.5, w1=43.0, z1=32.5, reach=999),
    dict(key='top', w0=37.0, z0=35.0, w1=52.0, z1=42.5, reach=999),
]
ROOF = dict(w0=43.0, w1=56.0, z_front=48.6, z_back=49.4, t=0.5)
SHIFT_MAX = 10.0  # 모서리에서 위층을 파울선 쪽으로 당기는 거리(EST — 사진: 폴 옆에 위층이 높이 선다)


def shift_of(key, reach):
    if key == 'field':
        return 0.0
    u = min(1, max(0, (reach - 50) / 45))
    return SHIFT_MAX * u * u * (3 - 2 * u)


def under_at(d, w):
    return d['z0'] - SLAB + (w - d['w0']) * (d['z1'] - d['z0']) / (d['w1'] - d['w0'])


def wall_top(i, reach):
    d = DECKS[i]
    W = d['w1'] - shift_of(d['key'], reach)
    if d['key'] == 'top':
        return ROOF['z_back'] - ROOF['t'] - 0.6
    for n in DECKS[i + 1 :]:
        if reach > n['reach']:
            continue
        sh = shift_of(n['key'], reach)
        if n['w0'] - sh - 0.01 <= W <= n['w1'] - sh + 0.01:
            return under_at(n, W + sh)
    return d['z1'] + 2.5


ROW = 0.85  # 줄 깊이(m) — 층마다 '20여 줄'(walteromalley.com)과 맞는다


def rows_of(d):
    """층의 줄들 — (줄 앞 w, 줄 바닥 z, 줄 깊이) — 앞 난간 0.3m 뒤에서 시작해 마지막 줄이 w1 에서 끝난다"""
    span = d['w1'] - d['w0'] - 0.3
    n = max(2, round(span / ROW))
    depth = span / n
    rise = (d['z1'] - d['z0']) / (n - 1)
    return [(d['w0'] + 0.3 + k * depth, d['z0'] + k * rise, depth) for k in range(n)]


def section(i, reach):
    """층 단면(닫힌 다각형) — 앞 벽 · 난간 → 계단식 줄 → 뒤 벽 → 밑면(위층) 또는 땅(필드)"""
    d = DECKS[i]
    w0, z0, w1, z1 = d['w0'], d['z0'], d['w1'], d['z1']
    top = max(wall_top(i, reach), z1 + 1.0)
    pts = [(w0, 0.0) if d['key'] == 'field' else (w0, z0 - SLAB), (w0, z0 + 1.0), (w0 + 0.3, z0 + 1.0)]
    rows = rows_of(d)
    for wr, zr, dep in rows:
        pts.append((wr, zr))
    pts.append((w1, z1))
    # 뒤 벽은 여러 점으로 나눈다 — 위아래 두 점뿐이면 구운 빛이 삼각형 대각선을 따라 지그재그로 번졌다
    n_up = 8  # 둘레를 따라 점 수가 같아야 쓸 수 있어 고정(벽 높이 2~7m)
    pts += [(w1, z1 + (top - z1) * k / n_up) for k in range(1, n_up + 1)]
    bottom = 0.0 if d['key'] == 'field' else z1 - SLAB
    n_dn = 10
    pts += [(w1 + 0.001, top - (top - bottom) * k / n_dn) for k in range(1, n_dn)]
    pts.append((w1, bottom))
    return pts


def sweep_closed(name, coll, path, sec_fn, shift_fn, material, sec_q=None):
    """닫힌 단면(경기장 바깥 거리 w, 높이 z)을 앞 선을 따라 쓸어 관을 만들고 두 끝을 막는다"""
    verts, faces = [], []
    rings = []
    for q in path:
        a, b, ang, reach = q
        sec = sec_q(q) if sec_q else sec_fn(reach)
        sh = shift_fn(reach)
        na, nb = math.cos(ang), math.sin(ang)
        ring = []
        for w, z in sec:
            w -= sh
            verts.append(P(a + na * w, b + nb * w, z))
            ring.append(len(verts) - 1)
        rings.append(ring)
    m = len(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(m):
            k1 = (k + 1) % m
            faces.append([r0[k], r0[k1], r1[k1], r1[k]])
    faces.append(rings[0][::-1])
    faces.append(rings[-1])
    ob = mesh_obj(name, coll, verts, faces, material)
    fix_normals(ob)
    ob['ring'] = m  # 둘레 한 칸의 점 수 — 빛 굽기 뒤 둘레 방향으로만 고르게 펼 때 쓴다
    return ob


SEAT_TILE = 8.0  # 의자 줄 그림 한 장의 길이(m) — 의자 0.5m × 16. 통로는 그림이 아니라 앞 선 길이에 맞춘 판(줄마다 그림 자리가 달라 통로가 어긋났다)


def seat_atlas():
    """의자 줄 그림(1024 × 128, 앞 → 뒤 = 아래 → 위). RGB = 밝기, A = 의자 자리(앱이 층 색을 칠한다).
    줄 앞 디딤판(밝은 콘크리트) → 앉는 판(그늘) → 등받이(위로 밝게, 둥근 어깨) → 등 뒤 그늘. 왼쪽 1.1m 는 통로 계단 둘."""
    import numpy as np
    W, H = 1024, 128
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)
    shade = np.full((H, W), 0.82)
    mask = np.zeros((H, W))
    um = U * SEAT_TILE
    aisle = um < -1.0
    seat_u = um / 0.5
    fu = seat_u - np.floor(seat_u)
    inseat = (~aisle) & (fu > 0.05) & (fu < 0.95)
    # 디딤판
    tread = V < 0.12
    shade = np.where(tread, 0.86 + 0.1 * (V < 0.025), shade)
    # 앉는 판 · 등받이
    pan = (V >= 0.12) & (V < 0.34) & inseat
    back_v = (V - 0.34) / 0.52
    corner = np.minimum(fu - 0.05, 0.95 - fu) / 0.12
    back = (V >= 0.34) & (back_v < 1.0 - np.clip(0.35 - corner, 0, 1) ** 2 * 1.2) & inseat
    shade = np.where(pan, 0.62 + 0.1 * (V - 0.12) / 0.22, shade)
    shade = np.where(back, 0.82 + 0.2 * back_v, shade)
    mask = np.where(pan | back, 1.0, mask)
    # 의자 사이 · 등 뒤 그늘
    gap = (~aisle) & (V >= 0.12) & ~(pan | back)
    shade = np.where(gap, np.where(V > 0.8, 0.3, 0.45), shade)
    # 통로 — 계단 둘(반 줄마다 턱)
    av = (V * 2) % 1.0
    shade = np.where(aisle, np.where(av < 0.08, 0.55, 0.84 + 0.06 * (av > 0.9)), shade)
    shade = np.where(aisle & ((um < 0.06) | (um > 1.04)), 0.6, shade)
    img = bpy.data.images.get('BO_seat_atlas') or bpy.data.images.new('BO_seat_atlas', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32)
    srgb_shade = np.where(shade <= 0.0031308, shade * 12.92, 1.055 * np.power(shade, 1 / 2.4) - 0.055)
    px[..., 0] = px[..., 1] = px[..., 2] = srgb_shade
    px[..., 3] = mask
    img.pixels.foreach_set(px.ravel())
    img.file_format = 'PNG'
    img.pack()
    return img


def seat_row_material(name, rgb, atlas):
    m = bpy.data.materials.get('BO_seatrow_' + name) or bpy.data.materials.new('BO_seatrow_' + name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.get('SeatAtlas') or nt.nodes.new('ShaderNodeTexImage')
    tex.name = 'SeatAtlas'
    tex.image = atlas
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.7
    m['seat_rgb'] = list(rgb)
    m.diffuse_color = (*rgb, 1)
    return m


def seat_rows(name, coll, path, d, shift_fn, material):
    """층의 의자 줄 판 — 줄마다 떨어진 띠(점을 나누지 않아 줄마다 제 길이로 u 를 잰다 — 바깥 줄은 둘레가 길어 의자가 더 많다)"""
    verts, faces, uvs = [], [], []
    rows = rows_of(d)
    for k, (wr, zr, dep) in enumerate(rows):
        z_back = rows[k + 1][1] if k + 1 < len(rows) else d['z1']
        wb = wr + dep
        L = 0.0
        prev = None
        base = len(verts)
        for q in path:
            a, b, g, r = q
            sh = shift_fn(r)
            wm = (wr + wb) / 2 - sh
            mid = (a + math.cos(g) * wm, b + math.sin(g) * wm)
            if prev is not None:
                L += math.hypot(mid[0] - prev[0], mid[1] - prev[1])
            prev = mid
            for w, z, vv in ((wr - sh, zr + 0.03, 0.0), (wb - sh, z_back + 0.03, 1.0)):
                verts.append(P(a + math.cos(g) * w, b + math.sin(g) * w, z))
                uvs.append((L / SEAT_TILE, vv))
        n = len(path)
        for i in range(n - 1):
            a0 = base + i * 2
            faces.append([a0, a0 + 2, a0 + 3, a0 + 1])
    ob = mesh_obj(name, coll, verts, faces, material)
    # 열린 띠라 fix_normals 가 아래를 볼 수 있다 — 하늘을 보게 뒤집는다(빛 굽기가 노멀 쪽으로 광선을 쏜다)
    ob.data.update()
    if sum(pl.normal.z for pl in ob.data.polygons) < 0:
        for pl in ob.data.polygons:
            pl.flip()
        ob.data.update()
    uvl = ob.data.uv_layers.new(name='UVMap')
    for li, loop in enumerate(ob.data.loops):
        uvl.data[li].uv = uvs[loop.vertex_index]
    return ob


def seat_mesh(name, material):
    """의자 하나(앞 = +X) — 앉는 판 · 등받이 · 받침. 면 30개 남짓, 수만 개 복제한다"""
    bm = bmesh.new()

    def box(cx, cy, cz, sx, sy, sz):
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']:
            v.co.x = cx + v.co.x * sx
            v.co.y = cy + v.co.y * sy
            v.co.z = cz + v.co.z * sz

    box(0.02, 0.0, 0.43, 0.40, 0.46, 0.05)  # 앉는 판
    box(-0.21, 0.0, 0.68, 0.04, 0.46, 0.42)  # 등받이
    # 안 보이는 밑면은 지운다(의자 5만여 개라 면 하나도 아깝다) — 받침은 그늘에 묻혀 안 보여 뺐다
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context='FACES')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    return ob


FOCUS = (25.0, 0.0)  # 의자가 보는 곳(경기장 좌표)
AISLE = 8.5  # 통로 간격(앞 선 길이, m) — 사진 어림(EST)


def seat_points(path, d, shift_fn, voms=()):
    """층의 의자 자리 — 줄마다 0.5m 간격, 통로(앞 선 길이 AISLE 마다 1.1m) 건너뛰기. (x, y, z, 방향) Blender 좌표"""
    out = []
    s_front = [0.0]
    for (a0, b0, *_), (a1, b1, *_) in zip(path, path[1:]):
        s_front.append(s_front[-1] + math.hypot(a1 - a0, b1 - b0))
    for wr, zr, dep in rows_of(d):
        w = wr + dep * 0.55
        carry = 0.0
        for k in range(len(path) - 1):
            a0, b0, g0, r0 = path[k]
            a1, b1, g1, r1 = path[k + 1]
            w0 = w - shift_fn(r0)
            w1 = w - shift_fn(r1)
            p0 = (a0 + math.cos(g0) * w0, b0 + math.sin(g0) * w0)
            p1 = (a1 + math.cos(g1) * w1, b1 + math.sin(g1) * w1)
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            t = carry
            while t < L:
                u = t / L
                sf = s_front[k] + (s_front[k + 1] - s_front[k]) * u
                m = sf % AISLE
                if 0.55 < m < AISLE - 0.55 and not any(abs(sf - sv) < 1.7 and lo - 0.5 <= w <= hi + 0.3 for sv, lo, hi in voms):
                    pa = p0[0] + (p1[0] - p0[0]) * u
                    pb = p0[1] + (p1[1] - p0[1]) * u
                    g = g0 + (g1 - g0) * u
                    # 의자는 내야 한가운데(홈에서 25m)를 본다 — 다저스: 베이스 너머 의자가 투수 쪽으로 틀어져 있다. 줄 방향에서 60° 넘게는 안 튼다
                    fa, fb = FOCUS[0] - pa, FOCUS[1] - pb
                    want = math.atan2(fb, fa)
                    base = g + math.pi
                    dlt = (want - base + math.pi) % (2 * math.pi) - math.pi
                    face = base + max(-math.radians(60), min(math.radians(60), dlt))
                    out.append((pa, -pb, zr, math.atan2(-math.sin(face), math.cos(face))))
                t += 0.5
            carry = t - L
    return out


def instance_seats(name, coll, pts, seat_ob):
    """점(자리 · 방향)에 의자를 지오메트리 노드로 복제 — glTF 로 내보내면 EXT_mesh_gpu_instancing(three 의 InstancedMesh)"""
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [c for x, y, z, _ in pts for c in (x, y, z)])
    attr = me.attributes.new('yaw', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', [yw for *_, yw in pts])
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[coll].objects.link(ob)
    ng = bpy.data.node_groups.new(name + '_GN', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = ng.nodes
    gi = N.new('NodeGroupInput')
    go = N.new('NodeGroupOutput')
    inst = N.new('GeometryNodeInstanceOnPoints')
    info = N.new('GeometryNodeObjectInfo')
    info.inputs['Object'].default_value = seat_ob
    info.inputs['As Instance'].default_value = True
    yaw = N.new('GeometryNodeInputNamedAttribute')
    yaw.data_type = 'FLOAT'
    yaw.inputs['Name'].default_value = 'yaw'
    comb = N.new('ShaderNodeCombineXYZ')
    L = ng.links
    L.new(gi.outputs[0], inst.inputs['Points'])
    L.new(info.outputs['Geometry'], inst.inputs['Instance'])
    L.new(yaw.outputs['Attribute'], comb.inputs['Z'])
    L.new(comb.outputs['Vector'], inst.inputs['Rotation'])
    L.new(inst.outputs['Instances'], go.inputs[0])
    mod = ob.modifiers.new('Seats', 'NODES')
    mod.node_group = ng
    return ob


class Boxes:
    """가는 상자(난간 · 기둥 · 들보 · 철골) 여럿을 한 메시로 — 두 점 사이, 굵기 t(정사각 단면) 또는 (가로, 세로)"""

    def __init__(self):
        self.v, self.f = [], []

    def add(self, p0, p1, t, up=None):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        if d.length < 1e-6:
            return
        d.normalize()
        tw, th = (t, t) if not isinstance(t, tuple) else t
        u = (up or Vector((0, 0, 1)))
        if abs(d.dot(u)) > 0.95:
            u = Vector((1, 0, 0))
        a = d.cross(u).normalized() * (tw / 2)
        b = a.cross(d).normalized() * (th / 2)
        i = len(self.v)
        for q in (p0, p1):
            self.v += [q - a - b, q + a - b, q + a + b, q - a + b]
        self.f += [[i, i + 1, i + 2, i + 3][::-1], [i + 4, i + 5, i + 6, i + 7]]
        for k in range(4):
            k1 = (k + 1) % 4
            self.f.append([i + k, i + k1, i + 4 + k1, i + 4 + k])

    def build(self, name, coll, material):
        if not self.v:
            return None
        ob = mesh_obj(name, coll, self.v, self.f, material)
        fix_normals(ob)
        return ob


VOM_STEP = 26.0  # 출입 터널 간격(앞 선 길이, m — EST)


def vom_spots(path, d):
    """층의 출입 터널 — (앞 선 길이 위치, 바깥 거리 앞 · 뒤). 필드 · 로지 · 리저브만, 층 가운데 줄쯤"""
    if d['key'] not in ('field', 'loge', 'reserve'):
        return []
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(path, path[1:]))
    rows = rows_of(d)
    k = len(rows) // 2
    lo = rows[k][0]
    hi = rows[min(len(rows) - 1, k + 3)][0] + rows[0][2]
    out = []
    sv = VOM_STEP / 2
    while sv < total - 6:
        out.append((sv, lo, hi))
        sv += VOM_STEP
    return out


def path_at(path, sf):
    """앞 선 길이 sf 자리의 (a, b, 법선각, reach)"""
    acc = 0.0
    for p0, p1 in zip(path, path[1:]):
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if acc + L >= sf and L > 0:
            u = (sf - acc) / L
            return tuple(p0[i] + (p1[i] - p0[i]) * u for i in range(4))
        acc += L
    return path[-1]


def details(M, path):
    """세부 — 층 앞 난간 · 띠 전광판 · 위층 밑 들보 · 출입 터널 · 쿠션 벽 · 백스톱 그물 · 지붕 조명판"""
    rails = Boxes()
    posts = Boxes()
    beams = Boxes()
    vom_dark = Boxes()
    vom_wall = Boxes()
    aisles = Boxes()
    for d in DECKS:
        sub = [q for q in path if q[3] <= d['reach']]
        sh = lambda r, k=d['key']: shift_of(k, r)
        w0, z0 = d['w0'], d['z0']
        top = z0 + 1.0
        # 난간 — 앞 벽 위 0.75m 쇠 파이프, 2.4m 마다 기둥
        acc = 0.0
        prev = None
        for a, b, g, r in sub:
            w = w0 + 0.15 - sh(r)
            q = P(a + math.cos(g) * w, b + math.sin(g) * w, top + 0.75)
            if prev is not None:
                rails.add(prev, q, 0.06)
                acc += (q - prev).length
                if acc >= 2.4:
                    acc = 0.0
                    posts.add(q - Vector((0, 0, 0.75)), q, 0.05)
            prev = q
        # 띠 전광판 — 로지 · 클럽 앞 벽(밑판 앞면)
        if d['key'] in ('loge', 'club', 'reserve'):
            sec = [(w0 - 0.06, z0 - 0.75), (w0 - 0.01, z0 - 0.75), (w0 - 0.01, z0 + 0.85), (w0 - 0.06, z0 + 0.85)]
            sweep_closed(f'LED_Ribbon_{d["key"]}', 'Details', sub, lambda r, sec=sec: sec, sh, M['led'])
        # 통로 계단 — 앞 선 길이 AISLE 마다 1.1m 판(경사를 따라, 의자 위 6cm)
        rows = rows_of(d)
        total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(sub, sub[1:]))
        sf = 0.0
        while sf < total:
            a, b, g, r = path_at(sub, sf)
            for (wr, zr, dep), nxt in zip(rows, rows[1:] + [None]):
                z2 = nxt[1] if nxt else d['z1']
                wa, wb2 = wr - sh(r), wr + dep - sh(r)
                aisles.add(P(a + math.cos(g) * wa, b + math.sin(g) * wa, zr + 0.07), P(a + math.cos(g) * wb2, b + math.sin(g) * wb2, z2 + 0.07), (1.1, 0.08))
            sf += AISLE
        # 위층 밑 들보 — 7.5m 마다 앞에서 뒤까지
        if d['key'] != 'field':
            sf = 3.0
            total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(sub, sub[1:]))
            while sf < total:
                a, b, g, r = path_at(sub, sf)
                ws = d['w0'] + 0.6 - sh(r)
                we = d['w1'] - sh(r)
                zs = under_at(d, d['w0'] + 0.6) - 0.35
                ze = under_at(d, d['w1']) - 0.35
                beams.add(P(a + math.cos(g) * ws, b + math.sin(g) * ws, zs), P(a + math.cos(g) * we, b + math.sin(g) * we, ze), (0.45, 0.7))
                sf += 7.5
        # 출입 터널 — 어두운 구멍 + 양옆 콘크리트 벽
        for sv, lo, hi in vom_spots(sub, d):
            a, b, g, r = path_at(sub, sv)
            rows = rows_of(d)
            z_lo = min(z for wr, z, dep in rows if wr + dep >= lo)
            z_hi = max(z for wr, z, dep in rows if wr <= hi)
            # 터널 입구 = 의자 사이 비운 자리에 어두운 경사 바닥 + 양옆 · 앞 콘크리트 난간벽(1m)
            tx, ty = -math.sin(g), math.cos(g)
            wa, wb = lo - sh(r), hi - sh(r)
            pt = lambda w, o, z: P(a + math.cos(g) * w + tx * o, b + math.sin(g) * w + ty * o, z)
            vom_dark.add(pt(wa, 0, z_lo + 0.3), pt(wb, 0, z_hi + 0.3), (2.3, 0.6))
            for o in (-1.25, 1.25):
                vom_wall.add(pt(wa, o, z_lo + 0.35), pt(wb, o, z_hi + 0.35), (0.15, 0.7))
            vom_wall.add(pt(wa, -1.3, z_lo + 0.35), pt(wa, 1.3, z_lo + 0.35), (0.15, 0.7))
    rails.build('Deck_Rails', 'Details', M['steel'])
    posts.build('Deck_Rail_Posts', 'Details', M['steel'])
    beams.build('Deck_Beams', 'Stadium_Architecture', M['concrete'])
    vom_dark.build('Vomitory_Openings', 'Lower_Seating', M['dark'])
    vom_wall.build('Vomitory_Walls', 'Lower_Seating', M['concrete'])
    aisles.build('Aisle_Stairs', 'Lower_Seating', M['concrete'])

    # 쿠션 벽 — 필드 층 앞(땅에서 1.4m), 펜스와 같은 하늘빛 회색
    fsub = [q for q in path]
    sweep_closed('Field_Pad_Wall', 'Fences', fsub, lambda r: [(-0.05, 0.0), (0.0, 0.0), (0.0, 1.42), (-0.05, 1.42)], lambda r: 0.0, M['wall'])

    # 백스톱 그물 — 홈 뒤에서 더그아웃 끝(파울선 36m)까지, 앞 벽 위로 9m
    nsub = [q for q in path if q[3] <= 36]
    sweep_closed('Backstop_Net', 'Details', nsub, lambda r: [(0.02, 1.45), (0.04, 1.45), (0.04, 10.5), (0.02, 10.5)], lambda r: 0.0, M['net'])
    top_cable = Boxes()
    prev = None
    for a, b, g, r in nsub:
        q = P(a + math.cos(g) * 0.03, b + math.sin(g) * 0.03, 10.5)
        if prev is not None:
            top_cable.add(prev, q, 0.04)
        prev = q
    top_cable.build('Backstop_Cable', 'Details', M['steel'])

    # 지붕 조명판 — 톱 덱 지붕 위 기둥 넷(파울선 55 · 90m, 양쪽) 위 큰 등판(참고 그림)
    lights = Boxes()
    for reach in (55.0, 90.0):
        for sgn in (1, -1):
            cand = [q for q in path if abs(q[3] - reach) < 1.1 and (q[1] > 0) == (sgn > 0)]
            if not cand:
                continue
            a, b, g, r = cand[0]
            w = (ROOF['w0'] + ROOF['w1']) / 2 - shift_of('top', r)
            base = P(a + math.cos(g) * w, b + math.sin(g) * w, ROOF['z_back'])
            tx, ty = -math.sin(g), math.cos(g)
            for o in (-4.5, 4.5):
                q = base + Vector((tx * o, -ty * o, 0))
                lights.add(q, q + Vector((0, 0, 9.0)), 0.35)
            c = base + Vector((0, 0, 11.5))
            span = Vector((tx, -ty, 0)) * 8.0
            panel = Boxes()
            panel.add(c - span, c + span, (0.6, 5.0))
            panel.build(f'Roof_Light_Bank_{int(reach)}_{sgn}', 'Lighting_Structures', M['lamp'])
    lights.build('Roof_Light_Posts', 'Lighting_Structures', M['steel'])


# ───────────── 짓기 ─────────────


def build():
    reset()
    M = {
        'grass': mat('grass', srgb('#3f7a2e')),
        'dirt': mat('dirt', srgb('#c49a72')),
        'track': mat('track', srgb('#8f4a35')),
        'clay': mat('clay', srgb('#a8614a')),
        'wall': mat('wall', srgb('#3a6496')),
        'field': mat('field_level', srgb('#2a5fb0')),
        'loge': mat('loge', srgb('#e3bd4c')),
        'club': mat('club', srgb('#2a4d8f')),
        'reserve': mat('reserve', srgb('#8dbdc8')),
        'top': mat('top_deck', srgb('#86bcd6')),
        'pav_roof': mat('pavilion_roof', srgb('#5a3a2b'), 0.6),
        'roof_glow': mat('roof_glow', srgb('#efe6d2'), 0.5),
        'flag': mat('flag', srgb('#24508f'), 0.7),
        'field_deck': mat('concrete_deck', srgb('#bdb7ab')),
        'concrete': mat('concrete', srgb('#cfc9bd')),
        'loge_deck': None,
        'club_deck': None,
        'reserve_deck': None,
        'top_deck': None,
        'roof': mat('roof', srgb('#e9e6df')),
        'metal': mat('metal', srgb('#8b9097'), 0.5),
        'pavseat': mat('pavilion_seat', srgb('#c8b58e')),
        'dark': mat('dark', srgb('#15181d'), 0.4),
        'yellow': mat('yellow', srgb('#f0c02c'), 0.5),
        'ref': mat('reference', (1.0, 0.0, 0.0)),
        'ref2': mat('reference_osm_pavilion', (0.0, 0.2, 1.0)),
        'steel': mat('steel', srgb('#4a5058'), 0.45),
        'led': mat('led', srgb('#1d4f9c'), 0.3),
        'screen': mat('screen', srgb('#0a1630'), 0.3),
        'lamp': mat('lamp', srgb('#c9cdd2'), 0.35),
        'net': mat('net', srgb('#2a2a2a'), 0.9),
        'bench': mat('bench', srgb('#b9a57c'), 0.7),
    }
    M['net'].blend_method = 'BLEND'
    M['net'].node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.22
    for k in ('loge_deck', 'club_deck', 'reserve_deck', 'top_deck'):
        M[k] = M['field_deck']

    # Field — 펜스 안 잔디 + 파울 지역(앞 선 안쪽), 바닥 z 0
    fence_pts = [(fence_r(t) * math.cos(t), fence_r(t) * math.sin(t)) for t in [-Q + 2 * Q * k / 90 for k in range(91)]]
    prism('Field_Grass', 'Field', [(a, b) for a, b in fence_pts] + [(a, b) for a, b, _, r in full_front() if r <= 99.5][::-1], -0.05, 0.0, M['grass'])

    # Infield — 내야 흙 호(투수판 앞에서 28.96m) · 잔디 사각 · 마운드 · 홈 둘레
    arc = [(18.44 + 28.96 * math.cos(t), 28.96 * math.sin(t)) for t in [math.radians(-48 + 96 * k / 48) for k in range(49)]]
    prism('Infield_Dirt', 'Infield', [(0.0, 0.0)] + arc, 0.0, 0.01, M['dirt'])
    s = 27.43 / math.sqrt(2)
    sq_in = 0.914 * math.sqrt(2)
    prism('Infield_Grass', 'Infield', [(sq_in, 0), (s, s - sq_in), (2 * s - sq_in, 0), (s, -s + sq_in)], 0.0, 0.02, M['grass'])
    circ = lambda c, r, n=40: [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    prism('Mound', 'Infield', circ((17.983, 0), 2.743), 0.0, 0.254, M['clay'])
    prism('Home_Circle', 'Infield', circ((0.2159, 0), 3.962), 0.0, 0.025, M['clay'])

    # Outfield — 경고 트랙(펜스 안 4.57m)
    trk_out = fence_pts
    trk_in = [(math.cos(t) * (fence_r(t) - 4.572), math.sin(t) * (fence_r(t) - 4.572)) for t in [-Q + 2 * Q * k / 90 for k in range(91)]]
    prism('Warning_Track', 'Outfield', trk_out + trk_in[::-1], 0.0, 0.015, M['track'])

    # Fences — 외야 펜스(폴 → 폴) · 파울 벽(앞 선, 높이 1.4m)
    verts, faces = [], []
    for k in range(121):
        t = -Q + 2 * Q * k / 120
        R = fence_r(t)
        verts += [P(R * math.cos(t), R * math.sin(t), 0), P(R * math.cos(t), R * math.sin(t), wall_h(t))]
        if k:
            i = len(verts) - 4
            faces.append([i, i + 2, i + 3, i + 1])
    mesh_obj('Outfield_Wall', 'Fences', verts, faces, M['wall'])
    for th in (Q, -Q):
        R = fence_r(th) + 0.3
        bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=30, location=P(R * math.cos(th), R * math.sin(th), 15))
        o = bpy.context.active_object
        o.name = 'Foul_Pole_' + ('1B' if th > 0 else '3B')
        o.data.materials.append(M['yellow'])
        for c in o.users_collection:
            c.objects.unlink(o)
        bpy.data.collections['Fences'].objects.link(o)
        wing = Boxes()
        side = 1 if th > 0 else -1
        tdir = (math.cos(th - side * math.pi / 2), math.sin(th - side * math.pi / 2))
        bx, by = R * math.cos(th) + tdir[0] * 0.45, R * math.sin(th) + tdir[1] * 0.45
        wing.add(P(bx, by, 3.0), P(bx, by, 28.0), (0.02, 0.6), up=Vector((tdir[0], -tdir[1], 0)))
        wing.build('Foul_Pole_Screen_' + ('1B' if th > 0 else '3B'), 'Fences', M['net'])

    # Lower_Seating · Upper_Seating — 앞 선을 따라 층 단면을 쓸기
    path = full_front()
    ATLAS[0] = seat_atlas()
    for i, d in enumerate(DECKS):
        sub = [p for p in path if p[3] <= d['reach']]
        coll = 'Lower_Seating' if d['key'] in ('field', 'loge') else 'Upper_Seating'
        sweep_closed('Deck_' + d['key'], coll, sub, lambda r, i=i: section(i, r), lambda r, k=d['key']: shift_of(k, r), M[d['key'] + '_deck'])
        rows_n = len(rows_of(d))
        mat_rows = seat_row_material(d['key'], tuple(M[d['key']].diffuse_color)[:3], ATLAS[0])
        seat_rows('SeatRows_' + d['key'], coll, sub, d, lambda r, k=d['key']: shift_of(k, r), mat_rows)
        seats_est = sum(
            math.hypot(b2[0] - b1[0], b2[1] - b1[1]) for b1, b2 in zip(sub, sub[1:])
        ) * rows_n / 0.5 * (1 - 1.1 / AISLE)
        SEAT_COUNT[d['key']] = int(seats_est)

    # Stadium_Architecture — 톱 덱 지붕(앞이 조금 낮은 얇은 판)
    roof_path_len = [0.0]
    for (a0, b0, *_), (a1, b1, *_) in zip(path, path[1:]):
        roof_path_len.append(roof_path_len[-1] + math.hypot(a1 - a0, b1 - b0))
    lut = {id(q): L for q, L in zip(path, roof_path_len)}

    def roof_sec_at(q):
        # 사진: 지붕 앞 가장자리가 물결(가리비) 모양 — 앞 선 길이 7m 마다 한 번 내려온다
        L = lut.get(id(q), 0.0)
        dip = 0.9 * abs(math.sin(math.pi * L / 7.0))
        zf = ROOF['z_front'] - dip
        return [(ROOF['w0'], zf - ROOF['t']), (ROOF['w0'], zf), (ROOF['w1'], ROOF['z_back']), (ROOF['w1'], ROOF['z_back'] - ROOF['t'])]

    sweep_closed('Roof', 'Stadium_Architecture', path, None, lambda r: shift_of('top', r), M['roof'], sec_q=roof_sec_at)
    # 지붕 밑 조명 띠(밤에 따뜻하게 빛남 — 사진) · 지붕 위 깃발(색만, 그림 없음)
    glow = Boxes()
    flags = Boxes()
    flagcloth = Boxes()
    acc = 0.0
    prevq = None
    for q, L in zip(path, roof_path_len):
        a, b, g, r = q
        w = ROOF['w0'] + 0.8 - shift_of('top', r)
        z = ROOF['z_front'] - 0.9 * abs(math.sin(math.pi * L / 7.0)) - ROOF['t'] - 0.05
        pt = P(a + math.cos(g) * w, b + math.sin(g) * w, z)
        if prevq is not None:
            glow.add(prevq, pt, (0.6, 0.12))
        prevq = pt
        if L - acc >= 14.0:
            acc = L
            wb = ROOF['w1'] - 1.0 - shift_of('top', r)
            base = P(a + math.cos(g) * wb, b + math.sin(g) * wb, ROOF['z_back'])
            flags.add(base, base + Vector((0, 0, 5.0)), 0.07)
            tx, ty = -math.sin(g), math.cos(g)
            c0 = base + Vector((0, 0, 4.3))
            flagcloth.add(c0, c0 + Vector((tx * 1.6, -ty * 1.6, 0)), (0.03, 1.0))
    glow.build('Roof_Under_Lights', 'Lighting_Structures', M['roof_glow'])
    flags.build('Roof_Flag_Poles', 'Details', M['steel'])
    flagcloth.build('Roof_Flags', 'Details', M['flag'])
    details(M, path)

    # 외야석 — OSM 건물 부분 그대로(계단 = 좌석 경사, 철골 8~12m, 흰 지그재그 지붕 12~13m)
    def bearing_ab(deg):
        x, y = math.sin(math.radians(deg)), math.cos(math.radians(deg))
        return (x * math.cos(AXIS) + y * math.sin(AXIS), x * math.cos(AXIS - math.pi / 2) + y * math.sin(AXIS - math.pi / 2))

    def skillion(poly, zlow, zhigh, deg):
        da, db = bearing_ab(deg)
        pr = [a * da + b * db for a, b in poly]
        lo, hi = min(pr), max(pr)
        return lambda a, b: zhigh - (zhigh - zlow) * ((a * da + b * db) - lo) / max(1e-6, hi - lo)

    for k, e in enumerate(DATA['pavilion_parts']):
        t = e['tags']
        poly = [tuple(p) for p in e['pts']]
        if poly[0] == poly[-1]:
            poly = poly[:-1]
        if sum((poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]) for i in range(len(poly))) < 0:
            poly = poly[::-1]
        h = float(t['height'])
        mh = float(t.get('min_height', 0))
        if t.get('building:part') == 'steps':
            top_f = skillion(poly, h - float(t['roof:height']), h, float(t['roof:direction']))
            prism(f'Pavilion_Seating_{k}', 'Stadium_Architecture', poly, 0.0, top_f, M['concrete'])
            # 벤치 줄 — 경사 방향에 수직인 선으로 다각형을 잘라 줄마다 판 하나(앉는 판 + 등판)
            da, db = bearing_ab(float(t['roof:direction']))
            ta_, tb_ = -db, da
            prj = [a * da + b * db for a, b in poly]
            benches = Boxes()
            dist = min(prj) + 0.5
            while dist < max(prj) - 0.3:
                hits = []
                for i in range(len(poly)):
                    (a0, b0), (a1, b1) = poly[i], poly[(i + 1) % len(poly)]
                    p0, p1 = a0 * da + b0 * db, a1 * da + b1 * db
                    if (p0 - dist) * (p1 - dist) < 0:
                        u = (dist - p0) / (p1 - p0)
                        hits.append((a0 + (a1 - a0) * u, b0 + (b1 - b0) * u))
                if len(hits) >= 2:
                    hits.sort(key=lambda q: q[0] * ta_ + q[1] * tb_)
                    (a0, b0), (a1, b1) = hits[0], hits[-1]
                    inset = 0.4
                    L = math.hypot(a1 - a0, b1 - b0)
                    if L > 2 * inset:
                        ux_, uy_ = (a1 - a0) / L, (b1 - b0) / L
                        a0, b0, a1, b1 = a0 + ux_ * inset, b0 + uy_ * inset, a1 - ux_ * inset, b1 - uy_ * inset
                        z = top_f(a0, b0)
                        benches.add(P(a0, b0, z + 0.43), P(a1, b1, z + 0.43), (0.42, 0.06))
                        bo = 0.2
                        benches.add(P(a0 - da * bo, b0 - db * bo, z + 0.68), P(a1 - da * bo, b1 - db * bo, z + 0.68), (0.05, 0.4))
                dist += 0.85
            benches.build(f'Pavilion_Benches_{k}', 'Stadium_Architecture', M['bench'])
        elif t.get('roof:shape') == 'skillion':
            top = skillion(poly, h - float(t['roof:height']), h, float(t['roof:direction']))
            prism(f'Pavilion_Roof_{k}', 'Stadium_Architecture', poly, mh, top, M['pav_roof'])
        elif mh > 0:
            prism(f'Pavilion_Frame_{k}', 'Stadium_Architecture', poly, mh, h, M['metal'])
        else:
            prism(f'Pavilion_Base_{k}', 'Stadium_Architecture', poly, 0.0, h, M['concrete'])

    # 육각 전광판(77.69 × 38/24ft) · 밑 LED 띠(69 × 6ft) — 외야석 뒤 가운데(자리는 EST)
    for side in (1, -1):
        pts = [tuple(p) for e in DATA['pavilion_parts'] if e['tags'].get('building:part') == 'steps' for p in e['pts'] if p[1] * side > 0]
        ca = sum(p[0] for p in pts) / len(pts)
        cb = sum(p[1] for p in pts) / len(pts)
        far = max(pts, key=lambda p: math.hypot(*p))
        ang = math.atan2(cb, ca)
        R = math.hypot(*far) + 2.0
        cx, cy = R * math.cos(ang), R * math.sin(ang)
        w, hc, he = 23.68, 11.58, 7.32
        z0 = 14.5  # 사진: 외야석 지붕(12~13m) 바로 위
        prof = [(-w / 2, z0 + (hc - he) / 2), (-w / 2, z0 + (hc + he) / 2), (-w / 2 + 3.2, z0 + hc), (w / 2 - 3.2, z0 + hc), (w / 2, z0 + (hc + he) / 2), (w / 2, z0 + (hc - he) / 2), (w / 2 - 3.2, z0), (-w / 2 + 3.2, z0)]
        ux, uy = -math.sin(ang), math.cos(ang)  # 판 가로 방향(홈을 보는 판)
        nx, ny = math.cos(ang), math.sin(ang)
        verts = [P(cx + ux * x + nx * dd, cy + uy * x + ny * dd, z) for dd in (0.0, 1.5) for x, z in prof]
        n = len(prof)
        faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        mesh_obj(f'Hex_Board_{"1B" if side > 0 else "3B"}', 'Details', verts, faces, M['roof'])
        # 화면 — 테두리 안 0.93 배, 앞으로 5cm, uv 0~1(앱이 점수판 그림을 붙인다)
        cz = z0 + hc / 2
        sp = [(x * 0.93, cz + (z - cz) * 0.9) for x, z in prof]
        sv = [P(cx + ux * x - nx * 0.05, cy + uy * x - ny * 0.05, z) for x, z in sp]
        so = mesh_obj(f'Hex_Screen_{"1B" if side > 0 else "3B"}', 'Details', sv, [list(range(len(sp)))], M['screen'])
        uvl = so.data.uv_layers.new(name='UVMap')
        xs = [x for x, _ in sp]
        zs = [z for _, z in sp]
        for li, loop in enumerate(so.data.loops):
            x, z = sp[loop.vertex_index]
            uvl.data[li].uv = ((x - min(xs)) / (max(xs) - min(xs)) if side > 0 else 1 - (x - min(xs)) / (max(xs) - min(xs)), (z - min(zs)) / (max(zs) - min(zs)))
        fix_normals(so)
        strip = [(-10.5, z0 - 3.0), (10.5, z0 - 3.0), (10.5, z0 - 1.17), (-10.5, z0 - 1.17)]
        verts = [P(cx + ux * x + nx * dd, cy + uy * x + ny * dd, z) for dd in (0.0, 1.0) for x, z in strip]
        mesh_obj(f'Ribbon_Board_{"1B" if side > 0 else "3B"}', 'Details', verts, [[0, 1, 2, 3][::-1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], M['led'])
        for x in (-6.5, 6.5):
            bx, by = cx + ux * x + nx * 0.7, cy + uy * x + ny * 0.7
            prism(f'Hex_Leg_{side}_{x}', 'Details', [(bx - 0.6, by - 0.6), (bx + 0.6, by - 0.6), (bx + 0.6, by + 0.6), (bx - 0.6, by + 0.6)], 0.0, z0, M['roof'])
        # 조명탑(EST) — 외야석 뒤 폴 쪽, 기둥 넷 + 등판
        ta = ang
        tr = R + 5
        tx, ty = tr * math.cos(ta), tr * math.sin(ta)
        tux, tuy = -math.sin(ta), math.cos(ta)
        truss = Boxes()
        xs4 = (-8, -4, 0, 4, 8)
        for x in xs4:
            px, py = tx + tux * x, ty + tuy * x
            prism(f'Light_Pole_{side}_{x}', 'Lighting_Structures', circ((px, py), 0.35, 10), 0.0, 52.0, M['metal'])
        for h0 in range(30, 50, 6):
            for x0, x1 in zip(xs4, xs4[1:]):
                q0 = P(tx + tux * x0, ty + tuy * x0, h0)
                q1 = P(tx + tux * x1, ty + tuy * x1, h0)
                q2 = P(tx + tux * x1, ty + tuy * x1, h0 + 8)
                truss.add(q0, q1, 0.18)
        truss.build(f'Light_Truss_{side}', 'Lighting_Structures', M['metal'])
        bank = [(tx + tux * x + math.cos(ta) * dd, ty + tuy * x + math.sin(ta) * dd) for x, dd in ((-13, 0), (13, 0), (13, 0.8), (-13, 0.8))]
        prism(f'Light_Bank_{side}', 'Lighting_Structures', bank, 50.0, 56.0, M['lamp'])

    # 지붕 위 조명(EST) — 지붕 앞 가장자리에 7.5m 마다
    roof_lamps = []
    acc = 0.0
    for (a0, b0, ang0, r0), (a1, b1, ang1, r1) in zip(path, path[1:]):
        acc += math.hypot(a1 - a0, b1 - b0)
        if acc >= 7.5:
            acc = 0.0
            w = ROOF['w0'] - shift_of('top', r1) + 0.6
            roof_lamps.append((a1 + math.cos(ang1) * w, b1 + math.sin(ang1) * w))
    for k, (la, lb) in enumerate(roof_lamps):
        prism(f'Roof_Lamp_{k}', 'Lighting_Structures', circ((la, lb), 1.0, 6), ROOF['z_front'], ROOF['z_front'] + 1.8, M['dark'])

    # Dugouts — 파울선 14~38m, 앞 벽 아래 어두운 입구 · 지붕(EST: 길이 · 깊이)
    for side in (1, -1):
        d = (math.cos(Q), side * math.sin(Q))
        n = (-math.sin(Q), side * math.cos(Q))
        r0, r1, off = 14.0, 38.0, BACKSTOP - 0.1
        quad = [(r0 * d[0] + (off - 2.6) * n[0], r0 * d[1] + (off - 2.6) * n[1]), (r1 * d[0] + (off - 2.6) * n[0], r1 * d[1] + (off - 2.6) * n[1]), (r1 * d[0] + off * n[0], r1 * d[1] + off * n[1]), (r0 * d[0] + off * n[0], r0 * d[1] + off * n[1])]
        if side < 0:
            quad = quad[::-1]
        prism(f'Dugout_Roof_{side}', 'Dugouts', quad, 1.05, 1.3, M['concrete'])
        prism(f'Dugout_Pit_{side}', 'Dugouts', quad, -1.2, 0.0, M['dark'])

    # Details — 타자 눈(가운데, 120 × 30ft — 옛 자료 EST)
    be = [(fence_r(t) + 6) for t in (0,)]
    # 가운데 — 펜스 뒤 짙은 풀 비탈(타자 눈, 사진: 어두운 초록 조경) — 펜스 1m 뒤 2.4m 에서 13m 뒤 7m 까지
    hedge = mat('hedge', srgb('#22392a'), 0.95)
    eye = []
    for k in range(25):
        t = math.radians(-14 + 28 * k / 24)
        eye.append((fence_r(t) + 1.0, t))
    poly = [(r * math.cos(t), r * math.sin(t)) for r, t in eye] + [((r + 12) * math.cos(t), (r + 12) * math.sin(t)) for r, t in eye[::-1]]
    r_mid = fence_r(0) + 1.0
    prism('Batters_Eye', 'Details', poly, 0.0, lambda a, b: 2.4 + 4.6 * min(1.0, max(0.0, (math.hypot(a, b) - r_mid) / 12)), hedge)
    # 가운데 뒤 검은 구조물(사진: 외야석 사이 짙은 건물 + 가는 탑 둘)
    cb = fence_r(0) + 15
    prism('CF_Structure', 'Stadium_Architecture', [(cb, -8), (cb + 8, -8), (cb + 8, 8), (cb, 8)], 0.0, 13.0, M['dark'])
    for bb in (-11.0, 11.0):
        prism(f'CF_Tower_{int(bb)}', 'Stadium_Architecture', [(cb + 2, bb - 1), (cb + 4, bb - 1), (cb + 4, bb + 1), (cb + 2, bb + 1)], 0.0, 21.0, M['dark'])

    # Reference — OSM 윤곽(빨강 · 관중석 49.4m, 파랑 · 외야석) — 높이 60m 띠로(위에서 겹쳐 보기, 내보내지 않음)
    def ribbon(name, pts, material, z=60.0, wd=0.35):
        verts, faces = [], []
        for (a0, b0), (a1, b1) in zip(pts, pts[1:]):
            L = math.hypot(a1 - a0, b1 - b0) or 1
            na, nb = -(b1 - b0) / L * wd, (a1 - a0) / L * wd
            i = len(verts)
            verts += [P(a0 - na, b0 - nb, z), P(a0 + na, b0 + nb, z), P(a1 + na, b1 + nb, z), P(a1 - na, b1 - nb, z)]
            faces.append([i, i + 1, i + 2, i + 3])
        mesh_obj(name, 'Reference', verts, faces, material)

    for k, e in enumerate(DATA['grandstand']):
        ribbon(f'OSM_Grandstand_{k}', [tuple(p) for p in e['pts']], M['ref'])
    for k, e in enumerate(DATA['pavilion_parts']):
        ribbon(f'OSM_Pavilion_{k}', [tuple(p) for p in e['pts']], M['ref2'], z=61.0, wd=0.2)


# ───────────── 검사 · 렌더 ─────────────


def report():
    print('== 치수 검사 ==')
    for deg in (0, 15, 22.5, 30, 37.6, 45):
        print(f'  펜스 {deg:>5}°  {fence_r(math.radians(deg)):6.1f} m  높이 {wall_h(math.radians(deg)):.2f} m')
    for r in (10, 30, 50, 70, 99):
        print(f'  파울 벽 reach {r:>3}  {foul_w(r):5.1f} m')
    zmax = max((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == 'MESH' and o.users_collection[0].name not in EXTRA for v in o.data.vertices)
    print(f'  가장 높은 점 {zmax:.1f} m (LA 카운티 49.4)')
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print(f'  면 {tris}  객체 {sum(1 for o in bpy.data.objects if o.type == "MESH")}')
    print(f'  의자 {SEAT_COUNT}  합 {sum(SEAT_COUNT.values())} (공식: 본 관중석 50,000)')


def look(cam, frm, to):
    cam.location = frm
    d = Vector(to) - Vector(frm)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


VIEWS = {
    # 이름: (카메라 위치, 보는 곳, 렌즈 mm) — 경기장 좌표
    'top': None,
    'r1_topdeck_home': ((-62, 0, 50), (55, 0, 0), 24),
    'r9_field_rf': ((-6, -4, 1.6), (95, 60, 14), 26),
    'r4_topdeck_lf': ((-15, -70, 48), (100, -90, 5), 24),
    'lab_back': ((27, -2, 2.2), (0, 0, 4), 35),
    'lab_side': ((17, -9, 1.7), (18, 60, 8), 35),
    'lab_catcher': ((11, 0.5, 1.5), (120, 0, 10), 35),
}


def render(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_cavity = True
    sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    sc.render.image_settings.file_format = 'PNG'
    sc.world = sc.world or bpy.data.worlds.new('World')
    cam_data = bpy.data.cameras.new('BO_Cam')
    cam = bpy.data.objects.new('BO_Cam', cam_data)
    bpy.data.collections['Cameras'].objects.link(cam)
    sc.camera = cam
    ref = bpy.data.collections['Reference']
    for name, v in VIEWS.items():
        ref.hide_render = name != 'top'
        if v is None:
            cam_data.type = 'ORTHO'
            cam_data.ortho_scale = 330
            cam.location = P(35, 0, 300)
            cam.rotation_euler = (0, 0, math.radians(-90))
        else:
            cam_data.type = 'PERSP'
            (fa, fb, fz), (ta, tb, tz), lens = v
            cam_data.lens = lens
            cam_data.clip_end = 2000
            look(cam, P(fa, fb, fz), P(ta, tb, tz))
        sc.render.filepath = os.path.join(out_dir, f'{name}.png')
        bpy.ops.render.render(write_still=True)
        print('렌더', name)


def bake_ao(samples=96):
    """구석 어둠(AO) — 구조물은 Cycles 로 꼭짓점 색(COLOR_0)에 굽고, 의자는 의자마다 하늘 반구로 광선을 쏴 가려진 만큼 어둡게(SEAT_AO)"""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    bpy.data.collections['Reference'].hide_render = True
    for c in ('Field', 'Infield', 'Outfield'):
        bpy.data.collections[c].hide_render = False
    targets = [o for name in EXPORT for o in bpy.data.collections[name].all_objects if o.type == 'MESH' and not o.hide_render and not o.name.startswith('Seats_')]
    for o in targets:
        if 'AO' not in o.data.color_attributes:
            o.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        o.data.color_attributes.active_color = o.data.color_attributes['AO']
    bpy.ops.object.select_all(action='DESELECT')
    for o in targets:
        o.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    # 굽기 잡음이 길고 가는 면에서 물결무늬로 보인다 — 이웃 꼭짓점과 4번 섞어 고르게
    for o in targets:
        ca = o.data.color_attributes['AO']
        n = len(o.data.vertices)
        val = [0.0] * n
        buf = [0.0] * (n * 4)
        ca.data.foreach_get('color', buf)
        val = buf[0::4]
        nb = [[] for _ in range(n)]
        for e in o.data.edges:
            a, b = e.vertices
            nb[a].append(b)
            nb[b].append(a)
        for _ in range(4):
            val = [0.5 * val[i] + 0.5 * (sum(val[j] for j in nb[i]) / len(nb[i]) if nb[i] else val[i]) for i in range(n)]
        out = []
        for v in val:
            out += [v, v, v, 1.0]
        ca.data.foreach_set('color', out)
    print('AO 구움(구조물)', len(targets))
    # 의자 — 막을 것: 층 · 지붕 · 외야석(평가된 메시, 세계 좌표)
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in targets:
        me = o.evaluated_get(dg).to_mesh()
        off = len(verts)
        verts += [o.matrix_world @ v.co for v in me.vertices]
        polys += [[off + i for i in p.vertices] for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, polys)
    rnd = random.Random(7)
    dirs = []
    for k in range(24):
        u, v = (k + 0.5) / 24, rnd.random()
        r = math.sqrt(u)
        dirs.append(Vector((r * math.cos(2 * math.pi * v), r * math.sin(2 * math.pi * v), math.sqrt(1 - u))))
    for key, pts in SEAT_PTS.items():
        out = []
        for x, y, z, _ in pts:
            o = Vector((x, y, z + 0.7))
            open_ = sum(1 for d in dirs if bvh.ray_cast(o, d, 80.0)[0] is None)
            out.append(0.25 + 0.75 * open_ / len(dirs))
        SEAT_AO[key] = out
        print('AO 의자', key, round(sum(out) / len(out), 3))


# 해 — 앱(stage.ts)과 같은 방향: 무대 세계 (0.55, 0, 0.42) 수평 · 높이 49°. 경기장 좌표로 a = −0.55, b = −0.42 → Blender (a, −b)
SUN_EL = math.radians(49)
_h = Vector((-0.55, 0.42, 0)).normalized()
SUN_DIR = Vector((_h.x * math.cos(SUN_EL), _h.y * math.cos(SUN_EL), math.sin(SUN_EL))).normalized()
SUN_W = 3.0  # 해 세기(W/m², Cycles)
SKY_W = 0.9  # 하늘 세기(배경 세기 — 아래에서 하늘빛 몫을 잰다)


def bake_light(samples=int(os.environ.get('BAKE_SAMPLES', 256))):
    """낮 빛 굽기 — 해(그림자) + 물리 하늘(니시타) + 반사광을 구조물 꼭짓점 색 LIGHT 에(빛만, 색 없이). 의자는 의자마다 해 가림 + 하늘 열림.
    앱은 이 빛에 재질 색을 곱해 그린다(실시간 조명 대신 — 휴대폰에서 싸고 그림자 · 반사광이 들어간다)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    w = sc.world or bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_disc = False
    sky.sun_elevation = SUN_EL
    sky.sun_rotation = math.atan2(SUN_DIR.x, SUN_DIR.y)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = SKY_W * 0.1
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    ld = bpy.data.lights.new('BakeSun', 'SUN')
    ld.energy = SUN_W
    ld.angle = math.radians(0.8)
    sun = bpy.data.objects.new('BakeSun', ld)
    bpy.data.collections['Cameras'].objects.link(sun)
    sun.rotation_euler = (-SUN_DIR).to_track_quat('-Z', 'Y').to_euler()
    bpy.data.collections['Reference'].hide_render = True
    for c in ('Field', 'Infield', 'Outfield'):
        bpy.data.collections[c].hide_render = False
    targets = [o for name in EXPORT for o in bpy.data.collections[name].all_objects if o.type == 'MESH' and not o.hide_render and not o.name.startswith('Seats_')]
    for o in targets:
        if 'LIGHT' not in o.data.color_attributes:
            o.data.color_attributes.new('LIGHT', 'FLOAT_COLOR', 'POINT')
        o.data.color_attributes.active_color = o.data.color_attributes['LIGHT']
    # 광선으로 직접 셈(Cycles 굽기는 그늘에서 얼룩 잡음이 컸다) — 점마다 같은 방향 묶음이라 잡음이 없다
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in targets:
        me = o.evaluated_get(dg).to_mesh()
        off = len(verts)
        verts += [o.matrix_world @ v.co for v in me.vertices]
        polys += [[off + i for i in p.vertices] for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, polys)
    sky_dirs = []
    golden = math.pi * (3 - math.sqrt(5))
    NS = 40
    for k in range(NS):
        u = (k + 0.5) / NS
        r = math.sqrt(u)
        sky_dirs.append(Vector((r * math.cos(k * golden), r * math.sin(k * golden), math.sqrt(1 - u))))
    zsum = sum(d.z for d in sky_dirs)
    flat = SUN_W * math.sin(SUN_EL) + SKY_W
    done = 0
    for o in targets:
        me = o.data
        R3 = o.matrix_world.to_3x3()
        n = len(me.vertices)
        vals = []
        for v in me.vertices:
            p = o.matrix_world @ v.co
            nr = (R3 @ v.normal).normalized()
            org = p + nr * 0.06 + Vector((0, 0, 0.02))
            sky = 0.0
            for d in sky_dirs:
                c = nr.dot(d)
                if c > 0 and bvh.ray_cast(org, d, 150.0)[0] is None:
                    sky += c
            sky /= zsum
            sunv = max(0.0, nr.dot(SUN_DIR))
            if sunv > 0 and bvh.ray_cast(org, SUN_DIR, 250.0)[0] is not None:
                sunv = 0.0
            bounce = 0.32 * max(0.0, -nr.z) + 0.1 * (1 - abs(nr.z))
            L = (SUN_W * sunv + SKY_W * (sky + bounce)) / flat
            vals.append([L, L, L])
        done += n
        nb = [[] for _ in range(n)]
        for e in me.edges:
            a, b = e.vertices
            nb[a].append(b)
            nb[b].append(a)
        for _ in range(2):
            vals = [[0.6 * vals[i][c] + 0.4 * (sum(vals[j][c] for j in nb[i]) / len(nb[i]) if nb[i] else vals[i][c]) for c in range(3)] for i in range(n)]
        ca = me.color_attributes['LIGHT']
        outb = []
        for v in vals:
            outb += [min(1.5, v[0]), min(1.5, v[1]), min(1.5, v[2]), 1.0]
        ca.data.foreach_set('color', outb)
        if 'AO' in me.color_attributes:
            me.color_attributes.remove(me.color_attributes['AO'])
    print('빛 점', done)
    print('빛 구움(구조물)', len(targets))
    # 의자 — 해: 의자 앞(등받이 · 앉는 판 평균 법선)과 해의 각 × 해 가림, 하늘: 반구 열림(SEAT_AO)
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in targets:
        me = o.evaluated_get(dg).to_mesh()
        off = len(verts)
        verts += [o.matrix_world @ v.co for v in me.vertices]
        polys += [[off + i for i in p.vertices] for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, polys)
    flat = SUN_W * math.sin(SUN_EL) + SKY_W
    for key, pts in SEAT_PTS.items():
        out = []
        for (x, y, z, yaw), ao in zip(pts, SEAT_AO[key]):
            nrm = Vector((0.75 * math.cos(yaw), 0.75 * math.sin(yaw), 0.66)).normalized()
            o = Vector((x, y, z + 0.75))
            lit = 0.0 if bvh.ray_cast(o, SUN_DIR, 200.0)[0] is not None else 1.0
            sunv = max(0.0, nrm.dot(SUN_DIR)) * lit * SUN_W
            out.append(min(1.4, (sunv + SKY_W * ao + 0.25 * ao) / flat))
        SEAT_AO[key] = out
        print('빛 의자', key, round(sum(out) / len(out), 3))


def add_seat_colors(path):
    """내보낸 GLB 의 의자 인스턴싱에 _COLOR_0(의자마다 밝기)을 붙인다 — three 의 GLTFLoader 가 instanceColor 로 읽는다.
    내보내기는 점 차례를 지키지 않을 수 있어 자리(TRANSLATION)로 짝을 짓는다."""
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    J = json.loads(b[20 : 20 + jl])
    bl = struct.unpack_from('<I', b, 20 + jl)[0]
    binary = bytearray(b[28 + jl : 28 + jl + bl])
    for n in J['nodes']:
        e = n.get('extensions', {}).get('EXT_mesh_gpu_instancing')
        if not e or not n.get('name', '').startswith('Seats_'):
            continue
        key = n['name'][len('Seats_') :]
        acc = J['accessors'][e['attributes']['TRANSLATION']]
        bv = J['bufferViews'][acc['bufferView']]
        off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        cnt = acc['count']
        lut = {}
        for (x, y, z, _), ao in zip(SEAT_PTS[key], SEAT_AO[key]):
            lut[(round(x, 2), round(z, 2), round(-y, 2))] = ao
        cols = bytearray()
        miss = 0
        for i in range(cnt):
            tx, ty, tz = struct.unpack_from('<fff', binary, off + i * 12)
            ao = lut.get((round(tx, 2), round(ty - 0.0, 2), round(tz, 2)))
            if ao is None:
                miss += 1
                ao = 0.8
            cols += struct.pack('<fff', ao, ao, ao)
        while len(binary) % 4:
            binary.append(0)
        J['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(cols)})
        binary += cols
        J['accessors'].append({'bufferView': len(J['bufferViews']) - 1, 'componentType': 5126, 'count': cnt, 'type': 'VEC3'})
        e['attributes']['_COLOR_0'] = len(J['accessors']) - 1
        print('의자 밝기', key, cnt, '짝 못 찾음', miss)
    J['buffers'][0]['byteLength'] = len(binary)
    js = json.dumps(J, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binary), 0x004E4942) + binary
    open(path, 'wb').write(out)


EXPORT = ['Fences', 'Lower_Seating', 'Upper_Seating', 'Stadium_Architecture', 'Dugouts', 'Lighting_Structures', 'Details']


def export_glb(path):
    """구장 건물만 GLB 로(바닥 · 내야 · 외야 · 참고선 · 카메라는 빼고 — 바닥은 앱의 stage.ts 가 그린다). 의자는 GPU 인스턴싱"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for name in EXPORT:
        for o in bpy.data.collections[name].all_objects:
            if o.type == 'MESH' and not o.hide_render:
                o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_gpu_instances=True,
        export_gn_mesh=True,
        export_yup=True,
        export_normals=True,
        export_materials='EXPORT',
        export_vertex_color='ACTIVE',
        export_extras=True,
    )
    if SEAT_AO:
        add_seat_colors(path)
    print('GLB', path, os.path.getsize(path))


if __name__ == '__main__':
    build()
    report()
    blend = arg('--blend')
    if blend:
        os.makedirs(os.path.dirname(os.path.abspath(blend)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
    out = arg('--renders')
    if out:
        render(os.path.abspath(out))
    if '--ao' in ARGV:
        bake_ao()
        if '--light' in ARGV:
            bake_light()
    glb = arg('--glb')
    if glb:
        export_glb(os.path.abspath(glb))
