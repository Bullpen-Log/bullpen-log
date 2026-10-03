'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type CSSProperties } from 'react';
import { ChevronRight, Film, Trash2 } from 'lucide-react';
import { deleteVelocityRecording } from '@/app/actions/velocity-recording';
import { ConfirmDialog } from '@/components/confirm-delete';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import type { RecordingListItem } from '@/lib/velocity-recording-load';

const mb = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)}MB`;

export const clock = (sec: number | null) => {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(iso));

/** 날짜마다 묶은 녹화 목록 — 줄을 누르면 편집기, 휴지통은 한 번 묻고 지운다 */
export function RecordingList({ rows }: { rows: RecordingListItem[] }) {
  const router = useRouter();
  const [ask, setAsk] = useState<RecordingListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const days = [...new Set(rows.map((r) => r.date))];

  const remove = (row: RecordingListItem) =>
    start(async () => {
      const res = await orOffline(deleteVelocityRecording(row.id), {
        ok: false as const,
        error: OFFLINE_MESSAGE,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAsk(null);
      quietRefresh(router);
    });

  return (
    <div className="stack-block">
      {error && <p className="text-sm text-danger">{error}</p>}
      {days.map((day) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold text-muted tabular-nums">{day}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {rows
              .filter((r) => r.date === day)
              .map((r, i) => (
                <li
                  key={r.id}
                  style={{ '--row': i } as CSSProperties}
                  className="flex items-center gap-1 motion-safe:animate-row-in"
                >
                  <Link
                    href={`/admin/velocity/recordings/${r.id}`}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sky-tint"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky/10 text-sky">
                      <Film aria-hidden className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {timeOf(r.createdAt)} · {clock(r.durationSec)}
                        {r.status !== 'done' && (
                          <span className="ml-1.5 text-xs font-normal text-warn">
                            끊김
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted tabular-nums">
                        조각 {r.parts}개 · {mb(r.bytes)} · 공 {r.cuts}개
                        {r.cuts > 0 && ` (건 ${r.gunCuts})`}
                        {r.userName && ` · ${r.userName}`}
                        {r.memo && ` · ${r.memo}`}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setAsk(r)}
                    aria-label="녹화 지우기"
                    className="mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <ConfirmDialog
        open={ask != null}
        onClose={() => setAsk(null)}
        onConfirm={() => ask && remove(ask)}
        title="녹화를 지울까요?"
        detail={
          ask
            ? `${ask.date} ${timeOf(ask.createdAt)} 녹화 — 조각 ${ask.parts}개(${mb(ask.bytes)})와 적어 둔 공 ${ask.cuts}개가 모두 지워져요. 되돌릴 수 없어요.`
            : ''
        }
        confirmLabel="지우기"
        pending={pending}
      />
    </div>
  );
}
