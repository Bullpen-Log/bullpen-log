'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { sendMessage, type ChatState } from '@/app/actions/chat';
import { Button, FormError } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { MESSAGE_MAX } from '@/lib/market/specs';

export type MessageView = {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
};

/**
 * 채팅방(2026-10-20) — 말풍선 · 보내기. 5초마다 조용히 다시 읽어 상대 말을 받는다(quietRefresh — 화면이 깜빡이지 않는다).
 * 보내면 칸을 비우고 맨 아래로.
 */
export function ChatRoom({
  conversationId,
  messages,
}: {
  conversationId: string;
  messages: MessageView[];
}) {
  const router = useRouter();
  const [state, action] = useActionState<ChatState, FormData>(
    guardFormAction(sendMessage),
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') quietRefresh(router);
    }, 5000);
    return () => window.clearInterval(t);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs text-muted">
            첫 말을 건네 보세요. “아직 판매 중인가요?”
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.mine ? 'bg-sky text-white' : 'bg-surface-2 text-ink'}`}
            >
              {m.body}
              <span
                className={`mt-0.5 block text-[10px] ${m.mine ? 'text-white/70' : 'text-muted'}`}
              >
                {m.createdAt}
              </span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        ref={formRef}
        action={async (fd) => {
          await action(fd);
          formRef.current?.reset();
        }}
        className="sticky bottom-20 flex items-end gap-2 md:bottom-4"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <textarea
          name="body"
          rows={1}
          maxLength={MESSAGE_MAX}
          required
          placeholder="메시지"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink focus:border-sky focus:outline-none"
        />
        <Send />
      </form>
      {state?.error && <FormError>{state.error}</FormError>}
    </div>
  );
}

function Send() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '…' : '보내기'}
    </Button>
  );
}
