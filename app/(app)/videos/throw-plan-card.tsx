'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { THROW_PLANS } from '@/lib/checkin';
import { setThrowPlan } from '@/app/actions/day-cards';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { Chip, DayCard } from '@/components/day-card';
import { OpenCheckinButton } from '@/components/notice-bell';
import { buzz } from '@/lib/haptics';
import { Button } from '@/components/ui';

export type ThrowCardData = {
  /** 오늘 체크인 줄의 던지는 일정 — 없으면 null */
  plan: string | null;
  /** 오늘 체크인이 있나 — 없으면 저장할 줄이 없어 먼저 체크인을 청한다 */
  hasCheckin: boolean;
  /** 달력에 오늘 · 내일 등판이 있으면 미리 골라 둘 답('오늘 등판' · '내일 등판') */
  hint: string | null;
};

/**
 * 투구 기록 탭 — '오늘 던지는 일정은요?' 카드(체크인 3판, 2026-10-13 — 사용자: "투구 탭에 진입했을 때 투구 체크인에서").
 *
 * 2판까지 체크인에 있던 던지는 일정 답의 새 집. 칸은 체크인 줄 그대로(DailyCheckin.throwPlan, app/actions/day-cards.ts setThrowPlan) —
 * 매일 일정 · 투구 계획 · 프로그램 · 영양 가이드 · 암케어가 모두 그 줄을 읽는다. '모름'(나중에)은 저장하지 않고 오늘 하루 접어 둔다.
 */
export function ThrowPlanCard({
  day,
  data,
  folded = false,
}: {
  day: string;
  data: ThrowCardData;
  /** 접힌 알약으로 시작 — 투구 탭 '오늘' 카드 안(2026-10-14 핵심만) */
  folded?: boolean;
}) {
  return (
    <DayCard
      storageKey="throw"
      day={day}
      title="오늘 던지는 일정은요?"
      hint="등판 · 불펜 날은 운동 일정 · 끼니 · 암케어가 거기에 맞춰요."
      answer={data.plan}
      laterLabel="모름"
      folded={folded}
    >
      {(close) => <PlanForm day={day} data={data} onDone={close} />}
    </DayCard>
  );
}

function PlanForm({
  day,
  data,
  onDone,
}: {
  day: string;
  data: ThrowCardData;
  onDone: () => void;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<string | null>(data.plan ?? data.hint);
  const [error, setError] = useState<string | null>(null);
  const [needCheckin, setNeedCheckin] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const r = await orOffline(setThrowPlan({ date: day, plan }), {
        ok: false as const,
        error: OFFLINE_MESSAGE,
      });
      if (!r.ok) {
        setError(r.error);
        setNeedCheckin('needCheckin' in r && r.needCheckin === true);
        return;
      }
      buzz(20);
      router.refresh();
      onDone();
    });

  return (
    <div className="space-y-3">
      <div className="chip-grid flex flex-wrap gap-2" data-cols="3">
        {THROW_PLANS.map((p) => (
          <Chip
            key={p}
            pressed={plan === p}
            onClick={() => setPlan(plan === p ? null : p)}
          >
            {p}
          </Chip>
        ))}
      </div>
      {data.hint && data.plan == null && (
        <p className="text-xs text-muted">달력에 등판 일정이 있어 미리 골라 뒀어요.</p>
      )}
      {error && (
        <p className="text-xs text-danger">
          {error}
          {(needCheckin || !data.hasCheckin) && (
            <>
              {' '}
              <OpenCheckinButton className="font-semibold text-sky-strong underline underline-offset-2">
                체크인하기
              </OpenCheckinButton>
            </>
          )}
        </p>
      )}
      <Button
        type="button"
        disabled={pending || plan == null}
        onClick={save}
        className="w-full pad:w-auto pad:px-6 desk:min-h-10 desk:w-auto"
      >
        {pending ? '저장 중…' : '저장'}
      </Button>
    </div>
  );
}
