# 3D 투구 분석(베타) — 옆 · 뒤 두 영상으로 3D 메커니즘 지표

2026-10-08, 김민(Claude). 사용자: "옆(3루) · 뒤(2루)에서 동시에 찍으면 3D 분석이 가능하지 않을까 — 단계별로 순서를 정해 만들고, 다 만들면
얼마나 정확할지 검토도 해 줘". 결정은 모두 추천안(질문 없이), 아래 '정한 것'에 모았다.

## 1. 지금 상태(2026-10-08 확인)

- 샘플 실험실 `/videos/lab`(관리자, `lib/pitch-lab.ts`): 옆 · 뒤 영상 짝 + 촬영 정보(meta.json)를 비공개 영상 버킷 `{userId}/pitch-lab/{id}/` 에.
- 관절 찾기는 이미 있다 — `lib/pose/extract.ts`(MediaPipe Pose Landmarker full, 기기 안, 관절 33개 · 신뢰도), 옆 영상의 니업 · 착지 ·
  릴리스는 `lib/pose/detect.ts`(폼 분석이 쓰는 규칙).
- 타당성 시험(샘플 3쌍 — 우투 2 · 좌투 1, 모두 슬로모 재생 화면 녹화):
  - 사람 인식 99~100%, 관절 신뢰도 0.95~0.98(6개 영상 모두). 화면 녹화는 초당 60장 중 절반이 같은 장면(재생 30장).
  - 위아래 좌표로 시간 맞추기(DTW): 우투 2쌍 맞음(위아래 차이 몸 높이의 3.5 · 4.0%), 좌투 1쌍 실패(옆 영상이 릴리스에서 끝나 두 영상의 구간이 다름).
  - '두 카메라가 90도'라고만 보고 합친 3D: 골반-어깨 꼬임 최대 47° · 35°(투수에게 흔한 범위). 다만 뼈 길이가 시간에 따라 15~25% 흔들린다
    (카메라 위치를 모르고 합쳤기 때문).
- 자료는 저장소 밖 `~/bullpen-pose-lab`(관절 JSON). 사람 영상 · 관절은 공개 저장소에 올리지 않는다.

## 2. 목표 · 하지 않을 것

- 목표: 옆 · 뒤 영상 짝 하나로, 옆에서만 찍으면 못 재던 지표(꼬임 · 디딤 방향 · 몸통 옆 기울기 · 팔 높이)를 3D 로 재고, 각 지표의 믿음을 함께 보인다.
- 하지 않을 것(지금): 1회 측정값을 '정답'처럼 보이기(정확도 확인 전) · 어깨 외회전 최대(MER)를 정식 지표로(오차가 큼, 실험 표시만) ·
  속도 · 시간 지표(화면 녹화는 실제 시간을 모름 — 원본 · 슬로모 설정을 알 때만) · 서버 계산(영상은 기기 밖으로 안 나간다) · AI(대화형) 사용 없음.

## 3. 방식 — 3D 엔진 `lib/pitch-3d/*`(순수 함수, DOM 없음)

| 차례 | 하는 일 | 방법 |
|---|---|---|
| 1 정리 | 한 영상의 관절을 다듬는다 | 관절 찾기는 0.25배로 틀어 장면을 빠뜨리지 않는다(검토 R1, 초당 장면 수를 남기고 20 밑이면 경고) · 같은 장면(화면 녹화 중복) 빼기 · 던지는 팔 이름 맞추기(던진 손목 = 실제 던지는 손) · 장면마다 좌우 뒤바뀜 고치기(팔 · 다리 묶음별로, 앞 장면과 덜 튀는 쪽 → 보정 뒤 다른 영상과 맞는 쪽으로 한 번 더, R3) |
| 2 시간 맞추기 | 옆 장면 ↔ 뒤 시각 | 두 카메라에 같이 보이는 위아래 좌표(손목 · 무릎 · 발목 · 어깨, 골반 기준 · 몸 높이 단위)로 DTW(열린 끝, 기울기 1/3~3 — 슬로모 속도 변화도 견딤) → 단조 매끈한 대응. 구간 덮임 검사(옆의 니업~릴리스가 뒤 영상 안에 있나) |
| 3 카메라 위치 | 두 카메라의 초점 거리 · 서로의 방향 | 사람 몸을 보정판으로: 관절 대응 수천 개로 초점 거리 격자(0.5~2.0 × 긴 변) × 8점 본질 행렬 → 앞쪽 검사 → 다시 비춤 오차 + 뼈 길이 흔들림 + 초점 사전(log σ 0.5)이 가장 작은 것 → Nelder–Mead 로 다듬기(초점 2 · 회전 3 · 방향 2). 두 패스: 몸통 · 다리로 1차 → 좌우 고친 뒤 2차(R3). 두 카메라가 같은 사람을 겨누면 초점은 원리상 약하게 정해진다(R2) — 비용 곡률로 보정 믿음을 재 ± 를 넓힌다. 화면 중심 = 주점, 정사각 화소, 왜곡 없음으로 둔다 |
| 4 3D 만들기 | 장면 · 관절마다 3D | 두 광선의 가중 교차(신뢰도 가중), 뒤 영상은 맞춘 시각으로 보간. 한 영상에서만 잘 보이는 관절은 그 광선 위에서 부모 관절로부터 뼈 길이만큼(R4). 시간 맞춤을 다시 비춤 오차로 한 번 더 다듬는다 |
| 5 뼈대 | 흔들림 줄이기 | Savitzky–Golay 다듬기(장면 5개) → 지표는 여기서 잰다. 3D 보기용 뼈대만 뼈 길이를 중앙값으로 고정(골반에서 바깥으로) |
| 6 기준 축 | 위 · 홈 방향 · 옆 | 위 = 두 카메라 화면 가로축의 외적(폰을 숙여도 그대로, R5) — 두 광축이 30° 안으로 나란하면 위 방향 평균, 니업 전 서 있는 몸통과 10° 넘게 다르면 경고. 홈 방향 = 뒤 카메라 광축의 수평 성분(골반이 나아간 방향과 15° 넘게 다르면 그쪽 + 경고) |
| 7 순간 | 니업 · 착지 · 릴리스 | 옆 영상 규칙(`detectPitchEvents`)을 맞춘 시간으로 옮기고, 3D 로 확인(앞발 높이 · 손목 앞 위치) |
| 8 지표 | 순간마다 각도 · 비율 | 아래 4절 |

- 단위: 각도와 '키 대비 %'가 먼저(크기를 몰라도 된다). cm 는 프로필 키가 있을 때만(코~발목 ≈ 키의 0.88).
- 파일은 다섯(검토 D1): `lib/pitch-3d/linalg.ts`(행렬 · 고윳값 · Nelder–Mead) · `camera.ts`(보정 · 광선 교차 · 비춤) · `motion.ts`(정리 · 시간 맞추기 · 다듬기 · 뼈대) · `metrics.ts`(기준 축 · 순간 · 지표) · `analyze.ts`(차례 · 타입 · 판 번호).
- 엔진 판 번호 `PITCH3D_VERSION`(구속 엔진처럼 바꿀 때마다 올리고 지난 판 표에 한 줄). 결과에 남긴다.

## 4. 지표(첫 판) · 정확도 목표

| 지표 | 언제 | 목표 오차(실험실 기준과 견줄 때) | 근거 |
|---|---|---|---|
| 몸통 앞 기울기 · 옆 기울기 | 릴리스 | ±5~8° | 한 카메라 상용 PitchAI 몸통 RMSE 약 6°, 두 폰 OpenCap 약 5~6° |
| 골반-어깨 꼬임 | 최대 · 착지 | ±8~12° | 수평면 회전은 시상면보다 나쁘다(PitchAI), 골반 관절 중심이 불확실 |
| 앞다리 무릎 굽힘 | 착지 · 릴리스 | ±6~10° | OpenCap 무릎 4~8°, PitchAI 무릎 약 9° |
| 보폭 | 착지 | 키의 ±3~5%p | 발목 위치 · 키 비례 |
| 디딤 방향(열림 · 닫힘) | 착지 | 키의 ±3%p(키를 알면 ±5cm 안팎) | 뒤 영상이 좌우를 직접 본다 |
| 팔 높이 · 어깨 벌림 | 릴리스 | ±8~12° | PitchAI 던지는 팔 약 12°, BlazePose 어깨 벌림 MAE 약 8° |
| 어깨 외회전 최대(MER) | 최대 | ±15~25° — **실험 표시만** | PitchAI 어깨 외회전 RMSE 최대 약 21°, 릴리스 근처 흐림 |
| 착지→릴리스 시간 | — | 원본 · 슬로모 설정을 알 때만, 240fps 면 ±4~8ms | 장면 1~2장 |

- 이 숫자는 **목표**다. 실험실 기준(마커 · KinaTrax 등)과 견주기 전에는 절대 정확도를 모른다. 대신 세 가지를 잰다:
  ① 합성 시험(알려진 3D 를 가짜 카메라로 비춰 엔진이 얼마나 되찾나 — 기하 부분의 한계)
  ② 내부 일관성(다시 비춤 오차 · 뼈 길이 흔들림 · 좌우 대칭)
  ③ 반복성(같은 투수 · 같은 공 5구의 지표 표준편차 — 실제로 바뀌지 않은 것의 흔들림이 곧 측정 잡음).

## 5. 단계(순서 · 걸리는 시간 · 끝났다는 기준)

