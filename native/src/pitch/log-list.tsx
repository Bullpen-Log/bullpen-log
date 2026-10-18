import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { usePathThumbs } from './store';

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

export function LogList({ logs }: { logs: PitchLog[] | null }) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const [q, setQ] = useState<FindQuery>(EMPTY_FIND);
  const [sort, setSort] = useState<Sort>('recent');
  const [filter, setFilter] = useState('all');
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const finding = isFindActive(q);
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
      <FindBar q={q} onChange={setQ} />
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
        {videoCount >= 2 ? (
          <Press accessibilityRole="button" onPress={() => router.push('/pitch/compare' as Href)} style={[styles.chip, { backgroundColor: c.skyTint }]}>
            <Text style={[styles.chipText, { color: c.skyStrong, fontWeight: '600' }]}>2분할 비교</Text>
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
          <Animated.View key={g.month} layout={LinearTransition.duration(260)} style={[styles.month, { backgroundColor: c.card, borderColor: c.line }]}>
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
                  <Animated.View key={x.id} entering={rowIn(Math.min(i, 8))} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
                    <Press accessibilityRole="button" onPress={() => router.push(`/pitch/${x.date}` as Href)} style={styles.row}>
                      <ClipThumb clip={x} url={x.path ? thumbs[x.path] : undefined} />
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
                      <Icon name="chevron-right" size={16} color={withAlpha(c.muted, 0.6)} />
                    </Press>
                  </Animated.View>
                ))}
              </Animated.View>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

function ClipThumb({ clip, url }: { clip: Clip; url: string | undefined }) {
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
      {url ? <Image source={{ uri: url }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : <Icon name="film" size={20} color={c.lineStrong} />}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, fontSize: 15, fontWeight: '700' },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, borderRadius: 18, paddingLeft: 12, paddingRight: 10 },
  sortText: { fontSize: 13, fontWeight: '500' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: 18, paddingHorizontal: 14 },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipCount: { fontSize: 13 },
  empty: { borderRadius: 20, paddingVertical: 32, paddingHorizontal: 16, textAlign: 'center', fontSize: 15, overflow: 'hidden' },
  month: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, minHeight: 48 },
  monthTitle: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 20, paddingVertical: 10 },
  thumb: { width: 96, aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowDate: { fontSize: 15, fontWeight: '600' },
  rowType: { fontSize: 13 },
  rowSummary: { fontSize: 13, marginTop: 2 },
});
