import { CalendarClock } from 'lucide-react';
import { OpenCheckinButton } from '@/components/notice-bell';
import type { Outing } from '@/lib/engine/outing';
import { outingLineOf } from '@/lib/outing-line';

/**
 * 다음 등판 한 줄 — 트레이닝 일정 카드 위(트레이닝 추천 2판 P4 커밋 H, 2026-10-12).
 *
 * '다음 등판까지 3일' 밑에 바로 일정 카드의 '오늘은 보조·코어 데이'가 와서 둘이 한 문장으로 읽힌다 — 오늘이 등판 주기의 어디이고 그래서
 * 오늘 무엇을 하는지. 글과 판단은 lib/outing-line.ts(순수, 자체 시험이 본다), 자료는 오늘 상태 한 장의 등판 칸(lib/engine/outing.ts
 * outingOf 그대로)이라 조회가 늘지 않는다.
 *
 * 달력 · 같은 요일로 짐작한 등판이면 '달력으로 추정' · '요일로 추정'을 밑에 작은 둘째 줄로 붙이고 오른쪽에 '바꾸기'를 둔다 — 누르면 체크인 창이 열린다
 * (components/notice-bell.tsx OpenCheckinButton). 짐작이 틀렸으면 던지는 일정을 적으면 답이 짐작을 이긴다. 체크인 답으로 아는 날은 사용자가
 * 적은 것이라 붙이지 않는다. 다음 등판을 모르면 아무것도 안 그린다.
 *
 * 서버 부품이다(클라이언트 상태 없음). '바꾸기' 단추만 클라이언트 부품이다.
 *
 * '추정'을 둘째 줄에 두는 까닭(2판 P4 검토): 한 줄에 이어 붙이면 좁은 폰(320px)에서 글 칸이 161px 라 뒤의 '추정'부터 잘려, 짐작한 날이
 * 사실처럼 보였다(375px 도 여유 0px). 둘째 줄은 자르지 않는다 — 짐작이라는 표시가 늘 보이게.
 */
export function OutingLine({
  outing,
  dayLabel = null,
}: {
  outing: Pick<Outing, 'daysUntilNext' | 'nextSource'>;
  /** 오늘 날의 이름(예: '보조·코어 데이') — 바로 밑에 일정 카드가 그 이름을 크게 말하는 자리(트레이닝)에서는 안 넘긴다 */
  dayLabel?: string | null;
}) {
  const line = outingLineOf(outing);
  if (!line) return null;
  return (
    <div
      className={`flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-surface py-1.5 pl-(--block-pad) text-sm desk:min-h-11 ${line.guess ? 'pr-1.5' : 'pr-(--block-pad)'}`}
    >
      <CalendarClock aria-hidden className="h-4 w-4 shrink-0 text-sky" />
      <p className="min-w-0 flex-1">
        <span className="block truncate">
          <span className="font-semibold text-ink">{line.main}</span>
          {dayLabel && <span className="text-muted"> · 오늘은 {dayLabel}</span>}
        </span>
        {line.guess && (
          <span className="block text-xs break-keep text-muted">{line.guess}</span>
        )}
      </p>
      {line.guess && (
        <OpenCheckinButton className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-sky-strong transition-colors hover:bg-sky/10 desk:min-h-8">
          바꾸기
        </OpenCheckinButton>
      )}
    </div>
  );
}
