"""라벨(refine.py) → 학습 자료 2판(train.py 꼴: images/<클립>/NNN.jpg 흑백 · labels.json). 읽기만(저장소 밖에 쓴다).

    .venv/bin/python tools/build_v2.py --labels labels-auto.json --out detector-v2 [--test <녹화 id,…>]

클립 하나 = 투구 하나: 첫 라벨 0.5초 앞 ~ 끝 라벨 0.3초 뒤의 잇단 장면(60fps 그대로). 그림은 긴 변 960.
공 = 라벨 장면, 라벨 사이 3장 안 빈틈은 선으로 채움, 그 밖은 null(손에 든 공 · 받은 뒤 — 공 없는 장면으로 배운다).
--test 에 든 녹화(파일 경로에 그 글자가 든 것)는 시험용(split 'test') — 학습 때 그 세션을 통째로 뗀다.
"""
import argparse
import json
import os

import av
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--labels", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--test", default="")
ap.add_argument("--pre", type=float, default=0.5)
ap.add_argument("--post", type=float, default=0.3)
a = ap.parse_args()
TEST = [s for s in a.test.split(",") if s]

L = json.load(open(a.labels))
os.makedirs(os.path.join(a.out, "images"), exist_ok=True)
clips = []
for k, th in enumerate(L):
    fl = th["frames"]
    t0, t1 = fl[0][0] - a.pre, fl[-1][0] + a.post
    c = av.open(th["file"])
    vs = c.streams.video[0]
    vs.thread_type = "AUTO"
    raw = []
    for fr in c.decode(vs):
        t = float(fr.time)
        if t < t0:
            continue
        if t > t1:
            break
        rot = int(round((getattr(fr, "rotation", 0) or 0) / 90)) % 4
        W0, H0 = (fr.height, fr.width) if rot % 2 else (fr.width, fr.height)
        s = 960 / max(W0, H0)
        w, h = int(round(W0 * s / 2)) * 2, int(round(H0 * s / 2)) * 2
        rw, rh = (h, w) if rot % 2 else (w, h)
        g = np.rot90(fr.to_ndarray(format="gray", width=rw, height=rh), k=rot)
        raw.append((t, np.ascontiguousarray(g), s, w, h))
    c.close()
    if len(raw) < 10:
        continue
    lt = np.array([f[0] for f in fl])
    cid = f"{th['file'].replace('/', '_').replace('.', '_')}_{fl[0][0]:.2f}"
    os.makedirs(os.path.join(a.out, "images", cid), exist_ok=True)
    frames = []
    for i, (t, g, s, w, h) in enumerate(raw):
        j = int(np.argmin(np.abs(lt - t)))
        ball = None
        if abs(lt[j] - t) < 0.004:
            ball = [fl[j][1] * s, fl[j][2] * s, fl[j][3] * s]
        elif lt[0] < t < lt[-1]:
            jb = int(np.searchsorted(lt, t))
            ta, tb = lt[jb - 1], lt[jb]
            if (tb - ta) <= 4 / 60 + 1e-3:
                u = (t - ta) / (tb - ta)
                ball = [((1 - u) * fl[jb - 1][q] + u * fl[jb][q]) * s for q in (1, 2, 3)]
        name = f"{i:03d}.jpg"
        Image.fromarray(g).save(os.path.join(a.out, "images", cid, name), quality=92)
        frames.append({"i": i, "t": round(t - raw[0][0], 4), "file": name, "ball": [round(v, 2) for v in ball] if ball else None})
    split = "test" if any(x in th["file"] for x in TEST) else "train"
    date = th["file"].split("/")[0]
    clips.append({"id": cid, "date": date, "split": split, "w": raw[0][3], "h": raw[0][4], "kind": th["kind"], "frames": frames})
    print(f"{k + 1}/{len(L)} {cid} 장면 {len(frames)} 공 {sum(1 for f in frames if f['ball'])} {split}", flush=True)

json.dump({"clips": clips}, open(os.path.join(a.out, "labels.json"), "w"))
print("클립", len(clips), "장면", sum(len(c["frames"]) for c in clips), "공", sum(1 for c in clips for f in c["frames"] if f["ball"]))
