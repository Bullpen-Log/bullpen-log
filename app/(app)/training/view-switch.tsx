'use client';

import { useEffect, useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Segmented } from '@/components/segmented';
import {
  TRAINING_PART_COOKIE,
  TRAINING_PART_HREF,
  type TrainingPart,
} from '@/lib/training-part';

/**
 * 트레이닝과 암케어를 오가는 두 칸.
 *
 * 주소로 나눈다(?view=armcare). 화면 안에서 접었다 폈다 하면 두 칸을 다 그려서
 * 내려보내야 하는데, 서로 읽는 자료가 다르다. 주소로 나누면 보는 쪽만 그린다.
 *
 * 2026-09-26 [오늘 | 기록 | 암케어] 세 칸에서 둘로 줄였다. 트레이닝과 암케어는 서로
 * 독립이고(암케어는 언제든 따로 한다), 지난 기록은 홈 캘린더에서 본다
 * (lib/training-part.ts).
 */
const VIEWS = [
  { value: 'today', label: '트레이닝', href: TRAINING_PART_HREF.today },
  { value: 'armcare', label: '암케어', href: TRAINING_PART_HREF.armcare },
] as const satisfies readonly { value: TrainingPart; label: string; href: string }[];

export type TrainingView = TrainingPart;

/** 한 해 — 마지막으로 본 칸은 오래 기억해도 된다 */
const REMEMBER_SECONDS = 60 * 60 * 24 * 365;

/**
 * [트레이닝 | 암케어] 고르개 — 다른 고르개들처럼 고른 쪽 밑의 알약이 미끄러진다.
 *
 * 누르는 즉시 알약이 가고, 화면은 그 뒤에 온다. 서버가 새 화면을 그려 보내는
 * 동안 알약이 먼저 가 있으면 눌렸다는 것을 바로 안다.
 *
 * 알약의 자리는 useOptimistic 으로 든다. 화면을 불러오는 흐름(transition)이
 * 끝날 때까지만 '누른 곳'이고, 끝나면 서버가 보낸 진짜 값(current)으로 돌아온다 —
 * 불러오다 실패해도 알약이 엉뚱한 칸에 남지 않는다. 그래서 링크가 스스로 옮겨
 * 가게 두지 않고 router.push 를 같은 흐름 안에서 부른다.
 *
 * 보고 있는 칸을 쿠키에 적는다 — 다음에 아래 탭으로 들어오면 이 칸이 열린다.
 * 고르개를 누를 때가 아니라 칸이 떠 있을 때 적는 것은, 다른 화면의 링크로 암케어에
 * 들어온 경우도 '마지막으로 본 칸'이기 때문이다.
 */
export function TrainingViewSwitch({ current }: { current: TrainingView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(current);

  useEffect(() => {
    document.cookie = `${TRAINING_PART_COOKIE}=${current}; path=/; max-age=${REMEMBER_SECONDS}; samesite=lax`;
  }, [current]);

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
      /* 칸이 둘이라 설정 단추와 한 줄에 넉넉히 들어간다 */
      itemClassName="px-5 py-2 sm:px-8"
    />
  );
}
