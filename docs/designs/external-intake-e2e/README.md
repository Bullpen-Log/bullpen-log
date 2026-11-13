# 외부 접수 격리 브라우저 시험대

운영 DB · 저장소를 쓰지 않고 공개 흐름과 관리 흐름을 끝까지 돌린 도구입니다. 맥북의 임시 폴더에서 돌렸고, 다른 컴퓨터에서 쓸 수 있게 옮겨 두었습니다. 저장소의 시험 · 타입 검사에 섞이지 않게 모두 `.txt` 를 붙였습니다.

- `flow.mjs` 공개 흐름 · `admin.mjs` 관리 흐름(헤드리스 크로미움을 CDP 로 몬다)
- `e2e-harness.mts` PGlite + 가짜 TUS 저장소 + 가짜 GPU(공개 흐름)
- `iso-seed.mts` · `iso-state.mts` · `iso-swap-pub.mts` · `iso-model-state.mts` 관리 흐름 시드와 상태 조작
- `iso-login.route.ts` 격리 복사본에서만 쓰는 시험 로그인 경로. **저장소 `app/` 에 넣지 않습니다.**
- `run-env.sh` · `start-pub.sh` · `sync*.sh` 복사본에 동기화하고 서버를 켜는 스크립트
- `run-tests.sh` 시험을 차례로 돌리는 스크립트
- `rig-public.sh` · `rig-admin.sh` 공개 · 관리 시험대를 앞에 띄우는 스크립트(맥 미니에서 씀)

쓰는 법:

1. `.env` 없는 복사본을 만듭니다: `/tmp/intake-rig/intake-e2e/clone`. 경로는 이 이름을 가정합니다.
2. 파일 끝의 `.txt` 를 떼고 복사본의 `scripts/` 와 시험대 폴더에 둡니다.
3. 포트 3101 · 3010 · 54329 · 54398 · 54399 를 씁니다. 3000 번은 쓰지 않습니다.
4. 접수 마이그레이션은 `prisma/pending-migrations` 에 있습니다. 공개 시험대는 거기서 읽습니다.

그대로 돌아가는지는 다른 컴퓨터에서 확인하지 않았습니다. 경로나 포트가 맞지 않으면 고쳐서 씁니다. 모든 값은 로컬 전용 가짜 값입니다.

## 지운 접수 화면 보기(2026-11-07 맥 미니)

`flow.mjs` · `admin.mjs` 는 플레이라이트의 헤드리스 크로미움(`~/Library/Caches/ms-playwright`)이 있어야 돕니다. 맥 미니에는 없어서 이번에는 안 돌렸습니다. 대신 시험대를 띄우고 앱 안 브라우저로 눌러 봤습니다.

공개 쪽:

1. `.env` 없는 복사본을 만듭니다: `git archive HEAD` 를 `intake-e2e/clone` 에 풀고 `cp -cR node_modules`, `e2e-harness.mts` 를 `clone/scripts/` 에 둡니다. `lib/prisma.ts` 의 `max: 8` 은 `max: 1` 로 고칩니다(PGlite 는 연결 하나).
2. `rig-public.sh` 를 켭니다.
3. `curl 'http://127.0.0.1:54398/__/gone'` 이 실제 삭제 코드로 지운 접수를 만듭니다. 답의 `token` 으로 `http://localhost:3101/submit#<token>` 을 엽니다. `?mode=deleting` 은 지우는 중, `?analysis=succeeded` · `failed` 는 분석 상태를 바꿉니다.
4. `/__/correct2?id=<submissionId>` 로 글만 고쳐 달라고 해도 지운 칸이 요청에 들어가는지, 파일 없이 내면 그 칸에서 막는지, 새 파일로 내면 2판이 생기고 시계가 다시 도는지 봅니다.

관리 쪽:

1. 복사본에 `prisma/pending-migrations` 의 접수 폴더를 `prisma/migrations` 로 복사합니다(복사본에서만).
2. `iso-seed.mts` 를 `scripts/` 에, `iso-login.route.ts` 를 `app/api/iso-login/route.ts` 로 두고 `rig-admin.sh` 를 켭니다.
3. `http://127.0.0.1:3010/api/iso-login?id=11111111-1111-4111-8111-111111111111` 로 들어갑니다. 쿠키는 포트를 안 가려서, `localhost` 로 열면 3000번의 실제 로그인을 덮습니다. 꼭 `127.0.0.1` 로 엽니다.
4. 시드의 `지운접수` · `지우는접수` · `분석끝지움` · `고침지움` 을 봅니다.

