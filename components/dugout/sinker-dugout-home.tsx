import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundIcon } from '@/components/round-icon';
import { SectionHead } from '@/components/dugout/ui';
import { CoachRow } from '@/components/dugout/coach-card';
import type { CoachCard as CoachCardData } from '@/lib/market/lesson-load';
import { LessonFeedCard } from '@/components/dugout/lesson-feed-card';
import type { LessonFeedItem } from '@/lib/org/lesson-feed';
import type { ActivityItem, FeedPost } from '@/lib/sinker-dugout-load';

type Record = { ref: string; title: string; detail: string };
type Feed = { questions: FeedPost[]; waiting: { count: number; more: boolean }; meetups: FeedPost[] };

/**
 * 싱커 앱의 덕아웃 탭 첫 화면(2026-10-27 김민) — 선수가 질문하고, 함께 연습하고, 코치 · 연습장을 찾고, 자기 활동을 보는 곳.
 * 덕아웃 웹 · 덕아웃 앱의 첫 화면(큰 로고 · 통합검색 · 둘러보기 카드, components/dugout/dugout-main.tsx)은 그대로 두고 싱커 앱만 이것을 그린다.
 * 위 막대(DUGOUT · 알림)가 첫 칠부터 서 있어 제목 · 도구를 또 두지 않는다. 장터 · 장비 · 경기 · 뉴스 · 통합검색 · 장터 거래 채팅은 여기 없다.
 * 차례: 내 활동(확인할 것이 있을 때) → 질문 · 답변 → 같이 연습(번개) → 레슨 · 연습장 → 추천 코치(공개 코치가 있을 때) → 게시판 · 팀 · 내 글 링크.
 * 기록 공유 카드는 정책을 다시 정할 때까지 예전 기능 그대로 맨 끝에만(새로 강조 · 자동 공개 없음).
 * 빈 자료는 묶음을 길게 늘어놓지 않는다 — 카드 안 한 줄과 지금 할 수 있는 행동 하나. 못 읽은 것은 '못 불러왔어요'로 빈 것과 가른다.
 */
