"""
측정(measure/<id>.json)으로 시범하는 사람(트랙)을 고르고, 움직임 전체를 감싸는 판(crop)을 정한다 → plan.json.
판 = 사람 상자 전부(시간 전체)의 바깥 + 여백, 화면 비율 그대로, 확대는 ZMAX 까지. overrides.json 이 이긴다.
"""
import json, os, sys
import numpy as np

ZMAX = 2.2      # 1080p 원본을 키우는 한도 — 앱은 720p 로 보여 2.2배까지는 휴대폰 크기에서 무난(2.8배부터 흐림, 2026-11-16 시험)
ZMIN = 1.15     # 이보다 덜 키우면 바꾸지 않음
SMALL = 0.62    # 움직임 범위(바깥 3~97%)가 화면 높이 · 너비 모두 이 밑이면 '작음'(10-17 규칙 0.6 과 같은 뜻)
MX, MY_TOP, MY_BOT = 0.08, 0.12, 0.08   # 여백(상자 너비 · 높이 대비) — 위는 머리 위로 든 도구가 상자 밖이라 더 넉넉히

def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1]); x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    i = max(0, x2 - x1) * max(0, y2 - y1)
    u = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - i
    return i / u if u > 0 else 0

def tracks_of(dets):
    tracks = []  # {'items': [(t, box)]}
    for d in dets:
        used = set()
        for b in d['b']:
            best, bs = None, 0
            for k, tr in enumerate(tracks):
                if k in used: continue
                lt, lb = tr['items'][-1]
                if d['t'] - lt > 1.5: continue
                s = iou(b, lb)
                cx, cy = (b[0]+b[2])/2, (b[1]+b[3])/2; lx, ly = (lb[0]+lb[2])/2, (lb[1]+lb[3])/2
                dim = max(lb[2]-lb[0], lb[3]-lb[1], b[2]-b[0], b[3]-b[1])
                if s < 0.15 and np.hypot(cx-lx, cy-ly) < 0.35 * dim: s = 0.15
                if s > bs: best, bs = k, s
            if best is not None and bs >= 0.15:
                tracks[best]['items'].append((d['t'], b)); used.add(best)
            else:
                tracks.append({'items': [(d['t'], b)]}); used.add(len(tracks)-1)
    for tr in tracks:
        a = [ (b[2]-b[0])*(b[3]-b[1]) for _, b in tr['items']]
        tr['score'] = len(a) * float(np.median(a))
    tracks.sort(key=lambda tr: -tr['score'])
    return tracks

