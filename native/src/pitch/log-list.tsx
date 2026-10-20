import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { type ComponentRef, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActionSheetIOS, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { STRONG_EFFORT_PCT, effortBand, effortText, readEffort } from '@/lib/pitch-effort';
import { EMPTY_FIND, filterLogs, isFindActive, type FindQuery } from '@/lib/pitch-find';
import { REST_SESSION_TYPE, SESSION_TYPES } from '@/lib/session-type';
import { formatSpeed } from '@/lib/units';
import { VELOCITY_MEMO_MARK } from '@/lib/velocity-meta';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn, rowIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import type { PitchLog } from './api';
import { FindBar } from './find-bar';
import { repOf, setFeatured, thumbSource, useFeatured, usePathThumbs, type Thumb } from './store';

/**
 * 투구 목록 — 웹 app/(app)/videos/video-gallery.tsx 와 같은 꼴.
 * - 머리: '투구 기록 N건 · 영상 N개' + 오른쪽 정렬(최근순 · 구속 빠른순 · 강도 높은순).
 * - 느낌으로 찾기(FindBar) · 종류 칩 한 줄(옆으로 밂, 수 표시) · 2분할 비교.
 * - 달마다 접히는 카드 — 처음엔 가장 최근 달만 펴고, 찾는 중이면 다 편다. 줄은 영상마다 하나(영상 없는 기록은 한 줄):
 *   왼쪽 16:9 작은 장면(영상 없으면 강도 색 칸에 'N구' · 쉬는 날은 점선) · 날짜(요일) · 종류 · 요약 ›.
 */
type Sort = 'recent' | 'velocity' | 'intensity';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: '최근순' },
  { key: 'velocity', label: '구속 빠른순' },
  { key: 'intensity', label: '강도 높은순' },
];
const BAND_ALPHA = { strong: 0.7, mid: 0.4, light: 0.15 } as const;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const spokenDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};

type Clip = {
  id: string;
  logId: string;
  date: string;
  path: string | null;
  label: string;
  sessionType: string;
  pitchCount: number;
  effortPct: number;
  maxVelocity: number | null;
  rest: boolean;
  brief: string;
  summary: string;
};

