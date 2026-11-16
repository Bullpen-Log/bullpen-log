"""
빈 시간 후보 — motion/<id>.json 으로 동작 처음 · 끝(a0 · a1)을 찾고, 앞 · 뒤 빈 시간이 GAP 초 넘으면 KEEP 초만 남기는 판 → idle.json
- 움직임 = 사람 상자 안 밝기 변화 비율(0.5초 평균). 문턱 = max(0.004, 그 영상 75% 지점의 25%) — 느린 동작 영상은 문턱도 낮다.
- 처음 · 끝은 0.5초 넘게 이어진 움직임만(한두 장 튐은 무시).
- 카메라로 걸어옴(끝) · 카메라에서 걸어감(처음): 상자 키가 가운데 구간 중앙값의 1.4배를 넘는 때 → 그 앞에서 끝 / 그 뒤에서 시작(눈으로 다시 본다).
판정은 후보일 뿐 — 장면 그림을 보고 overrides(idle-ov.json)로 고친다.
"""
import json, os, sys
import numpy as np
GAP, KEEP = 2.0, 1.0

def smooth(x, n=5):
    k = np.ones(n) / n; p = np.pad(x, (n // 2, n - 1 - n // 2), mode='edge'); return np.convolve(p, k, mode='valid')

def run(m):
    rows = m['rows']; dur = m['dur']
    if len(rows) < 10: return None
    t = np.array([r[0] for r in rows]); ab = smooth(np.array([r[1] for r in rows]))
    thr = max(0.004, 0.25 * np.percentile(ab, 75))
    on = ab >= thr
    # 0.5초(5칸) 넘게 이어진 움직임
    runs = []; s = None
    for i, v in enumerate(on):
        if v and s is None: s = i
        if (not v or i == len(on) - 1) and s is not None:
            e = i if not v else i + 1
            if e - s >= 5: runs.append((s, e - 1))
            s = None
    if not runs: return {'a0': 0.0, 'a1': dur, 'thr': thr, 'why': '움직임 못 찾음'}
    a0, a1 = t[runs[0][0]], t[runs[-1][1]]
    why = []
    # 상자 키로 '카메라로 걸어옴'을 찾던 규칙은 뺐다 — 팔을 머리 위로 드는 · 좌우를 번갈아 하는 스트레칭을 걸어옴으로 봐 동작을 잘랐다(2026-11-16).
    # 끝 · 처음에 걸어오는 장면은 첫 · 끝 장면 모음(edges)을 눈으로 보고 idle-ov.json 에 적는다.
    return {'a0': round(float(a0), 2), 'a1': round(float(a1), 2), 'thr': round(float(thr), 4), 'why': why}

if __name__ == '__main__':
    work = sys.argv[1]
    L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
    out = {}
    for vid, e in L.items():
        m = json.load(open(os.path.join(work, 'motion', f'{vid}.json')))
        r = run(m)
        if r is None: continue
        dur = m['dur']; head, tail = r['a0'], dur - r['a1']
        r.update({'dur': dur, 'head': round(head, 2), 'tail': round(tail, 2),
                  'start': round(r['a0'] - KEEP, 2) if head > GAP else 0.0, 'end': round(r['a1'] + KEEP, 2) if tail > GAP else round(dur, 2),
                  'title': e['title'], 'cat': e['category']})
        out[vid] = r
    json.dump(out, open(os.path.join(work, 'idle.json'), 'w'), ensure_ascii=False, indent=1)
    cand = {k: v for k, v in out.items() if v['start'] > 0 or v['end'] < v['dur'] - 0.05}
    print('후보', len(cand), '/', len(out), '· 앞만', sum(1 for v in cand.values() if v['start'] > 0 and v['end'] >= v['dur'] - 0.05),
          '· 뒤만', sum(1 for v in cand.values() if v['start'] == 0), '· 둘 다', sum(1 for v in cand.values() if v['start'] > 0 and v['end'] < v['dur'] - 0.05))
    hs = sorted(v['head'] for v in out.values()); ts = sorted(v['tail'] for v in out.values())
    print('앞 빈 시간 분포(초) 50/75/90%', hs[len(hs)//2], hs[3*len(hs)//4], hs[9*len(hs)//10], '· 뒤', ts[len(ts)//2], ts[3*len(ts)//4], ts[9*len(ts)//10])
