"""스캔 봉우리(scan.py) → 공 길 → 투구 후보(정답 표 · 라벨 바탕). 읽기만.

    .venv/bin/python tools/throws.py --out throws.json scan-v1/*.jsonl

공 길: 장면마다 점수 MIN_SCORE 넘는 봉우리를, 앞 두 점으로 짐작한 자리 둘레(문 = max(3d, 50px, 1.6×걸음))에서 가장 가까운 것으로 잇는다.
세 장까지 비어도 된다. 투구 = 8장 넘게 · 멀어짐(처음 지름 / 끝 지름 ≥ 1.25) · 움직임(처음↔끝 거리 ≥ 3 지름) · 0.1~1.2초.
다가오는 길(지름이 커짐 — 포수가 돌려준 공)은 'return' 으로 따로 남긴다(공 라벨로는 쓴다).
"""
import argparse
import json
import math
from collections import defaultdict

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--min-score", type=float, default=0.08)
ap.add_argument("files", nargs="+")
a = ap.parse_args()

frames = defaultdict(list)
for p in a.files:
    for l in open(p):
        o = json.loads(l)
        frames[o["file"]].append(o)


def link(fr):
    fr.sort(key=lambda o: o["i"])
    active, done = [], []
    for o in fr:
        pts = [dict(i=o["i"], t=o["t"], x=x, y=y, d=d, s=s) for x, y, d, s in o["peaks"] if s >= a.min_score]
        used = set()
        for tr in sorted(active, key=lambda tr: -len(tr)):
            last = tr[-1]
            gap = o["i"] - last["i"]
            if len(tr) > 1:
                p2 = tr[-2]
                k = gap / max(1, last["i"] - p2["i"])
                px, py = last["x"] + (last["x"] - p2["x"]) * k, last["y"] + (last["y"] - p2["y"]) * k
                step = math.hypot(last["x"] - p2["x"], last["y"] - p2["y"]) / max(1, last["i"] - p2["i"])
            else:
                px, py, step = last["x"], last["y"], 0
            gate = max(3 * last["d"], 50, 1.6 * step * gap)
            best, bd = None, gate
            for j, q in enumerate(pts):
                if j in used or not (0.55 * last["d"] <= q["d"] <= 1.6 * last["d"] + 4):
                    continue
                dd = math.hypot(q["x"] - px, q["y"] - py)
                if dd < bd:
                    best, bd = j, dd
            if best is not None:
                used.add(best)
                tr.append(pts[best])
        for j, q in enumerate(pts):
            if j not in used:
                active.append([q])
        still = []
        for tr in active:
            (still if o["i"] - tr[-1]["i"] <= 3 else done).append(tr)
        active = still
    return done + active


def med(v):
    v = sorted(v)
    return v[len(v) // 2]


out = []
for f, fr in frames.items():
    for tr in link(fr):
        if len(tr) < 8:
            continue
        dur = tr[-1]["t"] - tr[0]["t"]
        if not 0.1 <= dur <= 1.2:
            continue
        n = max(3, len(tr) // 4)
        d0, d1 = med([p["d"] for p in tr[:n]]), med([p["d"] for p in tr[-n:]])
        move = math.hypot(tr[-1]["x"] - tr[0]["x"], tr[-1]["y"] - tr[0]["y"])
        if move < 3 * min(d0, d1):
            continue
        kind = "throw" if d0 / d1 >= 1.25 else "return" if d1 / d0 >= 1.25 else "flat"
        out.append(dict(file=f, kind=kind, t0=tr[0]["t"], t1=tr[-1]["t"], n=len(tr), d0=round(d0, 1), d1=round(d1, 1),
                        score=round(sum(p["s"] for p in tr) / len(tr), 3), pts=[[p["i"], p["t"], p["x"], p["y"], p["d"], p["s"]] for p in tr]))
out.sort(key=lambda o: (o["file"], o["t0"]))
json.dump(out, open(a.out, "w"))
from collections import Counter
print(Counter(o["kind"] for o in out), "files", len(frames))
