'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { setJoin, type CommunityState } from '@/app/actions/community';
import { guardFormAction } from '@/lib/action-offline';
import { Button, FormError } from '@/components/ui';

function Submit({ label, secondary }: { label: string; secondary: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={secondary ? 'secondary' : 'primary'} disabled={pending}>
      {pending ? '보내는 중…' : label}
    </Button>
  );
}

/**
 * 번개 참가 · 팀 신청과 그 취소 — 바라는 상태(want)를 보낸다. 두 번 눌러도 참가 → 취소로 뒤집히지 않고, 정원 · 나이 · 마감은 서버가 잠근 채 본다
 * (lib/community-ops.ts joinPost). 막히면 까닭이 밑에 뜬다. 말은 팀 말머리를 따른다(지원하기 · 경기 신청 · 우리 팀 제안하기 …).
 */
export function CommunityJoinButton({
  postId,
  joined,
  applyLabel,
  cancelLabel,
}: {
  postId: string;
  joined: boolean;
  applyLabel: string;
  cancelLabel: string;
}) {
  const [state, action] = useActionState<CommunityState, FormData>(guardFormAction(setJoin), undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="want" value={joined ? 'leave' : 'join'} />
      <Submit label={joined ? cancelLabel : applyLabel} secondary={joined} />
      <FormError>{state?.error}</FormError>
    </form>
  );
}
