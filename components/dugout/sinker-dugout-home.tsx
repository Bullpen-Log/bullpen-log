import Link from 'next/link';
import type { ReactNode } from 'react';
import { SectionHead } from '@/components/dugout/ui';
import { BenchCard } from '@/components/dugout/bench-card';
import { SinkerCommunity } from '@/components/dugout/sinker-community';
import { activitySummary, type FeedCard } from '@/lib/sinker-dugout-feed';
import type { ActivityItem, BenchMeetup, VenueCard } from '@/lib/sinker-dugout-load';

type Record = { ref: string; title: string; detail: string };

/**
 * 싱커 앱의 덕아웃 탭 첫 화면(2026-10-27 승인 시안 '수정 개선안') — 사람 · 커뮤니티 · 같이 연습 · 장소에 집중한다.
 * 차례: 이어 볼 활동(있을 때 한 줄) → 같이 연습(실제 번개 한 건의 벤치 카드) → 커뮤니티 인기글 / 최신글 → 연습장 한 곳 → 기록으로 글 쓰기(예전 기능 그대로, 맨 끝).
 * 위 막대(DUGOUT · 내 활동 · 알림)와 세 분류(둘러보기 · 커뮤니티 · 연습장)는 덕아웃 틀이 그린다(components/dugout/dugout-topbar.tsx).
 * 레슨 찾기 · 추천 코치 · 최근 레슨은 여기 없다(AI 코치가 개인 분석 · 훈련을 맡는다) — 기존 레슨 예약은 이어 볼 활동 · 마이에 그대로.
 * 덕아웃 웹 · 덕아웃 앱의 첫 화면(components/dugout/dugout-main.tsx)은 그대로다. 장터 · 경기 · 뉴스 · 검색 · 장터 채팅 길도 없다.
 * 빈 자료는 그 구역 안 한 줄 + 지금 할 수 있는 행동 하나, 못 읽은 것은 '못 불러왔어요'로 빈 것과 가른다(한 구역이 실패해도 다른 구역은 선다).
 */
