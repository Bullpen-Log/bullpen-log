"""이미 분석된 실험실 샘플에 결과 화면용 가벼운 영상(preview-<칸>.mp4)을 한 번 굽는다 — 앞으로는 분석 서버가 분석과 나란히 굽는다(app.py previews).

  ~/bullpen-marker-lab/.venv/bin/python scripts/pitch-lab/preview_backfill.py [--only 샘플앞8자,...] [--dry]

저장소 키는 .env 에서 읽기만 한다(찍지 않는다). 분석 결과가 있는 샘플(job.json 이 done)의 옆 · 뒤 · ③ · ④ 중 가벼운 영상이 없는 칸만. 더하기만 한다.
2026-10-24 김민 "결과 화면 렉" — 원본(마커 5초에 셋이 125MB)을 그대로 돌리던 것.
"""
import json, os, shutil, sys, tempfile, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "services", "pitch3d-gpu"))
from pitch3d_gpu.preview import make_preview, worth_it  # noqa: E402

env = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"').strip("'")
URL, KEY = env["SUPABASE_URL"].rstrip("/"), env["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = env.get("SUPABASE_VIDEO_BUCKET") or "pitch-videos"
H = {"Authorization": f"Bearer {KEY}", "apikey": KEY}
only = next((a.split(",") for a in sys.argv[sys.argv.index("--only") + 1 : sys.argv.index("--only") + 2]), None) if "--only" in sys.argv else None
dry = "--dry" in sys.argv


def http(method, url, body=None, headers=None, timeout=120):
    """표준 라이브러리만으로(이 venv 에 requests 가 없다) — 2xx 가 아니면 예외"""
    req = urllib.request.Request(url, data=body, method=method, headers={**H, **(headers or {})})
    return urllib.request.urlopen(req, timeout=timeout)


def ls(prefix):
    with http("POST", f"{URL}/storage/v1/object/list/{BUCKET}", json.dumps({"prefix": prefix, "limit": 1000}).encode(), {"Content-Type": "application/json"}) as r:
        return json.load(r)


def obj(path):
    return f"{URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}"


done = skipped = failed = 0
for u in ls(""):
    for d in ls(f"{u['name']}/pitch-lab"):
        sid = d["name"]
        if only and not any(sid.startswith(o) for o in only):
            continue
        dir_ = f"{u['name']}/pitch-lab/{sid}"
        names = {f["name"]: f for f in ls(dir_)}
        if "job.json" not in names:
            continue
        with http("GET", obj(f"{dir_}/job.json")) as r:
            job = json.load(r)
        if job.get("status") != "done" and not job.get("shownJobId"):
            continue
        for view in ("side", "back", "cam3", "cam4"):
            src_name = next((n for n in names if n.startswith(f"{view}.")), None)
            if not src_name or f"preview-{view}.mp4" in names:
                continue
            t = time.time()
            with tempfile.TemporaryDirectory() as tmp:
                src, dst = os.path.join(tmp, src_name), os.path.join(tmp, "p.mp4")
                try:
                    with http("GET", obj(f"{dir_}/{src_name}")) as r, open(src, "wb") as f:
                        shutil.copyfileobj(r, f, 1 << 20)
                    info = make_preview(src, dst)
                    if not worth_it(os.path.getsize(src), info["bytes"]):
                        skipped += 1
                        print(sid[:8], view, "건너뜀(원본이 이미 가볍다)", round(os.path.getsize(src) / 1e6, 1), "→", round(info["bytes"] / 1e6, 1), "MB")
                        continue
                    if not dry:
                        with open(dst, "rb") as f:
                            http("POST", obj(f"{dir_}/preview-{view}.mp4"), f.read(), {"Content-Type": "video/mp4", "x-upsert": "true"}, 180).close()
                    done += 1
                    print(sid[:8], view, round(os.path.getsize(src) / 1e6, 1), "→", round(info["bytes"] / 1e6, 1), "MB", f"{time.time() - t:.0f}초", "(시험)" if dry else "")
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    print(sid[:8], view, "실패", type(e).__name__, str(e)[:200])
print(f"올림 {done} · 건너뜀 {skipped} · 실패 {failed}")
