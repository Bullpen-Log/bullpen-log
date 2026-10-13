'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { buzz } from '@/lib/haptics';

/**
 * 탭에서 하루 한 번 묻는 카드의 껍데기(체크인 3판, 2026-10-13 — app/actions/day-cards.ts 와 짝).
 *
 * 세 모양을 오간다:
 *   물음   아직 답이 없고 오늘 '나중에'를 안 눌렀을 때 — 질문 · 고르는 칸(children) · [나중에]
 *   요약   답했으면 한 줄 '오늘 설정 · 웨이트 · 하체' + [바꾸기] — 누르면 다시 물음으로(답을 채워서)
 *   접힘   '나중에'를 눌렀으면 '오늘 설정 — 답하기' 알약 하나 — 누르면 물음으로
 *
 * '나중에'는 그날 하루 기억한다(localStorage, 날짜 열쇠) — 한 번 미룬 사람에게 탭에 올 때마다 다시 묻지 않게.
 * 답은 서버에 있어(answer) 새로고침해도 요약이 남고, 날이 바뀌면 열쇠가 바뀌어 다시 묻는다.
 */

const KEY = 'bullpen-day-card';

/* '나중에'를 누른 날 — 바깥 저장소(localStorage)라 useSyncExternalStore 로 읽는다(서버에서는 null — 처음 그림은 서버와 같게) */
const laterListeners = new Set<() => void>();
function subscribeLater(onChange: () => void) {
  laterListeners.add(onChange);
  return () => {
    laterListeners.delete(onChange);
  };
}
function readLater(key: string): string | null {
  try {
    return localStorage.getItem(`${KEY}:${key}`);
  } catch {
    return null;
  }
}
function writeLater(key: string, day: string) {
  try {
    localStorage.setItem(`${KEY}:${key}`, day);
  } catch {
    /* 못 적어도 이번 화면에서는 접힌다(아래 forced) */
  }
  laterListeners.forEach((fn) => fn());
}

/** 고르는 칩 — 휴대폰은 알약, PC 는 네모(영양 식단 카드의 칩과 같은 모양) */
export const DAY_CHIP =
  'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-transparent bg-ink/6 px-3.5 text-sm text-ink/80 transition-colors aria-pressed:border-sky aria-pressed:bg-sky/10 aria-pressed:font-semibold aria-pressed:text-sky desk:min-h-9 desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:text-xs desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink desk:aria-pressed:font-medium';

export function Chip({
  pressed,
  onClick,
  children,
  disabled,
  title,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={() => {
        buzz(10);
        onClick();
      }}
      className={DAY_CHIP}
    >
      {children}
    </button>
  );
}

export function DayCard({
  storageKey,
  day,
  title,
  hint,
  answer,
  children,
  laterLabel,
}: {
  /** 카드마다 다른 열쇠(training · nutrition · throw) */
  storageKey: string;
  /** 오늘(YYYY-MM-DD) — '나중에'의 열쇠 */
  day: string;
  title: string;
  /** 질문 밑 한 줄 — 무엇에 쓰는지 */
  hint?: string;
  /** 답했으면 요약 한 줄, 아직이면 null */
  answer: string | null;
  /** 물음 모양의 속 — 저장이 끝나면 close() 로 요약으로 돌아간다 */
  children: (close: () => void) => ReactNode;
  /** '나중에' 단추의 말 — 던지는 일정 카드는 '모름' */
  laterLabel?: string;
}) {
  /*
   * 열려 있나 — 기본은 '답이 없고 오늘 나중에를 안 눌렀을 때'. 사람이 누른 것(바꾸기 · 나중에 · 저장 끝)은 forced 가 이긴다.
   * 서버 그림(laterDay = null)은 답이 없으면 열린 모양이고, 브라우저가 '나중에' 기록을 읽으면 접힌다.
   */
  const laterDay = useSyncExternalStore(
    subscribeLater,
    () => readLater(storageKey),
    () => null
  );
  const [forced, setForced] = useState<boolean | null>(null);
  const open = forced ?? (answer == null && laterDay !== day);
  const setOpen = (v: boolean) => setForced(v);

  if (open) {
    return (
      <section
        aria-label={title}
        className="motion-safe:animate-fade-in rounded-2xl border border-sky/25 bg-sky-tint/60 p-(--block-pad) shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-base font-bold text-ink">{title}</p>
            {hint && <p className="text-xs text-muted">{hint}</p>}
          </div>
          {answer == null && (
            <button
              type="button"
              onClick={() => {
                writeLater(storageKey, day);
                setOpen(false);
              }}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-ink/6 hover:text-ink"
            >
              {laterLabel ?? '나중에'}
            </button>
          )}
        </div>
        <div className="mt-3">{children(() => setOpen(false))}</div>
      </section>
    );
  }

  /* 요약 · 접힘 — 한 줄 알약. 답이 있으면 그 답, 없으면 '답하기' */
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="motion-safe:animate-fade-in inline-flex max-w-full items-center gap-2 rounded-full bg-ink/6 px-3.5 py-2 text-left text-xs text-ink transition-colors hover:bg-ink/10"
    >
      <span className="font-semibold text-muted">오늘 설정</span>
      <span className="truncate">{answer ?? '답하기'}</span>
      <Pencil aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
    </button>
  );
}