앱 브라우저가 숨어 있으면 스트리밍 화면이 '불러오는 중'에 멈춘 듯 보입니다. 화면을 찍으면 이어집니다.

## 공개 흐름 돌리기(2026-11-09 맥 미니 · 87f48b01 + 고침 전 작업 트리)

플레이라이트의 헤드리스 크로미움이 `~/Library/Caches/ms-playwright/chromium_headless_shell-1187/chrome-mac/headless_shell` 에 있다. `flow.mjs` 가 이 경로를 쓰고, 다르면 `INTAKE_E2E_CHROME` 으로 바꾼다. 포트는 3101 · 54398 · 54399 와 크로미움 CDP 9347 만 쓴다. 3000 번 · 운영 DB · 운영 저장소는 안 건드린다.

1. 시험대를 만든다: `zsh docs/designs/external-intake-e2e/make-pub-rig.sh.txt` — 작업 트리(커밋 안 한 고침 포함)를 `.env` 없이 `/tmp/intake-rig/intake-e2e/clone` 에 풀고, `node_modules` 를 APFS 복제하고, `lib/prisma.ts` 의 `max: 8` 을 복사본에서만 `max: 1` 로 바꾸고, `.txt` 를 뗀 시험대 파일을 둔다. 끝에 `.env.example` 만 보이는지 찍는다.
2. 켠다: `cd /tmp/intake-rig/intake-e2e && ./start-pub.sh` (시험대 → `submit 200` 이 찍히면 준비됨).
3. 돌린다: `node flow.mjs` — 전부(약 6분). 이름을 쉼표로 주면 그것만 돈다: `node flow.mjs journey,midcut`.
4. 끈다: `./stop-pub.sh` — 3101 · 54398 · 54399 가 비었는지 찍는다.
5. 작업 트리를 고친 뒤에는 1번부터 다시 하거나, 켠 채로 `rsync -a --exclude='.env*' app components lib proxy.ts prisma scripts package.json package-lock.json <작업 트리> → clone/` 뒤 `max: 1` 을 다시 고친다. 시험대 파일을 고쳤으면 `./stop-pub.sh && ./start-pub.sh` 로 다시 켠다(메모리 DB 라 자료가 사라진다).

시험대(`e2e-harness.mts`)가 더한 조작 — 모두 `http://127.0.0.1:54398/__/...`:

| 이름 | 하는 일 |
|---|---|
| `invite?code=` | 결과 접근 코드가 걸린 초대 |
| `cut?n=&min=&times=` | `min` 자리 이후 조각을 `n` 바이트 받고 끊는다. 브라우저가 끊긴 요청을 한 번 저절로 다시 보내므로 `times=3` 이어야 TUS 재시도(HEAD)가 돈다. `n=0` 은 끄기 |
| `hashdelay?ms=` | 서버 검증의 전체 읽기(범위 없는 GET)를 늦춰 '확인하고 있어요' 화면을 붙잡는다 |
| `tuslog?sub=` | 객체마다 POST · HEAD · PATCH(자리 · 길이 · ok/cut/aborted) · GET 기록 |
| `stall-headers` · `stall-body` | 응답 머리를 안 보냄 · 머리와 본문 일부만 보내고 끝내지 않음. 브라우저 쪽이 CDP Fetch 로 요청을 여기로 돌린다 |
| `reissue?id=` | `reissueInvitationToken`(새 링크, 예전 토큰 즉시 막힘) |
| `failures?id=&n=` · `codestate?id=` | 접근 코드 틀린 횟수 넣기 · 읽기 |
| `withdraw?id=` | `withdrawRequiredConsent`(담당자가 남긴 필수 동의 철회) |
| `repurge?id=` | 지우기가 끊긴 접수를 실제 저장소로 다시 지운다(남은 원본 목록을 돌려줌) |
| 고정 파일 `side2` · `rear2` | 옆 · 뒤와 크기가 같고 바이트가 다른 영상(다른 파일을 이어 붙이지 않는지 본다) |

