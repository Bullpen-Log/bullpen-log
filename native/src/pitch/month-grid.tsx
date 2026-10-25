import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, LinearTransition, withDelay, withTiming } from 'react-native-reanimated';
import { isRestSession } from '@/lib/session-type';
import { STRONG_EFFORT_PCT, effortBand, readEffort } from '@/lib/pitch-effort';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { dateKeyOf, type PitchLog } from './api';
import { monthOf, type Thumb } from './store';
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
  notes,
  events,
  clips,
  headerAction,
  legendExtra = false,
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
  thumbs?: Record<string, Thumb>;
  /** 체크인 메모를 남긴 날 — 칸 오른쪽 위 작은 쪽지(웹 NoteMark, video 일 때) */
  notes?: Set<string> | null;
  /** 날짜 → 그날 일정 수 — 칸 밑 짧은 막대(웹 events, 둘 넘으면 점 하나 더) */
  events?: Record<string, number>;
  /** 날짜 → 구속 측정 클립 수 — 영상 점에 같이 센다(웹 dayHas: 투구 영상 + 구속 클립) */
  clips?: Record<string, number>;
  /** 머리 오른쪽 ‹ › 앞에 둘 단추(홈의 목록 보기 — 웹 headerAction) */
  headerAction?: ReactNode;
  /** 범례에 '일정'까지(홈) */
  legendExtra?: boolean;
  onMonth: (month: string) => void;
  onDay: (day: string) => void;
}) {
  const c = usePalette();
  const [legend, setLegend] = useState(false);
  const [jump, setJump] = useState(false);
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
  const monthStats = useMemo(() => {
    let days = 0;
    let videos = 0;
    for (const [k, list] of byDay) {
      if (!k.startsWith(month)) continue;
      const thrown = list.filter((l) => !isRestSession(l.sessionType));
      if (thrown.length) days += 1;
      videos += thrown.reduce((n, l) => n + l.videoPaths.length, 0);
    }
    return { days, videos };
  }, [byDay, month]);
  const last = !allowFuture && month >= monthOf(today);
  return (
    <Animated.View layout={LinearTransition.duration(380).easing(SLIDE)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      {/* 머리 — 왼쪽 '2026년 10월'(둥근 숫자 · 년월은 0.83배 굵게), 오른쪽 ‹ › 40 동그라미 */}
      <View style={styles.monthRow}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Press accessibilityRole="button" accessibilityLabel={`${y}년 ${m}월, 달 고르기`} accessibilityState={{ expanded: jump }} onPress={() => setJump((o) => !o)}>
            <Animated.View key={month} entering={dir ? titleIn(dir) : undefined}>
              <Text style={{ color: c.ink }}>
                <Text style={[TYPE.num, { fontSize: 24 }]}>{y}</Text>
                <Text style={styles.unit}>년 </Text>
                <Text style={[TYPE.num, { fontSize: 24 }]}>{m}</Text>
                <Text style={styles.unit}>월</Text>
              </Text>
            </Animated.View>
          </Press>
        </View>
        {headerAction}
        <Press accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => onMonth(shiftMonth(month, -1))} style={styles.arrow}>
          <Icon name="chevron-left" size={20} color={c.link} />
        </Press>
        <Press
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          disabled={last}
          onPress={() => onMonth(shiftMonth(month, 1))}
          style={[styles.arrow, last && { opacity: 0.3 }]}
        >
          <Icon name="chevron-right" size={20} color={c.link} />
        </Press>
      </View>
      {jump ? (
        <MonthJump
          month={month}
          today={today}
          allowFuture={allowFuture}
          onClose={() => setJump(false)}
          onPick={(next) => {
            setJump(false);
            if (next !== month) onMonth(next);
          }}
        />
      ) : null}
      {/* 투구 탭 달력 — 이 달 던진 날 · 올린 영상을 늘 보이게(2026-10-21 김민: '표시 보기'를 눌러야 나왔다) */}
      {video ? (
        <Text style={{ color: c.muted, fontSize: 15, marginTop: 4 }}>
          이 달 투구 <Text style={[TYPE.numInline, { color: c.ink }]}>{monthStats.days}</Text>일 · 영상{' '}
          <Text style={[TYPE.numInline, { color: c.ink }]}>{monthStats.videos}</Text>개
        </Text>
      ) : null}
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
          const hasVideo = dayLogs.some((l) => l.videoPaths.length > 0) || (clips?.[day] ?? 0) > 0;
          const effort = dayLogs.length && !rest ? Math.max(0, ...dayLogs.map((l) => readEffort({ intensity: l.intensity ?? 0, effortPct: l.effortPct })?.pct ?? 0)) : null;
          const strong = effort != null && effort >= STRONG_EFFORT_PCT;
          const isToday = day === today;
          const isSel = day === selected;
          const future = !allowFuture && day > today;
          const ink = strong ? '#ffffff' : c.ink;
          /* 홈의 앞날(기록 없음)은 70% 글자 — 웹 isAhead */
          const aheadEmpty = allowFuture && day > today && !dayLogs.length;
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
                      noted: notes?.has(day) ?? false,
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
                  accessibilityLabel={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일${count ? `, ${count}구` : rest ? ', 쉬는 날로 남김' : ''}${hasVideo ? ', 영상 있음' : ''}${isToday ? ', 오늘' : ''}`}
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
                    <Text style={[styles.dayNum, { color: isToday ? (strong ? '#fff' : c.link) : rest ? c.muted : aheadEmpty ? withAlpha(c.ink, 0.7) : ink }, isToday && { fontWeight: '700', fontSize: 13 }]}>
                      {Number(day.slice(8))}
                    </Text>
                  </View>
                  {dayLogs.length ? (
                    <Text numberOfLines={1} style={[styles.count, { color: rest ? c.muted : ink }]}>
                      {rest ? '휴식' : `${count}구`}
                    </Text>
                  ) : null}
                  {events?.[day] ? (
                    <View style={styles.events}>
                      <View style={[styles.eventBar, { backgroundColor: withAlpha(ink, 0.7) }]} />
                      {events[day] > 1 ? <View style={[styles.eventDot, { backgroundColor: withAlpha(ink, 0.7) }]} /> : null}
                    </View>
                  ) : null}
                  {hasVideo ? <View style={[styles.dot, { backgroundColor: c.skyStrong, borderColor: c.card }]} /> : null}
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
        <View style={{ transform: [{ rotate: legend ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={14} color={c.muted} />
        </View>
      </Press>
      {legend ? (
        <Animated.View entering={fadeIn} style={styles.legend}>
          {/* 웹 범례와 같은 차례 — 강도 낮음 · 보통 · 높음(12×20) · 쉬는 날 · 영상 · 일정. 영상 달력은 장면이 보여 '영상' 점 대신 칸 밑 강도 막대 */}
          <Text style={[styles.legendText, { color: c.muted }]}>강도</Text>
          {(['light', 'mid', 'strong'] as const).map((b, i) => (
            <View key={b} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: alpha(c.sky, BAND_ALPHA[b]) }]} />
              <Text style={[styles.legendText, { color: c.muted }]}>{['낮음', '보통', '높음'][i]}</Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { borderWidth: 1, borderStyle: 'dashed', borderColor: c.lineStrong }]} />
            <Text style={[styles.legendText, { color: c.muted }]}>쉬는 날</Text>
          </View>
          {video ? (
            <Text style={[styles.legendText, { color: c.muted, width: '100%', textAlign: 'center' }]}>영상을 올린 날은 칸 밑 막대가 강도예요</Text>
          ) : (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c.skyStrong }]} />
              <Text style={[styles.legendText, { color: c.muted }]}>영상</Text>
            </View>
          )}
          {legendExtra ? (
            <View style={styles.legendItem}>
              <View style={[styles.eventBar, { backgroundColor: withAlpha(c.ink, 0.7) }]} />
              <Text style={[styles.legendText, { color: c.muted }]}>일정</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}


/* 한 주 일곱 칸 — 100/7% 로 두면 소수점 반올림이 쌓여 일곱째 칸(토)이 다음 줄로 넘어갔다(날짜와 요일이 어긋남) */
const SEVENTH = '14.28%';
const styles = StyleSheet.create({
  /* 웹 Card 안쪽 20 · 머리 → 16 → 요일 · 칸 → 8 → '표시 보기'(-mt-2) */
  card: { borderRadius: 20, padding: 20, overflow: 'hidden' },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 4 },
  unit: { fontSize: 20, fontWeight: '900', letterSpacing: 0 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginTop: 16, marginBottom: 4 },
  week: { width: SEVENTH, textAlign: 'center', fontSize: 11, fontWeight: '500', paddingBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  /* 칸 — 웹 휴대폰 min-h 3.25rem(고르면 2.75rem) · rounded-lg 12 · 칸 사이 4 */
  slot: { width: SEVENTH, padding: 2 },
  cell: { borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2 },
  /* 영상 달력 칸 — 웹 size large h-[4.25rem] · rounded-lg · border-line */
  videoCell: { height: 68, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  dayNumBox: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  count: { fontSize: 10, lineHeight: 11, paddingHorizontal: 2, opacity: 0.8 },
  dot: { position: 'absolute', right: 4, top: 4, width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  legendBtn: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 8, marginTop: 8, marginBottom: -8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 12, rowGap: 8, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 20, height: 12, borderRadius: 4 },
  events: { position: 'absolute', left: 0, right: 0, bottom: 2, flexDirection: 'row', justifyContent: 'center', gap: 2 },
  eventBar: { width: 12, height: 4, borderRadius: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 13 },
  jump: { position: 'absolute', left: 20, top: 64, width: 256, zIndex: 20, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  jumpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  jumpArrow: { minWidth: 44, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  jumpYear: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8, borderRadius: 12 },
  jumpGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  jumpCell: { width: '25%', padding: 2 },
  jumpBtn: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  jumpToday: { marginTop: 8, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

/**
 * '2026년 10월'을 누르면 펼쳐지는 빠른 이동 — 웹 month-calendar.tsx MonthJump 와 같다.
 * 달 쪽(1~12월, ‹ 해 › · 해를 누르면 해 쪽) · 해 쪽(12년씩, 쪽의 끝이 마지막 해에 맞게) · [오늘로]. 아직 안 온 해 · 달은 흐리게(홈은 5년 앞까지).
 * 창이 아니라 제자리에 뜨는 작은 판 — 바깥(카드)을 누르면 닫힌다.
 */
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
function MonthJump({
  month,
  today,
  allowFuture,
  onPick,
  onClose,
}: {
  month: string;
  today: string;
  allowFuture: boolean;
  onPick: (month: string) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const [cy, cm] = month.split('-').map(Number);
  const [ty, tm] = today.split('-').map(Number);
  const lastYear = allowFuture ? ty + 5 : ty;
  const [view, setView] = useState<'month' | 'year'>('month');
  const [pickYear, setPickYear] = useState(cy);
  const pageStartFor = (year: number) => lastYear - 11 - 12 * Math.max(0, Math.floor((lastYear - year) / 12));
  const [pageStart, setPageStart] = useState(pageStartFor(cy));
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  return (
    <>
      {/* 바깥 누르면 닫힘 — 카드 전체를 덮는 투명 판 */}
      <Press accessibilityLabel="달 고르기 닫기" onPress={onClose} style={[StyleSheet.absoluteFill, { zIndex: 19 }]} />
      <Animated.View entering={fadeIn} style={[styles.jump, { backgroundColor: c.card, borderColor: c.line, boxShadow: '0 10px 30px -10px rgba(0,0,0,0.25)' }]}>
        <Animated.View key={view} entering={fadeIn}>
          {view === 'month' ? (
            <>
              <View style={styles.jumpHead}>
                <Press accessibilityRole="button" accessibilityLabel="이전 해" onPress={() => setPickYear((y) => y - 1)} style={styles.jumpArrow}>
                  <Icon name="chevron-left" size={16} color={c.muted} />
                </Press>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`${pickYear}년, 해 고르기`}
                  onPress={() => {
                    setPageStart(pageStartFor(pickYear));
                    setView('year');
                  }}
                  style={styles.jumpYear}
                >
                  <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{pickYear}년</Text>
                  <Icon name="chevron-down" size={14} color={c.muted} />
                </Press>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel="다음 해"
                  disabled={pickYear >= lastYear}
                  onPress={() => setPickYear((y) => y + 1)}
                  style={[styles.jumpArrow, pickYear >= lastYear && { opacity: 0.3 }]}
                >
                  <Icon name="chevron-right" size={16} color={c.muted} />
                </Press>
              </View>
              <View style={styles.jumpGrid}>
                {MONTH_LABELS.map((label, i) => {
                  const on = pickYear === cy && i + 1 === cm;
                  const future = !allowFuture && (pickYear > ty || (pickYear === ty && i + 1 > tm));
                  return (
                    <View key={label} style={styles.jumpCell}>
                      <Press
                        select
                        selected={on}
                        disabled={future}
                        accessibilityState={{ selected: on, disabled: future }}
                        onPress={() => onPick(key(pickYear, i + 1))}
                        style={[styles.jumpBtn, on && { backgroundColor: c.action }]}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '500', color: on ? '#fff' : future ? withAlpha(c.muted, 0.35) : c.ink }}>{label}</Text>
                      </Press>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <View style={styles.jumpHead}>
                <Press accessibilityRole="button" accessibilityLabel="이전 12년" onPress={() => setPageStart((y) => y - 12)} style={styles.jumpArrow}>
                  <Icon name="chevron-left" size={16} color={c.muted} />
                </Press>
                <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
                  {pageStart} – {pageStart + 11}
                </Text>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel="다음 12년"
                  disabled={pageStart + 11 >= lastYear}
                  onPress={() => setPageStart((y) => y + 12)}
                  style={[styles.jumpArrow, pageStart + 11 >= lastYear && { opacity: 0.3 }]}
                >
                  <Icon name="chevron-right" size={16} color={c.muted} />
                </Press>
              </View>
              <View style={styles.jumpGrid}>
                {Array.from({ length: 12 }, (_, i) => pageStart + i).map((year) => {
                  const on = year === pickYear;
                  const off = year > lastYear;
                  return (
                    <View key={year} style={styles.jumpCell}>
                      <Press
                        select
                        selected={on}
                        disabled={off}
                        onPress={() => {
                          setPickYear(year);
                          setView('month');
                        }}
                        style={[styles.jumpBtn, on && { backgroundColor: c.action }]}
                      >
                        <Text
                          style={[
                            TYPE.num,
                            { fontSize: 15, fontWeight: '500', color: on ? '#fff' : off ? withAlpha(c.muted, 0.35) : year === ty ? c.link : c.ink },
                          ]}
                        >
                          {year}
                        </Text>
                      </Press>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Animated.View>
        <Press accessibilityRole="button" onPress={() => onPick(key(ty, tm))} style={[styles.jumpToday, { borderColor: c.line }]}>
          <Text style={{ color: c.muted, fontSize: 15, fontWeight: '500' }}>오늘로</Text>
        </Press>
      </Animated.View>
    </>
  );
}
