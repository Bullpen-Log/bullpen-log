import 'server-only';

import { prisma } from '@/lib/prisma';
import { ARMCARE_CATEGORY, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { armPainLevelLabel, armPainSpotLabel } from '@/lib/checkin';
import { COVERAGE_DAYS, armcareCoverage, gapAreas, type ArmcareCoverage } from '@/lib/armcare/coverage';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { shiftDateKey } from '@/lib/pitch-stats';
import type { CachedExercise } from '@/lib/library-cache';

export type ArmPainLine = {
  when: '오늘' | '어제';
  spots: { key: ArmcareAreaKey; label: string }[];
  level: number | null;
  levelLabel: string | null;
};

/**
 * 내 팔 지도의 서버 쪽 — 최근 2주 암케어 기록 점수 · 비어 있는 부위 · 오늘이나 어제의 팔 통증(2026-10-04).
 * 부위별 보강(armcare-section.tsx)과 트레이닝 홈의 암케어 카드(training-home.tsx)가 같이 쓴다.
 *
 * 아픈 자리는 '빈 곳 보강' 권유에서 뺀다 — 아픈 곳은 맞춤 루틴의 통증 루틴과 팔 통증 안내가 맡는다. allCovered 는
 * 통증과 상관없이 여덟 부위를 모두 했는지(칭찬은 이때만).
 */
export async function loadArmcareCoverage(
  userId: string,
  todayKey: string,
  library: CachedExercise[]
): Promise<{
  coverage: ArmcareCoverage;
  gaps: ArmcareAreaKey[];
  allCovered: boolean;
  pain: ArmPainLine | null;
}> {
  const armcare = library.filter((ex) => ex.category === ARMCARE_CATEGORY);
  const [logs, painRow] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: {
        userId,
        completed: true,
        date: { gte: dbDate(shiftDateKey(todayKey, -(COVERAGE_DAYS - 1))) },
        exerciseId: { in: armcare.map((ex) => ex.id) },
      },
      select: { exerciseId: true },
    }),
    prisma.dailyCheckin.findFirst({
      where: {
        userId,
        date: { gte: dbDate(shiftDateKey(todayKey, -1)) },
        NOT: { armPainSpots: { isEmpty: true } },
      },
      orderBy: { date: 'desc' },
      select: { date: true, armPainSpots: true, armPainLevel: true },
    }),
  ]);
  const coverage = armcareCoverage(
    logs,
    armcare.map((ex) => ({ id: ex.id, targetMuscles: ex.targetMuscles ?? [] }))
  );
  const painSpots = (painRow?.armPainSpots ?? []).filter(
    (k): k is ArmcareAreaKey => armPainSpotLabel(k) != null
  );
  const allGaps = gapAreas(coverage, 8);
  return {
    coverage,
    gaps: allGaps.filter((key) => !painSpots.includes(key)).slice(0, 2),
    allCovered: coverage.total > 0 && allGaps.length === 0,
    pain:
      painRow && painSpots.length > 0
        ? {
            when: keyOfDbDate(painRow.date) === todayKey ? '오늘' : '어제',
            spots: painSpots.map((key) => ({ key, label: armPainSpotLabel(key) ?? key })),
            level: painRow.armPainLevel,
            levelLabel: armPainLevelLabel(painRow.armPainLevel),
          }
        : null,
  };
}
