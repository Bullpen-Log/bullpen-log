"""녹화 속 실제 투구(throws.py) ↔ 앱 시도(attempts.json — 녹화마다 recatt 로 만든 것) 맞대기. 읽기만.

    .venv/bin/python tools/recall.py throws-rec.json

투구마다: 앱 시도가 있었나(투구 시작 1.2초 앞 ~ 끝 0.3초 뒤 안의 알림), 있었다면 무엇이었나(잼 · 거부 코드).
"""
import json
import os
import sys
from collections import Counter, defaultdict

T = [o for o in json.load(open(sys.argv[1])) if o["kind"] == "throw" and o["n"] >= 12 and o["score"] >= 0.12]
by = defaultdict(list)
for o in T:
    rec, part = o["file"].split("/")
    by[rec].append((int(part[1:].split(".")[0]), o))
tot = Counter()
rows = []
for rec, items in sorted(by.items()):
    ap = os.path.join(rec, "attempts.json")
    if not os.path.exists(ap):
        continue
    A = json.load(open(ap))
    off = {p["index"]: p["offsetSec"] for p in A["parts"]}
    att = A["attempts"]
    for part, o in sorted(items, key=lambda x: (x[0], x[1]["t0"])):
        t0 = off.get(part, 0) + o["t0"]
        t1 = off.get(part, 0) + o["t1"]
        hit = [a for a in att if t0 - 1.2 <= a["t"] <= t1 + 0.3]
        if not hit:
            res = "알림 없음"
        else:
            okk = [a for a in hit if a["ok"]]
            res = "잼 " + ",".join(f"{a['kind']}:{a['kmh'] and round(a['kmh'])}/{a['conf']}" for a in okk) if okk else "못 잼 " + ",".join(f"{a['kind']}:{a['code']}" for a in hit)
        key = "알림 없음" if not hit else ("잼" if any(a["ok"] for a in hit) else "못 잼")
        tot[key] += 1
        rows.append((rec, part, round(t0, 2), o["n"], round(o["score"], 2), o["d0"], o["d1"], res))
for r in rows:
    print(*r)
print(tot, "투구", sum(tot.values()))
