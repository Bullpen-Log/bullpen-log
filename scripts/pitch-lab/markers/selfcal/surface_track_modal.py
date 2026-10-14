"""옷 표면 점 추적 — 허리 · 엉덩이 띠의 옷 점을 옆 · 뒤 영상에서 엔진 장면마다 따라간다(골반 회전을 옷 무늬로 재는 실험, 2026-10-14).

  (세션 폴더에서) modal run <저장소>/scripts/pitch-lab/markers/selfcal/surface_track_modal.py --ps 2,3,...
  → work/surf/pNN_side.npz · pNN_back.npz : q(질의 점 — 장면 번호 · x · y, 원본 픽셀), tr(장면 × 점 × 2), vis(장면 × 점), ref(기준 장면)

점 추적은 CoTracker3(facebookresearch/co-tracker, 비상업 조건) — 시험용. 제품으로 가면 같은 일을 하는 TAPIR 계열(Apache 2.0)로 바꾼다.
질의 점: 기준 장면(니업 0.17초쯤 전)에서 엉덩이 높이 띠(엉덩이 가운데 위 0.3 · 아래 0.12 몸통 길이) 안, 투수 윤곽(work/sil) 안.
마커 스티커(밝고 색 없는 작은 점) 둘레 14px · 앞 넙다리 둘레는 뺀다 — 스티커를 따라가면 반칙이다.
"""
import io, json, os

import modal

GPU_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "services", "pitch3d-gpu", "pitch3d_gpu")
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.5.1", "torchvision==0.20.1", extra_index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("av>=12", "numpy>=1.26", "opencv-python-headless==4.10.0.84", "huggingface_hub==0.26.2", "einops==0.8.0", "imageio==2.36.0")
    .run_commands("python -c \"import torch; torch.hub.load('facebookresearch/co-tracker', 'cotracker3_offline', trust_repo=True)\"")
    .add_local_dir(GPU_DIR, remote_path="/root/pitch3d_gpu")
    .add_local_file(os.path.join(GPU_DIR, "..", "..", "..", "lib", "pitch-3d", "v2", "joint-map.json"), "/root/engine/lib/pitch-3d/v2/joint-map.json")
)
app = modal.App("marker-surf-scratch", image=image)
WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))
GRID = 7
MAX_PTS = 260


