"""마커 영상 → 엔진 장면마다 투수 윤곽(SAM 2.1 영상 분할) — 골반 방향을 두 영상 윤곽으로 재는 실험(A안)의 재료.

  (세션 폴더에서) modal run <저장소>/scripts/pitch-lab/markers/selfcal/silhouette_modal.py --ps 2,3,...
  → work/sil/pNN_side.npz · pNN_back.npz (t · 윤곽(가로세로 반, packbits) · wh)

장면은 엔진 결과(work/bench/pNN/result.json)의 t(옆 = c1) · tBack(뒤 = c2) — 같은 영상 시각에 가장 가까운 장면.
그림은 관절 찾기(pose_modal.py)와 같이 바로 세운다. 사람 상자는 이미 찾은 2D 관절(work/kp)에서 — 10장마다 다시 짚어 준다.
SAM 2 는 Apache 2.0(facebookresearch/sam2), 무게는 Hugging Face 공개 저장소.
"""
import io, json, os, sys

import modal

GPU_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "services", "pitch3d-gpu", "pitch3d_gpu")
# 분석 서버 이미지와 같은 바탕(CUDA 12.4 · torch 2.5.1) + SAM 2 — 서버 이미지는 끝에 로컬 파일을 붙여 뒤에 단계를 더할 수 없다
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.5.1", "torchvision==0.20.1", extra_index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("av>=12", "numpy>=1.26", "opencv-python-headless==4.10.0.84", "huggingface_hub==0.26.2")
    .env({"SAM2_BUILD_CUDA": "0", "HF_HOME": "/root/hf"})
    .pip_install("git+https://github.com/facebookresearch/sam2.git")
    .add_local_dir(GPU_DIR, remote_path="/root/pitch3d_gpu")
    .add_local_file(os.path.join(GPU_DIR, "..", "..", "..", "lib", "pitch-3d", "v2", "joint-map.json"), "/root/engine/lib/pitch-3d/v2/joint-map.json")
)

app = modal.App("marker-sil-scratch", image=image)
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))
MODEL = "facebook/sam2.1-hiera-large"
PROMPT_EVERY = 10
SCORE_SCALE = 6.0


def boxes_of(kp_path, times, pad=0.12):
    """요청 시각마다 사람 상자(몸 17점 + 발 6점 중 보인 것) — 없으면 None"""
    import numpy as np

    z = np.load(kp_path)
    t, kp, sc = z["t"], z["kp"], z["sc"] / SCORE_SCALE
    out = []
    for tt in times:
        i = int(np.argmin(np.abs(t - tt)))
        m = sc[i, :23] > 0.3
        if m.sum() < 6:
            out.append(None)
            continue
        p = kp[i, :23][m]
        x0, y0 = p.min(0)
        x1, y1 = p.max(0)
        mx, my = (x1 - x0) * pad + 8, (y1 - y0) * pad + 8
        out.append([float(x0 - mx), float(y0 - my), float(x1 + mx), float(y1 + my)])
    return out


