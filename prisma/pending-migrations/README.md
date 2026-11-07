# 아직 적용하지 않은 마이그레이션

여기 있는 폴더는 `prisma migrate deploy` 가 보지 않습니다. 브랜치 푸시의 Vercel 미리보기 빌드도 `prisma migrate deploy` 를 돌려서, `prisma/migrations` 에 두면 공유 DB 에 표가 생길 수 있어 밖에 두었습니다.

적용할 때 차례(AGENTS.md 2번):

1. 김민에게 알립니다.
2. `npm run backup` 을 돌립니다.
3. 사용자 허락을 받습니다.
4. `git mv prisma/pending-migrations/20261106120000_external_intake prisma/migrations/` 를 합니다.
5. main 에 올리면 Vercel 빌드가 공유 DB 에 적용합니다. 로컬에서 `prisma migrate dev` · `db push` · `migrate reset` 은 쓰지 않습니다.

접수 시험은 두 폴더를 모두 찾으므로 옮긴 뒤에도 그대로 돕니다.
