"""
촬영 영상 다듬기 4단계 — 정한 대로(decisions.json + overrides.json) 앞뒤를 자르고 · 화면을 잘라 키운 새 영상과 썸네일을 out/ 에 만든다.

    py -3.12 scripts/shoot-trim/render.py <작업 폴더> [id …]

- 바꿀 것이 없는 영상(앞뒤 그대로 · 화면 그대로)은 만들지 않는다.
- 색은 원본 그대로: 원본(yuvj420p · BT.709 · 전 범위)의 Y · U · V 면을 RGB 로 바꾸지 않고 그대로 잘라 키운다.
- 출력: 1920×1080 · 원본 fps · H.264(libx264 · CRF 21 · 상한 8Mbps) · 소리 없음 · 앞에 moov(faststart). 원본은 건드리지 않는다.
- 썸네일: 원본 썸네일(640×360)을 같은 판으로 잘라 키운다(화면을 안 잘랐으면 원본 썸네일 그대로 다시 쓴다).
"""
import json
import os
import sys
from fractions import Fraction

import av
import cv2
import numpy as np
from PIL import Image


def plan_of(work):
    d = json.load(open(os.path.join(work, 'decisions.json'), encoding='utf-8'))
    op = os.path.join(work, 'overrides.json')
    ov = json.load(open(op, encoding='utf-8')) if os.path.exists(op) else {}
    out = {}
    for vid, x in d.items():
        p = {'start': x['start'], 'end': x['end'], 'crop': x['crop'], 'dur': x['dur']}
        o = ov.get(vid, {})
        if o.get('skip'):
            continue
        for k in ('start', 'end', 'crop'):
            if k in o:
                p[k] = o[k]
        changed = p['start'] > 0.05 or p['end'] < p['dur'] - 0.05 or p['crop'] is not None
        if changed:
            out[vid] = p
    return out


def resize_plane(a, x, y, w, h, W, H):
    sub = a[y : y + h, x : x + w]
    if (w, h) == (W, H):
        return sub
    return cv2.resize(sub, (W, H), interpolation=cv2.INTER_LANCZOS4)


