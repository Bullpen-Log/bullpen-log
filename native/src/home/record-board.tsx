import { useEffect, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { BoardDay, HomeBoard } from '@/lib/report/home-board';
import { round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { dotDate, korDate, weekdayKo } from './plan-model';

/**
 * 기록 보드 — 승인 시안 '새 구성'의 둘째 구역(nl-board): 이번 주 칸 일곱(월요일부터 — 투구 탭 '이번 주'와 같은 규칙) · 최근 투구 기록과 최고 구속(넘기지 않고
 * 바로) · 내 영상 · 구속 측정 · 분석.
 * - 칸의 점: 오늘은 오늘 셀 것(링과 같은 분모 — 운동 일정이 없으면 둘)만큼 점을 두고 한 만큼 채운다. 다른 날은 남긴 기록 종류만큼 채운 점만 —
 *   빈 날 · 앞날에 빈 점을 늘어놓아 못 한 날처럼 보이지 않게.
 * - 기록이 늘면(새로 받은 홈) 오늘 칸이 0.42초 톡 튄다. 움직임 줄이기면 없음.
 */
export function RecordBoard({
  board,
  today,
  todayCount,
  pitchLocked,
  onWeek,
  onDay,
  onRecords,
  onLastPitch,
  onBest,
  onVideos,
  onMeasure,
  onAnalysis,
}: {
  board: HomeBoard | undefined;
  today: string;
  todayCount: { done: number; total: number };
  pitchLocked: boolean;
  onWeek: () => void;
  onDay: (date: string) => void;
  onRecords: () => void;
  onLastPitch: (date: string | null) => void;
  onBest: () => void;
  onVideos: () => void;
  onMeasure: () => void;
  onAnalysis: () => void;
}) {
  const c = usePalette();
  const speed = usePrefs().speed;
  /* 수치 둘이 나란히(320pt 폰까지) — 큰 글씨면 좁은 폰에서만 위아래로 */
  const basis = 110 * Math.max(1, useWindowDimensions().fontScale);
  const p = board?.lastPitch ?? null;
  const v = board?.bestVelocity ?? null;
  return (
    <View accessibilityLabel="기록 보드">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.headText, { color: c.ink }]}>
          기록 보드
        </Text>
        <Press accessibilityRole="button" accessibilityLabel={board ? `이번 주 ${board.weekDays}일 기록, 달력 열기` : '달력 열기'} onPress={onWeek} style={styles.headBtn}>
          <Text style={[styles.headLink, { color: c.link }]}>{board ? `이번 주 ${board.weekDays}일` : '달력'}</Text>
          <Icon name="chevron-right" size={15} color={c.link} strokeWidth={2.4} />
        </Press>
      </View>
      <View style={[styles.board, { backgroundColor: c.card, boxShadow: c.float }]}>
        {board ? (
          <View style={styles.week}>
            {board.week.map((d) => (
              <DayCell key={d.date} day={d} today={today} c={c} todayCount={todayCount} onPress={() => onDay(d.date)} />
            ))}
          </View>
        ) : (
          <Text style={[styles.missing, { color: c.muted }]}>이번 주 기록을 불러오지 못했어요.</Text>
        )}
        <View style={styles.recordHead}>
          <Text style={[styles.recordHeadText, { color: c.muted }]}>최근 기록</Text>
          <Press accessibilityRole="button" accessibilityLabel="전체 기록" onPress={onRecords} style={styles.headBtn}>
            <Text style={[styles.headLink, { color: c.link }]}>전체</Text>
            <Icon name="chevron-right" size={13} color={c.link} strokeWidth={2.4} />
          </Press>
        </View>
        <View style={styles.stats}>
          <Stat
            c={c}
            basis={basis}
            icon="circle-dot"
            label="최근 투구 기록"
            value={p ? (p.rested ? '휴식' : String(p.pitches)) : '—'}
            unit={p && !p.rested ? '구' : ''}
            date={p ? (p.date === today ? `오늘 · ${dotDate(p.date)}` : `${dotDate(p.date)} 기록`) : board ? (pitchLocked ? '투구 기록 설정 전' : '아직 기록 없음') : '불러오지 못했어요'}
            spoken={p ? `${korDate(p.date)} ${p.rested ? '휴식' : `${p.pitches}구`}` : '기록 없음'}
            onPress={() => onLastPitch(p?.date ?? null)}
          />
          <Stat
            c={c}
            basis={basis}
            icon="gauge"
            label={v?.scope === 'all' ? '최고 구속 · 전체' : '최고 구속 · 최근 6주'}
            value={v ? String(round1(toSpeed(v.kmh, speed))) : '—'}
            unit={v ? speedLabel(speed) : ''}
            date={v ? `${dotDate(v.date)} 측정` : board ? '아직 측정 기록 없음' : '불러오지 못했어요'}
            spoken={v ? `${korDate(v.date)} ${round1(toSpeed(v.kmh, speed))} ${speedLabel(speed)}` : '기록 없음'}
            onPress={onBest}
          />
        </View>
        <View style={[styles.tools, { borderTopColor: c.line }]}>
          <Tool c={c} icon="film" label="내 영상" onPress={onVideos} />
          <Tool c={c} icon="camera" label="구속 측정" onPress={onMeasure} />
          <Tool c={c} icon="activity" label="분석" onPress={onAnalysis} />
        </View>
      </View>
    </View>
  );
}

const KINDS: [keyof Pick<BoardDay, 'checkin' | 'workout'> | 'pitch', string][] = [
  ['checkin', '체크인'],
  ['pitch', '투구'],
  ['workout', '운동'],
];

