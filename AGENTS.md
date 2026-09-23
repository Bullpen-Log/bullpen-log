<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 두 사람이 함께 개발할 때 — DB 규칙

이 저장소는 두 사람이 각자 컴퓨터에서 함께 개발한다. 그리고 **개발할 때 쓰는 DB가 실제 서비스 DB와 같다.** Supabase 프로젝트가 하나뿐이라, 내 컴퓨터에서 바꾼 것이 곧바로 상대방 컴퓨터와 실제 사이트(bullpen-log.vercel.app)에 반영된다. 아래 세 가지는 사람이든 AI 도구든 반드시 지킨다.

## 1. `prisma migrate dev` 는 절대 실행하지 않는다

이 명령은 DB 상태가 내 컴퓨터의 마이그레이션 파일과 조금만 달라도 "DB를 초기화할까요? 모든 데이터가 사라집니다"라고 묻는다. 여기서 예를 누르면 운동 라이브러리를 포함한 모든 데이터가 지워진다. 상대방이 먼저 적용한 마이그레이션을 아직 안 받았을 때 특히 잘 일어난다. 같은 이유로 `prisma db push`, `prisma migrate reset` 도 쓰지 않는다.

DB 구조는 이렇게만 바꾼다.

1. `prisma/schema.prisma` 를 고친다
2. 바뀔 SQL 을 만든다: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
3. 그 SQL 을 `prisma/migrations/<YYYYMMDDHHMMSS>_<이름>/migration.sql` 로 저장한다
4. 적용한다: `npx prisma migrate deploy` 다음 `npx prisma generate`

## 2. DB 구조를 바꿀 때는 한 명씩, 미리 말하고, 백업부터

**DB 구조 변경이란** 표나 칸을 새로 만들거나, 지우거나, 이름을 바꾸는 것이다. `prisma/schema.prisma` 가 바뀌고 `prisma/migrations/` 에 새 폴더가 생기는 작업이 여기에 해당한다. 화면·문구·동작만 고치는 것, 데이터(줄)를 넣고 지우는 것은 구조 변경이 아니다.

- **시작 전에 상대방에게 알린다.** 둘이 동시에 구조를 바꾸면 마이그레이션이 엇갈린다.
- **백업부터 한다:** `npm run backup`. 저장소 바깥(`~/bullpen-log-backups`)에 저장되며 회원 정보가 들어 있으니 공유하거나 깃에 올리지 않는다. Supabase Pro 요금제가 매일 자동으로 백업해 7일 보관하지만, 바꾸기 직전 상태는 이것으로만 남는다.
- **추가는 안전하다.** 새 표, 새 칸은 상대방 코드를 깨뜨리지 않는다. 단 새 칸에는 기본값(`@default`)을 주거나 비워 둘 수 있게(`?`) 만든다. 그래야 그 칸을 모르는 상대방 코드가 줄을 새로 넣을 때 실패하지 않는다.
- **지우기·이름 바꾸기는 상대방 코드를 그 순간 깨뜨린다.** 상대방과 맞추고, 그 칸을 쓰는 코드를 먼저 정리해 올린 뒤에 한다.
- **마이그레이션이 든 코드를 main 에 올리면 Vercel 빌드가 이 DB 에 바로 적용한다** (`package.json` 의 `build` 에 `prisma migrate deploy` 가 들어 있다). 미리보기(브랜치) 빌드도 같은 DB 를 쓰도록 설정돼 있으면 마찬가지다.
- 구조를 바꾼 뒤에는 상대방에게 "받아서 `npx prisma generate` 하라"고 알린다.

## 3. 같이 쓰는 내용은 지우기 전에 말한다

운동 라이브러리(운동·드릴·영상)와 Supabase 저장소의 영상 파일은 하나뿐이다. 한 사람이 지우면 둘 다, 그리고 실제 사이트에서도 없어진다. 테스트는 각자 자기 테스트 계정으로 하고, 테스트 데이터를 지울 때는 그 계정 것만 지운다.
