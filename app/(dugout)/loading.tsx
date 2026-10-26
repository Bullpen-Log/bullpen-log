import { Skeleton } from '@/components/fallback';

/*
 * 덕아웃 화면을 불러오는 동안 — 예전엔 이 자리가 없어, 싱커(앱)에서 덕아웃 탭을 누르면 서버가 홈 쿼리 일곱을 다 마칠 때까지 옛 화면이 얼어
 * 있었다(2026-10-24 전체 검토). 위 막대 · 아래 탭(덕아웃 틀)은 그대로 서고 본문 자리에만 뼈대가 선다.
 * 2026-10-27: 선수 화면 뼈대(app/(app)/loading — 큰 카드 · 작은 카드 넷)를 빌려 쓰던 것을 덕아웃 화면 모양(쪽 제목 · 흰 카드 안 줄 목록)으로 —
 * 싱커 앱 안(회색 바탕)에서는 흰 카드가 실제 화면과 같은 자리에 서고, 덕아웃 웹(흰 바탕)에서는 카드가 바탕에 묻혀 줄 뼈대만 보인다. 연출 · 큰 로고는 없다.
 */
export default function DugoutLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중이에요</span>
      <Skeleton className="h-7 w-40" />
      <div className="space-y-4 rounded-2xl bg-surface p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[4.5rem] rounded-2xl" />
        <Skeleton className="h-[4.5rem] rounded-2xl" />
      </div>
    </div>
  );
}
