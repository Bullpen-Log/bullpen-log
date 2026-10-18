"""
촬영 영상 다듬기 3단계 — 재 둔 값(measure/<id>.json)으로 어디를 자를지 정하고, 눈으로 볼 장면 모음(sheets/<id>.jpg)을 만든다.

    py -3.12 scripts/shoot-trim/decide.py <작업 폴더> [id …]

규칙(사용자 2026-10-17: "동작 실행 전과 후에 공백이 2초 이상 불필요하게 있거나, 사람이 너무 작게 보이면 크게 보이게 잘라 줘")
- 움직임: 사람 상자 안 움직임(없으면 장면 전체)을 1초로 고르게 펴고, 그 영상의 큰 움직임(80% 지점)의 35% 를 넘는 첫 · 끝 때를 동작의 처음 · 끝으로.
- 끝에서 카메라로 걸어오는 것(사람 상자 높이가 동작 중 가운데 값의 1.45배를 넘거나 화면 밖으로 나감)은 동작이 아니다 — 그 앞에서 끝.
- 앞 · 뒤 빈 시간이 2초 넘으면 동작 앞 0.6초 · 뒤 0.8초만 남기고 자른다(2초 안이면 그대로).
- 사람이 작으면(남긴 구간 사람 상자를 모두 감싼 것이 화면 높이 · 너비의 60% 밑) 그 상자를 감싸는 16:9 로 잘라 키운다. 여백은 상자 키의 12%,
  확대는 1.6배까지(잘린 판 높이 675px 이상 — 1080p 로 다시 키워도 덜 뭉개진다). 화면 비율은 그대로라 화면 칸(aspectRatio)은 안 바뀐다.
결정은 decisions.json 에. 사람이 보고 고칠 것은 overrides.json({ id: { start?, end?, crop?: [x, y, w] | null, skip?: true } })에 적는다.
"""
import json
import os
import sys

import av
import numpy as np
from PIL import Image, ImageDraw, ImageFont

IDLE_MAX = 2.0
LEAD_KEEP = 0.6
TAIL_KEEP = 0.8
SMALL = 0.60
MARGIN = 0.12
ZOOM_MAX = 1.6
APPROACH = 1.45

# 한글 글꼴 — 윈도(맑은 고딕) · 맥(애플 SD 고딕)
FONT = next(
    (p for p in ('C:/Windows/Fonts/malgun.ttf', '/System/Library/Fonts/AppleSDGothicNeo.ttc', '/Library/Fonts/AppleGothic.ttf') if os.path.exists(p)),
    'C:/Windows/Fonts/malgun.ttf',
)


