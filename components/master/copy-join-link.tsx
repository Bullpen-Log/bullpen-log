'use client';

import { useState } from 'react';
import { Check } from '@/components/icon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui';

/**
 * 참여 링크(/teams/join?code=…)를 복사한다 — 카톡 단톡에 그대로 붙이게. 가입은 덕아웃이 주인(2026-11-01)이라 덕아웃 주소로 — 로그인 전이면 로그인 뒤 돌아온다.
 * 옛 링크 `/join?code=` 도 같은 본문을 그리니 그대로 쓸 수 있다(components/org/join-view.tsx). 복사가 막힌 브라우저면 코드를 직접 알려 달라고
 */
export function CopyJoinLink({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    const url = `${window.location.origin}/teams/join?code=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      toast('참여 링크를 복사했어요.');
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast(`복사하지 못했어요. 코드 ${code}를 직접 알려 주세요.`, 'error');
    }
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={copy}
      className="min-w-32"
    >
      {done ? (
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-4 w-4" /> 복사했어요
        </span>
      ) : (
        '참여 링크 복사'
      )}
    </Button>
  );
}
