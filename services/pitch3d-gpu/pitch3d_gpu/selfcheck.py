"""자가 점검(설계 E-PYTEST — pytest 없이 assert 만, 표준 라이브러리만) — 관절 표 · 구간 셈 · 가짜 관절로 엔진 입력 모양 · (있으면) node 묶음 실행기.

    python -m pitch3d_gpu.selfcheck

GPU · 모델 · 영상 없이 돈다. 실제 영상 끝까지는 Modal 에서(README 7).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from . import engine
from .mapping import JOINT_MAP, N_JOINTS, RTMW_INDEX, RTMW_TOTAL, V2_NAMES, to_v2_points
from .pipeline import MAX_FRAMES, _decimate, sanity_track

passed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed
    print(f"  {'OK  ' if ok else '실패'} {name}{' — ' + detail if detail else ''}")
    if not ok:
        sys.exit(1)
    passed += 1


print("■ 관절 표(joint-map.json)")
check("관절 25개", N_JOINTS == 25)
check("앞 17개가 v1 차례(nose lSh rSh … rTo)", V2_NAMES[:17] == ["nose", "lSh", "rSh", "lEl", "rEl", "lWr", "rWr", "lHip", "rHip", "lKn", "rKn", "lAn", "rAn", "lHe", "rHe", "lTo", "rTo"])
check("RTMW 번호가 겹치지 않고 0~132", len(set(RTMW_INDEX)) == N_JOINTS and all(0 <= i < RTMW_TOTAL for i in RTMW_INDEX))
pairs = {j["name"]: j["pair"] for j in JOINT_MAP["joints"]}
check("짝이 서로를 가리킨다", all(p is None or pairs[p] == n for n, p in pairs.items()))
by_name = {j["name"]: j for j in JOINT_MAP["joints"]}
check("손은 왼손 91~111 · 오른손 112~132 로 같은 손가락(+21)", all(by_name["r" + n[1:]]["rtmw"] == by_name[n]["rtmw"] + 21 for n in ("lHandMid", "lHandIdx", "lHandPinky")))
check("발은 왼 17~19 · 오른 20~22(+3)", by_name["rHe"]["rtmw"] == by_name["lHe"]["rtmw"] + 3 and by_name["rTo"]["rtmw"] == by_name["lTo"]["rtmw"] + 3)

print("■ 133점 → 25점")
kp = [[i * 1.0, i * 2.0] for i in range(RTMW_TOTAL)]
sc = [min(1.0, i / 100) for i in range(RTMW_TOTAL)]
pts = to_v2_points(kp, sc)
check("모양 25 × [x, y, v]", len(pts) == N_JOINTS and all(len(p) == 3 for p in pts))
check("코 = RTMW 0, 왼손 셋째 MCP = RTMW 100", pts[0][:2] == [0.0, 0.0] and pts[V2_NAMES.index("lHandMid")][:2] == [100.0, 200.0])
check("확신은 0~1 로 자른다", all(0.0 <= p[2] <= 1.0 for p in pts))

print("■ 구간 · 장면 수")
check("600장 넘으면 고르게 줄인다(순서 유지)", _decimate(list(range(1000)), MAX_FRAMES)[:3] == [0, 2, 3] and len(_decimate(list(range(1000)), MAX_FRAMES)) == MAX_FRAMES)
check("600장 밑이면 그대로", _decimate(list(range(300)), MAX_FRAMES) == list(range(300)))


class FakePose:
    name = "fake"

    def track(self, frames, width, height, fps):
        return {"W": width, "H": height, "fps": fps, "frames": [{"t": f.t, "p": [[1.0, 2.0, 0.9]] * N_JOINTS} for f in frames]}


class _F:
    def __init__(self, t):
        self.t = t


t = FakePose().track([_F(0.0), _F(1 / 60)], 1080, 1920, 60.0)
sanity_track(t)
check("가짜 관절로 엔진 입력 모양(V2Track)", len(t["frames"]) == 2)

print("■ node 묶음 실행기(있으면)")
node = shutil.which(engine.NODE)
if node and engine.RUNNER.is_file():
    with tempfile.TemporaryDirectory() as d:
        bad = Path(d) / "in.json"
        out = Path(d) / "out.json"
        bad.write_text(json.dumps({"side": 1, "back": 2, "jobId": "2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b"}), encoding="utf-8")
        r = subprocess.run([node, "--experimental-strip-types", "--no-warnings", str(engine.RUNNER), "fit", str(bad), str(out)], capture_output=True, text=True, timeout=120, check=False)
        res = json.loads(out.read_text(encoding="utf-8")) if out.is_file() else {}
        check("틀린 입력 → 실패 결과(video)", r.returncode == 0 and res.get("ok") is False and res.get("code") == "video", r.stderr[-300:])
else:
    print(f"  건너뜀 — node({engine.NODE}) 또는 묶음({engine.RUNNER})이 없다. `node scripts/pitch3d-bundle.mjs` 뒤 다시.")

print(f"\n통과 {passed}")
