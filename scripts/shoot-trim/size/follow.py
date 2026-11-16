"""
따라가는 판(이동하는 운동) — 사람 상자를 부드럽게 따라가며 확대 · 위치가 천천히 바뀌는 판을 만든다.
  python follow.py plan <작업 폴더> <id앞자리> [zmax] [fill]   → follow/<id>.json(10Hz 판 줄) + sheets/f-<id>.jpg
  python follow.py render <작업 폴더> <id앞자리>                → out/<id>.mp4 · .720.mp4 · .jpg
판 조건: 사람 상자(+여백)가 늘 판 안 · 확대 1~zmax · 확대/위치는 가우스로 부드럽게(확대 σ0.8초, 위치 σ0.6초) 한 뒤 다시 감싸기 확인.
"""
import json, os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from plan import tracks_of

MX, MT, MB = 0.10, 0.14, 0.08

def gauss(x, sig, dt=0.1):
    n = max(1, int(round(sig / dt * 3)))
    k = np.exp(-0.5 * (np.arange(-n, n + 1) * dt / sig) ** 2); k /= k.sum()
    pad = np.pad(x, n, mode='edge')
    return np.convolve(pad, k, mode='valid')

def medfilt(x, n=5):
    h = n // 2; p = np.pad(x, h, mode='edge')
    return np.array([np.median(p[i:i + n]) for i in range(len(x))])

def keyframes(m, zmax=2.2, fill=0.62, track_items=None):
    W, H, dur = m['w'], m['h'], m['dur']
    items = track_items or tracks_of(m['dets'])[0]['items']
    ts = np.array([t for t, _ in items]); bs = np.array([b for _, b in items], float)
    grid = np.arange(0, dur + 1e-6, 0.1)
    B = np.stack([np.interp(grid, ts, bs[:, k]) for k in range(4)], 1)
    B = np.stack([medfilt(B[:, k], 5) for k in range(4)], 1)
    bw, bh = B[:, 2] - B[:, 0], B[:, 3] - B[:, 1]
    # 담을 상자(여백 포함)
    E = np.stack([B[:, 0] - MX * bw, B[:, 1] - MT * bh, B[:, 2] + MX * bw, B[:, 3] + MB * bh], 1)
    zfit = np.minimum(W / (E[:, 2] - E[:, 0]), H / (E[:, 3] - E[:, 1]))
    zdes = np.clip(np.minimum(H * fill / bh, zfit), 1, zmax)
    lz = gauss(np.log(zdes), 2.0)
    for _ in range(8):
        lz = np.minimum(lz, np.log(np.clip(zfit, 1, zmax)))
        lz = gauss(lz, 0.5)
    lz = np.minimum(lz, np.log(np.clip(zfit, 1, zmax)))
    z = np.exp(lz)
    cx = gauss((E[:, 0] + E[:, 2]) / 2, 1.0); cy = gauss((E[:, 1] + E[:, 3]) / 2, 1.0)
    for it in range(8):
        cw, ch = W / z, H / z
        # 담을 상자가 판 밖이면 판을 옮김
        x0 = np.clip(cx - cw / 2, E[:, 2] - cw, E[:, 0]); y0 = np.clip(cy - ch / 2, E[:, 3] - ch, E[:, 1])
        x0 = np.clip(x0, 0, W - cw); y0 = np.clip(y0, 0, H - ch)
        ncx, ncy = x0 + cw / 2, y0 + ch / 2
        if it < 7:
            cx, cy = gauss(ncx, 0.4), gauss(ncy, 0.4)
        else:
            cx, cy = ncx, ncy
    cw, ch = W / z, H / z
    x0, y0 = cx - cw / 2, cy - ch / 2
    inside = (E[:, 0] >= x0 - 1) & (E[:, 2] <= x0 + cw + 1) & (E[:, 1] >= y0 - 1) & (E[:, 3] <= y0 + ch + 1)
    raw_in = (B[:, 0] >= x0 - 1) & (B[:, 2] <= x0 + cw + 1) & (B[:, 1] >= y0 - 1) & (B[:, 3] <= y0 + ch + 1)
    return {'t': grid.round(2).tolist(), 'x': x0.round(2).tolist(), 'y': y0.round(2).tolist(), 'w': cw.round(2).tolist(),
            'z': z.round(3).tolist(), 'margin_ok': float(inside.mean()), 'box_ok': float(raw_in.mean()),
            'zrate': float(np.abs(np.diff(np.log(z))).max() / 0.1), 'pan': float(np.hypot(np.diff(cx), np.diff(cy)).max() / 0.1 / W)}