def smooth(xs, n):
    if len(xs) == 0:
        return xs
    k = np.ones(n) / n
    pad = np.pad(xs, (n // 2, n - 1 - n // 2), mode='edge')
    return np.convolve(pad, k, mode='valid')


def decide(m, ov=None):
    """ov = overrides.json 의 그 영상 줄 — 사람이 고친 앞뒤로 잘라 키울 판을 다시 잰다."""
    W, H, dur = m['w'], m['h'], m['dur']
    ss = m['samples']
    t = np.array([s['t'] for s in ss])
    act = np.array([s['mp'] if s['mp'] is not None else (s['m'] if s['m'] is not None else 0.0) for s in ss])
    act = smooth(act, 10)
    boxes = [(s['t'], s['box']) for s in ss if s['box']]
    hi = np.percentile(act, 80) if len(act) else 0
    thr = max(0.015, 0.35 * hi)
    on = act > thr
    idx = np.nonzero(on)[0]
    why = []
    if len(idx) == 0:
        # 움직임을 못 찾으면 앞뒤는 그대로 — 사람 크기만 본다
        idx = np.arange(len(t))
        why.append('움직임 못 찾음 · 앞뒤 그대로')
    a0, a1 = t[idx[0]], t[idx[-1]]
    # 끝에서 카메라로 걸어오기: 동작 중 상자 높이 가운데 값의 1.45배를 넘거나 상자가 사라진 첫 때(동작 뒤쪽 절반에서만)
    mid = [b for (bt, b) in boxes if a0 + (a1 - a0) * 0.2 <= bt <= a0 + (a1 - a0) * 0.6]
    base_h = float(np.median([b[3] - b[1] for b in mid])) if mid else None
    if base_h:
        half = a0 + (a1 - a0) * 0.5
        for bt, b in boxes:
            if bt < half:
                continue
            h = b[3] - b[1]
            if h > APPROACH * base_h or (b[0] <= 2 or b[2] >= W - 2) and h > 1.2 * base_h:
                if bt < a1:
                    why.append(f'{bt:.1f}초부터 카메라 쪽으로 걸어옴')
                    # 그 앞에서 움직임이 가라앉은 마지막 때
                    before = [i for i in idx if t[i] < bt - 0.3]
                    a1 = t[before[-1]] if before else bt
                break
    start = 0.0
    end = dur
    if why and why[0].startswith('움직임 못 찾음'):
        pass
    elif a0 > IDLE_MAX:
        start = round(max(0.0, a0 - LEAD_KEEP), 2)
        why.append(f'앞 {a0:.1f}초 빈 시간')
    if not (why and why[0].startswith('움직임 못 찾음')) and dur - a1 > IDLE_MAX:
        end = round(min(dur, a1 + TAIL_KEEP), 2)
        why.append(f'뒤 {dur - a1:.1f}초 빈 시간')
    if ov and ('start' in ov or 'end' in ov):
        start, end = ov.get('start', start), ov.get('end', end)
        why = ['사람 눈으로 고침']
    # 사람 크기 — 남긴 구간의 상자 전부(가장 바깥). 서 있는 자세를 빼면 일어설 때 머리가 잘렸다(2026-10-17).
    kept = [b for (bt, b) in boxes if start <= bt <= end]
    crop = None
    if len(kept) >= 3:
        arr = np.array(kept, dtype=float)
        # 작은지는 평소 크기(바깥 5 · 95%)로, 판은 모든 상자를 감싸게
        tw = np.percentile(arr[:, 2], 95) - np.percentile(arr[:, 0], 5)
        th = np.percentile(arr[:, 3], 95) - np.percentile(arr[:, 1], 5)
        x1, y1 = arr[:, 0].min(), arr[:, 1].min()
        x2, y2 = arr[:, 2].max(), arr[:, 3].max()
        bw, bh = x2 - x1, y2 - y1
        if th < SMALL * H and tw < SMALL * W:
            pad = MARGIN * bh
            x1, y1, x2, y2 = x1 - pad, y1 - pad, x2 + pad, y2 + pad
            need_w = max(x2 - x1, (y2 - y1) * W / H)
            cw = max(need_w, W / ZOOM_MAX)
            cw = min(cw, W)
            ch = cw * H / W
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            x = min(max(0, cx - cw / 2), W - cw)
            y = min(max(0, cy - ch / 2), H - ch)
            zoom = W / cw
            if zoom >= 1.15:
                crop = [int(round(x)), int(round(y)), int(round(cw))]
                why.append(f'사람이 작음(키 {bh / H:.0%}) → {zoom:.2f}배')
    if ov and 'crop' in ov:
        crop = ov['crop']
        why.append('화면 그대로' if crop is None else '판 직접')
    return {'start': start, 'end': end, 'crop': crop, 'why': why or ['그대로'], 'active': [round(float(a0), 2), round(float(a1), 2)]}


def frames_at(path, times):
    out = {}
    with av.open(path) as ct:
        st = ct.streams.video[0]
        for tt in times:
            ct.seek(int(tt / st.time_base), stream=st, backward=True, any_frame=False)
            img = None
            for fr in ct.decode(st):
                ft = float(fr.pts * st.time_base)
                img = fr
                if ft >= tt - 0.02:
                    break
            out[tt] = img.to_image() if img else None
    return out


def sheet(work, item, m, d):
    """확인 그림 — 앞 4초 · 가운데 · 뒤 4초(0.8초 간격) 세 줄 + 움직임 곡선. 빨간 테두리 = 자를 곳, 노란 상자 = 잘라 키울 판."""
    dur = m['dur']
    W, H = m['w'], m['h']
    head = [round(min(dur, 0.8 * i), 2) for i in range(6)]
    tail = [round(max(0.0, dur - 0.05 - 0.8 * (5 - i)), 2) for i in range(6)]
    midt = [round(dur * (i + 1) / 7, 2) for i in range(6)]
    times = sorted(set(head + midt + tail))
    fr = frames_at(os.path.join(work, 'orig', f"{m['id']}.mp4"), times)
    tw, th = 266, 150
    rows = [head, midt, tail]
    img = Image.new('RGB', (tw * 6, th * 3 + 110), (20, 20, 20))
    dr = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 18)
    small = ImageFont.truetype(FONT, 14)
    sx = tw / W
    for r, row in enumerate(rows):
        for c, tt in enumerate(row):
            x0, y0 = c * tw, r * th
            f = fr.get(tt)
            if f:
                img.paste(f.resize((tw, th)), (x0, y0))
            if d['crop']:
                cx, cy, cw = d['crop']
                ch = cw * H / W
                dr.rectangle([x0 + cx * sx, y0 + cy * sx, x0 + (cx + cw) * sx, y0 + (cy + ch) * sx], outline=(255, 210, 0), width=2)
            if not (d['start'] - 1e-3 <= tt <= d['end'] + 1e-3):
                dr.rectangle([x0, y0, x0 + tw - 1, y0 + th - 1], outline=(255, 50, 50), width=4)
            dr.text((x0 + 4, y0 + 2), f'{tt:.1f}', fill=(255, 255, 255), font=small, stroke_width=2, stroke_fill=(0, 0, 0))
    # 움직임 곡선(흰 선) · 사람 키(초록 점) · 남길 구간(파랑)
    y = th * 3 + 6
    L = tw * 6 - 20
    gh = 60
    dr.rectangle([10, y, 10 + L, y + gh], fill=(40, 40, 40))
    dr.rectangle([10 + L * d['start'] / dur, y + gh - 6, 10 + L * d['end'] / dur, y + gh], fill=(10, 132, 214))
    ss = m['samples']
    acts = [s['mp'] if s['mp'] is not None else (s['m'] or 0) for s in ss]
    top = max(max(acts) if acts else 0, 1e-6)
    pts = [(10 + L * s['t'] / dur, y + gh - 8 - (gh - 12) * a / top) for s, a in zip(ss, acts)]
    if len(pts) > 1:
        dr.line(pts, fill=(255, 255, 255), width=1)
    for s in ss:
        if s['box']:
            hh = (s['box'][3] - s['box'][1]) / H
            dr.ellipse([10 + L * s['t'] / dur - 1.5, y + gh - 8 - (gh - 12) * hh - 1.5, 10 + L * s['t'] / dur + 1.5, y + gh - 8 - (gh - 12) * hh + 1.5], fill=(0, 220, 120))
    for k in range(int(dur) + 1):
        xx = 10 + L * k / dur
        dr.line([xx, y + gh, xx, y + gh + 4], fill=(150, 150, 150))
    dr.text((10, y + gh + 8), f"{item.get('title', '')} · {dur:.1f}s → {d['start']:.1f}~{d['end']:.1f}s · {' · '.join(d['why'])}", fill=(255, 255, 255), font=font)
    os.makedirs(os.path.join(work, 'sheets'), exist_ok=True)
    img.save(os.path.join(work, 'sheets', f"{m['id']}.jpg"), quality=80)


if __name__ == '__main__':
    work = sys.argv[1]
    only = set(sys.argv[2:])
    items = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json'), encoding='utf-8'))}
    path = os.path.join(work, 'decisions.json')
    decisions = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    op = os.path.join(work, 'overrides.json')
    overrides = json.load(open(op, encoding='utf-8')) if os.path.exists(op) else {}
    no_sheets = '--no-sheets' in only
    only.discard('--no-sheets')
    for vid, item in items.items():
        if only and vid not in only:
            continue
        mp = os.path.join(work, 'measure', f'{vid}.json')
        if not os.path.exists(mp):
            continue
        m = json.load(open(mp, encoding='utf-8'))
        d = decide(m, overrides.get(vid))
        d['title'] = item.get('title')
        d['dur'] = m['dur']
        decisions[vid] = d
        if not no_sheets:
            sheet(work, item, m, d)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(decisions, f, ensure_ascii=False, indent=1)
    print(len(decisions), 'decisions')