def render(work, vid, p):
    src = os.path.join(work, 'orig', f'{vid}.mp4')
    dst = os.path.join(work, 'out', f'{vid}.mp4')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with av.open(src) as ic:
        ist = ic.streams.video[0]
        ist.thread_type = 'AUTO'
        W, H = ist.codec_context.width, ist.codec_context.height
        rate = ist.average_rate or Fraction(60)
        if p['crop']:
            cx, cy, cw = p['crop']
            ch = round(cw * H / W)
            cx, cy, cw, ch = cx // 2 * 2, cy // 2 * 2, cw // 2 * 2, ch // 2 * 2
        else:
            cx, cy, cw, ch = 0, 0, W, H
        oc = av.open(dst, 'w', options={'movflags': '+faststart'})
        ost = oc.add_stream('libx264', rate=rate)
        ost.width, ost.height = W, H
        ost.pix_fmt = 'yuvj420p'
        ost.options = {'crf': '21', 'preset': 'medium', 'maxrate': '8M', 'bufsize': '16M', 'g': str(int(round(float(rate))))}
        cc = ost.codec_context
        for k in ('color_range', 'color_primaries', 'color_trc', 'colorspace'):
            try:
                setattr(cc, k, getattr(ist.codec_context, k))
            except Exception:
                pass
        t0 = None
        ic.seek(int(max(0, p['start'] - 1) / ist.time_base), stream=ist, backward=True)
        n = 0
        for fr in ic.decode(ist):
            t = float(fr.pts * ist.time_base)
            if t < p['start'] - 1e-3:
                continue
            if t > p['end'] + 1e-3:
                break
            if t0 is None:
                # 세로로 찍어 회전 표시만 붙은 영상은 다시 만들면 표시가 빠져 눕는다 — 손대지 않는다
                if getattr(fr, 'rotation', 0):
                    raise RuntimeError(f'{vid}: 회전 표시가 있는 영상')
                t0 = fr.pts
            a = fr.to_ndarray(format='yuvj420p') if fr.format.name == 'yuvj420p' else fr.to_ndarray(format='yuv420p')
            Y = a[:H]
            U = a[H : H + H // 4].reshape(H // 2, W // 2)
            V = a[H + H // 4 :].reshape(H // 2, W // 2)
            Y2 = resize_plane(Y, cx, cy, cw, ch, W, H)
            U2 = resize_plane(U, cx // 2, cy // 2, cw // 2, ch // 2, W // 2, H // 2)
            V2 = resize_plane(V, cx // 2, cy // 2, cw // 2, ch // 2, W // 2, H // 2)
            out = np.concatenate([Y2, U2.reshape(-1, W), V2.reshape(-1, W)])
            nf = av.VideoFrame.from_ndarray(out, format='yuvj420p')
            nf.pts = fr.pts - t0
            nf.time_base = ist.time_base
            for pk in ost.encode(nf):
                oc.mux(pk)
            n += 1
        for pk in ost.encode():
            oc.mux(pk)
        oc.close()
    # 썸네일
    tsrc = os.path.join(work, 'orig', f'{vid}.jpg')
    if os.path.exists(tsrc):
        im = Image.open(tsrc).convert('RGB')
        if p['crop']:
            s = im.width / W
            im = im.crop((cx * s, cy * s, (cx + cw) * s, (cy + ch) * s)).resize((im.width, im.height), Image.LANCZOS)
        im.save(os.path.join(work, 'out', f'{vid}.jpg'), quality=85)
    return n, os.path.getsize(dst)


def small(work, vid):
    """앱 재생용 줄인 판(out/<id>.720.mp4) — scripts/library-bundle/compress.swift 와 같은 값: 짧은 변 720 · 60fps 2.5Mbps(30fps 1.8) ·
    키 장면 2초. 저장소 library-720/<uuid>.mp4 로 올라가 재생 · 앱 받기가 원본 대신 쓴다(없으면 원본으로 돈다)."""
    src = os.path.join(work, 'out', f'{vid}.mp4')
    dst = os.path.join(work, 'out', f'{vid}.720.mp4')
    with av.open(src) as ic:
        ist = ic.streams.video[0]
        ist.thread_type = 'AUTO'
        W, H = ist.codec_context.width, ist.codec_context.height
        s = min(1, 720 / min(W, H))
        w, h = round(W * s / 2) * 2, round(H * s / 2) * 2
        rate = ist.average_rate or Fraction(60)
        fps = float(rate)
        oc = av.open(dst, 'w', options={'movflags': '+faststart'})
        ost = oc.add_stream('libx264', rate=rate)
        ost.width, ost.height, ost.pix_fmt = w, h, 'yuv420p'
        br = '2500k' if fps > 45 else '1800k'
        ost.options = {'b': br, 'maxrate': br, 'bufsize': '5M', 'preset': 'medium', 'profile': 'high', 'g': str(int(round(fps)) * 2)}
        # 전 범위(yuvj) → 보통 범위로 바뀌니 꼬리표도 BT.709 보통 범위로
        cc = ost.codec_context
        cc.color_range, cc.color_primaries, cc.color_trc, cc.colorspace = 1, 1, 1, 1
        # 장면 간격이 고르지 않은 영상(가변 fps)을 1/fps 눈금으로 반올림하면 두 장면이 같은 시각이 되어 mux 가 거부한다 — 원본 눈금 그대로
        cc.time_base = ost.time_base = ist.time_base
        for fr in ic.decode(ist):
            nf = fr.reformat(width=w, height=h, format='yuv420p', interpolation='LANCZOS')
            nf.pts, nf.time_base = fr.pts, fr.time_base
            for pk in ost.encode(nf):
                oc.mux(pk)
        for pk in ost.encode():
            oc.mux(pk)
        oc.close()
    return os.path.getsize(dst)


if __name__ == '__main__':
    work = sys.argv[1]
    if sys.argv[2:3] == ['--small']:
        vids = [f[:-4] for f in sorted(os.listdir(os.path.join(work, 'out'))) if f.endswith('.mp4') and not f.endswith('.720.mp4')]
        for i, vid in enumerate(vids, 1):
            if not os.path.exists(os.path.join(work, 'out', f'{vid}.720.mp4')):
                print(f'{i}/{len(vids)} {vid[:8]} {small(work, vid) // 1024}KB', flush=True)
        sys.exit(0)
    only = set(sys.argv[2:])
    plans = plan_of(work)
    with open(os.path.join(work, 'plan.json'), 'w', encoding='utf-8') as f:
        json.dump(plans, f, indent=1)
    todo = [(v, p) for v, p in plans.items() if not only or v in only]
    print(f'만들 것 {len(todo)}개')
    for i, (vid, p) in enumerate(todo, 1):
        if os.path.exists(os.path.join(work, 'out', f'{vid}.mp4')) and not only:
            continue
        n, size = render(work, vid, p)
        print(f'{i}/{len(todo)} {vid[:8]} {n}장 {size // 1024}KB', flush=True)
