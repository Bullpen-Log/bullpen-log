import { Image } from 'expo-image';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { memo, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EMPTY_VIDEO_FILTER, MATCH_LABEL, compareItems, filterVideos, groupByDate, type MatchWhere, type MyVideoItem, type VideoSport } from '@/lib/my-videos';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { thumbSource, usePathThumbs, type Thumb } from '~/pitch/store';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { useMenu } from '~/shell/menu-store';
import { Press } from '~/shell/press';
import { LocalVideo } from '../../../modules/local-video';
import { useMyVideos } from '~/videos/store';
import { videoOutbox } from '~/videos/outbox';
import { compareLabel, videoDateText } from '~/videos/text';

/**
 * 내 영상 — 투구 · 타격 영상을 한곳에서 다시 찾는다(2026-10-26, 설계 3절). 홈에서 오른쪽으로 쓸거나 위 막대 영상 단추로 연다.
 * 영상 하나 = 카드 하나(lib/my-videos.ts — 기록 영상 · 측정 클립 · 따로 남긴 영상을 경로로 합침). 목록은 재생하지 않고 장면 그림만.
 * pick = 그 영상과 견줄 영상을 고르는 중(상세의 [다른 영상과 비교]) — 하나를 누르면 2분할 비교로.
 */
const SPORTS: { value: 'all' | VideoSport; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pitch', label: '투구' },
  { value: 'hit', label: '타격' },
];

type Row = { item: MyVideoItem; where: MatchWhere | null };

