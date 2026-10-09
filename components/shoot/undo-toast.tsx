'use client';

import { RotateCcw, X } from 'lucide-react';
import type { UndoToast } from '@/components/shoot/use-shoot-checks';

/**
 * '1-23 찍음 · 되돌리기' — 방금 바꾼 것을 한 번에 돌린다. 화면 아래 가운데(앱은 홈 막대 위).
 * bottom 은 부르는 쪽이 정한다(촬영 모드는 아래 단추 막대 위).
 */
export function ShootUndoToast({
  toast,
  onUndo,
  onClose,
  className = 'bottom-[max(1rem,env(safe-area-inset-bottom))]',
}: {
  toast: UndoToast | null;
  onUndo: () => void;
  onClose: () => void;
  className?: string;
}) {
  if (!toast) return null;
  return (
    <div
      key={toast.seq}
      role="status"
      className={`motion-safe:animate-sheet-up fixed inset-x-0 z-40 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-page shadow-lg ${className}`}
    >
      <span className="min-w-0 flex-1 truncate">{toast.text}</span>
      {toast.revert && (
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 font-semibold text-sky-soft hover:bg-white/10"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          되돌리기
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="알림 닫기"
        className="-mr-2 grid h-10 w-10 place-items-center rounded-xl text-page/70 hover:bg-white/10"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
