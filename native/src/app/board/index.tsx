import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppBoard } from '@/app/actions/board';
import { Bar, BarButton, LoadState, Row, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';

/**
 * 자료실 목록(앱 화면) — 웹 app/(app)/board/page.tsx 를 옮겼다. 사이트의 /board 가 앱(BullpenNative/7 부터)이면 이 화면을 띄운다(page.tsx →
 * OpenNative). 읽기는 board.loadAppBoard(웹과 같은 줄 · 새 글부터). 글쓰기는 관리자만(웹과 같다).
 */
type List = Awaited<ReturnType<typeof loadAppBoard>>;
type Article = Extract<List, { ok: true }>['articles'][number];

export default function BoardScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<List>('board.loadAppBoard');
  const [pulling, setPulling] = useState(false);

  const row = ({ item, index }: { item: Article; index: number }) => (
    <View
      style={[
        { backgroundColor: c.card },
        index === 0 && { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
        index === (data?.articles.length ?? 0) - 1 && { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
      ]}
    >
      <Row onPress={() => router.push(`/board/${item.id}` as Href)} last={index === (data?.articles.length ?? 0) - 1} c={c}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text style={[s.title, { color: c.ink, flex: 1 }]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.hasLink ? <SymbolView name="paperclip" size={15} tintColor={c.muted} style={{ marginTop: 3 }} /> : null}
        </View>
        <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }} numberOfLines={2}>
          {item.preview}
        </Text>
        {item.tags.length > 0 ? (
          <Text style={{ color: c.sky, fontSize: 13 }} numberOfLines={1}>
            {item.tags.map((t) => `#${t}`).join(' ')}
          </Text>
        ) : null}
        <Text style={[s.meta, { color: c.muted }]}>
          {item.nickname} · {item.date} · 조회 {item.views}
        </Text>
      </Row>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="뒤로"
        title="자료실"
        right={data?.canWrite ? <BarButton label="글쓰기" onPress={() => router.push('/board/new' as Href)} c={c} /> : null}
        c={c}
      />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <FlatList
          data={data.articles}
          keyExtractor={(a) => a.id}
          renderItem={row}
          contentContainerStyle={{ padding: 16, paddingBottom: inset.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={pulling}
              onRefresh={async () => {
                setPulling(true);
                await reload();
                setPulling(false);
              }}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 6, paddingTop: 48 }}>
              <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>아직 등록된 자료가 없어요</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>
                {data.canWrite ? '첫 번째 자료를 올려 보세요.' : '투구 역학과 트레이닝 자료가 올라오면 여기에 보여요.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