def sheet(work, vid, kf, e, n=12):
    import av
    from PIL import Image, ImageDraw
    from sheets import font
    m = json.load(open(os.path.join(work, 'measure', f'{vid}.json'))); W, H = m['w'], m['h']
    times = [round(m['dur'] * (i + 0.5) / n, 2) for i in range(n)]
    fr = {}
    with av.open(os.path.join(work, 'orig', f"{vid}{e['ext']}")) as ct:
        st = ct.streams.video[0]
        for tt in times:
            ct.seek(int(tt / st.time_base), stream=st, backward=True)
            for f in ct.decode(st):
                if float(f.pts * st.time_base) >= tt - 0.02: fr[tt] = f.to_image(); break
    tw = 260; th = round(tw * H / W); cols = 4; rows = (n + cols - 1) // cols
    img = Image.new('RGB', (tw * cols, th * rows * 2 + 30), (18, 18, 18)); dr = ImageDraw.Draw(img)
    for i, tt in enumerate(times):
        f = fr.get(tt)
        if f is None: continue
        k = min(range(len(kf['t'])), key=lambda j: abs(kf['t'][j] - tt))
        x, y, w = kf['x'][k], kf['y'][k], kf['w'][k]; h = w * H / W
        c, r = i % cols, i // cols
        x0, y0 = c * tw, 30 + r * th
        img.paste(f.resize((tw, th)), (x0, y0)); s = tw / W
        dr.rectangle([x0 + x * s, y0 + y * s, x0 + (x + w) * s, y0 + (y + h) * s], outline=(255, 210, 0), width=2)
        dr.text((x0 + 3, y0 + 1), f'{tt:.1f} {kf["z"][k]:.2f}x', fill=(255, 255, 255), font=font(13), stroke_width=2, stroke_fill=(0, 0, 0))
        y1 = 30 + (rows + r) * th
        img.paste(f.crop((int(x), int(y), int(x + w), int(y + h))).resize((tw, th)), (x0, y1))
    dr.text((6, 6), f"{e['title']} · 따라가기 · 판 안 {kf['box_ok']:.0%} · 여백 안 {kf['margin_ok']:.0%} · 확대 변화 최대 {kf['zrate']:.2f}/초 · 이동 최대 {kf['pan']:.2f}화면/초", fill=(255, 255, 255), font=font(15))
    img.save(os.path.join(work, 'sheets', f'f-{vid[:8]}.jpg'), quality=82)

