"""카메라끼리 스티커 궤적 짝짓기 → 장면(기준 시각)마다 3D 스티커 점.

짝: 같은 색 · 같은 무리, 겹친 시각에서 에피폴라 거리 가운데값이 tol 안 · 겹침 10장면 이상.
"""
import os, sys, json
import numpy as np, cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tracks import build, at
from kpba import proj, tri, Pmat

CAMS = "1234"


def K_of(cam):
    return np.array([[cam["f"], 0, cam["cx"]], [0, cam["f"], cam["cy"]], [0, 0, 1.0]])


def F_of(ci, cj):
    Ri, Rj = cv2.Rodrigues(np.asarray(ci["r"], float))[0], cv2.Rodrigues(np.asarray(cj["r"], float))[0]
    R = Rj @ Ri.T
    t = np.asarray(cj["t"], float) - R @ np.asarray(ci["t"], float)
    tx = np.array([[0, -t[2], t[1]], [t[2], 0, -t[0]], [-t[1], t[0], 0]])
    return np.linalg.inv(K_of(cj)).T @ tx @ R @ np.linalg.inv(K_of(ci))


def epi(F, a, b):
    """대칭 에피폴라 거리(px)."""
    ah, bh = np.c_[a, np.ones(len(a))], np.c_[b, np.ones(len(b))]
    l2 = ah @ F.T
    l1 = bh @ F
    s = np.abs(np.sum(bh * l2, 1))
    return 0.5 * (s / np.hypot(l2[:, 0], l2[:, 1]) + s / np.hypot(l1[:, 0], l1[:, 1]))


def track_edges(trs, cams, off, tol=6.0, min_overlap=10):
    """(카메라, 궤적 번호) 짝 → 가운데 에피폴라 거리. off[c] = 카메라 c 시각 - 기준 시각."""
    edges = {}
    for ia, ca in enumerate(CAMS):
        for cb in CAMS[ia + 1:]:
            F = F_of(cams[ca], cams[cb])
            for a in trs[ca]:
                tref = a["t"] - off[ca]
                for b in trs[cb]:
                    if a["color"] != b["color"] or a["group"] != b["group"]:
                        continue
                    if b["t"][0] - off[cb] > tref[-1] or b["t"][-1] - off[cb] < tref[0]:
                        continue
                    bx = at(b, tref + off[cb])
                    m = ~np.isnan(bx[:, 0])
                    if m.sum() < min_overlap:
                        continue
                    d = np.median(epi(F, a["xy"][m], bx[m]))
                    if d < tol:
                        edges[((ca, a["id"]), (cb, b["id"]))] = (float(d), int(m.sum()))
    return edges


def points(trs, cams, off, edges, tq, tol=6.0):
    """기준 시각들 tq 마다: 짝에서 시작해 다른 카메라를 붙여 3D 점. 반환 [{τ, X, obs{c: (track, u, v)}, err}]."""
    byid = {(c, t["id"]): t for c in CAMS for t in trs[c]}
    nb = {}
    for (a, b) in edges:
        nb.setdefault(a, set()).add(b); nb.setdefault(b, set()).add(a)
    # 시각마다 궤적 자리 미리
    pos = {k: at(tr, tq + off[k[0]]) for k, tr in byid.items()}
    out = []
    for i, tau in enumerate(tq):
        cands = []
        for (a, b) in edges:
            pa, pb = pos[a][i], pos[b][i]
            if np.isnan(pa[0]) or np.isnan(pb[0]):
                continue
            mem = {a[0]: (a, pa), b[0]: (b, pb)}
            for k in (nb[a] | nb[b]):
                if k[0] in mem or np.isnan(pos[k][i][0]):
                    continue
                if k[0] not in mem or True:
                    mem.setdefault(k[0], (k, pos[k][i]))
            # 모두로 교차 · 나쁜 시선 빼기
            while len(mem) >= 2:
                X = tri(cams, [(c, v[1]) for c, v in mem.items()])
                errs = {c: float(np.linalg.norm(proj(cams[c], X[None])[0] - v[1])) for c, v in mem.items()}
                worst = max(errs, key=errs.get)
                if errs[worst] <= tol or len(mem) == 2:
                    break
                del mem[worst]
            if len(mem) < 2 or max(errs.values()) > tol:
                continue
            cands.append((len(mem), -max(errs.values()), mem, X, errs))
        cands.sort(key=lambda z: (-z[0], -z[1]))
        used = set()
        for n, _, mem, X, errs in cands:
            keys = {v[0] for v in mem.values()}
            if keys & used:
                continue
            used |= keys
            out.append({"i": i, "tau": float(tau), "X": X, "obs": {c: (v[0][1], float(v[1][0]), float(v[1][1])) for c, v in mem.items()}, "err": max(errs.values())})
    return out


if __name__ == "__main__":
    p = int(sys.argv[1])
    cal = json.load(open(sys.argv[2]))
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}
    off = cal["offsets"][str(p)]
    trs = {c: build(p, c) for c in CAMS}
    E = track_edges(trs, cams, off)
    print("짝", len(E), " 카메라 쌍별", {k: sum(1 for e in E if e[0][0] + e[1][0] == k) for k in ["12", "13", "14", "23", "24", "34"]})
    print("에피폴라 가운데값 분포", np.percentile([v[0] for v in E.values()], [10, 50, 90]).round(2))
    tq = np.arange(-0.2, 4.2, 1 / 240)
    P = points(trs, cams, off, E, tq)
    nv = np.array([len(q["obs"]) for q in P])
    print("3D 점", len(P), "시선 2/3/4:", [(nv == k).sum() for k in (2, 3, 4)], " 다시 비춤 최대 가운데값", round(float(np.median([q["err"] for q in P])), 2))
