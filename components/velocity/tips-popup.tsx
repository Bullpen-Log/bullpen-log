'use client';

import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, Info } from '@/components/icon';
import { PrimaryButton, tipsFor, type Choices } from './setup-steps';

/**
 * 주의사항 — 설정이 끝나고 카메라 위 안내창으로 뜬다(아래 TipsCard). 카드 자료는 setup-steps.tsx 의 tipsFor(choices).
 *
 * '다시 보지 않기'는 없다. 카드 밑 작게 '오늘은 보지 않기' — 오늘 날짜를 localStorage 에 적고, 부르는 쪽이
 * `isTipsSkippedToday(today)` 로 읽어 그날은 건너뛴다. 날짜(YYYY-MM-DD)는 부르는 쪽이 만들어 넘긴다 — 서버 · 브라우저가 같은 날짜를 쓰게.
 */

export const TIPS_SKIP_KEY = 'bullpen-velocity-tips-skip';

/** 오늘 보지 않기가 켜져 있나 — 저장값이 오늘 날짜와 같을 때만. 서버(window 없음)면 false */
export function isTipsSkippedToday(today: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(TIPS_SKIP_KEY) === today;
  } catch {
    return false;
  }
}

/** 오늘은 보지 않기 — 오늘 날짜를 적는다. 내일이면 값이 달라 다시 뜬다 */
export function skipTipsToday(today: string): void {
  try {
    localStorage.setItem(TIPS_SKIP_KEY, today);
  } catch {
    /* 사생활 보호 모드 등에서는 못 적는다 — 이번만 닫히고 만다 */
  }
}

/**
 * 주의사항 한 장 — 카메라 위 안내창(구속 측정 첫 화면이 카메라가 된 뒤, 2026-10-15)에 뜬다. 넘기기는 카드 밑 단추(부르는 쪽이
 * index 를 쥔다), 점을 눌러 바로 갈 수도 있다. 예전 창(<dialog>)은 화면 전체를 덮어 셔터까지 가려 걷었다.
 */
export function TipsCard({
  choices,
  index,
  onIndex,
  today,
  onSkipToday,
  action,
}: {
  choices: Choices;
  index: number;
  onIndex: (i: number) => void;
  /** 카드 밑 단추 — 다음 장 · 마지막 장이면 카메라 맞추기(부르는 쪽이 정한다) */
  action: { label: string; onClick: () => void };
  /** YYYY-MM-DD — '오늘은 보지 않기'가 적는 날짜 */
  today: string;
  /** '오늘은 보지 않기' 뒤 — 주의사항을 건너뛴다 */
  onSkipToday: () => void;
}) {
  const detailId = useId();
  const tips = tipsFor(choices);
  const [detail, setDetail] = useState(false);
  /* 장이 바뀌면 접힌 채로 — 렌더 중에 되돌린다 */
  const [shownIndex, setShownIndex] = useState(index);
  if (shownIndex !== index) {
    setShownIndex(index);
    setDetail(false);
  }
  const at = Math.min(index, tips.length - 1);
  const tip = tips[at];
  return (
    <div className="pointer-events-auto max-h-full overflow-y-auto overscroll-contain rounded-3xl bg-page text-ink shadow-2xl motion-safe:animate-sheet-up">
      <div key={tip.key} className="motion-safe:animate-fade-in">
        <div className="flex aspect-[2/1] items-center justify-center bg-sky-tint/60 px-6 text-sky short:hidden">
          {tip.art}
        </div>
        <div className="px-5 pb-2 pt-4">
          <p className="text-xs font-semibold tabular-nums text-muted">
            주의사항 {at + 1}/{tips.length}
          </p>
          <p className="mt-1 text-xl font-bold leading-tight text-ink">{tip.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{tip.short}</p>
          <button
            type="button"
            onClick={() => setDetail((d) => !d)}
            aria-expanded={detail}
            aria-controls={detailId}
            className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-sky"
          >
            <Info aria-hidden className="h-4 w-4" />
            자세히
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 transition-transform ${detail ? 'rotate-180' : ''}`}
            />
          </button>
          {detail && (
            <p
              id={detailId}
              className="motion-safe:animate-fade-in mt-1 rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink"
            >
              {tip.long}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-2">
        <div className="flex items-center" aria-label={`${at + 1} / ${tips.length}`}>
          {tips.map((t, k) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onIndex(k)}
              aria-label={`${k + 1}번째 카드`}
              aria-current={k === at}
              className="flex h-10 items-center px-[3px]"
            >
              <span
                className={`block h-2 rounded-full transition-[width,background-color] ${k === at ? 'w-5 bg-sky' : 'w-2 bg-line-strong'}`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            skipTipsToday(today);
            onSkipToday();
          }}
          className="inline-flex min-h-10 items-center px-2 text-sm text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          오늘은 보지 않기
        </button>
      </div>
      <div className="flex px-5 pb-5">
        <PrimaryButton onClick={action.onClick}>
          {action.label}
          <ChevronRight aria-hidden className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  );
}

/** 주의사항 장 수 — 셔터가 마지막 장인지 알게 */
export function tipsCount(choices: Choices): number {
  return tipsFor(choices).length;
}
