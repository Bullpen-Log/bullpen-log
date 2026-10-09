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

COARSE_FPS = 30.0  # 거친 1차는 30fps 면 시간 맞추기에 충분(v1 이 30fps 화면 녹화로 검증됨) — 60 은 장면이 두 배
FINE_FPS = 120.0
MAX_FRAMES = 600  # E-CAP — TS contract MAX_V2_FRAMES 와 같은 값
MAX_VIDEO_SEC = 20.0  # 검토 4절 '너무 김' — 처음 20초만(투구 한 번은 5~6초)
DOWNLOAD_RETRY = (1.0, 3.0)
UPLOAD_RETRY = (1.0, 3.0)
V2_VERSION = "2.0.0"

Report = Callable[[str, dict], None]


def fit_payload(job: dict, fine: dict, seg: dict, pose_name: str) -> dict:
    """fit 입력 — 촬영 정보(손 · 키 · 슬로모 · 화면 녹화)와 segment 순간을 함께 넘긴다.

    슬로모 · 화면 녹화를 빼면 엔진이 4~8배 느린 영상 시간을 실제로 알아 '착지 → 릴리스'가 그만큼 길게 나왔다(2026-10-08 샘플 셋 0.5~1초).
    segment 순간을 빼면 잘라 낸 구간에서 다시 찾다 실패했다(같은 날 샘플 1 · 3).
    """
    meta = job.get("meta") or {}
    slowmo = meta.get("slowmoFps")
    return {
        "side": fine["side"],
        "back": fine["back"],
        "hand": "L" if meta.get("hand") == "L" else "R",
        "heightCm": meta.get("heightCm"),
        "jobId": str(job.get("jobId", "")),
        "poseModel": pose_name,
        "slowmoFps": slowmo if slowmo in (120, 240) else None,
        "screenRecorded": meta.get("screenRecorded") is True,
        "events": seg.get("events"),
    }


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


def fine_frames(path: str, from_sec: float, to_sec: float) -> list:
    """구간의 장면(120fps, 600장까지) — 분석 GPU 와 AI 도우미가 같은 그림을 얻게 한 곳에서."""
    return _decimate(video.decode(path, FINE_FPS, from_sec, to_sec, MAX_FRAMES + 50), MAX_FRAMES)