@app.function(gpu="L4", timeout=1800, max_containers=10)
def segment(name: str, data: bytes, times: list, boxes: list) -> tuple[str, bytes, str]:
    import tempfile, time
    import av, cv2, numpy as np, torch
    from pitch3d_gpu.video import _frame_rotation, _upright, upright_turn
    from sam2.sam2_video_predictor import SAM2VideoPredictor

    t0 = time.time()
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "v.mov")
    open(path, "wb").write(data)
    want = np.array(times)
    best = [None] * len(times)  # (거리, 그림)
    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
        s.thread_type = "AUTO"
        turn = None
        for f in c.decode(s):
            ts = float(f.pts * s.time_base)
            d = np.abs(want - ts)
            js = np.nonzero(d < 0.006)[0]
            if not len(js):
                continue
            if turn is None:
                turn = upright_turn(_frame_rotation(f))
            img = None
            for j in js:
                if best[j] is None or d[j] < best[j][0]:
                    if img is None:
                        img = _upright(f.to_ndarray(format="bgr24"), turn)
                    best[j] = (float(d[j]), img)
    missing = [i for i, b in enumerate(best) if b is None]
    if missing:
        return name, b"", f"장면 못 찾음 {len(missing)}"
    h, w = best[0][1].shape[:2]
    fdir = os.path.join(tmp, "f")
    os.makedirs(fdir)
    for i, (_, img) in enumerate(best):
        cv2.imwrite(os.path.join(fdir, f"{i:05d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not hasattr(segment, "_p"):
        segment._p = SAM2VideoPredictor.from_pretrained(MODEL, device="cuda")
    pred = segment._p
    masks = np.zeros((len(times), (h + 1) // 2, (w + 1) // 2), bool)
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
        st = pred.init_state(video_path=fdir, offload_video_to_cpu=True)
        n_prompt = 0
        for i, b in enumerate(boxes):
            if b is not None and (i % PROMPT_EVERY == 0 or n_prompt == 0):
                pred.add_new_points_or_box(st, frame_idx=i, obj_id=1, box=np.array(b, np.float32))
                n_prompt += 1
        for fi, _, logits in pred.propagate_in_video(st):
            m = (logits[0, 0] > 0).cpu().numpy()
            masks[fi] = m[::2, ::2]
    buf = io.BytesIO()
    np.savez_compressed(buf, t=np.array(times), mask=np.packbits(masks, axis=-1), shape=np.array(masks.shape), wh=np.array([w, h]))
    area = masks.reshape(len(times), -1).mean(1)
    return name, buf.getvalue(), f"{len(times)} 장면 · 짚음 {n_prompt} · 넓이 {area.min():.3f}~{area.max():.3f} · {time.time() - t0:.0f}초"


def lab_items(WORK, names):
    """실험실 샘플(LAB=1): (이름, result, 옆 영상 경로, 뒤 영상 경로, 상자 함수)"""
    import numpy as np
    for nm in names:
        d = os.path.join(WORK, "jitter", nm)
        r = json.load(open(os.path.join(d, "result.json")))
        tr = json.load(open(os.path.join(d, "tracks.json")))
        def boxes(view, times, pad=0.12):
            T = np.array([f["t"] for f in tr[view]["frames"]]); P = np.array([f["p"] for f in tr[view]["frames"]], float)
            out = []
            for tt in times:
                q = P[int(np.argmin(np.abs(T - tt)))]
                m = q[:17, 2] > 0.3
                if m.sum() < 6:
                    out.append(None); continue
                x0, y0 = q[:17][m, :2].min(0); x1, y1 = q[:17][m, :2].max(0)
                mx, my = (x1 - x0) * pad + 8, (y1 - y0) * pad + 8
                out.append([float(x0 - mx), float(y0 - my), float(x1 + mx), float(y1 + my)])
            return out
        yield nm, r, os.path.join(WORK, "videos", f"{nm}_side.mov"), os.path.join(WORK, "videos", f"{nm}_back.mov"), boxes


@app.local_entrypoint()
def main(ps: str = "2,3,4,5,6,7,8,9,10,11,12,13,14,15,16"):
    out = os.path.join(WORK, "sil")
    os.makedirs(out, exist_ok=True)
    args = []
    if os.environ.get("LAB") == "1":
        for nm, r, sv, bv, boxes in lab_items(WORK, ps.split(",")):
            for view, vid, times in (("side", sv, r["t"]), ("back", bv, r["tBack"])):
                name = f"{nm}_{view}"
                if os.path.exists(os.path.join(out, name + ".npz")):
                    continue
                args.append((name, open(vid, "rb").read(), [float(x) for x in times], boxes(view, times)))
    else:
        for p in [int(x) for x in ps.split(",")]:
            r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
            if not r.get("ok"):
                continue
            for view, c, times in (("side", "1", r["t"]), ("back", "2", r["tBack"])):
                name = f"p{p:02d}_{view}"
                if os.path.exists(os.path.join(out, name + ".npz")):
                    continue
                vid = os.path.join(WORK, "..", "videos", f"투구{p:02d}_c{c}.mov")
                bx = boxes_of(os.path.join(WORK, "kp", f"투구{p:02d}_c{c}.npz"), times)
                args.append((name, open(vid, "rb").read(), [float(x) for x in times], bx))
    print(f"{len(args)}개 보냄", flush=True)
    for name, data, msg in segment.starmap(args, order_outputs=False):
        if data:
            open(os.path.join(out, name + ".npz"), "wb").write(data)
        print(name, msg, flush=True)
