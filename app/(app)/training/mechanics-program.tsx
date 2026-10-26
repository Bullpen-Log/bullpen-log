'use client';

import { FocusReview, FocusHistory } from './focus-review';
import { FocusProgress, MechanicsEquipment } from './focus-progress';
import { useState, useTransition, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCcw,
  Video,
} from '@/components/icon';
import { Button, ButtonLink, Card } from '@/components/ui';
import { Modal } from '@/components/modal';
import { FoldNote } from '@/components/fold-note';
import { ConfirmDialog } from '@/components/confirm-delete';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import {
  MECHANICS_LEVELS,
  PER_WEEK,
  SESSIONS_PER_LEVEL,
  WEEKS,
  mechanicsLevel,
  type LevelKey,
  type MechanicsLevel,
} from '@/lib/mechanics/levels';
import {
  FILM_EVERY,
  FILM_VERDICTS,
  MECHANICS_FOLD_BUTTONS,
  MECHANICS_FOLD_TEXT,
  RX_LEVEL_TEXT,
  filmPrompt,
  foldSession,
  isArmLoaded,
  type FilmNote,
  type FocusView,
  type MechanicsPainFold,
} from '@/lib/mechanics/program';
import { FilmVerdictButtons } from './film-verdict';
import type { MechanicsProgramView, SessionDrillView } from '@/lib/mechanics/load';
import {
  endMechanicsFocus,
  resetMechanicsProgram,
  startMechanicsFocus,
  startMechanicsProgram,
} from '@/app/actions/mechanics';
import { josa } from '@/lib/korean';
import { OverviewDetail } from './mechanics-guide';

/**
 * 프로그램 칸 — 투구 메커니즘 향상 프로그램.
 *
 * 2026-10-04 사용자분: 세션을 저절로 짜지 말고, 수준(입문 · 초급 · 중급 · 고급)을 골라 그 수준의 4주 프로그램을 따라 하게.
 * 수준을 안 골랐으면 고르기 카드 넷, 골랐으면 오늘의 세션 · 12칸 진행 · 권하기 · 수준 바꾸기. 세션은 따라 하기 화면
 * (/mechanics/play)에서 한 드릴씩 하고 느낌을 누른다. 규칙은 lib/mechanics/program.ts · levels.ts.
 */
/** 3D 리포트 [처방 시작]에서 온 처방(확인 시트가 그린다) — 못 시작하면 까닭 */
export type FocusOfferView = { reportId: string; jobId: string; rx: { element: string; level: 'improve' | 'edge' }[] } | { error: string };

export function MechanicsProgram({
  program,
  session,
  doneToday,
  painFold = null,
  offer = null,
}: {
  program: MechanicsProgramView | null;
  session: SessionDrillView[];
  doneToday: string[];
  /** 오늘 어깨 · 팔꿈치 통증으로 팔에 싣는 드릴을 접는가(2판 P6-5, D5) — 아니면 null */
  painFold?: MechanicsPainFold | null;
  /** 주소 ?focus= 로 온 3D 리포트 처방 — 확인 시트를 연다(docs/designs/pitch-3d-report.md 6-4절) */
  offer?: FocusOfferView | null;
}) {
  const sheet = offer && <FocusStartSheet offer={offer} level={program?.level ?? null} current={program?.focus ?? null} />;
  if (!program?.level) {
    return (
      <div className="stack-block">
        {sheet}
        {/* 글은 한 줄만, 나머지는 '자세히' 뒤로(2026-10-16 김민 "화면 글 많은 곳 줄여줘" — 이 화면이 1,500자 · 화면 3장 길이였다) */}
        <Card className="space-y-1">
          <h2 className="text-heading text-lg text-ink">투구 메커니즘 향상 프로그램</h2>
          <p className="text-sm break-keep text-ink/85">
            {SESSIONS_PER_LEVEL}회 연습 순서예요. 기간을 정해두지 않고 오늘 투구 계획에 맞춰 해요.
          </p>
          <FoldNote tone="muted">
            <p className="text-sm leading-relaxed break-keep text-muted">
              선택한 동작을 짧게 연습해요. 단계는 학습 난이도이고, 던지는 양과 세기는 오늘 투구 계획을 따라요. 처음이면 입문부터.
            </p>
          </FoldNote>
        </Card>
        <FocusHistory history={program?.history ?? []} />
        <LevelPicker current={null} index={0} />
        <OverviewFold />
      </div>
    );
  }

  const level = mechanicsLevel(program.level);
  const focus = program.focus;
  /* 처방이 남았으면 수준 12세션을 마쳐도 세션이 있다(lib/mechanics/program.ts buildProgramSession) */
  const completed = program.week == null && !(focus && !focus.finished);

  return (
    <div className="stack-block">
      {sheet}
      <FocusHistory history={program.history} />
      <MechanicsEquipment key={program.equipment.join(',')} equipment={program.equipment} />
      {focus && <FocusCard focus={focus} />}
      {completed ? (
        <CompletedCard level={level} advice={program.advice} />
      ) : (
        <SessionCard program={program} level={level} session={session} doneToday={doneToday} painFold={painFold} />
      )}

      {!completed && program.advice && program.advice.kind !== 'done' && <AdviceCard advice={program.advice} />}

      <LevelProgress program={program} level={level} />

      {/* 처방 중에는 '다시 찍기'를 처방 카드가 맡는다 — 권유가 둘로 겹치지 않게(6-4절) */}
      {!focus && <FilmCard sessionsDone={program.sessionsDone} films={program.films} />}

      <LevelSettings current={level.key} index={program.index} />

      <OverviewFold />
    </div>
  );
}

