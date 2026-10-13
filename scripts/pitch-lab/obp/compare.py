"""드라이브라인 공개 자료(OBP)로 우리 분리 재는 법(어깨 점 · 엉덩이 점 선, 위에서 본 각도 차)과 그들 값(흉곽 · 골반 틀 관절각)을 견준다.
python -I obp_sep.py <받은 폴더>
"""
import sys, zipfile
import numpy as np, pandas as pd

D = sys.argv[1]
lm = pd.read_csv(zipfile.ZipFile(f"{D}/pitching_landmarks.zip").open("landmarks.csv"))
ja = pd.read_csv(zipfile.ZipFile(f"{D}/pitching_joint_angles.zip").open("joint_angles.csv"),
                 usecols=["session_pitch", "time", "torso_pelvis_angle_z"])
poi = pd.read_csv(f"{D}/poi_metrics.csv")
df = lm.merge(ja, on=["session_pitch", "time"], how="left")
hand = dict(zip(poi.session_pitch, poi.p_throws))
wrap = lambda d: (d + 180) % 360 - 180
yaw = lambda x, y: np.degrees(np.arctan2(y, x))

rows = []
for sp, g in df.groupby("session_pitch", sort=False):
    if sp not in hand:
        continue
    g = g.sort_values("time")
    t = g.time.to_numpy()
    s = 1 if hand[sp] == "R" else -1
    pel = yaw(g.rear_hip_x - g.lead_hip_x, g.rear_hip_y - g.lead_hip_y).to_numpy()
    sho = yaw(g.shoulder_jc_x - g.glove_shoulder_jc_x, g.shoulder_jc_y - g.glove_shoulder_jc_y).to_numpy()
    # 흉곽 옆 축 = 흉곽 긴 축(prox - dist) × 앞 방향(ap - prox) — 어깨 점 대신 흉곽 틀(위에서 본 각도)
    L = np.stack([g.thorax_prox_x - g.thorax_dist_x, g.thorax_prox_y - g.thorax_dist_y, g.thorax_prox_z - g.thorax_dist_z], 1)
    A = np.stack([g.thorax_ap_x - g.thorax_prox_x, g.thorax_ap_y - g.thorax_prox_y, g.thorax_ap_z - g.thorax_prox_z], 1)
    ML = np.cross(L, A)
    tho = yaw(ML[:, 0], ML[:, 1])
    ours = s * wrap(pel - sho)
    thx = wrap(pel - tho)
    ref = g.torso_pelvis_angle_z.to_numpy()
    fp10, fp100, br = g.fp_10_time.iloc[0], g.fp_100_time.iloc[0], g.BR_time.iloc[0]
    at = lambda arr, tt: float(np.interp(tt, t, arr))
    win = (t >= fp10 - 0.15) & (t <= br)
    if win.sum() < 5:
        continue
    rows.append(dict(sp=sp, hand=hand[sp], ours_fp10=at(ours, fp10), ours_fp100=at(ours, fp100), ours_max=float(np.nanmax(ours[win])),
                     ours_br=at(ours, br), thx_raw=thx, ref_fp10=at(ref, fp10), ref_fp100=at(ref, fp100), ref_max=float(np.nanmax(ref[win])),
                     ref_br=at(ref, br), t_max_ours=float(t[win][np.nanargmax(ours[win])] - fp10), t_max_ref=float(t[win][np.nanargmax(ref[win])] - fp10),
                     _thx=thx, _ref=ref, _ours=ours, _t=t, _fp10=fp10, _br=br))
R = pd.DataFrame(rows)
P = R.merge(poi[["session_pitch", "max_rotation_hip_shoulder_separation", "rotation_hip_shoulder_separation_fp", "pitch_speed_mph"]],
            left_on="sp", right_on="session_pitch")
print(f"투구 {len(P)} (우 {sum(P.hand=='R')} · 좌 {sum(P.hand=='L')})")
# 흉곽 틀 부호 맞추기: 착지 때 ref 와 상관이 + 가 되게
sg = []
for _, r in P.iterrows():
    sg.append(np.sign(np.corrcoef(r._thx[np.isfinite(r._thx) & np.isfinite(r._ref)], r._ref[np.isfinite(r._thx) & np.isfinite(r._ref)])[0, 1]))