export function LogList({ logs, today, onReveal }: { logs: PitchLog[] | null; today: string; onReveal: (windowY: number) => void }) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const [q, setQ] = useState<FindQuery>(EMPTY_FIND);
  const [sort, setSort] = useState<Sort>('recent');
  const [filter, setFilter] = useState('all');
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  /* 2분할 비교 — 웹처럼 목록에서 바로 A · B 를 고르고 탭 위에 뜬 막대에서 [비교하기](video-gallery selecting) */
  const { selecting, picked } = useCompare();
  const finding = isFindActive(q);
  /* 날짜로 가기 — 그 달을 펴고 그날 줄(없으면 그 달 카드)이 화면 위쪽에 오게(웹 jumpTo). 줄은 날짜마다 첫 줄만 기억한다 */
  const spots = useRef(new Map<string, ComponentRef<typeof View>>());
  const [flash, setFlash] = useState<string | null>(null);
  const logDays = useMemo(() => new Set((logs ?? []).map((l) => l.date.slice(0, 10))), [logs]);
  const jumpTo = (date: string) => {
    const month = date.slice(0, 7);
    setToggled((t) => ({ ...t, [month]: true }));
    setFlash(date);
    setTimeout(() => setFlash(null), 1600);
    setTimeout(() => (spots.current.get(date) ?? spots.current.get(month))?.measureInWindow((_x, y) => onReveal(y)), 120);
  };
  const shown = useMemo(() => filterLogs(logs ?? [], q), [logs, q]);

  const clips = useMemo<Clip[]>(
    () =>
      shown.flatMap((log): Clip[] => {
        const rest = log.sessionType === REST_SESSION_TYPE;
        const e = { intensity: log.intensity ?? 0, effortPct: log.effortPct };
        const velocity = log.maxVelocity != null ? formatSpeed(log.maxVelocity, speed) : null;
        const effort = effortText(e) && `강도 ${effortText(e)}`;
        const camera = log.memo?.startsWith(VELOCITY_MEMO_MARK) ? '카메라 측정' : null;
        const base = {
          logId: log.id,
          date: log.date.slice(0, 10),
          sessionType: log.sessionType,
          pitchCount: log.pitchCount,
          effortPct: readEffort(e)?.pct ?? 0,
          maxVelocity: log.maxVelocity,
          rest,
          brief: rest ? '' : [velocity, effort, camera].filter(Boolean).join(' · '),
          summary: rest ? '쉬는 날로 남김' : [velocity, `${log.pitchCount}구`, effort, camera].filter(Boolean).join(' · '),
        };
        if (rest || !log.videoPaths.length) return [{ ...base, id: log.id, path: null, label: '기록' }];
        return log.videoPaths.map((path, i) => ({
          ...base,
          id: `${log.id}-${i}`,
          path,
          label: log.videoPaths.length > 1 ? `영상 ${i + 1}` : '영상',
        }));
      }),
    [shown, speed]
  );
  const videoCount = clips.filter((x) => x.path).length;
  /* 대표 영상 — 영상이 여럿인 날만 줄 오른쪽 별(웹 video-gallery choosable). 그날 영상은 거르기 전 기록 전체에서 */
  const pick = useFeatured();
  const dayPaths = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of logs ?? []) if (l.sessionType !== REST_SESSION_TYPE) m.set(l.date.slice(0, 10), [...(m.get(l.date.slice(0, 10)) ?? []), ...l.videoPaths]);
    return m;
  }, [logs]);

  const chips = useMemo(() => {
    const byType = new Map<string, Set<string>>();
    for (const x of clips) byType.set(x.sessionType, (byType.get(x.sessionType) ?? new Set()).add(x.logId));
    return [{ key: 'all', label: '전체', count: shown.length }, ...SESSION_TYPES.map((t) => ({ key: t.name, label: t.name, count: byType.get(t.name)?.size ?? 0 }))].filter(
      (x) => x.count > 0
    );
  }, [clips, shown.length]);

  const months = useMemo(() => {
    const map = new Map<string, Clip[]>();
    for (const x of clips) {
      if (filter !== 'all' && x.sessionType !== filter) continue;
      const m = x.date.slice(0, 7);
      map.set(m, [...(map.get(m) ?? []), x]);
    }
    const cmp = (a: Clip, b: Clip) =>
      sort === 'velocity' ? (b.maxVelocity ?? -1) - (a.maxVelocity ?? -1) : sort === 'intensity' ? b.effortPct - a.effortPct : b.date.localeCompare(a.date);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => ({ month, items: [...items].sort(cmp) }));
  }, [clips, filter, sort]);
  const isOpen = (month: string) => finding || (toggled[month] ?? month === months[0]?.month);

  /* 편 달의 영상만 그림을 묻는다(웹도 보이는 달만) */
  const openPaths = months.filter((g) => isOpen(g.month)).flatMap((g) => g.items.flatMap((x) => (x.path ? [x.path] : [])));
  const thumbs = usePathThumbs(openPaths);

  const pickSort = () =>
    ActionSheetIOS.showActionSheetWithOptions({ options: [...SORTS.map((s) => s.label), '취소'], cancelButtonIndex: SORTS.length }, (i) => {
      if (i < SORTS.length) setSort(SORTS[i].key);
    });

  if (!logs) return <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 24 }}>기록을 불러오는 중…</Text>;

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.head}>
        <Text style={[styles.headText, { color: c.ink }]} numberOfLines={1}>
          투구 기록 <Text style={TYPE.num}>{shown.length}</Text>건
          <Text style={{ color: c.muted, fontWeight: '400' }}>
            {' · '}영상 <Text style={TYPE.num}>{videoCount}</Text>개
          </Text>
        </Text>
        <Press accessibilityRole="button" accessibilityLabel={`정렬 ${SORTS.find((s) => s.key === sort)?.label}`} onPress={pickSort} style={[styles.sort, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Text style={[styles.sortText, { color: c.ink }]}>{SORTS.find((s) => s.key === sort)?.label}</Text>
          <Icon name="chevron-down" size={14} color={c.muted} />
        </Press>
      </View>
      <FindBar q={q} onChange={setQ} today={today} marked={(d) => logDays.has(d)} onJump={jumpTo} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
          {chips.map((x) => {
            const on = filter === x.key;
            return (
              <Press
                key={x.key}
                select
                selected={on}
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(x.key)}
                style={[styles.chip, { backgroundColor: on ? c.sky : withAlpha(c.ink, 0.06) }]}
              >
                <Text style={[styles.chipText, { color: on ? '#fff' : withAlpha(c.ink, 0.8) }]}>{x.label}</Text>
                <Text style={[TYPE.num, styles.chipCount, { color: on ? 'rgba(255,255,255,0.8)' : c.muted }]}>{x.count}</Text>
              </Press>
            );
          })}
        </ScrollView>
        {selecting || videoCount >= 2 ? (
          <Press
            accessibilityRole="button"
            onPress={() => setCompare({ selecting: !selecting, picked: [null, null] })}
            style={[styles.chip, { backgroundColor: selecting ? withAlpha(c.ink, 0.06) : c.skyTint }]}
          >
            <Text style={[styles.chipText, { color: selecting ? c.muted : c.skyStrong, fontWeight: '600' }]}>{selecting ? '그만두기' : '2분할 비교'}</Text>
          </Press>
        ) : null}
      </View>

      {months.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted, backgroundColor: withAlpha(c.chip, 0.5) }]}>
          {finding || filter !== 'all' ? '맞는 기록이 없어요. 조건을 줄여 보세요.' : '아직 투구 기록이 없어요'}
        </Text>
      ) : null}

      {months.map((g) => {
        const open = isOpen(g.month);
        return (
          <Animated.View
            key={g.month}
            ref={(el: ComponentRef<typeof View> | null) => {
              if (el) spots.current.set(g.month, el);
            }}
            layout={LinearTransition.duration(260)}
            style={[styles.month, { backgroundColor: c.card, boxShadow: c.float, borderColor: c.line }]}>
            <Press
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setToggled((t) => ({ ...t, [g.month]: !open }))}
              style={styles.monthHead}
            >
              <Text style={[styles.monthTitle, { color: c.ink }]}>
                {g.month.slice(0, 4)}년 {Number(g.month.slice(5, 7))}월
              </Text>
              <Text style={[TYPE.num, { color: c.muted, fontSize: 15 }]}>{g.items.length}</Text>
              <View style={{ flex: 1 }} />
              <View style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}>
                <Icon name="chevron-down" size={16} color={c.muted} />
              </View>
            </Press>
            {open ? (
              <Animated.View entering={fadeIn} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
                {g.items.map((x, i) => (
                  <Animated.View
                    key={x.id}
                    ref={(el: ComponentRef<typeof View> | null) => {
                      if (el && (i === 0 || g.items[i - 1].date !== x.date)) spots.current.set(x.date, el);
                    }}
                    entering={rowIn(Math.min(i, 8))}
                    style={[i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }, flash === x.date && { backgroundColor: c.skyTint }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Press
                      accessibilityRole="button"
                      accessibilityState={selecting ? { selected: picked.some((y) => y?.id === x.id), disabled: !x.path } : undefined}
                      onPress={() => (selecting ? pickClip(x) : router.push(`/pitch/${x.date}` as Href))}
                      style={[
                        styles.row,
                        selecting && picked.some((y) => y?.id === x.id) && { backgroundColor: c.skyTint },
                        selecting && !x.path && { opacity: 0.4 },
                        { flex: 1 },
                      ]}
                    >
                      <View>
                        <ClipThumb clip={x} url={x.path ? thumbs[x.path] : undefined} />
                        {selecting && picked.some((y) => y?.id === x.id) ? (
                          <View style={[styles.slot, { backgroundColor: c.sky }]}>
                            <Text style={styles.slotText}>{picked[0]?.id === x.id ? 'A' : 'B'}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1}>
                          <Text style={[styles.rowDate, { color: c.ink }]}>{spokenDate(x.date)} </Text>
                          <Text style={[styles.rowType, { color: c.muted }]}>
                            {x.sessionType}
                            {x.path && x.label !== '영상' ? ` · ${x.label}` : ''}
                          </Text>
                        </Text>
                        {(x.path ? x.summary : x.brief || x.summary) ? (
                          <Text numberOfLines={1} style={[styles.rowSummary, { color: c.muted }]}>
                            {x.path ? x.summary : x.brief || x.summary}
                          </Text>
                        ) : null}
                      </View>
                      {selecting ? null : <Icon name="chevron-right" size={16} color={withAlpha(c.muted, 0.6)} />}
                    </Press>
                    {!selecting && x.path && (dayPaths.get(x.date)?.length ?? 0) > 1
                      ? (() => {
                          const on = repOf(dayPaths.get(x.date) ?? [], pick[x.date]) === x.path;
                          return (
                            <Press
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={on ? `${spokenDate(x.date)} 대표 영상, 캘린더에 이 영상이 떠요` : `${spokenDate(x.date)} 대표 영상으로 고르기`}
                              onPress={() => !on && x.path && void setFeatured(x.date, x.path)}
                              style={styles.star}
                            >
                              <Icon name="star" size={16} color={on ? c.sky : c.muted} fill={on ? c.sky : 'none'} />
                            </Press>
                          );
                        })()
                      : null}
                    </View>
                  </Animated.View>
                ))}
              </Animated.View>
            ) : null}
          </Animated.View>
        );
      })}
      {/* 고르는 중에는 뜬 막대에 끝 줄이 가려지지 않게(웹 pb-24) */}
      {selecting ? <View style={{ height: 80 }} /> : null}
    </View>
  );
}

