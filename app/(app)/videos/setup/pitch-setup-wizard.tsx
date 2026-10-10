'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Button, Input } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { useSpeedUnit } from '@/components/use-units';
import { Chips } from '@/components/onboarding/choices';
import { CountUp } from '@/components/onboarding/count-up';
import { PitchCapInsert } from '@/components/onboarding/insert-cards';
import {
  INPUT_LARGE,
  ProblemLine,
  StepCard,
  TextButton,
  invalidProps,
} from '@/components/onboarding/step-card';
import { useStepWizard } from '@/components/onboarding/use-step-wizard';
import { useSyncedText } from '@/components/onboarding/use-synced-text';
import { finishPitchSetup } from '@/app/actions/pitch-setup';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  THROWING_HANDS,
  estimateDailyLoad,
} from '@/lib/baseline';
import {
  checkPitchStep,
  pitchStepOfField,
  toPitchFormFields,
  visiblePitchSteps,
  type PitchSetupAnswers,
  type PitchStepKey,
} from '@/lib/pitching/setup-answers';
import {
  SPEED_UNITS,
  applySpeedUnit,
  fromSpeed,
  round1,
  speedLabel,
  toSpeed,
  type SpeedUnit,
} from '@/lib/units';
import { TARGET_VELOCITY_MAX, TARGET_VELOCITY_MIN } from '@/lib/velocity';

/**
 * 투구 기록 첫 설정 화면 — 하루 투구 한도(끼움) → 던지는 손 → 평소 투구량 → 목표 구속 → 요약 → 저장.
 * 한 화면에 한 질문(components/onboarding StepCard, brand 없음) — 영양 첫 설정(app/(app)/nutrition/setup/setup-wizard.tsx)과
 * 같은 모양이고, 뼈대는 useStepWizard(components/onboarding/use-step-wizard.ts). 던지는 손 · 투구량 화면의 글과 모양은
 * 가입 마법사에 있던 것을 그대로 옮겼다(2026-10-09, lib/feature-locks.ts).
 *
 * 답은 상태로 쥐고 한 번에 보낸다(finishPitchSetup). 서버가 막으면 그 칸의 화면으로 돌아간다.
 * 저장이 끝나면 투구 기록 탭으로 — 잠금이 걷히고 탭 페이지가 사용법 튜토리얼을 한 번 띄운다(app/(app)/videos/page.tsx).
 *
 * done — 이미 한 번 마친 사람(다시 들어와 고치는 중)인가. 요약의 말과 단추 글자, 첫 화면의 탈출이 다르다 — 처음 온
 * 사람은 투구 기록 탭이 잠겨 있어 '그만두기'로 /videos 에 가면 다시 여기로 돌아오니, 대신 '홈으로'(/today)를 보인다.
 * 탈출은 영양 · 트레이닝 마법사처럼 첫 화면 단추 줄의 왼쪽이다(머리의 BackLink 는 휴대폰에서 위 막대로 올라가 카드 밖에 선다).
 */

