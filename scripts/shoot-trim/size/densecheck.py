"""
모든 장면(초당 30장) 확인 — 시범하는 사람 상자(YOLOX-s)가 판(고정 · 따라가기) 밖으로 나가는 장면이 있는가.
원본 화면 가장자리에서 이미 잘린 쪽은 판 탓이 아니므로 따로 센다.
    python densecheck.py <작업 폴더> [병렬 수]   → dense/<id>.json · 요약 출력
"""
import json, os, subprocess, sys
from multiprocessing import Pool
import numpy as np

def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1]); x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    i = max(0, x2 - x1) * max(0, y2 - y1)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0

_det = None
def det():
    global _det
    if _det is None:
        from rtmlib import YOLOX
        import onnxruntime as ort
        _det = YOLOX('https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/yolox_s_8xb8-300e_humanart-3ef259a7.zip',
                     model_input_size=(640, 640), score_thr=0.3, backend='onnxruntime', device='cpu')
        so = ort.SessionOptions(); so.intra_op_num_threads = 3
        _det.session = ort.InferenceSession(_det.session._model_path, so, providers=['CPUExecutionProvider'])
    return _det

def one(args):
    work, vid = args
    out = os.path.join(work, 'dense', f'{vid}.json')
    if os.path.exists(out): return vid
    sys.path.insert(0, os.path.join(work, 'tools'))
    from plan import tracks_of
    L = {e['id']: e for e in json.load(open(os.path.join(work, 'list.json')))}
    pr = json.load(open(os.path.join(work, 'probe.json')))[vid]
    m = json.load(open(os.path.join(work, 'measure', f'{vid}.json'))); W, H = m['w'], m['h']
    fp = os.path.join(work, 'follow', f'{vid}.json')
    if os.path.exists(fp):
        kf = json.load(open(fp)); T = np.array(kf['t'])
        def crop(t):
            x, y, w = np.interp(t, T, kf['x']), np.interp(t, T, kf['y']), np.interp(t, T, kf['w']); return x, y, w, w * H / W
    else:
        x, y, w = json.load(open(os.path.join(work, 'plan.json')))[vid]['crop']; h = w * H / W
        x, y, w, h = x // 2 * 2, y // 2 * 2, round(w) // 2 * 2, round(h) // 2 * 2
        def crop(t): return x, y, w, h
    main = tracks_of(m['dets'])[0]['items']
    s = 960 / max(W, H); sw, sh = round(W * s / 2) * 2, round(H * s / 2) * 2
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-hwaccel', 'videotoolbox', '-i', os.path.join(work, 'orig', f"{vid}{L[vid]['ext']}"), '-an',
                          '-vf', f'fps=30,scale={sw}:{sh}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
    n = sw * sh * 3; i = 0; prev = None; rows = []
    d = det()
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n: break
        t = i / 30.0; i += 1
        img = np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
        bl = [[float(v) / s for v in b[:4]] for b in (d(img) if True else [])]
        if not bl: rows.append([round(t, 3), None]); continue
        if prev is None:
            ref = min(main, key=lambda it: abs(it[0] - t))[1]
            b = max(bl, key=lambda b: iou(b, ref))
            if iou(b, ref) < 0.1: b = max(bl, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        else:
            b = max(bl, key=lambda b: iou(b, prev))
            if iou(b, prev) < 0.1:
                ref = min(main, key=lambda it: abs(it[0] - t))[1]
                b = max(bl, key=lambda b: iou(b, ref))
        prev = b
        cx, cy, cw, ch = crop(t)
        # 판 가장자리까지 여유(판 크기 대비) — 음수면 판 밖. 원본 화면 끝에 붙은 쪽은 판 탓 아님
        mg = [(b[0] - cx) / cw, (b[1] - cy) / ch, (cx + cw - b[2]) / cw, (cy + ch - b[3]) / ch]
        orig_edge = [b[0] <= 3, b[1] <= 3, b[2] >= W - 3, b[3] >= H - 3]
        rows.append([round(t, 3), [round(v) for v in b], [round(v, 4) for v in mg], orig_edge])
    p.wait()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump({'id': vid, 'w': W, 'h': H, 'rows': rows}, open(out, 'w'))
    return vid

if __name__ == '__main__':
    work = sys.argv[1]; npar = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    ids = list(json.load(open(os.path.join(work, 'applied.json'))).keys())
    with Pool(npar) as pool:
        for k, v in enumerate(pool.imap_unordered(one, [(work, v) for v in ids]), 1):
            if k % 10 == 0 or k == len(ids): print(f'{k}/{len(ids)}', flush=True)
