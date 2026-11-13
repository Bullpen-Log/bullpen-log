# 외부 접수 큰 파일 검증 — 실행 예산과 측정

2026-11-09 · 금윤호(Claude). 검토 `external-intake-review-2026-11-09.md`의 '대용량 검증이 서버 실행 시간을 넘길 가능성'을 다룬다.
**실제 1GiB 파일이 운영에서 실패한 것을 본 적은 없다.** 아래는 막는 장치와 이 맥에서 잰 숫자다. 실제 Supabase 업로드 · 다운로드와 Vercel 실행 시간은 재지 않았다.

## 무엇이 문제였나

- 검증(`service.ts verifyAsset`)은 원본 전체를 저장소에서 내려받으며 SHA-256 을 잰다(`storage-core.ts hash`). 파일 한도는 1GiB 다.
- 크론(`/api/cron/intake`, `maxDuration = 300`)은 가벼운 일 · 보유 삭제를 먼저 하고 검증을 3개까지 했다. 시간 예산이 없어서 함수가 300초에 잘리면
  임대가 10분 동안 남았다가 풀리고, 다음 크론이 해시를 처음부터 다시 읽으며 **시도 횟수만 하나 썼다**. 같은 일이 8번이면 일감이 실패로 멈춘다.
- 해시 읽기에 끊는 신호가 없어 함수가 잘리기 전에 손을 놓을 방법도 없었다.

## 바꾼 것

| 자리 | 내용 |
|---|---|
| `lib/intake/limits.ts` | `INTAKE_CRON_MAX_DURATION_SEC` 300 · `INTAKE_JOB_SAFETY_MARGIN_MS` 30초 · `INTAKE_CRON_BUDGET_MS` 270초 · `VERIFY_MIN_BYTES_PER_SEC` 8MiB/초 · `VERIFY_FIXED_OVERHEAD_MS` 10초 · `VERIFY_MAX_BUDGET_ABORTS` 3 · `VERIFY_PARK_MS` 24시간 · `VERIFY_WORKER_LEASE_MS` 60분 · `VERIFY_PROBE_MIN_LEFT_FRACTION` 0.8 · `INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC` 300 · `VERIFY_BUDGET_NOTE_PREFIX` · `isVerifyBudgetNote` |
| `lib/intake/jobs.ts` | `JobBudget`(끝낼 시각 · 벽시계 · signal · 어림 · 건너뛸 때 글) · `budgetFor` · `JobDeferred` · `deferJob` · `peekDueJobs` · `leaseJobs` 의 `ids`. `runDueJobs` 가 `budget` 을 받으면 시각을 지킨다. 처리기는 `(job, ctx)` 로 signal 을 받는다. 요약에 `deferred` |
| `lib/intake/storage-core.ts` | `hashStream`(조각마다 signal 확인 · 끊기면 몸통 취소 · `signal.reason` 을 던짐 · `onBytes`). `hash` 가 이것을 쓴다 |
| `lib/intake/service.ts` | `verifyAsset` 에 선택 인자 `{ signal, onHashBytes }` — 끊기면 판정을 적지 않고 `signal.reason` 을 던진다. 자산은 `verifying` 에 남는다 |
| `lib/intake/job-handlers.ts` | 크론 검증 처리기(`verifyHandler`) · 어림(`estimateVerifyMs`) · 관리자 글(`VERIFY_BUDGET_NOTES`) · `runIntakeCron(rt, { budget, verifyBytesPerSec })` · 검증 작업자 `runIntakeVerifyWorker` |
| `app/api/cron/intake/route.ts` | `maxDuration = 300` 그대로(설정은 글자 그대로라 상수와 따로 적고 시험이 견준다) |

동작:

1. **시작 전 어림** — 크론은 검증 일감을 빌리기 전에 `고정 10초 + 크기 ÷ 읽기 속도`를 어림한다. 남은 시간보다 크면 **빌리지 않는다**.
   시도 횟수 · 차례(runAfter)가 그대로라 다음 크론에서 먼저 집힌다. 그 뒤의 작은 파일은 들어가면 한다. 가벼운 일(분석 묻기 · 등록 · 정리 · 삭제)은 그대로 돈다.
