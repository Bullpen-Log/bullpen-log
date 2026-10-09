'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Play, RotateCcw, Video } from 'lucide-react';
import { Button, ButtonLink, Card } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-delete';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import {
  MECHANICS_LEVELS,
  PER_WEEK,
  WEEKS,
  mechanicsLevel,
  type LevelKey,
  type MechanicsLevel,
} from '@/lib/mechanics/levels';
import { FILM_EVERY, FILM_VERDICTS, filmPrompt, type FilmNote } from '@/lib/mechanics/program';
import { FilmVerdictButtons } from './film-verdict';
import type { MechanicsProgramView, SessionDrillView } from '@/lib/mechanics/load';
import { resetMechanicsProgram, startMechanicsProgram } from '@/app/actions/mechanics';
import { josa } from '@/lib/korean';
import { OverviewDetail } from './mechanics-guide';

/**
 * 프로그램 칸 — 투구 메커니즘 향상 프로그램.
 *
 * 2026-10-04 사용자분: 세션을 저절로 짜지 말고, 수준(입문 · 초급 · 중급 · 고급)을 골라 그 수준의 4주 프로그램을 따라 하게.
 * 수준을 안 골랐으면 고르기 카드 넷, 골랐으면 오늘의 세션 · 12칸 진행 · 권하기 · 수준 바꾸기. 세션은 따라 하기 화면
 * (/mechanics/play)에서 한 드릴씩 하고 느낌을 누른다. 규칙은 lib/mechanics/program.ts · levels.ts.
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
  if (!program?.level) {
    return (
      <div className="space-y-5">
        <Card className="space-y-2">
          <h2 className="text-heading text-lg text-ink">투구 메커니즘 향상 프로그램</h2>
          <p className="text-sm leading-relaxed break-keep text-ink/85">
            수준을 하나 고르면 4주 동안 주 {PER_WEEK}번, 정해진 드릴 세 개씩 투구 차례대로 해요. 한 번에 15~20분이고,
            던지는 날 몸을 푼 뒤 캐치볼 전에 하면 알맞아요. 처음이면 입문부터 시작하세요.
          </p>
        </Card>
        <LevelPicker current={null} index={0} />
        <Card className="space-y-4">
          <h2 className="text-heading text-lg text-ink">투구의 흐름</h2>
          <OverviewDetail />
        </Card>
      </div>
    );
  }

  const level = mechanicsLevel(program.level);
  const completed = program.week == null;

  return (
    <div className="space-y-5">
      {completed ? (
        <CompletedCard level={level} advice={program.advice} />
      ) : (
        <SessionCard program={program} level={level} session={session} doneToday={doneToday} />
      )}

      {!completed && program.advice && program.advice.kind !== 'done' && (
        <AdviceCard advice={program.advice} />
      )}

      <LevelProgress program={program} level={level} />

      <FilmCard sessionsDone={program.sessionsDone} films={program.films} />

      <LevelSettings current={level.key} index={program.index} />

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

/** 오늘(다음) 세션 — 드릴 셋 · 시작 */
function SessionCard({
  program,
  level,
  session,
  doneToday,
}: {
  program: MechanicsProgramView;
  level: MechanicsLevel;
  session: SessionDrillView[];
  doneToday: string[];
}) {
  const done = new Set(program.finishedToday ? [] : doneToday);
  const started = session.some((s) => done.has(s.guideId));
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-heading text-lg text-ink">
          {program.finishedToday ? '다음 세션' : '오늘의 세션'}
        </h2>
        <span className="text-xs text-muted">
          {level.name} · {program.week}주차 {program.day}번째 · 15~20분
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
          <li key={item.guideId} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
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
              {item.gearNote?.replaced && (
                <span className="block text-xs break-keep text-muted">
                  {item.gearNote.replaced}에는 {item.gearNote.need}
                  {josa(item.gearNote.need, '이/가')} 있어야 해서 같은 단계 드릴로 바꿨어요
                </span>
              )}
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
        드릴마다 느낌을 눌러요. 쉬움이 여러 요소에서 쌓이면 다음 수준을 권해 드려요. 던지는 날 몸을 푼 뒤, 캐치볼 전에
        하면 알맞아요.
      </p>
    </Card>
  );
}

