"""골반 방향 · 상하체 분리 채점 — 마커 스티커(골반 앞뒤 ASIS · PSIS, 어깨 봉우리 L2 · R2)로 '실제 골반 좌우축 · 어깨선'을 만들고 엔진과 견준다.

  (세션 폴더에서) python pelvis_score.py 2,3,...    → 구간별 골반 돌림 오차 · 상하체 분리 오차(°, 위에서 본 각)

정답 골반 좌우축 = ASIS 짝 · PSIS 짝 중 보이는 것의 오른쪽 → 왼쪽 방향(둘 다 보이면 평균). 어깨선 = R2 → L2.
엔진은 bench.py 와 같은 닮음 변환(K4 로 맞춤)으로 세상 좌표에 놓고 엉덩이 · 어깨 관절 선을 쓴다. 각은 세상의 위(z)축 둘레(위에서 본 돌림).
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B

WORK = B.WORK


def yaw(v):
    return np.degrees(np.arctan2(v[..., 1], v[..., 0]))


def wrap(d):
    return (d + 180) % 360 - 180


DUMP = []
CUES = None  # 실험용 — 리스트를 넣으면 정답 장면마다 엔진 관절을 모은다
PEL = ["L_ASIS", "R_ASIS", "L_PSIS", "R_PSIS"]


def pelvis_template(toW):
    """골반 스티커 틀(골반 좌표: x 왼쪽 · y 위 · z 앞, 미터) — 셋이 같이 보이는 장면(R_ASIS · L_PSIS · R_PSIS)의 가운데값.
    L_ASIS 는 같이 보이는 장면이 거의 없어 R_ASIS 를 좌우로 뒤집어 둔다(골반은 좌우 대칭)."""
    pts = []
    for p in range(1, 17):
        fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz"))
        if not all("M_" + n in fl.files for n in ("R_ASIS", "L_PSIS", "R_PSIS")):
            continue
        A, Lp, Rp = (toW(fl["M_" + n]) for n in ("R_ASIS", "L_PSIS", "R_PSIS"))
        m = ~np.isnan(A[:, 0]) & ~np.isnan(Lp[:, 0]) & ~np.isnan(Rp[:, 0])
        for a, l, r in zip(A[m], Lp[m], Rp[m]):
            o = (l + r) / 2
            x = (l - r) / np.linalg.norm(l - r)
            f = (a - o) - x * ((a - o) @ x)
            z = f / np.linalg.norm(f)
            y = np.cross(z, x)
            M = np.stack([x, y, z])
            pts.append([M @ (a - o), M @ (l - o), M @ (r - o)])
    pts = np.median(np.array(pts), 0)
    ra = pts[0]
    return {"R_ASIS": ra, "L_ASIS": ra * np.array([-1, 1, 1]), "L_PSIS": pts[1], "R_PSIS": pts[2]}, len(pts) if isinstance(pts, list) else None


def pelvis_yaw(tpl, obs):
    """보이는 스티커(둘 이상)로 위에서 본 골반 좌우축 각(°) — 틀을 위축 둘레로 돌려 맞춤(2D 프로크루스테스)"""
    names = [n for n in obs if not np.isnan(obs[n][0])]
    if len(names) < 2:
        return np.nan
    # (오른쪽, 앞) — 위에서 보면 오른쪽 → 앞이 세상 x → y 와 같은 돌림(왼쪽 → 앞은 거울이라 안 된다). 높이는 버린다
    T = np.array([[-tpl[n][0], tpl[n][2]] for n in names])
    O = np.array([[obs[n][0], obs[n][1]] for n in names])  # 세상 (x, y) — z 가 위
    T = T - T.mean(0)
    O = O - O.mean(0)
    # 틀 → 세상 평면 회전 θ = 오른쪽 축의 각. 엔진과 같은 '오른쪽 → 왼쪽' 선의 각은 θ + 180
    c = (T[:, 0] * O[:, 0] + T[:, 1] * O[:, 1]).sum()
    sn = (T[:, 0] * O[:, 1] - T[:, 1] * O[:, 0]).sum()
    return float(wrap(np.degrees(np.arctan2(sn, c)) + 180))


def run(ps, cal_path, world_path, quiet=False):
    cal = json.load(open(cal_path))
    toW = B.world_of(cal_path, world_path)
    tpl, _ = pelvis_template(toW)
    rows = []  # (투구, 구간, 골반 오차°, 분리 정답°, 분리 엔진°)
    for p in ps:
        r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
        if not r.get("ok"):
            continue
        rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz"))
        tq = rec["tq"]
        te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]
        J = np.array(r["joints"], float) / 1000.0
        # 엔진 → 세상(bench 와 같은 K4 맞춤)
        A, Bb = [], []
        for n, (kn, sd) in B.K4_OF.items():
            X = toW(rec[f"K_{kn}_{sd}"])
            T = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
            m = ~np.isnan(T[:, 0])
            A.append(J[m, B.IX[n]])
            Bb.append(T[m])
        s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb))
        E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
        # 스티커(엔진 장면 시각, 1/240 초 안)
        fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz"))
        ftq = fl["tq"]
        near = np.clip(np.round((te - ftq[0]) / (ftq[1] - ftq[0])).astype(int), 0, len(ftq) - 1)
        okt = np.abs(ftq[near] - te) < 0.5 / 240

        def mk(n):
            if "M_" + n not in fl.files:
                return np.full((len(te), 3), np.nan)
            X = toW(fl["M_" + n])[near]
            X[~okt] = np.nan
            return X

        S = {n: mk(n) for n in PEL}
        pyaw = np.array([pelvis_yaw(tpl, {n: S[n][k] for n in PEL}) for k in range(len(te))])
        # 어깨선 — 어깨 봉우리 스티커가 골반 스티커와 같이 보이는 장면이 거의 없어 네 대 교차(K4) 어깨를 쓴다(어깨는 K4 가 잘 맞다)
        ksh = {sd: toW(rec[f"K_sho_{sd}"]) for sd in "LR"}
        kat = {sd: np.array([[np.interp(tt, tq, ksh[sd][:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te]) for sd in "LR"}
        sv = kat["L"] - kat["R"]
        khp = {sd: toW(rec[f"K_hip_{sd}"]) for sd in "LR"}
        kh = {sd: np.array([[np.interp(tt, tq, khp[sd][:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te]) for sd in "LR"}
        k4h = kh["L"] - kh["R"]
        eh = E[:, B.IX["lHip"]] - E[:, B.IX["rHip"]]
        # 후보 골반 방향 끼우기(실험) — PELVIS_ALT 폴더의 pNN.npz 'hip'(장면 × 3, 엔진 좌표의 오른쪽 → 왼쪽 엉덩이 방향, 없는 장면은 NaN)
        alt = os.environ.get("PELVIS_ALT")
        if alt and os.path.exists(os.path.join(alt, f"p{p:02d}.npz")):
            hv = np.load(os.path.join(alt, f"p{p:02d}.npz"))["hip"]
            ok = ~np.isnan(hv[:, 0])
            eh[ok] = (R @ hv[ok].T).T
        es = E[:, B.IX["lSh"]] - E[:, B.IX["rSh"]]
        ev = r["events"]
        for k in range(len(te)):
            if np.isnan(pyaw[k]):
                continue
            pe = wrap(yaw(eh[k]) - pyaw[k])
            st = wrap(yaw(sv[k]) - pyaw[k]) if not np.isnan(sv[k, 0]) else np.nan
            se = wrap(yaw(es[k]) - yaw(eh[k]))
            kpe = wrap(yaw(k4h[k]) - pyaw[k]) if not np.isnan(k4h[k, 0]) else np.nan
            rows.append((p, B.phase_of(k, ev), float(pe), float(st), float(se), float(kpe)))
            if os.environ.get("PELVIS_DUMP"):
                DUMP.append((p, k, k - ev["footPlant"], B.phase_of(k, ev), float(pe)))
            if CUES is not None:
                CUES.append({"p": p, "k": k, "ph": B.phase_of(k, ev), "truth": float(pyaw[k]), "E": E[k].tolist(), "ev": ev, "n": len(te)})
    if not quiet:
        report(rows)
    return rows


def report(rows):
    ph = ["다리 들기", "내딛기", "팔 가속", "팔로스루", None]
    print("구간          장면   골반 돌림 오차(가운데 · 상위10%)   분리 오차(가운데 · 평균 치우침)")
    for q in ph:
        R = [r for r in rows if q is None or r[1] == q]
        if not R:
            continue
        pe = np.abs([r[2] for r in R])
        bias = np.mean([r[2] for r in R])
        kpe = [r[5] for r in R if not np.isnan(r[5])]
        sep = [(r[4] - r[3]) for r in R if not np.isnan(r[3])]
        sep_s = f"{np.median(np.abs(sep)):5.1f} · {np.mean(sep):+5.1f}" if sep else "    -"
        print(f"{q or '전체':10s} {len(R):6d}   {np.median(pe):5.1f}° · {np.percentile(pe, 90):5.1f}° (치우침 {bias:+.1f}°)   {sep_s}  (분리 정답 장면 {len(sep)}) · K4 엉덩이선 치우침 {np.mean(kpe):+.1f}° · 가운데 {np.median(np.abs(kpe)):.1f}°")


def summary(rows):
    pe = np.abs([r[2] for r in rows])
    sep = [(r[4] - r[3]) for r in rows if not np.isnan(r[3])]
    return {"pelvis_med": float(np.median(pe)), "pelvis_p90": float(np.percentile(pe, 90)),
            "sep_med": float(np.median(np.abs(sep))) if sep else None, "sep_bias": float(np.mean(sep)) if sep else None}


if __name__ == "__main__":
    ps = [int(x) for x in sys.argv[1].split(",")]
    rows = run(ps, os.path.join(WORK, "cal16b.json"), os.path.join(WORK, "world.json"))
    if os.environ.get("PELVIS_DUMP"):
        json.dump(DUMP, open(os.environ["PELVIS_DUMP"], "w"))
    print(json.dumps(summary(rows)))
