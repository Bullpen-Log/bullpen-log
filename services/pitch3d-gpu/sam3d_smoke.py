"""AI 스켈레톤 보정 연기 시험 · 속도 재기 — 사용자 영상 없이 SAM 3D Body 가 Modal 에서 도는지, 어떻게 하면 빨라지고 얼마나 달라지는지.

    modal run sam3d_smoke.py

저장소의 예시 사진(notebook/images/dancing.jpg)과 그 변형 8장(자르기 · 좌우 뒤집기 · 기울이기 · 밝기)으로 방식마다 장면당 시간과
관절 25개의 차이(기준 = 지금 방식 fp32 · full, 골반 기준 mm · 손목 · 손은 따로)를 찍는다. CPU 수 두 가지를 나란히 잰다.
"""

from __future__ import annotations

import io
import sys
import time

import modal

from app import GPU, hf_cache, hf_secret, image

# 배포된 앱과 따로 — 컨테이너도 app.py 를 불러오므로 같이 싣는다
app = modal.App("bullpen-pitch3d-smoke", image=image.add_local_python_source("app"))

MODES = ["fp32"]  # 1차(2026-10-09): tf32 0.93초 · bf16 실패 · body 0.22초인데 손 84mm · jpeg95 손 16mm · CPU 8 효과 없음


def _bench(t_sent: float) -> dict:
    import cv2
    import numpy as np
    import torch

    from pitch3d_gpu import sam3d
    from pitch3d_gpu.mapping import V2_NAMES

    _empty = torch.cuda.empty_cache
    _noop = lambda: None  # noqa: E731
    t_in = time.time()
    est = sam3d._load()
    t_load = time.time() - t_in
    if est is None:
        return {"ok": False, "why": "모델을 못 올림"}
    base = cv2.imread(f"{sam3d.REPO_DIR}/notebook/images/dancing.jpg")
    h0, w0 = base.shape[:2]
    imgs = [base]
    for s in (0.85, 0.7):  # 가운데 자르기
        dh, dw = int(h0 * (1 - s) / 2), int(w0 * (1 - s) / 2)
        imgs.append(base[dh : h0 - dh, dw : w0 - dw].copy())
    imgs.append(base[:, ::-1].copy())
    for a in (-8, 8):
        M = cv2.getRotationMatrix2D((w0 / 2, h0 / 2), a, 1.0)
        imgs.append(cv2.warpAffine(base, M, (w0, h0)))
    imgs.append(cv2.convertScaleAbs(base, alpha=0.75, beta=0))
    imgs.append(cv2.resize(base, (w0 * 2 // 3, h0 * 2 // 3)))

    ix = {n: i for i, n in enumerate(V2_NAMES)}
    hand = [ix[n] for n in V2_NAMES if n.endswith("Wr") or "Hand" in n]

    def run(img_bgr, mode, est=est):
        h, w = img_bgr.shape[:2]
        if mode == "jpeg95":
            ok, enc = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
            img_bgr = cv2.imdecode(enc, cv2.IMREAD_COLOR)
        f = 1.2 * max(h, w)
        K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], dtype=np.float32)
        box = np.array([[0, 0, w, h]], dtype=np.float32)
        if mode in MODES:
            torch.cuda.empty_cache = _noop if mode != "fp32" else _empty
        t1 = time.time()
        outs = est.process_one_image(img_bgr[:, :, ::-1].copy(), bboxes=box, cam_int=torch.from_numpy(K)[None])
        torch.cuda.synchronize()
        dt = time.time() - t1
        o = outs[0]
        k70 = np.asarray(o["pred_keypoints_3d"], dtype=float) + np.asarray(o["pred_cam_t"], dtype=float)[None]
        v = sam3d.to_v2(k70, V2_NAMES)
        return dt, v - (v[ix["lHip"]] + v[ix["rHip"]]) / 2

    sys.stdout = io.StringIO()  # 모델이 장면마다 안내 글을 찍는다
    run(imgs[0], "fp32")  # 데우기(첫 장은 4초)
    ref = [run(im, "fp32")[1] for im in imgs]
    out: dict = {"ok": True, "load_s": round(t_load, 1), "start_s": round(t_in - t_sent, 1), "imgs": len(imgs)}
    for mode in MODES:
        try:
            run(imgs[0], mode)
            times, d_all, d_hand = [], [], []
            for im, r in zip(imgs, ref):
                dt, v = run(im, mode)
                times.append(dt)
                d = np.linalg.norm(v - r, axis=1) * 1000
                d_all.append(float(d.mean()))
                d_hand.append(float(d[hand].max()))
            out[mode] = {
                "s_per_frame": round(float(np.median(times)), 3),
                "mm_mean": round(float(np.mean(d_all)), 2),
                "mm_hand_max": round(float(np.max(d_hand)), 2),
            }
        except Exception as e:  # noqa: BLE001
            out[mode] = f"실패 {type(e).__name__}: {str(e)[:160]}"
    # 2차(2026-10-09): empty_cache 막기 0.93초(그대로) · 한 GPU 에 모델 2 · 3벌 스레드 1.2 · 1.37초(더 느림 — GPU 가 꽉 참)
    out["v"] = [r.tolist() for r in ref]
    out["gpu"] = torch.cuda.get_device_name(0)
    sys.stdout = sys.__stdout__
    hf_cache.commit()
    return out


@app.function(gpu=GPU, timeout=1200, memory=16384, volumes={"/cache/hf": hf_cache}, secrets=hf_secret)
def bench(t_sent: float) -> dict:
    return _bench(t_sent)


GPUS = ["L4", "L40S", "A100-40GB", "H100"]


@app.local_entrypoint()
def main():
    import json

    import numpy as np

    calls = {g: bench.with_options(gpu=g).spawn(time.time()) for g in GPUS}
    res = {}
    for g, c in calls.items():
        try:
            res[g] = c.get(timeout=1500)
        except Exception as e:  # noqa: BLE001
            res[g] = {"ok": False, "why": f"{type(e).__name__}: {str(e)[:120]}"}
    ref = np.array(res["L4"]["v"]) if res["L4"].get("ok") else None
    for g, r in res.items():
        if r.get("ok") and ref is not None:
            d = np.linalg.norm(np.array(r["v"]) - ref, axis=2) * 1000
            r["mm_vs_L4_mean"] = round(float(d.mean()), 2)
            r["mm_vs_L4_max"] = round(float(d.max()), 2)
        r.pop("v", None)
    print(json.dumps(res, ensure_ascii=False, indent=1))