| 단계 | 내용 | 시간 | 끝 기준 |
|---|---|---|---|
| 0 끝남 | 샘플 실험실 · 타당성 시험 | — | 위 1절 |
| 1 | 3D 엔진(3절 1~8) + 합성 정확도 시험 `npm run pitch3d:test` + 실제 샘플 돌리기(`scripts/pitch-lab/`) | 2~3시간 | 합격은 **지표 각도 · 보폭**으로(초점은 기록만, R2): 잡음 없으면 지표 ±1° · 보폭 ±0.5%p, 몸 높이 1% 잡음 · 시간 어긋남 · 좌우 뒤바뀜 3% · 가려진 관절 · 초점 20% 어긋남 · 폰 숙임에서 기울기 · 무릎 · 어깨 ±5° · 꼬임 ±6° · 보폭 ±3%p. 실제 우투 2쌍: 뼈 길이 흔들림 몸통 · 다리 7% · 위팔 10% · 아래팔 15% 밑(R7), 다시 비춤 오차 몸 높이의 2% 밑. 좌투 1쌍은 실패 까닭(장면 밀도 · 덮임)을 가른다(R6) |
| 2 | 실험실 화면 '분석하기' — 두 영상 관절 찾기(진행 %) → 3D → 결과 카드(지표 · 믿음 · 경고) → `analysis.json` 저장, 다시 열면 바로 | 1~1.5시간 | 휴대폰 375px 넘침 0, 실패하면 까닭 한 줄(구간 다름 · 카메라 각도 좁음 · 사람 못 찾음) |
| 3 | 3D 뼈대 보기 — 돌려 보기 · 시간 막대 · 순간 표시(캔버스, 새 패키지 없음) | 1시간 | 손가락으로 돌리기 · 재생, 휴대폰 · PC |
| 4 | 한 대로 나눠 찍기(근사 3D) — 동작 단계로 맞춰 합치기 + 공마다 차이(일관성) | 샘플 받은 뒤 2시간 | 나눠 찍은 샘플 3쌍 이상 |
| 5 | 정확도 확인(사용자와) — 같은 투수 5구 반복성, 가능하면 실험실 결과와 견주기 → 4절 목표를 확인 · 보정 | 샘플 받은 뒤 | 지표마다 반복성 표준편차 · (있으면) 실험실과의 차이 |

## 6. 위험 · 대응

- 두 폰이 같은 사람을 겨누면 초점 거리는 원리상 약하게 정해진다(검토 R2) → 초점 사전 + 뼈 길이로 붙잡고, 보정 믿음이 낮으면 ± 를 넓힌다. 사람이 멀수록 각도는 초점에 덜 민감하다.
- 관절 찾기가 기기 속도 탓에 장면을 빠뜨린다(검토 R1) → 실험실은 0.25배로 틀고, 초당 장면 20 밑이면 경고.
- 두 카메라 각도가 좁으면(같은 쪽에서 찍음) 깊이가 불안정 → 카메라 사이 각을 재서 45° 밑이면 경고, 60~120° 권장.
- 골반 관절 중심은 모델이 짐작한다(두 영상에서 다르게) → 다시 비춤 오차에서 큰 쪽을 덜 믿고, 꼬임에 ± 를 크게.
- 릴리스 근처 던지는 팔 흐림 → 그 장면은 신뢰도로 가중, 팔 지표 믿음을 낮게.
- 두 영상 구간이 다름(좌투 샘플) → 덮임 검사로 '두 영상 모두 준비 자세~팔로스루까지 찍어 주세요'.
- 화면 녹화(재생 화면 · 사진 앱 단추 · 압축) → 시간 지표는 안 냄, 같은 장면 빼기. 원본을 받으면 가장 좋다.
- 좌투 · 뒤에서 좌우 이름이 뒤집힘 → 던지는 손 기준으로 맞춤(시험에서 확인).

## 7. 정한 것(추천안)

1. 계산은 기기 안(브라우저) — 영상이 밖으로 안 나가고 서버 비용 0. 폼 분석과 같은 길.
2. 카메라 보정은 사람 몸으로 저절로(체커보드 · 도구 없음).
3. 지표는 각도 · 키 대비 % 먼저, 시간 지표는 원본 · 슬로모 설정을 알 때만, MER 은 실험 표시.
4. 결과는 샘플 폴더의 `analysis.json`(DB 그대로). 엔진 판 번호를 남긴다.
5. 3D 보기는 캔버스(three.js 를 쓰지 않음 — 막대 사람 하나라 가볍게).
6. 베타는 관리자만 그대로. 투구 영역(금윤호)이라 화면을 바꿀 때 HANDOFF.

## 8. 참고

- OpenCap(두 폰 · 보정판 · 근골격 모델): 하지 관절 RMSE 4~8°, 묶음 분석 약 5.9° — MDPI Sensors 2024 · PMC12657453.
- PitchAI(한 카메라, 투구 · 마커 비교): 골반 · 몸통 RMSE 약 6°, 무릎 약 8.8°, 던지는 팔 약 12.3°, 어깨 외회전 최대 약 20.8°, 수평면이 시상면보다 나쁨 — sportRxiv 101.
- BlazePose(MediaPipe) vs OptiTrack: 어깨 벌림 MAE 8.3°, 팔꿈치 치우침 +18.9° — 2D · 한 카메라.
- 사람 동작으로 카메라 보정: 몸의 조각별 강체성 · 좌우 대칭을 쓰면 두 영상에서도 가능(두 영상 보정은 가정 3개 이상 필요 — 주점 · 정사각 화소 · 기울임 없음).

---

# 엔지니어링 검토(gstack plan-eng-review) — 2026-10-08

대상: 이 문서 `docs/designs/pitch-3d-analysis.md`(위 1~8절). 결정은 사용자의 늘 규칙("전부 recomended 로 설계하고 질문하지마",
기억 design-all-recommended-no-questions)과 만들기 허락("어 만들어줘", 2026-10-08)에 따라 추천안으로 정한다. 근거는 아래 장부의 '실제 답'.

## 범위 확인(Scope Challenge)

### A. 살핀 것

- **이미 있는 것**: 관절 찾기 `extractPoseTrack`(`lib/pose/extract.ts:354`, 브라우저 · MediaPipe full), 옆 영상 순간 찾기
  `detectPitchEvents`(`lib/pose/detect.ts:111`), 샘플 저장 `lib/pitch-lab.ts`(폴더 목록 · meta.json), 관리자 서버 동작 틀
  `app/actions/pitch-lab.ts`, 엔진 판 번호 표의 본보기 `lib/velocity-engine/version.ts`, 셀프테스트 실행 틀
  `scripts/alias-register.mjs`, 시간 맞추기(DTW)의 시험판 `scratchpad/fuse3d.mjs`(저장소 밖). three.js 는 설치돼 있지만 안 쓴다(7절 5).
- **최소 변경**: 엔진(순수 함수) → 실험실 '분석하기' → 3D 보기. 4 · 5단계(한 대로 찍기 · 실험실 기준 비교)는 이미 뒤로 미뤄져 있다.
- **복잡도**: 계획대로면 새 파일 약 15개(엔진 9 · 합성 시험 1 · 실제 샘플 돌리기 1 · 서버 동작 · 저장 · 화면 · 3D 보기 · npm 줄)
  → 8개를 넘어 B 로.
- **찾아본 것**: 두 카메라의 초점 거리를 기본 행렬로 구하는 방법은 **두 카메라의 광축이 한 점(같은 사람)에서 만나면 원리상 풀리지 않는다**
  (Kocur 외 2023, arXiv 2311.16304 — "같은 물체를 여러 방향에서 찍을 때 흔하다"). 사람 몸의 강체성(뼈 길이)과 초점의 사전 범위로
  메워야 한다 **[Layer 3]**. 8점 본질 행렬 · 광선 교차 · DTW 는 교과서 방법 **[Layer 1]**, 사람 몸으로 보정은 연구 단계 **[Layer 2]**.
- **TODOS.md**: 이 계획을 막거나 겹치는 줄 없음.
- **배포**: 새 패키지 · 앱 굽기 없음(웹 코드, 관리자만). MediaPipe 실행 파일은 지금처럼 CDN.
- **지난 기록(git)**: 2026-09-01 폼 분석에서 '골반-어깨 분리 곡선'을 한 카메라로 재다 지웠다(7890115 · 3497cb6 — "옆에서 찍으면
  먼 쪽 어깨와 골반이 몸에 가려지고, 가려지는 때가 정확히 몸이 닫혀 있는 순간이다", "MediaPipe 의 z 는 가려진 쪽에서는 모델이
  지어낸 값이다"). 두 카메라로도 '한쪽에서 가려진 관절'은 같은 문제를 다시 만든다 → R4.

### B. 범위 기록

feature answers: 자르기 제안 없음(기능 목록 그대로 — 3D 보기는 사용자가 원한 '즉각적인 반응'이라 남김); structure: D1 → B) Smaller
arrangement(자동 결정, 추천안); accepted scope: 엔진은 파일 5개(`lib/pitch-3d/linalg.ts` · `camera.ts` · `motion.ts` · `metrics.ts` ·
`analyze.ts`), 시험 · 실제 샘플 돌리기 · 화면 · 저장 · 3D 보기는 계획 그대로; pending remedies: R1~R9.

