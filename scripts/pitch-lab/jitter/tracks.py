"""실험실 샘플 2D(work/kp/<키>_side · _back.npz — pose_modal.py, 분석 서버와 같은 RTMW) → 엔진 입력 jitter/<키>/tracks.json.

  python tracks.py <LAB 폴더>     — samples.json 의 샘플마다, npz 가 tracks.json 보다 새로우면 다시 만든다

서버(pipeline.py)처럼: 장면은 min(120, 영상 fps)로 솎고, 렌즈 1배 초점 사전 · 화면 녹화 · 슬로모 · 키를 meta 에 넣는다(mocap-fit.mts 가 읽는다).
영상(videos/<키>_side · _back.mov)이 있으면 머리의 기종 · fps 도 — 서버의 video.device_info 와 같은 값(엔진이 기종별 초점 표를 찾는다).
"""
import json, os, sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "markers", "selfcal"))
from bench import RTMW, SCORE_SCALE  # noqa: E402 — 관절 표 · 점수 눈금은 마커 채점과 같은 것

FOCAL_PRIOR_1X = {"k": 0.78, "sigma": 0.25}  # lib/pitch-3d/camera.ts FOCAL_PRIOR_1X — 서버는 렌즈를 '1x' 로 넘긴다
TRACKS_VERSION = 2  # 2 = meta.devices(기종 · fps) — 옛 tracks.json 은 다시 만든다


def device_info(path):
    """services/pitch3d-gpu/pitch3d_gpu/video.py device_info 와 같은 값 — PyAV 가 없거나 못 읽으면 None"""
    try:
        import av

        with av.open(path, options={"ignore_editlist": "1"}) as c:
            s = c.streams.video[0]
            rate = s.guessed_rate or s.base_rate or s.average_rate
            model = c.metadata.get("com.apple.quicktime.model")
            return {"model": str(model)[:80] if model else None, "fps": float(rate) if rate else None}
    except Exception:  # noqa: BLE001
        return None


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
            if json.load(open(out)).get("meta", {}).get("tracks_version") == TRACKS_VERSION:
                continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        meta = {"hand": m["hand"], "height_m": (m.get("heightCm") or 180) / 100, "focal_prior": FOCAL_PRIOR_1X,
                "screen_recorded": m.get("screenRecorded") is True, "slowmo_fps": m.get("slowmoFps"), "tracks_version": TRACKS_VERSION}
        devices = {v: device_info(os.path.join(lab, "videos", f"{key}_{v}.mov")) for v in ("side", "back")}
        if all(devices.values()):
            meta["devices"] = devices
        json.dump({"side": track(kp["side"]), "back": track(kp["back"]), "meta": meta}, open(out, "w"))
        print(key, "엔진 입력 만듦")


if __name__ == "__main__":
    main(sys.argv[1])
