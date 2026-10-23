# 할 일: `bench`(계획 `PLAN-bench.md`)

## Task 1: 자료 목록 · 받기

**설명:** 91구(10-23 녹화 19 · 10-07/09/21 앱 클립 26 · 녹화 15 · 카메라 앱 파일 31)를 한 목록에 — 공 id · 묶음 · 나눔(확인 · 맞추기 · 진단) ·
스피드건 · 실제 거리(폰 → 망) · 영상 경로 · 공 시각(씨앗) · 조건 꼬리표. 받기는 기존 `download.mjs` · `download-recording.mjs` 를 감싼다.

**완료 조건:**
- [ ] `fixtures.json` 에 91구, 10-23 은 19구(건 17 · 미측정 2), 실제 거리 10-23 · 10-03 20.5m · 10-06 18.5m · 10-21 줄자 세션 16 · 18m
- [ ] `fetch.mjs` 가 빠진 영상만 받고(읽기만) 다 있으면 바로 끝남

**확인:**
- [ ] `node --env-file=.env scripts/velocity-bench/fetch.mjs` 두 번째 실행이 '받을 것 0'
- [ ] 목록의 경로가 모두 있음(스크립트가 셈)

**기대는 것:** 없음 · **파일:** `scripts/velocity-bench/fixtures.json` · `fetch.mjs` · `.gitignore`(engines/) · **크기:** S

## Task 2: 실행기 · 앱 규칙

**설명:** 엔진 폴더 하나로 모든 공을 ① 앱 그대로(자동 거리 · 앱 옵션) ② 실제 거리 넣고 자동 끔(PitchLab 길 — 주 판정, ±5% 로도) — 잰다. 공마다 결과 + 갈래 칸(거리 · 첫 깊이 ·
장면 수 · 끝 판정 · te · 첫 장면 시각). 앱 화면 규칙은 `app-rules.mjs` 로 옮기고 `gun-table.mjs` 도 그것을 부른다.

**완료 조건:**
- [ ] `npm run velocity:bench -- --engine=lib/velocity-engine --set=all --json=<파일>` 이 91구를 끝까지 잰다
- [ ] `--limit=3` 연기 시험이 1분 안
- [ ] `gun-table.mjs` 의 묶음별 표가 옮기기 전과 같은 숫자

**확인:**
- [ ] 같은 엔진 두 번 → 결과 JSON 이 시각 칸 빼고 같다(스크립트 `--check-repeat`)
- [ ] `node scripts/velocity-lab/gun-table.mjs --live=2026-10-21 --auto=1` 전후 같은 출력

**기대는 것:** Task 1 · **파일:** `scripts/velocity-bench/run.mjs` · `app-rules.mjs` · `scripts/velocity-lab/gun-table.mjs` · `package.json` · **크기:** M

## Task 3: 보고서

**설명:** 결과 JSON → 나눔 · 묶음 · 속도 띠(100~115 · 115~130 · 130+)별 잡음 % · 잼 % · MAE · 90% · ±3 안 % · 치우침 · ② 거리 밖 오차, 목표 대비 통과/미달,
부트스트랩 신뢰구간. 두 결과 견주기(공마다 · 묶어서). `bench-results.md` 에 판 한 줄.

**완료 조건:**
- [ ] `--compare=a.json,b.json` 이 공마다 바뀐 것만 보인다
- [ ] 목표(90% 잡음 · 80% ±3 안 · MAE 2.5)가 확인용 기준으로 통과/미달 표시

**확인:**
- [ ] 10-23 줄의 공 수 · 건 수가 현장 기록(19 · 17)과 같다
- [ ] 손으로 센 MAE(3구)와 보고서 값이 같다

**기대는 것:** Task 2 · **파일:** `scripts/velocity-bench/report.mjs` · `docs/velocity/redesign/bench-results.md` · **크기:** S

## 확인점 A
- [ ] 91구 15분 안 · 두 번 같은 결과 · 10-23 수 맞음
- [ ] 김민에게 지금 엔진 표를 보이고 다음으로

## Task 4: 옛 판 견주기

**설명:** 1.9.0 · 2.0.4 · 2.4.2 · 2.7.9 · 2.8.1 엔진을 `git archive` 로 꺼내 같은 실행기로 — 판마다 옵션 표 한 곳.

**완료 조건:**
- [ ] 다섯 판 결과가 `bench-results.md` 에 같은 꼴로
- [ ] '코드 탓인가 조건 탓인가'에 숫자로 답하는 한 문단

**확인:**
- [ ] 2.8.1 꺼낸 판 결과 = 지금 작업 트리 엔진 결과(같은 코드)

**기대는 것:** Task 3 · **파일:** `run.mjs`(판별 옵션) · `scripts/velocity-bench/engines.mjs` · **크기:** S

## Task 5: 단계별 갈래 · 거리 밖 오차 진단

**설명:** 공마다 손 떠난 때(라벨) vs 엔진 첫 장면, 망에 닿은 때 vs te, 빠진 장면, 기울기 · 공기저항 배율을 흔든 민감도. 거리 밖 9% 의 자리를 짚는다.

**완료 조건:**
- [ ] 10-23 · 10-03 공마다 '틀린 단계' 한 줄
- [ ] 진단 글 `docs/velocity/redesign/bench-findings.md`

**확인:**
- [ ] 민감도 숫자를 엔진으로 다시 재서(짐작 아님) 확인

**기대는 것:** Task 3 · **파일:** `run.mjs`(흔들기 옵션) · `bench-findings.md` · **크기:** M

## 확인점 B
- [ ] 진단 글을 김민과 봄 → `detect` · `range` · `speed` 스펙의 근거

## Task 6: 공 찾기 단계(앱 알림 · 훑기)

**설명:** 10-23 세션 녹화 통째에 앱의 훑기(공 감지 모델, `analyze-video.ts locateThrow`)와 폰 공 알림(맥 시험대 `ball-trigger`)을 돌려 던진 19구 중
찾은 수 · 헛 알림 수.

**완료 조건:**
- [ ] 녹화마다 찾음 / 놓침 / 헛 알림 표, 앱이 실제로 남긴 시도 기록과 견줌

**확인:**
- [ ] 앱 시도 기록(10-23 sweep 11 · motion 7 · seed 2)과 시험대 결과가 같은 시각대에서 맞는다

**기대는 것:** Task 3 · **파일:** `scripts/velocity-bench/detect.mjs` · **크기:** M

## Task 7: WebKit 실행

**설명:** 같은 실행기를 맥 사파리(safaridriver, WebDriver)로. 크롬 결과와 공마다 견줌.

**완료 조건:**
- [ ] 91구 WebKit 결과 · 크롬과 차이 표

**확인:**
- [ ] 같은 판 · 같은 공으로 두 브라우저 결과 차이가 보고서에

**기대는 것:** Task 2, 사파리 원격 자동화 켬(김민) · **파일:** `scripts/velocity-bench/browser-safari.mjs` · `cdp.mjs` · **크기:** M

## 확인점 C
- [ ] 스펙 성공 조건 다섯 · npm 명령 · 문 규칙이 `bench-results.md` 머리에