2. **해시 중 끊기** — 크론 예산 시각(시작 + 270초)에 signal 이 끊긴다. 해시가 몸통 읽기를 취소하고 손을 놓는다(아래 측정: 끊긴 뒤 2ms).
   일감은 `JobDeferred` 로 줄에 되돌아가고 **시도 횟수를 돌려받는다**. 자산에 `verified` · `rejected` 를 적지 않고 감사 기록도 남기지 않는다.
   다음 시도는 처음부터 다시 읽는다(해시 중간 상태를 저장하지 않아 이어 읽기는 없다).
3. **끝없는 되풀이 막기** — 끊길 때 실제로 읽은 속도를 일감 payload(`observedBytesPerSec`)에 남긴다. 다음 어림은 짐작 속도와 잰 속도의 80% 중 느린 쪽을 쓴다.
   **잰 속도는 마지막 끊김에서 24시간까지만 믿는다**(2차 검토 고침) — 저장소가 잠깐 느렸던 한 번이 그 파일을 영영 '너무 큼'으로 막지 않게.
   끊김이 3번 쌓이면 크론은 그 파일을 24시간 시작하지 않고 '검증 작업자를 기다려요'로 둔다. 그래서 같은 1GiB 읽기가 5분마다 헛도는 일이 없다.
   하루 쉬는 동안은 일감의 차례(runAfter)도 그 하루 끝으로 민다 — 쉬는 큰 파일이 줄 앞을 막아 그 뒤의 작은 파일이 영영 안 보이는 일이 없게.
   예산 차례는 본 줄을 빼고 다음 쪽을 이어 본다(한 실행에 100개까지 어림).
3-1. **어림만으로 영영 안 읽는 파일 막기** — 짐작 속도로도 빈 크론 한 번보다 크다고 어림한 파일은, 하루 안에 끊긴 적이 없고 이번 실행이 거의 비었으면
   (남은 시간이 예산의 80% 이상, `VERIFY_PROBE_MIN_LEFT_FRACTION`) 한 번 읽어 본다. 끊기면 그때 잰 속도가 남고 하루 쉰다. 그래서 하루에 한 번까지만 읽는다.
3-2. **끊김과 진짜 실패를 가른다** — signal 이 끊긴 뒤라도 오류가 끊김 그 자체(`signal.reason` · AbortError)일 때만 기다림으로 센다.
   파일 없음 · 읽기 실패 · DB 오류는 진짜 까닭을 남기고 실패로 센다.
4. **관리자에게 보이는 글** — 건너뛰거나 끊긴 일감의 `lastError` 칸에 `검증 대기:` 로 시작하는 글을 남긴다(실패가 아니라 기다림).
   - `검증 대기: 큰 파일이라 다음 실행에서 이어 확인해요.`
   - `검증 대기: 크론 한 번에 확인하기엔 큰 파일이에요. 검증 작업자가 이어 확인해요.`
   - `검증 대기: 시간 안에 다 읽지 못해 다음 실행에서 처음부터 다시 확인해요.`
   - `검증 대기: 시간 안에 다 읽지 못한 일이 거듭돼 검증 작업자를 기다려요.`
   끝나면 `completeJob` 이 글을 지운다. 임대가 늙은 채 'running' 에 남은 큰 파일(함수가 잘린 앞 일꾼)도 건너뛸 때 줄로 되돌리며 같은 글을 남긴다.
   관리자의 '다시 확인'(`service.ts requeueVerification` → `jobs.ts requeueJob`)은 기다리는 검증도 다시 건다 — 끊긴 횟수 · 잰 속도를 지우고 곧바로 차례에 세운다.
5. **멱등 · 겹침** — 끝난 자산의 `verifyAsset` 은 정산만 하고 읽지 않는다. 임대는 `FOR UPDATE SKIP LOCKED` 라 한 일꾼만 빌린다. 임대 밖에서 두 검증이 겹쳐도
   판정은 `status = 'verifying'` 조건부 쓰기라 한 번만 적힌다(시험으로 확인).
6. **무결성 검사는 그대로다** — 크기 · 해시가 브라우저 값과 다르면 예산과 상관없이 막는다. 큰 파일이라고 해시를 건너뛰지 않는다.

