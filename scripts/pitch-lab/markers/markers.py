"""마커 테스트 샘플 처리 — 몸에 붙인 색 스티커(마커)로 3D 정답지를 만든다(촬영 안내 PDF '마커 테스트 샘플 촬영 안내').

엔진(옆 · 뒤 두 영상)이 맞힌 관절을 채점하려고, 3~4대 카메라 · 바닥 스티커 · 막대로 엔진과 따로 정답을 만든다.
정답이 엔진의 카메라 계산을 빌려 쓰면 엔진이 틀린 만큼 정답도 같이 틀린다.

  python scripts/pitch-lab/markers/markers.py detect 영상 출력.json          장면마다 분홍 · 노랑 스티커 자리 + 밝기
  python scripts/pitch-lab/markers/markers.py check 영상 출력.png [--at 초]   색 시험: 한 장면에 찾은 스티커를 그려 본다
  python scripts/pitch-lab/markers/markers.py flash 찾은.json                 플래시 시각(카메라끼리 시간 맞추기)
  python scripts/pitch-lab/markers/markers.py calibrate 세션.json 출력.json   바닥 스티커 + 막대로 카메라 위치 · 초점
  python scripts/pitch-lab/markers/markers.py points 세션.json 보정.json 이름 출력.json   장면마다 3D 점(이름 붙이기 전)
  python scripts/pitch-lab/markers/markers.py selftest                         합성 영상 · 합성 카메라로 전부 시험

세션.json — 카메라마다 찾은 자료(detect 출력)와 줄자로 잰 길이:
  {"wand_cm": 100.0, "floor_cm": {"sides": [노랑→다음, …, 마지막→노랑], "diags": [노랑↔셋째, 둘째↔넷째]},
   "cams": {"1": {"wand": "a1.json", "height_m": 1.1, "takes": {"투구1": "p1_1.json"}}, "2": {…}}}

좌표: 세상 = 바닥 노랑 스티커가 원점, z 가 위(미터). 카메라 x_img = K (R X + t). 영상 · 개인 자료는 저장소에 넣지 않는다.
"""

from __future__ import annotations

import json
import math
import os
import sys
from itertools import combinations, product

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "services", "pitch3d-gpu"))

# 형광 스티커 색(OpenCV HSV, H 0~179). 분홍은 빨강 · 피부(H 0~20)와 겹치지 않게 140 부터, 노랑은 20~38.
COLORS: dict[str, tuple[tuple[int, int, int], tuple[int, int, int]]] = {
    "pink": ((140, 90, 110), (179, 255, 255)),
    "yellow": ((20, 100, 140), (38, 255, 255)),
}
MIN_DIAM_PX = 5  # 이보다 작은 덩어리는 잡음
MAX_DIAM_FRAC = 0.07  # 짧은 변의 7% 보다 크면 스티커가 아님(옷 · 장비)


# ── 영상 읽기 ─────────────────────────────────────────────────────────────


def iter_frames(path: str, start: float | None = None, end: float | None = None):
    """(원본 트랙 초, BGR) — 편집 목록 무시 · 회전 바로 세우기는 분석 서버(video.py)와 같은 규칙."""
    import av
    from pitch3d_gpu.video import _frame_rotation, _upright, upright_turn

    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
        s.thread_type = "AUTO"
        fps = float(s.average_rate or s.guessed_rate or 30)
        turn = None
        for i, f in enumerate(c.decode(s)):
            t = float(f.pts * s.time_base) if f.pts is not None else i / fps
            if start is not None and t < start:
                continue
            if end is not None and t > end:
                break
            if turn is None:
                turn = upright_turn(_frame_rotation(f))
            yield t, _upright(f.to_ndarray(format="bgr24"), turn)


def find_blobs(img: np.ndarray) -> dict[str, list[list[float]]]:
    """색마다 [x, y, 넓이] — 둥글고(상자 채움 45%↑ · 가로세로 2.5배↓) 크기가 맞는 덩어리만."""
    import cv2

    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    amin = math.pi / 4 * MIN_DIAM_PX**2
    amax = math.pi / 4 * (MAX_DIAM_FRAC * min(w, h)) ** 2
    out: dict[str, list[list[float]]] = {}
    for name, (lo, hi) in COLORS.items():
        m = cv2.morphologyEx(cv2.inRange(hsv, np.array(lo), np.array(hi)), cv2.MORPH_OPEN, k)
        n, _, stats, cent = cv2.connectedComponentsWithStats(m, connectivity=8)
        keep = []
        for i in range(1, n):
            a = stats[i, cv2.CC_STAT_AREA]
            bw, bh = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
            if not (amin <= a <= amax):
                continue
            if a / (bw * bh) < 0.45 or max(bw, bh) / max(1, min(bw, bh)) > 2.5:
                continue
            keep.append([round(float(cent[i][0]), 2), round(float(cent[i][1]), 2), int(a)])
        out[name] = keep
    return out


