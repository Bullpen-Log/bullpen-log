'use client';

import { Check, CircleCheck, Loader2 } from '@/components/icon';
import { FieldError, PrimaryButton, Screen } from '@/components/intake/shell';
import { VIEW_LABEL } from '@/components/intake/slots';
import type { SendRow, SendStage, SendState } from '@/components/intake/use-send';
import { formatBytes } from '@/lib/intake/limits';

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

/** 멈췄을 때의 다음 행동은 부르는 쪽이 코드에 맞게 넘긴다 */
export function SendStep({ run, actionLabel, onAction }: { run: SendState; actionLabel: string | null; onAction: () => void }) {
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
    ? '전송이 끝났어요. 파일이 잘 도착했는지 확인하고 있어요.'
    : `${preparing ? '파일을 준비하고 있어요' : '보내고 있어요'} ${Math.floor(pct / 10) * 10}%`;

  return (
    <Screen
      screenKey="send"
      title="영상을 원본 그대로 보내고 있어요"
      desc="완료될 때까지 이 화면을 열어두세요."
      step={5}
      actions={
        run.stop && actionLabel ? <PrimaryButton onClick={onAction}>{actionLabel}</PrimaryButton> : undefined
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
            <li key={s.id} aria-current={now ? 'step' : undefined} className={`flex items-center gap-1.5 text-footnote ${now ? 'font-bold text-ink' : passed ? 'text-ink' : 'text-muted'}`}>
              {passed ? (
                <Check aria-hidden className="h-4 w-4 text-ok" />
              ) : (
                <span aria-hidden className={`h-2 w-2 rounded-full ${now ? 'bg-sky' : 'bg-line-strong'}`} />
              )}
              {s.label}
              {i < STAGES.length - 1 && <span aria-hidden className="ml-0.5 h-px w-4 bg-line-strong" />}
            </li>
          );
        })}
      </ol>

      <section aria-label="전체 진행" className="rounded-2xl bg-surface p-(--block-pad)">
        {after ? (
          <p className="flex items-start gap-2 text-sm leading-relaxed break-keep text-ink">
            {!run.stop && <Loader2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 motion-safe:animate-spin" />}
            전송이 끝났어요. 파일이 잘 도착했는지 확인하고 있어요.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{preparing ? '파일을 준비하고 있어요' : '보내고 있어요'}</p>
              <p className="text-numeric text-lg text-ink">{pct}%</p>
            </div>
            <div
              role="progressbar"
              aria-label={preparing ? '파일 준비' : '전체 전송'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-2 h-2 overflow-hidden rounded-full bg-line"
            >
              <div className="h-full rounded-full bg-sky transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-footnote text-muted">
              {formatBytes(done)} / {formatBytes(total)}
            </p>
          </>
        )}
      </section>

      <ul className="space-y-2">
        {run.rows.map((r) => (
          <li key={r.view} className="flex items-center gap-3 rounded-2xl bg-surface p-(--block-pad)">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{VIEW_LABEL[r.view]}</p>
              <p className="truncate text-footnote text-muted">{r.name}</p>
            </div>
            <p className="flex shrink-0 items-center gap-1.5 text-footnote text-muted">
              {r.status === 'arrived' && <CircleCheck aria-hidden className="h-4 w-4 text-ok" />}
              {rowText(r)}
            </p>
          </li>
        ))}
      </ul>

      {run.stop && <FieldError>{run.stop.message}</FieldError>}
    </Screen>
  );
}
