# motion-template.json 의 출처 · 사용 조건

`motion-template.json`(3D 투구 분석 엔진의 통계 움직임 틀)은 아래 자료로 만든 2차 저작물이다.

- 원자료: **Driveline OpenBiomechanics Project** — Driveline Baseball,
  https://github.com/drivelineresearch/openbiomechanics (baseball_pitching, landmarks · metadata)
- 원자료 사용 조건: **CC BY-NC-SA 4.0** (https://creativecommons.org/licenses/by-nc-sa/4.0/)
  + 프로 구단은 따로 허락받아야 한다는 Driveline 의 추가 조건
- 바꾼 것: 투수 100명 · 411구의 관절 중심을 120Hz 로 줄이고, 엉덩이 가운데 · 홈 방향 · 키로 맞춘 좌표에서
  착지 · 릴리스 기준 구간(φ)마다 평균 자세와 주성분(확률 주성분 분석, 10개)을 뽑았다. 원자료의 좌표 · 선수 정보는 들어 있지 않다.
  만드는 법: `scripts/pitch-lab/markers/motion_template.py`.

**이 파일(motion-template.json)은 CC BY-NC-SA 4.0 으로 둔다.** 상업적으로 쓰지 않는다.
불펜로그를 정식 출시(유료화 포함)하기 전에 Driveline 에 사용 허락을 받는다. 못 받으면 이 파일을
다른 자료(4TU youth pitchers, CC BY 4.0 · 우리 마커 촬영)로 만든 틀로 바꾼다(2026-10-10 김민 결정).
