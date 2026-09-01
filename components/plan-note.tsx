/**
 * 오늘 던질 양 — 계획 한 칸.
 *
 * 홈의 '오늘 투구' 창에만 있던 것을 꺼냈다. 투구 일지에서 달력 날짜를 눌러
 * 남길 때는 견줄 것이 화면에 없어서, 계획을 지켰는지 알려면 홈으로 건너갔다
 * 돌아와야 했다.
 *
 * 오늘 기록을 넣기 전 기준으로 낸 계획을 보여준다. 넣고 나서 다시 계산하면
 * 던진 그 순간 '휴식'으로 바뀌는데(이미 던졌으니 더 쉬라는 뜻이다), 방금 남긴
 * 45구 옆에 "오늘 계획: 휴식"이 있으면 서로 어긋나 보인다.
 */
export type PlanNoteData = {
  throwing: boolean;
  /** '40~60구'. 쉬는 날로 잡힌 계획에는 빈 문자열이다. */
  pitches: string;
  /** '강도 6~8' */
  intensity: string;
  /** 왜 이 계획인지 한 줄 */
  reason: string;
};

export function PlanNote({ plan }: { plan: PlanNoteData }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <p className="text-xs font-medium tracking-normal text-sky">오늘 계획</p>
      <p className="mt-1 text-sm font-semibold text-ink">
        {plan.throwing ? `${plan.pitches} · ${plan.intensity}` : '휴식'}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{plan.reason}</p>
    </div>
  );
}
