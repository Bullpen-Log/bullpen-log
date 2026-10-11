# obp-pitch.json — 출처와 사용권

- 출처: Driveline Baseball, OpenBiomechanics Project — https://github.com/drivelineresearch/openbiomechanics
  (`baseball_pitching` 의 `pitching_landmarks.zip`, 릴리스 dataset-v1, `landmarks.csv`).
- 사용권: **CC BY-NC-SA 4.0** (https://creativecommons.org/licenses/by-nc-sa/4.0/). 이 파일도 같은 사용권이다.
  - 출처를 밝힌다. 영리 목적으로 쓰지 않는다. 고쳐서 나누면 같은 사용권으로 나눈다.
  - OpenBiomechanics 는 이 밖에 프로 구단의 사용도 막는다(원 저장소 README).
- 고친 것: 투구 하나(`2916_4`, 대학, 94.4mph)만 골랐다. 관절 18개만 남기고, 360Hz 를 120Hz 로 줄였다(3장면에 하나).
  좌표는 소수 셋째 자리(mm)로 줄였다. 순간 시각(`pkh_time` · `fp_10_time` · `MER_time` · `BR_time` 등)은 그대로다.
- 쓰는 곳: 데생 인형 예시 페이지(`build.mts`)의 **비교 확인용**으로만 쓴다. 앱 · 사이트(`public/`)에는 넣지 않는다.
