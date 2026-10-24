'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { toggleJoin, type CommunityState } from '@/app/actions/community';
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

/** 번개 참가 · 팀 신청과 그 취소 — 막히면(나이 · 마감 · 지난 번개) 까닭이 밑에 뜬다(서버 toggleJoin 이 한 번 더 본다) */
export function CommunityJoinButton({
  postId,
  meetup,
  joined,
}: {
  postId: string;
  meetup: boolean;
  joined: boolean;
}) {
  const [state, action] = useActionState<CommunityState, FormData>(guardFormAction(toggleJoin), undefined);
  const label = joined ? (meetup ? '참가 취소' : '신청 취소') : meetup ? '참가하기' : '신청하기';
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      <Submit label={label} secondary={joined} />
      <FormError>{state?.error}</FormError>
    </form>
  );
}