D1 — 엔진 파일 배치(Scope structure). Project/branch/task: main 에서 3D 투구 분석 엔진을 새로 만든다. ELI10: 계산 코드를 9개 파일로
나눌지 5개로 묶을지다. 기능은 같고, 파일이 적으면 읽고 고칠 곳이 줄어든다. Stakes: 너무 잘게 나누면 서로 부르는 길이 엉키고, 너무
뭉치면 한 파일이 길어진다. Recommendation: B because 단계 8개가 실제로는 수학 · 카메라 · 움직임 · 지표 네 덩이라 그대로 묶는 편이
짧고 시험하기 쉽다. Note: options differ in kind, not coverage — no completeness score. Pending remedies not decided here: R1~R9.
A) Original arrangement — 3절 표의 단계마다 파일 하나(clean · sync · calibrate · triangulate · skeleton · frame · events · metrics ·
analyze, 9개). B) Smaller arrangement (recommended) — `linalg`(행렬 · 고윳값 · Nelder–Mead) · `camera`(보정 · 광선 교차 · 비춤) ·
`motion`(정리 · 시간 맞추기 · 다듬기 · 뼈대) · `metrics`(기준 축 · 순간 · 지표) · `analyze`(차례 · 타입 · 판 번호) 5개. 기능 · 계약 · 시험 같음.
Net: 같은 기능을 파일 수로만 다르게 — 작은 쪽이 읽기 쉽다. 답: B(자동 결정 — 위 늘 규칙).

### C. 발견

1. [P2] (confidence: 9/10) 이 문서 3절 표 — 엔진 9개 파일 + 그 밖 6개로 복잡도 문턱을 넘음. → D1 에서 5개로(범위는 그대로).

Scope Challenge 결과: **scope accepted as-is**(작은 배치는 범위를 줄이지 않는다).

## 결정 장부(Decision ledger)

### R1: 관절 찾기가 장면을 빠뜨리지 않게(실험실 길)
Finding: 1 · [P1] · confidence 9/10 · `lib/pose/extract.ts:315-343` · 1절 Architecture
Plan baseline: 3절 1 '정리'는 받은 장면을 그대로 쓴다(장면 밀도 조건 없음).
Runtime evidence: `scanByPlayback` 는 영상을 보통 속도로 틀고(`video.play().catch(() => finish());` :343, `playbackRate` 를 어디서도
안 바꿈) 새 장면이 보일 때마다 그 자리에서 `landmarker.detectForVideo(video, ts)`(:320)를 부른다 — 관절 찾기가 장면 간격보다 느리면
그사이 장면은 건너뛴다. 실제로 e723bc 옆 영상은 6.35초에 장면 71개(초당 11개)만 받았다(다른 영상은 초당 약 48개).
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 실험실의 관절 찾기 재생 속도 | 1배(기기 속도에 따라 장면을 빠뜨림) | 선택 인자 `playbackRate`, 실험실은 0.25배 + 장면 밀도 경고 | 실험실만 seek 방식 | 그대로 |
| 폼 분석(`components/pose-analysis.tsx:447`) | 1배 | 그대로(인자 안 넘김) | 그대로 | 그대로 |
Question D2:
D2 — 관절 찾기가 장면을 빠뜨리지 않게
Project/branch/task: main · 3D 투구 분석 2단계(실험실 '분석하기')가 두 영상의 관절을 찾는다.
ELI10: 지금 관절 찾기는 영상을 보통 속도로 틀어 놓고 따라가서, 계산이 느린 폰에서는 장면을 3분의 2쯤 놓친다. 3D 는 두 영상의 시간을
장면 단위로 맞추고 릴리스 순간을 잡아야 해서 빠진 장면이 곧 오차다.
Stakes if we pick wrong: 릴리스 · 착지 장면이 빠져 몸통 기울기 · 꼬임 값이 한두 장면 늦거나 이르게 잡힌다(회전이 빠른 순간이라 수 도씩).
Recommendation: A because 한 줄 인자로 실험실만 천천히 틀면 모든 장면을 받고, 폼 분석은 그대로다.
Completeness: A=10/10, B=8/10, C=4/10
Pros / cons:
A) 0.25배 재생 + 밀도 경고 (recommended)
  ✅ 데스크톱 · 폰 모두 장면 간격(66ms)이 관절 찾기 시간보다 길어 빠짐이 거의 없다
  ✅ 받은 장면 수를 재서 초당 20개 밑이면 결과에 경고를 붙인다(조용히 틀리지 않게)
  ❌ 분석 시간이 영상 길이의 약 4배(8초 영상이면 한쪽 32초, 둘이면 1분 남짓)
B) 실험실만 seek(장면 이동) 방식
  ✅ 장면 간격을 코드가 직접 정해 기기 속도와 상관없다
  ❌ 사파리는 seek 뒤 화면이 안 바뀌는 문제가 있어(extract.ts 주석) 아이폰에서 같은 장면만 읽을 수 있다
C) 그대로
  ✅ 고칠 것이 없다
  ❌ 폰에서 장면을 놓쳐 시간 맞추기 · 릴리스가 흔들리고, 왜 틀렸는지 화면이 말해 주지 않는다
Net: 분석 시간 몇십 초를 내주고 장면 빠짐을 없앤다.
Header: 장면 밀도
Options:
A) 0.25배 재생 + 밀도 경고 (recommended)
`extractPoseTrack(src, onProgress, signal, { playbackRate })` 선택 인자(기본 1 그대로). 실험실은 0.25. 결과에 초당 장면 수를 남기고 20 밑이면 경고. 사람: 반나절 / CC: 10분. 위험 낮음(폼 분석은 인자를 안 넘긴다).
B) 실험실만 seek 방식
실험실 길에서 scanBySeek 을 먼저 쓴다. 사람: 반나절 / CC: 10분. 아이폰 사파리에서 같은 장면 반복 위험.
C) 그대로
아무것도 안 바꾼다. 장면 빠짐을 받아들인다.

State: approved
Actual answer: A) 0.25배 재생 + 밀도 경고 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: `extractPoseTrack` 에 선택 인자 `{ playbackRate }`(기본 1 — 폼 분석 그대로), 실험실은 0.25배. 결과에 초당 장면 수, 20 밑이면 경고.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R2: 초점 거리의 원리적 한계 대응(카메라 보정)
Finding: 2 · [P1] · confidence 8/10 · 이 문서 3절 3 '카메라 위치' · 5절 1단계 끝 기준 '초점 ±2% · ±5%' · 1절 Architecture
Plan baseline: 초점 격자 × 8점 본질 행렬 → 다시 비춤 + 뼈 길이 흔들림 최소 → Nelder–Mead. 합격 기준에 초점 ±2%(잡음 없음) · ±5%(잡음).
Runtime evidence: 문헌 — 두 카메라의 광축이 만나면(같은 사람을 겨누면) 기본 행렬만으로는 두 초점을 정할 수 없다(arXiv 2311.16304).
옆 · 뒤 폰이 모두 투수를 겨누므로 정확히 그 경우다. 남는 단서는 뼈 길이의 강체성과 초점 사전 범위뿐이라 초점은 약하게 정해질 수 있다.
코드는 아직 없다(제안).
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R2 보정의 단서 | 다시 비춤 + 뼈 길이 | + 초점 사전(폰 영상 범위, 약하게) + 비용 곡률로 '보정 믿음' | 계획 그대로 | 촬영 정보에 화각(줌)을 받음 |
| 1단계 합격 기준 | 초점 ±2% / ±5% | 지표 각도로 합격(초점 오차는 기록만), 초점이 20% 틀려도 각도가 예산 안인지 시험 | 초점 ±2% / ±5% | 계획 그대로 |
Question D3:
D3 — 초점 거리를 원리상 못 구하는 경우 대응
Project/branch/task: main · 3D 엔진 1단계의 카메라 보정.
ELI10: 두 폰이 같은 사람을 가운데 두고 찍으면, 수학적으로 '두 카메라가 얼마나 확대했는지(초점 거리)'를 사진만으로는 정할 수 없는
경우가 된다. 다행히 사람이 멀리 있으면 각도는 초점에 덜 민감해서, 초점을 정확히 못 맞혀도 각도는 맞을 수 있다.
Stakes if we pick wrong: 계획대로면 1단계가 '초점 ±5%'를 못 넘겨 영원히 끝나지 않거나, 초점이 흔들릴 때 각도가 조용히 틀린다.
Recommendation: A because 사용자가 보는 것(각도)으로 합격을 정하고, 초점은 약한 사전 범위 + 뼈 길이로 붙잡고, 덜 정해졌으면 ± 를 넓힌다.
Completeness: A=10/10, B=5/10, C=7/10
Pros / cons:
A) 초점 사전 + 보정 믿음 + 각도로 합격 (recommended)
  ✅ 원리적 한계를 시험이 직접 다룬다 — 초점이 20% 틀린 경우에도 각도 오차를 잰다
  ✅ 비용이 평평하면(초점이 덜 정해짐) 결과에 '카메라 추정 불확실'과 넓은 ± 를 붙인다
  ❌ 사전 범위를 잘못 잡으면 맞는 초점을 밀어낼 수 있다 — 약하게(log 표준편차 0.5) 둔다
B) 계획 그대로
  ✅ 고칠 것이 없다
  ❌ 합격 기준이 원리상 못 맞출 수 있는 값(초점)에 걸려 있다
C) 촬영 정보에 화각을 받는다
  ✅ 줌 · 화각을 알면 초점이 바로 정해진다
  ❌ 화면 녹화 · 잘라 낸 영상은 화각을 알기 어렵고, 사용자가 모르는 값을 묻게 된다
