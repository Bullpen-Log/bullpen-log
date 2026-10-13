"""두 영상 윤곽으로 몸(MHR)을 맞춰 골반 방향을 잰다 — A안 실험(2026-10-14 김민: "상하체 분리는 꼭 필요 · 사람처럼 보게").

  (세션 폴더에서) modal run <저장소>/scripts/pitch-lab/markers/selfcal/bodyfit_modal.py --ps 2,3,...
  → work/bodyfit/pNN.npz : hip_c(SAM 3D 한 장 그대로, C안) · hip_a(두 영상 맞춤, A안) — 엔진 좌표의 오른쪽 → 왼쪽 엉덩이(장면 × 3, 못 잰 장면 NaN)
     채점: PELVIS_ALT=<폴더> python pelvis_score.py 2,... (폴더에 hip 하나씩 — split 스크립트로 나눈다)

장면마다
  1 옆 영상 그림에 SAM 3D Body(엔진 옆 카메라 초점) → 몸 각도값(전역 회전 · 몸 자세 · 모양 · 크기) — 출발점
  2 엔진 좌표로 옮김(옆 카메라) + 잘 보이는 관절(어깨 · 무릎 · 발목)로 위치 · 크기 맞춤
  3 몸 각도값을 고쳐 가며(미분) 두 영상에 비춘 몸이 SAM 2 윤곽(work/sil) 안에 들고 윤곽 테두리를 덮게 + 2D 관절(엉덩이는 뺌)에 맞게
    + 처음 자세 근처 · 시간으로 매끈. 엉덩이 2D 점은 일부러 안 쓴다 — 그게 틀려서 하는 일이다
"""
import io, json, os, sys

import modal

GPU_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "services", "pitch3d-gpu", "pitch3d_gpu")
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.5.1", "torchvision==0.20.1", extra_index_url="https://download.pytorch.org/whl/cu124")
    .pip_install(
        "av>=12", "numpy>=1.26", "opencv-python-headless==4.10.0.84", "huggingface_hub==0.26.2",
        "pytorch-lightning==2.4.0", "timm==1.0.11", "einops==0.8.0", "yacs==0.1.8", "roma==1.5.1",
        "omegaconf==2.3.0", "braceexpand==0.1.7",
    )
    .run_commands(
        "git clone https://github.com/facebookresearch/sam-3d-body.git /opt/sam-3d-body",
        "cd /opt/sam-3d-body && git checkout b5c765a0d89d789985e186d396315e7590887b94",
    )
    .env({"HF_HOME": "/cache/hf", "MOMENTUM_ENABLED": "0"})
    .add_local_dir(GPU_DIR, remote_path="/root/pitch3d_gpu")
    .add_local_file(os.path.join(GPU_DIR, "..", "..", "..", "lib", "pitch-3d", "v2", "joint-map.json"), "/root/engine/lib/pitch-3d/v2/joint-map.json")
)
app = modal.App("marker-bodyfit-scratch", image=image)
hf_cache = modal.Volume.from_name("bullpen-pitch3d-hf", create_if_missing=True)
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))

# 2D 관절 맞춤에 쓰는 관절 — 엉덩이(틀리는 점) · 귀 · 손가락은 뺀다
KP_NAMES = ["nose", "lSh", "rSh", "lEl", "rEl", "lWr", "rWr", "lKn", "rKn", "lAn", "rAn", "lHe", "rHe", "lTo", "rTo"]
# 위치 · 크기를 맞출 3D 관절(엔진이 잘 맞히는 것)
ANCHOR = ["lSh", "rSh", "lKn", "rKn", "lAn", "rAn"]
STEPS = int(os.environ.get("BODYFIT_STEPS", "300"))
N_VERT = 2500
TAU = float(os.environ.get("BODYFIT_TAU", "0.4"))


@app.function(gpu="L4", timeout=3600, max_containers=8, volumes={"/cache/hf": hf_cache},
              secrets=[modal.Secret.from_name("huggingface", required_keys=["HF_TOKEN"])], memory=32768)
