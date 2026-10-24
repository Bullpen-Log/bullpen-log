import { Suspense } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import HomePage from '@/app/(app)/today/home-page';
import Loading from '@/app/(app)/@home/today/loading';
import { ArrowRight } from '@/components/icon';
import { isExpoUserAgent, isNativeUserAgent } from '@/lib/app-env';

/**
 * 홈 판 — 주소가 /today 가 아니어도(다른 탭 · 하위 화면) 판 넘기기 자리에 늘 떠 있다(components/tab-pager.tsx). 홈은 잠금이 없다.
 * Suspense 로 감싸 처음 연 탭이 먼저 뜨고 이 판은 뒤따라 들어온다(2026-10-16 — 처음 연 탭만 그리던 것을 되돌림, 사용자: "처음 접속하면 탭 사이 이동이 길다").
 * 웹(브라우저)이면 맨 위에 '내 싱커' 대시보드(/sinker)로 가는 단추 하나(2026-10-21 금윤호: "내 싱커 화면은 싱커의 홈에서 따로 단추로"). 앱은 없음.
 */
export default async function HomeSlotDefault() {
  const ua = (await headers()).get('user-agent');
  /* 새 앱은 앱 홈 화면이 덮는다 — @home/today/page.tsx 와 같은 까닭으로 안 그린다 */
  if (isExpoUserAgent(ua)) return null;
  const web = !isNativeUserAgent(ua);
  return (
    <Suspense fallback={<Loading />}>
      {web && (
        <Link
          href="/sinker"
          className="mb-(--gap-page) flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-sky-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">내 싱커 대시보드</span>
            <span className="block text-xs text-muted">
              큰 화면으로 기록 · 구속 · 레슨을 한눈에, 기록 표 · CSV · 공유 범위
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-sky" />
        </Link>
      )}
      <HomePage searchParams={Promise.resolve({})} />
    </Suspense>
  );
}
