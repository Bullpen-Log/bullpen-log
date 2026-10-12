"""카메라마다 스티커 궤적(2D) — 장면끼리 같은 색 가장 가까운 것을 잇고, 관절(RTMW)로 몸 부위 무리를 붙인다.

무리: head(귀) · shoulder · elbow · wrist(손목 둘 + 손등) · hip(큰돌기 · 골반 앞뒤) · knee · foot(발목 둘 · 뒤꿈치 · 발끝).
색 = 몸 쪽(노랑 왼쪽 · 분홍 오른쪽).
"""
import os, sys, json
import numpy as np
from scipy.optimize import linear_sum_assignment

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))  # 영상 · 찾은 자료 폴더(저장소 밖) — 기본은 지금 폴더/work
GROUPS = {
    "L": {"head": [3], "shoulder": [5], "elbow": [7], "wrist": [9, 100], "hip": [11], "knee": [13], "foot": [15, 17, 19]},
    "R": {"head": [4], "shoulder": [6], "elbow": [8], "wrist": [10, 121], "hip": [12], "knee": [14], "foot": [16, 20, 22]},
}
SIDE = {"yellow": "L", "pink": "R"}


def load_det(p, c):
    return json.load(open(os.path.join(WORK, "det", f"투구{p:02d}_c{c}.json"), encoding="utf-8"))


def load_kp_full(p, c):
    z = np.load(os.path.join(WORK, "kp", f"투구{p:02d}_c{c}.npz"))
    return z["t"], z["kp"], z["sc"]


def group_of(xy, kp, sc, side, scale):
    """가장 가까운 무리 관절(확신 0.3↑) — 몸 크기(어깨 가운데~엉덩이 가운데)의 0.45 안일 때만."""
    best, bd = None, 0.45 * scale
    for g, js in GROUPS[side].items():
        for j in js:
            if sc[j] < 0.3:
                continue
            d = float(np.hypot(*(kp[j] - xy)))
            if d < bd:
                best, bd = g, d
    return best


def build(p, c, max_jump=0.12):
    """궤적 목록: {id, color, group(가장 많은 것), t[], xy[]} — max_jump 는 몸 크기 대비 한 장면 최대 이동."""
    det = load_det(p, c)
    kt, kp, sc = load_kp_full(p, c)
    fr = det["frames"]
    assert len(fr) == len(kt) and np.allclose([f["t"] for f in fr], kt, atol=1e-4), "장면 수 · 시각이 관절과 다름"
    tracks, live = [], {"pink": [], "yellow": []}
    for i, f in enumerate(fr):
        sh = (kp[i][5] + kp[i][6]) / 2; hp = (kp[i][11] + kp[i][12]) / 2
        scale = float(np.hypot(*(sh - hp))) if min(sc[i][[5, 6, 11, 12]]) > 0.3 else None
        for col in ("pink", "yellow"):
            blobs = [b for b in f[col]]
            gs = [group_of(np.array(b[:2]), kp[i], sc[i], SIDE[col], scale) if scale else None for b in blobs]
            keep = [(b, g) for b, g in zip(blobs, gs) if g is not None]
            cur = live[col]
            lim = max_jump * (scale or 300)
            if cur and keep:
                # 앞 장면 속도로 예측한 자리와의 거리
                pred = np.array([tr["xy"][-1] + (np.array(tr["xy"][-1]) - tr["xy"][-2] if len(tr["xy"]) > 1 else 0) for tr in cur])
                pos = np.array([b[:2] for b, _ in keep])
                D = np.linalg.norm(pred[:, None] - pos[None], axis=2)
                D[D > lim] = 1e6
                ri, ci = linear_sum_assignment(D)
                pairs = [(r, q) for r, q in zip(ri, ci) if D[r, q] < 1e6]
            else:
                pairs = []
            used_t, used_b = {r for r, _ in pairs}, {q for _, q in pairs}
            nxt = []
            for r, q in pairs:
                tr = cur[r]
                tr["t"].append(f["t"]); tr["xy"].append(np.array(keep[q][0][:2])); tr["g"].append(keep[q][1])
                nxt.append(tr)
            for r, tr in enumerate(cur):
                if r not in used_t:
                    tr["miss"] = tr.get("miss", 0) + 1
                    if tr["miss"] <= 2:  # 두 장면까지 비어도 이어 본다
                        nxt.append(tr)
            for q, (b, g) in enumerate(keep):
                if q not in used_b:
                    tr = {"id": len(tracks), "color": col, "t": [f["t"]], "xy": [np.array(b[:2])], "g": [g]}
                    tracks.append(tr); nxt.append(tr)
            for tr in nxt:
                if tr["t"][-1] == f["t"]:
                    tr["miss"] = 0
            live[col] = nxt
    out = []
    for tr in tracks:
        if len(tr["t"]) < 8:
            continue
        gs, n = np.unique(tr["g"], return_counts=True)
        out.append({"id": tr["id"], "color": tr["color"], "group": str(gs[np.argmax(n)]), "gfrac": float(n.max() / n.sum()),
                    "t": np.array(tr["t"]), "xy": np.array(tr["xy"])})
    return out


def at(tr, tq, maxgap=2.5 / 240):
    """궤적을 시각들에서 선형 보간 — 범위 밖이거나 사이가 너무 비면 nan."""
    t = tr["t"]
    i = np.clip(np.searchsorted(t, tq) - 1, 0, len(t) - 2)
    t0, t1 = t[i], t[i + 1]
    w = np.clip((tq - t0) / np.maximum(t1 - t0, 1e-9), 0, 1)[:, None]
    xy = tr["xy"][i] * (1 - w) + tr["xy"][i + 1] * w
    bad = (tq < t[0]) | (tq > t[-1]) | ((t1 - t0) > maxgap)
    xy[bad] = np.nan
    return xy


if __name__ == "__main__":
    p = int(sys.argv[1])
    for c in "1234":
        trs = build(p, c)
        L = [len(t["t"]) for t in trs]
        by = {}
        for t in trs:
            by.setdefault(t["color"][0] + ":" + t["group"], []).append(len(t["t"]))
        print(c, "궤적", len(trs), "장면 가운데값", int(np.median(L)), "최대", max(L), " ", {k: (len(v), int(np.sum(v))) for k, v in sorted(by.items())})
