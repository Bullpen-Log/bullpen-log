"""착지 무렵(±6장면) 스티커 다시 찾기 — K4 관절에 붙인 예상 자리로 네 카메라 덩어리를 고르고 교차해 골반 넷(ASIS · PSIS)의 착지 골반 각을 낸다
(fill.py 는 앞 장면에서 이어 오는 방식이라 착지 무렵을 못 채웠다). 어깨 봉우리(L2 · R2)도 해 보지만 글러브 팔 스티커와 헷갈려 세 구쯤만 된다(2026-10-14).
  (세션 폴더에서, MARKER_WORK 로 폴더 지정) python fp_relabel.py → MARKER_WORK/fp_stickers.json + 표, 투구 5 · 10 · 16 겹친 그림은 fp_overlay/
결과(2판 찾기, 15구): 골반 스티커 2~4개로 15/15 — K4 골반 − 스티커 +0.9°(|차| 4.4) · 엔진 골반 − 스티커 −10.3°(|차| 10.6, SD 10).
"""
import os, sys, json, itertools
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench as B
import pelvis_score as PS
from kpba import proj, tri
from fill import Cam
WORK = B.WORK
cal = json.load(open(os.path.join(WORK, "cal16b.json")))
world = json.load(open(os.path.join(WORK, "world.json")))
S, Rw, Tw = world["scale"], np.array(world["R"]), np.array(world["t"])
toW = lambda X: (S * (Rw @ np.atleast_2d(X).T).T + Tw).reshape(np.shape(X))
toC = lambda X: ((Rw.T @ (np.atleast_2d(X) - Tw).T).T / S).reshape(np.shape(X))
cams = {c: {k: (np.array(v) if isinstance(v, list) else v) for k, v in cal["cams"][c].items()} for c in "1234"}
NOTES = json.load(open(os.path.join(WORK, "..", "session-notes.json"), encoding="utf-8"))["people"][0]
SHW = NOTES["shoulder_width_cm"] / 100
PEL = ["L_ASIS", "R_ASIS", "L_PSIS", "R_PSIS"]; SHO = ["L2", "R2"]
WIN = 6; RPX = 38.0; REPROJ = 5.0; NEAR = 0.09
yaw = lambda v: float(np.degrees(np.arctan2(v[1], v[0])))
wrap = lambda d: (d + 180) % 360 - 180
unit = lambda v: v / max(np.linalg.norm(v), 1e-9)

def frame_of(l, r):
    """왼쪽 · 오른쪽 점 → (원점, 행렬 M: 행 = x 왼쪽 · y 앞(x 와 위에 직각) · z 위)"""
    o = (l + r) / 2; x = unit(l - r); z = np.array([0, 0, 1.0]); y = unit(np.cross(z, x)); z = np.cross(x, y)
    return o, np.stack([x, y, z])

def kat(rec, tq, nm, tt):
    kn, sd = B.K4_OF[nm]; K = toW(rec[f"K_{kn}_{sd}"])
    return np.array([np.interp(tt, tq, K[:, a], left=np.nan, right=np.nan) for a in range(3)])

# 1) 스티커 ↔ K4 관절 틀 안 오프셋(모든 투구 · 모든 장면 가운데값)
OFF = {n: [] for n in PEL + SHO}
P = {}
for p in range(2, 17):
    r = json.load(open(os.path.join(WORK, "bench", f"p{p:02d}", "result.json")))
    if not r.get("ok"): continue
    rec = np.load(os.path.join(WORK, "rec", f"p{p:02d}.npz")); fl = np.load(os.path.join(WORK, "fill", f"p{p:02d}.npz"))
    P[p] = (r, rec, fl)
    tq, ftq = rec["tq"], fl["tq"]
    for i in range(0, len(ftq), 3):
        tt = ftq[i]
        for n in PEL + SHO:
            if "M_" + n not in fl.files or np.isnan(fl["M_" + n][i, 0]): continue
            l, rr = (kat(rec, tq, "lHip", tt), kat(rec, tq, "rHip", tt)) if n in PEL else (kat(rec, tq, "lSh", tt), kat(rec, tq, "rSh", tt))
            if np.isnan(l[0]) or np.isnan(rr[0]): continue
            o, M = frame_of(l, rr); OFF[n].append(M @ (toW(fl["M_" + n][i]) - o))
