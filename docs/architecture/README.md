# 불펜로그 아키텍처 문서 (초안 v0 · 2026-10-16)

아키텍처 · 통합 책임 세션이 쓰는 문서다. 기능 세션은 공통 파일을 고치기 전에 여기를 읽는다.
**초안이다** — 사용자 승인 전에는 규칙이 아니라 제안이다. 코드는 한 줄도 바꾸지 않았다(분석만).

| # | 문서 | 내용 |
|---|---|---|
| 1 | [01-system-architecture.md](01-system-architecture.md) | 기술 스택 · 폴더 · 카테고리 · 공통 부품 · 구현 상태 |
| 2 | [02-data-flows.md](02-data-flows.md) | 카테고리별 데이터 흐름도(mermaid) |
| 3 | [03-data-model.md](03-data-model.md) | 공통 데이터 모델 · 시간 · 단위 · 이름 · 소유권 규격(제안) |
| 4 | [04-interfaces.md](04-interfaces.md) | 카테고리 사이 인터페이스 명세(제공 · 사용 · 계약 함수) |
| 5 | [05-dependencies-and-order.md](05-dependencies-and-order.md) | 기능 의존성 · 공통 파일 관리 · 개발 순서 |
| 6 | [06-integration-tests.md](06-integration-tests.md) | 통합 시험 계획 · 결과(이번 판은 실행 없음) |

## 표시

- ✅ = 통합 세션이 코드를 직접 읽어 확인함 · ◻ = 탐색 결과(파일:줄 근거는 있으나 직접 확인 안 함)
- 줄 번호는 2026-10-16 main `a70d2ecf` 기준이다. 코드가 바뀌면 어긋난다.

## 연동 문제 · 구조적 위험 (우선순위)

**P0 — 데이터가 틀리게 쌓이거나 안전 규칙이 조용히 꺼짐**

1. ✅ **[고침 96c4e5b5]** **체크인 3판 뒤 근육통 · 팔 피로 규칙이 꺼졌다.** 3판은 `soreness` · `sleepHours` · `armFatigue` 를 안 쓰는데
   읽는 곳이 10곳 넘게 남았다(`day-state.ts:364` soreSevere · `prescription.ts:477` · `theme.ts:463` · `program/load.ts:416` ·
   `armcare/routine.ts:195` …). 새 기록에서는 늘 null 이라 '근육통 심함 → 회복' 같은 규칙이 다시는 안 걸린다.
   게다가 `app/actions/checkin.ts:128` upsert 가 옛 칸을 비우지 않아, 같은 날 2판으로 적은 값이 3판 저장 뒤에도 남아 읽힌다.
2. ✅ **[고침 96c4e5b5]** **트레이닝 탭 카드의 답(운동 종류 · 부위)이 체크인 없는 날 버려진다.** `lib/report/gather.ts:179-198` 은 체크인 줄을 돌면서만
   카드 답을 합친다. 카드는 '답함'으로 보이는데 계획 · 자동 설정 · 암케어 · 중재가 못 읽는다.
3. ✅ **[고침 0fd10781 — 측정은 별개 기록 · 투구 탭 카드가 알림]** **구속 측정 저장이 늘 새 투구 기록을 만든다**(`app/actions/velocity.ts:325` `pitchLog.create`). 같은 불펜을 손으로도 적으면
   투구 수 · 부하(ACWR · 세게 던진 날)가 두 배. 저장에 멱등 키가 없어 응답이 끊겨 다시 누르면 기록 · 세션이 둘 생긴다(◻).
4. ✅ **개발 DB = 운영 DB, 배포가 마이그레이션을 걸고, 카테고리를 넘는 시험이 없다.** 한 카테고리의 변경이 다른 카테고리를
   깨도 잡을 곳이 사람 눈뿐이다(1 · 2번이 그렇게 생겼다).

**P1 — 화면마다 다른 값 · 사용자 입력이 무시됨**

5. ✅ **[고침 — 프로필 ↔ 오늘 체중 기록을 서로 씀]** **체중이 세 곳**(`User.weightKg` · `DailyNutrition.weightKg` · 옛 `DailyCheckin.bodyWeightKg`). 프로필 수정(`profile.ts:84`)은
   User 만, 영양 탭(`nutrition.ts:309`)은 DailyNutrition 만 쓴다. 읽는 쪽은 30일 안 기록을 먼저 보므로 가입 뒤 30일은 프로필 체중 수정이 영양 목표에 안 먹는다.
6. ✅ **[고침 — 판 = 약속 판 + 서버 엔진 지문(engineKeyOf), Modal 은 main 과 같음 확인]** **3D 분석 '같은 영상 다시 막기'가 고정 상수를 엔진 판으로 쓴다**(`PITCH3D_V2_VERSION = '2.0.0'`, `contract.ts:25`). 엔진을 고쳐도
   판이 안 바뀌어 한 번 실패한 영상은 영영 막힌다. ◻ Modal 에 올린 묶음이 TS 약속보다 옛것(`'pair'` 실패 코드 · `footFlat` 없음, 재배포 대기).
