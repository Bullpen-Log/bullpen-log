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
