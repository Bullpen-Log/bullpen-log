"""통계 움직임 틀 채점 — 투수 한 명씩 빼고(나머지로 틀) 그 투수의 투구에서 빠른 구간 관절을 두 영상 다 지우고, 틀 없이 · 틀로 짐작한
자리를 진짜와 비교한다(cm). 틀이 엔진에 들어가려면 여기서 좋아져야 한다.

  python scripts/pitch-lab/markers/template_eval.py 작업폴더 투수1:a.c3d,b.c3d 투수2:폴더1,폴더2 … | @투수.json [--per 2] [--pids 25] [--jobs 6]

투구는 C3D(mocap_bench 가 2D 를 만든다) 또는 이미 만든 투구 폴더(truth.json · seg.json). 작업폴더에 지운 영상 폴더 · 틀 · 결과를 만든다.
--pids 는 채점할 투수 수(앞에서부터, 틀은 늘 나머지 모두로), --jobs 는 엔진을 같이 돌리는 수.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
from mocap_bench import IX, make_tracks, tracks_from_joints, umeyama  # noqa: E402
from motion_template import build  # noqa: E402

NODE = ["node", "--import", "./scripts/alias-register.mjs", "scripts/pitch-lab/markers/mocap-fit.mts"]

# 지우기: (이름, 관절들(던지는 쪽 t · 글러브 쪽 g), 길이 ms) — 착지 → 릴리스 가운데에 둔다
SPECS = [
    ("던지는 손목 133ms", ["tWr", "tHandMid", "tHandIdx", "tHandPinky"], 133),
    ("던지는 팔꿈치+손목 200ms", ["tEl", "tWr", "tHandMid", "tHandIdx", "tHandPinky"], 200),
    ("글러브 팔꿈치 133ms", ["gEl"], 133),
    ("앞무릎 133ms", ["gKn"], 133),
]


def run(cmd: list[str]) -> str:
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout


def load(folder: str, name: str) -> dict:
    with open(os.path.join(folder, name), encoding="utf-8") as f:
        return json.load(f)


def err_cm(folder: str, joint: str, a: int, b: int) -> float | None:
    tr = load(folder, "truth.json")
    res = load(folder, "result.json")
    if not res.get("ok"):
        return None
    T = np.array(tr["joints"])
    E = np.array(res["joints"], float)
    idx = np.clip(np.round(np.array(res["t"]) * tr["meta"]["rate"]).astype(int), 0, len(T) - 1)
    Tm = T[idx]
    s, R, t = umeyama(E.reshape(-1, 3), Tm.reshape(-1, 3))
    Ea = (E @ R.T) * s + t
    sel = [k for k, i in enumerate(idx) if a <= i <= b]
    if not sel:
        return None
    return float(np.median(np.linalg.norm(Ea[sel, IX[joint]] - Tm[sel, IX[joint]], axis=-1)) * 100)


def prepare(work: str, pid: str, src: str) -> str | None:
    """투구 하나 → 투구 폴더(2D · 정답 · 순간). 폴더가 오면 그대로."""
    if os.path.isdir(src):
        d = src
    else:
        d = os.path.join(work, f"{pid}__{os.path.splitext(os.path.basename(src))[0]}")
        if not os.path.exists(os.path.join(d, "truth.json")):
            make_tracks(src, d, noise=0.004)
    if not os.path.exists(os.path.join(d, "seg.json")):
        run(NODE + [d, "--segment-only"])
    return d if os.path.exists(os.path.join(d, "seg.json")) else None


def hide_one(work: str, d: str, tpl: str, spec: tuple) -> tuple[float, float] | None:
    name, joints, ms = spec
    truth = load(d, "truth.json")
    seg = load(d, "seg.json")
    meta = truth["meta"]
    rate, hand = meta["rate"], meta["hand"].lower()
    gl = "l" if hand == "r" else "r"
    js = [j.replace("t", hand, 1) if j.startswith("t") else j.replace("g", gl, 1) for j in joints]
    fp, rel = int(round(seg["footPlant"] * rate)), int(round(seg["release"] * rate))
    n = max(2, int(round(ms / 1000 * rate)))
    c = (fp + rel) // 2
    a, b = c - n // 2, c - n // 2 + n - 1
    hd = os.path.join(work, f"{os.path.basename(d)}__hide__{name.split()[0]}{name.split()[1]}")
    tracks_from_joints(np.array(truth["joints"]), rate, hd, meta["source"], noise=meta.get("noise", 0.004),
                       hide=["+".join(js), str(a), str(b)], height_m=meta["height_m"])
    run(NODE + [hd])
    e0 = err_cm(hd, js[0], a, b)
    run(NODE + [hd, "--template", tpl])
    e1 = err_cm(hd, js[0], a, b)
    return None if e0 is None or e1 is None else (e0, e1)


def main(work: str, groups: dict[str, list[str]], per: int = 2, pids: int | None = None, jobs: int = 6) -> None:
    os.makedirs(work, exist_ok=True)
    trials: dict[str, list[str]] = {}
    with ThreadPoolExecutor(jobs) as ex:
        done = ex.map(lambda ps: (ps[0], prepare(work, *ps)), [(pid, f) for pid, fs in groups.items() for f in fs])
        for pid, d in done:
            if d:
                trials.setdefault(pid, []).append(d)
    print(f"투구 {sum(len(v) for v in trials.values())}개 · 투수 {len(trials)}명")
    judged = sorted(trials)[:pids] if pids else sorted(trials)
    work_items = []
    for pid in judged:
        others = [d for q, ds in trials.items() if q != pid for d in ds]
        tpl = os.path.join(work, f"tpl_without_{pid}.json")
        if not os.path.exists(tpl):
            build(tpl, others, source=f"평가용(투수 {pid} 뺌)")
        work_items += [(pid, d, tpl, spec) for d in trials[pid][:per] for spec in SPECS]
    rows: dict[str, list[tuple[float, float]]] = {s[0]: [] for s in SPECS}

    def one(item):
        pid, d, tpl, spec = item
        return item, hide_one(work, d, tpl, spec)

    with ThreadPoolExecutor(jobs) as ex:
        for (pid, d, _, spec), r in ex.map(one, work_items):
            if r:
                rows[spec[0]].append(r)
                print(f"  {pid} {os.path.basename(d)} {spec[0]}: 틀 없이 {r[0]:.1f} → 틀 {r[1]:.1f}cm", flush=True)
    print("\n■ 가운데값(cm): 틀 없이 → 틀")
    for name, v in rows.items():
        if v:
            a = np.array(v)
            print(f"  {name}: {np.median(a[:, 0]):.1f} → {np.median(a[:, 1]):.1f}  "
                  f"(p90 {np.percentile(a[:, 0], 90):.1f} → {np.percentile(a[:, 1], 90):.1f} · 좋아짐 {np.mean(a[:, 1] < a[:, 0]) * 100:.0f}% · {len(v)}개)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__)
        sys.exit(0)
    opt = lambda k, d: int(a[a.index(k) + 1]) if k in a else d  # noqa: E731
    groups = {}
    for g in a[1:]:
        if g.startswith("@"):  # 투수 → 투구 목록 JSON(명령 줄이 너무 길 때)
            groups.update(json.load(open(g[1:], encoding="utf-8")))
        elif ":" in g and not g.startswith("--"):
            pid, files = g.split(":", 1)
            groups[pid] = files.split(",")
    main(a[0], groups, opt("--per", 2), opt("--pids", None), opt("--jobs", 6))