/** 비교 고르기 상태 — 목록과 탭 위 막대(투구 탭이 스크롤 바깥에 띄운다)가 같이 본다 */
type Picked = [Clip | null, Clip | null];
let cmp: { selecting: boolean; picked: Picked } = { selecting: false, picked: [null, null] };
const cmpListeners = new Set<() => void>();
function setCompare(v: typeof cmp) {
  cmp = v;
  cmpListeners.forEach((l) => l());
}
/** 로그아웃 — 앞사람이 고른 영상(경로)이 다음 사람의 비교로 넘어가지 않게(app/index.tsx resetAccount) */
export const resetCompare = () => setCompare({ selecting: false, picked: [null, null] });
function useCompare() {
  return useSyncExternalStore(
    (l) => {
      cmpListeners.add(l);
      return () => cmpListeners.delete(l);
    },
    () => cmp
  );
}
/** 고르기 — 고른 것을 다시 누르면 비우고, 빈 쪽에 넣고, 둘 다 찼으면 앞의 것을 밀어낸다 */
function pickClip(x: Clip) {
  if (!x.path) return;
  const p = cmp.picked;
  const at = p.findIndex((y) => y?.id === x.id);
  const next: Picked =
    at >= 0 ? (p.map((y, j) => (j === at ? null : y)) as Picked) : p[0] == null ? [x, p[1]] : p[1] == null ? [p[0], x] : [p[1], x];
  setCompare({ ...cmp, picked: next });
}

