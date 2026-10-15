"""카메라 목록 — 촬영마다 다르다(2026-10-12 네 대 "1234", 2026-10-16 세 대 "123"). MARKER_CAMS 로 고른다.

첫째(1)는 원점, 둘째(2)는 크기 기준(1~2 거리를 처음 값으로 묶음)이라 둘은 늘 있어야 한다. 엔진 채점(bench.py)은 1 = 옆 · 2 = 뒤.
"""
import itertools
import os

CAMS = os.environ.get("MARKER_CAMS", "1234")
assert len(CAMS) >= 2 and CAMS[:2] == "12", f"MARKER_CAMS 는 12 로 시작해야 해요: {CAMS!r}"
# 원점(1) 밖의 카메라 — 자리 · 시간 어긋남을 푸는 쪽
FREE = list(CAMS[1:])
# 카메라 짝 전부(시간 맞추기 · 닫힘 확인)
PAIRS = list(itertools.combinations(CAMS, 2))
