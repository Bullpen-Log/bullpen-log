import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { effortScaleText, effortText, readEffort } from '@/lib/pitch-effort';
import { REST_SESSION_TYPE, SESSION_TYPES } from '@/lib/session-type';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import type { PitchLog } from '~/pitch/api';

/**
 * 홈 달력의 목록 보기 '최근 기록' — 웹 app/(app)/pitch-log/log-list.tsx 와 같다.
 * 거르기 칩(전체 · 영상 있는 날 · 강도 8 이상 · 종류, 0개는 안 냄) → 달마다 접히는 묶음(처음엔 가장 최근 달만, 거르면 다 폄) →
 * 줄(날짜(요일) · 종류 N구 · 강도 · 최고 구속 · 영상 수, 메모 한 줄) → 그날 화면.
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const spokenDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};
const HARD_EFFORT_PCT = 80;
const effortOf = (l: PitchLog) => ({ intensity: l.intensity ?? 0, effortPct: l.effortPct });
const hardEnough = (l: PitchLog) => (readEffort(effortOf(l))?.pct ?? 0) >= HARD_EFFORT_PCT;

export function RecentList({ logs }: { logs: PitchLog[] | null }) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const [filter, setFilter] = useState('all');
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const sorted = useMemo(() => [...(logs ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [logs]);
  const chips = useMemo(() => {
    const byType = new Map<string, number>();
    for (const l of sorted) byType.set(l.sessionType, (byType.get(l.sessionType) ?? 0) + 1);
    return [
      { key: 'all', label: '전체', count: sorted.length },
      { key: 'video', label: '영상 있는 날', count: sorted.filter((l) => l.videoPaths.length > 0).length },
      { key: 'hard', label: `강도 ${effortScaleText(HARD_EFFORT_PCT)} 이상`, count: sorted.filter(hardEnough).length },
      ...SESSION_TYPES.map((t) => ({ key: t.name, label: t.name, count: byType.get(t.name) ?? 0 })),
    ].filter((x) => x.count > 0);
  }, [sorted]);
  const months = useMemo(() => {
    const map = new Map<string, PitchLog[]>();
    for (const l of sorted) {
      const keep =
        filter === 'all' ? true : filter === 'video' ? l.videoPaths.length > 0 : filter === 'hard' ? hardEnough(l) : l.sessionType === filter;
      if (!keep) continue;
      const m = l.date.slice(0, 7);
      map.set(m, [...(map.get(m) ?? []), l]);
    }
    return [...map.entries()].map(([month, items]) => ({ month, items }));
  }, [sorted, filter]);
  const isOpen = (m: string) => toggled[m] ?? (filter === 'all' ? m === months[0]?.month : true);

  if (!logs) return <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 24 }}>기록을 불러오는 중…</Text>;
  if (!logs.length)
    return (
      <Text style={[styles.empty, { color: c.muted, backgroundColor: withAlpha(c.chip, 0.5) }]}>
        아직 남긴 기록이 없어요.{'\n'}달력에서 날짜를 눌러 첫 기록을 남겨보세요.
      </Text>
    );

  return (
    <View style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {chips.map((x) => {
          const on = filter === x.key;
          return (
            <Press
              key={x.key}
              select
              selected={on}
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(x.key)}
              style={[styles.chip, { borderColor: on ? c.sky : c.line, backgroundColor: on ? c.skyTint : 'transparent' }]}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: on ? c.skyStrong : c.muted }}>{x.label}</Text>
              <Text style={[TYPE.num, { fontSize: 13, color: on ? c.skyStrong : c.lineStrong }]}>{x.count}</Text>
            </Press>
          );
        })}
      </ScrollView>
      <View style={[styles.box, { backgroundColor: c.card, borderColor: c.line }]}>
        {months.map((g, gi) => {
          const open = isOpen(g.month);
          return (
            <View key={g.month} style={gi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
              <Press
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => setToggled((t) => ({ ...t, [g.month]: !open }))}
                style={[styles.monthHead, { backgroundColor: withAlpha(c.chip, 0.5) }]}
              >
                <View style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}>
                  <Icon name="chevron-down" size={14} color={c.muted} />
                </View>
                <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600' }}>
                  {g.month.slice(0, 4)}년 {Number(g.month.slice(5, 7))}월
                </Text>
                <Text style={[TYPE.num, { color: c.muted, fontSize: 15 }]}>{g.items.length}</Text>
              </Press>
              {open ? (
                <Animated.View entering={fadeIn}>
                  {g.items.map((l, i) => {
                    const key = l.date.slice(0, 10);
                    const resting = l.sessionType === REST_SESSION_TYPE;
                    const eff = effortText(effortOf(l));
                    return (
                      <Press
                        key={l.id}
                        accessibilityRole="button"
                        onPress={() => router.push(`/pitch/${key}` as Href)}
                        style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.rowTop}>
                            <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600' }}>{spokenDate(key)}</Text>
                            <Text style={{ color: c.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                              {resting
                                ? '쉬는 날'
                                : `${l.sessionType} ${l.pitchCount}구${eff ? ` · 강도 ${eff}` : ''}${l.maxVelocity != null ? ` · 최고 ${formatSpeed(l.maxVelocity, speed)}` : ''}`}
                            </Text>
                            {l.videoPaths.length ? (
                              <View style={styles.film}>
                                <Icon name="film" size={12} color={c.skyStrong} />
                                <Text style={{ color: c.skyStrong, fontSize: 11 }}>{l.videoPaths.length}</Text>
                              </View>
                            ) : null}
                          </View>
                          {l.memo ? (
                            <Text numberOfLines={1} style={{ color: withAlpha(c.muted, 0.7), fontSize: 12, marginTop: 2 }}>
                              {l.memo}
                            </Text>
                          ) : null}
                        </View>
                        <Icon name="chevron-right" size={16} color={c.lineStrong} />
                      </Press>
                    );
                  })}
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </View>
      {months.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted, backgroundColor: withAlpha(c.chip, 0.5), paddingVertical: 32 }]}>고른 조건에 맞는 기록이 없어요.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: 20, paddingVertical: 40, paddingHorizontal: 16, textAlign: 'center', fontSize: 15, lineHeight: 22, overflow: 'hidden' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  box: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 2 },
  film: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
