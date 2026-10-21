"""요소별 진단 지표의 엔진 정확도 — 드롭 · 브레이크 · 몸통 회전 · 팔 늦음(2026-10-21 김민). 엔진(옆 · 뒤 두 대) vs 네 대 교차(K4) 정답.

식은 scripts/pitch-lab/obp/elements.py(기준표)와 같다. 맞춤 · 순간은 metric_score.py 와 같게(엔진 순간을 둘 다에 씀, 우투 한 명).
(세션 폴더에서) python element_score.py — 결과 표: 지표 · 투구 · 엔진/정답 평균 · |차| 가운데 · 치우침 · 정답 폭 · 상관.
주의: K4 도 같은 2D(RTMW)라 둘이 같이 틀리는 몫은 안 보인다(팔이 특히).
"""
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
NEED = ("lHip", "rHip", "lSh", "rSh", "lKn", "rKn", "lAn", "rAn", "rEl", "rWr")
for p in range(2, 17):
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    if not r.get("ok"): continue
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]
    J = np.array(r["joints"], float) / 1000.0
    A, Bb, K = [], [], {}
    for n, (kn, sd) in B.K4_OF.items():
        X = toW(rec[f"K_{kn}_{sd}"])
        T = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
        K[n] = T
        m = ~np.isnan(T[:, 0]); A.append(J[m, B.IX[n]]); Bb.append(T[m])
    s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb))
    E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
    Eg = {n: E[:, B.IX[n]] for n in B.K4_OF}
    ev = r["events"]; ku, fp, rl = ev["kneeUp"], ev.get("footContact", ev["footPlant"]), ev["release"]

    def per(G):
        g = lambda n, k: G[n][k]
        if any(np.isnan(G[n][k][0]) for n in NEED for k in (ku, fp, rl)): return None
        F = hz(g("lAn", fp) - g("rAn", ku)); F /= np.linalg.norm(F); Gv = np.cross(U, F)  # 우투: 글러브 = 왼쪽
        leg = np.linalg.norm(g("rHip", ku) - g("rKn", ku)) + np.linalg.norm(g("rKn", ku) - g("rAn", ku))
        a0, a1 = g("rAn", ku), g("lAn", fp); span = (a1 - a0) @ F
        pel = lambda k: (g("lHip", k) + g("rHip", k)) / 2
        def height(k):
            q = pel(k); s_ = np.clip((q - a0) @ F / span, 0, 1)
            return (q[2] - (a0[2] + s_ * (a1[2] - a0[2]))) / leg
        hs = [height(k) for k in range(ku, fp + 1)]
        knee = lambda k: 180 - ang(g("lHip", k) - g("lKn", k), g("lAn", k) - g("lKn", k))
        kb = [knee(k) for k in range(fp, rl + 1) if not np.isnan(G["lKn"][k][0])]
        tr = lambda k: (g("lSh", k) + g("rSh", k)) / 2 - pel(k)
        Tb, Tf = tr(rl), tr(fp)
        yaw = lambda k: np.degrees(np.arctan2(hz(g("lSh", k) - g("rSh", k)) @ Gv, hz(g("lSh", k) - g("rSh", k)) @ F))
        S, El, W = g("rSh", fp), g("rEl", fp), g("rWr", fp)
        return {
            "드롭 골반 내려간 몫(다리 길이)": hs[0] - hs[-1],
            "드롭 니업보다 뜬 최대": max(hs) - hs[0],
            "브레이크 무릎 착지": kb[0], "브레이크 무릎 릴리스": kb[-1],
            "브레이크 무릎 펴짐": kb[0] - kb[-1], "브레이크 무릎 더 굽음": max(kb) - kb[0],
            "몸통 앞 기울기 릴리스": np.degrees(np.arctan2(Tb @ F, Tb @ U)),
            "몸통 옆 기울기 릴리스": np.degrees(np.arctan2(Tb @ Gv, Tb @ U)),
            "몸통 어깨선 돈 양": abs((yaw(rl) - yaw(fp) + 180) % 360 - 180),
            "팔 어깨 벌림 착지": ang(El - S, -Tf),
            "팔 팔꿈치 높이 착지": (El[2] - S[2]) / np.linalg.norm(El - S),
            "팔 아래팔 들림 착지": np.degrees(np.arcsin(np.clip((W[2] - El[2]) / np.linalg.norm(W - El), -1, 1))),
        }

    a, b = per(Eg), per(K)
    if a is None or b is None: continue
    for key in a: rows.setdefault(key, []).append((p, a[key], b[key]))

print(f"{'지표':24s} 투구 엔진 평균 정답 평균 |차| 가운데 |차| 최대 치우침 정답 폭(sd) 상관")
for k, v in rows.items():
    v = np.array([x[1:] for x in v]); d = v[:, 0] - v[:, 1]
    c = np.corrcoef(v[:, 0], v[:, 1])[0, 1] if len(v) > 2 and v[:, 1].std() > 1e-6 else float("nan")
    print(f"{k:24s} {len(v):3d} {v[:,0].mean():8.2f} {v[:,1].mean():8.2f} {np.median(abs(d)):8.2f} {abs(d).max():8.2f} {d.mean():+7.2f} {v[:,1].std():8.2f} {c:5.2f}")
