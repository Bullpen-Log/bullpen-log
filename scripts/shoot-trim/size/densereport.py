"""dense/<id>.json 요약 — 판 탓으로 사람이 판 밖에 걸친 장면(여유 < 0, 그 쪽이 원본 화면 끝이 아님)과 가장 빠듯한 여유."""
import json, os, sys
work = sys.argv[1]
A = json.load(open(os.path.join(work, 'applied.json')))
res = []
for vid, a in A.items():
    f = os.path.join(work, 'dense', f'{vid}.json')
    if not os.path.exists(f): continue
    rows = json.load(open(f))['rows']
    bad = []; worst = 9; miss = 0
    for r in rows:
        if r[1] is None: miss += 1; continue
        t, b, mg, oe = r
        for side in range(4):
            if oe[side]: continue
            worst = min(worst, mg[side])
            if mg[side] < 0: bad.append((t, 'LTRB'[side], mg[side]))
    res.append((len(bad), worst, a['title'], vid, bad[:6], miss, len(rows)))
res.sort(key=lambda r: (-r[0], r[1]))
for n, w, title, vid, bad, miss, tot in res:
    if n or w < 0.02:
        print(f'{n:4d}장 판 밖 · 가장 빠듯 {w:+.3f} · {title} {vid[:8]} · 못 찾음 {miss}/{tot}', [(t, s, round(m, 3)) for t, s, m in bad])
print('확인', len(res), '· 판 밖 장면 있는 영상', sum(1 for r in res if r[0]))
