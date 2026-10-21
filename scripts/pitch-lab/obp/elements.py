"""OBP 를 우리 엔진 식으로 — 드롭 · 브레이크 · 몸통 회전 · 팔 늦음 지표의 분포와 구속 상관(2026-10-21 김민: 요소별 진단 기준을 다시).

식은 lib/pitch-3d/metrics.ts · v2/mech-checks.ts 와 같게 둔다(관절 가운데 점만 쓴다 — 드라이브라인 poi 의 관절 각과 다를 수 있어 둘 다 낸다).
  U = 위(z), F = 디딤 방향(니업 때 뒷발목 → 착지 때 앞발목, 수평), G = 글러브 쪽 수평.
  착지 = 체중 10%(fp_10), 니업 = pkh, 릴리스 = BR. 길이는 다리 길이(뒷다리 엉덩이-무릎-발목, 니업 때)로 나눈다(자료에 키가 없다).
드롭(김민 정의): 니업 뒤 → 착지까지 골반 가운데가 가라앉는가. 높이는 '발 사이 바닥'(니업 때 뒷발목 ↔ 착지 때 앞발목 높이를
  골반의 F 자리로 이은 선) 위로 잰다 — 마운드 경사를 빼려고. 우리 사용자는 평지도 있다.
쓰기: python -I scripts/pitch-lab/obp/elements.py ~/obp-dl  (numpy 만 — 맥 ~/bullpen-marker-lab/.venv)
"""
import sys, csv, zipfile, io
from collections import defaultdict
import numpy as np

D = sys.argv[1]
# 판다스 없이 읽는다(맥 마커 venv 에 numpy 만 있다)
poi = {}
with open(f"{D}/poi_metrics.csv", newline="") as f:
    for r in csv.DictReader(f):
        poi[r["session_pitch"]] = r
num = lambda x: float(x) if x not in ("", "NA", "nan") else np.nan
groups = defaultdict(list)
with zipfile.ZipFile(f"{D}/pitching_landmarks.zip") as z, z.open("landmarks.csv") as fb:
    rd = csv.reader(io.TextIOWrapper(fb, newline=""))
    head = next(rd)
    for r in rd:
        groups[r[0]].append(r)
col = {h: i for i, h in enumerate(head)}


class Pitch:
    def __init__(self, rows):
        a = np.array([[num(x) for x in r[1:]] for r in rows])
        a = a[np.argsort(a[:, 0])]
        self.a = a
        self.time = a[:, 0]

    def __getitem__(self, name):
        return self.a[:, col[name] - 1]


U = np.array([0.0, 0.0, 1.0])
unit = lambda v: v / np.linalg.norm(v)
flat = lambda v: v - np.dot(v, U) * U
ang = lambda a, b: float(np.degrees(np.arccos(np.clip(np.dot(unit(a), unit(b)), -1, 1))))


def pick(g, nm, tt):
    return np.array([np.interp(tt, g.time, g[f"{nm}_{a}"]) for a in "xyz"])


