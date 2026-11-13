'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, CircleAlert, Loader2 } from '@/components/icon';
import { Wordmark } from '@/components/logo';
import { Button } from '@/components/ui';

/** 안내 단계 다섯 — 위의 가는 막대가 쓴다 */
const GUIDED_STEPS = 5;

/**
 * 한 화면에 한 가지 — 제목, 한 줄 설명, 내용, 바닥의 큰 단추.
 * 휴대폰은 좌우 20px 한 칸, PC 는 가운데 528px. 바닥 단추는 홈 막대 · 자판 위에 붙어서 내용이 길어도 가려지지 않는다.
 *
 * 화면이 바뀌면 제목에 초점을 둔다 — 누른 단추가 사라져 초점이 문서 밖으로 떨어지지 않게, 화면 읽기가 새 화면을 읽게.
 * screenKey 가 같으면 초점을 안 옮긴다(같은 화면의 상태 변화).
 */
export function Screen({
  screenKey,
  title,
  desc,
  step,
  onBack,
  children,
  actions,
  focusTitle = true,
}: {
  screenKey: string;
  title: string;
  desc?: string;
  /** 1~5 — 안내 단계일 때만 */
  step?: number;
  onBack?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
  /** 입력칸이 초점을 가져가는 화면은 끈다 */
  focusTitle?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (focusTitle) heading.current?.focus({ preventScroll: true });
    // 화면이 바뀔 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  return (
    <div className="mx-auto flex min-h-[var(--vvh,100dvh)] w-full max-w-[33rem] flex-col px-5 pt-[max(env(safe-area-inset-top),0.5rem)] desk:px-[1.5rem]">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="이전 화면"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-ink/6 focus-visible:outline-2 focus-visible:outline-sky"
          >
            <ChevronLeft aria-hidden className="h-6 w-6" />
          </button>
        ) : (
          <Wordmark className="text-xl text-ink" />
        )}
        {step != null && (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="sr-only">{`${GUIDED_STEPS}단계 중 ${step}단계`}</span>
            <div aria-hidden className="h-1 w-24 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-sky transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${(step / GUIDED_STEPS) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <main key={screenKey} className="flex-1 pt-3 pb-6 motion-safe:animate-fade-in">
        <h1 ref={heading} tabIndex={-1} className="text-heading text-[1.625rem] leading-[1.3] text-ink outline-none">
          {title}
        </h1>
        {desc && <p className="mt-2 text-subhead leading-relaxed break-keep whitespace-pre-line text-muted">{desc}</p>}
        {children && <div className="mt-6 space-y-5">{children}</div>}
      </main>

      {actions && (
        <div className="sticky bottom-[var(--kb,0px)] z-10 -mx-5 space-y-2 bg-page px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] desk:-mx-[1.5rem] desk:px-[1.5rem]">
          {actions}
        </div>
      )}
    </div>
  );
}

/** 바닥의 큰 단추 */
export function PrimaryButton({ busy = false, children, ...props }: React.ComponentProps<'button'> & { busy?: boolean }) {
  return (
    <Button size="lg" className="h-14 w-full" aria-busy={busy || undefined} {...props} disabled={props.disabled || busy}>
      {busy && <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />}
      {children}
    </Button>
  );
}

/** 큰 단추 밑의 둘째 단추 */
export function SecondaryButton(props: React.ComponentProps<'button'>) {
  return <Button variant="secondary" size="lg" className="h-12 w-full" type="button" {...props} />;
}

/** 글만 있는 도움 단추 */
export function HelpButton({ className = '', ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-lg px-1 text-sm font-semibold text-sky-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-sky ${className}`}
      {...props}
    />
  );
}

/** 칸 바로 곁의 오류 — 색만으로 말하지 않게 그림과 글을 같이 둔다 */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-footnote leading-5 text-danger">
      <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** 글만 있는 안내 상자 */
export function NoteBox({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'warn' }) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 text-footnote leading-5 break-keep ${
        tone === 'warn' ? 'border border-warn-line bg-warn-bg text-warn' : 'bg-ink/5 text-muted'
      }`}
    >
      {children}
    </div>
  );
}

/** 불러오는 동안 — 토큰을 읽기 전 서버가 그리는 화면이기도 하다 */
export function LoadingScreen({ label = '접수 내용을 불러오고 있어요' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[var(--vvh,100dvh)] flex-col items-center justify-center gap-3 px-5 text-muted">
      <Loader2 aria-hidden className="h-6 w-6 motion-safe:animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
