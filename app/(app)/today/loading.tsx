import { Skeleton } from '@/components/fallback';
import { PageHeading } from '@/components/ui';

/**
 * 홈을 불러오는 동안.
 *
 * 다른 화면이 같이 쓰는 기다림 모양((app)/loading.tsx)은 제목 자리를 회색 막대로
 * 둔다. 홈의 제목은 고정된 글('Home' · '홈')이라 기다릴 것이 없으므로 진짜 제목을
 * 그대로 그린다 — 다 도착해도 제목은 제자리다. 그 밑은 홈이 처음 내보내는 자리
 * 모양(page.tsx 의 Suspense 가 쓰는 달력 자리와 돌아보기 자리)과 같게 둔다.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <PageHeading eyebrow="Home" title="홈" />
      <span className="sr-only">불러오는 중입니다</span>
      <Skeleton className="h-[26rem] rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}
