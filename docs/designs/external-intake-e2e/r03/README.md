# R03 격리 브라우저 시험대(2026-11-13) — 이름 · PIN · 원본 · 수동 3D 결과

실행용 코드가 아니다(.txt). 제품 diff · 배포에 들어가지 않는다. 운영 DB · 저장소 · 비밀 값을 쓰지 않는다(값은 모두 로컬 가짜).

## 조립(저장소 밖 임시 폴더)

1. 공개 시험대: `git archive <ref> | tar -x -C <rig>` → `cp -cR <작업트리>/node_modules <rig>/` → `lib/prisma.ts` 의 `max: 8` 을 `max: 1`(PGlite 연결 하나) → `r03-harness.mts` 를 `<rig>/scripts/` 에.
   `r03-harness.mts` 는 R02 이전의 `e2e-harness.mts` 에 다음을 더했다: 서버가 직접 쓰는 올리기(supabase-js upload, 수동 결과 파일), `/__/import`(합성 결과로 묶음을 만들어 `adminImportManualResult`, `mode=mismatch|stale`),
   `/__/reset`(이름 · PIN 지우기), `/__/pinstate`, `/__/download`(관리자 내려받기 주소로 받은 바이트의 해시), `/__/manifest`.
2. `rig-public-start.sh` — `env -i` 로 물려받는 환경 없이 하네스(메모리 PostgreSQL 54399 · 가짜 저장소 54398)와 `next dev`(127.0.0.1:3127)를 켠다.
3. 관리자 시험대: 공개 시험대 복사본에 대기 마이그레이션을 `prisma/migrations` 로(복사본에서만), `iso-login.route.ts`(../iso-login.route.ts.txt) → `app/api/iso-login/route.ts`,
   `iso-seed.mts`(../iso-seed.mts.txt + `iso-seed-r03.diff.txt` — 한 접수의 받는 사람이 이름 · PIN 을 정한 상태), `r03-make-result.mts` 로 `public/r03-result.json`(합성 투수 → 실제 `fitPitch3dV2`).
   `rig-admin-start.sh` — 메모리 PostgreSQL 54329(전체 스키마) + `next dev` 127.0.0.1:3128. 저장소는 공개 시험대의 가짜 저장소(54398)를 같이 쓴다.

## 본 것(앱 안 브라우저, 공개 375×812 · 관리자 데스크톱)

- 공개: 이름 · PIN 정하기(두 PIN 다름 안내) → 촬영 안내(꼭 / 되면 좋음) → 이름 미리 채움 → 옆 · 뒤 원본(파일 칸에 가짜 MOV 바이트) → 확인 목록 → 동의 → 보내기 → 접수증.
  하네스의 `/__/download` 로 고른 파일 · 브라우저 해시 · 서버 해시 · 관리자 내려받기 바이트가 같은지 봤다. 공개 전 결과 404(`result_not_published`), 공개 뒤 3D 결과와 승인 설명,
  '이 기기에서 나가기' → 틀린 PIN(일반 오류, 누적 1) → 맞는 PIN → 결과, 공개 내리기 뒤 404. 브라우저 저장소 · 기록에 PIN 없음, 세션 쿠키는 스크립트가 못 읽음.
- 관리자: 받는 사람 칸(이름 · 틀린 횟수 · 세션), 매니페스트 받기(비밀 없음), 3D 결과 가져오기(실제 파일 칸 → 서버 동작) → 3D 결과 검토 → 검토 완료 → 공개. GPU 분석이 막힌 상태에서.

## 한계

앱 안 브라우저 창이 가려져 있어 화면 전환 움직임을 끈 스타일을 넣고 찍었다. Chromium 기반 · 개발 서버 · 메모리 DB 라 실제 아이폰 사파리 · 안드로이드 · 실제 Supabase TUS · 운영 빌드 · 실제 Postgres 동시성 · 실기기 파일 고르기(사진 앱 · 원본 내보내기 메뉴)는 보지 않았다.
