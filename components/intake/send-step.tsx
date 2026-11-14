'use client';

import { useEffect, useState } from 'react';
import { Check, CircleCheck, Loader2 } from '@/components/icon';
import { FieldError, NoteBox, PrimaryButton, Screen, SecondaryButton } from '@/components/intake/shell';
import { VIEW_LABEL } from '@/components/intake/slots';
import type { SendRow, SendStage, SendState } from '@/components/intake/use-send';
import { formatBytes } from '@/lib/intake/limits';
import { CONTROL_TIMEOUT_MS } from '@/lib/intake/public-client';

const STAGES: { id: 'prepare' | 'send' | 'confirm'; label: string }[] = [
  { id: 'prepare', label: '준비' },
  { id: 'send', label: '보내기' },
  { id: 'confirm', label: '서버 확인' },
];
const stageIndex = (s: SendStage) => (s === 'prepare' ? 0 : s === 'send' ? 1 : 2);

function rowText(r: SendRow): string {
  const pct = (done: number) => (r.size ? Math.floor((done / r.size) * 100) : 0);
  switch (r.status) {
    case 'waiting':
      return '기다리는 중';
    case 'hashing':
      return `파일 확인 ${pct(r.hashed)}%`;
    case 'hashed':
      return r.sent > 0 ? `보내는 중 ${pct(r.sent)}%` : '보내기를 기다리는 중';
    case 'sending':
      return `보내는 중 ${pct(r.sent)}%`;
    case 'confirming':
      return '도착 확인 중';
    case 'arrived':
      return '전송 완료';
  }
}

/**
 * 진행이 이만큼 안 바뀌면 '멈추기' 단추를 보인다. 요청 시한(20초)과 같은 값이다 —
 * 시한 뒤 한 번 더 묻는 동안(retryNetwork) 사람이 기다리기만 하지 않게, 멈추고 이어서 보낼 길을 먼저 보인다.
 */
const STALL_MS = CONTROL_TIMEOUT_MS;

/** 진행이 멈춘 채 STALL_MS 가 지났나 — 진행(바이트 · 단계 · 칸 상태)이 바뀌면 다시 센다 */
function useStalled(run: SendState): boolean {
  const mark = `${run.attempt}|${run.stage}|${run.rows.map((r) => `${r.status}:${r.hashed}:${r.sent}`).join(',')}`;
  const watching = run.running && !run.stop;
  /* 늦어졌다고 본 진행 표시 — 진행이 바뀌면 표시가 달라져 저절로 풀린다(효과 안에서 곧바로 상태를 바꾸지 않는다) */
  const [stalledAt, setStalledAt] = useState<string | null>(null);
  useEffect(() => {
    if (!watching) return;
    const t = window.setTimeout(() => setStalledAt(mark), STALL_MS);
    return () => window.clearTimeout(t);
  }, [mark, watching]);
  return watching && stalledAt === mark;
}

