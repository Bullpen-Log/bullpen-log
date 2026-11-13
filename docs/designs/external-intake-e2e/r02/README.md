# R02 격리 브라우저 시험대(2026-11-10) — 실제 lazy 3D 검토 창

실행용 코드가 아니다(.txt). 제품 diff · 배포에 들어가지 않는다. 다시 돌리는 법(맥 미니, 저장소 밖 임시 폴더에서):

1. `git archive <ref> | tar -x -C <rig>` — 커밋 그대로(.env · 미커밋 파일 없음). `node_modules` 는 작업트리 것을 `cp -cR` 로 복제(새 의존성 없음).
2. `<rig>/proxy.ts` 와 app 아래 page · layout · route 등 경로 파일을 모두 지운다(DB · 로그인 경로가 하나도 안 남게).
3. 덧붙임을 제 이름으로 놓는다: `rig-layout.tsx` → `app/layout.tsx`, `rig-intake-admin-mock.ts` → `app/actions/intake-admin.ts`(메모리 가짜 서버 동작),
   `rig-page.tsx` · `rig-state.ts` → `app/r02-rig/`, `rig-ctl-route.ts` → `app/r02-rig/ctl/route.ts`, `make-fixture.mts` → `scripts/`.
4. 합성 결과: `node --import ./scripts/alias-register.mjs scripts/r02-make-fixture.mts app/r02-rig/fixture.json`(합성 투수 → 실제 fitPitch3dV2 → toPublicView).
5. `node scan-imports.mjs <rig> app/r02-rig/page.tsx app/layout.tsx app/r02-rig/ctl/route.ts app/actions/intake-admin.ts` — Prisma · server-only · Supabase · DB 시계가 없어야 한다.
6. `run-rig.sh <rig> <out> webgl nowebgl` — `next dev` 를 127.0.0.1:3127 에 `env -i`(물려받는 환경 없음)로 띄우고, 플레이라이트 헤드리스 크로미움(1187)을
   새 프로필 · `--host-resolver-rules`(127.0.0.1 밖은 NOTFOUND)로 CDP 로 몬다. 클릭 · 키는 CDP Input. 3000 번은 쓰지 않는다.

보는 것: 청크 대기 중 꺼짐 → 결과 부품만 붙고 three 대기 중 꺼짐 → 실제 준비 뒤 켜짐 → 검토 완료가 결과 해시 · 지금 판을 보냄 → 그 번호로 공개 →
공개 중 · 옛 판은 보기만 → 낡은 검토 · 검토 필요 거절이면 창이 닫히고 공개 꺼짐 → three 청크 실패(그리기 실패)와 그 부품의 '다시' →
결과 조각 실패(창 안에만)와 '다시' → WebGL 없음. 화면 연결만 본다 — 실제 서버 권한 · Postgres 동시성 · 운영 빌드는 아니다.
