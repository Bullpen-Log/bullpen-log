import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POST_CATEGORIES, isPostCategory, postCategoryLabel, type PostCategory, type PostSort } from '@/lib/community';
import type { loadAppCommunity } from '@/app/actions/community';
import { Badge, Bar, categoryColor, Chip, LoadState, s, useLoad, useTitleCollapse } from '~/community/parts';
import { BoardList } from '~/app/board';
import { TAB_BAR_HEIGHT, TabBar, type ShellTab } from '~/shell/tab-bar';
import { PageHead } from '~/shell/heading';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 커뮤니티(앱 화면) — 토스뱅크의 '증권'처럼 들어오면 하단바가 커뮤니티 전용으로 바뀐다(2026-10-20 김민 화면 녹화): 옛 막대가 고른 칸 하나로
 * 오므라들었다가 왼쪽 동그란 ← 와 [커뮤니티 · 인기 · 자료실 · 글쓰기]로 펴진다(shell/tab-bar.tsx back · enter). ← 는 앞 화면(원래 하단바)으로.
 * 화면 자체는 옅어지며 들어온다(_layout.tsx community/index fade). 한 번 연 칸은 붙여 둬서 굴린 자리가 남는다. 글쓰기는 칸이 아니라 글쓰기 화면을 연다.
 */
type Tab = 'new' | 'hot' | 'board';
const WRITE = 'write';
const TABS: ShellTab[] = [
  { href: 'new', label: '덕아웃', icon: 'community' },
  { href: 'hot', label: '인기', icon: 'flame' },
  { href: 'board', label: '자료실', icon: 'book' },
  { href: WRITE, label: '글쓰기', icon: 'pencil' },
];

export default function CommunityScreen() {
  const c = usePalette();
  const params = useLocalSearchParams<{ category?: string; sort?: string; tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'board' ? 'board' : params.sort === 'hot' ? 'hot' : 'new');
  const [seen, setSeen] = useState<Tab[]>([tab]);
  const press = (t: ShellTab) => {
    if (t.href === WRITE) return router.push('/community/new' as Href);
    const k = t.href as Tab;
    setTab(k);
    if (!seen.includes(k)) setSeen([...seen, k]);
  };
  const first = isPostCategory(params.category) ? params.category : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {seen.map((k) => (
        <View key={k} style={[StyleSheet.absoluteFill, { display: tab === k ? 'flex' : 'none' }]}>
          {k === 'board' ? <BoardList bottom={TAB_BAR_HEIGHT} /> : <PostList sort={k} first={first} />}
        </View>
      ))}
      <TabBar tabs={TABS} active={tab} onPress={press} back={() => router.back()} enter />
    </View>
  );
}

/**
 * 글 목록 — 웹 app/(app)/community/page.tsx 를 옮겼다. 사이트의 /community 가 앱(BullpenNative/6 부터)이면 이 화면을 띄우고
 * (page.tsx → OpenNative), 읽기는 웹과 같은 곳(community.loadAppCommunity → lib/community-load.ts)이다. 구분 칩 · 최신/인기, 웹의 장 넘기기 대신
 * 끝까지 내리면 다음 장을 이어 붙인다. 가린 글은 관리자에게만 흐리게 보인다.
 */
type List = Awaited<ReturnType<typeof loadAppCommunity>>;
type Post = Extract<List, { ok: true }>['posts'][number];

/* ponytail: 이어 붙이기는 10장(200개)까지 — 서버(lib/community-load.ts MAX_PAGES)가 그만큼만 다시 읽는다. 더 필요하면 커서로 */
const MAX_PAGES = 10;

function PostList({ sort, first }: { sort: PostSort; first: PostCategory | null }) {
  const c = usePalette();
  const { shown, scroll } = useTitleCollapse();
  const inset = useSafeAreaInsets();
  const [category, setCategory] = useState<PostCategory | null>(first);
  const [pages, setPages] = useState(1);
  /* 더 보기로 읽는 중 — 그때는 목록을 흐리지 않고 밑에 도는 표시만 */
  const [more, setMore] = useState(false);
  const [pulling, setPulling] = useState(false);
  const { data, stale, error, reload } = useLoad<List>('community.loadAppCommunity', category, sort, pages);

  /* 최신 · 인기는 하단바 칸으로 가른다(예전 목록 위 고르개) */
  const title = sort === 'hot' ? '인기' : '덕아웃';
  const pick = (next: { category: PostCategory | null }) => {
    void Haptics.selectionAsync();
    setCategory(next.category);
    setPages(1);
    setMore(false);
  };

  const head = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <PageHead title={title} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Chip label="전체" on={category == null} onPress={() => pick({ category: null })} c={c} />
        {POST_CATEGORIES.map((k) => (
          <Chip key={k.key} label={k.label} on={category === k.key} onPress={() => pick({ category: k.key })} c={c} />
        ))}
      </ScrollView>
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
      <Bar title={title} shown={shown} c={c} />
      {!data ? (
        <>
          {head}
          <LoadState error={error} onRetry={() => void reload()} c={c} />
        </>
      ) : (
        <FlatList
          {...scroll}
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
          contentContainerStyle={[{ paddingBottom: inset.bottom + TAB_BAR_HEIGHT + 24 }, READABLE]}
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
          ListFooterComponent={
            stale && more ? (
              <LoadState error={error} onRetry={() => void reload()} c={c} />
            ) : data.hasMore && pages >= MAX_PAGES && !stale ? (
              /* 이어 붙이기 끝(200개) — 말없이 멈추면 글이 더 없는 줄 안다 */
              <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center', padding: 16 }}>여기까지 보여요</Text>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  post: { marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  first: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
