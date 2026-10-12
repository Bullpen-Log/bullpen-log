import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sig import load, energy2
from scipy.ndimage import gaussian_filter1d

def sig(p, c, sm=3):
    t, e = energy2(load(p, c))
    g = np.arange(-0.5, 4.6, 1 / 240)
    y = np.interp(g, t, e, left=np.nan, right=np.nan)
    y = gaussian_filter1d(np.nan_to_num(y, nan=np.nanmedian(y)), sm)
    y = (y - np.median(y)) / (np.percentile(y, 99) - np.median(y) + 1e-9)
    return g, y

def lag(ya, yb, maxlag=1.2):
    """b 의 시각 + lag = a 의 시각이 되는 lag(초). 정규화 상호상관."""
    L = int(maxlag * 240); best = (-9, 0)
    for k in range(-L, L + 1):
        if k >= 0: a, b = ya[k:], yb[:len(yb) - k]
        else: a, b = ya[:k], yb[-k:]
        n = min(len(a), len(b)); a, b = a[:n], b[:n]
        r = np.dot(a - a.mean(), b - b.mean()) / (np.linalg.norm(a - a.mean()) * np.linalg.norm(b - b.mean()) + 1e-9)
        if r > best[0]: best = (r, k)
    return best[1] / 240, best[0]

if __name__ == "__main__":
    for p in [int(x) for x in sys.argv[1:]]:
        ys = {c: sig(p, c)[1] for c in "1234"}
        out = []
        for a, b in [("1", "2"), ("1", "3"), ("1", "4"), ("2", "3"), ("2", "4"), ("3", "4")]:
            l, r = lag(ys[a], ys[b]); out.append(f"{a}{b}:{l:+.3f}({r:.2f})")
        print(p, " ".join(out))
