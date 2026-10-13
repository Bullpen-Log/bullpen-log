import Link from 'next/link';
import { ChartNoAxesColumn } from 'lucide-react';
import { LinkPending } from '@/components/link-pending';

/**
 * 탭 제목 옆 '분석' 단추 — 그 탭의 분석(하이라이트 · 부하 · 추이)으로(2026-10-13 김민: 홈 하이라이트의 투구 · 운동을 각 카테고리로,
 * 제목 옆 단추를 누르면 그 안에서 보게). 투구 기록 → /coach?view=pitch, 트레이닝 → /coach?view=training.
 */
export function AnalysisLink({ view }: { view: 'pitch' | 'training' }) {
  return (
    <Link
      href={`/coach?view=${view}`}
      className="inline-flex h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-semibold text-ink transition-opacity active:opacity-60 desk:h-8 desk:px-3"
    >
      <LinkPending className="h-4 w-4">
        <ChartNoAxesColumn aria-hidden className="h-4 w-4 text-sky" strokeWidth={2.2} />
      </LinkPending>
      분석
    </Link>
  );
}
