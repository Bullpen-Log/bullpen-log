"""AI 어깨 · 엉덩이 점 선이 스티커 자(어깨 봉우리 L2 · R2, 골반 ASIS · PSIS)와 얼마나 다른가 — 우리 자(관절 가운데) ↔ 앱(AI 점) 차이.
(세션 폴더에서, work/fill 이 있어야 — 없으면 fill.py work/cal16b.json 1,...,16) python sticker_lines.py
"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
import pelvis_score as PS

WORK = B.WORK
cal_path, world_path = os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json")
cal = json.load(open(cal_path)); toW = B.world_of(cal_path, world_path)
tpl, _ = PS.pelvis_template(toW)
yaw, wrap = PS.yaw, PS.wrap
sh_rows, pel_rows = [], []  # (투구, 구간, 착지 기준 ms, 엔진 − 스티커, K4 − 스티커)
for p in range(2, 17):
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    if not r.get("ok"):
        continue
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]
    J = np.array(r["joints"], float) / 1000.0
    A, Bb = [], []
    for n, (kn, sd) in B.K4_OF.items():
        X = toW(rec[f"K_{kn}_{sd}"])
        T = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
        m = ~np.isnan(T[:, 0]); A.append(J[m, B.IX[n]]); Bb.append(T[m])
    s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb))
    E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
    fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz")); ftq = fl["tq"]
    near = np.clip(np.round((te - ftq[0]) / (ftq[1] - ftq[0])).astype(int), 0, len(ftq) - 1)
    okt = np.abs(ftq[near] - te) < 0.5 / 240
    def mk(n):
        if "M_" + n not in fl.files:
            return np.full((len(te), 3), np.nan)
        X = toW(fl["M_" + n])[near]; X[~okt] = np.nan; return X
    L2, R2 = mk("L2"), mk("R2")
    S = {n: mk(n) for n in PS.PEL}
    kat = lambda kn, sd: np.array([[np.interp(tt, tq, toW(rec[f"K_{kn}_{sd}"])[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
    ksh = kat("sho", "L") - kat("sho", "R"); khp = kat("hip", "L") - kat("hip", "R")
    esh = E[:, B.IX["lSh"]] - E[:, B.IX["rSh"]]; ehp = E[:, B.IX["lHip"]] - E[:, B.IX["rHip"]]
    ev = r["events"]; fp = ev["footPlant"]
    for k in range(len(te)):
        ms = (te[k] - te[fp]) * 1000
        # 한쪽씩: AI 어깨 점 하나를 스티커로 바꿔 끼운 선 − AI 선 = 그쪽 점이 선 방향을 얼마나 틀었나(두 쪽 합 ≈ 선 전체 차이)
        eL, eR = E[k, B.IX["lSh"]], E[k, B.IX["rSh"]]
        if not np.isnan(R2[k, 0]):
            sh_rows.append((p, B.phase_of(k, ev), ms, float(wrap(yaw(esh[k]) - yaw(eL - R2[k]))), np.nan, "R"))
        if not np.isnan(L2[k, 0]):
            sh_rows.append((p, B.phase_of(k, ev), ms, float(wrap(yaw(esh[k]) - yaw(L2[k] - eR))), np.nan, "L"))
        py = PS.pelvis_yaw(tpl, {n: S[n][k] for n in PS.PEL})
        if not np.isnan(py):
            pel_rows.append((p, B.phase_of(k, ev), ms, float(wrap(yaw(ehp[k]) - py)), float(wrap(yaw(khp[k]) - py)) if not np.isnan(khp[k, 0]) else np.nan))

def rep(rows, name):
    print(f"\n{name}  (+ = AI 선이 스티커 선보다 위에서 볼 때 반시계 · 엔진 / K4)")
    for lab, f in [("착지 150ms 전 ~ 50ms 뒤", lambda r: -150 <= r[2] <= 50), ("다리 들기", lambda r: r[1] == "다리 들기"), ("내딛기", lambda r: r[1] == "내딛기"),
                   ("팔 가속", lambda r: r[1] == "팔 가속"), ("팔로스루", lambda r: r[1] == "팔로스루"), ("전체", lambda r: True)]:
        R = [r for r in rows if f(r)]
        if not R:
            print(f"  {lab:22s} 장면 0"); continue
        e = np.array([r[3] for r in R]); k = np.array([r[4] for r in R]); k = k[~np.isnan(k)]
        ps = sorted({r[0] for r in R})
        print(f"  {lab:22s} 장면 {len(R):4d} (투구 {len(ps):2d})  엔진 치우침 {e.mean():+6.1f} · |차| 가운데 {np.median(np.abs(e)):5.1f}   K4 치우침 {k.mean() if len(k) else np.nan:+6.1f} · |차| 가운데 {np.median(np.abs(k)) if len(k) else np.nan:5.1f}")

rep([r for r in sh_rows if r[5] == "R"], "어깨선(던지는 쪽 R): AI 선 − (AI 왼 어깨 · 오른 봉우리 스티커) 선")
rep([r for r in sh_rows if r[5] == "L"], "어깨선(글러브 쪽 L): AI 선 − (왼 봉우리 스티커 · AI 오른 어깨) 선")
rep(pel_rows, "엉덩이선: AI 엉덩이 점 선 − 골반 스티커(ASIS · PSIS) 좌우축")