7. ◻ **[정함 — 그대로(근거가 달라 일부러), 통합 시험이 16 · 17세 어긋남만 지킴]** **나이 기준이 넷**: 트레이닝 성장기 <16(`plan.ts:87`) · 영양 청소년 ≤17(`nutrition/age.ts:120`) · 재활 18 · 투구 한도 성인 19.
   16~17세는 트레이닝에선 성인, 영양 · 투구 한도에선 미성년.
8. ◻ **[고침 — 화면 '아파요' 띠를 1~4 로, 엔진 문턱 그대로]** **컨디션 4 의 뜻이 둘**: 화면 띠는 4~7 '보통이에요'(`checkin.ts:946`), 엔진은 ≤4 낮은 날(`LOW_CONDITION_THRESHOLD`) → 회복 날.
9. ◻ **프로그램 날은 오늘 장비를 무시**(`program/load.ts:437` `user.ownedEquipment`). 오늘 헬스장을 꺼도 바벨이 나온다.
10. ◻ **기능 잠금이 화면 · 일부 동작에만.** `/api/pitch-log` · `saveVelocitySession` · 영양 동작 · `generateTodayPlan` · 암케어 ·
    메커니즘 동작은 잠금을 안 본다.
11. ◻ **[일부 고침 — 달력 일정 저장이 다시 그림, API 경로는 화면의 router.refresh 가 맡음, 통합 시험이 지킴]** **다시 그리기(revalidate) 누락**: `/api/pitch-log` · `logSet` · `deleteSet` · `rateWorkoutEffort` · 메커니즘 저장.
    다른 탭 · `/coach` 가 30초(`staleTimes`)까지 옛 값.
12. ◻ **운동 마치기 동시 두 번**: `finishWorkout`(`workout.ts:497`) 갱신에 `status: 'ACTIVE'` 조건이 없어 거의 동시 두 요청이면 운동 시간이 두 번 더해진다.

**P2 — 지금은 맞지만 깨지기 쉬움**

13. ✅ **[rehab-start 고침]** 날짜 키 함수가 10개 남짓 + 인라인 85곳. `rehab-start.tsx:393` 은 `new Date().toISOString()` 이라 한국 0~9시에 어제 날짜.
14. ◻ 탈퇴 때 User 관계가 없는 표(`VelocityRecording*` · `VelocityCalibRun` · `ShootCheck`)가 남고, 파일을 먼저 지워 DB 삭제가 실패하면 파일만 사라진다.
15. ◻ 오프라인 저장이 셋(localStorage outbox · IndexedDB 촬영 · IndexedDB 구속)으로 약속이 다르다.
16. ◻ 관리자 확인이 다섯 벌(`assertAdmin` ×3 · `requireAdminUser` · 인라인), `lib/dal.ts requireAdmin` 은 아무도 안 씀.
17. ◻ 아이폰 앱은 원격 사이트를 띄운다 — 웹 배포가 설치된 모든 앱 판의 네이티브 부품과 맞아야 하는데 부품 약속에 판 번호가 없다.
18. ◻ **[고침 — 색인 8개, 마이그레이션 20261016130000]** `PitchLog` 인덱스 0개 + 외래키 인덱스 빠진 표 8개(`relationMode = "prisma"` 라 지울 때 전체 훑기).
19. ◻ 구속 공 · 세션의 `engineVersion` 은 서버 상수 — 옛 탭 · 옛 앱이 잰 공이 새 판으로 찍혀 보정 짝에 섞인다.
20. ◻ 두 사람이 함께 자주 고치는 큰 파일: `velocity-screen.tsx` 4,269줄 · `app-shell.tsx` 3,120줄 · `globals.css` · `HANDOFF.md` 1,154줄.
21. ◻ 죽은 표 · 칸: `AiReport` · `PoseAnalysis`(지우기만) · `photoCalls` · `stress/mood/restingHr` · `wideClip*` · `competitionLevel`.
22. ◻ `lib/clock-server.ts:2` 가 Next 내부 경로를 import — Next 를 올릴 때 깨질 수 있다.

**보고와 달리 문제 아님(확인함)**: 3D 영상 150MB 한도 — 버킷도 150MB 로 올렸다(`pitch-lab-meta.ts:10`) ·
영양 소모가 `intensity`(1~10) 를 읽는 것 — 저장 때 % 에서 늘 같이 채워져 정밀도만 낮다.

## 사용자 결정 (2026-10-16)

- D1 근육통 · 팔 피로 → **몸 그림으로 어림**(뻐근 · 통증 부위 수, `sorenessFromParts`). 다시 묻지 않는다.
- D2 구속 측정과 손 기록 → **측정은 별개 기록**, 투구 기록을 남길 때 참고만(투구 탭 '오늘' 카드가 알림 · 그날 화면이 측정값으로 채움).
- D3 나이 → **그대로**(트레이닝 16 · 영양 17 · 투구 한도 19 — 근거가 다름). 팔 쪽만 19 로 나누는 안은 보류.
- D4 컨디션 4 → **화면 띠를 엔진에 맞춤**('아파요' 1~4). 엔진 문턱 4 그대로.
- D5 체중 → **가장 최근 기록 하나** — 프로필 수정은 오늘 체중 기록도, 영양 탭의 오늘 체중은 프로필 몸무게도 쓴다.
