import { Skeleton } from '@/components/fallback';

/**
 * 화면을 불러오는 동안.
 *
 * 예전에는 이 자리가 비어 있어서, 서버가 자료를 모으는 동안 아무것도 안 보였다.
 * 분석 화면은 DB 조회를 다섯 번 하는데 그동안 흰 화면이라 눌리지 않은 줄 안다.
 *
 * 실제로 나올 모양과 비슷하게 둔다. 돌아가는 동그라미 하나보다, 자리가 잡혀
 * 있는 편이 무엇이 올지 짐작하게 해준다.
 *
 * 사이드바와 하단 탭은 그대로 남는다 — 레이아웃 아래에 있어서다. 기다리는
 * 동안에도 다른 곳으로 옮겨갈 수 있다.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* 화면 낭독기에는 한 줄로 알린다. 회색 덩어리는 읽어봐야 뜻이 없다. */}
      <span className="sr-only">불러오는 중입니다</span>

      {/* 제목 자리 */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      {/* 큰 카드 하나 */}
      <Skeleton className="h-44 w-full rounded-3xl" />

      {/* 작은 카드 넷 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>

      <Skeleton className="h-60 w-full rounded-2xl" />
    </div>
  );
}
