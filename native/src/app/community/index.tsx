import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POST_CATEGORIES, POST_SORTS, isPostCategory, postCategoryLabel, type PostCategory, type PostSort } from '@/lib/community';
import type { loadAppCommunity } from '@/app/actions/community';
import { Badge, Bar, BarButton, categoryColor, Chip, LoadState, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';

/**
 * 커뮤니티 목록(앱 화면) — 웹 app/(app)/community/page.tsx 를 옮겼다. 사이트의 /community 가 앱(BullpenNative/6 부터)이면 이 화면을 띄우고
 * (page.tsx → OpenNative), 읽기는 웹과 같은 곳(community.loadAppCommunity → lib/community-load.ts)이다. 구분 칩 · 최신/인기, 웹의 장 넘기기 대신
 * 끝까지 내리면 다음 장을 이어 붙인다. 가린 글은 관리자에게만 흐리게 보인다.
 */
type List = Awaited<ReturnType<typeof loadAppCommunity>>;
type Post = Extract<List, { ok: true }>['posts'][number];

/* ponytail: 이어 붙이기는 10장(200개)까지 — 서버(lib/community-load.ts MAX_PAGES)가 그만큼만 다시 읽는다. 더 필요하면 커서로 */
const MAX_PAGES = 10;

export default function CommunityScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; sort?: string }>();
  const [category, setCategory] = useState<PostCategory | null>(isPostCategory(params.category) ? params.category : null);
  const [sort, setSort] = useState<PostSort>(params.sort === 'hot' ? 'hot' : 'new');
  const [pages, setPages] = useState(1);
  /* 더 보기로 읽는 중 — 그때는 목록을 흐리지 않고 밑에 도는 표시만 */
  const [more, setMore] = useState(false);
  const [pulling, setPulling] = useState(false);
  const { data, stale, error, reload } = useLoad<List>('community.loadAppCommunity', category, sort, pages);

  const pick = (next: { category?: PostCategory | null; sort?: PostSort }) => {
    void Haptics.selectionAsync();
    if (next.category !== undefined) setCategory(next.category);
    if (next.sort) setSort(next.sort);
    setPages(1);
    setMore(false);
  };

  const head = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Chip label="전체" on={category == null} onPress={() => pick({ category: null })} c={c} />
        {POST_CATEGORIES.map((k) => (
          <Chip key={k.key} label={k.label} on={category === k.key} onPress={() => pick({ category: k.key })} c={c} />
        ))}
      </ScrollView>
      <View accessibilityRole="radiogroup" style={styles.sorts}>
        {POST_SORTS.map((o) => (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: sort === o.key }}
            onPress={() => sort !== o.key && pick({ sort: o.key })}
            hitSlop={6}
            style={styles.sort}
          >
            <Text style={{ fontSize: 15, color: sort === o.key ? c.ink : c.muted, fontWeight: sort === o.key ? '700' : '400' }}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const row = ({ item, index }: { item: Post; index: number }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/community/${item.id}` as Href)}
      style={({ pressed }) => [
        styles.post,
        { backgroundColor: pressed ? c.chip : c.card, opacity: item.hidden ? 0.55 : 1 },
        index === 0 && styles.first,
        index === (data?.posts.length ?? 0) - 1 && styles.last,
        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
      ]}
    >
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Badge text={postCategoryLabel(item.category)} color={categoryColor(item.category, c)} c={c} />
        {item.hidden ? <Badge text="가림" color={c.danger} c={c} /> : null}
      </View>
      <Text style={[s.title, { color: c.ink }]}>{item.title}</Text>
      <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }} numberOfLines={2}>
        {item.preview}
      </Text>
      <View style={styles.foot}>
        <Text style={[s.meta, { color: c.ink }]}>{item.nickname}</Text>
        <Text style={[s.meta, { color: c.muted, flex: 1 }]}>{item.ago}</Text>
        <SymbolView name="heart" size={13} tintColor={c.muted} />
        <Text style={[s.meta, { color: c.muted }]} accessibilityLabel={`좋아요 ${item.likes}`}>
          {item.likes}
        </Text>
        <SymbolView name="bubble.left" size={13} tintColor={c.muted} />
        <Text style={[s.meta, { color: c.muted }]} accessibilityLabel={`댓글 ${item.comments}`}>
          {item.comments}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="커뮤니티" right={<BarButton label="글쓰기" onPress={() => router.push('/community/new' as Href)} c={c} />} c={c} />
      {!data ? (
        <>
          {head}
          <LoadState error={error} onRetry={() => void reload()} c={c} />
        </>
      ) : (
        <FlatList
          data={data.posts}
          keyExtractor={(p) => p.id}
          renderItem={row}
          ListHeaderComponent={
            /* 구분 · 정렬을 바꿨는데 못 읽었다 — 지난 목록 위에 알린다(더 보기 실패는 밑에) */
            stale && !more && error ? (
              <>
                {head}
                <LoadState error={error} onRetry={() => void reload()} c={c} />
              </>
            ) : (
              head
            )
          }
          style={{ opacity: stale && !more ? 0.5 : 1 }}
          contentContainerStyle={{ paddingBottom: inset.bottom + 24 }}
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
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!data.hasMore || stale || pages >= MAX_PAGES) return;
            setMore(true);
            setPages(pages + 1);
          }}
          ListEmptyComponent={
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Text style={[s.title, { color: c.ink }]}>{category ? '이 구분에는 아직 글이 없어요' : '아직 글이 없어요'}</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>훈련 이야기, 궁금한 것, 오늘의 기록. 무엇이든 첫 글을 남겨 보세요.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/community/new' as Href)} style={[s.pill, { backgroundColor: c.sky }]}>
                <Text style={s.primaryText}>첫 글 쓰기</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={stale && more ? <LoadState error={error} onRetry={() => void reload()} c={c} /> : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sorts: { flexDirection: 'row', alignSelf: 'flex-end', gap: 4, paddingHorizontal: 16 },
  sort: { minHeight: 32, paddingHorizontal: 8, justifyContent: 'center' },
  post: { marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  first: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
