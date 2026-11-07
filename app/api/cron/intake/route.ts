import { handleCronRequest } from '@/lib/intake/job-handlers';

/**
 * 외부 접수의 지속 작업 — 5분마다(vercel.json crons). Vercel 이 `Authorization: Bearer <CRON_SECRET>` 를 붙여 부른다.
 * CRON_SECRET 이 없거나 머리가 다르면 401 이다. 파일 검증 · 끊긴 정산 잇기 · 분석 상태 묻기 · 정리만 돌리고 GPU 는 걸지 않는다.
 */
export const dynamic = 'force-dynamic';
/* 1GiB 파일을 처음부터 끝까지 읽어 해시를 잰다. 시간이 모자라면 임대가 풀려 다음 크론이 다시 재지만, 그때 시도 횟수를 하나 쓴다 */
export const maxDuration = 300;

export function GET(req: Request) {
  return handleCronRequest(req, process.env.CRON_SECRET);
}
