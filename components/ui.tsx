import Link from 'next/link';
import { NavTitle } from './nav-title';
import type { ComponentProps, ReactNode } from 'react';
import { ErrorLine } from '@/components/error-line';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/** 섹션 상단의 작은 골드 라벨 (예: "TRAINING") */
/** 한글이 한 글자라도 있으면 넓은 자간을 쓰지 않는다 */
const HAS_HANGUL = /[ㄱ-ㆎ가-힣]/;

/**
 * 페이지 제목 위의 작은 머리글 (HOME · LIBRARY …).
 *
 * 자간을 벌리는 것은 영문 대문자에서만 통한다. 한글에 0.25em 을 주면
 * '투 구 일 지'처럼 낱자로 흩어져, 낱말로 읽히지 않는다.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  const korean = typeof children === 'string' && HAS_HANGUL.test(children);
  return (
    <span
      className={`text-xs font-medium text-sky ${
        korean ? 'tracking-normal' : 'uppercase tracking-[0.25em]'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * 이전 화면으로 — 아이폰 화면 왼쪽 위의 파란 '‹ 이전 화면 이름'(2026-10-01 사용자 '애플처럼'). 2026-10-04 부터 진짜
 * 뒤로 가고(앞 화면이 목적지면), 휴대폰에서는 위 막대 왼쪽에 선다 — components/back-link.tsx.
 */
export { BackLink } from './back-link';

/** 휴대폰 큰 제목 위에 다는 오늘 날짜 — '10월 1일 수요일'(서울 시각) */
export function todayKicker(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Seoul',
  }).format(now);
}

export function PageHeading({
  kicker,
  title,
  titleArt,
  description,
  action,
  inlineAction = false,
}: {
  /**
   * 예전 PC 머리글(영어 대문자 · 넓은 자간 'PITCH LOG')— 더는 보이지 않는다. 웹 템플릿의 머리글이라 AI 가 만든 화면처럼
   * 보였다(2026-10-04 'AI 티 줄이기'). 부르는 곳이 많아 자리만 남긴다.
   */
  eyebrow?: string;
  /** 휴대폰에서 큰 제목 위에 회색 작은 글씨로 — 앱스토어 '투데이' 위의 날짜처럼(예: '10월 1일 수요일') */
  kicker?: string;
  title: string;
  /**
   * 휴대폰에서 큰 제목 글자 대신 그릴 그림 — 홈의 불펜로그 로고(2026-10-06 사용자 "홈 화면 맨 위에 불펜로그 로고").
   * 제목 글(title)은 PC · 화면 읽기 · 위 막대의 작은 제목으로 그대로 남는다.
   */
  titleArt?: ReactNode;
  description?: string;
  action?: ReactNode;
  /**
   * 휴대폰에서도 단추(action)를 제목 오른쪽에 — 아이폰 큰 제목 옆 '+' 처럼(투구 기록, 2026-10-04 '앱 느낌' 4단계).
   * 없으면 휴대폰은 제목 밑으로 내려간다.
   */
  inlineAction?: boolean;
}) {
  return (
    /*
     * 제목 묶음은 한 화면의 머리일 뿐이라 낮게 둔다. 예전에는 글자 2.5rem · 밑 여백 2rem 으로
     * 150px 가까이 차지해, 화면마다 본문이 그만큼 밑으로 밀려 스크롤이 늘었다.
     */
    /*
     * 제목 글자는 모든 탭이 같은 page-title(globals.css — 휴대폰 32px 큰 제목, PC 24px). PC 는 모든 탭 · 모든 높이에서
     * 같은 낮은 머리. 휴대폰은 애플의 큰 제목처럼 영어 머리글 · 밑줄 없이 제목 하나(2026-10-01 '애플처럼').
     */
    <div
      /* PC 밑줄은 실선 대신 실밥 땀 줄(stitch-rule, globals.css — 2026-10-04 불펜로그다움) */
      className={`flex gap-4 pb-1 desk:stitch-rule desk:pb-4 ${
        inlineAction ? 'flex-row items-end justify-between' : 'flex-col sm:flex-row sm:items-end sm:justify-between'
      }`}
    >
      <div className="space-y-1">
        {kicker && <p className="text-sm font-medium text-muted desk:hidden">{kicker}</p>}
        <h1 className="text-heading page-title text-ink">
          {titleArt ? (
            <>
              <span aria-hidden className="block desk:hidden">{titleArt}</span>
              <span className="sr-only desk:not-sr-only">{title}</span>
            </>
          ) : (
            title
          )}
        </h1>
        {/* 큰 제목이 스크롤로 가려지면 위 막대 가운데에 작은 제목이 나온다(아이폰처럼, components/nav-title.tsx) */}
        <NavTitle title={title} />
        {description && (
          <p className="max-w-2xl break-keep text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * 블록(카드) — 모든 탭의 큰 덩이. 안쪽 여백은 모든 탭이 같은 --block-pad(휴대폰 20 · PC 16px,
 * globals.css '크기 기준'). 여백을 className 으로 따로 주지 않는다 — 탭마다 달라져 중구난방이 된다.
 */
export function Card({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface p-(--block-pad) shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-sky text-white hover:bg-sky-strong focus-visible:outline-sky font-semibold',
  /* 휴대폰은 테두리 없이 옅은 회색 채움(아이폰 단추), PC 는 예전 테두리 상자(2026-10-01 '애플처럼') */
  secondary:
    'border border-transparent bg-ink/6 text-ink hover:text-sky focus-visible:outline-sky desk:border-line-strong desk:bg-surface-2 desk:hover:border-sky',
  ghost: 'text-muted hover:text-ink focus-visible:outline-line-strong',
  danger:
    'border border-transparent bg-danger-bg text-danger focus-visible:outline-danger desk:border-danger-line desk:hover:border-danger',
};

/* 휴대폰은 알약 모양(아이폰 iOS 26 의 단추처럼, 2026-10-01 사용자 "동글동글") · PC 는 예전 모서리 */
const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full desk:rounded-xl px-5 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button className={cn(buttonBase, buttonStyles[variant], className)} {...props} />
  );
}

export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link className={cn(buttonBase, buttonStyles[variant], className)} {...props} />
  );
}

