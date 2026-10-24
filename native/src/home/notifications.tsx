import { useCallback, useEffect, useState } from 'react';
import { useFocusRefresh } from '~/shell/tab-pager';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { BellNotification } from '@/app/actions/notifications';
import { KIND_LABEL, type NotifyKind } from '@/lib/notify-rules';
import { rpc } from '~/lib/rpc';
import type { Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';

/**
 * 진짜 알림(앱) — 웹 components/notification-list.tsx 와 같은 목록(2026-10-22 금윤호: "알림이 있으면 표시하고 없으면 알림이 없습니다, 싱커와 덕아웃 둘 다").
 * 서버 Notification 표(채팅 · 예약 · 레슨 기록 · 댓글 · 팀 공지)를 rpc 'notifications.*' 로 읽는다. 누르면 읽음으로 두고 그 자리(사이트 주소)를 웹뷰로 연다.
 */

/** 홈 종의 점 — 안 읽은 알림 수. 화면에 돌아올 때마다 다시 묻는다 */
export function useUnreadNotifications(): number {
  const [count, setCount] = useState(0);
  /* 돌아올 때마다 · 닫히는 움직임 중에 묻지 않게 — 판 공통 규칙(30초 · 쓴 것 있음, shell/tab-pager) */
  useFocusRefresh(
    () =>
      void rpc<number>('notifications.countBellNotifications')
        .then(setCount)
        .catch(() => {}),
    { first: true }
  );
  return count;
}

function ago(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 2 * 86400) return '어제';
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/*
 * 지난번 목록 — 알림 창(formSheet · 내용만큼 높이)을 다시 열면 이것부터 보이고 새로 받는다. 예전엔 열 때마다 돌개(작은 창) → 목록으로 창 높이가
 * 튀었다(2026-10-24 두 번째 검토). 로그아웃하면 비운다(app/index resetAccount)
 */
let lastItems: BellNotification[] | null = null;
export const resetNotificationList = () => {
  lastItems = null;
};

export function NotificationList({ c }: { c: Palette }) {
  const [items, setItemsRaw] = useState<BellNotification[] | null>(lastItems);
  const setItems = useCallback((next: BellNotification[] | null | ((l: BellNotification[] | null) => BellNotification[] | null)) => {
    setItemsRaw((l) => {
      const v = typeof next === 'function' ? next(l) : next;
      lastItems = v;
      return v;
    });
  }, []);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());

  const fetchList = useCallback(
    () =>
      rpc<{ items: BellNotification[]; unread: number }>('notifications.loadBellNotifications')
        .then((r) => setItems(r.items))
        .catch(() => setFailed(true)),
    [setItems]
  );
  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const open = (n: BellNotification) => {
    if (!n.read) {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? list);
      rpc('notifications.readBellNotifications', n.id).catch(() => {});
    }
    if (n.link) leaveTo(n.link);
  };
  const readAll = () => {
    setItems((list) => list?.map((x) => ({ ...x, read: true })) ?? list);
    rpc('notifications.readBellNotifications').catch(() => {});
  };
  const unread = items?.filter((n) => !n.read).length ?? 0;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
        <Text style={{ color: c.muted, fontSize: 15, fontWeight: '600' }}>알림</Text>
        {unread > 0 ? (
          <Pressable accessibilityRole="button" onPress={readAll} hitSlop={8}>
            <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>모두 읽음</Text>
          </Pressable>
        ) : null}
      </View>
      {failed && items == null ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setFailed(false);
            void fetchList();
          }}
          style={{ paddingVertical: 14 }}
        >
          <Text style={{ color: c.muted, fontSize: 15 }}>
            알림을 불러오지 못했어요. <Text style={{ color: c.sky, fontWeight: '600' }}>다시 불러오기</Text>
          </Text>
        </Pressable>
      ) : items == null ? (
        <ActivityIndicator color={c.muted} style={{ paddingVertical: 14 }} />
      ) : items.length === 0 ? (
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 20 }}>알림이 없습니다</Text>
      ) : (
        items.map((n) => (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            onPress={() => open(n)}
            style={({ pressed }) => [
              { flexDirection: 'row', gap: 10, borderRadius: 16, padding: 14, backgroundColor: c.page, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.read ? 'transparent' : c.sky }} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ color: c.sky, fontSize: 12, fontWeight: '600' }}>{KIND_LABEL[n.kind as NotifyKind] ?? '알림'}</Text>
                <Text style={{ marginLeft: 'auto', color: c.muted, fontSize: 12 }}>{ago(n.at, now)}</Text>
              </View>
              <Text style={{ color: n.read ? c.muted : c.ink, fontSize: 15, fontWeight: n.read ? '400' : '600' }}>{n.title}</Text>
              {n.body ? (
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
                  {n.body}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}
