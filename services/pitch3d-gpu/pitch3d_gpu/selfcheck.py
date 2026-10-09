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
from .pipeline import MAX_FRAMES, _decimate, fit_payload, sanity_track

passed = 0
# 윈도우 콘솔(cp949)에서도 한글 · 기호가 깨지지 않게
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


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
sc = [i / 10 for i in range(RTMW_TOTAL)]  # 원시 점수 0~13
pts = to_v2_points(kp, sc)
check("모양 25 × [x, y, v]", len(pts) == N_JOINTS and all(len(p) == 3 for p in pts))
check("코 = RTMW 0, 왼손 셋째 MCP = RTMW 100", pts[0][:2] == [0.0, 0.0] and pts[V2_NAMES.index("lHandMid")][:2] == [100.0, 200.0])
check("확신은 점수 / 6 을 0~1 로 자른 값", all(0.0 <= p[2] <= 1.0 for p in pts) and abs(pts[1][2] - 0.5 / 6) < 1e-9 and pts[-1][2] == 1.0)

print("■ 구간 · 장면 수")
check("600장 넘으면 고르게 줄인다(순서 유지)", _decimate(list(range(1000)), MAX_FRAMES)[:3] == [0, 2, 3] and len(_decimate(list(range(1000)), MAX_FRAMES)) == MAX_FRAMES)
check("600장 밑이면 그대로", _decimate(list(range(300)), MAX_FRAMES) == list(range(300)))

print("■ fit 입력(촬영 정보 넘기기)")
_fp = fit_payload({"jobId": "j", "meta": {"hand": "L", "slowmoFps": 240, "screenRecorded": True, "heightCm": 180}}, {"side": 1, "back": 2}, {"events": {"footPlant": 1.0, "release": 1.2}}, "rtmw")
check("슬로모 · 화면 녹화를 엔진에 넘긴다(빼면 착지 → 릴리스가 4~8배 길었다)", _fp["slowmoFps"] == 240 and _fp["screenRecorded"] is True and _fp["hand"] == "L")
check("segment 순간을 넘긴다", _fp["events"] == {"footPlant": 1.0, "release": 1.2})
_fp2 = fit_payload({"jobId": "j", "meta": {"slowmoFps": 999}}, {"side": 1, "back": 2}, {}, "rtmw")
check("모르는 슬로모 값 · 정보 없음은 None · 원본", _fp2["slowmoFps"] is None and _fp2["screenRecorded"] is False and _fp2["hand"] == "R")


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

print("■ AI 스켈레톤 보정(sam3d) — 좌표 맞추기 · 관절 고르기(numpy 가 있으면)")
try:
    import numpy as np
except ImportError:
    np = None
if np is not None:
    from . import sam3d
    from .mapping import V2_NAMES as _NAMES

    rng = np.random.default_rng(1)
    A = rng.normal(size=(40, 3))
    A -= A.mean(0)
    th = 0.7
    R0 = np.array([[np.cos(th), -np.sin(th), 0], [np.sin(th), np.cos(th), 0], [0, 0, 1]])
    R, s = sam3d.umeyama(A, 1.7 * (R0 @ A.T).T)
    check("Umeyama 가 회전 · 크기를 되찾는다", np.abs(R - R0).max() < 1e-9 and abs(s - 1.7) < 1e-9)
    R2, _ = sam3d.umeyama(A, A * np.array([-1, 1, 1]))
    check("거울은 회전으로 안 만든다(det +1)", abs(np.linalg.det(R2) - 1) < 1e-9)
    k70 = rng.normal(size=(70, 3))
    k70[41] = [0, 0, 0]
    for i, c in enumerate([28, 27, 26, 25]):
        k70[c] = [0.02 * (i + 1) + 0.05, 0, 0]
    v = sam3d.to_v2(k70, _NAMES)
    ix = {n: i for i, n in enumerate(_NAMES)}
    check("손 관절 = 손가락 네 점 중 손목에 가장 가까운 마디", np.allclose(v[ix["rHandIdx"]], k70[28]))
    check("엔진 관절 25개가 모두 MHR 에 있다", all(n in sam3d.MHR or n in sam3d.FINGERS for n in _NAMES))
else:
    print("  건너뜀 — numpy 없음")

print(f"\n통과 {passed}")
