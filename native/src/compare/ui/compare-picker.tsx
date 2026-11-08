import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { filterChips, filterVideos, sortRows, type MyVideoItem } from '@/lib/my-videos';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { pageSlice, pageText } from '~/compare/workspace-layout';
import { IconBtn, Seg, TextBtn } from '~/compare/ui/workspace-parts';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { usePathThumbs } from '~/pitch/store';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { useGalleryUi } from '~/videos/filters';
import type { PickAction } from '~/videos/gallery';
import { FilterSheet, GridTile, MAX_FONT, tileTextHeight } from '~/videos/gallery-parts';
import { videoOutbox } from '~/videos/outbox';
import { refreshMyVideos, useMyVideos } from '~/videos/store';
import { todayKey } from '~/videos/text';
import { LocalVideo } from '../../../modules/local-video';

/**
 * 비교할 영상 고르기 — 비교 화면 전용 한 화면(UI09). 내 영상 목록과 같은 자료 · 찾기 · 필터(고르기 조건 'pick')를 쓰되, 굴리지 않고 쪽으로 넘긴다.
 * - 칸 수는 실제로 받은 자리 · 글자 크기로 정한다(한 쪽 = 열 × 줄). 고른 영상은 쪽 · 찾기 · 이 비교 칸을 오가도 남는다.
 * - 사진 앱 · 파일 · 카메라는 시스템 화면이다(그 안의 굴림은 앱이 정하지 않는다). 고르면 바로 그 영상으로(onImport 쪽이 처리).
 * - 일반 내 영상 목록(VideoGallery)은 바뀌지 않는다.
 */
export type PickerTab = { key: string; label: string; items: { key: string; label: string; sub?: string | null; on: boolean; disabled?: boolean; onPress: () => void }[] };

