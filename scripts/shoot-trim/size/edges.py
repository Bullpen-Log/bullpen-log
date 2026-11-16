"""시작 · 끝 장면 모음 — 영상마다 [앞 5초] 또는 [뒤 5초]를 0.5초 간격 10장. 숫자 = 시각."""
import json, os, sys
import av
from PIL import Image, ImageDraw, ImageFont
F = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 12); F2 = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 14)
work, spec, tag = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
pr = json.load(open(os.path.join(work, 'probe.json')))
TW, TH = 128, 72
def grab(path, times):
    out = {}
    with av.open(path) as ct:
        st = ct.streams.video[0]
        for tt in sorted(times):
            ct.seek(int(max(0, tt - 0.4) / st.time_base), stream=st, backward=True)
            for f in ct.decode(st):
                if float(f.pts * st.time_base) >= tt - 0.02: out[tt] = f.to_image(); break
    return out
per = 8
for s in range(0, len(spec), per):
    chunk = spec[s:s + per]
    img = Image.new('RGB', (TW * 10, (TH + 34) * len(chunk)), (18, 18, 18)); d = ImageDraw.Draw(img)
    for r, (vid, side) in enumerate(chunk):
        dur = pr[vid]['dur']; y = r * (TH + 34)
        ts = [round(i * 0.5, 2) for i in range(10)] if side == 'head' else [round(max(0, dur - 0.05 - (9 - i) * 0.5), 2) for i in range(10)]
        fr = grab(os.path.join(work, 'orig', f"{vid}{L[vid]['ext']}"), ts)
        d.text((3, y + 1), f"{s + r + 1}. {L[vid]['title']} · {'앞' if side == 'head' else '뒤'} · {dur:.1f}초 [{vid[:8]}]", fill=(255, 255, 255), font=F2)
        for i, t in enumerate(ts):
            f = fr.get(t)
            if f: img.paste(f.resize((TW - 2, TH)), (i * TW, y + 18))
            d.text((i * TW + 2, y + 18 + TH), f'{t:.1f}', fill=(200, 200, 200), font=F)
    img.save(os.path.join(work, 'sheets', f'e-{tag}-{s // per + 1:02d}.jpg'), quality=80)
print('ok')
