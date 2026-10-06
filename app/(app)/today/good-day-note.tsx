import { ChevronDown } from 'lucide-react';
import { dateKeyLabel } from '@/lib/pitch-stats';

/**
 * '지난번 잘 던진 날 남긴 말' — 오늘 던지는 날, 던지기 전에 홈에 띄운다(잘 던진 날 찾기 2단계).
 *
 * 만족도가 높았던 날(GOOD_DAY_MIN 이상) 선수가 스스로 적은 메모가 다음 투구 전의 가장 좋은 신호다 — 통계가
 * 쌓이기 전(평가 몇 번)부터 쓸모가 있다. 겉은 메모 한 줄, 누르면 그날 · 종류 · 만족도 · 메모 전체 · 좋았던 것.
 * 언제 띄우는지 · 어떤 메모를 고르는지는 홈(page.tsx)이 정한다.
 */
export function GoodDayNote({
  date,
  sessionType,
  satisfaction,
  memo,
  cuesGood,
}: {
  /** 'YYYY-MM-DD' */
  date: string;
  sessionType: string;
  satisfaction: number;
  memo: string;
  cuesGood: string[];
}) {
  return (
    <details className="group rounded-2xl border border-sky-soft/60 bg-sky-tint">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 p-(--block-pad) [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-sky-strong">
            지난번 잘 던진 날 남긴 말
          </span>
          <span className="mt-1 block truncate text-sm text-ink group-open:hidden">
            {memo}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-sky transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="-mt-2 space-y-2 px-(--block-pad) pb-(--block-pad)">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{memo}</p>
        <p className="text-xs text-muted">
          {dateKeyLabel(date)} · {sessionType} · 만족도 {satisfaction}/5
          {cuesGood.length > 0 && <> · 좋았던 것 {cuesGood.join(' · ')}</>}
        </p>
      </div>
    </details>
  );
}
