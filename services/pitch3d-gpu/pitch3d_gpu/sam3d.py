"""AI 스켈레톤 보정(실험) — 메타 SAM 3D Body 로 장면마다 '사람다운' 관절을 얻어 결과에 싣는다.

2026-10-09 김민: "스켈레톤이 자연스럽게 움직이게 보정할 AI 가 필요하다 · 스켈레톤 위에 뭘 씌울 필요는 없다".
SAM 3D Body 는 사람 몸(MHR)을 맞추지만 여기서는 관절 점(MHR 70점 중 25개)만 쓴다 — 메시는 버린다.

  1 옆 영상의 결과 장면마다 사람 상자(RTMW 관절 둘레) · 카메라(맞추기가 찾은 초점)로 한 장 추론
  2 70점 → 엔진 관절 25개(손은 손가락 가운데 손목에 가장 가까운 마디 = 손허리뼈 마디)
  3 우리 좌표로 — 클립 전체에 회전 · 크기 하나(잘 보인 몸통 · 다리 관절로 Umeyama), 장면마다 골반 가운데를 우리 골반에
  4 결과 experimental.sam3d = { model, joints(장면 × 25 × 3 정수 mm) } — 화면이 우리 관절과 섞는다(lib/pitch-3d/v2/display.ts)

모델 무게는 Hugging Face 의 잠긴 저장소(facebook/sam-3d-body-vith) — Modal 비밀 'huggingface'(HF_TOKEN)가 있어야 받는다. 없거나
실패하면 None(분석은 그대로 끝난다). 라이선스: SAM License(상업 사용 가능, 금지 용도 있음).
"""

from __future__ import annotations

import os
import sys
from typing import Any

HF_REPO = "facebook/sam-3d-body-vith"
MODEL_NAME = "sam-3d-body-vith"
REPO_DIR = "/opt/sam-3d-body"
# 한 작업에서 AI 를 돌리는 최대 장면 수(나머지는 가까운 장면으로 잇는다) — L4 에서 장면당 0.3초 안팎
MAX_AI_FRAMES = 240

# MHR 70점 차례(sam_3d_body/metadata/mhr70.py)
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
    "rWr": 41,
    "lWr": 62,
}
# 손가락 네 점(끝 · 첫째 · 둘째 · 셋째 마디) — 손목에 가장 가까운 것이 손허리뼈 마디
FINGERS = {
    "rHandIdx": [25, 26, 27, 28],
    "rHandMid": [29, 30, 31, 32],
    "rHandPinky": [37, 38, 39, 40],
    "lHandIdx": [46, 47, 48, 49],
    "lHandMid": [50, 51, 52, 53],
    "lHandPinky": [58, 59, 60, 61],
}
# 맞추기의 잘 보인 관절로 회전 · 크기를 정할 때 쓰는 관절(몸통 · 다리 — 팔은 흐려서 뺀다)
ALIGN = ["lSh", "rSh", "lHip", "rHip", "lKn", "rKn", "lAn", "rAn"]

_cache: dict[str, Any] = {}


def to_v2(k70, names: list[str]):
    """MHR 70점(70×3) → 엔진 관절 차례(names)의 25×3."""
    import numpy as np

    out = np.zeros((len(names), 3))
    for i, n in enumerate(names):
        if n in MHR:
            out[i] = k70[MHR[n]]
        elif n in FINGERS:
            wr = k70[MHR["rWr" if n.startswith("r") else "lWr"]]
            cand = FINGERS[n]
            out[i] = min((k70[c] for c in cand), key=lambda p: float(np.linalg.norm(p - wr)))
    return out


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


