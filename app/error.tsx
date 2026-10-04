'use client';

import { useEffect } from 'react';
import { useOnline } from '@/components/use-online';
import {
  ErrorDigest,
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
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[화면 오류]', error);
  }, [error]);
  const online = useOnline();

  /* 신호가 끊겨 난 오류는 그렇게 말한다. '로그인으로' 단추는 뺐다 — 앱 안에서 웹 오류 화면처럼 보였다(2026-10-04) */
  return (
    <FallbackShell>
      <FallbackTitle>{online ? '화면을 불러오지 못했어요' : '인터넷 연결이 없어요'}</FallbackTitle>
      <FallbackText>
        {online
          ? '잠깐 문제가 생겼어요. 다시 시도해 보시고, 계속 같은 화면이 나오면 조금 뒤에 열어 주세요.'
          : '연결되면 다시 시도해 주세요.'}
      </FallbackText>
      <FallbackActions>
        <FallbackButton onClick={() => retry()} primary>
          다시 시도
        </FallbackButton>
        <FallbackLink href="/today">홈으로</FallbackLink>
      </FallbackActions>
      <ErrorDigest digest={error.digest} />
    </FallbackShell>
  );
}
