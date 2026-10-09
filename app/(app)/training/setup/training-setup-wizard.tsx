'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Chips, MultiChips, OptionCards } from '@/components/onboarding/choices';
import { BurnInsert } from '@/components/onboarding/insert-cards';
import { ProblemLine, StepCard, TextButton } from '@/components/onboarding/step-card';
import { useStepWizard } from '@/components/onboarding/use-step-wizard';
import { finishTrainingSetup } from '@/app/actions/training-setup';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { BASELINE_WORKOUT_FREQ, THROWING_HANDS } from '@/lib/baseline';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { WORKOUT_MINUTES_CHOICES } from '@/lib/report/theme';
import {
  checkTrainingAnswers,
  checkTrainingStep,
  programNote,
  toTrainingFormFields,
  trainingAnswerLines,
  trainingStepOfField,
  visibleTrainingSteps,
  type TrainingSetupAnswers,
  type TrainingStepKey,
} from '@/lib/training/setup-answers';

/**
 * 트레이닝 첫 설정 화면 — 경력 → 웨이트 횟수 → 장비 → 하루 운동 시간 → [던지는 손] → [운동 소모] → 요약 → 저장.
 * 영양 첫 설정(app/(app)/nutrition/setup/setup-wizard.tsx)과 같은 모양: 한 화면에 한 질문(StepCard, brand 없음), 뼈대는
 * useStepWizard(components/onboarding/use-step-wizard.ts). 답의 차례 · 검사는 lib/training/setup-answers.ts.
 *
 * 답은 상태로 쥐고 한 번에 보낸다(finishTrainingSetup). 서버가 막으면 그 칸의 화면으로 돌아간다. 저장이 끝나면 트레이닝
 * 탭으로 — 잠금이 걷히고 탭 페이지가 사용법 튜토리얼을 한 번 띄운다(app/(app)/training/page.tsx).
 *
 * hasSetup — 설정을 이미 마친 사람(다시 온 사람)인가. 처음 온 사람은 트레이닝 탭이 잠겨 있어 '그만두기'로 /training 에
 * 가면 다시 여기로 돌아오니, 대신 '홈으로'(/today)를 보인다. 요약의 말과 단추 글자도 다르다(탭이 이미 열려 있다).
 * askHand — 던지는 손이 계정에 없나(투구 기록 설정 전). 암케어 · 메커니즘이 읽는 값이라 그때만 여기서도 묻는다.
 * weightKg — 끼움 '운동 소모'가 셈할 체중. 모르면 그 화면을 건너뛴다.
 * basicsDone — 기본기 4주를 마친 적이 있나. 요약의 프로그램 안내(programNote)가 입문을 가를 때 본다.
 */
