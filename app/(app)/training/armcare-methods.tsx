'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  ARMCARE_METHODS,
  methodOf,
  type ArmcareMethod,
  type ArmcareMethodKey,
} from '@/lib/armcare/methods';
import type { ArmcareExerciseView } from './armcare-media';
import { GuideExercise } from './armcare-guide';
import { MyRoutinesProvider, type RoutineChoice } from './add-to-routine';

/**
 * 훈련 방식 — 같은 근육을 어떻게 힘 쓰며 키우는가. 글은 lib/armcare/methods.ts.
 *
 * 처음에는 가벼운 방식에서 무거운 방식으로 한 칸씩 올라가는 '단계 올리기' 계단을 위에
 * 뒀다. 2026-09-26 사용자분이 뺐다 — 방식들은 단계로 올라가는 것이 아니라 함께 섞어 해도
 * 되는 것이라서다. 그래서 번호('1단계')도 붙이지 않는다.
 *
 * 부위별 보강과 같은 움직임이다 — 방식을 누르면 그 자리에서 펼치고, 한 번에 하나만.
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

  return (
    <MyRoutinesProvider routines={routines}>
      <div className="space-y-6">
        <p className="text-sm break-keep text-muted">
          같은 근육도 힘 쓰는 방식이 다르면 몸이 익히는 것이 다릅니다. 섞어서 해도
          됩니다.
        </p>

        <ul className="space-y-2.5">
          {ARMCARE_METHODS.map((m) => (
            <MethodCard
              key={m.key}
              method={m}
              exercises={byMethod.get(m.key)!}
              open={open === m.key}
              onToggle={() => setOpen(open === m.key ? null : m.key)}
            />
          ))}
        </ul>
      </div>
    </MyRoutinesProvider>
  );
}

function MethodCard({
  method: m,
  exercises,
  open,
  onToggle,
}: {
  method: ArmcareMethod;
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
      className={`overflow-hidden rounded-2xl border transition-colors ${
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
            <span className="text-[15px] font-bold text-ink">{m.label}</span>
            <span className="text-xs text-muted">운동 {exercises.length}개</span>
          </span>
          <span className="block text-[13px] break-keep text-muted">{m.short}</span>
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
          {/*
            펼치면 자세히 — 겉(닫힌 카드)은 한 줄 요약만, 펼친 뒤에는 충분히 읽을 수 있게
            (2026-09-26 사용자분: 겉은 단순하게, 누르면 자세히).
          */}
          <dl className="grid grid-cols-[5em_1fr] gap-x-3 gap-y-2.5 text-[13px] leading-relaxed break-keep">
            <dt className="font-semibold text-sky-strong">하는 법</dt>
            <dd className="text-ink/85">{m.what}</dd>
            <dt className="font-semibold text-sky-strong">왜</dt>
            <dd className="text-ink/85">{m.why}</dd>
            <dt className="font-semibold text-sky-strong">세트·횟수</dt>
            <dd className="text-ink/85">{m.dose}</dd>
            <dt className="font-semibold text-sky-strong">무게</dt>
            <dd className="text-ink/85">{m.load}</dd>
            <dt className="font-semibold text-sky-strong">멈출 때</dt>
            <dd className="text-ink/85">{m.stop}</dd>
          </dl>

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
