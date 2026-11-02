import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { InboxItem } from '@/lib/notification-inbox';
import type { Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { inboxIcon, inboxKind, inboxSections, inboxTime } from './model';
import { INBOX_WIDTH, InboxLink, InboxNotice, InboxTile } from './parts';
import { inboxStore, useInbox } from './store';

export function InboxList({
  c,
  onOpen,
  footer,
  permissionNotice,
}: {
  c: Palette;
  onOpen: (n: InboxItem) => void;
  footer?: ReactNode;
  permissionNotice?: ReactNode;
}) {
  const s = useInbox();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const sections = useMemo(() => inboxSections(s.items ?? [], now), [s.items, now]);
  const busy = s.writing || s.checking;
  return (
    <SectionList<InboxItem, { title: string; data: InboxItem[] }>
      sections={sections}
      keyExtractor={(n) => n.id}
      stickySectionHeadersEnabled={false}
      style={{ flex: 1 }}
      contentContainerStyle={[
        INBOX_WIDTH,
        { paddingHorizontal: 18, paddingBottom: 28 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={s.refreshing}
          onRefresh={() => void inboxStore.load(true)}
          tintColor={c.link}
        />
      }
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      ListHeaderComponent={
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              minHeight: 44,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: c.muted }}>
              {s.writing ? (
                '읽음 처리 중…'
              ) : s.pending ? (
                '읽음 확인 필요'
              ) : s.unread == null ? (
                '받은 알림'
              ) : (
                <>
                  안 읽음{' '}
                  <Text
                    style={{
                      color: c.link,
                      fontSize: 16,
                      fontWeight: '700',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {s.unread}
                  </Text>
                </>
              )}
            </Text>
            {(s.unread ?? 0) > 0 && !s.pending && s.before ? (
              <InboxLink
                label={s.writing ? '처리 중…' : '모두 읽음'}
                disabled={busy || !s.ready || s.newer}
                onPress={() => {
                  if (s.before)
                    void inboxStore.mark({ scope: 'all', before: s.before });
                }}
                c={c}
              />
            ) : null}
          </View>
          {permissionNotice}
          {s.items != null && s.error ? (
            <InboxNotice
              text="새로 불러오지 못했어요. 이전 알림을 보여드려요."
              action="다시 불러오기"
              onPress={() => void inboxStore.load(true)}
              c={c}
              busy={s.refreshing}
            />
          ) : null}
          {s.pending && !s.writing ? (
            <InboxNotice
              text={s.readError ?? '읽음 처리 여부를 확인하지 못했어요.'}
              action={s.checking ? '확인 중…' : '읽음 여부 확인'}
              onPress={() => void inboxStore.verify()}
              busy={busy}
              c={c}
            />
          ) : s.readError ? (
            <InboxNotice
              text={s.readError}
              action="다시 시도"
              onPress={() => void inboxStore.retry()}
              busy={busy}
              c={c}
            />
          ) : null}
          {s.newer ? (
            <InboxNotice
              text="새 알림이 있어요."
              action="새로 보기"
              onPress={() => void inboxStore.load(true)}
              busy={s.refreshing}
              info
              c={c}
            />
          ) : null}
        </>
      }
      ListEmptyComponent={
        s.newer ? undefined : s.items == null && !s.error ? (
          <View
            accessibilityLabel="알림 불러오는 중"
            accessibilityState={{ busy: true }}
            style={{ borderRadius: 24, backgroundColor: c.card, padding: 16, gap: 20 }}
          >
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 40,
                    borderRadius: 14,
                    backgroundColor: c.page,
                  }}
                />
                <View style={{ flex: 1, gap: 10 }}>
                  <View
                    style={{
                      width: '40%',
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: c.page,
                    }}
                  />
                  <View
                    style={{ height: 12, borderRadius: 6, backgroundColor: c.page }}
                  />
                  <View
                    style={{
                      width: '70%',
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: c.page,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ paddingVertical: 70, alignItems: 'center', gap: 16 }}>
            <InboxTile name={s.error ? 'info' : 'bell'} large c={c} />
            <Text
              accessibilityRole={s.error ? 'alert' : 'header'}
              style={{
                color: c.ink,
                fontSize: 18,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {s.error ? '알림을 불러오지 못했어요' : '받은 알림이 없어요'}
            </Text>
            {s.error ? (
              <InboxLink
                label="다시 불러오기"
                onPress={() => void inboxStore.load(true)}
                c={c}
              />
            ) : null}
          </View>
        )
      }
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          style={{
            color: c.muted,
            fontSize: 13,
            fontWeight: '600',
            paddingTop: 20,
            paddingBottom: 10,
            paddingLeft: 4,
          }}
        >
          {section.title}
        </Text>
      )}
      renderItem={({ item: n, index, section }) => (
        <View
          style={{
            backgroundColor: c.card,
            paddingHorizontal: 15,
            borderTopLeftRadius: index === 0 ? 24 : 0,
            borderTopRightRadius: index === 0 ? 24 : 0,
            borderBottomLeftRadius: index === section.data.length - 1 ? 24 : 0,
            borderBottomRightRadius: index === section.data.length - 1 ? 24 : 0,
          }}
        >
          <Press
            accessibilityRole="button"
            accessibilityLabel={`${n.read ? '읽음' : '안 읽음'}, ${inboxKind(n.kind)}, ${n.title}`}
            onPress={() => onOpen(n)}
            style={{
              paddingVertical: 17,
              borderTopWidth: index ? StyleSheet.hairlineWidth : 0,
              borderTopColor: c.line,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <InboxTile name={inboxIcon(n.kind)} c={c} />
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 4,
                }}
              >
                <Text style={{ color: c.muted, fontSize: 11 }}>
                  {inboxKind(n.kind)}
                </Text>
                <Text
                  style={{
                    color: c.muted,
                    fontSize: 11,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {inboxTime(n.at, now)}
                </Text>
              </View>
              <Text
                lineBreakStrategyIOS="hangul-word"
                style={{
                  color: c.ink,
                  fontSize: 16,
                  lineHeight: 24,
                  fontWeight: n.read ? '400' : '600',
                }}
              >
                {n.title}
              </Text>
              {n.body ? (
                <Text
                  numberOfLines={2}
                  lineBreakStrategyIOS="hangul-word"
                  style={{ color: c.muted, fontSize: 13, lineHeight: 21 }}
                >
                  {n.body}
                </Text>
              ) : null}
            </View>
            <View style={{ width: 9, paddingTop: 5, alignItems: 'center', gap: 15 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: n.read ? 'transparent' : c.link,
                }}
              />
              <Icon name="chevron-right" size={10} color={c.muted} />
            </View>
          </Press>
        </View>
      )}
      ListFooterComponent={
        <>
          {s.moreError ? (
            <View style={{ marginTop: 10 }}>
              <InboxNotice
                text={s.moreError}
                action="다시 불러오기"
                onPress={() => void inboxStore.more()}
                c={c}
              />
            </View>
          ) : null}
          {s.next ? (
            <Press
              accessibilityRole="button"
              disabled={s.more || s.refreshing}
              onPress={() => void inboxStore.more()}
              style={{
                minHeight: 52,
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              {s.more ? <ActivityIndicator color={c.link} size="small" /> : null}
              <Text style={{ color: c.link, fontSize: 13 }}>
                {s.more ? '불러오는 중…' : '이전 알림 보기'}
              </Text>
            </Press>
          ) : null}
          {s.items != null ? footer : null}
        </>
      }
    />
  );
}