Net: 정해지지 않는 값 대신 보이는 값으로 합격을 정하고, 모르면 모른다고 보인다.
Header: 보정 한계
Options:
A) 초점 사전 + 보정 믿음 + 각도로 합격 (recommended)
비용 = 다시 비춤 + 뼈 길이 흔들림 + 초점 사전(log, σ 0.5, 긴 변의 1.0배 중심). 곡률로 보정 믿음. 1단계 합격은 지표 각도 · 보폭(초점은 기록). 합성 시험에 '광축이 만나는 배치'와 '초점 20% 어긋남'. 사람: 2일 / CC: 30분.
B) 계획 그대로
초점 ±2% · ±5% 를 합격 기준으로 둔다.
C) 촬영 정보에 화각을 받는다
meta 에 화각 칸을 더하고 있으면 고정. 사람: 반나절 / CC: 15분.

State: approved
Actual answer: A) 초점 사전 + 보정 믿음 + 각도로 합격 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: 보정 비용 = 다시 비춤 + 뼈 길이 흔들림 + 초점 사전(log σ 0.5). 비용 곡률로 보정 믿음 → ± 넓힘. 1단계 합격은 지표 각도 · 보폭(초점은 기록만). 합성 시험에 광축이 만나는 배치 · 초점 20% 어긋남.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R3: 좌우 이름 고치기를 두 영상으로
Finding: 3 · [P2] · confidence 8/10 · 이 문서 3절 1 '정리'("앞 장면과 덜 튀는 쪽") · 1절 Architecture
Plan baseline: 던지는 손으로 전체 좌우를 맞추고, 팔 · 다리 묶음마다 앞 장면과 덜 튀는 쪽을 고른다(시간 단서만).
Runtime evidence: 타당성 시험의 `fuse3d.mjs` 는 전체 바꿈만 했다. 뒤에서 찍은 영상은 모델이 좌우를 뒤집기도 한다(`detect.ts:25-27` 주석).
코드 없음(제안).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R3 묶음별 좌우 고치기의 단서 | 시간(앞 장면) | 시간 + 두 번째 패스에서 다른 영상과의 다시 비춤(보정 뒤) | 시간만 |
Question D4:
D4 — 팔 · 다리 좌우 이름을 두 영상으로 고칠지
Project/branch/task: main · 3D 엔진의 정리 단계.
ELI10: 관절 찾기가 뒤에서 본 영상에서 왼팔 · 오른팔 이름을 가끔 바꿔 붙인다. 앞 장면과 비교하는 것만으로는 팔이 빨리 움직이는
순간에 틀리기 쉽다. 카메라 위치를 한 번 구한 뒤에는 '옆 영상과 맞는 쪽'이 훨씬 확실한 단서다.
Stakes if we pick wrong: 릴리스 근처에서 팔 이름이 바뀌면 3D 팔이 순간 이동해 팔 높이 · 어깨 벌림이 수십 도 튄다.
Recommendation: A because 보정을 한 번 더 도는 값싼 2단계로 가장 큰 오류 원인 하나를 막는다.
Completeness: A=10/10, B=6/10
Pros / cons:
A) 두 패스(몸통으로 보정 → 다른 영상과 맞는 쪽으로 팔다리 이름 → 다시 보정) (recommended)
  ✅ 빠른 팔에서도 '옆 영상과 3D 로 맞는 쪽'이라 시간 단서보다 확실하다
  ✅ 보정을 몸통 관절로 먼저 해서 뒤바뀐 팔다리가 카메라 추정을 흐리지 않는다
  ❌ 보정을 두 번 돌려 계산이 두 배(1초 안팎)
B) 시간 단서만(계획)
  ✅ 단순하다
  ❌ 팔이 한 장면에 크게 움직이는 릴리스 근처에서 틀리기 쉽다
Net: 1초 계산을 더 써서 팔 순간 이동을 막는다.
Header: 좌우 이름
Options:
A) 두 패스(보정 → 다시 비춤으로 고침 → 다시 보정) (recommended)
1차 보정은 어깨 · 골반 · 무릎 · 발목(묶음 단위 시간 고침 뒤). 그 뒤 장면 · 묶음마다 뒤 영상의 좌우 두 경우 중 다시 비춤 오차가 작은 쪽. 2차 보정. 사람: 1일 / CC: 15분.
B) 시간 단서만
계획 그대로.

State: approved
Actual answer: A) 두 패스(보정 → 다시 비춤으로 고침 → 다시 보정) — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: 1차 보정은 몸통 · 다리 관절, 그 뒤 장면 · 묶음마다 뒤 영상 좌우 두 경우 중 다시 비춤 오차가 작은 쪽, 2차 보정.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R4: 한쪽 영상에서 가려진 관절
Finding: 4 · [P2] · confidence 8/10 · 이 문서 3절 4 '3D 만들기'(신뢰도 가중 교차) · 5 '뼈대'(중앙값 길이로 고정) · 1절 Architecture
Plan baseline: 두 광선을 신뢰도로 가중해 교차하고, 뼈 길이를 중앙값으로 맞춘다(그 뼈의 방향을 따라 늘이거나 줄임).
Runtime evidence: 광선 둘의 최소 제곱 교점은 가중치가 작은 쪽 광선이 '좋은 광선 위의 깊이'를 정한다 — 가중치는 교점을 두 광선 사이
수직선 위에서 옮길 뿐이다. 한쪽에서 가려진 관절(지어낸 2D)은 그 깊이가 지어낸 값이 된다(3497cb6 의 교훈과 같은 문제).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R4 한쪽만 믿을 만한 관절의 자리 | 가중 교차 → 뼈 방향으로 길이 맞춤 | 믿을 만한 광선 위에서 부모 관절로부터 뼈 길이만큼(2차 방정식) | 계획 그대로 |
Question D5:
D5 — 한쪽에서 가려진 관절을 어디에 둘지
Project/branch/task: main · 3D 엔진의 3D 만들기 · 뼈대 단계.
ELI10: 몸에 가려진 관절은 관절 찾기가 '그럴듯하게 지어낸다'. 두 영상을 합칠 때 지어낸 쪽이 깊이를 정해 버리면 3D 가 틀린다.
잘 보이는 영상의 시선(광선) 위에서, 이웃 관절로부터 뼈 길이만큼 떨어진 곳에 두면 지어낸 값을 안 쓴다.
Stakes if we pick wrong: 몸이 닫힌 착지 순간(꼬임을 재야 하는 바로 그때)에 먼 쪽 어깨 · 골반이 틀려 꼬임이 10° 넘게 틀릴 수 있다.
Recommendation: A because 닫힌 자세에서 가려지는 관절이 바로 꼬임의 재료라, 가장 값싼 정확도 향상이다.
Completeness: A=10/10, B=6/10
Pros / cons:
A) 믿을 만한 광선 위 · 뼈 길이로 (recommended)
  ✅ 지어낸 2D 를 깊이에 안 쓴다 — 먼 쪽 어깨 · 골반이 닫힌 자세에서 제자리
  ✅ 닫힌 꼴(2차 방정식 하나)이라 빠르고 시험하기 쉽다
  ❌ 부모 관절도 틀리면 같이 틀린다 — 부모는 두 영상에서 잘 보일 때만 쓴다
B) 계획 그대로
  ✅ 단순하다
  ❌ 가려진 쪽의 지어낸 값이 그대로 깊이가 된다
Net: 몇십 줄로 꼬임의 가장 큰 오차 원인을 뺀다.
Header: 가려진 관절
Options:
A) 믿을 만한 광선 위 · 뼈 길이로 (recommended)
한 영상 신뢰도 < 0.5 · 다른 영상 ≥ 0.7 · 부모가 두 영상 모두 ≥ 0.7 이면, 믿을 만한 광선 위에서 부모로부터 중앙값 뼈 길이인 점(가까운 근). 근이 없으면 광선 위 가장 가까운 점. 사람: 반나절 / CC: 10분.
B) 계획 그대로
가중 교차 + 뼈 방향 길이 맞춤.

State: approved
Actual answer: A) 믿을 만한 광선 위 · 뼈 길이로 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: 한 영상 신뢰도 < 0.5 · 다른 영상 ≥ 0.7 · 부모가 두 영상 ≥ 0.7 이면 믿을 만한 광선 위에서 부모로부터 중앙값 뼈 길이인 점.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R5: 위(수직) 방향의 기준
Finding: 5 · [P2] · confidence 7/10 · 이 문서 3절 6 '기준 축'("위 = 카메라 위 방향(폰을 세워 든다)") · 1절 Architecture
Plan baseline: 위 = 카메라 위 방향 · 서 있을 때 몸통으로 확인.
Runtime evidence: 폰을 아래로 숙이면(투수를 화면에 넣으려고 흔하다) 화면 위 방향이 수직에서 그만큼 기운다 — 몸통 앞 기울기에 그대로 더해진다.
두 카메라의 화면 오른쪽(x) 축은 숙임과 상관없이 수평이므로(옆으로 기울이지 않으면) 둘의 외적이 숙임에 무관한 수직이다. 코드 없음(제안).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R5 수직 추정 | 한 카메라의 위 방향 | 두 카메라 x 축의 외적(숙임 무관), 두 카메라가 30° 안으로 나란하면 위 방향 평균, 서 있을 때 몸통과 10° 넘게 다르면 경고 | 계획 그대로 |
Question D6:
D6 — 수직 방향을 어떻게 정할지
Project/branch/task: main · 3D 엔진의 기준 축 단계.
ELI10: 몸통이 앞으로 얼마나 숙었는지 재려면 '진짜 수직'이 필요하다. 폰을 조금만 숙여 찍어도 화면의 위쪽이 수직이 아니게 된다.
두 폰의 화면 가로선은 숙여도 수평이라, 둘을 엇갈려 곱하면 숙임에 상관없는 수직이 나온다.
Stakes if we pick wrong: 폰을 10° 숙여 찍으면 몸통 앞 기울기가 10° 틀린다 — 사용자는 알 길이 없다.
Recommendation: A because 숙임은 흔하고 옆으로 기울임(롤)은 드물어, 남는 오차가 한 자릿수로 준다.
Completeness: A=10/10, B=5/10
Pros / cons:
A) 두 카메라 가로축의 외적 + 서 있는 몸통 확인 (recommended)
  ✅ 폰 숙임에 무관하다 — 남는 오차는 옆으로 기울인 만큼(보통 1~3°)
  ✅ 서 있을 때 몸통과 크게 다르면 경고를 붙인다
  ❌ 두 카메라가 거의 같은 방향이면 불안정 — 그때는 위 방향 평균으로
