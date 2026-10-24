'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { sendRoomMessage, type CommunityState } from '@/app/actions/community';
import { FormError } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { ROOM_MESSAGE_MAX } from '@/lib/community';

export type RoomMessage = { id: string; mine: boolean; nickname: string; body: string; time: string };

function Send() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="mb-1.5 shrink-0 px-1 text-sm font-bold text-sky disabled:opacity-50">
      보내기
    </button>
  );
}

/**
 * 글에 묶인 대화(번개 참가자 방 · 팀 신청자와 둘만) — 장터 채팅방(components/dugout/chat-room.tsx)과 같은 모양 · 같은 5초 새로 읽기.
 * 닫힌 방(번개 다음 날)은 읽기만.
 */
export function CommunityRoom({
  postId,
  thread,
  messages,
  open,
  empty,
}: {
  postId: string;
  thread: string | null;
  messages: RoomMessage[];
  open: boolean;
  empty: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState<CommunityState, FormData>(guardFormAction(sendRoomMessage), undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') quietRefresh(router);
    }, 5000);
    return () => window.clearInterval(t);
  }, [router, open]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div ref={scroller} className="max-h-96 min-h-32 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">{empty}</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
            {!m.mine && <span className="mb-0.5 text-xs text-muted">{m.nickname}</span>}
            <div className={`flex items-end gap-1.5 ${m.mine ? 'flex-row-reverse' : ''}`}>
              <p
                className={`max-w-[75vw] rounded-[1.25rem] px-4 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap sm:max-w-md ${
                  m.mine ? 'bg-sky text-white' : 'bg-ink/7 text-ink'
                }`}
              >
                {m.body}
              </p>
              <span className="mb-1 text-[10px] text-muted">{m.time}</span>
            </div>
          </div>
        ))}
      </div>
      {open ? (
        <form
          ref={formRef}
          action={async (fd) => {
            await action(fd);
            formRef.current?.reset();
            setText('');
          }}
          className="border-t border-line px-4 py-2"
        >
          <input type="hidden" name="postId" value={postId} />
          {thread && <input type="hidden" name="thread" value={thread} />}
          {state?.error && <FormError>{state.error}</FormError>}
          <div className="flex items-end gap-2">
            <textarea
              name="body"
              rows={1}
              maxLength={ROOM_MESSAGE_MAX}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="메시지 입력…"
              aria-label="메시지"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (text.trim()) formRef.current?.requestSubmit();
                }
              }}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none [field-sizing:content]"
            />
            {text.trim() && <Send />}
          </div>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">대화방이 닫혔어요.</p>
      )}
    </div>
  );
}
