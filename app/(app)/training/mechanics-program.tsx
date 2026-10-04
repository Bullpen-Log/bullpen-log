'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Play, RotateCcw } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-delete';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';
import { MECHANICS_ELEMENTS, type MechanicsElementName } from '@/lib/mechanics/elements';
import { EASY_TO_ADVANCE, isMastered } from '@/lib/mechanics/program';
import type { MechanicsProgramView, SessionDrillView } from '@/lib/mechanics/load';
import { resetMechanicsProgram, startMechanicsProgram } from '@/app/actions/mechanics';
import { OverviewDetail } from './mechanics-guide';

/**
 * 프로그램 칸 — 투구 메커니즘 향상 프로그램(2026-10-04).
 *
 * 없으면 시작 카드(강조 고르기), 있으면 오늘의 세션 · 요소별 진행 · 강조 바꾸기 · 처음부터. 세션은 따라 하기 화면
 * (/mechanics/play)에서 한 드릴씩 하고 느낌을 누른다. 규칙은 lib/mechanics/program.ts.
 */
export function MechanicsProgram({
  program,
  session,
  doneToday,
}: {
  program: MechanicsProgramView | null;
  session: SessionDrillView[];
  doneToday: string[];
}) {
  if (!program) return <StartCard />;

  const done = new Set(program.finishedToday ? [] : doneToday);
  const started = session.some((s) => done.has(s.guideId));

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-heading text-lg text-ink">
            {program.finishedToday ? '다음 세션' : '오늘의 세션'}
          </h2>
          <span className="text-xs text-muted">
            {program.sessionsDone + 1}번째 · 15~20분
          </span>
        </div>
        {program.finishedToday && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-strong">
            <Check aria-hidden className="h-4 w-4" />
            오늘 세션을 마쳤어요. 더 하고 싶으면 다음 세션을 이어서 해도 돼요.
          </p>
        )}
        <ol className="space-y-2">
          {session.map((item, i) => (
            <li
              key={item.guideId}
              className="flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-3"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done.has(item.guideId) ? 'bg-sky text-white' : 'bg-surface text-muted'
                }`}
              >
                {done.has(item.guideId) ? <Check aria-hidden className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-sm font-bold break-keep text-ink">{item.title}</span>
                <span className="block text-xs break-keep text-muted">
                  {item.element} · {item.stage} · {item.tool} · {item.dose}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <Link
          href="/mechanics/play"
          className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full bg-sky text-base font-bold text-white transition-colors hover:bg-sky-strong"
        >
          <Play aria-hidden className="h-4 w-4" fill="currentColor" />
          {started ? '이어서 하기' : '세션 시작'}
        </Link>
        <p className="text-xs leading-relaxed break-keep text-muted">
          드릴마다 느낌을 눌러요. 같은 요소를 서로 다른 날 ‘쉬움’으로 {EASY_TO_ADVANCE}번 넘기면 다음 단계로 올라가요.
          일주일에 2~3번이 알맞아요.
        </p>
      </Card>

      <ProgressBoard program={program} />

      <ProgramSettings focus={program.focus} />

      <details className="group rounded-2xl bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-(--block-pad) text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
          투구의 흐름 · 왜 순서가 중요한가요
          <ChevronDown aria-hidden className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-(--block-pad) pb-(--block-pad)">
          <OverviewDetail />
        </div>
      </details>
    </div>
  );
}

/** 요소마다 지금 단계 — 기초 · 연결 · 통합 칸과 '쉬움' 수 */
function ProgressBoard({ program }: { program: MechanicsProgramView }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-bold text-ink">요소별 진행</h2>
      <ul className="space-y-2.5">
        {MECHANICS_ELEMENTS.map((el) => {
          const p = program.progress[el.name];
          const at = DRILL_STAGE_NAMES.indexOf(p.stage);
          const mastered = isMastered(p);
          return (
            <li key={el.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-ink">{el.name}</span>
                  {program.focus === el.name && (
                    <span className="text-xs font-semibold text-sky-strong">강조</span>
                  )}
                </span>
                <span className="text-xs text-muted">
                  {mastered
                    ? '다 익혔어요'
                    : `${p.stage} · 쉬움 ${p.easy}/${EASY_TO_ADVANCE}`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1" aria-label={`${el.name} ${p.stage} 단계`}>
                {DRILL_STAGE_NAMES.map((stage, i) => (
                  <span
                    key={stage}
                    className={`h-2 rounded-full ${
                      i < at || mastered
                        ? 'bg-sky'
                        : i === at
                          ? 'bg-sky/40'
                          : 'bg-surface-2'
                    }`}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">칸이 채워지면 다음 단계로 가요(기초 · 연결 · 통합).</p>
    </Card>
  );
}

/** 강조 고르기 칩 — 시작 카드 · 설정이 같이 쓴다 */
function FocusChips({
  value,
  onChange,
}: {
  value: MechanicsElementName | null;
  onChange: (next: MechanicsElementName | null) => void;
}) {
  const options: { name: MechanicsElementName | null; label: string }[] = [
    { name: null, label: '전체 고르게' },
    ...MECHANICS_ELEMENTS.map((el) => ({ name: el.name, label: el.name })),
  ];
  return (
    <div role="radiogroup" aria-label="강조할 요소" className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={value === o.name}
          onClick={() => onChange(o.name)}
          className={`min-h-10 rounded-full px-3.5 text-sm font-semibold transition-colors desk:min-h-8 desk:text-xs ${
            value === o.name ? 'bg-sky text-white' : 'bg-surface-2 text-ink hover:text-sky-strong'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 프로그램이 없을 때 — 어떻게 하는지 · 강조 고르기 · 시작 */
function StartCard() {
  const router = useRouter();
  const [focus, setFocus] = useState<MechanicsElementName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () =>
    startTransition(async () => {
      setError(null);
      const res = await orOffline(startMechanicsProgram(focus), { error: OFFLINE_MESSAGE });
      if ('error' in res) setError(res.error);
      else quietRefresh(router);
    });

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <h2 className="text-heading text-lg text-ink">투구 메커니즘 향상 프로그램</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed break-keep text-ink/85">
          <li>투구의 여섯 요소를 기초 → 연결 → 통합 차례로 하나씩 올려요.</li>
          <li>한 번에 드릴 3~4개, 15~20분이에요. 일주일에 2~3번이 알맞아요.</li>
          <li>
            드릴을 마칠 때마다 느낌(어려움 · 적당 · 쉬움)을 눌러요. 같은 요소를 서로 다른 날 ‘쉬움’으로{' '}
            {EASY_TO_ADVANCE}번 넘기면 다음 단계로 올라가요.
          </li>
        </ul>
        <div className="space-y-2">
          <p className="text-sm font-bold text-ink">더 키우고 싶은 요소가 있나요?</p>
          <p className="text-xs break-keep text-muted">
            고르면 그 요소는 세션마다 들어가요. 잘 모르겠으면 ‘전체 고르게’로 시작하세요.
          </p>
          <FocusChips value={focus} onChange={setFocus} />
        </div>
        {error && <ErrorLine>{error}</ErrorLine>}
        <Button onClick={start} disabled={pending} className="w-full">
          {pending ? '시작하는 중…' : '프로그램 시작'}
        </Button>
      </Card>
      <Card className="space-y-4">
        <h2 className="text-heading text-lg text-ink">투구의 흐름</h2>
        <OverviewDetail />
      </Card>
    </div>
  );
}

/** 강조 바꾸기 · 처음부터 */
function ProgramSettings({ focus }: { focus: MechanicsElementName | null }) {
  const router = useRouter();
  const [value, setValue] = useState(focus);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changeFocus = (next: MechanicsElementName | null) => {
    setValue(next);
    startTransition(async () => {
      setError(null);
      const res = await orOffline(startMechanicsProgram(next), { error: OFFLINE_MESSAGE });
      if ('error' in res) {
        setError(res.error);
        setValue(focus);
      } else quietRefresh(router);
    });
  };

  const reset = () =>
    startTransition(async () => {
      const res = await orOffline(resetMechanicsProgram(), { error: OFFLINE_MESSAGE });
      setConfirm(false);
      if ('error' in res) setError(res.error);
      else quietRefresh(router);
    });

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-bold text-ink">강조할 요소</h2>
      <FocusChips value={value} onChange={changeFocus} />
      {error && <ErrorLine>{error}</ErrorLine>}
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-danger"
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
        처음부터 다시 하기
      </button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={reset}
        title="처음부터 다시 할까요?"
        detail="모든 요소가 기초로 돌아가요. 지금까지 한 드릴 기록은 남아요."
        confirmLabel="처음부터"
        pending={pending}
        pendingLabel="되돌리는 중…"
      />
    </Card>
  );
}
