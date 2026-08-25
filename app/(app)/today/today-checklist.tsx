import { Check, Circle, CircleDot } from 'lucide-react';

/**
 * 오늘 남은 일을 한 줄로.
 *
 * 이 화면은 체크인·투구 기록·운동이 모두 들어와 길다. 스크롤을 내리기 전에
 * 무엇이 남았는지 보이지 않으면, 다 한 줄 알고 닫아버리기 쉽다.
 *
 * 기록률을 올리는 것이 이 앱에서 가장 값어치 있는 일이라(기록이 없으면 부하
 * 지수도 트레이닝도 돌지 않는다), 남은 일을 눈에 띄게 두는 것 자체가 기능이다.
 */

type Step =
  | { label: string; state: 'done' | 'todo' }
  | { label: string; state: 'partial'; detail: string };

function Item({ step }: { step: Step }) {
  const tone =
    step.state === 'done'
      ? 'text-sky'
      : step.state === 'partial'
        ? 'text-ink'
        : 'text-muted';

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${tone}`}>
      {step.state === 'done' ? (
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      ) : step.state === 'partial' ? (
        <CircleDot className="h-3.5 w-3.5" />
      ) : (
        <Circle className="h-3.5 w-3.5" />
      )}
      {step.label}
      {step.state === 'partial' && (
        <span className="text-muted">{step.detail}</span>
      )}
    </span>
  );
}

export function TodayChecklist({
  checkedIn,
  recorded,
  exerciseTotal,
  exerciseDone,
}: {
  checkedIn: boolean;
  /** 오늘 투구 기록(쉬는 날 포함)을 남겼는가 */
  recorded: boolean;
  /** 오늘 일정의 운동 수. 아직 안 만들었으면 0 */
  exerciseTotal: number;
  exerciseDone: number;
}) {
  const steps: Step[] = [
    { label: '체크인', state: checkedIn ? 'done' : 'todo' },
    { label: '투구 기록', state: recorded ? 'done' : 'todo' },
    exerciseTotal === 0
      ? { label: '운동', state: 'todo' }
      : exerciseDone >= exerciseTotal
        ? { label: '운동', state: 'done' }
        : {
            label: '운동',
            state: 'partial',
            detail: `${exerciseDone}/${exerciseTotal}`,
          },
  ];

  const allDone = steps.every((s) => s.state === 'done');

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-5 py-3">
      <span className="text-sm font-bold text-ink">오늘</span>
      {steps.map((s) => (
        <Item key={s.label} step={s} />
      ))}
      {allDone && (
        <span className="text-xs font-semibold text-sky">
          오늘 할 일을 모두 마쳤습니다 👏
        </span>
      )}
    </div>
  );
}
