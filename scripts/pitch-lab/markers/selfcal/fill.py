"""4단계 ① 빈 장면 채우기 — 3D 로 잡힌 스티커를 시간 앞뒤로 따라가며 카메라마다 예상 자리 근처의 같은 색 점을 찾아 다시 교차한다.

recon.py 는 '카메라 둘 이상에서 2D 궤적이 길게 이어진' 스티커만 3D 로 만들어 장면의 5~30% 만 덮었다(작은 점 · 겹침 · 궤적 끊김).
여기서는 아는 자리(앞 장면 + 속도)를 각 카메라에 비춰 그 근처 점만 본다 — 궤적을 몰라도 된다.

  (세션 폴더에서) python fill.py 보정.json 1,2,...   → work/fill/pNN.npz (tq · M_이름 · V_이름(시선 수))

안전장치: 점이 반경 안에 둘 이상 비슷한 거리로 있으면 그 카메라는 안 쓴다(헷갈림) · 시선 둘 이상 · 다시 비춤 4px 안 ·
예측에서 8cm(장면당) 넘게 튀면 버린다 · 같은 장면에서 두 이름이 같은 점을 쓰면 둘 다 버린다.
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kpba import proj, tri
from tracks import load_det

WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))
from cams import CAMS
MAX_GAP = 4  # 이만큼 빈 장면까지 예측을 이어 본다
REPROJ = 4.0  # px
JUMP = 0.08  # 단위(보정) — 아래 scale 로 m 환산해 쓴다


def color_of(name):
    return "yellow" if name.startswith("L") else "pink"


class Cam:
    def __init__(self, p, c, cam, off):
        d = load_det(p, c)
        self.cam = cam
        self.off = off
        self.t = np.array([f["t"] for f in d["frames"]])
        self.blobs = {col: [np.array([b[:2] for b in f[col]]) if f[col] else np.zeros((0, 2)) for f in d["frames"]] for col in ("pink", "yellow")}

    def look(self, X, tau, col, prev_uv=None):
        """기준 시각 tau 의 3D 예측 X → 그 시각의 2D 점(앞뒤 장면에서 찾아 보간). 못 찾거나 헷갈리면 None."""
        tt = tau + self.off
        if tt < self.t[0] or tt > self.t[-1]:
            return None
        uv = proj(self.cam, X[None])[0]
        j = int(np.clip(np.searchsorted(self.t, tt) - 1, 0, len(self.t) - 2))
        speed = 0.0 if prev_uv is None else float(np.linalg.norm(uv - prev_uv))
        R = 7.0 + 0.6 * speed
        got = []
        for k in (j, j + 1):
            B = self.blobs[col][k]
            if len(B) == 0:
                got.append(None); continue
            d = np.linalg.norm(B - uv, axis=1)
            o = np.argsort(d)
            if d[o[0]] > R or (len(o) > 1 and d[o[1]] < 1.6 * d[o[0]] + 2.0):
                got.append(None); continue
            got.append((B[o[0]], k, int(o[0])))
        a, b = got
        if a and b:
            w = (tt - self.t[j]) / max(self.t[j + 1] - self.t[j], 1e-9)
            return a[0] * (1 - w) + b[0] * w, (a[1], a[2]) if w < 0.5 else (b[1], b[2]), uv
        g = a or b
        if g and abs(self.t[g[1]] - tt) < 1.5e-3:
            return g[0], (g[1], g[2]), uv
        return None


def fill_pitch(p, cal, scale):
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}
    off = cal["offsets"][str(p)]
    C = {c: Cam(p, c, cams[c], off[c]) for c in CAMS}
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz"))
    tq = rec["tq"]
    names = [k[2:] for k in rec.files if k.startswith("M_")]
    M = {n: rec["M_" + n].copy() for n in names}
    V = {n: (~np.isnan(M[n][:, 0])).astype(int) * 2 for n in names}
    used = {n: [None] * len(tq) for n in names}  # 장면마다 쓴 (카메라, 장면, 점 번호)들
    jump = JUMP / scale
    for n in names:
        col = color_of(n)
        X = M[n]
        for direction in (1, -1):
            order = range(len(tq)) if direction == 1 else range(len(tq) - 1, -1, -1)
            last, prev = None, None  # 마지막으로 아는 장면 번호 · 그 앞
            prev_uv = {}
            for i in order:
                if not np.isnan(X[i, 0]):
                    prev, last = last, i
                    continue
                if last is None or abs(i - last) > MAX_GAP:
                    continue
                v = (X[last] - X[prev]) / (last - prev) if prev is not None and abs(last - prev) <= MAX_GAP else np.zeros(3)
                pred = X[last] + v * (i - last)
                obs, keys = [], []
                for c in CAMS:
                    r = C[c].look(pred, tq[i], col, prev_uv.get(c))
                    if r is None:
                        continue
                    uv, key, puv = r
                    obs.append((c, uv)); keys.append((c,) + key)
                    prev_uv[c] = puv
                while len(obs) >= 2:
                    Xn = tri(cams, obs)
                    err = [float(np.linalg.norm(proj(cams[c], Xn[None])[0] - uv)) for c, uv in obs]
                    w = int(np.argmax(err))
                    if err[w] <= REPROJ:
                        break
                    if len(obs) == 2:
                        obs = []; break
                    del obs[w]; del keys[w]
                if len(obs) < 2 or np.linalg.norm(Xn - pred) > jump * max(1, abs(i - last)):
                    continue
                X[i] = Xn; V[n][i] = len(obs); used[n][i] = keys
                prev, last = last, i
    # 같은 장면 · 같은 2D 점을 두 이름이 썼으면 둘 다 버린다(새로 채운 것만)
    for i in range(len(tq)):
        seen = {}
        for n in names:
            for k in used[n][i] or []:
                seen.setdefault(k, []).append(n)
        for k, ns in seen.items():
            if len(ns) > 1:
                for n in ns:
                    M[n][i] = np.nan; V[n][i] = 0
    return tq, M, V


if __name__ == "__main__":
    cal = json.load(open(sys.argv[1]))
    world = json.load(open(os.path.join(WORK, "world.json")))
    os.makedirs(os.path.join(WORK, "fill"), exist_ok=True)
    for p in [int(x) for x in sys.argv[2].split(",")]:
        before = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz"))
        tq, M, V = fill_pitch(p, cal, world["scale"])
        np.savez_compressed(os.path.join(WORK, "fill", f"p{p:02d}.npz"), tq=tq, **{"M_" + k: v for k, v in M.items()}, **{"V_" + k: v for k, v in V.items()})
        b = np.mean([(~np.isnan(before["M_" + n][:, 0])).mean() for n in M])
        a = np.mean([(~np.isnan(M[n][:, 0])).mean() for n in M])
        print(f"투구 {p}: 이름 {len(M)} · 장면 덮음 평균 {b * 100:.0f}% → {a * 100:.0f}%", flush=True)
