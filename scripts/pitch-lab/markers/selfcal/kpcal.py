"""2D 관절(RTMW)로 카메라 시간 맞추기 · 카메라 자리 첫 값 — 정답 3D 는 뒤에 스티커로 다시 맞춘다.

시간: 카메라 a 의 시각 τ 에 b 의 τ + o 를 이어 붙여(선형 보간) 기본 행렬(F)을 맞추고, 들어맞는 관절이 가장 많은 o.
"""
import os, sys, json
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))  # 영상 · 찾은 자료 폴더(저장소 밖) — 기본은 지금 폴더/work
# 몸 · 발 관절(COCO-WholeBody): 어깨 5 6 · 팔꿈치 7 8 · 손목 9 10 · 엉덩이 11 12 · 무릎 13 14 · 발목 15 16 · 엄지발가락 17 20 · 뒤꿈치 19 22 · 코 0 · 귀 3 4
JOINTS = [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 22]
from cams import CAMS, PAIRS


def load_kp(p, c):
    z = np.load(os.path.join(WORK, "kp", f"투구{p:02d}_c{c}.npz"))
    return {"t": z["t"], "kp": z["kp"][:, JOINTS], "sc": z["sc"][:, JOINTS], "wh": tuple(z["wh"])}


def sample(d, tq, thr=0.55, maxgap=1 / 100):
    """시각들 tq 에서 관절 자리(선형 보간) · 쓸 수 있나(양쪽 장면 확신 thr 이상 · 간격 maxgap 이하)."""
    t = d["t"]
    i = np.clip(np.searchsorted(t, tq) - 1, 0, len(t) - 2)
    t0, t1 = t[i], t[i + 1]
    w = np.clip((tq - t0) / np.maximum(t1 - t0, 1e-9), 0, 1)[:, None, None]
    xy = d["kp"][i] * (1 - w) + d["kp"][i + 1] * w
    ok = (d["sc"][i] > thr) & (d["sc"][i + 1] > thr) & ((t1 - t0) <= maxgap)[:, None] & (tq >= t[0])[:, None] & (tq <= t[-1])[:, None]
    return xy, ok


def pairs(da, db, o, step=2, thr=0.55):
    tq = da["t"][::step]
    xa, oka = sample(da, tq, thr)
    xb, okb = sample(db, tq + o, thr)
    m = oka & okb
    return xa[m], xb[m]


def f_score(xa, xb, tol=3.0):
    if len(xa) < 30:
        return 0, None
    F, mask = cv2.findFundamentalMat(xa.astype(np.float64), xb.astype(np.float64), cv2.FM_RANSAC, tol, 0.999, 2000)
    if F is None:
        return 0, None
    return int(mask.sum()), F


def sync_pair(da, db, lo=-1.0, hi=1.0, coarse=1 / 120):
    """b 의 시각 = a 의 시각 + o 가 되는 o(초) — 넓게 훑고 좁혀서."""
    best = (-1, 0.0)
    for o in np.arange(lo, hi, coarse):
        n, _ = f_score(*pairs(da, db, o, step=4))
        if n > best[0]:
            best = (n, o)
    sc = []
    for o in np.arange(best[1] - 3 / 240, best[1] + 3.5 / 240, 0.5 / 240):
        xa, xb = pairs(da, db, o, step=1)
        n, F = f_score(xa, xb, tol=2.0)
        if F is None:
            sc.append((o, 1e9, 0))
            continue
        e = np.abs(np.sum(np.c_[xb, np.ones(len(xb))] * (np.c_[xa, np.ones(len(xa))] @ F.T), 1))
        l1 = np.c_[xa, np.ones(len(xa))] @ F.T
        l2 = np.c_[xb, np.ones(len(xb))] @ F
        samp = e**2 / (l1[:, 0] ** 2 + l1[:, 1] ** 2 + l2[:, 0] ** 2 + l2[:, 1] ** 2)
        sc.append((o, float(np.median(samp)), n))
    sc = np.array(sc)
    k = int(np.argmin(sc[:, 1]))
    return float(sc[k, 0]), int(sc[k, 2]), best


if __name__ == "__main__":
    p = int(sys.argv[1])
    ds = {c: load_kp(p, c) for c in CAMS}
    res = {}
    for a, b in PAIRS:
        o, n, coarse = sync_pair(ds[a], ds[b])
        res[a + b] = o
        print(f"{a}{b}: {o:+.4f}s  inliers {n}  (거친 {coarse[1]:+.3f} · {coarse[0]})", flush=True)
    # 닫힘: o12 + o23 = o13 등
    print("닫힘 12+23-13", round(res["12"] + res["23"] - res["13"], 4), " 12+24-14", round(res["12"] + res["24"] - res["14"], 4), " 13+34-14", round(res["13"] + res["34"] - res["14"], 4))
