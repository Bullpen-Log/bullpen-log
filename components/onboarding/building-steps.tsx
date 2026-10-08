'use client';

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';

/** 한 줄이 떠오르는 간격 · 마지막 줄 뒤 머무는 시간(ms) */
const LINE_MS = 380;
const TAIL_MS = 900;

/**
 * '계획 만드는 중' — 답이 한 줄씩 체크되며 쌓이고, 다 쌓이면 다음 화면(추천 계획)으로 넘어간다(onDone).
 *
 * 실제로 기다릴 계산은 없다(순수 함수라 즉시다). 그래도 한 호흡을 두는 까닭: 열두 개의 답이 하나의 계획으로
 * 모였다는 것을 눈으로 확인하는 자리다 — 인아웃의 '분석 중' 화면과 같은 역할. 움직임을 줄인 설정이면 짧게 머문다.
 * 보이는 순간(active) 시작한다 — 마법사는 모든 화면을 그려 두고 지금 것만 보이기 때문이다.
 *
 * 막대는 Web Animations 로 민다 — 숨어 있던(hidden) 요소는 보이는 순간의 CSS transition 이 안 돈다.
 */
export function BuildingSteps({
  lines,
  active,
  onDone,
}: {
  lines: string[];
  active: boolean;
  onDone: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = reduce ? 600 : lines.length * LINE_MS + TAIL_MS;
    const anim = barRef.current?.animate([{ width: '0%' }, { width: '100%' }], {
      duration: wait,
      easing: 'linear',
      fill: 'forwards',
    });
    const t = window.setTimeout(onDone, wait);
    return () => {
      window.clearTimeout(t);
      anim?.cancel();
    };
    /* onDone 은 부르는 쪽이 매번 새로 만든다 — 줄 수와 보임만 본다 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lines.length]);

  return (
    <div aria-live="polite" aria-busy={active}>
      <ul className="space-y-3">
        {lines.map((line, i) => (
          <li
            key={line}
            style={{ animationDelay: `${i * LINE_MS}ms` }}
            className="motion-safe:animate-row-in flex items-center gap-3 text-[15px] text-ink break-keep"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky text-white">
              <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            {line}
          </li>
        ))}
      </ul>
      <div aria-hidden className="mt-6 h-1 overflow-hidden rounded-full bg-line/60">
        <div ref={barRef} className="h-full w-0 rounded-full bg-sky" />
      </div>
    </div>
  );
}
