"""2D 전신 관절(RTMW, rtmlib) — 장면마다 133점 → 엔진 관절 25개(mapping.py).

사람이 여럿이면(포수 · 코치) 앞 장면의 사람과 가장 가까운 쪽, 첫 장면은 화면에서 가장 큰 사람. 못 찾은 장면은 확신 0 으로 둔다(엔진이 뺀다).
"""

from __future__ import annotations

import numpy as np

from .mapping import N_JOINTS, to_v2_points
from .video import Frame

MODEL_NAME = "rtmw-x-384"
# 사람 찾기(YOLOX)는 이만큼마다 — 사이는 앞 장면 관절의 상자로(관절 모델은 장면마다)
DET_EVERY = 10


class Pose:
    def __init__(self, device: str = "cuda"):
        from rtmlib import Wholebody

        # mode='performance' = RTMDet-m + RTMW-x 384×288(rtmlib 기본 묶음). 첫 호출에 모델을 받는다(이미지 빌드 때 한 번 미리 부른다).
        import onnxruntime as ort

        providers = ort.get_available_providers()
        print(f"[pitch3d pose] onnxruntime providers: {providers}")
        if device == "cuda" and "CUDAExecutionProvider" not in providers:
            print("[pitch3d pose] CUDA 가 없다 — CPU 로 돈다(느림)")
        self.model = Wholebody(to_openpose=False, mode="performance", backend="onnxruntime", device=device)
        self._bbox: list[float] | None = None
        self.name = MODEL_NAME
        self._prev_center: np.ndarray | None = None

    def _pick(self, keypoints: np.ndarray, scores: np.ndarray) -> int | None:
        """사람 고르기 — 몸 17점(0~16)의 확신 평균이 0.3 밑이면 없는 것으로."""
        if keypoints is None or len(keypoints) == 0:
            return None
        best, best_val = None, -1.0
        for i in range(len(keypoints)):
            body = keypoints[i][:17]
            conf = float(np.mean(scores[i][:17]))
            if conf < 0.3:
                continue
            center = body.mean(axis=0)
            size = float(np.ptp(body[:, 1]))  # 세로 크기
            if self._prev_center is None:
                val = size
            else:
                val = -float(np.linalg.norm(center - self._prev_center))
            if val > best_val:
                best, best_val = i, val
        if best is not None:
            self._prev_center = keypoints[best][:17].mean(axis=0)
        return best

    def track(self, frames: list[Frame], width: int, height: int, fps: float) -> dict:
        """V2Track — { W, H, fps, frames: [{ t, p: [[x, y, v] × 25] }] } (픽셀은 원본 크기 기준)."""
        import time as _t

        self._prev_center = None
        self._bbox = None
        out = []
        t0 = _t.time()
        for k, fr in enumerate(frames):
            h, w = fr.image.shape[:2]
            sx = width / w
            sy = height / h
            if k % DET_EVERY == 0 or self._bbox is None:
                bboxes = self.model.det_model(fr.image)
            else:
                bboxes = np.array([self._bbox], dtype=np.float32)
            keypoints, scores = self.model.pose_model(fr.image, bboxes=bboxes)
            i = self._pick(keypoints, scores)
            if i is None:
                p = [[0.0, 0.0, 0.0] for _ in range(N_JOINTS)]
                self._bbox = None
            else:
                body = keypoints[i][:17]
                x0, y0 = body.min(axis=0)
                x1, y1 = body.max(axis=0)
                mx, my = (x1 - x0) * 0.25 + 10, (y1 - y0) * 0.25 + 10
                self._bbox = [max(0.0, x0 - mx), max(0.0, y0 - my), min(float(w), x1 + mx), min(float(h), y1 + my)]
                p = to_v2_points(keypoints[i], scores[i])
                p = [[x * sx, y * sy, v] for x, y, v in p]
            out.append({"t": fr.t, "p": p})
        dt = _t.time() - t0
        print(f"[pitch3d pose] {len(frames)} frames in {dt:.1f}s ({len(frames) / max(dt, 1e-6):.1f} fps)")
        return {"W": width, "H": height, "fps": fps, "frames": out}
