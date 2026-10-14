"""옷 점 추적(work/surf) → 골반 회전. 기준 장면에 엔진 골반 자리 · 방향으로 골반 타원체를 놓고 질의 점을 그 표면에 붙인 뒤,
장면마다 회전(+ 조금의 옮김)을 두 영상의 추적 자리에 맞춘다. 결과 = pelvis_score 의 PELVIS_ALT 꼴(hip: 엔진 좌표 lHip − rHip 방향).

  (세션 폴더에서) python surface_fit.py <나갈 폴더> [투구들]
"""
import os, sys, json
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation as Rot

WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))
out = sys.argv[1]
ps = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "2,3,4,5,6,7,8,9,10,11,12,13,14,15,16").split(",")]
AX = np.array([float(x) for x in os.environ.get("SURF_AX", "0.105,0.12,0.075").split(",")])  # 키 1 기준 반지름(옆 · 위 · 앞)
UPSHIFT = float(os.environ.get("SURF_UP", "0.04"))
HUBER = 4.0
SIG_T = 0.02
SIG_R = float(os.environ.get("SURF_SIGR", "0.6"))
os.makedirs(out, exist_ok=True)


def cam(c):
    R = np.array(c["R"]).reshape(3, 3); t = np.array(c["t"])
    K = np.array([[c["f"], 0, c["cx"]], [0, c["f"], c["cy"]], [0, 0, 1.0]])
    return R, t, K


def proj(C, X):
    R, t, K = C
    x = X @ R.T + t
    return (x[:, :2] / x[:, 2:3]) * K[0, 0] + K[:2, 2]


def pframe(J, k):
    xa = J[k, 7] - J[k, 8]; xa /= np.linalg.norm(xa)
    up = np.array([0, 1.0, 0]); ya = up - xa * (up @ xa); ya /= np.linalg.norm(ya)
    return np.stack([xa, ya, np.cross(xa, ya)], 1)  # 열 = 옆 · 위 · 앞


