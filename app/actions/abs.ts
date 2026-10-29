'use server';

import { allowFeature } from '@/lib/release-gate';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { absFromAnalysis, type AbsAnalysis } from '@/lib/abs/analysis';
import { DEFAULT_RULE, HEIGHT_MAX_CM, HEIGHT_MIN_CM, type RuleSetId } from '@/lib/abs/rules';

export type RejudgeResult = { ok: true; abs: AbsAnalysis } | { ok: false; error: string };

/**
 * 저장한 공을 다른 신장 · 규칙으로 다시 판정한다 — 영상 없이 `analysis.distance.fit`(궤적 스냅샷) + `analysis.abs.calib` 로.
 * 본인 공만. 코스(zone) · 결과(result)도 새 판정으로 바꾼다('다음 타자' 뒤 신장을 고쳤을 때).
 */
export async function rejudgePitch(id: string, heightCm: number, rule?: RuleSetId): Promise<RejudgeResult> {
  allowFeature('abs');
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (!Number.isFinite(heightCm) || heightCm < HEIGHT_MIN_CM || heightCm > HEIGHT_MAX_CM)
    return { ok: false, error: `신장은 ${HEIGHT_MIN_CM}~${HEIGHT_MAX_CM}cm 사이로 넣어 주세요.` };
  const row = await prisma.velocityPitch.findFirst({
    where: { id, userId: user.id },
    select: { id: true, analysis: true, session: { select: { date: true } } },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없어요.' };
  const analysis = (row.analysis ?? null) as { abs?: AbsAnalysis | null } | null;
  if (!analysis?.abs) return { ok: false, error: 'ABS 로 판정한 공이 아니에요.' };
  const next = absFromAnalysis(analysis as Parameters<typeof absFromAnalysis>[0], Math.round(heightCm), rule ?? analysis.abs.rule ?? DEFAULT_RULE);
  if (!next) return { ok: false, error: '다시 판정할 자료가 모자라요.' };
  await prisma.velocityPitch.update({
    where: { id: row.id },
    data: {
      analysis: { ...analysis, abs: next } as Prisma.InputJsonValue,
      zone: next.verdict?.cell ?? null,
      result: next.verdict?.call ?? null,
    },
  });
  const day = row.session.date.toISOString().slice(0, 10);
  revalidatePath(`/pitch-log/${day}`);
  revalidatePath('/videos');
  return { ok: true, abs: next };
}
