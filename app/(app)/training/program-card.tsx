'use client';

import { useEffect, useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { AlertCircle, ArrowLeftRight, ChevronDown, Play } from '@/components/icon';
import { Card, Button } from '@/components/ui';
import { useWeightUnit } from '@/components/use-units';
import { formatWeight } from '@/lib/units';
import { Modal, useModalState } from '@/components/modal';
import { ConfirmDialog } from '@/components/confirm-delete';
import { DisclosureButton } from '@/components/disclosure';
import { ErrorLine } from '@/components/error-line';
import { SafeForm } from '@/components/safe-form';
import { OpenCheckinButton } from '@/components/notice-bell';
import { LibraryVideo } from '@/components/library-video';
import { toast } from '@/components/toast';
import { DescriptionText, useExerciseDescription } from './armcare-media';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { withJosa } from '@/lib/korean';
import {
  overrideProgramRest,
  programChoices,
  programSwapChoices,
  repinProgramExercise,
  skipProgramDay,
  startProgramWorkout,
  stopProgram,
  swapProgramToday,
} from '@/app/actions/program';
import { changeSessionExercise, type SwapChoices, type SwapPick } from '@/app/actions/workout';
import { SwapSheetView } from '@/app/(session)/workout/run/swap-sheet';
import type { ProgramCardProps } from '@/lib/program/load';
import { sessionTitle, type VariantKey } from '@/lib/program/program';

/**
 * 근력 · 파워 프로그램 카드 — 트레이닝 화면 맨 위(설계 §13-1 · 2).
 *
 * 차례: 오늘 상태 + 일차 → 주의 한 줄 → [운동 시작] → 운동 줄 → 진행 → 자세히.
 * 운동 줄은 체크하는 칸이 아니라 미리보기다(§13-14). 누르면 그 무게의 까닭이 작은 창으로 뜬다(§13-10).
 * 쉬는 날은 '쉬어요'가 주인공이고 [운동 시작]이 없다(§13-5).
 */

type Row = ProgramCardProps['rows'][number];

export function ProgramCard({ props }: { props: ProgramCardProps }) {
  /* 추천 무게는 설정 단위로(저장 · 계산은 kg) */
  const unit = useWeightUnit();
  const p = props;
  const reason = useModalState<Row>();
  /* 줄의 '바꾸기' — 오늘만 다른 운동으로(2026-10-21 김민: "목록에서 바로 · 직접 고르게") */
  const swap = useModalState<Row>();
  const [more, setMore] = useState(false);
  const [ahead, setAhead] = useState(false);
  const [confirm, setConfirm] = useState<'skip' | 'stop' | 'override' | null>(null);
  const [repin, setRepin] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const run = (call: () => Promise<{ ok: true } | { error: string }>) =>
    start(async () => {
      setError(undefined);
      const r = await orOffline(call(), { error: OFFLINE_MESSAGE });
      if ('error' in r) setError(r.error);
      setConfirm(null);
    });

  const going = p.kind === 'go';
  const finishedToday = p.todayState === 'finished';
  const resting = p.kind === 'rest' || p.kind === 'painWait';
  const preview = !going || finishedToday;
  const canSwap = going && !finishedToday;

  const programName = p.basics ? '기본기 프로그램' : '근력 · 파워 프로그램';
  const session = sessionTitle(p.dayLabel);
  /* 하는 날은 한 줄로 '근력 · 파워 프로그램 · 2번째 세션(B)' — 위 작은 글과 겹쳐 '오늘 해요 · 2번 세션 · B 날'로 읽히던 것(2026-10-20 김민) */
  const oneLine = going && !finishedToday;
  const title = finishedToday
    ? `오늘 했어요 · ${session}`
    : going
      ? `${programName} · ${session}`
      : resting
        ? '오늘은 쉬어요'
        : p.kind === 'otherMode'
          ? '오늘은 다른 운동을 했어요'
          : p.kind === 'needCheckin'
            ? `오늘 할 일 · ${session}`
            : '다 마쳤어요';

  const sub =
    p.kind === 'rest'
      ? p.restText
      : p.kind === 'painWait'
        ? `통증 기록이 있어 ${withJosa(p.dayLabel, '은/는')} 기다려요.`
        : p.kind === 'otherMode'
          ? `${withJosa(p.dayLabel, '은/는')} 다음에 해요.`
          : p.kind === 'needCheckin'
            ? '체크인을 남기면 오늘 몸 상태에 맞춰 정해요.'
            : null;

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        {!oneLine && <p className="text-xs font-semibold text-muted">{programName}</p>}
        <p className="text-heading text-xl text-ink">{title}</p>
        {sub && <p className="text-sm text-muted">{sub}</p>}
        {(resting || finishedToday || p.kind === 'otherMode') &&
          (p.nextLabel || resting) && (
            <p className="text-sm text-muted">
              다음: {sessionTitle((finishedToday ? p.nextLabel : p.dayLabel) ?? '')}
            </p>
          )}
      </div>

      {going && !finishedToday && p.caution && (
        <p className="flex items-start gap-1.5 text-sm text-ink">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span className="break-keep">{p.caution}</span>
        </p>
      )}

      {/* 하는 날인데 할 운동이 다 빠지면 단추 대신 한 줄 — 서버(startProgramWorkout)가 어차피 트레이닝으로 돌려보낸다(2026-10-16 검토 9) */}
      {going && !finishedToday && !p.canStart && (
        <p className="text-sm text-muted">오늘은 할 수 있는 운동이 없어요. 뺀 까닭은 아래에 있어요.</p>
      )}
      {going && !finishedToday && p.canStart && (
        <SafeForm action={startProgramWorkout}>
          <Button
            type="submit"
            size="lg"
            className="w-full pad:w-auto pad:px-8"
          >
            <Play aria-hidden className="h-5 w-5" />
            {p.todayState === 'active' ? '운동 이어서 하기' : '운동 시작'}
          </Button>
        </SafeForm>
      )}

      {p.kind === 'needCheckin' && (
        <OpenCheckinButton className="min-h-11 w-full rounded-2xl bg-sky py-3 text-base font-bold text-white pad:w-auto pad:px-8">
          체크인 하기
        </OpenCheckinButton>
      )}

      {p.rows.length > 0 && (
        <ul className={`divide-y divide-line ${preview ? 'opacity-55' : ''}`}>
          {p.rows.map((r) => (
            <li key={r.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => reason.show(r, e)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead text-ink">
                    {r.optional && (
                      <span className="mr-1.5 rounded-full bg-ink/6 px-1.5 py-0.5 text-xs font-semibold text-muted">
                        선택
                      </span>
                    )}
                    {r.title}
                  </span>
                  {r.contrast && (
                    <span className="block text-xs text-muted">{r.contrast}</span>
                  )}
                  {r.swappedFrom ? (
                    <span className="mt-0.5 inline-block truncate rounded-lg bg-sky/12 px-1.5 text-caption text-sky-strong">
                      오늘만 바꿈 · 원래 {r.swappedFrom.title}
                    </span>
                  ) : (
                    r.tag && (
                      <span className="mt-0.5 inline-block rounded-lg bg-ink/6 px-1.5 text-caption text-muted">
                        {r.tag}
                      </span>
                    )
                  )}
                </span>
                <span className="shrink-0 text-right">
                  {r.kg != null ? (
                    <span className="text-numeric text-base font-bold text-sky-strong">
                      {formatWeight(r.kg, unit)}
                      {r.perHand && (
                        <span className="ml-1 text-caption font-medium text-muted">
                          한 손
                        </span>
                      )}
                    </span>
                  ) : r.first ? (
                    <span className="text-xs text-muted">처음</span>
                  ) : null}
                  <span className="block text-xs text-muted">{r.amount}</span>
                </span>
              </button>
              {canSwap && (
                <button
                  type="button"
                  onClick={(e) => swap.show(r, e)}
                  aria-label={`${r.title} 바꾸기`}
                  className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-sky-strong active:bg-ink/6"
                >
                  <ArrowLeftRight aria-hidden className="h-5 w-5" />
                </button>
              )}
            </li>
          ))}
          {p.dropped.map((d) => (
            <li key={`drop-${d.title}`} className="py-2 text-sm text-muted">
              오늘 뺌: {d.title} · {d.reason}
            </li>
          ))}
        </ul>
      )}

      {p.kind === 'rest' && (
        <button
          type="button"
          onClick={() => setConfirm('override')}
          className="min-h-11 w-full rounded-2xl border border-line-strong text-sm font-semibold text-ink"
        >
          그래도 오늘 할래요
        </button>
      )}

      <div className="space-y-1">
        <div
          role="progressbar"
          aria-label="프로그램 진행"
          aria-valuemin={0}
          aria-valuemax={p.total}
          aria-valuenow={p.completed + p.skipped}
          className="flex h-2 overflow-hidden rounded-full bg-ink/8"
        >
          <span
            className="bg-sky"
            style={{ width: `${(p.completed / p.total) * 100}%` }}
          />
          <span
            className="bg-sky/35"
            style={{ width: `${(p.skipped / p.total) * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted">
          완료 {p.completed} · 건너뜀 {p.skipped} / {p.total}
        </p>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      {/* 자주 찾는 셋은 '자세히' 밖에(2026-10-20 김민: "자세히를 눌러야 나와서 못 찾는다") */}
      <div>
        <MoreRow onClick={() => setRepin(true)}>고정 운동 바꾸기</MoreRow>
        <OpenCheckinButton className="flex min-h-11 w-full items-center text-sm font-semibold text-sky-strong">
          몸 상태가 바뀌었으면 체크인 고치기
        </OpenCheckinButton>
        <MoreRow onClick={() => setConfirm('stop')} danger>
          그만두기
        </MoreRow>
      </div>

      {p.upcoming.length > 0 && (
        <div className="-mx-(--block-pad) border-t border-line">
          <DisclosureButton
            open={ahead}
            onClick={() => setAhead((v) => !v)}
            label={`앞으로 할 세션 · ${p.upcoming.length}회`}
          />
          {ahead && <UpcomingSessions sessions={p.upcoming} />}
        </div>
      )}

      <div className="-mx-(--block-pad) -mb-(--block-pad) border-t border-line">
        <DisclosureButton
          open={more}
          onClick={() => setMore((v) => !v)}
          label="자세히"
        />
        {more && (
          <div className="space-y-1 px-(--block-pad) pb-(--block-pad)">
            <p className="text-sm text-muted">
              {p.name} · {p.subtitle}
            </p>
            {/* 운동 중인 날은 숨긴다 — 서버(skipProgramDay)도 거절한다(2026-10-16 점검 A4) */}
            {going && !finishedToday && p.todayState !== 'active' && (
              <MoreRow onClick={() => setConfirm('skip')}>이 날 건너뛰기</MoreRow>
            )}
          </div>
        )}
      </div>

      <Modal
        open={reason.open}
        onClose={reason.close}
        title={reason.content?.title ?? ''}
        origin={reason.origin}
      >
        {reason.content && (
          <ReasonBody
            key={reason.content.id}
            row={reason.content}
            canSwap={canSwap}
            active={p.todayState === 'active'}
            onSwap={() => {
              const r = reason.content;
              reason.close();
              if (r) swap.show(r);
            }}
            onSwapped={reason.close}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={confirm === 'skip'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => skipProgramDay({ day: p.day }))}
        title={`${withJosa(p.dayLabel, '을/를')} 건너뛸까요?`}
        detail={`건너뛴 날은 완료로 세지 않아요. 지금 완료 ${p.completed} · 건너뜀 ${p.skipped}.`}
        confirmLabel="건너뛰기"
        pending={pending}
        pendingLabel="넘기는 중…"
      />
      <ConfirmDialog
        open={confirm === 'stop'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(stopProgram)}
        title="프로그램을 그만둘까요?"
        detail="이 판은 여기서 끝나요. 기록은 남고, 나중에 새로 시작할 수 있어요."
        confirmLabel="그만두기"
        pending={pending}
        pendingLabel="그만두는 중…"
      />
      <ConfirmDialog
        open={confirm === 'override'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(overrideProgramRest)}
        title={p.restText ? `${p.restText}. 그래도 할까요?` : '그래도 할까요?'}
        detail="가볍게 하고, 아프면 바로 멈춰요."
        confirmLabel="할래요"
        pending={pending}
        pendingLabel="바꾸는 중…"
      />
      <RepinSheet open={repin} onClose={() => setRepin(false)} pinned={p.pinned} />
      {swap.content && (
        <ProgramSwapSheet
          open={swap.open}
          row={swap.content}
          active={p.todayState === 'active'}
          todayIds={p.rows.map((r) => r.id)}
          onClose={swap.close}
        />
      )}
    </Card>
  );
}

function MoreRow({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center text-sm font-semibold ${danger ? 'text-danger' : 'text-sky-strong'}`}
    >
      {children}
    </button>
  );
}

/**
 * 운동 줄을 누르면 뜨는 시트 — 영상 · 처방 · 무게 까닭 · 설명(2026-10-21 김민: "목록에서 영상 · 내용 확인"). 바꾸기는 줄 오른쪽 단추가
 * 먼저고(ProgramSwapSheet), 여기서도 같은 창을 연다. 오늘만 바꾼 줄은 '원래대로'.
 */
function ReasonBody({
  row,
  canSwap,
  active,
  onSwap,
  onSwapped,
}: {
  row: Row;
  /** 오늘 하는 날이고 아직 안 마쳤나 */
  canSwap: boolean;
  /** 오늘 판을 이미 열었나 — 원래대로 돌릴 때 그 판의 줄도 같이 */
  active: boolean;
  onSwap: () => void;
  onSwapped: () => void;
}) {
  const unit = useWeightUnit();
  const desc = useExerciseDescription(row.id);
  /* 열자마자 설명을 받는다 — 운동을 보려고 연 시트다. 줄마다 key 로 새로 붙어 한 번만 돈다 */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(desc.load, []);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const from = row.swappedFrom;

  const restore = () =>
    start(async () => {
      if (!from) return;
      setError(undefined);
      const r = await orOffline(swapProgramToday({ variant: row.variant, exerciseId: null }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in r) return setError(r.error);
      if (active) {
        const s = await orOffline(changeSessionExercise({ fromId: row.id, toId: from.id, mode: 'replace' }), {
          error: OFFLINE_MESSAGE,
        });
        if ('error' in s) return setError(s.error);
      }
      toast('원래대로 돌렸어요');
      onSwapped();
    });

  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink">
      {(row.videoPath || row.referenceVideoId) && (
        <LibraryVideo
          path={row.videoPath}
          referenceVideoId={row.referenceVideoId}
          title={row.title}
          thumbUrl={row.thumbUrl}
          aspectRatio={row.aspectRatio}
        />
      )}
      <p className="text-muted">
        {row.slotLabel} · {row.line}
      </p>
      {from && <p>오늘만 {from.title} 대신이에요.</p>}
      {row.substituteFor && <p>오늘은 {row.substituteFor} 대신이에요.</p>}
      {row.reason ? (
        <p className="break-keep">{row.reason}</p>
      ) : (
        <p>무게 없이 하는 운동이에요.</p>
      )}
      {row.kg != null && (
        <p>
          추천 <b className="text-numeric">{formatWeight(row.kg, unit)}</b>
          {row.perHand ? ' (한 손)' : ''}. 실제 무게는 들어 보고 정해요.
        </p>
      )}
      {row.warmup && <p className="text-muted">준비: {row.warmup}</p>}
      <DescriptionText desc={desc} />
      {canSwap && (
        <div className="flex gap-2 border-t border-line pt-3">
          <Button type="button" variant="secondary" className="flex-1" disabled={pending} onClick={onSwap}>
            <ArrowLeftRight aria-hidden className="h-4 w-4" />
            다른 운동으로 바꾸기
          </Button>
          {from && (
            <Button type="button" variant="ghost" disabled={pending} onClick={restore}>
              {pending ? '돌리는 중…' : '원래대로'}
            </Button>
          )}
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/* 찾기용 전체 목록 — 한 번 받으면 이 화면에 있는 동안 들고 있는다(운동 중 바꾸기 창과 같은 까닭) */
let swapLibrary: SwapPick[] | null = null;

/**
 * 줄의 '바꾸기' 창 — 운동 중 바꾸기 창과 같은 모양(비슷한 운동 · 즐겨찾기 · 최근 · 찾기). 고르면 오늘만 그 칸이 그 운동이 된다
 * (program.swapProgramToday — 고정 운동 · 다음 세션은 그대로). 오늘 판을 이미 열었으면 그 판의 줄도 같이 바꾼다.
 */
function ProgramSwapSheet({
  open,
  row,
  active,
  todayIds,
  onClose,
}: {
  open: boolean;
  row: Row;
  active: boolean;
  todayIds: string[];
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<SwapChoices | null>(null);
  const [library, setLibrary] = useState<SwapPick[] | null>(swapLibrary);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    programSwapChoices({ exerciseId: row.id, variant: row.variant, withLibrary: swapLibrary == null })
      .then((res) => {
        if (!alive) return;
        if ('error' in res) return setLoadError(res.error);
        if (res.library) {
          swapLibrary = res.library;
          setLibrary(res.library);
        }
        setChoices(res);
      })
      .catch(() => {
        if (alive) setLoadError('신호가 없어 불러오지 못했어요. 신호가 잡히면 다시 열어 주세요.');
      });
    return () => {
      alive = false;
    };
  }, [row.id, row.variant]);

  const pick = (id: string) => {
    setError(null);
    setBusyId(id);
    start(async () => {
      try {
        /* 원래 운동으로 고르면 바꿈을 지운다 */
        const r = await swapProgramToday({
          variant: row.variant,
          exerciseId: id === row.swappedFrom?.id ? null : id,
        });
        if ('error' in r) return setError(r.error);
        if (active) {
          const s = await changeSessionExercise({ fromId: row.id, toId: id, mode: 'replace' });
          if ('error' in s) return setError(s.error);
        }
        toast('오늘만 바꿨어요');
        onClose();
      } catch (err) {
        unstable_rethrow(err);
        setError('신호가 없어 바꾸지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <SwapSheetView
      open={open}
      current={{ id: row.id, title: row.title }}
      mode="replace"
      inPlanIds={todayIds}
      choices={choices}
      library={library}
      loadError={loadError}
      error={error}
      busyId={busyId}
      pending={pending}
      onPick={pick}
      onClose={onClose}
      note="오늘 세션에만 바뀌어요. 다음 세션은 원래 운동으로 해요. 늘 바꾸려면 '고정 운동 바꾸기'에서."
    />
  );
}

/** 고정 운동 바꾸기(§13-17) — 같은 칸 · 같은 계열 후보만. 바꾸면 그 운동의 무게 기록은 새로 시작해요. */
function RepinSheet({
  open,
  onClose,
  pinned,
}: {
  open: boolean;
  onClose: () => void;
  pinned: ProgramCardProps['pinned'];
}) {
  const [variant, setVariant] = useState<VariantKey | null>(null);
  const [choices, setChoices] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const pick = (v: VariantKey) =>
    start(async () => {
      setError(undefined);
      setVariant(v);
      setChoices(null);
      const r = await orOffline(programChoices({ variant: v }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in r) setError(r.error);
      else setChoices(r.choices);
    });

  const choose = (id: string) =>
    start(async () => {
      if (!variant) return;
      const r = await orOffline(repinProgramExercise({ variant, exerciseId: id }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in r) setError(r.error);
      else {
        setVariant(null);
        setChoices(null);
        onClose();
      }
    });

  const current = pinned.find((x) => x.variant === variant);
  return (
    <Modal
      open={open}
      onClose={() => {
        setVariant(null);
        setChoices(null);
        onClose();
      }}
      title={variant ? `${current?.label ?? ''} 바꾸기` : '고정 운동 바꾸기'}
      description="바꾼 운동의 무게 기록은 새로 시작해요."
    >
      {variant == null ? (
        <ul className="divide-y divide-line">
          {pinned.map((x) => (
            <li key={x.variant}>
              <button
                type="button"
                onClick={() => pick(x.variant)}
                className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{x.label}</span>
                  <span className="block truncate text-subhead text-ink">
                    {x.title ?? '고를 수 있는 운동이 없어요'}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-sky-strong">
                  바꾸기
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : choices == null ? (
        <p className="text-sm text-muted">{pending ? '불러오는 중…' : ''}</p>
      ) : choices.length === 0 ? (
        <p className="text-sm text-muted">가진 장비로 바꿀 수 있는 운동이 없어요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {choices.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(c.id)}
                className="flex min-h-12 w-full items-center justify-between gap-3 text-left disabled:opacity-50"
              >
                <span className="truncate text-subhead text-ink">{c.title}</span>
                {current?.title === c.title && (
                  <span className="text-xs text-muted">지금</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </Modal>
  );
}

/**
 * 앞으로 할 세션 — 세션마다 한 줄(이름 + 운동 몇 개 요약)을 눌러 펴면 운동마다 썸네일 · 이름 · 칸 · 양. 처방 한 줄은 운동을 누르면
 * 보인다(2026-10-15 김민: "남은 세션이 글자로 쫙 써져 무슨 운동인지 알 수가 없다"). 바로 다음 세션만 펴서 시작한다.
 */
function UpcomingSessions({ sessions }: { sessions: ProgramCardProps['upcoming'] }) {
  const [open, setOpen] = useState<number | null>(sessions[0]?.day ?? null);
  const [line, setLine] = useState<string | null>(null);
  return (
    <ol className="divide-y divide-line border-t border-line">
      {sessions.map((u) => {
        const shown = open === u.day;
        const names = u.items.map((it) => it.title);
        return (
          <li key={u.day}>
            <button
              type="button"
              aria-expanded={shown}
              onClick={() => setOpen(shown ? null : u.day)}
              className="flex min-h-12 w-full items-center gap-3 px-(--block-pad) py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-subhead font-semibold text-ink">{u.label}</span>
                {!shown && (
                  <span className="block truncate text-xs text-muted">
                    {names.slice(0, 3).join(' · ')}
                    {names.length > 3 ? ` 외 ${names.length - 3}` : ''}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted">{u.items.length}개</span>
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 shrink-0 text-muted transition-transform motion-safe:duration-200 ${shown ? 'rotate-180' : ''}`}
              />
            </button>
            {shown && (
              <ul className="space-y-1 px-(--block-pad) pb-3 motion-safe:animate-fade-in">
                {u.items.map((it, i) => {
                  const key = `${u.day}-${i}`;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        aria-expanded={line === key}
                        onClick={() => setLine(line === key ? null : key)}
                        className="flex min-h-14 w-full items-center gap-3 rounded-xl py-1 text-left"
                      >
                        {it.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.thumbUrl}
                            alt=""
                            loading="lazy"
                            className="h-12 w-16 shrink-0 rounded-xl object-cover ring-1 ring-line"
                          />
                        ) : (
                          <span aria-hidden className="h-12 w-16 shrink-0 rounded-xl bg-ink/6" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-subhead text-ink">{it.title}</span>
                          {it.title !== it.slotLabel && (
                            <span className="block truncate text-caption text-muted">{it.slotLabel}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-numeric text-sm font-semibold text-ink">{it.amount}</span>
                      </button>
                      {line === key && (
                        <p className="pb-1 pl-19 text-xs text-muted motion-safe:animate-fade-in">{it.line}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
