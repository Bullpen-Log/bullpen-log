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
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[운동 화면 오류]', error);
  }, [error]);

  return (
    <FallbackShell>
      <FallbackTitle>운동 화면에 문제가 생겼습니다</FallbackTitle>
      <FallbackText>
        남긴 세트는 지워지지 않았습니다. 신호가 없을 때 남긴 세트도 이 폰에 보관돼
        있다가, 화면이 다시 뜨면 저절로 보내집니다.
      </FallbackText>
      <FallbackActions>
        <FallbackButton onClick={() => unstable_retry()} primary>
          다시 시도
        </FallbackButton>
        <FallbackLink href="/training">트레이닝으로</FallbackLink>
      </FallbackActions>
      {error.digest && (
        <p className="mt-6 text-[11px] text-muted/60">오류 번호 {error.digest}</p>
      )}
    </FallbackShell>
  );
}
