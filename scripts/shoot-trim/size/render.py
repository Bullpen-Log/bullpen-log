"""
정한 판(plan.json crop)대로 화면을 잘라 원래 크기로 키운 영상 · 썸네일 · 720p 판을 out/ 에 만든다(ffmpeg). 원본은 건드리지 않는다.
- 시각 그대로(passthrough) · 소리 없음 · 앞에 moov · 원본 픽셀 형식 · 색 꼬리표 그대로(전 범위는 전 범위로).
- 720p 판: library-720 과 같은 값(짧은 변 720 · 60fps 2.5Mbps / 30fps 1.8Mbps · 키 장면 2초 · 보통 범위 BT.709).
    python render2.py <작업 폴더> [id앞자리 …]
"""
import json, os, subprocess, sys
from PIL import Image

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[-800:])

def render(work, vid, p, pr, ext):
    src = os.path.join(work, 'orig', f'{vid}{ext}')
    os.makedirs(os.path.join(work, 'out'), exist_ok=True)
    dst = os.path.join(work, 'out', f'{vid}.mp4'); small = os.path.join(work, 'out', f'{vid}.720.mp4')
    W, H = pr['w'], pr['h']
    x, y, cw = p['crop']; ch = cw * H / W
    x, y = int(x) // 2 * 2, int(y) // 2 * 2; cw, ch = int(round(cw)) // 2 * 2, int(round(ch)) // 2 * 2
    full = pr['rng'] == 'pc'
    rng = 'pc' if full else 'tv'
    pix = pr['pix']  # yuvj420p | yuv420p
    color = ['-color_range', rng, '-colorspace', 'bt709', '-color_primaries', 'bt709']
    if pr.get('trc'): color += ['-color_trc', pr['trc']]
    g = str(round(pr['fps']))
    vf = f'crop={cw}:{ch}:{x}:{y},scale={W}:{H}:flags=lanczos:in_range={rng}:out_range={rng}'
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1', '-fps_mode', 'passthrough', '-vf', vf,
         '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '10M', '-bufsize', '20M', '-profile:v', 'high', '-pix_fmt', pix, '-g', g,
         *color, '-movflags', '+faststart', dst])
    br = '2500k' if pr['fps'] > 45 else '1800k'
    sw, sh = (1280, 720) if W >= H else (720, 1280)
    run(['ffmpeg', '-v', 'error', '-y', '-i', dst, '-an', '-fps_mode', 'passthrough', '-vf', f'scale={sw}:{sh}:flags=lanczos:in_range={rng}:out_range=tv',
         '-c:v', 'libx264', '-preset', 'medium', '-b:v', br, '-maxrate', br, '-bufsize', '5M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
         '-g', str(round(pr['fps']) * 2), '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', small])
    t = os.path.join(work, 'orig', f'{vid}.jpg')
    if os.path.exists(t):
        im = Image.open(t).convert('RGB'); s = im.width / W
        im.crop((x * s, y * s, (x + cw) * s, (y + ch) * s)).resize(im.size, Image.LANCZOS).save(os.path.join(work, 'out', f'{vid}.jpg'), quality=88)
    return os.path.getsize(dst), os.path.getsize(small)

if __name__ == '__main__':
    work = sys.argv[1]
    plan = json.load(open(os.path.join(work, 'plan.json')))
    probe = json.load(open(os.path.join(work, 'probe.json')))
    L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
    want = sys.argv[2:]
    todo = [v for v, p in plan.items() if p.get('crop') and (not want or any(v.startswith(a) for a in want))]
    for i, v in enumerate(todo, 1):
        if not want and os.path.exists(os.path.join(work, 'out', f'{v}.720.mp4')): continue
        a, b = render(work, v, plan[v], probe[v], L[v]['ext'])
        print(f'{i}/{len(todo)} {v[:8]} {a // 1024}KB · 720 {b // 1024}KB · {plan[v]["title"]}', flush=True)
