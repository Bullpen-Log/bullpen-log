'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { CircleAlert, X } from '@/components/icon';
import { recoverySummary } from '@/lib/workout/load/describe';
import { outbox } from '@/lib/workout/outbox';

/**
 * EX-LOAD01-R1 — 어느 화면에서든 뜨는 한 줄: 내 세트가 붙들렸거나(서버가 받지 않음 · 저장 확인 없음) 오래 못 보냈거나, 계정을 모르는 세트가
 * 있거나(확인해야 보낸다), 읽을 수 없는 기록이 있으면 '못 보낸 세트 N개 · 확인하기'로 복구 화면(/training/recovery)에 데려간다. 다른 계정의 세트는 세지
 * 않는다(그 계정으로 로그인해야 하니 이 사람이 할 일이 없다). 운동 화면 · 복구 화면에서는 뜨지 않는다. 닫으면 수가 바뀔 때까지 숨는다(이 탭만).
 */
const DISMISS_KEY = 'bullpen-log:recovery-notice-dismissed';
const noSubscribe = () => () => {};
const readDismissed = () => {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};
const HOUR = 3_600_000;
const hourNow = () => Math.floor(Date.now() / HOUR) * HOUR;

export function RecoveryNotice({ ownerId }: { ownerId: string | null }) {
  const pathname = usePathname();
  const rows = useSyncExternalStore(outbox.subscribe, outbox.snapshot, outbox.serverSnapshot);
  const extras = useSyncExternalStore(outbox.subscribe, outbox.extras, outbox.serverExtras);
  const stored = useSyncExternalStore(noSubscribe, readDismissed, () => null);
  const now = useSyncExternalStore(noSubscribe, hourNow, () => 0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!ownerId || !now) return null;
  if (pathname?.startsWith('/training/recovery') || pathname?.startsWith('/workout')) return null;
  const s = recoverySummary(rows, ownerId, now);
  const count = s.mineHeld + s.mineStale + s.unknown + extras.malformed.length + extras.corrupt.length;
  if (!count) return null;
  const sig = `${ownerId}:${count}`;
  if ((dismissed ?? stored) === sig) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-top,0px)+0.75rem)] z-40 flex justify-center px-4">
      <div role="status" className="pointer-events-auto flex max-w-md items-center gap-1 rounded-full bg-surface py-1 pr-1 pl-4 shadow-lg ring-1 ring-line">
        <CircleAlert aria-hidden className="h-4 w-4 shrink-0 text-warn" />
        <Link href="/training/recovery" className="flex min-h-11 items-center px-2 text-sm font-semibold text-ink">
          못 보낸 세트 {count}개 · 확인하기
        </Link>
        <button
          type="button"
          aria-label="알림 닫기"
          onClick={() => {
            setDismissed(sig);
            try {
              window.sessionStorage.setItem(DISMISS_KEY, sig);
            } catch {
              /* 막혀도 이 화면에서는 닫힌다 */
            }
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-ink/6"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
