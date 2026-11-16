"""원본 썸네일이 원본 영상의 어느 장면(전체 화면)과 같은지 — 가장 가까운 장면과의 차이(작으면 전체 화면 썸네일)."""
import json, os, sys
import av, numpy as np
from PIL import Image
from multiprocessing import Pool
work = sys.argv[1]
def one(k):
    L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
    th = Image.open(os.path.join(work, 'orig', f'{k}.jpg')).convert('RGB')
    ref = np.asarray(th.resize((96, 54))).astype(float)
    best = (1e18, 0)
    with av.open(os.path.join(work, 'orig', f"{k}{L[k]['ext']}")) as ct:
        st = ct.streams.video[0]
        for i, fr in enumerate(ct.decode(st)):
            if i % 2: continue
            a = np.asarray(fr.to_image().resize((96, 54))).astype(float)
            d = ((a - ref) ** 2).mean()
            if d < best[0]: best = (d, float(fr.pts * st.time_base))
    return k, round(best[0], 1), round(best[1], 2), th.size
if __name__ == '__main__':
    p = json.load(open(os.path.join(work, 'plan.json')))
    ids = [k for k, v in p.items() if v.get('crop')]
    with Pool(6) as pool:
        res = pool.map(one, ids)
    json.dump(res, open(os.path.join(work, 'thumbcheck.json'), 'w'))
    for k, d, t, sz in sorted(res, key=lambda r: -r[1])[:12]:
        print(round(d, 1), t, sz, p[k]['title'])
