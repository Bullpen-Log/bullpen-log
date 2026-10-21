'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Trash2 } from '@/components/icon';
import { ConfirmDialog } from '@/components/confirm-delete';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { removeSwingSample, type SwingListItem } from '@/app/actions/swing-lab';

/**
 * 3D 스윙 분석 샘플 목록(웹) — 사용자 화면(/hitting/lab)과 3D 개발 관리자(/admin/dev3d)가 같이 쓴다. 누르면 /hitting/lab/<id>, 휴지통은 한 번 묻고 지운다.
 * 앱은 native/src/swing/parts.tsx SwingRow.
 */
export function SwingRows({ samples }: { samples: SwingListItem[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!target) return;
    start(async () => {
      const r = await orOffline(removeSwingSample({ id: target.id }), { error: OFFLINE_MESSAGE });
      if ('error' in r) {
        setError(r.error);
        return;
      }
      setTarget(null);
      quietRefresh(router);
    });
  };
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {samples.map((s, i) => {
          const name = `${s.marker ? '마커 샘플' : '스윙'} ${samples.length - i}`;
          return (
            <li key={s.id} className="flex items-center gap-2 px-(--block-pad) py-3">
              {s.broken ? (
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-ink">{name}</p>
                  <p className="text-xs text-muted">올리다 멈췄어요</p>
                </div>
              ) : (
                <Link href={`/hitting/lab/${s.id}`} className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-base font-semibold text-ink">
                    {name}
                    {s.when && <span className="ml-2 text-xs font-normal text-muted">{s.when}</span>}
                  </p>
                  {s.chips.length > 0 && <p className="truncate text-xs text-muted">{s.chips.join(' · ')}</p>}
                  {s.memo && <p className="truncate text-xs text-ink">{s.memo}</p>}
                  <p className="text-xs text-muted">영상 {s.videoCount}개</p>
                </Link>
              )}
              {!s.broken && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />}
              <button
                type="button"
                aria-label={`${name} 지우기`}
                onClick={() => {
                  setError(undefined);
                  setTarget({ id: s.id, name });
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink/5"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ConfirmDialog
        open={target != null}
        onClose={() => setTarget(null)}
        onConfirm={remove}
        title={`${target?.name ?? ''}, 지울까요?`}
        detail="이 스윙의 영상이 모두 지워져요."
        confirmLabel="지우기"
        pending={pending}
      />
    </>
  );
}
