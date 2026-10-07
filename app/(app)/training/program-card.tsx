'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Play } from 'lucide-react';
import { Card } from '@/components/ui';
import { Modal, useModalState } from '@/components/modal';
import { ConfirmDialog } from '@/components/confirm-delete';
import { DisclosureButton } from '@/components/disclosure';
import { ErrorLine } from '@/components/error-line';
import { SafeForm } from '@/components/safe-form';
import { OpenCheckinButton } from '@/components/notice-bell';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import {
  overrideProgramRest,
  programChoices,
  repinProgramExercise,
  skipProgramDay,
  startProgramWorkout,
  stopProgram,
} from '@/app/actions/program';
import type { ProgramCardProps } from '@/lib/program/load';
import type { VariantKey } from '@/lib/program/program';

/**
 * 근력 · 파워 프로그램 카드 — 트레이닝 화면 맨 위(설계 §13-1 · 2).
 *
 * 차례: 오늘 상태 + 일차 → 주의 한 줄 → [운동 시작] → 운동 줄 → 진행 → 자세히.
 * 운동 줄은 체크하는 칸이 아니라 미리보기다(§13-14). 누르면 그 무게의 까닭이 작은 창으로 뜬다(§13-10).
 * 쉬는 날은 '쉬어요'가 주인공이고 [운동 시작]이 없다(§13-5).
 */

type Row = ProgramCardProps['rows'][number];

function kgText(kg: number) {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

export function ProgramCard({ props }: { props: ProgramCardProps }) {
  const p = props;
  const reason = useModalState<Row>();
  const [more, setMore] = useState(false);
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
  const resting = p.kind === 'rest' || p.kind === 'spacing' || p.kind === 'painWait';
  const preview = !going || finishedToday;

  const title = finishedToday
    ? `오늘 했어요 · ${p.dayLabel}`
    : going
      ? `오늘 해요 · ${p.dayLabel}`
      : resting
        ? '오늘은 쉬어요'
        : p.kind === 'otherMode'
          ? '오늘은 다른 운동을 했어요'
          : p.kind === 'needCheckin'
            ? `오늘 할 일 · ${p.dayLabel}`
            : '다 마쳤어요';

  const sub =
    p.kind === 'rest'
      ? p.restText
      : p.kind === 'spacing'
        ? '어제 프로그램을 했어요. 하루 쉬고 이어 가요.'
        : p.kind === 'painWait'
          ? `통증 기록이 있어 ${p.dayLabel}는 기다려요.`
          : p.kind === 'otherMode'
            ? `${p.dayLabel}는 다음에 해요.`
            : p.kind === 'needCheckin'
              ? '체크인을 남기면 오늘 몸 상태에 맞춰 정해요.'
              : null;

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted">근력 · 파워 프로그램</p>
        <p className="text-heading text-xl text-ink">{title}</p>
        {sub && <p className="text-sm text-muted">{sub}</p>}
        {(resting || finishedToday || p.kind === 'otherMode') &&
          (p.nextLabel || resting) && (
            <p className="text-sm text-muted">
              다음: {finishedToday ? p.nextLabel : p.dayLabel}
            </p>
          )}
      </div>

      {going && !finishedToday && p.caution && (
        <p className="flex items-start gap-1.5 text-sm text-ink">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span className="break-keep">{p.caution}</span>
        </p>
      )}

      {going && !finishedToday && (
        <SafeForm action={startProgramWorkout}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky py-4 text-base font-bold text-white transition-transform motion-safe:active:scale-[0.98]"
          >
            <Play aria-hidden className="h-5 w-5" />
            {p.todayState === 'active' ? '운동 이어서 하기' : '운동 시작'}
          </button>
        </SafeForm>
      )}

      {p.kind === 'needCheckin' && (
        <OpenCheckinButton className="min-h-11 w-full rounded-2xl bg-sky py-3 text-base font-bold text-white">
          체크인 하기
        </OpenCheckinButton>
      )}

      {p.rows.length > 0 && (
        <ul className={`divide-y divide-line ${preview ? 'opacity-55' : ''}`}>
          {p.rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={(e) => reason.show(r, e)}
                className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{r.title}</span>
                  {r.contrast && (
                    <span className="block text-xs text-muted">{r.contrast}</span>
                  )}
                  {r.tag && (
                    <span className="mt-0.5 inline-block rounded-md bg-ink/6 px-1.5 text-[11px] text-muted">
                      {r.tag}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  {r.kg != null ? (
                    <span className="text-numeric text-base font-bold text-sky-strong">
                      {kgText(r.kg)}kg
                      {r.perHand && (
                        <span className="ml-1 text-[11px] font-medium text-muted">
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
            {going && !finishedToday && (
              <MoreRow onClick={() => setConfirm('skip')}>이 날 건너뛰기</MoreRow>
            )}
            <MoreRow onClick={() => setRepin(true)}>고정 운동 바꾸기</MoreRow>
            <OpenCheckinButton className="flex min-h-11 w-full items-center text-sm font-semibold text-sky-strong">
              몸 상태가 바뀌었으면 체크인 고치기
            </OpenCheckinButton>
            <MoreRow onClick={() => setConfirm('stop')} danger>
              그만두기
            </MoreRow>
          </div>
        )}
      </div>

      <Modal
        open={reason.open}
        onClose={reason.close}
        title={reason.content?.title ?? ''}
        origin={reason.origin}
      >
        {reason.content && <ReasonBody row={reason.content} />}
      </Modal>

      <ConfirmDialog
        open={confirm === 'skip'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => skipProgramDay({ day: p.day }))}
        title={`${p.dayLabel}를 건너뛸까요?`}
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

function ReasonBody({ row }: { row: Row }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink">
      <p className="text-muted">
        {row.slotLabel} · {row.line}
      </p>
      {row.substituteFor && <p>오늘은 {row.substituteFor} 대신이에요.</p>}
      {row.reason ? (
        <p className="break-keep">{row.reason}</p>
      ) : (
        <p>무게 없이 하는 운동이에요.</p>
      )}
      {row.kg != null && (
        <p>
          추천 <b className="text-numeric">{kgText(row.kg)}kg</b>
          {row.perHand ? ' (한 손)' : ''}. 실제 무게는 들어 보고 정해요.
        </p>
      )}
      {row.warmup && <p className="text-muted">준비: {row.warmup}</p>}
    </div>
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
                  <span className="block truncate text-[15px] text-ink">
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
                <span className="truncate text-[15px] text-ink">{c.title}</span>
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
