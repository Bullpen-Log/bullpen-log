'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from '@/components/icon';
import { closeDrillThrowNote } from '@/app/actions/mechanics';
import { orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { DRILL_THROW_TEXT, type DrillThrowNote } from '@/lib/mechanics/program';

/**
 * '드릴로 공을 약 N회 던졌어요 · 투구 기록에 남기기' — 투구 기록에 바로 넣지 않고 알린다(2026-10-16 사용자: 자동으로 넣으면 투구 기록과 겹친다).
 * 투구 기록에 남기면 다음에 그릴 때 저절로 사라지고(lib/mechanics/program.ts drillThrowNote), '이미 넣었어요 · 안 적을래요'는 그날 닫는다.
 * 트레이닝 홈의 메카닉 카드와 따라 하기 끝 화면이 쓴다. 따라 하기는 (app) 밖이라 plainLink — Link 면 (app) 의 가로채는 팝업이 빈 화면 위에 뜬다.
 */
export function DrillThrowNoteCard({
  note,
  plainLink = false,
  className = '',
}: {
  note: DrillThrowNote;
  plainLink?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (closed) return null;

  const close = () =>
    start(async () => {
      const res = await orOffline(closeDrillThrowNote(), { error: '신호가 약해 닫지 못했어요.' });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setClosed(true);
      quietRefresh(router);
    });

  const linkClass =
    'inline-flex min-h-10 items-center gap-1 rounded-full bg-sky-tint px-4 text-sm font-bold text-sky-strong transition-colors hover:bg-sky-tint/70';
  const label = (
    <>
      {DRILL_THROW_TEXT.record}
      <ChevronRight aria-hidden className="h-4 w-4" />
    </>
  );

  return (
    <div className={`relative z-10 space-y-2 rounded-xl bg-surface-2 p-3 ${className}`}>
      <p className="text-sm font-medium text-ink">{DRILL_THROW_TEXT.line(note.throws)}</p>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {plainLink ? (
          <a href={note.href} className={linkClass}>
            {label}
          </a>
        ) : (
          <Link href={note.href} className={linkClass}>
            {label}
          </Link>
        )}
        {[DRILL_THROW_TEXT.done, DRILL_THROW_TEXT.skip].map((t) => (
          <button
            key={t}
            type="button"
            disabled={pending}
            onClick={close}
            className="inline-flex min-h-10 items-center px-2 text-xs text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            {t}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