/** 이 수준의 12칸 — 주마다 세 칸, 마친 칸 · 다음 칸 */
function LevelProgress({ program, level }: { program: MechanicsProgramView; level: MechanicsLevel }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">{level.name} 프로그램</h2>
        <span className="text-xs text-muted tabular-nums">
          {program.index} / {program.total}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2" aria-label={`${program.total}번 중 ${program.index}번 마침`}>
        {Array.from({ length: WEEKS }, (_, w) => (
          <div key={w} className="space-y-1">
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: PER_WEEK }, (_, d) => {
                const i = w * PER_WEEK + d;
                return (
                  <span
                    key={d}
                    className={`h-2 rounded-full ${
                      i < program.index ? 'bg-sky' : i === program.index ? 'bg-sky/40' : 'bg-surface-2'
                    }`}
                  />
                );
              })}
            </div>
            <span className="block text-center text-xs text-muted">{w + 1}주</span>
          </div>
        ))}
      </div>
      <p className="text-xs break-keep text-muted">{level.what}</p>
    </Card>
  );
}

/** 수준을 바꾸는 단추 — 권하기 · 다 마침 카드가 같이 쓴다 */
function useStartLevel() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const start = (key: LevelKey) =>
    startTransition(async () => {
      setError(null);
      const res = await orOffline(startMechanicsProgram(key), { error: OFFLINE_MESSAGE });
      if ('error' in res) setError(res.error);
      else quietRefresh(router);
    });
  return { start, error, pending };
}

/** 다음 · 아래 수준 권하기 — 저절로 바꾸지 않는다. '계속하기'는 이 화면에서만 숨긴다 */
function AdviceCard({ advice }: { advice: NonNullable<MechanicsProgramView['advice']> }) {
  const { start, error, pending } = useStartLevel();
  const [hidden, setHidden] = useState(false);
  if (hidden || !advice.to) return null;
  const to = mechanicsLevel(advice.to);
  const up = advice.kind === 'up';
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-bold break-keep text-ink">
        {up ? `${to.name}${josa(to.name, '으로/로')} 올라가 볼까요?` : `${to.name}${josa(to.name, '으로/로')} 낮춰 볼까요?`}
      </h2>
      <p className="text-sm leading-relaxed break-keep text-muted">
        {up
          ? '여러 요소에서 ‘쉬움’이 서로 다른 날 쌓였어요. 드릴이 편해졌다면 다음 수준이 더 맞을 수 있어요.'
          : '‘어려움’이 이어지는 요소가 있어요. 한 단계 낮은 수준에서 자세를 다지고 다시 올라와도 돼요.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => start(to.key)} disabled={pending} className="rounded-full">
          {pending ? '바꾸는 중…' : `${to.name} 시작`}
        </Button>
        <Button variant="secondary" onClick={() => setHidden(true)} className="rounded-full">
          지금 수준 계속
        </Button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </Card>
  );
}

