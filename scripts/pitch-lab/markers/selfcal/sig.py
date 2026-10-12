import json, os, numpy as np
D = os.path.join(os.environ.get("MARKER_WORK", os.path.join(os.getcwd(), "work")), "det")

def load(p, c):
    return json.load(open(os.path.join(D, f"투구{p:02d}_c{c}.json"), encoding="utf-8"))

def energy(det, mask_cells=True):
    """장면 시각, 움직임(밝기 차 / 장면 간격). 스티커가 한 번이라도 나온 칸(+이웃)만."""
    fr = det["frames"]
    t = np.array([f["t"] for f in fr])
    E = np.array([np.array(f["e"]) if f["e"] is not None else np.zeros_like(np.array(fr[1]["e"])) for f in fr])
    gy, gx = E.shape[1:]
    if mask_cells:
        m = np.zeros((gy, gx), bool)
        for f in fr:
            for col in ("pink", "yellow"):
                for x, y, a in f[col]:
                    m[min(gy - 1, int(y / det["h"] * gy)), min(gx - 1, int(x / det["w"] * gx))] = True
        from scipy.ndimage import binary_dilation
        m = binary_dilation(m, iterations=1)
        e = (E * m).sum((1, 2)) / max(1, m.sum())
    else:
        e = E.mean((1, 2))
    dt = np.diff(t, prepend=t[0] - 1 / 240)
    return t, e / np.maximum(dt * 240, 1)

def grid(t, y, step=1 / 240):
    g = np.arange(t[0], t[-1], step)
    return g, np.interp(g, t, y)

def blob_speed(det, cap=80.0):
    """스티커 빠르기: 장면마다 같은 색 가장 가까운 앞 장면 스티커까지 거리(px/240분의1초)의 합."""
    from scipy.spatial import cKDTree
    fr = det["frames"]
    t = np.array([f["t"] for f in fr])
    s = np.zeros(len(fr))
    for i in range(1, len(fr)):
        dt = max(1.0, (t[i] - t[i - 1]) * 240)
        tot = 0.0
        for col in ("pink", "yellow"):
            a = np.array([b[:2] for b in fr[i][col]]); b = np.array([b[:2] for b in fr[i - 1][col]])
            if len(a) and len(b):
                d, _ = cKDTree(b).query(a)
                tot += np.minimum(d, cap).sum() / dt
        s[i] = tot
    return t, s

def energy2(det, k=3.0):
    """칸마다 잡음 바닥(가운데값 + k·MAD)을 뺀 움직임 합 — 장면 간격으로 나눔."""
    fr = det["frames"]
    t = np.array([f["t"] for f in fr])
    E = np.array([np.array(f["e"]) if f["e"] is not None else np.array(fr[1]["e"]) for f in fr])
    med = np.median(E, 0); mad = np.median(np.abs(E - med), 0) + 1e-6
    x = np.clip(E - med - k * mad, 0, None).sum((1, 2))
    dt = np.diff(t, prepend=t[0] - 1 / 240)
    return t, x / np.maximum(dt * 240, 1)
