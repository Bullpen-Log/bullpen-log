/**
 * 싱커 로고 — 아래로 꺾여 내려가는 화살표가 붙은 S(2026-10-22 금윤호가 준 그림, **초안 · 임시** — 바뀔 수 있다).
 *
 * 원본 그림(1254 × 1254)의 가장자리를 따서 옮겼다(가장자리를 부드럽게 한 뒤 윤곽을 따 점을 줄이고, 여백 없이 원점으로 — 원본 픽셀 단위). 글자 S 자리에 이 로고를
 * 넣어 'SINKER' 를 [로고]INKER 로 쓴다(예전 B 로고 + ULLPEN LOG 와 같은 방식). 색은 --color-brand.
 * 같은 모양을 쓰는 곳: native/src/shell/wordmark.tsx(앱 이름표 · 시작 연출) · scripts/make-icons.mjs(웹 아이콘) ·
 * scripts/make-sinker-app-assets.mjs(앱 아이콘 · 시작 화면). 로고를 바꾸면 넷을 같이 고친다.
 */
export const MARK_VIEWBOX = '0 0 1006 1001';
export const MARK_ASPECT = 1006 / 1001;
export const MARK_PATH =
  'M275 0l631 0l17 2l18 7l13 9l9 12l5 15l1 15l-4 15l-8 14l-119 116l-14 11l-20 10l-15 4l-21 2l-75-1l-19 1l-350 0l-18 6l-10 6l-6 5l-6 7l-5 8l-5 18l-1 10l2 12l5 12l6 9l7 8l8 6l12 5l12 3l401 1l16 2l16 4l23 10l18 13l74 72l42 43l8 12l5 12l5 14l2 15l2 37l-1 103l0 64l1 8l5 8l6 5l31 4l7 2l7 5l7 7l4 7l2 11l-1 8l-4 12l-11 13l-144 139l-21 16l-15 6l-14 1l-16-3l-14-8l-16-13l-135-136l-8-8l-5-10l-3-10l1-13l4-10l6-8l7-5l8-3l34-4l8-6l3-8l0-135l-2-9l-4-11l-8-9l-9-8l-15-7l-22-3l-399 0l-27-4l-13-5l-13-6l-11-8l-10-7l-103-102l-13-14l-8-14l-9-20l-3-25l-1-61l1-50l1-14l4-14l6-14l6-11l17-22l98-97l58-56l17-11l21-10l20-6ZM198 663l355 0l11 1l10 3l8 4l10 8l8 9l5 9l3 9l1 11l-1 10l-2 11l-7 12l-9 11l-19 19l-7 9l-5 12l-6 27l-11 21l-8 9l-10 9l-13 7l-12 5l-22 3l-440-1l-9-2l-11-6l-8-9l-5-7l-3-12l0-10l3-9l5-10l13-14l81-79l41-38l11-8l14-7l15-4Z';

/** 싱커 로고 하나 — 크기는 바깥에서 className 으로(높이만 주면 너비는 따라온다) */
export function SinkerMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden className={`shrink-0 fill-brand ${className}`}>
      <path d={MARK_PATH} />
    </svg>
  );
}

/** 덕아웃 로고 — 둥근 지붕 + 벤치(2026-10-22 금윤호가 준 그림) */
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
 * 이름표 — 싱커(선수 앱 · PC 의 내 싱커) 또는 덕아웃(웹). 기본은 싱커.
 * 싱커는 S 자리에 싱커 로고를 넣어 [로고]INKER(2026-10-22 금윤호 "sinker 의 s 는 이 로고로") — 로고 높이는 글꼴(Bebas Neue)의 대문자 높이
 * 0.7em, 바닥을 글자 기준선에 붙인다. 덕아웃은 로고 + DUGOUT. 글자 크기(text-*)만 정하면 로고도 같이 커진다.
 */
export function Wordmark({
  className = '',
  brand = 'sinker',
  morphTarget = false,
}: {
  className?: string;
  brand?: 'sinker' | 'dugout';
  /** 덕아웃 → 싱커 시작 판(components/shell-morph.tsx SinkerIntro)의 이름이 날아와 앉을 자리 */
  morphTarget?: boolean;
}) {
  if (brand === 'sinker') {
    return (
      <span
        data-morph-logo={morphTarget || undefined}
        className={`text-display inline-flex items-baseline whitespace-nowrap leading-none ${className}`}
      >
        {/*
          * S 아래 막대(1001칸 중 882칸)를 글자 기준선에 — 몸통이 대문자 높이 0.7em, 화살표만 밑으로(2026-10-22 금윤호 "s로고 밑의 평평한 부분으로 높이를 맞춰").
          * 크기는 높이 · 폭 둘 다 적고(w-auto 는 사파리 플렉스에서 0 이 되어 로고가 사라졌다) 내림은 transform 으로(position 을 바꾸지 않는다).
          */}
        <SinkerMark className="mr-[0.05em] h-[0.794em] w-[0.798em] translate-y-[0.094em]" />
        <span aria-hidden>INKER</span>
        <span className="sr-only">싱커</span>
      </span>
    );
  }
  return (
    <span
      className={`text-display inline-flex items-baseline gap-[0.18em] whitespace-nowrap leading-none ${className}`}
    >
      <DugoutMark className="h-[0.78em] self-center" />
      <span aria-hidden>DUGOUT</span>
      <span className="sr-only">덕아웃</span>
    </span>
  );
}
