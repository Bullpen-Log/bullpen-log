'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from '@/components/icon';
import { isNativeClient } from '@/lib/app-env';
import { haptic } from '@/lib/haptics';

/**
 * 홈 '오늘' 링 넷이 다 찼을 때의 축하(2026-10-13 사용자: "체크인 · 투구 · 운동 · 영양이 다 완료되면").
 *
 *   웹  카드 안에서 — 링이 다 그려진 뒤(1.5초) 넷이 차례로 위로 빠지고, 가운데 체크 동그라미가 톡 뜨며 이모지 몇 개가 퍼지고,
 *       밑에 '오늘 기록을 다 남겼어요'. 그날은 그 모양으로 남는다('기록 보기'로 링을 다시 본다).
 *   앱  화면 전체가 흐려지며 가운데에 같은 체크 · 이모지 · 글(2.8초 뒤 또는 누르면 걷힘). 카드는 링 그대로.
 *
 * 축하는 하루 한 번(localStorage, 날짜 열쇠) — 그날 다시 홈을 열면 웹은 완료 모양을 바로(움직임 없이), 앱은 아무것도 안 띄운다.
 * 움직임 줄이기면 위로 빠지기 · 이모지가 없고 완료 모양만 보인다(globals.css '홈 축하').
 */

const KEY = 'bullpen-all-done';
/** 링이 다 그려지는 때(ring-grow 0.9초 + done-ring 0.7초)를 지나서 축하를 시작한다 */
const START_MS = 1500;
/** 링 넷이 위로 빠지는 시간(마지막 링 늦춤 0.18초 포함) */
const LIFT_MS = 700;
/** 앱 화면 축하가 머무는 시간 */
const OVERLAY_MS = 2800;

const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
function readCelebrated(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeCelebrated(day: string) {
  try {
    localStorage.setItem(KEY, day);
  } catch {
    /* 못 적으면 다음에 한 번 더 축하할 뿐 */
  }
  listeners.forEach((fn) => fn());
}
const noop = () => () => {};

/**
 * 퍼지는 점 — 가운데에서 바깥으로(--dx · --dy), 차례로(--d). 예전엔 이모지(🎉✨👏🎊⭐)였는데 'AI 앱' 같다는 점검(2026-10-16)으로
 * 링과 같은 파랑의 작은 점으로. s = 점 크기(px)
 */
const BITS: { k: string; s: number; dx: string; dy: string; d: string }[] = [
  { k: 'a', s: 8, dx: '-64px', dy: '-30px', d: '420ms' },
  { k: 'b', s: 6, dx: '62px', dy: '-36px', d: '480ms' },
  { k: 'c', s: 7, dx: '-74px', dy: '18px', d: '540ms' },
  { k: 'd', s: 5, dx: '72px', dy: '14px', d: '600ms' },
  { k: 'e', s: 6, dx: '0px', dy: '-58px', d: '520ms' },
];

/** 체크 동그라미 + 점 + 글 — 웹 카드 · 앱 화면이 같이 쓴다 */
function Cheer({ animate, size }: { animate: boolean; size: 'card' | 'screen' }) {
  const big = size === 'screen';
  return (
    <div className="flex flex-col items-center text-center">
      <div className={`relative ${big ? 'h-24 w-24' : 'h-16 w-16'}`}>
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="7"
            className="stroke-sky/15"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            className={`stroke-sky ${animate ? 'done-ring' : ''}`}
          />
        </svg>
        <span
          aria-hidden
          className={`absolute inset-[16%] grid place-items-center rounded-full bg-sky text-white ${
            animate ? 'finish-pop done-check' : ''
          }`}
        >
          <Check className={big ? 'h-10 w-10' : 'h-7 w-7'} />
        </span>
        {animate &&
          BITS.map((b) => (
            <span
              key={b.k}
              aria-hidden
              className="cheer-bit pointer-events-none absolute left-1/2 top-1/2 -ml-3 -mt-3 grid h-6 w-6 place-items-center"
              style={
                {
                  '--dx': big ? `calc(${b.dx} * 1.6)` : b.dx,
                  '--dy': big ? `calc(${b.dy} * 1.6)` : b.dy,
                  '--d': b.d,
                } as React.CSSProperties
              }
            >
              <span
                className="rounded-full bg-sky"
                style={{ width: big ? b.s * 1.5 : b.s, height: big ? b.s * 1.5 : b.s }}
              />
            </span>
          ))}
      </div>
      <p
        className={`font-bold text-ink ${big ? 'mt-5 text-2xl' : 'mt-3 text-base'} ${
          animate ? 'rise-in [--rise-delay:600ms]' : ''
        }`}
      >
        오늘 기록을 다 남겼어요
      </p>
    </div>
  );
}

export function RingsStage({
  allDone,
  day,
  children,
}: {
  /** 링 넷이 다 찼나 */
  allDone: boolean;
  /** 오늘(YYYY-MM-DD) — 하루 한 번의 열쇠 */
  day: string;
  /** 링 넷의 줄(grid) */
  children: ReactNode;
}) {
  const celebrated = useSyncExternalStore(subscribe, readCelebrated, () => null);
  const native = useSyncExternalStore(noop, isNativeClient, () => false);
  const [phase, setPhase] = useState<'idle' | 'lift' | 'reveal'>('idle');
  const [overlay, setOverlay] = useState(false);
  const [showRings, setShowRings] = useState(false);

  /* 오늘 처음 다 찼을 때만 — 링이 다 그려진 뒤에 시작 */
  useEffect(() => {
    if (!allDone || celebrated === day) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        haptic('success');
        if (native) {
          setOverlay(true);
          writeCelebrated(day);
          timers.push(window.setTimeout(() => setOverlay(false), OVERLAY_MS));
          return;
        }
        setPhase('lift');
        timers.push(
          window.setTimeout(() => {
            setPhase('reveal');
            writeCelebrated(day);
          }, LIFT_MS)
        );
      }, START_MS)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // celebrated 는 여기서 적어서 바뀐다 — 다시 돌면 타이머가 지워져 화면 축하가 바로 닫혔다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, day, native]);

  const doneView =
    allDone && !native && !showRings && (phase === 'reveal' || celebrated === day);

  return (
    <>
      {doneView ? (
        <div className="flex min-h-[7.25rem] flex-col items-center justify-center py-1">
          <Cheer animate={phase === 'reveal'} size="card" />
          <button
            type="button"
            onClick={() => setShowRings(true)}
            className="mt-1 min-h-10 rounded-full px-3 text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            기록 보기
          </button>
        </div>
      ) : (
        <div className={phase === 'lift' ? 'rings-lift' : undefined}>{children}</div>
      )}
      {overlay &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            onClick={() => setOverlay(false)}
            className="celebrate-in fixed inset-0 z-[200] grid place-items-center bg-page/40 backdrop-blur-md"
          >
            <Cheer animate size="screen" />
          </div>,
          document.body
        )}
    </>
  );
}
