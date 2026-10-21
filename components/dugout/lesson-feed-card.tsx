import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import type { LessonFeedItem } from '@/lib/org/lesson-feed';
import { formatExercise } from '@/lib/org/lesson-work';

/** 선수 쪽 레슨 줄(2026-10-21 개편 3단계 3-4) — 덕아웃 홈 · 내 것 · 내 싱커 대시보드가 같은 카드를 쓴다 */
export function LessonFeedCard({
  items,
  compact = false,
  title = '레슨 기록',
}: {
  items: LessonFeedItem[];
  compact?: boolean;
  title?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <Link href="/me#lessons" className="text-sm font-semibold text-sky">
          전체 보기
        </Link>
      </div>
      <Card className="divide-y divide-line p-0">
        {items.map((n) => (
          <article key={n.id} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-semibold text-ink">
                {Number(n.date.slice(5, 7))}/{Number(n.date.slice(8))}
              </span>
              <Link href={`/lessons/${n.orgId}`} className="text-sky">
                {n.orgName}
              </Link>
              <span>{n.coach} 코치</span>
              {n.pitchCount != null && <Badge>{n.pitchCount}구</Badge>}
              {n.intensity != null && <Badge>강도 {n.intensity}</Badge>}
            </div>
            <p
              className={`text-sm text-ink ${compact ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}
            >
              {n.body}
            </p>
            {n.exercises.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {n.exercises.map((e, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-sky-tint px-2 py-0.5 text-xs font-medium text-sky-strong"
                  >
                    {formatExercise(e)}
                  </li>
                ))}
              </ul>
            )}
            {n.homework && !compact && (
              <p className="text-xs text-muted">
                숙제 · <span className="text-ink">{n.homework}</span>
              </p>
            )}
          </article>
        ))}
      </Card>
    </section>
  );
}
