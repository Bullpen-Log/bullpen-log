'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useWeightUnit } from '@/components/use-units';
import { BurnInsert } from '@/components/onboarding/insert-cards';
import { NumberUnitField } from '@/components/onboarding/number-unit-field';
import {
  NutritionStepPanel,
  answerLines,
  nutritionStepTitle,
  type StepCtx,
} from '@/components/onboarding/nutrition-steps';
import { MacroBar } from '@/components/onboarding/plan-stats';
import { ProblemLine, StepCard, TextButton } from '@/components/onboarding/step-card';
import { finishNutritionSetup } from '@/app/actions/nutrition';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import type { CompetitionLevel } from '@/lib/baseline';
import { GOAL_KINDS, kcalText } from '@/lib/nutrition/meta';
import {
  checkNutritionStep,
  nutritionStepOfField,
  preview,
  toFormFields,
  visibleNutritionSteps,
  type NutritionAnswers,
  type NutritionStepKey,
  type OnboardingBody,
} from '@/lib/nutrition/onboarding-answers';
import {
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
  type Sex,
} from '@/lib/profile';

/**
 * 기존 사용자 온보딩 화면 — 가입 마법사(app/login/auth-form.tsx)의 영양 부분만: 키 → 체중 → [운동 소모] → 목표 카드 → … →
 * [계획 만드는 중 → 추천 계획 → 탄단지 g] → 요약 → 저장. 같은 부품(components/onboarding) · 같은 글이라 가입에서 본 화면 그대로다.
 *
 * 답은 상태로 쥐고 한 번에 보낸다(finishNutritionSetup — 한 트랜잭션). 서버가 막으면 그 칸의 화면으로 돌아간다.
 */

type StepKey = 'height' | 'weight' | 'burnCard' | `n:${NutritionStepKey}` | 'summary';

type Problem = { error: string; field: string };

