"""카메라만 푸는 번들 조정(3D 점은 매번 교차해서 지움) — 변수 74개라 촘촘한 LM 으로 끝까지 수렴한다.

  K1=0|1 py work/vpba.py 1,2,…,16 카메라.json 어긋남.json 출력.json
"""
import os, sys, json, time
import numpy as np, cv2
from scipy.optimize import least_squares

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sba import collect
from cams import CAMS, FREE

NF = len(FREE)
# 초점 사전(kpba 와 같은 FOCALS · FOCAL_W) — 스티커 짝이 적을 때 초점 · 거리가 서로 미끄러지는 것을 막는다(10-21)
FOC = {k: float(v) for k, v in (x.split(":") for x in os.environ.get("FOCALS", "").split(",") if x)}
FOCAL_W = float(os.environ.get("FOCAL_W", "0"))
PCS = [c for c in CAMS if FOCAL_W and c in FOC]


def rmat(r):
    return cv2.Rodrigues(np.asarray(r, float))[0]


class VP:
    def __init__(self, rows, pitches, cams0, offs0, use_k1):
        self.pk, self.pc, self.pp = rows[:, 0].astype(int), rows[:, 1].astype(int), rows[:, 2].astype(int)
        self.uv0, self.vel = rows[:, 3:5], rows[:, 5:7]
        self.N = int(self.pk.max()) + 1
        self.pitches, self.cams0, self.use_k1 = pitches, cams0, use_k1
        self.o0 = np.array([offs0[p][CAMS[c]] for p, c in zip(self.pp, self.pc)])
        self.pi = np.array([pitches.index(p) for p in self.pp])
        C1 = -rmat(cams0["1"]["r"]).T @ np.asarray(cams0["1"]["t"], float)
        C2 = -rmat(cams0["2"]["r"]).T @ np.asarray(cams0["2"]["t"], float)
        self.C1, self.d12 = C1, np.linalg.norm(C2 - C1)
        self.NC = 6 * NF + 2 * len(CAMS)
        x0 = np.zeros(self.NC + NF * len(pitches))
        for i, c in enumerate(FREE):
            x0[i * 6:i * 6 + 3], x0[i * 6 + 3:i * 6 + 6] = cams0[c]["r"], cams0[c]["t"]
        for i, c in enumerate(CAMS):
            x0[6 * NF + 2 * i], x0[6 * NF + 1 + 2 * i] = cams0[c]["f"] / 1000.0, cams0[c].get("k1", 0.0) if use_k1 else 0.0
        for j, p in enumerate(pitches):
            for i, c in enumerate(FREE):
                x0[self.NC + NF * j + i] = offs0[p][c]
        self.x0 = x0

    def cams(self, x):
        cs = {}
        for i, c in enumerate(CAMS):
            cam = dict(self.cams0[c])
            if c in FREE:
                k = FREE.index(c) * 6
                cam["r"], cam["t"] = x[k:k + 3], x[k + 3:k + 6]
                if c == "2":  # 크기 기준: 카메라1(원점)~2 거리를 늘 처음 값으로
                    cam["t"] = cam["t"] * (self.d12 / max(np.linalg.norm(cam["t"]), 1e-12))
            cam["f"], cam["k1"] = 1000.0 * x[6 * NF + 2 * i], (x[6 * NF + 1 + 2 * i] if self.use_k1 else 0.0)
            cs[c] = cam
        return cs

    def offsets(self, x):
        return {p: {"1": 0.0, **{c: float(x[self.NC + NF * j + i]) for i, c in enumerate(FREE)}} for j, p in enumerate(self.pitches)}

    def resid(self, x, want_X=False):
        cs = self.cams(x)
        oo = np.zeros(len(self.pc))
        m = self.pc > 0
        oo[m] = x[self.NC + NF * self.pi[m] + self.pc[m] - 1]
        oo[~m] = 0.0
        uv = self.uv0 + self.vel * (oo - self.o0)[:, None]
        # 정규 좌표(렌즈 휨은 두 번 되돌려 근사)
        f = np.array([cs[c]["f"] for c in CAMS])[self.pc]
        cx = np.array([cs[c]["cx"] for c in CAMS])[self.pc]
        cy = np.array([cs[c]["cy"] for c in CAMS])[self.pc]
        k1 = np.array([cs[c]["k1"] for c in CAMS])[self.pc]
        xd, yd = (uv[:, 0] - cx) / f, (uv[:, 1] - cy) / f
        xn, yn = xd.copy(), yd.copy()
        for _ in range(3):
            d = 1 + k1 * (xn * xn + yn * yn)
            xn, yn = xd / d, yd / d
        Rs = np.stack([rmat(cs[c]["r"]) for c in CAMS]); ts = np.stack([np.asarray(cs[c]["t"], float) for c in CAMS])
        P = np.concatenate([Rs, ts[:, :, None]], 2)[self.pc]  # (n,3,4)
        A = np.zeros((self.N, 2 * len(CAMS), 4))
        A[self.pk, 2 * self.pc] = xn[:, None] * P[:, 2] - P[:, 0]
        A[self.pk, 2 * self.pc + 1] = yn[:, None] * P[:, 2] - P[:, 1]
        V = np.linalg.svd(A)[2][:, -1]
        X = V[:, :3] / V[:, 3:4]
        Xc = np.einsum("nij,nj->ni", Rs[self.pc], X[self.pk]) + ts[self.pc]
        z = np.maximum(Xc[:, 2], 1e-6)
        x_, y_ = Xc[:, 0] / z, Xc[:, 1] / z
        d = 1 + k1 * (x_ * x_ + y_ * y_)
        r = np.c_[f * x_ * d + cx - uv[:, 0], f * y_ * d + cy - uv[:, 1]]
        Cb = -Rs[1].T @ ts[1]
        out = np.r_[r.ravel(), 1000.0 * (np.linalg.norm(Cb - self.C1) - self.d12)]
        if getattr(self, "rig", None) is not None:
            pid, ka, kb, w = self.rig
            d = np.linalg.norm(X[ka] - X[kb], axis=1)
            m = np.bincount(pid, d) / np.bincount(pid)
            out = np.r_[out, w * (d / m[pid] - 1)]  # 비율 — 장면을 줄여서 벌점을 피할 수 없게
        out = np.r_[out, [FOCAL_W * (cs[c]["f"] / FOC[c] - 1) for c in PCS]]
        return (out, X) if want_X else out

    def jac(self, x):
        r0 = self.resid(x)
        J = np.zeros((len(r0), len(x)))
        cols = list(range(self.NC)) if self.use_k1 else [i for i in range(self.NC) if not (i >= 6 * NF and (i - 6 * NF) % 2 == 1)]
        for k in cols:
            h = 1e-6 * max(1.0, abs(x[k]))
            xp = x.copy(); xp[k] += h
            J[:, k] = (self.resid(xp) - r0) / h
        # 어긋남: 카메라마다 모든 투구를 한 번에(투구끼리 줄이 겹치지 않음)
        for i in range(NF):
            ks = [self.NC + NF * j + i for j in range(len(self.pitches))]
            h = 2e-5
            xp = x.copy(); xp[ks] += h
            d = (self.resid(xp) - r0) / h
            rowp = np.r_[np.repeat(self.pi, 2), -1]
            if getattr(self, "rig", None) is not None:
                rowp = np.r_[rowp, self.rig_p]
            rowp = np.r_[rowp, -np.ones(len(PCS))]
            for j, k in enumerate(ks):
                J[:, k] = np.where(rowp == j, d, 0.0)
        return J


