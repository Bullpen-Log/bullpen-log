#!/bin/bash
# 클라우드 세션(claude.ai/code, '불펜로그 개발 서브')이 시작될 때 한 번 도는 준비 스크립트.
#
# 데스크톱 · 노트북(로컬)에서는 아무것도 하지 않는다 — CLAUDE_CODE_REMOTE 가 true 일 때만 돈다.
# 하는 일 셋, 같은 컨테이너에서 여러 번 돌아도 안전하다.
#   1. npm 패키지 설치 — `--no-save`: 여기 npm 은 데스크톱 npm 이 적은 package-lock 의 `libc` 줄을 지우므로
#      락파일을 건드리지 않게 한다(설치 내용은 락파일 그대로).
#   2. .env 자리표 — 없을 때만. 실제 DB · 저장소 · API 키는 넣지 않는다.
#      'node --env-file=.env …' 로 도는 셀프테스트가 파일이 없으면 시작도 못 해서 둔다.
#      실제 값은 클라우드 환경의 환경변수에 넣는다(환경변수가 이 파일보다 이긴다).
#   3. prisma generate — prisma.config.ts 가 DB 주소 없이는 열리지 않아 자리표 주소로 돈다
#      (generate 는 DB 에 접속하지 않는다).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

PLACEHOLDER_DB="postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder"

echo "· npm 패키지 설치"
npm install --no-save --no-audit --no-fund --loglevel=error

if [ ! -f .env ]; then
  echo "· .env 자리표 만들기(실제 DB · 키 없음)"
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  cat > .env <<ENV
# 클라우드 세션용 자리표 — .claude/hooks/session-start.sh 가 만들었다.
# 실제 DB · 저장소 · API 키는 없다. 'node --env-file=.env …' 스크립트가 파일을 요구해서 둔다.
# 실제 값은 클라우드 환경의 환경변수에 넣는다(환경변수가 이 파일 값보다 이긴다).
DATABASE_URL="${PLACEHOLDER_DB}"
SESSION_SECRET="${SECRET}"
ENV
fi

echo "· prisma generate"
DATABASE_URL="${DATABASE_URL:-$PLACEHOLDER_DB}" npx prisma generate

echo "· 준비 끝"
