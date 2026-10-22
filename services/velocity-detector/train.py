"""공 감지 학습 모델 1판 — Modal GPU 에서 학습 · 평가 · 내보내기(엔진 2.7 계획 5단계).

    modal volume put bullpen-ball-detector-data <자료 폴더> /detector-v1      # build-dataset.mjs 가 만든 images/ · labels.json
    modal run train.py --epochs 1 --limit 12                                 # 연기 시험(1~2분)
    modal run train.py                                                       # 본 학습(T4, 15분쯤)
    modal volume get bullpen-ball-detector-data /out/v1 <받을 폴더>           # 무게(.pt) · ONNX · 평가 JSON

모양: MobileNetV3-small(ImageNet 무게, BSD) 앞 넷 조각(걸음 8) + 작은 머리 → 걸음 4 열지도(공 중심) · 크기(지름 log). CenterNet 꼴 초점 손실.
입력 3채널 = 연속 세 장면의 밝기(t−2 · t−1 · t) — 움직이는 공이 '색'으로 드러나 그물코 · 흰 기둥과 갈린다(1판 선택, 한 장면 입력은 2판에서 견줌).
라벨은 엔진이 믿은 공 자리라 완벽하지 않다(중심 ±1px · 지름은 덩어리 1.16배). 평가는 클립 단위로 떼어 둔 20%(날짜별 고르게) — 장면마다
'가장 센 봉우리가 라벨 지름(최소 6px) 안인가'(재현율) · 공 없는 장면에서 문턱을 넘는 봉우리(헛 알림).
"""

from __future__ import annotations

import json
import math
import os
import random
import time

import modal

APP_NAME = "bullpen-ball-detector"
DATA = "/data"
GPU = os.environ.get("BALL_DETECTOR_GPU", "T4")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    .pip_install("pillow>=10", "numpy>=1.26", "onnx>=1.16", "onnxscript>=0.1")
    # ImageNet 무게를 이미지에 받아 둔다(학습 때 내려받지 않게)
    .run_commands(
        "python -c \"import torchvision; torchvision.models.mobilenet_v3_small(weights='IMAGENET1K_V1')\""
    )
)
app = modal.App(APP_NAME, image=image)
vol = modal.Volume.from_name(f"{APP_NAME}-data", create_if_missing=True)

# ───────────────────────── 자료 ─────────────────────────

CROP = 384  # 학습 조각 한 변(px) — 그림은 긴 변 960
STRIDE = 4
MIN_R = 6.0  # 맞았다고 볼 반지름 바닥(px) — 먼 공 지름 6px 쯤
SIZE_NB = 0  # 크기 감독 칸 반경 — 0 이면 가운데 한 칸(1판), 1 이면 3×3(3판, train(size_nb=1))


def load_labels(root: str):
    with open(os.path.join(root, "labels.json"), encoding="utf-8") as f:
        return json.load(f)


def split_clips(clips, test_frac=0.2, seed=7):
    """날짜마다 고르게 클립 20% 를 시험용으로 — 같은 클립의 장면이 양쪽에 섞이지 않게"""
    rng = random.Random(seed)
    by_date: dict[str, list] = {}
    for c in clips:
        by_date.setdefault(c["date"], []).append(c)
    train, test = [], []
    for date, cs in sorted(by_date.items()):
        cs = sorted(cs, key=lambda c: c["id"])
        rng.shuffle(cs)
        k = max(1, round(len(cs) * test_frac)) if len(cs) >= 3 else 0
        test += cs[:k]
        train += cs[k:]
    return train, test


def split_groups(clips, test_groups: str):
    """3판 — 그룹(날짜 · 녹화)째 떼어 시험. 같은 자리 · 같은 빛의 공이 양쪽에 섞이면 크기를 외워 버린다"""
    want = {g for g in test_groups.split(",") if g}
    test = [c for c in clips if c.get("group", c["date"]) in want]
    return [c for c in clips if c not in test], test


