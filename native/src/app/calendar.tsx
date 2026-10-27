import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import Animated, { Easing, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateKey } from '@/lib/pitch-stats';
import { Bar } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { viewSwap } from '~/shell/motion';
import { Press } from '~/shell/press';
import { leaveTo } from '~/shell/web-nav';
import { dateKeyOf } from '~/pitch/api';
import { MonthGrid } from '~/pitch/month-grid';
import { monthOf, reloadVelocityDays, useAllLogs, useMonth, useVelocityDays } from '~/pitch/store';
import { DayCards } from '~/home/day-card';
import { reloadEvents, useEventCounts } from '~/home/events';
import { RecentList } from '~/home/recent-list';
import { homeSnapshot } from '~/home/tab';

/**
 * 기록 달력 — 예전 홈의 투구 달력 · 고른 날 칸 · 목록 보기를 그대로 옮겼다(2026-10-27 홈 개편: 홈은 시안의 기록 보드 한 주만 보인다).
 * 홈 기록 보드의 '이번 주 N일 ›' · 날짜 칸 · 전체 기록의 컨디션에서 연다(?date= 면 그날 칸을 편 채). 일정 만들기 · 그날 투구 · 운동 · 영양 · 체크인 칸은 예전 그대로.
 */
export default function CalendarScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  /* 오늘은 홈이 받은 서버 날짜(시험 계정의 날짜까지) — 없으면 폰의 한국 날짜 */
  const today = homeSnapshot()?.today ?? toDateKey(new Date());
  const first = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  const [month, setMonth] = useState(monthOf(first ?? today));
  const [selected, setSelected] = useState<string | null>(first);
  const { logs } = useMonth(month);
  const [calView, setCalViewRaw] = useState<'calendar' | 'list'>('calendar');
  const [swapped, setSwapped] = useState(false);
  const setCalView = (v: 'calendar' | 'list') => {
    setSwapped(true);
    setCalViewRaw(v);
  };
  const allLogs = useAllLogs(calView === 'list');
  const eventCounts = useEventCounts();
  const velocityDays = useVelocityDays();
  const clipCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(velocityDays ?? {})) clipCounts[k] = v.clips;
  useEffect(() => {
    void reloadEvents();
    void reloadVelocityDays();
  }, []);
  const dayLogs = (logs ?? []).filter((l) => dateKeyOf(l.date) === selected);

  /* 날을 고르면 그날 칸이 보이게 */
  const scroll = useRef<ScrollViewInstance>(null);
  const dayY = useRef(0);
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, dayY.current - 24), animated: true }), 320);
    return () => clearTimeout(t);
  }, [selected]);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="홈" title="기록 달력" c={c} />
      <ScrollView ref={scroll} contentContainerStyle={[{ padding: 16, paddingBottom: Math.max(40, inset.bottom + 24) }, READABLE]}>
        {calView === 'list' ? (
          <Animated.View key="list" entering={viewSwap} style={{ gap: 16 }}>
            <View style={styles.listHead}>
              <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>
                최근 기록
              </Text>
              <Press accessibilityRole="button" accessibilityLabel="캘린더로 보기" onPress={() => setCalView('calendar')} style={styles.viewBtn}>
                <Icon name="calendar-days" size={20} color={c.muted} />
              </Press>
            </View>
            <RecentList logs={allLogs.logs} />
          </Animated.View>
        ) : (
          <Animated.View key="calendar" entering={swapped ? viewSwap : undefined}>
            <MonthGrid
              month={month}
              today={today}
              logs={logs}
              selected={selected}
              allowFuture
              legendExtra
              events={eventCounts}
              clips={clipCounts}
              compact={selected != null}
              onMonth={(m) => {
                setMonth(m);
                setSelected((cur) => (cur && cur.slice(0, 7) === m.slice(0, 7) ? cur : null));
              }}
              onDay={(day) => setSelected((cur) => (cur === day ? null : day))}
              headerAction={
                <Press accessibilityRole="button" accessibilityLabel="목록으로 보기" onPress={() => setCalView('list')} style={[styles.viewBtn, { marginRight: 4 }]}>
                  <Icon name="list" size={20} color={c.muted} />
                </Press>
              }
            />
          </Animated.View>
        )}
        {selected && calView === 'calendar' ? (
          <Animated.View exiting={FadeOut.duration(200).easing(Easing.in(Easing.ease))} style={{ marginTop: 16 }} onLayout={(e) => (dayY.current = e.nativeEvent.layout.y)}>
            <DayCards date={selected} today={today} logs={dayLogs} onTab={(href) => leaveTo(href)} onClose={() => setSelected(null)} />
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  viewBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
