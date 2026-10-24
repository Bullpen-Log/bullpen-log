'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { requestBooking, type LessonState } from '@/app/actions/lessons';
import { Button, ButtonLink, Card, FormError, Textarea } from '@/components/ui';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { guardFormAction } from '@/lib/action-offline';
import type { DaySlots } from '@/lib/market/lesson-load';
import {
  AUDIENCES,
  BOOKING_NOTE_MAX,
  PAY_METHODS,
  SPECIALTIES,
  specialtyLabel,
  type AudienceKey,
  type PayMethodKey,
} from '@/lib/market/lessons';
import { WEEKDAYS, minToTime, weekdayOf } from '@/lib/market/venues';
import { formatPrice } from '@/lib/market/specs';

type Pick = { dateKey: string; startMin: number };
const key = (p: Pick) => `${p.dateKey}T${minToTime(p.startMin)}`;

/**
 * 레슨 요청 폼 — ① 날짜 띠 · 그날 칸(둘까지, 첫째가 1순위) ② 무엇을 · 누가 ③ 한마디 ④ 결제 수단(저장만) → 요청 보내기.
 * 보낸 뒤에는 확인 카드(코치가 확정하면 알림 · 내 것에서 보기).
 * PC(lg, 2026-10-24): 왼쪽은 단계마다 카드, 날짜는 두 주 달력 칸. 오른쪽에 따라오는 요약 판(코치 · 고른 때 · 무엇을 · 결제 수단 · 예상 레슨비 · 보내기).
 */
