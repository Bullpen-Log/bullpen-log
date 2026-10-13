import { todayKicker } from '@/components/ui';

/**
 * 홈의 큰 제목 자리(휴대폰) — 오늘 날짜. 불펜로그 로고는 위 막대 왼쪽으로 옮겼다(2026-10-13 김민 "공간을 너무 많이 차지 —
 * 맨 위 막대로", components/app-shell.tsx MobileTopBar).
 *
 * PageHeading 의 titleArt 로 넘긴다 — 제목 글 '홈'은 PC · 화면 읽기 · 위 막대의 작은 제목으로 남는다. PC 는 왼쪽 위에
 * 로고가 늘 떠 있어(components/app-shell.tsx) 예전 머리 그대로. 큰 제목의 굵기(800)를 물려받지 않게 굵기 · 자간을 되돌린다
 * — 로고 글꼴(Bebas)은 한 굵기뿐이라 굵게 하면 가짜로 두꺼워진다. loading.tsx 도 같은 것을 그려 자리가 안 바뀐다.
 */
export function HomeTitleArt() {
  return (
    <span className="block text-sm font-medium tracking-normal text-muted">{todayKicker()}</span>
  );
}
