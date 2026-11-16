"""완성본(out/<id>.720.mp4) 확인 그림 — 영상마다 한 줄 6장(사람이 가장 왼 · 오른 · 위 · 아래로 간 때 + 고르게 2장), 한 장에 6줄."""
import json, os, sys
import av
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from sheets import main_boxes, font

def frames(path, times):
    out = {}
    with av.open(path) as ct:
        st = ct.streams.video[0]
        for tt in sorted(times):
            ct.seek(int(max(0, tt - 0.3) / st.time_base), stream=st, backward=True)
            for f in ct.decode(st):
                if float(f.pts * st.time_base) >= tt - 0.02: out[tt] = f.to_image(); break
    return out

work = sys.argv[1]; ids = json.load(open(sys.argv[2])); tag = sys.argv[3]
L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
per = 6
for s in range(0, len(ids), per):
    rows = []
    for vid in ids[s:s + per]:
        m = json.load(open(os.path.join(work, 'measure', f'{vid}.json'))); mb = main_boxes(m); ts = sorted(mb)
        pick = set()
        if ts:
            for key in (lambda t: mb[t][0], lambda t: -mb[t][2], lambda t: mb[t][1], lambda t: -mb[t][3]): pick.add(min(ts, key=key))
        k = 0
        while len(pick) < 6 and k < 20: pick.add(round(m['dur'] * (k + 0.5) / 6, 2)); k += 1
        tt = sorted(pick)[:6]
        fr = frames(os.path.join(work, 'out', f'{vid}.720.mp4'), tt)
        rows.append((vid, tt, fr))
    portrait = any(next(iter(fr.values())).height > next(iter(fr.values())).width for _, _, fr in rows if fr)
    tw = 120 if portrait else 200; th = round(tw * 16 / 9) if portrait else round(tw * 9 / 16)
    img = Image.new('RGB', (tw * 6, (th + 18) * len(rows)), (18, 18, 18)); dr = ImageDraw.Draw(img)
    for r, (vid, tt, fr) in enumerate(rows):
        y0 = r * (th + 18)
        dr.text((3, y0 + 1), f"{s + r + 1}. {L[vid]['title']}", fill=(255, 255, 255), font=font(13))
        for c, t in enumerate(tt):
            f = fr.get(t)
            if f: img.paste(f.resize((tw, th)), (c * tw, y0 + 18)); dr.rectangle([c * tw, y0 + 18, c * tw + tw - 1, y0 + 18 + th - 1], outline=(70, 70, 70))
    img.save(os.path.join(work, 'sheets', f'v-{tag}-{s // per + 1:02d}.jpg'), quality=80)
print('ok')
