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
import { CoachAvatar, CoachCard, CoachTile } from '@/components/dugout/coach-card';
import { LessonFrame, SectionTitle } from '@/components/dugout/lesson-frame';
import { ShortcutTiles } from '@/components/dugout/ui';
import { getCurrentUser } from '@/lib/dal';
import {
  loadCoaches,
  loadQuickCoaches,
  loadRecommendedCoaches,
  loadUpcomingBooking,
  type CoachCard as CoachCardData,
} from '@/lib/market/lesson-load';
import { SPECIALTIES, bookingStatusLabel, formatSlot, listHref } from '@/lib/market/lessons';

/**
 * 레슨 허브(3판, 2026-10-22 금윤호: "닥터나우처럼 — 코치를 비교해 보고 고르고 추천해 주고 간편하게 예약", "우리 인터페이스를 조금만 묻히는 느낌으로").
 * 닥터나우 홈의 '비대면 진료 시작하기' 아이콘 줄을 종목 줄로, '나에게 맞는 의사 찾기'를 맞춤 코치 찾기(/lessons/find)로.
 * 휴대폰은 가운데 좁은 기둥 하나(components/dugout/lesson-frame.tsx) · 목록은 한 카드 안에 줄로 쌓는다(크기가 맞게). 로그인 없이 본다.
 * PC(lg, 2026-10-24): 위는 찾기 띠(검색 · 맞춤 찾기) + 오른쪽 숫자 판(공개 코치 · 평균 별점 · 보통 확정까지) · 내 레슨, 종목은 큰 칸 격자,
 * 추천 코치는 세 칸 카드 격자, 오늘 · 내일 가능은 여섯 칸.
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

/** PC 숫자 판 — 공개 코치 수 · 평균 별점 · 보통 확정까지 걸리는 시간(코치별 가운데 값의 가운데) */
function statsOf(all: CoachCardData[]) {
  const rated = all.filter((c) => c.rating != null && c.reviews > 0);
  const avg = rated.length ? rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length : null;
  const hours = all
    .map((c) => c.confirmHours)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b);
  const mid = hours.length ? hours[Math.floor(hours.length / 2)] : null;
  return {
    count: all.length,
    avg,
    confirm:
      mid == null ? null : mid < 1 ? '1시간 안' : mid <= 24 ? `${Math.round(mid)}시간 안` : `${Math.round(mid / 24)}일쯤`,
  };
}

