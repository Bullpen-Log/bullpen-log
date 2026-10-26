'use client';

import { useActionState, useEffect, useOptimistic, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { appealHidden, setSaved, type ReportState } from '@/app/actions/community';
import { Bookmark, BookmarkCheck, Check, Share2 } from '@/components/icon';
import { Button, FormError, Textarea } from '@/components/ui';
import { guardFormAction, orOffline } from '@/lib/action-offline';
import { haptic } from '@/lib/haptics';
import { toast } from '@/components/toast';
import { APPEAL_MAX } from '@/lib/community';
import { clearSubmittedDraft } from '@/components/community/community-draft';

const PILL =
  'inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] active:scale-95';

/** 저장 — 좋아요와 따로(나만 보는 모음, 마이 › 커뮤니티 활동 › 저장). 바라는 상태를 보내 두 번 눌러도 같다 */
export function CommunitySaveButton({ postId, saved }: { postId: string; saved: boolean }) {
  const [shown, setShown] = useOptimistic(saved);
  return (
    <form
      action={async (fd) => {
        haptic('light');
        setShown(!shown);
        await orOffline(setSaved(fd), undefined);
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="saved" value={shown ? '0' : '1'} />
      <button
        type="submit"
        aria-pressed={shown}
        className={`${PILL} ${shown ? 'bg-sky-tint text-sky-strong desk:border desk:border-sky-soft' : 'bg-ink/6 text-ink desk:border desk:border-line-strong desk:bg-surface-2'}`}
      >
        {shown ? <BookmarkCheck aria-hidden className="h-4 w-4" /> : <Bookmark aria-hidden className="h-4 w-4" />}
        {shown ? '저장됨' : '저장'}
      </button>
    </form>
  );
}

/**
 * 공유 — 휴대폰은 기기 공유 창(navigator.share), 없으면 주소 복사. 글 주소만 보낸다(대화 · 참가자는 글 주소로 열리지 않는다).
 */
export function CommunityShareButton({ title, path }: { title: string; path: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          toast('주소를 복사했어요.');
        } catch {
          toast('주소를 복사하지 못했어요.', 'error');
        }
      }}
      className={`${PILL} bg-ink/6 text-ink desk:border desk:border-line-strong desk:bg-surface-2`}
    >
      <Share2 aria-hidden className="h-4 w-4" />
      공유
    </button>
  );
}

function AppealSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? '보내는 중…' : '이의 제기 보내기'}
    </Button>
  );
}

/** 이의 제기 — 운영자가 가린 내 글 · 댓글에 한 번. 운영자가 다시 볼 때까지 또 못 낸다 */
export function CommunityAppealForm({ kind, id, pending }: { kind: 'post' | 'comment'; id: string; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ReportState, FormData>(guardFormAction(appealHidden), undefined);
  if (pending || state?.done)
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Check aria-hidden className="h-3.5 w-3.5 text-ok" />
        이의 제기를 받았어요. 운영자가 다시 볼게요.
      </p>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-sky">
        이의 제기
      </button>
    );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Textarea name="reason" rows={3} maxLength={APPEAL_MAX} required placeholder="왜 다시 봐야 하는지 적어 주세요." className="text-sm" />
      <FormError>{state?.error}</FormError>
      <div className="flex gap-2">
        <AppealSubmit />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>
    </form>
  );
}

/** 글 화면에 붙어 — 방금 올리거나 고친 글이면 그 초안을 지운다(components/community/community-draft.ts) */
export function ClearDraftOnArrival() {
  useEffect(() => {
    clearSubmittedDraft();
  }, []);
  return null;
}