export function ComparePicker({
  title,
  head,
  exclude,
  missing,
  max,
  picked,
  onToggle,
  extra,
  startTab,
  actions,
  foot,
  confirm,
  onCancel,
}: {
  title: string;
  /** 고정한 쪽 한 줄(예: 'A 고정 · 11월 2일') */
  head?: string | null;
  /** 목록에서 뺄 영상(고정한 A) */
  exclude?: string | null;
  missing?: ReadonlySet<string>;
  /** 고를 수 있는 수(B 고르기 1 · 처음 고르기 2) */
  max: 1 | 2;
  picked: readonly string[];
  onToggle: (v: MyVideoItem) => void;
  /** 둘째 칸(이 비교의 영상) */
  extra?: PickerTab | null;
  startTab?: 'mine' | string;
  actions: PickAction[];
  foot: string;
  confirm: { label: string; enabled: boolean; onPress: () => void };
  onCancel: () => void;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const fs = Math.min(Math.max(fontScale, 1), MAX_FONT);
  const { items, error, loading } = useMyVideos();
  const [ui, setUi] = useGalleryUi('pick');
  const { filter, order } = ui;
  const [text, setText] = useState(filter.text);
  const q = useDeferredValue(text);
  useEffect(() => {
    if (q === text && q !== filter.text) setUi({ filter: { ...filter, text: q } });
  }, [q, text, filter, setUi]);
  const [tab, setTab] = useState<string>(startTab ?? 'mine');
  const [showFilter, setShowFilter] = useState(false);
  const today = todayKey();

  const pending = useSyncExternalStore(videoOutbox.subscribe, videoOutbox.snapshot);
  const pendingPaths = useMemo(() => new Set(pending.map((v) => v.path)), [pending]);
  /* 이 폰에 없는 영상(다른 폰 · 앱을 다시 깖) — 숨기지 않고 못 고름 표시 */
  const [phoneMissing, setPhoneMissing] = useState<ReadonlySet<string>>(new Set());
  const phoneKey = (items ?? []).filter((v) => isPhoneVideoPath(v.path)).map((v) => v.path).join('|');
  useEffect(() => {
    if (!phoneKey) return;
    let alive = true;
    const paths = phoneKey.split('|');
    void LocalVideo.exists({ ids: paths.map(phoneAssetId) }).then(
      ({ found }) => {
        if (!alive) return;
        const have = new Set(found);
        setPhoneMissing(new Set(paths.filter((p) => !have.has(phoneAssetId(p)))));
      },
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [phoneKey]);
  const blockedOf = (path: string) => (pendingPaths.has(path) ? '보내는 중 · 못 고름' : phoneMissing.has(path) || missing?.has(path) ? '이 기기에 없음 · 못 고름' : null);

  const rows = useMemo(() => sortRows(filterVideos(items ?? [], filter, today), order).filter((r) => r.item.path !== exclude), [items, filter, today, order, exclude]);
  const chips = filterChips(filter, today).filter((x) => x.key !== 'text' && x.key !== 'favorite');

  /* 칸 크기 — 받은 자리로. 장면 칸 4:5, 글 두 줄 */
  const [grid, setGrid] = useState<{ w: number; h: number } | null>(null);
  const GAP = 8;
  const cols = grid ? Math.max(2, Math.min(6, Math.floor((grid.w + GAP) / (112 * Math.min(fs, 1.5) + GAP)))) : 3;
  const tileW = grid ? Math.floor((grid.w - GAP * (cols - 1)) / cols) : 100;
  const textH = tileTextHeight(fs);
  /* 한 줄 높이가 자리보다 크면 장면 칸을 줄인다(글은 줄이지 않는다) */
  const thumbFull = Math.round((tileW * 5) / 4);
  const rowsFit = grid ? Math.max(1, Math.floor((grid.h + GAP) / (thumbFull + textH + GAP))) : 1;
  const thumbH = grid && rowsFit === 1 ? Math.max(48, Math.min(thumbFull, grid.h - textH)) : thumbFull;
  const per = cols * rowsFit;
  const [page, setPage] = useState(0);
  /* 조건이 바뀌면 첫 쪽으로 */
  const fkey = JSON.stringify([filter, order, tab]);
  const [fkeySeen, setFkeySeen] = useState(fkey);
  if (fkeySeen !== fkey) {
    setFkeySeen(fkey);
    setPage(0);
  }
  const view = pageSlice(rows, per, page);
  const xview = extra ? pageSlice(extra.items, Math.max(1, Math.floor(((grid?.h ?? 300) + 6) / (52 * Math.min(fs, 1.4) + 6))), page) : null;
  const cur = tab === 'mine' ? view : (xview ?? view);
  const thumbs = usePathThumbs(tab === 'mine' ? view.items.map((r) => r.item.path).filter((p) => !phoneMissing.has(p)) : []);

  return (
    <View style={{ flex: 1, backgroundColor: c.page, paddingTop: inset.top, paddingLeft: inset.left, paddingRight: inset.right }}>
      <View style={st.bar}>
        <IconBtn icon="back" label="취소, 비교로 돌아가기" onPress={onCancel} />
        <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[st.title, { color: c.ink }]}>
          {title}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      {head ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted, paddingHorizontal: 12 }]}>
          {head}
        </Text>
      ) : null}
      <View style={st.body}>
        {/* 가져오기(시스템 화면) · 이 비교 칸 */}
        <View style={st.row}>
          {extra && extra.items.length ? (
            <Seg
              label="고를 곳"
              value={tab}
              onChange={setTab}
              compact
              options={[
                { value: 'mine', label: '내 영상' },
                { value: extra.key, label: extra.label },
              ]}
            />
          ) : null}
          <View style={{ flex: 1 }} />
          {actions.map((a) => (
            <IconBtn key={a.label} icon={a.icon} label={a.label} busy={a.busy} onPress={a.onPress} />
          ))}
        </View>
        {tab === 'mine' ? (
          <View style={st.row}>
            <View style={[st.search, { backgroundColor: withAlpha(c.ink, 0.07) }]}>
              <Icon name="search" size={16} color={c.muted} />
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="메모 · 기록 · 날짜 찾기"
                placeholderTextColor={c.muted}
                returnKeyType="search"
                accessibilityLabel="영상 찾기"
                style={[st.input, { color: c.ink }]}
              />
              {text ? <IconBtn icon="x" label="찾는 글 지우기" onPress={() => setText('')} size={16} /> : null}
            </View>
            <TextBtn label={chips.length ? `필터 ${chips.length}` : '필터'} on={chips.length > 0} onPress={() => setShowFilter(true)} a11y={chips.length ? `필터 ${chips.length}개 켜짐, 바꾸기` : '필터'} />
            <TextBtn label="★" on={filter.favoriteOnly} a11y={filter.favoriteOnly ? '즐겨찾기만 보는 중, 누르면 전체' : '즐겨찾기만 보기'} onPress={() => setUi({ filter: { ...filter, favoriteOnly: !filter.favoriteOnly } })} />
          </View>
        ) : null}

        <View style={st.grid} onLayout={(e) => setGrid({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}>
          {tab !== 'mine' && xview ? (
            <View style={{ gap: 6 }}>
              {xview.items.map((it) => (
                <Press
                  key={it.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: it.on, disabled: !!it.disabled }}
                  accessibilityLabel={`${it.label}${it.sub ? `, ${it.sub}` : ''}`}
                  disabled={it.disabled}
                  onPress={it.onPress}
                  style={[st.item, { backgroundColor: it.on ? withAlpha(c.action, 0.14) : c.card }, it.disabled && { opacity: 0.45 }]}
                >
                  <Icon name={it.on ? 'check' : 'film'} size={18} color={it.on ? c.link : c.muted} />
                  <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.body, { color: c.ink, flex: 1 }]}>
                    {it.label}
                  </Text>
                  {it.sub ? (
                    <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted }]}>
                      {it.sub}
                    </Text>
                  ) : null}
                </Press>
              ))}
            </View>
          ) : !items && loading ? (
            <View style={st.center}>
              <ActivityIndicator color={c.muted} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted }]}>
                내 영상을 불러오는 중이에요
              </Text>
            </View>
          ) : !items && error ? (
            <View style={st.center}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.danger, textAlign: 'center' }]}>
                {error}
              </Text>
              <TextBtn label="다시 시도" onPress={() => void refreshMyVideos()} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>
                위 단추로 사진 앱 · 촬영 · 파일에서 바로 가져올 수도 있어요.
              </Text>
            </View>
          ) : !rows.length ? (
            <View style={st.center}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.body, { color: c.ink, textAlign: 'center' }]}>
                {items?.length ? '조건에 맞는 영상이 없어요' : '앱 안 영상이 아직 없어요'}
              </Text>
              {items?.length ? <TextBtn label="조건 지우기" onPress={() => (setText(''), setUi({ filter: { ...filter, text: '', favoriteOnly: false, period: { kind: 'all' }, sport: null, types: [], linked: 'any' } }))} /> : null}
              <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>
                위 단추로 사진 앱 · 촬영 · 파일에서 가져와 비교해요.
              </Text>
            </View>
          ) : grid ? (
            <View style={[st.tiles, { gap: GAP }]}>
              {view.items.map((r) => {
                const blocked = blockedOf(r.item.path);
                const order = picked.indexOf(r.item.path);
                return (
                  <View key={r.item.path} style={{ width: tileW, height: thumbH + textH, overflow: 'hidden' }}>
                    <GridTile
                      row={r}
                      width={tileW}
                      thumbH={thumbH}
                      thumb={thumbs[r.item.path]}
                      cell={{ pending: pendingPaths.has(r.item.path), missing: phoneMissing.has(r.item.path), blocked, selected: order >= 0 }}
                      showWhere={!!filter.text.trim()}
                      showDate
                      onOpen={(v) => !blocked && onToggle(v)}
                    />
                    {order >= 0 && max > 1 ? (
                      <View pointerEvents="none" style={[st.order, { backgroundColor: order === 0 ? c.ink : c.action }]}>
                        <Text style={[st.orderText, { color: order === 0 ? c.page : c.onAction }]}>{order === 0 ? 'A' : 'B'}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={st.row}>
          <IconBtn icon="chevron-left" label="이전 쪽" disabled={cur.page <= 0} onPress={() => setPage(cur.page - 1)} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`${cur.pages}쪽 중 ${cur.page + 1}쪽`}>
            {pageText(cur)}
            {tab === 'mine' ? ` · ${rows.length}개` : ''}
          </Text>
          <IconBtn icon="chevron-right" label="다음 쪽" disabled={cur.page >= cur.pages - 1} onPress={() => setPage(cur.page + 1)} />
          <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.ink, flex: 1, textAlign: 'right' }]} accessibilityLiveRegion="polite">
            {foot}
          </Text>
        </View>
        <View style={[st.row, { paddingBottom: inset.bottom + 4 }]}>
          <TextBtn label="취소" onPress={onCancel} />
          <TextBtn label={confirm.label} primary grow disabled={!confirm.enabled} onPress={confirm.onPress} />
        </View>
      </View>
      {showFilter ? (
        <FilterSheet
          paged
          items={items ?? []}
          filter={filter}
          order={order}
          today={today}
          onClose={() => setShowFilter(false)}
          onApply={(f, o) => {
            setUi({ filter: { ...f, text: filter.text }, order: o });
            setShowFilter(false);
          }}
        />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 2 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  body: { flex: 1, paddingHorizontal: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 40, borderRadius: 12, paddingLeft: 10, gap: 4 },
  input: { flex: 1, fontSize: 16, minHeight: 40, paddingVertical: 0 },
  grid: { flex: 1, minHeight: 0, overflow: 'hidden' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 14, paddingHorizontal: 14 },
  order: { position: 'absolute', left: 6, top: 6, width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  orderText: { fontSize: 13, fontWeight: '800' },
});
