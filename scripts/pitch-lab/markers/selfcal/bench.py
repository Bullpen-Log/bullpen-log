"""마커 정답지로 엔진 채점(5단계) — 같은 투구의 옆(c1) · 뒤(c2) 2D(RTMW, 분석 서버와 같은 모델)를 엔진에 넣고, 낸 3D 를 정답과 비교한다.

  (세션 폴더에서)
  python bench.py tracks 1,2,...      → work/bench/pNN/tracks.json (엔진 입력, 서버처럼 120fps 로 솎음)
  node --import <저장소>/scripts/alias-register.mjs <저장소>/scripts/pitch-lab/markers/mocap-fit.mts work/bench/pNN   → result.json
  python bench.py score 1,2,... [보정.json] [world.json] [이름]  → 관절 × 구간 오차표(cm) · work/bench/score-<이름>.json

정답 둘:
  K4  — 네 카메라의 RTMW 관절을 보정으로 교차한 3D(장면 대부분에 있다). 2D 모델의 버릇은 그대로 남지만 두 대보다 훨씬 덜 흔들린다.
        엔진이 '같은 2D 로 낼 수 있는 가장 좋은 3D' 에 얼마나 가까운지를 잰다.
  MK  — 스티커로 만든 관절 가운데(joints.py — 4단계). 장면은 듬성듬성이지만 진짜 뼈 자리다.
비교는 투구마다 닮음 변환(회전 · 이동 · 크기)으로 맞춘 뒤 — 엔진은 키 = 1000 단위라 크기를 모른다. 크기 오차는 따로(뼈 길이 비율).
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))
SCORE_SCALE = 6.0  # services/pitch3d-gpu/pitch3d_gpu/mapping.py 와 같다
JM = json.load(open(os.path.join(HERE, "..", "..", "..", "..", "lib", "pitch-3d", "v2", "joint-map.json"), encoding="utf-8"))
NAMES = [j["name"] for j in JM["joints"]]
RTMW = [int(j["rtmw"]) for j in JM["joints"]]
IX = {n: i for i, n in enumerate(NAMES)}
# 엔진 관절 → K4(recon.kp3d 이름, 쪽)
K4_OF = {"lSh": ("sho", "L"), "rSh": ("sho", "R"), "lEl": ("elb", "L"), "rEl": ("elb", "R"), "lWr": ("wri", "L"), "rWr": ("wri", "R"),
         "lHip": ("hip", "L"), "rHip": ("hip", "R"), "lKn": ("kne", "L"), "rKn": ("kne", "R"), "lAn": ("ank", "L"), "rAn": ("ank", "R"),
         "lHe": ("heel", "L"), "rHe": ("heel", "R"), "lTo": ("toe", "L"), "rTo": ("toe", "R"), "lEar": ("ear", "L"), "rEar": ("ear", "R")}
# 스티커 하나 ↔ 엔진 관절(거리가 늘 거의 같아야 한다 — 뼈 겉의 스티커)
MARK_OF = {"lSh": "L2", "rSh": "R2", "lEl": "L3", "rEl": "R3", "rWr": "R5", "lHip": "L8", "rHip": "R8", "lKn": "L9", "rKn": "R9",
           "lAn": "L11", "rAn": "R11", "lHe": "L13", "rHe": "R13", "lTo": "L14", "rTo": "R14", "rEar": "R1"}
# 스티커 둘의 방향 ↔ 엔진 뼈 방향(골반 뒤 선 ∥ 엉덩이 선 · 위팔 · 정강이)
DIR_OF = {"골반 뒤 선": (("L_PSIS", "R_PSIS"), ("lHip", "rHip")), "오른 위팔": (("R2", "R3"), ("rSh", "rEl")),
          "왼 정강이": (("L9", "L11"), ("lKn", "lAn")), "왼 넙다리": (("L8", "L9"), ("lHip", "lKn"))}
PARTS = {"어깨": ["lSh", "rSh"], "팔꿈치": ["lEl", "rEl"], "손목": ["lWr", "rWr"], "엉덩이": ["lHip", "rHip"], "무릎": ["lKn", "rKn"],
         "발목": ["lAn", "rAn"], "발": ["lHe", "rHe", "lTo", "rTo"], "머리": ["lEar", "rEar"]}


def avg2d(kp, sc, kpf, scf):
    """두 번 본 2D 를 확신 무게로 평균 — 두 자리가 사람 크기의 8% 넘게 갈리면 확신 높은 쪽만"""
    w0, w1 = np.clip(sc, 1e-3, None), np.clip(scf, 1e-3, None)
    out = (kp * w0[..., None] + kpf * w1[..., None]) / (w0 + w1)[..., None]
    size = np.ptp(kp[:, :17, 1], axis=1)[:, None]
    far = np.linalg.norm(kp - kpf, axis=2) > 0.08 * np.maximum(size, 1)
    pick = np.where((scf > sc)[..., None], kpf, kp)
    out[far] = pick[far]
    return out, np.where(far, np.maximum(sc, scf), (sc + scf) / 2)


def fuse_wrist(kp, sc):
    """손목 = 몸 손목(9 · 10)과 손 뿌리(91 · 112)의 확신 무게 평균 — 둘이 사람 크기의 5% 넘게 갈리면 확신 높은 쪽"""
    kp, sc = kp.copy(), sc.copy()
    size = np.maximum(np.ptp(kp[:, :17, 1], axis=1), 1)
    for b, h in ((9, 91), (10, 112)):
        wb, wh = np.clip(sc[:, b], 1e-3, None), np.clip(sc[:, h], 1e-3, None)
        avg = (kp[:, b] * wb[:, None] + kp[:, h] * wh[:, None]) / (wb + wh)[:, None]
        far = np.linalg.norm(kp[:, b] - kp[:, h], axis=1) > 0.05 * size
        kp[:, b] = np.where(far[:, None], np.where((wh > wb)[:, None], kp[:, h], kp[:, b]), avg)
        sc[:, b] = np.where(far, np.maximum(sc[:, b], sc[:, h]), (sc[:, b] + sc[:, h]) / 2)
    return kp, sc


def track_of(p, c, fps=120.0):
    flip = os.environ.get("FLIP") == "1"  # 좌우로 뒤집어 한 번 더 본 2D 와 평균(pose_modal.py --flip → work/kpf)
    z = np.load(os.path.join(WORK, "kpf" if flip else "kp", f"투구{p:02d}_c{c}.npz"))
    t, kp, sc = z["t"], z["kp"].astype(float), z["sc"].astype(float)
    if flip:
        kp, sc = avg2d(kp, sc, z["kpf"], z["scf"])
    if os.environ.get("WFUSE") == "1":
        kp, sc = fuse_wrist(kp, sc)
    W, H = [int(v) for v in z["wh"]]
    # 서버는 구간을 min(120, 영상 fps)로 푼다 — 240 영상은 둘에 하나. 시각은 원본 트랙 그대로
    keep, last = [], -1e9
    for i, ti in enumerate(t):
        if ti - last >= 1 / fps - 1e-4:
            keep.append(i); last = ti
    frames = [{"t": float(t[i]), "p": [[float(kp[i, j, 0]), float(kp[i, j, 1]), float(min(1, max(0, sc[i, j] / SCORE_SCALE)))] for j in RTMW]} for i in keep]
    return {"W": W, "H": H, "fps": fps, "frames": frames}


def cmd_tracks(ps):
    for p in ps:
        d = os.path.join(WORK, "bench", f"p{p:02d}")
        os.makedirs(d, exist_ok=True)
        meta = {"hand": "R", "height_m": float(os.environ.get("HEIGHT_M", "1.80"))}
        if os.environ.get("FOCAL_PRIOR", "1x") == "1x":  # 이 촬영은 네 대 모두 1배 — 엔진의 초점 사전(camera.ts FOCAL_PRIOR_1X)
            meta["focal_prior"] = {"k": 0.78, "sigma": 0.25}
        tr = {"side": track_of(p, "1"), "back": track_of(p, "2"), "meta": meta}
        json.dump(tr, open(os.path.join(d, "tracks.json"), "w"))
        print(p, "옆", len(tr["side"]["frames"]), "뒤", len(tr["back"]["frames"]), flush=True)


def k4_robust(p, cal, tq, thr=0.5, tol=12.0):
    """네 대 관절 교차(K4R) — recon.kp3d 와 같되, 다른 카메라와 안 맞는 시선(다시 비춤 tol px 넘음)을 하나씩 빼고 다시 교차한다.
    빠른 팔에서 한 카메라의 2D 가 번져 틀리면 예전 K4 는 그쪽으로 끌려갔다(엔진은 옆 · 뒤 2D 에 8px 로 맞는데 K4 는 30~60px 벗어남)."""
    sys.path.insert(0, HERE)
    from kpba import proj, tri
    from tracks import load_kp_full
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in "1234"}
    off = cal["offsets"][str(p)]
    raw = {c: load_kp_full(p, c) for c in "1234"}
    out = {}
    for n, (kn, sd) in K4_OF.items():
        j = {"ear": (3, 4), "sho": (5, 6), "elb": (7, 8), "wri": (9, 10), "hip": (11, 12), "kne": (13, 14), "ank": (15, 16),
             "toe": (17, 20), "heel": (19, 22)}[kn][0 if sd == "L" else 1]
        S = {}
        for c in "1234":
            t, kp, sc = raw[c]
            tt = tq + off[c]
            i = np.clip(np.searchsorted(t, tt) - 1, 0, len(t) - 2)
            w = np.clip((tt - t[i]) / np.maximum(t[i + 1] - t[i], 1e-9), 0, 1)[:, None]
            S[c] = (kp[i, j] * (1 - w) + kp[i + 1, j] * w, (sc[i, j] > thr * SCORE_SCALE) & (sc[i + 1, j] > thr * SCORE_SCALE) & (tt >= t[0]) & (tt <= t[-1]))
        X = np.full((len(tq), 3), np.nan)
        for k in range(len(tq)):
            vis = [(c, S[c][0][k]) for c in "1234" if S[c][1][k]]
            while len(vis) >= 2:
                Y = tri(cams, vis)
                err = [float(np.linalg.norm(proj(cams[c], Y[None])[0] - uv)) for c, uv in vis]
                w_ = int(np.argmax(err))
                if err[w_] <= tol:
                    X[k] = Y; break
                if len(vis) == 2:
                    break
                del vis[w_]
        out[n] = X
    return out


def umeyama(A, B):
    """B ≈ s R A + t (점 대응, 행 = 점)."""
    ma, mb = A.mean(0), B.mean(0)
    a, b = A - ma, B - mb
    U, S, Vt = np.linalg.svd(b.T @ a / len(A))
    # 엔진 좌표 [앞, 위, 오른쪽]은 왼손 좌표라 거울을 허락한다(투구마다 같은 한 가지 — 좌우 이름은 그대로 맞춰 본다)
    D = np.eye(3)
    R = U @ Vt
    s = np.trace(np.diag(S) @ D) / (a ** 2).sum(1).mean()
    return s, R, mb - s * R @ ma


def world_of(cal_path, world_path):
    w = json.load(open(world_path))
    s, R, t = w["scale"], np.array(w["R"]), np.array(w["t"])
    return lambda X: (s * (R @ X.reshape(-1, 3).T).T + t).reshape(X.shape)


def phase_of(k, ev):
    """구간: 다리 들기(니업 앞) · 내딛기(니업 → 착지) · 팔 가속(착지 → 릴리스) · 팔로스루(릴리스 뒤)."""
    ku = ev.get("kneeUp")
    if ku is not None and k < ku:
        return "다리 들기"
    if k < ev["footPlant"]:
        return "내딛기"
    if k <= ev["release"]:
        return "팔 가속"
    return "팔로스루"


def cmd_score(ps, cal_path, world_path, name):
    cal = json.load(open(cal_path))
    toW = world_of(cal_path, world_path)
    rows = []  # (투구, 정답 종류, 관절, 구간, 오차 m)
    mkrows = []  # (투구, 관절, 장면 수, 엔진 거리 흔들림 m, K4 거리 흔들림 m, 엔진 거리 가운데, K4 거리 가운데)
    dirrows = []  # (투구, 뼈, 장면 수, 엔진 각도 차 가운데 °, K4 각도 차 가운데 °)
    bone = []  # (투구, 뼈, 엔진/정답 비율)
    for p in ps:
        r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
        if not r.get("ok"):
            print(p, "엔진 실패", r.get("code")); continue
        rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz"))
        tq = rec["tq"]
        off1 = cal["offsets"][str(p)]["1"]
        J = np.array(r["joints"], float) / 1000.0  # 키 = 1 단위, [앞, 위, 오른쪽]
        te = np.array(r["t"]) - off1  # 옆 영상 시각 → 기준 시각
        truths = {"K4": {}}
        cache = os.path.join(WORK, "bench", f"k4r-p{p:02d}.npz")
        if os.environ.get("K4") != "robust":
            # 기본은 recon 의 K4(네 대 모두 같은 무게). 튼튼한 K4R 은 스티커와 비교하면 더 나빴다(거리 흔들림 1.21 → 1.52cm, 위팔 방향
            # 7.2 → 15°) — 시선을 빼면 둘만 남는 장면이 늘어 더 흔들린다. 진단용으로만 K4=robust.
            KR = {n: rec[f"K_{kn}_{sd}"] for n, (kn, sd) in K4_OF.items()}
        elif os.path.exists(cache):
            KR = {k: v for k, v in np.load(cache).items()}
        else:
            KR = k4_robust(p, cal, tq)
            np.savez_compressed(cache, **KR)
        for n in K4_OF:
            X = toW(KR[n])
            truths["K4"][n] = np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te])
        # 스티커(4단계 채운 것) — 엔진 장면 시각으로, 가장 가까운 장면(1/240초 안)만
        fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz"))
        ftq = fl["tq"]
        near = np.clip(np.round((te - ftq[0]) / (ftq[1] - ftq[0])).astype(int), 0, len(ftq) - 1)
        okt = np.abs(ftq[near] - te) < 0.5 / 240
        mark = {}
        for k in fl.files:
            if k.startswith("M_"):
                X = toW(fl[k])[near]
                X[~okt] = np.nan
                mark[k[2:]] = X
        # 맞추기: K4 로 닮음 변환(촘촘해서 안정) — 같은 변환을 MK 에도 쓴다
        A, B = [], []
        for n, T in truths["K4"].items():
            m = ~np.isnan(T[:, 0])
            A.append(J[m, IX[n]]); B.append(T[m])
        A, B = np.concatenate(A), np.concatenate(B)
        s, R, t = umeyama(A, B)
        E = (s * (R @ J.reshape(-1, 3).T).T + t).reshape(J.shape)
        ev = r["events"]
        for kind, T in truths.items():
            for n, X in T.items():
                for k in range(len(te)):
                    if not np.isnan(X[k, 0]):
                        rows.append((p, kind, n, phase_of(k, ev), float(np.linalg.norm(E[k, IX[n]] - X[k]))))
        # 스티커 하나 거리 흔들림(cm) — 엔진과 K4 를 같은 장면에서
        for n, mn in MARK_OF.items():
            if mn not in mark:
                continue
            Mx = mark[mn]
            K = truths["K4"][n]
            m = ~np.isnan(Mx[:, 0]) & ~np.isnan(K[:, 0])
            if m.sum() >= 24:
                de = np.linalg.norm(E[m, IX[n]] - Mx[m], axis=1)
                dk = np.linalg.norm(K[m] - Mx[m], axis=1)
                mkrows.append((p, n, int(m.sum()), float(np.std(de)), float(np.std(dk)), float(np.median(de)), float(np.median(dk))))
        # 뼈 방향 각도 차이(°)
        for nm, ((ma, mb), (ja, jb)) in DIR_OF.items():
            if ma not in mark or mb not in mark:
                continue
            u = mark[mb] - mark[ma]
            m = ~np.isnan(u[:, 0])
            if m.sum() >= 12:
                def ang(v):
                    c = np.sum(v[m] * u[m], 1) / np.linalg.norm(v[m], axis=1) / np.linalg.norm(u[m], axis=1)
                    return np.degrees(np.arccos(np.clip(c, -1, 1)))
                ve = E[:, IX[jb]] - E[:, IX[ja]]
                vk = truths["K4"][jb] - truths["K4"][ja]
                ae, ak = ang(ve), ang(vk)
                okk = ~np.isnan(ak)
                dirrows.append((p, nm, int(m.sum()), float(np.median(ae)), float(np.median(ak[okk])) if okk.any() else float("nan")))
        # 뼈 길이(엔진 vs K4, 같은 장면 가운데) — 크기를 맞춘 뒤의 비율
        for nm, (a, b) in {"위팔": ("rSh", "rEl"), "아래팔": ("rEl", "rWr"), "넙다리": ("rHip", "rKn"), "정강이": ("rKn", "rAn"),
                           "어깨 폭": ("lSh", "rSh"), "골반 폭": ("lHip", "rHip")}.items():
            T = truths["K4"]
            m = ~np.isnan(T[a][:, 0]) & ~np.isnan(T[b][:, 0])
            if m.sum() > 10:
                le = np.median(np.linalg.norm(E[m, IX[a]] - E[m, IX[b]], axis=1))
                lt = np.median(np.linalg.norm(T[a][m] - T[b][m], axis=1))
                bone.append((p, nm, float(le / lt)))
    k4 = [r[4] * 100 for r in rows if r[1] == "K4"]
    wa = [r[4] * 100 for r in rows if r[1] == "K4" and r[2] in ("lWr", "rWr") and r[3] == "팔 가속"]
    summary = {"pitches": sorted({r[0] for r in rows}), "k4_median_cm": float(np.median(k4)), "k4_mean_cm": float(np.mean(k4)),
               "k4_p90_cm": float(np.percentile(k4, 90)), "wrist_accel_p90_cm": float(np.percentile(wa, 90)) if wa else None,
               "mk_std_cm": float(np.median([r[3] for r in mkrows]) * 100) if mkrows else None}
    out = {"rows": rows, "bone": bone, "mk": mkrows, "dir": dirrows, "summary": summary}
    os.makedirs(os.path.join(WORK, "bench"), exist_ok=True)
    json.dump(out, open(os.path.join(WORK, "bench", f"score-{name}.json"), "w"))
    report(out)


def report(out):
    rows = out["rows"]
    for kind in ("K4", "MK"):
        R = [r for r in rows if r[1] == kind]
        if not R:
            continue
        print(f"\n■ 정답 {kind} — 관절 오차 가운데(cm), 괄호는 상위 10%")
        phases = ["다리 들기", "내딛기", "팔 가속", "팔로스루"]
        print(f"{'부위':6s} " + " ".join(f"{ph:>12s}" for ph in phases) + f" {'전체':>12s}")
        for part, ns in PARTS.items():
            cells = []
            for ph in phases + [None]:
                e = [r[4] * 100 for r in R if r[2] in ns and (ph is None or r[3] == ph)]
                cells.append(f"{np.median(e):5.1f}({np.percentile(e, 90):5.1f})" if len(e) >= 5 else f"{'-':>12s}")
            print(f"{part:6s} " + " ".join(f"{c:>12s}" for c in cells))
        e = [r[4] * 100 for r in R]
        print(f"모든 관절 가운데 {np.median(e):.1f}cm · 평균 {np.mean(e):.1f} · 상위 10% {np.percentile(e, 90):.1f} · 관찰 {len(e)}")
    if out.get("mk"):
        print("\n■ 스티커 하나 ↔ 관절 거리의 흔들림(표준편차 cm, 투구 가운데) — 작을수록 좋다. 같은 장면의 K4(네 대) 와 나란히")
        for n in dict.fromkeys(r[1] for r in out["mk"]):
            v = [r for r in out["mk"] if r[1] == n]
            print(f"  {n:5s} 투구 {len(v):2d} · 장면 {sum(r[2] for r in v):5d} · 엔진 {np.median([r[3] for r in v]) * 100:4.1f} · K4 {np.median([r[4] for r in v]) * 100:4.1f}")
        print(f"  모두: 엔진 {np.median([r[3] for r in out['mk']]) * 100:.2f} · K4 {np.median([r[4] for r in out['mk']]) * 100:.2f}")
    if out.get("dir"):
        print("\n■ 뼈 방향 — 스티커 둘의 방향과의 각도 차이(°, 투구 가운데)")
        for nm in dict.fromkeys(r[1] for r in out["dir"]):
            v = [r for r in out["dir"] if r[1] == nm]
            print(f"  {nm:6s} 투구 {len(v):2d} · 장면 {sum(r[2] for r in v):5d} · 엔진 {np.median([r[3] for r in v]):4.1f}° · K4 {np.nanmedian([r[4] for r in v]):4.1f}°")
    if out["bone"]:
        print("\n■ 뼈 길이 엔진 ÷ K4 (가운데 · 투구 사이 흩어짐)")
        for nm in dict.fromkeys(b[1] for b in out["bone"]):
            v = [b[2] for b in out["bone"] if b[1] == nm]
            print(f"  {nm:5s} {np.median(v):.3f} ± {np.std(v):.3f}")


if __name__ == "__main__":
    cmd = sys.argv[1]
    ps = [int(x) for x in sys.argv[2].split(",")]
    if cmd == "tracks":
        cmd_tracks(ps)
    elif cmd == "score":
        cmd_score(ps, sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else "base")
    elif cmd == "report":
        report(json.load(open(sys.argv[3])))
