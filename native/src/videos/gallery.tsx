import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
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
  chunkRows,
  clearChip,
  compareItems,
  filterChips,
  filterVideos,
  groupByDate,
  groupByMonth,
  monthIndex,
  sortRows,
  type FilteredRow,
  type MyVideoItem,
  type VideoFilter,
} from '@/lib/my-videos';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { CONTENT_MAX, WIDE_MAX } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { discardServerVideo, removePhoneOrphans } from '~/pitch/api';
import { thumbSource, usePathThumbs, type Thumb } from '~/pitch/store';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { LocalVideo } from '../../modules/local-video';
import { galleryAnchor, setGalleryAnchor, useGalleryUi } from './filters';
import { FilterSheet, GridTile, ListCard, MAX_FONT, MonthSheet, listCardHeight, tileTextHeight, type CellState } from './gallery-parts';
import { drainVideos, removeQueuedVideo, retryVideo, takeAdded, useVideoDraft, videoOutbox } from './outbox';
import { refreshMyVideos, toggleFavorite, useMyVideos } from './store';
import { durationText, monthText, todayKey, videoCaption, videoDateText } from './text';

/**
 * 내 영상 갤러리(2026-10-29 시안) — 목록 화면(app/my-videos/index.tsx)과 비교의 B 고르기(app/pitch/compare.tsx)가 같은 부품 · 데이터 · 조건을 쓴다.
 * - 위: 뒤로 · 가운데 제목 · 더하기(고르기엔 없음) → 검색 · 필터 → [전체 | 즐겨찾기] · 월 이동 · 보기 바꿈 → 수 · 정렬.
 * - 기간 · 종목 · 기록 종류 · 연결 · 정렬은 필터 시트에(기존 기간 여섯 가지 · 날짜 모름 그대로). 즐겨찾기는 위 [전체 | 즐겨찾기]가 보여서 칩으로 되풀이하지 않는다.
 * - 영상 하나 = 칸 하나(lib/my-videos.ts — 기록 영상 · 따로 남긴 영상을 경로로 합침, 구속 측정 클립은 안 넣음). 목록은 재생기를 만들지 않고 보이는 칸의 장면 그림만.
 * - 날짜 묶음(즐겨찾기는 달 묶음 · 칸에 날짜). 줄 높이를 미리 셈해(getItemLayout) 월 이동 · 보기 바꿈 · 돌아오기에서 보던 영상 근처로 바로 간다
 *   — 그래서 목록 위에 머리(ListHeaderComponent)를 두지 않는다(RN 은 그 높이를 줄 자리에 안 더한다).
 * - 월 이동은 거르기가 아니라 그 달로 굴리기. 결과 수는 지금 보이는 칸 수(즐겨찾기에서 별을 끈 칸은 조건을 바꿀 때까지 남기고 '해제됨').
 */
const SIDE = 16;
const GAP = 10;
const ROW_GAP = 14;

type Row = FilteredRow;
type Section = { key: string; date: string | null; month: boolean };
type SectionData = Section & { data: (Row | Row[])[] };

export type PickProps = {
  /** 기준 영상 A — 목록에서 빼고 위에 짧게 보인다 */
  a: MyVideoItem | null;
  aPath: string;
  selected: string | null;
  onSelect: (v: MyVideoItem) => void;
  onBack: () => void;
  /** 아래 단추 — B 를 고른 뒤 */
  next: { label: string; onPress: () => void };
  /** 이 기기에 없다고 확인된 영상(비교 화면이 재생 준비 중에 알아낸 것까지) */
  knownMissing?: ReadonlySet<string>;
};

