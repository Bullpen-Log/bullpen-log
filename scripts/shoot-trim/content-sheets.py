"""
영상 내용 점검 장면 모음 — 한 장에 운동 셋, 줄마다 영상 전체에서 고르게 뽑은 장면 8장 + 오른쪽에 적힌 내용(도구 · 좌우 · 세트 · 부위 · 설명).

    py -3.12 scripts/shoot-trim/content-sheets.py <내용 점검 폴더>

content-export.mjs 가 만든 rows.json · vid/<id>.mp4 를 읽어 pages/pNNN.jpg 를 쓴다(#번호 = rows.json 차례). 이미 있는 장은 건너뛴다.
"""
import json, os, sys, textwrap
from multiprocessing import Pool
import av
from PIL import Image, ImageDraw, ImageFont
W = sys.argv[1]
rows = json.load(open(os.path.join(W, 'rows.json'), encoding='utf-8'))
from decide import FONT as F

def frames(path, n=8):
    out = []
    with av.open(path) as c:
        s = c.streams.video[0]
        dur = float(s.duration * s.time_base) if s.duration else float(c.duration / 1e6)
        ts = [dur * (0.03 + 0.94 * k / (n - 1)) for k in range(n)]
        for t in ts:
            c.seek(int(t / s.time_base), stream=s, backward=True)
            img = None
            for fr in c.decode(s):
                img = fr
                if float(fr.pts * s.time_base) >= t - 0.02:
                    break
            im = img.to_image()
            rot = getattr(img, 'rotation', 0) or 0
            if rot:
                im = im.rotate(rot, expand=True)
            out.append((t, im))
    return dur, out

def fit(im, w, h):
    im = im.copy(); im.thumbnail((w, h))
    bg = Image.new('RGB', (w, h), (0, 0, 0)); bg.paste(im, ((w - im.width) // 2, (h - im.height) // 2)); return bg

def row(i):
    r = rows[i]
    dur, fs = frames(os.path.join(W, 'vid', r['id'] + '.mp4'))
    img = Image.new('RGB', (1920, 400), (24, 24, 24))
    d = ImageDraw.Draw(img)
    big, sm, tiny = ImageFont.truetype(F, 20), ImageFont.truetype(F, 14), ImageFont.truetype(F, 13)
    for k, (t, im) in enumerate(fs):
        x, y = (k % 4) * 320, 40 + (k // 4) * 180
        img.paste(fit(im, 318, 178), (x, y))
        d.text((x + 4, y + 2), f'{t:.1f}s', fill=(255, 255, 0), font=tiny, stroke_width=2, stroke_fill=(0, 0, 0))
    dose = f"{r['sets'] or '-'}세트 × " + (f"{r['holdSeconds']}초 버티기" if r['holdSeconds'] else f"{r['reps'] or '-'}회")
    d.text((6, 8), f"#{i} {r['title']}  ({r['category']} · {dur:.0f}s · {r['id'][:8]})", fill=(255, 210, 0), font=big)
    meta = f"도구: {', '.join(r['equipment']) or '없음'} | 좌우 따로: {'예' if r['perSide'] else '아니오'} | {dose} | 부위: {', '.join(r['bodyParts'])}"
    y = 8
    for line in textwrap.wrap(meta, 44):
        d.text((1290, y), line, fill=(120, 220, 255), font=sm); y += 17
    y += 4
    for para in r['description'].split('\n'):
        for line in textwrap.wrap(para, 44) or ['']:
            if y > 388: break
            d.text((1290, y), line, fill=(235, 235, 235), font=tiny); y += 16
    return img

def page(p):
    out = os.path.join(W, 'pages', f'p{p:03d}.jpg')
    if os.path.exists(out): return
    ids = list(range(p * 3, min(len(rows), p * 3 + 3)))
    pg = Image.new('RGB', (1920, 400 * len(ids)), (0, 0, 0))
    for k, i in enumerate(ids):
        try:
            pg.paste(row(i), (0, 400 * k))
        except Exception as e:
            ImageDraw.Draw(pg).text((10, 400 * k + 10), f'#{i} 오류 {e}', fill=(255, 0, 0))
    pg.save(out, quality=82)

if __name__ == '__main__':
    with Pool(6) as pool:
        pool.map(page, range((len(rows) + 2) // 3))
    print('pages', len(os.listdir(os.path.join(W, 'pages'))))