def correct(result: dict, side_frames: list, side_track: dict, names: list[str]) -> dict | None:
    """결과(ok)에 실을 experimental.sam3d — 못 하면 None.

    side_frames: 구간의 옆 영상 장면(video.Frame — t · 줄였을 수 있는 BGR 그림), side_track: 같은 장면의 2D 관절(원본 픽셀).
    """
    import numpy as np

    est = _load()
    if est is None or not result.get("ok"):
        return None
    cam = (result.get("cameras") or {}).get("side")
    if not cam or not side_frames:
        return None
    ts = result["t"]
    n = len(ts)
    our = np.array(result["joints"], dtype=float) / 1000.0  # 장면 × 25 × 3(키 = 1)
    conf = np.array(result["conf"], dtype=float) / 100.0
    frame_t = np.array([f.t for f in side_frames])
    track_t = np.array([f["t"] for f in side_track["frames"]])

    picks = list(range(n))
    if n > MAX_AI_FRAMES:
        picks = sorted({round(i * (n - 1) / (MAX_AI_FRAMES - 1)) for i in range(MAX_AI_FRAMES)})
    raw: dict[int, Any] = {}
    for k in picks:
        fi = int(np.argmin(np.abs(frame_t - ts[k])))
        img = side_frames[fi].image
        h, w = img.shape[:2]
        sc = w / float(cam["W"])
        ti = int(np.argmin(np.abs(track_t - ts[k])))
        pts = [(x * sc, y * sc) for x, y, v in side_track["frames"][ti]["p"] if v >= 0.3]
        if len(pts) < 6:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        mx = (max(xs) - min(xs)) * 0.2 + 20
        my = (max(ys) - min(ys)) * 0.15 + 20
        box = np.array([[max(0, min(xs) - mx), max(0, min(ys) - my), min(w, max(xs) + mx), min(h, max(ys) + my)]], dtype=np.float32)
        K = np.array([[cam["f"] * sc, 0, cam["cx"] * sc], [0, cam["f"] * sc, cam["cy"] * sc], [0, 0, 1]], dtype=np.float32)
        try:
            import contextlib
            import io

            import torch

            with contextlib.redirect_stdout(io.StringIO()):  # 장면마다 안내 글을 찍는다 — 로그를 덮지 않게
                outs = est.process_one_image(img[:, :, ::-1].copy(), bboxes=box, cam_int=torch.from_numpy(K)[None])
        except Exception as e:  # noqa: BLE001
            print(f"[pitch3d ai] 장면 {k} 실패 — {type(e).__name__}: {str(e)[:200]}")
            continue
        if not outs:
            continue
        o = outs[0]
        k70 = np.asarray(o["pred_keypoints_3d"], dtype=float) + np.asarray(o["pred_cam_t"], dtype=float)[None]
        raw[k] = to_v2(k70, names)
    if len(raw) < max(10, len(picks) // 3):
        print(f"[pitch3d ai] 장면이 모자람 {len(raw)}/{len(picks)} — 싣지 않음")
        return None

    idx = {nm: i for i, nm in enumerate(names)}
    pelvis = lambda a: (a[idx["lHip"]] + a[idx["rHip"]]) / 2  # noqa: E731
    src, dst = [], []
    for k, a in raw.items():
        pa, po = pelvis(a), pelvis(our[k])
        for nm in ALIGN:
            j = idx[nm]
            if conf[k, j] >= 0.6:
                src.append(a[j] - pa)
                dst.append(our[k, j] - po)
    if len(src) < 20:
        print(f"[pitch3d ai] 맞출 관절이 모자람 {len(src)} — 싣지 않음")
        return None
    R, s = umeyama(np.array(src), np.array(dst))

    keys = sorted(raw)
    out = np.zeros_like(our)
    for k in range(n):
        near = min(keys, key=lambda q: abs(q - k))
        a = raw[near]
        out[k] = pelvis(our[k]) + (s * (R @ (a - pelvis(a)).T)).T
    res = np.mean([np.linalg.norm(our[k][[idx[nm] for nm in ALIGN]] - out[k][[idx[nm] for nm in ALIGN]], axis=1).mean() for k in keys])
    print(f"[pitch3d ai] {len(raw)}/{len(picks)} 장면 · 크기 {s:.3f} · 몸통 · 다리 평균 차이 키의 {res * 100:.1f}%")
    return {"model": MODEL_NAME, "joints": np.rint(out * 1000).astype(int).tolist()}
