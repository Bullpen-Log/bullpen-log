"""자르는 지점 확인 — 영상마다 자르는 곳 앞뒤 2.5초를 0.25초 간격 11장. 빨강 = 잘릴 장면."""
import json, os, sys
import av
from PIL import Image, ImageDraw, ImageFont
F = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 12); F2 = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 14)
work = sys.argv[1]; T = json.load(open(os.path.join(work, 'trims.json'))); L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
rows = []
for vid, t in T.items():
    if t['start'] > 0: rows.append((vid, 'start', [round(t['start'] - 1.0 + 0.25 * i, 2) for i in range(11)]))
    if t['end'] < t['dur'] - 0.05: rows.append((vid, 'end', [round(t['end'] - 1.5 + 0.25 * i, 2) for i in range(11)]))
TW, TH = 116, 66
def grab(path, times):
    out = {}
    with av.open(path) as ct:
        st = ct.streams.video[0]
        for tt in sorted(times):
            ct.seek(int(max(0, tt - 0.4) / st.time_base), stream=st, backward=True)
            for f in ct.decode(st):
                if float(f.pts * st.time_base) >= tt - 0.02: out[tt] = f.to_image(); break
    return out
for s in range(0, len(rows), 7):
    ch = rows[s:s + 7]
    img = Image.new('RGB', (TW * 11, (TH + 34) * len(ch)), (18, 18, 18)); d = ImageDraw.Draw(img)
    for r, (vid, side, ts) in enumerate(ch):
        t = T[vid]; y = r * (TH + 34)
        fr = grab(os.path.join(work, 'orig', f"{vid}{L[vid]['ext']}"), [x for x in ts if 0 <= x <= t['dur']])
        d.text((3, y + 1), f"{L[vid]['title']} · {'앞을' if side == 'start' else '뒤를'} {t[side]:.2f}초에서 자름 [{vid[:8]}]", fill=(255, 255, 255), font=F2)
        for i, x in enumerate(ts):
            f = fr.get(x)
            if f is None: continue
            img.paste(f.resize((TW - 3, TH)), (i * TW, y + 18))
            cut = (side == 'start' and x < t['start']) or (side == 'end' and x > t['end'])
            d.rectangle([i * TW, y + 18, i * TW + TW - 4, y + 18 + TH], outline=(230, 50, 50) if cut else (40, 200, 90), width=2)
            d.text((i * TW + 2, y + 18 + TH), f'{x:.2f}', fill=(200, 200, 200), font=F)
    img.save(os.path.join(work, 'sheets', f'cut-{s // 7 + 1}.jpg'), quality=82)
print('ok', len(rows))
