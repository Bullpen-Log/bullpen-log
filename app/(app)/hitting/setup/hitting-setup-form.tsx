'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { StepCard } from '@/components/onboarding/step-card';
import { OptionCards } from '@/components/onboarding/choices';
import { Button } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import { orOffline } from '@/lib/action-offline';
import { haptic } from '@/lib/haptics';
import { finishHittingSetup } from '@/app/actions/hitting-setup';
import { FEATURE_HOME } from '@/lib/feature-locks';
import {
  BATTING_HAND_LABEL,
  BATTING_HANDS,
  POSITION_LABEL,
  POSITIONS,
  type BattingHand,
  type Position,
} from '@/lib/position';

const POSITION_HINT: Record<Position, string> = {
  pitcher: '투구가 주예요. 타격은 가끔 적어요.',
  hitter: '타격만 해요. 투구 칸은 비워 둬요.',
  'two-way': '둘 다 해요. 운동은 하루 한 번으로 묶어요.',
};

export function HittingSetupForm({
  done,
  initialPosition,
  initialHand,
}: {
  done: boolean;
  initialPosition: Position;
  initialHand: BattingHand | null;
}) {
  const router = useRouter();
  const [position, setPosition] = useState<Position>(initialPosition);
  const [hand, setHand] = useState<BattingHand | null>(initialHand);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    if (!hand) {
      setError('치는 손을 골라 주세요.');
      return;
    }
    setError(null);
    start(async () => {
      const r = await orOffline(finishHittingSetup({ position, battingHand: hand }), {
        ok: false as const,
        error: '신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.',
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      haptic('success');
      router.push(FEATURE_HOME.hit);
    });
  };

  return (
    <StepCard
      title={done ? '타격 설정' : '타격 시작하기'}
      desc="두 가지만 고르면 바로 시작해요."
      titleKey="hitting-setup"
      brand={null}
      footer={
        <Button size="lg" className="w-full pad:w-auto" onClick={save} disabled={pending}>
          {pending ? '저장하는 중…' : done ? '저장하기' : '시작하기'}
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <p className="text-sm font-semibold text-ink">포지션</p>
          <OptionCards
            name="position"
            label="포지션"
            columns={1}
            value={position}
            onChange={setPosition}
            options={POSITIONS.map((p) => ({
              value: p,
              label: POSITION_LABEL[p],
              hint: POSITION_HINT[p],
            }))}
          />
        </section>
        <section className="space-y-2">
          <p className="text-sm font-semibold text-ink">치는 손</p>
          <OptionCards
            name="battingHand"
            label="치는 손"
            value={hand}
            onChange={setHand}
            invalid={error !== null && !hand}
            options={BATTING_HANDS.map((h) => ({ value: h, label: BATTING_HAND_LABEL[h] }))}
          />
        </section>
        {error && <ErrorLine>{error}</ErrorLine>}
      </div>
    </StepCard>
  );
}
