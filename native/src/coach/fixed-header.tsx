import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, AppState, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wordmark } from '~/shell/wordmark';
import { MenuButton } from '~/shell/menu-button';
import { Icon } from '~/shell/icon';
import { usePalette } from '~/lib/ui';
import { rpc } from '~/lib/rpc';
import { useSpace } from '~/org/space-store';
import { pushOpen } from '~/shell/release';
import { MARK_PATH } from '~/shell/mark-path';
import Svg, { Defs, LinearGradient, Rect, Stop, Path } from 'react-native-svg';

export function CoachHeader({ onNotice, onStart }: { onNotice: () => void; onStart: () => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.25;
  const { spaces } = useSpace();
  const [general, setGeneral] = useState(0);
  const [status, setStatus] = useState<{ active: boolean; unread: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      let request = 0;
      const refresh = () => {
        if (AppState.currentState !== 'active') return;
        const seq = ++request;
        void rpc<number>('notifications.countBellNotifications', 'general')
          .then(value => { if (live && seq === request) setGeneral(value); })
          .catch(() => {});
        void rpc<{ active: boolean; unread: number }>('coach-chat.loadCoachInboxStatus')
          .then((value) => {
            if (live && seq === request) setStatus(value);
          })
          .catch(() => {});
      };
      refresh();

      const sub = AppState.addEventListener('change', refresh);
      const timer = setInterval(refresh, 30000);
      return () => {
        live = false;
        clearInterval(timer);
        sub.remove();
      };
    }, [])
  );
  const mark = <Wordmark allowFontScaling={false} />;
  const unread = status?.unread ?? 0;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: inset.top, backgroundColor: c.page }}>
      <View style={{ height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1 }}>
          {spaces.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="내 싱커, 공간 바꾸기"
              onPress={() => router.push('/org/pick')}
              style={{ minHeight: 44, flexDirection: 'row', gap: 4, alignItems: 'center' }}
            >
              {mark}
              <Icon name="chevron-down" size={14} color={c.muted} />
            </Pressable>
          ) : (
            mark
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={general ? `알림, 안 읽은 알림 ${general}개` : '알림'}
          onPress={onNotice}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="bell" size={19} color={c.muted} />
          {general > 0 && (
            <View
              style={{
                position: 'absolute',
                right: 10,
                top: 9,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: c.warn,
              }}
            />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `코치, 안 읽은 메시지 ${unread}개` : '코치'}
          onPress={async () => {
            try {
              const current = status ?? (await rpc<{ active: boolean; unread: number }>('coach-chat.loadCoachInboxStatus'));
              if (current.active) pushOpen('/coach-chat');
              else onStart();
            } catch {
              onStart();
            }
          }}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <View
            style={{
              width: compact ? 44 : 84,
              height: 36,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#42596d',
              backgroundColor: '#192e42',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Svg style={StyleSheet.absoluteFill} width={compact ? 42 : 82} height={34} pointerEvents="none" accessible={false}>
              <Defs><LinearGradient id="coachSurface" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#263c51"/><Stop offset="1" stopColor="#122133"/>
              </LinearGradient></Defs>
              <Rect width="100%" height="100%" rx={17} fill="url(#coachSurface)"/>
            </Svg>
            <Svg width={18} height={18} viewBox="0 0 1023 1031">
              <Path d={MARK_PATH} fill="#a5e1ff" />
            </Svg>
            {!compact && <Text style={{ color: '#f7fbff', fontSize: 15, fontWeight: '700' }}>코치</Text>}
            {unread > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -1,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 3,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: c.page,
                  backgroundColor: '#bd3046',
                }}
              >
                <Text allowFontScaling={false} style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>
                  {unread > 9 ? '9+' : unread}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
        <MenuButton />
      </View>
    </View>
  );
}