def setup_rigid(vp, rows, meta, pitches, w, groups=("knee", "elbow", "foot", "wrist"), min_n=20, max_cv=0.03):
    """같은 투구 · 색 · 무리의 3D 궤적 짝 중 지금 보정에서 거리 변동이 max_cv 밑인 것 — 거리 일정 조건."""
    from rigid import tracks3d, group_info
    obs = [(int(r[0]), CAMS[int(r[1])], int(r[2]), int(r[7])) for r in rows]
    k2trk = tracks3d(pitches, obs)
    gi = group_info(pitches)
    k2grp = {k: gi[(p, c, tid)] for k, c, p, tid in obs}
    X = vp.resid(vp.x0, want_X=True)[1]
    by = {}
    for k in k2trk:
        by.setdefault(meta[k], []).append(k)
    D = {}
    for (p, tau), ks in by.items():
        for i in range(len(ks)):
            for j in range(i + 1, len(ks)):
                a, b = ks[i], ks[j]
                if k2grp[a] != k2grp[b] or k2grp[a][1] not in groups or k2trk[a] == k2trk[b]:
                    continue
                D.setdefault((p, k2grp[a], min(k2trk[a], k2trk[b]), max(k2trk[a], k2trk[b])), []).append((a, b))
    pid, ka, kb, pp = [], [], [], []
    keep = 0
    for key, lst in D.items():
        if len(lst) < min_n:
            continue
        d = np.array([np.linalg.norm(X[a] - X[b]) for a, b in lst])
        if d.std() / d.mean() > max_cv:
            continue
        for a, b in lst:
            pid.append(keep); ka.append(a); kb.append(b); pp.append(pitches.index(key[0]))
        keep += 1
    vp.rig = (np.array(pid), np.array(ka), np.array(kb), w) if keep else None  # 짝이 없으면 조건 없이
    vp.rig_p = np.array(pp)
    print(f"  거리 일정 짝 {keep}개 · 조건 {len(pid)}줄 · 무게 {w:g}", flush=True)


