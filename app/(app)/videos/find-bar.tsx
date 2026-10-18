'use client';

import { Search, X } from '@/components/icon';
import {
  FIND_CUES,
  cycleCue,
  isFindActive,
  type FindQuery,
  type SatisfactionPick,
} from '@/lib/pitch-find';
import { SATISFACTION_ENDS } from '@/lib/pitch-satisfaction';

/**
 * 목록의 '느낌으로 찾기' 줄 — 검색 칸 · 날짜 점프 한 줄, 그 밑에 만족 칩 둘 + 감각 칩 여덟 한 줄(옆으로 굴림).
 * 값과 바뀜만 주고받는 부품이다. 거르기는 lib/pitch-find.ts, 거른 결과를 그리는 것은 video-gallery.tsx.
 *
 * 감각 칩은 눌러서 돈다 — 끔 → 좋았던(채움) → 아쉬웠던(테두리 + 작은 글자) → 끔. 색은 sky 하나(2026-10-16 D8).
 * 입력 폼은 '좋았던' · '아쉬웠던' 두 줄이지만 거기는 적는 자리, 여기는 거르는 자리라 한 줄로 낮게 둔다.
 */
export function FindBar({
  value,
  onChange,
  onJump,
}: {
  value: FindQuery;
  onChange: (next: FindQuery) => void;
  /** 날짜 점프 — YYYY-MM-DD */
  onJump: (date: string) => void;
}) {
  const active = isFindActive(value);
  const setSatisfaction = (pick: SatisfactionPick) =>
    onChange({ ...value, satisfaction: value.satisfaction === pick ? null : pick });
  const toggleCue = (cue: string) => {
    const next = { ...value.cues };
    const state = cycleCue(next[cue]);
    if (state) next[cue] = state;
    else delete next[cue];
    onChange({ ...value, cues: next });
  };

  const chip = (on: boolean, outline = false) =>
    `inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-footnote font-medium transition-colors desk:min-h-8 desk:text-xs ${
      on
        ? outline
          ? 'border border-sky bg-transparent text-sky-strong'
          : 'bg-sky text-white'
        : 'bg-ink/6 text-ink/80 hover:bg-ink/10'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">기록 찾기</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            placeholder="메모 · 종류 · 느낌으로 찾기"
            enterKeyHint="search"
            className="min-h-10 w-full rounded-full border-0 bg-ink/6 py-2 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-sky desk:min-h-9"
          />
          {value.text && (
            <button
              type="button"
              onClick={() => onChange({ ...value, text: '' })}
              aria-label="검색어 지우기"
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-ink/10 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        {/* 날짜로 가기 — 브라우저 달력 그대로(아이폰은 바퀴), 고르면 그 달을 펴고 그 날짜 줄로 */}
        <label className="shrink-0">
          <span className="sr-only">날짜로 가기</span>
          <input
            type="date"
            onChange={(e) => {
              if (e.target.value) onJump(e.target.value);
            }}
            aria-label="날짜로 가기"
            className="min-h-10 max-w-36 rounded-full border-0 bg-ink/6 px-3 text-footnote text-ink desk:min-h-9 desk:text-xs"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <div className="no-scrollbar -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1">
          <button
            type="button"
            onClick={() => setSatisfaction('good')}
            aria-pressed={value.satisfaction === 'good'}
            className={chip(value.satisfaction === 'good')}
          >
            {SATISFACTION_ENDS.high}
          </button>
          <button
            type="button"
            onClick={() => setSatisfaction('bad')}
            aria-pressed={value.satisfaction === 'bad'}
            className={chip(value.satisfaction === 'bad', true)}
          >
            {SATISFACTION_ENDS.low}
          </button>
          <span aria-hidden className="my-1 w-px shrink-0 bg-line" />
          {FIND_CUES.map((cue) => {
            const state = value.cues[cue];
            return (
              <button
                key={cue}
                type="button"
                onClick={() => toggleCue(cue)}
                aria-pressed={state !== undefined}
                aria-label={
                  state === 'good'
                    ? `${cue} 좋았던 날, 누르면 아쉬웠던 날로`
                    : state === 'bad'
                      ? `${cue} 아쉬웠던 날, 누르면 끄기`
                      : `${cue} 좋았던 날로 거르기`
                }
                className={chip(state !== undefined, state === 'bad')}
              >
                {cue}
                {state === 'bad' && (
                  <span className="text-caption font-normal leading-none opacity-80">
                    아쉬움
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange({ text: '', cues: {}, satisfaction: null })}
            className="inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-footnote font-semibold text-muted transition-colors hover:text-ink desk:min-h-8 desk:text-xs"
          >
            지우기
          </button>
        )}
      </div>
    </div>
  );
}