/** 탭 위에 뜬 '고른 둘' 막대 — 웹 video-gallery 의 고르는 중 아래 막대(A · B · 비우기 · [비교하기]) */
export function ComparePickBar({ bottom }: { bottom: number }) {
  const c = usePalette();
  const { selecting, picked } = useCompare();
  if (!selecting) return null;
  const ready = !!picked[0]?.path && !!picked[1]?.path;
  return (
    <View pointerEvents="box-none" style={[styles.pickWrap, { bottom }]}>
      <Animated.View entering={fadeIn} style={[styles.pickBar, { backgroundColor: c.card, boxShadow: c.float, borderColor: c.lineStrong }]}>
        {[0, 1].map((i) => {
          const p = picked[i];
          return (
            <View key={i} style={[styles.slotChip, p ? { borderColor: c.sky, backgroundColor: c.skyTint } : { borderColor: c.line, borderStyle: 'dashed' }]}>
              <Text style={{ color: p ? c.skyStrong : c.muted, fontSize: 13, fontWeight: '600' }}>{i === 0 ? 'A' : 'B'}</Text>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: p ? c.skyStrong : c.muted, fontSize: 13 }}>
                {p ? spokenDate(p.date) : '비어 있음'}
              </Text>
              {p ? (
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`${i === 0 ? 'A' : 'B'}면 비우기`}
                  hitSlop={12}
                  onPress={() => setCompare({ ...cmp, picked: picked.map((y, j) => (j === i ? null : y)) as Picked })}
                >
                  <Icon name="x" size={12} color={c.skyStrong} />
                </Press>
              ) : null}
            </View>
          );
        })}
        <View style={{ flex: 1 }} />
        <Press
          accessibilityRole="button"
          disabled={!ready}
          onPress={() => {
            const [a, b] = picked;
            if (!a?.path || !b?.path) return;
            router.push({
              pathname: '/pitch/compare' as Href as never,
              params: { a: a.path, al: `${spokenDate(a.date)} ${a.sessionType}`, b: b.path, bl: `${spokenDate(b.date)} ${b.sessionType}` },
            });
            setCompare({ selecting: false, picked: [null, null] });
          }}
          style={[styles.compareBtn, { backgroundColor: ready ? c.sky : c.lineStrong }]}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{ready ? '비교하기' : '두 개를 고르세요'}</Text>
        </Press>
      </Animated.View>
    </View>
  );
}

