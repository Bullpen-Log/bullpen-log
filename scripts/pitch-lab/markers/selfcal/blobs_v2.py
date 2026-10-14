"""스티커 찾기 2판(2026-10-14 데스크톱) — 1판(mk.py 의 HSV 문턱)은 착지 무렵 몸에 붙은 스티커를 거의 놓쳤다(어두운 셔츠 위 분홍은 V 109~110 인데
문턱이 140, 노랑은 H 19~22 가 흙과 겹쳐 23 부터만). 색 범위를 넓히고(분홍 V 55+, 노랑 H 16+) 둘레보다 튀는 정도(Lab a*·b* top-hat 23px)로
흙 · 살을 거른다. 쓰는 법: `DET_V2=1 python detect_all.py`(결과는 MARKER_WORK/det — 1판 결과와 섞이지 않게 MARKER_WORK 를 work_v2 같은 새 폴더로).
결과(README '스티커 찾기 2판'): 이름 붙은 스티커 15~21 → 21~27개, 채운 뒤 덮음 13~21 → 17~30%, 골반 정답 장면 717 → 999."""
import math
import numpy as np, cv2

MIN_DIAM_PX, MAX_DIAM_FRAC = 4, 0.07
TOPHAT_K = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (23, 23))
OPEN_K = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

def masks(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV); lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    H, S, V = cv2.split(hsv); L, A, Bc = cv2.split(lab)
    th_a = cv2.morphologyEx(A, cv2.MORPH_TOPHAT, TOPHAT_K)  # 둘레보다 붉은(자홍) 정도
    th_b = cv2.morphologyEx(Bc, cv2.MORPH_TOPHAT, TOPHAT_K)  # 둘레보다 노란 정도
    pink = ((H >= 143) | (H <= 3)) & (S >= 28) & (V >= 55) & (Bc <= 138) & (th_a >= 7)
    yellow = (H >= 16) & (H <= 36) & (S >= 70) & (V >= 60) & (A <= 137) & (Bc >= 146) & (th_b >= 10)
    return {"pink": pink.astype(np.uint8) * 255, "yellow": yellow.astype(np.uint8) * 255}

def find_blobs(img):
    h, w = img.shape[:2]
    amin = math.pi / 4 * MIN_DIAM_PX ** 2; amax = math.pi / 4 * (MAX_DIAM_FRAC * min(w, h)) ** 2
    out = {}
    for name, m in masks(img).items():
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, OPEN_K)
        n, _, stats, cent = cv2.connectedComponentsWithStats(m, connectivity=8)
        keep = []
        for i in range(1, n):
            a = stats[i, cv2.CC_STAT_AREA]; bw, bh = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
            if not (amin <= a <= amax): continue
            if a / (bw * bh) < 0.45 or max(bw, bh) / max(1, min(bw, bh)) > 2.5: continue
            keep.append([round(float(cent[i][0]), 2), round(float(cent[i][1]), 2), int(a)])
        out[name] = keep
    return out

