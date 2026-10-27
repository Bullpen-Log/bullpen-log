import { File } from 'expo-file-system';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type SectionListData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EMPTY_VIDEO_FILTER,
  PERIOD_LABEL,
  chunkRows,
  clearChip,
  compareItems,
  filterChips,
  filterVideos,
  groupByDate,
  isFilterActive,
  monthIndex,
  sortRows,
  type FilteredRow,
  type MyVideoItem,
  type VideoFilter,
} from '@/lib/my-videos';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { CONTENT_MAX, WIDE_MAX } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { usePathThumbs } from '~/pitch/store';
import { Icon } from '~/shell/icon';
import { useMenu } from '~/shell/menu-store';
import { Press } from '~/shell/press';
import { LocalVideo } from '../../../modules/local-video';
import { useGalleryUi } from '~/videos/filters';
import { FilterSheet, GridTile, ListCard, MAX_FONT, MonthSheet, PeriodSheet } from '~/videos/gallery-parts';
import { refreshMyVideos, toggleFavorite, useMyVideos } from '~/videos/store';
import { videoOutbox } from '~/videos/outbox';
import { compareLabel, monthText, todayKey, videoDateText } from '~/videos/text';

/**
 * 내 영상 — 투구 · 타격 영상을 한곳에서 다시 찾는다(2026-10-26 · 27). 홈에서 오른쪽으로 쓸거나 위 막대 영상 단추로 연다.
 * - 영상 하나 = 칸 하나(lib/my-videos.ts — 기록 영상 · 따로 남긴 영상을 경로로 합침, 구속 측정 클립은 안 넣음). 목록은 재생하지 않고 장면 그림만.
 * - 찾기 칸은 목록 밖에 고정 — 깊이 굴려도 바로 쓴다. 기간 · 즐겨찾기 · 종목은 바로, 나머지(기록 종류 · 연결 · 정렬)는 조건 시트에.
 * - 날짜 묶음마다 그리드(기본, 칸 폭 · 글자 배율로 열 수) · 목록. 줄 높이를 미리 셈해(getItemLayout) 월 이동 · 보기 바꿈 · 돌아오기에서
 *   보던 영상 근처로 바로 간다. 그래서 목록 위에 머리(ListHeaderComponent)를 두지 않는다 — RN 은 그 높이를 줄 자리에 안 더한다.
 * - pick = 상세의 [다른 영상과 비교] — 지금 조건으로 시작해 B 를 고르면 2분할 비교로(조건은 이 고르기에서만 바뀐다).
 */
const SIDE = 16;
const GAP = 10;
const ROW_GAP = 14;

type Row = FilteredRow;
type Section = { key: string; date: string | null };
type SectionData = Section & { data: (Row | Row[])[] };

