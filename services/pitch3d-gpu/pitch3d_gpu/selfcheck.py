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
from .video import upright_turn

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

print("■ 영상 회전(display matrix) → 바로 세우기")
check(
    "회전 없음 0 · 거꾸로 180 · 아이폰 세로(-90) 90 · 반대 세로(90) 270",
    [upright_turn(r) for r in (None, 0, 180, -180, -90, 90, 270, -270)] == [0, 0, 180, 180, 90, 270, 90, 270],
)

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
    k70[25] = [0.01, 0, 0]  # 주먹(공을 쥔 손) — 손끝이 손목에 더 가깝다
    k70[28] = [0.09, 0, 0]
    v = sam3d.to_v2(k70, _NAMES)
    ix = {n: i for i, n in enumerate(_NAMES)}
    check("손 관절 = 늘 손허리뼈 마디(third joint) — 주먹을 쥐어 손끝이 가까워도", np.allclose(v[ix["rHandIdx"]], k70[28]))
    check("엔진 관절 25개가 모두 MHR 에 있다", all(n in sam3d.MHR for n in _NAMES))

    # assemble — 알려진 회전 · 크기 · 이동으로 만든 AI 점이 우리 관절로 되돌아오는지, 짧은 틈은 잇고 긴 틈은 miss
    n = 24
    base_shape = rng.normal(size=(25, 3)) * 0.2
    ours = np.array([base_shape + [0.01 * k, 0, 0.002 * k] for k in range(n)])
    inv = {}
    th = 0.4
    Rz = np.array([[np.cos(th), -np.sin(th), 0], [np.sin(th), np.cos(th), 0], [0, 0, 1]])
    for k in range(n):
        a70 = np.zeros((70, 3))
        a = (Rz @ (ours[k] / 1.3).T).T + [0.5, -0.2, 3.0]  # 카메라 좌표(다른 회전 · 크기 · 위치)
        for nm, j in sam3d.MHR.items():
            a70[j] = a[ix[nm]]
        inv[k] = a70.tolist()
    ts = [k / 60 for k in range(n)]
    res = {"ok": True, "t": ts, "joints": np.rint(ours * 1000).astype(int).tolist(), "conf": [[90] * 25 for _ in range(n)]}
    raw = {k: v for k, v in inv.items() if k != 5 and not 10 <= k <= 15}
    ai = sam3d.assemble(res, raw, _NAMES, ts)
    out = np.array(ai["joints"]) / 1000
    err = np.abs(out - ours).max()
    check("assemble: 회전 · 크기를 되찾아 우리 관절로(1mm 안) · 실패한 그림 하나는 이음 · 고르기가 곧은 움직임을 안 바꿈", err < 0.0015, f"{err * 1000:.2f}mm")
    check("assemble: 실패한 그림이 둘 넘게 이어진 틈은 miss(우리 것 그대로)", ai.get("miss") == list(range(10, 16)))
    # 30fps 그림을 60fps 장면에 — 그림 시각(두 장면 가운데)으로 이어 계단이 없어야
    t60 = [k / 60 for k in range(40)]
    def curve(tt):
        c = base_shape.copy()
        c[ix["lWr"]] += [0.3 * np.sin(4 * tt), 0.2 * tt, 0.0]  # 손목만 움직인다
        return c

    ours60 = np.array([curve(tt) for tt in t60])
    res60 = {"ok": True, "t": t60, "joints": np.rint(ours60 * 1000).astype(int).tolist(), "conf": [[90] * 25 for _ in range(40)]}
    pic_t = [(2 * i + 0.5) / 60 for i in range(20)]
    raw30 = {}
    for i, tt in enumerate(pic_t):
        a70 = np.zeros((70, 3))
        for nm, j in sam3d.MHR.items():
            a70[j] = curve(tt)[ix[nm]]
        raw30[i] = a70.tolist()
    o60 = np.array(sam3d.assemble(res60, raw30, _NAMES, pic_t)["joints"]) / 1000
    w = ix["lWr"]
    e_interp = np.median([np.linalg.norm(o60[k, w] - ours60[k, w]) for k in range(2, 38)])
    e_hold = np.median([np.linalg.norm(curve(pic_t[min(19, k // 2)])[w] - ours60[k, w]) for k in range(2, 38)])  # 예전처럼 가까운 그림 그대로
    check("assemble: 30fps 그림 → 60fps 장면을 시각으로 이음(가까운 그림 베끼기의 ¼ 밑 오차)", e_interp < 0.25 * e_hold, f"{e_interp * 1000:.1f} vs {e_hold * 1000:.1f}mm")

    # 영상과 맞추기(gate) — 참 관절을 두 카메라로 비춘 2D 가 있을 때, 우리 손목이 어긋난 장면만 AI(참)를 쓴다
    ng = 40
    truth = np.array([base_shape + [0.0, 1.0, 0.0] for _ in range(ng)])
    cams = {
        "side": {"f": 1000.0, "cx": 500.0, "cy": 500.0, "R": [1, 0, 0, 0, 1, 0, 0, 0, 1], "t": [0.0, 0.0, 4.0], "W": 1000, "H": 1000},
        "back": {"f": 1000.0, "cx": 500.0, "cy": 500.0, "R": [0, 0, -1, 0, 1, 0, 1, 0, 0], "t": [0.0, 0.0, 4.0], "W": 1000, "H": 1000},
    }

    def proj(cam, X):
        R = np.array(cam["R"], dtype=float).reshape(3, 3)
        P = (R @ X.T).T + cam["t"]
        return np.stack([cam["f"] * P[:, 0] / P[:, 2] + cam["cx"], cam["f"] * P[:, 1] / P[:, 2] + cam["cy"]], 1)

    tg = [k / 60 for k in range(ng)]
    trk = {v: {"frames": [{"t": tg[k], "p": [[*xy, 0.9] for xy in proj(cams[v], truth[k]).tolist()]} for k in range(ng)]} for v in cams}
    oursg = truth.copy()
    oursg[10:16, ix["rWr"]] += [0.12, 0.05, 0.0]  # 우리 손목이 어긋난 장면
    resg = {"ok": True, "t": tg, "tBack": tg, "cameras": cams, "joints": np.rint(oursg * 1000).astype(int).tolist()}
    gw = np.array(sam3d.gate(resg, np.rint(truth * 1000).astype(int).tolist(), trk, []))
    check(
        "gate: AI 가 영상에 더 가까운 장면 · 관절만(어긋난 손목 장면 높음, 같은 곳 · 다른 관절 0)",
        gw[12, ix["rWr"]] > 50 and gw[30, ix["rWr"]] == 0 and gw[12, ix["lKn"]] == 0,
        f"{gw[12, ix['rWr']]} · {gw[30, ix['rWr']]} · {gw[12, ix['lKn']]}",
    )
    check("gate: miss 장면은 0", np.array(sam3d.gate(resg, np.rint(truth * 1000).astype(int).tolist(), trk, list(range(ng))))[12].max() == 0)

    # 나눠 맡기(ai_parallel) — 가짜 줄 · 스레드 도우미
    import queue as _q
    import threading
    import time as _t

    from . import ai_parallel as ap

    class FakeQ:
        def __init__(self):
            self.parts: dict = {}
            self.lock = threading.Lock()

        def _p(self, name):
            with self.lock:
                return self.parts.setdefault(name or "", _q.Queue())

        def put(self, v, partition=None):
            self._p(partition).put(v)

        def get(self, block=True, timeout=None, partition=None):
            p = self._p(partition)
            if not block:
                try:
                    return p.get_nowait()
                except _q.Empty:
                    return None
            return p.get(timeout=timeout)  # 시간이 다 되면 queue.Empty(Modal 과 같다)

    class Handle:
        def cancel(self):
            pass

    def fake_infer(frames, chunk, fail_on=None):
        _t.sleep(0.005)
        return {it["k"]: [[float(it["k"])] * 3] * 70 for it in chunk if it["k"] != fail_on}

    items = [{"k": k, "fi": k, "t": k / 60, "box": [0, 0, 1, 1], "K": []} for k in range(100)]
    ap.HELPER_WAIT_SEC = 1.5

    def scenario(helper_kinds, fail_on=None):
        q = FakeQ()
        threads = []

        def spawn(i):
            kind = helper_kinds[i]
            if kind == "never":
                return Handle()

            def infer(frames, chunk):
                if kind == "dies":
                    raise RuntimeError("죽음")  # 묶음을 집은 채 죽는다
                return fake_infer(frames, chunk, fail_on)

            def body():
                try:
                    ap.helper_loop(q, f"h{i}", lambda cfg: [], infer)
                except RuntimeError:
                    pass

            th = threading.Thread(target=body, daemon=True)
            th.start()
            threads.append(th)
            return Handle()

        co = ap.Coordinator(q, spawn, len(helper_kinds))
        co.start()
        co.video({"url": "x", "fromSec": 0, "toSec": 1})
        t0 = _t.time()
        out = co.run(items, lambda c: fake_infer([], c, fail_on))
        co.close()
        return out, _t.time() - t0, co.by

    out, dt, by = scenario(["ok", "ok"])
    check("나눠 맡기: 모든 장면 · 같은 답 · 도우미도 맡음", set(out) == set(range(100)) and all(out[k][0][0] == k for k in out) and sum(by.values()) > 0, f"{by} {dt:.2f}s")
    out, dt, by = scenario(["dies", "ok"])
    check("나눠 맡기: 묶음을 든 채 죽은 도우미 — 빠지는 장면 없음", set(out) == set(range(100)), f"{dt:.2f}s")
    out, dt, by = scenario(["never", "never"])
    check("나눠 맡기: 도우미가 안 켜져도 분석 GPU 혼자 끝냄 · 기다리지 않음", set(out) == set(range(100)) and dt < 1.0, f"{dt:.2f}s")
    out, dt, by = scenario(["ok"], fail_on=7)
    check("나눠 맡기: 사람을 못 찾은 장면이 있어도 기다리지 않음(빠진 것은 그 장면만)", set(out) == set(range(100)) - {7} and dt < 1.0, f"{dt:.2f}s")
else:
    print("  건너뜀 — numpy 없음")

print(f"\n통과 {passed}")
