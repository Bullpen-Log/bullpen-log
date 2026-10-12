"""투구 하나 → 3D 스티커 궤적 + 이름(규칙) + 3D 관절(RTMW 교차, 이름 붙이기용).

이름: L/R + 번호(안내서) — 1 귀 · 2 어깨 · 3 팔꿈치 밖 · 4 팔꿈치 안 · 5 손목 엄지 쪽 · 6 손목 새끼 쪽 · 7 손등(R) · 8 큰돌기 ·
      9 무릎 밖 · 10 무릎 안 · 11 발목 밖 · 12 발목 안 · 13 뒤꿈치 · 14 발끝 · ASIS · PSIS.
  py work/recon.py 보정.json 1 출력.npz
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tracks import build, load_kp_full, at
from match import track_edges, points, CAMS
from kpba import tri

KP = {"ear": (3, 4), "sho": (5, 6), "elb": (7, 8), "wri": (9, 10), "hip": (11, 12), "kne": (13, 14), "ank": (15, 16),
      "toe": (17, 20), "heel": (19, 22), "thumb": (92, 113), "pinky": (108, 129), "mid": (100, 121)}


def kp3d(p, cams, off, tq, thr=0.5):
    """관절 3D (τ, 이름, 쪽) — 두 카메라 이상 확신 thr 이상일 때."""
    raw = {c: load_kp_full(p, c) for c in CAMS}
    out = {}
    for name, (jl, jr) in KP.items():
        for side, j in (("L", jl), ("R", jr)):
            S = {}
            for c in CAMS:
                t, kp, sc = raw[c]
                tt = tq + off[c]
                i = np.clip(np.searchsorted(t, tt) - 1, 0, len(t) - 2)
                w = np.clip((tt - t[i]) / np.maximum(t[i + 1] - t[i], 1e-9), 0, 1)[:, None]
                xy = kp[i, j] * (1 - w) + kp[i + 1, j] * w
                ok = (sc[i, j] > thr) & (sc[i + 1, j] > thr) & (tt >= t[0]) & (tt <= t[-1])
                S[c] = (xy, ok)
            X = np.full((len(tq), 3), np.nan)
            for k in range(len(tq)):
                vis = [(c, S[c][0][k]) for c in CAMS if S[c][1][k]]
                if len(vis) >= 2:
                    X[k] = tri(cams, vis)
            out[(name, side)] = X
    return out


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def label_scores(g, side, X, K, k):
    """한 시각 k 에서 3D 점 X(무리 g, 쪽 side)에 대한 이름별 점수(클수록 그 이름). 판단 못 하면 {}."""
    s = 1 if side == "R" else -1
    J = lambda n: K[(n, side)][k]
    if g == "head":
        return {"1": 1.0}
    if g == "shoulder":
        return {"2": 1.0}
    if g == "elbow":
        u, v = J("elb") - J("sho"), J("wri") - J("elb")
        n = np.cross(u, v)
        if np.isnan(n).any() or np.linalg.norm(n) < 0.3 * np.linalg.norm(u) * np.linalg.norm(v):
            return {}
        lat = s * unit(n)  # 오른팔 바깥 = +n, 왼팔 = -n
        d = float((X - J("elb")) @ lat)
        return {"3": d, "4": -d}
    if g == "wrist":
        w, th, pk, md = J("wri"), J("thumb"), J("pinky"), J("mid")
        if np.isnan([w, th, pk, md]).any():
            return {}
        rad = unit(th - pk)
        out = {"5": float((X - w) @ rad), "6": float(-(X - w) @ rad)}
        if side == "R":
            out["7"] = float((X - w) @ unit(md - w)) - 0.5 * abs(out["5"])
        return out
    if g == "hip":
        hl, hr, sl, sr = K[("hip", "L")][k], K[("hip", "R")][k], K[("sho", "L")][k], K[("sho", "R")][k]
        if np.isnan([hl, hr, sl, sr]).any():
            return {}
        right = unit(hr - hl); up = unit((sl + sr) / 2 - (hl + hr) / 2)
        fwd = unit(np.cross(up, right))
        c = (hl + hr) / 2
        d = X - c
        return {"ASIS": float(d @ fwd + 0.5 * d @ up), "PSIS": float(-d @ fwd + 0.5 * d @ up), "8": float(-d @ up + 0.3 * s * d @ right)}
    if g == "knee":
        u, v = J("kne") - J("hip"), J("ank") - J("kne")
        n = np.cross(u, v)
        if np.isnan(n).any() or np.linalg.norm(n) < 0.25 * np.linalg.norm(u) * np.linalg.norm(v):
            hl, hr = K[("hip", "L")][k], K[("hip", "R")][k]
            if np.isnan([hl, hr]).any():
                return {}
            lat = s * unit(hr - hl)
        else:
            lat = -s * unit(n)  # 오른다리 바깥 = -n
        d = float((X - J("kne")) @ lat)
        return {"9": d, "10": -d}
    if g == "foot":
        a, h, t = J("ank"), J("heel"), J("toe")
        if np.isnan([a, h, t]).any():
            return {}
        fwd = unit(t - h)
        up = unit(a - (h + t) / 2)
        up = unit(up - (up @ fwd) * fwd)
        lat = s * unit(np.cross(fwd, up))  # 오른발 바깥 = fwd × up
        d = X - a
        along, hgt, side_ = float(d @ fwd), float(d @ up), float(d @ lat)
        L = float(np.linalg.norm(t - h))
        return {"13": -along / L - 0.5 * abs(side_) / L, "14": along / L - 0.5 * abs(side_) / L,
                "11": side_ / L - 0.5 * abs(along) / L, "12": -side_ / L - 0.5 * abs(along) / L}
    return {}


def run(p, cal, step=1 / 240, tol=2.0):
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}
    off = cal["offsets"][str(p)]
    trs = {c: build(p, c) for c in CAMS}
    info = {(c, t["id"]): (t["color"], t["group"]) for c in CAMS for t in trs[c]}
    E = track_edges(trs, cams, off, tol=tol)
    tq = np.arange(-0.3, 4.3, step)
    P = points(trs, cams, off, E, tq, tol=tol)
    # 3D 궤적: 같은 2D 궤적을 쓰는 점끼리
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for n, q in enumerate(P):
        for c, (tid, u, v) in q["obs"].items():
            ra, rb = find(("pt", n)), find((c, tid))
            if ra != rb:
                parent[ra] = rb
    K = kp3d(p, cams, off, tq)
    trk = {}
    for n, q in enumerate(P):
        trk.setdefault(find(("pt", n)), []).append(n)
    labels = {}
    votes_all = {}
    for r, ns in trk.items():
        c0, tid0 = next(iter(P[ns[0]]["obs"].items()))[0], next(iter(P[ns[0]]["obs"].values()))[0]
        color, g = info[(c0, tid0)]
        side = "L" if color == "yellow" else "R"
        votes = {}
        for n in ns:
            sc = label_scores(g, side, P[n]["X"], K, P[n]["i"])
            if sc:
                best = max(sc, key=sc.get)
                votes[best] = votes.get(best, 0) + 1
        if votes:
            lab = max(votes, key=votes.get)
            labels[r] = (side + lab if lab not in ("ASIS", "PSIS") else side + "_" + lab, votes[lab] / sum(votes.values()), len(ns))
            votes_all[r] = votes
    # 이름별 3D 궤적(같은 이름 궤적이 겹치면 시선 많은 쪽)
    names = sorted({v[0] for v in labels.values()})
    M = {nm: np.full((len(tq), 3), np.nan) for nm in names}
    V = {nm: np.zeros(len(tq), int) for nm in names}
    for r, ns in trk.items():
        if r not in labels:
            continue
        nm = labels[r][0]
        for n in ns:
            i, nv = P[n]["i"], len(P[n]["obs"])
            if nv > V[nm][i]:
                M[nm][i], V[nm][i] = P[n]["X"], nv
    tlab = {}
    for c in CAMS:
        for t in trs[c]:
            r = find((c, t["id"]))
            if r in labels:
                tlab[(c, t["id"])] = labels[r][0]
    run.track_labels = tlab
    return tq, M, V, K, labels, votes_all


if __name__ == "__main__":
    cal = json.load(open(sys.argv[1]))
    p = int(sys.argv[2])
    tq, M, V, K, labels, votes = run(p, cal)
    cover = {nm: int((V[nm] > 0).sum()) for nm in M}
    print("이름별 장면 수:", dict(sorted(cover.items(), key=lambda z: -z[1])))
    bad = [(v[0], round(v[1], 2), v[2]) for v in labels.values() if v[1] < 0.7 and v[2] > 30]
    print("확신 낮은 궤적(70% 밑):", bad[:20])
    np.savez_compressed(sys.argv[3], tq=tq, **{"M_" + k: v for k, v in M.items()}, **{"V_" + k: v for k, v in V.items()},
                        **{f"K_{a}_{b}": v for (a, b), v in K.items()})
