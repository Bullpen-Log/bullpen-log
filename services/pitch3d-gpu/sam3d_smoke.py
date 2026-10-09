"""AI 스켈레톤 보정 연기 시험 — 사용자 영상 없이 SAM 3D Body 가 Modal 에서 도는지(설치 · 무게 받기 · 출력 모양 · 장면당 시간).

    modal run sam3d_smoke.py

저장소의 예시 사진(notebook/images/dancing.jpg)으로 한 장 추론 → 키 · 모양 · 2D 다시 비춤 오차 · 시간을 찍는다. 무게는 볼륨에 남는다.
"""

from __future__ import annotations

import time

import modal

from app import GPU, hf_cache, hf_secret, image

# 배포된 앱과 따로 — 컨테이너도 app.py 를 불러오므로 같이 싣는다
app = modal.App("bullpen-pitch3d-smoke", image=image.add_local_python_source("app"))


@app.function(gpu=GPU, timeout=1200, memory=16384, volumes={"/cache/hf": hf_cache}, secrets=hf_secret)
def smoke() -> dict:
    import cv2
    import numpy as np

    from pitch3d_gpu import sam3d

    t0 = time.time()
    est = sam3d._load()
    t_load = time.time() - t0
    if est is None:
        return {"ok": False, "why": "모델을 못 올림(로그 [pitch3d ai] 참고)"}
    img = cv2.imread(f"{sam3d.REPO_DIR}/notebook/images/dancing.jpg")[:, :, ::-1].copy()
    h, w = img.shape[:2]
    f = 1.2 * max(h, w)
    K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], dtype=np.float32)
    box = np.array([[0, 0, w, h]], dtype=np.float32)
    import contextlib
    import io

    import torch

    times = []
    outs = []
    for _ in range(3):
        t1 = time.time()
        with contextlib.redirect_stdout(io.StringIO()):
            outs = est.process_one_image(img, bboxes=box, cam_int=torch.from_numpy(K)[None])
        times.append(time.time() - t1)
    hf_cache.commit()
    if not outs:
        return {"ok": False, "why": "사람을 못 찾음", "load_s": round(t_load, 1)}
    o = outs[0]
    k3 = np.asarray(o["pred_keypoints_3d"], dtype=float)
    ct = np.asarray(o["pred_cam_t"], dtype=float)
    k2 = np.asarray(o["pred_keypoints_2d"], dtype=float)
    X = k3 + ct[None]
    fl = float(np.asarray(o["focal_length"]).reshape(-1)[0])
    proj = np.stack([fl * X[:, 0] / X[:, 2] + w / 2, fl * X[:, 1] / X[:, 2] + h / 2], 1)
    err = float(np.median(np.linalg.norm(proj - k2[:, :2], axis=1)))
    return {
        "ok": True,
        "load_s": round(t_load, 1),
        "frame_s": [round(t, 2) for t in times],
        "people": len(outs),
        "keys": sorted(o.keys()),
        "k3d": list(k3.shape),
        "cam_t": [round(float(v), 3) for v in ct],
        "focal": round(fl, 1),
        "reproj_px_median": round(err, 2),
        "height_m": round(float(k3[:, 1].max() - k3[:, 1].min()), 3),
    }


@app.local_entrypoint()
def main():
    import json

    print(json.dumps(smoke.remote(), ensure_ascii=False, indent=1))
