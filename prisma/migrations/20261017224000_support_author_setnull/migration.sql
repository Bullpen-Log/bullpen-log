-- 공지 · 운영자 답글은 글쓴 관리자 계정이 지워져도 남는다(authorId SetNull, 2026-10-17). 외래키는 없다(relationMode prisma) — NULL 허용만.
ALTER TABLE "SupportNotice" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "SupportReply" ALTER COLUMN "authorId" DROP NOT NULL;