## 이 맥에서 잰 값

`node --import ./scripts/alias-register.mjs scripts/intake-hash-bench.mts` (Apple M6 · node v26.12.0 · 2026-11-09). 파일은 `os.tmpdir()/intake-bench` 에 만들고 지웠다.
해시는 앱과 같은 길(`createIntakeStorage().hash()` → 가짜 fetch 가 디스크 파일을 응답 몸통으로 줌 → `hashStream`)이다. 막 쓴 파일이라 디스크 캐시에서 읽었다 — **CPU 의 SHA-256 + 웹 스트림 처리 속도이고 네트워크가 아니다.**

| 크기 | 해시(앱 길) | MB/초 | 해시(node 스트림만) | MB/초 | 머리 읽기 | 범위 요청 · 바이트 | 프로세스 RSS 최고 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 100MB | 0.06초 | 1,636 | 0.05초 | 1,921 | 3.2ms | 6 · 772B | 223MB |
| 500MB | 0.16초 | 3,151 | 0.14초 | 3,450 | 2.3ms | 6 · 772B | 253MB |
| 1GiB | 0.33초 | 3,264 | 0.31초 | 3,468 | 2.3ms | 6 · 772B | 253MB |

- 머리 읽기(`lib/intake/media.ts readIntakeMediaFacts`)는 크기와 상관없이 범위 요청 6번 · 772바이트다(가짜 MOV: ftyp · mdat · 뒤의 moov). 실제 아이폰 MOV 의 moov 는 더 크다 — 그래도 MB 단위 아래다.
- RSS 는 크기가 10배가 돼도 거의 그대로다 — 파일을 통째로 쥐지 않고 흘려 읽는다.
- 예산 흉내: 30MB/초로 늦춘 몸통을 해시하다 1,500ms 에 끊었더니 1,504ms 에 손을 놓았다(끊긴 뒤 2.1ms, 그때까지 45.1MB 읽음).
- 이 맥은 SHA-256 하드웨어 명령이 있다. Vercel 함수의 CPU 는 재지 않았다 — 하드웨어 SHA 가 없는 CPU 면 수백 MB/초까지 떨어질 수 있지만, 그래도 아래 원격 속도보다 빠를 가능성이 크다(추정).

## 원격 속도 가정과 300초

검증 시간 ≈ 고정 10초 + 크기 ÷ 내려받기 속도. 예산은 300 − 30 = 270초다. 크론은 그 앞에 가벼운 일을 먼저 하므로 검증에 남는 시간은 이보다 적다.

| 내려받기 속도(가정) | 100MB | 500MB | 1GiB | 빈 크론 한 번에 1GiB |
|---|---:|---:|---:|---:|
| 8MiB/초(앱 짐작 `VERIFY_MIN_BYTES_PER_SEC`) | 21.9초 | 69.6초 | 138초 | 1개 |
| 30MB/초 | 13.3초 | 26.7초 | 45.8초 | 5개 |
| 60MB/초 | 11.7초 | 18.3초 | 27.9초 | 9개 |
| 120MB/초 | 10.8초 | 14.2초 | 18.9초 | 14개 |

크론은 한 번에 검증을 3개까지만 빌린다(`VERIFY_PER_RUN`). 위의 '개수'는 예산만 본 값이다.

- 짐작 8MiB/초는 일부러 낮게 잡았다. 이 값에서도 1GiB 한 파일(138초)은 빈 크론 한 번에 들어간다. 그래서 지금 한도(1GiB)에서는 '크론 한 번에 못 끝낼 파일' 안내가 짐작만으로는 뜨지 않는다.
  실제로 끊긴 속도가 더 느리면 그 속도로 어림해 그때 뜬다.
- 짐작이 낮으면 손해는 '한 크론에 덜 한다'뿐이다(다음 5분 크론이 잇는다). 짐작이 높으면 시작한 뒤 끊기고 다시 읽는다 — 그래서 낮게 둔다.
- 실측 뒤에는 Vercel 환경변수 `INTAKE_VERIFY_MIN_BYTES_PER_SEC` 로 맞춘다(코드를 고치지 않아도 된다).