RIGID_PAIRS = [("L_ASIS", "R_ASIS"), ("L_ASIS", "L_PSIS"), ("R_ASIS", "R_PSIS"), ("L_PSIS", "R_PSIS"), ("L_ASIS", "R_PSIS"), ("R_ASIS", "L_PSIS"),
               ("L1", "R1")] + [(f"{s}{a}", f"{s}{b}") for s in "LR" for a, b in [("11", "12"), ("11", "13"), ("12", "13"), ("13", "14"), ("3", "4"), ("5", "6"), ("9", "10"), ("9", "11")]]


def setup_rigid_labeled(vp, rows, meta, pitches, w, labels):
    """이름 붙은 스티커 짝: 모든 투구 · 시각에서 거리가 같다(짝마다 길이 하나)."""
    lab = {}
    for r in rows:
        k, c, p, tid = int(r[0]), CAMS[int(r[1])], int(r[2]), int(r[7])
        nm = labels.get(str(p), {}).get(f"{c}:{tid}")
        if nm:
            lab.setdefault(k, []).append(nm)
    klab = {k: v[0] for k, v in lab.items() if len(set(v)) == 1}
    by = {}
    for k, nm in klab.items():
        by.setdefault(meta[k], {})[nm] = k
    pid, ka, kb, pp = [], [], [], []
    for (p, tau), d in by.items():
        for i, (a, b) in enumerate(RIGID_PAIRS):
            if a in d and b in d:
                pid.append(i); ka.append(d[a]); kb.append(d[b]); pp.append(pitches.index(p))
    pid, ka, kb, pp = np.array(pid), np.array(ka), np.array(kb), np.array(pp)
    # 짝 길이는 투구마다 따로(궤적 하나가 다른 스티커로 붙은 투구가 있다) — 투구끼리 가운데값에서 10% 넘게 벗어난 (짝, 투구)는 뺌
    X = vp.resid(vp.x0, want_X=True)[1]
    d = np.linalg.norm(X[ka] - X[kb], axis=1)
    key = pid * 100 + pp
    keep = np.zeros(len(pid), bool)
    for u in np.unique(pid):
        m = pid == u
        med = {q: np.median(d[m & (pp == q)]) for q in np.unique(pp[m])}
        allmed = np.median(list(med.values()))
        for q, v in med.items():
            mm = m & (pp == q)
            if abs(v / allmed - 1) < 0.10 and mm.sum() >= 10:
                keep[mm] = True
    key, ka, kb, pp, pid0 = key[keep], ka[keep], kb[keep], pp[keep], pid[keep]
    uk = np.unique(key)
    remap = {u: j for j, u in enumerate(uk)}
    vp.rig = (np.array([remap[q] for q in key]), ka, kb, w)
    vp.rig_p = pp
    print(f"  이름 짝(투구별 길이) {len(uk)}개 · 조건 {len(key)}줄 · 무게 {w:g} · 짝별 줄 " + str({RIGID_PAIRS[u][0] + "-" + RIGID_PAIRS[u][1]: int((pid0 == u).sum()) for u in np.unique(pid0)}), flush=True)


