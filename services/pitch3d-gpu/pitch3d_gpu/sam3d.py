"""AI 스켈레톤 보정(실험) — 메타 SAM 3D Body 로 장면마다 '사람다운' 관절을 얻어 결과에 싣는다.

2026-10-09 김민: "스켈레톤이 자연스럽게 움직이게 보정할 AI 가 필요하다 · 스켈레톤 위에 뭘 씌울 필요는 없다".
SAM 3D Body 는 사람 몸(MHR)을 맞추지만 여기서는 관절 점(MHR 70점 중 25개)만 쓴다 — 메시는 버린다.

  1 plan_items — 옆 영상 구간에서 '서로 다른 그림'만 고른다(화면 녹화는 30fps 그림이 60fps 로 두 장씩 — 같은 그림을 두 번 보내면 AI 답이
    계단이 되고 일만 두 배였다, 2026-10-09 샘플 3 · 4). 그림마다 사람 상자(RTMW 관절 둘레) · 카메라(맞추기가 찾은 초점) · 시각(같은 그림 장면들의 가운데)
  2 infer_items — 한 장씩 추론(L4 장면당 0.8~0.95초). 여러 GPU 가 나눠 맡는다(app.py AiHelper — 같은 영상을 같은 방법으로 풀어 같은 그림)
  3 assemble — 70점 → 엔진 관절 25개, 우리 좌표로(클립 전체에 회전 · 크기 하나 — 잘 보인 몸통 · 다리로 Umeyama), 시간으로 살짝 고르기(앞뒤 두 그림에
    2차식 — AI 는 그림마다 따로 봐서 떨린다), 결과 장면 시각으로 잇기, 장면마다 골반 가운데를 우리 골반에. 실패한 그림이 둘 넘게 이어진 틈은 miss
  4 결과 experimental.sam3d = { model, joints(장면 × 25 × 3 정수 mm), miss? } — 화면이 우리 관절과 섞는다(lib/pitch-3d/v2/display.ts)
  video_agreement — 우리 · AI 관절을 두 영상에 비춰 2D 관절과의 차이(부위별) — 어느 쪽이 실제 영상에 가까운지 로그로 본다

잰 것(2026-10-09, 같은 사진 8장): 손 단계를 빼면(body) 4배 빠르지만 손이 최대 84mm 틀어짐 · JPEG 로 넘기면 손 16mm · bf16 실패 · TF32 · CPU 늘리기 ·
한 GPU 에 여러 벌은 안 빨라짐 → 손 단계 그대로, 원본 그림 그대로, 빠르기는 GPU 여러 대로.

모델 무게는 Hugging Face 의 잠긴 저장소(facebook/sam-3d-body-vith) — Modal 비밀 'huggingface'(HF_TOKEN)가 있어야 받는다. 없거나
실패하면 None(분석은 그대로 끝난다). 라이선스: SAM License(상업 사용 가능, 금지 용도 있음).
"""

from __future__ import annotations

import os
import sys
from typing import Any, Callable

HF_REPO = "facebook/sam-3d-body-vith"
MODEL_NAME = "sam-3d-body-vith"
REPO_DIR = "/opt/sam-3d-body"
# 같은 그림 — 사람 상자 안(세로 96px 로 줄여)에서 밝기가 12 넘게 바뀐 점이 이 비율 밑이면 앞 장면과 같은 그림
SAME_DIFF = 12
SAME_FRAC = 0.01
# 실패한 그림이 이만큼 넘게 이어지면 잇지 않고 miss(화면이 섞지 않는다) — 릴리스 근처 팔은 한 그림에 키의 15% 넘게 움직인다
MAX_FAILED_RUN = 1
# 시간 고르기 — 앞뒤 이만큼의 그림에 2차식(30fps 그림이면 ±67ms)
SMOOTH_HALF = 2
# 영상과 맞추기(gate) — 2D 관절을 '보였다'고 칠 확신, AI 가 이만큼(몸 높이 %) 넘게 더 가까워야 쓴다, 앞뒤 장면 평균
SEEN_CONF = 0.5
GATE_MARGIN = 0.5
GATE_HALF = 2
# 장면마다 AI 몸통을 우리 몸통 방향으로 돌릴 때 쓰는 관절 — AI 는 팔 · 다리가 몸통에 붙은 모양만 준다
TORSO = ["lSh", "rSh", "lHip", "rHip"]

