import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * 휴대폰 더보기의 앱 아이콘 — 아이폰(iOS 26) 앱 아이콘처럼 유리 · 입체(2026-10-13 김민: "10점에 2점 — 3D · 글라스 느낌, 실제 아이폰 앱처럼").
 *
 * 겹:
 * 1. 판 — 앱 색 두 가지(t1 밝음 → t2 짙음) 대각 그라데이션, 둥근 네모(22.5%, 되는 브라우저는 squircle).
 * 2. 유리 — 위 왼쪽에서 비치는 반사(radial) · 아래 가장자리로 새어 나오는 빛(유리를 지난 빛) · 안쪽 테두리 빛 · 바닥 안쪽 그늘.
 * 3. 그림 — 짙은 색으로 한 번 아래로 밀어 그린 '두께'(돌출) 위에 흰 → 옅은 하늘색 그라데이션 선, 그 밑 부드러운 그림자.
 * 4. 바깥 그림자 — 앱 색이 비친 그림자 + 바닥 접촉 그림자.
 * 그라데이션 정의(#app-glyph)는 이 부품이 한 번씩 그리는 숨은 svg 에 있다(같은 id 여러 번이어도 첫 것을 쓴다).
 */
export function AppIcon({
  Icon,
  tint,
  look = 'tint',
  active = false,
  size = 60,
  className = '',
  style,
}: {
  Icon: LucideIcon;
  /** [밝은 색, 짙은 색] — look="tint" 에서만 쓴다 */
  tint: [string, string];
  /**
   * tint — 앱 색 유리(위 설명). clear — iOS 26 '클리어' 모드(2026-10-14 사용자: "색은 투명, 로고만 흰색"): 색 없이 반투명 유리 판 +
   * 뒤 흐림 + 위쪽 빛 테두리 + 흰 글리프. 어두운 뒤(더보기 폴더의 흐린 막) 위에서 쓴다.
   */
  look?: 'tint' | 'clear';
  /** 지금 화면(clear) — 판을 더 밝게 + 흰 테두리 */
  active?: boolean;
  /** px, 또는 clear 에서는 CSS 길이('var(--tile)') — 폴더가 화면 높이에 맞춰 정한다 */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const [t1, t2] = tint;
  const px = typeof size === 'number' ? size : 60;
  const g = Math.round(px * 0.5);
  if (look === 'clear') {
    const gs = typeof size === 'number' ? g : `calc(${size} * 0.5)`;
    return (
      <span
        /*
         * 색은 테마가 정한다(globals.css 의 --tile-*, 2026-10-14 사용자 "화이트는 하늘색을 옅게 반투명, 네이비는 네이비 반투명, 다크는 그대로").
         * 값이 없으면 어두운 뒤의 흰 유리(다크).
         */
        className={`relative isolate grid shrink-0 place-items-center overflow-hidden rounded-[22.5%] text-(--tile-fg,#fff) [corner-shape:squircle] ${className}`}
        style={{
          width: size,
          height: size,
          background: active
            ? 'var(--tile-bg-active, rgba(255,255,255,0.28))'
            : 'var(--tile-bg, rgba(255,255,255,0.14))',
          backdropFilter: 'blur(14px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
          boxShadow: [
            'inset 0 1px 0 var(--tile-gloss, rgba(255,255,255,0.45))',
            'inset 0 -1px 0 rgba(0,0,0,0.18)',
            active
              ? '0 0 0 1.5px var(--tile-ring-active, rgba(255,255,255,0.55))'
              : '0 0 0 1px var(--tile-ring, rgba(255,255,255,0.22))',
            '0 8px 20px -10px var(--tile-shadow, rgba(0,0,0,0.6))',
          ].join(','),
          ...style,
        }}
      >
        <Icon
          aria-hidden
          width={g}
          height={g}
          stroke="currentColor"
          style={{
            width: gs,
            height: gs,
            filter: 'drop-shadow(0 1px 1px var(--tile-glyph-shadow, rgba(0,0,0,0.35)))',
          }}
        />
      </span>
    );
  }
  return (
    <span
      className={`relative isolate grid shrink-0 place-items-center overflow-hidden rounded-[22.5%] [corner-shape:squircle] ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, ${t1} 0%, color-mix(in oklab, ${t1}, ${t2} 55%) 48%, ${t2} 100%)`,
        boxShadow: [
          'inset 0 0 0 0.5px rgba(255,255,255,0.45)',
          'inset 0 1.5px 1px rgba(255,255,255,0.65)',
          'inset 0 -3px 6px rgba(0,0,0,0.22)',
          `0 10px 18px -8px color-mix(in oklab, ${t2}, black 25%)`,
          '0 2px 3px rgba(0,0,0,0.18)',
        ].join(','),
        ...style,
      }}
    >
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="app-glyph" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#dfe9ff" />
          </linearGradient>
        </defs>
      </svg>
      {/* 유리 반사 — 위 왼쪽 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            'radial-gradient(120% 85% at 22% -8%, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.18) 38%, rgba(255,255,255,0) 60%)',
        }}
      />
      {/* 유리를 지난 빛 — 아래 가장자리 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 55% at 50% 118%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 70%)',
        }}
      />
      {/* 그림 — 두께(짙은 색으로 아래로) + 앞면(흰 그라데이션) */}
      <span
        className="relative grid place-items-center"
        style={{ width: g, height: g }}
      >
        <Icon
          aria-hidden
          className="absolute"
          width={g}
          height={g}
          strokeWidth={2.6}
          style={{
            color: `color-mix(in oklab, ${t2}, black 35%)`,
            transform: 'translateY(1.6px)',
            filter: 'blur(0.4px) drop-shadow(0 2px 2.5px rgba(0,0,0,0.35))',
            opacity: 0.85,
          }}
        />
        <Icon
          aria-hidden
          className="relative"
          width={g}
          height={g}
          strokeWidth={2.4}
          stroke="url(#app-glyph)"
        />
      </span>
    </span>
  );
}
