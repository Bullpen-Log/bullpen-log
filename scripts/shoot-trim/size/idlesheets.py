"""빈 시간 후보 확인 그림 — 영상마다 앞 · 뒤 줄. 빨강 테두리 = 잘릴 장면, 초록 = 남는 장면, 숫자 = 시각 · 움직임(×1000). 한 장에 4개."""
import json, os, sys
import av
from PIL import Image, ImageDraw, ImageFont
F = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 13); F2 = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 14)
work = sys.argv[1]; ids = json.load(open(sys.argv[2])); tag = sys.argv[3]
idle = json.load(open(os.path.join(work, 'idle.json')))
ov = json.load(open(os.path.join(work, 'idle-ov.json'))) if os.path.exists(os.path.join(work, 'idle-ov.json')) else {}
L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
TW, TH, NMAX = 214, 120, 6
def grab(path, times):
    out = {}
    with av.open(path) as ct:
        st = ct.streams.video[0]
        for tt in sorted(times):
            ct.seek(int(max(0, tt - 0.4) / st.time_base), stream=st, backward=True)
            for f in ct.decode(st):
                if float(f.pts * st.time_base) >= tt - 0.02: out[tt] = f.to_image(); break
    return out
def span(a, b):
    n = max(2, min(NMAX, int((b - a) / 0.5) + 1)); return [round(a + (b - a) * i / (n - 1), 2) for i in range(n)]
for s in range(0, len(ids), 3):
    blocks = []
    for vid in ids[s:s + 3]:
        r = dict(idle[vid]); r.update(ov.get(vid, {}))
        mo = {round(x[0], 1): x[1] for x in json.load(open(os.path.join(work, 'motion', f'{vid}.json')))['rows']}
        rows = []
        if r['start'] > 0: rows.append(('앞', span(0, min(r['dur'], r['start'] + 1.5))))
        if r['end'] < r['dur'] - 0.05: rows.append(('뒤', span(max(0, r['end'] - 1.5), r['dur'] - 0.05)))
        if not rows: rows.append(('전체', span(0, r['dur'] - 0.05)))
        fr = grab(os.path.join(work, 'orig', f"{vid}{L[vid]['ext']}"), [t for _, ts in rows for t in ts])
        blocks.append((vid, r, rows, fr, mo))
    H = sum(22 + len(b[2]) * (TH + 14) for b in blocks)
    img = Image.new('RGB', (TW * NMAX + 30, H), (18, 18, 18)); d = ImageDraw.Draw(img); y = 0
    for vid, r, rows, fr, mo in blocks:
        d.text((4, y + 3), f"{s + blocks.index((vid, r, rows, fr, mo)) + 1}. {r['title']} · {r['dur']:.1f}초 → {r['start']:.1f}~{r['end']:.1f} · 앞 {r['head']:.1f}·뒤 {r['tail']:.1f} {' '.join(r.get('why') or [])} [{vid[:8]}]", fill=(255, 255, 255), font=F2)
        y += 22
        for lab, ts in rows:
            d.text((2, y + 20), lab, fill=(200, 200, 200), font=F2)
            for i, t in enumerate(ts):
                f = fr.get(t); x0 = 30 + i * TW
                if f: img.paste(f.resize((TW - 4, TH)), (x0, y))
                cut = t < r['start'] - 1e-3 or t > r['end'] + 1e-3
                d.rectangle([x0 - 1, y - 1, x0 + TW - 4, y + TH], outline=(230, 50, 50) if cut else (40, 200, 90), width=2)
                d.text((x0 + 2, y + TH + 1), f"{t:.1f} {mo.get(round(t, 1), 0) * 1000:.0f}", fill=(220, 220, 220), font=F)
            y += TH + 14
    img.save(os.path.join(work, 'sheets', f'i-{tag}-{s // 3 + 1:02d}.jpg'), quality=80)
print('ok')