def render(work, vid, kf, pr, ext):
    """원본 Y·U·V 면을 판대로 잘라 키운다(소수 위치 · Lanczos) — 색 형식 · 시각 그대로, libx264(PyAV)."""
    import av, cv2
    from fractions import Fraction
    src = os.path.join(work, 'orig', f'{vid}{ext}'); dst = os.path.join(work, 'out', f'{vid}.mp4')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    T = np.array(kf['t']); X = np.array(kf['x']); Y = np.array(kf['y']); Wd = np.array(kf['w'])
    with av.open(src) as ic:
        ist = ic.streams.video[0]; ist.thread_type = 'AUTO'
        W, H = ist.codec_context.width, ist.codec_context.height
        pix = 'yuvj420p' if pr['rng'] == 'pc' else 'yuv420p'
        oc = av.open(dst, 'w', options={'movflags': '+faststart'})
        ost = oc.add_stream('libx264', rate=ist.average_rate or Fraction(60))
        ost.width, ost.height, ost.pix_fmt = W, H, pix
        ost.options = {'crf': '19', 'preset': 'slow', 'maxrate': '10M', 'bufsize': '20M', 'g': str(round(pr['fps'])), 'profile': 'high'}
        cc = ost.codec_context
        for k in ('color_range', 'color_primaries', 'color_trc', 'colorspace'):
            try: setattr(cc, k, getattr(ist.codec_context, k))
            except Exception: pass
        cc.time_base = ost.time_base = ist.time_base
        for fr in ic.decode(ist):
            t = float(fr.pts * ist.time_base)
            x, y, w = np.interp(t, T, X), np.interp(t, T, Y), np.interp(t, T, Wd)
            s = W / w
            a = fr.to_ndarray(format=pix)
            Yp = a[:H]; U = a[H:H + H // 4].reshape(H // 2, W // 2); V = a[H + H // 4:].reshape(H // 2, W // 2)
            M = np.float32([[s, 0, -x * s], [0, s, -y * s]])
            M2 = np.float32([[s, 0, -(x / 2) * s + 0.5 * (s - 1) / 2 * 0], [0, s, -(y / 2) * s]])
            Y2 = cv2.warpAffine(Yp, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
            U2 = cv2.warpAffine(U, M2, (W // 2, H // 2), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
            V2 = cv2.warpAffine(V, M2, (W // 2, H // 2), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
            nf = av.VideoFrame.from_ndarray(np.concatenate([Y2, U2.reshape(-1, W), V2.reshape(-1, W)]), format=pix)
            nf.pts, nf.time_base = fr.pts, fr.time_base
            for pk in ost.encode(nf): oc.mux(pk)
        for pk in ost.encode(): oc.mux(pk)
        oc.close()

def small_and_thumb(work, vid, kf, pr, ext):
    """720p 판(render2 와 같은 값) + 썸네일: 원본 썸네일과 가장 닮은 장면 시각을 찾아 그 시각의 새 영상 장면으로."""
    import av
    from PIL import Image
    dst = os.path.join(work, 'out', f'{vid}.mp4'); small = os.path.join(work, 'out', f'{vid}.720.mp4')
    rng = 'pc' if pr['rng'] == 'pc' else 'tv'; br = '2500k' if pr['fps'] > 45 else '1800k'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', dst, '-an', '-fps_mode', 'passthrough', '-vf', f'scale=1280:720:flags=lanczos:in_range={rng}:out_range=tv',
                    '-c:v', 'libx264', '-preset', 'medium', '-b:v', br, '-maxrate', br, '-bufsize', '5M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                    '-g', str(round(pr['fps']) * 2), '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', small], check=True)
    tp = os.path.join(work, 'orig', f'{vid}.jpg')
    if not os.path.exists(tp): return
    th = Image.open(tp).convert('RGB'); tsz = th.size
    ref = np.asarray(th.resize((96, 54))).astype(float)
    best = (1e18, 0.0)
    with av.open(os.path.join(work, 'orig', f'{vid}{ext}')) as ct:
        st = ct.streams.video[0]
        for i, fr in enumerate(ct.decode(st)):
            if i % 3: continue
            a = np.asarray(fr.to_image().resize((96, 54))).astype(float)
            d = ((a - ref) ** 2).mean()
            if d < best[0]: best = (d, float(fr.pts * st.time_base))
    with av.open(dst) as ct:
        st = ct.streams.video[0]
        ct.seek(int(max(0, best[1] - 0.5) / st.time_base), stream=st, backward=True)
        for fr in ct.decode(st):
            if float(fr.pts * st.time_base) >= best[1] - 0.005:
                fr.to_image().resize(tsz, Image.LANCZOS).save(os.path.join(work, 'out', f'{vid}.jpg'), quality=88); break
    print('썸네일 시각', round(best[1], 2), '차이', round(best[0], 1))

if __name__ == '__main__':
    cmd, work, a = sys.argv[1], sys.argv[2], sys.argv[3]
    L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
    vid = next(v for v in L if v.startswith(a)); e = L[vid]
    os.makedirs(os.path.join(work, 'follow'), exist_ok=True)
    fp = os.path.join(work, 'follow', f'{vid}.json')
    if cmd == 'plan':
        m = json.load(open(os.path.join(work, 'measure', f'{vid}.json')))
        zmax = float(sys.argv[4]) if len(sys.argv) > 4 else 2.2; fill = float(sys.argv[5]) if len(sys.argv) > 5 else 0.62
        kf = keyframes(m, zmax, fill); kf.update({'zmax': zmax, 'fill': fill})
        json.dump(kf, open(fp, 'w'))
        sheet(work, vid, kf, e)
        print(e['title'], 'box_ok', kf['box_ok'], 'margin_ok', round(kf['margin_ok'], 3), 'z', min(kf['z']), max(kf['z']), 'zrate', round(kf['zrate'], 2), 'pan', round(kf['pan'], 3))
    else:
        pr = json.load(open(os.path.join(work, 'probe.json')))[vid]
        kf = json.load(open(fp))
        render(work, vid, kf, pr, e['ext'])
        small_and_thumb(work, vid, kf, pr, e['ext'])
        print('ok', vid)