rows = []
for sp, rws in groups.items():
    if sp not in poi:
        continue
    g = Pitch(rws)
    ku, fp, br = g["pkh_time"][0], g["fp_10_time"][0], g["BR_time"][0]
    if not (ku < fp < br):
        continue
    q = poi[sp]
    hand = q["p_throws"]
    P = lambda nm, tt: pick(g, nm, tt)
    F = unit(flat(P("lead_ankle_jc", fp) - P("rear_ankle_jc", ku)))
    # 글러브 쪽: 손별로 한 방향(구마다 정하면 니업 때 어깨가 홈 쪽을 봐 부호가 튄다). 손별 다수결 부호는 아래 gsign 이 바로잡는다
    G = np.cross(U, F) * (1 if hand == "R" else -1)
    leg = np.linalg.norm(P("rear_hip", ku) - P("rear_knee_jc", ku)) + np.linalg.norm(P("rear_knee_jc", ku) - P("rear_ankle_jc", ku))
    pel = lambda tt: (P("rear_hip", tt) + P("lead_hip", tt)) / 2
    sh = lambda tt: (P("shoulder_jc", tt) + P("glove_shoulder_jc", tt)) / 2
    # 발 사이 바닥: 뒷발목(니업) ↔ 앞발목(착지), 골반의 F 자리에서 높이
    a0, a1 = P("rear_ankle_jc", ku), P("lead_ankle_jc", fp)
    span = np.dot(a1 - a0, F)

    def height(tt):
        p = pel(tt)
        s = np.clip(np.dot(p - a0, F) / span, 0, 1)
        return (p[2] - (a0[2] + s * (a1[2] - a0[2]))) / leg

    ts = np.linspace(ku, fp, 40)
    hs = np.array([height(t) for t in ts])
    # 앞무릎 굽힘(도) = 180 − 엉덩이-무릎-발목 각
    knee = lambda tt: 180 - ang(P("lead_hip", tt) - P("lead_knee_jc", tt), P("lead_ankle_jc", tt) - P("lead_knee_jc", tt))
    tb = np.linspace(fp, br, 30)
    kb = np.array([knee(t) for t in tb])
    # 골반 앞 빠르기(F 성분) — 니업 → 릴리스
    tv = np.linspace(ku, br, 80)
    xs = np.array([np.dot(pel(t), F) for t in tv])
    v = np.gradient(xs, tv)
    vmax_pre = v[tv <= fp].max()
    v_br = v[-1]
    # 몸통 기울기(엔진 trunkTilt 식)
    T = sh(br) - pel(br)
    fwd_br = float(np.degrees(np.arctan2(np.dot(T, F), np.dot(T, U))))
    lat_br = float(np.degrees(np.arctan2(np.dot(T, G), np.dot(T, U))))
    Tf = sh(fp) - pel(fp)
    fwd_fp = float(np.degrees(np.arctan2(np.dot(Tf, F), np.dot(Tf, U))))
    # 어깨선이 착지 → 릴리스 사이 돈 양(위에서 본 각)
    yaw = lambda tt: np.degrees(np.arctan2(*np.flip([np.dot(flat(P("glove_shoulder_jc", tt) - P("shoulder_jc", tt)), d) for d in (F, G)])))
    rot = (yaw(br) - yaw(fp) + 180) % 360 - 180
    # 팔(착지 때): 어깨 벌림(엔진 식) · 팔꿈치 높이 · 아래팔 들림
    S, E, W = P("shoulder_jc", fp), P("elbow_jc", fp), P("wrist_jc", fp)
    abd = ang(E - S, -Tf)
    elbow_h = (E[2] - S[2]) / np.linalg.norm(E - S)  # +1 = 팔꿈치가 어깨 바로 위
    fore_up = float(np.degrees(np.arcsin(np.clip((W[2] - E[2]) / np.linalg.norm(W - E), -1, 1))))  # + = 손이 팔꿈치보다 위
    rows.append(dict(
        sp=sp, hand=hand, mph=num(q["pitch_speed_mph"]),
        drop=hs[0] - hs[-1], rise=hs.max() - hs[0], drop_min=hs[0] - hs.min(),
        com_drop=(np.interp(ku, g.time, g["centerofmass_z"]) - np.interp(fp, g.time, g["centerofmass_z"])) / leg,
        knee_fp=kb[0], knee_br=kb[-1], knee_ext=kb[0] - kb[-1], knee_sink=kb.max() - kb[0],
        decel=(vmax_pre - v_br) / vmax_pre * 100,
        fwd_br=fwd_br, lat_br=lat_br, fwd_fp=fwd_fp, rot=abs(rot),
        abd_fp=abd, elbow_h=elbow_h, fore_up=fore_up,
        poi_knee_ext=num(q["lead_knee_extension_from_fp_to_br"]),
        poi_fwd_br=num(q["torso_anterior_tilt_br"]), poi_lat_br=num(q["torso_lateral_tilt_br"]),
        poi_abd_fp=num(q["shoulder_abduction_fp"]), poi_er_fp=num(q["shoulder_external_rotation_fp"]),
        poi_cog=num(q["max_cog_velo_x"]), arm_slot=num(q["arm_slot"]), session=q["session"],
    ))

# 좌표계 손잡이를 몰라 G 가 거꾸로일 수 있다 — 대부분 릴리스 때 몸통이 글러브 쪽으로 기우는 것(poi 옆 기울기 부호)에 맞춘다
gsign = np.sign(np.nanmedian([r["lat_br"] * num(poi[r["sp"]]["torso_lateral_tilt_br"]) for r in rows]))
for r in rows:
    r["lat_br"] *= gsign
