"""OBP 를 우리 자(어깨 점 · 엉덩이 점, 디딤 방향 기준 열림)로 — 김민 마커 정답(mech_truth.py 와 같은 식)과 같은 자로 견주기."""
import sys, zipfile
import numpy as np, pandas as pd

D = sys.argv[1]
lm = pd.read_csv(zipfile.ZipFile(f"{D}/pitching_landmarks.zip").open("landmarks.csv"))
poi = pd.read_csv(f"{D}/poi_metrics.csv")
hand = dict(zip(poi.session_pitch, poi.p_throws)); mph = dict(zip(poi.session_pitch, poi.pitch_speed_mph))
wrap = lambda d: (d + 180) % 360 - 180
yaw = lambda v: float(np.degrees(np.arctan2(v[1], v[0])))
P = lambda g, nm, tt: np.array([np.interp(tt, g.time, g[f"{nm}_{a}"]) for a in "xyz"])
rows = []
for sp, g in lm.groupby("session_pitch", sort=False):
    if sp not in hand:
        continue
    g = g.sort_values("time")
    ku, fp, br = g.pkh_time.iloc[0], g.fp_10_time.iloc[0], g.BR_time.iloc[0]
    sy = yaw(P(g, "lead_ankle_jc", fp) - P(g, "rear_ankle_jc", ku))
    op = lambda a, b, tt: wrap(yaw(P(g, a, tt) - P(g, b, tt)) - sy)
    rows.append(dict(sp=sp, hand=hand[sp], mph=mph[sp],
                     pel_fp=op("lead_hip", "rear_hip", fp), tr_fp=op("glove_shoulder_jc", "shoulder_jc", fp),
                     pel_br=op("lead_hip", "rear_hip", br), pel_ku=op("lead_hip", "rear_hip", ku)))
R = pd.DataFrame(rows).dropna()
for h in "RL":  # 열수록 + 가 되게 손별 부호
    m = R.hand == h
    s = np.sign(np.median(R.loc[m, "pel_br"] - R.loc[m, "pel_ku"]))
    for c in ["pel_fp", "tr_fp", "pel_br", "pel_ku"]:
        R.loc[m, c] *= s
R["sep_fp"] = R.pel_fp - R.tr_fp
q = lambda v: f"가운데 {np.median(v):5.1f} · 아래 10% {np.percentile(v,10):5.1f} · 위 10% {np.percentile(v,90):5.1f}"
print(f"투구 {len(R)}  (우리 자 · 착지 = 체중 10%)")
print("골반 열림(디딤 방향 기준)   ", q(R.pel_fp))
print("몸통(어깨선) 열림           ", q(R.tr_fp))
print("착지 때 분리(골반 − 어깨)   ", q(R.sep_fp))
print("\n김민 마커 정답(같은 자, 15구 가운데): 골반 16.8 · 어깨 4.5 · 착지 분리 12.3 · 최대 분리 23.5")
fast = R[R.mph >= R.mph.quantile(2/3)]
print("OBP 빠른 1/3 착지 분리       ", q(fast.sep_fp))
print("착지 분리 30 밑 비율", round(float((R.sep_fp < 30).mean() * 100)), "% · 20 밑", round(float((R.sep_fp < 20).mean() * 100)), "%")
