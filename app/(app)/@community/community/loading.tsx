import { Skeleton } from '@/components/fallback';

/** 커뮤니티 목록을 불러오는 동안 — 제목 · 구분 칩 · 글 목록 틀 */
export default function Loading() {
  return (
    <div className="stack-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">커뮤니티를 불러오는 중이에요</span>
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="ml-auto h-10 w-20 rounded-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-14 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}
