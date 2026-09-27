/**
 * 불펜 벨로시티 — 구속 측정의 이름표.
 *
 * 앱 전체 로고(BaseballMark)와 같은 하늘색 · 같은 공이지만, 왼쪽에 속도 선 셋을 그어 '빠르게
 * 날아가는 공'으로 읽히게 했다. 글자는 앱 이름과 같은 display 글꼴 — 한 식구라는 것이 보이게.
 *
 * mark 만 쓰면 단추 · 칩에, wordmark 는 홈 머리에.
 */
export function VelocityMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-sky text-white ${className}`}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[70%] w-[70%]"
      >
        {/* 속도 선 — 왼쪽에서 오른쪽으로, 위가 길다 */}
        <g strokeWidth={2}>
          <path d="M3 11h7" />
          <path d="M5 16h5" />
          <path d="M3 21h7" />
        </g>
        {/* 공과 솔기 */}
        <g strokeWidth={1.8}>
          <circle cx="20" cy="16" r="8.5" />
          <path d="M14.6 9.8c2.6 2.8 2.6 9.6 0 12.4" />
          <path d="M25.4 9.8c-2.6 2.8-2.6 9.6 0 12.4" />
        </g>
        <g strokeWidth={1.3}>
          <path d="M15 12.4 17.4 13M15.4 15.2 17.9 15.6M15.4 16.8 17.9 16.4M15 19.6 17.4 19" />
          <path d="M25 12.4 22.6 13M24.6 15.2 22.1 15.6M24.6 16.8 22.1 16.4M25 19.6 22.6 19" />
        </g>
      </svg>
    </span>
  );
}

export function VelocityWordmark({
  size = 'lg',
  className = '',
}: {
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const big = size === 'lg';
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <VelocityMark className={big ? 'h-14 w-14' : 'h-8 w-8'} />
      <div className="leading-none">
        <p
          className={`text-display text-sky ${big ? 'text-[15px]' : 'text-[10px]'} tracking-[0.18em]`}
        >
          BULLPEN
        </p>
        <p
          className={`text-display text-ink ${big ? 'mt-0.5 text-[2.25rem]' : 'text-lg'} tracking-wide`}
        >
          VELOCITY
        </p>
      </div>
    </div>
  );
}
