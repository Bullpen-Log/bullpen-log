"""관절(RTMW)로 카메라 4대 첫 보정 — 시간 어긋남(카메라마다 · 투구마다) + 초점 · 자리 · 방향.

  py work/kpba.py 1,2,3 출력.json
세상 좌표는 아직 임시(카메라1 = 원점, 1~2 거리 = 1). 미터 · 바닥은 스티커 단계에서.
"""
import os, sys, json, time
import numpy as np, cv2
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kpcal import load_kp, sample, sync_pair
from cams import CAMS, FREE, PAIRS

F0 = 1600.0


def proj(cam, X):
    """cam = (rvec 3, t 3, f) · cx, cy 는 가운데 고정."""
    R = cv2.Rodrigues(cam["r"])[0]
    Xc = X @ R.T + cam["t"]
    z = np.maximum(Xc[:, 2], 1e-6)
    return np.c_[cam["f"] * Xc[:, 0] / z + cam["cx"], cam["f"] * Xc[:, 1] / z + cam["cy"]]


def Pmat(cam):
    R = cv2.Rodrigues(cam["r"])[0]
    K = np.array([[cam["f"], 0, cam["cx"]], [0, cam["f"], cam["cy"]], [0, 0, 1.0]])
    return K @ np.c_[R, cam["t"]]


def tri(cams, obs):
    """obs: [(k, uv)] → X (DLT)."""
    A = []
    for k, (u, v) in obs:
        P = Pmat(cams[k])
        A += [u * P[2] - P[0], v * P[2] - P[1]]
    X = np.linalg.svd(np.array(A))[2][-1]
    return X[:3] / X[3]


def gather(ds, offs, step=2, thr=0.55):
    """기준 시각(카메라1 장면) × 관절 → 카메라별 관측. 반환: 목록 [(점 번호, 카메라, u, v, 확신)] · 점 수."""
    rows, n = [], 0
    for p, d in ds.items():
        tq = d["1"]["t"][::step]
        S = {c: sample(d[c], tq + offs[p][c], thr) for c in CAMS}
        for i in range(len(tq)):
            for j in range(S["1"][0].shape[1]):
                vis = [c for c in CAMS if S[c][1][i, j]]
                if len(vis) < 2:
                    continue
                for c in vis:
                    u, v = S[c][0][i, j]
                    rows.append((n, c, u, v))
                n += 1
    return rows, n


def init_cams(ds, offs):
    wh = {c: ds[min(ds)][c]["wh"] for c in CAMS}
    cams = {c: {"r": np.zeros(3), "t": np.zeros(3), "f": F0, "cx": wh[c][0] / 2, "cy": wh[c][1] / 2} for c in CAMS}
    rows, n = gather(ds, offs)
    obs = {}
    for k, c, u, v in rows:
        obs.setdefault(k, {})[c] = (u, v)
    # 1 · 2 로 시작(E), 나머지는 PnP
    ks = [k for k in obs if "1" in obs[k] and "2" in obs[k]]
    a = np.array([obs[k]["1"] for k in ks]); b = np.array([obs[k]["2"] for k in ks])
    K1 = np.array([[F0, 0, cams["1"]["cx"]], [0, F0, cams["1"]["cy"]], [0, 0, 1]])
    K2 = np.array([[F0, 0, cams["2"]["cx"]], [0, F0, cams["2"]["cy"]], [0, 0, 1]])
    na = cv2.undistortPoints(a.reshape(-1, 1, 2), K1, None).reshape(-1, 2)
    nb = cv2.undistortPoints(b.reshape(-1, 1, 2), K2, None).reshape(-1, 2)
    E, m = cv2.findEssentialMat(na, nb, np.eye(3), cv2.RANSAC, 0.999, 4.0 / F0)
    _, R, t, m2 = cv2.recoverPose(E, na, nb, np.eye(3), mask=m)
    cams["2"]["r"] = cv2.Rodrigues(R)[0].ravel(); cams["2"]["t"] = t.ravel()
    print(f"  E 1-2: {int(m.sum())}/{len(ks)} 들어맞음")
    X = {}
    for k in obs:
        if "1" in obs[k] and "2" in obs[k]:
            X[k] = tri(cams, [("1", obs[k]["1"]), ("2", obs[k]["2"])])
    for c in "34":
        ks = [k for k in X if c in obs[k]]
        P3 = np.array([X[k] for k in ks]); p2 = np.array([obs[k][c] for k in ks])
        K = np.array([[F0, 0, cams[c]["cx"]], [0, F0, cams[c]["cy"]], [0, 0, 1]])
        ok, r, t, inl = cv2.solvePnPRansac(P3, p2, K, None, reprojectionError=12.0, iterationsCount=3000)
        cams[c]["r"], cams[c]["t"] = r.ravel(), t.ravel()
        print(f"  PnP {c}: {0 if inl is None else len(inl)}/{len(ks)}")
    return cams