/** 12세션을 다 마쳤을 때 — 다음 수준 또는 한 번 더 */
function CompletedCard({
  level,
  advice,
}: {
  level: MechanicsLevel;
  advice: MechanicsProgramView['advice'];
}) {
  const { start, error, pending } = useStartLevel();
  const down = advice?.kind === 'down' && advice.to ? mechanicsLevel(advice.to) : null;
  const next = advice?.kind === 'done' && advice.to ? mechanicsLevel(advice.to) : null;
  const target = next ?? down;
  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-heading text-lg text-ink">{level.name} 프로그램을 마쳤어요</h2>
        <p className="text-sm leading-relaxed break-keep text-muted">
          {down
            ? `‘어려움’이 이어지는 요소가 있었어요. ${down.name}에서 자세를 다지거나, ${level.name}${josa(level.name, '을/를')} 한 번 더 해도 돼요.`
            : next
              ? `4주 동안 ${WEEKS * PER_WEEK}번을 다 했어요. ${next.name}${josa(next.name, '으로/로')} 넘어가거나, 편하지 않았다면 한 번 더 해도 돼요.`
              : `4주 동안 ${WEEKS * PER_WEEK}번을 다 했어요. 가장 높은 수준이라, 한 번 더 하며 전체 동작을 다듬어요.`}
        </p>
      </div>
      <div className="grid gap-2">
        {target && (
          <Button onClick={() => start(target.key)} disabled={pending} className="rounded-full">
            {pending ? '바꾸는 중…' : `${target.name} 시작`}
          </Button>
        )}
        <Button
          variant={next || down ? 'secondary' : 'primary'}
          onClick={() => start(level.key)}
          disabled={pending}
          className="rounded-full"
        >
          {level.name} 한 번 더
        </Button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </Card>
  );
}

/**
 * 수준 고르기 — 카드 넷. 지금 하는 수준이 있으면 그 카드에 표시하고, 하던 중에 바꾸면 한 번 묻는다(진행이 처음으로 돌아간다).
 */
