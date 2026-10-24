"""결과 화면용 가벼운 영상 — 원본을 짧은 변 720 · H.264 · 키 장면 0.125초마다로 다시 굽는다(소리 없음).

2026-10-24 김민: "분석 결과 화면이 렉이 많이 걸려". 결과 화면은 원본 두 · 네 칸을 3D 시계에 맞춰 ¼ 속도로 돌리며 자주 옮기는데, 원본은
1080p HEVC 168~240fps · 48~73Mbps(마커 5초에 셋이 125MB) · 키 장면 1초마다라 받기 · 풀기 · 옮기기가 다 무거웠다.

- 시각은 원본 트랙 시각 그대로(편집 목록 무시 — video.py 와 같다) = 3D 결과 시각. 그래서 화면은 이 영상에 편집 목록 앞머리를 더하지 않는다
  (lib/pitch-lab.ts labVideoShifts). 장면 수 · 간격도 원본 그대로(240fps 면 ¼ 속도에서 초당 60장).
- 회전(display matrix)은 그림을 바로 세워 굽는다(재생기가 원본에 하던 것).
- B 장면 없음 · 키 장면 0.125초마다 — 옮길 때 풀 장면이 적다.
"""

from __future__ import annotations

from fractions import Fraction

from .video import _frame_rotation, upright_turn

SHORT_SIDE = 720
KEY_EVERY_S = 0.125
CRF = "30"
TB = Fraction(1, 90000)


def worth_it(src_bytes: int, preview_bytes: int) -> bool:
    """원본보다 확실히(60% 밑) 작을 때만 올린다 — 이미 가벼운 원본(60fps 화면 녹화 등)은 그대로 쓰는 편이 화질이 낫다"""
    return preview_bytes < 0.6 * src_bytes


def make_preview(src: str, out: str) -> dict:
    """src 원본 → out(mp4). 돌려주는 값: 장면 수 · 길이(초) · 크기. 못 하면 예외."""
    import av
    import os

    with av.open(src, options={"ignore_editlist": "1"}) as cin:
        s = cin.streams.video[0]
        s.thread_type = "AUTO"
        rate = float(s.guessed_rate or s.average_rate or 30)
        tb = float(s.time_base)
        with av.open(out, "w", format="mp4", options={"movflags": "+faststart"}) as cout:
            o = None
            turn = 0
            n = 0
            last = -1
            t0 = t1 = 0.0
            for f in cin.decode(s):
                if f.pts is None:
                    continue
                if o is None:
                    turn = upright_turn(_frame_rotation(f))
                    w, h = f.width, f.height
                    if turn in (90, 270):
                        w, h = h, w
                    k = SHORT_SIDE / min(w, h) if min(w, h) > SHORT_SIDE else 1.0
                    W, H = int(round(w * k / 2)) * 2, int(round(h * k / 2)) * 2
                    o = cout.add_stream("libx264", rate=Fraction(round(rate)))
                    o.width, o.height, o.pix_fmt = W, H, "yuv420p"
                    o.time_base = TB
                    o.codec_context.time_base = TB
                    g = str(max(1, round(rate * KEY_EVERY_S)))
                    o.options = {"crf": CRF, "preset": "veryfast", "bf": "0", "g": g, "keyint_min": g, "sc_threshold": "0"}
                    t0 = f.pts * tb
                pts = round(f.pts * tb / TB)
                if pts <= last:
                    continue
                last = pts
                if turn:
                    import cv2

                    code = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}[turn]
                    img = cv2.rotate(f.to_ndarray(format="rgb24"), code)
                    f2 = av.VideoFrame.from_ndarray(img, format="rgb24").reformat(o.width, o.height, "yuv420p")
                else:
                    f2 = f.reformat(o.width, o.height, "yuv420p")
                f2.pts = pts
                f2.time_base = TB
                for p in o.encode(f2):
                    cout.mux(p)
                n += 1
                t1 = f.pts * tb
            if o is None:
                raise ValueError("no frames")
            for p in o.encode(None):
                cout.mux(p)
    return {"frames": n, "fromSec": round(t0, 4), "toSec": round(t1, 4), "bytes": os.path.getsize(out)}


def run_previews(job: dict) -> dict:
    """작업 하나의 옆 · 뒤 가벼운 영상을 굽고 job["previews"] 의 서명 주소로 올린다(app.py previews — GPU 없는 함수). 칸마다 따로, 실패는 적고 넘어간다."""
    import os
    import tempfile
    import time

    import requests

    from .pipeline import _download

    out: dict = {}
    urls = job.get("previews") or {}
    with tempfile.TemporaryDirectory() as d:
        for view in ("side", "back"):
            put = urls.get(view)
            if not put:
                continue
            t = time.time()
            try:
                src = os.path.join(d, f"{view}.mov")
                dst = os.path.join(d, f"{view}-preview.mp4")
                _download(job[view]["url"], src)
                info = make_preview(src, dst)
                if not worth_it(os.path.getsize(src), info["bytes"]):
                    out[view] = {**info, "skip": "원본이 이미 가볍다"}
                    continue
                with open(dst, "rb") as f:
                    r = requests.put(put, data=f, headers={"Content-Type": "video/mp4", "x-upsert": "true"}, timeout=120)
                if r.status_code not in (200, 201):
                    raise RuntimeError(f"upload {r.status_code} {r.text[:200]}")
                out[view] = {**info, "s": round(time.time() - t, 1)}
            except Exception as e:  # noqa: BLE001 — 가벼운 영상은 덤이다(결과 화면은 원본으로 돈다)
                out[view] = {"error": f"{type(e).__name__}: {str(e)[:200]}"}
    print(f"[pitch3d preview] {out}")
    return out
