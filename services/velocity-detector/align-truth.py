"""3판 라벨 맞추기 — build-truth-dataset.mjs 다음에(2026-10-22 밤).

엔진 장면 시각과 그림 장면 시각이 클립마다 0~1 장면 어긋나(카메라 앱 파일 · 앱 클립 모두, 가운데 +0.6) 라벨 원이 공 옆에 앉는다.
클립마다 어긋남 u 하나를 찾는다 — 공 길(라벨 점을 시각으로 이은 선) 위 τ = t + u·dt 자리의 "원 안 − 둘레" 밝기 차를 클립 모든 장면에서 더해 가장 큰 u.
라벨은 labels-raw.json(처음 것)에서 읽어 labels.json 을 고쳐 쓴다. 공 길 밖으로 밀린 끝 장면은 skip(학습에서 뺀다).

    cp <자료>/labels.json <자료>/labels-raw.json   # 처음 한 번
    ~/bullpen-velocity-lab/.venv/bin/python services/velocity-detector/align-truth.py <자료>
"""
import json, os, sys
import numpy as np
from PIL import Image
root = os.path.expanduser(sys.argv[1])
L = json.load(open(os.path.join(root, 'labels-raw.json')))
US = np.linspace(-2, 2, 33)
out = {}
for c in L['clips']:
    fr = c['frames']
    lab = [(f['t'], f['ball']) for f in fr if f['ball']]
    T = np.array([t for t, _ in lab]); B = np.array([b for _, b in lab])
    dt = float(np.median(np.diff(T)))
    at = lambda t: np.array([np.interp(t, T, B[:, k]) for k in range(3)])
    tot = np.zeros(len(US)); cnt = np.zeros(len(US))
    for f in fr:
        if not f['ball']: continue
        im = np.asarray(Image.open(os.path.join(root, 'images', c['id'], f['file'])).convert('L'), dtype=np.float32)
        H, W = im.shape
        sc = np.full(len(US), np.nan)
        for j, u in enumerate(US):
            tau = f['t'] + u * dt
            if tau < T[0] or tau > T[-1]: continue
            x, y, d = at(tau); r = max(2.0, d / 2)
            x0, x1, y0, y1 = int(max(0, x - 2 * r - 2)), int(min(W, x + 2 * r + 3)), int(max(0, y - 2 * r - 2)), int(min(H, y + 2 * r + 3))
            if x1 - x0 < 3 or y1 - y0 < 3: continue
            sub = im[y0:y1, x0:x1]
            yy, xx = np.mgrid[y0:y1, x0:x1]
            rr = np.hypot(xx - x, yy - y)
            inn, ring = sub[rr <= 0.7 * r], sub[(rr >= 1.25 * r) & (rr <= 1.8 * r)]
            if inn.size >= 3 and ring.size >= 6: sc[j] = abs(float(inn.mean()) - float(np.median(ring)))
        if np.all(np.isnan(sc)): continue
        z = (sc - np.nanmean(sc)) / (np.nanstd(sc) + 1e-6)  # 장면마다 고르게
        ok = ~np.isnan(z); tot[ok] += z[ok]; cnt[ok] += 1
    mean = np.where(cnt > 0, tot / np.maximum(cnt, 1), -1e9)
    u = float(US[int(np.argmax(mean))])
    out[c['id']] = u
    for f in fr:
        if not f['ball']: continue
        tau = f['t'] + u * dt
        if T[0] <= tau <= T[-1]:
            x, y, d = at(tau); f['ball'] = [round(x, 1), round(y, 1), round(d, 2)]
        else:
            f['ball'] = None  # 공 길 밖으로 밀린 끝 장면은 라벨 없이(학습 표본에서 빠지게 표시)
            f['skip'] = True
    c['shift'] = u
vals = np.array(list(out.values()))
print('클립', len(vals), '· 어긋남(장면) 분포', np.percentile(vals, [0, 10, 50, 90, 100]).round(2))
by = {}
for c in L['clips']: by.setdefault(c['group'], []).append(c['shift'])
for g, v in by.items(): print(f'{g:14s}', np.round(v, 2).tolist())
json.dump(L, open(os.path.join(root, 'labels.json'), 'w'), indent=1)
