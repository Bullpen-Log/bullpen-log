import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * 구속 측정 세션을 투구 기록 하나에 잇는다 — 투구 기록 저장(app/api/pitch-log POST)과 연결만 다시 하기(app/api/pitch-log/link)가 같이 쓴다.
 * 본인 것 · 기록과 같은 날 · 아직 안 이어진 세션만 잇는다. 잇고 난 뒤 실제로 이 기록을 가리키는지 다시 읽어 결과를 돌려준다 —
 * 연결이 실패해도 기록 저장은 끝났으므로 던지지 않는다(앱은 '저장됨'과 '연결 확인됨'을 따로 보인다, 2026-10-29 퀵스텝).
 *
 * failed 까닭: other = 다른 기록에 이미 이어짐 · missing = 없거나 내 것이 아님 · date = 다른 날 측정 · error = 잇다가 DB 오류(다시 해 볼 만함)
 */
export type LinkResult = {
  requested: string[];
  linked: string[];
  failed: { id: string; reason: 'other' | 'missing' | 'date' | 'error' }[];
};

export async function linkSessionsToLog(ids: string[], userId: string, date: Date, logId: string): Promise<LinkResult> {
  const requested = [...new Set(ids)];
  try {
    await prisma.velocitySession.updateMany({
      where: { id: { in: requested }, userId, date, pitchLogId: null },
      data: { pitchLogId: logId },
    });
  } catch (err) {
    console.error('[velocity-link] 구속 세션 잇기 실패', err);
  }
  try {
    const rows = await prisma.velocitySession.findMany({
      where: { id: { in: requested }, userId },
      select: { id: true, date: true, pitchLogId: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const linked: string[] = [];
    const failed: LinkResult['failed'] = [];
    for (const id of requested) {
      const r = byId.get(id);
      if (!r) failed.push({ id, reason: 'missing' });
      else if (r.pitchLogId === logId) linked.push(id);
      else if (r.pitchLogId != null) failed.push({ id, reason: 'other' });
      else if (r.date.getTime() !== date.getTime()) failed.push({ id, reason: 'date' });
      else failed.push({ id, reason: 'error' });
    }
    return { requested, linked, failed };
  } catch (err) {
    console.error('[velocity-link] 구속 세션 확인 실패', err);
    return { requested, linked: [], failed: requested.map((id) => ({ id, reason: 'error' as const })) };
  }
}
