import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadOrgNotices } from '@/app/actions/app-org';
import { Bar, BarButton, LoadState, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { Card, Empty, dayLabel } from '~/org/parts';

/** 조직 공지 목록(앱 화면, 1.5단계) — 고정 먼저, 새 것부터. 누르면 고치기, 오른쪽 위 '쓰기'. 선수는 제 공간 화면에서 본다 */
type Loaded = Awaited<ReturnType<typeof loadOrgNotices>>;

export default function OrgNoticesScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { org } = useLocalSearchParams<{ org: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadOrgNotices', org ?? '');
  const open = (id?: string) => router.push(`/org/notice?org=${org}${id ? `&id=${id}` : ''}` as Href);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="공지" right={<BarButton label="쓰기" onPress={() => open()} c={c} />} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}>
          {data.notices.length === 0 ? (
            <Card c={c}>
              <Empty text="아직 올린 공지가 없어요. 오른쪽 위 '쓰기'로 올려요." c={c} />
            </Card>
          ) : (
            data.notices.map((n) => (
              <Pressable key={n.id} accessibilityRole="button" onPress={() => open(n.id)}>
                <Card c={c}>
                  <Text style={[TYPE.sub, { color: n.pinned ? c.sky : c.muted }]}>
                    {n.pinned ? '고정 · ' : ''}
                    {dayLabel(n.key)}
                    {n.author ? ` · ${n.author}` : ''}
                  </Text>
                  <Text style={[TYPE.card, { color: c.ink }]}>{n.title}</Text>
                  <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={3}>
                    {n.body}
                  </Text>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
