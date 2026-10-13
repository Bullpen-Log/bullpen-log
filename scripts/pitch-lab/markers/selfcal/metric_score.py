"""지표별 정확도 — 엔진(옆 · 뒤 두 대) vs 네 대 교차(K4) 정답, 같은 장면 · 같은 식. (세션 폴더에서) python metric_score.py"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
WORK = B.WORK
cal_path, world_path = os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json")
cal = json.load(open(cal_path)); toW = B.world_of(cal_path, world_path)
U = np.array([0, 0, 1.0])
def ang(a, b): return np.degrees(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1)))
def hz(v): return v - U * (v @ U)
rows = {}
for p in range(2, 17):
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    if not r.get("ok"): continue
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]
    J = np.array(r["joints"], float) / 1000.0
    A, Bb = [], []
    K = {}
    for n, (kn, sd) in B.K4_OF.items():
        X = toW(rec[f"K_{kn}_{sd}"])
        T = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
        K[n] = T
        m = ~np.isnan(T[:, 0]); A.append(J[m, B.IX[n]]); Bb.append(T[m])
    s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb))
    E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
    Eg = {n: E[:, B.IX[n]] for n in B.K4_OF}
    ev = r["events"]; ku, fp, rl = ev["kneeUp"], ev["footPlant"], ev["release"]
    # 앞 F = 니업 → 착지 골반 가운데 수평 이동(정답으로, 둘이 같은 축)
    hm = lambda G, k: (G["lHip"][k] + G["rHip"][k]) / 2
    F = hz(hm(K, fp) - hm(K, ku)); F /= np.linalg.norm(F); Gv = np.cross(U, F)  # 우투: 글러브 = 왼쪽
    H = 1.8
    def m(G, k):
        g = lambda n: G[n][k]
        if any(np.isnan(g(n)[0]) for n in ("lHip", "rHip", "lSh", "rSh", "lKn", "lAn", "rAn", "rEl", "rWr")): return None
        tr = (g("lSh") + g("rSh")) / 2 - (g("lHip") + g("rHip")) / 2
        op = lambda a, b: np.degrees(np.arctan2(hz(b - a) @ Gv, hz(b - a) @ F))
        sep = op(g("rHip"), g("lHip")) - op(g("rSh"), g("lSh"))
        u = g("rEl") - g("rSh"); v = g("rWr") - g("rEl")
        d = g("lAn") - g("rAn")
        return {"knee": 180 - ang(g("lHip") - g("lKn"), g("lAn") - g("lKn")),
                "fwd": np.degrees(np.arctan2(tr @ F, tr @ U)), "lat": np.degrees(np.arctan2(tr @ Gv, tr @ U)),
                "sep": (sep + 180) % 360 - 180, "abd": ang(u, -tr), "elbow": 180 - ang(-u, v),
                "strideL": d @ F / H * 100, "strideO": d @ Gv / H * 100}
    for name, k, keys in (("착지", fp, ("knee", "strideL", "strideO", "sep", "fwd")), ("릴리스", rl, ("knee", "fwd", "lat", "abd", "elbow", "sep"))):
        a, b = m(Eg, k), m(K, k)
        if a is None or b is None: continue
        for key in keys: rows.setdefault(f"{name} {key}", []).append((p, a[key], b[key]))
    # 최대 분리(니업 ~ 릴리스)
    seps = [(m(Eg, k), m(K, k)) for k in range(ku, rl + 1)]
    seps = [(a["sep"], b["sep"]) for a, b in seps if a and b]
    if seps:
        ea, kb = zip(*seps); rows.setdefault("최대 분리 sep", []).append((p, max(ea), max(kb)))
print(f"{'지표':14s} 투구  엔진 평균  정답 평균  |차| 가운데  |차| 최대  치우침  투구 사이 정답 폭(표준편차)  상관")
for k, v in rows.items():
    v = np.array([x[1:] for x in v])
    d = v[:, 0] - v[:, 1]
    c = np.corrcoef(v[:, 0], v[:, 1])[0, 1] if len(v) > 2 and v[:, 1].std() > 1e-6 else float("nan")
    print(f"{k:14s} {len(v):3d}  {v[:,0].mean():8.1f}  {v[:,1].mean():8.1f}  {np.median(abs(d)):8.1f}  {abs(d).max():8.1f}  {d.mean():+6.1f}  {v[:,1].std():8.1f}  {c:5.2f}")
