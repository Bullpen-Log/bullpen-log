'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  countBellNotifications,
  loadBellNotifications,
  readBellNotifications,
  type BellNotification,
} from '@/app/actions/notifications';
import { KIND_LABEL, type NotifyKind } from '@/lib/notify-rules';

/**
 * 진짜 알림(2026-10-22 금윤호: "알림이 있으면 알림을 표시하고 없으면 알림이 없습니다 — 싱커와 덕아웃 둘 다").
 * 알림은 서버가 쌓는 Notification 표(lib/notify.ts notify — 채팅 · 예약 · 레슨 기록 · 댓글 · 팀 공지)에서 읽는다. 종 밑 작은 창이 열릴 때 받고,
 * 누르면 읽음으로 두고 그 자리로 간다. 종의 점은 useUnreadNotifications 가 센다(창 · 다른 종과 같이 맞춘다 — NOTIFY_CHANGED).
 */

/** 읽음 수가 바뀌었다 — 화면의 모든 종이 점을 다시 맞춘다(detail = 안 읽은 수) */
const NOTIFY_CHANGED = 'bullpen:notifications';

function announce(unread: number) {
  window.dispatchEvent(new CustomEvent(NOTIFY_CHANGED, { detail: unread }));
}

/**
 * 안 읽은 알림 수 — 서버가 준 처음 값(initial)에서 시작해, 화면에 돌아올 때 · 1분마다 다시 묻는다. 로그인 전이면 늘 0.
 */
export function useUnreadNotifications(initial = 0, enabled = true): number {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      countBellNotifications()
        .then((n) => alive && setCount(n))
        .catch(() => {});
    };
    const onChanged = (e: Event) => setCount((e as CustomEvent<number>).detail);
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(NOTIFY_CHANGED, onChanged);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(NOTIFY_CHANGED, onChanged);
    };
  }, [enabled]);
  return enabled ? count : 0;
}

/** '방금' · '5분 전' · '3시간 전' · '어제' · '10월 3일' */
function ago(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 2 * 86400) return '어제';
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 종 창 안의 알림 목록. sheet 는 휴대폰 아래 시트(옅은 면 · 큰 글자), 없으면 PC 종 밑 작은 창.
 */
export function NotificationList({
  onNavigate,
  sheet = false,
}: {
  /** 알림을 눌러 다른 화면으로 간다 — 창을 닫는다 */
  onNavigate?: () => void;
  sheet?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<BellNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());

  const fetchList = useCallback(
    () =>
      loadBellNotifications()
        .then((r) => {
          setItems(r.items);
          announce(r.unread);
        })
        .catch(() => setFailed(true)),
    []
  );
  useEffect(() => {
    void fetchList();
  }, [fetchList]);
  const load = () => {
    setFailed(false);
    void fetchList();
  };

  const open = (n: BellNotification) => {
    if (!n.read) {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? list);
      readBellNotifications(n.id).then(announce).catch(() => {});
    }
    if (n.link) {
      onNavigate?.();
      router.push(n.link);
    }
  };
  const readAll = () => {
    setItems((list) => list?.map((x) => ({ ...x, read: true })) ?? list);
    announce(0);
    readBellNotifications().then(announce).catch(() => {});
  };

  const unread = items?.filter((n) => !n.read).length ?? 0;
  const head = sheet ? 'text-sm font-semibold text-muted' : 'text-[11px] font-semibold text-ink/65';

  return (
    <section aria-label="알림">
      <div className="flex min-h-7 items-center justify-between px-1">
        <p className={head}>알림</p>
        {unread > 0 && (
          <button
            type="button"
            onClick={readAll}
            className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-sky transition-colors hover:bg-sky/10"
          >
            모두 읽음
          </button>
        )}
      </div>

      {failed ? (
        <div className="px-1 py-3 text-sm text-muted">
          알림을 불러오지 못했어요.{' '}
          <button type="button" onClick={load} className="font-semibold text-sky">
            다시 불러오기
          </button>
        </div>
      ) : items == null ? (
        <div aria-busy className="space-y-2 px-1 py-2">
          <div className="h-3 w-3/4 rounded bg-line motion-safe:animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-line motion-safe:animate-pulse" />
        </div>
      ) : items.length === 0 ? (
        <p className={`px-1 py-4 text-center text-sm text-muted ${sheet ? 'py-6' : ''}`}>
          알림이 없습니다
        </p>
      ) : (
        <ul className={sheet ? 'mt-2 space-y-2' : 'mt-1 space-y-0.5'}>
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full items-start gap-2.5 text-left transition-colors ${
                  sheet ? 'min-h-14 rounded-2xl bg-surface-2 p-3.5' : 'min-h-11 rounded-xl px-2 py-2 hover:bg-ink/5'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-sky'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="shrink-0 text-[11px] font-semibold text-sky-strong">
                      {KIND_LABEL[n.kind as NotifyKind] ?? '알림'}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(n.at, now)}</span>
                  </span>
                  <span className={`block text-sm leading-snug ${n.read ? 'text-muted' : 'font-semibold text-ink'}`}>
                    {n.title}
                  </span>
                  {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
