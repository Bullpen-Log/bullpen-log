import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, LinearTransition, withDelay, withTiming } from 'react-native-reanimated';
import { isRestSession } from '@/lib/session-type';
import { STRONG_EFFORT_PCT, effortBand, readEffort } from '@/lib/pitch-effort';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { dateKeyOf, type PitchLog } from './api';
import { monthOf } from './store';
import { VideoCell } from './video-cell';

/**
 * 달 달력 — 웹 components/month-calendar.tsx 와 같은 칸 · 같은 움직임.
 * - 칸: 그날 가장 센 체감 강도로 하늘색 세 진하기, 쉰 날은 점선, 'N구' · '휴식', 영상이면 오른쪽 위 점, 오늘은 숫자에 파란 테두리 원(진한 칸이면 흰 원).
 * - 머리: '2026년 10월'(둥근 숫자 24) · ‹ › 40 동그라미. 밑에 '표시 보기'(범례, 접힘).
 * - 달 넘김: 새 달이 넘긴 쪽에서 20px 미끄러져 들어오고(380ms cubic-bezier(0.2,0,0,1)) 90ms 뒤 260ms 에 진해진다, 옛 달은 반대로 180ms 에 사라짐.
 *   제목도 8px 미끄러지며 0.35 → 1(320ms). 요일 줄은 그대로. 5 ↔ 6주 높이는 380ms 에 바뀐다.
 * - compact(홈에서 날을 골랐을 때): 칸 52 → 44 가 300ms cubic-bezier(0.22,1,0.36,1) 로 줄어든다. 날을 누르면 햅틱 selection.
 * 투구 탭(누르면 그날 화면)과 홈(누르면 밑 그날 칸)이 같이 쓴다.
 */
/** '#0a84d6' → 'rgba(10,132,214,a)' */
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const BAND_ALPHA = { strong: 0.7, mid: 0.4, light: 0.15 } as const;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const SLIDE = Easing.bezier(0.2, 0, 0, 1);
const CELL = Easing.bezier(0.22, 1, 0.36, 1);

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/* 들어오는 달 · 나가는 달 · 제목 — 웹 gc month-slide-in / out · month-title */
const monthIn = (dir: number) => () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: 20 * dir }] },
    animations: {
      opacity: withDelay(90, withTiming(1, { duration: 260, easing: Easing.out(Easing.ease) })),
      transform: [{ translateX: withTiming(0, { duration: 380, easing: SLIDE }) }],
    },
  };
};
const monthOut = (dir: number) => () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: 180, easing: Easing.in(Easing.ease) }),
      transform: [{ translateX: withTiming(-20 * dir, { duration: 380, easing: SLIDE }) }],
    },
  };
};
const titleIn = (dir: number) => () => {
  'worklet';
  return {
    initialValues: { opacity: 0.35, transform: [{ translateX: 8 * dir }] },
    animations: {
      opacity: withTiming(1, { duration: 320, easing: SLIDE }),
      transform: [{ translateX: withTiming(0, { duration: 320, easing: SLIDE }) }],
    },
  };
};

