import type { ReactNode } from 'react';
import { ChevronDown } from '@/components/icon';

/**
 * 펼쳐 보기(R1) — 자세한 설명 · 근거와 출처 · 편집 정보 · 사진 정보를 처음엔 접어 둔다.
 * <details>/<summary> 그대로 써서 키보드(Enter · Space) · 화면 읽기(펼침 상태)가 저절로 된다. 안의 글은 지우거나 줄이지 않는다.
 */
export function WikiDisclosure({
  title,
  name,
  children,
  compact = false,
}: {
  title: string;
  /** 시험 · 위치 표시용(data-wiki-disclosure) */
  name: string;
  children: ReactNode;
  /** 사진 정보처럼 작은 것 — 줄 높이 · 글자를 작게 */
  compact?: boolean;
}) {
  return (
    <details data-wiki-disclosure={name} className={`group ${compact ? '' : 'rounded-2xl border border-line bg-surface'}`}>
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky [&::-webkit-details-marker]:hidden ${
          compact ? 'min-h-10 py-1 text-sm text-muted' : 'min-h-12 px-(--block-pad) py-3 text-base font-semibold text-ink'
        }`}
      >
        <span>{title}</span>
        <ChevronDown aria-hidden className={`shrink-0 transition-transform group-open:rotate-180 ${compact ? 'h-4 w-4' : 'h-5 w-5 text-muted'}`} />
      </summary>
      <div className={compact ? 'pb-1' : 'space-y-6 border-t border-line px-(--block-pad) pt-4 pb-(--block-pad)'}>{children}</div>
    </details>
  );
}