## 추천

1. **지금 한도 1GiB 는 크론 검증으로 유지한다.** 예산 · 끊기 · 쉬게 두기로 '잘려서 횟수만 쓰다 멈추는' 길은 닫혔다.
2. **실측을 먼저 한다**(출시 전): 운영과 같은 지역(icn1)의 Vercel 함수에서 같은 버킷의 100MB · 500MB · 1GiB 를 `hash()` 로 내려받아 시간을 잰다.
   잰 속도의 절반쯤을 `INTAKE_VERIFY_MIN_BYTES_PER_SEC` 로 둔다. Supabase 저장소 내려받기 요금(egress)도 같이 본다 — 검증은 원본 크기만큼 한 번 내려받는다.
3. **한도를 1GiB 위로 올리려면** 크론 검증을 그대로 두지 말고 검증 작업자를 붙인다(아래). 짐작 8MiB/초에서 크론 한 번에 들어가는 상한은 약 2.0GiB 다(270초 − 10초).
4. 실측 속도가 1GiB 를 270초 안에 못 읽을 만큼 느리면 둘 중 하나: 지원 한도를 잰 속도 × 200초 정도로 내린다, 또는 검증 작업자를 상시로 돌린다.

## 검증 작업자(크론 밖)

`lib/intake/job-handlers.ts runIntakeVerifyWorker(rt, { owner, limit })` — 검증 일감만, 예산 없이, 임대 60분으로 돈다. 쉬게 둔 큰 파일도 끝까지 읽는다. 같은 `verifyAsset` 이라 무결성 검사가 같다.
아직 **실행 진입점이 없다**(이번 작업에서 package.json 을 고치지 않았다). 붙이는 길:

- 맥 · 상주 서버의 스크립트: `appIntakeRuntime()` 으로 rt 를 만들고 `runIntakeVerifyWorker` 를 몇 분마다 부른다. 운영 DB · 저장소 열쇠가 필요하다 — 사람이 승인한 곳에서만.
- Modal 함수(이미 3D 분석에 쓰는 곳): 같은 일을 정해진 시간마다. 함수 시간 제한을 1시간 이상으로.
- 어느 쪽이든 크론과 같은 일감 표를 빌리므로 둘이 같이 돌아도 한 파일을 두 번 판정하지 않는다.

## 시험

- `node --import ./scripts/alias-register.mjs scripts/intake-budget-selftest.mts` — PGlite + 가짜 저장소. 2차 검토 고침도 본다: 느린 속도가 하루 뒤엔 안 막음 ·
  빈 크론의 한 번 읽어 보기 · 쉬는 16개 뒤의 작은 파일 검증 · 늙은 임대의 기다림 글 · 끊긴 뒤 진짜 실패는 실패로 셈 · 관리자 다시 확인 · `runVerifySoon`. 시간이 모자라면 시작 안 함 · 횟수 그대로 · 관리자 글,
  해시 중 끊기면 판정 없이 되돌리고 횟수를 돌려줌(시도 1번 남은 일감도 안 멈춤), 다음 실행이 끝냄, 끝난 자산의 재검증은 아무것도 안 함, 두 일꾼 중 하나만 읽음,
  임대 밖 동시 검증도 판정 하나, 3번 끊기면 쉬고 작업자가 끝냄, 바뀐 파일은 예산과 상관없이 막힘, storage-core 해시가 signal 에 멈추고 연결을 놓음, 라우트 maxDuration = 상수(크론 · 공개 둘),
  공개 API 올리기 확인 → 응답 뒤 검증이 예산 규칙으로 돌아 이 파일을 끝내고 쉬는 파일은 안 빌림(6-8), 관리자 기다림 글에서 같은 말 빼기.
- `npm run intake:admin-test` 6-1b — 기다리는 검증은 차례가 지나도 '검증 대기'(멈춤 · 재시도 아님), 오류 칸은 비우고 글은 기다림 칸에, '다시 확인'으로 지금 차례로 당김, 임대가 끝난 도는 일은 멈춤,
  차례 · 손길(updatedAt)이 한 시간 넘게 지난 기다림은 멈춤(크론이 죽었을 때 — '다시 확인' 대신 크론 안내). 예산 시험이 크론의 건너뛰기가 updatedAt 을 새로 찍는지 본다.
