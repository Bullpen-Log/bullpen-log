'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadOlderRoomMessages, sendRoomMessage } from '@/app/actions/community';
import { FormError } from '@/components/ui';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { ROOM_MESSAGE_MAX } from '@/lib/community';
import type { RoomView } from '@/lib/community-load';
import { CommunityReportForm } from '@/components/community/community-report-form';

export type RoomMessage = RoomView;

/** 맨 아래에서 이만큼 안이면 '아래에 붙어 읽는 중' — 새 말이 오면 따라 내려간다 */
const NEAR_BOTTOM = 80;

/** 받은 최근 장을 쌓아 둔 목록에 합친다 — 새 말은 뒤에, 가려짐처럼 바뀐 말은 제자리에서 바꾼다(최근 장 밖으로 밀려난 말도 버리지 않는다) */
function merge(list: RoomMessage[], latest: RoomMessage[]) {
  const at = new Map(list.map((m, i) => [m.id, i]));
  const out = [...list];
  for (const m of latest) {
    const i = at.get(m.id);
    if (i === undefined) out.push(m);
    else out[i] = m;
  }
  return out;
}

const newClientId = () => crypto.randomUUID();

/**
 * 글에 묶인 대화(번개 참가자 방 · 팀 신청자와 둘만) — 장터 채팅방(components/dugout/chat-room.tsx)과 같은 모양 · 같은 5초 새로 읽기.
 * 2026-10-26: 처음엔 최근 50개(예전엔 오래된 것부터 300개라 대화가 길면 새 말이 안 보였다), '이전 대화 보기'로 한 장씩 더.
 * 위를 읽는 중이면 새 말이 와도 끌어내리지 않는다. 보내기가 실패하면 적은 말과 보낸 번호(clientId)를 그대로 두어, 다시 보내도 한 번만 남는다.
 */
export function CommunityRoom({
  postId,
  thread,
  messages,
  hasOlder,
  canWrite,
  closedNote,
  empty,
}: {
  postId: string;
  thread: string | null;
  messages: RoomMessage[];
  hasOlder: boolean;
  canWrite: boolean;
  closedNote: string | null;
  empty: string;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [clientId, setClientId] = useState(newClientId);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(messages);
  const [list, setList] = useState(messages);
  const [more, setMore] = useState(hasOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /* 다음 그림에서 할 굴림 — 맨 아래로(처음 · 내 말 · 아래에 붙어 읽는 중) 또는 앞 장을 붙인 만큼 그대로 두기 */
  const pending = useRef<{ kind: 'bottom' } | { kind: 'keep'; height: number; top: number } | null>({ kind: 'bottom' });
  /* 지금 아래에 붙어 있나 — 굴릴 때마다 적어 둔다(그리는 중에 ref 를 읽지 않게) */
  const atBottom = useRef(true);

  if (messages !== seen) {
    setSeen(messages);
    setList((now) => merge(now, messages));
  }

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const p = pending.current ?? (atBottom.current ? { kind: 'bottom' as const } : null);
    pending.current = null;
    if (!p) return;
    if (p.kind === 'bottom') el.scrollTop = el.scrollHeight;
    else el.scrollTop = p.top + (el.scrollHeight - p.height);
  }, [list]);

  useEffect(() => {
    if (!canWrite) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') quietRefresh(router);
    }, 5000);
    return () => window.clearInterval(t);
  }, [router, canWrite]);

  async function loadOlder() {
    const first = list[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const page = await orOffline(loadOlderRoomMessages(postId, thread, first.id), null);
    setLoadingOlder(false);
    if (!page) return setError(OFFLINE_MESSAGE);
    const el = scroller.current;
    if (el) pending.current = { kind: 'keep', height: el.scrollHeight, top: el.scrollTop };
    setMore(page.hasOlder);
    setList((now) => {
      const have = new Set(now.map((m) => m.id));
      return [...page.messages.filter((m) => !have.has(m.id)), ...now];
    });
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    const fd = new FormData();
    fd.set('postId', postId);
    if (thread) fd.set('thread', thread);
    fd.set('body', body);
    fd.set('clientId', clientId);
    setSending(true);
    const r = await orOffline(sendRoomMessage(undefined, fd), { error: OFFLINE_MESSAGE });
    setSending(false);
    /* 실패하면 적은 말 · 보낸 번호를 그대로 — 다시 누르면 같은 번호라 서버가 둘로 만들지 않는다 */
    if (r?.error) return setError(r.error);
    setError(null);
    setText('');
    setClientId(newClientId());
    pending.current = { kind: 'bottom' };
    quietRefresh(router);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
        }}
        className="max-h-96 min-h-32 space-y-2 overflow-y-auto px-4 py-4"
      >
        {more && list.length > 0 && (
          <div className="pb-2 text-center">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="min-h-9 rounded-full bg-ink/6 px-4 text-xs font-semibold text-ink disabled:opacity-50"
            >
              {loadingOlder ? '불러오는 중…' : '이전 대화 보기'}
            </button>
          </div>
        )}
        {list.length === 0 && <p className="py-6 text-center text-sm text-muted">{empty}</p>}
        {list.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
            {!m.mine && <span className="mb-0.5 text-xs text-muted">{m.nickname}</span>}
            <div className={`flex items-end gap-1.5 ${m.mine ? 'flex-row-reverse' : ''}`}>
              {m.note ? (
                <p className="rounded-[1.25rem] border border-dashed border-line px-4 py-2 text-xs text-muted">{m.note}</p>
              ) : (
                <p
                  className={`max-w-[75vw] rounded-[1.25rem] px-4 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap sm:max-w-md ${
                    m.mine ? 'bg-sky text-white' : 'bg-ink/7 text-ink'
                  }`}
                >
                  {m.body}
                </p>
              )}
              <span className="mb-1 text-[10px] text-muted">{m.time}</span>
              {m.canReport && !m.note && <CommunityReportForm messageId={m.id} compact />}
            </div>
          </div>
        ))}
      </div>
      {canWrite ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="border-t border-line px-4 py-2"
        >
          {error && <FormError>{error}</FormError>}
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
                  void send();
                }
              }}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none [field-sizing:content]"
            />
            {text.trim() && (
              <button
                type="submit"
                disabled={sending}
                className="mb-1.5 shrink-0 px-1 text-sm font-bold text-sky disabled:opacity-50"
              >
                {sending ? '보내는 중' : error ? '다시 보내기' : '보내기'}
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">{closedNote ?? '대화방이 닫혔어요.'}</p>
      )}
    </div>
  );
}