export function SinkerDugoutHome({
  activity,
  feed,
  record,
  lessons,
  coaches,
  loggedIn,
}: {
  /** 내 활동 — null 이면 못 읽음, 로그인 안 했으면 undefined */
  activity: ActivityItem[] | null | undefined;
  /** 질문 · 번개 — null 이면 못 읽음 */
  feed: Feed | null;
  record: Record | null;
  lessons: LessonFeedItem[];
  coaches: CoachCardData[];
  loggedIn: boolean;
}) {
  const need = (href: string) => (loggedIn ? href : `/login?next=${encodeURIComponent(href)}`);
  const ask = need('/community/new?board=question');
  const gather = need('/community/new?board=meetup');
  return (
    <div className="space-y-6">
      <h1 className="sr-only">덕아웃</h1>

      {loggedIn ? (
        <section className="space-y-3">
          <SectionHead
            title="내 활동"
            action={
              <Link href="/me/community" className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
                전체 보기
              </Link>
            }
          />
          <Card>
            {activity === null ? (
              <Line>내 활동을 불러오지 못했어요. 아래로 당겨 다시 받아 주세요.</Line>
            ) : activity && activity.length > 0 ? (
              <ul className="divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.key}>
                    <Row href={a.href} kicker={a.label} title={a.title} sub={a.sub} />
                  </li>
                ))}
              </ul>
            ) : (
              <Line>지금 확인할 활동이 없어요. 질문을 올리거나 번개에 참가하면 여기서 바로 이어 봐요.</Line>
            )}
          </Card>
        </section>
      ) : (
        <Card>
          <Line action={<Pill href={`/login?next=${encodeURIComponent('/?dugout=1')}`}>로그인</Pill>}>
            로그인하면 내 질문 · 번개 · 예약을 여기서 이어 봐요.
          </Line>
        </Card>
      )}

      {lessons.length > 0 && <LessonFeedCard items={lessons} compact title="최근 레슨" />}

      <section className="space-y-3">
        <SectionHead
          title="질문 · 답변"
          action={
            <Link href="/community?category=question" className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
              전체 보기
            </Link>
          }
        />
        <Card>
          {feed === null ? (
            <Line>글을 불러오지 못했어요.</Line>
          ) : feed.questions.length === 0 ? (
            <Line action={<Pill href={ask}>질문하기</Pill>}>아직 올라온 질문이 없어요. 투구 · 타격 · 훈련 · 장비 무엇이든 물어봐요.</Line>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {feed.questions.map((p) => (
                  <li key={p.id}>
                    <Row href={`/community/${p.id}`} title={p.title} sub={p.sub} />
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2">
                {feed.waiting.count > 0 ? (
                  <Link href="/community?category=question&answer=none" className="flex min-h-11 items-center text-[15px] text-sky">
                    답을 기다리는 질문 {feed.waiting.count}
                    {feed.waiting.more ? '+' : ''}개
                  </Link>
                ) : (
                  <span className="text-[13px] text-muted">답을 기다리는 질문이 없어요</span>
                )}
                <Pill href={ask}>질문하기</Pill>
              </div>
            </>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHead
          title="같이 연습"
          action={
            <Link href="/community?category=meetup" className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
              번개 전체
            </Link>
          }
        />
        <Card>
          {feed === null ? (
            <Line>번개를 불러오지 못했어요.</Line>
          ) : feed.meetups.length === 0 ? (
            <Line action={<Pill href={gather}>번개 만들기</Pill>}>다가오는 모집 중 번개가 없어요. 캐치볼 · 배팅 · 펑고를 같이 할 사람을 모아 봐요.</Line>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {feed.meetups.map((p) => (
                  <li key={p.id}>
                    <Row href={`/community/${p.id}`} title={p.title} sub={p.sub} />
                  </li>
                ))}
              </ul>
              <div className="flex justify-end border-t border-line px-4 py-2">
                <Pill href={gather}>번개 만들기</Pill>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* 레슨 · 연습장 — 둘만, 한 줄 설명과 함께(기능 아이콘을 늘어놓지 않는다) */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { href: '/lessons', label: '레슨 찾기', sub: '코치 비교 · 예약', icon: 'lesson' as const },
          { href: '/venues', label: '연습장 찾기', sub: '지도 · 빈 시간', icon: 'venue' as const },
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

      {/* 보조 길 — 게시판 넷은 그대로 있다(자유 · 팀). 싱커의 팀 · 레슨장 소속 공간과는 다른 것: 여기는 글로 팀을 찾고 모집한다 */}
      <nav aria-label="덕아웃 더 보기" className="flex flex-wrap gap-2">
        {[
          { href: '/community?category=free', label: '자유 게시판', login: false },
          { href: '/community?category=team', label: '팀 찾기 · 모집', login: false },
          { href: '/me/community?tab=posts', label: '내 글', login: true },
          { href: '/me/community?tab=saved', label: '저장한 글', login: true },
          { href: '/me', label: '레슨 · 연습장 예약', login: true },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.login ? need(l.href) : l.href}
            className="flex min-h-11 items-center rounded-full bg-surface px-4 text-[15px] text-ink transition-colors active:bg-ink/4"
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* 기록 공유 — 정책을 다시 정할 때까지 예전 기능 그대로(기존 ?card= 길 · 글쓰기의 기록 고르기 · 공개 선택). 맨 끝에 한 줄로만 */}
      {record && (
        <Link
          href={`/community/new?card=${encodeURIComponent(record.ref)}`}
          className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 transition-colors active:bg-ink/4"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">기록으로 글 쓰기</span>
            <span className="block truncate text-[15px] font-semibold text-ink">{record.title}</span>
            <span className="block truncate text-[13px] text-muted">{record.detail}</span>
          </span>
          <span className="shrink-0 text-[15px] text-sky">글 쓰기 ›</span>
        </Link>
      )}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl bg-surface">{children}</div>;
}

function Line({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-4">
      <p className="min-w-0 text-[15px] text-muted">{children}</p>
      {action}
    </div>
  );
}

function Pill({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 shrink-0 items-center rounded-full bg-sky px-4 text-[15px] font-semibold text-white">
      {children}
    </Link>
  );
}

function Row({ href, kicker, title, sub }: { href: string; kicker?: string; title: string; sub: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors active:bg-ink/4">
      <span className="min-w-0 flex-1">
        {kicker ? <span className="block text-[13px] text-muted">{kicker}</span> : null}
        <span className="block truncate text-[17px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted tabular-nums">{sub}</span>
      </span>
      <span aria-hidden className="shrink-0 text-muted">
        ›
      </span>
    </Link>
  );
}
