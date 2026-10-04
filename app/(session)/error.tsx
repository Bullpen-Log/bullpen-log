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
 * 운동 화면(워밍업·본운동)에서 뭔가 잘못됐을 때.
 *
 * 예전에는 이 자리가 비어 있어, 운동 중에 문제가 생기면 로그인 밖 화면용
 * 오류 화면(app/error.tsx)이 떴다 — "로그인으로" 단추가 달린. 세트를 남기던
 * 사람은 방금 한 것이 날아간 줄 안다.
 *
 * 실제로는 날아가지 않는다. 서버에 간 세트는 서버에, 신호가 없어 못 간 세트는
 * 폰 저장소에 남아 있다가(lib/workout/outbox.ts) 화면이 다시 뜨면 이어서
 * 보내진다. 그 말을 먼저 한다 — 불안하면 다시 시도 대신 앱을 꺼 버린다.
 */
export default function SessionError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[운동 화면 오류]', error);
  }, [error]);

  const online = useOnline();

  return (
    <FallbackShell>
      <FallbackTitle>{online ? '운동 화면에 문제가 생겼어요' : '인터넷 연결이 없어요'}</FallbackTitle>
      <FallbackText>
        남긴 세트는 지워지지 않았어요. 신호가 없을 때 남긴 세트도 폰에 있다가 저절로
        보내져요.
      </FallbackText>
      <FallbackActions>
        <FallbackButton onClick={() => retry()} primary>
          다시 시도
        </FallbackButton>
        <FallbackLink href="/training">트레이닝으로</FallbackLink>
      </FallbackActions>
      <ErrorDigest digest={error.digest} />
    </FallbackShell>
  );
}