/*
 * 입력칸 — 휴대폰은 테두리 없는 옅은 회색 면(아이폰 입력칸), 누르면 파랑으로 두르고 흰 바탕. PC 는 예전 테두리 칸
 * (2026-10-01 '애플처럼').
 */
const fieldStyles =
  'w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-medium tracking-normal text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted/70">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldStyles, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldStyles, 'resize-y', className)} {...props} />;
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-transparent bg-ink/6 px-3 py-1 text-xs text-muted desk:border-line-strong desk:bg-transparent',
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * 데이터가 없을 때 보여주는 빈 상태 — 아이폰의 빈 화면처럼 흐린 큰 아이콘 · 제목 · 한 줄 · 단추를 가운데에.
 * 휴대폰은 상자 없이, PC 는 예전 점선 상자(2026-10-01 '애플처럼').
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  /** 무엇이 비었는지 한눈에 — lucide 아이콘 하나(크기 · 색 · 굵기는 여기서 맞춘다) */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    /* 오른쪽 아래 귀퉁이에 옅은 실밥 무늬(seam-corner, globals.css) — 야구 앱의 빈 화면으로 읽히게(2026-10-04) */
    <div className="seam-corner flex flex-col items-center justify-center gap-2 rounded-2xl px-6 py-14 text-center desk:gap-3 desk:border desk:border-dashed desk:border-line desk:py-16">
      {icon && (
        <span
          aria-hidden
          className="mb-1 text-muted/45 [&_svg]:h-12 [&_svg]:w-12 [&_svg]:stroke-[1.5] desk:[&_svg]:h-9 desk:[&_svg]:w-9"
        >
          {icon}
        </span>
      )}
      <p className="text-base font-semibold text-ink desk:text-sm desk:font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed break-keep text-muted">{description}</p>
      )}
      {action && <div className="mt-2 desk:mt-0">{action}</div>}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  /* 새 오류가 뜨면 보이는 자리로 굴려 온다 — 저장 단추는 밑, 이 칸은 위라 실패를 못 봤다(components/error-line.tsx) */
  return <ErrorLine>{children}</ErrorLine>;
}
