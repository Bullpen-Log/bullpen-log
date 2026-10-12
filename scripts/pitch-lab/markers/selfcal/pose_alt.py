"""다른 2D 관절 모델 비교 — 마커 영상 64개(볼륨 marker-videos-scratch)에 같은 사람 상자(RTMW 몸 17점에서)로.

  먼저 영상을 볼륨에: modal volume create marker-videos-scratch → 영상마다 modal volume put marker-videos-scratch <영상> /<이름>.mov
  (세션 폴더에서) modal run <저장소>/scripts/pitch-lab/markers/selfcal/pose_alt.py --model rtmpose|vitpose [--pattern 투구02_]
  끝나면 modal volume delete marker-videos-scratch (몸 · 위치 정보가 든 영상이다)
  → work/kp_<model>/투구NN_cK.npz (t · kp(N×K×2) · sc(N×K) · wh)  — 모델 그대로의 점 · 점수(합치기 · 점수 맞추기는 로컬에서)

rtmpose = RTMPose-x body7 halpe26 384×288(rtmlib 'performance' 의 몸+발), vitpose = ViTPose++-H(transformers, COCO 머리 dataset_index 0).
"""
import io, os, sys, glob

import modal

if modal.is_local():
    # 분석 서버 이미지의 앞부분과 같은 층(캐시) + transformers — 서버 이미지는 끝에 로컬 파일을 붙여 뒤에 설치를 더할 수 없다
    image = (
        modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
        .apt_install("ffmpeg", "curl", "ca-certificates", "gnupg", "libgl1", "libglib2.0-0")
        .pip_install("rtmlib>=0.0.13", "av>=12", "numpy>=1.26", "requests>=2.31")
        .run_commands("pip uninstall -y onnxruntime onnxruntime-gpu", "pip install onnxruntime-gpu==1.21.1")
        .pip_install("torch==2.5.1", "torchvision==0.20.1", extra_index_url="https://download.pytorch.org/whl/cu124")
        .pip_install("transformers==4.49.0", "scipy==1.14.1", "huggingface_hub>=0.26,<1", "opencv-python-headless==4.10.0.84")
        # Sapiens 의 상자 자르기 · UDP 풀기(github.com/facebookresearch/sapiens lite/demo/pose_utils.py, 그대로)
        .add_local_file(os.environ.get("SAPIENS_UTILS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "sapiens_pose_utils.py")), "/root/sapiens_pose_utils.py")
    )
else:
    image = None

vol = modal.Volume.from_name("marker-videos-scratch")
app = modal.App("marker-pose-alt-scratch", image=image)
WORK = os.path.join(os.getcwd(), "work")
SAPIENS = ("facebook/sapiens-pose-1b-torchscript", "sapiens_1b_goliath_best_goliath_AP_639_torchscript.pt2")
# Sapiens 308점 → COCO-WholeBody 133 번호(몸 · 발 · 손목 · 손 MCP 셋 — 엔진이 쓰는 것만)
SAP_PAIRS = [(0, 0), (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6), (7, 7), (8, 8), (62, 9), (41, 10), (9, 11), (10, 12), (11, 13), (12, 14),
             (13, 15), (14, 16), (15, 17), (16, 18), (17, 19), (18, 20), (19, 21), (20, 22), (62, 91), (49, 96), (53, 100), (61, 108),
             (41, 112), (28, 117), (32, 121), (40, 129)]
SAP_IDX = sorted({a for a, _ in SAP_PAIRS})  # 결과 npz 의 점 차례(Sapiens 번호 오름차순)
HALPE = "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-x_simcc-body7_pt-body7-halpe26_700e-384x288-7fb6e239_20230606.zip"


def boxes_of(kp, sc, w, h):
    """RTMW 몸 17점 → 사람 상자(pose_modal 과 같은 여유: 25% + 10px). 못 찾은 장면은 None"""
    out = []
    for i in range(len(kp)):
        if float(sc[i, :17].mean()) < 1e-6:
            out.append(None)
            continue
        b = kp[i, :17]
        x0, y0 = b.min(0)
        x1, y1 = b.max(0)
        mx, my = (x1 - x0) * 0.25 + 10, (y1 - y0) * 0.25 + 10
        out.append([max(0.0, x0 - mx), max(0.0, y0 - my), min(float(w), x1 + mx), min(float(h), y1 + my)])
    return out


@app.function(gpu="L4", timeout=1800, max_containers=16, volumes={"/vid": vol})
def run(name: str, model: str, rtmw: bytes) -> tuple[str, bytes, str]:
    import time
    import av
    import numpy as np
    import cv2

    def upright_turn(rot):  # services/pitch3d-gpu/pitch3d_gpu/video.py 와 같다
        return 0 if not rot else int(round(-float(rot) / 90.0)) % 4 * 90

    def _frame_rotation(f):
        try:
            return float(getattr(f, "rotation", 0) or 0)
        except Exception:
            return 0.0

    def _upright(img, turn):
        return img if turn == 0 else cv2.rotate(img, {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}[turn])

    z = np.load(io.BytesIO(rtmw))
    t_ref = z["t"]
    W, H = [int(v) for v in z["wh"]]
    boxes = boxes_of(z["kp"], z["sc"], W, H)
    t0 = time.time()
    if model == "rtmpose":
        from rtmlib import RTMPose
        m = RTMPose(onnx_model=HALPE, model_input_size=(288, 384), backend="onnxruntime", device="cuda")
    elif model == "vitpose":
        import torch
        from transformers import AutoProcessor, VitPoseForPoseEstimation
        proc = AutoProcessor.from_pretrained("usyd-community/vitpose-plus-huge")
        net = VitPoseForPoseEstimation.from_pretrained("usyd-community/vitpose-plus-huge").to("cuda").eval().half()
    ts, kps, scs, batch = [], [], [], []

    def flush():
        if not batch:
            return
        imgs = [b[1] for b in batch]
        bx = [[[b[2][0], b[2][1], b[2][2] - b[2][0], b[2][3] - b[2][1]]] for b in batch]  # xywh
        inp = proc(imgs, boxes=bx, return_tensors="pt").to("cuda")
        inp["pixel_values"] = inp["pixel_values"].half()
        with torch.no_grad():
            o = net(**inp, dataset_index=torch.zeros(len(batch), dtype=torch.long, device="cuda"))
        o.heatmaps = o.heatmaps.float()
        res = proc.post_process_pose_estimation(o, boxes=bx)
        for (k, _, _), r in zip(batch, res):
            kps[k] = r[0]["keypoints"].cpu().numpy().astype(np.float32)
            scs[k] = r[0]["scores"].cpu().numpy().astype(np.float32)
        batch.clear()

    if model == "sapiens":
        import torch
        from huggingface_hub import hf_hub_download
        sys.path.insert(0, "/root")
        from sapiens_pose_utils import top_down_affine_transform, udp_decode
        ckpt = hf_hub_download(*SAPIENS, cache_dir="/vid/hf")
        net = torch.jit.load(ckpt).eval().cuda()
        mean = torch.tensor([123.5, 116.5, 103.5]).view(-1, 1, 1)
        std = torch.tensor([58.5, 57.0, 57.5]).view(-1, 1, 1)

        def flush():
            if not batch:
                return
            xs, cs, ss = [], [], []
            for _, img, bx in batch:
                crop, c0, s0 = top_down_affine_transform(img.copy(), np.array(bx, np.float32))
                crop = cv2.resize(crop, (768, 1024), interpolation=cv2.INTER_LINEAR).transpose(2, 0, 1)
                t_ = torch.from_numpy(crop)[[2, 1, 0], ...].float()
                xs.append((t_ - mean) / std)
                cs.append(c0[0]); ss.append(s0[0])
            with torch.no_grad(), torch.autocast(device_type="cuda", dtype=torch.bfloat16):
                hm = net(torch.stack(xs).cuda())
            hm = hm[:, SAP_IDX].float().cpu().numpy()
            for (k, _, _), h, c0, s0 in zip(batch, hm, cs, ss):
                kp_, sc_ = udp_decode(h, (768, 1024), (192, 256))  # (폭, 높이) — 데모 vis_pose.py 와 같다
                kp_ = (kp_ / np.array([768, 1024])) * s0 + c0 - 0.5 * s0
                kps[k], scs[k] = kp_[0].astype(np.float32), sc_[0].astype(np.float32)
            batch.clear()

    K = 26 if model == "rtmpose" else 17 if model == "vitpose" else len(SAP_IDX)
    with av.open(f"/vid/{name}.mov", options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
        s.thread_type = "AUTO"
        turn = None
        for i, f in enumerate(c.decode(s)):
            if turn is None:
                turn = upright_turn(_frame_rotation(f))
            t = float(f.pts * s.time_base)
            ts.append(t)
            kps.append(np.zeros((K, 2), np.float32))
            scs.append(np.zeros(K, np.float32))
            j = int(np.argmin(np.abs(t_ref - t)))
            if abs(t_ref[j] - t) > 1e-3 or boxes[j] is None:
                continue
            img = _upright(f.to_ndarray(format="bgr24"), turn)
            if model == "rtmpose":
                kp, sc = m(img, bboxes=[boxes[j]])
                kps[-1], scs[-1] = kp[0].astype(np.float32), sc[0].astype(np.float32)
            else:
                batch.append((len(ts) - 1, img if model == "sapiens" else img[:, :, ::-1].copy(), boxes[j]))
                if len(batch) >= (8 if model == "sapiens" else 32):
                    flush()
    if model != "rtmpose":
        flush()
    if model == "sapiens":
        vol.commit()
    buf = io.BytesIO()
    np.savez_compressed(buf, t=np.array(ts), kp=np.array(kps), sc=np.array(scs), wh=np.array([W, H]))
    return name, buf.getvalue(), f"{len(ts)} 장면 · {time.time() - t0:.0f}초"


@app.function(timeout=1800, volumes={"/vid": vol})
def fetch() -> str:
    from huggingface_hub import hf_hub_download
    p = hf_hub_download(*SAPIENS, cache_dir="/vid/hf")
    vol.commit()
    return f"Sapiens 무게 {os.path.getsize(p) / 1e9:.1f}GB"


@app.local_entrypoint()
def main(model: str, pattern: str = ""):
    out = os.path.join(WORK, f"kp_{model}")
    os.makedirs(out, exist_ok=True)
    names = sorted(os.path.splitext(os.path.basename(v))[0] for v in glob.glob(os.path.join(WORK, "kp", "*.npz")))
    todo = [n for n in names if pattern in n and not os.path.exists(os.path.join(out, n + ".npz"))]
    print(f"{len(todo)}개 보냄", flush=True)
    args = [(n, model, open(os.path.join(WORK, "kp", n + ".npz"), "rb").read()) for n in todo]
    if model == "sapiens":  # 무게 4GB 를 볼륨에 한 번만 받아 둔다(컨테이너 여럿이 같이 받지 않게)
        print(fetch.remote(), flush=True)
    for name, data, msg in run.starmap(args, order_outputs=False):
        open(os.path.join(out, name + ".npz"), "wb").write(data)
        print(name, msg, flush=True)
