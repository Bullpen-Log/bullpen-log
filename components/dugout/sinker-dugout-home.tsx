import Link from 'next/link';
import { RoundIcon } from '@/components/round-icon';
import { SectionHead } from '@/components/dugout/ui';
import { CoachRow } from '@/components/dugout/coach-card';
import type { CoachCard as CoachCardData } from '@/lib/market/lesson-load';
import { LessonFeedCard } from '@/components/dugout/lesson-feed-card';
import { relativeTime } from '@/components/community/community-format';
import type { LessonFeedItem } from '@/lib/org/lesson-feed';

type HotPost = { id: string; title: string; likes: number; comments: number; createdAt: Date };
type Record = { ref: string; title: string; detail: string };

/**
 * 싱커 앱의 덕아웃 탭 첫 화면(2026-10-27 김민: "같은 앱 안에서 활동 공간만 바뀐 느낌 — 큰 로고 · 소개 여백 말고 바로 읽고 누를 것").
 * 덕아웃 웹 · 덕아웃 앱의 첫 화면(큰 로고 · 통합검색 · 둘러보기 카드, components/dugout/dugout-main.tsx)은 그대로 두고, 싱커 앱만 이것을 그린다.
 * 위 막대(DUGOUT · 채팅 · 알림)가 첫 칠부터 서 있어 이 화면은 제목 · 도구를 또 두지 않는다. 차례:
 *   오늘 기록 공유(있을 때만 — 기존 ?card= 길 그대로, 자동 공개 없음) → 최근 레슨(있을 때만) → 커뮤니티 글 → 레슨 · 연습장 → 추천 코치(공개 코치가 있을 때만).
 * 빈 자료는 묶음을 길게 늘어놓지 않는다 — 글이 없으면 카드 안 한 줄, 코치가 없으면 묶음째 뺀다.
 */
export function SinkerDugoutHome({
  record,
  lessons,
  posts,
  coaches,
  loggedIn,
}: {
  record: Record | null;
  lessons: LessonFeedItem[];
  posts: HotPost[];
  coaches: CoachCardData[];
  loggedIn: boolean;
}) {
  const now = new Date();
  const write = loggedIn ? '/community/new' : `/login?next=${encodeURIComponent('/community/new')}`;
  return (
    <div className="space-y-6">
      <h1 className="sr-only">덕아웃</h1>

      {record && (
        <Link
          href={`/community/new?card=${encodeURIComponent(record.ref)}`}
          className="flex items-center gap-3 rounded-2xl bg-surface p-4 transition-colors active:bg-ink/4"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky-tint text-sky">
            <RoundIcon name="community" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">오늘 기록 공유</span>
            <span className="block truncate text-[17px] font-semibold text-ink">{record.title}</span>
            <span className="block truncate text-[13px] text-muted">{record.detail}</span>
          </span>
          <span className="shrink-0 rounded-full bg-sky px-4 py-2.5 text-[15px] font-semibold text-white">글 쓰기</span>
        </Link>
      )}

      {lessons.length > 0 && <LessonFeedCard items={lessons} compact title="최근 레슨" />}

      <section className="space-y-3">
        <SectionHead
          title="커뮤니티"
          action={
            <Link href="/community" className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
              전체 보기
            </Link>
          }
        />
        <div className="overflow-hidden rounded-2xl bg-surface">
          {posts.length === 0 ? (
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <p className="text-[15px] text-muted">아직 올라온 글이 없어요.</p>
              <Link href={write} className="flex min-h-11 shrink-0 items-center rounded-full bg-sky px-4 text-[15px] font-semibold text-white">
                첫 글 쓰기
              </Link>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {posts.map((p) => (
                  <li key={p.id}>
                    <Link href={`/community/${p.id}`} className="block px-4 py-3.5 transition-colors active:bg-ink/4">
                      <span className="block truncate text-[17px] font-semibold text-ink">{p.title}</span>
                      <span className="mt-0.5 block text-[13px] text-muted tabular-nums">
                        {relativeTime(p.createdAt, now)} · 좋아요 {p.likes} · 댓글 {p.comments}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={write} className="flex min-h-12 items-center justify-center border-t border-line text-[15px] font-semibold text-sky">
                글쓰기
              </Link>
            </>
          )}
        </div>
      </section>

      {/* 레슨 · 연습장 — 둘만, 한 줄 설명과 함께(기능 아이콘을 늘어놓지 않는다) */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { href: '/lessons', label: '레슨 찾기', sub: '코치 비교 · 예약', icon: 'lesson' as const },
          { href: '/venues', label: '연습장', sub: '지도에서 빈 시간', icon: 'venue' as const },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl bg-surface px-4 py-3 transition-colors active:bg-ink/4">
            <RoundIcon name={q.icon} className="h-6 w-6 shrink-0 text-sky" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">{q.label}</span>
              <span className="block truncate text-[13px] text-muted">{q.sub}</span>
            </span>
          </Link>
        ))}
      </div>

      {coaches.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="추천 코치"
            action={
              <Link href="/lessons/list" className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
                코치 찾기
              </Link>
            }
          />
          <div className="divide-y divide-line rounded-2xl bg-surface px-4">
            {coaches.map((c) => (
              <CoachRow key={c.id} c={c} href={`/lessons/${c.id}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
