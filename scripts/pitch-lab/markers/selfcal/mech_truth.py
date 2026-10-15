"""메커니즘 점검 넷의 정답(K4 — 네 대 교차, 미터)을 투구마다 JSON 으로 — 앱 계산(lib/pitch-3d/v2/mech-checks.ts)을 채점할 때.
(세션 폴더에서) python mech_truth.py → work/mech_truth.json

식은 mech_checks.py 의 K4 쪽과 같다(분리 시점은 착지 150ms 전 ~ 릴리스). 순간(니업 · 착지 · 릴리스)은 엔진 것 — 순간 찾기 오차는 안 잰다.
"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
WORK = B.WORK
cal_path, world_path = os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json")
cal = json.load(open(cal_path)); toW = B.world_of(cal_path, world_path)
U = np.array([0, 0, 1.0])
hz = lambda v: v - U * (v @ U)
yaw = lambda v: np.degrees(np.arctan2(v[..., 1], v[..., 0])); wrap = lambda d: (d + 180) % 360 - 180
out = {}
for p in range(2, 17):
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    if not r.get("ok"):
        continue
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]; n = len(te)
    K = {nm: np.array([[np.interp(tt, tq, toW(rec[f"K_{kn}_{sd}"])[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
         for nm, (kn, sd) in B.K4_OF.items()}
    # 착지 = 앱 점검과 같은 장면(앞발 전체가 닿은 footFlat, 옛 결과는 footPlant) — 다른 장면끼리 견주면 앞무릎 착지 상관이 0.75 → 0.69 로 보였다(2026-10-15)
    ev = r["events"]; ku, fp, rl = ev["kneeUp"], ev.get("footFlat", ev["footPlant"]), ev["release"]
    hm = (K["lHip"] + K["rHip"]) / 2
    F = hz(hm[fp] - hm[ku]); F /= np.linalg.norm(F)
    ahead = lambda k: float((hm[k] - K["rAn"][k]) @ F * 100)
    k0 = next((k for k in range(0, ku) if not np.isnan(hm[k, 0]) and not np.isnan(K["rAn"][k, 0])), None)
    a, b = max(ku - 2, 0), min(ku + 2, n - 1)
    hv = K["lHip"][fp] - K["rHip"][fp]
    sep = wrap(yaw(K["lSh"] - K["rSh"]) - yaw(K["lHip"] - K["rHip"]))
    sg = -1 if r["hand"] == "R" else 1  # 골반이 어깨보다 더 열린 만큼 = +. 세상 좌표 옆 축이 왼쪽(world.py y = 위 × 앞)이라 우투가 −. 가운데값으로 정하면 0 근처 투구에서 뒤집힌다
    w = [k for k in range(n) if te[fp] - te[k] <= 0.150 + 1e-9 and k <= rl and not np.isnan(sep[k])]
    kp = max(w, key=lambda k: sg * sep[k])
    syaw = float(yaw(K["lAn"][fp] - K["rAn"][ku]))  # 디딤 방향(앱과 같은 기준 — 우투 앞발 = 왼발)
    knee = lambda k: 180 - float(np.degrees(np.arccos(np.clip(((K["lHip"][k] - K["lKn"][k]) @ (K["lAn"][k] - K["lKn"][k])) /
                                 np.linalg.norm(K["lHip"][k] - K["lKn"][k]) / np.linalg.norm(K["lAn"][k] - K["lKn"][k]), -1, 1))))
    vf = lambda k: float((hm[min(k + 1, n - 1)] - hm[max(k - 1, 0)]) @ F / (te[min(k + 1, n - 1)] - te[max(k - 1, 0)]))
    pk = np.nanmax([vf(k) for k in range(ku, fp + 1)])
    # 몸통이 도는 때 — 어깨선이 '착지 − 0.4구간 ~ 공 놓기 + 0.3구간' 동안 돈 양의 절반, 착지 → 공 놓기 %(앱 mech-checks trunkHalfPct 와 같은 식)
    span = te[rl] - te[fp]
    ws = [k for k in range(n) if te[fp] - 0.4 * span - 1e-9 <= te[k] <= te[rl] + 0.3 * span + 1e-9 and not np.isnan(K["lSh"][k, 0] + K["rSh"][k, 0])]
    ys = np.unwrap(np.radians(yaw(K["lSh"][ws] - K["rSh"][ws]))); ys = np.degrees(ys)
    half = None
    if len(ys) > 2 and abs(ys[-1] - ys[0]) >= 20:
        fr = (ys - ys[0]) / (ys[-1] - ys[0]); i = int(np.argmax(fr >= 0.5))
        if i > 0:
            th = te[ws[i - 1]] + (0.5 - fr[i - 1]) / (fr[i] - fr[i - 1]) * (te[ws[i]] - te[ws[i - 1]])
            half = float((th - te[fp]) / span * 100)
    out[p] = {
        "aheadAtKneeUpCm": ahead(ku), "travelCm": ahead(ku) - ahead(k0) if k0 is not None else None,
        "speedMs": float((hm[b] - hm[a]) @ F / (te[b] - te[a])),
        "tiltDeg": float(np.degrees(np.arctan2(hv @ U, np.linalg.norm(hz(hv))))),
        "peakMs": float((te[kp] - te[fp]) * 1000), "peakDeg": float(sg * sep[kp]), "atPlantDeg": float(sg * sep[fp]),
        "trunkOpenAtPlantDeg": float(-sg * wrap(yaw(K["lSh"][fp] - K["rSh"][fp]) - syaw)), "pelvisOpenAtPlantDeg": float(-sg * wrap(yaw(K["lHip"][fp] - K["rHip"][fp]) - syaw)),
        "trunkHalfPct": half,
        "pelvisDecelPct": float((pk - vf(rl)) / pk * 100),
        "kneeAtPlantDeg": knee(fp), "kneeAtReleaseDeg": knee(rl), "kneeExtensionDeg": knee(fp) - knee(rl),
        "kneeCollapseDeg": max(knee(k) for k in range(fp, rl + 1)) - knee(fp),
    }
json.dump(out, open(os.path.join(WORK, "mech_truth.json"), "w"), indent=1)
print(f"{len(out)}구 → {os.path.join(WORK, 'mech_truth.json')}")