/** 멈췄을 때의 다음 행동은 부르는 쪽이 코드에 맞게 넘긴다. 진행이 오래 멈추면 onCancel 로 멈추는 단추를 보인다 */
export function SendStep({
  run,
  actionLabel,
  onAction,
  onCancel,
}: {
  run: SendState;
  actionLabel: string | null;
  onAction: () => void;
  onCancel?: () => void;
}) {
  const stalled = useStalled(run);
  const total = run.rows.reduce((n, r) => n + r.size, 0) || 1;
  const hashed = run.rows.reduce((n, r) => n + r.hashed, 0);
  const sent = run.rows.reduce((n, r) => n + r.sent, 0);
  const preparing = run.stage === 'prepare';
  const done = preparing ? hashed : sent;
  const pct = Math.min(100, Math.floor((done / total) * 100));
  const after = run.stage === 'confirm' || run.stage === 'finalize';
  const at = stageIndex(run.stage);

  /* 화면 읽기에는 10% 마다만 알린다 */
  const spoken = after
    ? '전송이 끝났습니다. 파일이 그대로 도착했는지 확인하고 있습니다.'
    : `${preparing ? '파일을 준비하는 중' : '보내는 중'} ${Math.floor(pct / 10) * 10}%`;

  return (
    <Screen
      screenKey="send"
      title={
        run.stop
          ? '전송이 멈췄습니다'
          : preparing
            ? '전송 준비 중'
            : after
              ? '서버 확인 중'
              : '영상 전송 중'
      }
      desc="접수 완료가 표시될 때까지 화면을 열어 둡니다."
      step={5}
      actions={
        run.stop && actionLabel ? (
          <PrimaryButton onClick={onAction}>{actionLabel}</PrimaryButton>
        ) : stalled && onCancel ? (
          <SecondaryButton onClick={onCancel}>멈추기</SecondaryButton>
        ) : undefined
      }
    >
      <p aria-live="polite" className="sr-only">
        {run.stop ? '' : spoken}
      </p>

      <ol aria-label="진행 단계" className="flex items-center gap-2">
        {STAGES.map((s, i) => {
          const passed = i < at;
          const now = i === at;
          return (
            <li
              key={s.id}
              aria-current={now ? 'step' : undefined}
              className={`flex items-center gap-1.5 text-footnote ${now ? 'font-bold text-ink' : passed ? 'text-ink' : 'text-muted'}`}
            >
              {passed ? (
                <Check aria-hidden className="h-4 w-4 text-ok" />
              ) : (
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${now ? 'bg-sky' : 'bg-line-strong'}`}
                />
              )}
              {s.label}
              {i < STAGES.length - 1 && (
                <span aria-hidden className="ml-0.5 h-px w-4 bg-line-strong" />
              )}
            </li>
          );
        })}
      </ol>

      <section
        aria-label="전체 진행"
        className="rounded-2xl bg-surface p-(--block-pad)"
      >
        {after ? (
          <p className="flex items-start gap-2 text-sm leading-relaxed break-keep text-ink">
            {!run.stop && (
              <Loader2
                aria-hidden
                className="mt-0.5 h-5 w-5 shrink-0 motion-safe:animate-spin"
              />
            )}
            {/* 멈춘 뒤에는 '확인하고 있어요'라고 하지 않는다 — 다음 행동은 아래 단추가 말한다 */}
            {run.stop
              ? '전송 후 서버 확인이 완료되지 않았습니다.'
              : '파일 전체가 바뀌지 않고 도착했는지 확인 중입니다.'}
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                {preparing ? '파일을 준비하는 중' : '보내는 중'}
              </p>
              <p className="text-numeric text-[28px] font-semibold text-ink">{pct}%</p>
            </div>
            <div
              role="progressbar"
              aria-label={preparing ? '파일 준비' : '전체 전송'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-2 h-2 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-sky transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-footnote text-muted">
              {formatBytes(done)} / {formatBytes(total)}
            </p>
          </>
        )}
      </section>

      <ul className="space-y-2">
        {run.rows.map((r) => (
          <li
            key={r.view}
            className="flex items-center gap-3 border-b border-line py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{VIEW_LABEL[r.view]}</p>
              <p className="truncate text-footnote text-muted">{r.name}</p>
            </div>
            <p className="flex shrink-0 items-center gap-1.5 text-footnote text-muted">
              {r.status === 'arrived' && (
                <CircleCheck aria-hidden className="h-4 w-4 text-ok" />
              )}
              {rowText(r)}
            </p>
          </li>
        ))}
      </ul>

      {run.stop && <FieldError>{run.stop.message}</FieldError>}
      {stalled && onCancel && (
        <NoteBox>
          {
            '서버 응답이 늦어지고 있습니다.\n멈춘 뒤 이어서 보내면 이미 도착한 부분부터 이어집니다.'
          }
        </NoteBox>
      )}
    </Screen>
  );
}
