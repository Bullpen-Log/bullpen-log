/**
 * 로고 — 굵은 세로 막대 하나와 반원 둘로 짠 B (2026-09-30 사용자분이 만든 새 로고).
 *
 * 원본 그림(2000×922)의 B 를 픽셀로 재서 옮겼다 — 594 × 613 칸, 막대 237 칸, 막대와
 * 반원 사이 44 칸, 두 반원 사이 47 칸. 아래 반원이 위보다 조금 더 나온다(원본 그대로).
 *
 * 색은 원본의 파랑(#0297e4, globals.css 의 --color-brand) — 앱의 하늘색(sky)보다
 * 조금 깊다. 아이콘 파일(scripts/make-icons.mjs, mobile/scripts/make-ios-assets.mjs)도
 * 같은 모양 · 같은 색으로 만든다. 로고를 바꾸면 셋을 같이 고친다.
 */
export const MARK_VIEWBOX = '0 0 594 613';
export const MARK_PATH =
  'M0 0H237V613H0Z' +
  'M281 0H453A125 141 0 0 1 453 282H281Z' +
  'M281 329H470A124 142 0 0 1 470 613H281Z';

/** B 표시 하나 — 크기는 바깥에서 className 으로(높이만 주면 너비는 따라온다) */
export function BullpenMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      aria-hidden
      className={`w-auto shrink-0 fill-brand ${className}`}
    >
      <path d={MARK_PATH} />
    </svg>
  );
}

/**
 * 앱 이름 — 'BULLPEN LOG' 의 첫 글자 B 자리에 로고를 넣었다(사용자 요청).
 *
 * 로고 높이는 글꼴(Bebas Neue)의 대문자 높이 0.7em 에 맞추고 바닥을 글자 기준선에
 * 붙여, 글자 크기(text-*)만 정하면 로고도 같이 커지고 한 단어로 읽힌다. 글자색도
 * 따로 안 주면 둘레 글자색을 물려받는다 — 로고는 늘 파랑이다.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`text-display inline-flex items-baseline whitespace-nowrap leading-none ${className}`}>
      <BullpenMark className="mr-[0.07em] h-[0.7em]" />
      <span aria-hidden>ULLPEN LOG</span>
      <span className="sr-only">BULLPEN LOG</span>
    </span>
  );
}
