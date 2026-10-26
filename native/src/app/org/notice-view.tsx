import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadMyMembership } from '@/app/actions/app-org';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { Card, Empty, dayLabel } from '~/org/parts';

/**
 * 선수 · 회원이 보는 공지(계약 9-6 ①-4) — id 가 있으면 그 공지 하나(이때 읽음), 없으면 목록(제목 + 두 줄, 읽음 아님).
 * 공지는 **열어 볼 때만** 읽음이 된다 — 코치 공지 목록의 '열어 본 선수 n/m' 과 같은 뜻.
 */
type Loaded = Awaited<ReturnType<typeof loadMyMembership>>;

export default function NoticeViewScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ member: string; id?: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadMyMembership', p.member ?? '');
  const shown = data ? (p.id ? data.notices.filter((n) => n.id === p.id) : data.notices) : [];
  const openedId = p.id && shown.length ? shown[0].id : null;
  useEffect(() => {
    if (openedId && p.member) void call('app-team.markNoticesRead', p.member, [openedId]);
  }, [openedId, p.member]);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="공지" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}>
          {shown.length === 0 ? (
            <Card c={c}>
              <Empty text="공지를 찾을 수 없어요. 지워졌을 수 있어요." c={c} />
            </Card>
          ) : (
            shown.map((n) =>
              !p.id ? (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/org/notice-view?member=${p.member}&id=${n.id}` as Href)}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  <Card c={c}>
                    <Text style={[TYPE.sub, { color: n.pinned ? c.sky : c.muted }]}>
                      {n.pinned ? '고정 · ' : ''}
                      {dayLabel(n.key)}
                    </Text>
                    <Text style={[TYPE.card, { color: c.ink }]}>{n.title}</Text>
                    <Text style={[TYPE.sub, { color: c.muted }]} numberOfLines={2}>
                      {n.body}
                    </Text>
                  </Card>
                </Pressable>
              ) : (
                <Card key={n.id} c={c}>
                  <Text style={[TYPE.sub, { color: n.pinned ? c.sky : c.muted }]}>
                    {n.pinned ? '고정 · ' : ''}
                    {dayLabel(n.key)}
                    {n.author ? ` · ${n.author}` : ''}
                  </Text>
                  <Text style={[TYPE.card, { color: c.ink }]}>{n.title}</Text>
                  <Text selectable style={[TYPE.body, { color: c.ink }]}>
                    {n.body}
                  </Text>
                </Card>
              )
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}
