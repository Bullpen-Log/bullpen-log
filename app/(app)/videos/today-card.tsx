'use client';

import { Plus } from '@/components/icon';
import { Card, ButtonLink } from '@/components/ui';
import { LinkPending } from '@/components/link-pending';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { ArmStatusNote } from '@/components/arm-status-note';
import type { ArmStatus } from '@/lib/report/arm-status';
import { ThrowPlanCard, type ThrowCardData } from './throw-plan-card';

export type TodayCardData = {
  /** 지금 팔 상태(lib/report/arm-status.ts armStatusOf — app/(app)/videos/page.tsx) */
  status: ArmStatus;
  /** 오늘 남긴 기록 — 없으면 null */
  logged: { pitches: number } | null;
  /** 오늘 구속 측정 중 아직 투구 기록으로 안 남긴 공 수 — 없으면 null(2026-10-16, 측정은 별개 기록) */
  unloggedVelocity?: number | null;
};

/**
 * 투구 탭 맨 위 '오늘' 카드(2026-10-14 김민: 홈 · 트레이닝처럼 단순하게, 핵심만) — 지금 팔 상태(위험 · 주의 · 안전), 던지는 일정 질문(접힌 알약),
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
      <ArmStatusNote status={data.status} bare />
      <ThrowPlanCard day={today} data={throwCard} folded />
      {data.unloggedVelocity ? (
        <p className="text-footnote text-muted">
          구속 측정 {data.unloggedVelocity}구가 아직 투구 기록에 없어요. 남겨야 팔 부하에 들어가요.
        </p>
      ) : null}
      <ButtonLink
        href={`/pitch-log/${today}`}
        transitionTypes={OPEN_POPUP_TYPES}
        size="lg"
        className="w-full pad:w-auto pad:px-6 desk:min-h-10 desk:w-auto desk:px-5 desk:text-sm"
      >
        <LinkPending className="h-4 w-4">
          <Plus aria-hidden className="h-4 w-4" />
        </LinkPending>
        {data.unloggedVelocity
          ? `측정한 ${data.unloggedVelocity}구 기록 남기기`
          : data.logged
            ? `오늘 ${data.logged.pitches}구 · 기록 더하기`
            : '오늘 기록 남기기'}
      </ButtonLink>
    </Card>
  );
}