# MHR 70점 차례(sam_3d_body/metadata/mhr70.py). 손가락은 끝 · first · second · third joint 차례 — third joint 가 손허리뼈 마디(MCP)로
# 우리 손 관절(RTMW 손 MCP)과 같은 자리. 예전엔 '손목에 가장 가까운 마디'를 골랐는데 주먹을 쥐면(공을 쥔 손) 손끝이 더 가까워 튀었다
MHR = {
    "nose": 0,
    "lEar": 3,
    "rEar": 4,
    "lSh": 5,
    "rSh": 6,
    "lEl": 7,
    "rEl": 8,
    "lHip": 9,
    "rHip": 10,
    "lKn": 11,
    "rKn": 12,
    "lAn": 13,
    "rAn": 14,
    "lTo": 15,
    "lHe": 17,
    "rTo": 18,
    "rHe": 20,
    "rHandIdx": 28,
    "rHandMid": 32,
    "rHandPinky": 40,
    "rWr": 41,
    "lHandIdx": 49,
    "lHandMid": 53,
    "lHandPinky": 61,
    "lWr": 62,
}
# 맞추기의 잘 보인 관절로 회전 · 크기를 정할 때 쓰는 관절(몸통 · 다리 — 팔은 흐려서 뺀다)
ALIGN = ["lSh", "rSh", "lHip", "rHip", "lKn", "rKn", "lAn", "rAn"]

_cache: dict[str, Any] = {}


def to_v2(k70, names: list[str]):
    """MHR 70점(70×3) → 엔진 관절 차례(names)의 25×3."""
    import numpy as np

    return np.array([k70[MHR[n]] for n in names], dtype=float)


def umeyama(src, dst):
    """src → dst 닮음 변환(회전 R · 크기 s, 거울 없이). 둘 다 (N,3) — 가운데를 뺀 값."""
    import numpy as np

    C = dst.T @ src / len(src)
    U, S, Vt = np.linalg.svd(C)
    d = np.sign(np.linalg.det(U @ Vt)) or 1.0
    D = np.diag([1.0, 1.0, d])
    R = U @ D @ Vt
    var = float((src**2).sum() / len(src))
    s = float((S * np.diag(D)).sum() / var) if var > 1e-12 else 1.0
    return R, s


def _load():
    """모델 하나(프로세스에 한 번)."""
    if "est" in _cache:
        return _cache["est"]
    if not os.environ.get("HF_TOKEN"):
        print("[pitch3d ai] HF_TOKEN 없음 — AI 보정 건너뜀")
        _cache["est"] = None
        return None
    os.environ.setdefault("MOMENTUM_ENABLED", "0")  # mhr 패키지 없이 무게에 든 TorchScript 로
    if REPO_DIR not in sys.path:
        sys.path.insert(0, REPO_DIR)
    try:
        from sam_3d_body import SAM3DBodyEstimator, load_sam_3d_body_hf

        model, cfg = load_sam_3d_body_hf(HF_REPO)
        _cache["est"] = SAM3DBodyEstimator(model, cfg)
        print(f"[pitch3d ai] {HF_REPO} 준비")
    except Exception as e:  # noqa: BLE001 — 모델 없음 · 접근 거절은 분석을 막지 않는다
        print(f"[pitch3d ai] 모델을 못 올림 — {type(e).__name__}: {str(e)[:300]}")
        _cache["est"] = None
    return _cache["est"]


