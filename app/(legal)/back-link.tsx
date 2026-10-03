'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * 약관 · 개인정보의 '돌아가기'(2026-10-03).
 *
 * 예전에는 늘 /login 으로 갔다. 로그인한 사람도 설정 › 정보에서 여기로 오는데, 돌아가기를 누르면 로그인 화면이
 * 떴다. 아이폰 앱에는 브라우저의 뒤로 단추도 없다. 이제 앱 안에서 넘어왔으면 그 화면으로 되돌아가고(router.back),
 * 아니면 fallback(로그인했으면 /today, 아니면 /login — layout.tsx 가 정한다)으로 간다.
 */
export function LegalBackLink({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !cameFromThisSite())
          return;
        e.preventDefault();
        router.back();
      }}
      /* 휴대폰은 손가락 크기(44px) — 30px 라 잘 안 눌렸다. PC 는 예전 크기 */
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3.5 text-sm font-medium text-muted transition-colors hover:border-sky hover:text-sky desk:min-h-0 desk:px-3 desk:py-1.5 desk:text-xs"
    >
      <ArrowLeft className="h-4 w-4 desk:h-3.5 desk:w-3.5" />
      돌아가기
    </Link>
  );
}

/**
 * 바로 앞 기록이 이 사이트의 화면인가.
 *
 * 앱 안에서 링크로 넘어오면 문서를 새로 받지 않아, 처음 받은 문서의 주소(navigation 항목)가 지금 주소와 다르다 —
 * 그러면 앞 기록은 그 앱 화면이다. 이 주소로 바로 들어왔으면 들어오게 한 곳(referrer)이 이 사이트일 때만.
 * 새 탭 · 바깥에서 들어온 것이면 기록이 하나뿐이거나 바깥이라 되돌아가면 사이트를 떠난다.
 */
function cameFromThisSite(): boolean {
  if (window.history.length < 2) return false;
  const nav = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  if (nav && nav.name !== window.location.href) return true;
  try {
    return (
      document.referrer !== '' &&
      new URL(document.referrer).origin === window.location.origin
    );
  } catch {
    return false;
  }
}
