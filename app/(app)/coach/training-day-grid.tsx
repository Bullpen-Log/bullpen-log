'use client';

import { useState } from 'react';
import type { ReviewDay } from '@/lib/report/training-review';

/**
 * 투구 · 운동 · 암케어 격자(training-review.tsx 의 '투구와 운동').
 *
 * 칸을 누르면 그날이 격자 밑에 한 줄로 뜬다(2026-10-03). 예전에는 칸마다 title(마우스를 올려야 뜨는 말풍선)에만
 * 적혀 있어 아이폰에서는 어느 날이 어땠는지 볼 길이 없었다. 칸이 좁아(휴대폰 약 10px) 누르는 자리는 위아래로
 * 조금 넓혔고, 고른 날은 세 줄 모두에서 테두리로 짚는다 — 손가락이 옆 칸을 눌렀어도 어느 날인지 바로 보인다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-31 → 8/31(월) */
function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}/${d}(${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

const STRIPS: {
  label: string;
  isOn: (day: ReviewDay) => boolean;
  describe: (day: ReviewDay) => string;
}[] = [
  {
    label: '투구',
    isOn: (d) => d.pitches > 0,
    describe: (d) => (d.pitches > 0 ? `${d.pitches}구` : '안 던짐'),
  },
  {
    label: '운동',
    isOn: (d) => d.trained,
    describe: (d) => (d.trained ? '운동함' : '운동 안 함'),
  },
  {
    label: '암케어',
    isOn: (d) => d.armCare,
    describe: (d) => (d.armCare ? '암케어함' : '암케어 안 함'),
  },
];

export function TrainingDayGrid({
  weeks,
  weekCount,
}: {
  weeks: ReviewDay[][];
  weekCount: number;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ? weeks.flat().find((d) => d.date === picked) : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0" />
        {weeks.map((_, i) => {
          const ago = weekCount - 1 - i;
          return (
            <span
              key={i}
              className={`flex-1 text-center text-[10px] ${
                ago === 0 ? 'text-sky' : 'text-muted'
              }`}
            >
              {ago === 0 ? '이번 주' : `${ago}주 전`}
            </span>
          );
        })}
      </div>

      {STRIPS.map((strip) => (
        <div key={strip.label} className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-[11px] font-semibold text-ink">
            {strip.label}
          </span>
          {weeks.map((week, i) => (
            <span key={i} className="flex flex-1 gap-0.5">
              {week.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setPicked((p) => (p === d.date ? null : d.date))}
                  aria-pressed={picked === d.date}
                  aria-label={`${dayLabel(d.date)} ${strip.describe(d)}`}
                  title={`${d.date} — ${strip.describe(d)}`}
                  /* 누르는 자리만 위아래로 3px 씩 넓힌다(줄 사이 틈만큼) — 그림은 그대로 */
                  className={`relative h-4 flex-1 rounded-sm before:absolute before:inset-x-0 before:-inset-y-[3px] before:content-[''] ${
                    strip.isOn(d) ? 'bg-sky' : 'bg-surface-2'
                  } ${picked === d.date ? 'ring-2 ring-ink/70 ring-offset-1 ring-offset-surface' : ''}`}
                />
              ))}
            </span>
          ))}
        </div>
      ))}

      <p aria-live="polite" className="pt-1 pl-13 text-[11px] text-muted">
        {day ? (
          <>
            <span className="font-semibold text-ink">{dayLabel(day.date)}</span>
            {STRIPS.map((s) => ` · ${s.describe(day)}`).join('')}
          </>
        ) : (
          '칸을 누르면 그날을 볼 수 있어요.'
        )}
      </p>
    </div>
  );
}
