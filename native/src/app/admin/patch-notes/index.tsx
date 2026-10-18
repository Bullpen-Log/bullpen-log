import { type Href, router } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppPatchNotes } from '@/app/actions/app-admin';
import { Bar, LoadState, Row, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 패치노트(앱 화면, 관리자) — 웹 app/(app)/admin/patch-notes/page.tsx: 한 줄 = 한 사람의 하루(첫 커밋 제목 · 커밋 수 · 고친 줄 · 메모 있음).
 * 내용은 깃에서 온다(scripts/sync-patch-notes.mjs) — 사람이 적는 건 상세의 메모뿐.
 */
type Loaded = Awaited<ReturnType<typeof loadAppPatchNotes>>;

export default function PatchNotesScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppPatchNotes');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="관리자" title="패치노트" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          {data.notes.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>아직 패치노트가 없어요.</Text>
          ) : (
            <View style={[s.group, { backgroundColor: c.card }]}>
              {data.notes.map((n, i) => (
                <Row key={n.id} onPress={() => router.push(`/admin/patch-notes/${n.id}` as Href)} last={i === data.notes.length - 1} c={c}>
                  <Text style={[s.meta, { color: c.sky, fontWeight: '600' }]}>
                    {n.author} · {n.day}
                    {n.hasNote ? ' · 메모' : ''}
                  </Text>
                  <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
                    {n.headline || '(제목 없음)'}
                  </Text>
                  <Text style={[s.meta, { color: c.muted }]}>
                    커밋 {n.commits}개 · +{n.insertions} −{n.deletions}
                    {n.areas.length > 0 ? ` · ${n.areas.slice(0, 3).join(' · ')}` : ''}
                  </Text>
                </Row>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