def solve(pitches, cams, offs, tol, use_k1, step=2 / 240):
    rows, _, meta = collect(pitches, cams, offs, tol, step)
    vp = VP(rows, pitches, cams, offs, use_k1)
    W = float(os.environ.get("RIGID", "0"))  # 비율 벌점 무게: 100 이면 1% 흔들림 = 1px
    if W > 0 and os.environ.get("LABELS"):
        setup_rigid_labeled(vp, rows, meta, pitches, W, json.load(open(os.environ["LABELS"])))
    elif W > 0:
        setup_rigid(vp, rows, meta, pitches, W)
    t0 = time.time()
    r = least_squares(vp.resid, vp.x0, jac=vp.jac, loss="huber", f_scale=1.0, method="trf", tr_solver="exact", x_scale="jac", max_nfev=40)
    res, X = vp.resid(r.x, want_X=True)
    e = np.linalg.norm(res[:2 * len(vp.pc)].reshape(-1, 2), axis=1)
    if getattr(vp, "rig", None) is not None:
        pid, ka, kb, w = vp.rig
        d = np.linalg.norm(X[ka] - X[kb], axis=1); m = np.bincount(pid, d) / np.bincount(pid)
        cv = np.sqrt(np.bincount(pid, (d - m[pid]) ** 2) / np.bincount(pid)) / m
        print(f"  거리 일정 짝 변동계수 가운데값 {100 * np.median(cv):.2f}% · p90 {100 * np.percentile(cv, 90):.2f}%")
    cs, of = vp.cams(r.x), vp.offsets(r.x)
    print(f"  LM {time.time() - t0:.0f}초 nfev {r.nfev} {r.status} · 관측 {len(e)} · 가운데값 {np.median(e):.3f}px p90 {np.percentile(e, 90):.2f} · "
          + " ".join(f"c{c}:{np.median(e[vp.pc == i]):.2f}" for i, c in enumerate(CAMS)), flush=True)
    print("  초점", {c: round(cs[c]["f"], 1) for c in CAMS}, " k1", {c: round(cs[c]["k1"], 4) for c in CAMS}, flush=True)
    per = {p: float(np.median(e[vp.pp == p])) for p in pitches}
    print("  투구별 가운데값", {p: round(v, 2) for p, v in per.items()})
    return cs, of, e, vp, r, X, meta


if __name__ == "__main__":
    pitches = [int(x) for x in sys.argv[1].split(",")]
    cal = json.load(open(sys.argv[2]))
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}
    oj = json.load(open(sys.argv[3]))
    offs = {p: oj[str(p)] for p in pitches}
    k1 = os.environ.get("K1", "0") == "1"
    for it, tol in enumerate([4.0, 2.5, 2.0]):
        print(f"되풀이 {it} · 짝 기준 {tol}px · k1 {k1}", flush=True)
        cams, offs, e, vp, r, X, meta = solve(pitches, cams, offs, tol, k1)
        json.dump({"cams": {c: {k: (np.asarray(v).tolist() if hasattr(v, "__len__") else v) for k, v in cams[c].items()} for c in CAMS},
                   "offsets": {str(p): o for p, o in offs.items()}}, open(sys.argv[4].replace(".json", f"_it{it}.json"), "w"), indent=1)
    json.dump({"cams": {c: {k: (np.asarray(v).tolist() if hasattr(v, "__len__") else v) for k, v in cams[c].items()} for c in CAMS},
               "offsets": {str(p): o for p, o in offs.items()}}, open(sys.argv[4], "w"), indent=1)
