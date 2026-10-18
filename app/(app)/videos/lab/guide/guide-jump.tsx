'use client';

import type { ReactNode } from 'react';
import type { LabGuideSection } from '@/lib/pitch-lab-guide';

/**
 * 안내 안의 다른 칸으로 옮기는 글 링크 — 같은 화면이라 뒤로 가기 기록을 쌓지 않는다.
 *
 * 2026-10-15 사용자: "분석이 안 됐다면 카드에서 파란 글씨를 누르고 나서 '‹ 3D 동작 분석'을 여러 번 눌러야 돌아간다".
 * 평범한 `<a href="#frame">` 는 누를 때마다 기록이 하나씩 늘어, 돌아가기(BackLink — router.back)가 그만큼 이 화면 안에서 맴돌았다.
 * 주소의 # 만 바꾸고(replaceState, Next 가 적어 둔 state 는 그대로) 그 칸으로 굴린다.
 */
export function GuideJump({
  section,
  children,
}: {
  section: LabGuideSection;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${section}`}
      className="font-medium text-sky"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        const el = document.getElementById(section);
        if (!el) return;
        e.preventDefault();
        history.replaceState(history.state, '', `#${section}`);
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      }}
    >
      {children}
    </a>
  );
}