B) 계획 그대로
  ✅ 단순하다
  ❌ 폰을 숙인 만큼 몸통 기울기가 틀린다
Net: 같은 코드 크기로 흔한 촬영 습관의 오차를 없앤다.
Header: 수직 기준
Options:
A) 두 카메라 가로축의 외적 (recommended)
U ∝ x_side × x_back(부호는 화면 위와 같은 쪽). 두 광축 사이 30° 밑이면 위 방향 평균. 니업 전 서 있는 몸통과 10° 넘게 다르면 경고 + ± 넓힘. 사람: 2시간 / CC: 5분.
B) 계획 그대로
한 카메라의 위 방향.

State: approved
Actual answer: A) 두 카메라 가로축의 외적 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: U ∝ x_side × x_back, 광축 사이 30° 밑이면 위 방향 평균, 서 있는 몸통과 10° 넘게 다르면 경고 + ± 넓힘.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R6: 좌투 샘플(e723bc) 실패 까닭 확인
Finding: 6 · [P2] · confidence 7/10 · 이 문서 1절 '좌투 1쌍 실패(옆 영상이 릴리스에서 끝나 두 영상의 구간이 다름)' · 1절 Architecture
Plan baseline: 실패 까닭 = 구간이 다름(가설). 덮임 검사로 '두 영상 모두 준비 자세~팔로스루까지' 안내.
Runtime evidence: 같은 옆 영상은 장면도 초당 11개뿐이었다(R1). 까닭이 둘 중 무엇인지(또는 둘 다) 아직 모른다.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R6 e723bc 까닭 | 가설(구간 다름) | 1단계 실제 샘플 돌리기에서 확인(새 엔진 · 열린 끝 DTW · 장면 밀도 표시), 2단계 뒤 0.25배로 다시 뽑아 한 번 더 | 확인 없이 '지원 안 함' |
Question D7:
D7 — 좌투 샘플이 왜 실패했는지 확인할지
Project/branch/task: main · 3D 엔진 1단계의 실제 샘플 돌리기.
ELI10: 좌투 샘플 하나가 시간 맞추기에 실패했다. 영상 구간이 달라서라고 짐작했지만, 장면이 너무 적었던 것도 까닭일 수 있다.
까닭에 따라 사용자에게 줄 안내가 다르다(다시 찍기 vs 그냥 다시 분석).
Stakes if we pick wrong: 잘못된 까닭으로 '다시 찍어 주세요'라고 하면 사용자가 헛수고한다.
Recommendation: A because 실제 샘플 돌리기에서 덤으로 확인되고, 2단계가 끝나면 다시 뽑기가 공짜다.
Completeness: A=10/10, B=5/10
Pros / cons:
A) 1단계 · 2단계에서 확인 (recommended)
  ✅ 장면 밀도 · 덮임 비율을 따로 보여 까닭을 가른다
  ✅ 새 엔진의 열린 끝 시간 맞추기로 '릴리스까지만' 구간도 맞출 수 있는지 본다
  ❌ 다시 뽑기는 2단계 화면이 생긴 뒤에야 된다
B) 확인 없이 지원 안 함
  ✅ 일이 없다
  ❌ 좌투 · 짧은 영상이 모두 실패로 남을 수 있다
Net: 덤으로 까닭을 갈라 안내를 맞게 한다.
Header: 실패 까닭
Options:
A) 1단계 · 2단계에서 확인 (recommended)
실제 샘플 돌리기가 장면 밀도 · DTW 덮임 · 열린 끝 결과를 따로 찍는다. 2단계 뒤 0.25배로 다시 뽑아 비교. 고치는 일은 까닭이 나온 뒤 따로. 사람: 2시간 / CC: 10분.
B) 확인 없이 지원 안 함
안내만 둔다.

State: approved
Actual answer: A) 1단계 · 2단계에서 확인 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: 실제 샘플 돌리기가 장면 밀도 · 덮임 · 열린 끝 결과를 따로 찍는다. 2단계 뒤 0.25배로 다시 뽑아 비교. 고치기는 까닭이 나온 뒤 따로.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R7: 1단계 합격 기준 — 뼈 길이 흔들림
Finding: 7 · [P2] · confidence 7/10 · 이 문서 5절 1단계 '뼈 길이 흔들림 15~25% → 7% 밑' · 2절 Code quality
Plan baseline: 모든 뼈 7% 밑.
Runtime evidence: 릴리스 근처 손목은 흐려 신뢰도가 낮다(`detect.ts:50-51` "릴리스 부근 손목은 모션 블러로 신뢰도가 낮게 나와 기준을
낮춘다", `WRIST_VIS_OK = 0.35`). 아래팔 길이는 2D 오차가 그대로 들어가 7% 는 무리일 수 있다.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R7 실제 샘플 합격 기준 | 모든 뼈 7% 밑 | 몸통 · 다리 7% · 위팔 10% · 아래팔 15% 밑(중앙값 기준 흔들림) | 모든 뼈 7% 밑 |
Question D8:
D8 — 뼈 길이 흔들림 합격 기준을 부위별로
Project/branch/task: main · 3D 엔진 1단계의 끝 기준.
ELI10: 3D 가 맞으면 뼈 길이는 시간이 지나도 같아야 한다. 그런데 공을 놓는 순간 손목은 영상에서 흐려서, 아래팔은 다른 뼈보다 원래 더 흔들린다.
같은 잣대로 재면 맞는 엔진도 불합격이 된다.
Stakes if we pick wrong: 맞는 엔진을 붙잡고 끝없이 손보거나, 반대로 느슨한 기준이 몸통 오류를 숨긴다.
Recommendation: A because 부위마다 2D 오차 크기가 달라 기준도 달라야 정직하다.
Completeness: A=10/10, B=7/10
Pros / cons:
A) 부위별(몸통 · 다리 7% · 위팔 10% · 아래팔 15%) (recommended)
  ✅ 흐림 탓인 아래팔과 엔진 탓인 몸통을 따로 본다
  ✅ 몸통 · 다리는 계획보다 느슨해지지 않는다
  ❌ 기준이 셋이라 보고가 조금 길다
B) 모두 7%
  ✅ 단순하다
  ❌ 아래팔 때문에 맞는 엔진도 떨어질 수 있다
Net: 기준을 부위의 오차 크기에 맞춘다.
Header: 뼈 기준
Options:
A) 부위별 (recommended)
흔들림 = 중앙값 절대 편차 / 중앙값. 몸통(어깨 너비 · 골반 너비 · 몸통 옆) · 다리 7%, 위팔 10%, 아래팔 15% 밑. 사람: 10분 / CC: 2분.
B) 모두 7%
계획 그대로.

State: approved
Actual answer: A) 부위별 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: 흔들림 = 중앙값 절대 편차 / 중앙값. 몸통 · 다리 7%, 위팔 10%, 아래팔 15% 밑.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R8: 폼 분석이 바뀌지 않는다는 회귀 계약
Finding: 8 · [P1] CRITICAL 회귀 · confidence 9/10 · `lib/pose/extract.ts:354`(공유 함수) · `components/pose-analysis.tsx:447`(지금 부르는 곳) · 3절 Test
Plan baseline: 회귀 계약 없음(R1 이 공유 함수에 손댄다).
Runtime evidence: `extractPoseTrack` 를 부르는 곳은 폼 분석 하나다(`grep extractPoseTrack(` — components/pose-analysis.tsx:447). 브라우저 전용
('use client', document · video)이라 노드 셀프테스트로 못 돈다.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R8 지킬 동작 | 없음 | 인자를 안 넘기면 지금과 한 줄도 다르지 않게(기본값 1 · 같은 길), tsc + 폼 분석 영상 하나를 브라우저로 돌려 장면 수 · 순간이 같은지 | 헤드리스 크롬 자동 시험(E2E) 추가 |
Question D9:
D9 — 폼 분석이 그대로인지 어떻게 지킬지
Project/branch/task: main · R1 이 고치는 공용 관절 찾기 함수.
ELI10: 3D 를 위해 관절 찾기에 '천천히 틀기' 선택을 더하면, 같은 함수를 쓰는 폼 분석이 달라지면 안 된다. 바꾸지 않은 쪽은 한 줄도
안 달라야 한다.
Stakes if we pick wrong: 폼 분석 결과가 몰래 바뀌면 사용자가 예전 영상과 비교할 때 차이가 엔진 탓인지 몸 탓인지 모른다.
Recommendation: A because 인자를 선택으로만 더하면 기본 길이 코드상 같고, 한 번 실제로 돌려 보는 것으로 충분하다.
Completeness: A=9/10, B=10/10
Pros / cons:
A) 선택 인자 + tsc + 브라우저 한 번 (recommended)
  ✅ 기본값이면 재생 속도를 안 건드린다는 것이 코드 한 줄로 보인다
  ✅ 실제 폼 분석 화면에서 장면 수 · 순간이 같은지 본다
  ❌ 자동 시험이 아니라 다음 변경 때는 다시 봐야 한다
