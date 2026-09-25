'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Segmented } from '@/components/segmented';

/**
 * 암케어 안의 세 칸 — [오늘의 암케어 | 부위별 보강 | 훈련 방식].
 *
 * 트레이닝의 [오늘 | 기록 | 암케어]처럼 주소로 나눈다(?view=armcare&tab=guide).
 * 부위별 보강은 암케어 운동을 다 늘어놓는 화면이라, 오늘 루틴만 보러 온 사람에게
 * 그 짐까지 내려보낼 까닭이 없다. 움직임도 트레이닝 고르개와 같다(view-switch.tsx).
 */
const TABS = [
  { value: 'today', label: '오늘의 암케어', href: '/training?view=armcare' },
  { value: 'guide', label: '부위별 보강', href: '/training?view=armcare&tab=guide' },
  { value: 'methods', label: '훈련 방식', href: '/training?view=armcare&tab=methods' },
] as const;

export type ArmcareTab = (typeof TABS)[number]['value'];

export function ArmcareTabs({ current }: { current: ArmcareTab }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(current);

  return (
    <Segmented
      role="navigation"
      label="암케어 보기"
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