export function TrainingSetupWizard({
  name,
  age,
  weightKg,
  askHand,
  hasSetup,
  basicsDone,
  initial,
}: {
  name: string;
  age: number | null;
  weightKg: number | null;
  askHand: boolean;
  hasSetup: boolean;
  basicsDone: boolean;
  /** 계정에 있는 값으로 채운 답(처음이면 빈 답) */
  initial: TrainingSetupAnswers;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const hasWeight = weightKg !== null;
  const w = useStepWizard<TrainingStepKey, TrainingSetupAnswers>({
    initial,
    steps: () => visibleTrainingSteps({ askHand, hasWeight }),
    check: checkTrainingStep,
    stepOfField: trainingStepOfField,
  });
  const a = w.answers;
  const { step, focusField } = w;
  const last = w.total - 1;
  const invalid = (field: string) => w.problem?.field === field;
  const who = name ? `${name} 님, ` : '';

  /*
   * 화면이 바뀌면 위로 굴리고 첫 칸으로 초점 — 훅은 이것을 쓰는 쪽에 맡긴다. 지난 화면을 들고 있어 처음 그릴 때
   * (StrictMode 의 두 번째 실행 포함)는 움직이지 않는다. 서버가 막아 돌아온 때는 훅이 그 칸으로 초점을 보낸다(한 그림 뒤).
   */
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rootRef.current?.scrollIntoView({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    });
    const panel = rootRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const first = panel?.querySelector<HTMLElement>('[data-field]');
    if (first?.dataset.field) focusField(first.dataset.field);
  }, [step, focusField]);

  function toggleEquipment(value: string, on: boolean) {
    w.patch({
      ownedEquipment: on
        ? [...a.ownedEquipment.filter((e) => e !== value), value]
        : a.ownedEquipment.filter((e) => e !== value),
      /* 장비를 하나라도 켜면 '맨몸뿐'이 아니다 */
      bodyOnly: on ? false : a.bodyOnly,
    });
  }
  function toggleBodyOnly(on: boolean) {
    /* '맨몸뿐이에요'를 켜면 골라 둔 장비를 비운다 — 둘이 같이 켜져 있을 수 없다 */
    w.patch({ bodyOnly: on, ownedEquipment: on ? [] : a.ownedEquipment });
  }

  function save() {
    const bad = checkTrainingAnswers(a, { askHand });
    if (bad) return w.setProblem(bad);
    w.setProblem(null);
    startTransition(async () => {
      const res = await orOffline(finishTrainingSetup(toTrainingFormFields(a)), {
        ok: false as const,
        error: OFFLINE_MESSAGE,
      });
      if (res.ok) {
        router.push('/training');
        router.refresh();
        return;
      }
      w.setProblem({
        error: res.error,
        field: 'field' in res && res.field ? res.field : 'summary',
      });
    });
  }

  function titleOf(key: TrainingStepKey): { title: string; desc?: string } {
    switch (key) {
      case 'level':
        return {
          title: `${who}웨이트는 얼마나 해 봤어요?`,
          desc: '경력에 비해 이른 운동은 빼고 골라요. 근력 · 파워 프로그램을 시작할 수 있는지도 여기서 봐요.',
        };
      case 'workoutFreq':
        return {
          title: '일주일에 몇 번 해요?',
          desc: '운동 부하 지수의 시작점이에요. 기록이 쌓이면 이 답은 자리를 비켜요.',
        };
      case 'equipment':
        return {
          title: '어떤 장비가 있어요?',
          desc: '없는 장비로 하는 운동은 빼고 짜요. 집에서 하는 날은 일정을 만들 때 오늘 쓸 것만 다시 골라요.',
        };
      case 'minutes':
        return {
          title: '하루에 얼마나 할 수 있어요?',
          desc: '일정을 이 시간에 맞춰 짜요. 만들 때마다 바꿀 수 있어요.',
        };
      case 'hand':
        return {
          title: '어느 손으로 던져요?',
          desc: '암케어와 메커니즘이 어느 팔을 볼지 정해요. 투구 기록에서도 같은 값을 써요.',
        };
      case 'burnCard':
        return {
          title: '운동을 적으면 영양이 따라와요',
          desc: '트레이닝 기록은 영양 탭의 목표 칼로리와 이어져 있어요.',
        };
      case 'summary':
        return {
          title: `${name ? `${name} 님의 ` : ''}트레이닝 설정이에요`,
          desc: hasSetup
            ? '저장하면 트레이닝 탭이 이 값으로 운동을 골라요. 언제든 트레이닝 설정에서 고칠 수 있어요.'
            : '시작하면 트레이닝 탭이 열려요. 언제든 트레이닝 설정에서 고칠 수 있어요.',
        };
    }
  }
  const heading = titleOf(step);
  const enter =
    w.dir === 'next'
      ? 'motion-safe:animate-step-next'
      : 'motion-safe:animate-step-back';
  const panel = (key: TrainingStepKey, children: ReactNode) => (
    <div
      key={key}
      data-step={key}
      hidden={key !== step}
      className={key === step ? enter : undefined}
    >
      {children}
    </div>
  );

  return (
    <div ref={rootRef} className="flex min-h-[calc(100dvh-9rem)] flex-col scroll-mt-4">
      <StepCard
        titleKey={step}
        title={heading.title}
        desc={heading.desc}
        progress={(w.index + 1) / w.total}
        counter={`${w.index + 1} / ${w.total}`}
        brand={null}
        footer={
          <>
            {w.index === 0 ? (
              /* 처음 온 사람은 트레이닝 탭이 잠겨 있어 /training 이 다시 여기로 보낸다 — 홈으로 */
              <TextButton
                onClick={() => router.push(hasSetup ? '/training' : '/today')}
              >
                {hasSetup ? '그만두기' : '홈으로'}
              </TextButton>
            ) : (
              <TextButton onClick={w.back} disabled={pending}>
                이전
              </TextButton>
            )}
            {w.index < last ? (
              <Button type="button" onClick={w.next} className="min-w-28">
                다음
              </Button>
            ) : (
              <Button
                type="button"
                onClick={save}
                disabled={pending}
                className="min-w-28"
              >
                {pending ? '저장하는 중…' : hasSetup ? '저장하기' : '시작하기'}
              </Button>
            )}
          </>
        }
      >
        <p className="sr-only" aria-live="polite">
          {`${w.total}단계 중 ${w.index + 1}단계, ${heading.title}`}
        </p>

        {/* 경력 — 기간으로 묻는다. 스스로 초급인지 중급인지보다 '얼마나 오래 했는가'가 답하기 쉽다(personalize.ts) */}
        {panel(
          'level',
          <OptionCards
            name="trainingLevel"
            label="웨이트 경력"
            options={TRAINING_LEVELS.map((l) => ({
              value: l.name,
              label: l.name,
              hint: l.desc,
            }))}
            value={a.trainingLevel}
            onChange={(trainingLevel) => w.patch({ trainingLevel })}
            columns={2}
            invalid={invalid('trainingLevel')}
          />
        )}

        {panel(
          'workoutFreq',
          <Chips
            name="baselineWorkoutFreq"
            label="평소 웨이트 횟수"
            options={BASELINE_WORKOUT_FREQ.map((o) => ({
              value: o.name,
              label: o.name,
            }))}
            value={a.baselineWorkoutFreq}
            onChange={(baselineWorkoutFreq) => w.patch({ baselineWorkoutFreq })}
            invalid={invalid('baselineWorkoutFreq')}
            hint="이 답과 하루 운동 시간으로 첫날부터 운동 부하 지수를 내요."
          />
        )}

        {/*
         * 장비 — 여러 개 고르기. 하나도 안 고르면 '맨몸'만 저장되어 장비 운동이 모두 빠지므로(readOwnedEquipment 와 같은 규칙),
         * 빈 채로 넘어가지 않고 '맨몸뿐이에요'를 따로 누르게 한다. 그 규칙은 글로도 적는다.
         */}
        {panel(
          'equipment',
          <div className="space-y-5">
            <MultiChips
              name="ownedEquipment"
              label="가진 장비"
              options={SELECTABLE_EQUIPMENT.map((e) => ({ value: e, label: e }))}
              values={a.ownedEquipment}
              onToggle={toggleEquipment}
              hint="장비가 없으면 아래 ‘맨몸뿐이에요’를 눌러요. 장비가 생기면 트레이닝 설정에서 더해요."
            />
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium text-muted">
                장비가 하나도 없으면
              </p>
              <MultiChips
                name="bodyOnly"
                label="맨몸뿐이에요"
                options={[{ value: 'on', label: '맨몸뿐이에요' }]}
                values={a.bodyOnly ? ['on'] : []}
                onToggle={(_v, on) => toggleBodyOnly(on)}
              />
            </div>
          </div>
        )}

        {panel(
          'minutes',
          <Chips
            name="dailyWorkoutMinutes"
            label="하루 운동 시간"
            options={WORKOUT_MINUTES_CHOICES.map((m) => ({
              value: String(m),
              label: `${m}분`,
            }))}
            value={a.dailyWorkoutMinutes}
            onChange={(dailyWorkoutMinutes) => w.patch({ dailyWorkoutMinutes })}
            invalid={invalid('dailyWorkoutMinutes')}
            hint="암케어는 이 시간에 안 들어가요. 따로 해요."
          />
        )}

        {askHand &&
          panel(
            'hand',
            <Chips
              name="throwingHand"
              label="던지는 손"
              options={THROWING_HANDS.map((h) => ({ value: h, label: h }))}
              value={a.throwingHand}
              onChange={(throwingHand) => w.patch({ throwingHand })}
              invalid={invalid('throwingHand')}
            />
          )}

        {hasWeight &&
          panel(
            'burnCard',
            <BurnInsert weightKg={weightKg} active={step === 'burnCard'} />
          )}

        {panel(
          'summary',
          <div className="space-y-4">
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface-2/60 px-4">
              {trainingAnswerLines(a, { askHand }).map((l, i) => (
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
            {/* 근력 · 파워 프로그램 자격 — 시작 자격과 같은 글(lib/program/program.ts) */}
            <p className="rounded-2xl border border-sky/30 bg-sky/5 px-4 py-3 text-sm leading-relaxed break-keep text-ink">
              {programNote(a, age, basicsDone)}
            </p>
            <p className="text-xs leading-relaxed break-keep text-muted">
              저장하면 오늘 운동 일정을 바로 만들 수 있어요. 일정은 체크인을 남긴 날에
              만들어요.
            </p>
          </div>
        )}

        {w.problem && <ProblemLine seq={w.seq}>{w.problem.error}</ProblemLine>}
      </StepCard>
    </div>
  );
}
