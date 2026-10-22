"""녹화 사이에 일부 카메라만 움직였을 때 — 안 움직인 카메라의 보정을 이어받아 관절을 교차하고 나머지를 PnP 로.

  MARKER_CAMS=1234 py carry.py 앞보정.json 고정카메라(23) 첫어긋남.json 6,7,8,9,10 출력.json
10-21: 1~5구와 6~10구 사이에 ① 옆이 크게 밀리고 ④ 는 6구부터 녹화, ② · ③ 은 2px 안. 관절만으로 넷을 새로 풀면 7px 에서 멈춰
② · ③ 을 그대로 두고 ① · ④ 를 그 좌표계에서 찾는다 — 두 묶음이 같은 좌표 · 같은 배율이 된다. 그 뒤 ksync → vpba 로 다듬는다.
첫어긋남.json 은 kpba 출력(offsets) 또는 ksync 출력. 새 카메라 초점은 FOCALS(kpba 와 같음), 없으면 1600.
"""
import os, sys, json
import numpy as np, cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kpcal import load_kp, sample
from kpba import tri, FOC, F0
from cams import CAMS

if __name__ == "__main__":
    prev = json.load(open(sys.argv[1]))
    keep = list(sys.argv[2])
    oj = json.load(open(sys.argv[3]))
    oj = oj.get("offsets", oj)
    pitches = [int(x) for x in sys.argv[4].split(",")]
    cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in prev["cams"][c].items()} for c in keep}
    P3, P2 = {c: [] for c in CAMS if c not in keep}, {c: [] for c in CAMS if c not in keep}
    wh = {}
    for p in pitches:
        ds = {c: load_kp(p, c) for c in CAMS}
        off = oj[str(p)]
        tq = ds["1"]["t"][::2]
        S = {c: sample(ds[c], tq + off[c]) for c in CAMS}
        for c in CAMS:
            wh[c] = ds[c]["wh"]
        for i in range(len(tq)):
            for j in range(S["1"][0].shape[1]):
                if not all(S[k][1][i, j] for k in keep):
                    continue
                X = tri(cams, [(k, S[k][0][i, j]) for k in keep])
                for c in P3:
                    if S[c][1][i, j]:
                        P3[c].append(X); P2[c].append(S[c][0][i, j])
    for c in P3:
        f = FOC.get(c, F0)
        K = np.array([[f, 0, wh[c][0] / 2], [0, f, wh[c][1] / 2], [0, 0, 1.0]])
        ok, r, t, inl = cv2.solvePnPRansac(np.array(P3[c]), np.array(P2[c]), K, None, reprojectionError=12.0, iterationsCount=5000)
        r, t = cv2.solvePnPRefineLM(np.array(P3[c])[inl[:, 0]], np.array(P2[c])[inl[:, 0]], K, None, r, t)
        e = np.linalg.norm(cv2.projectPoints(np.array(P3[c])[inl[:, 0]], r, t, K, None)[0][:, 0] - np.array(P2[c])[inl[:, 0]], axis=1)
        cams[c] = {"r": r.ravel(), "t": t.ravel(), "f": f, "cx": wh[c][0] / 2, "cy": wh[c][1] / 2}
        print(f"카메라 {c}: PnP 들어맞음 {len(inl)}/{len(P3[c])} · 다시 비춤 가운데 {np.median(e):.2f}px", flush=True)
    json.dump({"cams": {c: {k: (v.tolist() if hasattr(v, "tolist") else v) for k, v in cams[c].items()} for c in CAMS},
               "offsets": {str(p): oj[str(p)] for p in pitches}}, open(sys.argv[5], "w"), indent=1)
