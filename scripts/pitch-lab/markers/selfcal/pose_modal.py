"""마커 영상 → 2D 전신 관절 133점(RTMW-x, 분석 서버와 같은 이미지) — 장면마다. 스티커 이름표 · 카메라 보정 시작값용(정답 3D 는 스티커로).

  (영상 폴더에서) modal run <저장소>/scripts/pitch-lab/markers/selfcal/pose_modal.py --pattern 투구01_
"""
import glob, io, os, sys

import modal

if modal.is_local():
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "services", "pitch3d-gpu"))
    from app import image  # 분석 서버와 같은 이미지(층이 캐시돼 다시 안 굽는다)
else:
    image = None  # 컨테이너 안에서는 안 쓴다

app = modal.App("marker-pose-scratch", image=image)
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))  # 영상 · 찾은 자료 폴더(저장소 밖) — 기본은 지금 폴더/work


@app.function(gpu="L4", timeout=1200, max_containers=8)
def pose(name: str, data: bytes) -> tuple[str, bytes, str]:
    import tempfile, time
    import av, numpy as np
    from rtmlib import Wholebody
    from pitch3d_gpu.video import _frame_rotation, _upright, upright_turn

    if not hasattr(pose, "_m"):
        pose._m = Wholebody(to_openpose=False, mode="performance", backend="onnxruntime", device="cuda")
    m = pose._m
    path = os.path.join(tempfile.mkdtemp(), "v.mov")
    open(path, "wb").write(data)
    ts, kps, scs = [], [], []
    bbox, prev = None, None
    t0 = time.time()
    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
        s.thread_type = "AUTO"
        turn = None
        for i, f in enumerate(c.decode(s)):
            if turn is None:
                turn = upright_turn(_frame_rotation(f))
            img = _upright(f.to_ndarray(format="bgr24"), turn)
            h, w = img.shape[:2]
            boxes = m.det_model(img) if (i % 10 == 0 or bbox is None) else np.array([bbox], np.float32)
            kp, sc = m.pose_model(img, bboxes=boxes)
            best, bv = None, -1e18
            for k in range(len(kp)):
                body = kp[k][:17]
                if float(np.mean(sc[k][:17])) < 0.3:
                    continue
                cen = body.mean(0)
                v = float(np.ptp(body[:, 1])) if prev is None else -float(np.linalg.norm(cen - prev))
                if v > bv:
                    best, bv = k, v
            ts.append(float(f.pts * s.time_base))
            if best is None:
                kps.append(np.zeros((133, 2), np.float32)); scs.append(np.zeros(133, np.float32)); bbox = None
            else:
                body = kp[best][:17]
                prev = body.mean(0)
                x0, y0 = body.min(0); x1, y1 = body.max(0)
                mx, my = (x1 - x0) * 0.25 + 10, (y1 - y0) * 0.25 + 10
                bbox = [max(0.0, x0 - mx), max(0.0, y0 - my), min(float(w), x1 + mx), min(float(h), y1 + my)]
                kps.append(kp[best].astype(np.float32)); scs.append(sc[best].astype(np.float32))
    buf = io.BytesIO()
    np.savez_compressed(buf, t=np.array(ts), kp=np.array(kps), sc=np.array(scs), wh=np.array([w, h]))
    return name, buf.getvalue(), f"{len(ts)} 장면 · {time.time() - t0:.0f}초"


@app.local_entrypoint()
def main(pattern: str = ""):
    vids = sorted(glob.glob(os.path.join(WORK, "..", "videos", "*.mov")))
    vids = [v for v in vids if pattern in os.path.basename(v)]
    todo = [v for v in vids if not os.path.exists(os.path.join(WORK, "kp", os.path.splitext(os.path.basename(v))[0] + ".npz"))]
    print(f"{len(todo)}개 보냄")
    args = [(os.path.splitext(os.path.basename(v))[0], open(v, "rb").read()) for v in todo]
    for name, data, msg in pose.starmap(args, order_outputs=False):
        open(os.path.join(WORK, "kp", name + ".npz"), "wb").write(data)
        print(name, msg, flush=True)
