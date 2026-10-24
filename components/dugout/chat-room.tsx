'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { sendMessage, type ChatState } from '@/app/actions/chat';
import { FormError } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { MESSAGE_MAX } from '@/lib/market/specs';
import { ChatAvatar } from '@/components/dugout/chat-avatar';

export type MessageView = {
  id: string;
  mine: boolean;
  body: string;
  /** '오후 5:49' */
  time: string;
  /** 앞 말과 한 시간 넘게 떨어졌으면 가운데에 보일 시각 글 */
  sep: string | null;
  /** 이어 보낸 묶음의 끝 — 상대 얼굴 · 시각은 여기에만 */
  groupEnd: boolean;
};

/**
 * 채팅방 말풍선 · 입력(2026-10-20, 2026-10-24 인스타 DM 모양) — 내 말은 오른쪽 덕아웃 색, 상대 말은 왼쪽 회색과 묶음 끝의 얼굴.
 * 5초마다 조용히 다시 읽어 상대 말을 받는다(quietRefresh — 왼쪽 목록도 같이). Enter 보내기 · Shift+Enter 줄바꿈, 글이 있을 때만 '보내기'.
 */
export function ChatRoom({
  conversationId,
  other,
  messages,
}: {
  conversationId: string;
  other: { name: string; avatarUrl: string | null };
  messages: MessageView[];
}) {
  const router = useRouter();
  const [state, action] = useActionState<ChatState, FormData>(guardFormAction(sendMessage), undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') quietRefresh(router);
    }, 5000);
    return () => window.clearInterval(t);
  }, [router]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <ChatAvatar name={other.name} url={other.avatarUrl} size="lg" />
            <p className="text-base font-bold text-ink">{other.name}</p>
            <p className="text-sm text-muted">첫 말을 건네 보세요. “아직 판매 중인가요?”</p>
          </div>
        )}
        <ol className="space-y-1">
          {messages.map((m) => (
            <li key={m.id}>
              {m.sep && <p className="py-4 text-center text-xs font-medium text-muted">{m.sep}</p>}
              <div className={`flex items-end gap-2 ${m.mine ? 'justify-end' : 'justify-start'} ${m.groupEnd ? 'mb-2' : ''}`}>
                {!m.mine && (
                  <span className="w-7 shrink-0">
                    {m.groupEnd && <ChatAvatar name={other.name} url={other.avatarUrl} size="sm" />}
                  </span>
                )}
                {m.mine && m.groupEnd && <span className="mb-1 text-[10px] text-muted">{m.time}</span>}
                <p
                  className={`max-w-[70%] rounded-[1.25rem] px-4 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap ${
                    m.mine ? 'bg-sky text-white' : 'bg-ink/7 text-ink'
                  }`}
                >
                  {m.body}
                </p>
                {!m.mine && m.groupEnd && <span className="mb-1 text-[10px] text-muted">{m.time}</span>}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <form
        ref={formRef}
        action={async (fd) => {
          await action(fd);
          formRef.current?.reset();
          setText('');
        }}
        className="px-4 pb-4 md:px-6"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        {state?.error && <FormError>{state.error}</FormError>}
        <div className="flex items-end gap-2 rounded-[1.5rem] border border-line bg-surface px-4 py-1.5 focus-within:border-ink/40">
          <textarea
            name="body"
            rows={1}
            maxLength={MESSAGE_MAX}
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
          {text.trim() && <SendButton />}
        </div>
      </form>
    </>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="mb-1.5 shrink-0 px-1 text-sm font-bold text-sky disabled:opacity-50">
      {pending ? '…' : '보내기'}
    </button>
  );
}