def samples_of(clips, root: str):
    """장면 하나 = (그림 셋 경로(t−2 · t−1 · t), 공 [x, y, d] 또는 None). 앞 두 장면이 없는 첫 둘은 뺀다.
    3판의 skip 장면(라벨을 맞추다 공 길 밖으로 밀린 끝 장면 — 공이 있는지 모른다)도 뺀다"""
    out = []
    for c in clips:
        fr = c["frames"]
        for i in range(2, len(fr)):
            if fr[i].get("skip"):
                continue
            paths = [os.path.join(root, "images", c["id"], fr[j]["file"]) for j in (i - 2, i - 1, i)]
            out.append({"paths": paths, "ball": fr[i]["ball"], "clip": c["id"], "w": c["w"], "h": c["h"], "t": fr[i]["t"]})
    return out


def make_torch_bits():
    import numpy as np
    import torch
    from PIL import Image
    from torch import nn
    from torch.utils.data import Dataset

    def load_gray(path: str) -> np.ndarray:
        return np.asarray(Image.open(path).convert("L"), dtype=np.uint8)

    class Crops(Dataset):
        """학습용 — 공이 있는 장면은 공이 조각 안에 들게(7할), 나머지는 아무 데나. 좌우 뒤집기 · 밝기 흔들기"""

        def __init__(self, samples, train: bool):
            self.s = samples
            self.train = train

        def __len__(self):
            return len(self.s)

        def __getitem__(self, k):
            s = self.s[k]
            imgs = [load_gray(p) for p in s["paths"]]
            h, w = imgs[0].shape
            ball = s["ball"]
            if self.train:
                if ball and random.random() < 0.7:
                    cx = int(ball[0] + random.uniform(-CROP * 0.4, CROP * 0.4))
                    cy = int(ball[1] + random.uniform(-CROP * 0.4, CROP * 0.4))
                else:
                    cx, cy = random.randint(0, w), random.randint(0, h)
                x0 = min(max(0, cx - CROP // 2), max(0, w - CROP))
                y0 = min(max(0, cy - CROP // 2), max(0, h - CROP))
            else:
                x0 = y0 = 0
            cw, ch = (CROP, CROP) if self.train else (w - w % STRIDE, h - h % STRIDE)
            x = np.stack([im[y0 : y0 + ch, x0 : x0 + cw] for im in imgs]).astype(np.float32) / 255.0
            b = None
            if ball:
                bx, by, bd = ball[0] - x0, ball[1] - y0, ball[2]
                if 0 <= bx < cw and 0 <= by < ch:
                    b = (bx, by, bd)
            if self.train:
                if random.random() < 0.5:
                    x = x[:, :, ::-1]
                    if b:
                        b = (cw - 1 - b[0], b[1], b[2])
                gain = random.uniform(0.7, 1.3)
                bias = random.uniform(-0.1, 0.1)
                x = np.clip(x * gain + bias, 0, 1)
            x = torch.from_numpy(np.ascontiguousarray(x))
            hm = torch.zeros((1, ch // STRIDE, cw // STRIDE), dtype=torch.float32)
            sz = torch.zeros((1, ch // STRIDE, cw // STRIDE), dtype=torch.float32)
            msk = torch.zeros_like(sz)
            if b:
                gx, gy = b[0] / STRIDE, b[1] / STRIDE
                sigma = max(0.8, b[2] / STRIDE / 2.5)
                ys = torch.arange(hm.shape[1], dtype=torch.float32)[:, None]
                xs = torch.arange(hm.shape[2], dtype=torch.float32)[None, :]
                hm[0] = torch.exp(-((xs - gx) ** 2 + (ys - gy) ** 2) / (2 * sigma**2))
                ix, iy = int(round(gx)), int(round(gy))
                if 0 <= ix < hm.shape[2] and 0 <= iy < hm.shape[1]:
                    hm[0, iy, ix] = 1.0
                    for dy in range(-SIZE_NB, SIZE_NB + 1):
                        for dx in range(-SIZE_NB, SIZE_NB + 1):
                            jx, jy = ix + dx, iy + dy
                            if 0 <= jx < hm.shape[2] and 0 <= jy < hm.shape[1]:
                                sz[0, jy, jx] = math.log(max(2.0, b[2]))
                                msk[0, jy, jx] = 1.0
            return x, hm, sz, msk, torch.tensor([b[0], b[1], b[2]] if b else [-1.0, -1.0, -1.0])

    class Net(nn.Module):
        def __init__(self):
            super().__init__()
            import torchvision

            mb = torchvision.models.mobilenet_v3_small(weights="IMAGENET1K_V1")
            self.stem = nn.Sequential(*list(mb.features)[:4])  # 걸음 8 · 24채널
            self.head = nn.Sequential(
                nn.Conv2d(24, 64, 3, padding=1),
                nn.BatchNorm2d(64),
                nn.Hardswish(),
                nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
                nn.Conv2d(64, 32, 3, padding=1),
                nn.BatchNorm2d(32),
                nn.Hardswish(),
                nn.Conv2d(32, 2, 1),
            )
            # 열지도 시작 편향 −2.19(CenterNet)
            with torch.no_grad():
                self.head[-1].bias[0].fill_(-2.19)
                self.head[-1].bias[1].fill_(math.log(12.0))

        def forward(self, x):
            # ImageNet 정규화 — 셋 다 밝기라 같은 평균 · 표준편차
            x = (x - 0.45) / 0.225
            return self.head(self.stem(x))

    def focal_loss(logit, hm, alpha=2.0, beta=4.0):
        p = torch.sigmoid(logit).clamp(1e-4, 1 - 1e-4)
        pos = (hm >= 0.999).float()
        neg = 1 - pos
        pos_loss = -(torch.log(p) * (1 - p) ** alpha * pos).sum()
        neg_loss = -(torch.log(1 - p) * p**alpha * (1 - hm) ** beta * neg).sum()
        n = pos.sum().clamp(min=1)
        return (pos_loss + neg_loss) / n

    return Crops, Net, focal_loss, load_gray


# ───────────────────────── 평가 ─────────────────────────


def evaluate(model, samples, device, thr=0.5):
    """장면마다 열지도의 가장 센 봉우리 하나 — 공 장면: 라벨 지름(바닥 6px) 안이면 맞음, 공 없는 장면: 문턱 넘으면 헛 알림"""
    import numpy as np
    import torch

    Crops, _, _, _ = make_torch_bits()
    ds = Crops(samples, train=False)
    model.eval()
    rows = []
    with torch.no_grad():
        for k in range(len(ds)):
            x, _, _, _, b = ds[k]
            out = model(x[None].to(device))[0]
            score = torch.sigmoid(out[0])
            iy, ix = divmod(int(score.argmax()), score.shape[1])
            s = float(score[iy, ix])
            d_pred = float(torch.exp(out[1, iy, ix]))
            px, py = (ix + 0.5) * STRIDE, (iy + 0.5) * STRIDE
            bx, by, bd = (float(v) for v in b)
            has = bx >= 0
            d_gt = d_near = s_near = None
            if has:
                gx, gy = min(score.shape[1] - 1, max(0, int(bx / STRIDE))), min(score.shape[0] - 1, max(0, int(by / STRIDE)))
                d_gt = float(torch.exp(out[1, gy, gx]))
                rad = max(2, int(math.ceil(max(MIN_R, bd) / STRIDE)))
                y0, y1, x0, x1 = max(0, gy - rad), min(score.shape[0], gy + rad + 1), max(0, gx - rad), min(score.shape[1], gx + rad + 1)
                win = score[y0:y1, x0:x1]
                jy, jx = divmod(int(win.argmax()), win.shape[1])
                s_near = float(win[jy, jx])
                d_near = float(torch.exp(out[1, y0 + jy, x0 + jx]))
            hit = bool(has and math.hypot(px - bx, py - by) <= max(MIN_R, bd))
            rows.append({"clip": samples[k]["clip"], "t": samples[k]["t"], "has": has, "d": bd if has else None, "score": s, "hit": hit, "dist": math.hypot(px - bx, py - by) if has else None, "d_pred": d_pred, "d_gt": d_gt, "d_near": d_near, "s_near": s_near})
    pos = [r for r in rows if r["has"]]
    neg = [r for r in rows if not r["has"]]
    bins = [("<8", lambda d: d < 8), ("8~15", lambda d: 8 <= d < 15), ("15+", lambda d: d >= 15)]
    rep = {
        "frames": len(rows),
        "pos": len(pos),
        "neg": len(neg),
        "recall": sum(r["hit"] and r["score"] >= thr for r in pos) / max(1, len(pos)),
        "recall_any_thr": sum(r["hit"] for r in pos) / max(1, len(pos)),
        "false_alarm": sum(r["score"] >= thr for r in neg) / max(1, len(neg)),
        "thr": thr,
        "by_size": {
            name: {"n": len(g), "recall": sum(r["hit"] and r["score"] >= thr for r in g) / max(1, len(g))}
            for name, f in bins
            for g in [[r for r in pos if f(r["d"])]]
        },
        "median_center_err_px": float(np.median([r["dist"] for r in pos if r["hit"]])) if any(r["hit"] for r in pos) else None,
        "size_ratio_median": float(np.median([r["d_pred"] / r["d"] for r in pos if r["hit"]])) if any(r["hit"] for r in pos) else None,
    }
    # 문턱별 — 재현율 · 헛 알림 곡선
    rep["curve"] = [
        {"thr": t, "recall": sum(r["hit"] and r["score"] >= t for r in pos) / max(1, len(pos)), "false_alarm": sum(r["score"] >= t for r in neg) / max(1, len(neg))}
        for t in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)
    ]
    return rep, rows


# ───────────────────────── 학습 ─────────────────────────


@app.function(gpu=GPU, volumes={DATA: vol}, timeout=3 * 3600)
def train(epochs: int = 30, limit: int = 0, batch: int = 16, lr: float = 1e-3, tag: str = "v1", dataset: str = "detector-v1",
          test_groups: str = "", init: str = "", size_w: float = 0.5, size_nb: int = 0, max_engine_err: float = 0.0):
    import tarfile

    global SIZE_NB
    SIZE_NB = size_nb  # 자료 일꾼(fork)이 물려받는다

    import torch
    from torch.utils.data import DataLoader

    root = os.path.join(DATA, dataset)
    if not os.path.exists(os.path.join(root, "labels.json")) and os.path.exists(f"{root}.tar"):
        # 작은 파일 수천 개를 올리면 modal volume put 이 멈춰서(10-22) 묶음 하나로 올리고 여기서 푼다
        with tarfile.open(f"{root}.tar") as tf:
            tf.extractall(DATA)
        vol.commit()
    L = load_labels(root)
    clips = L["clips"]
    if limit:
        clips = clips[:limit]
    tr_clips, te_clips = split_groups(clips, test_groups) if test_groups else split_clips(clips)
    if max_engine_err > 0:
        # 3판 — 엔진 구속이 스피드건과 크게 다른 공은 궤적 모양부터 틀려 '진짜 지름' 라벨도 틀린다. 학습에서만 뺀다(시험은 그대로)
        keep = [c for c in tr_clips if c.get("gun") and c.get("kmh") and abs(c["kmh"] / c["gun"] - 1) <= max_engine_err]
        print(f"라벨 믿음 거르기 — 학습 클립 {len(tr_clips)} → {len(keep)}(엔진 · 건 차이 {max_engine_err:.0%} 안)")
        tr_clips = keep
    tr = samples_of(tr_clips, root)
    te = samples_of(te_clips, root)
    Crops, Net, focal_loss, _ = make_torch_bits()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"장치 {device} · 학습 클립 {len(tr_clips)} 장면 {len(tr)}(공 {sum(1 for s in tr if s['ball'])}) · 시험 클립 {len(te_clips)} 장면 {len(te)}")
    model = Net().to(device)
    if init:
        model.load_state_dict(torch.load(os.path.join(DATA, "out", init, "model.pt"), map_location=device))
        print(f"시작 무게 /out/{init}")
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=max(1, epochs * math.ceil(len(tr) / batch)))
    dl = DataLoader(Crops(tr, train=True), batch_size=batch, shuffle=True, num_workers=6, drop_last=True, persistent_workers=True)
    t0 = time.time()
    for ep in range(epochs):
        model.train()
        tot = n = 0
        for x, hm, sz, msk, _ in dl:
            x, hm, sz, msk = x.to(device), hm.to(device), sz.to(device), msk.to(device)
            out = model(x)
            loss_hm = focal_loss(out[:, :1], hm)
            loss_sz = ((out[:, 1:] - sz).abs() * msk).sum() / msk.sum().clamp(min=1)
            loss = loss_hm + size_w * loss_sz
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
            tot += float(loss)
            n += 1
        print(f"epoch {ep + 1}/{epochs} loss {tot / max(1, n):.4f} · {time.time() - t0:.0f}s")
    rep, rows = evaluate(model, te, device)
    rep["train_clips"] = [c["id"] for c in tr_clips]
    rep["test_clips"] = [c["id"] for c in te_clips]
    rep["epochs"] = epochs
    rep["seconds"] = round(time.time() - t0)
    print(json.dumps({k: v for k, v in rep.items() if k not in ("train_clips", "test_clips", "curve")}, ensure_ascii=False, indent=1))
    out_dir = os.path.join(DATA, "out", tag)
    os.makedirs(out_dir, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(out_dir, "model.pt"))
    with open(os.path.join(out_dir, "eval.json"), "w", encoding="utf-8") as f:
        json.dump({"report": rep, "frames": rows}, f, ensure_ascii=False)
    # ONNX — 세로 540×960(긴 변 960) 고정 입력. 폰(CoreML) · 브라우저(onnxruntime-web) 둘 다 이 파일에서
    try:
        model.eval().cpu()
        dummy = torch.zeros(1, 3, 960, 544)
        torch.onnx.export(model, dummy, os.path.join(out_dir, "model.onnx"), input_names=["frames"], output_names=["heat_size"], opset_version=17, dynamo=False)
        print("ONNX 저장")
    except Exception as e:  # noqa: BLE001
        print("ONNX 실패", repr(e)[:300])
    vol.commit()
    return rep


@app.function(gpu=None, volumes={DATA: vol}, timeout=600)
def export_onnx(tag: str = "v1"):
    """저장한 무게 → 크기가 자유로운 ONNX(세로 · 가로 동적, 둘 다 32 의 배수여야 한다). 사이트(onnxruntime-web)가 이것을 쓴다"""
    import torch

    _, Net, _, _ = make_torch_bits()
    out_dir = os.path.join(DATA, "out", tag)
    model = Net()
    model.load_state_dict(torch.load(os.path.join(out_dir, "model.pt"), map_location="cpu"))
    model.eval()
    dummy = torch.zeros(1, 3, 960, 544)
    path = os.path.join(out_dir, "model-dyn.onnx")
    torch.onnx.export(
        model, dummy, path, input_names=["frames"], output_names=["heat_size"], opset_version=17, dynamo=False,
        dynamic_axes={"frames": {2: "h", 3: "w"}, "heat_size": {2: "h4", 3: "w4"}},
    )
    vol.commit()
    return os.path.getsize(path)


@app.local_entrypoint()
def main(epochs: int = 30, limit: int = 0, batch: int = 16, lr: float = 1e-3, tag: str = "v1", dataset: str = "detector-v1",
         test_groups: str = "", init: str = "", size_w: float = 0.5, size_nb: int = 0, max_engine_err: float = 0.0):
    rep = train.remote(epochs=epochs, limit=limit, batch=batch, lr=lr, tag=tag, dataset=dataset, test_groups=test_groups, init=init, size_w=size_w, size_nb=size_nb, max_engine_err=max_engine_err)
    print(f"끝 — 재현율 {rep['recall']:.3f} · 헛 알림 {rep['false_alarm']:.3f} · {rep['seconds']}초 · 결과 /out/{tag}")