B) 헤드리스 크롬 자동 시험
  ✅ 앞으로도 자동으로 지킨다
  ❌ 영상 · 모델 내려받기가 걸려 시험이 느리고 깨지기 쉽다(사람: 1일 / CC: 30분)
Net: 작은 변경엔 코드로 보이는 기본값 + 한 번 확인이 알맞다.
Header: 회귀 계약
Options:
A) 선택 인자 + tsc + 브라우저 한 번 (recommended)
지킬 동작: 인자 없이 부르면 재생 속도 · 길 · 결과가 지금과 같다. 의도한 차이: 실험실만 0.25배. 확인: `npx tsc --noEmit` + 폼 분석에 영상 하나(장면 수 · 니업 · 착지 · 릴리스 시각 같음). 사람: 1시간 / CC: 10분.
B) 헤드리스 크롬 자동 시험
`scripts/` 에 CDP 시험 하나. 사람: 1일 / CC: 30분.

State: approved
Actual answer: A) 선택 인자 + tsc + 브라우저 한 번 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: 지킬 동작: 인자 없이 부르면 재생 속도 · 길 · 결과가 지금과 같다. 의도한 차이: 실험실만 0.25배. 확인: `npx tsc --noEmit` + 폼 분석 영상 하나(장면 수 · 니업 · 착지 · 릴리스 시각 같음).
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R9: analysis.json 을 언제 읽을지
Finding: 9 · [P2] · confidence 8/10 · `lib/pitch-lab.ts:64-85`(샘플마다 meta.json 내려받기) · 4절 Performance
Plan baseline: 5절 2단계 '다시 열면 바로'(읽는 때를 안 정함).
Runtime evidence: `listLabSamples` 는 샘플마다 `bucket.download(.../meta.json)` 을 한다(:68). 3D 뼈대가 든 analysis.json(약 100~300KB)까지
목록에서 내려받으면 샘플 수만큼 무거워진다. 폴더 파일 목록(`bucket.list`, :67)은 이미 받으므로 '있는지'는 공짜로 안다.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R9 결과 읽기 | 없음 | 목록은 '있음'만(파일 이름), 카드가 열리면 서버 동작으로 그 샘플 것만 | 목록에서 모두 내려받기 |
| analysis.json 크기 | — | 소수 3자리 · 관절 17개 · 장면 상한 400 → 300KB 밑, 서버 동작이 900KB 넘으면 거절 | 같음 |
Question D10:
D10 — 분석 결과를 언제 불러올지
Project/branch/task: main · 3D 분석 2단계의 결과 저장 · 다시 열기.
ELI10: 결과 파일에는 3D 뼈대가 들어 있어 꽤 크다. 실험실 목록을 열 때 모든 샘플 결과를 다 받으면 샘플이 늘수록 느려진다. 목록은
'결과 있음'만 알고, 카드에서 볼 때 그것만 받으면 된다.
Stakes if we pick wrong: 샘플 20개면 목록 하나에 수 MB 를 받는다 — 폰에서 실험실이 느리게 열린다.
Recommendation: A because 이미 받는 파일 목록으로 '있음'을 알 수 있어 추가 비용이 없다.
Completeness: A=10/10, B=7/10
Pros / cons:
A) 목록은 '있음'만, 열 때 받기 (recommended)
  ✅ 목록 속도는 샘플 수와 상관없이 지금과 같다
  ✅ 크기 상한 · 반올림으로 서버 동작 본문 한도(1MB) 안
  ❌ 카드를 열 때 한 번 기다린다(수백 ms)
B) 목록에서 모두
  ✅ 카드가 바로 보인다
  ❌ 샘플 수만큼 무거워진다
Net: 목록 속도를 지키고 결과는 필요할 때만.
Header: 결과 읽기
Options:
A) 목록은 있음만, 열 때 받기 (recommended)
`LabSample.hasAnalysis`(파일 목록), 서버 동작 `loadLabAnalysis(id)` · `saveLabAnalysis(id, json)`(관리자 · UUID · 900KB 상한 · 판 번호 · 숫자 검사). 사람: 반나절 / CC: 15분.
B) 목록에서 모두
listLabSamples 가 analysis.json 도 내려받는다.

State: approved
Actual answer: A) 목록은 있음만, 열 때 받기 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: `LabSample.hasAnalysis`, 서버 동작 `loadLabAnalysis` · `saveLabAnalysis`(관리자 · UUID · 900KB 상한 · 판 번호 · 숫자 검사), analysis.json 은 소수 3자리 · 관절 17개 · 장면 상한 400.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

### R10: TODO — 실험실 관절 찾기에 heavy 모델 시험
Finding: TODO 후보 · [P3] · confidence 6/10 · `lib/pose/extract.ts:16-17`(`pose_landmarker_full` 고정) · 최종 결정(TODOS)
Plan baseline: 관절 찾기는 full 모델(폼 분석과 같음).
Runtime evidence: MediaPipe 에는 lite · full · heavy 가 있고 heavy 가 2D 가 더 정확하다고 알려져 있지만 2~3배 느리다. 폰에서 0.25배
재생과 겹치면 다시 장면을 빠뜨릴 수 있다(R1). 이 저장소에서 잰 적은 없다.
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R10 heavy 모델 | full 만 | TODOS.md 에 적고 1~2단계 뒤 데스크톱에서 같은 샘플로 비교 | 적지 않음 | 지금 만든다(실험실만 heavy) |
Question D11:
D11 — heavy 모델 시험을 할 일 목록에 올릴지
Project/branch/task: main · 3D 분석의 2D 관절 정확도.
ELI10: 관절 찾기에는 더 크고 정확한 모델(heavy)이 있다. 3D 정확도는 2D 관절 정확도에서 오기 때문에 효과가 클 수 있지만, 2~3배 느려서
폰에서는 장면을 놓칠 수 있다. 지금 넣기보다 엔진이 생긴 뒤 같은 샘플로 비교하는 편이 안전하다.
Stakes if we pick wrong: 지금 넣으면 폰 분석이 느려지고, 안 적으면 쉬운 정확도 향상을 잊는다.
Recommendation: A because 효과를 재 볼 수 있는 때(엔진 · 실제 샘플 돌리기 뒤)가 오면 바로 할 수 있게 적어 둔다.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) TODOS.md 에 적기 (recommended)
  ✅ 엔진이 생긴 뒤 같은 샘플로 full 과 heavy 를 견줘 효과를 숫자로 본다
  ✅ 지금 화면 · 폰 속도는 그대로
  ❌ 할 일 목록이 한 줄 는다
B) 적지 않음
  ✅ 목록이 가볍다
  ❌ 쉬운 정확도 향상을 잊는다
C) 지금 만든다
  ✅ 바로 정확도가 오를 수 있다
  ❌ 재 보기 전이라 폰에서 느려지고 장면을 놓칠 위험을 모르고 넣는다
Net: 재 볼 수 있을 때까지 미뤄 두되 잊지 않게.
Header: heavy 모델
Options:
A) TODOS.md 에 적기 (recommended)
What · Why · Pros · Cons · Context · Depends on 형식으로 한 줄. 사람: 10분 / CC: 2분.
B) 적지 않음
아무것도 안 한다.
C) 지금 만든다
실험실 길만 heavy 모델. 사람: 2시간 / CC: 10분.

State: approved
Actual answer: A) TODOS.md 에 적기 — 자동 결정(추천안) — 사용자의 늘 규칙 "전부 recomended로 설계하고 질문하지마"(기억 design-all-recommended-no-questions) + 만들기 허락 "어 만들어줘"(2026-10-08)
Accepted scope: TODOS.md 에 '투구 분석(3D, 베타)' 묶음을 만들고 heavy 모델 비교 한 줄(다시 볼 때 · 시작점). 코드는 안 바꾼다.
History: 2026-10-08 pending 으로 저장 · 다시 읽어 확인 → 같은 날 자동 결정.

Approval readiness: PASS — D1(B) · R1~R9(A) · R10(A), 모두 자동 결정(추천안, 위 늘 규칙 + "어 만들어줘" 2026-10-08). 회귀 계약 R8 은 따로 정함.

## 검토 1절 — Architecture

- [P1] (confidence: 9/10) `lib/pose/extract.ts:343` — `video.play().catch(() => finish());` 보통 속도로 틀고 `:320` 에서 장면마다 관절을 찾아,
  느린 기기에서 장면을 건너뛴다(e723bc 옆 71장 · 초당 11). → R1(D2 A).
- [P1] (confidence: 8/10) 이 문서 3절 3 · 5절 1단계 — 초점 거리를 합격 기준으로 둠. 두 카메라가 같은 사람을 겨누는 배치는 초점 자기 보정의
  알려진 퇴화(arXiv 2311.16304). → R2(D3 A).