export function VideoGallery({ pick }: { pick?: PickProps }) {
  const scope = pick ? 'pick' : 'main';
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { width: winW, fontScale } = useWindowDimensions();
  const { items, error, loading, fresh } = useMyVideos();
  const [ui, setUi] = useGalleryUi(scope);
  const { filter, order, mode } = ui;
  const setFilter = useCallback((f: VideoFilter) => setUi({ filter: f }), [setUi]);
  const [text, setText] = useState(filter.text);
  const q = useDeferredValue(text);
  /* 검색어는 입력이 멈춘 값만 조건에 옮긴다 — 지운 직후 늦게 온 옛 값이 다시 들어가지 않게(q 가 text 를 따라잡았을 때만) */
  useEffect(() => {
    if (q === text && q !== filter.text) setFilter({ ...filter, text: q });
  }, [q, text, filter, setFilter]);
  const today = todayKey();
  /* 쓰다 만 영상 — 위에 '이어서 작성' 한 줄(고르기 화면엔 없음) */
  const draft = useVideoDraft();

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

  const aPath = pick?.aPath ?? null;
  const rows = useMemo(
    () => sortRows(filterVideos(all, filter, today, keep), order).filter((r) => r.item.path !== aPath),
    [all, filter, today, keep, order, aPath]
  );
  /* 영상 추가에서 돌아왔을 때 — 방금 저장한 영상이 지금 조건 · 즐겨찾기에 가려 안 보이면 알린다(조건 · 위치는 그대로) */
  useFocusEffect(
    useCallback(() => {
      if (pick) return;
      const added = takeAdded();
      if (added && all.some((v) => v.path === added) && !rows.some((r) => r.item.path === added))
        toast('방금 저장한 영상은 지금 조건에서 안 보여요. 조건을 지우면 보여요.', 'info');
    }, [pick, all, rows])
  );

  /* 칸 크기 — 실제 목록 폭 · 글자 배율로(기기 이름이 아니라). 좁거나 큰 글씨면 열을 줄이고 넓은 아이패드는 늘린다(폰 목업 폭으로 묶지 않음) */
  const [listW, setListW] = useState(winW);
  const fs = Math.min(Math.max(fontScale, 1), MAX_FONT);
  const inner = Math.min(listW, mode === 'grid' ? WIDE_MAX : CONTENT_MAX) - SIDE * 2;
  const cols = mode === 'grid' ? Math.max(1, Math.min(6, Math.floor((inner + GAP) / (150 * Math.min(fs, 1.6) + GAP)))) : 1;
  const tileW = Math.floor((inner - GAP * (cols - 1)) / cols);
  /* 장면 칸 — 세로 영상이 많아 4:5(가로 영상은 위아래 판 · 세로 영상은 양옆 판, 자르지 않음). 한 열이면 너무 길지 않게 */
  const thumbH = Math.round(Math.min((tileW * 5) / 4, 420));
  const rowH = mode === 'grid' ? thumbH + tileTextHeight(fs) + ROW_GAP : listCardHeight(fs);
  const headH = Math.ceil(18 + 24 * fs + 10);

  const byMonth = filter.favoriteOnly;
  const groups = useMemo(() => (byMonth ? groupByMonth(rows) : groupByDate(rows)), [rows, byMonth]);
  const sections: SectionData[] = useMemo(
    () => groups.map((g) => ({ key: g.date ?? 'none', date: g.date, month: byMonth, data: mode === 'grid' ? chunkRows(g.rows, cols) : g.rows })),
    [groups, mode, cols, byMonth]
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
  const [missingFound, setMissing] = useState<ReadonlySet<string>>(new Set());
  const knownMissing = pick?.knownMissing;
  const missing = useMemo(() => (knownMissing?.size ? new Set([...missingFound, ...knownMissing]) : missingFound), [missingFound, knownMissing]);
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
        if (pick) return;
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
  }, [phoneKey, pick]);

  /* 고르기에서 못 고르는 칸의 까닭 — 보내는 중 · 이 기기에 없음(같은 영상 A 는 목록에서 뺐다) */
  const blockedOf = useCallback(
    (path: string): string | null => (!pick ? null : pendingPaths.has(path) ? '보내는 중 · 못 고름' : missing.has(path) ? '이 기기에 없음 · 못 고름' : null),
    [pick, pendingPaths, missing]
  );
  const cellOf = useCallback(
    (path: string): CellState => ({
      pending: pendingPaths.has(path),
      failed: videoOutbox.stateOf(path)?.state === 'failed',
      missing: missing.has(path),
      unstarred: keep.has(path),
      blocked: blockedOf(path),
      selected: pick?.selected === path,
    }),
    [pendingPaths, missing, keep, blockedOf, pick?.selected]
  );

  /* 장면 그림은 화면에 보이는 칸만(그리드 줄이면 그 줄의 칸 모두) — 받은 것은 앱이 쥐고 있어 되돌아와도 바로 */
  const [visible, setVisible] = useState<string[]>([]);
  const anchor = useRef<string | null>(galleryAnchor(scope));
  const [onViewable] = useState(
    () =>
      ({ viewableItems }: { viewableItems: { item?: unknown }[] }) => {
        /* 묶음 머리 · 꼬리 줄은 영상이 아니라 묶음 자체다 — 영상만 골라낸다(예전 크래시: r.item.path) */
        const paths = viewableItems.flatMap((v) =>
          Array.isArray(v.item) ? (v.item as Row[]).map((r) => r.item.path) : (v.item as Partial<Row> | undefined)?.item?.path ? [(v.item as Row).item.path] : []
        );
        anchor.current = paths[0] ?? anchor.current;
        setGalleryAnchor(scope, anchor.current);
        setVisible(paths);
      }
  );
  const thumbs = usePathThumbs(visible.filter((p) => !missing.has(p)));

  /* 위치 — 조건이 바뀌면 결과 맨 위로, 보기 방식 · 열 수 · 글자 크기가 바뀌면 보던 영상 줄로. 목록이 새로 와도(별 · 메모 · 동기화) 그대로 */
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
    setGalleryAnchor(scope, null);
    scrollTo({ sectionIndex: 0, itemIndex: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  const shape = `${mode}:${cols}:${rowH}`;
  const lastShape = useRef(shape);
  useEffect(() => {
    if (lastShape.current === shape) return;
    lastShape.current = shape;
    scrollTo(locate(anchor.current) ?? { sectionIndex: 0, itemIndex: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);
  /* 다시 그려진 목록(고르기 → 맞추기 → 다시 고르기)은 처음 한 번 보던 영상으로 */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !sections.length) return;
    restored.current = true;
    const loc = locate(anchor.current);
    if (loc && (loc.sectionIndex > 0 || loc.itemIndex > 1)) scrollTo(loc);
  }, [sections, locate, scrollTo]);
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
  /* 달 묶음(즐겨찾기)에서 월 이동은 그 달 묶음, 날짜 묶음에서는 그 달의 첫 날 묶음 */
  const findMonth = (ym: string | null) => sections.findIndex((x) => (ym ? x.date?.startsWith(ym) : x.date === null));

  const [sheet, setSheet] = useState<'filter' | 'month' | null>(null);
  /* 켜진 조건 칩 — 검색어는 위 칸, 즐겨찾기는 [전체 | 즐겨찾기]에 보여서 빼고 나머지만(기간 · 종목 · 기록 종류 · 연결) */
  const chips = filterChips(filter, today).filter((ch) => ch.key !== 'text' && ch.key !== 'favorite');
  const narrowed = chips.length > 0 || filter.text.trim() !== '';
  const anyFavorite = useMemo(() => all.some((v) => v.revisit), [all]);

  const onStar = useCallback(
    (v: MyVideoItem) => {
      const on = toggleFavorite(v.path);
      if (on === false && filter.favoriteOnly) setKeep((k) => new Set(k).add(v.path));
      else if (on === true && keep.has(v.path))
        setKeep((k) => {
          const n = new Set(k);
          n.delete(v.path);
          return n;
        });
    },
    [filter.favoriteOnly, keep]
  );
  const open = useCallback(
    (v: MyVideoItem) => {
      if (pick) {
        const why = blockedOf(v.path);
        if (why) {
          toast(
            pendingPaths.has(v.path)
              ? '아직 보내는 중인 영상이라 비교할 수 없어요. 저장이 끝나면 고를 수 있어요.'
              : '이 기기에 없는 영상이에요. 찍은 기기의 싱커 앱에서만 재생돼서 비교할 수 없어요.',
            'info'
          );
          return;
        }
        pick.onSelect(v);
        return;
      }
      const q = videoOutbox.stateOf(v.path);
      if (q?.state === 'failed') {
        /* 저장 실패 — 조용히 버리지 않고 사람이 고른다(다시 보내기 · 지우기). 지우기는 이 기기 사본도(어디에도 안 붙었을 때만) */
        Alert.alert('영상 정보를 저장하지 못했어요', `${q.error ?? ''}\n영상과 메모는 이 기기에 그대로 있어요.`.trim(), [
          { text: '닫기', style: 'cancel' },
          { text: '다시 보내기', onPress: () => void retryVideo(q.clientId) },
          {
            text: '영상 지우기',
            style: 'destructive',
            onPress: () =>
              Alert.alert('이 영상을 지울까요?', '아직 서버에 저장되지 않은 영상이에요. 이 기기의 사본도 지워요. 앨범 원본은 그대로예요.', [
                { text: '취소', style: 'cancel' },
                {
                  text: '지우기',
                  style: 'destructive',
                  onPress: () =>
                    void removeQueuedVideo(q.clientId).then(
                      () => (isPhoneVideoPath(v.path) ? removePhoneOrphans([v.path]) : discardServerVideo(v.path)),
                      () => toast('지우지 못했어요. 잠시 뒤 다시 해 주세요.', 'error')
                    ),
                },
              ]),
          },
        ]);
        return;
      }
      if (pendingPaths.has(v.path)) {
        void drainVideos();
        toast('아직 동기화 대기 중이에요. 연결되면 저장이 끝나요. 영상은 이 기기에 그대로 있어요.', 'info');
        return;
      }
      router.push({ pathname: '/my-videos/view' as never, params: { path: v.path } });
    },
    [pick, blockedOf, pendingPaths]
  );
  const kind = filter.sport === 'hit' ? 'hit' : 'pitch';
  /* 빈 목록의 단추도 + 시트와 같은 화면으로 바로(시트의 두 길과 같음) */
  const addFrom = (source: 'camera' | 'album') => router.push({ pathname: '/my-videos/new' as never, params: { source, sport: kind } });
  /* + → 추가 방법 시트(앨범 · 촬영이 먼저, 구속 측정 · ABS 는 그 밑 '측정 도구') */
  const openAdd = () => router.push({ pathname: '/my-videos/add' as never, params: { sport: kind } });
  const resetAll = () => {
    setText('');
    setFilter({ ...EMPTY_VIDEO_FILTER, favoriteOnly: filter.favoriteOnly });
  };
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
              cell={cellOf(r.item.path)}
              showWhere={showWhere}
              showDate={byMonth || !!pick}
              onOpen={open}
              onStar={pick ? undefined : onStar}
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
        cell={cellOf(item.item.path)}
        showWhere={showWhere}
        onOpen={open}
        onStar={pick ? undefined : onStar}
      />
    );
  };

  /* 빈 화면 — 받는 중 · 못 받음(받아 둔 목록 없음) · 영상 없음 · 즐겨찾기 없음 · 찾기 결과 없음 · (고르기) 고를 수 있는 영상 없음을 가른다 */
  const others = all.filter((v) => v.path !== aPath);
  const empty = (() => {
    if (!items && loading) return <ActivityIndicator style={{ marginTop: 32 }} />;
    if (!items && error)
      return (
        <EmptyState
          icon="refresh-cw"
          title="영상 목록을 받지 못했어요"
          text={error}
          actions={[{ label: '다시 받기', onPress: () => void refreshMyVideos() }]}
        />
      );
    if (others.length === 0)
      return pick ? (
        <EmptyState icon="film" title="비교할 다른 영상이 없어요" text="영상을 하나 더 남기면 나란히 볼 수 있어요." actions={[{ label: '영상으로 돌아가기', onPress: pick.onBack }]} />
      ) : (
        <EmptyState
          icon="film"
          title="아직 영상이 없어요"
          text="찍거나 가져온 영상은 운동량 없이 여기 남아요. 기록에 붙인 영상도 여기 모여요."
          actions={[
            { label: '앨범에서 가져오기', onPress: () => addFrom('album'), primary: true },
            { label: '촬영하기', onPress: () => addFrom('camera') },
          ]}
        />
      );
    if (filter.favoriteOnly && !anyFavorite && keep.size === 0)
      return (
        <EmptyState
          icon="star"
          title="즐겨찾기한 영상이 없어요"
          text="영상 칸이나 영상 화면 위의 별을 누르면 여기 모여요."
          actions={[{ label: '전체 영상 보기', onPress: () => setFilter({ ...filter, favoriteOnly: false }), primary: true }]}
        />
      );
    return (
      <EmptyState
        icon="search"
        title="맞는 영상이 없어요"
        text={filter.text.trim() ? `'${filter.text.trim()}'로 찾은 영상이 없어요.` : '조건에 맞는 영상이 없어요.'}
        actions={[
          ...(filter.text.trim() ? [{ label: '검색어 지우기', onPress: () => setText(''), primary: true }] : []),
          ...(chips.length ? [{ label: '조건 모두 지우기', onPress: resetAll }] : []),
          ...(filter.favoriteOnly ? [{ label: '전체 영상 보기', onPress: () => setFilter({ ...filter, favoriteOnly: false }) }] : []),
        ]}
      />
    );
  })();
  const selectable = pick ? rows.filter((r) => !blockedOf(r.item.path)).length : 0;

  const months = useMemo(() => monthIndex(all, rows), [all, rows]);
  const unknownTotal = all.filter((v) => !v.date).length;
  const unknownShown = rows.filter((r) => !r.item.date).length;
  const countText =
    items || pending.length
      ? `${filter.favoriteOnly ? '즐겨찾기' : '영상'} ${rows.length}개${keep.size ? ` · 해제 ${keep.size}개 포함` : ''}${narrowed ? ` · 전체 ${others.length}개 중` : ''}`
      : ' ';

  const header = (
    <View style={{ paddingTop: inset.top + 4, backgroundColor: c.page, zIndex: 1 }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={pick ? pick.onBack : () => router.back()} hitSlop={6} style={styles.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.6} style={[styles.title, { color: c.ink }]}>
          {pick ? '비교할 영상' : '내 영상'}
        </Text>
        {pick ? (
          <View style={styles.barButton} />
        ) : (
          <Press accessibilityRole="button" accessibilityLabel="영상 더하기" onPress={openAdd} style={[styles.addButton, { backgroundColor: withAlpha(c.action, 0.12) }]}>
            <Icon name="plus" size={22} color={c.link} />
          </Press>
        )}
      </View>
      <View style={[styles.controls, { maxWidth: WIDE_MAX }]}>
        {pick ? <PickA a={pick.a} /> : null}
        {!pick && draft ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel="작성 중인 영상 이어서 — 저장 전 영상이 있어요"
            onPress={() => router.push({ pathname: '/my-videos/new' as never, params: { resume: '1' } })}
            style={[styles.draftRow, { backgroundColor: withAlpha(c.action, 0.1) }]}
          >
            <Icon name="pencil" size={17} color={c.link} />
            <Text maxFontSizeMultiplier={1.6} numberOfLines={1} style={[TYPE.body, { flex: 1, color: c.ink }]}>
              저장 전 영상이 있어요
            </Text>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.buttonCompact, { color: c.link }]}>
              이어서 작성
            </Text>
          </Press>
        ) : null}
        <View style={styles.searchRow}>
          <View style={[styles.search, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Icon name="search" size={17} color={c.muted} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="날짜 · 메모 검색"
              placeholderTextColor={c.muted}
              accessibilityLabel="영상 검색 — 영상 메모 · 기록 총평 · 감각 칩 · 종류 · 날짜에서 찾아요"
              returnKeyType="search"
              maxFontSizeMultiplier={1.6}
              style={[styles.input, { color: c.ink }]}
            />
            {text ? (
              <Press accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={10} onPress={() => setText('')} style={styles.clear}>
                <Icon name="x" size={14} color={c.muted} />
              </Press>
            ) : null}
          </View>
          <Press
            accessibilityRole="button"
            accessibilityLabel={chips.length ? `필터, 켜진 조건 ${chips.length}개` : '필터'}
            onPress={() => setSheet('filter')}
            style={[styles.filterBtn, { backgroundColor: c.card, boxShadow: c.float }]}
          >
            <Icon name="settings2" size={19} color={c.link} />
            {chips.length || order === 'old' ? <View style={[styles.dot, { backgroundColor: c.action }]} /> : null}
          </Press>
        </View>
        <View style={styles.toolRow}>
          <View style={[styles.scopes, { backgroundColor: withAlpha(c.ink, 0.06) }]} accessibilityRole="tablist">
            <ScopeTab on={!filter.favoriteOnly} label="전체" onPress={() => filter.favoriteOnly && setFilter({ ...filter, favoriteOnly: false })} />
            <ScopeTab on={filter.favoriteOnly} label="즐겨찾기" star onPress={() => !filter.favoriteOnly && setFilter({ ...filter, favoriteOnly: true })} />
          </View>
          <View style={{ flex: 1 }} />
          <ToolButton icon="calendar-days" label="월로 이동" onPress={() => setSheet('month')} />
          <ToolButton
            icon={mode === 'grid' ? 'list' : 'squares'}
            label={mode === 'grid' ? '목록으로 보기' : '그리드로 보기'}
            onPress={() => setUi({ mode: mode === 'grid' ? 'list' : 'grid' })}
          />
        </View>
        <View style={styles.status}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.ink, fontWeight: '700' }]} numberOfLines={1}>
            {countText}
          </Text>
          {chips.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {chips.map((ch) => (
                <Press
                  key={ch.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${ch.label} 조건 지우기`}
                  onPress={() => setFilter(clearChip(filter, ch.key))}
                  style={[styles.activeChip, { borderColor: c.line }]}
                >
                  <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.ink }]} numberOfLines={1}>
                    {ch.label}
                  </Text>
                  <Icon name="x" size={12} color={c.muted} />
                </Press>
              ))}
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Press
            accessibilityRole="button"
            accessibilityLabel={`정렬 ${order === 'new' ? '최신순' : '오래된순'}, 눌러서 바꾸기`}
            onPress={() => setUi({ order: order === 'new' ? 'old' : 'new' })}
            hitSlop={8}
            style={styles.sort}
          >
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>
              {order === 'new' ? '최신순' : '오래된순'}
            </Text>
            <Icon name="arrow-up-down" size={14} color={c.link} />
          </Press>
        </View>
        {error && items ? (
          <Pressable accessibilityRole="button" onPress={() => void refreshMyVideos()} style={[styles.banner, { backgroundColor: withAlpha(c.warn, 0.12) }]}>
            <Text style={[TYPE.sub, { color: c.ink }]}>
              {error} {fresh ? '' : '받아 둔 목록이에요. 검색도 받아 둔 만큼만 돼요.'} 누르면 다시 받아요.
            </Text>
          </Pressable>
        ) : null}
        {pick && items && others.length > 0 && rows.length > 0 && selectable === 0 ? (
          <View style={[styles.banner, { backgroundColor: withAlpha(c.warn, 0.12) }]}>
            <Text style={[TYPE.sub, { color: c.ink }]}>지금 보이는 영상은 모두 이 기기에 없거나 보내는 중이라 고를 수 없어요. 조건을 바꿔 보세요.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {header}
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
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={{
            paddingHorizontal: SIDE,
            paddingBottom: inset.bottom + (pick ? 120 : 32),
            width: '100%',
            maxWidth: mode === 'grid' ? WIDE_MAX : CONTENT_MAX,
            alignSelf: 'center',
          }}
          renderSectionHeader={({ section }) => {
            const sd = section as unknown as SectionData;
            const n = sd.data.reduce((k, x) => k + (Array.isArray(x) ? x.length : 1), 0);
            return <GroupHead height={headH} date={sd.date} month={sd.month} count={n} today={today} />;
          }}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          ListFooterComponent={
            !pick && usage && usage.n > 0 && rows.length ? (
              <Text style={[TYPE.sub, { color: c.muted, paddingTop: 12 }]}>
                이 기기에 둔 영상 {usage.n}개 · {usage.bytes >= 1e9 ? `${(usage.bytes / 1e9).toFixed(1)}GB` : `${Math.round(usage.bytes / 1e6)}MB`}. 앱 안 보관이라 백업이 아니에요. 앱을 지우면 함께 사라져요.
              </Text>
            ) : undefined
          }
        />
      </View>
      {pick ? (
        <View style={[styles.pickFoot, { paddingBottom: inset.bottom + 12, backgroundColor: c.page, borderTopColor: c.line }]}>
          <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]} numberOfLines={2}>
            {pick.selected ? `B · ${pickedLabel(all.find((v) => v.path === pick.selected) ?? null)}` : '비교할 영상 B를 골라 주세요.'}
          </Text>
          <Press
            accessibilityRole="button"
            accessibilityState={{ disabled: !pick.selected }}
            accessibilityHint={pick.selected ? undefined : '먼저 비교할 영상 B를 골라 주세요'}
            disabled={!pick.selected}
            onPress={pick.next.onPress}
            style={[styles.primary, { backgroundColor: c.action }, !pick.selected && { opacity: 0.4 }]}
          >
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.button, { color: '#fff' }]}>
              {pick.next.label}
            </Text>
          </Press>
        </View>
      ) : null}
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
            const s = findMonth(ym);
            if (s >= 0) scrollTo({ sectionIndex: s, itemIndex: 0 });
            else toast(`${ym ? monthText(ym) : '촬영 날짜 모름'} · 지금 조건에 맞는 영상이 없어요.`, 'info');
          }}
        />
      ) : null}
    </View>
  );
}

const pickedLabel = (v: MyVideoItem | null) =>
  v ? [videoDateText(v.date), v.note ? (v.note.length > 18 ? `${v.note.slice(0, 18)}…` : v.note) : videoCaption(v)].join(' · ') : '고른 영상';

/** 묶음 머리 — 날짜(굵게) + 요일, 달 묶음은 'YYYY년 M월'. 오른쪽에 그 묶음의 칸 수 */
function GroupHead({ height, date, month, count, today }: { height: number; date: string | null; month: boolean; count: number; today: string }) {
  const c = usePalette();
  const text = date == null ? '촬영 날짜 모름' : month ? monthText(date) : videoDateText(date, today);
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 10, paddingHorizontal: 2, gap: 8 }}>
      <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[styles.groupHead, { flex: 1, color: c.ink }]}>
        {text}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted }]}>
        {count}개
      </Text>
    </View>
  );
}

/** 고르기 위 — 기준 영상 A(다시 고르지 않는다) */
function PickA({ a }: { a: MyVideoItem | null }) {
  const c = usePalette();
  const thumbs = usePathThumbs(a ? [a.path] : []);
  const t = a ? thumbs[a.path] : undefined;
  const dur = a ? durationText(a.durationSec) : null;
  return (
    <View style={[styles.pickA, { backgroundColor: c.card, boxShadow: c.float }]} accessible accessibilityLabel={`기준 영상 A, ${a ? pickedLabel(a) : ''}`}>
      <View style={[styles.pickAThumb, { backgroundColor: '#1b2b3b' }]}>
        {t ? <Image source={thumbSource(t as Thumb)} style={StyleSheet.absoluteFill} contentFit="contain" /> : <Icon name="film" size={18} color="rgba(255,255,255,0.6)" />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>기준 영상 A</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink }]}>
          {a ? (a.note ?? videoCaption(a)) : '영상'}
        </Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
          {[a ? videoDateText(a.date) : null, dur].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={[styles.aBadge, { backgroundColor: c.action }]}>
        <Text style={styles.aBadgeText}>A</Text>
      </View>
    </View>
  );
}

function ScopeTab({ on, label, star, onPress }: { on: boolean; label: string; star?: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press
      select
      selected={on}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.scope, on && { backgroundColor: c.card, boxShadow: c.float }]}
    >
      {star ? <Icon name="star" size={15} color={on ? c.link : c.muted} fill={on ? c.link : undefined} /> : null}
      <Text maxFontSizeMultiplier={1.6} style={[styles.scopeText, { color: on ? c.link : c.muted }]}>
        {label}
      </Text>
    </Press>
  );
}

function ToolButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.toolBtn}>
      <Icon name={icon} size={21} color={c.ink} />
    </Press>
  );
}

function EmptyState({
  icon,
  title,
  text,
  actions,
}: {
  icon: IconName;
  title: string;
  text?: string | null;
  actions: { label: string; onPress: () => void; primary?: boolean }[];
}): ReactNode {
  const c = usePalette();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={30} color={c.muted} />
      <Text style={[TYPE.card, { color: c.ink, textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>{text}</Text> : null}
      <View style={{ gap: 8, alignSelf: 'stretch', alignItems: 'center' }}>
        {actions.map((a) => (
          <Press
            key={a.label}
            accessibilityRole="button"
            onPress={a.onPress}
            style={[styles.emptyBtn, { backgroundColor: a.primary ? c.action : withAlpha(c.ink, 0.06) }]}
          >
            <Text style={[TYPE.buttonCompact, { color: a.primary ? '#fff' : c.ink }]}>{a.label}</Text>
          </Press>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 4, minHeight: 56 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  addButton: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 16 },
  controls: { width: '100%', alignSelf: 'center', paddingHorizontal: SIDE, gap: 10, paddingBottom: 6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 24, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  clear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scopes: { flexDirection: 'row', padding: 4, borderRadius: 22, gap: 4 },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, minWidth: 64, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  scopeText: { fontSize: 15, fontWeight: '700' },
  toolBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  banner: { padding: 10, borderRadius: 12 },
  groupHead: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  emptyBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 20, borderRadius: 22, minWidth: 200 },
  pickA: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18 },
  pickAThumb: { width: 52, height: 64, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  aBadge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  aBadgeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pickFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
