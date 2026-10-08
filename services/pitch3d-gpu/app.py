"""3D 투구 분석 v2 — Modal 껍데기(설계 pitch-3d-quality.md 기술 D1 · 검토 1절).

    modal deploy app.py            → 주소 하나(asgi): POST /jobs · GET /jobs/{call_id}
    modal run app.py::warm         → 모델을 미리 받아 둔다(첫 분석 +30초를 줄인다)

사이트 서버(app/actions/pitch-lab.ts)만 부른다 — 프록시 인증(Modal-Key · Modal-Secret). 영상은 서명 주소로 받고 결과는 서명 올리기 주소로
올린다 — 저장소 키를 여기 두지 않는다. 상태는 작업 번호(FunctionCall id)로 묻는다(알림 주소 없음). 진행은 modal.Dict 에 단계별로 적는다.
"""

from __future__ import annotations

import json
import os
import time

import modal

APP_NAME = "bullpen-pitch3d"
GPU = os.environ.get("PITCH3D_GPU", "L4")
TIMEOUT_SEC = 15 * 60  # 웹 쪽 15분 timeout 과 같다

image = (
    # CUDA 12 + cuDNN 런타임 — onnxruntime-gpu 가 GPU 로 돌려면 cuDNN 이 있어야 한다(debian_slim 엔 없어 CPU 로 떨어졌다, 2026-10-08 첫 실제 영상)
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("ffmpeg", "curl", "ca-certificates", "gnupg", "libgl1", "libglib2.0-0")
    # node 22(타입 벗기기) — 엔진 묶음(engine/)을 그대로 돌린다
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "node --version",
    )
    .pip_install("rtmlib>=0.0.13", "av>=12", "numpy>=1.26", "requests>=2.31", "fastapi[standard]>=0.110")
    # rtmlib 가 끌어오는 CPU 용 onnxruntime 을 빼고 GPU 용만 남긴다(둘이 같이 있으면 CPU 쪽이 잡힌다)
    .run_commands("pip uninstall -y onnxruntime onnxruntime-gpu", "pip install 'onnxruntime-gpu>=1.17'")
    .add_local_dir(os.path.join(os.path.dirname(__file__), "engine"), remote_path="/root/engine")
    .add_local_python_source("pitch3d_gpu")
)

app = modal.App(APP_NAME, image=image)
progress = modal.Dict.from_name(f"{APP_NAME}-progress", create_if_missing=True)

_pose_cache: dict = {}


def _pose_factory():
    if "pose" not in _pose_cache:
        from pitch3d_gpu.pose import Pose

        _pose_cache["pose"] = Pose(device="cuda")
    return _pose_cache["pose"]


@app.function(gpu=GPU, timeout=TIMEOUT_SEC, memory=8192)
def analyze(job: dict) -> dict:
    """한 작업 — 결과는 저장소에 올리고, 상태는 progress[call_id] 에."""
    from pitch3d_gpu.pipeline import run_job

    call_id = modal.current_function_call_id()
    job_id = str(job.get("jobId", ""))

    def report(stage: str, stages: dict) -> None:
        progress[call_id] = {"status": "running", "stage": stage, "stages": stages, "jobId": job_id, "at": time.time()}

    try:
        out = run_job(job, _pose_factory, report)
    except Exception as e:  # noqa: BLE001 — 모르는 예외는 여기 한 곳에서만 잡고 이름 · 단계 · 번호를 남긴다(검토 2절 Internal)
        print(f"[pitch3d internal] job={job_id} call={call_id} {type(e).__name__}: {e}")
        out = {"status": "failed", "code": "internal", "stage": "fit", "stages": {}}
    progress[call_id] = {**out, "jobId": job_id, "at": time.time()}
    return out


@app.function(gpu=GPU, timeout=600)
def warm() -> str:
    """모델을 미리 받아 둔다 — `modal run app.py::warm`."""
    _pose_factory()
    return "ok"


@app.function()
@modal.asgi_app(requires_proxy_auth=True)
def web():
    from fastapi import FastAPI, HTTPException

    api = FastAPI()

    @api.post("/jobs")
    def start(body: dict):
        for k in ("jobId", "side", "back", "result"):
            if k not in body:
                raise HTTPException(400, f"{k} 가 없다")
        call = analyze.spawn(body)
        progress[call.object_id] = {"status": "pending", "jobId": str(body["jobId"]), "at": time.time()}
        return {"callId": call.object_id}

    @api.get("/jobs/{call_id}")
    def status(call_id: str):
        try:
            p = progress[call_id]
        except KeyError:
            p = None
        if p is None:
            # 진행 기록이 없으면 호출 자체를 본다(아주 오래된 작업 · Dict 가 비워진 뒤)
            try:
                fc = modal.FunctionCall.from_id(call_id)
                out = fc.get(timeout=0)
                return {"status": out.get("status", "failed"), "code": out.get("code"), "stages": out.get("stages", {})}
            except TimeoutError:
                return {"status": "running"}
            except Exception:  # noqa: BLE001
                return {"status": "unknown"}
        return {
            "status": p.get("status", "unknown"),
            "stage": p.get("stage"),
            "stages": p.get("stages", {}),
            "code": p.get("code"),
        }

    return api


if __name__ == "__main__":
    print(json.dumps({"app": APP_NAME, "gpu": GPU}))
