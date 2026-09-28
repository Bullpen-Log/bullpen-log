'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { PrimaryButton, tipsFor, type Choices } from './setup-steps';

/**
 * 주의사항 팝업 — 설정이 끝나고 카메라가 켜지기 전에 카메라 화면 위에 창처럼 뜬다.
 *
 * 예전에는 설정 단계 가운데 한 장(TipsStep)이었는데, 그러면 설정과 주의사항이 한 챕터로 보였다.
 * 사용자가 원한 모양은 "그 다음 화면(카메라)이 뒤에 있고, 그 위에 창이 떠 있는" 팝업 —
 * 뒤 화면은 여백에서만 조금 보인다(backdrop 을 진하게). 카드 자료는 setup-steps.tsx 의
 * tipsFor(choices) 를 그대로 쓴다.
 *
 * "다시 보지 않기"는 없앴다. 대신 다음 단추 밑에 작게 '오늘은 보지 않기' — 오늘 날짜를
 * localStorage 에 적고, 부르는 쪽이 `isTipsSkippedToday(today)` 로 읽어 그날은 띄우지 않는다.
 * 날짜(YYYY-MM-DD)는 부르는 쪽이 만들어 넘긴다 — 서버 · 브라우저가 같은 날짜를 쓰게.
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
 * 주의사항 창. <dialog> 라 초점 가두기 · Esc · 뒤 화면 스크롤 잠금이 브라우저 몫이다(BottomSheet 와 같은 방식).
 * 늘 붙어 있고 open 만 오간다 — 닫힐 때 지워 버리면 나가는 움직임을 보여 줄 것이 없다.
 * 닫혔다 다시 열리면 첫 장부터.
 */
export function TipsPopup({
  open,
  choices,
  today,
  onClose,
}: {
  open: boolean;
  choices: Choices;
  /** YYYY-MM-DD — '오늘은 보지 않기'가 적는 날짜 */
  today: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const detailId = useId();
  const tips = tipsFor(choices);
  const [i, setI] = useState(0);
  const [detail, setDetail] = useState(false);

  /* 다시 열리면 첫 장 · 접힌 채로 — 렌더 중에 되돌린다(effect 에서 setState 하지 않게) */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setI(0);
      setDetail(false);
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const index = Math.min(i, tips.length - 1);
  const tip = tips[index];
  const last = index === tips.length - 1;

  const skipToday = () => {
    skipTipsToday(today);
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc 로 브라우저가 스스로 닫은 경우에도 부모에게 알린다
      onClose={onClose}
      /*
       * Esc 를 직접 받아 닫는다 — 크롬은 <dialog> 의 Esc 닫기를 '사용자가 직접 눌렀는가'와 묶어
       * 두어 안 닫힐 때가 있다(components/modal.tsx 에 같은 이야기). 위로 올려보내지 않는다.
       */
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      /* 여백(backdrop)을 눌러도 닫는다 — 안쪽은 아래 칸들이 다 덮고 있어 창 자체가 목표가 되는 것은 여백뿐 */
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      /*
       * 화면 거의 전체 — 폰에서는 네 변 12px 여백(위아래는 노치 · 홈 막대 안쪽으로), 그 여백으로
       * 뒤 카메라 화면이 조금 보인다. 브라우저가 <dialog> 에 주는 fit-content 크기와 최대 크기
       * (calc(100% - 6px - 2em))를 지우고 네 변 자리로 크기를 잡는다. PC 에서는 폰 틀만 한 창을
       * 가운데에.
       */
      className="left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] m-0 flex h-auto max-h-none w-auto max-w-none flex-col overflow-clip rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-shade/75 backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:h-[min(44rem,calc(100dvh-3rem))] sm:w-full sm:max-w-sm"
    >
      {/* 머리 — 작은 제목 · 닫기 */}
      <div className="flex h-14 shrink-0 items-center justify-between pl-5 pr-2">
        <h2 id={titleId} className="text-heading text-base">
          정확하게 재려면
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>

      {/* 카드 — 세로가 모자라면 여기서만 굴린다 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
        <div
          key={tip.key}
          className="motion-safe:animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface"
        >
          <div className="flex aspect-[4/3] items-center justify-center bg-sky-tint/60 px-6 text-sky short:aspect-auto short:h-32">
            {tip.art}
          </div>
          <div className="px-5 pb-4 pt-4 short:pt-3">
            <p className="text-heading text-lg">{tip.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{tip.short}</p>
            <button
              type="button"
              onClick={() => setDetail((d) => !d)}
              aria-expanded={detail}
              aria-controls={detailId}
              className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-sky"
            >
              <Info aria-hidden className="h-4 w-4" />
              자세히
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 transition-transform ${detail ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* 자세한 까닭 — 카드 밑에 접었다 편다. 창 안에 창을 또 띄우지 않는다 */}
        {detail && (
          <p
            id={detailId}
            key={`${tip.key}-long`}
            className="motion-safe:animate-fade-in mt-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink"
          >
            {tip.long}
          </p>
        )}
      </div>

      {/* 점 — 몇 번째 카드인지 */}
      <div
        className="flex shrink-0 items-center justify-center"
        aria-label={`${index + 1} / ${tips.length}`}
      >
        {tips.map((t, k) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setI(k)}
            aria-label={`${k + 1}번째 카드`}
            aria-current={k === index}
            className="flex h-8 items-center px-[3px]"
          >
            <span
              className={`block h-2 rounded-full transition-all ${k === index ? 'w-5 bg-sky' : 'w-2 bg-line-strong'}`}
            />
          </button>
        ))}
      </div>

      {/* 발 — 이전 · 다음(마지막은 카메라 켜기), 그 밑 가운데 작게 '오늘은 보지 않기' */}
      <div className="shrink-0 border-t border-line px-4 pb-1 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setI(index - 1)}
            disabled={index === 0}
            aria-label="이전"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-ink transition-colors enabled:hover:border-sky enabled:hover:text-sky disabled:opacity-40"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>
          <PrimaryButton onClick={() => (last ? onClose() : setI(index + 1))}>
            {last ? '카메라 켜기' : '다음'}
            {!last && <ChevronRight aria-hidden className="h-4 w-4" />}
          </PrimaryButton>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={skipToday}
            className="inline-flex min-h-10 items-center px-3 text-xs text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            오늘은 보지 않기
          </button>
        </div>
      </div>
    </dialog>
  );
}
