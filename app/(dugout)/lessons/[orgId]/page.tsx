import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoundStar } from '@/components/round-icon';
import { LessonFrame } from '@/components/dugout/lesson-frame';
import { Badge, Card } from '@/components/ui';
import { CoachAvatar, CoachBadges, Stars } from '@/components/dugout/coach-card';
import { ConfirmButton } from '@/components/master/confirm-button';
import { cancelBooking } from '@/app/actions/lessons';
import { getCurrentUser } from '@/lib/dal';
import { loadCoach } from '@/lib/market/lesson-load';
import { bookingStatusLabel, formatSlot, reviewTagLabel, specialtyLabel } from '@/lib/market/lessons';
import { formatPrice } from '@/lib/market/specs';
import { WEEKDAYS } from '@/lib/market/venues';
import { relativeTime } from '@/components/community/community-format';

type SP = { [key: string]: string | string[] | undefined };

/**
 * 코치 하나(3판, 닥터나우 의사 상세 재해석) — 아바타 · 레슨장 · 이름 · 별점 · 특징, 칸 셋(가격 · 후기 · 회원), 소개 · 가격 · 레슨 시간 · 후기 요약(별 분포 + 좋았던 점) ·
 * 후기 목록. 아래 고정 막대 '가격 · 레슨 요청하기'(/lessons/[id]/book). 이미 살아 있는 요청이 있으면 그 상태와 취소.
 */
