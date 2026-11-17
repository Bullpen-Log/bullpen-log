# EX-LOAD01 — 승인된 저장 구조 적용 인계

2026-11-17 사용자가 김민과의 DB 작업 조율 완료 및 백업 후 적용을 명시적으로 승인했다. SQL은 `prisma/migrations/20261116150000_ex_load01_recording_contract/migration.sql`로 이동했고, 짝인 모델을 `prisma/schema.prisma`에 함께 반영한다. 이 문서 아래는 준비 당시 계약이며 현재 적용 결과는 `docs/reviews/ex-load01-r1-load-activation-20261117.md`를 따른다.

새 복구함은 개인 원래 요청을 보관하므로 같은 거래에서 RLS 기본 거부와 외부 API 역할 권한 회수를 적용한다. 기존 데이터 재작성이나 v2 기반 구조 적용은 하지 않는다. `rollback.sql`은 파괴적인 참고용이며 서비스 DB에서 실행하지 않는다. 통상적인 비활성화는 `WORKOUT_LOAD_SCHEMA`만 끈다.

---

# EX-LOAD01 — 장비 기록 계약 · 밴드 · 원래 요청 복구 — 아직 적용하지 않은 마이그레이션

이 폴더는 `prisma migrate deploy`(Vercel 빌드 포함)가 보지 않는다. **EX-LOAD01 납품은 준비만이다 — 공유(운영) DB 적용은 별도 승인.**

## 무엇이 들어 있나

| 파일 | 내용 |
| --- | --- |
| `migration.sql` | 더하기만: `UserExerciseSet.load` JSONB(세트 무게 스냅샷), `ExerciseVideo.loadSemantics` JSONB(관리자 뜻 설정), 새 표 `WorkoutLoadRecovery`(옛 앱이 보낸 맞지 않는 kg 의 원래 요청) |
| `rollback.sql` | 새 칸 · 표를 지우는 되돌리기 — **데이터를 잃는다**. 보통은 스위치를 끄는 것으로 충분하다 |
| `schema-additions.prisma` | 위 SQL 과 짝인 Prisma 조각. 적용하는 커밋에서 `prisma/schema.prisma` 에 합친다 |

## 스위치

- `WORKOUT_LOAD_SCHEMA=1` 일 때만 코드가 새 칸 · 표를 읽고 쓴다(`lib/workout/load/server.ts loadStructured`, v2 `runOwn` 도 같은 값).
- 꺼져 있으면(지금): 새 칸 이름이 든 SQL 을 한 번도 보내지 않는다. 밴드 · 섞인 무게 · 서로 다른 무게 · 기구 이름은 화면이 '업데이트 뒤에'로 안내하고, 옛 앱의 요청은 예전 쓰기 그대로다(출시 차단 항목 — 아래).
- 켜면: 세트 · 스냅샷 · 원래 요청 복구가 한 거래(`app/actions/workout.ts logSet`, v2 `set.record/set.correct`, 코치 `writeOrgWork`). 실패하면 거래를 되돌리고 오류를 **던진다**(옛 대기열은 던진 오류면 남긴다).

## 관리자 뜻 설정 `ExerciseVideo.loadSemantics` (EX-LOAD01 R1-04 — 코드 납품, 적용 전)

- 모양: `{ v: 1, overrides: { bandRole?, use?, fixedSupport?, weightedVariation?, e1rm? }, note?, by?, at? }` — `lib/workout/load/semantics.ts`.
  기록 칸(무게 · 밴드 · 횟수)은 여전히 고른 장비가 저절로 정한다. 여기서는 장비만으로 안 정해지는 예외만 고친다.
- 앞서는 차례(한 층이 통째로 정한다 — 칸마다 섞지 않는다): **잠근 코드 예외**(`overrides.ts` `locked`) > **저장된 loadSemantics** >
  **잠그지 않은 코드 예외** > **장비 기본값**. 잠근 운동은 저장값을 보지 않고 관리자 쓰기를 `LOCKED` 로 거절한다.
  모르는 판 · 모양 · 칸은 계약 `unresolved`(reason `semantics-unsupported`) — 맨몸 · 1RM 가능 근력으로 짐작하지 않고, 잠그지 않은 코드 예외로 내려가지도 않는다.
