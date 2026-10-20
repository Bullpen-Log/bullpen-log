import { requireUser } from '@/lib/dal';
import { isBattingHand, isPosition, type BattingHand, type Position } from '@/lib/position';
import { HittingSetupForm } from './hitting-setup-form';

/**
 * 타격 시작하기 — 타격 칸이 잠긴 사람(hitSetupAt 없음)이 여기로 온다(lib/feature-locks.ts, 2026-10-20 D2).
 * 포지션 · 치는 손 둘만 묻는다. 투구를 이미 쓰는 사람은 '투타 겸업'을 미리 골라 둔다.
 */
export default async function HittingSetupPage() {
  const user = await requireUser();
  const position: Position = isPosition(user.position)
    ? user.position
    : user.pitchSetupAt
      ? 'two-way'
      : 'hitter';
  const battingHand: BattingHand | null = isBattingHand(user.battingHand) ? user.battingHand : null;
  return (
    <HittingSetupForm
      done={user.hitSetupAt !== null}
      initialPosition={position}
      initialHand={battingHand}
    />
  );
}