function ClipThumb({ clip, url }: { clip: Clip; url: Thumb | undefined }) {
  const c = usePalette();
  if (!clip.path) {
    const strong = !clip.rest && clip.effortPct >= STRONG_EFFORT_PCT;
    return (
      <View
        style={[
          styles.thumb,
          clip.rest
            ? { borderWidth: 1, borderStyle: 'dashed', borderColor: c.lineStrong, backgroundColor: withAlpha(c.chip, 0.5) }
            : { backgroundColor: withAlpha(c.sky, BAND_ALPHA[effortBand(clip.effortPct)]) },
        ]}
      >
        <Text style={[TYPE.num, { fontSize: 17, color: clip.rest ? c.muted : strong ? '#fff' : c.ink }]}>{clip.rest ? '휴식' : `${clip.pitchCount}구`}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.thumb, { backgroundColor: withAlpha(c.chip, 0.5) }]}>
      {url ? <Image source={thumbSource(url)} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : <Icon name="film" size={20} color={c.lineStrong} />}
    </View>
  );
}

const styles = StyleSheet.create({
  star: { width: 40, height: 40, marginRight: 8, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, fontSize: 15, fontWeight: '600' },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, borderRadius: 18, paddingLeft: 12, paddingRight: 10 },
  sortText: { fontSize: 13, fontWeight: '400' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: 18, paddingHorizontal: 14 },
  chipText: { fontSize: 13, fontWeight: '400' },
  chipCount: { fontSize: 13 },
  empty: { borderRadius: 20, paddingVertical: 32, paddingHorizontal: 16, textAlign: 'center', fontSize: 15, overflow: 'hidden' },
  month: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, minHeight: 48 },
  monthTitle: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 20, paddingVertical: 10 },
  slot: { position: 'absolute', left: 4, top: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  slotText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pickWrap: { position: 'absolute', left: 16, right: 16 },
  pickBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, boxShadow: '0 20px 40px -12px rgba(0,0,0,0.25)' },
  slotChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 140 },
  compareBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  thumb: { width: 96, aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowDate: { fontSize: 15, fontWeight: '600' },
  rowType: { fontSize: 13 },
  rowSummary: { fontSize: 13, marginTop: 2 },
});
