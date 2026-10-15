'use client';

import type { CSSProperties } from 'react';
import { RotateCcw, X } from '@/components/icon';
import type { UndoToast } from '@/components/shoot/use-shoot-checks';

/**
 * '1-23 찍음 · 되돌리기' — 방금 바꾼 것을 한 번에 돌린다. 화면 아래 가운데.
 *
 * 기본 자리는 휴대폰 하단 탭 알약 위(--tab-bar-top, 패드는 홈 막대 위) · PC 는 바닥에서 조금 위 — 2026-10-15 사용자: "되돌리기 바가
 * 기존 하단바와 겹친다"(예전 기본은 바닥 1rem 이라 주차 화면에서 하단 탭 알약에 겹쳤다). 촬영 모드처럼 아래에 단추 막대가 있는 곳은
 * 부르는 쪽이 그 막대 높이를 재서 style 의 bottom 으로 준다.
 */
export function ShootUndoToast({
  toast,
  onUndo,
  onClose,
  /* 기본은 앱 틀 안(주차 화면) — 패드는 왼쪽 탭 막대만큼 비켜 본문 가운데에 */
  className = 'bottom-[calc(var(--tab-bar-top)+0.5rem)] desk:bottom-6 pad:left-(--rail)',
  style,
}: {
  toast: UndoToast | null;
  onUndo: () => void;
  onClose: () => void;
  className?: string;
  /** 아래 막대 높이로 정한 bottom 같은 것 — className 의 bottom 보다 먼저 */
  style?: CSSProperties;
}) {
  if (!toast) return null;
  return (
    <div
      key={toast.seq}
      role="status"
      style={style}
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
