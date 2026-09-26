import { Skeleton } from '@/components/fallback';

/** 팝업 안 — 그날 기록을 읽는 동안의 자리. 돌아갈 곳 단추 줄 · 기록 한 장 · 남기기 칸 모양. */
export default function PitchDayModalLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">그날 기록을 불러오는 중입니다</span>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-14 w-full rounded-2xl" />
    </div>
  );
}
