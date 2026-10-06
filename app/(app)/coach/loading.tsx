import { Skeleton } from '@/components/fallback';
import { BackLink } from '@/components/back-link';
import { PageHeading } from '@/components/ui';

/**
 * 분석 · 그래프를 불러오는 동안 — 다 온 화면(page.tsx)과 같은 모양.
 *
 * 2026-10-06 사용자: "하이라이트를 누르면 화면 전환 중 로딩 화면이 깨진다". 이 파일이 없을 때는 앱 전체가 같이 쓰는
 * 뼈대((app)/loading.tsx — 제목 · 큰 카드 · 작은 카드 넷)가 밀려 들어왔다가 전혀 다른 모양의 화면으로 바뀌었다.
 * 제목 · '‹ 홈'은 진짜를 그대로 그려 다 와도 제자리고, 그 밑은 분석 칸 · 그래프 칸의 자리만 잡아 둔다.
 */
export default function Loading() {
  return (
    <div className="stack-page" aria-busy="true" aria-live="polite">
      <BackLink href="/today">홈</BackLink>
      <PageHeading title="분석 · 그래프" />
      <span className="sr-only">불러오는 중이에요</span>
      <div className="grid gap-x-6 xl:grid-cols-2">
        <SectionSkeleton body={<Skeleton className="h-72 rounded-2xl" />} />
        <SectionSkeleton
          body={
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          }
        />
      </div>
    </div>
  );
}

/** 분석 칸 · 그래프 칸 머리(제목 · 한 줄 · 고르개)와 몸 자리 */
function SectionSkeleton({ body }: { body: React.ReactNode }) {
  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-48 rounded-full" />
      </div>
      {body}
    </div>
  );
}
