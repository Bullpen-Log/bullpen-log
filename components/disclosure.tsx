'use client';

import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/*
 * 펼치기 · 더 보기 단추 — 한 모양(2026-10-04 '앱 느낌' 단추 정리).
 *
 * 예전에는 같은 일을 하는 단추가 곳마다 달랐다. '자세·영상 보기 / 접기'는 11 · 12 · 14px, 회색 · 파랑, 높이 32~44px 로
 * 다섯 가지였고, 'N개 더 보기'는 회색 테두리 상자라 웹 폼의 단추 같았다. 이제 모두 아이폰 목록의 펼치기 줄처럼 —
 * 테두리 없는 파란 굵은 글자, 누르는 자리 44px, 펼치면 꺾쇠가 뒤집힌다. 기준은 오늘 운동 목록의 '영상 보기'.
 */
const ROW =
  'flex min-h-11 w-full items-center justify-center gap-1.5 px-4 text-sm font-semibold text-sky-strong transition-colors active:bg-ink/6 desk:hover:bg-surface-2';

/** 카드 밑의 펼치기 줄 — 닫혀 있으면 label, 열리면 openLabel('접기') */
export function DisclosureButton({
  open,
  onClick,
  icon: Icon,
  label,
  openLabel = '접기',
  ariaLabel,
  className = '',
}: {
  open: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  label: ReactNode;
  openLabel?: ReactNode;
  /** 화면 읽기 — 무엇을 펴는지까지('바벨 스쿼트 자세·영상 보기') */
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={ariaLabel}
      className={`${ROW} ${className}`}
    >
      {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0" />}
      {open ? openLabel : label}
      <ChevronDown
        aria-hidden
        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

/** 목록 끝의 'N개 더 보기' — 테두리 상자 대신 파란 글자 줄 */
export function MoreButton({
  count,
  unit = '개',
  onClick,
}: {
  /** 남은 수 — 없으면 '더 보기'만 */
  count?: number;
  unit?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`${ROW} mt-1 rounded-xl`}>
      {count != null ? `${count}${unit} 더 보기` : '더 보기'}
      <ChevronDown aria-hidden className="h-4 w-4 shrink-0" />
    </button>
  );
}
