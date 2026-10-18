'use client';

import { useId } from 'react';
import { Segmented } from '@/components/segmented';
import { EFFORT_CHIPS, EFFORT_MISSING_ERROR, effortScaleText } from '@/lib/pitch-effort';

/**
 * 투구 강도 고르기 — 칩 열(1~10). 2026-10-18 사용자: "50~100% 를 1~10 으로 다시 바꿔줘".
 *
 * 값은 그대로 체감 강도 %(1 → 10% … 10 → 100%)로 쥐고 넘긴다 — 저장 · 부하 · 추천 엔진(lib/pitch-effort.ts)이 % 를 읽는다.
 * 기본값은 두지 않는다(예전 1~10 막대는 기본 5 에서 시작해 기록의 3분의 2가 손대지 않은 5 였다) — 저장 전에 한 번은 고른다.
 * 예전에 % 로 고른 칩 사이 값(85%)은 칩이 모두 빈 채 밑에 '지금 8.5' 로 보인다. 그대로 저장하면 85 가 남는다.
 */

const OPTIONS = EFFORT_CHIPS.map((pct) => ({ value: String(pct), label: effortScaleText(pct) }));

/** 저장을 막았을 때 그 자리로 — 칩 묶음의 첫 칸에 초점을 보내면 화면도 거기로 굴러간다 */
export function focusEffortChips(id: string) {
  document
    .getElementById(id)
    ?.querySelector<HTMLButtonElement>('[role="radio"]')
    ?.focus();
}

export function EffortChips({
  value,
  onChange,
  id,
  label = '강도',
  labelClassName = 'text-xs font-medium tracking-normal text-muted',
  invalid = false,
  note,
}: {
  /** 고른 체감 강도(%) — 칩 n 은 n × 10. 아직 안 골랐으면 null */
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
  /* 예전에 % 로 고른 칩 사이 값(85) — 칩이 모두 비니 밑에 지금 값을 적는다 */
  const offChip = value != null && !(EFFORT_CHIPS as readonly number[]).includes(value);

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={invalid ? problemId : undefined}
      className="space-y-2"
    >
      <span id={labelId} className={`block ${labelClassName}`}>
        {label}
      </span>

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
      ) : offChip ? (
        <p className="text-xs text-muted/80">지금 {effortScaleText(value)} · 칩을 누르면 바뀌어요</p>
      ) : note ? (
        <p className="text-xs text-muted/80">{note}</p>
      ) : null}
    </div>
  );
}
