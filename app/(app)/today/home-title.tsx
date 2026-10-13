import { appNow } from '@/lib/clock';

const part = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ko-KR', { ...opts, timeZone: 'Asia/Seoul' }).format(appNow());

/**
 * 홈의 큰 제목 자리(휴대폰) — 오늘 날짜를 큰 제목으로('10월 13일' + 작은 '월요일'). 불펜로그 로고는 위 막대 왼쪽으로 옮겼다
 * (2026-10-13 김민 "공간을 너무 많이 차지 — 맨 위 막대로" → 작은 회색 날짜는 "밋밋하고 위아래가 애매하게 빈다" → 날짜를 큰 제목으로).
 * 큰 제목 글꼴(page-title)을 그대로 물려받아 다른 탭 제목과 같은 크기 · 줄 높이다.
 *
 * PageHeading 의 titleArt 로 넘긴다 — 제목 글 '홈'은 PC · 화면 읽기 · 위 막대의 작은 제목으로 남는다. loading.tsx 도 같은 것을 그린다.
 */
export function HomeTitleArt() {
  return (
    <>
      {part({ month: 'long', day: 'numeric' })}
      <span className="ml-2 text-lg font-semibold tracking-normal text-muted">{part({ weekday: 'long' })}</span>
    </>
  );
}