def ba(cams, rows, npts, fix="1", loss_scale=6.0):
    """관절 점 + 카메라(방향 · 자리 · 초점) 함께. 카메라 fix 는 고정, 1-2 거리는 첫 값으로 묶음."""
    cl = [c for c in CAMS]
    free = [c for c in cl if c != fix]
    obs = np.array([(k, cl.index(c), u, v) for k, c, u, v in rows])
    pk, pc, uv = obs[:, 0].astype(int), obs[:, 1].astype(int), obs[:, 2:4]
    # 점 첫 값
    X0 = np.zeros((npts, 3))
    by = {}
    for k, c, u, v in rows:
        by.setdefault(k, []).append((c, (u, v)))
    for k, o in by.items():
        X0[k] = tri(cams, o)
    C2 = -cv2.Rodrigues(cams["2"]["r"])[0].T @ cams["2"]["t"]
    d12 = np.linalg.norm(C2 - (-cv2.Rodrigues(cams["1"]["r"])[0].T @ cams["1"]["t"]))

    def unpack(x):
        cs = {c: dict(cams[c]) for c in cl}
        for i, c in enumerate(free):
            cs[c] = {**cams[c], "r": x[i * 7:i * 7 + 3], "t": x[i * 7 + 3:i * 7 + 6], "f": 1000.0 * x[i * 7 + 6]}
        cs[fix] = {**cams[fix], "f": 1000.0 * x[len(free) * 7]}
        X = x[len(free) * 7 + 1:].reshape(-1, 3)
        return cs, X

    def fun(x):
        cs, X = unpack(x)
        res = np.empty((len(obs), 2))
        for i, c in enumerate(cl):
            m = pc == i
            res[m] = proj(cs[c], X[pk[m]]) - uv[m]
        C1 = -cv2.Rodrigues(cs["1"]["r"])[0].T @ cs["1"]["t"]
        C2 = -cv2.Rodrigues(cs["2"]["r"])[0].T @ cs["2"]["t"]
        return np.r_[res.ravel(), 100.0 * (np.linalg.norm(C2 - C1) - d12)]

    x0 = np.r_[np.concatenate([np.r_[cams[c]["r"], cams[c]["t"], cams[c]["f"] / 1000.0] for c in free]), cams[fix]["f"] / 1000.0, X0.ravel()]
    nc = len(free) * 7 + 1
    A = lil_matrix((len(obs) * 2 + 1, len(x0)), dtype=int)
    idx = np.arange(len(obs))
    for i, c in enumerate(cl):
        m = idx[pc == i]
        if c in free:
            j = free.index(c)
            for q in range(7):
                A[2 * m, j * 7 + q] = 1; A[2 * m + 1, j * 7 + q] = 1
        else:
            A[2 * m, nc - 1] = 1; A[2 * m + 1, nc - 1] = 1
    for q in range(3):
        A[2 * idx, nc + pk * 3 + q] = 1; A[2 * idx + 1, nc + pk * 3 + q] = 1
    A[len(obs) * 2, :nc] = 1
    t0 = time.time()
    r = least_squares(fun, x0, jac_sparsity=A, x_scale="jac", loss="huber", f_scale=loss_scale, method="trf", tr_solver="lsmr", max_nfev=200, xtol=1e-12, ftol=1e-10, verbose=0)
    print(f"  [ls] nfev {r.nfev} status {r.status} cost {0.5*np.sum(fun(x0)**2):.0f}->{r.cost:.0f} {r.message}")
    cs, X = unpack(r.x)
    e = np.linalg.norm(r.fun[:-1].reshape(-1, 2), axis=1)
    per = {c: float(np.median(e[pc == i])) for i, c in enumerate(cl)}
    print(f"  BA {time.time() - t0:.0f}초 · 다시 비춤 가운데값 {np.median(e):.2f}px · 카메라별 {json.dumps({k: round(v, 2) for k, v in per.items()})}")
    return cs, X, e