export default function MyVideosScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const { items, error, loading } = useMyVideos();
  const [text, setText] = useState('');
  const [sport, setSport] = useState<'all' | VideoSport>('all');
  const [revisitOnly, setRevisitOnly] = useState(false);
  const q = useDeferredValue(text);
  const menu = useMenu();
  const canAbs = menu.isAdmin === true || menu.groups.some((g) => g.items.some((i) => i.href === '/abs'));

  /* 아직 못 보낸 영상(동기화 대기) — 서버 목록에 생기면 그쪽이 이긴다 */
  const pending = useSyncExternalStore(videoOutbox.subscribe, videoOutbox.snapshot);
  const pendingPaths = useMemo(() => new Set(pending.map((v) => v.path)), [pending]);
  const all = useMemo(() => {
    const have = new Set((items ?? []).map((v) => v.path));
    const extra = pending.filter((v) => !have.has(v.path));
    return extra.length ? [...extra, ...(items ?? [])].sort(compareItems) : (items ?? []);
  }, [items, pending]);

  const rows = useMemo(
    () =>
      filterVideos(all, { ...EMPTY_VIDEO_FILTER, text: q, sport: sport === 'all' ? null : sport, revisitOnly }).filter(
        (r) => r.item.path !== pick
      ),
    [all, q, sport, revisitOnly, pick]
  );
  const sections = useMemo(() => groupByDate(rows).map((g) => ({ key: g.date ?? 'none', date: g.date, data: g.rows })), [rows]);

  /* 이 폰에 없는 영상(다른 폰 · 앱을 다시 깖) — 폰 영상 번호를 한 번에 묻는다. 못 물으면 표시 안 함 */
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const phoneKey = (items ?? []).filter((v) => v.storage === 'phone' && isPhoneVideoPath(v.path)).map((v) => v.path).join('|');
  useEffect(() => {
    if (!phoneKey) return;
    let alive = true;
    const paths = phoneKey.split('|');
    void LocalVideo.exists({ ids: paths.map(phoneAssetId) }).then(
      ({ found }) => {
        const have = new Set(found);
        if (alive) setMissing(new Set(paths.filter((p) => !have.has(phoneAssetId(p)))));
      },
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [phoneKey]);

  /* 장면 그림은 화면에 보이는 줄만 만든다(받은 것은 앱이 쥐고 있어 되돌아와도 바로) */
  const [visible, setVisible] = useState<string[]>([]);
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { item?: Row | null }[] }) =>
    setVisible(viewableItems.flatMap((v) => (v.item?.item ? [v.item.item.path] : [])))
  );
  const thumbs = usePathThumbs(visible.filter((p) => !missing.has(p)));

  const openAdd = () => {
    const options = ['촬영하기', '앨범에서 가져오기', '구속 측정', ...(canAbs ? ['ABS 판정'] : []), '취소'];
    /* 고르개가 타격이면 타격으로 미리 고른다 */
    const kind = sport === 'hit' ? 'hit' : 'pitch';
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (options[i] === '촬영하기') router.push({ pathname: '/my-videos/new' as never, params: { source: 'camera', sport: kind } });
      else if (options[i] === '앨범에서 가져오기') router.push({ pathname: '/my-videos/new' as never, params: { source: 'album', sport: kind } });
      else if (options[i] === '구속 측정') router.push('/velocity?mode=speed' as Href);
      else if (options[i] === 'ABS 판정') router.push('/velocity?mode=abs' as Href);
    });
  };
  const open = (v: MyVideoItem) => {
    if (pendingPaths.has(v.path)) return;
    if (pick) {
      const a = items?.find((x) => x.path === pick);
      router.replace({ pathname: '/pitch/compare' as never, params: { a: pick, al: a ? compareLabel(a) : 'A', b: v.path, bl: compareLabel(v) } });
      return;
    }
    router.push({ pathname: '/my-videos/view' as never, params: { path: v.path } });
  };
  const searching = q.trim() !== '' || sport !== 'all' || revisitOnly;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={[styles.bar, { paddingTop: inset.top + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} hitSlop={6} style={styles.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
          {pick ? '견줄 영상 고르기' : '내 영상'}
        </Text>
        {pick ? (
          <View style={styles.barButton} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="영상 더하기" onPress={openAdd} hitSlop={6} style={styles.barButton}>
            <Icon name="plus" size={22} color={c.link} />
          </Pressable>
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.item.path}
        stickySectionHeadersEnabled={false}
        initialNumToRender={8}
        windowSize={7}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        keyboardDismissMode="on-drag"
        contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: inset.bottom + 32, gap: 8 }, READABLE]}
        ListHeaderComponent={
          <View style={{ gap: 10, paddingBottom: 4 }}>
            <View style={[styles.search, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
              <Icon name="search" size={16} color={c.muted} />
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="메모 · 느낌으로 찾기"
                placeholderTextColor={c.muted}
                accessibilityLabel="영상 찾기"
                returnKeyType="search"
                style={[styles.input, { color: c.ink }]}
              />
              {text ? (
                <Press accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => setText('')} style={styles.clear}>
                  <Icon name="x" size={14} color={c.muted} />
                </Press>
              ) : null}
            </View>
            <View style={styles.filters}>
              <View style={{ flex: 1 }}>
                <Segmented options={SPORTS} value={sport} onChange={setSport} label="종목" />
              </View>
              <Press
                select
                selected={revisitOnly}
                accessibilityRole="button"
                accessibilityState={{ selected: revisitOnly }}
                accessibilityLabel="다시 볼 영상만"
                onPress={() => setRevisitOnly((v) => !v)}
                style={[styles.chip, { backgroundColor: revisitOnly ? c.action : withAlpha(c.ink, 0.06) }]}
              >
                <Icon name="star" size={15} color={revisitOnly ? '#fff' : c.muted} fill={revisitOnly ? '#fff' : undefined} />
                <Text style={[styles.chipText, { color: revisitOnly ? '#fff' : withAlpha(c.ink, 0.8) }]}>다시 볼</Text>
              </Press>
            </View>
            {error ? <Text style={[TYPE.sub, { color: c.muted }]}>{error}</Text> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={[TYPE.sub, styles.sectionHead, { color: c.muted }]}>
            {videoDateText(section.date)} · 영상 {section.data.length}개
          </Text>
        )}
        renderItem={({ item: r }) => (
          <VideoCard
            row={r}
            thumb={thumbs[r.item.path]}
            missing={missing.has(r.item.path)}
            pending={pendingPaths.has(r.item.path)}
            showWhere={q.trim() !== ''}
            onPress={open}
          />
        )}
        ListEmptyComponent={
          !items && loading ? (
            <ActivityIndicator style={{ marginTop: 32 }} />
          ) : (
            <View style={styles.empty}>
              <Icon name="film" size={32} color={c.muted} />
              <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>
                {searching ? '맞는 영상이 없어요.' : '아직 영상이 없어요. 오른쪽 위 + 로 찍거나 가져오면 운동량 없이 영상만 남아요.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const VideoCard = memo(function VideoCard({
  row,
  thumb,
  missing,
  pending,
  showWhere,
  onPress,
}: {
  row: Row;
  thumb: Thumb | undefined;
  missing: boolean;
  pending: boolean;
  showWhere: boolean;
  onPress: (v: MyVideoItem) => void;
}) {
  const c = usePalette();
  const v = row.item;
  const kind = v.logs[0]?.type ?? (v.clip ? '구속 측정' : null);
  const chips = [v.sport === 'hit' ? '타격' : '투구', kind, v.clip ? `${Math.round(v.clip.kmh)}km/h` : null].filter(Boolean) as string[];
  const memo = v.logs.find((l) => l.memo)?.memo ?? null;
  const tags = [
    pending ? '동기화 대기' : null,
    v.logs.length ? `기록 ${v.logs.length}개` : null,
    missing ? '이 폰에 없음' : null,
    showWhere && row.where ? MATCH_LABEL[row.where] : null,
  ].filter(Boolean) as string[];
  return (
    <Press
      card
      accessibilityRole="button"
      accessibilityLabel={`${chips.join(' ')} ${v.note ?? ''}`}
      onPress={() => onPress(v)}
      style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}
    >
      <View style={[styles.thumb, { backgroundColor: withAlpha(c.ink, 0.08) }]}>
        {thumb ? (
          <Image source={thumbSource(thumb)} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={v.path} />
        ) : (
          <Icon name="film" size={22} color={c.muted} />
        )}
      </View>
      <View style={{ flex: 1, gap: 6, paddingVertical: 2 }}>
        <View style={styles.chipRow}>
          {chips.map((t) => (
            <View key={t} style={[styles.tag, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
              <Text style={[styles.tagText, { color: withAlpha(c.ink, 0.8) }]}>{t}</Text>
            </View>
          ))}
          {v.revisit ? <Icon name="star" size={15} color={c.warn} fill={c.warn} /> : null}
        </View>
        {v.note ? (
          <Text numberOfLines={2} style={[TYPE.body, { color: c.ink }]}>
            {v.note}
          </Text>
        ) : memo ? (
          <Text numberOfLines={2} style={[TYPE.body, { color: c.muted }]}>
            기록 총평 · {memo}
          </Text>
        ) : (
          <Text style={[TYPE.body, { color: withAlpha(c.muted, 0.7) }]}>느낌 적기</Text>
        )}
        {tags.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{tags.join(' · ')}</Text> : null}
      </View>
      <Icon name="chevron-right" size={16} color={c.muted} />
    </Press>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  clear: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 12, borderRadius: 20 },
  chipText: { fontSize: 14, fontWeight: '600' },
  sectionHead: { paddingTop: 14, paddingBottom: 2, paddingHorizontal: 4, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16 },
  thumb: { width: 84, height: 112, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tag: { paddingHorizontal: 8, height: 24, borderRadius: 12, justifyContent: 'center' },
  tagText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 24 },
});