def helper_frames(cfg: dict) -> list:
    """AI 도우미 — 옆 영상을 받아 분석 GPU 와 같은 구간 장면을 푼다(ai_parallel.helper_loop)."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "side.mp4")
        _download(cfg["url"], path)
        return fine_frames(path, cfg["fromSec"], cfg["toSec"])


def run_job(
    job: dict, pose_factory: Callable[[], object], report: Report, ai: object | None = None, use_ai: bool = False
) -> dict:
    """use_ai 면 AI 스켈레톤 보정까지(app.py AI_ON — 지금 꺼 둠). ai 는 그것을 나눠 맡기는 손잡이(ai_parallel.Coordinator — video · run · close),
    없으면 이 GPU 하나로.

    job["dryRun"] 이 True 면 올리지 않고 결과를 돌려준다(app.py e2e — 실제 영상으로 끝까지 시험할 때).
    """
    job_id = str(job["jobId"])
    dry = job.get("dryRun") is True
    stages: dict[str, float] = {}
    t_start = time.time()
    from . import sam3d  # AI 모델은 AI 단계에서 올린다 — 앞에서 미리 올리면 받기 · 관절 찾기와 CPU 를 다퉈 20초쯤 늦었다(2026-10-09 시험)

    def mark(stage: str) -> None:
        stages[stage] = round(time.time() - t_start - sum(stages.values()), 1)
        report(stage, dict(stages))

    with tempfile.TemporaryDirectory() as d:
        side_path = os.path.join(d, "side.mp4")
        back_path = os.path.join(d, "back.mp4")
        result_json: str
        fine: dict = {}
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
            for name, tr in tracks.items():
                print(f"[pitch3d pose] {name}: {track_summary(tr)}")

            seg = engine.run("segment", {"side": tracks["side"], "back": tracks["back"]})
            if not seg.get("ok"):
                print(f"[pitch3d segment] failed: {json.dumps(seg, ensure_ascii=False)[:600]}")
                raise StepFail(str(seg.get("code", "events")), "segment")
            print(f"[pitch3d segment] {json.dumps(seg)[:300]}")
            mark("segment")
            if use_ai and ai is not None:
                ai.video({"url": job["side"]["url"], "fromSec": seg["side"]["fromSec"], "toSec": seg["side"]["toSec"]})

            fine_side = fine_frames(side_path, seg["side"]["fromSec"], seg["side"]["toSec"])
            fine_back = fine_frames(back_path, seg["back"]["fromSec"], seg["back"]["toSec"])
            fine = {
                "side": pose.track(fine_side, sw, sh, min(FINE_FPS, sfps)),
                "back": pose.track(fine_back, bw, bh, min(FINE_FPS, bfps)),
            }
            result = engine.run("fit", fit_payload(job, fine, seg, getattr(pose, "name", "rtmw")))
            # AI 스켈레톤 보정(실험, sam3d.py) — 켰을 때만, 못 하면 그대로(분석은 막지 않는다). 단계 이름은 fit 안에(화면의 단계 표를 안 바꾼다)
            if use_ai and result.get("ok"):
                t_ai = time.time()
                try:
                    from .mapping import V2_NAMES

                    def local(chunk: list) -> dict:
                        est = sam3d._load()
                        return sam3d.infer_items(est, fine_side, chunk) if est is not None else {}

                    run = (lambda items: ai.run(items, local)) if ai is not None else None
                    out_ai = sam3d.correct(result, fine_side, fine["side"], V2_NAMES, run)
                    if out_ai:
                        # 영상과 맞추기 — AI 가 두 영상에 우리보다 가까운 장면 · 관절만 쓴다(못 따지면 싣지 않는다)
                        out_ai["w"] = sam3d.gate(result, out_ai["joints"], fine, out_ai.get("miss", []))
                        if out_ai["w"]:
                            result["experimental"] = {"sam3d": out_ai}
                        import numpy as np

                        w = np.array(out_ai["w"] or 0, dtype=float)[..., None] / 100
                        mixed = np.rint(np.array(result["joints"]) * (1 - w) + np.array(out_ai["joints"]) * w).astype(int).tolist()
                        agree = {
                            "우리": sam3d.video_agreement(result, result["joints"], fine, V2_NAMES),
                            "AI": sam3d.video_agreement(result, out_ai["joints"], fine, V2_NAMES),
                            "섞음": sam3d.video_agreement(result, mixed, fine, V2_NAMES),
                        }
                        used = float(np.mean(w > 0)) if out_ai["w"] else 0.0
                        print(f"[pitch3d ai] 영상과 차이(몸 높이 %) {json.dumps(agree, ensure_ascii=False)} · AI 를 쓴 관절 {used:.0%}")
                except Exception as e:  # noqa: BLE001
                    print(f"[pitch3d ai] 건너뜀 — {type(e).__name__}: {str(e)[:300]}")
                print(f"[pitch3d ai] {time.time() - t_ai:.1f}초")
            mark("fit")
            result_json = json.dumps(result)
            assert len(result_json) < 900_000, "결과가 900KB 를 넘는다"  # 엔진이 먼저 거르지만 한 번 더
        except StepFail as e:
            result_json = _fail_result(job_id, e.code, e.stage)
            try:
                if not dry:
                    _upload(job["result"]["uploadUrl"], result_json)
            except StepFail:
                pass
            return {"status": "failed", "code": e.code, "stage": e.stage, "stages": stages}
        except engine.EngineError as e:
            result_json = _fail_result(job_id, "internal", "fit")
            try:
                if not dry:
                    _upload(job["result"]["uploadUrl"], result_json)
            except StepFail:
                pass
            return {"status": "failed", "code": "internal", "stage": "fit", "stages": stages, "detail": str(e)[:500]}

        report("upload", dict(stages))
        try:
            if not dry:
                _upload(job["result"]["uploadUrl"], result_json)
        except StepFail as e:
            return {"status": "failed", "code": e.code, "stage": "upload", "stages": stages}
        mark("upload")
        parsed = json.loads(result_json)
        if dry:  # 2D 관절도 돌려준다 — 화면 그대로(섞기 · 각도 모델)를 영상에 비춰 보는 시험용, 거친 것은 순간 찾기(segment)를 다시 돌려 볼 때
            return {"status": "done" if parsed.get("ok") else "failed", "stages": stages, "result": parsed, "tracks": fine, "coarse": tracks}
        if parsed.get("ok"):
            return {"status": "done", "stages": stages, "frames": len(parsed.get("t", []))}
        return {"status": "failed", "code": parsed.get("code", "internal"), "stage": parsed.get("stage", "fit"), "stages": stages}


def track_summary(track: dict) -> str:
    """로그용 — 장면 수 · 사람이 보인 장면 비율 · 몸 17점 확신 평균 · 사람 높이(px) 중앙값."""
    fr = track.get("frames", [])
    if not fr:
        return "frames 0"
    confs = []
    heights = []
    seen = 0
    for f in fr:
        p = f["p"]
        body = [v for _, _, v in p[:17]]
        m = sum(body) / 17
        confs.append(m)
        if m >= 0.5:
            seen += 1
            ys = [y for _, y, v in p[:17] if v >= 0.5]
            if len(ys) >= 4:
                heights.append(max(ys) - min(ys))
    heights.sort()
    med = heights[len(heights) // 2] if heights else 0
    return (
        f"frames {len(fr)} · {fr[0]['t']:.2f}~{fr[-1]['t']:.2f}s · fps {track.get('fps')} · W×H {track.get('W')}×{track.get('H')} · "
        f"seen {seen / len(fr):.0%} · conf {sum(confs) / len(confs):.2f} · height {med:.0f}px"
    )


def sanity_track(track: dict) -> None:
    """pose.track 의 결과 모양(엔진 입력) — selfcheck 가 가짜 Pose 로 돌릴 때 쓴다."""
    assert set(track) == {"W", "H", "fps", "frames"}
    for f in track["frames"]:
        assert len(f["p"]) == N_JOINTS
        for x, y, v in f["p"]:
            assert 0.0 <= v <= 1.0
