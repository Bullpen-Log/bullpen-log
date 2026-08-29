'use client';

import { useEffect } from 'react';
import {
  FallbackActions,
  FallbackButton,
  FallbackLink,
  FallbackShell,
  FallbackText,
  FallbackTitle,
} from '@/components/fallback';

/**
 * 로그인 뒤 화면에서 뭔가 잘못됐을 때.
 *
 * 예전에는 이 자리가 비어 있어서, 서버에서 오류가 나면 Next.js 기본 화면이
 * 나왔다 — 흰 바탕에 "Internal Server Error" 한 줄. 앱이 죽은 것으로 보인다.
 * 실제로 개발 중에 그 화면을 봤다.
 *
 * 이 파일은 같은 자리의 레이아웃까지 감싸지는 않는다. 그래서 사이드바와 하단
 * 탭은 그대로 남고, 본문 자리에만 이 화면이 뜬다 — 다른 곳으로 옮겨갈 길이
 * 사라지지 않는다.
 *
 * 무엇이 잘못됐는지는 자세히 적지 않는다. 배포된 곳에서는 오류 내용이 화면까지
 * 오지 않고(민감한 값이 새지 않도록 Next.js가 막는다), 와도 사용자가 할 수
 * 있는 일이 없다. 대신 다시 해볼 길을 준다.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // 서버 로그에 남겨 나중에 무엇이 터졌는지 찾을 수 있게 한다.
    console.error('[화면 오류]', error);
  }, [error]);

  return (
    <FallbackShell>
      <FallbackTitle>화면을 불러오지 못했습니다</FallbackTitle>
      <FallbackText>
        잠깐 문제가 생겼습니다. 다시 시도해보시고, 계속 같은 화면이 나오면 조금 뒤에
        열어주세요. <strong className="text-ink">기록은 그대로 남아 있습니다.</strong>
      </FallbackText>
      <FallbackActions>
        {/*
          unstable_retry 는 이 자리만 서버에서 다시 받아온다. 화면 전체를
          새로고침하면 지금까지 연 것이 다 날아가므로 이쪽이 낫다.
        */}
        <FallbackButton onClick={() => unstable_retry()} primary>
          다시 시도
        </FallbackButton>
        <FallbackLink href="/today">홈으로</FallbackLink>
      </FallbackActions>
      {/*
        같은 오류를 다시 겪었을 때 찾을 수 있는 번호. 없을 수도 있다.
        사용자에게 뜻은 없지만, 물어보실 때 이 번호가 있으면 로그에서 찾기 쉽다.
      */}
      {error.digest && (
        <p className="mt-6 text-[11px] text-muted/60">오류 번호 {error.digest}</p>
      )}
    </FallbackShell>
  );
}