/** 투구의 흐름 · 왜 순서가 중요한가 · 이렇게 써 보세요 — 늘 접어 둔다(수준을 고르기 전 화면에서도) */
function OverviewFold() {
  return (
    <details className="group rounded-2xl bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-(--block-pad) text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
        투구의 흐름 · 왜 순서가 중요한가요
        <ChevronDown aria-hidden className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-(--block-pad) pb-(--block-pad)">
        <OverviewDetail />
      </div>
    </details>
  );
}

/**
 * 오늘(다음) 세션 — 드릴 셋 · 시작.
 *
 * 어깨 · 팔꿈치가 아픈 날(2판 P6-5, 사용자 결정 D5): 팔에 싣는 드릴(스로잉 · 메디신볼)은 '접어 둔 드릴' 한 줄로 접고, 시작은
 * '무브먼트 드릴만 하기'. 막지는 않는다 — '펼치기'를 누르면 세 드릴이 다 보이고 시작이 '그래도 하기'(/mechanics/play?anyway=1)로
 * 바뀐다. 펼친 것은 이 화면에서만 지킨다(다시 열면 다시 접힌다 — 아픈 날은 매번 한 번 더 고르게).
 */
function SessionCard({
  program,
  level,
  session,
  doneToday,
  painFold,
}: {
  program: MechanicsProgramView;
  level: MechanicsLevel;
  session: SessionDrillView[];
  doneToday: string[];
  painFold: MechanicsPainFold | null;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const done = new Set(program.finishedToday ? [] : doneToday);
  /* 접는 날 — 펼치기 전까지 팔에 싣는 드릴은 목록에서 빼 한 줄로. 못 펼치는 날(canUnfold 거짓)은 늘 접는다 */
  const folding = painFold != null && !(unfolded && painFold.canUnfold);
  const anyway = painFold != null && unfolded && painFold.canUnfold;
  const { open, folded } = foldSession(session, folding ? painFold : null);
  const started = open.some((s) => done.has(s.guideId));
  /* 접은 날 할 수 있는 드릴을 다 했다 — 무브먼트만 하고 마친 뒤(세션 수는 그대로라 같은 세션이 남는다) */
  const openDone = folding && open.length > 0 && open.every((s) => done.has(s.guideId));
  const startClass =
    'flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full bg-sky text-base font-bold text-white transition-colors hover:bg-sky-strong pad:inline-flex pad:w-auto pad:px-8';
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-heading text-lg text-ink">
          {program.finishedToday ? '다음 세션' : '오늘의 세션'}
          {program.focus && !program.focus.finished && (
            <span className="text-sky-strong">
              {' '}
              · {program.focus.skill ? `${program.focus.stage} 연습` : `처방 ${program.focus.done + 1}/${program.focus.total}`}
            </span>
          )}
        </h2>
        <span className="text-xs text-muted">
          {level.name} · {Math.min(program.index + 1, program.total)}번 세션 ·{' '}
          {level.key === 'intermediate' || level.key === 'advanced' ? '20~25분' : '15~20분'}
        </span>
      </div>
      {program.finishedToday && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-strong">
          <Check aria-hidden className="h-4 w-4" />
          오늘 세션을 마쳤어요. 더 하고 싶으면 다음 세션을 이어서 해도 돼요.
        </p>
      )}
      {painFold &&
        (folding ? (
          <p className="flex items-start gap-2 rounded-2xl bg-warn-bg px-4 py-3 text-sm font-semibold break-keep text-warn">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{painFold.reason}</span>
          </p>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-warn-bg py-1.5 pr-1.5 pl-4">
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-warn" />
            <p className="min-w-0 flex-1 text-sm font-semibold break-keep text-warn">{MECHANICS_FOLD_TEXT.anyway(painFold.label)}</p>
            <button
              type="button"
              onClick={() => setUnfolded(false)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-warn"
            >
              <ChevronUp aria-hidden className="h-4 w-4" />
              {MECHANICS_FOLD_BUTTONS.refold}
            </button>
          </div>
        ))}
      {open.length > 0 && (
        <ol className="space-y-2">
          {open.map((item, i) => {
            const loaded = anyway && isArmLoaded(item.category);
            return (
              <li
                key={item.guideId}
                className={`flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-3 ${loaded ? 'motion-safe:animate-row-in' : ''}`}
                style={loaded ? ({ '--row': i } as CSSProperties) : undefined}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    done.has(item.guideId) ? 'bg-sky text-white' : 'bg-surface text-muted'
                  }`}
                >
                  {done.has(item.guideId) ? <Check aria-hidden className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block text-sm font-bold break-keep text-ink">
                    {item.rx && <RxTag rx={item.rx} />}
                    {item.title}
                  </span>
                  <span className="block text-xs break-keep text-muted">
                    {item.required === false ? '보조 · 선택' : '필수'} · {item.element} · {item.stage} · {item.tool} · {item.dose}
                  </span>
                  {item.gearNote?.replaced && (
                    <span className="block text-xs break-keep text-muted">
                      {item.gearNote.replaced}에는 {item.gearNote.need}
                      {josa(item.gearNote.need, '이/가')} 있어야 해서 같은 단계 드릴로 바꿨어요
                    </span>
                  )}
                  {loaded && <span className="block text-xs font-semibold break-keep text-warn">{MECHANICS_FOLD_TEXT.loadedTag}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {folding && folded.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3.5 py-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-sm font-bold text-ink">접어 둔 드릴 {folded.length}개</span>
            <span className="block text-xs break-keep text-muted">{folded.map((f) => f.title).join(' · ')}</span>
          </span>
          {/* 펼치기는 성인의 통증 날만 — 팔을 다 쓴 날 · 통증 확인 전 · 성장기 통증 날은 못 펼친다(2판 P6 검토, lib/mechanics/fold.ts) */}
          {painFold?.canUnfold && (
            <button
              type="button"
              onClick={() => setUnfolded(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-4 text-sm font-semibold text-ink transition-colors hover:bg-sky-tint"
            >
              {MECHANICS_FOLD_BUTTONS.unfold}
              <ChevronDown aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {program.blockers.length > 0 && !program.canFinalize ? (
        <p className="whitespace-pre-line rounded-xl bg-warn-tint p-3 text-sm text-warn">{program.blockers.join('\n')}</p>
      ) : program.canFinalize ? (
        <Link href="/mechanics/play" className={startClass}>
          세션 완료 확인
        </Link>
      ) : folding ? (
        open.length === 0 ? (
          <p className="text-sm font-semibold break-keep text-ink">{MECHANICS_FOLD_TEXT.allFolded}</p>
        ) : openDone ? (
          <p className="flex items-start gap-1.5 text-sm font-semibold break-keep text-sky-strong">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {MECHANICS_FOLD_TEXT.openDone}
          </p>
        ) : (
          <Link href="/mechanics/play" className={startClass}>
            <Play aria-hidden className="h-4 w-4" fill="currentColor" />
            {started ? '이어서 하기' : MECHANICS_FOLD_BUTTONS.openOnly}
          </Link>
        )
      ) : (
        <Link href={anyway ? '/mechanics/play?anyway=1' : '/mechanics/play'} className={startClass}>
          <Play aria-hidden className="h-4 w-4" fill="currentColor" />
          {anyway ? MECHANICS_FOLD_BUTTONS.anyway : started ? '이어서 하기' : '세션 시작'}
        </Link>
      )}
      {/* 하는 법은 접어 둔다(2026-10-16 UI 검토 — 세션 단추 밑에 늘 두 문장이 떠 있었다) */}
      <FoldNote tone="muted" label="하는 법">
        <p className="text-xs leading-relaxed break-keep text-muted">
          드릴마다 느낌을 눌러요. 쉬움이 여러 요소에서 쌓이면 다음 수준을 권해요. 워밍업 뒤 오늘 투구 계획에 포함해 연습해요. 추가
          투구량으로 따로 쌓지 않아요.
        </p>
      </FoldNote>
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
                    className={`h-2 rounded-full ${i < program.index ? 'bg-sky' : i === program.index ? 'bg-sky/40' : 'bg-surface-2'}`}
                  />
                );
              })}
            </div>
            <span className="block text-center text-xs text-muted">
              {w * PER_WEEK + 1}~{(w + 1) * PER_WEEK}회
            </span>
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
function CompletedCard({ level, advice }: { level: MechanicsLevel; advice: MechanicsProgramView['advice'] }) {
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
              ? `${WEEKS * PER_WEEK}번을 다 했어요. ${next.name}${josa(next.name, '으로/로')} 넘어가기 전 실제 투구에서 유지되는지와 다음 날 반응을 확인해요.`
              : `${WEEKS * PER_WEEK}번을 다 했어요. 횟수만으로 다음 수준을 정하지 않아요. 같은 조건의 영상·실제 투구·다음 날 반응을 확인해요.`}
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
            <li key={lv.key} className={`space-y-3 rounded-2xl border bg-surface p-(--block-pad) ${on ? 'border-sky' : 'border-line'}`}>
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
                  {/* 하는 법 · 첫 세션 드릴은 눌러서(카드 넷이 4~5줄씩이었다) */}
                  <FoldNote tone="muted">
                    <p className="text-xs leading-relaxed break-keep text-muted">{lv.what}</p>
                    <p className="text-xs break-keep text-muted">첫 세션: {lv.blocks[0][0].join(' · ')}</p>
                  </FoldNote>
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
        detail={`${ask ? mechanicsLevel(ask).name : ''} 1번 세션부터 시작해요. 지금까지 한 드릴 기록은 남아요.`}
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
          {/* 한 줄 + 하는 법은 접기(2026-10-16 UI 검토 — 견줘 볼 때 글이 세 문장 180자였다) */}
          <p className="text-sm leading-relaxed break-keep text-muted">
            {kind === 'baseline'
              ? `세션 ${FILM_EVERY}번 뒤에 이 영상과 견줘 봐요.`
              : `세션 ${sessionsDone}번을 했어요. 처음 영상과 견줘 봐요.`}
          </p>
          <FoldNote tone="muted" label="어떻게 찍나요">
            <p className="text-footnote leading-relaxed break-keep text-muted">
              {kind === 'baseline'
                ? '옆에서 평소처럼 몇 개 던지는 모습을 찍어 투구 기록에 남겨요.'
                : '같은 자리에서 다시 찍어 처음 영상과 나란히 보세요. 구속도 재 두면 효과를 알 수 있어요.'}
            </p>
          </FoldNote>
        </div>
      </div>
      <ButtonLink
        variant="secondary"
        href={kind === 'baseline' ? '/videos' : '/videos?compare=1'}
        className="min-h-11 w-full rounded-full text-sm"
      >
        {kind === 'baseline' ? '투구 탭 열기' : '2분할 비교 열기'}
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
            세션 {f.session}번 · <b className={f.verdict === 'better' ? 'text-sky-strong' : 'text-ink'}>{label(f.verdict)}</b>
            <small className="block text-xs text-muted">
              {f.comparable ? '촬영 조건 같음' : '촬영 조건 미확인'} · {f.transferred ? '실제 투구 확인' : '실제 투구 미확인'} ·{' '}
              {f.response === 'clear' ? '통증 없음' : f.response === 'pain' ? '통증 있음' : '운동 후 반응 미확인'}
            </small>
          </span>
          <span className="shrink-0 text-xs text-muted tabular-nums">
            {Number(f.on.slice(5, 7))}/{Number(f.on.slice(8, 10))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------- 3D 리포트 처방(6-4절) ------------------------- */

/** 처방 칸 드릴의 '처방' 꼬리표 — 드릴 이름 앞 */
export function RxTag({ rx }: { rx: { element: string; level: 'improve' | 'edge' } }) {
  return (
    <span className="mr-1.5 inline-flex translate-y-[-1px] items-center rounded-full bg-sky px-2 py-0.5 align-middle text-caption font-bold text-white">
      처방 · {rx.element}
    </span>
  );
}

/** 요소 칩 '브레이크 집중' · '몸통 회전 보조' */
function RxChips({ rx }: { rx: { element: string; level: 'improve' | 'edge' }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {rx.map((r) => (
        <span
          key={r.element}
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            r.level === 'improve' ? 'bg-sky text-white' : 'bg-sky-tint text-sky-strong'
          }`}
        >
          {r.element} {RX_LEVEL_TEXT[r.level]}
        </span>
      ))}
    </div>
  );
}

const dayText = (key: string) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;

/**
 * 처방 카드(프로그램 칸 맨 위) — 무엇을 · 몇 번째 · 느낌 신호 · 다음 재기에서 볼 숫자. 다 마치면 '다시 찍어 견줘요' 하나로 바뀐다
 * (다시 재기 안내는 여기 하나 — 촬영 권유 카드는 처방 중엔 숨긴다).
 */
function FocusCard({ focus }: { focus: FocusView }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = () =>
    startTransition(async () => {
      setError(null);
      const res = await orOffline(endMechanicsFocus({ runId: focus.runId }), { error: OFFLINE_MESSAGE });
      setAsk(false);
      if ('error' in res) setError(res.error);
      else quietRefresh(router);
    });
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-heading text-lg text-ink">3D 리포트 처방</h2>
        <span className="text-xs text-muted">{dayText(focus.startedOn)} 시작</span>
      </div>
      <RxChips rx={focus.rx} />
      {focus.criteriaNote && <p className="text-sm text-warn">{focus.criteriaNote}</p>}
      <FocusProgress focus={focus} />
      <FocusReview focus={focus} />
      {!focus.skill &&
        (focus.finished ? (
          <>
            <p className="text-sm leading-relaxed break-keep text-ink">처방을 마쳤어요. 같은 자리에서 다시 찍어 리포트와 견줘요.</p>
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href="/videos/lab" className="rounded-full">
                리포트 받기
              </ButtonLink>
              <Button variant="secondary" onClick={end} disabled={pending} className="rounded-full">
                {pending ? '닫는 중…' : '처방 닫기'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="flex items-baseline justify-between gap-2 text-sm">
                <b className="text-ink tabular-nums">
                  {focus.done} / {focus.total} 세션
                </b>
                <span className="text-xs text-muted">
                  {focus.week}주차{focus.stage ? ` · ${focus.stage}` : ''}
                </span>
              </p>
              <div className="grid grid-cols-9 gap-1" aria-hidden>
                {Array.from({ length: focus.total }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full ${i < focus.done ? 'bg-sky' : i === focus.done ? 'bg-sky/40' : 'bg-surface-2'}`}
                  />
                ))}
              </div>
            </div>
            {focus.cue && (
              <p className="rounded-xl bg-sky-tint/60 px-3.5 py-2.5 text-sm font-semibold break-keep text-sky-strong">“{focus.cue}”</p>
            )}
            {focus.target && (
              <p className="text-xs break-keep text-muted">
                목표 {focus.target.label} {focus.target.now} → {focus.target.goal}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/videos/lab/${focus.reportId}`}
                className="inline-flex min-h-10 items-center text-sm font-semibold text-sky-strong"
              >
                리포트 보기 ›
              </Link>
              <button
                type="button"
                onClick={() => setAsk(true)}
                className="inline-flex min-h-10 items-center text-xs font-semibold text-muted transition-colors hover:text-danger"
              >
                처방 그만두기
              </button>
            </div>
          </>
        ))}
      {focus.skill && (
        <button type="button" onClick={() => setAsk(true)} className="min-h-11 text-sm text-muted">
          처방 그만두기
        </button>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        onConfirm={end}
        title="처방을 그만둘까요?"
        detail="지금 수준 프로그램의 드릴로 돌아가요. 수준 진행은 그대로예요."
        confirmLabel="그만두기"
        pending={pending}
        pendingLabel="그만두는 중…"
      />
    </Card>
  );
}

/**
 * [처방 시작] 확인 시트 — 3D 리포트에서 /training?view=mechanics&focus=<리포트 번호>로 왔을 때. 처방은 지금 수준 세션의 드릴 칸을 바꾸는 것이라
 * 수준이 없으면 같은 시트에서 고른다. 다른 처방이 진행 중이면 바뀐다고 알린다. 같은 처방이 이미 진행 중이면 시트를 안 띄운다.
 */
function FocusStartSheet({ offer, level, current }: { offer: FocusOfferView; level: LevelKey | null; current: FocusView | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [pick, setPick] = useState<LevelKey | null>(level);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const running = current && !current.finished ? current : null;
  if ('reportId' in offer && running?.reportId === offer.reportId) return null;
  const close = () => {
    setOpen(false);
    router.replace('/training?view=mechanics', { scroll: false });
  };
  if ('error' in offer) {
    return (
      <Modal open={open} onClose={close} title="처방을 시작할 수 없어요">
        <div className="space-y-5">
          <p className="text-sm leading-relaxed break-keep text-ink">{offer.error}</p>
          <Button variant="secondary" onClick={close} className="w-full rounded-full">
            닫기
          </Button>
        </div>
      </Modal>
    );
  }
  const what = offer.rx.map((r) => `${r.element} ${RX_LEVEL_TEXT[r.level]}`).join(' · ');
  const start = () =>
    startTransition(async () => {
      setError(null);
      const res = await orOffline(
        startMechanicsFocus({ reportId: offer.reportId, level: pick, expectedRunId: current?.runId ?? null, expectedJobId: offer.jobId }),
        {
          error: OFFLINE_MESSAGE,
        }
      );
      if ('error' in res) setError(res.error);
      else close();
    });
  return (
    <Modal open={open} onClose={close} title="처방을 시작할까요?">
      <div className="space-y-4">
        <RxChips rx={offer.rx} />
        <p className="text-sm leading-relaxed break-keep text-ink">
          {what}
          {josa(what, '을/를')} 기초부터 연습해요. 필수 드릴·동작 목표·다음 날 반응을 확인하고 다음 단계를 선택해요.
        </p>
        {running && (
          <p className="rounded-xl bg-warn-bg px-3.5 py-2.5 text-sm font-semibold break-keep text-warn">
            진행 중인 처방({running.rx[0]?.element} {running.done}/{running.total})은 새 처방으로 바뀌어요.
          </p>
        )}
        {!level && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-ink">수준부터 골라요</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="수준">
              {MECHANICS_LEVELS.map((lv) => (
                <button
                  key={lv.key}
                  type="button"
                  role="radio"
                  aria-checked={pick === lv.key}
                  onClick={() => setPick(lv.key)}
                  className={`min-h-12 rounded-2xl border px-3 text-left transition-colors ${
                    pick === lv.key ? 'border-sky bg-sky-tint text-sky-strong' : 'border-line bg-surface text-ink'
                  }`}
                >
                  <span className="block text-sm font-bold">{lv.name}</span>
                  <span className="block text-xs break-keep text-muted">{lv.line}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <ErrorLine>{error}</ErrorLine>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={close} className="rounded-full">
            나중에
          </Button>
          <Button onClick={start} disabled={pending || !pick} className="rounded-full">
            {pending ? '시작하는 중…' : '시작'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
