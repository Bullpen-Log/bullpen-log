"""
사람 크기 다듬기 2단계 — 영상마다 사람 상자 · 움직임을 잰다 → probe.json · measure/<id>.json.
    python measure.py <작업 폴더> [병렬 수]
(YOLOX-m 은 이 맥에서 장면당 0.3초 넘어 s 를 쓴다. 장면은 ffmpeg(videotoolbox)로 0.1초마다 받는다 — 회전 표시도 ffmpeg 가 풀어 준다.)
- 0.2초마다: YOLOX-m(rtmlib, humanart) 사람 상자 전부(점수 0.3 넘는 것, 원본 좌표).
- 0.1초마다: 192×108 밝기 차(움직임) — 영상 전체에서 바뀐 칸 수를 칸마다 더해 heat(192×108) 로.
원본은 건드리지 않는다.
"""
import json, os, subprocess, sys
from multiprocessing import Pool
import av, cv2, numpy as np

DET_URL = 'https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/yolox_s_8xb8-300e_humanart-3ef259a7.zip'
_det = None
def detector():
    global _det
    if _det is None:
        from rtmlib import YOLOX
        _det = YOLOX(DET_URL, model_input_size=(640, 640), score_thr=0.3, backend='onnxruntime', device='cpu')
        import onnxruntime as ort
        so = ort.SessionOptions(); so.intra_op_num_threads = 3
        _det.session = ort.InferenceSession(_det.session._model_path, so, providers=['CPUExecutionProvider'])
    return _det

GW, GH = 192, 108
def measure(args):
    work, vid, ext = args
    out = os.path.join(work, 'measure', f'{vid}.json')
    if os.path.exists(out):
        return vid, 'skip'
    src = os.path.join(work, 'orig', f'{vid}{ext}')
    det = detector()
    dets = []; heat = np.zeros((GH, GW), np.float32); prev = None; nmot = 0
    pr = json.load(open(os.path.join(work, 'probe.json')))[vid]
    W, H = (pr['h'], pr['w']) if abs(pr.get('rot', 0)) in (90, 270) else (pr['w'], pr['h'])
    fps = pr['fps'] or 30
    s = 960 / max(W, H); sw, sh = round(W * s / 2) * 2, round(H * s / 2) * 2
    cmd = ['ffmpeg', '-v', 'error', '-hwaccel', 'videotoolbox', '-i', src, '-an', '-vf', f'fps=10,scale={sw}:{sh}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-']
    pipe = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = sw * sh * 3; i = 0
    while True:
        buf = pipe.stdout.read(n)
        if len(buf) < n: break
        img = np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
        t = i / 10.0
        if i % 2 == 0:
            res = det(img)
            bl = []
            for b in (res if res is not None else []):
                x1, y1, x2, y2 = [float(v) / s for v in b[:4]]
                bl.append([round(x1), round(y1), round(x2), round(y2)])
            bl.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
            dets.append({'t': round(t, 3), 'b': bl})
        g = cv2.cvtColor(cv2.resize(img, (GW, GH), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.int16)
        if prev is not None:
            heat += (np.abs(g - prev) > 18)
            nmot += 1
        prev = g
        i += 1
    pipe.wait()
    res = {'id': vid, 'w': W, 'h': H, 'fps': fps, 'dur': dets[-1]['t'] if dets else 0, 'dets': dets,
           'heat': (heat / max(1, nmot)).round(4).tolist()}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, 'w'))
    return vid, 'ok'

def probe_all(work, items):
    out = {}
    for e in items:
        r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_format', '-of', 'json', os.path.join(work, 'orig', f"{e['id']}{e['ext']}")], capture_output=True, text=True)
        j = json.loads(r.stdout); s = j['streams'][0]; rot = 0
        for sd in s.get('side_data_list', []) or []:
            if 'rotation' in sd: rot = sd['rotation']
        n_, d_ = s['avg_frame_rate'].split('/')
        out[e['id']] = dict(codec=s['codec_name'], w=s['width'], h=s['height'], pix=s['pix_fmt'], trc=s.get('color_transfer'), rng=s.get('color_range'),
                            fps=round(int(n_) / int(d_), 2) if int(d_) else 0, rot=rot, dur=float(j['format']['duration']))
    json.dump(out, open(os.path.join(work, 'probe.json'), 'w'), indent=0)

if __name__ == '__main__':
    work = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    items = json.load(open(os.path.join(work, 'list.json')))
    if not os.path.exists(os.path.join(work, 'probe.json')): probe_all(work, items)
    jobs = [(work, e['id'], e['ext']) for e in items]
    if len(sys.argv) > 3: jobs = jobs[:int(sys.argv[3])]
    done = 0
    with Pool(n) as pool:
        for vid, st in pool.imap_unordered(measure, jobs):
            done += 1
            if done % 25 == 0 or done == len(jobs):
                print(f'{done}/{len(jobs)}', flush=True)
