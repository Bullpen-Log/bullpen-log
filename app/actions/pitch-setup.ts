'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { validatePitchBaseline } from '@/lib/baseline';
import { formOfFields, readPitchAnswers } from '@/lib/pitching/setup-answers';
import { validateTargetVelocity } from '@/lib/velocity';

/**
 * 투구 기록 첫 설정(/videos/setup)의 저장 — 던지는 손 · 평소 투구량 셋 · 목표 구속을 한 번에(User 한 줄).
 *
 * 처음 가입한 사람은 이 저장이 투구 기록 탭의 잠금을 푼다 — 잠금은 pitchSetupAt 의 유무(lib/feature-locks.ts
 * featureLocks). 다시 들어와 고치는 사람은 처음 마친 시각을 그대로 둔다(튜토리얼 · 첫 설정 통계가 그 시각을 본다).
 * 값의 규칙은 내 정보(app/actions/profile.ts)와 같은 함수 — 같은 칸을 두 곳에서 다른 기준으로 받지 않게.
 *
 * field 는 막힌 칸 — 화면이 그 칸이 있는 화면으로 되돌아간다(lib/pitching/setup-answers.ts pitchStepOfField).
 * 신호가 끊겨 여기까지 못 오는 경우는 화면이 lib/action-offline.ts orOffline 으로 받는다.
 */
export type PitchSetupResult =
  { ok: true } | { ok: false; error: string; field?: string };

export async function finishPitchSetup(
  fields: [string, string][]
): Promise<PitchSetupResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const form = formOfFields(fields);
  if (!form) {
    return { ok: false, error: '답이 올바르지 않아요. 새로고침한 뒤 다시 해 주세요.' };
  }
  const answers = readPitchAnswers(form);

  const baseline = validatePitchBaseline({
    throwingHand: answers.throwingHand ?? '',
    baselineFreq: answers.baselineFreq ?? '',
    baselineVolume: answers.baselineVolume ?? '',
    baselineIntensity: answers.baselineIntensity ?? '',
  });
  if ('error' in baseline) {
    return { ok: false, error: baseline.error, field: baseline.field };
  }
  /* 목표 구속 — 비워 두면 목표 없이(null). 내 정보에서 언제든 정할 수 있다 */
  const target = validateTargetVelocity(answers.targetVelocity);
  if ('error' in target) {
    return { ok: false, error: target.error, field: 'targetVelocity' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...baseline.value,
      targetVelocity: target.value,
      pitchSetupAt: user.pitchSetupAt ?? new Date(),
    },
  });

  /* 탭 페이지(잠금 풀림 · 튜토리얼)와 홈(기능 링크 · 부하 지수의 기준선), 막대의 흐림 · 자물쇠까지 새로 읽게 한다 */
  revalidatePath('/videos');
  revalidatePath('/today');
  revalidatePath('/', 'layout');
  return { ok: true };
}
