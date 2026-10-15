import { Skeleton } from '@/components/fallback';

/**
 * 영양 화면을 불러오는 동안 — 실제 화면과 같은 틀로 자리를 잡아 둔다.
 * 왼쪽에 오늘 한눈에·끼니 넷, 오른쪽(좁으면 아래)에 운동·물·체중·7일.
 */
export default function Loading() {
  return (
    <div className="stack-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">영양 기록을 불러오는 중이에요</span>
      <div className="flex items-center gap-4">
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="ml-auto h-9 w-20 rounded-xl" />
      </div>
      <div className="grid items-start gap-block lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="stack-block">
          <Skeleton className="h-52 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
        <div className="stack-block">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
