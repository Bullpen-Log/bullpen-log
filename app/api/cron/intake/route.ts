import { handleCronRequest } from '@/lib/intake/job-handlers';

/**
 * 외부 접수의 지속 작업 — 5분마다(vercel.json crons). Vercel 이 `Authorization: Bearer <CRON_SECRET>` 를 붙여 부른다.
 * CRON_SECRET 이 없거나 머리가 다르면 401 이다. 파일 검증 · 끊긴 정산 잇기 · 분석 상태 묻기 · 정리만 돌리고 GPU 는 걸지 않는다.
 */
export const dynamic = 'force-dynamic';
/*
 * 1GiB 파일을 처음부터 끝까지 읽어 해시를 잰다. 일감은 이 시간에서 여유(30초)를 뺀 예산 안에서만 시작하고,
 * 예산 끝에 해시를 끊어 시도 횟수를 돌려준다(lib/intake/job-handlers.ts runIntakeCron).
 * 설정 값은 글자 그대로 적어야 해서 lib/intake/limits.ts INTAKE_CRON_MAX_DURATION_SEC 와 따로 적는다 — 둘이 같은지는 intake:budget-test 가 본다.
 */
export const maxDuration = 300;

export function GET(req: Request) {
  return handleCronRequest(req, process.env.CRON_SECRET);
}
