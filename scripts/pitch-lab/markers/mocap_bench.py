"""실제 투구 모션캡처(C3D, Plug-in-Gait 마커)로 엔진 채점 — 진짜 3D 를 가상 카메라 둘(옆 · 뒤)로 비춰 엔진 입력 2D 를 만들고,
엔진이 낸 3D 와 진짜 3D 를 비교한다. 2D 모델(RTMW)의 버릇은 빠지고 엔진(시간 맞추기 · 카메라 찾기 · 뼈대 맞추기 · 빈 관절 짐작)
자신의 오차만 남는다. 진짜 영상의 2D 버릇은 우리 마커 영상(markers.py)으로 잰다.

  python scripts/pitch-lab/markers/mocap_bench.py tracks 투구.c3d 출력폴더 [--occlude] [--noise 0.004] [--hide 관절,시작,끝]
      → 출력폴더/tracks.json(엔진 입력 side · back) · truth.json(진짜 25관절, m)
  node --import ./scripts/alias-register.mjs scripts/pitch-lab/markers/mocap-fit.mts 출력폴더   → 출력폴더/result.json
  python scripts/pitch-lab/markers/mocap_bench.py score 출력폴더                              → 부위 × 구간 오차(cm · 키 대비 %)

자료: CMU Graphics Lab Motion Capture Database(mocap.cs.cmu.edu, 피험자 124 투구), 4TU.ResearchData '11 youth pitchers'(CC BY 4.0).
자료 파일은 저장소에 넣지 않는다.
"""

from __future__ import annotations

import json
import math
import os
import sys

import numpy as np

# 엔진 25관절 차례(lib/pitch-3d/v2/joint-map.json)
NAMES = ["nose", "lSh", "rSh", "lEl", "rEl", "lWr", "rWr", "lHip", "rHip", "lKn", "rKn", "lAn", "rAn", "lHe", "rHe", "lTo", "rTo",
         "lEar", "rEar", "lHandMid", "rHandMid", "lHandIdx", "rHandIdx", "lHandPinky", "rHandPinky"]
IX = {n: i for i, n in enumerate(NAMES)}


def read_c3d(path: str) -> tuple[dict[str, np.ndarray], float]:
    """마커 이름(앞말 'player:' 뗌) → (장면, 3) m, 빈 값은 NaN. 위 = +z."""
    import warnings

    import c3d

    warnings.filterwarnings("ignore")
    r = c3d.Reader(open(path, "rb"))
    labels = [l.strip().split(":")[-1] for l in r.point_labels]
    P = []
    for _, pts, *_ in r.read_frames():
        f = pts[:, :3].astype(float).copy()
        f[pts[:, 3] < 0] = np.nan  # 잔차 −1 = 안 잡힘
        P.append(f)
    P = np.array(P) / 1000.0
    return {lab: P[:, i] for i, lab in enumerate(labels)}, float(r.point_rate)


def unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n < 1e-9, 1, n)


def joints_from_pig(m: dict[str, np.ndarray]) -> np.ndarray:
    """Plug-in-Gait 마커 → 엔진 25관절(m). 엉덩이는 해링턴(2007) 회귀로 관절 중심, 나머지는 마커 · 간단한 조합(정답과 입력이
    같은 점이라 겉 마커 자리여도 채점에는 상관없다)."""
    g = lambda k: m[k]  # noqa: E731
    n = len(next(iter(m.values())))
    J = np.full((n, 25, 3), np.nan)
    up = np.array([0, 0, 1.0])
    # 골반 틀(앞 허리 = ASIS, 뒤 허리 = PSIS)
    lasi, rasi, lpsi, rpsi = g("LFWT"), g("RFWT"), g("LBWT"), g("RBWT")
    mid_a = (lasi + rasi) / 2
    mid_p = (lpsi + rpsi) / 2
    zr = unit(rasi - lasi)  # 오른쪽
    xa = unit(mid_a - mid_p)
    xa = unit(xa - zr * np.sum(xa * zr, -1, keepdims=True))  # 앞
    ys = np.cross(zr, xa)  # 위
    pw = np.linalg.norm(rasi - lasi, axis=-1)
    pd = np.linalg.norm(mid_a - mid_p, axis=-1)
    for side, sg in (("l", -1), ("r", 1)):
        off = (-0.24 * pd - 0.0099)[:, None] * xa + (-0.30 * pw - 0.0109)[:, None] * ys + (sg * (0.33 * pw + 0.0073))[:, None] * zr
        J[:, IX[side + "Hip"]] = mid_a + off
    for s, S in (("l", "L"), ("r", "R")):
        J[:, IX[s + "Sh"]] = g(S + "SHO") - 0.04 * up
        J[:, IX[s + "El"]] = g(S + "ELB")
        wra, wrb = g(S + "WRA"), g(S + "WRB")
        J[:, IX[s + "Wr"]] = (wra + wrb) / 2
        fin = g(S + "FIN")
        J[:, IX[s + "HandMid"]] = fin
        J[:, IX[s + "HandIdx"]] = fin + 0.35 * (wra - wrb)
        J[:, IX[s + "HandPinky"]] = fin - 0.35 * (wra - wrb)
        J[:, IX[s + "Kn"]] = g(S + "KNE")
        J[:, IX[s + "An"]] = g(S + "ANK")
        J[:, IX[s + "He"]] = g(S + "HEE")
        J[:, IX[s + "To"]] = g(S + "TOE")
    lf, rf, lb, rb = g("LFHD"), g("RFHD"), g("LBHD"), g("RBHD")
    fwd = unit((lf + rf) / 2 - (lb + rb) / 2)
    J[:, IX["nose"]] = (lf + rf) / 2 + 0.03 * fwd - 0.04 * up
    J[:, IX["lEar"]] = (lf + lb) / 2 - 0.03 * up
    J[:, IX["rEar"]] = (rf + rb) / 2 - 0.03 * up
    return J