export default async function CoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<SP>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const c = await loadCoach(orgId, user?.id ?? null, user?.role === 'ADMIN');
  if (!c) notFound();
  const now = new Date();
  const bookQuery = new URLSearchParams(
    Object.entries({
      specialty: Array.isArray(sp.specialty) ? sp.specialty[0] : sp.specialty,
      audience: Array.isArray(sp.audience) ? sp.audience[0] : sp.audience,
    }).filter(([, v]) => v) as [string, string][]
  ).toString();
  const bookHref = `/lessons/${c.id}/book${bookQuery ? `?${bookQuery}` : ''}`;
  const priceText = c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '가격 문의';

  return (
    <LessonFrame back="/lessons/list" backLabel="코치 목록" title={`${c.coach} 코치`}>
      <div className="space-y-6 pb-24">

      {/* 머리 */}
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
        <CoachAvatar name={c.coach} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{c.name}</p>
          <p className="text-2xl font-black text-ink">{c.coach} 코치</p>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Stars rating={c.rating} reviews={c.reviews} className="text-sm" />
            {c.career && <span className="text-xs text-muted">{c.career}</span>}
          </p>
          <p className="mt-2 flex flex-wrap justify-center gap-1 sm:justify-start">
            {c.specialties.map((s) => (
              <Badge key={s} className="text-sky-strong">
                {specialtyLabel(s)}
              </Badge>
            ))}
            <CoachBadges c={c} admin={user?.role === 'ADMIN'} />
          </p>
        </div>
      </div>

      {/* 칸 셋 */}
      <Card className="grid grid-cols-3 divide-x divide-line p-0 text-center">
        <div className="px-2 py-3">
          <p className="text-[11px] text-muted">1회</p>
          <p className="text-sm font-bold text-ink">{priceText}</p>
          {c.trialPrice != null && <p className="text-[11px] text-ok">체험 {formatPrice(c.trialPrice)}</p>}
        </div>
        <div className="px-2 py-3">
          <p className="text-[11px] text-muted">확정 속도</p>
          <p className="text-sm font-bold text-ink">
            {c.confirmHours == null
              ? '—'
              : c.confirmHours < 1
                ? '1시간 안'
                : c.confirmHours <= 24
                  ? `${Math.round(c.confirmHours)}시간 안`
                  : `${Math.round(c.confirmHours / 24)}일쯤`}
          </p>
        </div>
        <div className="px-2 py-3">
          <p className="text-[11px] text-muted">회원</p>
          <p className="text-sm font-bold text-ink">{c.members}명</p>
        </div>
      </Card>

      {/* 안 이동 탭 */}
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 text-sm md:mx-0 md:px-0" aria-label="코치 정보">
        {[
          ['#intro', '소개'],
          ['#price', '가격'],
          ['#hours', '레슨 시간'],
          ['#reviews', `후기 ${c.reviews}`],
        ].map(([h, l]) => (
          <a key={h} href={h} className="shrink-0 px-3 py-2 font-semibold text-muted hover:text-ink">
            {l}
          </a>
        ))}
      </nav>

      <section id="intro" className="scroll-mt-24 space-y-2">
        <h2 className="text-sm font-bold text-ink">소개</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{c.intro ?? '소개를 준비 중이에요.'}</p>
        {c.region && <p className="text-xs text-muted">지역 · {c.region}</p>}
      </section>

      <section id="price" className="scroll-mt-24 space-y-2">
        <h2 className="text-sm font-bold text-ink">가격</h2>
        <Card className="p-0">
          <dl className="divide-y divide-line text-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-muted">레슨 1회 · {c.slotMin}분</dt>
              <dd className="font-bold text-ink">{priceText}</dd>
            </div>
            {c.trialPrice != null && (
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-muted">첫 레슨 체험</dt>
                <dd className="font-bold text-ok">{formatPrice(c.trialPrice)}</dd>
              </div>
            )}
            {c.priceNote && (
              <div className="px-4 py-3 text-xs text-muted">{c.priceNote}</div>
            )}
          </dl>
        </Card>
        <p className="text-xs text-muted">레슨이 끝나기 전에는 레슨비가 결제되지 않아요. 결제 연동은 준비 중이라 지금은 현장에서 내요.</p>
      </section>

      <section id="hours" className="scroll-mt-24 space-y-2">
        <h2 className="text-sm font-bold text-ink">레슨 시간</h2>
        {c.slots ? (
          <Card className="p-0">
            <dl className="grid grid-cols-7 divide-x divide-line text-center text-xs">
              {WEEKDAYS.map((w, i) => {
                const h = c.slots![i];
                return (
                  <div key={w} className="py-2">
                    <dt className={i === 0 ? 'text-danger' : i === 6 ? 'text-sky' : 'text-muted'}>{w}</dt>
                    <dd className={`mt-0.5 font-semibold ${h ? 'text-ink' : 'text-muted/50'}`}>
                      {h ? (
                        <>
                          {h.open}
                          <br />~{h.close}
                        </>
                      ) : (
                        '쉼'
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        ) : (
          <p className="text-sm text-ink">{c.hours ?? '코치에게 문의해 주세요. 요청할 때 원하는 시간을 적으면 돼요.'}</p>
        )}
        {c.nextOpen && <p className="text-xs font-semibold text-ok">가장 빠른 시간 · {c.nextOpen}</p>}
      </section>

      <section id="reviews" className="scroll-mt-24 space-y-3">
        <h2 className="text-sm font-bold text-ink">후기 {c.reviews}</h2>
        {c.reviews === 0 ? (
          <p className="text-xs text-muted">아직 후기가 없어요. 실제로 레슨 받은 사람만 써요.</p>
        ) : (
          <>
            <Card className="flex gap-5">
              <div className="flex flex-col items-center justify-center">
                <RoundStar className="h-6 w-6 text-warn" {...({ filled: true } as object)} />
                <p className="text-3xl font-black text-ink">{c.rating?.toFixed(1)}</p>
                <p className="text-[11px] text-muted">{c.reviews}개</p>
              </div>
              <dl className="flex-1 space-y-1">
                {c.summary.dist.map((d) => (
                  <div key={d.star} className="flex items-center gap-2 text-[11px] text-muted">
                    <dt className="w-5 text-right">{d.star}</dt>
                    <dd className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-warn" style={{ width: `${d.pct}%` }} />
                    </dd>
                    <span className="w-6 text-right">{d.n}</span>
                  </div>
                ))}
              </dl>
            </Card>
            {c.summary.tags.length > 0 && (
              <p className="flex flex-wrap gap-1.5">
                {c.summary.tags.map((t) => (
                  <span key={t.key} className="inline-flex items-center gap-1 rounded-full bg-ink/6 px-3 py-1 text-xs text-ink">
                    {t.label} <b className="text-sky-strong">{t.n}</b>
                  </span>
                ))}
              </p>
            )}
            <Card className="divide-y divide-line p-0">
              {c.reviewList.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <span className="inline-flex text-warn">{'★'.repeat(r.rating)}</span>
                    <span>{r.nickname}</span>
                    <span>{relativeTime(r.createdAt, now)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.body}</p>
                  {r.tags.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <Badge key={t}>{reviewTagLabel(t)}</Badge>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </Card>
          </>
        )}
      </section>

      {/* 아래 고정 막대 — 닥터나우 '홍상영 의사에게 진료받기' */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-top,0px)+0.75rem)] z-30 px-4 md:bottom-6">
        <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
          <span className="min-w-0 pl-1">
            <span className="block text-[11px] text-muted">레슨 1회</span>
            <span className="block text-base font-black text-ink">{priceText}</span>
          </span>
          {c.mine ? (
            <Link href="/manage/settings#coach" className="ml-auto inline-flex min-h-12 items-center rounded-full bg-ink/6 px-5 text-sm font-semibold text-ink">
              내 프로필 고치기
            </Link>
          ) : !user ? (
            <Link href={`/login?next=${encodeURIComponent(bookHref)}`} className="ml-auto inline-flex min-h-12 items-center rounded-full bg-sky px-5 text-base font-bold text-white">
              로그인하고 요청하기
            </Link>
          ) : c.myBooking ? (
            <span className="ml-auto flex items-center gap-2 text-sm">
              <Badge className="text-sky-strong">{bookingStatusLabel(c.myBooking.status)}</Badge>
              <span className="hidden text-xs text-muted sm:inline">
                {c.myBooking.chosen ? formatSlot(c.myBooking.chosen) : formatSlot(c.myBooking.slot1)}
              </span>
              <ConfirmButton action={cancelBooking} fields={{ id: c.myBooking.id }} message="이 요청을 취소할까요?" doneToast="취소했어요.">
                취소
              </ConfirmButton>
            </span>
          ) : (
            <Link href={bookHref} className="ml-auto inline-flex min-h-12 items-center rounded-full bg-sky px-6 text-base font-bold text-white transition-colors hover:bg-sky-strong">
              {c.coach} 코치에게 레슨 요청
            </Link>
          )}
        </div>
      </div>
      </div>
    </LessonFrame>
  );
}
