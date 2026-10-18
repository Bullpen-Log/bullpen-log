import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isRestSession } from '@/lib/session-type';
import { STRONG_EFFORT_PCT, effortBand, readEffort } from '@/lib/pitch-effort';
import { TYPE, usePalette } from '~/lib/ui';
import { dateKeyOf, type PitchLog } from './api';
import { monthOf } from './store';

/**
 * 달 달력 — 웹 components/month-calendar.tsx 와 같은 칸: 그날 가장 센 체감 강도로 칸을 하늘색 세 진하기로 채우고(effortBand), 쉰 날은 점선만,
 * 칸 안에 'N구' · '휴식', 영상이 있으면 오른쪽 위 점, 오늘은 숫자에 파란 테두리 원(진한 칸이면 흰 원). 투구 탭(누르면 그날 화면)과
 * 홈(누르면 밑 그날 칸)이 같이 쓴다.
 */
/** '#0a84d6' → 'rgba(10,132,214,a)' */
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const BAND_ALPHA = { strong: 0.7, mid: 0.4, light: 0.15 } as const;
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
  allowFuture = false,
  onMonth,
  onDay,
}: {
  month: string;
  today: string;
  logs: PitchLog[] | null;
  /** 고른 날(홈) — 칸 테두리 */
  selected?: string | null;
  /** 앞날 · 다음 달도 연다(홈 — 일정을 미리 적는다). 투구 탭은 지난 일만 */
  allowFuture?: boolean;
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
  const last = !allowFuture && month >= monthOf(today);
  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      {/* 머리 — 왼쪽 '2026년 10월'(둥근 숫자), 오른쪽 ‹ ›(웹 MonthCalendar 머리와 같은 자리) */}
      <View style={styles.monthRow}>
        <Text accessibilityRole="header" style={[styles.month, { color: c.ink }]}>
          <Text style={TYPE.num}>{y}</Text>년 <Text style={TYPE.num}>{m}</Text>월
        </Text>
        <Pressable accessibilityLabel="지난달" hitSlop={6} onPress={() => onMonth(shiftMonth(month, -1))} style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.5 }]}>
          <Text style={[styles.arrowText, { color: c.sky }]}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="다음달"
          hitSlop={6}
          disabled={last}
          onPress={() => onMonth(shiftMonth(month, 1))}
          style={({ pressed }) => [styles.arrow, last && { opacity: 0.3 }, pressed && { opacity: 0.5 }]}
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
          if (!day) return <View key={`e${i}`} style={styles.slot} />;
          const dayLogs = byDay.get(day) ?? [];
          const count = dayLogs.reduce((n, l) => n + l.pitchCount, 0);
          const rest = dayLogs.length > 0 && dayLogs.every((l) => isRestSession(l.sessionType));
          const video = dayLogs.some((l) => l.videoPaths.length > 0);
          const effort = dayLogs.length && !rest ? Math.max(0, ...dayLogs.map((l) => readEffort({ intensity: l.intensity ?? 0, effortPct: l.effortPct })?.pct ?? 0)) : null;
          const strong = effort != null && effort >= STRONG_EFFORT_PCT;
          const isToday = day === today;
          const isSel = day === selected;
          const future = !allowFuture && day > today;
          const ink = strong ? '#fff' : c.ink;
          return (
            <View key={day} style={styles.slot}>
              <Pressable
                disabled={future}
                accessibilityLabel={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일${count ? `, ${count}구` : rest ? ', 쉬는 날로 남김' : ''}${video ? ', 영상 있음' : ''}${isToday ? ', 오늘' : ''}`}
                accessibilityState={{ selected: isSel }}
                onPress={() => onDay(day)}
                style={({ pressed }) => [
                  styles.cell,
                  effort != null && { backgroundColor: alpha(c.sky, BAND_ALPHA[effortBand(effort)]) },
                  rest && { borderStyle: 'dashed', borderColor: c.muted },
                  isSel && { borderColor: c.sky, borderStyle: 'solid' },
                  future && { opacity: 0.35 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.dayNumBox, isToday && { borderColor: strong ? '#fff' : c.sky, borderWidth: 1.5 }]}>
                  <Text style={[styles.dayNum, { color: isToday ? (strong ? '#fff' : c.sky) : rest ? c.muted : ink }, isToday && { fontWeight: '700', fontSize: 13 }]}>
                    {Number(day.slice(8))}
                  </Text>
                </View>
                {dayLogs.length ? (
                  <Text numberOfLines={1} style={[styles.count, { color: rest ? c.muted : ink, opacity: 0.8 }]}>
                    {rest ? '휴식' : `${count}구`}
                  </Text>
                ) : null}
                {video ? <View style={[styles.dot, { backgroundColor: c.skyStrong, borderColor: c.card }]} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 12, paddingTop: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, paddingLeft: 6 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 28 },
  month: { flex: 1, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, paddingBottom: 4 },
  /* 칸 — 웹 휴대폰 min-h 3.25rem · rounded-lg · 칸 사이 틈 */
  slot: { width: `${100 / 7}%`, padding: 2 },
  cell: { minHeight: 52, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayNumBox: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  count: { fontSize: 10, lineHeight: 12, paddingHorizontal: 2 },
  dot: { position: 'absolute', right: 4, top: 4, width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
});
