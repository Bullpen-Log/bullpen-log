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
| `obp-synth.mts` | 가상 촬영 셀프 테스트(node) — 3D 관절을 가상 폰 두 대에 비춰 합성 2D(잡음 · 가림 · 좌우 바뀜)를 만들고 서버와 같은 길로 맞춘 뒤 메카닉 점검 숫자 · 판정을 정답과 견준다. `metadata.csv` 도 받는다 |

### 가상 촬영 셀프 테스트(2026-11-06)

```bash
curl -sL -o ~/obp-dl/metadata.csv https://raw.githubusercontent.com/drivelineresearch/openbiomechanics/main/baseball_pitching/data/metadata.csv
node --import ./scripts/alias-register.mjs scripts/pitch-lab/obp/obp-synth.mts ~/obp-dl --n=100   # 투수 100명 한 구씩, 약 4분
```

- 옆 폰 = 가슴 쪽(우투 3루 · 좌투 1루) 3.5~5m, 뒤 폰 = 2루 쪽 4~5m, 두 폰 사이 70~110°, 1080p 120fps(순간은 서버처럼 30fps 로 거칠게). 투구마다 자리 · 높이 · 초점이 다르다.
- 자료에 없는 점(코 · 귀 · 뒤꿈치 · 발끝 · 손 점)은 몸 비율로 붙이고, 자료가 다리를 든 뒤부터인 투구가 많아 처음 · 끝 자세로 0.8 · 1초 멈춰 둔다.
  발판 순간이 발 움직임과 0.1초 넘게 어긋나는 투구(100명 중 3)는 뺀다.
- 2D 관절 모델(RTMW)은 안 거친다 — 실제 영상의 2D 오차는 마커 채점이 본다. 움직임 틀(motion-template.json)이 이 자료로 만든 것이라 가린 구간은 실제보다 유리할 수 있다(`--no-template`).
- 결과(97구): 순간을 맞게 잡으면 3D 는 정확하다(같은 순간 견주기 — 착지 때 상체 |차| 가운데 3.1° · 몸통 앞 기울기 1.2° · 드리프트 0.6cm).
  큰 오차는 순간에서 온다 — 30fps 로 잡은 착지 · 공 놓음이 90% ±40~50ms 라 착지 때 상체 ±19° · 골반 감속 ±38%(90%).
  판정 같음: 드리프트 93% · 착지 때 상체 72% · 몸통 도는 때 64% · 블록 73%(블록은 정답 '좋아요' 86구 중 23구를 '보통'으로 낮춤).
  잘못 낸 '고칠 점': 드리프트 1 · 몸통 도는 때 5 · 착지 때 상체 8 · 블록 1 / 90구. 엉뚱한 순간을 잡은 3구는 `eventsImplausible`(run-node.ts)이 막는다.
