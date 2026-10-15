"""스티커 번들 조정 — 카메라(방향 · 자리 · 초점 · 렌즈 휨 k1) + 투구마다 시간 어긋남 + 스티커 3D 점.

관측은 궤적을 τ + o 에서 보간한 자리: u(o) = u(o0) + 속도 · (o - o0) — 어긋남을 바꾸면 관측이 궤적을 따라 미끄러진다.
  py work/sba.py 1,2,3 시작보정.json 출력.json
"""
import os, sys, json, time
import numpy as np, cv2
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tracks import build, at
from match import track_edges, points
from cams import CAMS, FREE


def proj_k(cam, X):
    """k1 렌즈 휨 포함 투영."""
    R = cv2.Rodrigues(np.asarray(cam["r"], float))[0]
    Xc = X @ R.T + cam["t"]
    z = np.maximum(Xc[:, 2], 1e-6)
    x, y = Xc[:, 0] / z, Xc[:, 1] / z
    d = 1 + cam.get("k1", 0.0) * (x * x + y * y)
    return np.c_[cam["f"] * x * d + cam["cx"], cam["f"] * y * d + cam["cy"]]


def collect(pitches, cams, offs, tol, step):
    """투구마다 궤적 · 짝 · 3D 점 → 관측 줄(점, 카메라, 투구, u0, v0, 속도u, 속도v) · 점 첫 값."""
    rows, X0, meta = [], [], []
    for p in pitches:
        trs = {c: build(p, c) for c in CAMS}
        byid = {(c, t["id"]): t for c in CAMS for t in trs[c]}
        E = track_edges(trs, cams, offs[p], tol=tol)
        tq = np.arange(-0.3, 4.3, step)
        P = points(trs, cams, offs[p], E, tq, tol=tol)
        for q in P:
            k = len(X0)
            X0.append(q["X"]); meta.append((p, q["tau"]))
            for c, (tid, u, v) in q["obs"].items():
                tr = byid[(c, tid)]
                tt = q["tau"] + offs[p][c]
                h = 0.5 / 240
                a, b = at(tr, np.array([tt - h, tt + h]))
                vel = (b - a) / (2 * h) if not (np.isnan(a[0]) or np.isnan(b[0])) else np.zeros(2)
                rows.append((k, CAMS.index(c), p, u, v, vel[0], vel[1], tid))
        print(f"  투구 {p}: 짝 {len(E)} · 점 {len(P)}", flush=True)
    return np.array(rows), np.array(X0), meta


