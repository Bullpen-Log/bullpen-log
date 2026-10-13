"""일정함 — 같은 선수 안 구마다 흔들림 · 선수 사이 퍼짐 · ICC 를 우리 자 · 드라이브라인 자로."""
import sys, zipfile
import numpy as np, pandas as pd

D = sys.argv[1]
lm = pd.read_csv(zipfile.ZipFile(f"{D}/pitching_landmarks.zip").open("landmarks.csv"))
poi = pd.read_csv(f"{D}/poi_metrics.csv")
info = poi.set_index("session_pitch")
wrap = lambda d: (d + 180) % 360 - 180
yaw = lambda x, y: np.degrees(np.arctan2(y, x))
rows = []
for sp, g in lm.groupby("session_pitch", sort=False):
    if sp not in info.index:
        continue
    g = g.sort_values("time"); t = g.time.to_numpy()
    s = 1 if info.loc[sp, "p_throws"] == "R" else -1
    ours = s * wrap(yaw(g.rear_hip_x - g.lead_hip_x, g.rear_hip_y - g.lead_hip_y) - yaw(g.shoulder_jc_x - g.glove_shoulder_jc_x, g.shoulder_jc_y - g.glove_shoulder_jc_y)).to_numpy()
    fp, br = g.fp_10_time.iloc[0], g.BR_time.iloc[0]
    w = (t >= fp - 0.15) & (t <= br)
    if not np.isfinite(fp) or w.sum() < 5:
        continue
    rows.append(dict(session=info.loc[sp, "session"], ours=float(np.nanmax(ours[w])), dl=float(info.loc[sp, "max_rotation_hip_shoulder_separation"])))
R = pd.DataFrame(rows).dropna()
R["gap"] = R.ours - R.dl
G = R.groupby("session").filter(lambda x: len(x) >= 3).groupby("session")
print(f"선수 {G.ngroups} (3구 넘게) · 구 {sum(len(x) for _, x in G)}")
for c, nm in [("ours", "우리 자(어깨 점 · 엉덩이 점)"), ("dl", "드라이브라인 자(흉곽 · 골반 틀)"), ("gap", "둘의 차(우리 − 드라이브라인)")]:
    within = G[c].std(ddof=1)
    wv = float(np.mean(G[c].var(ddof=1)))
    bv = float(np.var(G[c].mean(), ddof=1))
    k = float(np.mean(G.size()))
    icc = (bv - wv / k) / (bv - wv / k + wv)  # ICC(1) 근사
    print(f"{nm:30s} 같은 선수 구마다 SD 가운데 {within.median():4.1f}° · 선수 사이 SD {np.sqrt(bv):4.1f}° · ICC {icc:.2f}")
print("선수 평균끼리 상관(우리 vs 드라이브라인)", round(float(np.corrcoef(G.ours.mean(), G.dl.mean())[0, 1]), 2))
