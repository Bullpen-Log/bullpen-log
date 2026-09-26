import { Skeleton } from '@/components/fallback';

/**
 * 팝업 안 — 그날 기록을 읽는 동안의 자리.
 *
 * 가장 자주 뜨는 모양을 따른다: 돌아갈 곳 단추 줄 · 한 줄 안내 · 남기기 칸. '오늘 기록
 * 남기기'로 들어오면 기록이 없는 날이라 남기기 칸이 곧장 펴져 있다. 예전 자리는 작은
 * 덩어리 둘이라 창이 430px 로 떴다가, 남기기 칸이 오면서 674px 로 커지며 위로 튀었다.
 * 칸의 짜임(넓으면 두 줄)과 높이를 실제와 맞춰, 내용이 와도 창이 거의 그대로다.
 */
export default function PitchDayModalLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">그날 기록을 불러오는 중입니다</span>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="space-y-4 rounded-2xl border border-line p-4 sm:p-5">
        <Skeleton className="h-6 w-28" />
        <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:space-y-0">
          <div className="space-y-5">
            <Skeleton className="h-[4.5rem] w-full" />
            <Skeleton className="h-[4.5rem] w-full" />
            <Skeleton className="h-[4.5rem] w-full" />
            <Skeleton className="h-[4.5rem] w-full" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
        <Skeleton className="h-11 w-40" />
      </div>
    </div>
  );
}
