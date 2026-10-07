'use client';

import { useEffect, useState } from 'react';
import type { LiveStatus } from '@/lib/velocity-engine/live-capture';

/**
 * 던짐을 알아챈 뒤 결과가 나오기까지 — 영상 담기 → 계산 → 결과. 앱 카메라는 던지고 3~4초 뒤에 값이 나와서, 그동안 화면이
 * 거의 그대로면 알아챘는지 · 계산 중인지 알 수 없었다(2026-10-08 사용자). 투수는 폰에서 멀리 있으니 크게 보인다.
 */
export type MeasurePhase = 'capturing' | 'analyzing';

export const measurePhaseOf = (s: LiveStatus): MeasurePhase | null =>
  s === 'capturing' || s === 'analyzing' ? s : null;

const TEXT: Record<MeasurePhase, { title: string; sub: string }> = {
  capturing: {
    title: '투구를 인식했어요',
    sub: '영상을 담고 있어요. 폰은 그대로 두세요.',
  },
  analyzing: { title: '구속 계산 중', sub: '곧 결과가 나와요.' },
};

const STEPS = ['영상 담기', '계산', '결과'] as const;

/** 담기 막대 — 걸리는 시간(captureSec)에 맞춰 95% 까지 차오른다. 던질 때마다 runKey 로 새로 시작한다 */
function Fill({ sec }: { sec: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span
      className="block h-full rounded-full bg-sky-soft transition-[width] ease-out motion-reduce:transition-none"
      style={{ width: on ? '95%' : '6%', transitionDuration: `${sec}s` }}
    />
  );
}

export function MeasureProgress({
  phase,
  captureSec,
  runKey,
}: {
  phase: MeasurePhase;
  /** 영상을 담는 데 걸리는 시간(초) — 앱 카메라 약 3.5, 웹 카메라 약 1 */
  captureSec: number;
  /** 던질 때마다 바뀌는 값 — 담기 막대를 처음부터 */
  runKey: number;
}) {
  const t = TEXT[phase];
  const current = phase === 'capturing' ? 0 : 1;
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl bg-black/75 px-4 py-3.5 text-left text-white backdrop-blur motion-safe:animate-fade-in"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-7 w-7 shrink-0 rounded-full border-[3px] border-white/25 border-t-sky-soft motion-safe:animate-spin"
        />
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight">{t.title}</p>
          <p className="mt-0.5 text-xs text-white/70">{t.sub}</p>
        </div>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="min-w-0">
            <span className="block h-1.5 overflow-hidden rounded-full bg-white/20">
              {i < current && (
                <span className="block h-full w-full rounded-full bg-sky-soft" />
              )}
              {i === current &&
                (phase === 'capturing' ? (
                  <Fill key={runKey} sec={captureSec} />
                ) : (
                  <span className="block h-full w-full rounded-full bg-sky-soft motion-safe:animate-pulse" />
                ))}
            </span>
            <span
              className={`mt-1 block truncate text-xs ${
                i === current
                  ? 'font-semibold text-white'
                  : i < current
                    ? 'text-white/70'
                    : 'text-white/40'
              }`}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
