import Link from 'next/link';
import {
  RoundFlame,
  RoundLesson,
  RoundPeople,
  RoundSearch,
  RoundStar,
  RoundVenue,
} from '@/components/round-icon';
import { Badge } from '@/components/ui';
import { CoachAvatar, CoachPhotoCard, CoachRow } from '@/components/dugout/coach-card';
import { CategoryRow, DugoutEmpty, DugoutPageHeader, SectionHead, ShortcutTiles, type Shortcut } from '@/components/dugout/ui';
import { getCurrentUser } from '@/lib/dal';
import { loadQuickCoaches, loadRecommendedCoaches, loadUpcomingBooking } from '@/lib/market/lesson-load';
import { SPECIALTIES, bookingStatusLabel, formatSlot, listHref } from '@/lib/market/lessons';

/**
 * 레슨 허브(3판, 2026-10-22 금윤호: "닥터나우처럼 — 코치를 비교해 보고 고르고 추천해 주고 간편하게 예약").
 * 2026-10-24 금윤호 "분석대로 레슨 첫 화면부터 장터처럼 덜어내": 장터와 같은 차례 — 종목 밑줄 줄 → 검은 띠 한 장(맞춤 찾기 · 오늘 가능 · 결제) →
 * 기능 바로가기 → '추천 코치' 사진 카드 격자(테두리 · 칩 · 소개 없이) → 오늘 · 내일 가능(테두리 없는 얼굴 줄). 숫자 판 · 초록 판 · 안내 글은 걷었다
 * (같은 말은 띠 · 상세 · 예약 화면에 있다). 검색은 위 막대 통합검색이 코치도 찾는다. 로그인 없이 본다.
 */

const SHORTCUTS: Shortcut[] = [
  { href: '/lessons/find', label: '맞춤 찾기', icon: RoundSearch },
  { href: listHref({ when: 'today' }), label: '오늘 가능', icon: RoundFlame },
  { href: listHref({ sort: 'rating' }), label: '후기 좋은 코치', icon: RoundStar },
  { href: listHref({ specialty: 'youth' }), label: '유소년', icon: RoundPeople },
  { href: '/venues', label: '레슨장 지도', icon: RoundVenue },
  { href: '/me#bookings', label: '내 레슨', icon: RoundLesson },
];

export default async function LessonsHubPage() {
  const user = await getCurrentUser();
  const [recommended, upcoming] = await Promise.all([
    loadRecommendedCoaches(6),
    user ? loadUpcomingBooking(user.id) : null,
  ]);
  const quick = await loadQuickCoaches(6);

  return (
    <div className="space-y-10">
      {/* 종목 줄 — 장터 품목 줄과 같은 굵은 밑줄 줄 */}
      <CategoryRow
        label="종목"
        className="-mt-2"
        items={[
          { key: 'all', label: '전체', href: '/lessons/list', on: true },
          ...SPECIALTIES.map((s) => ({ key: s.key, label: s.label, href: listHref({ specialty: s.key }), on: false })),
        ]}
      />

      {/* 바로가기는 휴대폰 · 패드만 — PC 는 종목 줄 · 제목 옆 단추가 같은 길(2026-10-25 PC 개편) */}
      <ShortcutTiles items={SHORTCUTS} label="레슨 바로가기" className="lg:hidden" />

      {/* 내 레슨 — 다가오는 예약이 있을 때만 한 줄(테두리 없이 회색 판) */}
      {upcoming && (
        <Link href="/me#bookings" className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 transition-colors hover:bg-ink/6">
          <CoachAvatar name={upcoming.org.coach} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <Badge className={upcoming.status === 'CONFIRMED' ? 'text-sky-strong' : 'text-warn'}>
                {bookingStatusLabel(upcoming.status)}
              </Badge>
              <span className="truncate text-sm font-bold text-ink">
                {upcoming.org.coach} 코치 · {upcoming.org.name}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-muted">
              {upcoming.chosen ? formatSlot(upcoming.chosen) : `${formatSlot(upcoming.slot1)} 요청 · 코치의 답을 기다려요`}
            </span>
          </span>
          <span className="text-muted">›</span>
        </Link>
      )}

      {/* 추천 코치 — 장터 '오늘의 추천 물건'처럼 큰 제목 + 사진 카드 격자 */}
      <section className="space-y-5">
        <DugoutPageHeader
          title="추천 코치"
          actions={
            <>
              <Link
                href="/lessons/find"
                className="hidden min-h-9 items-center rounded-full bg-sky px-4 text-sm font-bold text-white transition-colors hover:bg-sky-strong lg:inline-flex"
              >
                맞춤 찾기
              </Link>
              <Link href={listHref({ sort: 'rating' })} className="text-sm font-semibold text-muted hover:text-ink">
                전체 보기 ›
              </Link>
            </>
          }
        />
        {recommended.length === 0 ? (
          <DugoutEmpty
            title="아직 공개한 코치가 없어요"
            description="레슨장 계정이 설정에서 프로필을 공개하면 여기 보여요."
            href="/venues"
            cta="레슨장 지도 보기"
          />
        ) : (
          <>
            {/* 휴대폰 · 패드 — 사진 카드 격자. PC — 작은 아바타 비교 줄(큰 첫 글자 판은 사진이 아니라 정보가 아니었다, 2026-10-25) */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:hidden">
              {recommended.map((c, i) => (
                <div key={c.id} className="motion-safe:animate-row-in" style={{ ['--row' as string]: i }}>
                  <CoachPhotoCard c={c} href={`/lessons/${c.id}`} />
                </div>
              ))}
            </div>
            <div className="hidden divide-y divide-line border-y border-line lg:block">
              {recommended.map((c, i) => (
                <div key={c.id} className="motion-safe:animate-row-in" style={{ ['--row' as string]: i }}>
                  <CoachRow c={c} href={`/lessons/${c.id}`} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 오늘 · 내일 바로 가능 — 테두리 없는 얼굴 줄 */}
      {quick.length > 0 && (
        <section className="space-y-4">
          <SectionHead title="오늘 · 내일 바로 가능" href={listHref({ when: 'today' })} />
          <div className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4 md:mx-0 md:px-0 lg:flex-wrap lg:gap-x-8 lg:overflow-visible">
            {quick.map((c) => (
              <Link key={c.id} href={`/lessons/${c.id}/book`} className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center lg:w-auto lg:flex-row lg:gap-3 lg:text-left">
                <CoachAvatar name={c.coach} size="lg" className="transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none" />
                <span className="w-full min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{c.coach} 코치</span>
                  <span className="block truncate text-[13px] font-semibold text-ok">{c.nextOpen}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