P["thx_sign"] = sg
P["thx_fp10"] = [float(np.interp(r._fp10, r._t, r.thx_sign * r._thx)) for _, r in P.iterrows()]
P["thx_max"] = [float(np.nanmax((r.thx_sign * r._thx)[(r._t >= r._fp10 - 0.15) & (r._t <= r._br)])) for _, r in P.iterrows()]

def cmp(a, b, name):
    d = (P[a] - P[b]).to_numpy(); ok = np.isfinite(d)
    print(f"{name:42s} 치우침 {np.mean(d[ok]):+6.1f}  SD {np.std(d[ok]):5.1f}  |차| 가운데 {np.median(np.abs(d[ok])):5.1f}  상관 {np.corrcoef(P[a][ok], P[b][ok])[0,1]:.2f}")

print("\n[poi 의 뜻 확인]")
cmp("ref_max", "max_rotation_hip_shoulder_separation", "joint_angles 최대 vs poi 최대")
cmp("ref_fp100", "rotation_hip_shoulder_separation_fp", "joint_angles fp100 vs poi fp")
cmp("ref_fp10", "rotation_hip_shoulder_separation_fp", "joint_angles fp10 vs poi fp")
print("\n[우리 방식 − 드라이브라인]")
cmp("ours_max", "max_rotation_hip_shoulder_separation", "최대 분리 (착지 150ms 전 ~ 릴리스)")
cmp("ours_fp10", "ref_fp10", "착지(체중 10%) 때")
cmp("ours_fp100", "ref_fp100", "착지(체중 100%) 때")
cmp("ours_br", "ref_br", "릴리스 때")
print("\n[까닭 나누기 — 어깨 점 대신 흉곽 틀을 위에서 본 각도로]")
cmp("thx_max", "max_rotation_hip_shoulder_separation", "흉곽 틀(위에서) 최대 − 드라이브라인")
cmp("ours_max", "thx_max", "어깨 점 최대 − 흉곽 틀(위에서) 최대")
print("\n[손별]")
for h in "RL":
    Q = P[P.hand == h]
    for col in ["ours_max", "max_rotation_hip_shoulder_separation"]:
        v = Q[col].to_numpy()
        print(f"  {h} {col:40s} 평균 {v.mean():5.1f} · 아래 10/25/50%: {np.percentile(v,10):5.1f} / {np.percentile(v,25):5.1f} / {np.percentile(v,50):5.1f}")
# 선수 평균으로 손별 기준(우리 판정은 선수 단위가 아니라 구 단위 백분위였음 — 같은 식으로 구 단위)
print("\n[최대 시점(착지 10% 기준, ms)] 우리 가운데", round(P.t_max_ours.median()*1000), " 드라이브라인 가운데", round(P.t_max_ref.median()*1000))
print("[구속과 상관] 우리", round(np.corrcoef(P.ours_max, P.pitch_speed_mph)[0,1], 2), " 드라이브라인", round(np.corrcoef(P.max_rotation_hip_shoulder_separation, P.pitch_speed_mph)[0,1], 2))
# 우리 판정 문턱으로 갈린 판정이 같은지(구 단위)
NORM = {"R": (24.8, 28.2), "L": (22.0, 24.3)}
def cls(v, h, err=3.4):
    p10, p25 = NORM[h]
    return "good" if v >= p25 else ("fair" if v >= p10 - 2 * err else "improve")
same = np.mean([cls(r.ours_max, r.hand) == cls(r.max_rotation_hip_shoulder_separation, r.hand) for _, r in P.iterrows()])
print(f"[지금 문턱으로 판정] 우리 값 vs 드라이브라인 값 같은 판정 {same*100:.0f}%")
for lab in ["good", "fair", "improve"]:
    a = np.mean([cls(r.ours_max, r.hand) == lab for _, r in P.iterrows()]); b = np.mean([cls(r.max_rotation_hip_shoulder_separation, r.hand) == lab for _, r in P.iterrows()])
    print(f"   {lab:8s} 우리 {a*100:4.0f}%  드라이브라인 {b*100:4.0f}%")
