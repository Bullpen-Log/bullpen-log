import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isRestSession } from '@/lib/session-type';
import { usePalette } from '~/lib/ui';
import { dateKeyOf, type PitchLog } from './api';
import { monthOf } from './store';

/**
 * 달 달력 — 그날 공 수 · 휴식 · 영상 점, 오늘은 파란 테두리 원. 투구 탭(누르면 그날 화면)과 홈(누르면 밑 그날 칸)이 같이 쓴다.
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function MonthGrid({
  month,
  today,
  logs,
  selected,
  onMonth,
  onDay,
}: {
  month: string;
  today: string;
  logs: PitchLog[] | null;
  /** 고른 날(홈) — 채운 원 */
  selected?: string | null;
  onMonth: (month: string) => void;
  onDay: (day: string) => void;
}) {
  const c = usePalette();
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
  const last = month >= monthOf(today);
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={styles.monthRow}>
        <Pressable accessibilityLabel="지난달" hitSlop={10} onPress={() => onMonth(shiftMonth(month, -1))} style={styles.arrow}>
          <Text style={[styles.arrowText, { color: c.sky }]}>‹</Text>
        </Pressable>
        <Text style={[styles.month, { color: c.ink }]}>
          {y}년 {m}월
        </Text>
        <Pressable
          accessibilityLabel="다음달"
          hitSlop={10}
          disabled={last}
          onPress={() => onMonth(shiftMonth(month, 1))}
          style={[styles.arrow, last && { opacity: 0.3 }]}
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
          const isSel = day === selected;
          const future = day > today;
          return (
            <Pressable
              key={day}
              disabled={future}
              accessibilityLabel={`${Number(day.slice(8))}일${count ? ` ${count}구` : rest ? ' 휴식' : ''}`}
              accessibilityState={{ selected: isSel }}
              onPress={() => onDay(day)}
              style={[styles.cell, future && { opacity: 0.35 }]}
            >
              <View
                style={[
                  styles.dayCircle,
                  isToday && { borderColor: c.sky, borderWidth: 2 },
                  isSel && { backgroundColor: c.sky, borderColor: c.sky },
                ]}
              >
                <Text style={[styles.dayNum, { color: isSel ? '#fff' : c.ink }, (isToday || isSel) && { fontWeight: '700' }]}>
                  {Number(day.slice(8))}
                </Text>
              </View>
              <Text style={[styles.count, { color: rest ? c.muted : c.sky }]}>{rest ? '휴식' : count ? `${count}구` : ' '}</Text>
              {video ? <View style={[styles.dot, { backgroundColor: c.sky }]} /> : <View style={styles.dotGap} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
