"""카메라 보정을 알 때 투구마다 시간 어긋남 — 관절 짝의 에피폴라 거리(보정에서 나온 F 고정) 가운데값이 가장 작은 o.

  py work/ksync.py 보정.json 2,3,4 출력.json
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kpcal import load_kp, sample
from match import F_of, epi
from cams import CAMS, FREE, PAIRS


def score(da, db, F, o, step=2, thr=0.6):
    tq = da["t"][::step]
    xa, oka = sample(da, tq, thr)
    xb, okb = sample(db, tq + o, thr)
    m = oka & okb
    if m.sum() < 60:
        return np.inf, 0
    return float(np.median(epi(F, xa[m], xb[m]))), int(m.sum())


def scan(da, db, F, lo, hi, dt, step):
    best = (np.inf, 0.0)
    for o in np.arange(lo, hi + 1e-9, dt):
        s, n = score(da, db, F, o, step)
        if s < best[0]:
            best = (s, o)
    return best


def sync(p, cams):
    ds = {c: load_kp(p, c) for c in CAMS}
    pr = {}
    for a, b in PAIRS:
        F = F_of(cams[a], cams[b])
        s, o = scan(ds[a], ds[b], F, -1.3, 1.3, 1 / 120, 4)
        s, o = scan(ds[a], ds[b], F, o - 1 / 120, o + 1 / 120, 1 / 960, 1)
        pr[a + b] = (o, s)
    A, y, w = [], [], []
    for ab, (o, s) in pr.items():
        row = np.zeros(len(FREE))
        if ab[1] != "1": row[FREE.index(ab[1])] += 1
        if ab[0] != "1": row[FREE.index(ab[0])] -= 1
        A.append(row); y.append(o); w.append(1 / max(s, 0.5))
    W = np.sqrt(np.array(w))[:, None]
    x = np.linalg.lstsq(np.array(A) * W, np.array(y) * W[:, 0], rcond=None)[0]
    res = np.array(A) @ x - np.array(y)
    return {"1": 0.0, **{c: float(x[i]) for i, c in enumerate(FREE)}}, pr, float(np.abs(res).max())


if __name__ == "__main__":
    cal = json.load(open(sys.argv[1]))
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}
    out = {}
    for p in [int(x) for x in sys.argv[2].split(",")]:
        o, pr, worst = sync(p, cams)
        out[str(p)] = o
        print(f"투구 {p}: " + " ".join(f"{c}:{o[c]:+.4f}" for c in FREE) + f"  닫힘 최대 {worst * 1000:.1f}ms  짝 에피 " + " ".join(f"{k}:{v[1]:.1f}" for k, v in pr.items()), flush=True)
    json.dump(out, open(sys.argv[3], "w"), indent=1)