export default function MyVideosScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { width: winW, fontScale } = useWindowDimensions();
  const { pick, src } = useLocalSearchParams<{ pick?: string; src?: string }>();
  const { items, error, loading, fresh } = useMyVideos();
  const [ui, setUi] = useGalleryUi(pick ? 'pick' : 'main');
  const { filter, order, mode } = ui;
  const setFilter = useCallback((f: VideoFilter) => setUi({ filter: f }), [setUi]);
  const [text, setText] = useState(filter.text);
  const q = useDeferredValue(text);
  /* 검색어는 입력이 멈춘 값만 조건에 옮긴다 — 지운 직후 늦게 온 옛 값이 다시 들어가지 않게(q 가 text 를 따라잡았을 때만) */
  useEffect(() => {
    if (q === text && q !== filter.text) setFilter({ ...filter, text: q });
  }, [q, text, filter, setFilter]);
  const today = todayKey();
  const menu = useMenu();
  const canAbs = menu.isAdmin === true || menu.groups.some((g) => g.items.some((i) => i.href === '/abs'));

  /* 아직 못 보낸 영상(동기화 대기) — 서버 목록에 생기면 그쪽이 이긴다(같은 경로는 하나) */
  const pending = useSyncExternalStore(videoOutbox.subscribe, videoOutbox.snapshot);
  const pendingPaths = useMemo(() => new Set(pending.map((v) => v.path)), [pending]);
  const all = useMemo(() => {
    const have = new Set((items ?? []).map((v) => v.path));
    const extra = pending.filter((v) => !have.has(v.path));
    return extra.length ? [...extra, ...(items ?? [])].sort(compareItems) : (items ?? []);
  }, [items, pending]);

  /* 즐겨찾기만 보는 중에 별을 끈 영상 — 조건을 바꿀 때까지 자리에 둔다(목록이 툭 줄어 보던 자리를 잃지 않게) */
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const filterKey = JSON.stringify([filter, order]);
  const [keptFor, setKeptFor] = useState(filterKey);
  if (keptFor !== filterKey) {
    setKeptFor(filterKey);
    setKeep(new Set());
  }

  const rows = useMemo(
    () => sortRows(filterVideos(all, filter, today, keep), order).filter((r) => r.item.path !== pick),
    [all, filter, today, keep, order, pick]
  );

  /* 칸 크기 — 실제 목록 폭 · 글자 배율로(기기 이름이 아니라). 좁거나 큰 글씨면 열을 줄이고 넓은 아이패드는 늘린다 */
  const [listW, setListW] = useState(winW);
  const fs = Math.min(Math.max(fontScale, 1), MAX_FONT);
  const inner = Math.min(listW, mode === 'grid' ? WIDE_MAX : CONTENT_MAX) - SIDE * 2;
  const cols = mode === 'grid' ? Math.max(1, Math.min(6, Math.floor((inner + GAP) / (150 * Math.min(fs, 1.6) + GAP)))) : 1;
  const tileW = Math.floor((inner - GAP * (cols - 1)) / cols);
  const thumbH = Math.round((tileW * 4) / 3);
  const rowH = mode === 'grid' ? thumbH + 6 + Math.ceil(36 * fs) + ROW_GAP : Math.max(140, Math.ceil(20 + 19 * fs + 44 * fs + 19 * fs + 16)) + 8;
  const headH = Math.ceil(16 + 19 * fs + 10);

  const groups = useMemo(() => groupByDate(rows), [rows]);
  const sections: SectionData[] = useMemo(
    () => groups.map((g) => ({ key: g.date ?? 'none', date: g.date, data: mode === 'grid' ? chunkRows(g.rows, cols) : g.rows })),
    [groups, mode, cols]
  );
  /* 줄 자리 — 묶음마다 머리 · 줄들 · 꼬리(0). VirtualizedSectionList 의 평평한 차례와 같다 */
  const layout = useMemo(() => {
    const out: { length: number; offset: number }[] = [];
    let off = 0;
    for (const s of sections) {
      out.push({ length: headH, offset: off });
      off += headH;
      for (let i = 0; i < s.data.length; i++) {
        out.push({ length: rowH, offset: off });
        off += rowH;
      }
      out.push({ length: 0, offset: off });
    }
    return out;
  }, [sections, headH, rowH]);

  /* 이 폰에 없는 영상(다른 폰 · 앱을 다시 깖) — 숨기지 않고 표시만. 폰 영상 번호를 한 번에 묻는다 */
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [usage, setUsage] = useState<{ n: number; bytes: number } | null>(null);
  const phoneKey = all.filter((v) => isPhoneVideoPath(v.path) && !pendingPaths.has(v.path)).map((v) => v.path).join('|');
  useEffect(() => {
    if (!phoneKey) return;
    let alive = true;
    const paths = phoneKey.split('|');
    let timer: ReturnType<typeof setTimeout> | undefined;
    void LocalVideo.exists({ ids: paths.map(phoneAssetId) }).then(
      ({ found }) => {
        if (!alive) return;
        const have = new Set(found);
        setMissing(new Set(paths.filter((p) => !have.has(phoneAssetId(p)))));
        /* 공간 합은 첫 화면이 그려진 뒤 천천히 — 장면 그림 · 굴리기와 다투지 않게, 나가면 멈춘다 */
        timer = setTimeout(async () => {
          let bytes = 0;
          for (const id of found) {
            if (!alive) return;
            const url = await LocalVideo.fileUrl({ id }).then((r) => r.url, () => null);
            try {
              bytes += url ? (new File(url).size ?? 0) : 0;
            } catch {
              /* 못 재면 빼고 */
            }
          }
          if (alive) setUsage({ n: found.length, bytes });
        }, 1200);
      },
      () => {}
    );
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [phoneKey]);

  /* 장면 그림은 화면에 보이는 칸만(그리드 줄이면 그 줄의 칸 모두) — 받은 것은 앱이 쥐고 있어 되돌아와도 바로 */
  const [visible, setVisible] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const [onViewable] = useState(
    () =>
      ({ viewableItems }: { viewableItems: { item?: unknown }[] }) => {
        /* 묶음 머리 · 꼬리 줄은 영상이 아니라 묶음 자체다 — 영상만 골라낸다(예전 크래시: r.item.path) */
        const paths = viewableItems.flatMap((v) =>
          Array.isArray(v.item) ? (v.item as Row[]).map((r) => r.item.path) : (v.item as Partial<Row> | undefined)?.item?.path ? [(v.item as Row).item.path] : []
        );
        anchor.current = paths[0] ?? anchor.current;
        setVisible(paths);
      }
  );
  const thumbs = usePathThumbs(visible.filter((p) => !missing.has(p)));

  /* 위치 — 조건이 바뀌면 결과 맨 위로, 보기 방식 · 열 수가 바뀌면 보던 영상 줄로. 목록이 새로 와도(별 · 메모 · 동기화) 그대로 */
  const listRef = useRef<SectionList<Row | Row[], Section>>(null);
  const locate = useCallback(
    (path: string | null) => {
      if (!path) return null;
      for (let s = 0; s < sections.length; s++) {
        const data = sections[s].data as (Row | Row[])[];
        const i = data.findIndex((x) => (Array.isArray(x) ? x.some((r) => r.item.path === path) : x.item.path === path));
        if (i >= 0) return { sectionIndex: s, itemIndex: i + 1 };
      }
      return null;
    },
    [sections]
  );
  const scrollTo = useCallback(
    (loc: { sectionIndex: number; itemIndex: number } | null) => {
      if (!loc || !sections.length) return;
      requestAnimationFrame(() => listRef.current?.scrollToLocation({ ...loc, viewOffset: 0, viewPosition: 0, animated: false }));
    },
    [sections.length]
  );
  const firstFilter = useRef(filterKey);
  useEffect(() => {
    if (firstFilter.current === filterKey) return;
    firstFilter.current = filterKey;
    anchor.current = null;
    scrollTo({ sectionIndex: 0, itemIndex: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  const shape = `${mode}:${cols}`;
  const lastShape = useRef(shape);
  useEffect(() => {
    if (lastShape.current === shape) return;
    lastShape.current = shape;
    scrollTo(locate(anchor.current) ?? { sectionIndex: 0, itemIndex: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);
  /* 월 이동을 '조건 지우고' 고르면 새 결과가 그려진 뒤에 간다 */
  const pendingJump = useRef<{ ym: string | null } | null>(null);
  useEffect(() => {
    const j = pendingJump.current;
    if (!j) return;
    const s = sections.findIndex((x) => (j.ym ? x.date?.startsWith(j.ym) : x.date === null));
    if (s < 0) return;
    pendingJump.current = null;
    scrollTo({ sectionIndex: s, itemIndex: 0 });
  }, [sections, scrollTo]);

  const [sheet, setSheet] = useState<'filter' | 'period' | 'month' | null>(null);
  const chips = filterChips(filter, today);
  const active = isFilterActive(filter);
  const anyFavorite = useMemo(() => all.some((v) => v.revisit), [all]);

  const onStar = useCallback(
    (v: MyVideoItem) => {
      const on = toggleFavorite(v.path);
      if (on === false && filter.favoriteOnly) setKeep((k) => new Set(k).add(v.path));
    },
    [filter.favoriteOnly]
  );
  const open = useCallback(
    (v: MyVideoItem) => {
      if (pendingPaths.has(v.path)) {
        Alert.alert('아직 보내는 중이에요', '신호가 잡혀 저장이 끝나면 열 수 있어요. 영상은 이 폰에 그대로 있어요.');
        return;
      }
      if (pick) {
        if (missing.has(v.path)) {
          Alert.alert('이 폰에 없는 영상이에요', '찍은 폰의 싱커 앱에서만 재생돼서 비교할 수 없어요.');
          return;
        }
        const a = all.find((x) => x.path === pick);
        router.replace({
          pathname: '/pitch/compare' as never,
          params: { a: pick, al: a ? compareLabel(a) : 'A', b: v.path, bl: compareLabel(v), src: src ?? 'my-videos' },
        });
        return;
      }
      router.push({ pathname: '/my-videos/view' as never, params: { path: v.path } });
    },
    [pendingPaths, pick, missing, all, src]
  );
  const openAdd = () => {
    const options = ['촬영하기', '앨범에서 가져오기', '구속 측정', ...(canAbs ? ['ABS 판정'] : []), '취소'];
    const kind = filter.sport === 'hit' ? 'hit' : 'pitch';
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (options[i] === '촬영하기') router.push({ pathname: '/my-videos/new' as never, params: { source: 'camera', sport: kind } });
      else if (options[i] === '앨범에서 가져오기') router.push({ pathname: '/my-videos/new' as never, params: { source: 'album', sport: kind } });
      else if (options[i] === '구속 측정') router.push('/velocity?mode=speed' as Href);
      else if (options[i] === 'ABS 판정') router.push('/velocity?mode=abs' as Href);
    });
  };
  const resetAll = () => {
    setText('');
    setFilter(EMPTY_VIDEO_FILTER);
  };
  const pickItem = pick ? all.find((x) => x.path === pick) : null;
  const showWhere = filter.text.trim() !== '';

  const renderItem = ({ item }: { item: Row | Row[] }) => {
    if (Array.isArray(item)) {
      return (
        <View style={{ height: rowH, flexDirection: 'row', gap: GAP }}>
          {item.map((r) => (
            <GridTile
              key={r.item.path}
              row={r}
              width={tileW}
              thumbH={thumbH}
              thumb={thumbs[r.item.path]}
              cell={{ pending: pendingPaths.has(r.item.path), missing: missing.has(r.item.path) }}
              showWhere={showWhere}
              onOpen={open}
              onStar={onStar}
            />
          ))}
        </View>
      );
    }
    return (
      <ListCard
        row={item}
        height={rowH}
        thumb={thumbs[item.item.path]}
        cell={{ pending: pendingPaths.has(item.item.path), missing: missing.has(item.item.path) }}
        showWhere={showWhere}
        onOpen={open}
        onStar={onStar}
      />
    );
  };

  const empty = (() => {
    if (!items && loading) return <ActivityIndicator style={{ marginTop: 32 }} />;
    if (!items && error)
      return (
        <EmptyState icon="refresh-cw" text={`영상 목록을 받지 못했어요. ${error}`} action="다시 받기" onAction={() => void refreshMyVideos()} />
      );
    if (all.length === 0)
      return <EmptyState icon="film" text="아직 영상이 없어요. 오른쪽 위 + 로 찍거나 가져오면 운동량 없이 영상만 남아요. 기록에 붙인 영상도 여기 모여요." />;
    if (filter.favoriteOnly && !anyFavorite)
      return (
        <EmptyState
          icon="star"
          text="즐겨찾기한 영상이 없어요. 영상 칸의 별(☆)이나 영상 화면 위 별을 누르면 여기 모여요."
          action="즐겨찾기 조건 끄기"
          onAction={() => setFilter({ ...filter, favoriteOnly: false })}
        />
      );
    return <EmptyState icon="search" text="조건에 맞는 영상이 없어요. 위 조건을 하나씩 지우거나 모두 지워 보세요." action="조건 모두 지우기" onAction={resetAll} />;
  })();

  const months = useMemo(() => monthIndex(all, rows), [all, rows]);
  const unknownTotal = all.filter((v) => !v.date).length;
  const unknownShown = rows.filter((r) => !r.item.date).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {/* 위 고정 칸 — 막대 · 찾기 · 바로 조건 · 켜진 조건(깊이 굴려도 바로 쓴다) */}
      <View style={{ paddingTop: inset.top + 4, backgroundColor: c.page, zIndex: 1 }}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} hitSlop={6} style={styles.barButton}>
            <Icon name="back" size={22} color={c.link} />
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
            {pick ? '견줄 영상 고르기' : '내 영상'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mode === 'grid' ? '목록으로 보기' : '그리드로 보기'}
            onPress={() => setUi({ mode: mode === 'grid' ? 'list' : 'grid' })}
            hitSlop={6}
            style={styles.barButton}
          >
            <Icon name={mode === 'grid' ? 'list' : 'squares'} size={20} color={c.link} />
          </Pressable>
          {pick ? null : (
            <Pressable accessibilityRole="button" accessibilityLabel="영상 더하기" onPress={openAdd} hitSlop={6} style={styles.barButton}>
              <Icon name="plus" size={22} color={c.link} />
            </Pressable>
          )}
        </View>
        <View style={[styles.controls, { maxWidth: WIDE_MAX }]}>
          {pickItem ? (
            <View style={[styles.pickBanner, { backgroundColor: withAlpha(c.action, 0.1) }]}>
              <Text style={[TYPE.sub, { color: c.ink }]} numberOfLines={2}>
                A · {compareLabel(pickItem)} — 견줄 B 영상을 골라 주세요. 같은 영상 · 이 폰에 없는 영상 · 보내는 중인 영상은 못 골라요.
              </Text>
            </View>
          ) : null}
          <View style={styles.searchRow}>
            <View style={[styles.search, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
              <Icon name="search" size={16} color={c.muted} />
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="메모 · 날짜 · 종류로 검색"
                placeholderTextColor={c.muted}
                accessibilityLabel="영상 검색 — 영상 메모 · 기록 총평 · 감각 칩 · 종류 · 날짜에서 찾아요"
                returnKeyType="search"
                maxFontSizeMultiplier={1.6}
                style={[styles.input, { color: c.ink }]}
              />
              {text ? (
                <Press accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => setText('')} style={styles.clear}>
                  <Icon name="x" size={14} color={c.muted} />
                </Press>
              ) : null}
            </View>
            <Press
              accessibilityRole="button"
              accessibilityLabel="찾기 조건"
              onPress={() => setSheet('filter')}
              style={[styles.filterBtn, { backgroundColor: withAlpha(c.ink, 0.06) }]}
            >
              <Icon name="settings2" size={18} color={c.ink} />
            </Press>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
            <QuickChip on={filter.period.kind !== 'all'} label={filter.period.kind === 'all' ? '기간' : (chips.find((x) => x.key === 'period')?.label ?? PERIOD_LABEL[filter.period.kind])} caret onPress={() => setSheet('period')} />
            <QuickChip on={filter.favoriteOnly} label="즐겨찾기" icon="star" onPress={() => setFilter({ ...filter, favoriteOnly: !filter.favoriteOnly })} />
            <QuickChip on={filter.sport === 'pitch'} label="투구" onPress={() => setFilter({ ...filter, sport: filter.sport === 'pitch' ? null : 'pitch' })} />
            <QuickChip on={filter.sport === 'hit'} label="타격" onPress={() => setFilter({ ...filter, sport: filter.sport === 'hit' ? null : 'hit' })} />
            <QuickChip on={false} label="월로 이동" icon="calendar-days" onPress={() => setSheet('month')} />
          </ScrollView>
          <View style={styles.status}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted }]}>
              {items || pending.length ? `영상 ${rows.length}개${active ? ` · 전체 ${all.length}개 중` : ''}` : ' '}
              {order === 'old' ? ' · 오래된순' : ''}
            </Text>
            {active ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }} style={{ flex: 1 }}>
                {chips.map((ch) => (
                  <Press
                    key={ch.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${ch.label} 조건 지우기`}
                    onPress={() => {
                      if (ch.key === 'text') setText('');
                      setFilter(clearChip(filter, ch.key));
                    }}
                    style={[styles.activeChip, { borderColor: c.line }]}
                  >
                    <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.ink }]} numberOfLines={1}>
                      {ch.label}
                    </Text>
                    <Icon name="x" size={12} color={c.muted} />
                  </Press>
                ))}
                <Press accessibilityRole="button" onPress={resetAll} hitSlop={6}>
                  <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>모두 지우기</Text>
                </Press>
              </ScrollView>
            ) : null}
          </View>
          {error && items ? (
            <Pressable accessibilityRole="button" onPress={() => void refreshMyVideos()} style={[styles.banner, { backgroundColor: withAlpha(c.warn, 0.12) }]}>
              <Text style={[TYPE.sub, { color: c.ink }]}>{error} {fresh ? '' : '받아 둔 목록이에요 — 검색도 받아 둔 만큼만 돼요.'} 누르면 다시 받아요.</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setListW(Math.round(e.nativeEvent.layout.width))}>
        <SectionList<Row | Row[], Section>
          ref={listRef}
          sections={sections as unknown as SectionListData<Row | Row[], Section>[]}
          /*
           * 보이는 줄을 셀 때(onViewableItemsChanged) · 줄 자리를 셀 때 SectionList 는 묶음 머리 · 꼬리 줄에 영상 대신 묶음 자체를 넘긴다 — r.item 이 없다.
           * 예전엔 r.item.path 로 읽어 내 영상을 열자마자 앱이 꺼졌다(2026-10-26)
           */
          keyExtractor={(x, i) =>
            Array.isArray(x) ? `g:${(x as Row[])[0]?.item?.path ?? i}` : ((x as Partial<Row>).item?.path ?? (x as { key?: string }).key ?? `row-${i}`)
          }
          getItemLayout={(_, index) => ({ ...(layout[index] ?? { length: 0, offset: 0 }), index })}
          stickySectionHeadersEnabled={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
          keyboardDismissMode="on-drag"
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: inset.bottom + 32, width: '100%', maxWidth: mode === 'grid' ? WIDE_MAX : CONTENT_MAX, alignSelf: 'center' }}
          renderSectionHeader={({ section }) => (
            <View style={{ height: headH, justifyContent: 'flex-end', paddingBottom: 8, paddingHorizontal: 2 }}>
              <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted, fontWeight: '700' }]}>
                {videoDateText(section.date, today)} · 영상 {(section as unknown as SectionData).data.reduce((n, x) => n + (Array.isArray(x) ? x.length : 1), 0)}개
              </Text>
            </View>
          )}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          ListFooterComponent={
            usage && usage.n > 0 && rows.length ? (
              <Text style={[TYPE.sub, { color: c.muted, paddingTop: 12 }]}>
                이 폰에 둔 영상 {usage.n}개 · {usage.bytes >= 1e9 ? `${(usage.bytes / 1e9).toFixed(1)}GB` : `${Math.round(usage.bytes / 1e6)}MB`} — 앱 안 보관이라 백업이 아니에요. 앱을 지우면 함께 사라져요.
              </Text>
            ) : undefined
          }
        />
      </View>
      {sheet === 'filter' ? (
        <FilterSheet
          items={all}
          filter={filter}
          order={order}
          today={today}
          onClose={() => setSheet(null)}
          onApply={(f, o) => {
            setSheet(null);
            setUi({ filter: f, order: o });
          }}
        />
      ) : null}
      {sheet === 'period' ? (
        <PeriodSheet
          value={filter.period}
          today={today}
          onClose={() => setSheet(null)}
          onApply={(period) => {
            setSheet(null);
            setFilter({ ...filter, period });
          }}
        />
      ) : null}
      {sheet === 'month' ? (
        <MonthSheet
          months={months}
          unknown={{ total: unknownTotal, shown: unknownShown }}
          onClose={() => setSheet(null)}
          onJump={(ym, clear) => {
            setSheet(null);
            if (clear) {
              setText('');
              pendingJump.current = { ym };
              setFilter(EMPTY_VIDEO_FILTER);
              return;
            }
            const s = sections.findIndex((x) => (ym ? x.date?.startsWith(ym) : x.date === null));
            if (s >= 0) scrollTo({ sectionIndex: s, itemIndex: 0 });
            else Alert.alert(ym ? monthText(ym) : '촬영 날짜 모름', '지금 조건에 맞는 영상이 없어요.');
          }}
        />
      ) : null}
    </View>
  );
}

function QuickChip({ on, label, icon, caret, onPress }: { on: boolean; label: string; icon?: 'star' | 'calendar-days'; caret?: boolean; onPress: () => void }) {
  const c = usePalette();
  const fg = on ? '#fff' : withAlpha(c.ink, 0.85);
  return (
    <Press
      select
      selected={on}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.quickChip, { backgroundColor: on ? c.action : withAlpha(c.ink, 0.06) }]}
    >
      {icon ? <Icon name={icon} size={14} color={fg} fill={icon === 'star' && on ? '#fff' : undefined} /> : null}
      <Text maxFontSizeMultiplier={1.6} style={[styles.quickText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {caret ? <Icon name="chevron-down" size={13} color={fg} /> : null}
    </Press>
  );
}

function EmptyState({ icon, text, action, onAction }: { icon: 'film' | 'star' | 'search' | 'refresh-cw'; text: string; action?: string; onAction?: () => void }) {
  const c = usePalette();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={30} color={c.muted} />
      <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>{text}</Text>
      {action && onAction ? (
        <Press accessibilityRole="button" onPress={onAction} style={[styles.emptyBtn, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  controls: { width: '100%', alignSelf: 'center', paddingHorizontal: SIDE, gap: 8, paddingBottom: 6 },
  pickBanner: { padding: 10, borderRadius: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 16, paddingVertical: 8 },
  clear: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { width: 44, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quick: { gap: 6, alignItems: 'center' },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 18 },
  quickText: { fontSize: 14, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  banner: { padding: 10, borderRadius: 12 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 24 },
  emptyBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 16, borderRadius: 22 },
});