- [P2] (confidence: 8/10) 3절 1 — 묶음별 좌우 고치기가 시간 단서만. → R3(D4 A).
- [P2] (confidence: 8/10) 3절 4 · 5 — 한쪽에서 가려진 관절의 깊이를 지어낸 2D 가 정함(3497cb6 의 교훈). → R4(D5 A).
- [P2] (confidence: 7/10) 3절 6 — 수직을 한 카메라의 위 방향으로. 폰 숙임이 몸통 기울기에 그대로 들어감. → R5(D6 A).
- [P2] (confidence: 7/10) 1절 — 좌투 샘플 실패 까닭이 가설. → R6(D7 A).
- 보안: 새 서버 동작 `saveLabAnalysis` · `loadLabAnalysis` 는 지금 `saveLabSample` 과 같은 틀(관리자 · `isLabId` · 자기 폴더)에 크기 상한 ·
  모양 검사를 더한다(R9 범위). 영상은 기기 밖으로 안 나간다(관절 찾기 · 3D 모두 브라우저). 실제 샘플 메모에는 선수 이름이 있어
  저장소에 올리지 않는다. 실제 샘플 돌리기는 샘플 번호만 찍는다.

```
옆 영상 ─┐                                   ┌─ 3D 보기(캔버스)
         ├ 관절 찾기(0.25배, R1) ─ 정리(중복 · 좌우) ─ DTW 시간 맞추기 ─ 덮임 검사 ─┐
뒤 영상 ─┘                                                                       │
   ┌─────────────────────────────────────────────────────────────────────────────┘
   └ 보정 1차(몸통 · 다리) ─ 좌우 고침(다시 비춤, R3) ─ 보정 2차(+초점 사전, R2) ─ 3D(가려진 관절 R4)
       ─ 다듬기 ─ 기준 축(R5) ─ 순간(옆 영상 규칙) ─ 지표 · ± · 믿음 ─ analysis.json(R9) ─ 결과 카드
```

Dispositions: R1 accepted(D2) · R2 accepted(D3) · R3 accepted(D4) · R4 accepted(D5) · R5 accepted(D6) · R6 accepted(D7).

## 검토 2절 — Code quality

- [P2] (confidence: 7/10) 5절 1단계 끝 기준 — 모든 뼈 7% 는 아래팔(릴리스 흐림, `detect.ts:50-51`)에 무리. → R7(D8 A).
- 다시 쓰기: DTW 는 `fuse3d.mjs` 의 열린 끝 판을 옮기고(기울기 제한 더함), 판 번호 표는 `lib/velocity-engine/version.ts` 모양을 따른다.
  공유 함수로 뽑을 것은 없다(구속 엔진의 `geometry.ts` 는 공 궤적용이라 계약이 다르다. 같은 이름의 수학이라도 뽑지 않는다).
- 오류 처리: 엔진은 던지지 않고 `{ ok: false, reason }`(한 줄 해요체 까닭)을 돌려준다. 화면이 그대로 보인다.

Dispositions: R7 accepted(D8).

## 검토 3절 — Test review

시험 틀: 노드 셀프테스트(`node --import ./scripts/alias-register.mjs scripts/*.mts`, 프레임워크 없음). 브라우저 전용 코드는 화면으로 확인.

```
CODE PATHS (모두 새로 — 계획한 시험)                    USER FLOWS
[+] lib/pitch-3d/analyze.ts analyzePitch3d()             [+] 실험실 '분석하기'
  ├── 정리: 중복 · 던지는 손 · 묶음 좌우                    ├── [GAP→계획] 두 영상 진행 % → 결과 카드
  │   └── [GAP→pitch3d:test] 좌우 뒤바뀜 3% · 전체 바꿈      ├── [GAP→계획] 분석 중 단추 잠금 · 화면 떠나면 취소
  ├── 시간 맞추기: DTW · 덮임                               ├── [GAP→계획] 실패 까닭 한 줄(구간 · 각도 · 사람 · 장면)
  │   ├── [GAP→pitch3d:test] 시간 늘임 · 어긋남 · 슬로모 램프 └── [GAP→계획] 다시 열면 저장된 결과
  │   └── [GAP→pitch3d:test] 옆이 릴리스에서 끝남 → 까닭     [+] 3D 보기
  ├── 보정 2패스 + 초점 사전                                 ├── [GAP→계획] 돌리기 · 재생 · 순간 표시
  │   ├── [GAP→pitch3d:test] 잡음 없음 → 각도 ±1°            └── [GAP→계획] 375px 넘침 0
  │   ├── [GAP→pitch3d:test] 광축이 만남 · 초점 20% 어긋남
  │   └── [GAP→pitch3d:test] 각도 좁음 → 경고
  ├── 3D + 가려진 관절(R4) [GAP→pitch3d:test] 먼 쪽 지어냄
  ├── 기준 축(R5) [GAP→pitch3d:test] 폰 숙임 10° · 롤 2°
  ├── 순간 · 지표 · ± [GAP→pitch3d:test] 진짜 값과 차이
  └── 직렬화 [GAP→pitch3d:test] 300KB 밑 · 모양 검사
[+] lib/pose/extract.ts { playbackRate }
  ├── [GAP→R8 CRITICAL] 인자 없음 = 지금과 같음(폼 분석)
  └── [GAP→계획] 0.25배 · 장면 밀도
[+] app/actions/pitch-lab.ts save/loadLabAnalysis
  └── [GAP→pitch-lab:test] 관리자 · UUID · 900KB · 판 번호 · 숫자
COVERAGE: 지금 0/19(새 코드) → 계획 19/19  |  [→E2E] 실험실 흐름은 로그인 · 실제 저장소가 필요해 관리자가 화면에서 확인
```

더할 시험(값 카드):
- `scripts/pitch-3d-selftest.mts`(`npm run pitch3d:test`, 단위 + 합성 끝까지)
  Value: protects=3D 지표 정확도(각도 · 보폭); fails_when=보정 · 교차 · 기준 축 · 지표 식이 틀어짐; why_new=엔진이 새로 생김; seam=none
- `scripts/pitch-lab-selftest.mts` 에 결과 검사 줄 더하기(새 파일 아님)
  Value: protects=analysis.json 신뢰 경계; fails_when=크기 · 모양 검사가 빠짐; why_new=새 서버 동작; seam=none
- R8 회귀(CRITICAL): 자동 시험 없이 tsc + 폼 분석 영상 하나(D9 A). 지킬 동작 · 의도한 차이 · 확인법은 R8 의 Accepted scope.
- 시험 계획 파일: `~/.gstack/projects/Bullpen-Log-bullpen-log/PC-main-eng-review-test-plan-20261008-112858.md`. 없앨 시험: 없음.

Dispositions: R8 accepted(D9). 나머지 GAP 은 위 계획대로 같은 단계에서 만든다(승인된 계약의 필수 증명).

## 검토 4절 — Performance

- [P2] (confidence: 8/10) `lib/pitch-lab.ts:68` — 목록이 샘플마다 meta.json 을 내려받는다. 3D 결과까지 받으면 샘플 수만큼 무거워진다. → R9(D10 A).
- 계산량(어림): 보정 = 초점 격자 약 150 × (대응 약 3,000개의 8점 + 교차) + Nelder–Mead 약 600회 × 교차 3,000 → 데스크톱 1초 안팎, 폰 수 초.
  DTW 는 장면 400 × 400 = 16만 칸. 가장 긴 것은 관절 찾기(0.25배 → 8초 영상 한쪽 약 32초).
- 메모리: 두 영상의 관절(장면 400 × 33) · 3D(장면 400 × 17) — 수 MB 밑.

Dispositions: R9 accepted(D10).

## Outside Voice

Codex 가 설치돼 있지 않다(CODEX_MODE: not_installed). 대신 쓸 수 있는 같은 모델 하위 검토도 이 세션에는 기다리는 도구(TaskOutput)가 없어
돌리지 않았다. **바깥 검토 없음(unavailable)**, 기록함. 깨끗한 검토로 세지 않는다.

## NOT in scope

- 한 대로 나눠 찍기(4단계) — 나눠 찍은 샘플이 생긴 뒤.
- 실험실 기준(마커 · KinaTrax)과 견주기(5단계) — 기준 자료가 생긴 뒤. 그전에는 '목표'다.
- heavy 모델 — TODOS.md(D11).
- 서버 계산 · DB 표 · 일반 사용자 공개 — 베타는 관리자 · 기기 안 계산 그대로.
- 렌즈 왜곡 · 주점 추정 — 화면 녹화는 잘린 정도를 몰라 화면 중심으로 둔다(원본을 받으면 다시 본다).

## What already exists

- `extractPoseTrack`(다시 씀, 선택 인자 하나 더함 — R1 · R8), `detectPitchEvents`(그대로 다시 씀 — 옆 영상 순간), `lib/pitch-lab.ts`
  (목록 · 저장 틀을 다시 씀, analysis 저장 · 읽기 더함), `app/actions/pitch-lab.ts`(관리자 확인 틀 그대로), DTW 시험판(`fuse3d.mjs` 에서 옮김).
- 새로 만드는 것: 카메라 보정 · 광선 교차 · 기준 축 · 3D 지표(이 저장소에 없음), 3D 보기(three.js 대신 캔버스, 막대 사람 하나).

