import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundBell, RoundChat, RoundLesson } from '@/components/round-icon';
import { Card } from '@/components/ui';
import type { LessonFeedItem } from '@/lib/org/lesson-feed';
import type { SinkerCell } from '@/lib/org/sinker-summary';

/**
 * PC 덕아웃 홈의 오른쪽 '나' 칸(2026-10-22) — 위 막대 밑에 붙어(sticky) 내려도 남는다.
 *   내 싱커  오늘 체크인 · 최근 7일 투구 · 팔 상태(한 줄, 전체는 title) · 마지막 등판 + '대시보드 ›'(싱커를 쓰는 사람만)
 *   내 소식  안 읽은 채팅 · 알림 · 최근 레슨 노트 — 0 이어도 숨기지 않고 옅게(칸 높이가 들쭉날쭉하지 않게)
 * 값은 모두 페이지가 이미 읽은 것(새 조회 없음).
 */
export function HomeMeColumn({
  sinker,
  unread,
  alerts,
  lessons,
}: {
  sinker: SinkerCell[] | null;
  unread: number;
  alerts: number;
  lessons: LessonFeedItem[];
}) {
  const lastLesson = lessons[0];
  return (
    <aside className="stack-block desk:sticky desk:top-20 desk:self-start">
      {sinker && (
        <Card className="space-y-2">
          <Head title="내 싱커" href="/sinker" link="대시보드" />
          <dl className="divide-y divide-line">
            {sinker.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                title={`${c.label} · ${c.value}`}
                className="-mx-2 flex min-h-10 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-ink/4"
              >
                <dt className="shrink-0 text-footnote text-muted">{c.label}</dt>
                <dd className="ml-auto min-w-0 truncate text-right text-sm font-semibold text-ink">{c.value}</dd>
              </Link>
            ))}
          </dl>
        </Card>
      )}

      <Card className="space-y-2">
        <Head title="내 소식" />
        <div className="divide-y divide-line">
          <Row href="/chat" icon={<RoundChat className="h-4 w-4" />} label="안 읽은 채팅" count={unread} />
          <Row href="/notifications" icon={<RoundBell className="h-4 w-4" />} label="알림" count={alerts} />
          <Row
            href="/me#lessons"
            icon={<RoundLesson className="h-4 w-4" />}
            label="최근 레슨 노트"
            count={lessons.length}
            sub={
              lastLesson
                ? `${Number(lastLesson.date.slice(5, 7))}/${Number(lastLesson.date.slice(8))} · ${lastLesson.coach} 코치`
                : undefined
            }
          />
        </div>
      </Card>
    </aside>
  );
}

function Head({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {href && link && (
        <Link href={href} className="text-footnote font-semibold text-sky">
          {link} ›
        </Link>
      )}
    </div>
  );
}

function Row({
  href,
  icon,
  label,
  count,
  sub,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count: number;
  sub?: string;
}) {
  const zero = count === 0;
  return (
    <Link
      href={href}
      className={`-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-ink/4 ${zero ? 'text-muted' : 'text-ink'}`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${zero ? 'bg-ink/5' : 'bg-sky/12 text-sky-strong'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {sub && <span className="block truncate text-caption text-muted">{sub}</span>}
      </span>
      <span className={`text-sm font-bold ${zero ? 'text-muted/70' : 'text-sky-strong'}`}>{count}</span>
    </Link>
  );
}