export function LessonBookForm({
  coach,
  todayKey,
  days,
  byDay,
  initialSpecialty,
  initialAudience,
}: {
  coach: {
    id: string;
    coach: string;
    specialties: string[];
    slotMin: number;
    priceFrom: number | null;
    trialPrice: number | null;
    hasSlots: boolean;
    /** PC 요약 판 머리 */
    org?: string;
    rating?: number | null;
    reviews?: number;
  };
  todayKey: string;
  days: string[];
  byDay: DaySlots[];
  initialSpecialty: string | null;
  initialAudience: AudienceKey | null;
}) {
  const [state, action] = useActionState<LessonState, FormData>(guardFormAction(requestBooking), undefined);
  const firstOpen = byDay.find((d) => d.slots.some((s) => !s.taken && !s.past))?.dateKey ?? todayKey;
  const [dateKey, setDateKey] = useState(firstOpen);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [specialty, setSpecialty] = useState<string | null>(initialSpecialty);
  const [audience, setAudience] = useState<AudienceKey | null>(initialAudience);
  const [pay, setPay] = useState<PayMethodKey>('card');
  const day = byDay.find((d) => d.dateKey === dateKey);

  if (state?.success)
    return (
      <Card className="space-y-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sky/12 text-2xl text-sky-strong">✓</span>
        <div>
          <p className="text-lg font-bold text-ink">요청을 보냈어요</p>
          <p className="mt-1 text-sm text-muted">
            {coach.coach} 코치가 확정하면 알림으로 알려 드려요. 보통 하루 안에 답이 와요.
          </p>
        </div>
        <ul className="mx-auto max-w-xs space-y-1 text-left text-sm text-ink">
          {picks.map((p, i) => (
            <li key={key(p)} className="flex gap-2">
              <span className="w-10 shrink-0 text-xs text-muted">{i === 0 ? '1순위' : '2순위'}</span>
              {Number(p.dateKey.slice(5, 7))}월 {Number(p.dateKey.slice(8))}일 ({WEEKDAYS[weekdayOf(p.dateKey)]}) {minToTime(p.startMin)}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/me#bookings" size="lg">
            내 예약 보기
          </ButtonLink>
          <Link href="/lessons" className="inline-flex min-h-12 items-center px-4 text-sm font-semibold text-muted">
            레슨 홈으로
          </Link>
        </div>
      </Card>
    );

  const toggle = (startMin: number) => {
    const p = { dateKey, startMin };
    const k = key(p);
    setPicks((list) => {
      if (list.some((x) => key(x) === k)) return list.filter((x) => key(x) !== k);
      if (list.length >= 2) return [list[0], p];
      return [...list, p];
    });
  };
  const price = coach.trialPrice ?? coach.priceFrom;
  const card = 'lg:rounded-2xl lg:border lg:border-line lg:bg-surface lg:p-5';
  const pickText = (p: Pick) =>
    `${Number(p.dateKey.slice(5, 7))}월 ${Number(p.dateKey.slice(8))}일 (${WEEKDAYS[weekdayOf(p.dateKey)]}) ${minToTime(p.startMin)}`;

  return (
    <form action={action} className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10 lg:space-y-0">
      <input type="hidden" name="orgId" value={coach.id} />
      {picks[0] && <input type="hidden" name="slot1" value={key(picks[0])} />}
      {picks[1] && <input type="hidden" name="slot2" value={key(picks[1])} />}
      {specialty && <input type="hidden" name="specialty" value={specialty} />}
      {audience && <input type="hidden" name="audience" value={audience} />}
      <input type="hidden" name="payMethod" value={pay} />

      <div className="space-y-6 lg:space-y-4">
      {/* ① 언제 */}
      <section className={`space-y-3 ${card}`}>
        <div>
          <h2 className="text-sm font-bold text-ink">① 언제 받을까요</h2>
          <p className="text-xs text-muted">
            {coach.hasSlots ? '코치가 연 시간이에요. ' : '코치가 시간을 따로 안 적어 넉넉히 열어 뒀어요. '}
            원하는 때를 둘까지 고르면 코치가 하나를 확정해요.
          </p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 lg:grid lg:grid-cols-7 lg:overflow-visible">
          {days.map((d) => {
            const on = d === dateKey;
            const wd = weekdayOf(d);
            const open = byDay.find((x) => x.dateKey === d)?.slots.some((s) => !s.taken && !s.past);
            const n = picks.filter((p) => p.dateKey === d).length;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDateKey(d)}
                aria-pressed={on}
                className={`relative flex min-w-14 shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-xs transition-colors ${
                  on ? 'border-ink bg-ink text-page' : open ? 'border-line bg-surface text-ink' : 'border-line bg-surface-2 text-muted/60'
                }`}
              >
                <span className={wd === 0 && !on ? 'text-danger' : wd === 6 && !on ? 'text-sky' : ''}>
                  {d === todayKey ? '오늘' : WEEKDAYS[wd]}
                </span>
                <span className="text-base font-bold">{Number(d.slice(8))}</span>
                {n > 0 && (
                  <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-ink text-[10px] text-white">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!day || day.slots.length === 0 ? (
          <p className="text-sm text-muted">이날은 쉬어요. 다른 날을 골라 주세요.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {day.slots.map((s) => {
              const off = s.taken || s.past;
              const idx = picks.findIndex((p) => p.dateKey === dateKey && p.startMin === s.startMin);
              const on = idx >= 0;
              return (
                <button
                  key={s.startMin}
                  type="button"
                  disabled={off}
                  onClick={() => toggle(s.startMin)}
                  aria-pressed={on}
                  className={`relative min-h-12 rounded-xl border text-sm font-semibold transition-colors ${
                    off
                      ? 'cursor-not-allowed border-line bg-surface-2 text-muted/50 line-through'
                      : on
                        ? 'border-ink bg-ink text-page'
                        : 'border-line bg-surface text-ink hover:border-sky-soft'
                  }`}
                >
                  {minToTime(s.startMin)}
                  <span className="block text-[10px] font-normal opacity-80">~{minToTime(s.endMin)}</span>
                  {on && (
                    <span className="absolute top-1 right-1 rounded-full bg-white/25 px-1 text-[10px]">{idx + 1}순위</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {picks.length > 0 && (
          <p className="flex flex-wrap gap-2 text-xs">
            {picks.map((p, i) => (
              <button
                key={key(p)}
                type="button"
                onClick={() => setPicks(picks.filter((x) => key(x) !== key(p)))}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-sky/10 px-3 font-semibold text-sky-strong"
              >
                {i + 1}순위 · {Number(p.dateKey.slice(5, 7))}/{Number(p.dateKey.slice(8))} {minToTime(p.startMin)} <span aria-hidden>×</span>
              </button>
            ))}
          </p>
        )}
      </section>

      {/* ② 무엇을 · 누가 */}
      <section className={`space-y-3 ${card}`}>
        <h2 className="text-sm font-bold text-ink">② 무엇을 · 누가</h2>
        <div className="flex flex-wrap gap-2">
          {(coach.specialties.length ? coach.specialties : SPECIALTIES.map((s) => s.key)).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={specialty === s}
              onClick={() => setSpecialty(specialty === s ? null : s)}
              className={`min-h-9 rounded-full border px-3.5 text-xs font-semibold ${specialty === s ? 'border-ink bg-ink text-page' : 'border-line bg-surface text-ink'}`}
            >
              {specialtyLabel(s)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={audience === a.key}
              onClick={() => setAudience(audience === a.key ? null : a.key)}
              className={`min-h-11 rounded-xl border px-3 text-left text-sm font-semibold ${audience === a.key ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line bg-surface text-ink'}`}
            >
              {a.label}
              <span className="block text-[11px] font-normal text-muted">{a.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ③ 한마디 */}
      <section className={`space-y-2 ${card}`}>
        <h2 className="text-sm font-bold text-ink">③ 코치에게 한마디 <span className="font-normal text-muted">(선택)</span></h2>
        <Textarea name="note" rows={3} maxLength={BOOKING_NOTE_MAX} placeholder="중2 투수, 구속보다 제구가 고민이에요. 싱커 기록 같이 봐 주세요." />
      </section>

      {/* ④ 결제 수단 */}
      <section className={`space-y-2 ${card}`}>
        <h2 className="text-sm font-bold text-ink">④ 결제 수단</h2>
        <div className="grid grid-cols-3 gap-2">
          {PAY_METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={pay === m.key}
              onClick={() => setPay(m.key)}
              className={`min-h-12 rounded-xl border px-2 text-sm font-semibold ${pay === m.key ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line bg-surface text-ink'}`}
            >
              {m.label}
              <span className="block text-[10px] font-normal text-muted">{m.hint}</span>
            </button>
          ))}
        </div>
        <p className="rounded-xl bg-sky/8 px-4 py-3 text-xs leading-relaxed text-ink">
          예상 레슨비 <b>{price != null ? formatPrice(price) : '문의'}</b>
          {coach.trialPrice != null && coach.priceFrom != null && ` (첫 레슨 체험가 · 다음부터 ${formatPrice(coach.priceFrom)})`}. 레슨이 끝나기 전에는 결제되지 않아요.
          카드 · 간편결제 연동은 준비 중이라 지금은 수단만 적어 둬요.
        </p>
      </section>

      {/* 보내기 — 휴대폰 · 패드(PC 는 오른쪽 판) */}
      <div className="space-y-6 lg:hidden">
        <FormError>{state?.error}</FormError>
        <Submit ready={picks.length > 0} coachName={coach.coach} />
      </div>
      </div>

      {/* PC 요약 판 */}
      <aside className="hidden lg:sticky lg:top-[calc(var(--dugout-bar-h)+1rem)] lg:block">
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-3">
            <CoachAvatar name={coach.coach} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{coach.coach} 코치</p>
              {coach.org && <p className="truncate text-xs text-muted">{coach.org}</p>}
              {coach.reviews != null && <Stars rating={coach.rating ?? null} reviews={coach.reviews} />}
            </div>
          </div>
          <dl className="space-y-3 border-t border-line pt-3 text-sm">
            <div>
              <dt className="text-xs text-muted">원하는 때</dt>
              <dd className="mt-1 space-y-1">
                {picks.length === 0 ? (
                  <span className="text-xs text-muted/80">왼쪽에서 둘까지 골라요</span>
                ) : (
                  picks.map((p, i) => (
                    <span key={key(p)} className="flex items-center gap-2 motion-safe:animate-row-in">
                      <span className="rounded-full bg-sky/10 px-2 py-0.5 text-[10px] font-bold text-sky-strong">{i + 1}순위</span>
                      <span className="font-semibold text-ink">{pickText(p)}</span>
                    </span>
                  ))
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-xs text-muted">무엇을 · 누가</dt>
              <dd className="text-right text-xs font-semibold text-ink">
                {[specialty ? specialtyLabel(specialty) : null, AUDIENCES.find((a) => a.key === audience)?.label].filter(Boolean).join(' · ') || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-xs text-muted">결제 수단</dt>
              <dd className="text-xs font-semibold text-ink">{PAY_METHODS.find((m) => m.key === pay)?.label}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="text-xs text-muted">예상 레슨비 · {coach.slotMin}분</dt>
              <dd className="text-lg font-black text-ink">{price != null ? formatPrice(price) : '문의'}</dd>
            </div>
          </dl>
          <FormError>{state?.error}</FormError>
          <Submit ready={picks.length > 0} coachName={coach.coach} />
          <p className="text-[11px] leading-relaxed text-muted">레슨이 끝나기 전에는 결제되지 않아요. 코치가 하나를 확정하면 알림으로 알려 드려요.</p>
        </div>
      </aside>
    </form>
  );
}

function Submit({ ready, coachName }: { ready: boolean; coachName: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || !ready} className="w-full">
      {pending ? '보내는 중…' : ready ? `${coachName} 코치에게 요청 보내기` : '원하는 때를 먼저 골라 주세요'}
    </Button>
  );
}
