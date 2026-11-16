"""
확인 그림.
  grid  : 모든 영상 한 칸씩(가운데 장면 + 사람 상자 초록 + 판 노랑) → sheets/grid-NN.jpg
  detail <id…> : 영상마다 8장(위 두 줄 원본+상자+판, 아래 두 줄 판대로 자른 모습) → sheets/d-<id>.jpg
"""
import json, os, sys
import av
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from plan import tracks_of

FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
def font(n): return ImageFont.truetype(FONT, n)

def frames_at(path, times):
    out = {}
    with av.open(path) as ct:
        st = ct.streams.video[0]
        for tt in sorted(times):
            ct.seek(int(max(0, tt) / st.time_base), stream=st, backward=True, any_frame=False)
            img = None
            for fr in ct.decode(st):
                img = fr
                if float(fr.pts * st.time_base) >= tt - 0.02: break
            out[tt] = img.to_image() if img else None
    return out

def crop_box(p, W, H):
    c = p.get('crop') or (p.get('auto') if os.environ.get('SHOW_AUTO') and p.get('zoom', 1) > 1.01 else None)
    if not c: return None
    x, y, cw = c; return [x, y, x + cw, y + cw * H / W]

def main_boxes(m):
    tr = tracks_of(m['dets'])
    return dict(tr[0]['items']) if tr else {}

def detail(work, vid, plan, L):
    m = json.load(open(os.path.join(work, 'measure', f'{vid}.json')))
    p = plan[vid]; W, H = m['w'], m['h']; e = L[vid]
    mb = main_boxes(m)
    ts = sorted(mb)
    dur = m['dur']
    pick = set()
    if ts:
        for key in (lambda t: mb[t][0], lambda t: -mb[t][2], lambda t: mb[t][1], lambda t: -mb[t][3]):
            pick.add(min(ts, key=key))
    k = 0
    while len(pick) < 8:
        pick.add(round(dur * (k + 0.5) / 8, 2)); k += 1
        if k > 30: break
    times = sorted(pick)[:8]
    fr = frames_at(os.path.join(work, 'orig', f"{vid}{e['ext']}"), times)
    tw = 260; th = round(tw * H / W)
    cb = crop_box(p, W, H)
    img = Image.new('RGB', (tw * 4, th * 4 + 34), (18, 18, 18))
    dr = ImageDraw.Draw(img); sx = tw / W
    for i, tt in enumerate(times):
        f = fr.get(tt)
        if f is None: continue
        c, r = i % 4, i // 4
        x0, y0 = c * tw, 34 + r * th
        img.paste(f.resize((tw, th)), (x0, y0))
        near = min(m['dets'], key=lambda d: abs(d['t'] - tt)) if m['dets'] else None
        for b in (near['b'] if near else []):
            dr.rectangle([x0 + b[0]*sx, y0 + b[1]*sx, x0 + b[2]*sx, y0 + b[3]*sx], outline=(150, 150, 150), width=1)
        bt = min(mb, key=lambda t: abs(t - tt)) if mb else None
        if bt is not None and abs(bt - tt) < 0.3:
            b = mb[bt]; dr.rectangle([x0 + b[0]*sx, y0 + b[1]*sx, x0 + b[2]*sx, y0 + b[3]*sx], outline=(0, 230, 120), width=2)
        if cb: dr.rectangle([x0 + cb[0]*sx, y0 + cb[1]*sx, x0 + cb[2]*sx, y0 + cb[3]*sx], outline=(255, 210, 0), width=2)
        dr.text((x0 + 3, y0 + 1), f'{tt:.1f}', fill=(255, 255, 255), font=font(13), stroke_width=2, stroke_fill=(0, 0, 0))
        # 아래: 판대로 자른 모습
        y1 = 34 + (2 + r) * th
        cc = f.crop(tuple(int(v) for v in cb)) if cb else f
        img.paste(cc.resize((tw, th)), (x0, y1))
        dr.rectangle([x0, y1, x0 + tw - 1, y1 + th - 1], outline=(255, 210, 0) if cb else (90, 90, 90), width=1)
    z = p['zoom'] if p.get('crop') else 1
    dr.text((6, 6), f"{e['category']} · {e['title']} · {p['dur']:.0f}s · 확대 {z:.2f}배 (자동 {p.get('zoom',1):.2f}) · 키 {p.get('hmed',0):.0%} · 범위 {p.get('fillW',0):.0%}×{p.get('fillH',0):.0%} · {vid[:8]}",
            fill=(255, 255, 255), font=font(17))
    os.makedirs(os.path.join(work, 'sheets'), exist_ok=True)
    img.save(os.path.join(work, 'sheets', f'd-{vid[:8]}.jpg'), quality=82)

def grid(work, plan, L, order):
    tw, th, cols, rows = 256, 144, 5, 6
    per = cols * rows
    for s in range(0, len(order), per):
        img = Image.new('RGB', (tw * cols, (th + 20) * rows), (18, 18, 18)); dr = ImageDraw.Draw(img)
        for i, vid in enumerate(order[s:s + per]):
            m = json.load(open(os.path.join(work, 'measure', f'{vid}.json'))); p = plan[vid]; e = L[vid]
            W, H = m['w'], m['h']; mb = main_boxes(m)
            ts = sorted(mb); tt = ts[len(ts)//2] if ts else m['dur'] / 2
            f = frames_at(os.path.join(work, 'orig', f"{vid}{e['ext']}"), [tt]).get(tt)
            c, r = i % cols, i // cols; x0, y0 = c * tw, r * (th + 20)
            if f: img.paste(f.resize((tw, th)), (x0, y0))
            sx = tw / W
            if mb:
                b = mb[min(mb, key=lambda t: abs(t - tt))]
                dr.rectangle([x0 + b[0]*sx, y0 + b[1]*sx, x0 + b[2]*sx, y0 + b[3]*sx], outline=(0, 230, 120), width=1)
            cb = crop_box(p, W, H)
            if cb: dr.rectangle([x0 + cb[0]*sx, y0 + cb[1]*sx, x0 + cb[2]*sx, y0 + cb[3]*sx], outline=(255, 210, 0), width=2)
            lab = f"{s+i+1}. {e['title'][:13]} {p.get('zoom',1):.2f}"
            dr.text((x0 + 2, y0 + th + 2), lab, fill=(255, 255, 255), font=font(13))
        img.save(os.path.join(work, 'sheets', f'grid-{s//per+1:02d}.jpg'), quality=80)

if __name__ == '__main__':
    work = sys.argv[1]
    plan = json.load(open(os.path.join(work, 'plan.json')))
    L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
    os.makedirs(os.path.join(work, 'sheets'), exist_ok=True)
    if sys.argv[2] == 'grid':
        cand = sorted([v for v in plan if plan[v].get('crop')], key=lambda v: -plan[v].get('zoom', 1))
        rest = sorted([v for v in plan if not plan[v].get('crop')], key=lambda v: plan[v].get('hmed', 1))
        order = cand + rest
        json.dump(order, open(os.path.join(work, 'grid-order.json'), 'w'))
        grid(work, plan, L, order)
    else:
        for a in sys.argv[3:]:
            vid = next(v for v in plan if v.startswith(a))
            detail(work, vid, plan, L)