def plan_one(m, ov=None):
    W, H, dets = m['w'], m['h'], m['dets']
    n = len(dets)
    tr = tracks_of(dets)
    if not tr:
        return {'why': '사람 못 찾음', 'crop': None, 'zoom': 1, 'cover': 0}
    main = tr[0]
    # 같은 사람이 자세가 바뀌며 끊긴 트랙을 잇기: 시간이 안 겹치고 주 트랙 바깥상자와 겹치는 큰 트랙
    items = list(main['items'])
    ts = set(t for t, _ in items)
    ux = [min(b[0] for _, b in items), min(b[1] for _, b in items), max(b[2] for _, b in items), max(b[3] for _, b in items)]
    medA = np.median([(b[2]-b[0])*(b[3]-b[1]) for _, b in items])
    for o in tr[1:]:
        ot = [t for t, _ in o['items']]
        if any(t in ts for t in ot): continue
        oa = np.median([(b[2]-b[0])*(b[3]-b[1]) for _, b in o['items']])
        ob = [min(b[0] for _, b in o['items']), min(b[1] for _, b in o['items']), max(b[2] for _, b in o['items']), max(b[3] for _, b in o['items'])]
        if oa > 0.3 * medA and iou(ob, ux) > 0.05:
            items += o['items']; ts |= set(ot)
    items.sort()
    cover = len(items) / max(1, n)
    arr = np.array([b for _, b in items], float)
    x1, y1, x2, y2 = arr[:, 0].min(), arr[:, 1].min(), arr[:, 2].max(), arr[:, 3].max()
    ew, eh = x2 - x1, y2 - y1
    hmed = float(np.median(arr[:, 3] - arr[:, 1]))
    wmed = float(np.median(arr[:, 2] - arr[:, 0]))
    others = len(tr) - 1
    px1, py1, px2, py2 = x1 - MX * ew, y1 - MY_TOP * eh, x2 + MX * ew, y2 + MY_BOT * eh
    need_w = max(px2 - px1, (py2 - py1) * W / H)
    cw = min(W, max(need_w, W / ZMAX))
    ch = cw * H / W
    cx, cy = (px1 + px2) / 2, (py1 + py2) / 2
    x = min(max(0, cx - cw / 2), W - cw); y = min(max(0, cy - ch / 2), H - ch)
    zoom = W / cw
    res = {'env': [round(x1), round(y1), round(x2), round(y2)], 'fillW': round(ew / W, 3), 'fillH': round(eh / H, 3),
           'hmed': round(hmed / H, 3), 'wmed': round(wmed / W, 3), 'cover': round(cover, 2), 'others': others,
           'zoom': round(zoom, 3), 'auto': [int(round(x)), int(round(y)), int(round(cw))], 'items': len(items)}
    rw = (np.percentile(arr[:, 2], 97) - np.percentile(arr[:, 0], 3)) / W
    rh = (np.percentile(arr[:, 3], 97) - np.percentile(arr[:, 1], 3)) / H
    res['rfillW'], res['rfillH'] = round(float(rw), 3), round(float(rh), 3)
    res['small'] = bool(rw < SMALL and rh < SMALL)
    res['crop'] = res['auto'] if (res['small'] and zoom >= ZMIN) else None
    if ov:
        if ov.get('skip'): res['crop'] = None
        elif ov.get('crop') == 'auto': res['crop'] = res['auto']
        elif 'crop' in ov: res['crop'] = ov['crop']
        if res['crop'] and ('dx' in ov or 'dy' in ov):
            cx0, cy0, cw0 = res['crop']; ch0 = cw0 * H / W
            res['crop'] = [int(round(min(max(0, cx0 + ov.get('dx', 0)), W - cw0))), int(round(min(max(0, cy0 + ov.get('dy', 0)), H - ch0))), cw0]
        res['ov'] = ov
    return res

if __name__ == '__main__':
    work = sys.argv[1]
    L = json.load(open(os.path.join(work, 'list.json')))
    op = os.path.join(work, 'overrides.json')
    ovs = json.load(open(op)) if os.path.exists(op) else {}
    out = {}
    for e in L:
        mp = os.path.join(work, 'measure', f"{e['id']}.json")
        if not os.path.exists(mp): continue
        m = json.load(open(mp))
        r = plan_one(m, ovs.get(e['id']))
        r.update({'title': e['title'], 'cat': e['category'], 'table': e['table'], 'w': m['w'], 'h': m['h'], 'dur': m['dur']})
        out[e['id']] = r
    json.dump(out, open(os.path.join(work, 'plan.json'), 'w'), ensure_ascii=False, indent=1)
    z = sorted(out.items(), key=lambda kv: -kv[1]['zoom'])
    print('판 있음', sum(1 for v in out.values() if v['crop']), '/', len(out))
    for k, v in z[:int(sys.argv[2]) if len(sys.argv) > 2 else 0]:
        print(f"{'*' if v.get('crop') else ' '}{v['zoom']:.2f} r{v.get('rfillW',0):.2f}x{v.get('rfillH',0):.2f} H{v['hmed']:.2f} env{v['fillW']:.2f}x{v['fillH']:.2f} cov{v['cover']:.2f} o{v['others']} {v['cat']} · {v['title']}")
