import { judgeThrowingOpen, type RehabConditionKey, type RehabSeverity, type SidePair } from '@/lib/armcare/rehab';
import { num } from '@/lib/armcare/rehab-test-draft';

/**
 * 투구 복귀표 열기 시험에 적는 것(가이드라인 9절 마지막 줄) — 웹(app/(app)/training/rehab-throwing.tsx)과 앱(native/src/app/rehab-throw-open.tsx ·
 * rehab-weekly.tsx)이 같이 쓴다. 칸은 글자 그대로 [다친 쪽, 반대쪽].
 */
export type ThrowingDraft = {
  push: [string, string];
  drop: [string, string];
  wall: [string, string];
  pain: number | null;
};

export const emptyThrowingDraft = (): ThrowingDraft => ({
  push: ['', ''],
  drop: ['', ''],
  wall: ['', ''],
  pain: null,
});

const pairOf = ([a, b]: [string, string]): SidePair | null => {
  const injured = num(a);
  const other = num(b);
  return injured == null || other == null ? null : { injured, other };
};

/** 판정 · 저장할 만큼 적었나 */
export function throwingFilled(d: ThrowingDraft, hasPlyo: boolean): boolean {
  return pairOf(d.push) != null && d.pain != null && (!hasPlyo || (pairOf(d.drop) != null && pairOf(d.wall) != null));
}

/** 적은 것 → 서버에 보낼 값(플라이오볼이 없으면 볼 드롭 · 벽 던지기는 null) */
export function throwingInput(d: ThrowingDraft, hasPlyo: boolean) {
  return {
    push: pairOf(d.push)!,
    drop: hasPlyo ? pairOf(d.drop) : null,
    wall: hasPlyo ? pairOf(d.wall) : null,
    pain: d.pain ?? 0,
  };
}

/** 지금 적은 것으로 연다면 — 화면에서 미리 판정한다(서버가 다시 본다) */
export function judgeThrowingDraft(
  view: { severity: RehabSeverity; painFreeBallDays: number; daysSinceStart: number; condition: RehabConditionKey | null; hasPlyo: boolean },
  d: ThrowingDraft,
  normalPct: number,
  confidence: number
) {
  return judgeThrowingOpen({
    severity: view.severity,
    painFreeBallDays: view.painFreeBallDays,
    daysSinceStart: view.daysSinceStart,
    condition: view.condition,
    hasPlyo: view.hasPlyo,
    ...throwingInput(d, view.hasPlyo),
    normalPct,
    confidence,
  });
}
