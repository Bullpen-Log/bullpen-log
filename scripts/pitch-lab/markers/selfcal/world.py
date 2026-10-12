"""보정 좌표 → 세상 좌표(미터, z 위, 바닥 0, x 던지는 쪽). 줄자 길이로 배율, 멈춘 발 스티커로 바닥.

  py work/world.py 보정.json 출력.json   (work/rec/pNN.npz 를 읽는다 — labels_all.py 가 만든 것)
"""
import os, sys, json, glob
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))  # 영상 · 찾은 자료 폴더(저장소 밖) — 기본은 지금 폴더/work
NOTES = json.load(open(os.path.join(WORK, "..", "session-notes.json"), encoding="utf-8"))["people"][0]
TAPE = [("L8", "L9", NOTES["thigh_cm"]["L"]), ("R8", "R9", NOTES["thigh_cm"]["R"]), ("L9", "L11", NOTES["shank_cm"]["L"]), ("R9", "R11", NOTES["shank_cm"]["R"]),
        ("L2", "L3", NOTES["upper_arm_cm"]), ("R2", "R3", NOTES["upper_arm_cm"]), ("L3", "L5", NOTES["forearm_cm"]), ("R3", "R5", NOTES["forearm_cm"]),
        ("L2", "R2", NOTES["shoulder_width_cm"]), ("L_ASIS", "R_ASIS", NOTES["pelvis_width_cm"])]


def load(p):
    z = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz"))
    return z["tq"], {k[2:]: z[k] for k in z.files if k.startswith("M_")}


def stationary(X, tq, win=0.1, tol=0.0004):
    """win 초 동안 tol(보정 단위) 안에 머문 장면."""
    n = int(round(win * 240))
    ok = np.zeros(len(X), bool)
    for i in range(len(X) - n):
        seg = X[i:i + n]
        if np.isnan(seg).any():
            continue
        if np.linalg.norm(seg - seg.mean(0), axis=1).max() < tol:
            ok[i:i + n] = True
    return ok


def fit_plane(P, thr=0.002, iters=3000, seed=0):
    """RANSAC 면 → 들어맞는 점으로 다시 맞춤. 반환: 가운데, 법선, 들어맞는 비율."""
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(iters):
        a, b, c3 = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(b - a, c3 - a)
        if np.linalg.norm(n) < 1e-12:
            continue
        n /= np.linalg.norm(n)
        inl = np.abs((P - a) @ n) < thr
        if best is None or inl.sum() > best.sum():
            best = inl
    Q = P[best]
    c = Q.mean(0)
    n = np.linalg.svd(Q - c)[2][-1]
    return c, n, float(best.mean())


