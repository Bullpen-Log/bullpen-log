import { ChevronDown, CircleCheck } from 'lucide-react';
import { startWorkout } from '@/app/actions/workout';

export type DoneLine = {
  id: string;
  title: string;
  /** '4세트 · 10회 · 25kg' — lib/workout/summarize.ts 의 formatSummary */
  text: string;
};

/**
 * 운동을 마친 날, [운동 시작] 자리에 서는 카드.
 *
 * 마치고 트레이닝으로 돌아오면 화면이 시작 전과 똑같았다. 맨 위에 [운동
 * 시작]이 그대로 있어 한 것이 없는 것처럼 보였고, 오늘 든 무게와 횟수는
 * 화면 어디에도 없었다 — 체크 목록의 '지난번' 줄은 오늘 것을 일부러 빼고
 * 보여주기 때문이다 (lib/report/exercise-recent.ts).
 *
 * 그래서 마친 날에는 맨 위가 '오늘 한 것'이 된다. 숫자와 줄은 종료 요약과
 * 같은 함수로 만든다 — 방금 본 요약과 여기 숫자가 다르면 어느 쪽을 믿을지
 * 모른다.
 *
 * [운동 더 하기]는 작게 남긴다. 저녁에 코어를 더 하는 식으로 같은 판을 다시
 * 열 수 있다. 다시 열면 워밍업은 건너뛰고, 운동 시간은 앞 구간에 더해진다.
 */
export function DoneCard({
  minutes,
  sets,
  volumeKg,
  intensity,
  lines,
  canResume,
}: {
  minutes: number;
  sets: number;
  volumeKg: number;
  /** 종료할 때 고른 강도. 트레이닝 화면에서 고쳤으면 그 값이다. */
  intensity: number | null;
  lines: DoneLine[];
  /** 통증을 입력한 날처럼 목록이 멈춘 날에는 다시 열 수 없다 */
  canResume: boolean;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-sky bg-sky-tint px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[15px] font-bold text-sky-strong">
          <CircleCheck aria-hidden className="h-5 w-5" />
          오늘 운동 완료
        </p>
        {intensity != null && (
          <span className="text-xs font-semibold text-sky-strong">
            강도 {intensity}/10
          </span>
        )}
      </div>

      {/* 종료 요약과 같은 세 숫자, 같은 순서 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '운동 시간', value: `${minutes}`, unit: '분' },
          { label: '총 세트', value: `${sets}`, unit: '세트' },
          {
            label: '총 볼륨',
            value: volumeKg > 0 ? volumeKg.toLocaleString('ko-KR') : '—',
            unit: volumeKg > 0 ? 'kg' : '',
          },
        ].map((n) => (
          <div key={n.label} className="rounded-xl bg-surface px-2 py-2.5 text-center">
            <p className="text-[11px] text-muted">{n.label}</p>
            <p className="mt-0.5 text-display text-xl text-ink">
              {n.value}
              <span className="ml-0.5 text-xs font-normal text-muted">{n.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {lines.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl bg-surface px-3">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                {l.title}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{l.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface px-3 py-3 text-center text-xs text-muted">
          남긴 세트 없이 마쳤습니다.
        </p>
      )}

      {canResume && (
        <form action={startWorkout}>
          <button
            type="submit"
            className="w-full py-1 text-xs font-medium text-muted underline underline-offset-2 transition-colors hover:text-sky"
          >
            운동 더 하기
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * 마친 날에는 체크 목록을 접어 둔다.
 *
 * 위 카드가 오늘 한 것을 숫자까지 보여주므로, 같은 운동이 체크 표시로 한 번
 * 더 길게 늘어서면 스크롤만 길어진다. 지우지는 않는다 — 빠뜨린 운동을 앱
 * 없이 하고 나서 체크하거나, 운동을 더할 때 여기서 한다.
 *
 * 마치기 전에는 그대로 편다. 그때는 이 목록이 오늘 할 일이다.
 */
export function DoneFold({
  folded,
  count,
  children,
}: {
  folded: boolean;
  count: number;
  children: React.ReactNode;
}) {
  if (!folded) return <>{children}</>;
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden
          className="h-4 w-4 text-muted transition-transform group-open:rotate-180"
        />
        오늘 목록 보기
        <span className="ml-auto text-xs font-normal text-muted">{count}개</span>
      </summary>
      <div className="border-t border-line p-3">{children}</div>
    </details>
  );
}
