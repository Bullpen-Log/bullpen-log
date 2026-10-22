"""착지 지표 정확도 — 엔진(옆 · 뒤)이 화면 '착지'(events.footContact)에서 낸 자세 vs 세 · 네 대 교차 K.
오차를 둘로 가른다: ① 같은 장면의 자세 오차(엔진 − K@단추) ② 단추 시점이 어긋난 몫(K@단추 − K@실제 첫 닿음, 앞발 뒤꿈치 · 발끝이 디딘 높이 +1.5cm 안).

  (세션 폴더에서) python landing_metrics.py 키m 보정.json 배율.json 투구,… [보정.json 배율.json 투구,…]…
  예(10-21): python landing_metrics.py 1.88 $R/calG1_kp2.json $R/world_G1.json 1,2,3,4,5 $R/calG2_kp2.json $R/world_G2.json 6,7,8,9,10
엔진 결과는 work/bench/pNN/result.json(bench.py · mocap-fit.mts), K 는 work/rec/pNN.npz(labels_all.py). 지표 식은 metric_score.py 와 같다(우투).
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B


def ang(a, b):
    return np.degrees(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1)))


def group(cal_path, world_path, ps, H, rows):
    cal = json.load(open(cal_path))
    toW = B.world_of(cal_path, world_path)
    for p in ps:
        f = os.path.join(B.WORK, B.BENCH, f"p{p:02d}", "result.json")
        if not os.path.exists(f):
            continue
        r = json.load(open(f))
        if not r.get("ok"):
            continue
        rec = np.load(os.path.join(B.WORK, "rec", f"p{p:02d}.npz"))
        tq = rec["tq"]
        te = np.array(r["t"]) - cal["offsets"][str(p)]["1"]
        J = np.array(r["joints"], float) / 1000.0
        Kraw = {n: toW(rec[f"K_{kn}_{sd}"]) for n, (kn, sd) in B.K4_OF.items()}
        K = {n: np.array([[np.interp(tt, tq, X[:, a], left=np.nan, right=np.nan) for a in range(3)] for tt in te]) for n, X in Kraw.items()}
        A, Bb = [], []
        for n, T in K.items():
            m = ~np.isnan(T[:, 0])
            A.append(J[m, B.IX[n]]); Bb.append(T[m])
        s, R, t = B.umeyama(np.concatenate(A), np.concatenate(Bb))
        E = {n: s * (R @ J[:, B.IX[n]].T).T + t for n in B.K4_OF}
        ear, heel = (Kraw["lEar"] + Kraw["rEar"]) / 2, (Kraw["lHe"] + Kraw["rHe"]) / 2
        st = tq < tq[0] + 0.4
        U = np.nanmedian(ear[st] - heel[st], 0)
        U /= np.linalg.norm(U)
        hz = lambda v: v - U * (v @ U)
        ev = r["events"]
        ku, fp = ev["kneeUp"], ev["footPlant"]
        fc = ev.get("footContact", fp)
        hm = lambda G, k: (G["lHip"][k] + G["rHip"][k]) / 2
        F = hz(hm(K, fp) - hm(K, ku))
        F /= np.linalg.norm(F)
        Gv = np.cross(U, F)
        low = np.fmin(Kraw["lHe"] @ U, Kraw["lTo"] @ U)
        rest = np.nanmedian(low[(tq > te[fp] + 0.1) & (tq < te[fp] + 0.25)])
        c = np.where((tq > te[ku]) & (tq < te[fp] + 0.1) & (low <= rest + 0.015))[0]
        if not len(c):
            continue
        Kc = {n: np.array([np.interp(tq[c[0]], tq, X[:, a]) for a in range(3)]) for n, X in Kraw.items()}

        def m(g):
            if any(np.isnan(g(n)[0]) for n in ("lHip", "rHip", "lSh", "rSh", "lKn", "lAn", "rAn")):
                return None
            tr = (g("lSh") + g("rSh")) / 2 - (g("lHip") + g("rHip")) / 2
            op = lambda a, b: np.degrees(np.arctan2(hz(b - a) @ Gv, hz(b - a) @ F))
            sep = op(g("rHip"), g("lHip")) - op(g("rSh"), g("lSh"))
            d = g("lAn") - g("rAn")
            return {"앞무릎°": 180 - ang(g("lHip") - g("lKn"), g("lAn") - g("lKn")), "분리°": (sep + 180) % 360 - 180,
                    "몸통 앞숙임°": np.degrees(np.arctan2(tr @ F, tr @ U)), "어깨 열림°": op(g("rSh"), g("lSh")), "골반 열림°": op(g("rHip"), g("lHip")),
                    "보폭 %키": d @ F / H * 100, "보폭 옆 %키": d @ Gv / H * 100}

        a, b, k = m(lambda n: E[n][fc]), m(lambda n: K[n][fc]), m(lambda n: Kc[n])
        if a and b and k:
            for key in a:
                rows.setdefault(key, []).append((a[key], b[key], k[key]))


if __name__ == "__main__":
    H = float(sys.argv[1])
    rows = {}
    args = sys.argv[2:]
    for i in range(0, len(args), 3):
        group(args[i], args[i + 1], [int(x) for x in args[i + 2].split(",")], H, rows)
    print(f"{'지표':12s} 투구  자세 오차(엔진−K@단추) 가운데 · |차|   시점 몫(K@단추−K@닿음) 가운데 · |차|   합 |차|")
    for key, v in rows.items():
        v = np.array(v)
        d1, d2, d3 = v[:, 0] - v[:, 1], v[:, 1] - v[:, 2], v[:, 0] - v[:, 2]
        print(f"{key:12s} {len(v):3d}   {np.median(d1):+6.1f} · {np.median(abs(d1)):5.1f}            {np.median(d2):+6.1f} · {np.median(abs(d2)):5.1f}            {np.median(abs(d3)):5.1f}")
