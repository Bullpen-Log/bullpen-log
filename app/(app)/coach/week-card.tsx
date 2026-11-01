import { Card } from '@/components/ui';
import { loadCoachWeek } from '@/app/actions/coach';
import { WEEKDAY_LABELS, slotLine } from '@/lib/coach/answers';
import type { DaySlot } from '@/lib/coach/week';
import type { SlotState } from '@/lib/coach/status';
import type { WeekReview } from '@/lib/coach/review';
import { Check } from '@/components/icon';

/**
 * 이번 주 코치 틀 — PC 웹은 읽기만(docs/designs/ai-coach.md U33). 시작 · 조정은 앱(native/src/app/coach-start.tsx · 코치 탭)에서.
 * 칸 글은 앱 코치 탭과 같은 `slotLine`. 유료가 아니면 page.tsx 가 소개를 먼저 그려 여기 오지 않는다.
 */
export async function CoachWeekCard() {
  const { today, week, states, review } = await loadCoachWeek();
  return <CoachWeekView today={today} week={week} states={states} review={review} />;
}

export function CoachWeekView({
  today,
  week,
  states,
  review,
}: {
  today?: string;
  week: DaySlot[] | null;
  states?: SlotState[] | null;
  review?: WeekReview | null;
}) {
  if (!week) {
    return (
      <Card className="p-(--block-pad)">
        <p className="text-sm text-muted">코치는 앱에서 시작해요. 시작하면 이번 주 일정이 여기 보여요.</p>
      </Card>
    );
  }
  return (
    <Card className="p-(--block-pad)">
      {review ? (
        <div className="mb-4 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-semibold text-ink">돌아보기 · {review.planned ? `${review.done} / ${review.planned}일` : '쉬어 간 주'}</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {review.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-base font-semibold text-ink">이번 주</p>
      <ul className="mt-3 divide-y divide-line">
        {week.map((s, k) => {
          const isToday = s.date === today;
          return (
            <li key={s.date} className="flex items-baseline gap-3 py-2 text-sm" aria-current={isToday ? 'date' : undefined}>
              <span className={isToday ? 'w-8 shrink-0 font-semibold text-sky' : 'w-8 shrink-0 text-muted'}>{isToday ? '오늘' : WEEKDAY_LABELS[k]}</span>
              <span className={isToday ? 'flex-1 font-semibold text-ink' : states?.[k] === 'missed' ? 'flex-1 text-muted' : 'flex-1 text-ink'}>{slotLine(s)}</span>
              {states?.[k] === 'done' ? <Check className="size-4 shrink-0 self-center text-sky" aria-label="한 날" /> : null}
              {states?.[k] === 'missed' ? <span className="shrink-0 text-xs text-muted">못 함</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">시작 · 조정은 앱에서 해요. 그날 운동은 몸 상태를 보고 만들어요.</p>
    </Card>
  );
}
