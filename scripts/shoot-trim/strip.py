"""
장면 띠 — 한 영상의 한 구간을 촘촘히 늘어놓는다(앞뒤 빈 시간 · 자를 곳을 눈으로 정할 때).

    py -3.12 scripts/shoot-trim/strip.py <작업 폴더> <id 앞자리> <시작 초> <끝 초> <간격 초> [x0 y0 x1 y1 (0~1 확대)]

결과: <작업 폴더>/test/strip-<id 앞자리>.jpg
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decide import frames_at
from PIL import Image, ImageDraw
work, pre, t0, t1, step = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
box = [float(v) for v in sys.argv[6:10]] if len(sys.argv) >= 10 else [0, 0, 1, 1]
vid = next(e['id'] for e in json.load(open(os.path.join(work, 'list.json'), encoding='utf-8')) if e['id'].startswith(pre))
ts = []
t = t0
while t <= t1 + 1e-6:
    ts.append(round(t, 2)); t += step
fr = frames_at(os.path.join(work, 'orig', vid + '.mp4'), ts)
tw, th = 320, 180
cols = 6
rows = (len(ts) + cols - 1) // cols
img = Image.new('RGB', (tw * cols, th * rows), (0, 0, 0))
dr = ImageDraw.Draw(img)
for i, tt in enumerate(ts):
    f = fr[tt]
    W, H = f.size
    f = f.crop((box[0] * W, box[1] * H, box[2] * W, box[3] * H)).resize((tw, th))
    x, y = (i % cols) * tw, (i // cols) * th
    img.paste(f, (x, y))
    dr.text((x + 4, y + 2), f'{tt:.2f}', fill=(255, 255, 0))
out = os.path.join(work, 'test', f'strip-{pre}.jpg')
img.save(out, quality=80)
print(out)
