/**
 * 로고 마크 — 원형 배지 안에 야구공 라인아트.
 *
 * 이모지(⚾)를 쓰면 기기·브라우저마다 그림이 제각각이라
 * (아이폰과 안드로이드가 서로 다른 공을 그린다) 직접 그린 도형으로 바꿨다.
 * 크기는 바깥에서 className으로 정하고, 공은 배지의 62%를 차지한다.
 */
export function BaseballMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-sky text-white ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[62%] w-[62%]"
      >
        {/* 공 테두리와 좌우 솔기 */}
        <g strokeWidth={1.6}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M5.3 5C8.5 8 8.5 16 5.3 19" />
          <path d="M18.7 5C15.5 8 15.5 16 18.7 19" />
        </g>
        {/* 실밥 땀 — 솔기보다 가늘게 그어야 뭉쳐 보이지 않는다 */}
        <g strokeWidth={1.2}>
          <path d="M5.3 6.7 8.4 7.95M6 10 9.2 10.7M6 14 9.2 13.3M5.3 17.3 8.4 16.05" />
          <path d="M18.7 6.7 15.6 7.95M18 10 14.8 10.7M18 14 14.8 13.3M18.7 17.3 15.6 16.05" />
        </g>
      </svg>
    </span>
  );
}
