'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  ARMCARE_LEVEL_RULES,
  ARMCARE_METHODS,
  methodOf,
  type ArmcareMethod,
  type ArmcareMethodKey,
} from '@/lib/armcare/methods';
import type { ArmcareExerciseView } from './armcare-media';
import { GuideExercise } from './armcare-guide';
import { MyRoutinesProvider, type RoutineChoice } from './add-to-routine';

/**
 * 훈련 방식 — 같은 근육을 어떻게 힘 쓰며 키우는가, 그리고 어느 차례로 올라가는가.
 *
 * 2026-09-26 사용자분이 고른 두 가지를 한 화면에 담았다: 방식마다 무엇·왜·어떻게를
 * 적은 설명(1)과, 가벼운 방식에서 무거운 방식으로 한 칸씩 올라가는 계단(2).
 * 글은 lib/armcare/methods.ts 에 있다.
 *
 * 부위별 보강과 같은 움직임이다 — 방식을 누르면 그 자리에서 펼치고, 한 번에 하나만.
 * 계단의 칸을 눌러도 그 방식이 펼쳐진다.
 */
export function ArmcareMethods({
  exercises,
  routines,
}: {
  exercises: ArmcareExerciseView[];
  /** 내 루틴 — 운동마다 '담기'로 넣을 곳 (add-to-routine.tsx) */
  routines: RoutineChoice[];
}) {
  const [open, setOpen] = useState<ArmcareMethodKey | null>(null);

  const byMethod = new Map<ArmcareMethodKey, ArmcareExerciseView[]>(
    ARMCARE_METHODS.map((m) => [m.key, []])
  );
  for (const ex of exercises) byMethod.get(methodOf(ex.title).key)!.push(ex);

  const openFromStair = (key: ArmcareMethodKey) => {
    setOpen(key);
    /* 펼친 카드가 화면 밖이면 끌어온다 — 휴대폰에서는 다섯째 칸이 한참 아래다 */
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document
        .getElementById(`method-${key}`)
        ?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
  };

  return (
    <MyRoutinesProvider routines={routines}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed break-keep text-muted">
          같은 근육이라도 힘을 쓰는 방식에 따라 몸이 익히는 것이 다릅니다. 아래 다섯
          가지는 부담이 적은 것부터 큰 것 차례입니다. 한 칸씩 올라가세요.
        </p>

        <section className="space-y-3">
          <h2 className="px-1 text-heading text-lg text-ink">단계 올리기</h2>
          <Stairs onPick={openFromStair} current={open} />
          <dl className="space-y-2 rounded-2xl border border-line bg-surface px-4 py-3.5">
            <Rule term="올라갈 때" text={ARMCARE_LEVEL_RULES.up} />
            <Rule term="내려갈 때" text={ARMCARE_LEVEL_RULES.down} />
            <Rule term="올라가도" text={ARMCARE_LEVEL_RULES.keep} />
          </dl>
        </section>

        <section className="space-y-2.5">
          <h2 className="px-1 text-heading text-lg text-ink">방식별로 보기</h2>
          <ul className="space-y-2.5">
            {ARMCARE_METHODS.map((m, i) => (
              <MethodCard
                key={m.key}
                method={m}
                step={i + 1}
                exercises={byMethod.get(m.key)!}
                open={open === m.key}
                onToggle={() => setOpen(open === m.key ? null : m.key)}
              />
            ))}
          </ul>
        </section>
      </div>
    </MyRoutinesProvider>
  );
}

/**
 * 계단 — 칸이 오를수록 높아진다. 차례가 곧 내용이라 번호를 붙인다.
 *
 * 다섯 칸을 한 줄에 둔다. 휴대폰 폭에서도 칸마다 60px 남짓이 남아, 이름이 두 줄로
 * 꺾일 뿐 넘치지 않는다.
 */
