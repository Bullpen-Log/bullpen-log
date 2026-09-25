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

## 4. 패치노트는 저절로 쌓인다 — 커밋 메시지를 잘 적자

관리자 → 패치노트에 **누가 · 어느 날 무엇을 고쳤는지**가 한 장씩 쌓인다. 손으로 적는 곳이 아니라 깃 기록에서 가져온다. `git push` 할 때 훅(`.githooks/pre-push`)이 `scripts/sync-patch-notes.mjs` 를 돌려 맞춘다.

- **커밋 제목이 곧 패치노트 제목이다.** 상대방이 목록에서 보는 한 줄이라 '수정', 'fix' 같은 말보다 무엇을 했는지 적는 편이 쓸모 있다.
- **커밋 본문에 '왜'를 적으면 상세 화면에 그대로 뜬다.** 나중에 되짚을 때 가장 도움이 되는 글이다.
- 한 장은 **한 사람의 하루치**다. 그날 한 커밋이 모두 한 장에 담긴다.
- 훅은 무슨 일이 있어도 `push` 를 막지 않는다. 못 맞췄으면 나중에 `npm run patch:sync` 로 다시 맞추면 된다. 처음부터 전부 다시 읽으려면 `npm run patch:sync -- --all`.
- 훅은 `npm install` 할 때 저절로 연결된다(`package.json` 의 `prepare`). 안 걸렸으면 `git config core.hooksPath .githooks`.
- 상세 화면의 **메모**만 사람이 적는 칸이다. 다시 맞춰도 메모는 지워지지 않는다. 받은 뒤에 할 일(예: `npx prisma generate`)을 여기 적어 두면 상대방이 본다. 상대방의 **Claude** 가 알아야 하는 것은 6번의 `HANDOFF.md` 에 적는다.

## 5. 서버 위치는 서울(icn1)

`vercel.json` 의 `"regions": ["icn1"]` 은 지우지 않는다. DB(Supabase)가 서울(ap-northeast-2)에 있어서, 화면을 만드는 서버도 서울에 있어야 한다. Vercel 의 기본값은 미국 워싱턴(iad1)인데, 그러면 화면 하나를 만들 때마다 미국 서버가 서울 DB 를 태평양 건너 여러 번 오가서(한 번에 약 0.2초) 탭 하나 옮기는 데 1초 가까이 걸렸다. 같은 화면을 서버가 DB 가까이 있을 때 재 보면 0.06초면 된다.

지역이 맞는지는 응답 머리의 `x-vercel-id` 로 본다 — `icn1::icn1::…` 이면 서울, `icn1::iad1::…` 이면 미국에서 돌고 있다.

## 6. 상대방에게 남기는 말은 `HANDOFF.md` 에 — Claude 가 알아서 읽는다

두 사람 다 Claude 로 작업한다. 받은 쪽이 해야 할 일(`npm install`, `npx prisma generate`, 환경변수 추가 등)이나 상대방 영역의 파일을 고친 사실을 말로만 전하면 빠뜨린다. `HANDOFF.md` 에 적어 두면 `CLAUDE.md` 가 그 파일을 불러오므로, 상대방의 Claude 가 작업을 시작할 때 저절로 읽는다.

- **푸시할 때**: 상대방이 받은 뒤 해야 할 일이 있거나 상대방 영역의 파일을 고쳤으면, `## <받는 사람>에게 — 날짜 · 보낸 사람` 아래에 적어 같은 푸시에 싣는다. 무엇을 왜 고쳤는지는 짧게 쓰고 자세한 건 커밋 번호로 가리킨다.
- **작업을 시작할 때, 그리고 `git pull` 로 새 커밋을 받은 뒤**: `git config user.name` 으로 누가 작업하는지 본다(`Kim Min` = 김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 있으면 다른 일보다 먼저 사용자에게 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다. pull 로 `HANDOFF.md` 가 바뀌었으면 다시 읽는다 — 세션을 시작할 때 읽은 것은 옛 내용이다.
- **처리한 뒤**: 그 말을 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.
- 4번의 패치노트 메모는 사람이 관리자 화면에서 보는 곳이고, 이 파일은 Claude 가 읽는 곳이다. 급한 것은 둘 다 적어도 된다.
