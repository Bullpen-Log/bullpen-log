import Link from 'next/link';
import {
  RoundArmcare,
  RoundBaseball,
  RoundBatter,
  RoundCommunity,
  RoundLesson,
  RoundPeople,
  RoundPitcher,
  RoundSearch,
  RoundTraining,
  RoundVenue,
  RoundZone,
} from '@/components/round-icon';
import { Badge, Card } from '@/components/ui';
import { CoachAvatar, CoachCard } from '@/components/dugout/coach-card';
import { getCurrentUser } from '@/lib/dal';
import {
  loadQuickCoaches,
  loadRecommendedCoaches,
  loadUpcomingBooking,
} from '@/lib/market/lesson-load';
import { SPECIALTIES, bookingStatusLabel, formatSlot, listHref } from '@/lib/market/lessons';

/**
 * 레슨 허브(3판, 2026-10-22 금윤호: "닥터나우처럼 — 코치를 비교해 보고 고르고 추천해 주고 간편하게 예약").
 * 닥터나우 홈의 '비대면 진료 시작하기' 아이콘 줄을 종목 줄로, '나에게 맞는 의사 찾기'를 맞춤 코치 찾기(/lessons/find)로 재해석했다.
 * 위부터: 검색 → 맞춤 찾기 → 종목 줄 → 내 레슨(있으면) → 추천 코치 → 빠른 예약 → 레슨장 찾기. 로그인 없이 본다.
 */
const SPECIALTY_ICONS = {
  pitching: RoundPitcher,
  hitting: RoundBatter,
  fielding: RoundBaseball,
  catching: RoundZone,
  youth: RoundPeople,
  adult: RoundCommunity,
  rehab: RoundArmcare,
  strength: RoundTraining,
} as const;

export default async function LessonsHubPage() {
  const user = await getCurrentUser();
  const [recommended, quick, upcoming] = await Promise.all([
    loadRecommendedCoaches(6),
    loadQuickCoaches(6),
    user ? loadUpcomingBooking(user.id) : null,
  ]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-black text-ink">레슨</h1>
        <p className="mt-1 text-sm text-muted">코치를 비교해 고르고, 원하는 시간을 골라 바로 예약해요.</p>
      </div>

      {/* 검색 — 코치 · 레슨장 · 지역 */}
      <form method="get" action="/lessons/list" className="relative">
        <RoundSearch className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          name="q"
          type="search"
          placeholder="코치 · 레슨장 이름 · 지역으로 찾기"
          className="min-h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-12 text-sm text-ink focus:border-sky focus:outline-none"
        />
      </form>

      {/* 맞춤 찾기 — 닥터나우 '나에게 맞는 의사 찾기' */}
      <Link
        href="/lessons/find"
        className="flex items-center gap-4 rounded-2xl bg-sky p-5 text-white transition-colors hover:bg-sky-strong"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20">
          <RoundLesson className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">나에게 맞는 코치 찾기</span>
          <span className="block text-sm text-white/85">무엇을 · 누가 · 언제 · 어디서 — 다섯 질문이면 돼요</span>
        </span>
        <span className="text-xl">›</span>
      </Link>

      {/* 종목 줄 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">종목으로 바로 보기</h2>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-9 md:gap-2 md:overflow-visible md:px-0">
          {SPECIALTIES.map((s) => {
            const Icon = SPECIALTY_ICONS[s.key];
            return (
              <Link
                key={s.key}
                href={listHref({ specialty: s.key })}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-xs text-ink md:w-auto"
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-sky-strong transition-transform hover:scale-105">
                  <Icon className="h-6 w-6" />
                </span>
                {s.label}
              </Link>
            );
          })}
          <Link
            href="/lessons/list"
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-xs text-ink md:w-auto"
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-muted shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <span className="text-lg font-bold">…</span>
            </span>
            전체 보기
          </Link>
        </div>
      </section>

      {/* 내 레슨 */}
      {upcoming && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ink">내 레슨</h2>
          <Link href="/me#bookings" className="block">
            <Card className="flex items-center gap-3">
              <CoachAvatar name={upcoming.org.coach} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Badge className={upcoming.status === 'CONFIRMED' ? 'text-sky-strong' : 'text-warn'}>
                    {bookingStatusLabel(upcoming.status)}
                  </Badge>
                  <span className="truncate text-sm font-bold text-ink">
                    {upcoming.org.coach} 코치 · {upcoming.org.name}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {upcoming.chosen
                    ? formatSlot(upcoming.chosen)
                    : `${formatSlot(upcoming.slot1)} 요청 · 코치의 답을 기다려요`}
                </span>
              </span>
              <span className="text-muted">›</span>
            </Card>
          </Link>
        </section>
      )}

      {/* 추천 코치 */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-ink">추천 코치</h2>
          <Link href={listHref({ sort: 'rating' })} className="text-xs font-semibold text-sky">
            전체 보기 ›
          </Link>
        </div>
        {recommended.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              아직 공개한 코치가 없어요. 레슨장 계정이 설정에서 프로필을 공개하면 여기 보여요.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recommended.map((c) => (
              <CoachCard key={c.id} c={c} href={`/lessons/${c.id}`} compact />
            ))}
          </div>
        )}
      </section>

      {/* 빠른 예약 */}
      {quick.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">오늘 · 내일 바로 가능</h2>
            <p className="text-xs text-muted">레슨 시간이 열려 있는 코치예요. 시간을 골라 요청하면 돼요.</p>
          </div>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
            {quick.map((c) => (
              <Link
                key={c.id}
                href={`/lessons/${c.id}/book`}
                className="w-56 shrink-0 snap-start rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
              >
                <div className="flex items-center gap-3">
                  <CoachAvatar name={c.coach} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{c.coach} 코치</span>
                    <span className="block truncate text-xs text-muted">{c.name}</span>
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold text-ok">{c.nextOpen}</p>
                <p className="mt-1 text-xs text-muted">
                  {c.priceFrom != null ? `${c.priceFrom.toLocaleString('ko-KR')}원~` : '가격 문의'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 레슨장 찾기 */}
      <Link
        href="/venues"
        className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky/12 text-sky-strong">
          <RoundVenue className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">레슨장 · 연습장 찾기</span>
          <span className="block text-xs text-muted">장소 먼저 보고 빈 시간을 바로 잡아요</span>
        </span>
        <span className="text-muted">›</span>
      </Link>
    </div>
  );
}
