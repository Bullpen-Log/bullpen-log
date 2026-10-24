'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { RoundSearch } from '@/components/round-icon';
import { ChatAvatar } from '@/components/dugout/chat-avatar';
import { DugoutPageHeader } from '@/components/dugout/ui';

/**
 * 덕아웃 채팅 틀(2026-10-24 금윤호: "채팅 탭은 사진(인스타 DM)처럼 따로 상세하게") — 왼쪽 대화 목록 · 오른쪽 대화.
 * PC · 태블릿은 두 칸이 같이, 휴대폰은 /chat 이면 목록만 · /chat/<방> 이면 대화만. 목록 위 찾기는 이름 · 물건 · 마지막 말로 거른다(이 기기 안에서).
 */
export type ChatListItem = {
  id: string;
  name: string;
  avatarUrl: string | null;
  sub: string;
  last: string;
  ago: string;
  unread: number;
};

export function ChatShell({ rooms, children }: { rooms: ChatListItem[]; children: ReactNode }) {
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const active = pathname.startsWith('/chat/') ? pathname.slice('/chat/'.length) : null;
  const shown = q.trim()
    ? rooms.filter((r) => `${r.name} ${r.sub} ${r.last}`.toLowerCase().includes(q.trim().toLowerCase()))
    : rooms;

  return (
    <div className="-mx-4 -mt-5 flex h-[calc(var(--vvh,100dvh)-9.5rem)] overflow-hidden border-line bg-surface md:mx-0 md:mt-0 md:h-[calc(var(--vvh,100dvh)-10rem)] md:rounded-2xl md:border">
      {/* 왼쪽 — 대화 목록 */}
      <aside
        className={`${active ? 'hidden md:flex' : 'flex'} w-full min-w-0 flex-col border-line md:w-[340px] md:shrink-0 md:border-r`}
      >
        <div className="space-y-3 px-5 pt-5 pb-3">
          <DugoutPageHeader title="메시지" />
          <label className="relative block">
            <RoundSearch className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색"
              aria-label="대화 찾기"
              className="min-h-10 w-full appearance-none rounded-full bg-ink/6 pr-4 pl-10 text-sm text-ink placeholder:text-muted/70 focus:outline-none"
            />
          </label>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-3">
          {shown.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted">
              {rooms.length === 0 ? '아직 대화가 없어요' : '맞는 대화가 없어요'}
            </li>
          )}
          {shown.map((r) => {
            const on = r.id === active;
            const unread = on ? 0 : r.unread;
            return (
              <li key={r.id}>
                <Link
                  href={`/chat/${r.id}`}
                  scroll={false}
                  aria-current={on ? 'page' : undefined}
                  className={`flex items-center gap-3 px-5 py-3 transition-colors ${on ? 'bg-ink/6' : 'hover:bg-ink/4'}`}
                >
                  <ChatAvatar name={r.name} url={r.avatarUrl} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate text-[15px] text-ink ${unread ? 'font-bold' : 'font-semibold'}`}>{r.name}</span>
                      <span className="truncate text-xs text-muted">{r.sub}</span>
                    </span>
                    <span className={`mt-0.5 flex gap-1 text-[13px] ${unread ? 'font-semibold text-ink' : 'text-muted'}`}>
                      <span className="truncate">{r.last}</span>
                      <span className="shrink-0">· {r.ago}</span>
                    </span>
                  </span>
                  {unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky" aria-label={`안 읽은 ${unread}개`} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* 오른쪽 — 대화 */}
      <section className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>{children}</section>
    </div>
  );
}
