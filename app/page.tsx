import Link from 'next/link';
import { BookOpen, ChartLine, Dumbbell, type LucideIcon } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { SiteFooter } from '@/components/site-footer';
import { BullpenMark, Wordmark } from '@/components/logo';
import { Baseball } from '@/components/baseball-icon';
import { getCurrentUser } from '@/lib/dal';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isNativeUserAgent } from '@/lib/app-env';

/**
 * 소개 — 처음 온 사람이 보는 첫 화면(아이폰 앱이 로그인 전에 여는 화면이기도 하다).
 *
 * 아이폰 앱의 환영 화면처럼 짰다(2026-10-01 사용자 '애플처럼 깔끔하고 감성있게'): 앱 아이콘 · 이름 · 한 줄,
 * 그 밑에 할 수 있는 것 넷을 아이콘과 한 줄씩, 맨 밑에 큰 [시작하기]. 예전에는 영어 머리글('For Pitchers') ·
 * 화면을 다 채우는 큰 글씨 · 번호 붙은 여섯 칸(01~06)이라, 읽을 것은 많고 무엇을 누를지는 늦게 보였다.
 *
 * 휴대폰에서는 단추가 화면 바닥에 붙어 있다 — 소개를 다 읽기 전에도 엄지 밑에 있다.
 */
const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Baseball,
    title: '투구 기록 · 영상',
    desc: '투구수 · 강도 · 구속과 그날 던진 영상을 날짜별로 남겨요.',
  },
  {
    icon: Dumbbell,
    title: '오늘에 맞춘 트레이닝',
    desc: '몸 상태와 던진 양을 보고 오늘 할 운동을 골라 줘요. 암케어도 따라 하기로.',
  },
  {
    icon: ChartLine,
    title: '리포트',
    desc: '최근 7일 · 30일 투구량과 구속을 정리하고 짚을 점을 알려 줘요.',
  },
  {
    icon: BookOpen,
    title: '메커니즘 · 자료실',
    desc: '스로잉 · 메디신볼 드릴과 투구 역학 자료를 한곳에서 봐요.',
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  /*
   * 아이폰 앱 안에서는 소개 화면을 보이지 않는다 — 웹사이트를 처음 온 사람에게 앱을 소개하는 화면이라, 앱 안에서 열리면
   * (로그인 화면의 로고를 누르는 등) 웹페이지 같았다(2026-10-04 '앱 안에 머물기'). 로그인했으면 홈, 아니면 로그인.
   */
  if (isNativeUserAgent((await headers()).get('user-agent'))) {
    redirect(user ? '/today' : '/login');
  }

  return (
    <main className="bg-spotlight flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col">
      <div className="mx-auto w-full max-w-md flex-1 px-6 pt-16 pb-8 sm:pt-24">
        {/* 앱 아이콘 — 홈 화면의 아이콘과 같은 B */}
        <div className="motion-safe:animate-fade-in mx-auto grid h-20 w-20 place-items-center rounded-[22px] bg-surface shadow-[0_10px_30px_-12px_rgb(2_151_228/0.45)] ring-1 ring-line">
          <BullpenMark className="h-11" />
        </div>

        <h1 className="mt-6 text-center">
          <Wordmark className="text-5xl text-ink" />
        </h1>
        <p className="mt-3 text-center text-base leading-relaxed break-keep text-muted">
          투수를 위한 기록과 트레이닝, 한곳에서.
        </p>

        <ul className="mt-12 space-y-7">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-4">
              <Icon
                aria-hidden
                className="mt-0.5 h-7 w-7 shrink-0 text-sky"
                strokeWidth={1.9}
              />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed break-keep text-muted">
                  {desc}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/*
        단추 — 휴대폰은 화면 바닥에 붙는다(아이폰 환영 화면처럼). 밑은 홈 막대 자리만큼 비운다.
        '계정 만들기'는 로그인 화면 안에 있다(로그인 화면은 미리 만들어 둔 화면이라 주소로 모드를 고르지 않는다).
      */}
      {/* 아이폰 앱은 몸 전체가 이미 홈 막대 여백을 둔다(globals.css '아이폰 앱 안') — 두 번 비지 않게 앱에서는 1.25rem 만 */}
      <div className="sticky bottom-0 bg-linear-to-t from-page via-page/95 to-page/0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] in-data-[app=native]:pb-5 sm:static sm:bg-none">
        <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-1 px-6">
          {user ? (
            <ButtonLink href="/today" className="min-h-13 text-base">
              홈으로
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" className="min-h-13 text-base">
                시작하기
              </ButtonLink>
              <Link
                href="/login"
                className="mx-auto flex min-h-11 items-center px-3 text-sm font-semibold text-sky transition-opacity active:opacity-60"
              >
                이미 계정이 있어요 · 로그인
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 맨 밑 정보 — 앱 안 화면 · 약관 화면과 같은 것(components/site-footer.tsx) */}
      <SiteFooter width="max-w-6xl" />
    </main>
  );
}