function DayCell({
  day,
  today,
  todayCount,
  c,
  onPress,
}: {
  day: BoardDay;
  today: string;
  todayCount: { done: number; total: number };
  c: Palette;
  onPress: () => void;
}) {
  const reduce = useReducedMotion();
  const isToday = day.date === today;
  const future = day.date > today;
  const kinds = KINDS.filter(([k]) => (k === 'pitch' ? day.pitch != null : day[k])).map(([, l]) => (l === '투구' && day.pitch === 'rest' ? '휴식' : l));
  const recorded = kinds.length > 0;
  const pips = isToday ? todayCount.total : kinds.length;
  const filled = isToday ? todayCount.done : kinds.length;
  /* 오늘 한 것이 늘면 톡(처음 그릴 때는 안 튐) */
  const prev = useRef<number | null>(null);
  const s = useSharedValue(1);
  const rot = useSharedValue(0);
  useEffect(() => {
    if (!isToday) return;
    const was = prev.current;
    prev.current = filled;
    if (was == null || filled <= was || reduce) return;
    const e = Easing.bezier(0.22, 1, 0.36, 1);
    s.value = withSequence(withTiming(0.88, { duration: 90 }), withTiming(1.08, { duration: 170, easing: e }), withTiming(1, { duration: 160, easing: e }));
    rot.value = withSequence(withTiming(-5, { duration: 90 }), withTiming(2, { duration: 170, easing: e }), withTiming(0, { duration: 160, easing: e }));
  }, [filled, isToday, reduce, s, rot]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${rot.value}deg` }] }));
  const spoken = `${korDate(day.date)} ${weekdayKo(day.date)}요일${isToday ? ', 오늘' : ''}, ${recorded ? `${kinds.join(' · ')} 기록` : future ? '앞날' : '기록 없음'}`;
  return (
    <Animated.View style={[styles.dayWrap, pop]}>
      <Press
        select
        selected={false}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        onPress={onPress}
        style={[
          styles.day,
          { backgroundColor: isToday ? c.skyTint : c.page },
          isToday && { borderColor: withAlpha(c.link, 0.3), borderWidth: 1 },
        ]}
      >
        <Text style={[styles.dayWeek, { color: c.muted }]}>{weekdayKo(day.date)}</Text>
        <View style={[styles.dayNum, recorded && { backgroundColor: c.action }]}>
          <Text style={[styles.dayNumText, { color: recorded ? c.onAction : future ? c.muted : c.ink }]}>{Number(day.date.slice(8, 10))}</Text>
        </View>
        <View style={styles.pips}>
          {Array.from({ length: pips }, (_, i) => (
            <View key={i} style={[styles.pip, { backgroundColor: i < filled ? c.action : c.line }]} />
          ))}
        </View>
      </Press>
    </Animated.View>
  );
}

function Stat({
  c,
  basis,
  icon,
  label,
  value,
  unit,
  date,
  spoken,
  onPress,
}: {
  c: Palette;
  basis: number;
  icon: IconName;
  label: string;
  value: string;
  unit: string;
  date: string;
  spoken: string;
  onPress: () => void;
}) {
  return (
    <Press card accessibilityRole="button" accessibilityLabel={`${label}, ${spoken}`} onPress={onPress} style={[styles.stat, { flexBasis: basis, backgroundColor: c.page }]}>
      <View style={styles.statLabel}>
        <Icon name={icon} size={13} color={c.muted} strokeWidth={2.4} />
        <Text numberOfLines={2} style={[styles.small11, { color: c.muted, flexShrink: 1 }]}>
          {label}
        </Text>
      </View>
      {/* 단위는 숫자 글꼴 밖에서(좁은 숫자 글꼴에 한글 · 영문 단위가 섞이면 크기가 안 맞는다) */}
      <View style={styles.statRow}>
        <Text style={[styles.statValue, { color: c.ink }]}>{value}</Text>
        {unit ? <Text style={[styles.statUnit, { color: c.muted }]}>{unit}</Text> : null}
      </View>
      <Text style={[styles.small11, { color: c.muted }]}>{date}</Text>
    </Press>
  );
}

function Tool({ c, icon, label, onPress }: { c: Palette; icon: IconName; label: string; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.tool}>
      <Icon name={icon} size={19} color={c.link} strokeWidth={2.3} />
      <Text style={[styles.toolText, { color: c.link }]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginHorizontal: 2, marginBottom: 4 },
  headText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  headLink: { fontSize: 13, fontWeight: '500' },
  board: { padding: 14, borderRadius: 22 },
  missing: { fontSize: 13, paddingVertical: 12 },
  week: { flexDirection: 'row', gap: 3, marginBottom: 6 },
  dayWrap: { flex: 1, minWidth: 0 },
  day: { minHeight: 73, borderRadius: 15, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', gap: 5 },
  dayWeek: { fontSize: 11 },
  dayNum: { minWidth: 24, minHeight: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  dayNumText: { fontSize: 14, fontVariant: ['tabular-nums'] },
  pips: { flexDirection: 'row', gap: 2, minHeight: 4, marginTop: 1 },
  pip: { width: 4, height: 4, borderRadius: 2 },
  recordHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  recordHeadText: { fontSize: 12, fontWeight: '500' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, minHeight: 101, borderRadius: 16, padding: 12, gap: 6, alignItems: 'flex-start' },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'stretch' },
  small11: { fontSize: 11, lineHeight: 16 },
  statValue: { fontFamily: 'DINCondensed-Bold', fontSize: 35, lineHeight: 38, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  statUnit: { fontSize: 11 },
  tools: { flexDirection: 'row', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 14 },
  tool: { flex: 1, minHeight: 55, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12 },
  toolText: { fontSize: 12, fontWeight: '500' },
});
