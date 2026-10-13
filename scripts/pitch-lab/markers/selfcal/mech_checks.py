"""메커니즘 네 가지(드리프트 · 착지 골반 수평 · 최대 분리 시점 · 리드레그 블록)를 엔진이 잴 수 있나 — 엔진 vs 정답(K4 · 스티커). (세션 폴더에서)"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
import pelvis_score as PS
WORK = B.WORK
cal_path, world_path = os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json")
cal = json.load(open(cal_path)); toW = B.world_of(cal_path, world_path)
tpl, _ = PS.pelvis_template(toW)
U = np.array([0, 0, 1.0])
hz = lambda v: v - np.outer(v @ U, U) if v.ndim == 2 else v - U * (v @ U)
yaw = lambda v: np.degrees(np.arctan2(v[..., 1], v[..., 0]))
wrap = lambda d: (d + 180) % 360 - 180
rows = {}
def put(k, p, e, t):
    if e is None or t is None or np.isnan(e) or np.isnan(t): return
    rows.setdefault(k, []).append((p, e, t))
for p in range(2, 17):
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    if not r.get("ok"): continue
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]; n = len(te)
    J = np.array(r["joints"], float) / 1000.0
    K, A, Bb = {}, [], []
    for nm, (kn, sd) in B.K4_OF.items():
        X = toW(rec[f"K_{kn}_{sd}"])
        T = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
        K[nm] = T; m = ~np.isnan(T[:, 0]); A.append(J[m, B.IX[nm]]); Bb.append(T[m])
    s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb))
    E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
    Eg = {nm: E[:, B.IX[nm]] for nm in B.K4_OF}
    fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz")); ftq = fl["tq"]
    near = np.clip(np.round((te - ftq[0]) / (ftq[1] - ftq[0])).astype(int), 0, len(ftq) - 1); okt = np.abs(ftq[near] - te) < 0.5 / 240
    def mk(nm):
        if "M_" + nm not in fl.files: return np.full((n, 3), np.nan)
        X = toW(fl["M_" + nm])[near]; X[~okt] = np.nan; return X
    S = {nm: mk(nm) for nm in PS.PEL}
    ev = r["events"]; ku, fp, rl = ev["kneeUp"], ev["footPlant"], ev["release"]
    dt = float(np.median(np.diff(te)))
    hm = lambda G: (G["lHip"] + G["rHip"]) / 2
    F = hz(hm(K)[fp] - hm(K)[ku]); F /= np.linalg.norm(F); G = np.cross(U, F)
    # 1 드리프트 — 골반 가운데가 뒷발목(축발)보다 앞에 있는 거리(cm), 준비(첫 장면 근처) → 니업 사이 늘어난 만큼
    for nm_, Gs in (("e", Eg), ("k", K)):
        pass
    def ahead(Gs, k): return float((hm(Gs)[k] - Gs["rAn"][k]) @ F * 100)
    k0 = next((k for k in range(0, ku) if not np.isnan(K["lHip"][k, 0]) and not np.isnan(K["rAn"][k, 0])), None)
    if k0 is not None:
        put("드리프트: 니업 때 골반이 축발보다 앞(cm)", p, ahead(Eg, ku), ahead(K, ku))
        put("드리프트: 준비 → 니업 앞으로 간 거리(cm)", p, ahead(Eg, ku) - ahead(Eg, k0), ahead(K, ku) - ahead(K, k0))
        vF = lambda Gs, k: float((hm(Gs)[min(k + 2, n - 1)] - hm(Gs)[max(k - 2, 0)]) @ F / (4 * dt))
        put("드리프트: 니업 때 앞으로 가는 속도(m/s)", p, vF(Eg, ku), vF(K, ku))
    # 2 착지 골반 수평 — 엉덩이선(축발 쪽 → 글러브 쪽) 기울기(°, + = 글러브 쪽 엉덩이가 높음)
    obl = lambda a, b: float(np.degrees(np.arctan2((b - a) @ U, np.linalg.norm(hz(b - a)))))
    put("골반 수평: 착지 때 엉덩이선 기울기 vs K4(°)", p, obl(Eg["rHip"][fp], Eg["lHip"][fp]), obl(K["rHip"][fp], K["lHip"][fp]))
    best = None
    for d in range(0, 8):
        for k in (fp - d, fp + d):
            if 0 <= k < n:
                for a, b in (("R_PSIS", "L_PSIS"), ("R_ASIS", "L_ASIS")):
                    if not np.isnan(S[a][k, 0]) and not np.isnan(S[b][k, 0]): best = best or (k, a, b)
    if best:
        k, a, b = best
        put("골반 수평: 착지 근처 엉덩이선 vs 골반 스티커 짝(°)", p, obl(Eg["rHip"][k], Eg["lHip"][k]), obl(S[a][k], S[b][k]))
    # 3 최대 분리 시점 — 어깨선 yaw − 골반 yaw. 정답 골반 = 스티커 틀, 어깨 = K4. 착지 기준 ms
    es = wrap(yaw(Eg["lSh"] - Eg["rSh"]) - yaw(Eg["lHip"] - Eg["rHip"]))
    pt = np.array([PS.pelvis_yaw(tpl, {nm: S[nm][k] for nm in PS.PEL}) for k in range(n)])
    ts = wrap(yaw(K["lSh"] - K["rSh"]) - pt)
    sg = -1 if r["hand"] == "R" else 1  # 손으로 부호 — 골반이 더 열린 만큼 = +, 세상 좌표 옆 축이 왼쪽이라 우투가 −(가운데값으로 정하면 0 근처 투구에서 뒤집힌다)
    es, ts = es * sg, ts * sg
    win = range(max(0, fp - int(round(0.150 / dt))), rl + 1)  # 착지 150ms 전 ~ 릴리스(sep_timing.py '좁힘' — 니업부터면 다리 들 때 평평한 투구가 튄다)
    cov = np.mean([not np.isnan(ts[k]) for k in win])
    ke = max(win, key=lambda k: es[k])
    put("최대 분리 시점(착지 기준 ms) · 엔진 혼자", p, (ke - fp) * dt * 1000, (ke - fp) * dt * 1000)
    if cov > 0.6:
        kt = max((k for k in win if not np.isnan(ts[k])), key=lambda k: ts[k])
        put("최대 분리 시점(착지 기준 ms) vs 스티커 정답", p, (ke - fp) * dt * 1000, (kt - fp) * dt * 1000)
    rows.setdefault("_cov", []).append((p, cov, cov))
    # 4 리드레그 블록 — 앞무릎 굽힘(착지 · 릴리스 · 착지→릴리스 펴진 만큼 · 착지 뒤 가장 굽은 것), 골반 앞 속도 줄어든 몫
    def knee(Gs, k):
        a, b = Gs["lHip"][k] - Gs["lKn"][k], Gs["lAn"][k] - Gs["lKn"][k]
        return 180 - float(np.degrees(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1))))
    for nm_, f in (("착지", lambda Gs: knee(Gs, fp)), ("릴리스", lambda Gs: knee(Gs, rl)), ("펴진 만큼(릴리스−착지, +=펴짐)", lambda Gs: knee(Gs, fp) - knee(Gs, rl)),
                   ("착지 뒤 더 굽은 만큼", lambda Gs: max(knee(Gs, k) for k in range(fp, rl + 1)) - knee(Gs, fp))):
        put(f"블록: 앞무릎 {nm_}(°)", p, f(Eg), f(K))
    def decel(Gs):
        v = np.array([(hm(Gs)[min(k + 1, n - 1)] - hm(Gs)[max(k - 1, 0)]) @ F / (2 * dt) for k in range(n)])
        pk = np.nanmax(v[ku:fp + 1]); return float((pk - v[rl]) / pk * 100)
    put("블록: 골반 앞 속도 줄어든 몫(착지 전 최고 → 릴리스, %)", p, decel(Eg), decel(K))
print(f"{'항목':44s} 투구  엔진 평균  정답 평균  |차| 가운데  |차| 최대  치우침  정답 폭(SD)  상관")
for k, v in rows.items():
    if k == "_cov":
        print(f"(최대 분리 시점: 니업~릴리스 중 스티커 정답이 있는 장면 비율 평균 {np.mean([x[1] for x in v]):.2f})"); continue
    v = np.array([x[1:] for x in v]); d = v[:, 0] - v[:, 1]
    c = np.corrcoef(v[:, 0], v[:, 1])[0, 1] if len(v) > 2 and v[:, 1].std() > 1e-9 and v[:, 0].std() > 1e-9 else float("nan")
    print(f"{k:44s} {len(v):3d}  {v[:,0].mean():8.2f}  {v[:,1].mean():8.2f}  {np.median(abs(d)):8.2f}  {abs(d).max():8.2f}  {d.mean():+6.2f}  {v[:,1].std():7.2f}  {c:5.2f}")
