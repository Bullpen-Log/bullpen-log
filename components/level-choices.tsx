'use client';

import { useState } from 'react';
import {
  COMPETITION_LEVELS,
  COMPETITION_LEVEL_LABELS,
  gradeText,
  levelFit,
  normalizeLevel,
  type CompetitionLevel,
} from '@/lib/baseline';

/**
 * 소속 고르기 — 가입 화면과 내 정보가 같이 쓴다.
 *
 * 생년월일과 이어져 있다(2026-09-30 사용자: "생일을 알고 있으니 나이에 맞는 레벨을
 * 고르도록"). 생년월일로 본 학년 앞뒤 한 학년 밖의 소속은 흐리게 막고, 학교 나이면
 * 그 학교를 먼저 골라 둔다. 생년월일을 바꾸면 따라 바뀐다 — 골라 둔 것이 새 나이에
 * 안 맞으면 풀고, 맞으면 그대로 둔다.
 *
 * 고른 값은 상태로 쥐고(picked), 보이는 값은 그리는 동안 셈한다 — 생년월일이 바뀔 때
 * 따로 상태를 맞추지 않아도 된다.
 */
export function LevelChoices({
  name = 'competitionLevel',
  birthDate,
  today,
  initial,
  required = false,
  invalid = false,
  size = 'md',
  legend,
  hint,
}: {
  name?: string;
  /** 'YYYY-MM-DD' — 비어 있으면 모두 고를 수 있다 */
  birthDate: string;
  today: string;
  /** 처음 골라 둘 값(예전 선택지도 받는다 — normalizeLevel) */
  initial?: string | null;
  required?: boolean;
  invalid?: boolean;
  /** md: 가입 화면의 큰 칸 · sm: 내 정보의 작은 칸 */
  size?: 'md' | 'sm';
  legend: string;
  hint?: string;
}) {
  const [picked, setPicked] = useState<CompetitionLevel | null>(() =>
    normalizeLevel(initial)
  );
  const fit = levelFit(birthDate || null, today);
  const value = picked && fit.allowed.includes(picked) ? picked : fit.suggested;

  const chip =
    size === 'md'
      ? 'rounded-xl px-4 py-2.5 text-sm peer-checked:font-semibold'
      : 'rounded-lg px-3 py-2 text-xs peer-checked:font-medium';

  return (
    <fieldset>
      <legend
        className={
          size === 'md'
            ? 'mb-2 block text-xs font-medium text-muted'
            : 'mb-2.5 block text-xs font-medium text-muted'
        }
      >
        {legend}
        {hint && <span className="mt-1 block font-normal text-muted/70">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {COMPETITION_LEVELS.map((level) => {
          const allowed = fit.allowed.includes(level);
          return (
            <label key={level} className="inline-flex">
              <input
                type="radio"
                name={name}
                value={level}
                required={required}
                disabled={!allowed}
                checked={value === level}
                onChange={() => setPicked(level)}
                className="peer sr-only"
              />
              <span
                className={`block cursor-pointer select-none border bg-surface-2 text-muted transition-[color,background-color,border-color,opacity] duration-200 hover:border-sky-soft hover:text-ink peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:text-sky-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-strong peer-disabled:cursor-not-allowed peer-disabled:opacity-35 peer-disabled:hover:border-line peer-disabled:hover:text-muted ${chip} ${
                  invalid ? 'border-danger/60' : 'border-line'
                }`}
              >
                {COMPETITION_LEVEL_LABELS[level]}
              </span>
            </label>
          );
        })}
      </div>
      {/* 무엇 때문에 몇 칸이 막혔는지 — 생년월일이 바뀌면 다시 떠오른다 */}
      <p
        key={fit.grade ?? 'none'}
        className="motion-safe:animate-fade-in mt-2 text-xs leading-relaxed text-muted"
      >
        {fit.grade === null
          ? '생년월일을 넣으면 나이에 맞는 소속을 먼저 골라 드려요.'
          : `생년월일로 보면 ${gradeText(fit.grade)} 나이예요. 나이에 맞는 소속만 고를 수 있어요.`}
      </p>
    </fieldset>
  );
}