def detect(path: str, out: str) -> dict:
    import cv2

    frames = []
    w = h = 0
    for t, img in iter_frames(path):
        h, w = img.shape[:2]
        small = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (64, 64), interpolation=cv2.INTER_AREA)
        frames.append({"t": round(t, 5), "b": round(float(small.mean()), 2), **find_blobs(img)})
    res = {"video": os.path.basename(path), "w": w, "h": h, "frames": frames}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f)
    counts = [len(fr["pink"]) + len(fr["yellow"]) for fr in frames]
    print(f"장면 {len(frames)} · 스티커 가운데값 {int(np.median(counts)) if counts else 0}개 · {w}x{h}")
    return res


def check(path: str, out: str, at: float = 1.0) -> None:
    """색 시험 — 그 시각 장면에 찾은 스티커를 동그라미로(분홍 · 노랑), 색 가림막을 옆에 붙여 저장."""
    import cv2

    for t, img in iter_frames(path, start=at):
        blobs = find_blobs(img)
        vis = img.copy()
        for name, col in (("pink", (180, 60, 255)), ("yellow", (0, 230, 255))):
            for x, y, a in blobs[name]:
                r = max(6, int(math.sqrt(a / math.pi)) + 4)
                cv2.circle(vis, (int(x), int(y)), r, col, 2)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        masks = [cv2.inRange(hsv, np.array(lo), np.array(hi)) for lo, hi in COLORS.values()]
        both = cv2.cvtColor(np.maximum(*masks), cv2.COLOR_GRAY2BGR)
        cv2.imwrite(out, np.hstack([vis, both]))
        print(f"{t:.3f}초 · 분홍 {len(blobs['pink'])}개 · 노랑 {len(blobs['yellow'])}개 → {out}")
        return
    print("그 시각 장면이 없어요")


