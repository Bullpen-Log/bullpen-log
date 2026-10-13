"""최대 상하체 분리 시점 — 투구마다 엔진 vs 네 대 교차(K4), 착지 기준 ms. (세션 폴더에서) python sep_timing.py

찾는 법 셋을 나란히(2026-10-13, 메커니즘 점검 1단계):
  옛    — 니업~릴리스 중 최대(다리 들 때 분리가 평평하면 니업 쪽 끝을 잡는다 — p12 −888ms)
  좁힘  — 착지 150ms 전 ~ 릴리스 중 최대(공개 자료: 최대 분리는 착지 무렵 · 직후)
  90%   — 좁힌 구간에서 그 최대의 90% 에 처음 닿는 때(꼭대기가 평평할 때 덜 흔들린다)
엔진 · 정답 모두 같은 법으로 찾는다. 착지 · 릴리스는 엔진이 찾은 순간(순간 찾기 오차는 안 잰 것).
"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
WORK = B.WORK
PRE_MS = 150.0  # 착지 전 얼마부터 찾나
FRAC = 0.9
cal_path, world_path = os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json")
cal = json.load(open(cal_path)); toW = B.world_of(cal_path, world_path)
yaw = lambda v: np.degrees(np.arctan2(v[..., 1], v[..., 0])); wrap = lambda d: (d + 180) % 360 - 180


def peak(sep, ks):
    """구간 ks 에서 (최대 장면, 90% 처음 장면). 값이 없으면 None."""
    ks = [k for k in ks if not np.isnan(sep[k])]
    if not ks:
        return None, None
    km = max(ks, key=lambda k: sep[k])
    k90 = next(k for k in ks if sep[k] >= FRAC * sep[km])
    return km, k90


out = {"옛": [], "좁힘": [], "90%": []}
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
    sg = -1 if r["hand"] == "R" else 1; es, ks = es * sg, ks * sg  # 손으로 부호 — 골반이 더 열린 만큼 = +, 세상 좌표 옆 축이 왼쪽이라 우투가 −(가운데값으로 정하면 0 근처 투구에서 뒤집힌다)
    ms = lambda k: (k - fp) * dt * 1000
    old = range(ku, rl + 1)
    nar = range(max(0, fp - int(round(PRE_MS / 1000 / dt))), rl + 1)
    (eo, _), (ko, _) = peak(es, old), peak(ks, old)
    (en, e9), (kn_, k9) = peak(es, nar), peak(ks, nar)
    out["옛"].append((ms(eo), ms(ko)))
    out["좁힘"].append((ms(en), ms(kn_)))
    out["90%"].append((ms(e9), ms(k9)))
    print(f"p{p:02d} 옛 엔진 {ms(eo):+5.0f} · K4 {ms(ko):+5.0f} | 좁힘 엔진 {ms(en):+5.0f} ({es[en]:4.1f}°) · K4 {ms(kn_):+5.0f} ({ks[kn_]:4.1f}°)"
          f" | 90% 엔진 {ms(e9):+5.0f} · K4 {ms(k9):+5.0f} | 착지→릴리스 {ms(rl):4.0f}ms")
for nm, v in out.items():
    o = np.array(v); d = o[:, 0] - o[:, 1]
    print(f"{nm:4s} 시점 차 가운데 {np.median(abs(d)):3.0f}ms · 최대 {abs(d).max():4.0f} · 치우침 {d.mean():+4.0f} · 상관 {np.corrcoef(o[:,0],o[:,1])[0,1]:.2f}"
          f" · 엔진 SD {o[:,0].std():3.0f} · K4 SD {o[:,1].std():3.0f}")