- 읽기: 스위치가 켜졌을 때만 `lib/library-cache.ts` 가 따로 캐시한 `SELECT "id","loadSemantics" … WHERE "loadSemantics" IS NOT NULL` 을 운동 줄에
  싣는다(`allExercises` — 꺼낼 때마다 스위치를 본다). 지금 장비 계약(`server.ts currentContracts` · `frozen.ts contractOfLibraryRow`)이 쓴다.
  꺼져 있으면 그 칸 이름이 든 SQL 을 보내지 않고, 스키마를 합쳐 생성 클라이언트가 칸을 고른 뒤에도 꺼진 동안은 줄에서 뺀다.
- 쓰기: `app/actions/content.ts` 운동 등록 · 수정(관리자만). 폼이 뜻 설정 칸을 건드렸을 때만 보낸다. 권한 · 스위치(`SCHEMA_OFF`) · 잠금 ·
  장비와 맞는지(맞지 않으면 무엇을 고칠지 한국어로)를 DB 전에 보고, 운동 줄과 같은 거래에서 `UPDATE "ExerciseVideo" SET "loadSemantics" = …`.
  저장 뒤 `clearLibraryCache()`(같은 이름표)로 목록 · 뜻 설정 캐시를 함께 비운다.
- 이미 얼린 판 · 목표 · 세트는 그 판에 찍힌 계약을 쓰므로 바뀌지 않는다. **앞으로 얼리는 판**은 저장값을 함께 얼린다 — `lib/workout/session-plan.ts
  freezeExercise` 가 `overrides: overridesFor(ex.id, (ex as { loadSemantics?: unknown }).loadSemantics),` 로 이미 이어져 있다(통합 담당이 넣음,
  `lib/workout/load/overrides.ts` 가 판을 거르고 모르는 판은 해석하지 않고 코드 예외로). 저장값은 스키마를 켠 서버의 라이브러리 줄에만 실리므로,
  스키마 적용 · 스위치 전에는 실제로 코드 검토 표만 얼린다. 실제 freezer 경로(저장 · 잠금 우선, 모르는 판, 얼린 이력 보존)는 R1 관리자 자체 시험과
  독립 검수 실행(10/0)으로 확인했다 — 실제 스키마 적용 · 실기기 확인은 아니다.
- 앱(Expo)의 화면 쪽 계산(`native/src/org/lines.tsx`)과 웹 폼 미리보기 밖의 클라이언트 계산(`components/load/set-load.ts`,
  `components/master/team-event.tsx`)은 저장값을 모르고 코드 표만 쓴다 — 서버가 얼린 계약을 넘기는 길(R1-03)이 권위다.

## 적용 차례 (AGENTS.md 2번)

1. 김민 · 공통 스키마 담당과 맞춘다(공유 DB 구조 변경). v2 보류 마이그레이션과 차례를 정한다(서로 기대지 않는다).
2. `npm run backup`.
3. 사용자 · GPT 서브1 · 총괄의 적용 허락(EX-LOAD01 납품은 아님).
4. **같은 커밋에서** `git mv` 로 이 폴더를 `prisma/migrations/` 로 옮기고, `schema-additions.prisma` 를 `prisma/schema.prisma` 에 합친 뒤 `npx prisma generate`.
   - 스키마만 먼저 합치면: 생성된 클라이언트가 없는 칸을 골라(`allExercises` 의 findMany 등) 지금 읽기가 깨진다.
   - 마이그레이션만 먼저 옮기면: 다음 `prisma migrate diff` 가 새 칸 · 표를 지우라고 낸다.
5. main 에 올리면 빌드가 공유 DB 에 적용한다. 로컬 `prisma migrate dev` · `db push` · `migrate reset` 금지.
6. 적용 뒤에도 **스위치는 꺼져 있다**. 확인(아래 리허설 · 실제 DB 읽기 확인)을 마친 뒤 `WORKOUT_LOAD_SCHEMA=1` 을 켠다.

## 리허설 (격리 — 공유 DB 아님)

`node --import ./scripts/alias-register.mjs scripts/load-contract-selftest.mts` — 격리 PGlite 에 지금 스키마(prisma/migrations) + v2 보류 SQL + 이 SQL 을 올리고,
실제 `logSet` 거래 경로(세트 · 스냅샷 · 원래 요청 복구)와 v2 명령 경로를 돌린다. 되돌리기 SQL 을 적용한 뒤 옛 줄이 그대로인지도 본다.
PGlite 는 백엔드가 하나라 연결 사이 잠금 경합 · Supabase 거래 풀러는 증명하지 않는다 — 적용 전에 격리 Postgres 로 따로 본다.

