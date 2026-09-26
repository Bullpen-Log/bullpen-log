'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Play, RefreshCw } from 'lucide-react';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { makeArmcareRoutine } from '@/app/actions/armcare';
import { ExerciseBadges } from '@/components/meta-badges';
import { findArmcareArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { ARMCARE_KIND_TEXT, type ArmcareKind } from '@/lib/armcare/routine';
import { MuscleChips } from '@/components/muscle-chips';
import { ExerciseMedia, type ArmcareExerciseView } from './armcare-media';

export type ArmcareTodayItem = {
  area: ArmcareAreaKey;
  exercise: ArmcareExerciseView;
  done: boolean;
  /** 만든 뒤 몸 상태가 바뀌어 지금은 권하지 않는 운동인가 (아직 안 한 것만) */
  unsafe: boolean;
};

/**
 * 맞춤 루틴 — 오늘 몸 상태로 권하는 루틴, 만들기, 체크.
 *
 * 2026-09-26 이름을 '오늘의 암케어'에서 '맞춤 루틴'으로 바꿨다. 사용자가 직접 골라
 * 만드는 '내 루틴'(my-routines.tsx)이 같은 칸에 함께 서면서, 앱이 짜 준 것과 내가
 * 짠 것을 이름으로 가르기 위해서다.
 *
 * 체크만 한다. 세트·횟수를 적는 실시간 기록은 없다(사용자분과 정함). 체크는
 * 트레이닝 목록과 같은 운동 기록에 남아 달력과 운동별 기록에 보인다
 * (app/actions/exercise-log.ts 의 setExerciseDone).
 */
export function ArmcareToday({
  decision,
  routine,
}: {
  /** 지금 몸 상태로 권하는 루틴과 그 까닭 */
  decision: { kind: ArmcareKind; reason: string };
  /** 오늘 만들어 둔 루틴. 없으면 아직 안 만든 날 */
  routine: {
    kind: ArmcareKind;
    reason: string;
    notes: string[];
    estimatedMinutes: number;
    items: ArmcareTodayItem[];
  } | null;
}) {
  const [making, startMaking] = useTransition();
  const [error, setError] = useState<string>();

  const make = () => {
    setError(undefined);
    startMaking(async () => {
      const res = await makeArmcareRoutine();
      if ('error' in res) setError(res.error);
    });
  };

  const suggested = ARMCARE_KIND_TEXT[decision.kind];

  if (!routine) {
    return (
      <div className="space-y-3">
        <section className="space-y-3 rounded-2xl border border-sky-soft/40 bg-gradient-to-br from-sky/[0.07] via-surface to-surface p-5 sm:p-6">
          <p className="text-heading text-xl text-ink">
            오늘은 {suggested.label}을 권합니다
          </p>
          <p className="text-sm font-semibold break-keep text-sky-strong">
            {decision.reason}
          </p>
          <button
            type="button"
            onClick={make}
            disabled={making}
            className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-60"
          >
            {making ? '만드는 중…' : '맞춤 루틴 만들기'}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </section>
      </div>
    );
  }

  const label = ARMCARE_KIND_TEXT[routine.kind].label;
  /*
   * 만든 뒤에 몸 상태가 바뀌었는가 — 아침에 강화로 만들고 오후에 던졌다면 지금은
   * 회복이 맞다. 루틴 종류는 그대로여도 오후에 어깨가 뻐근해졌다면 몇 개는 이제
   * 권하지 않는다(unsafe). 말없이 바꾸지 않는다(한 것을 지우지 않으려고). 알리고,
   * 다시 만들지는 본인이 정한다.
   */
  const kindChanged = routine.kind !== decision.kind;
  const unsafeCount = routine.items.filter((it) => it.unsafe).length;

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-2xl border border-sky-soft/40 bg-gradient-to-br from-sky/[0.07] via-surface to-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-heading text-xl text-ink">오늘의 {label}</p>
          <p className="text-sm text-muted">
            <span className="text-display text-base text-ink">
              {routine.items.length}
            </span>
            개 · 약{' '}
            <span className="text-display text-base text-ink">
              {routine.estimatedMinutes}
            </span>
            분
          </p>
        </div>
        <p className="text-sm font-semibold break-keep text-sky-strong">
          {routine.reason}
        </p>
        {/* 빠진 부위 같은 안내는 접어 둔다 — 늘 보일 만큼 급하지 않다 */}
        {routine.notes.length > 0 && (
          <details className="group text-xs text-muted">
            <summary className="cursor-pointer list-none font-semibold">
              안내 {routine.notes.length}개 <span className="group-open:hidden">▾</span>
            </summary>
            <ul className="mt-1.5 space-y-1">
              {routine.notes.map((note) => (
                <li key={note} className="leading-relaxed break-keep">
                  {note}
                </li>
              ))}
            </ul>
          </details>
        )}
        {(kindChanged || unsafeCount > 0) && (
          <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed break-keep text-warn">
            {kindChanged
              ? `몸 상태가 바뀌었어요 — 지금은 ${suggested.label}이 맞아요.`
              : `몸 상태가 바뀌어 무리인 운동이 ${unsafeCount}개 있어요.`}{' '}
            다시 만들어도 체크한 것은 남아요.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-sky-soft/30 pt-3">
          {/* 한 운동씩 크게 따라 하기 — 목록을 읽지 않아도 된다 (armcare/play) */}
          <Link
            href="/armcare/play/today"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
          >
            <Play aria-hidden className="h-4 w-4" />
            따라하기
          </Link>
          <button
            type="button"
            onClick={make}
            disabled={making}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky disabled:opacity-60"
          >
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            {making ? '만드는 중…' : '다시 만들기'}
          </button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </section>

      <Checklist items={routine.items} />
    </div>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 이번 주 암케어 — 최근 7일(오늘 포함)을 점 7개로.
 *
 * 예전에는 '최근 7일 중 암케어를 한 날 N일'이라는 글 한 줄이었다. 매일 하는 것이
 * 목표라, 빈 날이 어디인지 눈으로 보이는 편이 낫다(2026-09-26, 글 대신 그림).
 * 맞춤 루틴이든 내 루틴이든 암케어 운동을 하나라도 체크한 날을 칠한다.
 */
export function WeekDots({ week }: { week: { key: string; done: boolean }[] }) {
  const days = week.filter((d) => d.done).length;
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink">이번 주 암케어</span>
        <span className="text-muted">
          <b className="text-display text-base text-ink tabular-nums">{days}</b>/7일
        </span>
      </p>
      <ol
        className="mt-3 grid grid-cols-7 gap-1 text-center"
        aria-label={`최근 7일 중 ${days}일`}
      >
        {week.map((d, i) => {
          const [y, m, dd] = d.key.split('-').map(Number);
          const isToday = i === week.length - 1;
          return (
            <li key={d.key} className="space-y-1">
              <span
                className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${
                  d.done
                    ? 'bg-sky text-white'
                    : isToday
                      ? 'border-2 border-dashed border-sky-soft text-muted'
                      : 'bg-surface-2 text-muted'
                }`}
              >
                {d.done ? '✓' : ''}
              </span>
              <span
                className={`block text-[11px] ${isToday ? 'font-bold text-ink' : 'text-muted'}`}
              >
                {isToday ? '오늘' : WEEKDAYS[new Date(y, m - 1, dd).getDay()]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * 체크 목록 — 맞춤 루틴과 내 루틴이 함께 쓴다.
 *
 * 맞춤 루틴은 부위 차례로 담겨 와서 부위별로 묶어 보여 준다. 내 루틴은 사람이 정한
 * 차례가 곧 하는 차례라 묶지 않는다(grouped={false}).
 */
export function Checklist({
  items: initial,
  grouped = true,
  doneLabel = '오늘 암케어 끝',
}: {
  items: ArmcareTodayItem[];
  grouped?: boolean;
  /** 다 체크했을 때 붙는 말 */
  doneLabel?: string;
}) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  /* 부모가 새 목록을 주면(다시 만들기) 그것을 따른다 */
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  const toggle = (id: string) => {
    const target = items.find((it) => it.exercise.id === id);
    if (!target) return;
    const next = !target.done;
    /* 체크할 때 짧게 떨려 손에 '됐다'가 느껴지게 — 풀 때는 조용히 */
    if (next && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
    setItems((prev) =>
      prev.map((it) => (it.exercise.id === id ? { ...it, done: next } : it))
    );
    setError(undefined);
    startTransition(async () => {
      const res = await setExerciseDone(id, next);
      if ('error' in res) {
        setItems((prev) =>
          prev.map((it) => (it.exercise.id === id ? { ...it, done: !next } : it))
        );
        setError(res.error);
      }
    });
  };

  const doneCount = items.filter((it) => it.done).length;
  const allDone = items.length > 0 && doneCount === items.length;

  /* 부위별로 묶는다 — 맞춤 루틴은 이미 부위 차례로 담겨 온다. 안 묶으면 한 덩이 */
  const groups: { area: ArmcareAreaKey | null; items: ArmcareTodayItem[] }[] = [];
  for (const it of items) {
    const last = groups.at(-1);
    if (!grouped) {
      if (last) last.items.push(it);
      else groups.push({ area: null, items: [it] });
    } else if (last && last.area === it.area) last.items.push(it);
    else groups.push({ area: it.area, items: [it] });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-ink">
            <span className="text-display text-lg">{doneCount}</span>
            <span className="text-muted">/{items.length}</span> 완료
          </p>
          {allDone && (
            <span className="finish-pop inline-flex items-center gap-1 rounded-full bg-sky px-2.5 py-1 text-xs font-bold text-white">
              <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
              {doneLabel}
            </span>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-sky transition-[width] duration-300"
            style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {groups.map((group) => {
        const area = findArmcareArea(group.area);
        return (
          <section
            key={`${group.area ?? 'all'}-${group.items[0].exercise.id}`}
            className="space-y-2.5"
          >
            {area && (
              <div className="flex flex-wrap items-baseline gap-x-2 px-1">
                <h2 className="flex items-center gap-2 text-heading text-[15px] text-ink">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  {area.label}
                </h2>
              </div>
            )}
            <ul className="space-y-2.5">
              {group.items.map(({ exercise: ex, done, unsafe }) => (
                <li
                  key={ex.id}
                  className={`overflow-hidden rounded-2xl border transition-colors ${
                    done ? 'border-sky bg-sky-tint' : 'border-line bg-surface'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(ex.id)}
                    aria-pressed={done}
                    className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors ${
                      done ? '' : 'hover:bg-surface-2'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        done ? 'border-sky bg-sky text-white' : 'border-line-strong'
                      }`}
                    >
                      {done && (
                        <Check className="finish-pop h-3.5 w-3.5" strokeWidth={3} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                          className={`text-[15px] font-bold tracking-[-0.01em] break-keep ${
                            done ? 'text-sky-strong' : 'text-ink'
                          }`}
                        >
                          {ex.title}
                        </span>
                        {ex.isReference && (
                          <span className="text-[10px] font-medium text-muted">
                            참고 영상
                          </span>
                        )}
                      </span>
                      {ex.prescription && (
                        <span
                          className={`block text-xs font-semibold ${
                            done ? 'text-sky-strong' : 'text-muted'
                          }`}
                        >
                          {ex.prescription}
                        </span>
                      )}
                      <MuscleChips muscles={ex.targetMuscles} max={2} />
                      <ExerciseBadges
                        bodyParts={[]}
                        intensity={ex.intensity}
                        difficulty={ex.difficulty}
                        equipment={ex.equipment}
                      />
                      {unsafe && !done && (
                        <span className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
                          <AlertTriangle
                            aria-hidden
                            className="mt-0.5 h-3 w-3 shrink-0"
                          />
                          지금 몸 상태에는 권하지 않는 운동입니다
                        </span>
                      )}
                    </span>
                    {ex.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ex.thumbUrl}
                        alt=""
                        className="h-14 w-20 shrink-0 rounded-xl object-cover ring-1 ring-line sm:h-16 sm:w-24"
                      />
                    )}
                  </button>
                  <ExerciseMedia
                    exercise={ex}
                    muscleHref={
                      ex.targetMuscles[0]
                        ? `/training?view=armcare&tab=guide&muscle=${encodeURIComponent(ex.targetMuscles[0])}`
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
