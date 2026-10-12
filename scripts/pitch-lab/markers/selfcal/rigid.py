"""3D 스티커 궤적(시각마다 점을 2D 궤적 번호로 이어 붙임) + 같은 무리 짝의 거리 흔들림.

collect 의 rows/meta 로: 점 k 는 (투구, τ) 와 관측 (카메라, 궤적 번호). 같은 (카메라, 궤적)을 쓰는 점끼리 같은 스티커.
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tracks import build
from match import CAMS


def tracks3d(pitches, rows_obs):
    """rows_obs: [(점 k, 카메라, 투구, 궤적 번호)] → 점 k → 3D 궤적 번호(합집합)."""
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for k, c, p, tid in rows_obs:
        a, b = ("pt", k), ("tr", p, c, tid)
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    ids = {}
    out = {}
    for k, c, p, tid in rows_obs:
        r = find(("pt", k))
        out[k] = ids.setdefault(r, len(ids))
    return out


def group_info(pitches):
    g = {}
    for p in pitches:
        for c in CAMS:
            for t in build(p, c):
                g[(p, c, t["id"])] = (t["color"], t["group"])
    return g


def pair_stats(X, k2trk, k2meta, k2grp, groups=("knee", "elbow", "foot", "wrist", "head", "hip", "shoulder"), min_n=40):
    """같은 (투구, 색, 무리)의 3D 궤적 둘이 같은 시각에 있으면 거리 — 짝마다 표준편차 · 평균."""
    by = {}
    for k, tr in k2trk.items():
        p, tau = k2meta[k]
        by.setdefault((p, tau), []).append(k)
    D = {}
    for (p, tau), ks in by.items():
        for i in range(len(ks)):
            for j in range(i + 1, len(ks)):
                a, b = ks[i], ks[j]
                ga, gb = k2grp[a], k2grp[b]
                if ga != gb or ga[1] not in groups:
                    continue
                key = (p, ga, min(k2trk[a], k2trk[b]), max(k2trk[a], k2trk[b]))
                D.setdefault(key, []).append(np.linalg.norm(X[a] - X[b]))
    return {k: (float(np.mean(v)), float(np.std(v)), len(v)) for k, v in D.items() if len(v) >= min_n}
