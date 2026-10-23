"""녹화 컷의 공 길이 조각 끝을 넘을 때 앞뒤 조각을 이어 한 클립으로 — fetch.mjs 가 부른다.

    python stitch.py <jobs.json>      jobs: [{ out, t0, t1, parts: [{ path, offsetSec, durationSec }] }]

조각마다 장면을 풀어 녹화 시각(offsetSec + 장면 시각)으로 놓고 [t0, t1] 만 남긴다. 조각이 겹치는 곳(0.25~0.5초)은 앞 조각을 쓴다.
원본은 가로 1920×1080 + 회전 −90 이라, 화소를 시계 방향으로 돌려 세로 1080×1920 · 회전 없음으로 쓴다(밝기 · 색 면을 그대로 돌림 —
색 변환 없음). H.264 crf 8 로 다시 담아 화질 손실은 눈에 안 띄는 정도다(원본 조각도 다시 압축된 세션 녹화).
"""
import json
import os
import sys
from fractions import Fraction

import av
import numpy as np


def frames_in(parts, t0, t1):
    out = []
    last = -1e9
    for p in parts:
        c = av.open(p["path"])
        s = c.streams.video[0]
        for f in c.decode(s):
            t = p["offsetSec"] + f.time
            if t < t0 - 1e-6 or t > t1 + 1e-6 or t <= last + 0.5 / 60:
                continue
            out.append((t, f.rotation, f.to_ndarray(format="yuv420p")))
            last = t
        c.close()
    return out


def upright(a, rot):
    """yuv420p 묶음(H*3/2 × W)을 면마다 돌린다 — rot −90 이면 시계 방향"""
    if rot == 0:
        return a
    k = -1 if rot == -90 else 1 if rot == 90 else 2
    h = a.shape[0] * 2 // 3
    w = a.shape[1]
    y = a[:h]
    u = a[h : h + h // 4].reshape(h // 2, w // 2)
    v = a[h + h // 4 :].reshape(h // 2, w // 2)
    y, u, v = (np.rot90(x, k) for x in (y, u, v))
    nh, nw = y.shape
    return np.concatenate([y.ravel(), u.ravel(), v.ravel()]).reshape(nh * 3 // 2, nw)


def stitch(job):
    fr = frames_in(job["parts"], job["t0"], job["t1"])
    if len(fr) < 30:
        raise SystemExit(f"장면이 모자람({len(fr)}): {job['out']}")
    os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
    tmp = job["out"] + ".part.mp4"
    o = av.open(tmp, "w")
    first = upright(fr[0][2], fr[0][1])
    s = o.add_stream("libx264", rate=60)
    s.height = first.shape[0] * 2 // 3
    s.width = first.shape[1]
    s.pix_fmt = "yuv420p"
    s.options = {"crf": "8", "preset": "medium"}
    tb = Fraction(1, 6000)
    s.codec_context.time_base = tb
    t0 = fr[0][0]
    for t, rot, a in fr:
        vf = av.VideoFrame.from_ndarray(upright(a, rot), format="yuv420p")
        vf.pts = round((t - t0) / tb)
        vf.time_base = tb
        for pk in s.encode(vf):
            o.mux(pk)
    for pk in s.encode():
        o.mux(pk)
    o.close()
    os.replace(tmp, job["out"])
    gaps = [b[0] - a[0] for a, b in zip(fr, fr[1:])]
    print(f"{job['out']}: 장면 {len(fr)} · 조각 {len(job['parts'])} · 가장 긴 틈 {max(gaps) * 1000:.0f}ms")


if __name__ == "__main__":
    for j in json.load(open(sys.argv[1])):
        stitch(j)
