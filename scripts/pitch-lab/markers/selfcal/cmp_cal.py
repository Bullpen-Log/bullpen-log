"""두 보정으로 같은 관측을 교차해 3D 차이(닮음 변환으로 맞춘 뒤, cm 어림)."""
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vpba import VP, collect, CAMS
def L(f):
    cal = json.load(open(f)); return {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in CAMS}, {int(p): o for p, o in cal["offsets"].items()}
pitches = [int(x) for x in sys.argv[1].split(",")]
ca, oa = L(sys.argv[2]); cb, ob = L(sys.argv[3])
rows, _, meta = collect(pitches, cb, ob, 2.0, 2 / 240)
Xs = []
for cams, offs in ((ca, oa), (cb, ob)):
    vp = VP(rows, pitches, cams, {p: ob[p] for p in pitches}, True)
    vp.o0 = np.array([ob[p][CAMS[c]] for p, c in zip(vp.pp, vp.pc)])  # 같은 관측 자리에서 시작
    Xs.append(vp.resid(vp.x0, want_X=True)[1])
A, B = Xs
ma, mb = A.mean(0), B.mean(0); a, b = A - ma, B - mb
U, S, Vt = np.linalg.svd(b.T @ a); R = U @ Vt
if np.linalg.det(R) < 0: U[:, -1] *= -1; R = U @ Vt
s = S.sum() / (a ** 2).sum()
A2 = s * a @ R.T + mb
d = np.linalg.norm(A2 - B, axis=1) * float(sys.argv[4])
print(f"닮음 배율 {s:.4f} · 차이(cm) 가운데값 {np.median(d) * 100:.2f} p90 {np.percentile(d, 90) * 100:.2f} 최대 {d.max() * 100:.1f}")
