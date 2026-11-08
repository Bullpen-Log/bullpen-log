import * as Notifications from 'expo-notifications';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InboxItem } from '@/lib/notification-inbox';
import { isCalendarDate } from '@/lib/calendar-month';
import { toDateKey } from '@/lib/pitch-stats';
import { calendarDateLabel } from '~/calendar/parts';
import { homeSnapshot } from '~/home/tab';
import { cacheEpoch } from '~/lib/store';
import { SITE_URL } from '~/lib/site';
import { usePalette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { canOpen } from '~/shell/release';
import { Press } from '~/shell/press';
import { leaveTo, openCheckin } from '~/shell/web-nav';
import { InboxList } from './list';
import { inboxIcon, inboxKind, safeInboxPath } from './model';
import { INBOX_WIDTH, InboxLink, InboxNotice, InboxSheet, InboxTile } from './parts';
import { inboxStore, useInbox } from './store';

export default function NoticeScreen() {
  const c = usePalette(),
    inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    date?: string;
    checkin?: string;
    pitch?: string;
    locked?: string;
    only?: string;
  }>();
  const home = homeSnapshot();
  const date = isCalendarDate(params.date)
    ? params.date
    : (home?.today ?? toDateKey(new Date()));
  const current = home?.today === date ? home : null;
  const checkinDone = current?.checkinDone ?? params.checkin === '1',
    pitchDone = current?.pitchDone ?? params.pitch === '1',
    locked = current?.pitchLocked ?? params.locked === '1';
  const remaining = Number(!checkinDone) + Number(!pitchDone);
  const s = useInbox();
  const [sheet, setSheet] = useState<'tasks' | 'blocked' | InboxItem | null>(null);
  const [denied, setDenied] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const epoch = cacheEpoch();
      const check = () =>
        void Notifications.getPermissionsAsync()
          .then((p) => {
            if (active && epoch === cacheEpoch()) setDenied(p.status === 'denied');
          })
          .catch(() => undefined);
      check();
      void inboxStore.load();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          check();
          void inboxStore.load(true);
        }
      });
      return () => {
        active = false;
        subscription.remove();
      };
    }, [])
  );
  const close = () => (router.canGoBack() ? router.back() : leaveTo('/today'));
  const open = (n: InboxItem) => {
    if (!n.link) {
      setSheet(n);
      if (!n.read) void inboxStore.mark({ scope: 'one', id: n.id });
      return;
    }
    const path = safeInboxPath(n.link, SITE_URL);
    if (!path || !canOpen(path)) {
      setSheet('blocked');
      return;
    }
    if (!n.read) void inboxStore.mark({ scope: 'one', id: n.id });
    leaveTo(path);
  };
  const go = (path: string) => {
    setSheet(null);
    router.replace(path as Href);
  };
  const task = (title: string, sub: string, icon: IconName, onPress: () => void) => (
    <Press
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 88,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.line,
      }}
    >
      <InboxTile name={icon} c={c} />
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{sub}</Text>
      </View>
      <Icon name="chevron-right" color={c.muted} size={14} />
    </Press>
  );
  const todo =
    params.only !== '1' && remaining > 0 ? (
      <Press
        accessibilityRole="button"
        accessibilityLabel={`오늘 할 일 ${remaining}개`}
        onPress={() => setSheet('tasks')}
        style={{
          backgroundColor: c.skyTint,
          marginTop: 24,
          padding: 15,
          borderRadius: 22,
          minHeight: 76,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <InboxTile name="clipboard-list" c={c} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              flexWrap: 'wrap',
            }}
          >
            <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>
              오늘 할 일
            </Text>
            <Text
              style={{
                color: c.link,
                backgroundColor: c.card,
                borderRadius: 7,
                paddingHorizontal: 7,
                paddingVertical: 1,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {remaining}
            </Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {[
              !checkinDone ? '체크인' : null,
              !pitchDone ? (locked ? '투구 기록 설정' : '투구 기록') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Icon name="chevron-right" color={c.muted} size={14} />
      </Press>
    ) : null;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.page,
        paddingBottom: Math.max(12, inset.bottom),
      }}
    >
      <View
        accessibilityElementsHidden={!!sheet}
        importantForAccessibility={sheet ? 'no-hide-descendants' : 'auto'}
        style={{ flex: 1 }}
      >
        <View
          style={[
            INBOX_WIDTH,
            {
              paddingHorizontal: 18,
              paddingTop: 16,
              paddingBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            },
          ]}
        >
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: c.ink,
              fontSize: 24,
              fontWeight: '700',
              letterSpacing: -0.7,
            }}
          >
            알림
          </Text>
          <Press
            accessibilityRole="button"
            accessibilityLabel="알림 새로고침"
            disabled={s.loading || s.refreshing}
            onPress={() => void inboxStore.load(true)}
            style={styles.icon}
          >
            <Icon name="rotate-cw" color={c.muted} size={21} />
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="알림 닫기"
            onPress={close}
            style={[styles.icon, { backgroundColor: c.chip, borderRadius: 22 }]}
          >
            <Icon name="x" color={c.muted} size={20} />
          </Press>
        </View>
        <InboxList
          c={c}
          onOpen={open}
          footer={todo}
          permissionNotice={
            denied ? (
              <>
                <InboxNotice
                  text="기기 알림이 꺼져 있어요."
                  action="설정 열기"
                  onPress={() => {
                    setSettingsError(null);
                    void Linking.openSettings().catch(() =>
                      setSettingsError('설정을 열지 못했어요. 다시 시도해주세요.')
                    );
                  }}
                  c={c}
                />
                {settingsError ? (
                  <Text
                    accessibilityRole="alert"
                    style={{ color: c.warn, fontSize: 13, marginBottom: 12 }}
                  >
                    {settingsError}
                  </Text>
                ) : null}
              </>
            ) : null
          }
        />
      </View>
      {sheet ? (
        <InboxSheet
          title={
            sheet === 'tasks'
              ? '오늘 할 일'
              : sheet === 'blocked'
                ? '알림'
                : '알림 내용'
          }
          onClose={() => setSheet(null)}
          c={c}
        >
          {sheet === 'tasks' ? (
            <>
              <Text style={{ color: c.muted, fontSize: 13, marginBottom: 12 }}>
                {calendarDateLabel(date)}
              </Text>
              {!checkinDone
                ? task('체크인', '오늘 컨디션 남기기', 'heart-pulse', () => {
                    setSheet(null);
                    openCheckin();
                  })
                : null}
              {!pitchDone
                ? task(
                    locked ? '투구 기록 설정' : '투구 기록',
                    locked ? '기본 정보 확인' : '기록 · 휴식',
                    'circle-dot',
                    () => go(locked ? '/setup/pitch' : `/pitch/${date}`)
                  )
                : null}
              <View
                style={{
                  flexDirection: 'row',
                  gap: 16,
                  flexWrap: 'wrap',
                  marginTop: 10,
                }}
              >
                {checkinDone ? (
                  <InboxLink
                    label="체크인 보기"
                    onPress={() => {
                      setSheet(null);
                      openCheckin();
                    }}
                    c={c}
                  />
                ) : null}
                {pitchDone ? (
                  <InboxLink
                    label="투구 기록 보기"
                    onPress={() => go(`/pitch/${date}`)}
                    c={c}
                  />
                ) : null}
              </View>
            </>
          ) : sheet === 'blocked' ? (
            <View style={{ paddingVertical: 35, alignItems: 'center', gap: 16 }}>
              <InboxTile name="info" large c={c} />
              <Text
                accessibilityRole="header"
                style={{
                  color: c.ink,
                  fontSize: 20,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                이 내용을 열 수 없어요
              </Text>
              <Text style={{ color: c.muted, fontSize: 14, textAlign: 'center' }}>
                지금은 볼 수 없는 내용이에요.
              </Text>
              <InboxLink
                label="알림으로 돌아가기"
                onPress={() => setSheet(null)}
                c={c}
              />
            </View>
          ) : (
            <View style={{ gap: 18, paddingTop: 8, paddingBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Icon name={inboxIcon(sheet.kind)} color={c.muted} size={18} />
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  {inboxKind(sheet.kind)}
                </Text>
              </View>
              <Text
                style={{
                  color: c.ink,
                  fontSize: 24,
                  fontWeight: '700',
                  lineHeight: 33,
                }}
              >
                {sheet.title}
              </Text>
              {sheet.body ? (
                <Text selectable style={{ color: c.ink, fontSize: 16, lineHeight: 27 }}>
                  {sheet.body}
                </Text>
              ) : null}
            </View>
          )}
        </InboxSheet>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  icon: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
