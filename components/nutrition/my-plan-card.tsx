'use client';

import { useState, type MouseEvent } from 'react';
import { ChevronDown, Pencil } from '@/components/icon';
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
 * '오늘 영양' 카드가 말한다. 고치기는 목표 창(GoalSheet)에서 — 여기서는 보기만.
 * 2026-10-14 김민(핵심만): 평소엔 한 줄(목표 · 하루 열량 · 단백질), 계산 내역(PlanStats)은 '자세히'를 눌러야 편다.
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
  const [open, setOpen] = useState(false);
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
          <p className="mt-0.5 text-sm tabular-nums text-ink">
            하루 {p.targets.kcal.toLocaleString()}kcal · 단백질 {p.targets.protein}g
          </p>
          {p.targets.floored && (
            <p className="mt-0.5 text-xs break-keep text-muted">
              {p.targets.ageBand === 'adult'
                ? '기초대사량보다 낮게 잡지 않아요.'
                : '성장기는 계산한 목표보다 낮게 잡지 않아요.'}
            </p>
          )}
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mb-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
      >
        {open ? '계산 내역 접기' : '계산 내역 보기'}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <PlanStats p={p} a={a} body={body} today={today} active />}
    </section>
  );
}