R = [r for r in rows if all(np.isfinite(r[k]) for k in ("drop", "knee_ext", "fwd_br", "abd_fp", "mph"))]
V = lambda k: np.array([r[k] for r in R], float)
sess = sorted({r["session"] for r in R})
print(f"투구 {len(R)} · 선수 {len(sess)} · 우투 {sum(r['hand'] == 'R' for r in R)} · 좌투 {sum(r['hand'] == 'L' for r in R)}")


def by_athlete(k):
    out = defaultdict(list)
    for r in R:
        if np.isfinite(r[k]):
            out[r["session"]].append(r[k])
    return out


def corr(x, y):
    m = np.isfinite(x) & np.isfinite(y)
    return float(np.corrcoef(x[m], y[m])[0, 1])


def line(name, k, u=""):
    v = V(k); v = v[np.isfinite(v)]
    q = np.percentile(v, [10, 25, 50, 75, 90])
    ba = by_athlete(k); bm = by_athlete("mph")
    means = np.array([np.mean(ba[s]) for s in sess if s in ba]); mph = np.array([np.mean(bm[s]) for s in sess if s in ba])
    within = np.median([np.std(x, ddof=1) for x in ba.values() if len(x) > 1])
    print(f"{name:26s} 10/25/50/75/90% {q[0]:7.2f} {q[1]:7.2f} {q[2]:7.2f} {q[3]:7.2f} {q[4]:7.2f}{u}"
          f" · 구속 상관 {corr(means, mph):+.2f} · 같은 선수 {within:.2f} · 선수 사이 {np.std(means, ddof=1):.2f}")


print("\n[드롭] 니업 → 착지, 다리 길이 비율(+ = 가라앉음)")
line("골반 높이 내려간 몫", "drop")
line("그사이 니업보다 올라간 최대", "rise")
line("무게중심 높이 내려간 몫", "com_drop")
print(f"  안 가라앉거나 뜬 구(≤ 0): 골반 {np.mean(V('drop') <= 0) * 100:.0f}% · 무게중심 {np.mean(V('com_drop') <= 0) * 100:.0f}% · 골반 vs 무게중심 상관 {corr(V('drop'), V('com_drop')):+.2f}")
print("\n[브레이크]")
line("앞무릎 굽힘 착지", "knee_fp", "°")
line("앞무릎 굽힘 릴리스", "knee_br", "°")
line("앞무릎 펴짐 착지→릴리스", "knee_ext", "°")
line("앞무릎 더 굽음(착지 뒤 최대)", "knee_sink", "°")
line("골반 앞 빠르기 줄어든 몫", "decel", "%")
print(f"  우리 펴짐 vs poi lead_knee_extension_from_fp_to_br 상관 {corr(V('knee_ext'), V('poi_knee_ext')):+.2f}, 차이 가운데 {np.nanmedian(V('knee_ext') - V('poi_knee_ext')):+.1f}°")
print("\n[몸통 회전]")
line("몸통 앞 기울기 릴리스", "fwd_br", "°")
line("몸통 옆(글러브 쪽) 기울기 릴리스", "lat_br", "°")
line("어깨선 돈 양 착지→릴리스", "rot", "°")
line("몸통 앞 기울기 착지", "fwd_fp", "°")
print(f"  앞 기울기 vs poi torso_anterior_tilt_br 상관 {corr(V('fwd_br'), V('poi_fwd_br')):+.2f} · 옆 vs poi {corr(V('lat_br'), V('poi_lat_br')):+.2f} · 옆 vs 팔 높이(arm_slot) {corr(V('lat_br'), V('arm_slot')):+.2f}")
print("\n[팔 늦음] 착지 때")
line("어깨 벌림(엔진 식)", "abd_fp", "°")
line("팔꿈치 높이(+1 어깨 바로 위)", "elbow_h")
line("아래팔 들림(+ 손이 팔꿈치 위)", "fore_up", "°")
line("poi 어깨 외회전 착지", "poi_er_fp", "°")
print(f"  벌림 vs poi shoulder_abduction_fp 상관 {corr(V('abd_fp'), V('poi_abd_fp')):+.2f}, 차이 가운데 {np.nanmedian(V('abd_fp') - V('poi_abd_fp')):+.1f}° · 아래팔 들림 vs poi 외회전 {corr(V('fore_up'), V('poi_er_fp')):+.2f}")
