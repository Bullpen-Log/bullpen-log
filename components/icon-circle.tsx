import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from '@/components/icon';

/**
 * 색 원 + 흰 글리프 — 아이폰 전화 앱 · 공유 시트 · 설정 목록의 동작 단추 모양(2026-10-14, docs/designs/icon-system.md 규칙 2 · 3 · 4).
 *
 * 크기 둘만: 목록 줄 44px(`sm`), 탭 · 큰 단추 56px(`lg`). 글리프는 원의 55%.
 * 색 셋만: `sky`(테마 파랑 — 기본) · `danger`(지우기만) · `tint`(앱별 한 색 — components/nav-icons.tsx NAV_TINT 의 짙은 쪽).
 * 어두운 테마는 토큰이 알아서 한 단계 밝아진다(globals.css 의 sky · danger). tint 는 두 색 중 밝은 쪽을 쓴다.
 *
 * 둥근 네모(앱 아이콘)는 김민의 components/app-icon.tsx — 더보기 메뉴 전용. 그 밖의 자리는 전부 이 원이다.
 */
export type CircleSize = 'sm' | 'lg';
export type CircleTone = 'sky' | 'danger' | 'tint';

const PX: Record<CircleSize, number> = { sm: 44, lg: 56 };

const TONE: Record<Exclude<CircleTone, 'tint'>, string> = {
  sky: 'bg-sky text-white',
  danger: 'bg-danger text-white',
};

export function IconCircle({
  Icon,
  size = 'sm',
  tone = 'sky',
  tint,
  className = '',
  children,
}: {
  Icon?: LucideIcon;
  size?: CircleSize;
  tone?: CircleTone;
  /** tone='tint' 일 때 [밝은 색, 짙은 색] — NAV_TINT 한 줄 */
  tint?: [string, string];
  className?: string;
  /** Icon 대신 넣을 것(글자 · 다른 svg) */
  children?: ReactNode;
}) {
  const px = PX[size];
  const g = Math.round(px * 0.55);
  const style: CSSProperties = { width: px, height: px };
  let toneClass = '';
  if (tone === 'tint' && tint) {
    style.background = `linear-gradient(180deg, ${tint[0]}, ${tint[1]})`;
    toneClass = 'text-white';
  } else {
    toneClass = TONE[tone === 'tint' ? 'sky' : tone];
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full ${toneClass} ${className}`}
      style={style}
    >
      {Icon ? <Icon width={g} height={g} /> : children}
    </span>
  );
}

/**
 * 원 단추 — 누르는 자리는 원 자체(44 · 56px 이라 이미 손가락 크기). 누르면 살짝 작아진다.
 * 이름(aria-label)은 꼭 준다 — 원 안에 글자가 없다.
 */
export function CircleButton({
  Icon,
  label,
  size = 'sm',
  tone = 'sky',
  tint,
  className = '',
  ...rest
}: {
  Icon: LucideIcon;
  label: string;
  size?: CircleSize;
  tone?: CircleTone;
  tint?: [string, string];
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-grid shrink-0 place-items-center rounded-full transition-[transform,opacity] duration-75 active:opacity-80 motion-safe:active:scale-95 disabled:opacity-40 ${className}`}
      {...rest}
    >
      <IconCircle Icon={Icon} size={size} tone={tone} tint={tint} />
    </button>
  );
}
