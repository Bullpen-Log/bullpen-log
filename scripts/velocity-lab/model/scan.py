"""공 감지 모델(1판)을 영상 장면마다 돌려 봉우리를 남긴다 — 정답 표 · 라벨 후보용(읽기만).

    .venv/bin/python tools/scan.py --model <onnx> --long 960 --out <jsonl> <영상 …>

줄마다 {file, i, t, peaks: [[x, y, d, score], …]} — x · y · d 는 원본 px, 점수 0.05 넘는 봉우리 위 다섯(3×3 가장 큰 칸).
입력은 학습과 같게 RGB → L(0.299 · 0.587 · 0.114) / 255, 세 채널 = t−2 · t−1 · t.
"""
import argparse
import json
import sys
import time

import av
import numpy as np
import onnxruntime as ort

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--long", type=int, default=960)
ap.add_argument("--out", required=True)
ap.add_argument("--threads", type=int, default=4)
ap.add_argument("--min", type=float, default=0.05)
ap.add_argument("files", nargs="+")
a = ap.parse_args()

so = ort.SessionOptions()
so.intra_op_num_threads = a.threads
sess = ort.InferenceSession(a.model, so, providers=["CPUExecutionProvider"])
STRIDE = 4


def size_for(w, h):
    s = a.long / max(w, h)
    r = lambda v: max(32, int(round(v * s / 32)) * 32)
    return r(w), r(h), s


def peaks(heat, size, k=5):
    H, W = heat.shape
    p = np.pad(heat, 1, constant_values=-1e9)
    m = np.max(np.stack([p[dy : dy + H, dx : dx + W] for dy in range(3) for dx in range(3)]), axis=0)
    cand = np.argwhere((heat >= m) & (heat > np.log(a.min / (1 - a.min))))
    if not len(cand):
        return []
    sc = heat[cand[:, 0], cand[:, 1]]
    order = np.argsort(-sc)[:k]
    out = []
    for j in order:
        y, x = cand[j]
        out.append((float((x + 0.5) * STRIDE), float((y + 0.5) * STRIDE), float(np.exp(size[y, x])), float(1 / (1 + np.exp(-sc[j])))))
    return out


with open(a.out, "a") as f:
    for path in a.files:
        t0 = time.time()
        try:
            c = av.open(path)
        except Exception as e:  # noqa: BLE001
            print("못 엶", path, e, file=sys.stderr)
            continue
        vs = c.streams.video[0]
        vs.thread_type = "AUTO"
        ring = []
        n = 0
        for fr in c.decode(vs):
            # 회전 표시(아이폰 세로 영상은 −90) — 보이는 모양으로 돌려 브라우저 · 학습과 같게. 좌표는 보이는 원본 px
            rot = int(round((getattr(fr, "rotation", 0) or 0) / 90)) % 4
            W0, H0 = (fr.height, fr.width) if rot % 2 else (fr.width, fr.height)
            w, h, s = size_for(W0, H0)
            rw, rh = (h, w) if rot % 2 else (w, h)
            rgb = np.rot90(fr.to_ndarray(format="rgb24", width=rw, height=rh), k=rot).astype(np.float32)
            L = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255.0
            t = float(fr.time) if fr.time is not None else n / 60
            ring.append(L)
            if len(ring) > 3:
                ring.pop(0)
            if len(ring) == 3:
                x = np.stack(ring)[None].astype(np.float32)
                hs = sess.run(None, {"frames": x})[0][0]
                pk = [[round(px / s, 1), round(py / s, 1), round(d / s, 1), round(sc, 3)] for px, py, d, sc in peaks(hs[0], hs[1])]
                f.write(json.dumps({"file": path, "i": n, "t": round(t, 4), "w": W0, "h": H0, "peaks": pk}) + "\n")
            n += 1
        c.close()
        print(f"{path} 장면 {n} · {time.time() - t0:.1f}초", file=sys.stderr, flush=True)