OFF = {n: (np.median(np.array(v), 0) if len(v) >= 10 else None) for n, v in OFF.items()}
print("오프셋(틀 안 cm, 표본):", {n: (None if v is None else [round(x * 100, 1) for x in v]) for n, v in OFF.items()})
# L2 가 모자라면 R2 를 좌우 뒤집어
if OFF["L2"] is None and OFF["R2"] is not None: OFF["L2"] = OFF["R2"] * np.array([-1, 1, 1])
if OFF["L_ASIS"] is None and OFF["R_ASIS"] is not None: OFF["L_ASIS"] = OFF["R_ASIS"] * np.array([-1, 1, 1])

def find(C, Xw, col, tt, rpx=RPX, dbg=None, near=NEAR):
    """예상 3D(세상) → 카메라별 후보(가까운 셋) → 조합 교차 → (세상 3D, 쓴 카메라 수, 다시 비춤) 또는 None. 한 카메라뿐이면 ('single', cam, uv)."""
    Xc = toC(Xw); cand = {}
    for c, cm in C.items():
        t2 = tt + cm.off
        if t2 < cm.t[0] or t2 > cm.t[-1]: continue
        j = int(np.argmin(np.abs(cm.t - t2)))
        if abs(cm.t[j] - t2) > 2.6e-3: continue
        uv = proj(cams[c], Xc[None])[0]; Bl = cm.blobs[col][j]
        if len(Bl) == 0: continue
        d = np.linalg.norm(Bl - uv, axis=1); o = np.argsort(d)[:3]
        cs = [Bl[k] for k in o if d[k] < rpx]
        if dbg is not None: dbg.append((c, [round(float(d[k])) for k in o]))
        if cs: cand[c] = cs
    best = None
    for k in range(2, len(cand) + 1):
        for cs in itertools.combinations(sorted(cand), k):
            for pick in itertools.product(*[range(len(cand[c])) for c in cs]):
                obs = [(c, cand[c][i]) for c, i in zip(cs, pick)]
                X = tri(cams, obs)
                err = max(float(np.linalg.norm(proj(cams[c], X[None])[0] - uv)) for c, uv in obs)
                dist = float(np.linalg.norm(toW(X) - Xw))
                if err > REPROJ or dist > near: continue
                sc = err + 60 * dist - 1.5 * k
                if best is None or sc < best[0]: best = (sc, toW(X), k, err)
    if best: return best[1], best[2], best[3]
    if len(cand) == 1:
        c = next(iter(cand)); return ("single", c, cand[c][0])
    return None

def ray(c, uv):
    """카메라 c 의 화면 점 → 세상 좌표 광선(원점, 방향)"""
    import cv2
    cm = cams[c]; R = cv2.Rodrigues(cm["r"])[0]; o_c = -R.T @ cm["t"]
    d_c = R.T @ np.array([(uv[0] - cm["cx"]) / cm["f"], (uv[1] - cm["cy"]) / cm["f"], 1.0])
    o_w = toW(o_c); d_w = unit(Rw @ d_c)
    return o_w, d_w