if __name__ == "__main__":
    cal = json.load(open(sys.argv[1]))
    pitches = sorted(int(k) for k in cal["offsets"])
    data = {p: load(p) for p in pitches}
    # 1 위 방향: 멈춘 뒤꿈치 · 발끝 면의 법선(귀 · 어깨 쪽이 +)
    feet, mall = [], []
    for p, (tq, M) in data.items():
        for nm in ("L13", "R13", "L14", "R14"):
            if nm in M:
                feet.append(M[nm][stationary(M[nm], tq)])
        for nm in ("L11", "R11"):
            if nm in M:
                mall.append(M[nm][stationary(M[nm], tq)])
    F = np.concatenate(feet)
    c, n, frac = fit_plane(F)
    up_ref = np.nanmean(np.concatenate([data[p][1][k] for p in pitches for k in ("L2", "R2", "L1", "R1") if k in data[p][1]]), 0)
    if (up_ref - c) @ n < 0:
        n = -n
    res = (F - c) @ n
    inl = np.abs(res) < 0.002
    print(f"바닥: 멈춘 발 스티커 {len(F)}점 · 면에 들어맞음 {100 * frac:.0f}% · 그 점들 벗어남 표준편차 {res[inl].std():.5f}(보정 단위)")
    # 2 배율: 서 있는 장면(각 투구 처음 0.3초 — 모든 카메라가 보는 구간)의 줄자 짝
    rows = []
    for a, b, cm in TAPE:
        ds = []
        for p, (tq, M) in data.items():
            if a in M and b in M:
                d = np.linalg.norm(M[a] - M[b], axis=1)
                stand = (tq >= 0.0) & (tq <= 0.35)
                ds.append(d[stand & ~np.isnan(d)])
                ds.append(d[~np.isnan(d)][:0])
        ds = np.concatenate(ds) if ds else np.array([])
        alld = np.concatenate([np.linalg.norm(data[p][1][a] - data[p][1][b], axis=1) for p in pitches if a in data[p][1] and b in data[p][1]] or [np.array([])])
        alld = alld[~np.isnan(alld)]
        use = ds if len(ds) >= 20 else alld
        if len(use) >= 20:
            rows.append((a, b, cm, float(np.median(use)), len(use), "서 있음" if len(ds) >= 20 else "전체"))
    sc = np.array([cm / 100 / d for a, b, cm, d, n_, w in rows])
    s = float(np.median(sc))
    for (a, b, cm, d, n_, w), k in zip(rows, sc):
        print(f"  {a}-{b} 줄자 {cm}cm · 스티커 {d * s * 100:.1f}cm (n {n_}, {w}) → 배율 {k:.3f}")
    print(f"배율 {s:.4f} m/단위 · 줄자 짝 {len(rows)}개의 흩어짐 {100 * sc.std() / s:.1f}%")
    # 3 바닥 높이: 멈춘 바깥 복사뼈 = 발목 높이(줄자)
    Mall = np.concatenate(mall)
    h_mall = float(np.median((Mall - c) @ n)) * s
    z0 = (NOTES["ankle_height_cm"] / 100) - h_mall  # 발 스티커 면 위 높이 보정
    print(f"멈춘 바깥 복사뼈 높이(발 스티커 면 기준) {h_mall * 100:.1f}cm → 바닥은 그 면에서 {-z0 * 100:+.1f}cm")
    # 4 x 방향: 투구마다 서 있을 때 뒤꿈치 가운데 → 끝에서 앞발(왼발) 자리
    xs = []
    for p, (tq, M) in data.items():
        if "L13" in M and "R13" in M:
            a = np.nanmedian(M["R13"][(tq >= 0) & (tq < 0.35)], 0)
            b = np.nanmedian(M["L13"][tq > tq[-1] - 0.6], 0)
            if not np.isnan(a).any() and not np.isnan(b).any():
                v = b - a
                xs.append(v - (v @ n) * n)
    x = np.mean([v / np.linalg.norm(v) for v in xs], 0)
    x -= (x @ n) * n
    x /= np.linalg.norm(x)
    y = np.cross(n, x)
    R = np.stack([x, y, n])
    tq, M = data[pitches[0]]
    o = np.nanmedian(np.concatenate([M[k][(tq >= 0) & (tq < 0.35)] for k in ("L13", "R13") if k in M]), 0)
    o = o - ((o - c) @ n) * n  # 발 스티커 면 위로
    t = -s * R @ o + np.array([0, 0, z0])
    out = {"scale": s, "R": R.tolist(), "t": t.tolist(), "note": "X_world = scale * R @ X_cal + t (미터, z 위, x 던지는 쪽, 원점 = 투구1 서 있을 때 뒤꿈치 가운데 바닥)"}
    cams = {}
    for cid, cm in cal["cams"].items():
        Rc = cv2.Rodrigues(np.asarray(cm["r"], float))[0]
        C = -Rc.T @ np.asarray(cm["t"], float)
        Cw = s * R @ C + t
        fwd = R @ Rc.T @ np.array([0, 0, 1.0])
        cams[cid] = {"center_m": Cw.round(3).tolist(), "look": fwd.round(3).tolist(), "f_px": round(cm["f"], 1)}
        print(f"카메라 {cid}: 자리 {np.round(Cw, 2)} m · 높이 {Cw[2]:.2f} m · 사람까지 {np.linalg.norm(Cw[:2]):.2f} m · 초점 {cm['f']:.0f}px")
    out["cams"] = cams
    json.dump(out, open(sys.argv[2], "w"), indent=1, ensure_ascii=False)
