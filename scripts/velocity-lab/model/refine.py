"""투구 후보(throws.py) → 장면마다 공 자리 라벨(원본 px). 읽기만.

    .venv/bin/python tools/refine.py --throws throws.json --out labels-auto.json [--only <파일 일부>] [--sheet <폴더>]

1) 모델 점(걸음 4 라 ±4px)을 원본 해상도 밝기 차 덩어리로 다듬는다(중심 · 지름).
2) 앞(손 떠난 쪽)으로 · 뒤(받는 곳 쪽)로 궤적을 늘인다 — x(t) · y(t) 2차, 1/지름(t) 1차(깊이가 시간에 거의 곧게)로 짐작한 자리 둘레에서
   덩어리를 찾고, 자리 · 크기가 맞으면 붙이고 다시 맞춘다. 두 장 잇달아 못 찾으면 멈춘다.
배경 = 그 투구 앞뒤(−0.7 ~ +0.7초)에서 고르게 뽑은 15장의 화소별 중앙값(몸 · 팔 · 공처럼 지나가는 것은 빠진다).
--sheet 를 주면 투구마다 확인용 그림(라벨 자리를 잘라 원 표시)을 남긴다.
"""
import argparse
import json
import math
import os

import av
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("--throws", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--only", default="")
ap.add_argument("--kinds", default="throw")
ap.add_argument("--sheet", default="")
ap.add_argument("--thr", type=float, default=16)
a = ap.parse_args()

TH = json.load(open(a.throws))
TH = [o for o in TH if o["kind"] in a.kinds.split(",") and a.only in o["file"]]


def decode(path, t0, t1):
    """[t0, t1] 장면들 — 보이는 방향 · 원본 크기 밝기(uint8)"""
    c = av.open(path)
    vs = c.streams.video[0]
    vs.thread_type = "AUTO"
    out = []
    for fr in c.decode(vs):
        t = float(fr.time)
        if t < t0 - 1e-6:
            continue
        if t > t1 + 1e-6:
            break
        rot = int(round((getattr(fr, "rotation", 0) or 0) / 90)) % 4
        g = np.rot90(fr.to_ndarray(format="gray"), k=rot)
        out.append((t, np.ascontiguousarray(g)))
    c.close()
    return out


def fit(pts, cx0=540.0, cy0=960.0):
    """pts: [(t, x, y, d)] → 함수(t) → (x, y, d). 원근을 따른다 — 1/지름 ∝ 깊이 Z 가 시간에 곧고, (x − 가운데)·(1/지름) ∝ X 도 곧고,
    (y − 가운데)·(1/지름) ∝ Y 는 2차(중력). 지름 잡음은 1/지름을 곧게 맞춘 값으로 눌러 쓴다."""
    t = np.array([p[0] for p in pts])
    tc = t.mean()
    ci = np.polyfit(t - tc, [1 / p[3] for p in pts], 1)
    w = np.polyval(ci, t - tc)
    gx = np.polyfit(t - tc, [(p[1] - cx0) * wi for p, wi in zip(pts, w)], 1)
    gy = np.polyfit(t - tc, [(p[2] - cy0) * wi for p, wi in zip(pts, w)], 2 if len(pts) >= 6 else 1)
    def f(tt):
        inv = float(np.polyval(ci, tt - tc))
        if inv <= 1e-4:
            return 0.0, 0.0, 1e4
        return cx0 + float(np.polyval(gx, tt - tc)) / inv, cy0 + float(np.polyval(gy, tt - tc)) / inv, 1 / inv
    return f


def blob_near(img, bg, x, y, d, rad):
    """짐작 자리 둘레의 덩어리 중 가장 가까운 것 — 밝은 쪽 · 어두운 쪽 차를 함께(절댓값) 본 덩어리 통째."""
    H, W = img.shape
    r = int(max(rad, 30))
    x0, y0, x1, y1 = max(0, int(x - r)), max(0, int(y - r)), min(W, int(x + r)), min(H, int(y + r))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    sd = img[y0:y1, x0:x1].astype(np.int16) - bg[y0:y1, x0:x1].astype(np.int16)
    diff = np.abs(sd)
    m = diff > a.thr
    m = ndimage.binary_opening(m, iterations=1) if d > 10 else m
    lab, n = ndimage.label(m)
    if n == 0:
        return None
    comps = []
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        sub = lab[sl] == k
        area = int(sub.sum())
        if area < 6:
            continue
        v = sd[sl] * sub
        pol = 1 if v.max() >= -v.min() else -1
        ys, xs = np.nonzero(sub)
        comps.append(dict(y0=sl[0].start + ys.min(), y1=sl[0].start + ys.max(), x0=sl[1].start + xs.min(), x1=sl[1].start + xs.max(),
                          cx=x0 + sl[1].start + xs.mean(), cy=y0 + sl[0].start + ys.mean(), area=area, pol=pol))
    if not comps:
        return None
    c = min(comps, key=lambda q: math.hypot(q["cx"] - x, q["cy"] - y))
    # 실내 천장 조명: 공 위는 밝고(+) 가운데 띠는 배경과 같고 아래는 어둡다(−) — 반대 극성 조각이 공 한 개 크기 안에 붙어 있으면 한 공으로
    box = [c["x0"], c["y0"], c["x1"], c["y1"]]
    size = max(box[2] - box[0], box[3] - box[1]) + 1
    for q in comps:
        if q is c or q["pol"] == c["pol"]:
            continue
        gx = max(0, max(q["x0"], box[0]) - min(q["x1"], box[2]))
        gy = max(0, max(q["y0"], box[1]) - min(q["y1"], box[3]))
        qs = max(q["x1"] - q["x0"], q["y1"] - q["y0"]) + 1
        if gx <= 0.15 * size and gy <= 0.8 * size and 0.3 * size <= qs <= 2.5 * size:
            box = [min(box[0], q["x0"]), min(box[1], q["y0"]), max(box[2], q["x1"]), max(box[3], q["y1"])]
    bw, bh = box[2] - box[0] + 1, box[3] - box[1] + 1
    cx, cy = x0 + (box[0] + box[2]) / 2, y0 + (box[1] + box[3]) / 2
    minor = float(min(bw, bh))
    return dict(x=cx, y=cy, d=(bw + bh) / 2, minor=minor, elong=max(bw, bh) / max(1, minor), dist=math.hypot(cx - x, cy - y), pol=c["pol"])


labels = []
os.makedirs(a.sheet, exist_ok=True) if a.sheet else None
for k, th in enumerate(TH):
    pts = th["pts"]
    t0, t1 = pts[0][1], pts[-1][1]
    fr = decode(th["file"], t0 - 0.75, t1 + 0.75)
    if len(fr) < 20:
        continue
    times = np.array([f[0] for f in fr])
    pick = np.linspace(0, len(fr) - 1, 15).round().astype(int)
    bg = np.median(np.stack([fr[i][1] for i in pick]), axis=0).astype(np.uint8)
    idx = {round(f[0], 3): j for j, f in enumerate(fr)}
    # 1) 모델 점 다듬기
    lab = {}
    for i, t, x, y, d, s in pts:
        j = int(np.argmin(np.abs(times - t)))
        b = blob_near(fr[j][1], bg, x, y, d, max(1.2 * d, 20))
        if b and b["dist"] < max(1.0 * d, 10) and 3 <= b["d"] < 1.8 * d and b["elong"] < 2.8:
            lab[j] = dict(t=fr[j][0], x=b["x"], y=b["y"], d=b["minor"] if b["elong"] > 1.6 else b["d"], src="net+blob", s=s, elong=round(b["elong"], 2))
        else:
            lab[j] = dict(t=fr[j][0], x=x, y=y, d=d, src="net", s=s)
    # 2) 앞 · 뒤로 늘이기
    for dirn in (-1, 1):
        miss = 0
        js = sorted(lab)
        j = js[0] - 1 if dirn < 0 else js[-1] + 1
        while 0 <= j < len(fr) and miss < 2:
            keys = sorted(lab)
            near = keys[:8] if dirn < 0 else keys[-8:]
            f = fit([(lab[q]["t"], lab[q]["x"], lab[q]["y"], lab[q]["d"]) for q in near], fr[0][1].shape[1] / 2, fr[0][1].shape[0] / 2)
            px, py, pd = f(fr[j][0])
            if not (0 < pd < 400):
                break
            qx, qy, _ = f(fr[j][0] - dirn / 60)
            step = math.hypot(px - qx, py - qy)
            b = blob_near(fr[j][1], bg, px, py, pd, max(2.0 * pd, 30, 2 * step))
            ok = b and b["dist"] < max(1.0 * pd, 12, 1.5 * step) and 0.5 * pd < (b["minor"] if b["elong"] > 1.6 else b["d"]) < 1.7 * pd and b["elong"] < 3.0
            if os.environ.get("DBG"):
                print("  늘이기", dirn, round(fr[j][0], 3), "짐작", round(px), round(py), round(pd, 1), "걸음", round(step, 1), "→", b and {kk: round(vv, 1) for kk, vv in b.items()}, ok)
            if ok:
                lab[j] = dict(t=fr[j][0], x=b["x"], y=b["y"], d=b["minor"] if b["elong"] > 1.6 else b["d"], src="ext", s=0, elong=round(b["elong"], 2))
                miss = 0
            else:
                miss += 1
            j += dirn
    seq = [lab[q] for q in sorted(lab)]
    # 끝 다듬기 — 끝 점마다 바로 안쪽 8점으로 맞춘 원근 궤적에서 크게 벗어나면(손 · 팔 · 미트 · 땅의 다른 공) 잘라낸다
    H0, W0 = fr[0][1].shape
    def bad(q, inner):
        f_ = fit([(p_["t"], p_["x"], p_["y"], p_["d"]) for p_ in inner], W0 / 2, H0 / 2)
        px, py, pd = f_(q["t"])
        qx, qy, _ = f_(q["t"] + 1 / 60)
        step = math.hypot(px - qx, py - qy)
        return math.hypot(q["x"] - px, q["y"] - py) > max(0.8 * pd, 10, 1.2 * step) or not (0.5 * pd <= q["d"] <= 1.9 * pd)
    # 덩어리로 못 다듬은 모델 점이 처음 · 끝에 있으면 뺀다(빠른 공 · 미트 앞에서 봉우리가 공 옆에 섰다)
    while len(seq) > 10 and seq[0]["src"] == "net":
        seq.pop(0)
    while len(seq) > 10 and seq[-1]["src"] == "net":
        seq.pop()
    while len(seq) > 10 and bad(seq[0], seq[1:9]):
        seq.pop(0)
    while len(seq) > 10 and bad(seq[-1], seq[-9:-1]):
        seq.pop()
    labels.append(dict(file=th["file"], kind=th["kind"], t0=seq[0]["t"], t1=seq[-1]["t"], n=len(seq), next=sum(1 for q in seq if q["src"] == "ext"),
                       frames=[[round(q["t"], 4), round(q["x"], 1), round(q["y"], 1), round(q["d"], 1), q["src"]] for q in seq]))
    if a.sheet:
        # 확인 띠 — 고르게 10장(앞 · 늘린 곳이 보이게 맨 앞 둘은 늘 넣음), 칸 96px, 왼쪽에 파일 · 시각
        n_ = len(seq)
        pickk = sorted(set([0, 1] + [int(round(v)) for v in np.linspace(0, n_ - 1, 8)]))[:10]
        T = 96
        strip = Image.new("RGB", (180 + T * 10, T), (30, 30, 30))
        dr0 = ImageDraw.Draw(strip)
        dr0.text((4, 4), th["file"][-26:], fill=(255, 255, 255))
        dr0.text((4, 20), f"{seq[0]['t']:.2f}~{seq[-1]['t']:.2f} n{n_} ext{labels[-1]['next']}", fill=(200, 200, 200))
        dr0.text((4, 36), f"#{k}", fill=(255, 255, 0))
        for m_, q in enumerate(seq[i] for i in pickk):
            j = idx.get(round(q["t"], 3), int(np.argmin(np.abs(times - q["t"]))))
            img = fr[j][1]
            r = int(max(36, 2.2 * q["d"]))
            x0, y0 = int(q["x"] - r), int(q["y"] - r)
            crop = Image.fromarray(img).crop((x0, y0, x0 + 2 * r, y0 + 2 * r)).resize((T, T)).convert("RGB")
            dr = ImageDraw.Draw(crop)
            rr = q["d"] / 2 * T / (2 * r)
            col = {"net": (255, 200, 0), "net+blob": (0, 220, 0), "ext": (255, 60, 60)}[q["src"]]
            dr.ellipse((T / 2 - rr, T / 2 - rr, T / 2 + rr, T / 2 + rr), outline=col)
            dr.text((2, 2), f"{q['t']:.2f}", fill=(255, 255, 255))
            strip.paste(crop, (180 + m_ * T, 0))
        strip.save(os.path.join(a.sheet, f"{k:04d}.png"))
    print(f"{k + 1}/{len(TH)} {th['file']} {t0:.2f}~{t1:.2f} 모델 {len(pts)} → {len(seq)} (늘림 {labels[-1]['next']})", flush=True)

json.dump(labels, open(a.out, "w"))
