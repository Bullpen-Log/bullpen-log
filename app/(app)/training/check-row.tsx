'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Check } from 'lucide-react';

/**
 * 줄 어디를 눌러도 체크되는 운동 한 줄 — 트레이닝 목록(exercise-list.tsx)과 암케어 체크
 * 목록(armcare-today.tsx)이 함께 쓴다.
 *
 * 체크 단추를 줄 전체에 깔고(absolute) 글과 사진은 누름을 그 단추로 흘려보낸다
 * (pointer-events-none). 칩(근육 · 부위)만 따로 눌린다 — children 안의 단추. 단추 안에
 * 단추를 넣을 수는 없어서 이렇게 겹쳐 둔다(2026-09-26 사용자분: 칩을 누르면 3D 그림).
 *
 * 화면 읽기(보이스오버 등): 체크 단추는 '체크박스'로 읽히고, 이름에 처방과 경고까지
 * 담는다. 예전에는 겹친 단추의 이름이 '튜빙 외회전 90도 체크'뿐이라, 체크하는 순간
 * '권하지 않는 운동' 경고가 들리지 않았다. 상태도 이름('체크 풀기')과 눌림 표시로 두 번
 * 읽혔다(2026-09-26 검토). 이름에 담은 글자(제목 · 처방 · 경고)는 한 번만 읽히게 가린다.
 */
export function CheckRow({
  done,
  onToggle,
  title,
  badges,
  prescription,
  warning,
  thumbUrl,
  thumbClassName = '',
  className = '',
  children,
}: {
  done: boolean;
  onToggle: () => void;
  title: string;
  /** 제목 옆의 작은 표시(참고 영상 · 카테고리 등) — 화면 읽기도 그대로 읽는다 */
  badges?: ReactNode;
  prescription?: string | null;
  /** 경고 한 줄 — 있으면 노란 줄로, 체크 단추의 이름에도 담는다 */
  warning?: string | null;
  thumbUrl?: string | null;
  /** 사진 크기 · 보일 화면 폭 */
  thumbClassName?: string;
  className?: string;
  /** 칩 줄 — 여기 든 단추는 따로 눌린다 */
  children?: ReactNode;
}) {
  const spoken = [title, prescription, warning].filter(Boolean).join(', ');
  return (
    <div className={`relative flex items-start gap-3 px-4 py-4 ${className}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        className={`absolute inset-0 rounded-[inherit] transition-colors ${
          done ? '' : 'hover:bg-surface-2'
        }`}
      >
        <span className="sr-only">{spoken}</span>
      </button>
      <span
        aria-hidden
        className={`pointer-events-none relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          done ? 'border-sky bg-sky text-white' : 'border-line-strong'
        }`}
      >
        {done && <Check className="finish-pop h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className="pointer-events-none relative min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            aria-hidden
            className={`text-[15px] font-bold tracking-[-0.01em] break-keep ${
              done ? 'text-sky-strong' : 'text-ink'
            }`}
          >
            {title}
          </span>
          {badges}
        </span>
        {prescription && (
          <span
            aria-hidden
            className={`block text-xs font-semibold ${done ? 'text-sky-strong' : 'text-muted'}`}
          >
            {prescription}
          </span>
        )}
        {children && (
          <span className="block space-y-1.5 [&_button]:pointer-events-auto">{children}</span>
        )}
        {warning && (
          <span
            aria-hidden
            className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {warning}
          </span>
        )}
      </span>
      {thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          className={`pointer-events-none relative shrink-0 rounded-xl object-cover ring-1 ring-line ${thumbClassName}`}
        />
      )}
    </div>
  );
}