@app.function(gpu="L4", timeout=1800, max_containers=10)
def track(name: str, data: bytes, times: list, ref: int, kp_ref: list, mask_ref: bytes, box: list, lead: str) -> tuple[str, bytes, str]:
    import sys, tempfile, time
    import av, cv2, numpy as np, torch
    sys.path.insert(0, "/root")
    from pitch3d_gpu.video import _frame_rotation, _upright, upright_turn

    t0 = time.time()
    path = os.path.join(tempfile.mkdtemp(), "v.mov")
    open(path, "wb").write(data)
    want = np.array(times)
    best = [None] * len(times)
    x0, y0, x1, y1 = box
    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
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
                    img = img if img is not None else _upright(f.to_ndarray(format="rgb24"), turn)[y0:y1, x0:x1]
                    best[j] = (float(d[j]), img)
    if any(b is None for b in best):
        return name, b"", "장면 못 찾음"
    vid = np.stack([b[1] for b in best])  # T H W 3
    # 질의 점
    kp = np.array(kp_ref, float)  # 25 × 3 (원본 픽셀)
    lsh, rsh, lhip, rhip = kp[1, :2], kp[2, :2], kp[7, :2], kp[8, :2]
    hm, sm = (lhip + rhip) / 2, (lsh + rsh) / 2
    tl = float(np.linalg.norm(sm - hm))
    m = np.load(io.BytesIO(mask_ref))
    M = np.unpackbits(m["mask"], axis=-1)[0, :, : int(m["shape"][2])].astype(bool)
    img = vid[ref]
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
    bright = ((hsv[..., 2] > 185) & (hsv[..., 1] < 60)).astype(np.uint8)
    n_c, lab, st, _ = cv2.connectedComponentsWithStats(bright)
    stick = np.zeros_like(bright)
    for i in range(1, n_c):
        if 3 <= st[i, cv2.CC_STAT_AREA] <= 500:
            stick[lab == i] = 1
    stick = cv2.dilate(stick, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 29)))
    kn = kp[9 if lead == "l" else 10, :2]
    hip_lead = lhip if lead == "l" else rhip
    pts = []
    for yy in range(int(hm[1] - 0.30 * tl), int(hm[1] + 0.12 * tl), GRID):
        for xx in range(int(x0), int(x1), GRID):
            ly, lx = yy - y0, xx - x0
            if not (0 <= ly < img.shape[0] and 0 <= lx < img.shape[1]):
                continue
            if not M[min(M.shape[0] - 1, yy // 2), min(M.shape[1] - 1, xx // 2)]:
                continue
            if stick[ly, lx]:
                continue
            # 앞 넙다리(엉덩이 → 무릎 선분) 둘레 빼기
            a, b, p = hip_lead, kn, np.array([xx, yy], float)
            u = np.clip(((p - a) @ (b - a)) / max((b - a) @ (b - a), 1e-6), 0, 1)
            if np.linalg.norm(p - (a + u * (b - a))) < 0.12 * tl and u > 0.25:
                continue
            pts.append([xx, yy])
    pts = np.array(pts, float)
    if len(pts) > MAX_PTS:
        pts = pts[np.random.default_rng(0).choice(len(pts), MAX_PTS, replace=False)]
    if len(pts) < 10:
        return name, b"", f"질의 점 부족 {len(pts)}"
    if not hasattr(track, "_m"):
        track._m = torch.hub.load("facebookresearch/co-tracker", "cotracker3_offline", trust_repo=True).cuda()
    model = track._m
    v = torch.from_numpy(vid).permute(0, 3, 1, 2)[None].float().cuda()
    q = torch.tensor([[ref, p[0] - x0, p[1] - y0] for p in pts], dtype=torch.float32)[None].cuda()
    with torch.no_grad():
        tr, vis = model(v, queries=q, backward_tracking=True)
    tr = tr[0].cpu().numpy() + np.array([x0, y0])
    vis = vis[0].cpu().numpy()
    buf = io.BytesIO()
    np.savez_compressed(buf, q=np.c_[np.full(len(pts), ref), pts], tr=tr.astype(np.float32), vis=vis, ref=ref, n_stick=int(stick.sum() > 0))
    return name, buf.getvalue(), f"{len(times)} 장면 · 점 {len(pts)} · 보인 비율 {vis.mean():.2f} · 자른 {x1 - x0}×{y1 - y0} · {time.time() - t0:.0f}초"


@app.local_entrypoint()
def main(ps: str = "2,3,4,5,6,7,8,9,10,11,12,13,14,15,16"):
    import numpy as np
    out = os.path.join(WORK, os.environ.get("SURF_DIR", "surf"))
    os.makedirs(out, exist_ok=True)
    args = []
    for p in [int(x) for x in ps.split(",")]:
        b = os.path.join(WORK, "bench", f"p{p:02d}")
        r = json.load(open(os.path.join(b, "result.json")))
        tr = json.load(open(os.path.join(b, "tracks.json")))
        if not r.get("ok"):
            continue
        ev = r["events"]
        # 기준 장면 = 다리를 들기 전(두 발이 땅에) — 니업 0.5초쯤 전. 다리를 드는 중이면 들어 올린 넙다리가 허리 띠에 들어와 점이 다리를 따라갔다(p14)
        ku = ev["kneeUp"] if ev["kneeUp"] is not None else ev["footPlant"] - 40
        ref = max(0, ku - 60)
        lead = "l" if r["hand"] == "R" else "r"
        for view, c, tk in (("side", "1", "t"), ("back", "2", "tBack")):
            name = f"p{p:02d}_{view}"
            if os.path.exists(os.path.join(out, name + ".npz")):
                continue
            sil = np.load(os.path.join(WORK, "sil", f"{name}.npz"))
            shp = tuple(sil["shape"])
            Ms = np.unpackbits(sil["mask"], axis=-1)[..., : shp[2]].astype(bool)
            ys, xs = np.nonzero(Ms.any(0))
            W, H = [int(v) for v in sil["wh"]]
            box = [int(max(0, xs.min() * 2 - 30)), int(max(0, ys.min() * 2 - 30)), int(min(W, xs.max() * 2 + 30)), int(min(H, ys.max() * 2 + 30))]
            buf = io.BytesIO()
            np.savez_compressed(buf, mask=np.packbits(Ms[ref:ref + 1], axis=-1), shape=np.array([1, *shp[1:]]))
            T = np.array([f["t"] for f in tr[view]["frames"]])
            kp = tr[view]["frames"][int(np.argmin(np.abs(T - r[tk][ref])))]["p"]
            vid = os.path.join(WORK, "..", "videos", f"투구{p:02d}_c{c}.mov")
            args.append((name, open(vid, "rb").read(), [float(x) for x in r[tk]], ref, kp, buf.getvalue(), box, lead))
    print(f"{len(args)}개 보냄", flush=True)
    for name, data, msg in track.starmap(args, order_outputs=False):
        if data:
            open(os.path.join(out, name + ".npz"), "wb").write(data)
        print(name, msg, flush=True)
