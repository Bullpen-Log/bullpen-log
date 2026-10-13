import sys, zipfile
import numpy as np, pandas as pd
D = sys.argv[1]
lm = pd.read_csv(zipfile.ZipFile(f"{D}/pitching_landmarks.zip").open("landmarks.csv"))
poi = pd.read_csv(f"{D}/poi_metrics.csv"); info = poi.set_index("session_pitch")
wrap = lambda d: (d + 180) % 360 - 180
yaw = lambda x, y: np.degrees(np.arctan2(y, x))
rows = []
for sp, g in lm.groupby("session_pitch", sort=False):
    if sp not in info.index: continue
    g = g.sort_values("time"); t = g.time.to_numpy()
    s = 1 if info.loc[sp, "p_throws"] == "R" else -1
    o = s * wrap(yaw(g.rear_hip_x - g.lead_hip_x, g.rear_hip_y - g.lead_hip_y) - yaw(g.shoulder_jc_x - g.glove_shoulder_jc_x, g.shoulder_jc_y - g.glove_shoulder_jc_y)).to_numpy()
    fp, br = g.fp_10_time.iloc[0], g.BR_time.iloc[0]
    w = (t >= fp - 0.15) & (t <= br)
    if not np.isfinite(fp) or w.sum() < 5: continue
    k = np.nanargmax(np.where(w, o, -np.inf))
    rows.append(dict(session=info.loc[sp, "session"], hand=info.loc[sp, "p_throws"], mph=info.loc[sp, "pitch_speed_mph"], mx=o[k], atfp=float(np.interp(fp, t, o)), tms=(t[k]-fp)*1000))
R = pd.DataFrame(rows).dropna()
print("전체", len(R), "구", R.session.nunique(), "명 · 평균", round(R.mx.mean(),1), "±", round(R.mx.std(),1), "· 착지 값 가운데", round(R.atfp.median(),1), "· 최대-착지 가운데", round((R.mx-R.atfp).median(),1), "· 최대 시점 가운데", round(R.tms.median()), "ms")
for h in "RL":
    Q = R[R.hand == h]
    print(h, len(Q), "구", Q.session.nunique(), "명", "평균 %.1f ± %.1f" % (Q.mx.mean(), Q.mx.std()), "아래 10/25/50%%: %.1f / %.1f / %.1f" % tuple(np.percentile(Q.mx, [10, 25, 50])))
for lo, hi in [(78, 84), (84, 88)]:
    b = R[(R.mph >= lo) & (R.mph < hi)]
    print(f"{lo}~{hi}mph 우투 {b[b.hand=='R'].mx.mean():.1f} · 좌투 {b[b.hand=='L'].mx.mean():.1f}")
print("구속 상관(선수 평균)", round(np.corrcoef(R.groupby('session').mx.mean(), R.groupby('session').mph.mean())[0,1], 2))
