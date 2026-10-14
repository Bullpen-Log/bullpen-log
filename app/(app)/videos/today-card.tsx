'use client';

import Link from 'next/link';
import { Plus } from '@/components/icon';
import { Card } from '@/components/ui';
import { LinkPending } from '@/components/link-pending';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { ThrowPlanCard, type ThrowCardData } from './throw-plan-card';

export type TodayCardData = {
  /** 오늘 계획 한 줄 · 까닭 — 계획이 없으면 null(app/(app)/videos/page.tsx) */
  plan: { line: string; sub: string | null } | null;
  /** 오늘 남긴 기록 — 없으면 null */
  logged: { pitches: number } | null;
};

/**
 * 투구 탭 맨 위 '오늘' 카드(2026-10-14 김민: 홈 · 트레이닝처럼 단순하게, 핵심만) — 오늘 계획 한 줄, 던지는 일정 질문(접힌 알약),
 * 오늘 기록 남기기 단추 하나. 예전엔 제목 옆 [+] · 따로 선 던지는 일정 카드 · 고르개 밑 알약 줄이 흩어져 있었다.
 */
export function TodayCard({
  today,
  data,
  throwCard,
}: {
  today: string;
  data: TodayCardData;
  throwCard: ThrowCardData;
}) {
  return (
    <Card className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-xs text-muted">오늘</p>
        <p className="text-base font-semibold text-ink break-keep">
          {data.plan?.line ?? '오늘 던진 것을 남겨요'}
        </p>
        {data.plan?.sub && (
          <p className="text-xs leading-relaxed text-muted break-keep">{data.plan.sub}</p>
        )}
      </div>
      <ThrowPlanCard day={today} data={throwCard} folded />
      <Link
        href={`/pitch-log/${today}`}
        transitionTypes={OPEN_POPUP_TYPES}
        className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full bg-sky text-[15px] font-semibold text-white transition-opacity active:opacity-60 desk:inline-flex desk:min-h-10 desk:w-auto desk:rounded-xl desk:px-5 desk:text-sm"
      >
        <LinkPending className="h-4 w-4">
          <Plus aria-hidden className="h-4 w-4" />
        </LinkPending>
        {data.logged ? `오늘 ${data.logged.pitches}구 · 기록 더하기` : '오늘 기록 남기기'}
      </Link>
    </Card>
  );
}
