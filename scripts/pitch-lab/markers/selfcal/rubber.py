"""투수판 네 모서리(빈 마운드 장면)로 보정 확인 · 배율 — 보정에 안 쓴 고정 물체라 보정이 맞는지 따로 볼 수 있다(10-21).

  MARKER_CAMS=123 py rubber.py 보정.json …   (work/chk/empty_{side,back,cam3}.png — 사람이 떠난 장면, BOX 는 그 촬영의 투수판 자리)
흰 덩어리 → 네 변 직선 → 교점이 모서리. 카메라 사이 모서리 짝은 교차 오차가 가장 작은 차례로 고른다.
출력: 교차 오차(가운데 · 최대 px) · 변 길이(보정 단위) · 긴 변 61cm(규격 투수판)일 때 배율. 규격이면 긴/짧은 = 4.0.
"""
import sys, json, itertools
import numpy as np, cv2
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kpba import tri
from sba import proj_k

W = os.path.join(os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work")), "chk") + "/"
# 10-21 4차 촬영 1~5구(배트 영상 끝 21~23초, 사람이 떠난 0.6초 가운데값)의 투수판 자리(x0, y0, x1, y1)
BOX = {"1": ("side", (390, 700, 540, 800)), "2": ("back", (320, 1280, 610, 1350)), "3": ("cam3", (990, 700, 1250, 770))}


def corners(name, box):
    x0, y0, x1, y1 = box
    img = cv2.imread(W + f"empty_{name}.png")[y0:y1, x0:x1]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m = ((hsv[..., 2] > 170) & (hsv[..., 1] < 60)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    hull = cv2.convexHull(c)
    for eps in np.linspace(0.5, 20, 80):
        q = cv2.approxPolyDP(hull, eps, True)
        if len(q) == 4:
            break
    q = q[:, 0].astype(float)
    # 변마다 윤곽 점에 직선을 다시 맞추고 이웃 직선의 교점 = 모서리(1px 밑)
    pts = c[:, 0].astype(float)
    lines = []
    for i in range(4):
        a, b = q[i], q[(i + 1) % 4]
        d = (b - a) / np.linalg.norm(b - a); nrm = np.array([-d[1], d[0]])
        s = (pts - a) @ d; off = np.abs((pts - a) @ nrm)
        L = np.linalg.norm(b - a)
        sel = pts[(off < 2.5) & (s > 0.15 * L) & (s < 0.85 * L)]
        vx, vy, x, y = cv2.fitLine(sel.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
        lines.append((np.array([x, y]), np.array([vx, vy])))
    out = []
    for i in range(4):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        t = np.linalg.solve(np.c_[d1, -d2], p2 - p1)
        out.append(p1 + t[0] * d1 + np.array([x0, y0]))
    return np.array(out)


C = {k: corners(*v) for k, v in BOX.items()}
for k, v in C.items():
    print(k, np.round(v, 1).tolist())
for path in sys.argv[1:]:
    cal = json.load(open(path))
    cams = {c: {kk: (np.array(vv) if isinstance(vv, list) else vv) for kk, vv in cal["cams"][c].items()} for c in "123"}
    best = None
    orders = [list(np.roll(range(4), s))[::d] for s in range(4) for d in (1, -1)]
    for o2, o3 in itertools.product(orders, orders):
        X, err = [], []
        for i in range(4):
            obs = [("1", C["1"][i]), ("2", C["2"][o2[i]]), ("3", C["3"][o3[i]])]
            Y = tri(cams, obs); X.append(Y)
            err += [float(np.linalg.norm(proj_k(cams[c], Y[None])[0] - uv)) for c, uv in obs]
        e = float(np.median(err))
        if best is None or e < best[0]:
            best = (e, np.array(X), max(err))
    e, X, emax = best
    L = [np.linalg.norm(X[i] - X[(i + 1) % 4]) for i in range(4)]
    long_, short_ = (L[0] + L[2]) / 2, (L[1] + L[3]) / 2
    if long_ < short_:
        long_, short_ = short_, long_
    print(f"{path.split('/')[-1]}: 교차 오차 가운데 {e:.2f}px 최대 {emax:.2f} · 변 {np.round(L, 4).tolist()} · 긴/짧은 {long_ / short_:.2f} · 61cm 면 배율 {0.61 / long_:.4f} m/단위")
