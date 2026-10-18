"""
영상 내용 점검 3단계 — 고칠 것(edits.json)을 검사해 바꿀 계획(fix-plan.json)으로 만든다. DB 는 안 건드린다.

    py -3.12 scripts/shoot-trim/content-plan.py <내용 점검 폴더>

edits.json — rows.json 의 #번호(idx)와 제목으로 운동을 가리킨다(제목이 다르면 멈춘다):
  [
    {"idx": 22, "title": "슬리퍼 스트레치",
     "desc": [["옛 글(설명에 정확히 한 번)", "새 글"], ...],      # 설명 바꾸기 — 옛 글이 없거나 둘이면 멈춘다
     "equipment": ["덤벨", "벤치"], "perSide": true, "reps": 10, "holdSeconds": null,
     "newTitle": "덤벨 래디얼 디비에이션"}                        # 칸은 고칠 것만
  ]
fix-plan.json 은 운동마다 before(지금 값)와 data(바꿀 값) — content-fix.mjs 가 DB 값이 before 와 같을 때만 바꾸고, --revert 로 되돌린다.
"""
import json
import os
import sys

FIELDS = ('title', 'description', 'equipment', 'perSide', 'reps', 'holdSeconds')

work = sys.argv[1]
rows = json.load(open(os.path.join(work, 'rows.json'), encoding='utf-8'))
edits = json.load(open(os.path.join(work, 'edits.json'), encoding='utf-8'))
plan = []
for e in edits:
    r = rows[e['idx']]
    if r['title'] != e['title']:
        raise SystemExit(f"#{e['idx']} 제목이 다름: {r['title']} != {e['title']}")
    data = {}
    if e.get('desc'):
        d = r['description']
        for old, new in e['desc']:
            n = d.count(old)
            if n != 1:
                raise SystemExit(f"#{e['idx']} {r['title']} — 옛 글이 {n}번: {old[:40]}")
            d = d.replace(old, new)
        data['description'] = d
    if 'newTitle' in e:
        data['title'] = e['newTitle']
    for k in ('equipment', 'perSide', 'reps', 'holdSeconds'):
        if k in e:
            data[k] = e[k]
    if not data:
        continue
    plan.append({'id': r['id'], 'title': r['title'], 'before': {k: r.get(k) for k in FIELDS}, 'data': data})
json.dump(plan, open(os.path.join(work, 'fix-plan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"운동 {len(plan)}개 · 설명 {sum('description' in x['data'] for x in plan)} · 제목 {sum('title' in x['data'] for x in plan)} → fix-plan.json")