for p in ps:
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    J = np.array(r["joints"], float) / 1000.0
    n = len(J)
    hm = (J[:, 7] + J[:, 8]) / 2
    J0 = np.array(r["joints"], float) / 1000.0
    views = []
    for v in os.environ.get("SURF_VIEWS", "side,back").split(","):
        f = os.path.join(WORK, os.environ.get("SURF_DIR", "surf"), f"p{p:02d}_{v}.npz")
        if os.path.exists(f):
            z = np.load(f)
            q = z["q"]
            # 높이 띠로 점 고르기(SURF_BAND = 아래,위 — 엉덩이 가운데에서 위로 몸통 길이의 몫, 기본 전부)
            band = os.environ.get("SURF_BAND")
            keep = np.ones(len(q), bool)
            if band:
                lo, hi = (float(x) for x in band.split(","))
                tr_ = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "tracks.json")))[v]["frames"]
                T = np.array([fr["t"] for fr in tr_]); tk = "t" if v == "side" else "tBack"
                kp = np.array(tr_[int(np.argmin(np.abs(T - r[tk][int(z["ref"])])))]["p"], float)
                hm2, sm2 = (kp[7, :2] + kp[8, :2]) / 2, (kp[1, :2] + kp[2, :2]) / 2
                tl = np.linalg.norm(sm2 - hm2); u = (hm2[1] - q[:, 2]) / tl
                keep = (u >= lo) & (u <= hi)
            C = cam(r["cameras"][v]); tr2, vis2 = z["tr"][:, keep], z["vis"][:, keep].astype(float)
            # 엉덩이 가운데(엔진을 비춘 자리)에서 기준 장면 때보다 몸통 길이의 DRIFT 배 넘게 벗어난 장면은 버린다 — 다리 · 팔로 옮겨 붙은 점
            DR = float(os.environ.get("SURF_DRIFT", "0.25"))
            if DR > 0:
                hm_all = (J0[:, 7] + J0[:, 8]) / 2; sm_all = (J0[:, 1] + J0[:, 2]) / 2
                hp = proj(C, hm_all); spx = proj(C, sm_all); rf = int(z["ref"])
                tlpx = np.linalg.norm(spx[rf] - hp[rf])
                off0 = tr2[rf] - hp[rf]
                dev = np.linalg.norm((tr2 - hp[:, None]) - off0[None], axis=2)
                vis2[dev > DR * tlpx] = 0
            views.append((v, C, q[keep], tr2, vis2, int(z["ref"])))
    if not views:
        continue
    ref = views[0][5]
    R0 = pframe(J, ref); c0 = hm[ref] + R0[:, 1] * UPSHIFT
    P = []  # (보기 번호, 점 번호, 국소 3D)
    for vi, (v, C, q, tr, vis, _) in enumerate(views):
        R, t, K = C
        o = -R.T @ t
        for i, (_, x, y) in enumerate(q):
            d = R.T @ np.linalg.solve(K, [x, y, 1.0]); d /= np.linalg.norm(d)
            ol, dl = R0.T @ (o - c0) / AX, R0.T @ d / AX
            a, b, cc = dl @ dl, 2 * ol @ dl, ol @ ol - 1
            disc = b * b - 4 * a * cc
            if disc < 0:
                continue
            s = (-b - np.sqrt(disc)) / (2 * a)
            if s <= 0:
                continue
            P.append((vi, i, (ol + s * dl) * AX))
    hip = np.full((n, 3), np.nan)
    qual = np.full((n, 5), np.nan)  # 옆 점 수 · 뒤 점 수 · 다시 비춘 오차 가운데(px) · 엔진과 회전 차(°) · 옆+뒤 중 적은 쪽
    w_prev = np.zeros(3)
    used = []
    order = list(range(ref, n)) + list(range(ref - 1, -1, -1))
    for k in order:
        if k == ref - 1:
            w_prev = np.zeros(3)
        Rk = pframe(J, k)
        obs = [(views[vi][1], views[vi][3][k, i], loc) for vi, i, loc in P if views[vi][4][k, i] > 0.5]
        nv = [sum(1 for vi, i, _ in P if vi == j and views[j][4][k, i] > 0.5) for j in range(len(views))]
        if len(obs) < 8:
            continue
        Cs = [o[0] for o in obs]; Y = np.array([o[1] for o in obs]); L = np.array([o[2] for o in obs])
        # 기준 장면의 국소 점 = 그 장면 골반 틀 기준 — 장면 k 의 틀은 Rk(엔진) 둘레로 돌림 w 를 찾는다
        def res(x):
            Rw = Rot.from_rotvec(x[:3]).as_matrix() @ Rk
            c = hm[k] + Rw[:, 1] * UPSHIFT + x[3:]
            X = c + L @ Rw.T
            e = np.concatenate([proj(C, X[j:j + 1])[0] - Y[j] for j, C in enumerate(Cs)])
            return np.concatenate([e, x[3:] / SIG_T * 4, x[:3] / SIG_R * 4])
        sol = least_squares(res, np.r_[w_prev, 0, 0, 0], loss="huber", f_scale=HUBER)
        w_prev = sol.x[:3]
        Rw = Rot.from_rotvec(sol.x[:3]).as_matrix() @ Rk
        hip[k] = Rw[:, 0] * np.linalg.norm(J[k, 7] - J[k, 8])
        e = res(sol.x)[: 2 * len(obs)].reshape(-1, 2)
        qual[k] = [nv[0], nv[1] if len(nv) > 1 else 0, np.median(np.linalg.norm(e, axis=1)), np.degrees(np.linalg.norm(sol.x[:3])), min(nv)]
        used.append(len(obs))
    np.savez(os.path.join(out, f"p{p:02d}.npz"), hip=hip, qual=qual)
    print(f"p{p:02d} 점 {len(P)} · 푼 장면 {np.isfinite(hip[:, 0]).sum()}/{n} · 장면당 보인 점 가운데 {int(np.median(used)) if used else 0}", flush=True)
