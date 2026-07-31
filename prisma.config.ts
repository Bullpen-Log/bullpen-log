import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * 마이그레이션은 커넥션 풀러(6543)로는 동작하지 않으므로
 * 직접 연결(5432)인 DIRECT_URL을 우선 사용한다.
 * DIRECT_URL이 없으면 DATABASE_URL로 넘어간다.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DIRECT_URL 또는 DATABASE_URL 환경변수가 필요합니다. .env 파일이나 배포 환경의 환경변수 설정을 확인하세요."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
});
