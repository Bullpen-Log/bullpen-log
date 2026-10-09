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
    # 1.22+ 는 CUDA 13 을 찾는다 — 이미지는 CUDA 12.4 + cuDNN 9 라 1.21 로 못박는다
    .run_commands("pip uninstall -y onnxruntime onnxruntime-gpu", "pip install onnxruntime-gpu==1.21.1")
    # AI 스켈레톤 보정(실험, pitch3d_gpu/sam3d.py) — 메타 SAM 3D Body(ViT-H). 코드는 고정 커밋, 무게는 처음 쓸 때 HF 에서(볼륨에 남김)
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    .pip_install(
        "pytorch-lightning==2.4.0",
        "timm==1.0.11",
        "einops==0.8.0",
        "yacs==0.1.8",
        "roma==1.5.1",
        "omegaconf==2.3.0",
        "braceexpand==0.1.7",
        "huggingface_hub==0.26.2",
        "opencv-python-headless==4.10.0.84",
    )
    .apt_install("git")
    .run_commands(
        "git clone https://github.com/facebookresearch/sam-3d-body.git /opt/sam-3d-body",
        "cd /opt/sam-3d-body && git checkout b5c765a0d89d789985e186d396315e7590887b94",
    )
    # 관절 모델(RTMW · RTMDet) 파일을 이미지에 — 컨테이너가 깰 때마다 300MB 를 받던 10초를 없앤다(CPU 로 한 번 불러 받아 둔다)
    .run_commands(
        "python -c \"from rtmlib import Wholebody; Wholebody(to_openpose=False, mode='performance', backend='onnxruntime', device='cpu')\""
    )
    .env({"HF_HOME": "/cache/hf", "MOMENTUM_ENABLED": "0"})
    .add_local_dir(os.path.join(os.path.dirname(__file__), "engine"), remote_path="/root/engine")
    .add_local_python_source("pitch3d_gpu")
)

app = modal.App(APP_NAME, image=image)
progress = modal.Dict.from_name(f"{APP_NAME}-progress", create_if_missing=True)
# AI 무게 보관(처음 한 번 받는다)
hf_cache = modal.Volume.from_name(f"{APP_NAME}-hf", create_if_missing=True)
# Hugging Face 토큰(김민이 Modal 비밀로 넣는다 — 이름 huggingface · 키 HF_TOKEN). 없으면 AI 보정만 건너뛴다
try:
    hf_secret = [modal.Secret.from_name("huggingface", required_keys=["HF_TOKEN"])]
except Exception:  # noqa: BLE001
    hf_secret = []

_pose_cache: dict = {}


def _pose_factory():
    if "pose" not in _pose_cache:
        from pitch3d_gpu.pose import Pose

        _pose_cache["pose"] = Pose(device="cuda")
    return _pose_cache["pose"]


# AI 보정을 같이 맡는 도우미 GPU 수(분석 GPU 와 합쳐 5대) — 장면 300장이면 AI 단계 약 50초. 두 작업이 같이 돌아도 GPU 10대
AI_HELPERS = int(os.environ.get("PITCH3D_AI_HELPERS", "4"))


@app.cls(gpu=GPU, timeout=TIMEOUT_SEC, memory=16384, volumes={"/cache/hf": hf_cache}, secrets=hf_secret, scaledown_window=20)
class AiHelper:
    """AI 보정 도우미(pitch3d_gpu/ai_parallel.py) — 켜지면서 모델을 올리고, 영상 정보를 받아 같은 장면을 풀고, 묶음을 집는다."""

    @modal.enter()
    def load(self) -> None:
        from pitch3d_gpu import sam3d

        sam3d._load()

    @modal.method()
    def work(self, q: modal.Queue, name: str) -> int:
        from pitch3d_gpu import ai_parallel, sam3d
        from pitch3d_gpu.pipeline import helper_frames

        est = sam3d._load()
        if est is None:
            return 0
        return ai_parallel.helper_loop(q, name, helper_frames, lambda frames, chunk: sam3d.infer_items(est, frames, chunk))


@app.function(gpu=GPU, timeout=TIMEOUT_SEC, memory=16384, volumes={"/cache/hf": hf_cache}, secrets=hf_secret)
def analyze(job: dict) -> dict:
    """한 작업 — 결과는 저장소에 올리고, 상태는 progress[call_id] 에."""
    from pitch3d_gpu.ai_parallel import Coordinator
    from pitch3d_gpu.pipeline import run_job

    call_id = modal.current_function_call_id()
    job_id = str(job.get("jobId", ""))

    def report(stage: str, stages: dict) -> None:
        progress[call_id] = {"status": "running", "stage": stage, "stages": stages, "jobId": job_id, "at": time.time()}

    try:
        with modal.Queue.ephemeral() as q:
            ai = Coordinator(q, lambda i: AiHelper().work.spawn(q, f"h{i}"), AI_HELPERS if hf_secret else 0)
            ai.start()  # 도우미가 켜지고 모델을 올리는 동안 관절 찾기가 돈다
            try:
                out = run_job(job, _pose_factory, report, ai)
            finally:
                ai.close()
        try:
            hf_cache.commit()  # 처음 받은 AI 무게를 남긴다(다음 작업은 안 받는다)
        except Exception:  # noqa: BLE001
            pass
    except Exception as e:  # noqa: BLE001 — 모르는 예외는 여기 한 곳에서만 잡고 이름 · 단계 · 번호를 남긴다(검토 2절 Internal)
        print(f"[pitch3d internal] job={job_id} call={call_id} {type(e).__name__}: {e}")
        out = {"status": "failed", "code": "internal", "stage": "fit", "stages": {}}
    progress[call_id] = {**{k: v for k, v in out.items() if k != "result"}, "jobId": job_id, "at": time.time()}
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


@app.local_entrypoint()
def e2e(jobs: str, out: str = ""):
    """시험 — 실제 영상으로 끝까지(올리지 않음, job.dryRun). `modal run app.py --jobs a.json,b.json --out 폴더`

    작업 JSON 은 서명 주소가 들어 있어 저장소 밖에 둔다. 작업들을 동시에 보내(사이트에서 둘을 같이 누른 것처럼) 걸린 시간 · 단계를 찍고,
    out 이 있으면 결과를 <out>/<파일 이름>.result.json 으로 남긴다.
    """
    paths = [p for p in jobs.split(",") if p]
    t0 = time.time()
    calls = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            job = json.load(f)
        job["dryRun"] = True
        calls.append((p, analyze.spawn(job)))
    for p, c in calls:
        r = c.get()
        res = r.pop("result", None)
        print(json.dumps({"job": os.path.basename(p), "wall_s": round(time.time() - t0, 1), **r}, ensure_ascii=False))
        if out and res is not None:
            with open(os.path.join(out, os.path.basename(p).replace(".json", ".result.json")), "w", encoding="utf-8") as f:
                json.dump(res, f)


if __name__ == "__main__":
    print(json.dumps({"app": APP_NAME, "gpu": GPU}))
