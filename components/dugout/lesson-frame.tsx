import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundBack } from '@/components/round-icon';
import { DugoutPageHeader, SectionHead, type Crumb } from '@/components/dugout/ui';
import { BackLink } from '@/components/ui';

/**
 * 레슨 화면의 공통 틀(2026-10-22 금윤호: "화면 인터페이스가 안 맞고 서로 크기도 안 맞아 — 닥터나우와 비슷하게").
 * 휴대폰 · 패드: 닥터나우 안쪽 화면처럼 가운데 좁은 기둥(max-w-2xl) 하나, 맨 위에 '‹' 와 가운데 제목 한 줄.
 * PC(lg, 2026-10-24 금윤호: "레슨 탭이 너무 모바일 화면 같아 — 좀 더 세련되게 PC 버전스럽게"): 덕아웃의 다른 화면과 같은 폭(max-w-6xl),
 * 머리는 덕아웃 공용 DugoutPageHeader(위치 줄 · 26px 제목 · 한 줄 설명 · 오른쪽 단추). 화면마다 PC 칸 나누기는 각 화면이 정한다.
 */
export type { Crumb };

export function LessonFrame({
  back,
  backLabel,
  title,
  wide = false,
  crumbs,
  subtitle,
  actions,
  children,
}: {
  /** 뒤로 가는 주소 — 없으면 머리줄에 ‹ 가 없다(허브) */
  back?: string;
  backLabel?: string;
  title: string;
  /** 비교표처럼 넓어야 하는 화면(패드에서 조금 넓게) */
  wide?: boolean;
  /** PC 머리 위 위치 줄 — '레슨 › 코치 목록' */
  crumbs?: Crumb[];
  /** PC 큰 제목 밑 한 줄 */
  subtitle?: ReactNode;
  /** PC 머리 오른쪽 자리 */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto ${wide ? 'max-w-4xl' : 'max-w-2xl'} space-y-5 lg:max-w-none lg:space-y-5`}>
      {/*
        휴대폰 · 패드 머리 — 그대로. 싱커 앱 안에서는 이 줄 대신 위 막대의 '‹ 뒤로'(BackLink 가 막대에 적는다) + 공용 쪽 머리(globals.css data-lesson-*)
      */}
      {/* 보이지 않는 '‹ 뒤로' — 싱커 앱 위 막대가 읽는다(웹 덕아웃 막대는 안 읽어 그대로) */}
      {back && (
        <span className="hidden">
          <BackLink href={back}>{backLabel ?? '뒤로'}</BackLink>
        </span>
      )}
      <div data-lesson-mhead className="relative flex min-h-11 items-center justify-center lg:hidden">
        {back && (
          <Link
            href={back}
            aria-label={backLabel ?? '뒤로'}
            className="absolute left-0 grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-ink/6"
          >
            <RoundBack className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-base font-bold text-ink">{title}</h1>
      </div>

      {/* PC 머리 — 덕아웃 공용 쪽 머리(2026-10-24 UI 통일) */}
      <div data-lesson-head className="hidden lg:block">
        <DugoutPageHeader title={title} crumbs={crumbs} subtitle={subtitle} actions={actions} />
      </div>

      {children}
    </div>
  );
}

/** 화면 안의 묶음 제목 — 덕아웃 공용 SectionHead(2026-10-24 UI 통일, 예전엔 레슨만 14~16px) */
export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return <SectionHead title={children} action={action} />;
}
