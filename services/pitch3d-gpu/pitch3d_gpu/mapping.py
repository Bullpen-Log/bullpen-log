"""관절 표 — lib/pitch-3d/v2/joint-map.json 하나를 TS 와 같이 읽는다(묶기 스크립트가 engine/ 으로 복사한다).

RTMW(COCO-WholeBody 133점)의 번호 → 엔진 관절 25개(앞 17 = v1 차례). 표를 여기 다시 적지 않는다 — 두 벌이면 어긋난다.
"""

from __future__ import annotations

import json
from pathlib import Path

_HERE = Path(__file__).resolve().parent
# 묶음(engine/) 안의 표 — 로컬 개발에서는 저장소의 원본을 본다
_CANDIDATES = [
    _HERE.parent / "engine" / "lib" / "pitch-3d" / "v2" / "joint-map.json",
    _HERE.parent.parent.parent / "lib" / "pitch-3d" / "v2" / "joint-map.json",
    Path("/root/engine/lib/pitch-3d/v2/joint-map.json"),
]


def _load() -> dict:
    for p in _CANDIDATES:
        if p.is_file():
            with p.open("r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("joint-map.json 이 없다 — `node scripts/pitch3d-bundle.mjs` 로 engine/ 을 만들 것")


JOINT_MAP = _load()
V2_NAMES: list[str] = [j["name"] for j in JOINT_MAP["joints"]]
RTMW_INDEX: list[int] = [int(j["rtmw"]) for j in JOINT_MAP["joints"]]
N_JOINTS = len(V2_NAMES)
RTMW_TOTAL = int(JOINT_MAP["rtmwTotal"])


def to_v2_points(keypoints, scores) -> list[list[float]]:
    """한 사람의 RTMW 133점(x, y) · 확신 → 엔진 관절 25개 [x, y, v]."""
    out = []
    for idx in RTMW_INDEX:
        x, y = keypoints[idx]
        v = float(scores[idx])
        out.append([float(x), float(y), max(0.0, min(1.0, v))])
    return out
