"""스티커 찾기 3판(2026-10-22, 10-21 4차 촬영) — 2판(blobs_v2) + 먼 카메라의 '하얗게 뜬 분홍'.

① 옆(15 Pro Max, 4m)에서는 분홍 스티커가 8px 남짓이라 번져 거의 흰색(H 172~176 · S 23~29 · V 200~240 · Lab a* 136~137)이 된다 →
2판의 분홍(S 28+, a* top-hat 7+)을 못 넘는다. 검은 옷 위에서 둘레보다 훨씬 밝고(L top-hat 40+) 살짝 붉은(a* 133+) 작은 점을 분홍으로 더한다.
흰 글씨(Nike 로고 a* 128)는 a* 로 빠진다. 노랑 · 그 밖은 2판 그대로. 쓰는 법: `DET_V3=1 python detect_all.py`.
"""
import numpy as np, cv2
import blobs_v2

TOPHAT_K = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (23, 23))
V2_MASKS = blobs_v2.masks


def masks(img):
    m = V2_MASKS(img)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV); lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    H, S, V = cv2.split(hsv); L, A, _ = cv2.split(lab)
    th_l = cv2.morphologyEx(L, cv2.MORPH_TOPHAT, TOPHAT_K)
    pale = ((H >= 160) | (H <= 5)) & (S >= 15) & (V >= 120) & (A >= 133) & (th_l >= 40)
    m["pink"] = np.maximum(m["pink"], pale.astype(np.uint8) * 255)
    return m


def find_blobs(img):
    blobs_v2.masks = masks  # 2판의 덩어리 고르기를 그대로 쓰려고 색 가림막만 바꿔 끼운다
    try:
        return blobs_v2.find_blobs(img)
    finally:
        blobs_v2.masks = V2_MASKS