export default async function LessonsHubPage() {
  const user = await getCurrentUser();
  const [recommended, all, upcoming] = await Promise.all([
    loadRecommendedCoaches(6),
    loadCoaches({}),
    user ? loadUpcomingBooking(user.id) : null,
  ]);
  const quick = await loadQuickCoaches(6, all);
  const stats = statsOf(all);
  const bySpecialty = (key: string) => all.filter((c) => c.specialties.includes(key)).length;

  const myLesson = upcoming && (
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
  );

  const venueLink = (
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
  );

  return (
    <LessonFrame
      title="레슨"
      crumbs={[{ label: '덕아웃', href: '/' }, { label: '레슨' }]}
      subtitle="코치를 비교해 보고, 빈 시간을 골라 바로 요청해요."
      actions={
        <Link
          href="/lessons/list"
          className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
        >
          모든 코치 보기
        </Link>
      }
    >
      {/* 찾기 띠 — PC 는 왼쪽 넓은 칸(검색 · 맞춤 찾기) + 오른쪽 숫자 판 · 내 레슨 */}
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0">
      <div className="space-y-5 lg:flex lg:flex-col lg:justify-center lg:gap-4 lg:space-y-0 lg:rounded-3xl lg:bg-sky/8 lg:p-8">
      <div className="hidden lg:block">
        <p className="text-2xl font-black tracking-tight text-ink">어떤 레슨을 찾고 있어요?</p>
        <p className="mt-1 text-sm text-muted">이름 · 레슨장 · 동네로 찾거나, 다섯 질문으로 맞는 코치를 추천받아요.</p>
      </div>
      {/* 검색 — 코치 · 레슨장 · 지역. 사파리의 search 칸은 appearance 를 끄지 않으면 여백을 무시한다 */}
      <form method="get" action="/lessons/list" className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 focus-within:border-sky lg:min-h-14 lg:pr-1.5">
        <RoundSearch className="h-5 w-5 shrink-0 text-muted" />
        <input
          name="q"
          type="search"
          placeholder="코치 · 레슨장 이름 · 지역으로 찾기"
          className="min-h-11 w-full appearance-none bg-transparent text-sm text-ink placeholder:text-muted/70 focus:outline-none"
        />
        <button type="submit" className="hidden min-h-11 shrink-0 rounded-xl bg-ink px-5 text-sm font-bold text-page lg:block">
          찾기
        </button>
      </form>

      {/* 맞춤 찾기 — 닥터나우 '나에게 맞는 의사 찾기' */}
      <Link
        href="/lessons/find"
        className="flex items-center gap-4 rounded-2xl bg-sky p-4 text-white transition-colors hover:bg-sky-strong"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20">
          <RoundLesson className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">나에게 맞는 코치 찾기</span>
          <span className="block text-xs text-white/85">무엇을 · 누가 · 언제 · 어디서 · 선호 — 다섯 질문</span>
        </span>
        <span className="text-xl">›</span>
      </Link>
      </div>

      {/* PC 오른쪽 — 내 레슨 · 숫자 판 · 레슨장 지도 */}
      <aside className="hidden lg:flex lg:flex-col lg:gap-4">
        {myLesson}
        <Card className="space-y-4">
          <p className="text-sm font-bold text-ink">덕아웃 레슨</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[11px] text-muted">공개 코치</dt>
              <dd className="mt-0.5 text-lg font-black text-ink tabular-nums">{stats.count}명</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">평균 별점</dt>
              <dd className="mt-0.5 text-lg font-black text-ink tabular-nums">{stats.avg != null ? stats.avg.toFixed(1) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">보통 확정</dt>
              <dd className="mt-0.5 text-lg font-black text-ink">{stats.confirm ?? '—'}</dd>
            </div>
          </dl>
          <p className="border-t border-line pt-3 text-xs leading-relaxed text-muted">
            요청을 보내면 코치가 시간을 확정해요. 레슨비는 레슨이 끝난 뒤 결제돼요.
          </p>
        </Card>
        {venueLink}
      </aside>
      </div>

      {/* 종목 줄 — 장터의 기능 바로가기와 같은 72px 둥근 네모(2026-10-24 UI 통일) */}
      <section className="space-y-4">
        <SectionTitle>종목으로 바로 보기</SectionTitle>
        <ShortcutTiles
          label="종목으로 바로 보기"
          items={[
            ...SPECIALTIES.map((s) => ({
              href: listHref({ specialty: s.key }),
              label: s.label,
              icon: SPECIALTY_ICONS[s.key],
              sub: `코치 ${bySpecialty(s.key)}명`,
            })),
            { href: '/lessons/list', label: '전체 보기', icon: RoundLesson, sub: `코치 ${all.length}명` },
          ]}
        />
      </section>

      {/* 내 레슨 — 휴대폰(PC 는 위 오른쪽 칸) */}
      {myLesson && (
        <section className="space-y-3 lg:hidden">
          <SectionTitle>내 레슨</SectionTitle>
          {myLesson}
        </section>
      )}

      {/* 추천 코치 — 닥터나우 의사 목록처럼 한 카드 안에 줄로 */}
      <section className="space-y-3">
        <SectionTitle
          action={
            <Link href={listHref({ sort: 'rating' })} className="text-xs font-semibold text-sky">
              전체 보기 ›
            </Link>
          }
        >
          추천 코치
        </SectionTitle>
        {recommended.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              아직 공개한 코치가 없어요. 레슨장 계정이 설정에서 프로필을 공개하면 여기 보여요.
            </p>
          </Card>
        ) : (
          <>
            <Card className="divide-y divide-line p-0 lg:hidden">
              {recommended.slice(0, 5).map((c) => (
                <CoachCard key={c.id} c={c} href={`/lessons/${c.id}`} />
              ))}
            </Card>
            <div className="hidden gap-4 lg:grid lg:grid-cols-3">
              {recommended.map((c, i) => (
                <div key={c.id} className="motion-safe:animate-row-in" style={{ ['--row' as string]: i }}>
                  <CoachTile c={c} href={`/lessons/${c.id}`} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 빠른 예약 */}
      {quick.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>오늘 · 내일 바로 가능</SectionTitle>
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 lg:grid lg:grid-cols-6 lg:gap-3 lg:overflow-visible">
            {quick.map((c) => (
              <Link
                key={c.id}
                href={`/lessons/${c.id}/book`}
                className="flex w-40 shrink-0 snap-start flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-4 text-center transition-[border-color,transform] duration-200 hover:border-sky-soft lg:w-auto desk:hover:-translate-y-0.5 motion-reduce:transform-none"
              >
                <CoachAvatar name={c.coach} />
                <span className="w-full min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">{c.coach} 코치</span>
                  <span className="block truncate text-[11px] text-muted">{c.name}</span>
                </span>
                <span className="text-xs font-semibold text-ok">{c.nextOpen}</span>
                <span className="text-xs text-muted">
                  {c.priceFrom != null ? `${c.priceFrom.toLocaleString('ko-KR')}원~` : '가격 문의'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 레슨장 찾기 — 휴대폰(PC 는 위 오른쪽 칸) */}
      <div className="lg:hidden">{venueLink}</div>
    </LessonFrame>
  );
}
