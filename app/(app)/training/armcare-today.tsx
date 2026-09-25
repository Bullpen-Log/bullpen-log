'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
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
 * 오늘의 암케어 — 권하는 루틴, 만들기, 체크.
 *
 * 체크만 한다. 세트·횟수를 적는 실시간 기록은 없다(사용자분과 정함). 체크는
 * 트레이닝 목록과 같은 운동 기록에 남아 달력과 운동별 기록에 보인다
 * (app/actions/exercise-log.ts 의 setExerciseDone).
 */
export function ArmcareToday({
  decision,
  routine,
  recentDays,
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
  /** 최근 7일(오늘 포함) 중 암케어를 한 날 */
  recentDays: number;
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
          <p className="text-sm leading-relaxed break-keep text-muted">
            {suggested.desc}
          </p>
          <button
            type="button"
            onClick={make}
            disabled={making}
            className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-60"
          >
            {making ? '만드는 중…' : '오늘의 암케어 만들기'}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </section>
        <RecentLine days={recentDays} />
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
          <p className="text-heading text-xl text-ink">오늘의 암케어 · {label}</p>
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
        {routine.notes.map((note) => (
          <p key={note} className="text-xs leading-relaxed break-keep text-muted">
            {note}
          </p>
        ))}
        {(kindChanged || unsafeCount > 0) && (
          <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed break-keep text-warn">
            {kindChanged
              ? `만든 뒤에 몸 상태가 바뀌었습니다. 지금은 ${suggested.label}을 권합니다 — ${decision.reason}.`
              : `만든 뒤에 몸 상태가 바뀌어, 지금은 권하지 않는 운동이 ${unsafeCount}개 있습니다(아래에 표시).`}{' '}
            다시 만들면 바뀝니다(체크한 것은 남습니다).
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-sky-soft/30 pt-3">
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
      <RecentLine days={recentDays} />
    </div>
  );
}

/** 최근 7일에 암케어를 한 날 — 매일 하는 것이 목표라 날 수로 말한다 */
function RecentLine({ days }: { days: number }) {
  return (
    <p className="px-1 text-xs text-muted">
      최근 7일 중 암케어를 한 날{' '}
      <span className="font-semibold text-ink">{days}일</span>
      {days === 0 ? ' — 오늘부터 시작해 보세요.' : ''}
    </p>
  );
}

function Checklist({ items: initial }: { items: ArmcareTodayItem[] }) {
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

  /* 부위별로 묶는다 — 루틴이 이미 부위 차례로 담겨 온다 */
  const groups: { area: ArmcareAreaKey; items: ArmcareTodayItem[] }[] = [];
  for (const it of items) {
    const last = groups.at(-1);
    if (last && last.area === it.area) last.items.push(it);
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
            <span className="text-sm font-semibold text-sky">오늘 암케어 끝 👏</span>
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
            key={`${group.area}-${group.items[0].exercise.id}`}
            className="space-y-2.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 px-1">
              <h2 className="text-heading text-[15px] text-ink">{area?.label}</h2>
              <span className="text-xs break-keep text-muted">{area?.role}</span>
            </div>
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
                      {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
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
                      <MuscleChips muscles={ex.targetMuscles} />
                      <ExerciseBadges
                        bodyParts={[]}
                        intensity={ex.intensity}
                        difficulty={ex.difficulty}
                        equipment={ex.equipment}
                      />
                      {unsafe && !done && (
                        <span className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
                          <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                          지금 몸 상태에는 권하지 않는 운동입니다
                        </span>
                      )}
                    </span>
                    {ex.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ex.thumbUrl}
                        alt=""
                        className="hidden h-16 w-24 shrink-0 rounded-xl object-cover ring-1 ring-line sm:block"
                      />
                    )}
                  </button>
                  <ExerciseMedia exercise={ex} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
