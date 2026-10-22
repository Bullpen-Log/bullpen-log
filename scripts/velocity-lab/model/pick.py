"""파일마다 대표 투구 하나(throw 중 장면 수 × 점수 가장 큰 것) — 스피드건 클립용"""
import json, sys
T = json.load(open(sys.argv[1]))
best = {}
for o in T:
    if o["kind"] != "throw":
        continue
    k = o["n"] * o["score"]
    if o["file"] not in best or k > best[o["file"]][0]:
        best[o["file"]] = (k, o)
json.dump([v[1] for v in best.values()], open(sys.argv[2], "w"))
print(len(best), "파일")
