'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui';
import { ConfirmButton } from '@/components/master/confirm-button';
import {
  deletePitchLog,
  updatePitchLog,
  type SinkerLogState,
} from '@/app/actions/sinker-log';
import { SESSION_TYPES } from '@/lib/session-type';
import { guardFormAction } from '@/lib/action-offline';

export type LogRowData = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  effortPct: number | null;
  maxVelocity: number | null;
  memo: string | null;
  byCoach: boolean;
};

/** 기록 표의 한 줄(2026-10-21 개편 4단계 4-2) — 누르면 그 자리에서 고친다. 쉰 날(공 0)은 종류 · 메모만 */
export function LogRow({ log }: { log: LogRowData }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [state, action] = useActionState<SinkerLogState, FormData>(
    guardFormAction(updatePitchLog),
    undefined
  );
  const [seen, setSeen] = useState<SinkerLogState>(undefined);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) setEditing(false);
  }
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
  const resting = log.pitchCount === 0;
  const dateLabel = `${log.date.slice(0, 4)}.${log.date.slice(5, 7)}.${log.date.slice(8)}`;

  if (!editing)
    return (
      <tr className="cursor-pointer hover:bg-ink/3" onClick={() => setEditing(true)}>
        <td className="px-3 py-2 whitespace-nowrap text-ink tabular-nums">
          {dateLabel}
        </td>
        <td className="px-3 py-2 text-ink">
          {log.sessionType}
          {log.byCoach && <Badge className="ml-1.5">코치</Badge>}
        </td>
        <td className="px-3 py-2 text-right text-ink tabular-nums">
          {resting ? '쉼' : log.pitchCount}
        </td>
        <td className="px-3 py-2 text-right text-ink tabular-nums">
          {resting ? '—' : log.effortPct != null ? `${log.effortPct}%` : log.intensity}
        </td>
        <td className="px-3 py-2 text-right text-ink tabular-nums">
          {log.maxVelocity != null ? `${log.maxVelocity}` : '—'}
        </td>
        <td className="max-w-[260px] truncate px-3 py-2 text-muted">
          {log.memo ?? ''}
        </td>
        <td className="px-3 py-2 text-right text-xs text-sky">고치기</td>
      </tr>
    );

  return (
    <tr className="bg-sky-tint/40">
      <td colSpan={7} className="px-3 py-3">
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={log.id} />
          <span className="text-sm font-semibold text-ink tabular-nums">
            {dateLabel}
          </span>
          <label className="flex flex-col gap-1 text-xs text-muted">
            종류
            <select
              name="sessionType"
              defaultValue={log.sessionType}
              className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
            >
              {SESSION_TYPES.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {!resting && (
            <>
              <label className="flex flex-col gap-1 text-xs text-muted">
                공 수
                <input
                  name="pitchCount"
                  type="number"
                  min={1}
                  max={500}
                  defaultValue={log.pitchCount}
                  className="min-h-9 w-20 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                강도 1~10
                <input
                  name="intensity"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={log.intensity}
                  className="min-h-9 w-20 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                최고 구속
                <input
                  name="maxVelocity"
                  type="number"
                  step="0.1"
                  min={30}
                  max={200}
                  defaultValue={log.maxVelocity ?? ''}
                  className="min-h-9 w-24 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                />
              </label>
            </>
          )}
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-muted">
            메모
            <input
              name="memo"
              type="text"
              maxLength={500}
              defaultValue={log.memo ?? ''}
              className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="min-h-9 rounded-lg bg-sky px-3 text-sm font-semibold text-white"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-9 rounded-lg border border-line px-3 text-sm font-semibold text-ink"
            >
              취소
            </button>
            <ConfirmButton
              action={deletePitchLog}
              fields={{ id: log.id }}
              message="이 기록을 지울까요?"
              variant="danger"
            >
              지우기
            </ConfirmButton>
          </div>
          {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
        </form>
      </td>
    </tr>
  );
}