def fill_gaps(J: np.ndarray) -> np.ndarray:
    """관절마다 빈 장면(마커 놓침)을 앞뒤로 선형 잇기 — 자료의 구멍이지 시험할 가림이 아니다."""
    out = J.copy()
    t = np.arange(len(J))
    for j in range(J.shape[1]):
        for d in range(3):
            v = out[:, j, d]
            ok = ~np.isnan(v)
            if ok.sum() >= 2 and (~ok).any():
                out[:, j, d] = np.interp(t, t[ok], v[ok])
    return out


def look_at(center, target, f, w, h):
    z = unit(target - center)
    x = unit(np.cross(z, [0, 0, 1.0]))
    y = np.cross(z, x)
    R = np.stack([x, y, z])
    return {"f": f, "cx": w / 2, "cy": h / 2, "R": R, "t": -R @ center}


def project(cam, X):
    Xc = X @ cam["R"].T + cam["t"]
    return np.stack([cam["f"] * Xc[..., 0] / Xc[..., 2] + cam["cx"], cam["f"] * Xc[..., 1] / Xc[..., 2] + cam["cy"]], -1), Xc[..., 2]


# 몸 조각(캡슐) — 가림 시험: 관절까지의 시선이 다른 조각을 지나면 가려짐
CAPS = [("lHip", "lSh", 0.13), ("rHip", "rSh", 0.13), ("lHip", "rSh", 0.12), ("rHip", "lSh", 0.12),
        ("lSh", "lEl", 0.05), ("rSh", "rEl", 0.05), ("lEl", "lWr", 0.045), ("rEl", "rWr", 0.045),
        ("lHip", "lKn", 0.08), ("rHip", "rKn", 0.08), ("lKn", "lAn", 0.06), ("rKn", "rAn", 0.06), ("lEar", "rEar", 0.08)]


def seg_dist(p, a, b, q, r):
    """선분 pq(시선)와 선분 ab(조각) 사이 가장 가까운 거리와 시선 위 비율."""
    d1, d2, w0 = q - p, b - a, p - a
    A, B, C, D, E = d1 @ d1, d1 @ d2, d2 @ d2, d1 @ w0, d2 @ w0
    den = A * C - B * B
    s = 0.0 if den < 1e-12 else min(1.0, max(0.0, (B * E - C * D) / den))
    t = min(1.0, max(0.0, (E + s * B) / C)) if C > 1e-12 else 0.0
    s = min(1.0, max(0.0, (t * B - D) / A)) if A > 1e-12 else 0.0
    return float(np.linalg.norm((p + s * d1) - (a + t * d2))), s


def occluded(cam_center, X, j):
    name = NAMES[j]
    for a, b, rad in CAPS:
        if name in (a, b) or (name.endswith(("Wr", "HandMid", "HandIdx", "HandPinky")) and name[0] == a[0] and b.endswith("Wr")):
            continue
        dist, s = seg_dist(cam_center, X[j], X[IX[a]], X[IX[b]], rad)
        if dist < rad and s < 0.97:
            return True
    return False


def make_tracks(c3d_path: str, out_dir: str, noise: float = 0.004, occlude: bool = False, hide: list[str] | None = None, seed: int = 3):
    m, rate = read_c3d(c3d_path)
    J = fill_gaps(joints_from_pig(m))
    J = J[~np.isnan(J).any(axis=(1, 2))]
    tracks_from_joints(J, rate, out_dir, os.path.basename(c3d_path), noise=noise, occlude=occlude, hide=hide, seed=seed)