function LevelPicker({ current, index }: { current: LevelKey | null; index: number }) {
  const { start, error, pending } = useStartLevel();
  const [ask, setAsk] = useState<LevelKey | null>(null);
  const choose = (key: LevelKey) => {
    if (current && index > 0) setAsk(key);
    else start(key);
  };
  return (
    <div className="space-y-2.5">
      <ul className="space-y-2.5">
        {MECHANICS_LEVELS.map((lv, i) => {
          const on = lv.key === current;
          return (
            <li
              key={lv.key}
              className={`space-y-3 rounded-2xl border bg-surface p-(--block-pad) ${on ? 'border-sky' : 'border-line'}`}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-tint text-sm font-bold text-sky-strong">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-base font-bold text-ink">{lv.name}</span>
                    <span className="text-sm break-keep text-muted">{lv.line}</span>
                  </p>
                  <p className="text-xs leading-relaxed break-keep text-ink/80">{lv.who}</p>
                  <p className="text-xs leading-relaxed break-keep text-muted">{lv.what}</p>
                  <p className="text-xs break-keep text-muted">
                    첫 세션: {lv.blocks[0][0].join(' · ')}
                  </p>
                </div>
              </div>
              {on ? (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-strong">
                  <Check aria-hidden className="h-4 w-4" />
                  지금 하는 수준이에요
                </p>
              ) : (
                <Button
                  variant={current ? 'secondary' : 'primary'}
                  onClick={() => choose(lv.key)}
                  disabled={pending}
                  className="w-full rounded-full"
                >
                  {current ? `${lv.name}${josa(lv.name, '으로/로')} 바꾸기` : `${lv.name} 시작`}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask != null}
        onClose={() => setAsk(null)}
        onConfirm={() => {
          if (ask) start(ask);
          setAsk(null);
        }}
        title="수준을 바꿀까요?"
        detail={`${ask ? mechanicsLevel(ask).name : ''} 1주차 1번째 세션부터 시작해요. 지금까지 한 드릴 기록은 남아요.`}
        confirmLabel="바꾸기"
        pending={pending}
        pendingLabel="바꾸는 중…"
      />
    </div>
  );
}

/** 수준 바꾸기(펼치면 고르기 카드) · 처음부터 */
function LevelSettings({ current, index }: { current: LevelKey; index: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () =>
    startTransition(async () => {
      const res = await orOffline(resetMechanicsProgram(), { error: OFFLINE_MESSAGE });
      setConfirm(false);
      if ('error' in res) setError(res.error);
      else quietRefresh(router);
    });

  return (
    <Card className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-base font-bold text-ink"
      >
        수준 바꾸기
        <ChevronDown aria-hidden className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <LevelPicker current={current} index={index} />}
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
        detail="수준 고르기로 돌아가요. 지금까지 한 드릴 기록은 남아요."
        confirmLabel="처음부터"
        pending={pending}
        pendingLabel="되돌리는 중…"
      />
    </Card>
  );
}

/**
 * 영상으로 확인 — 첫 세션 전에는 처음 모습을 찍어 두고, {FILM_EVERY}번째 세션마다 다시 찍어 2분할 비교로 견준다
 * (lib/mechanics/program.ts filmPrompt). 견준 결과는 여기서도 남길 수 있고(세션 끝 화면에서 안 눌렀을 때), 남긴 것은
 * '견준 기록'으로 쌓인다 — 드릴이 효과가 있었는지 보이는 유일한 자리(2026-10-09). 알릴 때도 기록도 없으면 안 그린다.
 */
function FilmCard({ sessionsDone, films }: { sessionsDone: number; films: FilmNote[] }) {
  const kind = filmPrompt(sessionsDone);
  const current = films.find((f) => f.session === sessionsDone) ?? null;
  if (!kind && films.length === 0) return null;
  if (!kind) {
    return (
      <Card className="space-y-2">
        <h3 className="text-base font-bold text-ink">견준 기록</h3>
        <FilmHistory films={films} />
      </Card>
    );
  }
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-tint text-sky-strong">
          <Video aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-bold break-keep text-ink">
            {kind === 'baseline' ? '시작 전에 한 번 찍어 두세요' : '찍어서 처음과 견줘 볼 때예요'}
          </h3>
          <p className="text-sm leading-relaxed break-keep text-muted">
            {kind === 'baseline'
              ? `옆에서 평소처럼 몇 개 던지는 모습을 찍어 투구 기록에 남겨요. 세션 ${FILM_EVERY}번 뒤에 그 영상과 나란히 견줘 봐요.`
              : `세션 ${sessionsDone}번을 했어요. 같은 자리에서 다시 찍어 처음 영상과 나란히 놓고 앞발이 닿는 장면을 멈춰 보세요. 구속도 같이 재 두면 바뀐 것이 효과가 있었는지 알 수 있어요.`}
          </p>
        </div>
      </div>
      <ButtonLink
        variant="secondary"
        href={kind === 'baseline' ? '/videos' : '/videos?compare=1'}
        className="min-h-11 w-full rounded-full text-sm"
      >
        {kind === 'baseline' ? '투구 기록 열기' : '2분할 비교 열기'}
      </ButtonLink>
      {kind === 'compare' && (
        <div className="border-t border-line/70 pt-3">
          <FilmVerdictButtons session={sessionsDone} current={current} />
        </div>
      )}
      {films.some((f) => f.session !== sessionsDone) && (
        <div className="border-t border-line/70 pt-3">
          <FilmHistory films={films.filter((f) => f.session !== sessionsDone)} />
        </div>
      )}
    </Card>
  );
}

/** 견준 기록 한 줄씩 — '세션 6번 · 좋아졌어요 · 10/9' */
function FilmHistory({ films }: { films: FilmNote[] }) {
  const label = (v: FilmNote['verdict']) => FILM_VERDICTS.find((x) => x.value === v)?.label ?? v;
  return (
    <ul className="space-y-1">
      {films.map((f) => (
        <li key={f.session} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink">
            세션 {f.session}번 ·{' '}
            <b className={f.verdict === 'better' ? 'text-sky-strong' : 'text-ink'}>{label(f.verdict)}</b>
          </span>
          <span className="shrink-0 text-xs text-muted tabular-nums">
            {Number(f.on.slice(5, 7))}/{Number(f.on.slice(8, 10))}
          </span>
        </li>
      ))}
    </ul>
  );
}