- `app/(app)/admin/intake/[id]/detail.selftest.mts` — `JobStateLine` 이 기다림을 오류 색 없이 · 시도 칸 없이 보이고, 덧붙일 사정만 머리말 없이 보인다.
- `scripts/intake-hash-bench.mts` — 위 숫자.

## 재지 않은 것

- 실제 Supabase TUS 업로드 · 저장소 내려받기 속도, Vercel 함수(icn1)의 CPU · 네트워크 · 실제 300초 제한 동작.
- 실제 아이폰 MOV(큰 moov) 머리 읽기 시간.

## 남은 일

- (끝남) 관리자 상세: 줄에서 `검증 대기:` 글로 기다리는 파일 확인은 `jobStateOf` 가 `'waiting'`(검증 대기 · 큰 파일이라 다음 실행에서 이어 확인해요)으로 보인다 —
  차례가 지나도 '멈춤' · '재시도'가 아니고, 오류 칸(`lastError`)은 비우고 글을 `note` 에 둔다. `canRequeueJob` 이 그 줄에도 '다시 확인'을 연다. 도는 중에 임대가 끝난 일은 기다림 글이 있어도 '멈춤'이다.
  상태 줄 부품은 `detail-client.tsx JobStateLine`(오류 색 없음 · 시도 칸 없음 · 덧붙일 사정만 `jobWaitNoteText`).
  **아직**: `detail-manage.tsx JobIssuesPanel` 은 자기 상태 줄을 그려 `note` 를 안 보이고, `page.tsx` 칸 제목이 '멈춘 일감'이다 — 그 둘을 `JobStateLine` · 중립 제목으로 바꿔야 덧붙일 사정(검증 작업자 기다림)이 화면에 나온다.
  크론이 죽으면 기다림이 조용히 숨지 않게, 차례와 마지막 손길(크론이 건너뛸 때마다 글을 다시 써 `updatedAt` 이 찍힌다) 둘 다 한 시간(`JOB_WAIT_STALL_MS`, 크론 열두 바퀴) 넘게 지나면 '멈춤'이다.
  그때는 글을 오류 칸에 붉게 두고 '다시 확인'을 닫아 '크론이 도는지 확인해 주세요' 안내가 나온다. 하루 쉬는 일은 차례가 미래라 쉼이 끝나고 한 시간까지 기다림이다.
  한계: 한 실행이 어림하는 일감은 `MAX_PEEK`(100)개까지라, 기다리는 검증이 그보다 많이 밀리면 뒤쪽은 크론이 살아 있어도 멈춤으로 보일 수 있다.
  **아직(다른 파일)**: 공개 라우트 두 곳(`app/api/intake/public/assets/confirm/route.ts` · `finalize/route.ts`)의 머리 주석이 '못 끝내면 임대가 풀려 크론이 이어 받는다'로 옛 동작을 말한다 —
  지금은 예산(라우트 시간 − 30초 − 이미 쓴 시간) 안에 못 끝낼 파일은 시작하지 않거나 끊어 시도 횟수 없이 크론에 넘긴다(`runVerifySoon`). 동작은 맞고 `maxDuration = 300` 도 상수와 같다.
- (끝남) 공개 라우트의 `after()` 검증은 `runVerifySoon({ db, storage, now }, { startedAtMs })` 로 돈다 — `startedAtMs` 는 라우트가 요청을 받은 벽시계 시각이다.
  Next 의 `after()` 는 그 라우트의 `maxDuration`(요청부터) 안에서만 돌아서, 남은 시간 = `INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC`(300) − 여유 30초 − 이미 쓴 시간이다. 두 공개 라우트(올리기 확인 · 접수 완료)의 설정이 그 상수와 같은지 시험이 본다.
  `service.ts intakeCoreJobHandlers` 의 `verify_asset` 도 실행의 signal 을 해시에 잇는다(앱 길은 예산 처리기로 덮어 쓰지 않는다).
- 검증 작업자의 실행 진입점.
