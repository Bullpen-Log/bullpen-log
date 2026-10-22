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
/**
 * 예전 이름표 'BULLPEN LOG' — B 자리에 B 로고(2026-09-30 사용자분이 만든 로고). 2026-10-21 개편으로 앱 이름은 싱커가 됐지만, 투구 탭 제목 밑에
 * 작게 남긴다(금윤호 "투구 밑에 작게 원래의 불펜로그 B 와 글씨"). 높이 · 기준선 맞춤은 예전 Wordmark 그대로 — 글자 크기(text-*)만 정하면 된다.
 */
export function BullpenWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`text-display inline-flex items-baseline whitespace-nowrap leading-none ${className}`}
    >
      <BullpenMark className="mr-[0.07em] h-[0.7em]" />
      <span aria-hidden>ULLPEN LOG</span>
      <span className="sr-only">BULLPEN LOG</span>
    </span>
  );
}

/**
 * 임시 로고(2026-10-21 1단계, 사용자 "임시 로고는 네가 만들고 나중에 파일을 준다") — 파일이 오면 이 둘의 path 만 바꾼다.
 * 싱커: 공 하나가 아래로 가라앉는 꼬리(싱커 구종). 덕아웃: 지붕 밑 긴 의자.
 */
export function SinkerMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={`w-auto shrink-0 ${className}`}>
      <circle cx="26" cy="26" r="20" className="fill-brand" />
      <path
        d="M14 14c6 4 10 10 10 20M38 14c-6 4-10 10-10 20"
        fill="none"
        stroke="var(--color-surface, #fff)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M42 40c6 5 10 10 12 20"
        fill="none"
        className="stroke-brand"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function DugoutMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={`w-auto shrink-0 fill-dugout text-dugout ${className}`}
    >
      {/* 2026-10-22 금윤호가 준 새 덕아웃 로고 — 둥근 지붕 + 벤치(덕아웃 의자) */}
      <path d="M6.9 29.2 32.1 15.6 57.4 29.2" fill="none" stroke="currentColor" strokeWidth="7.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="11.2" y="33.3" width="42" height="7.7" rx="2.3" />
      <rect x="14.4" y="41.8" width="6.9" height="9.6" rx="2.3" />
      <rect x="43.1" y="41.8" width="6.9" height="9.6" rx="2.3" />
    </svg>
  );
}

/**
 * 이름표 — 싱커(선수 앱 · PC 의 내 싱커) 또는 덕아웃(웹). 기본은 싱커(예전 'BULLPEN LOG' 자리가 모두 앱 쪽이었다, lib/brand.ts).
 * 로고 높이는 글꼴(Bebas Neue)의 대문자 높이에 맞추고 바닥을 기준선에 붙여, 글자 크기(text-*)만 정하면 로고도 같이 커진다.
 */
export function Wordmark({
  className = '',
  brand = 'sinker',
}: {
  className?: string;
  brand?: 'sinker' | 'dugout';
}) {
  const Mark = brand === 'dugout' ? DugoutMark : SinkerMark;
  return (
    <span
      className={`text-display inline-flex items-baseline gap-[0.18em] whitespace-nowrap leading-none ${className}`}
    >
      <Mark className="h-[0.78em] self-center" />
      <span aria-hidden>{brand === 'dugout' ? 'DUGOUT' : 'SINKER'}</span>
      <span className="sr-only">{brand === 'dugout' ? '덕아웃' : '싱커'}</span>
    </span>
  );
}