def _box(track_frame: dict, sc: float, w: int, h: int) -> list[float] | None:
    """사람 상자 — RTMW 관절(확신 0.3 넘는 것) 둘레에 여유."""
    pts = [(x * sc, y * sc) for x, y, v in track_frame["p"] if v >= 0.3]
    if len(pts) < 6:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    mx = (max(xs) - min(xs)) * 0.2 + 20
    my = (max(ys) - min(ys)) * 0.15 + 20
    return [max(0.0, min(xs) - mx), max(0.0, min(ys) - my), min(float(w), max(xs) + mx), min(float(h), max(ys) + my)]


def same_picture(a, b, box: list[float]) -> bool:
    """두 장면이 같은 그림인가 — 사람 상자 안만 본다(재생 막대 같은 화면 녹화 겉 글자는 안 본다)."""
    import cv2
    import numpy as np

    x0, y0, x1, y1 = (int(round(v)) for v in box)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return False
    ga = cv2.cvtColor(a[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(b[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    size = (max(8, round((x1 - x0) * 96.0 / (y1 - y0))), 96)
    ga = cv2.resize(ga, size, interpolation=cv2.INTER_AREA).astype(np.int16)
    gb = cv2.resize(gb, size, interpolation=cv2.INTER_AREA).astype(np.int16)
    return float(np.mean(np.abs(ga - gb) > SAME_DIFF)) < SAME_FRAC


def plan_items(result: dict, side_frames: list, side_track: dict) -> tuple[list[dict], list[float]]:
    """추론할 그림 — ([{k(그림 번호), fi(옆 영상 장면 번호), t(그 장면 시각 — 다른 GPU 가 같은 장면인지 확인), box, K}], 그림 시각들).

    side_frames: 구간의 옆 영상 장면(video.Frame — 줄였을 수 있는 그림), side_track: 같은 장면의 2D 관절(원본 픽셀).
    그림 시각 = 같은 그림 장면들의 가운데(결과 장면 시각으로 이을 때 쓴다).
    """
    import numpy as np

    cam = (result.get("cameras") or {}).get("side")
    if not cam or not side_frames or not result.get("ok") or not result.get("t"):
        return [], []
    track_t = np.array([f["t"] for f in side_track["frames"]])
    h, w = side_frames[0].image.shape[:2]
    sc = w / float(cam["W"])
    K = [[cam["f"] * sc, 0.0, cam["cx"] * sc], [0.0, cam["f"] * sc, cam["cy"] * sc], [0.0, 0.0, 1.0]]
    t0, t1 = result["t"][0] - 0.05, result["t"][-1] + 0.05
    runs: list[list[int]] = []  # 같은 그림 장면 묶음
    boxes: list[list[float] | None] = []
    for i, f in enumerate(side_frames):
        if not t0 <= f.t <= t1:
            continue
        box = _box(side_track["frames"][int(np.argmin(np.abs(track_t - f.t)))], sc, w, h)
        prev = boxes[-1] if boxes else None
        if prev is not None and runs[-1][-1] == i - 1 and same_picture(side_frames[runs[-1][0]].image, f.image, prev):
            runs[-1].append(i)
            continue
        runs.append([i])
        boxes.append(box)
    items, times = [], []
    for run, box in zip(runs, boxes):
        times.append(float(np.mean([side_frames[i].t for i in run])))
        if box is not None:
            fi = run[0]
            items.append({"k": len(times) - 1, "fi": fi, "t": float(side_frames[fi].t), "box": box, "K": K})
    print(f"[pitch3d ai] 장면 {sum(len(r) for r in runs)} · 서로 다른 그림 {len(runs)} · 사람 상자 있는 그림 {len(items)}")
    return items, times


def infer_items(est, frames: list, items: list[dict]) -> dict[int, list]:
    """장면마다 카메라 좌표의 70점(키 단위 m) — {k: 70×3}. 장면이 다르거나(시각이 안 맞음) 실패한 것은 뺀다."""
    import contextlib
    import io

    import numpy as np
    import torch

    out: dict[int, list] = {}
    for it in items:
        fi = it["fi"]
        if fi >= len(frames) or abs(frames[fi].t - it["t"]) > 1e-4:
            print(f"[pitch3d ai] 장면 {it['k']} 그림이 다름(번호 {fi}) — 뺌")
            continue
        img = frames[fi].image
        try:
            with contextlib.redirect_stdout(io.StringIO()):  # 장면마다 안내 글을 찍는다 — 로그를 덮지 않게
                outs = est.process_one_image(
                    img[:, :, ::-1].copy(),
                    bboxes=np.array([it["box"]], dtype=np.float32),
                    cam_int=torch.from_numpy(np.array(it["K"], dtype=np.float32))[None],
                )
        except Exception as e:  # noqa: BLE001
            print(f"[pitch3d ai] 장면 {it['k']} 실패 — {type(e).__name__}: {str(e)[:200]}")
            continue
        if not outs:
            continue
        o = outs[0]
        k70 = np.asarray(o["pred_keypoints_3d"], dtype=float) + np.asarray(o["pred_cam_t"], dtype=float)[None]
        if np.all(np.isfinite(k70)):
            out[int(it["k"])] = k70.tolist()
    return out


def _smooth(times: list[float], shapes: dict[int, Any]) -> dict[int, Any]:
    """그림마다 따로 본 AI 의 떨림을 시간으로 고른다 — 앞뒤 SMOOTH_HALF 그림(실패한 그림을 건너 잇지 않음)에 2차식, 가운데 값."""
    import numpy as np

    keys = sorted(shapes)
    out = {}
    for pos, k in enumerate(keys):
        near = [k]
        for step in (-1, 1):
            q = pos
            while abs(q - pos) < SMOOTH_HALF:
                nq = q + step
                if not 0 <= nq < len(keys) or abs(keys[nq] - keys[q]) > MAX_FAILED_RUN + 1:
                    break
                near.append(keys[nq])
                q = nq
        if len(near) < 4:
            out[k] = shapes[k]
            continue
        dt = np.array([times[q] - times[k] for q in near])
        A = np.stack([np.ones_like(dt), dt, dt * dt], 1)
        Y = np.stack([shapes[q].reshape(-1) for q in near])
        coef, *_ = np.linalg.lstsq(A, Y, rcond=None)
        out[k] = coef[0].reshape(shapes[k].shape)
    return out


def assemble(result: dict, raw70: dict[int, Any], names: list[str], times: list[float]) -> dict | None:
    """그림별 70점 → 결과 장면마다 25관절(장면 × 25 × 3 정수 mm) · miss(실패한 그림이 이어져 AI 가 없는 장면)."""
    import numpy as np

    our = np.array(result["joints"], dtype=float) / 1000.0  # 장면 × 25 × 3(키 = 1)
    conf = np.array(result["conf"], dtype=float) / 100.0
    rt = np.array(result["t"], dtype=float)
    n = len(our)
    raw = {int(k): to_v2(np.asarray(v, dtype=float), names) for k, v in raw70.items() if 0 <= int(k) < len(times)}
    if len(raw) < max(10, len(times) // 3):
        print(f"[pitch3d ai] 그림이 모자람 {len(raw)}/{len(times)} — 싣지 않음")
        return None

    idx = {nm: i for i, nm in enumerate(names)}
    pelvis = lambda a: (a[idx["lHip"]] + a[idx["rHip"]]) / 2  # noqa: E731
    src, dst = [], []
    for k, a in raw.items():
        kk = int(np.argmin(np.abs(rt - times[k])))  # 그림 시각에 가장 가까운 결과 장면
        pa, po = pelvis(a), pelvis(our[kk])
        for nm in ALIGN:
            j = idx[nm]
            if conf[kk, j] >= 0.6:
                src.append(a[j] - pa)
                dst.append(our[kk, j] - po)
    if len(src) < 20:
        print(f"[pitch3d ai] 맞출 관절이 모자람 {len(src)} — 싣지 않음")
        return None
    R, s = umeyama(np.array(src), np.array(dst))
    shape = _smooth(times, {k: (s * (R @ (a - pelvis(a)).T)).T for k, a in raw.items()})  # 골반 기준 모양(우리 좌표)

    keys = sorted(shape)
    kt = np.array([times[k] for k in keys])
    half = 0.5 * float(np.median(np.diff(times))) if len(times) > 1 else 0.0  # 그림 하나가 보이는 시간의 반
    tor = [idx[nm] for nm in TORSO]
    out = np.zeros_like(our)
    miss: list[int] = []
    for k in range(n):
        j = int(np.searchsorted(kt, rt[k], side="right"))  # kt[j-1] <= t < kt[j]
        rel = None
        if 0 < j < len(keys) and keys[j] - keys[j - 1] <= MAX_FAILED_RUN + 1:
            u = (rt[k] - kt[j - 1]) / max(kt[j] - kt[j - 1], 1e-9)
            rel = shape[keys[j - 1]] * (1 - u) + shape[keys[j]] * u
        elif j == 0 and keys[0] <= MAX_FAILED_RUN:
            rel = shape[keys[0]]
        elif j == len(keys) and len(times) - 1 - keys[-1] <= MAX_FAILED_RUN:
            rel = shape[keys[-1]]
        else:
            q = int(np.argmin(np.abs(kt - rt[k])))  # 긴 틈 · 끝 — 그 그림이 보이던 동안이면 그 그림
            if abs(kt[q] - rt[k]) <= half:
                rel = shape[keys[q]]
        if rel is None:
            miss.append(k)
            rel = our[k] - pelvis(our[k])  # 화면이 miss 장면은 섞지 않는다 — 우리 것 그대로
        else:
            # 몸통 방향은 우리 것(두 영상으로 잰 것)으로 — 한 영상만 본 AI 는 몸 전체가 돌아간 채로 나오곤 한다
            ta = rel[tor] - rel[tor].mean(0)
            to = (our[k] - pelvis(our[k]))[tor]
            Rk, _ = umeyama(ta, to - to.mean(0))
            rel = (Rk @ rel.T).T
        out[k] = pelvis(our[k]) + rel
    al = [idx[nm] for nm in ALIGN]
    ok = [k for k in range(n) if k not in set(miss)]
    res = float(np.mean([np.linalg.norm(our[k][al] - out[k][al], axis=1).mean() for k in ok])) if ok else 0.0
    print(f"[pitch3d ai] 그림 {len(raw)}/{len(times)} · 빈 장면 {len(miss)}/{n} · 크기 {s:.3f} · 몸통 · 다리 평균 차이 키의 {res * 100:.1f}%")
    ai: dict = {"model": MODEL_NAME, "joints": np.rint(out * 1000).astype(int).tolist()}
    if miss:
        ai["miss"] = miss
    return ai


def reproj_err(result: dict, joints_mm: Any, tracks: dict) -> dict:
    """3D 관절을 두 영상에 비춘 자리와 그 영상 2D 관절(확신 SEEN_CONF 넘는 것)의 거리 — {view: 장면 × 25(그 영상 속 몸 높이의 %, 못 본 관절 NaN)}."""
    import numpy as np

    J = np.array(joints_mm, dtype=float) / 1000.0
    n, nj = J.shape[:2]
    out = {}
    for view, tkey in (("side", "t"), ("back", "tBack")):
        cam = (result.get("cameras") or {}).get(view)
        tr = tracks.get(view)
        times = result.get(tkey) or result.get("t")
        if not cam or not tr or not tr.get("frames") or not times:
            continue
        Rc = np.array(cam["R"], dtype=float).reshape(3, 3)
        Tc = np.array(cam["t"], dtype=float)
        ft = np.array([f["t"] for f in tr["frames"]])
        E = np.full((n, nj), np.nan)
        for k, tk in enumerate(times[:n]):
            fr = tr["frames"][int(np.argmin(np.abs(ft - tk)))]["p"]
            ys = [y for _, y, v in fr[:17] if v >= SEEN_CONF]
            if len(ys) < 6 or max(ys) - min(ys) < 1:
                continue
            X = (Rc @ J[k].T).T + Tc
            if np.any(X[:, 2] <= 1e-6):
                continue
            u = cam["f"] * X[:, 0] / X[:, 2] + cam["cx"]
            v = cam["f"] * X[:, 1] / X[:, 2] + cam["cy"]
            body = max(ys) - min(ys)
            for j in range(nj):
                x, y, c = fr[j]
                if c >= SEEN_CONF:
                    E[k, j] = float(np.hypot(u[j] - x, v[j] - y)) / body * 100
        out[view] = E
    return out


def video_agreement(result: dict, joints_mm: Any, tracks: dict, names: list[str]) -> dict:
    """부위별 영상과의 차이 중앙값(몸 높이 %) — 로그 · 판단용."""
    import numpy as np

    idx = {nm: i for i, nm in enumerate(names)}
    th, gl = ("l", "r") if result.get("hand") == "L" else ("r", "l")
    groups = {
        "던지는 팔": [th + "El", th + "Wr", th + "HandMid"],
        "글러브 팔": [gl + "El", gl + "Wr", gl + "HandMid"],
        "다리": ["lKn", "rKn", "lAn", "rAn"],
        "몸통": ["lSh", "rSh", "lHip", "rHip"],
    }
    out = {}
    for view, E in reproj_err(result, joints_mm, tracks).items():
        out[view] = {}
        for g, js in groups.items():
            e = E[:, [idx[nm] for nm in js]]
            e = e[np.isfinite(e)]
            if e.size:
                out[view][g] = round(float(np.median(e)), 1)
    return out


def gate(result: dict, ai_mm: Any, tracks: dict, miss: list[int]) -> list[list[int]]:
    """장면 × 관절마다 AI 를 얼마나 믿을지(0~100) — 두 영상에서 AI 관절이 우리 것보다 2D 관절에 가까운 만큼만.

    g = (우리 차이 − AI 차이) / 우리 차이(두 영상 평균, 몸 높이 %), 차이가 GATE_MARGIN 밑이면 0, 어느 영상도 못 본 관절 · miss 장면은 0(우리 것 그대로).
    앞뒤 GATE_HALF 장면 평균으로 고른다(장면마다 껐다 켜지면 팔이 떤다). 화면은 이 값을 섞는 비율로 쓴다(display.ts blendAi).
    """
    import numpy as np

    eo = reproj_err(result, result["joints"], tracks)
    ea = reproj_err(result, ai_mm, tracks)
    views = [v for v in eo if v in ea]
    if not views:
        return []
    with np.errstate(invalid="ignore"):
        o = np.nanmean(np.stack([eo[v] for v in views]), axis=0)
        a = np.nanmean(np.stack([ea[v] for v in views]), axis=0)
        g = np.where(np.isfinite(o) & np.isfinite(a) & (o - a > GATE_MARGIN), (o - a) / np.maximum(o, 1e-6), 0.0)
    g = np.clip(g, 0.0, 1.0)
    g[[k for k in miss if 0 <= k < len(g)]] = 0.0
    n = len(g)
    sm = np.zeros_like(g)
    for k in range(n):
        sm[k] = g[max(0, k - GATE_HALF) : k + GATE_HALF + 1].mean(axis=0)
    return np.rint(sm * 100).astype(int).tolist()


def correct(
    result: dict,
    side_frames: list,
    side_track: dict,
    names: list[str],
    run: Callable[[list[dict]], dict[int, list]] | None = None,
) -> dict | None:
    """결과(ok)에 실을 experimental.sam3d — 못 하면 None. run 이 있으면 그것이 추론을 나눠 맡긴다(없으면 이 GPU 하나로)."""
    if not result.get("ok"):
        return None
    items, times = plan_items(result, side_frames, side_track)
    if not items:
        return None
    if run is None:
        est = _load()
        if est is None:
            return None
        raw = infer_items(est, side_frames, items)
    else:
        raw = run(items)
    return assemble(result, raw, names, times)
