'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Segmented } from '@/components/segmented';

/**
 * 오늘 할 것, 지난 기록, 암케어를 오가는 세 칸.
 *
 * 주소로 나눈다(?view=history). 화면 안에서 접었다 폈다 하면 오늘 것과 지난
 * 것을 둘 다 그려서 내려보내야 하는데, 지난 기록은 달력이라 짐이 따로 있다.
 * 주소로 나누면 보는 쪽만 그린다.
 *
 * 암케어는 2026-09-25 에 더했다. 운동 일정에서 빠져 따로 하는 곳이 됐는데,
 * 하단 탭을 늘리지 않고 트레이닝 안에 두기로 했다(사용자분과 정함).
 */
const VIEWS = [
  { value: 'today', label: '오늘', href: '/training' },
  { value: 'history', label: '기록', href: '/training?view=history' },
  { value: 'armcare', label: '암케어', href: '/training?view=armcare' },
] as const;

export type TrainingView = (typeof VIEWS)[number]['value'];

/**
 * [오늘 | 기록] 고르개 — 다른 고르개들처럼 고른 쪽 밑의 알약이 미끄러진다.
 *
 * 누르는 즉시 알약이 가고, 화면은 그 뒤에 온다. 서버가 새 화면을 그려 보내는
 * 동안(달력 짐이 있는 '기록'은 특히) 알약이 먼저 가 있으면 눌렸다는 것을 바로 안다.
 *
 * 알약의 자리는 useOptimistic 으로 든다. 화면을 불러오는 흐름(transition)이
 * 끝날 때까지만 '누른 곳'이고, 끝나면 서버가 보낸 진짜 값(current)으로 돌아온다 —
 * 불러오다 실패해도 알약이 엉뚱한 칸에 남지 않는다. 그래서 링크가 스스로 옮겨
 * 가게 두지 않고 router.push 를 같은 흐름 안에서 부른다.
 */
export function TrainingViewSwitch({ current }: { current: TrainingView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(current);

  return (
    <Segmented
      role="navigation"
      label="트레이닝 보기"
      value={shown}
      onChange={(next) => {
        const href = VIEWS.find((v) => v.value === next)?.href;
        if (!href || next === shown) return;
        startTransition(() => {
          setShown(next);
          router.push(href);
        });
      }}
      options={VIEWS}
      tone="raised"
      size="md"
      /* 새 화면이 붙는 순간 알약이 제자리에 있게 — 화면 전환이 그 모습을 찍는다 */
      settleKey={current}
      /*
       * 칸이 셋이라 휴대폰에서는 좁힌다 — 설정 단추와 한 줄에 들어가게. px-4 로는
       * 한 줄이 359px 이라 375px 폰(쓸 수 있는 폭 343px)에서 설정 단추가 밑으로
       * 내려갔다. px-2.5 면 323px 로 360px 폰까지 들어간다.
       */
      itemClassName="px-2.5 py-2 sm:px-6"
    />
  );
}
