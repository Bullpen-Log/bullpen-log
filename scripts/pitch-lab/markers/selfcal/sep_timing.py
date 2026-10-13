"""최대 상하체 분리 시점 — 투구마다 엔진 vs 네 대 교차(K4), 착지 기준 ms. (세션 폴더에서) python sep_timing.py"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
WORK = B.WORK
cal_path, world_path = os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json")
cal = json.load(open(cal_path)); toW = B.world_of(cal_path, world_path)
yaw = lambda v: np.degrees(np.arctan2(v[..., 1], v[..., 0])); wrap = lambda d: (d + 180) % 360 - 180
out = []
for p in range(2, 17):
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]; n = len(te); dt = float(np.median(np.diff(te)))
    J = np.array(r["joints"], float) / 1000.0
    K, A, Bb = {}, [], []
    for nm, (kn, sd) in B.K4_OF.items():
        X = toW(rec[f"K_{kn}_{sd}"]); T = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
        K[nm] = T; m = ~np.isnan(T[:, 0]); A.append(J[m, B.IX[nm]]); Bb.append(T[m])
    s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb)); E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
    Eg = {nm: E[:, B.IX[nm]] for nm in B.K4_OF}
    ev = r["events"]; ku, fp, rl = ev["kneeUp"], ev["footPlant"], ev["release"]
    sep = lambda G: wrap(yaw(G["lSh"] - G["rSh"]) - yaw(G["lHip"] - G["rHip"]))
    es, ks = sep(Eg), sep(K)
    sg = -1 if np.nanmedian(es[ku:fp + 1]) < 0 else 1; es, ks = es * sg, ks * sg
    w = list(range(ku, rl + 1))
    ke = max(w, key=lambda k: es[k]); kk = max((k for k in w if not np.isnan(ks[k])), key=lambda k: ks[k])
    out.append((p, (ke - fp) * dt * 1000, (kk - fp) * dt * 1000, es[ke], ks[kk], (rl - fp) * dt * 1000))
    print(f"p{p:02d} 엔진 최대 {es[ke]:5.1f}° @ {(ke-fp)*dt*1000:+5.0f}ms · K4 최대 {ks[kk]:5.1f}° @ {(kk-fp)*dt*1000:+5.0f}ms · 착지→릴리스 {(rl-fp)*dt*1000:4.0f}ms · 니업→착지 {(fp-ku)*dt*1000:4.0f}ms")
o = np.array([x[1:] for x in out]); d = o[:, 0] - o[:, 1]
print(f"시점 차 가운데 {np.median(abs(d)):.0f}ms · 최대 {abs(d).max():.0f} · 상관 {np.corrcoef(o[:,0],o[:,1])[0,1]:.2f} · 엔진 시점 SD {o[:,0].std():.0f} · K4 SD {o[:,1].std():.0f}")