export function SetupWizard({
  today,
  name,
  age,
  sex,
  heightCm: savedHeight,
  weightKg: savedWeight,
  level,
  hasProfile,
  initial,
}: {
  today: string;
  name: string;
  age: number | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  level: CompetitionLevel | null;
  hasProfile: boolean;
  /** 저장된 목표 · 취향으로 채운 답(없으면 빈 답) */
  initial: NutritionAnswers;
}) {
  const router = useRouter();
  const unit = useWeightUnit();
  const [heightCm, setHeightCm] = useState<number | null>(savedHeight);
  const [weightKg, setWeightKg] = useState<number | null>(savedWeight);
  const [a, setA] = useState<NutritionAnswers>(initial);
  const [step, setStep] = useState<StepKey>('height');
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const [problem, setProblem] = useState<(Problem & { seq: number }) | null>(null);
  const [pending, startTransition] = useTransition();
  const moved = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const body: OnboardingBody = { age, sex, heightCm, weightKg, level };
  const visible: StepKey[] = [
    'height',
    'weight',
    'burnCard',
    ...visibleNutritionSteps(a, body).map((k): StepKey => `n:${k}`),
    'summary',
  ];
  const index = Math.max(0, visible.indexOf(step));
  const current = visible[index];
  const last = visible.length - 1;
  const p = preview(a, body);
  const who = name ? `${name} 님, ` : '';

  function show(found: Problem) {
    setProblem((prev) => ({ ...found, seq: (prev?.seq ?? 0) + 1 }));
  }
  const invalid = (field: string) => problem?.field === field;
  function setNutrition(patch: Partial<NutritionAnswers>) {
    setA((prev) => ({ ...prev, ...patch }));
    if (problem) setProblem(null);
  }

  function checkStep(key: StepKey): Problem | null {
    switch (key) {
      case 'height':
        if (heightCm === null) return { error: '키를 적어 주세요.', field: 'heightCm' };
        if (
          !Number.isInteger(heightCm) ||
          heightCm < MIN_HEIGHT_CM ||
          heightCm > MAX_HEIGHT_CM
        ) {
          return {
            error: `키는 ${MIN_HEIGHT_CM}~${MAX_HEIGHT_CM}cm 사이로 적어 주세요.`,
            field: 'heightCm',
          };
        }
        return null;
      case 'weight':
        if (weightKg === null)
          return { error: '지금 체중을 적어 주세요.', field: 'weightKg' };
        if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) {
          return {
            error: `체중은 ${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 적어 주세요.`,
            field: 'weightKg',
          };
        }
        return null;
      case 'burnCard':
      case 'summary':
        return null;
      default:
        return checkNutritionStep(key.slice(2) as NutritionStepKey, a, body);
    }
  }

  function stepOfField(field: string): StepKey {
    if (field === 'heightCm') return 'height';
    if (field === 'weightKg') return 'weight';
    const n = nutritionStepOfField(field);
    return n ? `n:${n}` : 'summary';
  }

  /** 칸(id "{name}-field")으로 초점 — 고르는 묶음이면 고른 단추(없으면 첫 단추)로 */
  function focusField(field: string) {
    const target = document.getElementById(`${field}-field`);
    if (!target) return;
    if (target.dataset.field !== undefined) {
      const picked =
        target.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)') ??
        target.querySelector<HTMLElement>('button:not(:disabled)');
      picked?.focus({ preventScroll: true });
    } else {
      target.focus({ preventScroll: true });
    }
  }

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rootRef.current?.scrollIntoView({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    });
    const panel = rootRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const first = panel?.querySelector<HTMLElement>(
      '[data-field], input:not([type=hidden]), button[role=radio]'
    );
    if (!first) return;
    if (first.dataset.field !== undefined) return focusField(first.dataset.field);
    first.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (problem) focusField(problem.field);
  }, [problem]);

  function goTo(key: StepKey, direction: 'next' | 'back') {
    moved.current = true;
    setDir(direction);
    setStep(key);
  }
  function next() {
    if (index >= last) return;
    const found = checkStep(current);
    if (found) return show(found);
    setProblem(null);
    goTo(visible[index + 1], 'next');
  }
  function back() {
    setProblem(null);
    let i = index - 1;
    while (i > 0 && visible[i] === 'n:building') i--;
    goTo(visible[Math.max(0, i)], 'back');
  }

  function save() {
    for (const key of visible) {
      const found = checkStep(key);
      if (found) {
        if (key !== current) goTo(key, visible.indexOf(key) < index ? 'back' : 'next');
        show(found);
        return;
      }
    }
    setProblem(null);
    startTransition(async () => {
      const res = await orOffline(
        finishNutritionSetup({ heightCm, weightKg, fields: toFormFields(a) }),
        { ok: false as const, error: OFFLINE_MESSAGE }
      );
      if (res.ok) {
        router.push('/nutrition');
        router.refresh();
        return;
      }
      const field = 'field' in res && res.field ? res.field : 'summary';
      const at = stepOfField(field);
      if (at !== current) goTo(at, visible.indexOf(at) < index ? 'back' : 'next');
      show({ error: res.error, field });
    });
  }

  const ctx: StepCtx = {
    a,
    set: setNutrition,
    body,
    p,
    today,
    name,
    invalid,
    unit,
    active: false,
  };
  function titleOf(key: StepKey): { title: string; desc?: string } {
    switch (key) {
      case 'height':
        return {
          title: `${who}키는 얼마예요?`,
          desc: hasProfile
            ? '내 정보의 값이에요. 맞으면 그냥 다음으로. 기초대사량과 목표 체중의 바닥(BMI 20)에 써요.'
            : '기초대사량과 목표 체중의 바닥(BMI 20), 영상에서 잰 길이를 몸 크기로 나눌 때 써요.',
        };
      case 'weight':
        return {
          title: '지금 체중은요?',
          desc: '오늘 체중 기록이 돼요. 목표 칼로리와 단백질을 체중으로 셈해요.',
        };
      case 'burnCard':
        return {
          title: '먹는 것과 쓰는 것',
          desc: '이 앱의 영양은 운동 · 투구 기록과 이어져 있어요.',
        };
      case 'summary':
        return {
          title: `${name ? `${name} 님의 ` : ''}계획이에요`,
          desc: '저장하면 영양 탭과 홈이 이 숫자로 바뀌어요. 언제든 영양 탭의 목표 창에서 고칠 수 있어요.',
        };
      default:
        return nutritionStepTitle(key.slice(2) as NutritionStepKey, ctx);
    }
  }
  const heading = titleOf(current);
  const enter =
    dir === 'next' ? 'motion-safe:animate-step-next' : 'motion-safe:animate-step-back';
  const panel = (key: StepKey, children: ReactNode) => (
    <div
      key={key}
      data-step={key}
      hidden={key !== current}
      className={key === current ? enter : undefined}
    >
      {children}
    </div>
  );
  const building = current === 'n:building';
  const goalLabel = GOAL_KINDS.find((g) => g.key === a.goalKind)?.label ?? null;

  return (
    <div ref={rootRef} className="flex min-h-[calc(100dvh-9rem)] flex-col scroll-mt-4">
      <StepCard
        titleKey={current}
        title={heading.title}
        desc={heading.desc}
        progress={(index + 1) / visible.length}
        counter={`${index + 1} / ${visible.length}`}
        brand={null}
        footer={
          <>
            {index === 0 ? (
              <TextButton onClick={() => router.push('/nutrition')}>
                그만두기
              </TextButton>
            ) : (
              <TextButton onClick={back} disabled={building || pending}>
                이전
              </TextButton>
            )}
            {index < last ? (
              <Button
                type="button"
                onClick={next}
                disabled={building}
                className="min-w-28"
              >
                {building ? '잠시만요…' : '다음'}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={save}
                disabled={pending}
                className="min-w-28"
              >
                {pending ? '저장하는 중…' : '저장하고 시작하기'}
              </Button>
            )}
          </>
        }
      >
        <p className="sr-only" aria-live="polite">
          {`${visible.length}단계 중 ${index + 1}단계, ${heading.title}`}
        </p>

        {panel(
          'height',
          <NumberUnitField
            name="heightCm"
            kind="length"
            label="키"
            value={heightCm}
            onChange={(v) => {
              setHeightCm(v);
              if (problem) setProblem(null);
            }}
            min={MIN_HEIGHT_CM}
            max={MAX_HEIGHT_CM}
            placeholder={175}
            invalid={invalid('heightCm')}
            withHidden={false}
          />
        )}
        {panel(
          'weight',
          <NumberUnitField
            name="weightKg"
            kind="weight"
            label="지금 체중"
            value={weightKg}
            onChange={(v) => {
              setWeightKg(v);
              if (problem) setProblem(null);
            }}
            min={MIN_WEIGHT_KG}
            max={MAX_WEIGHT_KG}
            placeholder={72}
            invalid={invalid('weightKg')}
            withHidden={false}
            hint="아침에 화장실 다녀온 뒤 잰 값이 가장 고르게 나와요. 0.1kg 까지."
          />
        )}
        {panel(
          'burnCard',
          <BurnInsert weightKg={weightKg} active={current === 'burnCard'} />
        )}

        {visible
          .filter((k) => k.startsWith('n:'))
          .map((k) =>
            panel(
              k,
              <NutritionStepPanel
                step={k.slice(2) as NutritionStepKey}
                ctx={{ ...ctx, active: current === k }}
                onBuilt={() => {
                  if (current === 'n:building' && index < last)
                    goTo(visible[index + 1], 'next');
                }}
              />
            )
          )}

        {panel(
          'summary',
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky/30 bg-sky/5 px-4 py-3">
              <p className="text-xs font-medium text-sky-strong">
                {goalLabel ?? '목표'} · 운동 없는 날
              </p>
              <p className="text-heading mt-1 text-3xl text-ink">
                {kcalText(p.targets.base)}
                <span className="ml-1 text-sm font-normal text-muted">kcal</span>
              </p>
              <div className="mt-3">
                <MacroBar
                  carbs={p.targets.carbs}
                  protein={p.targets.protein}
                  fat={p.targets.fat}
                  compact
                />
              </div>
            </div>
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface-2/60 px-4">
              {answerLines(ctx).map((l, i) => (
                <div
                  key={l.label}
                  style={{ '--row': i } as React.CSSProperties}
                  className="motion-safe:animate-row-in flex items-baseline justify-between gap-3 py-2 text-sm"
                >
                  <dt className="shrink-0 text-muted">{l.label}</dt>
                  <dd className="text-right font-medium break-keep text-ink">
                    {l.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-relaxed break-keep text-muted">
              저장하면 키 · 체중은 내 정보에, 오늘 체중은 체중 기록에 함께 들어가요.
            </p>
          </div>
        )}

        {problem && <ProblemLine seq={problem.seq}>{problem.error}</ProblemLine>}
      </StepCard>
    </div>
  );
}
