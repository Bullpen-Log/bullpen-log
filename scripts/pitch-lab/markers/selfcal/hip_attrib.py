"""착지 ±6장면: 두 대(1 옆 · 2 뒤) 교차 골반 각의 오차가 어느 카메라 2D 에서 오나.
열: K4 | 교차(RTMW1, RTMW2) | 교차(K4비춤1, RTMW2) | 교차(RTMW1, K4비춤2) — 모두 스티커 골반 각과의 차(°).
  MARKER_WORK=.../work_v2 python hip_attrib.py [옆 뒤]   (기본 1 2)
"""
import os, sys, json
from cams import CAMS
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
from kpba import proj, tri
from tracks import load_kp_full

WORK = B.WORK
CS, CB = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ("1", "2")
cal = json.load(open(os.path.join(WORK, "cal16b.json")))
toW = B.world_of(os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json"))
cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}
FPS = json.load(open(os.path.join(WORK, "fp_stickers.json")))
PS = [p for p in range(2, 17) if str(p) in FPS]
yaw = lambda v: float(np.degrees(np.arctan2(v[1], v[0])))
wrap = lambda d: (d + 180) % 360 - 180
COLS = ["K4", f"교차(R{CS},R{CB})", f"교차(K{CS},R{CB})", f"교차(R{CS},K{CB})"]
tot = {c: [] for c in COLS}
print("착지 ±6장면 가운데 골반 각 − 스티커(°)")
print("     " + "".join(f"{c:>16s}" for c in COLS))
for p in PS:
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); tq = rec["tq"]
    off = cal["offsets"][str(p)]
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    te = np.array(r["t"]) - off["1"]; fp = r["events"]["footPlant"]
    K = {sd: rec[f"K_hip_{sd}"] for sd in "LR"}
    raw = {c: load_kp_full(p, c) for c in (CS, CB)}
    ys = {c: [] for c in COLS}
    for k in range(max(0, fp - 6), min(len(te), fp + 7)):
        X = {sd: np.array([np.interp(te[k], tq, K[sd][:, a]) for a in range(3)]) for sd in "LR"}
        if any(np.isnan(X[sd][0]) for sd in "LR"): continue
        o2 = {}
        for c in (CS, CB):
            t2, kp, sc = raw[c]; tt = te[k] + off[c]
            i = int(np.clip(np.searchsorted(t2, tt) - 1, 0, len(t2) - 2)); w = float(np.clip((tt - t2[i]) / max(t2[i + 1] - t2[i], 1e-9), 0, 1))
            for sd, j in (("L", 11), ("R", 12)):
                if sc[i, j] >= 0.3 * B.SCORE_SCALE: o2[(c, sd)] = kp[i, j] * (1 - w) + kp[i + 1, j] * w
        if len(o2) < 4: continue
        kproj = {(c, sd): proj(cams[c], X[sd][None])[0] for c in (CS, CB) for sd in "LR"}
        ys["K4"].append(yaw(toW(X["L"]) - toW(X["R"])))
        def Y(a, b):
            P = {sd: toW(tri(cams, [(CS, a[(CS, sd)]), (CB, b[(CB, sd)])])) for sd in "LR"}
            return yaw(P["L"] - P["R"])
        ys[COLS[1]].append(Y(o2, o2)); ys[COLS[2]].append(Y(kproj, o2)); ys[COLS[3]].append(Y(o2, kproj))
    pel = FPS[str(p)]["pel"]
    line = f"p{p:02d}"
    for c in COLS:
        d = wrap(float(np.median(ys[c])) - pel) if ys[c] else np.nan
        tot[c].append(d); line += f"{d:16.1f}"
    print(line)
print("치우침" + "".join(f"{np.nanmean(v):16.1f}" for v in tot.values()))
print("|차|중앙" + "".join(f"{np.nanmedian(np.abs(v)):15.1f}" for v in tot.values()))
print("SD    " + "".join(f"{np.nanstd(v):16.1f}" for v in tot.values()))
