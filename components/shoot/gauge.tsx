/**
 * 촬영 진행 게이지 — 바깥 고리 = 찍은 비율, 안쪽 고리 = 우리 영상으로 올린 비율.
 *
 * 앱의 다른 고리(오늘 링 · 영양 링)와 같은 그림(r=27 · 굵기 7 · pathLength 100)이고 같은 움직임(.ring-grow — 처음 그릴 때
 * 0 에서 차오른다, 움직임 줄이기면 바로)이다. 색은 sky 하나 — 안쪽 고리는 같은 색을 옅게.
 */
export function ShootGauge({
  done,
  uploaded,
  total,
  size = 'lg',
}: {
  done: number;
  uploaded: number;
  total: number;
  size?: 'lg' | 'md';
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const up = total > 0 ? Math.round((uploaded / total) * 100) : 0;
  const box = size === 'lg' ? 'h-44 w-44 desk:h-48 desk:w-48' : 'h-28 w-28';
  return (
    <div
      role="img"
      aria-label={`${total}개 가운데 ${done}개 찍음(${pct}%), ${uploaded}개 올림`}
      className={`relative grid shrink-0 place-items-center ${box}`}
    >
      <svg aria-hidden viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          strokeWidth="6"
          className="stroke-ink/8"
        />
        {pct > 0 && (
          <circle
            cx="32"
            cy="32"
            r="27"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - pct}
            className="ring-grow stroke-sky transition-[stroke-dashoffset] duration-700"
          />
        )}
        <circle
          cx="32"
          cy="32"
          r="19.5"
          fill="none"
          strokeWidth="3"
          className="stroke-ink/6"
        />
        {up > 0 && (
          <circle
            cx="32"
            cy="32"
            r="19.5"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - up}
            className="ring-grow stroke-sky/45 transition-[stroke-dashoffset] duration-700"
          />
        )}
      </svg>
      <div className="text-center">
        <p
          className={`text-numeric leading-none text-ink ${size === 'lg' ? 'text-5xl desk:text-4xl' : 'text-2xl'}`}
        >
          {pct}
          <span className={size === 'lg' ? 'text-2xl desk:text-xl' : 'text-sm'}>%</span>
        </p>
        <p className="mt-1 text-xs tabular-nums text-muted">
          {done} / {total}
        </p>
      </div>
    </div>
  );
}

/**
 * 쌓은 막대 — 찍음(sky) · 다시 찍기(warn) · 미룸(옅은 회색) · 남음(바탕).
 */
export function StackBar({
  done,
  redo,
  later,
  total,
  className = 'h-2',
  label,
}: {
  done: number;
  redo: number;
  later: number;
  total: number;
  className?: string;
  label?: string;
}) {
  const w = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;
  return (
    <div
      role="progressbar"
      aria-label={label ?? '촬영 진행'}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${total}개 가운데 ${done}개 찍음${redo ? ` · 다시 찍기 ${redo}` : ''}${later ? ` · 미룸 ${later}` : ''}`}
      className={`flex w-full overflow-hidden rounded-full bg-ink/8 ${className}`}
    >
      <span
        className="bg-sky transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: w(done) }}
      />
      <span
        className="bg-warn/70 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: w(redo) }}
      />
      <span
        className="bg-ink/25 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: w(later) }}
      />
    </div>
  );
}
