"""3D 투구 분석 v2 — 클라우드 GPU 함수(Modal) 쪽 Python 패키지.

순수 모듈(영상 풀기 · 2D 관절 · 관절 표 · node 엔진 부르기 · 차례)과 얇은 Modal 껍데기(../app.py)로 나뉜다.
결과 모양 · 작업 상태의 약속은 TS 쪽(lib/pitch-3d/v2/contract.ts)이 원본이고, 여기서는 그 결과 JSON 을 만들어 올리기만 한다.
"""

from .mapping import N_JOINTS, RTMW_INDEX, V2_NAMES  # noqa: F401