`node --import ./scripts/alias-register.mjs scripts/load-r1-admin-selftest.mts` — 관리자 뜻 설정(R1-04): 순수 검사 · 앞서는 차례 · 읽지 못하는 판,
그리고 격리 PGlite(스키마 미적용 · 이 SQL 적용 둘)에서 실제 `createExercise` · `updateExercise` 동작, `allExercises` 캐시 길, `currentContracts`,
`deleteUserCompletely` 거래를 돈다. 꺼진 DB 에서는 DB 로 가는 모든 바이트에 `loadSemantics` · `WorkoutLoadRecovery` 가 없는지 본다.

## 출시 차단 항목 (코드 납품 ≠ 출시 준비)

- 스키마 미적용 동안 옛 앱(약속 번호 없는 요청)이 맨몸 운동에 보낸 kg 은 **예전 쓰기 그대로** 옛 칸에 남는다(새 정규화를 했다고 확인하지 않는다 — 답에 loadAck 없음). 읽기 관문이 얼린 계약으로 계산에서 뺀다. 정식 '횟수 · 시간만 + 원래 요청 복구'는 이 마이그레이션 적용 + 스위치 뒤에만.
- 인벤토리(R1-04 다시 셈): **캐시 다시 셈**(2026-11-16 읽어 둔 459줄을 지금 해석기 · 코드 검토 표로 —
  `scripts/load-contract-inventory.mts --recompute=…`)은 externalMass 141 · none 155 · band 96 · indicatedLoad 33 · implementMass 32 ·
  **combined 1**(밴드 저항 데드리프트, 검토 예외) · **unresolved 1(숨김 — 싱글렉 케틀벨 교대 + 밴드 흔들기)**. 처음 인벤토리의 unresolved 2 는
  combined 예외를 넣기 전 값이다. 보이는 운동의 unresolved 는 0. 이것은 **새로 읽은 인벤토리가 아니다** — 출시 전에 공유 DB 를 읽기 전용으로
  다시 읽어(`node --env-file=.env … load-contract-inventory.mts`, 켠 뒤라면 `WORKOUT_LOAD_SCHEMA=1` 로 저장된 뜻 설정까지) 같은지 확인해야 한다.
  라이브러리 줄을 바꿔 숫자를 맞추지 않는다.
- 보이는 밴드 운동 82개는 역할을 세트마다 고른다(저항 · 보조 · 모름) — 관리자 뜻 설정 전에는 '모름'이 견줌 · 진행 열쇠가 없다.
- 1RM 허용 목록 밖의 운동을 % 방식 칸에 고정한 근력 프로그램 — 기준 무게(TM)가 없어 숫자 없이 안내한다. 캐시 다시 셈에서 본운동 후보 가운데
  보이는 15개(케이블 넷 · 버티기 둘 · 받침 봉 인버티드 로우 · 더한 무게 중량 푸시업 · 허용 목록 밖 자유 중량 일곱 — 고릴라 로우 · 덤벨 푸시 프레스 ·
  덤벨 풀오버 · 랜드마인 셋 · 이센트릭 RDL)가 1RM 없음. 출시 전 실제 회차 고정 목록과 맞춰 볼 것(`blockers.programMainLiftWithoutE1rm`).
- 계정 지우기: `lib/delete-user.ts` 가 스위치가 켜졌을 때만 같은 마지막 거래에서 회원 줄 바로 앞에 `DELETE FROM "WorkoutLoadRecovery" WHERE "ownerId" = …`
  (`loadRecoveryCleanup`). 대신 적은 사람(actorId)으로만 남은 남의 줄은 남긴다. 꺼져 있으면 그 표 이름이 든 SQL 을 보내지 않는다.
- 앞으로 얼리는 판의 뜻 설정 반영은 이미 이어져 있다(`session-plan.ts freezeExercise`, 위 절). 남은 출시 관문은 코드가 아니라 실제 스키마 적용 ·
  스위치 · 실기기 확인 · 출시 직전 새 재고 다시 셈(위 459줄 수치는 캐시 다시 셈 — 서비스 DB 를 새로 읽은 값이 아니다) · 프로그램 회차 자격 확인이다.
