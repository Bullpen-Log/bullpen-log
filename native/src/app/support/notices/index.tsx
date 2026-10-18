import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppNotices } from '@/app/actions/support';
import { type Href, router } from 'expo-router';
import { Bar, BarButton, LoadState, NoticeRows, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';

/**
 * 공지 전체(앱 화면) — 웹 app/(app)/support/notices/page.tsx. 고정 공지가 먼저, 그다음 새 글 순. 관리자의 '공지 쓰기'는 앱 쓰기 화면(admin/notice.tsx).
 */
type Loaded = Awaited<ReturnType<typeof loadAppNotices>>;

export default function NoticesScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('support.loadAppNotices');

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="고객센터"
        title="공지"
        right={data?.isAdmin ? <BarButton label="공지 쓰기" onPress={() => router.push('/admin/notice' as Href)} c={c} /> : undefined}
        c={c}
      />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: inset.bottom + 32 }}>
          {data.notices.length === 0 ? (
            <View style={{ padding: 24, gap: 8, alignItems: 'center' }}>
              <Text style={[s.title, { color: c.ink }]}>아직 올라온 공지가 없어요</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>점검 · 새 기능 · 바뀐 점이 있으면 여기에 올라와요.</Text>
            </View>
          ) : (
            <View style={[s.group, { backgroundColor: c.card }]}>
              <NoticeRows rows={data.notices} c={c} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
