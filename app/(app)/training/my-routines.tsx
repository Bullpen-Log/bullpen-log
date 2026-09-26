'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Pencil, Play, Plus } from 'lucide-react';
import { MY_ROUTINE_MAX } from '@/lib/armcare/my-routines';
import { Checklist, type ArmcareTodayItem } from './armcare-today';

/** 화면에 그릴 내 루틴 하나 — 서버(armcare-section.tsx)가 만들어 넘긴다 */
export type MyRoutineView = {
  id: string;
  name: string;
  /** 담은 차례 그대로, 오늘 체크한 것과 지금 몸 상태에 안 맞는 것이 표시돼 있다 */
  items: ArmcareTodayItem[];
  estimatedMinutes: number;
  /** 담아 뒀는데 라이브러리에서 숨겨져 안 보이는 운동 수 */
  hidden: number;
};

/**
 * 내 루틴 — 사용자가 골라 만든 루틴들. 언제든 펼쳐서 체크하며 한다.
 *
 * 한 번에 하나만 펼친다. 루틴 둘을 펼쳐 두면 같은 운동이 두 번 보여, 어느 쪽을
 * 체크해도 둘 다 체크되는 것이 오히려 헷갈린다(체크는 운동 기록 하나에 남는다).
 *
 * 몸 상태는 맞춤 루틴처럼 막지 않는다 — 내가 짠 루틴이다. 대신 오늘 통증을 남겼으면
 * 위에 알리고, 지금 몸 상태에 안 맞는 운동에는 표시를 단다(맞춤 루틴과 같은 규칙).
 */
export function MyRoutines({
  routines,
  painToday,
}: {
  routines: MyRoutineView[];
  /** 오늘 체크인에 통증을 남겼는가 */
  painToday: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {painToday && routines.length > 0 && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-[13px] leading-relaxed break-keep text-warn">
          오늘 통증을 남기셨어요 — 쉬는 걸 권해요.
        </p>
      )}

      {routines.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-5">
          <p className="text-sm font-bold text-ink">아직 만든 루틴이 없습니다</p>
          <p className="text-[13px] break-keep text-muted">
            자주 하는 운동만 골라 이름을 붙여 두세요.
          </p>
          <NewRoutineLink />
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {routines.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                open={open === r.id}
                onToggle={() => setOpen(open === r.id ? null : r.id)}
              />
            ))}
          </ul>
          {routines.length < MY_ROUTINE_MAX ? (
            <NewRoutineLink />
          ) : (
            <p className="px-1 text-xs text-muted">
              루틴은 {MY_ROUTINE_MAX}개까지 둘 수 있습니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function NewRoutineLink() {
  return (
    <Link
      href="/training/routine/new"
      className="flex items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
    >
      <Plus aria-hidden className="h-4 w-4" />새 루틴 만들기
    </Link>
  );
}

function RoutineCard({
  routine: r,
  open,
  onToggle,
}: {
  routine: MyRoutineView;
  open: boolean;
  onToggle: () => void;
}) {
  const done = r.items.filter((it) => it.done).length;
  const all = r.items.length;

  return (
    <li
      className={`overflow-hidden rounded-2xl border transition-colors ${
        open ? 'border-sky-soft bg-surface' : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-[15px] font-bold break-keep text-ink">
              {r.name}
            </span>
            <span className="block text-xs text-muted">
              운동 {all}개 · 약 {r.estimatedMinutes}분
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              all > 0 && done === all
                ? 'bg-sky text-white'
                : done > 0
                  ? 'bg-sky-tint text-sky-strong'
                  : 'bg-surface-2 text-muted'
            }`}
          >
            오늘 {done}/{all}
          </span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {all > 0 && (
          <Link
            href={`/armcare/play/${r.id}`}
            aria-label={`${r.name} 따라하기`}
            className="flex w-12 shrink-0 items-center justify-center border-l border-line text-sky transition-colors hover:bg-sky-tint"
          >
            <Play aria-hidden className="h-4 w-4" />
          </Link>
        )}
        <Link
          href={`/training/routine/${r.id}`}
          aria-label={`${r.name} 고치기`}
          className="flex w-12 shrink-0 items-center justify-center border-l border-line text-muted transition-colors hover:bg-surface-2 hover:text-sky"
        >
          <Pencil aria-hidden className="h-4 w-4" />
        </Link>
      </div>

      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3 sm:px-4">
          {all === 0 ? (
            <p className="px-1 text-[13px] text-muted">
              담긴 운동이 모두 라이브러리에서 숨겨졌습니다. 고치기에서 다시 담아 주세요.
            </p>
          ) : (
            <Checklist items={r.items} grouped={false} doneLabel="루틴 끝" />
          )}
          {r.hidden > 0 && (
            <p className="px-1 text-xs text-muted">
              담아 둔 운동 중 {r.hidden}개는 라이브러리에서 숨겨져 빠졌습니다.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
