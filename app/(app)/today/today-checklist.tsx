import Link from 'next/link';
import { Check, Circle, CircleDot } from 'lucide-react';

/**
 * 오늘 남은 일을 한 줄로.
 *
 * 기록률을 올리는 것이 이 앱에서 가장 값어치 있는 일이라(기록이 없으면 부하
 * 지수도 트레이닝도 돌지 않는다), 남은 일을 눈에 띄게 두는 것 자체가 기능이다.
 *
 * '운동'은 이제 트레이닝 화면에 있다. 홈에서 세 가지가 다 보여야 하는 이유가
 * 여기 있다 — 화면을 나눈 뒤로는, 다른 화면에 남은 일이 있다는 것을 알려주지
 * 않으면 하루가 끝난 줄 알고 닫아버린다. 그래서 눌러서 건너갈 수 있게 한다.
 */

type Step = {
  label: string;
  state: 'done' | 'todo' | 'partial';
  /** 'partial' 일 때 옆에 붙는 진행 표시 (3/8) */
  detail?: string;
  /** 다른 화면에 있는 일이면 건너갈 주소 */
  href?: string;
};

function Item({ step }: { step: Step }) {
  const tone =
    step.state === 'done'
      ? 'text-sky'
      : step.state === 'partial'
        ? 'text-ink'
        : 'text-muted';

  const inner = (
    <>
      {step.state === 'done' ? (
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      ) : step.state === 'partial' ? (
        <CircleDot className="h-3.5 w-3.5" />
      ) : (
        <Circle className="h-3.5 w-3.5" />
      )}
      {step.label}
      {step.detail && <span className="text-muted">{step.detail}</span>}
    </>
  );

  const className = `inline-flex items-center gap-1.5 whitespace-nowrap ${tone}`;

  return step.href ? (
    <Link href={step.href} className={`${className} underline-offset-4 hover:underline`}>
      {inner}
    </Link>
  ) : (
    <span className={className}>{inner}</span>
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
    {
      label: '운동',
      href: '/training',
      ...(exerciseTotal === 0
        ? { state: 'todo' as const }
        : exerciseDone >= exerciseTotal
          ? { state: 'done' as const }
          : {
              state: 'partial' as const,
              detail: `${exerciseDone}/${exerciseTotal}`,
            }),
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