`flow.mjs` 의 새 시나리오(브라우저 쪽은 CDP `Fetch` 로 응답 머리 멈춤 · 본문 멈춤 · 응답 버리기 · 응답 붙잡기를 만든다. 제품에 시험용 훅은 없다):

| 이름 | 보는 것 |
|---|---|
| `journey` | 접수(확인 중) → 서버 검증 끝 → 분석 중 → 분석 끝 · 공개 전 → 공개. 화면마다 머리 · '지금 상태' 줄이 다르다 |
| `midcut` | 전송 중 끊김: POST 한 번 · HEAD 뒤 끊긴 자리부터 · 0 부터 다시 안 보냄 · 바이트 합 = 크기 · SHA |
| `revisit` | 새로고침 뒤 같은 파일 = 6MB 자리부터 이어 감 / 다른 파일(같은 크기) = 새 자산 · 0 부터 · 옛 자리 안 끝남 · 얼린 원본 SHA = 새 파일 |
| `finalize` | 완료 응답 잃음(서버는 얼림) → 같은 영수증 · 판 하나 / 완료가 계속 안 닿다 다시 열고 '접수 마치기' 세 번 → 완료 요청 한 번 · 판 하나 |
| `stall` | 첫 상태 읽기 · 보내기 중 초안 저장이 머리 멈춤 · 본문 멈춤 → 20초 시한 뒤 다시 시도 화면 · 적은 내용 그대로 · 다시 시도로 끝까지 |
| `cancel` | 칸 잡기 응답을 붙잡은 채 멈추기 / 화면 떠나기 / 파일 확인 중 떠나기 → 전송 · 완료 0 → 이어서 · 다시 와서 끝까지 |
| `access` | 틀린 토큰 · 폐기 · 기간 끝 · 접근 코드(틀림 · 맞음 · 10번째 잠금 · 잠긴 뒤 맞는 코드 403) · 새 링크(예전 링크 막힘 · 새 링크로 같은 접수) |
| `revise` | 고침 요청(뒤 영상 · 이름) → 보낸 파일 다시 고르면 막음 → 새 파일로 판 2 / 동의 판 바뀜 → 다시 동의 / 모델 동의 거두기 / 필수 동의 철회 |
| `gone` | 지운 접수 · 분석 끝난 뒤 지운 접수 · 지우기 실패(지우는 중) → 다시 지우기. 받는 사람에게 분석을 약속하지 않는다 |

결과(2026-11-10 새벽): 기존 시나리오 58개 + 새 시나리오 96개 = **154개 통과, 0개 실패**(`node flow.mjs`, 약 6분 30초). 같은 작업 트리에 다른 세션이 관리 쪽을 고친 뒤 복사본을 다시 맞추고 `happy,result,journey,access` 를 다시 돌려 50개 통과. 제품 코드는 고치지 않았다(고칠 것이 드러나지 않았다).

한계: 가짜 TUS · 가짜 GPU(합성 결과) · 메모리 PostgreSQL 이다. 실제 Supabase TUS · iPhone Safari · 1GiB 원본 · 실제 GPU 를 통과했다는 뜻이 아니다. 파일 확인(해시) 중 화면 떠나기는 34MB 가 0.2초쯤에 끝나 칸 잡기 전후 어디서 끊겼는지는 매번 다를 수 있다(결과는 '전송 · 판 없음'만 본다).

## 관리 흐름 돌리기(2026-11-10 맥 미니 · 87f48b01 + 고침 전 작업 트리)

공개 시험대를 먼저 끈다(`./stop-pub.sh`). 포트는 3010 · 3101 · 54329 · 54398 · 54399 와 크로미움 CDP 9348 만 쓴다. 3000 번 · 운영 DB · 운영 저장소는 안 건드린다. 모든 값은 가짜다(`admin-env.sh` · `start-admin.sh`).

1. 시험대 파일을 `.txt` 를 떼어 둔다:
   `mkdir -p /tmp/intake-rig/intake-e2e/admin && cd docs/designs/external-intake-e2e && for f in admin-ext.mjs admin.mjs admin-harness.mts iso-login.route.ts iso-seed.mts iso-state.mts iso-swap-pub.mts iso-model-state.mts make-admin-rig.sh start-admin.sh stop-admin.sh restart-3010.sh admin-env.sh; do cp $f.txt /tmp/intake-rig/intake-e2e/admin/$f; done; chmod +x /tmp/intake-rig/intake-e2e/admin/*.sh`
