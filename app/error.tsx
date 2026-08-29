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
 * 로그인 밖 화면(첫 화면·로그인)에서 뭔가 잘못됐을 때.
 *
 * 로그인 뒤 화면은 app/(app)/error.tsx 가 맡는다. 그쪽은 사이드바가 남지만
 * 여기는 아무것도 없으므로, 갈 곳을 직접 준다.
 */
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[화면 오류]', error);
  }, [error]);

  return (
    <FallbackShell>
      <FallbackTitle>화면을 불러오지 못했습니다</FallbackTitle>
      <FallbackText>
        잠깐 문제가 생겼습니다. 다시 시도해보시고, 계속 같은 화면이 나오면 조금 뒤에
        열어주세요.
      </FallbackText>
      <FallbackActions>
        <FallbackButton onClick={() => unstable_retry()} primary>
          다시 시도
        </FallbackButton>
        <FallbackLink href="/login">로그인으로</FallbackLink>
      </FallbackActions>
      {error.digest && (
        <p className="mt-6 text-[11px] text-muted/60">오류 번호 {error.digest}</p>
      )}
    </FallbackShell>
  );
}
