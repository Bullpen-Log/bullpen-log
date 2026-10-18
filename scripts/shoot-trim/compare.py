"""
다듬기 전 · 뒤 견주기 — 영상마다 한 줄, 같은 장면 넷을 원본(왼쪽) · 결과(오른쪽) 쌍으로.

    py -3.12 scripts/shoot-trim/compare.py <작업 폴더> <id 앞자리> [<id 앞자리> …]

render.py 뒤에 쓴다(plan.json · out/ 이 있어야). 결과: <작업 폴더>/test/compare.jpg
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decide import FONT, frames_at
from PIL import Image, ImageDraw, ImageFont
work = sys.argv[1]
plan = json.load(open(os.path.join(work, 'plan.json'), encoding='utf-8'))
font = ImageFont.truetype(FONT, 16)
rows = []
for pre in sys.argv[2:]:
    vid = next(v for v in plan if v.startswith(pre))
    p = plan[vid]
    L = p['end'] - p['start']
    ts = [round(L * k / 3 - (0.1 if k == 3 else 0), 2) for k in range(4)]
    o = frames_at(os.path.join(work, 'orig', vid + '.mp4'), [round(p['start'] + t, 2) for t in ts])
    n = frames_at(os.path.join(work, 'out', vid + '.mp4'), ts)
    tw, th = 320, 180
    img = Image.new('RGB', (tw * 8, th + 24), (20, 20, 20))
    dr = ImageDraw.Draw(img)
    for i, t in enumerate(ts):
        img.paste(o[round(p['start'] + t, 2)].resize((tw, th)), (i * 2 * tw, 24))
        img.paste(n[t].resize((tw, th)), ((i * 2 + 1) * tw, 24))
    dr.text((4, 2), f"{pre} 원본 {p['dur']:.1f}s → {p['start']:.1f}~{p['end']:.1f}s · 판 {p['crop']} (쌍마다 왼쪽 원본 · 오른쪽 결과)", fill=(255, 255, 0), font=font)
    rows.append(img)
out = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)))
y = 0
for r in rows:
    out.paste(r, (0, y)); y += r.height
path = os.path.join(work, 'test', 'compare.jpg')
out.save(path, quality=80)
print(path)