def refine_offsets(cams, ds, offs, span=0.012, step=0.001):
    """카메라 고정 — 투구 · 카메라마다 어긋남을 훑어 다른 카메라로 교차한 점에 가장 잘 맞는 값."""
    new = {p: dict(o) for p, o in offs.items()}
    for p, d in ds.items():
        tq = d["1"]["t"][::2]
        base = {c: sample(d[c], tq + offs[p][c]) for c in CAMS}
        for c in CAMS[1:]:
            others = [k for k in CAMS if k != c]
            # 다른 카메라로 교차(그대로)
            X = {}
            for i in range(len(tq)):
                for j in range(base["1"][0].shape[1]):
                    vis = [k for k in others if base[k][1][i, j]]
                    if len(vis) >= 2:
                        X[(i, j)] = tri(cams, [(k, base[k][0][i, j]) for k in vis])
            keys = list(X)
            P3 = np.array([X[q] for q in keys])
            best = None
            for o in np.arange(offs[p][c] - span, offs[p][c] + span + 1e-9, step):
                xy, ok = sample(d[c], tq + o)
                m = np.array([ok[i, j] for i, j in keys])
                if m.sum() < 50:
                    continue
                uv = np.array([xy[i, j] for i, j in keys])[m]
                e = np.median(np.linalg.norm(proj(cams[c], P3[m]) - uv, axis=1))
                if best is None or e < best[0]:
                    best = (e, o)
            if best:
                new[p][c] = float(best[1])
    return new


def solve_offsets(pair):
    """짝 어긋남 o_ab = o_b - o_a → 카메라별(1 = 0) 최소제곱."""
    A, b = [], []
    for ab, o in pair.items():
        row = np.zeros(len(FREE))
        a, c = ab[0], ab[1]
        if c != "1": row[FREE.index(c)] += 1
        if a != "1": row[FREE.index(a)] -= 1
        A.append(row); b.append(o)
    x = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)[0]
    return {"1": 0.0, **{c: float(x[i]) for i, c in enumerate(FREE)}}


if __name__ == "__main__":
    pitches = [int(x) for x in sys.argv[1].split(",")]
    out = sys.argv[2]
    ds = {p: {c: load_kp(p, c) for c in CAMS} for p in pitches}
    offs = {}
    for p in pitches:
        pr = {}
        for a, b in PAIRS:
            pr[a + b] = sync_pair(ds[p][a], ds[p][b], lo=-1.2, hi=1.2, coarse=1 / 60)[0]
        offs[p] = solve_offsets(pr)
        print(f"투구 {p} 짝 어긋남 → {json.dumps({k: round(v, 4) for k, v in offs[p].items()})}", flush=True)
    cams = init_cams(ds, offs)
    for it in range(4):
        rows, n = gather(ds, offs)
        cams, X, e = ba(cams, rows, n)
        print(f"  초점 {json.dumps({c: round(cams[c]['f']) for c in CAMS})}", flush=True)
        offs = refine_offsets(cams, ds, offs)
        print(f"  되풀이 {it}: 어긋남 " + " · ".join(f"{p}:" + json.dumps({k: round(v, 4) for k, v in offs[p].items()}) for p in pitches), flush=True)
    json.dump({"cams": {c: {k: (v.tolist() if hasattr(v, "tolist") else v) for k, v in cams[c].items()} for c in CAMS}, "offsets": offs}, open(out, "w"), indent=1)
