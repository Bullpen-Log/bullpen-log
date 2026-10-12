'use client';

import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Segmented } from '@/components/segmented';
import { haptic } from '@/lib/haptics';
import { MAX_EFFORT_PCT, MIN_EFFORT_PCT } from '@/lib/pitch-stats';
import { EFFORT_CHIPS, EFFORT_MISSING_ERROR, stepEffortPct } from '@/lib/pitch-effort';

/**
 * 투구 체감 강도(%) 고르기 — 칩 여섯(50 · 60 · 70 · 80 · 90 · 100%) + 고른 뒤 −/+ 5% 로 사이 값(트레이닝 추천 2판 D2, 2026-10-12).
 *
 * 왜 이 모양인가.
 *   - 예전 1~10 막대는 기본값 5 에서 시작해, 운영 기록의 3분의 2가 손대지 않은 5 였다(설계 문서 ②). 그래서 기본값을 두지 않는다 —
 *     아무것도 안 고른 채로 열리고, 저장하기 전에 한 번은 골라야 한다(부르는 쪽이 invalid 로 알린다).
 *   - 막대는 아이폰에서 손잡이를 잡아야만 움직였다. 칩은 한 번 누르면 끝이다. 고르개 모양은 같은 폼의 만족도와 같은 Segmented
 *     (회색 바탕 위 흰 칸이 미끄러진다)라 한 화면에 고르는 모양이 둘로 갈리지 않는다.
 *   - 85% 처럼 칩 사이 값은 −/+ 로 맞춘다. 그때는 칩이 모두 비고 오른쪽 숫자만 85% 를 보인다. 칩을 고르기 전에는 −/+ 를 감춘다
 *     (어디서부터 5% 인지가 없다). 50% 밑(캐치볼 몸풀기)도 − 로 내려간다 — 5% 까지.
 *
 * 값은 숫자(%)로 쥐고, 저장 규칙(5~100 · 5% 칸 · intensity 같이)은 lib/pitch-effort.ts 가 서버에서 한 번 더 본다.
 */

const OPTIONS = EFFORT_CHIPS.map((pct) => ({ value: String(pct), label: `${pct}%` }));

/** 저장을 막았을 때 그 자리로 — 칩 묶음의 첫 칸에 초점을 보내면 화면도 거기로 굴러간다 */
export function focusEffortChips(id: string) {
  document
    .getElementById(id)
    ?.querySelector<HTMLButtonElement>('[role="radio"]')
    ?.focus();
}

function StepButton({
  dir,
  value,
  onChange,
}: {
  dir: 1 | -1;
  value: number;
  onChange: (pct: number) => void;
}) {
  const atEdge = dir < 0 ? value <= MIN_EFFORT_PCT : value >= MAX_EFFORT_PCT;
  const Icon = dir < 0 ? Minus : Plus;
  return (
    <button
      type="button"
      disabled={atEdge}
      aria-label={dir < 0 ? '체감 강도 5% 낮추기' : '체감 강도 5% 높이기'}
      onClick={() => {
        haptic('selection');
        onChange(stepEffortPct(value, dir));
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink/6 text-ink transition-colors active:bg-ink/12 disabled:opacity-35 desk:h-8 desk:w-8 desk:hover:bg-ink/10"
    >
      <Icon aria-hidden className="h-4 w-4" strokeWidth={2.4} />
    </button>
  );
}

export function EffortChips({
  value,
  onChange,
  id,
  label = '체감 강도',
  labelClassName = 'text-xs font-medium tracking-normal text-muted',
  invalid = false,
  note,
}: {
  /** 고른 체감 강도(%). 아직 안 골랐으면 null */
  value: number | null;
  onChange: (pct: number) => void;
  /** 묶음의 id — 저장을 막았을 때 focusEffortChips 로 찾는다 */
  id?: string;
  label?: string;
  /** 이름 글자 모양 — 기본은 폼 칸 이름(Field)과 같다. 다른 칸 이름이 굵은 시트에서는 거기에 맞춘다 */
  labelClassName?: string;
  /** 비어 있는데 저장을 눌렀다 — 밑에 빨간 한 줄 */
  invalid?: boolean;
  /** 밑의 옅은 한 줄(예: 옛 1~10 에서 채운 값이라는 표시) */
  note?: string | null;
}) {
  const labelId = useId();
  const problemId = useId();

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={invalid ? problemId : undefined}
      className="space-y-2"
    >
      {/* 줄 높이를 늘 40px 로 둔다 — −/+ 가 나타날 때 밑의 칩이 아래로 밀리지 않게 */}
      <div className="flex min-h-10 items-center justify-between gap-3 desk:min-h-8">
        <span id={labelId} className={`block ${labelClassName}`}>
          {label}
        </span>
        {value != null && (
          <div className="motion-safe:animate-fade-in flex items-center gap-1">
            <StepButton dir={-1} value={value} onChange={onChange} />
            <output
              aria-live="polite"
              className="text-numeric w-14 text-center text-base text-ink"
            >
              {value}%
            </output>
            <StepButton dir={1} value={value} onChange={onChange} />
          </div>
        )}
      </div>

      <Segmented
        label={label}
        value={value == null ? '' : String(value)}
        onChange={(v) => onChange(Number(v))}
        options={OPTIONS}
        size="md"
        itemClassName="tabular-nums desk:py-2"
      />

      {invalid ? (
        <p id={problemId} role="alert" className="text-xs text-danger">
          {EFFORT_MISSING_ERROR}
        </p>
      ) : note ? (
        <p className="text-xs text-muted/80">{note}</p>
      ) : null}
    </div>
  );
}
