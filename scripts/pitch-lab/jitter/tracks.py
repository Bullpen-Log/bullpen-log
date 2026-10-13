"""실험실 샘플 2D(work/kp/<키>_side · _back.npz — pose_modal.py, 분석 서버와 같은 RTMW) → 엔진 입력 jitter/<키>/tracks.json.

  python tracks.py <LAB 폴더>     — samples.json 의 샘플마다, npz 가 tracks.json 보다 새로우면 다시 만든다

서버(pipeline.py)처럼: 장면은 min(120, 영상 fps)로 솎고, 렌즈 1배 초점 사전 · 화면 녹화 · 슬로모 · 키를 meta 에 넣는다(mocap-fit.mts 가 읽는다).
"""
import json, os, sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "markers", "selfcal"))
from bench import RTMW, SCORE_SCALE  # noqa: E402 — 관절 표 · 점수 눈금은 마커 채점과 같은 것

FOCAL_PRIOR_1X = {"k": 0.78, "sigma": 0.25}  # lib/pitch-3d/camera.ts FOCAL_PRIOR_1X — 서버는 렌즈를 '1x' 로 넘긴다


def track(path):
    z = np.load(path)
    t, kp, sc = z["t"], z["kp"].astype(float), z["sc"].astype(float)
    W, H = [int(v) for v in z["wh"]]
    fps = min(120.0, 1 / float(np.median(np.diff(t))))
    keep, last = [], -1e9
    for i, ti in enumerate(t):
        if ti - last >= 1 / fps - 1e-4:
            keep.append(i)
            last = ti
    frames = [{"t": float(t[i]), "p": [[float(kp[i, j, 0]), float(kp[i, j, 1]), float(min(1, max(0, sc[i, j] / SCORE_SCALE)))] for j in RTMW]} for i in keep]
    return {"W": W, "H": H, "fps": fps, "frames": frames}


def main(lab):
    samples = json.load(open(os.path.join(lab, "jitter", "samples.json"), encoding="utf-8"))
    for key, m in samples.items():
        kp = {v: os.path.join(lab, "work", "kp", f"{key}_{v}.npz") for v in ("side", "back")}
        if not all(os.path.exists(p) for p in kp.values()):
            print(key, "2D 없음 — 건너뜀(--fetch)")
            continue
        out = os.path.join(lab, "jitter", key, "tracks.json")
        if os.path.exists(out) and os.path.getmtime(out) > max(os.path.getmtime(p) for p in kp.values()):
            continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        meta = {"hand": m["hand"], "height_m": (m.get("heightCm") or 180) / 100, "focal_prior": FOCAL_PRIOR_1X,
                "screen_recorded": m.get("screenRecorded") is True, "slowmo_fps": m.get("slowmoFps")}
        json.dump({"side": track(kp["side"]), "back": track(kp["back"]), "meta": meta}, open(out, "w"))
        print(key, "엔진 입력 만듦")


if __name__ == "__main__":
    main(sys.argv[1])