export function MonthGrid({
  month,
  today,
  logs,
  selected,
  allowFuture = false,
  compact = false,
  video = false,
  thumbs,
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
  /** 날을 골라 밑에 그날 칸이 펴졌을 때 — 칸이 납작해진다(웹 compact) */
  compact?: boolean;
  /** 투구 탭 영상 달력 — 칸 68 · 테두리 · 그날 영상 장면(웹 video-calendar.tsx). 홈은 강도 칸 */
  video?: boolean;
  /** 날짜 → 그날 대표 영상 장면 주소(video 일 때) */
  thumbs?: Record<string, string>;
  onMonth: (month: string) => void;
  onDay: (day: string) => void;
}) {
  const c = usePalette();
  const [legend, setLegend] = useState(false);
  /* 넘긴 쪽 — 처음 그릴 때(0)는 안 움직인다. 달이 바뀐 그 그리기에서 정한다(그리기 중 상태 맞추기) */
  const [seen, setSeen] = useState({ month, dir: 0 });
  if (seen.month !== month) setSeen({ month, dir: month > seen.month ? 1 : -1 });
  const dir = seen.month === month ? seen.dir : month > seen.month ? 1 : -1;

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
    <Animated.View layout={LinearTransition.duration(380).easing(SLIDE)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      {/* 머리 — 왼쪽 '2026년 10월'(둥근 숫자 · 년월은 0.83배 굵게), 오른쪽 ‹ › 40 동그라미 */}
      <View style={styles.monthRow}>
        <Animated.View key={month} entering={dir ? titleIn(dir) : undefined} style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ color: c.ink }}>
            <Text style={[TYPE.num, { fontSize: 24 }]}>{y}</Text>
            <Text style={styles.unit}>년 </Text>
            <Text style={[TYPE.num, { fontSize: 24 }]}>{m}</Text>
            <Text style={styles.unit}>월</Text>
          </Text>
        </Animated.View>
        <Press accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => onMonth(shiftMonth(month, -1))} style={styles.arrow}>
          <Icon name="chevron-left" size={20} color={c.sky} />
        </Press>
        <Press
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          disabled={last}
          onPress={() => onMonth(shiftMonth(month, 1))}
          style={[styles.arrow, last && { opacity: 0.3 }]}
        >
          <Icon name="chevron-right" size={20} color={c.sky} />
        </Press>
      </View>
      {/* 요일 줄은 달이 바뀌어도 가만히 */}
      <View style={styles.weekRow}>
        {WEEK.map((w) => (
          <Text key={w} style={[styles.week, { color: c.muted }]}>
            {w}
          </Text>
        ))}
      </View>
      <Animated.View key={month} entering={dir ? monthIn(dir) : undefined} exiting={dir ? monthOut(dir) : undefined} style={styles.grid}>
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
          if (video) {
            const paths = rest ? [] : dayLogs.flatMap((l) => l.videoPaths);
            return (
              <View key={day} style={styles.slot}>
                <Press
                  select
                  selected={isSel}
                  disabled={future}
                  accessibilityLabel={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일${count ? `, ${count}구` : rest ? ', 쉬는 날로 남김' : ''}${paths.length ? `, 영상 ${paths.length}개` : ''}${isToday ? ', 오늘' : ''}`}
                  onPress={() => onDay(day)}
                  style={[styles.videoCell, { borderColor: future ? 'transparent' : isSel ? c.sky : c.line }, isSel && { boxShadow: `0 0 0 2px ${c.sky}` }]}
                >
                  <VideoCell
                    d={{
                      day: Number(day.slice(8)),
                      isToday,
                      isFuture: future,
                      logged: dayLogs.length > 0,
                      rest,
                      pitches: count,
                      effortPct: effort ?? 0,
                      videos: paths.length,
                      thumb: thumbs?.[day] ?? null,
                    }}
                  />
                </Press>
              </View>
            );
          }
          return (
            <View key={day} style={styles.slot}>
              <Animated.View layout={LinearTransition.duration(300).easing(CELL)}>
                <Press
                  select
                  selected={isSel}
                  disabled={future}
                  accessibilityLabel={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일${count ? `, ${count}구` : rest ? ', 쉬는 날로 남김' : ''}${video ? ', 영상 있음' : ''}${isToday ? ', 오늘' : ''}`}
                  accessibilityState={{ selected: isSel }}
                  onPress={() => onDay(day)}
                  style={[
                    styles.cell,
                    { minHeight: compact ? 44 : 52 },
                    effort != null && { backgroundColor: alpha(c.sky, BAND_ALPHA[effortBand(effort)]) },
                    rest && { borderStyle: 'dashed', borderColor: c.lineStrong },
                    isSel && { borderColor: c.sky, borderStyle: 'solid', boxShadow: `0 0 0 1px ${c.sky}` },
                    future && { opacity: 0.35 },
                  ]}
                >
                  <View style={[styles.dayNumBox, isToday && { borderColor: strong ? '#fff' : c.sky, borderWidth: 1.5 }]}>
                    <Text style={[styles.dayNum, { color: isToday ? (strong ? '#fff' : c.sky) : rest ? c.muted : ink }, isToday && { fontWeight: '700', fontSize: 13 }]}>
                      {Number(day.slice(8))}
                    </Text>
                  </View>
                  {dayLogs.length ? (
                    <Text numberOfLines={1} style={[styles.count, { color: rest ? c.muted : ink }]}>
                      {rest ? '휴식' : `${count}구`}
                    </Text>
                  ) : null}
                  {video ? <View style={[styles.dot, { backgroundColor: c.skyStrong, borderColor: c.card }]} /> : null}
                </Press>
              </Animated.View>
            </View>
          );
        })}
      </Animated.View>
      {/* 범례 — 접어 둔다(웹 '표시 보기': 칸의 진하기는 보면 알고, 궁금할 때만 편다) */}
      <Press accessibilityRole="button" accessibilityState={{ expanded: legend }} onPress={() => setLegend((o) => !o)} style={styles.legendBtn}>
        <Icon name="info" size={14} color={c.muted} />
        <Text style={{ color: c.muted, fontSize: 12 }}>표시 보기</Text>
        <Icon name={legend ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted} />
      </Press>
      {legend ? (
        <Animated.View entering={fadeIn} style={styles.legend}>
          {(['light', 'mid', 'strong'] as const).map((b, i) => (
            <View key={b} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: alpha(c.sky, BAND_ALPHA[b]) }]} />
              <Text style={[styles.legendText, { color: c.muted }]}>{['강도 낮음', '중간', '높음'][i]}</Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { borderWidth: 1, borderStyle: 'dashed', borderColor: c.lineStrong }]} />
            <Text style={[styles.legendText, { color: c.muted }]}>쉬는 날</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: c.skyStrong }]} />
            <Text style={[styles.legendText, { color: c.muted }]}>영상</Text>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}


const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, paddingBottom: 8, overflow: 'hidden' },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 4 },
  unit: { fontSize: 20, fontWeight: '900', letterSpacing: 0 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '500', paddingBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  /* 칸 — 웹 휴대폰 min-h 3.25rem(고르면 2.75rem) · rounded-lg 12 · 칸 사이 4 */
  slot: { width: `${100 / 7}%`, padding: 2 },
  cell: { borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2 },
  /* 영상 달력 칸 — 웹 size large h-[4.25rem] · rounded-lg · border-line */
  videoCell: { height: 68, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  dayNumBox: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  count: { fontSize: 11, lineHeight: 12, paddingHorizontal: 2, opacity: 0.8 },
  dot: { position: 'absolute', right: 4, top: 4, width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  legendBtn: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 12, rowGap: 6, paddingBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 12 },
});
