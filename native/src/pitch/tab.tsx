import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRestSession } from '@/lib/session-type';
import { usePalette } from '~/lib/ui';
import { dateKeyOf, type PitchLog } from './api';
import { monthOf, useMonth } from './store';

/**
 * 투구 탭(앱 화면) — 달력(그날 공 수 · 영상 점) + 그달 기록 목록. 날짜를 누르면 그날 화면(/pitch/[date]). 웹 투구 탭(app/(app)/videos)의
 * 첫 판 — 2분할 비교 · 찾기 · 구속 측정 단추 · 지난 영상 가져오기는 다음 판.
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function PitchTab({ today, bottom }: { today: string; bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [month, setMonth] = useState(monthOf(today));
  const { logs, loading, error, reload } = useMonth(month);

  const byDay = useMemo(() => {
    const map = new Map<string, PitchLog[]>();
    for (const l of logs ?? []) {
      const k = dateKeyOf(l.date);
      map.set(k, [...(map.get(k) ?? []), l]);
    }
    return map;
  }, [logs]);

  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [
      ...Array.from({ length: first }, () => null),
      ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
    ];
  }, [month]);

  const [y, m] = month.split('-').map(Number);
  const list = [...(logs ?? [])].reverse();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loading && logs != null} onRefresh={reload} />}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.ink }]}>투구 기록</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/velocity')}
          style={[styles.add, { backgroundColor: c.chip }]}
        >
          <Text style={[styles.addText, { color: c.ink }]}>구속 측정</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/pitch/edit' as Href as never, params: { date: today } })}
          style={[styles.add, { backgroundColor: c.sky }]}
        >
          <Text style={styles.addText}>오늘 기록</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: c.card }]}>
        <View style={styles.monthRow}>
          <Pressable accessibilityLabel="지난달" hitSlop={10} onPress={() => setMonth(shiftMonth(month, -1))} style={styles.arrow}>
            <Text style={[styles.arrowText, { color: c.sky }]}>‹</Text>
          </Pressable>
          <Text style={[styles.month, { color: c.ink }]}>
            {y}년 {m}월
          </Text>
          <Pressable
            accessibilityLabel="다음달"
            hitSlop={10}
            disabled={month >= monthOf(today)}
            onPress={() => setMonth(shiftMonth(month, 1))}
            style={[styles.arrow, month >= monthOf(today) && { opacity: 0.3 }]}
          >
            <Text style={[styles.arrowText, { color: c.sky }]}>›</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {WEEK.map((w) => (
            <Text key={w} style={[styles.week, { color: c.muted }]}>
              {w}
            </Text>
          ))}
          {cells.map((day, i) => {
            if (!day) return <View key={`e${i}`} style={styles.cell} />;
            const dayLogs = byDay.get(day) ?? [];
            const count = dayLogs.reduce((n, l) => n + l.pitchCount, 0);
            const rest = dayLogs.length > 0 && dayLogs.every((l) => isRestSession(l.sessionType));
            const video = dayLogs.some((l) => l.videoPaths.length > 0);
            const isToday = day === today;
            const future = day > today;
            return (
              <Pressable
                key={day}
                disabled={future}
                accessibilityLabel={`${Number(day.slice(8))}일${count ? ` ${count}구` : ''}`}
                onPress={() => router.push(`/pitch/${day}` as Href)}
                style={[styles.cell, future && { opacity: 0.35 }]}
              >
                <View style={[styles.dayCircle, isToday && { borderColor: c.sky, borderWidth: 2 }]}>
                  <Text style={[styles.dayNum, { color: c.ink }, isToday && { fontWeight: '700' }]}>{Number(day.slice(8))}</Text>
                </View>
                <Text style={[styles.count, { color: rest ? c.muted : c.sky }]}>{rest ? '휴식' : count ? `${count}구` : ' '}</Text>
                {video ? <View style={[styles.dot, { backgroundColor: c.sky }]} /> : <View style={styles.dotGap} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      {error && !logs ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}

      <View style={{ gap: 8 }}>
        {list.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => router.push(`/pitch/${dateKeyOf(l.date)}` as Href)}
            style={[styles.row, { backgroundColor: c.card }]}
          >
            <Text style={[styles.rowDate, { color: c.muted }]}>{Number(l.date.slice(5, 7))}/{Number(l.date.slice(8, 10))}</Text>
            <Text style={[styles.rowMain, { color: c.ink }]} numberOfLines={1}>
              {l.sessionType}
              {isRestSession(l.sessionType) ? '' : ` · ${l.pitchCount}구`}
              {l.effortPct ? ` · ${l.effortPct}%` : ''}
              {l.maxVelocity ? ` · ${l.maxVelocity}km/h` : ''}
            </Text>
            {l.videoPaths.length ? <Text style={{ color: c.sky, fontSize: 13 }}>영상 {l.videoPaths.length}</Text> : null}
            <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
          </Pressable>
        ))}
        {logs && list.length === 0 ? (
          <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 24 }}>이 달은 기록이 없어요.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 34, fontWeight: '700' },
  add: { height: 40, borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  addText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 20, padding: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 28 },
  month: { fontSize: 17, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4, minHeight: 58 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15 },
  count: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  dotGap: { height: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 14, paddingHorizontal: 14 },
  rowDate: { fontSize: 13, width: 40, fontVariant: ['tabular-nums'] },
  rowMain: { flex: 1, fontSize: 15, fontWeight: '600' },
});