def tracks_from_joints(J: np.ndarray, rate: float, out_dir: str, source: str, noise: float = 0.004, occlude: bool = False,
                       hide: list[str] | None = None, seed: int = 3, height_m: float | None = None, junk: list[str] | None = None):
    """진짜 25관절(장면, 25, 3) m · 위 = +z → 가상 카메라 둘의 엔진 입력(tracks.json) · 정답(truth.json). 다른 자료(드라이브라인 등)도 이 길로.
    junk = [관절+관절, 시작, 끝]: 뒤 영상에서 그 관절을 '가려져 2D 모델이 지어낸 점'으로 — 확신 0.4, 자리는 몸 높이 기준으로 떠돌고 가끔
    크게 튄다(실제 샘플: 착지~릴리스 글러브 손목이 확신 0.35~0.45 로 한 장면에 몸 높이의 30~50% 튐)."""
    n = len(J)
    # 던지는 손 = 손목이 가장 빠른 쪽, 홈 방향 = 그 반대쪽(앞발) 발목이 처음 → 끝 옮긴 수평 방향
    sp = {s: np.max(np.linalg.norm(np.diff(J[:, IX[s + "Wr"]], axis=0), axis=-1)) for s in "lr"}
    hand = "R" if sp["r"] >= sp["l"] else "L"
    lead = "l" if hand == "R" else "r"
    disp = J[-1, IX[lead + "An"]] - J[0, IX[lead + "An"]]
    home = unit(np.array([disp[0], disp[1], 0.0]))
    pel0 = (J[0, IX["lHip"]] + J[0, IX["rHip"]]) / 2
    target = pel0 + np.array([0, 0, 0.0]) + home * 0.4
    target[2] = 0.95
    # 옆 = 셋업 때 가슴이 보는 쪽(어깨선 수직 수평), 뒤 = 홈 반대
    sl = J[0, IX["lSh"]] - J[0, IX["rSh"]]
    chest = unit(np.cross([0, 0, 1.0], sl))
    if chest @ np.array([-home[1], home[0], 0]) < 0:
        side_dir = -np.array([-home[1], home[0], 0])
    else:
        side_dir = np.array([-home[1], home[0], 0])
    W, Hh = 1080, 1920
    cams = {
        "side": look_at(target + side_dir * 5.0 + np.array([0, 0, 0.15]), target, 1500.0, W, Hh),
        "back": look_at(target - home * 5.5 + side_dir * 0.6 + np.array([0, 0, 0.25]), target, 1450.0, W, Hh),
    }
    height_px = {}
    rng = np.random.default_rng(seed)
    hide_rule = None
    if hide:
        hj, h0, h1 = hide[0], int(hide[1]), int(hide[2])
        hide_rule = ([IX[x] for x in hj.split("+")], h0, h1)
    junk_rule = ([IX[x] for x in junk[0].split("+")], int(junk[1]), int(junk[2])) if junk else None
    tracks = {}
    for view, cam in cams.items():
        center = -cam["R"].T @ cam["t"]
        uv, z = project(cam, J)
        hp = np.median(np.max(uv[:, :17, 1], 1) - np.min(uv[:, :17, 1], 1))
        height_px[view] = float(hp)
        sig = noise * hp
        drift = rng.normal(0, 0.15 * hp, 2)  # 지어낸 점의 처음 어긋남
        frames = []
        offset = 0.0 if view == "side" else 0.137
        for k in range(n):
            if junk_rule and view == "back" and junk_rule[1] <= k <= junk_rule[2]:
                drift = drift + rng.normal(0, 0.03 * hp, 2) + (rng.normal(0, 0.3 * hp, 2) if rng.random() < 0.15 else 0)
            p = []
            for j in range(25):
                u, v = uv[k, j] + rng.normal(0, sig, 2)
                vis = 0.92
                if occlude and occluded(center, J[k], j):
                    vis = 0.45
                    u, v = uv[k, j] + rng.normal(0, sig * 5, 2)
                if junk_rule and view == "back" and j in junk_rule[0] and junk_rule[1] <= k <= junk_rule[2]:
                    vis = 0.4
                    u, v = uv[k, j] + drift + rng.normal(0, sig * 3, 2)
                if hide_rule and j in hide_rule[0] and hide_rule[1] <= k <= hide_rule[2]:
                    vis = 0.0
                p.append([round(float(u), 2), round(float(v), 2), vis])
            frames.append({"t": round(k / rate + offset, 5), "p": p})
        tracks[view] = {"W": W, "H": Hh, "fps": rate, "frames": frames}
    os.makedirs(out_dir, exist_ok=True)
    meta = {"hand": hand, "rate": rate, "frames": n,
            "height_m": float(height_m if height_m else np.percentile(J[:, IX["nose"], 2], 90) + 0.12),
            "height_px": height_px, "source": source, "noise": noise, "occlude": occlude, "hide": hide, "junk": junk}
    with open(os.path.join(out_dir, "tracks.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, **tracks}, f)
    with open(os.path.join(out_dir, "truth.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "t": [k / rate for k in range(n)], "joints": J.round(5).tolist()}, f)
    print(f"{meta['source']}: 장면 {n} · {rate:.0f}Hz · 던지는 손 {hand} · 키 약 {meta['height_m']:.2f}m · 옆 몸 {height_px['side']:.0f}px")


def umeyama(A: np.ndarray, B: np.ndarray):
    """B ≈ s R A + t (닮음 맞추기, 점 대응)."""
    ma, mb = A.mean(0), B.mean(0)
    A0, B0 = A - ma, B - mb
    U, S, Vt = np.linalg.svd(B0.T @ A0 / len(A))
    D = np.eye(3)
    D[2, 2] = np.sign(np.linalg.det(U @ Vt))
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / (A0**2).sum(1).mean()
    return s, R, mb - s * R @ ma


def score(out_dir: str) -> dict:
    truth = json.load(open(os.path.join(out_dir, "truth.json"), encoding="utf-8"))
    res = json.load(open(os.path.join(out_dir, "result.json"), encoding="utf-8"))
    if not res.get("ok"):
        print("엔진 실패", res.get("code"))
        return {}
    T = np.array(truth["joints"])
    tt = np.array(truth["t"])
    E = np.array(res["joints"], float)
    et = np.array(res["t"])
    # 엔진 장면 시각(옆 영상 = 진짜 시각)에 맞는 진짜 장면
    idx = np.clip(np.round(et * truth["meta"]["rate"]).astype(int), 0, len(T) - 1)
    Tm = T[idx]
    s, R, t = umeyama(E.reshape(-1, 3), Tm.reshape(-1, 3))
    Ea = (E @ R.T) * s + t
    err = np.linalg.norm(Ea - Tm, axis=-1) * 100  # cm
    hgt = truth["meta"]["height_m"] * 100
    ev = res["events"]
    ku = ev.get("kneeUp") if ev.get("kneeUp") is not None else ev["footPlant"] // 2
    phases = [("셋업", 0, ku), ("니업~착지", ku, ev["footPlant"]), ("착지~릴리스", ev["footPlant"], ev["release"] + 1), ("릴리스 뒤", ev["release"] + 1, len(E))]
    hand = truth["meta"]["hand"].lower()
    gl = "l" if hand == "r" else "r"
    groups = {"머리": ["nose", "lEar", "rEar"], "어깨": ["lSh", "rSh"], "던지는팔": [hand + "El", hand + "Wr", hand + "HandMid"],
              "글러브팔": [gl + "El", gl + "Wr", gl + "HandMid"], "엉덩이": ["lHip", "rHip"], "앞다리": [gl + "Kn", gl + "An"],
              "축다리": [hand + "Kn", hand + "An"]}
    print(f"엔진 순간: 니업 {ev.get('kneeUp')} · 착지 {ev['footPlant']} · 릴리스 {ev['release']} (장면 {len(E)}) · 키 {hgt:.0f}cm")
    print("부위        " + " · ".join(p[0] for p in phases) + "  | p90   (cm, 가운데값)")
    table = {}
    for gname, js in groups.items():
        cells = []
        for _, a, b in phases:
            v = err[a:b][:, [IX[j] for j in js]].ravel()
            cells.append(float(np.median(v)) if len(v) else float("nan"))
        p90 = float(np.percentile(err[:, [IX[j] for j in js]].ravel(), 90))
        table[gname] = {"phases": cells, "p90": p90}
        print(f"  {gname:6s} " + " · ".join(f"{c:5.1f}" for c in cells) + f"  | {p90:5.1f}")
    allp = float(np.median(err))
    print(f"  전체 가운데값 {allp:.1f}cm ({allp / hgt * 100:.1f}%) · 닮음 맞추기 배율 {s:.4f}")
    return table


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        print(__doc__)
    elif a[0] == "tracks":
        noise = float(a[a.index("--noise") + 1]) if "--noise" in a else 0.004
        hide = a[a.index("--hide") + 1].split(",") if "--hide" in a else None
        make_tracks(a[1], a[2], noise=noise, occlude="--occlude" in a, hide=hide)
    elif a[0] == "score":
        score(a[1])
    else:
        print(__doc__)