2. 만든다: `zsh /tmp/intake-rig/intake-e2e/admin/make-admin-rig.sh` — 작업 트리(커밋 안 한 고침 포함)를 `.env` 없이 `clone/` 에 풀고, `node_modules` 를 APFS 복제, `max: 1`, 접수 마이그레이션을 복사본의 `prisma/migrations` 로, 시험 로그인 경로 · 시험대 스크립트를 복사본에만 둔다. 같은 것을 `clone-nr/`(접수 표 없는 DB 용)로 복제한다. 끝에 두 복사본에 `.env.example` 만 있는지 찍는다.
3. 켠다: `cd /tmp/intake-rig/intake-e2e/admin && ./start-admin.sh` — `admin-harness.mts` 한 프로세스가 PGlite A(54329, 접수 표 + iso-seed 시드 + 김서준 원본 바이트 · 큰파일대기 · 담당경합), PGlite B(54399, 접수 표 없음), 가짜 저장소 + 가짜 GPU(54398, GPU 는 `/gpu`)를 띄운다. 그다음 `next dev` 둘: 3010(A, `INTAKE_PUBLIC_ORIGIN=http://127.0.0.1:3010` · 가짜 GPU · `CRON_SECRET` · `INTAKE_ALLOW_DRAFT_ANALYSIS=1`), 3101(B). `3010 submit 200` · `3101 submit 200` 이 찍히면 준비됨(첫 컴파일 1~2분).
4. 돌린다: `node admin-ext.mjs` — 110개, 약 3분 10초. 이름을 쉼표로 주면 그것만: `node admin-ext.mjs perm,ready`. 따로 돌릴 때 앞 시나리오 값(링크 등)은 `ctx.json` 으로 넘어간다. 기존 46개는 `node admin.mjs`(iso-seed 만 쓰는 시험대에서 잰다 — 아래 '기존' 줄).
5. 정식 출시 단계의 권한: `./restart-3010.sh INTAKE_ALLOW_DRAFT_ANALYSIS=1 RELEASE_STAGE=released && node admin-ext.mjs perm` (DB 는 그대로). 되돌릴 때 `./restart-3010.sh INTAKE_ALLOW_DRAFT_ANALYSIS=1`.
6. 끈다: `./stop-admin.sh` — 5개 포트가 비었는지 찍는다.

로그인은 `http://127.0.0.1:3010/api/iso-login?id=<사용자>&role=<역할>`(복사본에만 있는 경로). 늘 `127.0.0.1` 로 연다(쿠키는 포트를 안 가려서 `localhost` 로 열면 3000 번의 로그인을 덮는다).

`admin-harness.mts` 의 조작(`http://127.0.0.1:54398/__/...`): `sql?q=`(SELECT 만, PGlite A) · `seedsha`(김서준 원본 SHA) · `objects?sub=` · `gpulog` · `log` · `fixture?f=side|rear` · `run?id=`(같은 접수에 성공한 실행을 하나 더 — 공개 경합용). 가짜 GPU 는 `POST /gpu/jobs` 를 받으면 서명 주소로 원본 둘을 내려받고 합성 3D 결과를 서명 올리기 주소로 PUT 한다. 분석 상태는 크론(`/api/cron/intake`, `Bearer e2e-cron-secret`)이 30초 뒤 묻는다.

`admin-ext.mjs` 시나리오:

