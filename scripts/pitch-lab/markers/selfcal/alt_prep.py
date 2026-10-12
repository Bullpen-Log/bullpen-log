"""다른 2D 모델 결과 → RTMW 133점 꼴(work/kp_A · kp_B) + 그 모델로 만든 K4(work/rec_A · rec_B) + 2D 직접 채점.

  (세션 폴더에서) python alt_prep.py [A B]   → 그 뒤 엔진 채점: KP_DIR=kp_A python bench.py tracks … · K4_REC=rec_A python bench.py score …
A = RTMPose-x halpe26: 몸 17 + 발 6 을 바꿈(손 · 얼굴은 RTMW 그대로)
B = ViTPose++-H COCO17: 몸 17 만 바꿈(발 · 손 · 얼굴은 RTMW)
점수는 관절마다 RTMW 점수 분포에 순위로 맞춘다(엔진 문턱이 같은 몫을 거르게) — 모델 자신의 확신 순서는 그대로.
"""
import os, sys, json
import numpy as np

SC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SC)
WORK = os.path.join(os.getcwd(), "work")
NAMES = sorted(n[:-4] for n in os.listdir(os.path.join(WORK, "kp")) if n.endswith(".npz"))
# 바꿀 133 번호 ← 모델 번호
MAP = {"A": ("kp_rtmpose", {**{j: j for j in range(17)}, 17: 20, 18: 22, 19: 24, 20: 21, 21: 23, 22: 25}),
       "B": ("kp_vitpose", {j: j for j in range(17)})}


def build(tag):
    src, mp = MAP[tag]
    raw = {n: np.load(os.path.join(WORK, "kp", n + ".npz")) for n in NAMES}
    alt = {n: np.load(os.path.join(WORK, src, n + ".npz")) for n in NAMES}
    # 관절마다 점수 순위 맞추기 표(모든 영상 모아서, 사람을 찾은 장면만)
    qmap = {}
    for w, a in mp.items():
        r = np.concatenate([raw[n]["sc"][:, w][raw[n]["sc"][:, :17].max(1) > 0] for n in NAMES])
        s = np.concatenate([alt[n]["sc"][:, a][alt[n]["sc"].max(1) > 0] for n in NAMES])
        qmap[w] = (np.sort(s), np.sort(r))
    out = os.path.join(WORK, f"kp_{tag}")
    os.makedirs(out, exist_ok=True)
    for n in NAMES:
        z, y = raw[n], alt[n]
        assert np.allclose(z["t"], y["t"]), n
        kp, sc = z["kp"].copy(), z["sc"].copy()
        found = y["sc"].max(1) > 0
        for w, a in mp.items():
            s_sorted, r_sorted = qmap[w]
            q = np.searchsorted(s_sorted, y["sc"][:, a]) / max(len(s_sorted) - 1, 1)
            mapped = np.quantile(r_sorted, np.clip(q, 0, 1))
            kp[found, w] = y["kp"][found, a]
            sc[found, w] = mapped[found]
        np.savez_compressed(os.path.join(out, n + ".npz"), t=z["t"], kp=kp, sc=sc, wh=z["wh"])
    print(tag, "133점 꼴", len(NAMES), flush=True)


def k4(tag, cal):
    os.environ["KP_DIR"] = f"kp_{tag}"
    from recon import kp3d
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in "1234"}
    out = os.path.join(WORK, f"rec_{tag}")
    os.makedirs(out, exist_ok=True)
    for p in range(1, 17):
        rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz"))
        K = kp3d(p, cams, cal["offsets"][str(p)], rec["tq"])
        np.savez_compressed(os.path.join(out, f"p{p:02d}.npz"), tq=rec["tq"], **{f"K_{a}_{b}": v for (a, b), v in K.items()})
    print(tag, "K4 16", flush=True)


def direct2d(cal):
    """카메라마다 스티커 3D 를 영상에 비춘 점 ↔ 2D 관절 거리의 흔들림(px, 투구 가운데) — 2D 모델끼리 같은 잣대"""
    from kpba import proj
    from bench import MARK_OF, NAMES as V2N, RTMW
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in "1234"}
    J = {n: RTMW[V2N.index(n)] for n in MARK_OF}
    res = {}
    for tag, d in (("RTMW", "kp"), ("A", "kp_A"), ("B", "kp_B")):
        rows = []
        for p in range(2, 17):
            fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz"))
            tq = fl["tq"]
            for c in "12":
                z = np.load(os.path.join(WORK, d, f"투구{p:02d}_c{c}.npz"))
                tt = tq + cal["offsets"][str(p)][c]
                i = np.clip(np.searchsorted(z["t"], tt), 0, len(z["t"]) - 1)
                near = np.abs(z["t"][i] - tt) < 0.5 / 240
                for n, mk in MARK_OF.items():
                    if "M_" + mk not in fl.files:
                        continue
                    M = fl["M_" + mk]
                    ok = near & ~np.isnan(M[:, 0]) & (z["sc"][i, J[n]] > 3)
                    if ok.sum() < 24:
                        continue
                    uv = proj(cams[c], M[ok])
                    dd = np.linalg.norm(uv - z["kp"][i[ok], J[n]], axis=1)
                    rows.append((p, c, n, float(np.std(dd))))
        res[tag] = rows
    keys = sorted({(r[0], r[1], r[2]) for r in res["RTMW"]} & {(r[0], r[1], r[2]) for r in res["A"]} & {(r[0], r[1], r[2]) for r in res["B"]})
    for tag in res:
        v = {(r[0], r[1], r[2]): r[3] for r in res[tag]}
        allv = [v[k] for k in keys]
        by = {}
        for k in keys:
            by.setdefault(k[2], []).append(v[k])
        print(f"2D 직접 {tag:4s} 모두 {np.median(allv):.2f}px · " + " ".join(f"{n} {np.median(x):.1f}" for n, x in sorted(by.items())), flush=True)


if __name__ == "__main__":
    cal = json.load(open(os.path.join(WORK, "cal16b.json")))
    for tag in sys.argv[1:] or ["A", "B"]:
        build(tag)
        k4(tag, cal)
    direct2d(cal)
