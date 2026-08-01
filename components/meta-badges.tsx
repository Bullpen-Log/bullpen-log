import { Dumbbell, Flame, Target, TrendingUp } from 'lucide-react';

/** 강도별 색. 문자열을 그대로 써야 Tailwind가 클래스를 찾아낸다. */
const INTENSITY_STYLE: Record<string, string> = {
  낮음: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  중간: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  높음: 'border-red-500/40 bg-red-500/10 text-red-300',
};

const baseChip =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] leading-none';
const plainChip = `${baseChip} border-line-strong bg-surface-2 text-muted`;

/** 운동 카드에 붙는 분류 배지 */
export function ExerciseBadges({
  bodyParts,
  intensity,
  difficulty,
  equipment,
}: {
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`${baseChip} ${INTENSITY_STYLE[intensity] ?? 'border-line-strong bg-surface-2 text-muted'}`}
        title="운동 강도"
      >
        <Flame className="h-3 w-3" />
        강도 {intensity}
      </span>

      {difficulty && (
        <span className={plainChip} title="난이도">
          <TrendingUp className="h-3 w-3" />
          {difficulty}
        </span>
      )}

      {bodyParts.map((part) => (
        <span key={part} className={plainChip} title="목표 부위">
          <Target className="h-3 w-3" />
          {part}
        </span>
      ))}

      {equipment.map((item) => (
        <span key={item} className={plainChip} title="필요 장비">
          <Dumbbell className="h-3 w-3" />
          {item}
        </span>
      ))}
    </div>
  );
}

/** 드릴 카드에 붙는 분류 배지 */
export function DrillBadges({
  focusPoints,
  equipment,
}: {
  focusPoints: string[];
  equipment: string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {focusPoints.map((point) => (
        <span
          key={point}
          className={`${baseChip} border-gold-dim/50 bg-gold/10 text-gold`}
          title="교정 포인트"
        >
          <Target className="h-3 w-3" />
          {point}
        </span>
      ))}

      {equipment.map((item) => (
        <span key={item} className={plainChip} title="필요 장비">
          <Dumbbell className="h-3 w-3" />
          {item}
        </span>
      ))}
    </div>
  );
}
