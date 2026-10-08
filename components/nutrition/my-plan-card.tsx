'use client';

import type { MouseEvent } from 'react';
import { Pencil } from 'lucide-react';
import { paceText } from '@/components/onboarding/format';
import { PlanStats } from '@/components/onboarding/plan-stats';
import { useWeightUnit } from '@/components/use-units';
import { SEASON_PHASES } from '@/lib/nutrition/diet-prefs';
import type { NutritionDay } from '@/lib/nutrition/load';
import { ACTIVITIES, GOAL_KINDS, MACRO_PRESETS } from '@/lib/nutrition/meta';
import {
  answersOfProfile,
  previewOfProfile,
  type OnboardingBody,
} from '@/lib/nutrition/onboarding-answers';
import { dateText } from '@/lib/nutrition/period';

/**
 * '내 계획' — 영양 탭(통계 열 맨 위)의 카드. 가입 끼움 '추천 계획'과 같은 부품(components/onboarding/plan-stats.tsx)이라
 * 가입에서 본 화면이 탭에 그대로 있다: 기초대사량 · 활동대사량 · 운동 전 목표 · 탄단지 g · 목표 체중까지 약 N주 · 예상 선.
 *
 * 숫자는 저장된 목표 그대로(단백질 g/kg 도 저장값) 운동 없는 날로 셈한다(previewOfProfile) — 그날 운동이 더해진 '오늘 목표'는
 * '나의 하루' 카드가 말한다. 고치기는 목표 창(GoalSheet)에서 — 여기서는 보기만.
 */
export function MyPlanCard({
  day,
  today,
  onOpenGoal,
  className = '',
}: {
  day: NutritionDay;
  today: string;
  onOpenGoal: (e: MouseEvent<HTMLElement>) => void;
  className?: string;
}) {
  const unit = useWeightUnit();
  const body: OnboardingBody = {
    age: day.body.age,
    sex: day.body.sex,
    heightCm: day.body.heightCm,
    weightKg: day.body.weightKg,
    level: null,
  };
  const p = previewOfProfile(day.profile, body);
  const a = answersOfProfile(day.profile, day.prefs, body.age);
  const goal = GOAL_KINDS.find((g) => g.key === a.goalKind)?.label ?? '유지';
  const parts = [
    ACTIVITIES.find((x) => x.key === day.profile.activity)?.label ?? null,
    MACRO_PRESETS.find((m) => m.key === day.profile.macroPreset)?.label ?? null,
    SEASON_PHASES.find((s) => s.key === day.prefs.seasonPhase)?.label ?? null,
    p.targets.paceKg ? paceText(p.targets.paceKg, unit) : null,
    a.goalEndDate ? `${dateText(a.goalEndDate)}까지` : null,
  ].filter(Boolean);

  return (
    <section className={`${className} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">
            내 계획 · <span className="text-sky-strong">{goal}</span>
          </h2>
          {parts.length > 0 && (
            <p className="mt-0.5 text-xs leading-relaxed break-keep text-muted">
              {parts.join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenGoal}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
          고치기
        </button>
      </div>
      <PlanStats p={p} a={a} body={body} today={today} active />
    </section>
  );
}
