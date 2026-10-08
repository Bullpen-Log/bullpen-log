"""한 작업의 차례(설계 pitch-3d-quality.md 검토 1절 · 2절 오류 지도) — download → pose(거친 60fps) → segment → pose(구간 120fps) → fit → upload.

report(stage, stages) 로 단계를 알리고, 끝에 {"status": "done"} 또는 {"status": "failed", "code": …} 를 돌려준다. 모르는 예외는 맨 바깥(app.py)에서
'internal' 로 잡고 이름 · 단계 · jobId 를 남긴다(삼키지 않는다). 영상 파일은 임시 폴더에만 두고 끝에 지운다(검토 3절).
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from typing import Callable

from . import engine, video
from .mapping import N_JOINTS

COARSE_FPS = 60.0
FINE_FPS = 120.0
MAX_FRAMES = 600  # E-CAP — TS contract MAX_V2_FRAMES 와 같은 값
MAX_VIDEO_SEC = 30.0  # 검토 4절 '너무 김' — 처음 30초만
DOWNLOAD_RETRY = (1.0, 3.0)
UPLOAD_RETRY = (1.0, 3.0)
V2_VERSION = "2.0.0"

Report = Callable[[str, dict], None]


class StepFail(Exception):
    def __init__(self, code: str, stage: str, detail: str = ""):
        super().__init__(f"{stage}:{code} {detail}")
        self.code = code
        self.stage = stage


def _download(url: str, path: str) -> None:
    import requests  # 이미지 안에만 있다 — selfcheck 는 표준 라이브러리만으로 돈다

    last = None
    for i, wait in enumerate((0.0,) + DOWNLOAD_RETRY):
        if wait:
            time.sleep(wait)
        try:
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                size = 0
                with open(path, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                        size += len(chunk)
                if size == 0:
                    raise StepFail("video", "download", "0 bytes")
                return
        except StepFail:
            raise
        except Exception as e:  # noqa: BLE001
            last = e
    raise StepFail("video", "download", str(last))


def _upload(url: str, body: str) -> None:
    import requests

    last = None
    for wait in (0.0,) + UPLOAD_RETRY:
        if wait:
            time.sleep(wait)
        try:
            r = requests.put(
                url,
                data=body.encode("utf-8"),
                headers={"Content-Type": "application/json", "x-upsert": "true"},
                timeout=60,
            )
            if r.status_code in (200, 201) or r.status_code == 409:
                return
            last = f"{r.status_code} {r.text[:200]}"
        except Exception as e:  # noqa: BLE001
            last = str(e)
    raise StepFail("upload", "upload", str(last))


def _fail_result(job_id: str, code: str, stage: str) -> str:
    """엔진을 못 거친 실패도 결과 파일 모양으로(화면이 같은 길로 읽는다)."""
    return json.dumps({"ok": False, "version": V2_VERSION, "jobId": job_id, "code": code, "reason": "", "stage": stage})


def _decimate(frames: list, cap: int) -> list:
    if len(frames) <= cap:
        return frames
    keep = sorted({round(k * (len(frames) - 1) / (cap - 1)) for k in range(cap)})
    return [frames[i] for i in keep]


def run_job(job: dict, pose_factory: Callable[[], object], report: Report) -> dict:
    job_id = str(job["jobId"])
    stages: dict[str, float] = {}
    t_start = time.time()

    def mark(stage: str) -> None:
        stages[stage] = round(time.time() - t_start - sum(stages.values()), 1)
        report(stage, dict(stages))

    with tempfile.TemporaryDirectory() as d:
        side_path = os.path.join(d, "side.mp4")
        back_path = os.path.join(d, "back.mp4")
        result_json: str
        try:
            report("download", {})
            _download(job["side"]["url"], side_path)
            _download(job["back"]["url"], back_path)
            mark("download")

            try:
                sw, sh, sfps = video.probe(side_path)
                bw, bh, bfps = video.probe(back_path)
                coarse = {
                    "side": video.decode(side_path, COARSE_FPS, 0.0, MAX_VIDEO_SEC),
                    "back": video.decode(back_path, COARSE_FPS, 0.0, MAX_VIDEO_SEC),
                }
            except video.DecodeError as e:
                raise StepFail("video", "pose", str(e)) from e
            if len(coarse["side"]) < 20 or len(coarse["back"]) < 20:
                raise StepFail("short", "pose")
            pose = pose_factory()
            tracks = {
                "side": pose.track(coarse["side"], sw, sh, min(COARSE_FPS, sfps)),
                "back": pose.track(coarse["back"], bw, bh, min(COARSE_FPS, bfps)),
            }
            mark("pose")

            seg = engine.run("segment", {"side": tracks["side"], "back": tracks["back"]})
            if not seg.get("ok"):
                raise StepFail(str(seg.get("code", "events")), "segment")
            mark("segment")

            fine_side = video.decode(side_path, FINE_FPS, seg["side"]["fromSec"], seg["side"]["toSec"], MAX_FRAMES + 50)
            fine_back = video.decode(back_path, FINE_FPS, seg["back"]["fromSec"], seg["back"]["toSec"], MAX_FRAMES + 50)
            fine_side = _decimate(fine_side, MAX_FRAMES)
            fine_back = _decimate(fine_back, MAX_FRAMES)
            fine = {
                "side": pose.track(fine_side, sw, sh, min(FINE_FPS, sfps)),
                "back": pose.track(fine_back, bw, bh, min(FINE_FPS, bfps)),
            }
            meta = job.get("meta") or {}
            result = engine.run(
                "fit",
                {
                    "side": fine["side"],
                    "back": fine["back"],
                    "hand": "L" if meta.get("hand") == "L" else "R",
                    "heightCm": meta.get("heightCm"),
                    "jobId": job_id,
                    "poseModel": getattr(pose, "name", "rtmw"),
                },
            )
            mark("fit")
            result_json = json.dumps(result)
            assert len(result_json) < 900_000, "결과가 900KB 를 넘는다"  # 엔진이 먼저 거르지만 한 번 더
        except StepFail as e:
            result_json = _fail_result(job_id, e.code, e.stage)
            try:
                _upload(job["result"]["uploadUrl"], result_json)
            except StepFail:
                pass
            return {"status": "failed", "code": e.code, "stage": e.stage, "stages": stages}
        except engine.EngineError as e:
            result_json = _fail_result(job_id, "internal", "fit")
            try:
                _upload(job["result"]["uploadUrl"], result_json)
            except StepFail:
                pass
            return {"status": "failed", "code": "internal", "stage": "fit", "stages": stages, "detail": str(e)[:500]}

        report("upload", dict(stages))
        try:
            _upload(job["result"]["uploadUrl"], result_json)
        except StepFail as e:
            return {"status": "failed", "code": e.code, "stage": "upload", "stages": stages}
        mark("upload")
        parsed = json.loads(result_json)
        if parsed.get("ok"):
            return {"status": "done", "stages": stages, "frames": len(parsed.get("t", []))}
        return {"status": "failed", "code": parsed.get("code", "internal"), "stage": parsed.get("stage", "fit"), "stages": stages}


def sanity_track(track: dict) -> None:
    """pose.track 의 결과 모양(엔진 입력) — selfcheck 가 가짜 Pose 로 돌릴 때 쓴다."""
    assert set(track) == {"W", "H", "fps", "frames"}
    for f in track["frames"]:
        assert len(f["p"]) == N_JOINTS
        for x, y, v in f["p"]:
            assert 0.0 <= v <= 1.0
