"""겹쳐 보기 그림 — 빨강 동그라미: AI 2D, 파랑 선: 엔진, 초록 선: 화면 인형(overlay.mjs 가 부른다).
python draw.py <points.json> <영상 옆> <영상 뒤> <나갈 png> <부위> <시작> <끝> <걸음>"""
import os, sys, json
import numpy as np, cv2, av

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "services", "pitch3d-gpu"))
from pitch3d_gpu.video import _frame_rotation, _upright, upright_turn

pts, vs, vb, out, part = sys.argv[1:6]
a, b, st = (int(x) for x in sys.argv[6:9])
D = json.load(open(pts)); F = D["frames"]; rl = D["events"]["release"]
ks = list(range(a, b + 1, st))


def grab(path, times):
    want = np.array(times); best = [None] * len(times)
    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]; turn = None
        for f in c.decode(s):
            d = np.abs(want - float(f.pts * s.time_base)); js = np.nonzero(d < 0.02)[0]
            if not len(js):
                continue
            if turn is None:
                turn = upright_turn(_frame_rotation(f))
            img = None
            for j in js:
                if best[j] is None or d[j] < best[j][0]:
                    img = img if img is not None else _upright(f.to_ndarray(format="bgr24"), turn)
                    best[j] = (d[j], img)
    return [x[1] if x else None for x in best]


def chain(im, P, col):
    for i in range(len(P) - 1):
        cv2.line(im, tuple(int(v) for v in P[i]), tuple(int(v) for v in P[i + 1]), col, 3, cv2.LINE_AA)
    for p in P:
        cv2.circle(im, tuple(int(v) for v in p), 5, col, -1, cv2.LINE_AA)


rows = []
for view, path, tk in (("side", vs, "t"), ("back", vb, "tb")):
    tiles = []
    for k, img in zip(ks, grab(path, [F[k][tk] for k in ks])):
        if img is None:
            continue
        o = F[k][view][part]
        allp = np.array([p[:2] for p in o["ai"]] + o["eng"] + o["disp"])
        cx, cy = np.median(allp, 0); half = max(140, np.ptp(allp, 0).max() * 0.75)
        im = img.copy()
        chain(im, o["disp"], (60, 200, 60))
        chain(im, o["eng"], (255, 120, 30))
        for p in o["ai"]:
            cv2.circle(im, (int(p[0]), int(p[1])), 7, (40, 40, 240), 2, cv2.LINE_AA)
        x0, y0 = int(max(0, cx - half)), int(max(0, cy - half))
        crop = cv2.resize(im[y0:int(cy + half), x0:int(cx + half)], (300, 300))
        cv2.putText(crop, f"{view} {k} ({k - rl:+d})", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
        tiles.append(crop)
    if tiles:
        rows.append(np.hstack(tiles))
w = max(r.shape[1] for r in rows)
cv2.imwrite(out, np.vstack([np.pad(r, ((0, 6), (0, w - r.shape[1]), (0, 0))) for r in rows]))