export function SinkerDugoutHome({
  activity,
  meetup,
  community,
  venue,
  record,
  loggedIn,
  korea = true,
}: {
  /** 내 활동 — null 이면 못 읽음, 로그인 안 했으면 undefined */
  activity: ActivityItem[] | null | undefined;
  /** 같이 연습 — undefined 면 다가오는 모집 중 번개 없음, null 이면 못 읽음 */
  meetup: BenchMeetup | null | undefined;
  community: { hot: FeedCard[] | null; latest: FeedCard[] | null };
  venue: VenueCard | null | undefined;
  record: Record | null;
  loggedIn: boolean;
  /** 한국 덕아웃인가 — 미국 · 일본(lib/country.ts)은 내 활동(예약 · 번개) · 같이 연습 · 연습장 없이 커뮤니티 · 기록 공유만 */
  korea?: boolean;
}) {
  const need = (href: string) => (loggedIn ? href : `/login?next=${encodeURIComponent(href)}`);
  const summary = activity ? activitySummary(activity) : null;
  return (
    <div className="space-y-6">
      <h1 className="sr-only">덕아웃 둘러보기</h1>

      {/* 이어 볼 활동 — 있을 때만 한 줄(빈 활동 카드를 세우지 않는다) */}
      {!korea ? null : !loggedIn ? (
        <Line action={<Pill href={`/login?next=${encodeURIComponent('/?dugout=1')}`}>로그인</Pill>}>로그인하면 내 참가 · 질문 · 예약을 이어 봐요.</Line>
      ) : activity === null ? (
        <Line>내 활동을 불러오지 못했어요. 아래로 당겨 다시 받아 주세요.</Line>
      ) : summary ? (
        <Link href={summary.href} className="flex min-h-16 items-center gap-3 rounded-[20px] bg-surface px-4 py-3 transition-colors active:bg-ink/4">
          <TicketGlyph />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] leading-6 font-semibold text-ink">{summary.title}</span>
            <span className="mt-1 block text-[15px] leading-[1.5] text-muted tabular-nums">{summary.sub}</span>
          </span>
          <span aria-hidden className="shrink-0 text-muted">
            ›
          </span>
        </Link>
      ) : null}

      {/* 같이 연습 */}
      {korea && (
        <section className="space-y-3">
          <SectionHead
            title="같이 연습"
            action={
              <Link href="/community?category=meetup&open=1" className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
                번개 전체
              </Link>
            }
          />
          {meetup === null ? (
            <Line action={<TextLink href="/community?category=meetup&open=1">번개 목록</TextLink>}>같이 연습을 불러오지 못했어요.</Line>
          ) : meetup === undefined ? (
            <Line action={<Pill href={need('/community/new?board=meetup')}>번개 만들기</Pill>}>
              모집 중인 번개가 없어요.
            </Line>
          ) : (
            <BenchCard key={meetup.id} meetup={meetup} />
          )}
        </section>
      )}

      <SinkerCommunity hot={community.hot} latest={community.latest} loggedIn={loggedIn} />

      {/* 연습장 — 실제 장소 한 곳(레슨장은 넣지 않는다) */}
      {korea && (
        <section className="space-y-3">
          <SectionHead
            title="연습장"
            action={
              <Link href="/venues" className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
                전체 보기
              </Link>
            }
          />
          {venue === null ? (
            <Line action={<TextLink href="/venues">지도 열기</TextLink>}>연습장을 불러오지 못했어요.</Line>
          ) : venue === undefined ? (
            <Line action={<TextLink href="/venues">지도 열기</TextLink>}>아직 등록된 연습장이 없어요.</Line>
          ) : (
            <article className="flex gap-3.5 rounded-[20px] bg-surface p-3.5">
              <div className="relative h-[6.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-sky-tint">
                {venue.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소(1시간)라 이미지 최적화를 거치지 않는다
                  <img src={venue.image} alt={`${venue.name} 사진`} className="h-full w-full object-cover" />
                ) : (
                  <VenueArt kind={venue.kind} />
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="truncate text-[12px] text-muted">{[venue.region, venue.kindLabel].filter(Boolean).join(' · ')}</p>
                <h3 className="mt-0.5 line-clamp-2 text-[16px] leading-snug font-bold text-ink">{venue.name}</h3>
                <p className="mt-1 text-[15px] font-bold text-ink tabular-nums">
                  {venue.price}
                  {venue.unit && <span className="ml-1 text-[12px] font-normal text-muted">{venue.unit}</span>}
                </p>
                <p className="text-[12px] text-muted">{venue.booking}</p>
                <Link href={`/venues/${venue.id}`} className="-mb-2 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-sky">
                  시설 보기 <span aria-hidden>↗</span>
                </Link>
              </div>
            </article>
          )}
        </section>
      )}

      {/* 기록 공유 — 정책을 다시 정할 때까지 예전 기능 그대로(기존 ?card= 길 · 글쓰기의 기록 고르기 · 공개 선택). 맨 끝에 한 줄로만 */}
      {record && (
        <Link
          href={`/community/new?card=${encodeURIComponent(record.ref)}`}
          className="flex items-center gap-3 rounded-[20px] bg-surface px-4 py-3 transition-colors active:bg-ink/4"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">기록으로 글 쓰기</span>
            <span className="block text-[17px] leading-6 font-semibold text-ink">{record.title}</span>
            <span className="block text-[15px] leading-[1.5] text-muted">{record.detail}</span>
          </span>
          <span className="shrink-0 text-[15px] text-sky">글 쓰기 ›</span>
        </Link>
      )}
    </div>
  );
}

function Line({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-surface px-4 py-4">
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

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 shrink-0 items-center text-[15px] font-semibold text-sky">
      {children}
    </Link>
  );
}

function TicketGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-sky" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z" />
      <path d="M9 7v10" strokeDasharray="2 2" />
    </svg>
  );
}

/**
 * 사진이 없는 연습장의 종류 그림 — 그림이지 그 시설 사진이 아니다(그물 · 공 · 구장 선). 케이지 · 실내 · 머신은 그물, 야외 구장은 다이아몬드.
 */
function VenueArt({ kind }: { kind: string }) {
  if (kind === 'field')
    return (
      <svg viewBox="0 0 88 104" className="h-full w-full" aria-hidden>
        <rect width="88" height="104" fill="#d9eefb" />
        <path d="M44 30 L70 56 L44 82 L18 56 Z" fill="#9fd3a8" stroke="#ffffff" strokeWidth="2" />
        <circle cx="44" cy="56" r="4" fill="#e8c9a0" />
      </svg>
    );
  return (
    <svg viewBox="0 0 88 104" className="h-full w-full text-sky" aria-hidden>
      <rect width="88" height="104" fill="currentColor" opacity="0.12" />
      <g stroke="currentColor" strokeWidth="1.2" opacity="0.55">
        {[14, 26, 38, 50, 62, 74].map((x) => (
          <line key={`v${x}`} x1={x} y1="10" x2={x} y2="94" />
        ))}
        {[18, 30, 42, 54, 66, 78, 90].map((y) => (
          <line key={`h${y}`} x1="8" y1={y} x2="80" y2={y} />
        ))}
      </g>
      <rect x="8" y="10" width="72" height="84" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="56" cy="64" r="7" fill="#ffffff" stroke="#b73b32" strokeWidth="1.2" />
    </svg>
  );
}
