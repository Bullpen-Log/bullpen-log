"""TS 엔진 부르기(설계 E-P7) — 묶은 engine/lib/pitch-3d/v2/run-node.ts 를 node 로 돌린다. 시간 맞추기 · 카메라 · 뼈대 맞추기 · 지표 · 결과 모양 검사가 모두 그 안이다.

   segment: 거친 2D(두 영상 60fps 전체) → 투구 구간(옆 · 뒤 영상 시각)
   fit:     구간의 2D(120fps) → analysis-v2 결과 JSON(실패도 결과 모양)
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

ENGINE_DIR = Path(os.environ.get("PITCH3D_ENGINE_DIR", "/root/engine"))
RUNNER = ENGINE_DIR / "lib" / "pitch-3d" / "v2" / "run-node.ts"
NODE = os.environ.get("PITCH3D_NODE", "node")
TIMEOUT_SEC = 600


class EngineError(Exception):
    pass


def run(mode: str, payload: dict) -> dict:
    if mode not in ("segment", "fit"):
        raise ValueError(mode)
    if not RUNNER.is_file():
        raise EngineError(f"엔진 묶음이 없다: {RUNNER} — `node scripts/pitch3d-bundle.mjs`")
    with tempfile.TemporaryDirectory() as d:
        inp = Path(d) / "in.json"
        out = Path(d) / "out.json"
        inp.write_text(json.dumps(payload), encoding="utf-8")
        r = subprocess.run(
            [NODE, "--experimental-strip-types", "--no-warnings", "--max-old-space-size=4096", str(RUNNER), mode, str(inp), str(out)],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SEC,
            check=False,
        )
        if r.returncode != 0 or not out.is_file():
            raise EngineError((r.stderr or r.stdout or "node 실패")[-2000:])
        return json.loads(out.read_text(encoding="utf-8"))
