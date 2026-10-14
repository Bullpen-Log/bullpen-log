"""영상마다: 장면 시각 · 분홍/노랑 스티커 · 움직임 격자(앞 장면과 밝기 차, 세로 16 × 가로 9 칸 또는 그 반대)."""
import sys, os, json, glob, time
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mk import markers
import blobs_v2  # DET_V2=1 이면 2판 찾기(색 넓힘 + top-hat)
FIND = blobs_v2.find_blobs if os.environ.get("DET_V2") else markers.find_blobs
from multiprocessing import Pool

WORK = os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work"))  # 영상 · 찾은 자료 폴더(저장소 밖) — 기본은 지금 폴더/work
OUT = os.path.join(WORK, "det")

def run(path):
    name = os.path.splitext(os.path.basename(path))[0]
    out = os.path.join(OUT, name + ".json")
    if os.path.exists(out):
        return name, "skip"
    t0 = time.time()
    frames = []
    prev = None
    w = h = 0
    for t, img in markers.iter_frames(path):
        h, w = img.shape[:2]
        g = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (w // 8, h // 8), interpolation=cv2.INTER_AREA).astype(np.float32)
        gy, gx = (16, 9) if h > w else (9, 16)
        e = None
        if prev is not None:
            d = np.abs(g - prev)
            e = cv2.resize(d, (gx, gy), interpolation=cv2.INTER_AREA).round(2).tolist()
        prev = g
        frames.append({"t": round(t, 6), "e": e, **FIND(img)})
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"video": os.path.basename(path), "w": w, "h": h, "frames": frames}, f)
    return name, f"{len(frames)} 장면 · {time.time() - t0:.0f}초"

if __name__ == "__main__":
    vids = sorted(glob.glob(os.path.join(WORK, "..", "videos", "*.mov")))
    if len(sys.argv) > 1:
        vids = [v for v in vids if any(k in os.path.basename(v) for k in sys.argv[1:])]
    with Pool(6) as p:
        for name, msg in p.imap_unordered(run, vids):
            print(name, msg, flush=True)
