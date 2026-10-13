# 드라이브라인 공개 자료(OpenBiomechanics)로 상하체 분리 자 맞추기

결과 · 판단은 `docs/designs/pitch-mechanics-checks.md` 4-1. 자료는 **저장소에 넣지 않는다**(CC BY-NC-SA) — 저장소 밖 빈 폴더에 받는다.

```bash
D=~/obp-dl; mkdir -p $D && cd $D
curl -sLO https://github.com/drivelineresearch/openbiomechanics/releases/download/dataset-v1/pitching_landmarks.zip
curl -sLO https://github.com/drivelineresearch/openbiomechanics/releases/download/dataset-v1/pitching_joint_angles.zip
curl -sL -o poi_metrics.csv https://raw.githubusercontent.com/drivelineresearch/openbiomechanics/main/baseball_pitching/data/poi/poi_metrics.csv
```

(저장소에서) `python -I scripts/pitch-lab/obp/<스크립트> ~/obp-dl` — pandas · numpy 필요.

| 스크립트 | 하는 일 |
| --- | --- |
| `compare.py` | 우리 자(어깨 · 엉덩이 관절 가운데 선, 위에서 본 각도 차) vs 드라이브라인 값(poi · 흉곽 틀) — 치우침 · 흔들림 · 상관, 옛 기준으로 판정 비율 |
| `norms.py` | 우리 자 기준표(손별 아래 10 / 25 / 50%) — `lib/pitch-3d/v2/mech-judge.ts` SEP_NORM 의 숫자 |
| `consistency.py` | 같은 선수 흔들림 · 선수 사이 퍼짐 · ICC(두 자) |
| `openness.py` | 착지 때 골반 · 어깨 열림(디딤 방향 기준) — 마커 정답(mech_truth.py)과 같은 자 |
