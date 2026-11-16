"""
앞뒤 빈 시간 자르기 — trims.json({id: {start, end}})대로 out-trim/<id>.mp4 · .720.mp4 를 만든다(원본에서, 장면 시각 0 부터).
이미 화면을 키운 영상은 같은 판(plan.json crop · follow/<id>.json)을 그대로 쓰고 썸네일은 out/<id>.jpg 를 옮긴다.
    python trim.py <작업 폴더>
"""
import json, os, shutil, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
work = sys.argv[1]
T = json.load(open(os.path.join(work, 'trims.json')))
plan = json.load(open(os.path.join(work, 'plan.json'))); probe = json.load(open(os.path.join(work, 'probe.json')))
L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
od = os.path.join(work, 'out-trim'); os.makedirs(od, exist_ok=True)

def small(src, dst, pr):
    rng = 'pc' if pr['rng'] == 'pc' else 'tv'; br = '2500k' if pr['fps'] > 45 else '1800k'
    W, H = (pr['w'], pr['h'])
    sw, sh = (1280, 720) if W >= H else (720, 1280)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-an', '-fps_mode', 'passthrough', '-vf', f'scale={sw}:{sh}:flags=lanczos:in_range={rng}:out_range=tv',
                    '-c:v', 'libx264', '-preset', 'medium', '-b:v', br, '-maxrate', br, '-bufsize', '5M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                    '-g', str(round(pr['fps']) * 2), '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', dst], check=True)

for vid, t in T.items():
    pr = probe[vid]; W, H = pr['w'], pr['h']; src = os.path.join(work, 'orig', f"{vid}{L[vid]['ext']}")
    dst = os.path.join(od, f'{vid}.mp4')
    s, e = t['start'], t['end']
    fp = os.path.join(work, 'follow', f'{vid}.json')
    if os.path.exists(fp):
        # 따라가는 판: follow.render 와 같은 방식으로 [s, e] 장면만, 시각은 s 를 0 으로
        import av, cv2
        from fractions import Fraction
        kf = json.load(open(fp)); TT = np.array(kf['t']); X = np.array(kf['x']); Y = np.array(kf['y']); Wd = np.array(kf['w'])
        with av.open(src) as ic:
            ist = ic.streams.video[0]; ist.thread_type = 'AUTO'
            pix = 'yuvj420p' if pr['rng'] == 'pc' else 'yuv420p'
            oc = av.open(dst, 'w', options={'movflags': '+faststart'})
            ost = oc.add_stream('libx264', rate=ist.average_rate or Fraction(60)); ost.width, ost.height, ost.pix_fmt = W, H, pix
            ost.options = {'crf': '19', 'preset': 'slow', 'maxrate': '10M', 'bufsize': '20M', 'g': str(round(pr['fps'])), 'profile': 'high'}
            cc = ost.codec_context
            for k in ('color_range', 'color_primaries', 'color_trc', 'colorspace'):
                try: setattr(cc, k, getattr(ist.codec_context, k))
                except Exception: pass
            cc.time_base = ost.time_base = ist.time_base; t0 = None
            for fr in ic.decode(ist):
                tt = float(fr.pts * ist.time_base)
                if tt < s - 1e-3: continue
                if tt > e + 1e-3: break
                if t0 is None: t0 = fr.pts
                x, y, w = np.interp(tt, TT, X), np.interp(tt, TT, Y), np.interp(tt, TT, Wd); sc = W / w
                a = fr.to_ndarray(format=pix); Yp = a[:H]; U = a[H:H + H // 4].reshape(H // 2, W // 2); V = a[H + H // 4:].reshape(H // 2, W // 2)
                M = np.float32([[sc, 0, -x * sc], [0, sc, -y * sc]]); M2 = np.float32([[sc, 0, -(x / 2) * sc], [0, sc, -(y / 2) * sc]])
                Y2 = cv2.warpAffine(Yp, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
                U2 = cv2.warpAffine(U, M2, (W // 2, H // 2), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
                V2 = cv2.warpAffine(V, M2, (W // 2, H // 2), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
                nf = av.VideoFrame.from_ndarray(np.concatenate([Y2, U2.reshape(-1, W), V2.reshape(-1, W)]), format=pix)
                nf.pts, nf.time_base = fr.pts - t0, fr.time_base
                for pk in ost.encode(nf): oc.mux(pk)
            for pk in ost.encode(): oc.mux(pk)
            oc.close()
    else:
        rng = 'pc' if pr['rng'] == 'pc' else 'tv'
        color = ['-color_range', rng, '-colorspace', 'bt709', '-color_primaries', 'bt709'] + (['-color_trc', pr['trc']] if pr.get('trc') else [])
        vf = []
        if plan[vid].get('crop'):
            x, y, cw = plan[vid]['crop']; ch = cw * H / W
            x, y, cw, ch = int(x) // 2 * 2, int(y) // 2 * 2, int(round(cw)) // 2 * 2, int(round(ch)) // 2 * 2
            vf = ['-vf', f'crop={cw}:{ch}:{x}:{y},scale={W}:{H}:flags=lanczos:in_range={rng}:out_range={rng}']
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s:.3f}', '-to', f'{e:.3f}', '-i', src, '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1',
                        '-fps_mode', 'passthrough', *vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '10M', '-bufsize', '20M',
                        '-profile:v', 'high', '-pix_fmt', pr['pix'], '-g', str(round(pr['fps'])), *color, '-movflags', '+faststart', dst], check=True)
    small(dst, os.path.join(od, f'{vid}.720.mp4'), pr)
    tj = os.path.join(work, 'out', f'{vid}.jpg')
    if os.path.exists(tj): shutil.copy(tj, os.path.join(od, f'{vid}.jpg'))
    print('ok', L[vid]['title'], f'{s:.2f}~{e:.2f}', flush=True)
