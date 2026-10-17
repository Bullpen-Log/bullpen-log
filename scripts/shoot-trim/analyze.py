"""
촬영 영상 다듬기 2단계 — 영상마다 사람 상자(YOLOX · rtmlib)와 움직임을 장면별로 잰다.

    py -3.12 scripts/shoot-trim/analyze.py <작업 폴더> [병렬 수]

작업 폴더의 list.json · orig/<id>.mp4 를 읽어 measure/<id>.json 을 쓴다(이미 있으면 건너뜀).
- 10fps 마다: 장면 전체 움직임(앞 표본과 밝기 차가 18 넘는 칸의 비율, 160×90)과 사람 상자 안 움직임
- 5fps 마다: 사람 상자(YOLOX-tiny, 점수 0.5 넘는 것 중 가장 큰 것, 1920×1080 좌표)
판정(어디를 자를지)은 decide.py 가 한다. 영상 원본은 건드리지 않는다.
"""
import json
import os
import sys
from multiprocessing import Pool

import av
import cv2
import numpy as np

# 사람 상자만 쓰니 가벼운 tiny(416) — m(640)은 영상 하나에 20초, 170개면 한 시간이 넘었다
DET_URL = (
    'https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/'
    'yolox_tiny_8xb8-300e_humanart-6f3252f9.zip'
)
DET_SIZE = (416, 416)
MOTION_EVERY = 6  # 60fps → 10fps
DET_EVERY = 12  # 60fps → 5fps
DIFF_THR = 18

_det = None


def detector():
    global _det
    if _det is None:
        from rtmlib import YOLOX

        _det = YOLOX(DET_URL, model_input_size=DET_SIZE, score_thr=0.5, backend='onnxruntime', device='cpu')
    return _det


def measure(args):
    work, vid = args
    out = os.path.join(work, 'measure', f'{vid}.json')
    if os.path.exists(out):
        return vid, 'skip'
    src = os.path.join(work, 'orig', f'{vid}.mp4')
    det = detector()
    samples = []
    prev = None
    box = None
    with av.open(src) as ct:
        st = ct.streams.video[0]
        st.thread_type = 'AUTO'
        W, H = st.codec_context.width, st.codec_context.height
        fps = float(st.average_rate)
        dur = float(st.duration * st.time_base) if st.duration else None
        for i, fr in enumerate(ct.decode(st)):
            if i % MOTION_EVERY:
                continue
            t = float(fr.pts * st.time_base) if fr.pts is not None else i / fps
            small = fr.reformat(width=960, height=540, format='bgr24').to_ndarray()
            if i % DET_EVERY == 0:
                boxes = det(small)
                best = None
                for b in boxes if boxes is not None else []:
                    x1, y1, x2, y2 = [float(v) * 2 for v in b[:4]]
                    a = (x2 - x1) * (y2 - y1)
                    if best is None or a > best[0]:
                        best = (a, [round(x1), round(y1), round(x2), round(y2)])
                box = best[1] if best else None
            g = cv2.cvtColor(cv2.resize(small, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.int16)
            m = mp = None
            if prev is not None:
                d = np.abs(g - prev) > DIFF_THR
                m = float(d.mean())
                if box:
                    bx1, by1 = max(0, box[0] * 160 // W), max(0, box[1] * 90 // H)
                    bx2, by2 = min(160, box[2] * 160 // W + 1), min(90, box[3] * 90 // H + 1)
                    sub = d[by1:by2, bx1:bx2]
                    mp = float(sub.mean()) if sub.size else None
            prev = g
            samples.append({'t': round(t, 3), 'box': box if i % DET_EVERY == 0 else None, 'm': m, 'mp': mp})
    res = {'id': vid, 'w': W, 'h': H, 'fps': fps, 'dur': dur or (samples[-1]['t'] if samples else 0), 'samples': samples}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(res, f)
    return vid, 'ok'


if __name__ == '__main__':
    work = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    items = json.load(open(os.path.join(work, 'list.json'), encoding='utf-8'))
    jobs = [(work, e['id']) for e in items]
    done = 0
    with Pool(n) as pool:
        for vid, st in pool.imap_unordered(measure, jobs):
            done += 1
            if done % 10 == 0 or done == len(jobs):
                print(f'{done}/{len(jobs)}', flush=True)