| 이름 | 보는 것 |
|---|---|
| `closeprobe` | 새 링크 창이 뜬 뒤 '닫기'를 진짜 마우스로 누를 때 닫히는가(곧바로 · 3초 뒤) |
| `perm` | 대표관리자만 접수함 · 만들기. 일반 · 준관리자는 브라우저 · HTTP 둘 다 돌려보내고 자료 0. 화면 밖에서 서버 동작(만들기 · 새 링크 · 원본 주소)을 직접 POST 해도 막히고 DB 변화 0. 같은 호출을 대표관리자가 하면 된다(대조) |
| `ready` | 접수 표 없는 DB(3101): 준비 안 됨 안내 · 목록 자리 안내(오류 화면 아님) · 초대 만들기 꺼짐 · 서버 동작 `intake_not_ready` |
| `create` | 링크 = 설정 주소 · 개발용 표시(제목 · 칸 이름 · 경고, 복사 단추 없음) · 한 번만 보임 · 두 번 제출 = 초대 하나 · 응답 잃음(CDP 로 답을 끊음) → 같은 키로 다시 누름 = 같은 초대 · 링크만 바뀜 · 감사 줄 · 토큰 원문이 DB · 감사 · 서버 로그에 없음 |
| `reissue` | 확인 창 · 새 링크 한 번 · 예전 토큰 즉시 `invitation_invalid` · 새 토큰 열림 · 감사 줄 · 폐기 → `invitation_revoked` · 단추 사라짐 |
| `waiting` | 큰 파일 검증 대기: 중립색 · 시도 횟수 없음 · 다시 확인 → 차례 당김 |
| `gone` | 지운 · 지우는 · 분석 끝난 뒤 지운 · 고침 열린 지운 접수 상세와 목록 |
| `download` | 원본 내려받기 · 짝 내려받기 — 받은 파일과 서명 주소의 SHA-256 = 시드 원본, 감사 줄, 감사에 주소 · 토큰 없음 |
| `pipeline` | 3010 공개 링크로 보내기 → 서버 검증(SHA = 보낸 파일) → 손 · 국외 이전 확인 → 분석(가짜 GPU) → 크론 → 공개 전 링크는 검토 중 → 3D 검토 뒤에만 공개 단추 → 공개 → 공개 링크에 결과 · 설명 · 3D → 내리기 → 결과 API `result_not_published` · 화면에서 사라짐 |
| `race` | 두 관리자(두 브라우저 문맥): 담당 · 공개 대 내리기 · 새 링크 — 하나만 이기고 진 쪽에 낡았다는 글, DB 한 번만 바뀜 |

결과(2026-11-10): 기존 `admin.mjs` **46개 통과, 0개 실패**(iso-seed 시험대). `admin-ext.mjs` 전체 **110개 통과, 0개 실패**(새 시험대, 3분 8초). 정식 단계(`RELEASE_STAGE=released`) `perm` **16개 통과**(일반 · 준관리자 HTTP 는 200 + `NEXT_REDIRECT`, 접수 자료 0), 베타 단계 `perm` 16개 통과(HTTP 307). 베타 단계에서 화면 밖 서버 동작 직접 호출은 출시 관문(`FEATURE_LOCKED_BETA`)이 500 으로 막고, 정식 단계에서는 `requirePermission` 이 `/today` 로 돌려보낸다. 둘 다 DB 변화 0.

이번에 고친 제품 버그: 접수 표 없는 DB 에서 `/admin/intake` 가 오류로 넘어갔다 — 목록이 안 읽은 접수를 날 SQL 로 먼저 세는데(`unreadIds`) 날 SQL 의 표 없음은 P2021 이 아니라 P2010 이라 `loadList` 가 못 잡았다. `lib/intake/admin.ts isMissingTableError` 가 P2010(드라이버 어댑터 `TableDoesNotExist` · `ColumnNotFound`, PostgreSQL 42P01 · 42703)도 보고, 화면이 그 함수를 쓴다. 회귀 시험은 `scripts/intake-admin-selftest.mts`(781개 통과).

남은 관찰: 새 링크 창(상세의 '새 링크 만들기')이 뜬 직후 약 1초 동안은 '닫기'를 눌러도 안 닫힌다(`closeprobe`: 곧바로 누르면 두 번째 누름 뒤 약 1.4초에 닫힘, 3초 뒤 누르면 한 번에 닫힘). 개발 서버에서만 본 것이라 정식 빌드에서 다시 봐야 한다. 초대 만들기 창은 곧바로 닫힌다.

한계: 가짜 저장소 · 가짜 GPU(합성 결과) · 메모리 PostgreSQL · 개발 서버다. 실제 Supabase · Modal GPU · 정식 빌드 · Vercel 크론을 통과했다는 뜻이 아니다. 공개 링크 화면은 공개 · 내리기를 스스로 다시 묻지 않아 새로고침해야 바뀐다(시험은 새로고침으로 본다).
