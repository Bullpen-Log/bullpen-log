"""마커 영상 → 2D 전신 관절 133점(RTMW-x, 분석 서버와 같은 이미지) — 장면마다. 스티커 이름표 · 카메라 보정 시작값용(정답 3D 는 스티커로).

  (영상 폴더에서) modal run <저장소>/scripts/pitch-lab/markers/selfcal/pose_modal.py --pattern 투구01_
  --flip 이면 좌우로 뒤집은 장면도 한 번 더 보고(같은 사람 상자) 원래 자리로 되돌려 kpf · scf 로 함께 남긴다 → work/kpf/
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


def flip_index():
    """COCO-WholeBody 133점의 좌우 짝 — 뒤집은 장면의 점 i 는 원래 장면의 FLIP[i]"""
    f = list(range(133))
    pairs = [(1, 2), (3, 4), (5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 20), (18, 21), (19, 22)]
    face = [(0, 16), (1, 15), (2, 14), (3, 13), (4, 12), (5, 11), (6, 10), (7, 9), (17, 26), (18, 25), (19, 24), (20, 23), (21, 22),
            (31, 35), (32, 34), (36, 45), (37, 44), (38, 43), (39, 42), (40, 47), (41, 46), (48, 54), (49, 53), (50, 52), (55, 59),
            (56, 58), (60, 64), (61, 63), (65, 67)]
    pairs += [(23 + a, 23 + b) for a, b in face] + [(91 + i, 112 + i) for i in range(21)]
    for a, b in pairs:
        f[a], f[b] = b, a
    return f
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))  # 영상 · 찾은 자료 폴더(저장소 밖) — 기본은 지금 폴더/work


@app.function(gpu="L4", timeout=1200, max_containers=8)
def pose(name: str, data: bytes, flip: bool = False) -> tuple[str, bytes, str]:
    import tempfile, time
    import av, numpy as np
    from rtmlib import Wholebody
    from pitch3d_gpu.video import _frame_rotation, _upright, upright_turn

    if not hasattr(pose, "_m"):
        pose._m = Wholebody(to_openpose=False, mode="performance", backend="onnxruntime", device="cuda")
    m = pose._m
    path = os.path.join(tempfile.mkdtemp(), "v.mov")
    open(path, "wb").write(data)
    ts, kps, scs, kpfs, scfs = [], [], [], [], []
    FLIP = np.array(flip_index())
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
                kpfs.append(np.zeros((133, 2), np.float32)); scfs.append(np.zeros(133, np.float32))
            else:
                body = kp[best][:17]
                prev = body.mean(0)
                x0, y0 = body.min(0); x1, y1 = body.max(0)
                mx, my = (x1 - x0) * 0.25 + 10, (y1 - y0) * 0.25 + 10
                bbox = [max(0.0, x0 - mx), max(0.0, y0 - my), min(float(w), x1 + mx), min(float(h), y1 + my)]
                kps.append(kp[best].astype(np.float32)); scs.append(sc[best].astype(np.float32))
                if flip:
                    bx = np.asarray(boxes[best], np.float32)[:4]
                    kf, sf = m.pose_model(np.ascontiguousarray(img[:, ::-1]), bboxes=np.array([[w - bx[2], bx[1], w - bx[0], bx[3]]], np.float32))
                    kf, sf = kf[0][FLIP].astype(np.float32), sf[0][FLIP].astype(np.float32)
                    kf[:, 0] = w - 1 - kf[:, 0]
                    kpfs.append(kf); scfs.append(sf)
    buf = io.BytesIO()
    extra = {"kpf": np.array(kpfs), "scf": np.array(scfs)} if flip else {}
    np.savez_compressed(buf, t=np.array(ts), kp=np.array(kps), sc=np.array(scs), wh=np.array([w, h]), **extra)
    return name, buf.getvalue(), f"{len(ts)} 장면 · {time.time() - t0:.0f}초"


@app.local_entrypoint()
def main(pattern: str = "", flip: bool = False):
    out = "kpf" if flip else "kp"
    os.makedirs(os.path.join(WORK, out), exist_ok=True)
    vids = sorted(glob.glob(os.path.join(WORK, "..", "videos", "*.mov")))
    vids = [v for v in vids if pattern in os.path.basename(v)]
    todo = [v for v in vids if not os.path.exists(os.path.join(WORK, out, os.path.splitext(os.path.basename(v))[0] + ".npz"))]
    print(f"{len(todo)}개 보냄")
    args = [(os.path.splitext(os.path.basename(v))[0], open(v, "rb").read(), flip) for v in todo]
    for name, data, msg in pose.starmap(args, order_outputs=False):
        open(os.path.join(WORK, out, name + ".npz"), "wb").write(data)
        print(name, msg, flush=True)