export function PitchSetupWizard({
  name,
  age,
  done,
  initial,
}: {
  name: string;
  /** 만 나이 — 하루 투구 한도 카드. 생년월일을 모르면 null */
  age: number | null;
  done: boolean;
  /** 계정에 저장된 값으로 채운 답(없으면 빈 답) */
  initial: PitchSetupAnswers;
}) {
  const router = useRouter();
  const unit = useSpeedUnit();
  const w = useStepWizard<PitchStepKey, PitchSetupAnswers>({
    initial,
    steps: visiblePitchSteps,
    check: checkPitchStep,
    stepOfField: pitchStepOfField,
  });
  const { answers: a, step, index, total, focusField } = w;
  const last = total - 1;
  const [pending, startTransition] = useTransition();
  /* 방금 화면을 옮겼나 — 그린 뒤 위로 굴리고 첫 칸으로 초점을 보낸다(첫 그림에서는 안 한다) */
  const moved = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = estimateDailyLoad(a);
  const invalid = (field: string) => w.problem?.field === field;
  const who = name ? `${name} 님, ` : '';

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rootRef.current?.scrollIntoView({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    });
    const panel = rootRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (!panel) return;
    /* 글 칸이 있으면 거기로(목표 구속 — 단위 고르개보다 먼저), 아니면 고르는 묶음의 고른 단추로 */
    const input = panel.querySelector<HTMLElement>('input:not([type=hidden])');
    if (input) return input.focus({ preventScroll: true });
    const group = panel.querySelector<HTMLElement>('[data-field]');
    if (group?.dataset.field !== undefined) focusField(group.dataset.field);
  }, [step, focusField]);

  function next() {
    moved.current = true;
    w.next();
  }
  function back() {
    moved.current = true;
    w.back();
  }
  /* '아직 몰라요' — 목표를 비우고 요약으로. 검사 없이 넘어가므로 적다 만 글자가 막지 않는다 */
  function skipTarget() {
    w.patch({ targetVelocity: '' });
    moved.current = true;
    w.goTo('summary');
  }

  function save() {
    for (const key of w.visible) {
      const bad = checkPitchStep(key, a);
      if (bad) {
        moved.current = true;
        w.setProblem(bad);
        return;
      }
    }
    w.setProblem(null);
    startTransition(async () => {
      const res = await orOffline(finishPitchSetup(toPitchFormFields(a)), {
        ok: false as const,
        error: OFFLINE_MESSAGE,
      });
      if (res.ok) {
        router.push('/videos');
        router.refresh();
        return;
      }
      moved.current = true;
      w.setProblem({
        error: res.error,
        field: 'field' in res && res.field ? res.field : 'summary',
      });
    });
  }

  function titleOf(key: PitchStepKey): { title: string; desc?: string } {
    switch (key) {
      case 'capCard':
        return {
          title: `${who}먼저 하루 투구 한도예요`,
          desc:
            age === null
              ? '나이로 정해지는 숫자예요. 내 정보에 생년월일을 적으면 나이에 맞는 한도로 바뀌어요. 투구를 적기 시작하면 홈이 오늘 던질 수 있는 양과 쉬어야 할 날을 알려 드려요. 그러려면 세 가지만 물을게요.'
              : '나이로 정해지는 숫자예요. 투구를 적기 시작하면 홈이 오늘 던질 수 있는 양과 쉬어야 할 날을 알려 드려요. 그러려면 세 가지만 물을게요.',
        };
      case 'hand':
        return {
          title: '던지는 손은 어느 쪽이에요?',
          desc: '투구 분석과 암케어가 어느 팔을 볼지 정해요.',
        };
      case 'pitching':
        return {
          title: '평소 얼마나 던져요?',
          desc: '셋을 고르면 첫날부터 투구 부하 지수를 낼 수 있어요. 기록이 쌓이면 이 답은 자리를 비켜요.',
        };
      case 'target':
        return {
          title: '목표 구속이 있어요?',
          desc: '있으면 적어 주세요. 구속을 적을 때마다 목표까지 얼마나 남았는지 보여 드려요. 없으면 비워 두어도 돼요.',
        };
      case 'summary':
        return {
          title: `${name ? `${name} 님의 ` : ''}투구 기록 설정이에요`,
          desc: done
            ? '저장하면 투구 기록 탭과 홈이 이 값으로 셈해요. 언제든 내 정보에서 고칠 수 있어요.'
            : '시작하면 투구 기록 탭이 열려요. 언제든 내 정보에서 고칠 수 있어요.',
        };
    }
  }
  const heading = titleOf(step);
  const enter =
    w.dir === 'next'
      ? 'motion-safe:animate-step-next'
      : 'motion-safe:animate-step-back';
  /* 화면 한 칸 — 지금 것만 보인다. 숨었다 보이는 순간 들어오는 움직임이 다시 돈다. */
  const panel = (key: PitchStepKey, children: ReactNode) => (
    <div
      key={key}
      data-step={key}
      hidden={key !== step}
      className={key === step ? enter : undefined}
    >
      {children}
    </div>
  );

  const targetText =
    a.targetVelocity.trim() === ''
      ? '아직 없어요'
      : `${round1(toSpeed(Number(a.targetVelocity), unit))}${speedLabel(unit)}`;
  const lines: { label: string; value: string }[] = [
    { label: '던지는 손', value: a.throwingHand ?? '아직 안 골랐어요' },
    {
      label: '평소 던지는 양',
      value:
        [a.baselineFreq, a.baselineVolume, a.baselineIntensity]
          .filter(Boolean)
          .join(' · ') || '아직 안 골랐어요',
    },
    { label: '목표 구속', value: targetText },
  ];

  return (
    <div ref={rootRef} className="flex min-h-[calc(100dvh-9rem)] flex-col scroll-mt-4">
      <StepCard
        titleKey={step}
        title={heading.title}
        desc={heading.desc}
        progress={(index + 1) / total}
        counter={`${index + 1} / ${total}`}
        brand={null}
        footer={
          <>
            {index === 0 ? (
              /* 처음 온 사람은 투구 기록 탭이 잠겨 있어 /videos 가 다시 여기로 보낸다 — 홈으로 */
              <TextButton onClick={() => router.push(done ? '/videos' : '/today')}>
                {done ? '그만두기' : '홈으로'}
              </TextButton>
            ) : (
              <TextButton onClick={back} disabled={pending}>
                이전
              </TextButton>
            )}
            {index < last ? (
              <Button type="button" onClick={next} className="min-w-28">
                다음
              </Button>
            ) : (
              <Button
                type="button"
                onClick={save}
                disabled={pending}
                className="min-w-28"
              >
                {pending ? '저장하는 중…' : done ? '저장하기' : '시작하기'}
              </Button>
            )}
          </>
        }
      >
        <p className="sr-only" aria-live="polite">
          {`${total}단계 중 ${index + 1}단계, ${heading.title}`}
        </p>

        {/* ── 끼움: 하루 투구 한도 — 이 설정을 왜 하는지 ── */}
        {panel('capCard', <PitchCapInsert age={age} active={step === 'capCard'} />)}

        {/* ── 던지는 손 ── */}
        {panel(
          'hand',
          <Chips
            name="throwingHand"
            label="던지는 손"
            options={THROWING_HANDS.map((h) => ({ value: h, label: h }))}
            value={a.throwingHand}
            onChange={(throwingHand) => w.patch({ throwingHand })}
            invalid={invalid('throwingHand')}
            hint="양투는 둘 다 던지는 선수예요."
          />
        )}

        {/* ── 평소 투구량 — 이 답으로 부하 지수를 첫날부터 계산한다 ── */}
        {panel(
          'pitching',
          <div className="space-y-5">
            <Chips
              name="baselineFreq"
              legend="던지는 횟수"
              options={BASELINE_FREQ_NAMES.map((n) => ({ value: n, label: n }))}
              value={a.baselineFreq}
              onChange={(baselineFreq) => w.patch({ baselineFreq })}
              invalid={invalid('baselineFreq')}
            />
            <Chips
              name="baselineVolume"
              legend="한 번에 던지는 양"
              options={BASELINE_VOLUME_NAMES.map((n) => ({ value: n, label: n }))}
              value={a.baselineVolume}
              onChange={(baselineVolume) => w.patch({ baselineVolume })}
              invalid={invalid('baselineVolume')}
            />
            <Chips
              name="baselineIntensity"
              legend="평소 강도"
              options={BASELINE_INTENSITY_NAMES.map((n) => ({ value: n, label: n }))}
              value={a.baselineIntensity}
              onChange={(baselineIntensity) => w.patch({ baselineIntensity })}
              invalid={invalid('baselineIntensity')}
            />
            {/*
             * 셋을 다 고르는 순간 칩 밑에 생기는 카드 — 옅어지기만 짧게(animate-fade-in 160ms). 누르던 칩 바로 밑이라
             * 밀려 올라오는 움직임(가입 화면에서 옮겨 온 rise-in)은 눈을 끈다. 화면 전체로 들어오는 끼움 카드(InsertCard)는
             * 공용 부품 쪽의 것이라 여기서 손대지 않는다.
             */}
            {load !== null && (
              <div className="motion-safe:animate-fade-in rounded-2xl border border-sky/25 bg-sky/5 px-4 py-3">
                <p className="text-xs font-medium text-sky-strong">평소 하루 부하</p>
                <p className="text-heading mt-1 text-2xl text-ink">
                  <CountUp value={load} active={step === 'pitching'} />
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    횟수 × 구수 × 강도 ÷ 7
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed break-keep text-muted">
                  첫날부터 이 값에서 투구 부하 지수를 시작해요. 기록이 쌓일수록 이
                  짐작은 자리를 비켜요.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 목표 구속 — 안 적어도 된다 ── */}
        {panel(
          'target',
          <div className="space-y-4">
            <TargetVelocityField
              value={a.targetVelocity}
              onChange={(targetVelocity) => w.patch({ targetVelocity })}
              invalid={invalid('targetVelocity')}
            />
            <div className="flex items-center gap-3">
              <TextButton onClick={skipTarget}>아직 몰라요</TextButton>
              <span className="text-xs leading-relaxed break-keep text-muted">
                목표 없이 시작해요. 내 정보에서 언제든 정할 수 있어요.
              </span>
            </div>
          </div>
        )}

        {/* ── 요약 ── */}
        {panel(
          'summary',
          <div className="space-y-4">
            {load !== null && (
              <div className="rounded-2xl border border-sky/30 bg-sky/5 px-4 py-3">
                <p className="text-xs font-medium text-sky-strong">평소 하루 부하</p>
                <p className="text-heading mt-1 text-3xl text-ink">
                  <CountUp value={load} active={step === 'summary'} />
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    횟수 × 구수 × 강도 ÷ 7
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed break-keep text-muted">
                  투구 부하 지수가 첫날부터 이 값에서 시작해요.
                </p>
              </div>
            )}
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface-2/60 px-4">
              {lines.map((l, i) => (
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
              {done
                ? '저장하면 내 정보의 같은 칸도 이 값으로 바뀌어요.'
                : '시작하면 투구 기록 탭이 열리고, 사용법을 짧게 안내해요.'}
            </p>
          </div>
        )}

        {w.problem && <ProblemLine seq={w.seq}>{w.problem.error}</ProblemLine>}
      </StepCard>
    </div>
  );
}

/**
 * 목표 구속 칸 — 보이는 숫자는 고른 단위(km/h｜mph), 쥐는 값은 늘 정수 km/h(내 정보의 칸, app/(app)/profile/profile-form.tsx
 * TargetVelocityField 와 같은 규칙 — 이 칸은 Int 로 저장되고 서버도 정수만 받는다, lib/velocity.ts).
 *
 * 단위는 설정의 단위 고르기와 같은 저장소(lib/units.ts)라 여기서 바꾸면 앱 전체가 따라 바뀐다.
 * 치는 동안의 글자는 그대로 둔다 — mph 로 적은 90 을 정수 km/h 로 바꿨다 되돌려 보이면 90.1 이 되어 적은 적 없는 숫자가
 * 된다. 단위를 바꾸면 그때 바뀐 단위의 숫자로 다시 보인다(useSyncedText). 흘려 친 글("7a")만 비운다.
 */
function TargetVelocityField({
  value,
  onChange,
  invalid,
}: {
  /** 정수 km/h 글자. '' 은 빈칸 */
  value: string;
  onChange: (kmh: string) => void;
  invalid: boolean;
}) {
  const unit = useSpeedUnit();
  const [focused, setFocused] = useState(false);
  const fmt = (kmh: string) =>
    kmh.trim() === '' ? '' : String(round1(toSpeed(Number(kmh), unit)));
  const [text, setText] = useSyncedText(fmt(value), focused);

  function edit(next: string) {
    setText(next);
    const trimmed = next.trim();
    if (trimmed === '') return onChange('');
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return onChange('');
    onChange(String(Math.round(fromSpeed(n, unit))));
  }

  const range = `${round1(toSpeed(TARGET_VELOCITY_MIN, unit))}~${round1(
    toSpeed(TARGET_VELOCITY_MAX, unit)
  )}${speedLabel(unit)}`;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <label
          htmlFor="targetVelocity-field"
          className="text-xs font-medium text-muted"
        >
          목표 구속
        </label>
        <Segmented
          label="구속 단위"
          value={unit}
          onChange={(v: SpeedUnit) => applySpeedUnit(v)}
          options={SPEED_UNITS.map((u) => ({
            value: u.value,
            label: u.label,
            hint: u.hint,
          }))}
          size="sm"
          className="w-32"
          itemClassName="py-1"
        />
      </div>
      <div className="relative">
        <Input
          id="targetVelocity-field"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => edit(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (!Number.isFinite(Number(text.trim()))) setText(fmt(value));
          }}
          placeholder={fmt('140')}
          className={`${INPUT_LARGE} pr-16 text-lg tabular-nums`}
          {...invalidProps(invalid)}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted"
        >
          {speedLabel(unit)}
        </span>
      </div>
      <p className="text-xs leading-relaxed break-keep text-muted/80">
        {range} 사이로 적어 주세요. 저장은 km/h 정수로 해요.
      </p>
    </div>
  );
}