## Failure modes

| 새 길 | 실제로 날 실패 | 시험 | 오류 처리 | 사용자에게 |
|---|---|---|---|---|
| 시간 맞추기 | 두 영상 구간이 다름 | 합성(옆이 릴리스에서 끝남) | 덮임 검사 → 까닭 | 보임(한 줄) |
| 관절 찾기 | 한쪽에서 사람을 놓침 | 합성(장면 빠짐) | 장면 밀도 · 덮임 → 경고/까닭 | 보임 |
| 보정 | 거울 · 엉뚱한 해 | 합성 여러 씨앗 | 다시 비춤 · 뼈 흔들림 문턱 → '보정 실패' | 보임 |
| 보정 | 초점 덜 정해짐 | 합성(광축 만남) | 보정 믿음 → ± 넓힘 · '불확실' | 보임 |
| 3D | 좌우 이름 바뀜 | 합성(뒤바뀜 3%) | 2패스 고침 | 조용하지 않음(팔 지표 믿음 낮음) |
| 저장 | 신호 끊김 · 1MB 넘음 | 크기 시험 | 결과는 화면에 남기고 '다시 저장' · 크기 상한 | 보임 |
| 폰 | 느려서 오래 걸림 | — | 진행 % · 취소 | 보임 |

critical gap(시험 없음 + 처리 없음 + 조용함): **0**.

## Worktree parallelization strategy

Sequential implementation, no parallelization opportunity. 엔진 타입이 화면 · 3D 보기의 입력이라 차례대로(엔진 → 실험실 → 3D 보기).

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~4h / CC: ~10min)** — lib/pose — `extractPoseTrack` 에 선택 인자 `{ playbackRate }` · 장면 밀도
  - Surfaced by: 1절 — `lib/pose/extract.ts:343` 장면 건너뜀(R1), 3절 R8 회귀 계약
  - Files: lib/pose/extract.ts
  - Verify: `npx tsc --noEmit` + 폼 분석 영상 하나(장면 수 · 순간 같음)
- [ ] **T2 (P1, human: ~3d / CC: ~1.5h)** — lib/pitch-3d — 엔진 5개 파일(정리 · DTW · 2패스 보정 + 초점 사전 · 가려진 관절 · 수직 · 지표 · ±)
  - Surfaced by: Scope D1, 1절 R2~R5
  - Files: lib/pitch-3d/{linalg,camera,motion,metrics,analyze}.ts
  - Verify: `npm run pitch3d:test`
- [ ] **T3 (P1, human: ~1d / CC: ~30min)** — scripts — 합성 정확도 시험(광축 만남 · 초점 20% · 잡음 · 뒤바뀜 · 가려짐 · 폰 숙임 · 구간 다름)
  - Surfaced by: 1절 R2, 3절 coverage
  - Files: scripts/pitch-3d-selftest.mts, package.json
  - Verify: `npm run pitch3d:test` 통과 · 결과 숫자를 이 문서에
- [ ] **T4 (P2, human: ~3h / CC: ~15min)** — scripts — 실제 샘플 돌리기(장면 밀도 · 덮임 · 부위별 뼈 흔들림 · 다시 비춤)
  - Surfaced by: 1절 R6, 2절 R7
  - Files: scripts/pitch-lab/run-3d.mts
  - Verify: 우투 2쌍 합격 기준 · 좌투 까닭
- [ ] **T5 (P1, human: ~1d / CC: ~40min)** — 실험실 — '분석하기' · 결과 카드 · analysis.json 저장 · 읽기
  - Surfaced by: 4절 R9
  - Files: app/(app)/videos/lab/*, app/actions/pitch-lab.ts, lib/pitch-lab.ts, scripts/pitch-lab-selftest.mts
  - Verify: `npm run pitch-lab:test` · tsc · 375px 넘침 0
- [ ] **T6 (P2, human: ~1d / CC: ~30min)** — 실험실 — 3D 뼈대 보기(캔버스)
  - Surfaced by: 3절 user flows
  - Files: app/(app)/videos/lab/skeleton-3d.tsx
  - Verify: 끌어 돌리기 · 재생 · 375px
- [ ] **T7 (P3, human: ~30min / CC: ~5min)** — 문서 — 판 번호 표 · HANDOFF(금윤호 영역) · TODOS(D11)
  - Surfaced by: 최종 결정 D11, AGENTS.md 6
  - Files: lib/pitch-3d/analyze.ts, HANDOFF.md, TODOS.md
  - Verify: 읽기

## Unresolved decisions

없음.

## Completion summary

- Step 0: Scope Challenge — scope accepted as-is(작은 배치 D1, 범위 그대로)
- Architecture Review: 6 issues found
- Code Quality Review: 1 issues found
- Test Review: diagram produced, 1 gaps identified(R8 회귀. 나머지는 계획한 새 시험)
- Performance Review: 1 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 1 items proposed to user(자동 결정 A, 적음)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex — unavailable(설치 안 됨, 하위 검토 대기 도구 없음)
- Parallelization: 1 lanes, 0 parallel / 1 sequential
- Lake Score: 8/9 = 완전성 점수가 붙은 답 9개 중 10/10 을 고른 답 8(D9 는 9/10 인 A, 자동 E2E 대신 한 번 확인)

## 정확도 검토 — 다 만들면 얼마나 맞을까(사용자 질문)

세 겹으로 본다. 앞의 둘은 이번에 숫자로 잰다(1단계 끝에 아래 '잰 값'을 채운다), 셋째는 5단계(실험실 기준)에서만 안다.

1. **기하의 한계(합성 시험)** — 엔진이 알려진 3D 를 얼마나 되찾나. 2D 관절이 완벽할 때의 바닥 오차.
2. **실제 영상의 내부 일관성** — 뼈 길이 흔들림 · 다시 비춤 오차(정답 없이 잴 수 있는 '말이 되는지').
3. **실험실 기준과의 차이** — 문헌으로 어림: 아래 표.

| 지표 | 예상 오차(다 만든 뒤) | 왜 그 정도인가 |
|---|---|---|
| 몸통 앞 · 옆 기울기(릴리스) | ±4~7° | 두 폰 마커리스(OpenCap) 하지 RMSE 4~8° · 한 카메라 투구(PitchAI) 몸통 약 6°. 수직 기준(R5)이 남는 오차의 큰 몫(폰을 옆으로 기울인 만큼) |
| 골반-어깨 꼬임(최대 · 착지) | ±8~12° | 수평 회전은 시상면보다 나쁘다(PitchAI). MediaPipe 골반 점은 진짜 고관절 중심이 아니고 골반 폭이 좁아 한쪽 3cm 오차가 약 6° |
| 앞 무릎 굽힘(착지 · 릴리스) | ±6~10° | OpenCap 무릎 4~8°, PitchAI 무릎 약 9° |
| 보폭(키 대비) | ±3~5%p | 발목 3D 오차 2~3cm + 키 어림 ±3% |
| 디딤 방향(열림 · 닫힘) | ±3%p | 뒤 카메라가 좌우를 직접 본다. 뒤 카메라가 홈 방향과 어긋나면 그만큼 |
| 팔 높이 · 어깨 벌림(릴리스) | ±8~12° | PitchAI 던지는 팔 약 12°, BlazePose 어깨 벌림 MAE 약 8°. 릴리스 흐림 |
| 어깨 외회전 최대(MER) | ±15~25°(실험) | PitchAI 어깨 외회전 최대 약 21°. 팔이 가장 빠르고 흐린 순간 |
| 착지→릴리스 시간 | 슬로모 설정을 알 때만 ±1~2 장면(240fps 면 ±4~8ms) | 장면을 빠뜨리지 않아야(R1) |

- **쓸모의 기준은 '반복성'이다**: 같은 투수 · 같은 공 5구에서 지표의 흔들림(표준편차)이 바꾸려는 크기보다 작아야 코칭에 쓸 수 있다.
  예) 꼬임을 10° 늘리는 훈련이면 흔들림이 ±5° 밑이어야 한다. 5단계에서 잰다.
- **정확도를 가장 크게 바꾸는 것(순서대로)**: ① 원본 영상(화면 녹화가 아닌 것 — 시간 · 화면 중심 · 압축) ② 두 폰 사이 60~120° · 삼각대 ·
  수평 ③ 투수가 화면 높이의 절반 넘게 ④ 240fps 슬로모. 앱 쪽에서는 R1~R5 가 이미 반영됐다.

### 잰 값(1단계 끝에 채움)

- 합성 시험: (아직)
- 실제 샘플(내부 일관성): (아직)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 3 | CLEAR(2026-10-07, 다른 계획 — AI 없애기) | mode: SCOPE_REDUCTION, 0 critical gaps |
| Outside Review | codex(plan-review) | Independent 2nd opinion | 8 | unavailable | codex 설치 안 됨 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 5 | ISSUES OPEN(지도 그린 일 — 모두 결정됨) | 9 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR(2026-10-04, 다른 계획 — 근력 프로그램) | score: 2/10 → 8/10, 28 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex · plan-review · unavailable(설치 안 됨, 2026-10-08 기록) · findings 없음. 하위 검토 대체도 돌리지 않음.
- **VERDICT:** 이 계획의 Eng Review 는 결정 10개를 모두 추천안으로 정해 '만들 일'로 바꿨다(issues_open = 지도 그린 일). eng review required(다음 검토는 만든 뒤 /review).

NO UNRESOLVED DECISIONS