OUT = os.path.join(WORK, "fp_overlay"); os.makedirs(OUT, exist_ok=True)
def overlay(p, C, tt, lH, rH, lS, rS, pel, got):
    import cv2
    for c in "234":
        cm = C[c]; t2 = tt + cm.off; j = int(np.argmin(np.abs(cm.t - t2)))
        cap = cv2.VideoCapture(os.path.join(WORK, "..", "videos", f"투구{p:02d}_c{c}.mov")); cap.set(cv2.CAP_PROP_POS_FRAMES, j); okf, img = cap.read()
        if not okf: continue
        P2 = lambda X: proj(cams[c], toC(X)[None])[0]
        for col, bgr in (("pink", (255, 0, 255)), ("yellow", (0, 255, 255))):
            for b in cm.blobs[col][j]: cv2.circle(img, (int(b[0]), int(b[1])), 10, bgr, 1)
        for n2, X2 in [("lHip", lH), ("rHip", rH), ("lSh", lS), ("rSh", rS)]:
            u = P2(X2); cv2.drawMarker(img, (int(u[0]), int(u[1])), (255, 255, 255), cv2.MARKER_CROSS, 18, 2); cv2.putText(img, n2, (int(u[0]) + 8, int(u[1]) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        for n2 in PEL:
            if not np.isnan(pel[n2][0]):
                u = P2(pel[n2]); cv2.circle(img, (int(u[0]), int(u[1])), 14, (0, 255, 0), 2); cv2.putText(img, n2, (int(u[0]) + 10, int(u[1]) + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        for n2 in SHO:
            g2 = got.get(n2)
            if g2 and not isinstance(g2[0], str):
                u = P2(g2[0]); cv2.circle(img, (int(u[0]), int(u[1])), 14, (0, 165, 255), 2); cv2.putText(img, n2, (int(u[0]) + 10, int(u[1]) + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
        ys = [P2(X)[1] for X in (lS, rS, lH, rH)]; xs = [P2(X)[0] for X in (lS, rS, lH, rH)]
        y0, y1 = max(0, int(min(ys) - 200)), min(img.shape[0], int(max(ys) + 260)); x0 = max(0, int(min(xs) - 300)); x1 = min(img.shape[1], int(max(xs) + 300))
        cv2.imwrite(f"{OUT}/ov_p{p:02d}_c{c}.jpg", img[y0:y1, x0:x1], [cv2.IMWRITE_JPEG_QUALITY, 90])

out = {}; rows = []
for p, (r, rec, fl) in P.items():
    off = cal["offsets"][str(p)]; te = np.array(r["t"]) - off["1"]; ev = r["events"]; fp = ev["footPlant"]
    C = {c: Cam(p, c, cams[c], off[c]) for c in "1234"}
    tq = rec["tq"]; J = np.array(r["joints"], float)
    jm = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "lib", "pitch-3d", "v2", "joint-map.json"), encoding="utf-8")); IX = {j["name"]: i for i, j in enumerate(jm["joints"])}
    yE = lambda v: float(-np.degrees(np.arctan2(v[2], v[0])))
    res = {"pelvisYaw": [], "shoulderYaw": [], "k4Pelvis": [], "k4Shoulder": [], "engPelvis": [], "engShoulder": [], "nPel": [], "shoHow": []}
    for k in range(fp - WIN, fp + WIN + 1):
        tt = te[k]
        lH, rH, lS, rS = (kat(rec, tq, n, tt) for n in ("lHip", "rHip", "lSh", "rSh"))
        if np.isnan(lH[0]) or np.isnan(lS[0]): continue
        oP, MP = frame_of(lH, rH); oS, MS = frame_of(lS, rS)
        got = {}
        for n in PEL + SHO:
            if OFF[n] is None: continue
            o, M = (oP, MP) if n in PEL else (oS, MS)
            Xw = o + M.T @ OFF[n] if n in PEL else (lS if n == "L2" else rS) + np.array([0, 0, 0.03])
            dbg = [] if (n in SHO and k == fp) else None
            g = find(C, Xw, "yellow" if n.startswith("L") else "pink", tt, rpx=(80.0 if n in SHO else RPX), dbg=dbg, near=(0.14 if n in SHO else NEAR))
            if dbg is not None: print(f"   p{p:02d} {n} 착지 후보 거리(px) 카메라별: {dbg} → {'교차' if (g and not isinstance(g[0], str)) else g}")
            if g is not None: got[n] = g
        # 골반 틀 — 교차된 스티커 둘 이상이면 PS.pelvis_yaw(위에서 본 좌우축 각)
        pel = {n: (got[n][0] if (n in got and not isinstance(got[n][0], str)) else np.full(3, np.nan)) for n in PEL}
        tpl0 = PS.pelvis_template(toW)[0]
        for _ in range(2):
            have = [n for n in PEL if not np.isnan(pel[n][0])]
            if len(have) < 3: break
            bad = {n: 0.0 for n in have}
            for a, b in itertools.combinations(have, 2):
                e = abs(np.linalg.norm(pel[a] - pel[b]) - np.linalg.norm(tpl0[a] - tpl0[b]))
                if e > 0.035: bad[a] += e; bad[b] += e
            w = max(bad, key=bad.get)
            if bad[w] > 0: pel[w] = np.full(3, np.nan)
            else: break
        npel = sum(1 for n in PEL if not np.isnan(pel[n][0]))
        py = PS.pelvis_yaw(PS.pelvis_template(toW)[0], pel) if npel >= 2 else np.nan
        # 어깨선 — L2 · R2 둘 다 교차됐으면 그대로, R2 만 교차 + L2 한 카메라면 어깨 폭으로
        how = "-"; sy = np.nan
        gl, gr = got.get("L2"), got.get("R2")
        if gl and gr and not isinstance(gl[0], str) and not isinstance(gr[0], str):
            sy = yaw(gl[0] - gr[0]); how = "둘 교차"
        elif gr and not isinstance(gr[0], str) and gl and isinstance(gl[0], str):
            o_w, d_w = ray(gl[1], gl[2]); Rr = gr[0]
            b = d_w @ (o_w - Rr); cc = (o_w - Rr) @ (o_w - Rr) - SHW ** 2; disc = b * b - cc
            if disc > 0:
                pred = oS + MS.T @ OFF["L2"]
                cands = [o_w + d_w * s for s in (-b - np.sqrt(disc), -b + np.sqrt(disc)) if s > 0]
                if cands:
                    L2 = min(cands, key=lambda X: np.linalg.norm(X - pred))
                    if np.linalg.norm(L2 - pred) < 0.15: sy = yaw(L2 - Rr); how = "R2 교차 + L2 한 카메라(폭)"
        if k == fp and p in (5, 10, 16): overlay(p, C, tt, lH, rH, lS, rS, pel, got)
        res["pelvisYaw"].append(py); res["shoulderYaw"].append(sy); res["nPel"].append(npel); res["shoHow"].append(how)
        res["k4Pelvis"].append(yaw(lH - rH)); res["k4Shoulder"].append(yaw(lS - rS))
        res["engPelvis"].append(yE(J[k, IX["lHip"]] - J[k, IX["rHip"]])); res["engShoulder"].append(yE(J[k, IX["lSh"]] - J[k, IX["rSh"]]))
    med = lambda a: float(np.nanmedian(a)) if np.isfinite(a).any() else np.nan
    A = {k2: np.array(v, float) for k2, v in res.items() if k2 not in ("shoHow",)}
    hows = [h for h in res["shoHow"] if h != "-"]
    row = dict(p=p, pel=med(A["pelvisYaw"]), nPel=int(np.max(A["nPel"])) if len(A["nPel"]) else 0, sho=med(A["shoulderYaw"]), nSho=int(np.isfinite(A["shoulderYaw"]).sum()),
               how=max(set(hows), key=hows.count) if hows else "-", k4p=med(A["k4Pelvis"]), k4s=med(A["k4Shoulder"]), ep=med(A["engPelvis"]), es=med(A["engShoulder"]))
    rows.append(row); out[p] = row
    print(f"p{p:02d} 골반(스티커 {row['nPel']}개) {row['pel']:7.1f} | K4 {row['k4p']:6.1f} 엔진 {row['ep']:6.1f} || 어깨(스티커, {row['nSho']}장면, {row['how']}) {row['sho']:7.1f} | K4 {row['k4s']:6.1f} 엔진 {row['es']:6.1f}")
json.dump(out, open(os.path.join(WORK, "fp_stickers.json"), "w"), indent=1)
def summ(name, f):
    d = np.array([f(r) for r in rows], float); d = d[np.isfinite(d)]
    if len(d): print(f"{name:34s} n {len(d):2d}  치우침 {d.mean():+6.1f}  |차| 가운데 {np.median(np.abs(d)):5.1f}  SD {d.std():5.1f}")
print("\n착지 ±6장면 가운데값, 앞 축 기준(+ 열림)")
summ("K4 골반 − 스티커 골반", lambda r: wrap(r["k4p"] - r["pel"]))
summ("엔진 골반 − 스티커 골반", lambda r: wrap(r["ep"] - r["pel"]))
summ("K4 어깨 − 스티커 어깨", lambda r: wrap(r["k4s"] - r["sho"]))
summ("엔진 어깨 − 스티커 어깨", lambda r: wrap(r["es"] - r["sho"]))
summ("엔진 분리 − 스티커 분리", lambda r: wrap((r["ep"] - r["es"]) - (r["pel"] - r["sho"])))
summ("K4 분리 − 스티커 분리", lambda r: wrap((r["k4p"] - r["k4s"]) - (r["pel"] - r["sho"])))
