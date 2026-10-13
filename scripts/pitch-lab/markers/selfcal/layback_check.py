"""레이백(어깨 외회전) — 엔진 vs 네 대 교차(K4) vs 스티커(R2 어깨 · R3 팔꿈치 · R5 손목), 착지 → 릴리스. (세션 폴더에서) python layback_check.py 16

QUIET=1 이면 투구별 줄 없이 요약(레이백 최대 오차 가운데 · 치우침 · 25° 넘게 튄 장면)만 — score-all.mjs 가 읽는다. 스티커는 팔 가속 구간에 안 보여 비어 있다."""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
WORK = B.WORK
cal_path, world_path = os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json")
cal = json.load(open(cal_path)); toW = B.world_of(cal_path, world_path)
U = np.array([0, 0, 1.0])
def nrm(v): return v / np.linalg.norm(v)
def rej(a, b): return a - b * (a @ b) / (b @ b)
def er(sh, el, wr, gsh, hipm, F):
    """metrics.ts externalRotation 과 같은 식"""
    if any(np.isnan(x[0]) for x in (sh, el, wr, gsh, hipm)): return np.nan
    T = (sh + gsh) / 2 - hipm; u = nrm(el - sh); v = wr - el
    if np.degrees(np.arccos(np.clip(nrm(v) @ u, -1, 1))) < 30: return np.nan
    ref = nrm(rej(nrm(T), u)); chest = nrm(np.cross(gsh - sh, T))
    if chest @ F < 0: chest = -chest
    post = nrm(rej(-chest, u)); vp = rej(v, u)
    return 90 + np.degrees(np.arctan2(vp @ post, vp @ ref))
SUM = []  # (투구, 엔진 최대, K4 최대, 엔진 튐 장면 수)
QUIET = os.environ.get("QUIET") == "1"
for p in [int(x) for x in sys.argv[1].split(",")]:
    r = json.load(open(os.path.join(os.environ.get("RES_DIR", os.path.join(WORK, "bench")), f"p{p:02d}", "result.json")))  # RES_DIR 로 다른 판 결과
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]; n = len(te)
    J = np.array(r["joints"], float) / 1000.0
    K, A, Bb = {}, [], []
    for nm, (kn, sd) in B.K4_OF.items():
        X = toW(rec[f"K_{kn}_{sd}"]); T = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
        K[nm] = T; m = ~np.isnan(T[:, 0]); A.append(J[m, B.IX[nm]]); Bb.append(T[m])
    s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb)); E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
    Eg = {nm: E[:, B.IX[nm]] for nm in B.K4_OF}
    fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz")); ftq = fl["tq"]
    near = np.clip(np.round((te - ftq[0]) / (ftq[1] - ftq[0])).astype(int), 0, len(ftq) - 1); okt = np.abs(ftq[near] - te) < 0.5 / 240
    def mk(nm):
        if "M_" + nm not in fl.files: return np.full((n, 3), np.nan)
        X = toW(fl["M_" + nm])[near]; X[~okt] = np.nan; return X
    ev = r["events"]; ku, fp, rl = ev["kneeUp"], ev["footPlant"], ev["release"]
    hm = lambda G: (G["lHip"] + G["rHip"]) / 2
    F = rej(hm(K)[fp] - hm(K)[ku], U); F = nrm(F)
    rows = {"엔진": [er(Eg["rSh"][k], Eg["rEl"][k], Eg["rWr"][k], Eg["lSh"][k], hm(Eg)[k], F) for k in range(n)],
            "K4": [er(K["rSh"][k], K["rEl"][k], K["rWr"][k], K["lSh"][k], hm(K)[k], F) for k in range(n)],
            "스티커": [er(mk("R2")[k], mk("R3")[k], mk("R5")[k], K["lSh"][k], hm(K)[k], F) for k in range(n)]}
    seg = lambda v: np.array(v[fp:rl + 2], float)
    e, kk = seg(rows["엔진"]), seg(rows["K4"])
    kf = np.array([x if np.isnan(x) else np.nanmedian(kk[max(0, i - 1):i + 2]) for i, x in enumerate(kk)])  # K4 는 한 장면씩 튀어 가운데값으로
    de = np.abs(np.diff(e[~np.isnan(e)]))
    SUM.append((p, np.nanmax(e), np.nanmax(kf), int((de > 25).sum())))
    if QUIET: continue
    print(f"== 투구 {p} 착지 {fp} 릴리스 {rl} (장면 {np.median(np.diff(te))*1000:.1f}ms)")
    for nm, v in rows.items():
        seg = v[fp:rl + 2]
        print(f"{nm:5s} 최대 {np.nanmax(seg) if not np.all(np.isnan(seg)) else float('nan'):6.1f} | " + " ".join("  -" if np.isnan(x) else f"{x:3.0f}" for x in seg))

if SUM:
    a = np.array([x[1:] for x in SUM]); d = a[:, 0] - a[:, 1]
    print(json.dumps({"layback_med": float(np.median(abs(d))), "layback_bias": float(d.mean()), "layback_jumps": int(a[:, 2].sum())}))
    print(f"레이백 최대 — 엔진 평균 {a[:,0].mean():.1f} · K4 평균 {a[:,1].mean():.1f} · |차| 가운데 {np.median(abs(d)):.1f} · 치우침 {d.mean():+.1f} · 상관 {np.corrcoef(a[:,0],a[:,1])[0,1]:.2f} · 튐(25° 넘게) {int(a[:,2].sum())}장면")
