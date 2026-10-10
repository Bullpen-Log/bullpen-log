"""통계 움직임 틀 만들기 — mocap_bench.py 가 만든 투구 폴더들(truth.json · seg.json)에서 구간(φ)별 평균 자세 + 주성분.
쓰는 쪽: lib/pitch-3d/v2/motion-template.ts(같은 좌표 · 구간 규칙 — 바꾸면 둘 다).

  python scripts/pitch-lab/markers/motion_template.py build 출력.json 폴더1 폴더2 … [--k 10] [--source "출처"]

좌표: 엉덩이 가운데 원점, x = 홈(F: 니업 → 착지 사이 엉덩이가 나아간 수평 방향, 엔진 worldAxes 와 같은 정의), y = 글러브 쪽,
z = 위, 키로 나눔. 좌투는 글러브 쪽이 오른쪽이라 거울이 되고, 관절은 좌우 짝을 바꿔 '왼쪽 자리 = 글러브 쪽'.
"""

from __future__ import annotations

import json
import os
import sys
from functools import lru_cache

import numpy as np

PAIRS = [(1, 2), (3, 4), (5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 18), (19, 20), (21, 22), (23, 24)]
PHASE0, DPHI, PHASE1 = -0.5, 0.025, 3.0


def phase_of(k: float, ev: dict) -> float:
    span = max(1.0, ev["release"] - ev["footPlant"])
    ku = ev["kneeUp"] if ev.get("kneeUp") is not None and ev["kneeUp"] < ev["footPlant"] else ev["footPlant"] - 4 * span
    if k < ev["footPlant"]:
        return (k - ev["footPlant"]) / max(1.0, ev["footPlant"] - ku) + 1
    if k <= ev["release"]:
        return 1 + (k - ev["footPlant"]) / span
    return 2 + (k - ev["release"]) / span


@lru_cache(maxsize=None)  # 한 투수씩 빼며 틀을 여러 번 만들 때 같은 투구를 다시 읽지 않게
def canonical(folder: str) -> tuple[np.ndarray, np.ndarray] | None:
    """(φ 장면들, 틀 좌표 (장면, 25, 3)) — seg.json 의 순간(초)을 진짜 장면 번호로."""
    truth = json.load(open(os.path.join(folder, "truth.json"), encoding="utf-8"))
    segp = os.path.join(folder, "seg.json")
    if not os.path.exists(segp):
        return None
    seg = json.load(open(segp, encoding="utf-8"))
    rate = truth["meta"]["rate"]
    J = np.array(truth["joints"])
    H = truth["meta"]["height_m"]
    hand = truth["meta"]["hand"]
    ev = {k: (None if seg.get(k) is None else seg[k] * rate) for k in ("kneeUp", "footPlant", "release")}
    U = np.array([0, 0, 1.0])
    hip = (J[:, 7] + J[:, 8]) / 2
    ku = int(ev["kneeUp"]) if ev["kneeUp"] is not None else 0
    fp = int(ev["footPlant"])
    tr = hip[min(fp, len(J) - 1)] - hip[max(0, ku)]
    tr[2] = 0
    if np.linalg.norm(tr) < 1e-6:
        return None
    F = tr / np.linalg.norm(tr)
    G = np.cross(U, F) if hand == "R" else np.cross(F, U)
    C = np.stack([((J - hip[:, None]) @ F) / H, ((J - hip[:, None]) @ G) / H, ((J - hip[:, None]) @ U) / H], -1)
    if hand == "L":
        C = C.copy()
        for a, b in PAIRS:
            C[:, [a, b]] = C[:, [b, a]]
    ph = np.array([phase_of(k, ev) for k in range(len(J))])
    return ph, C


def build(out: str, folders: list[str], k: int = 10, source: str = "") -> dict:
    bins_phi = np.arange(PHASE0, PHASE1 + 1e-9, DPHI)
    samples = []  # (φ 칸 수, 75) 투구마다
    for f in folders:
        c = canonical(f)
        if c is None:
            print(f"  건너뜀(순간 · 진짜 자료 없음): {f}")
            continue
        ph, C = c
        X = C.reshape(len(C), -1)
        S = np.full((len(bins_phi), X.shape[1]), np.nan)
        ok = (bins_phi >= ph.min()) & (bins_phi <= ph.max())
        for d in range(X.shape[1]):
            S[ok, d] = np.interp(bins_phi[ok], ph, X[:, d])
        samples.append(S)
    if len(samples) < 3:
        raise SystemExit(f"투구 {len(samples)}개 — 3개 넘게 필요")
    A = np.stack(samples)  # (투구, 칸, 75)
    bins = []
    for i in range(len(bins_phi)):
        lo, hi = max(0, i - 2), min(len(bins_phi), i + 3)
        Y = A[:, lo:hi].reshape(-1, A.shape[2])  # 이웃 칸도 함께(주성분이 칸마다 덜 튀게)
        Y = Y[~np.isnan(Y).any(1)]
        mu = np.nanmean(A[:, i], 0) if np.isfinite(A[:, i]).any() else Y.mean(0)
        if len(Y) < 3 or np.isnan(mu).any():
            bins.append(None)
            continue
        Yc = Y - Y.mean(0)
        _, sv, vt = np.linalg.svd(Yc, full_matrices=False)
        ev_ = sv**2 / max(1, len(Y) - 1)
        kk = min(k, len(ev_) - 1)
        s2 = max(float(ev_[kk:].mean()) if len(ev_) > kk else 1e-6, 1e-6)
        W = vt[:kk].T * np.sqrt(np.maximum(ev_[:kk] - s2, 1e-9))
        bins.append({"mu": np.round(mu, 5).tolist(), "W": np.round(W, 5).tolist(), "s2": round(s2, 8)})
    # 앞뒤 빈 칸은 가장 가까운 칸으로
    first = next(b for b in bins if b is not None)
    last = next(b for b in reversed(bins) if b is not None)
    prev = first
    filled = []
    for b in bins:
        prev = b if b is not None else prev
        filled.append(prev)
    # 끝쪽 None 은 last
    for i in range(len(filled) - 1, -1, -1):
        if bins[i] is not None:
            break
        filled[i] = last
    tpl = {"version": 1, "phase0": PHASE0, "dphi": DPHI, "bins": filled, "n": len(samples), "source": source}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(tpl, f, separators=(",", ":"))
    print(f"틀: 투구 {len(samples)}개 · 칸 {len(filled)} · 주성분 {len(first['W'][0])} · {os.path.getsize(out) / 1e6:.2f}MB → {out}")
    return tpl


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 3 and a[0] == "build":
        k = int(a[a.index("--k") + 1]) if "--k" in a else 10
        src = a[a.index("--source") + 1] if "--source" in a else ""
        rest = [x for i, x in enumerate(a[2:], 2) if x not in ("--k", "--source") and a[i - 1] not in ("--k", "--source")]
        build(a[1], rest, k=k, source=src)
    else:
        print(__doc__)
