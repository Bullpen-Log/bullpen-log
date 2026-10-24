import type { NewsItem } from '@/lib/baseball-feed';

/**
 * 홈의 야구 뉴스 목록(2026-10-23) — 경기 결과는 오른쪽 작은 칸으로 뺐다(games-panel, 10-24). 네이버 검색 API 열쇠가 없으면 페이지가 안 그린다.
 * 시각 글('3시간 전')은 서버가 만들어 넘긴다.
 */
export type NewsRow = NewsItem & { ago: string };

export function BaseballNews({ news }: { news: NewsRow[] }) {
  if (news.length === 0) return null;
  return (
    <section aria-label="야구 뉴스" className="space-y-3">
      <div>
        <p className="text-[13px] text-muted">오늘의 야구</p>
        <h2 className="mt-0.5 text-xl font-bold text-ink">야구 뉴스</h2>
      </div>
      <ol className="divide-y divide-line border-y border-line">
        {news.slice(0, 6).map((n) => (
          <li key={n.url}>
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="block py-3 transition-colors hover:bg-ink/3">
              <span className="line-clamp-2 text-[14px] leading-snug font-semibold break-keep text-ink">{n.title}</span>
              <span className="mt-1 block text-xs text-muted">
                {n.source}
                {n.source && ' · '}
                {n.ago}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
