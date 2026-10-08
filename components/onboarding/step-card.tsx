'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Wordmark } from '@/components/logo';

/**
 * 한 화면에 한 질문 — 가입 마법사(app/login/auth-form.tsx)와 기존 사용자 온보딩(/nutrition/setup)이 같이 쓰는 카드.
 *
 * 구글 로그인처럼 넓은 카드 한 장. 넓은 화면에서는 왼쪽에 제목, 오른쪽에 칸, 오른쪽 아래에 단추가 선다.
 * 휴대폰에서는 카드 테두리를 걷고 화면 전체를 쓴다 — 제목은 위에, 단추는 아래에 붙어서 단계를 넘겨도 제자리다.
 *
 * titleKey 가 바뀌면 제목이 새로 떠오른다(단계가 넘어갈 때). progress 는 0~1, 주면 카드 맨 위에 가는 막대로
 * 얼마나 왔는지 보인다. counter('3 / 25')는 단추 줄 왼쪽에 흐리게.
 *
 * focusHeading — 로그인 ↔ 가입을 바꿔 이 카드가 새로 뜬 경우 제목에 초점을 둔다. 누른 단추가 사라져 초점이
 * 문서 밖으로 떨어지지 않게, 화면 낭독기가 '어느 화면인지'를 읽게. 칸이 아니라 제목이라 휴대폰 자판이 튀어나오지 않는다.
 *
 * brand — 왼쪽 위 로고 자리. 기본은 첫 화면으로 가는 워드마크(가입). 앱 안의 온보딩은 null 로 비운다.
 */
export function StepCard({
  title,
  desc,
  titleKey,
  progress,
  counter,
  focusHeading = false,
  brand,
  children,
  footer,
}: {
  title: string;
  desc?: string;
  titleKey: string;
  progress?: number;
  counter?: string;
  focusHeading?: boolean;
  brand?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus({ preventScroll: true });
    // 처음 뜰 때 한 번만 — 단계가 넘어갈 때는 칸으로 간다(마법사)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logo =
    brand === undefined ? (
      /* 아이폰 앱에서는 눌리지 않는 그림 — 소개(웹) 화면이 앱에는 없다(app/page.tsx, 2026-10-04) */
      <Link
        href="/"
        className="group inline-flex items-center gap-2.5 rounded-lg in-data-[app=native]:pointer-events-none"
        aria-label="Bullpen Log 첫 화면"
      >
        <Wordmark className="text-2xl text-ink transition-colors group-hover:text-sky md:text-3xl" />
      </Link>
    ) : (
      brand
    );

  return (
    /*
     * 휴대폰(카드 테두리 없음)에서는 화면 높이를 다 쓰는 세로 줄이다. 가운데 맞춤을 하면
     * 단계마다 높이가 달라 로고 · 막대 · 단추가 매번 위아래로 튀었다. 이제 제목 묶음은 위에,
     * 단추 줄은 아래에 붙는다(칸 묶음이 남는 높이를 가진다).
     */
    <section className="relative flex flex-col max-md:min-h-full max-md:flex-1 md:overflow-hidden md:rounded-[28px] md:border md:border-line md:bg-surface md:shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      {progress != null && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-line/50 max-md:rounded-full"
        >
          <div
            className="h-full rounded-r-full bg-sky transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-6 pt-5 short:gap-4 short:pt-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-14 md:p-12 md:short:p-8 lg:gap-20 lg:p-14 lg:short:p-9">
        <header className="min-w-0">
          {logo}

          <div key={titleKey} className="motion-safe:animate-fade-in">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className={`text-heading text-[1.75rem] leading-[1.2] text-ink outline-none break-keep short:text-2xl md:text-[2.25rem] md:short:text-[1.875rem] ${
                logo ? 'mt-6 short:mt-4 md:mt-10 md:short:mt-6' : 'mt-1 md:mt-2'
              }`}
            >
              {title}
            </h1>
            {desc && (
              <p className="mt-2.5 max-w-md text-sm leading-relaxed break-keep text-muted md:mt-4 md:text-[15px] md:short:mt-2.5">
                {desc}
              </p>
            )}
          </div>
        </header>

        <div className="flex min-w-0 flex-1 flex-col md:min-h-[23.75rem] md:pt-2 md:short:min-h-[20.5rem]">
          <div className="flex-1">{children}</div>
          {/*
           * 자판이 올라오면(아이폰은 화면 높이가 그대로다) 단추 줄을 자판 위로 올린다 — --kb 는 components/viewport-vars.tsx
           * 가 자판이 있을 때만 적는다. 없으면 0 이라 예전 모양 그대로다.
           */}
          <div className="mt-6 flex items-center gap-2 short:mt-4 md:mt-10 md:short:mt-6 max-md:pb-[var(--kb,0px)] max-md:transition-[padding] max-md:duration-200">
            {counter && (
              <span className="text-xs tabular-nums text-muted" aria-hidden>
                {counter}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">{footer}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 글자만 있는 단추 — 구글의 '계정 만들기'처럼 주 단추 옆에 가볍게 선다 */
export function TextButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      /* sky 는 흰 바탕에서 글자로는 옅다(2.8:1) — 글자에는 한 단계 짙은 sky-strong */
      className="rounded-xl px-4 py-3 text-sm font-semibold text-sky-strong transition-colors hover:bg-sky/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** 글을 치는 큰 칸 — 가입 · 온보딩의 입력칸에 덧붙인다(components/ui Input) */
export const INPUT_LARGE = 'py-3.5 text-[15px] aria-invalid:border-danger';

/** 막힌 까닭을 적는 줄의 id — 문제의 칸이 aria-describedby 로 가리킨다 */
export const PROBLEM_ID = 'onboarding-problem';

/** 문제의 칸에 붙이는 속성 — 빨간 테두리(aria-invalid)와 까닭을 적은 줄로의 연결 */
export function invalidProps(invalid: boolean) {
  return invalid
    ? { 'aria-invalid': true as const, 'aria-describedby': PROBLEM_ID }
    : {};
}

/**
 * 막힌 까닭 — 칸들 밑, 단추 바로 위에 한 줄로. 방금 누른 단추 곁이라 눈이 바로 가고, 문제의 칸은 초점과 빨간
 * 테두리(aria-invalid)로 따로 짚는다. key(seq)로 새로 그려, 같은 문제가 다시 나도 화면 낭독기가 다시 읽는다.
 */
export function ProblemLine({ seq, children }: { seq: number; children: ReactNode }) {
  return (
    <p
      key={seq}
      id={PROBLEM_ID}
      role="alert"
      className="mt-4 flex items-start gap-1.5 text-[13px] leading-5 text-danger md:text-sm"
    >
      <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}