def flash_time(det: dict, window: float = 15.0) -> float | None:
    """처음 window 초 안에서 밝기가 가장 크게 뛴 곳 — 뛴 폭의 절반을 처음 넘는 장면 시각. 뚜렷하지 않으면 None."""
    fr = [f for f in det["frames"] if f["t"] <= det["frames"][0]["t"] + window]
    if len(fr) < 10:
        return None
    b = np.array([f["b"] for f in fr])
    base = np.median(b[: max(5, len(b) // 10)])
    i = int(np.argmax(b))
    if b[i] - base < max(8.0, 4 * np.std(b[: max(5, len(b) // 10)])):
        return None
    half = base + 0.5 * (b[i] - base)
    j = i
    while j > 0 and b[j - 1] >= half:
        j -= 1
    return float(fr[j]["t"])


# ── 카메라 ────────────────────────────────────────────────────────────────


def rodrigues(r: np.ndarray) -> np.ndarray:
    th = np.linalg.norm(r)
    if th < 1e-12:
        return np.eye(3)
    k = r / th
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K


def project(cam: dict, X: np.ndarray) -> np.ndarray:
    """X (N,3) → (N,2). cam = {f, cx, cy, R(3x3), t(3)}"""
    Xc = (cam["R"] @ X.T).T + cam["t"]
    return np.stack([cam["f"] * Xc[:, 0] / Xc[:, 2] + cam["cx"], cam["f"] * Xc[:, 1] / Xc[:, 2] + cam["cy"]], 1)


def triangulate(cams: list[dict], uvs: list[np.ndarray]) -> np.ndarray:
    """선형(DLT) 교차 — 시선 2개 이상."""
    A = []
    for cam, (u, v) in zip(cams, uvs):
        P = np.diag([cam["f"], cam["f"], 1.0]) @ np.hstack([cam["R"], cam["t"][:, None]])
        P[0] += cam["cx"] * P[2]
        P[1] += cam["cy"] * P[2]
        A.append(u * P[2] - P[0])
        A.append(v * P[2] - P[1])
    _, _, vt = np.linalg.svd(np.array(A))
    X = vt[-1]
    return X[:3] / X[3]


def floor_layout(sides: list[float], diags: list[float]) -> np.ndarray:
    """줄자 길이(cm) → 바닥 네 점(m, z=0) — 노랑이 원점, 둘째가 +x, 셋째가 +y 쪽(위에서 봐 반시계)."""
    s01, s12, s23, s30 = [v / 100 for v in sides]
    d02, d13 = [v / 100 for v in diags]
    P0 = np.array([0.0, 0.0])
    P1 = np.array([s01, 0.0])
    x2 = (d02**2 - s12**2 + s01**2) / (2 * s01)
    P2 = np.array([x2, math.sqrt(max(0.0, d02**2 - x2**2))])
    # 넷째: 노랑에서 s30, 셋째에서 s23, 둘째에서 d13(셋 중 둘로 정하고 셋째로 고르기)
    best = None
    for sgn in (1, -1):
        x3 = (s30**2 - d13**2 + s01**2) / (2 * s01)
        y3 = sgn * math.sqrt(max(0.0, s30**2 - x3**2))
        P3 = np.array([x3, y3])
        e = abs(np.linalg.norm(P3 - P2) - s23)
        if best is None or e < best[0]:
            best = (e, P3)
    P3 = best[1]
    return np.array([[*p, 0.0] for p in (P0, P1, P2, P3)])


def static_points(det: dict, min_share: float = 0.6) -> dict[str, list[np.ndarray]]:
    """장면 내내 같은 자리(4px)에 있는 스티커 — 바닥 표시."""
    out = {}
    n = len(det["frames"])
    for name in COLORS:
        cells: dict[tuple[int, int], list[list[float]]] = {}
        for fr in det["frames"]:
            for x, y, _ in fr[name]:
                cells.setdefault((int(x // 4), int(y // 4)), []).append([x, y])
        pts = []
        used = set()
        for key, vals in sorted(cells.items(), key=lambda kv: -len(kv[1])):
            if key in used:
                continue
            group = []
            for dx, dy in product((-1, 0, 1), repeat=2):
                k2 = (key[0] + dx, key[1] + dy)
                if k2 in cells and k2 not in used:
                    group += cells[k2]
                    used.add(k2)
            if len(group) >= min_share * n:
                pts.append(np.mean(np.array(group), 0))
        out[name] = pts
    return out


def floor_order(st: dict[str, list[np.ndarray]]) -> np.ndarray | None:
    """노랑 1 · 분홍 3 → 노랑부터 영상에서 한 방향(각도 증가)으로 돈 네 점."""
    if len(st["yellow"]) != 1 or len(st["pink"]) != 3:
        return None
    pts = [st["yellow"][0], *st["pink"]]
    c = np.mean(pts, 0)
    ang = [math.atan2(p[1] - c[1], p[0] - c[0]) for p in pts]
    order = sorted(range(4), key=lambda i: (ang[i] - ang[0]) % (2 * math.pi))
    return np.array([pts[i] for i in order])


def focal_from_floor(img_pts: np.ndarray, world: np.ndarray, cx: float, cy: float) -> float | None:
    """평면 호모그래피의 회전 조건으로 초점 — r1 ⟂ r2 · |r1| = |r2|."""
    import cv2

    H, _ = cv2.findHomography(world[:, :2], img_pts - [cx, cy])
    if H is None:
        return None
    h = H
    fs = []
    den1 = h[2, 0] * h[2, 1]
    if abs(den1) > 1e-12:
        v = -(h[0, 0] * h[0, 1] + h[1, 0] * h[1, 1]) / den1
        if v > 0:
            fs.append(math.sqrt(v))
    den2 = h[2, 0] ** 2 - h[2, 1] ** 2
    if abs(den2) > 1e-12:
        v = -(h[0, 0] ** 2 + h[1, 0] ** 2 - h[0, 1] ** 2 - h[1, 1] ** 2) / den2
        if v > 0:
            fs.append(math.sqrt(v))
    return float(np.median(fs)) if fs else None


def pose_from_floor(img_pts: np.ndarray, world: np.ndarray, f: float, cx: float, cy: float) -> dict | None:
    import cv2

    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1.0]])
    ok, rv, tv = cv2.solvePnP(world.astype(np.float64), img_pts.astype(np.float64), K, None, flags=cv2.SOLVEPNP_IPPE)
    if not ok:
        return None
    R = rodrigues(rv.ravel())
    cam = {"f": f, "cx": cx, "cy": cy, "R": R, "t": tv.ravel()}
    cam["center"] = -R.T @ cam["t"]
    cam["err"] = float(np.sqrt(np.mean(np.sum((project(cam, world) - img_pts) ** 2, 1))))
    return cam


def wand_frames(det: dict, statics: list[np.ndarray], offset: float) -> dict[int, np.ndarray]:
    """막대 양 끝(움직이는 분홍 둘) — 시각(ms, 기준 카메라) → (2,2). 바닥 분홍(정지)과 6px 안은 뺀다."""
    out = {}
    for fr in det["frames"]:
        mv = [p for p in fr["pink"] if all(math.hypot(p[0] - s[0], p[1] - s[1]) > 6 for s in statics)]
        if len(mv) == 2:
            out[int(round((fr["t"] - offset) * 1000))] = np.array([m[:2] for m in mv])
    return out


def calibrate(session: dict, base_dir: str) -> dict:
    """바닥 스티커로 카메라마다 처음 자리 · 초점 → 막대(길이 고정)로 모든 카메라 함께 다듬기(묶음 조정)."""
    from scipy.optimize import least_squares

    L = session["wand_cm"] / 100
    layouts = [
        floor_layout(session["floor_cm"]["sides"], session["floor_cm"]["diags"]),
        floor_layout(session["floor_cm"]["sides"][::-1], session["floor_cm"]["diags"]),
    ]
    dets, statics, floors = {}, {}, {}
    for cid, c in session["cams"].items():
        det = c["wand"] if isinstance(c["wand"], dict) else json.load(open(os.path.join(base_dir, c["wand"]), encoding="utf-8"))
        dets[cid] = det
        st = static_points(det)
        statics[cid] = st["pink"]
        fo = floor_order(st)
        if fo is None:
            raise SystemExit(f"카메라 {cid}: 바닥 스티커를 노랑 1 · 분홍 3 으로 못 찾았어요(노랑 {len(st['yellow'])} · 분홍 {len(st['pink'])})")
        floors[cid] = fo
    # 바닥 배치 · 돌아가는 방향: 영상의 각도 방향과 세상 반시계가 같은지 모른다 — 모든 카메라가 바닥 위에 있는 쪽으로
    best = None
    for li, lay in enumerate(layouts):
        for flip in (False, True):
            cams = {}
            ok = True
            for cid, fo in floors.items():
                det = dets[cid]
                cx, cy = det["w"] / 2, det["h"] / 2
                pts = fo if not flip else np.array([fo[0], fo[3], fo[2], fo[1]])
                f0 = focal_from_floor(pts, lay, cx, cy) or 0.8 * max(det["w"], det["h"])
                f0 = min(max(f0, 0.4 * max(det["w"], det["h"])), 2.5 * max(det["w"], det["h"]))
                cam = pose_from_floor(pts, lay, f0, cx, cy)
                if cam is None or cam["center"][2] <= 0.1:
                    ok = False
                    break
                cam["floor_img"] = pts
                cams[cid] = cam
            if ok:
                score = sum(c["err"] for c in cams.values())
                if best is None or score < best[0]:
                    best = (score, li, flip, cams)
    if best is None:
        raise SystemExit("바닥 스티커로 카메라 자리를 못 정했어요")
    _, li, _, cams = best
    world = layouts[li]
    # 카메라 시간 맞추기(플래시)
    offs = {cid: (flash_time(d) or 0.0) for cid, d in dets.items()}
    ids = sorted(cams)
    wf = {cid: wand_frames(dets[cid], statics[cid], offs[cid]) for cid in ids}
    ref = ids[0]
    samples = []
    for tms in sorted(wf[ref]):
        seen = {}
        for cid in ids:
            near = [k for k in (tms - 2, tms - 1, tms, tms + 1, tms + 2) if k in wf[cid]]
            if near:
                seen[cid] = wf[cid][min(near, key=lambda k: abs(k - tms))]
        if len(seen) >= 2:
            samples.append(seen)
    if len(samples) > 160:
        samples = samples[:: math.ceil(len(samples) / 160)]
    if len(samples) < 10:
        raise SystemExit(f"막대가 두 카메라 이상에 함께 보인 장면이 {len(samples)}개뿐이에요(10개 넘게 필요)")

    # 장면마다 끝 짝 맞추기: 기준 카메라와 같은 끝이 되게(처음 자리로 교차 오차가 작은 쪽)
    def assign(seen: dict) -> dict:
        cids = list(seen)
        best_s = None
        for flips in product((0, 1), repeat=len(cids) - 1):
            pick = {cids[0]: seen[cids[0]]}
            for cid, fl in zip(cids[1:], flips):
                pick[cid] = seen[cid][::-1] if fl else seen[cid]
            err = 0.0
            for e in (0, 1):
                X = triangulate([cams[c] for c in cids], [pick[c][e] for c in cids])
                err += sum(np.linalg.norm(project(cams[c], X[None])[0] - pick[c][e]) for c in cids)
            if best_s is None or err < best_s[0]:
                best_s = (err, pick)
        return best_s[1]

    samples = [assign(s) for s in samples]

    # 묶음 조정: 카메라마다 [f, 돌림 3, 옮김 3], 장면마다 [가운데 3, 방향 2]
    import cv2

    def cam_vec(c):
        rv, _ = cv2.Rodrigues(c["R"])
        return np.r_[c["f"], rv.ravel(), c["t"]]

    p0 = [cam_vec(cams[c]) for c in ids]
    for s in samples:
        cids = list(s)
        A = triangulate([cams[c] for c in cids], [s[c][0] for c in cids])
        B = triangulate([cams[c] for c in cids], [s[c][1] for c in cids])
        d = (B - A) / max(1e-9, np.linalg.norm(B - A))
        p0.append(np.r_[(A + B) / 2, math.atan2(d[1], d[0]), math.asin(max(-1, min(1, d[2])))])
    p0 = np.concatenate(p0)
    nc = len(ids)

    def unpack(p):
        cs = {}
        for i, cid in enumerate(ids):
            v = p[i * 7 : i * 7 + 7]
            c0 = cams[cid]
            cs[cid] = {"f": v[0], "cx": c0["cx"], "cy": c0["cy"], "R": rodrigues(v[1:4]), "t": v[4:7]}
        return cs

    def resid(p):
        cs = unpack(p)
        r = []
        for cid in ids:
            r.append((project(cs[cid], world) - cams[cid]["floor_img"]).ravel() * 2)  # 바닥은 무게 2
        for k, s in enumerate(samples):
            v = p[nc * 7 + k * 5 : nc * 7 + k * 5 + 5]
            d = np.array([math.cos(v[4]) * math.cos(v[3]), math.cos(v[4]) * math.sin(v[3]), math.sin(v[4])])
            ends = np.array([v[:3] - d * L / 2, v[:3] + d * L / 2])
            for cid, uv in s.items():
                r.append((project(cs[cid], ends) - uv).ravel())
        return np.concatenate(r)

    sol = least_squares(resid, p0, loss="soft_l1", f_scale=2.0, max_nfev=200)
    fin = unpack(sol.x)
    rr = resid(sol.x)
    out = {"world_floor_m": world.tolist(), "wand_m": L, "frames_used": len(samples), "offsets_s": offs, "cams": {}}
    for cid in ids:
        c = fin[cid]
        center = -c["R"].T @ c["t"]
        out["cams"][cid] = {
            "f": float(c["f"]),
            "cx": c["cx"],
            "cy": c["cy"],
            "R": c["R"].tolist(),
            "t": c["t"].tolist(),
            "center_m": center.tolist(),
            "floor_err_px": float(np.sqrt(np.mean(np.sum((project(c, world) - cams[cid]["floor_img"]) ** 2, 1)))),
        }
    out["rms_px"] = float(np.sqrt(np.mean(rr**2)))
    return out


def load_cam(c: dict) -> dict:
    return {"f": c["f"], "cx": c["cx"], "cy": c["cy"], "R": np.array(c["R"]), "t": np.array(c["t"])}


def points_3d(frames_by_cam: dict[str, dict], cams: dict[str, dict], offs: dict[str, float], color: str, tol_px: float = 6.0):
    """한 시각에 색 하나의 3D 점들 — 두 카메라씩 짝지어 교차하고, 나머지 카메라에서도 tol 안에 보이면 더해 다시 교차.

    frames_by_cam: 카메라 → 그 시각의 장면 {pink: [...], yellow: [...]}. 이름 붙이기 전 점만(시선 2개 이상).
    """
    ids = [c for c in frames_by_cam if c in cams]
    obs = {c: [np.array(p[:2]) for p in frames_by_cam[c][color]] for c in ids}
    cand = []
    for a, b in combinations(ids, 2):
        for i, pa in enumerate(obs[a]):
            for j, pb in enumerate(obs[b]):
                X = triangulate([cams[a], cams[b]], [pa, pb])
                if any((cams[c]["R"] @ X + cams[c]["t"])[2] <= 0 for c in (a, b)):
                    continue
                e = max(np.linalg.norm(project(cams[c], X[None])[0] - p) for c, p in ((a, pa), (b, pb)))
                if e > tol_px:
                    continue
                members = {a: i, b: j}
                for c in ids:
                    if c in members or not obs[c]:
                        continue
                    uv = project(cams[c], X[None])[0]
                    d = [np.linalg.norm(uv - p) for p in obs[c]]
                    k = int(np.argmin(d))
                    if d[k] <= tol_px * 2:
                        members[c] = k
                cand.append(members)
    # 시선이 많은 것부터, 이미 쓴 관측은 다시 안 씀
    cand.sort(key=lambda m: -len(m))
    used = {c: set() for c in ids}
    pts = []
    for m in cand:
        if any(i in used[c] for c, i in m.items()):
            continue
        X = triangulate([cams[c] for c in m], [obs[c][i] for c, i in m.items()])
        err = max(np.linalg.norm(project(cams[c], X[None])[0] - obs[c][i]) for c, i in m.items())
        if err > tol_px * 1.5:
            continue
        for c, i in m.items():
            used[c].add(i)
        pts.append({"X": X.round(4).tolist(), "views": len(m), "err_px": round(float(err), 2)})
    return pts


# ── 합성 시험 ─────────────────────────────────────────────────────────────


def _look_at(center: np.ndarray, target: np.ndarray, f: float, w: int, h: int) -> dict:
    z = target - center
    z /= np.linalg.norm(z)
    x = np.cross(z, [0, 0, 1.0])
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])
    return {"f": f, "cx": w / 2, "cy": h / 2, "R": R, "t": -R @ center}


def synth_rig(w: int = 1080, h: int = 1920):
    """안내서 자리: ① 3루 쪽 · ② 2루 쪽 · ③ 1루 쪽 · ④ 홈 쪽 대각선 — 투수판 근처(원점 앞 0.5m)를 본다."""
    tgt = np.array([0.8, 0.5, 0.9])
    pos = {"1": [0.8, -5.0, 1.1], "2": [-4.5, 0.6, 1.2], "3": [0.8, 6.0, 1.0], "4": [5.5, -3.0, 1.1]}
    fs = {"1": 1500.0, "2": 1450.0, "3": 1550.0, "4": 1400.0}
    return {k: _look_at(np.array(v), tgt, fs[k], w, h) for k, v in pos.items()}


def _synth_det(cam: dict, w: int, h: int, frames: list[dict], rng) -> dict:
    out = []
    for fr in frames:
        row = {"t": fr["t"], "b": fr["b"]}
        for name in COLORS:
            pts = []
            for X in fr[name]:
                if (cam["R"] @ X + cam["t"])[2] <= 0:
                    continue
                u, v = project(cam, X[None])[0] + rng.normal(0, 0.4, 2)
                if 0 <= u < w and 0 <= v < h:
                    pts.append([float(u), float(v), 120])
            row[name] = pts
        out.append(row)
    return {"video": "synth", "w": w, "h": h, "frames": out}


def selftest() -> None:
    import tempfile

    import cv2

    rng = np.random.default_rng(7)
    fails = 0
    passed = 0

    def ok(name, cond, detail=""):
        nonlocal fails, passed
        print(("  OK   " if cond else "  실패 ") + name + (f" · {detail}" if detail else ""))
        fails += 0 if cond else 1
        passed += 1 if cond else 0

    # 1 색 찾기 · 플래시 — 합성 영상(검은 바탕 + 잡음 + 분홍 · 노랑 동그라미, 1.0초에 플래시)
    w, h, fps = 640, 480, 60
    tmp = tempfile.mkdtemp()
    vid = os.path.join(tmp, "synth.mp4")
    vw = cv2.VideoWriter(vid, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    truth = []
    for i in range(120):
        t = i / fps
        img = rng.integers(10, 40, (h, w, 3), dtype=np.uint8)
        if t >= 1.0:
            img = np.clip(img.astype(int) + 90, 0, 255).astype(np.uint8)
        px, py = 100 + 3 * i, 200 + 40 * math.sin(i / 10)
        cv2.circle(img, (int(px), int(py)), 9, (200, 40, 255), -1)  # 분홍(BGR)
        cv2.circle(img, (500, 120), 10, (0, 230, 255), -1)  # 노랑
        cv2.rectangle(img, (40, 400), (140, 470), (60, 90, 200), -1)  # 피부색 비슷한 덩어리(잡히면 안 됨)
        vw.write(img)
        truth.append((t, int(px), int(py)))  # cv2.circle 은 정수 자리에 그린다
    vw.release()
    det = detect(vid, os.path.join(tmp, "d.json"))
    hits = [fr for fr in det["frames"] if len(fr["pink"]) == 1 and len(fr["yellow"]) == 1]
    ok("색 찾기: 장면마다 분홍 1 · 노랑 1(피부색 덩어리는 안 잡음)", len(hits) >= 0.95 * len(det["frames"]), f"{len(hits)}/{len(det['frames'])}")
    errs = [math.hypot(fr["pink"][0][0] - truth[k][1], fr["pink"][0][1] - truth[k][2]) for k, fr in enumerate(det["frames"]) if len(fr["pink"]) == 1]
    ok("색 찾기: 분홍 가운데 1px 안", errs and np.percentile(errs, 95) < 1.0, f"p95 {np.percentile(errs, 95):.2f}px")
    ft = flash_time(det)
    ok("플래시 시각 1.0초(한 장면 안)", ft is not None and abs(ft - 1.0) <= 1 / fps + 1e-6, f"{ft}")

    # 2 카메라 보정 — 합성 4대, 바닥 2×1m, 막대 1m 를 3초 휘저음(240fps 중 일부), 카메라마다 플래시 시각이 다름
    W, H = 1080, 1920
    rig = synth_rig(W, H)
    sides, diags = [200.0, 100.0, 200.0, 100.0], [math.hypot(200, 100)] * 2
    floor = floor_layout(sides, diags)
    frames = []
    for i in range(240 * 3):
        t = i / 240
        c = np.array([0.6 + 0.8 * math.sin(t * 1.3), 0.5 + 0.5 * math.sin(t * 2.1), 1.0 + 0.6 * math.sin(t * 1.7)])
        d = np.array([math.cos(t * 2.3), math.sin(t * 1.1), 0.6 * math.sin(t * 3.0)])
        d /= np.linalg.norm(d)
        frames.append({"t": t, "b": 30.0, "pink": [*floor[1:], c - d * 0.5, c + d * 0.5], "yellow": [floor[0]]})
    session = {"wand_cm": 100.0, "floor_cm": {"sides": sides, "diags": diags}, "cams": {}}
    shifts = {"1": 0.0, "2": 0.137, "3": -0.21, "4": 0.06}
    for cid, cam in rig.items():
        fr2 = []
        for fr in frames:
            fr2.append({**fr, "t": fr["t"] + 0.5 + shifts[cid], "b": 30.0})
        lead = [{"t": 0.5 + shifts[cid] - (k + 1) / 240, "b": 30.0, "pink": fr2[0]["pink"][:3], "yellow": fr2[0]["yellow"]} for k in range(60)][::-1]
        for fr in fr2[:5]:
            fr["b"] = 140.0  # 플래시 = 첫 장면들
        session["cams"][cid] = {"wand": _synth_det(cam, W, H, lead + fr2, rng)}
    cal = calibrate(session, ".")
    perr = max(np.linalg.norm(np.array(cal["cams"][c]["center_m"]) - (-rig[c]["R"].T @ rig[c]["t"])) for c in rig)
    ferr = max(abs(cal["cams"][c]["f"] / rig[c]["f"] - 1) for c in rig)
    ok("보정: 카메라 자리 2cm 안", perr < 0.02, f"최대 {perr * 100:.1f}cm")
    ok("보정: 초점 1% 안", ferr < 0.01, f"최대 {ferr * 100:.2f}%")
    ok("보정: 다시 비춤 1px 안", cal["rms_px"] < 1.0, f"{cal['rms_px']:.2f}px")
    ok("보정: 플래시 어긋남 그대로 찾음", all(abs(cal["offsets_s"][c] - (0.5 + shifts[c])) < 0.005 for c in rig), json.dumps({c: round(v, 3) for c, v in cal["offsets_s"].items()}))

    # 3 3D 점 — 보정 결과로, 몸 점 12개(분홍)를 4대에서 교차(한 대에 둘은 가림)
    cams = {c: load_cam(v) for c, v in cal["cams"].items()}
    body = np.array([[0.5 + 0.3 * math.cos(k), 0.4 + 0.2 * math.sin(k), 0.3 + 0.12 * k] for k in range(12)])
    fb = {}
    for cid, cam in rig.items():
        uv = project(cam, body) + rng.normal(0, 0.4, (12, 2))
        keep = [list(p) + [100] for k, p in enumerate(uv) if not (cid == "2" and k in (3, 7))]
        fb[cid] = {"pink": keep, "yellow": []}
    pts = points_3d(fb, cams, {}, "pink")
    errs = []
    for X in body:
        d = [np.linalg.norm(np.array(p["X"]) - X) for p in pts]
        errs.append(min(d) if d else 9)
    ok("3D 점: 12개 모두 찾음 · 5mm 안", len(pts) == 12 and max(errs) < 0.005, f"{len(pts)}개 · 최대 {max(errs) * 1000:.1f}mm")
    print(f"\n통과 {passed} · 실패 {fails}")
    if fails:
        sys.exit(1)


def main(argv: list[str]) -> None:
    if not argv:
        print(__doc__)
        return
    cmd, *a = argv
    if cmd == "detect":
        detect(a[0], a[1])
    elif cmd == "check":
        at = float(a[a.index("--at") + 1]) if "--at" in a else 1.0
        check(a[0], a[1], at)
    elif cmd == "flash":
        print(flash_time(json.load(open(a[0], encoding="utf-8"))))
    elif cmd == "calibrate":
        session = json.load(open(a[0], encoding="utf-8"))
        cal = calibrate(session, os.path.dirname(os.path.abspath(a[0])))
        with open(a[1], "w", encoding="utf-8") as f:
            json.dump(cal, f, indent=1)
        for cid, c in cal["cams"].items():
            print(f"카메라 {cid}: 자리 {np.round(c['center_m'], 2)} m · 초점 {c['f']:.0f}px · 바닥 {c['floor_err_px']:.1f}px")
        print(f"막대 장면 {cal['frames_used']} · 다시 비춤 {cal['rms_px']:.2f}px")
    elif cmd == "points":
        session = json.load(open(a[0], encoding="utf-8"))
        cal = json.load(open(a[1], encoding="utf-8"))
        take, out = a[2], a[3]
        base = os.path.dirname(os.path.abspath(a[0]))
        cams = {c: load_cam(v) for c, v in cal["cams"].items()}
        dets = {cid: json.load(open(os.path.join(base, c["takes"][take]), encoding="utf-8")) for cid, c in session["cams"].items() if take in c.get("takes", {})}
        offs = {cid: flash_time(d) or 0.0 for cid, d in dets.items()}
        ref = sorted(dets)[0]
        by_t = {cid: {int(round((fr["t"] - offs[cid]) * 1000)): fr for fr in d["frames"]} for cid, d in dets.items()}
        res = []
        for fr in dets[ref]["frames"]:
            tms = int(round((fr["t"] - offs[ref]) * 1000))
            row = {}
            for cid in dets:
                near = [k for k in (tms - 2, tms - 1, tms, tms + 1, tms + 2) if k in by_t[cid]]
                if near:
                    row[cid] = by_t[cid][min(near, key=lambda k: abs(k - tms))]
            res.append({"t_ms": tms, **{col: points_3d(row, cams, offs, col) for col in COLORS}})
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"take": take, "offsets_s": offs, "frames": res}, f)
        n = [len(r["pink"]) + len(r["yellow"]) for r in res]
        print(f"장면 {len(res)} · 3D 점 가운데값 {int(np.median(n)) if n else 0}개")
    elif cmd == "selftest":
        selftest()
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