function Stairs({
  onPick,
  current,
}: {
  onPick: (key: ArmcareMethodKey) => void;
  current: ArmcareMethodKey | null;
}) {
  const n = ARMCARE_METHODS.length;
  return (
    <ol className="grid grid-cols-5 items-end gap-1.5" aria-label="단계 올리기 차례">
      {ARMCARE_METHODS.map((m, i) => {
        const selected = current === m.key;
        return (
          <li key={m.key}>
            <button
              type="button"
              onClick={() => onPick(m.key)}
              aria-label={`${i + 1}단계 ${m.label} 설명 보기`}
              className="group flex w-full flex-col items-stretch gap-1.5 rounded-lg text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
            >
              <span
                className={`flex items-start justify-center rounded-md pt-1 text-xs font-bold tabular-nums transition-colors ${
                  selected
                    ? 'bg-sky text-white'
                    : 'bg-sky-tint text-sky-strong group-hover:bg-sky-soft'
                }`}
                style={{ height: `${20 + (i * 44) / (n - 1)}px` }}
              >
                {i + 1}
              </span>
              <span
                className={`min-h-8 text-[11px] leading-tight font-semibold break-keep ${
                  selected ? 'text-ink' : 'text-muted group-hover:text-ink'
                }`}
              >
                {m.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Rule({ term, text }: { term: string; text: string }) {
  return (
    <div className="flex gap-3 text-[13px] leading-relaxed break-keep">
      <dt className="w-16 shrink-0 font-semibold text-sky-strong">{term}</dt>
      <dd className="text-muted">{text}</dd>
    </div>
  );
}

function MethodCard({
  method: m,
  step,
  exercises,
  open,
  onToggle,
}: {
  method: ArmcareMethod;
  step: number;
  exercises: ArmcareExerciseView[];
  open: boolean;
  onToggle: () => void;
}) {
  /*
   * 기본 보강은 나머지 암케어 운동 전부라 여든 개가 넘는다. 여기 다 늘어놓으면 이
   * 화면이 부위별 보강을 한 벌 더 들고 있게 된다 — 부위별로 보라고 보낸다.
   */
  const listed = m.key !== 'basic';

  return (
    <li
      id={`method-${m.key}`}
      className={`scroll-mt-20 overflow-hidden rounded-2xl border transition-colors ${
        open ? 'border-sky-soft bg-surface' : 'border-line bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold text-sky-strong tabular-nums">
              {step}단계
            </span>
            <span className="text-[15px] font-bold text-ink">{m.label}</span>
            <span className="text-xs text-muted">운동 {exercises.length}개</span>
          </span>
          <span className="block text-[13px] leading-relaxed break-keep text-muted">
            {m.what}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <Part title="왜 하나요" text={m.why} />
          <Part title="무게 고르기" text={m.load} />
          <Part title="세트·횟수" text={m.dose} />
          <Part title="이럴 땐 멈추거나 줄이기" text={m.stop} />

          {m.caution && (
            <p className="rounded-xl border border-warn-line bg-warn-bg px-3.5 py-3 text-[13px] leading-relaxed break-keep text-warn">
              {m.caution}
            </p>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted">운동</h3>
            {!listed ? (
              <p className="text-[13px] leading-relaxed break-keep text-muted">
                이름에 방식이 붙지 않은 암케어 운동은 모두 기본 보강입니다.{' '}
                <Link
                  href="/training?view=armcare&tab=guide"
                  className="font-semibold text-sky-strong underline underline-offset-2"
                >
                  부위별 보강
                </Link>
                에서 부위마다 볼 수 있습니다.
              </p>
            ) : exercises.length === 0 ? (
              <p className="text-[13px] text-muted">이 방식의 운동이 아직 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {exercises.map((ex) => (
                  <GuideExercise key={ex.id} exercise={ex} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Part({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted">{title}</h3>
      <p className="text-[13px] leading-relaxed break-keep text-ink/80">{text}</p>
    </div>
  );
}
