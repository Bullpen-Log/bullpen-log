"""
시간대별 움직임(빈 시간 찾기용) — 0.1초마다: 사람 상자(measure 의 주 트랙, 사이는 잇기) 안 밝기 변화 비율 · 화면 전체 변화 비율 → motion/<id>.json
    python motion.py <작업 폴더> [병렬 수]
"""
import json, os, subprocess, sys
from multiprocessing import Pool
import numpy as np

def one(args):
    work, vid = args
    out = os.path.join(work, 'motion', f'{vid}.json')
    if os.path.exists(out): return vid
    sys.path.insert(0, os.path.join(work, 'tools'))
    from plan import tracks_of
    L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
    m = json.load(open(os.path.join(work, 'measure', f'{vid}.json'))); W, H = m['w'], m['h']
    tr = tracks_of(m['dets'])
    items = tr[0]['items'] if tr else []
    ts = np.array([t for t, _ in items]); bs = np.array([b for _, b in items], float) if items else None
    GW = 320; GH = round(GW * H / W / 2) * 2
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-hwaccel', 'videotoolbox', '-i', os.path.join(work, 'orig', f"{vid}{L[vid]['ext']}"), '-an',
                          '-vf', f'fps=10,scale={GW}:{GH},format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    n = GW * GH; prev = None; rows = []; i = 0
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n: break
        g = np.frombuffer(buf, np.uint8).reshape(GH, GW).astype(np.int16); t = i / 10.0; i += 1
        if prev is None: prev = g; continue
        d = np.abs(g - prev) > 14; prev = g
        if bs is not None and len(ts):
            b = [np.interp(t, ts, bs[:, k]) for k in range(4)]
            bw, bh = b[2] - b[0], b[3] - b[1]
            x1 = int(max(0, (b[0] - 0.1 * bw) * GW / W)); x2 = int(min(GW, (b[2] + 0.1 * bw) * GW / W) + 1)
            y1 = int(max(0, (b[1] - 0.1 * bh) * GH / H)); y2 = int(min(GH, (b[3] + 0.1 * bh) * GH / H) + 1)
            sub = d[y1:y2, x1:x2]; ab = float(sub.mean()) if sub.size else 0.0
            bb = [round(v) for v in b]
        else:
            ab = float(d.mean()); bb = None
        rows.append([round(t, 2), round(ab, 4), round(float(d.mean()), 4), bb])
    p.wait()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump({'id': vid, 'w': W, 'h': H, 'dur': m['dur'], 'rows': rows}, open(out, 'w'))
    return vid

if __name__ == '__main__':
    work = sys.argv[1]; npar = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    ids = [e['id'] for e in json.load(open(os.path.join(work, 'list.json')))]
    with Pool(npar) as pool:
        for k, _ in enumerate(pool.imap_unordered(one, [(work, v) for v in ids]), 1):
            if k % 50 == 0 or k == len(ids): print(f'{k}/{len(ids)}', flush=True)
