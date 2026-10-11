import { ensureSim, simOffsetMs } from '@/lib/clock-server';

/** 시험 계정의 화면 시계 차이(ms) — components/sim-clock-sync.tsx 가 30초마다 묻는다. 다른 계정은 0 */
export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSim();
  return Response.json({ offset: simOffsetMs() }, { headers: { 'Cache-Control': 'no-store' } });
}