def run(pitches, cams, offs, tol=6.0, step=2 / 240, use_k1=True, nfev=150):
    rows, X0, meta = collect(pitches, cams, offs, tol, step)
    pk, pc, pp = rows[:, 0].astype(int), rows[:, 1].astype(int), rows[:, 2].astype(int)
    uv0, vel = rows[:, 3:5], rows[:, 5:7]
    free, NF = FREE, len(FREE)
    NC = 6 * NF + 2 * len(CAMS)  # 1 을 뺀 카메라의 r · t, 모두의 f(÷1000) · k1
    oidx = {(p, c): NC + i * NF + free.index(c) for i, p in enumerate(pitches) for c in free}
    NO = NC + NF * len(pitches)
    o0 = np.array([offs[p][CAMS[c]] for p, c in zip(pp, pc)])
    oi = np.array([oidx[(p, CAMS[c])] if c > 0 else -1 for p, c in zip(pp, pc)])
    C1 = -cv2.Rodrigues(np.asarray(cams["1"]["r"], float))[0].T @ np.asarray(cams["1"]["t"], float)
    C2 = -cv2.Rodrigues(np.asarray(cams["2"]["r"], float))[0].T @ np.asarray(cams["2"]["t"], float)
    d12 = np.linalg.norm(C2 - C1)

    def unpack(x):
        cs = {}
        for c in CAMS:
            cam = dict(cams[c])
            if c in free:
                j = free.index(c) * 6
                cam["r"], cam["t"] = x[j:j + 3], x[j + 3:j + 6]
            q = 6 * NF + CAMS.index(c) * 2
            cam["f"], cam["k1"] = 1000.0 * x[q], (x[q + 1] if use_k1 else 0.0)
            cs[c] = cam
        o = {(p, c): x[oidx[(p, c)]] for p in pitches for c in free}
        return cs, o, x[NO:].reshape(-1, 3)

    def fun(x):
        cs, o, X = unpack(x)
        oo = np.where(oi >= 0, x[np.maximum(oi, 0)], 0.0)
        obs = uv0 + vel * (oo - o0)[:, None]
        res = np.empty_like(obs)
        for i, c in enumerate(CAMS):
            m = pc == i
            res[m] = proj_k(cs[c], X[pk[m]]) - obs[m]
        Cb = -cv2.Rodrigues(cs["2"]["r"])[0].T @ cs["2"]["t"]
        return np.r_[res.ravel(), 1000.0 * (np.linalg.norm(Cb - C1) - d12)]

    x0 = np.zeros(NO + 3 * len(X0))
    for c in free:
        j = free.index(c) * 6
        x0[j:j + 3], x0[j + 3:j + 6] = cams[c]["r"], cams[c]["t"]
    for c in CAMS:
        q = 6 * NF + CAMS.index(c) * 2
        x0[q], x0[q + 1] = cams[c]["f"] / 1000.0, cams[c].get("k1", 0.0)
    for (p, c), j in oidx.items():
        x0[j] = offs[p][c]
    x0[NO:] = X0.ravel()
    n = len(rows)
    A = lil_matrix((2 * n + 1, len(x0)), dtype=np.int8)
    idx = np.arange(n)
    for i, c in enumerate(CAMS):
        m = idx[pc == i]
        cols = ([free.index(c) * 6 + q for q in range(6)] if c in free else []) + [6 * NF + i * 2, 6 * NF + i * 2 + 1]
        for q in cols:
            A[2 * m, q] = 1; A[2 * m + 1, q] = 1
    m = idx[oi >= 0]
    A[2 * m, oi[m]] = 1; A[2 * m + 1, oi[m]] = 1
    for q in range(3):
        A[2 * idx, NO + pk * 3 + q] = 1; A[2 * idx + 1, NO + pk * 3 + q] = 1
    A[2 * n, :6 * NF] = 1
    t0 = time.time()
    r = least_squares(fun, x0, jac_sparsity=A, x_scale="jac", loss="huber", f_scale=2.0, method="trf", tr_solver="lsmr",
                      max_nfev=nfev, xtol=1e-12, ftol=1e-12, verbose=0)
    cs, o, X = unpack(r.x)
    e = np.linalg.norm(r.fun[:-1].reshape(-1, 2), axis=1)
    print(f"  BA {time.time() - t0:.0f}초 nfev {r.nfev} · 관측 {n} · 다시 비춤 가운데값 {np.median(e):.2f}px p90 {np.percentile(e, 90):.2f} · "
          + " ".join(f"c{c}:{np.median(e[pc == i]):.2f}" for i, c in enumerate(CAMS)), flush=True)
    print("  초점", {c: round(cs[c]["f"], 1) for c in CAMS}, " k1", {c: round(cs[c]["k1"], 4) for c in CAMS})
    offs2 = {p: {"1": 0.0, **{c: float(o[(p, c)]) for c in free}} for p in pitches}
    for p in pitches:
        print(f"  어긋남 {p}: " + " ".join(f"{c}:{offs2[p][c]:+.4f}({(offs2[p][c] - offs[p][c]) * 1000:+.1f}ms)" for c in free))
    return cs, offs2, X, e, rows, meta


if __name__ == "__main__":
    pitches = [int(x) for x in sys.argv[1].split(",")]
    cal = json.load(open(sys.argv[2]))
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}
    oj = json.load(open(sys.argv[3]))
    offs = {p: oj[str(p)] for p in pitches}
    k1 = os.environ.get("K1", "1") == "1"
    nfev = int(os.environ.get("NFEV", "150"))
    for it, tol in enumerate([4.0, 2.5, 2.0]):
        print(f"되풀이 {it} · 짝 기준 {tol}px · k1 {k1}", flush=True)
        cams, offs, X, e, rows, meta = run(pitches, cams, offs, tol=tol, use_k1=k1, nfev=nfev)
    json.dump({"cams": {c: {k: (np.asarray(v).tolist() if hasattr(v, "__len__") else v) for k, v in cams[c].items()} for c in CAMS},
               "offsets": {str(p): o for p, o in offs.items()}}, open(sys.argv[4], "w"), indent=1)