def fit(name: str, side_video: bytes, result: dict, tracks: dict, sil_side: bytes, sil_back: bytes, w: dict) -> tuple[str, bytes, str]:
    import contextlib, tempfile, time
    import av, cv2, numpy as np, torch, roma
    sys.path.insert(0, "/opt/sam-3d-body")
    sys.path.insert(0, "/root")
    from pitch3d_gpu.video import _frame_rotation, _upright, upright_turn
    from pitch3d_gpu import sam3d

    t0 = time.time()
    dev = "cuda"
    names = sam3d.MHR
    v2 = [j["name"] for j in json.load(open("/root/pitch3d_gpu/joint-map.json"))["joints"]] if os.path.exists("/root/pitch3d_gpu/joint-map.json") else None
    if v2 is None:
        v2 = ["nose", "lSh", "rSh", "lEl", "rEl", "lWr", "rWr", "lHip", "rHip", "lKn", "rKn", "lAn", "rAn", "lHe", "rHe", "lTo", "rTo",
              "lEar", "rEar", "lHandMid", "rHandMid", "lHandIdx", "rHandIdx", "lHandPinky", "rHandPinky"]
    IX = {n: i for i, n in enumerate(v2)}
    times = np.array(result["t"])
    n = len(times)
    J = np.array(result["joints"], float) / 1000.0
    cams = {}
    for view in ("side", "back"):
        c = result["cameras"][view]
        cams[view] = dict(R=torch.tensor(c["R"], dtype=torch.float32, device=dev).reshape(3, 3),
                          t=torch.tensor(c["t"], dtype=torch.float32, device=dev), f=float(c["f"]), cx=float(c["cx"]), cy=float(c["cy"]))

    # 1 옆 그림
    path = os.path.join(tempfile.mkdtemp(), "v.mov")
    open(path, "wb").write(side_video)
    best = [None] * n
    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
        turn = None
        for f in c.decode(s):
            ts = float(f.pts * s.time_base)
            d = np.abs(times - ts)
            js = np.nonzero(d < 0.006)[0]
            if not len(js):
                continue
            if turn is None:
                turn = upright_turn(_frame_rotation(f))
            img = None
            for j in js:
                if best[j] is None or d[j] < best[j][0]:
                    img = img if img is not None else _upright(f.to_ndarray(format="bgr24"), turn)
                    best[j] = (float(d[j]), img)

    # 2D 관절(엔진 장면 시각에 가장 가까운 트랙 장면)
    def kp_at(view, tlist):
        T = np.array([fr["t"] for fr in tracks[view]["frames"]])
        P = np.array([fr["p"] for fr in tracks[view]["frames"]], float)
        return np.stack([P[int(np.argmin(np.abs(T - tt)))] for tt in tlist])

    kp = {"side": kp_at("side", result["t"]), "back": kp_at("back", result["tBack"])}

    # SAM 3D 출발점
    est = sam3d._load()
    if est is None:
        return name, b"", "SAM 3D 못 올림"
    cs = result["cameras"]["side"]
    K = torch.tensor([[[cs["f"], 0, cs["cx"]], [0, cs["f"], cs["cy"]], [0, 0, 1]]], dtype=torch.float32)
    par = [None] * n
    for k in range(n):
        if best[k] is None:
            continue
        pts = kp["side"][k]
        m = pts[:, 2] >= 0.3
        if m.sum() < 6:
            continue
        x0, y0 = pts[m, :2].min(0)
        x1, y1 = pts[m, :2].max(0)
        box = [x0 - (x1 - x0) * 0.2 - 20, y0 - (y1 - y0) * 0.15 - 20, x1 + (x1 - x0) * 0.2 + 20, y1 + (y1 - y0) * 0.15 + 20]
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                o = est.process_one_image(best[k][1][:, :, ::-1].copy(), bboxes=np.array([box], np.float32), cam_int=K, inference_type="body")
        except Exception:
            continue
        if o:
            par[k] = o[0]
    ok = [k for k in range(n) if par[k] is not None]
    if len(ok) < n * 0.5:
        return name, b"", f"SAM 3D 장면 부족 {len(ok)}/{n}"
    for k in range(n):  # 빈 장면은 가장 가까운 장면으로
        if par[k] is None:
            par[k] = par[min(ok, key=lambda q: abs(q - k))]
    T = lambda key: torch.tensor(np.stack([np.asarray(par[k][key], np.float32) for k in range(n)]), device=dev)
    rot0 = roma.euler_to_rotmat("ZYX", T("global_rot"))
    pose0 = T("body_pose_params")[:, :130]
    hand = T("hand_pose_params")
    scale = T("scale_params").median(0).values[None].expand(n, -1).contiguous()
    shape = T("shape_params").median(0).values[None].expand(n, -1).contiguous()
    camt = T("pred_cam_t")
    head = est.model.head_pose
    for p_ in head.parameters():
        p_.requires_grad_(False)
    faces_n = None

    def body(rot, pose):
        out = head.mhr_forward(global_trans=torch.zeros(n, 3, device=dev), global_rot=roma.rotmat_to_euler("ZYX", rot),
                               body_pose_params=pose, hand_pose_params=hand, scale_params=scale, shape_params=shape,
                               expr_params=torch.zeros(n, 72, device=dev),
                               return_keypoints=True)
        verts, kps = out
        flip = torch.tensor([1.0, -1.0, -1.0], device=dev)
        return verts * flip, kps[:, :70] * flip  # 카메라 좌표(옆 카메라, 몸 원점 기준)

    mhr_ix = torch.tensor([names[nm] for nm in v2], device=dev)
    Rs, ts_ = cams["side"]["R"], cams["side"]["t"]

    def to_world(x_cam):  # (n, m, 3) 옆 카메라 → 엔진 좌표
        return (x_cam - ts_) @ Rs  # Rᵀ(x − t)

    with torch.no_grad():
        v0, k0 = body(rot0, pose0)
        kw0 = to_world(k0 + camt[:, None])
        k25_0 = kw0[:, mhr_ix]
    # 위치 · 크기: 잘 보이는 관절(엔진)과 장면마다 옮김, 클립 하나 크기
    Jt = torch.tensor(J, dtype=torch.float32, device=dev)
    an = torch.tensor([IX[a] for a in ANCHOR], device=dev)
    A0 = k25_0[:, an]
    B0 = Jt[:, an]
    ca, cb = A0.mean(1, keepdim=True), B0.mean(1, keepdim=True)
    sc0 = float(((B0 - cb).norm(dim=-1).mean() / (A0 - ca).norm(dim=-1).mean()).item())

    # 윤곽 · 거리 지도
    GH, GW = 128, 96  # 장면마다 윤곽 상자를 이 격자로 줄여 견준다(가로 · 세로 따로 늘림 — 그린 몸과 윤곽이 같은 변환이라 괜찮다)

    def sil_maps(raw, view):
        """장면마다 (상자 x0 y0 x1 y1 — 원본 픽셀, 격자로 줄인 윤곽 0~1)"""
        z = np.load(io.BytesIO(raw))
        shp = tuple(z["shape"])
        M = np.unpackbits(z["mask"], axis=-1)[..., : shp[2]].astype(np.uint8)
        boxes, tgt = [], []
        for k in range(len(M)):
            ys, xs = np.nonzero(M[k])
            if len(xs) < 50:
                boxes.append([0, 0, 1, 1]); tgt.append(np.zeros((GH, GW), np.float32)); continue
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            px, py = (x1 - x0) * 0.08 + 4, (y1 - y0) * 0.08 + 4
            x0, x1, y0, y1 = int(max(0, x0 - px)), int(min(M.shape[2], x1 + px)), int(max(0, y0 - py)), int(min(M.shape[1], y1 + py))
            tgt.append(cv2.resize(M[k, y0:y1, x0:x1].astype(np.float32), (GW, GH), interpolation=cv2.INTER_AREA))
            boxes.append([x0 * 2, y0 * 2, x1 * 2, y1 * 2])
        return torch.tensor(np.array(boxes, np.float32), device=dev), torch.tensor(np.stack(tgt), device=dev)

    blur = torch.tensor([[1, 2, 1], [2, 4, 2], [1, 2, 1]], dtype=torch.float32, device=dev)[None, None] / 16

    def render(uv, box):
        """몸 겉점(픽셀) → 격자 위 부드러운 윤곽 0~1(점을 네 칸에 나눠 쌓고 흐린 뒤 1 − exp)"""
        gx = (uv[..., 0] - box[:, None, 0]) / (box[:, None, 2] - box[:, None, 0]) * GW - 0.5
        gy = (uv[..., 1] - box[:, None, 1]) / (box[:, None, 3] - box[:, None, 1]) * GH - 0.5
        x0f, y0f = gx.floor(), gy.floor()
        fx, fy = gx - x0f, gy - y0f
        dens = torch.zeros(uv.shape[0], GH * GW, device=dev)
        for dx, dy, wgt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            xi, yi = x0f.long() + dx, y0f.long() + dy
            ok_ = (xi >= 0) & (xi < GW) & (yi >= 0) & (yi < GH)
            dens = dens.scatter_add(1, (yi.clamp(0, GH - 1) * GW + xi.clamp(0, GW - 1)), wgt * ok_)
        dens = torch.nn.functional.conv2d(dens.view(-1, 1, GH, GW), blur, padding=1)[:, 0]
        return 1 - torch.exp(-dens / TAU)

    sil = {"side": sil_maps(sil_side, "side"), "back": sil_maps(sil_back, "back")}

    def project(view, X):  # (n, m, 3) 엔진 좌표 → 픽셀
        c = cams[view]
        x = X @ c["R"].T + c["t"]
        z = x[..., 2].clamp(min=0.05)
        return torch.stack([c["f"] * x[..., 0] / z + c["cx"], c["f"] * x[..., 1] / z + c["cy"]], -1)

    hpx = {}
    for view in ("side", "back"):
        P = kp[view]
        hs = [np.ptp(P[k, P[k, :, 2] >= 0.3, 1]) for k in range(n) if (P[k, :, 2] >= 0.3).sum() >= 6]
        hpx[view] = float(np.median(hs)) if hs else 500.0
    kp_ix = torch.tensor([IX[a] for a in KP_NAMES], device=dev)
    kpt = {v: torch.tensor(kp[v], dtype=torch.float32, device=dev)[:, kp_ix] for v in kp}
    vsel = torch.tensor(np.random.default_rng(1).choice(v0.shape[1], N_VERT, replace=False), device=dev)

    # 변수: 전역 회전 고침(축각) · 자세 고침 · 장면 위치 · 클립 크기
    dR = torch.zeros(n, 3, device=dev, requires_grad=True)
    dP = torch.zeros(n, 130, device=dev, requires_grad=True)
    # 위치: 앵커 관절 가운데가 장면마다 tr 에 오게, 크기는 클립 하나(처음 = 엔진 앵커에 맞춘 값)
    tr = cb.squeeze(1).clone().requires_grad_(True)
    ls = torch.tensor(float(np.log(sc0)), device=dev, requires_grad=True)
    opt = torch.optim.Adam([{"params": [dR], "lr": 0.01}, {"params": [dP], "lr": 0.01}, {"params": [tr, ls], "lr": 0.005}])

    def placed(dR_, dP_):
        rot = roma.rotvec_to_rotmat(dR_) @ rot0
        v, k_ = body(rot, pose0 + dP_)
        vw = to_world(v + camt[:, None])
        k25 = to_world(k_ + camt[:, None])[:, mhr_ix]
        cen = k25[:, an].mean(1, keepdim=True)
        s_ = ls.exp()
        return (vw - cen) * s_ + tr[:, None], (k25 - cen) * s_ + tr[:, None]

    def gs(dt, uv):  # 거리 지도에서 값 읽기(가로세로 반 해상도)
        H, W_ = dt.shape[-2:]
        g = torch.stack([uv[..., 0] / 2 / (W_ - 1) * 2 - 1, uv[..., 1] / 2 / (H - 1) * 2 - 1], -1)
        return torch.nn.functional.grid_sample(dt, g[:, None], align_corners=True, padding_mode="border")[:, 0, 0]

    log = []
    for it in range(STEPS):
        vw, k25 = placed(dR, dP)
        loss = 0.0
        parts = {}
        for view in ("side", "back"):
            box, tg = sil[view]
            occ = render(project(view, vw), box)
            inter = (occ * tg).sum((1, 2))
            iou = inter / (occ.sum((1, 2)) + tg.sum((1, 2)) - inter).clamp(min=1)
            sl = (1 - iou).mean()
            kuv = project(view, k25[:, kp_ix])
            kv = kpt[view]
            wk = (kv[..., 2] >= 0.3).float() * kv[..., 2]
            kl = (torch.nn.functional.huber_loss(kuv, kv[..., :2], delta=8.0, reduction="none").sum(-1) * wk).sum() / wk.sum().clamp(min=1) / hpx[view]
            parts[view] = (sl.item(), kl.item())
            loss = loss + w["sil"] * sl + w["kp"] * kl
        anchor = (k25[:, an] - Jt[:, an]).norm(dim=-1).mean()
        prior = (dP ** 2).mean() + (dR ** 2).mean()
        smooth = ((dP[2:] - 2 * dP[1:-1] + dP[:-2]) ** 2).mean() + ((dR[2:] - 2 * dR[1:-1] + dR[:-2]) ** 2).mean() + ((tr[2:] - 2 * tr[1:-1] + tr[:-2]) ** 2).mean() * 100
        loss = loss + w["anchor"] * anchor + w["prior"] * prior + w["smooth"] * smooth
        opt.zero_grad()
        loss.backward()
        opt.step()
        if it in (0, STEPS // 2, STEPS - 1):
            log.append(f"{it}: 옆 1−IoU {parts['side'][0]:.3f} 점 {parts['side'][1]:.3f} · 뒤 1−IoU {parts['back'][0]:.3f} 점 {parts['back'][1]:.3f} · 3D {anchor.item()*100:.1f}cm")
    with torch.no_grad():
        _, kA = placed(dR, dP)
        _, kC = placed(torch.zeros_like(dR), torch.zeros_like(dP))
    hip = lambda K_: (K_[:, IX["lHip"]] - K_[:, IX["rHip"]]).cpu().numpy()
    buf = io.BytesIO()
    np.savez_compressed(buf, hip_c=hip(kC), hip_a=hip(kA), k25_a=kA.cpu().numpy(), k25_c=kC.cpu().numpy(), sam_ok=np.array(ok))
    return name, buf.getvalue(), f"SAM {len(ok)}/{n} · " + " | ".join(log) + f" · {time.time() - t0:.0f}초"


@app.local_entrypoint()
def main(ps: str = "2,3,4,5,6,7,8,9,10,11,12,13,14,15,16", out: str = "bodyfit", sil: float = 5.0,
         kp: float = 1.0, anchor: float = 1.0, prior: float = 0.1, smooth: float = 10.0):
    od = os.path.join(WORK, out)
    os.makedirs(od, exist_ok=True)
    w = dict(sil=sil, kp=kp, anchor=anchor, prior=prior, smooth=smooth)
    args = []
    if os.environ.get("LAB") == "1":
        for nm in ps.split(","):
            d = os.path.join(WORK, "jitter", nm)
            r = json.load(open(os.path.join(d, "result.json")))
            sp, bp = (os.path.join(WORK, "sil", f"{nm}_{v}.npz") for v in ("side", "back"))
            if not r.get("ok") or not os.path.exists(sp) or not os.path.exists(bp):
                continue
            args.append((nm, open(os.path.join(WORK, "videos", f"{nm}_side.mov"), "rb").read(), r, json.load(open(os.path.join(d, "tracks.json"))), open(sp, "rb").read(), open(bp, "rb").read(), w))
    else:
      for p in [int(x) for x in ps.split(",")]:
        b = os.path.join(WORK, "bench", f"p{p:02d}")
        r = json.load(open(os.path.join(b, "result.json")))
        sp, bp = (os.path.join(WORK, "sil", f"p{p:02d}_{v}.npz") for v in ("side", "back"))
        if not r.get("ok") or not os.path.exists(sp) or not os.path.exists(bp):
            continue
        vid = os.path.join(WORK, "..", "videos", f"투구{p:02d}_c1.mov")
        args.append((f"p{p:02d}", open(vid, "rb").read(), r, json.load(open(os.path.join(b, "tracks.json"))), open(sp, "rb").read(), open(bp, "rb").read(), w))
    print(f"{len(args)}개 보냄 · {w}", flush=True)
    for name, data, msg in fit.starmap(args, order_outputs=False):
        if data:
            open(os.path.join(od, name + ".npz"), "wb").write(data)
        print(name, msg, flush=True)
