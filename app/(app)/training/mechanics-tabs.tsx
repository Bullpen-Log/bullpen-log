'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Segmented } from '@/components/segmented';

/**
 * 메커니즘 안의 두 칸 — [프로그램 | 요소별 드릴](2026-10-04).
 *
 * 암케어의 [루틴 | 부위별 보강]과 같은 모양이다(armcare-tabs.tsx). 주소로 나눈다 — 요소별 드릴은 드릴 백여 개를 다
 * 늘어놓는 화면이라 프로그램만 보러 온 사람에게 그 짐까지 내려보낼 까닭이 없다.
 */
const TABS = [
  { value: 'program', label: '프로그램', href: '/training?view=mechanics' },
  { value: 'elements', label: '요소별 드릴', href: '/training?view=mechanics&tab=elements' },
] as const;

export type MechanicsTab = (typeof TABS)[number]['value'];

export function MechanicsTabs({ current }: { current: MechanicsTab }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(current);

  return (
    <Segmented
      role="navigation"
      label="메커니즘 보기"
      value={shown}
      onChange={(next) => {
        const href = TABS.find((t) => t.value === next)?.href;
        if (!href || next === shown) return;
        startTransition(() => {
          setShown(next);
          router.push(href);
        });
      }}
      options={TABS}
      tone="raised"
      settleKey={current}
      itemClassName="px-1.5 py-2 sm:px-4"
    />
  );
}
