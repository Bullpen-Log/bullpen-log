/** 그림·표시 문구 전용 5단계. 저장 점수와 추천·통증 확인 문턱은 lib/checkin.ts를 그대로 쓴다. */
export const CONDITION_VISUAL_STAGES = [
  {
    key: 'very-low',
    label: '많이 힘들어요',
    shortLabel: '많이 힘듦',
    min: 1,
    max: 2,
    tone: 'text-warn',
  },
  {
    key: 'low',
    label: '안 좋아요',
    shortLabel: '안 좋음',
    min: 3,
    max: 4,
    tone: 'text-warn',
  },
  {
    key: 'normal',
    label: '보통이에요',
    shortLabel: '보통',
    min: 5,
    max: 7,
    tone: 'text-muted',
  },
  {
    key: 'good',
    label: '좋아요',
    shortLabel: '좋음',
    min: 8,
    max: 9,
    tone: 'text-sky',
  },
  {
    key: 'excellent',
    label: '아주 좋아요',
    shortLabel: '아주 좋음',
    min: 10,
    max: 10,
    tone: 'text-sky',
  },
] as const;

export type ConditionVisualLevel = (typeof CONDITION_VISUAL_STAGES)[number]['key'];

export function conditionVisualStage(score?: number | null) {
  const value =
    typeof score === 'number' && Number.isFinite(score)
      ? Math.max(1, Math.min(10, score))
      : 6;
  return (
    CONDITION_VISUAL_STAGES.find((stage) => value >= stage.min && value <= stage.max) ??
    CONDITION_VISUAL_STAGES[2]
  );
}
