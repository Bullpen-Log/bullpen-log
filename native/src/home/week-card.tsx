import { StyleSheet, Text, View } from 'react-native';
import type { BoardDay, HomeBoard } from '@/lib/report/home-board';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { korDate, weekdayKo } from './plan-model';

/**
 * 홈 '이번 주'(2026-10-29 확정 디자인) — 오늘 플랜 밑에 요일 일곱 칸만. 예전 기록 보드(최근 투구 · 최고 구속 · 내 영상 · 구속 측정 · 분석)는 걷었다 —
 * 상세 이력은 기록 탭, 측정 도구는 투구 탭이다.
 * - 칸은 서버 셈(lib/report/home-board.ts buildHomeBoard) 그대로: 기록 = 체크인 · 투구 기록 · 마친 운동. 한 날 여러 번 남겨도 1일(weekDays).
 * - 기록 있는 날은 채운 체크, 쉰 날 줄만 있는 날은 달 그림(휴식 — 미기록과 다르게), 오늘은 테두리 원 + 칸 바탕, 빈 날 · 앞날은 회색 원.
 * - 날짜를 누르면 기록 탭의 그날, '이번 주 N일'을 누르면 기록 탭의 오늘(이번 주 줄).
 */
export function WeekCard({
  board,
  today,
  onWeek,
  onDay,
}: {
  board: HomeBoard | undefined;
  today: string;
  onWeek: () => void;
  onDay: (date: string) => void;
}) {
  const c = usePalette();
  return (
    <View>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.headText, { color: c.ink }]}>
          이번 주
        </Text>
        <Press
          accessibilityRole="button"
          accessibilityLabel={board ? `이번 주 ${board.weekDays}일 기록, 기록 탭에서 보기` : '기록 탭에서 보기'}
          onPress={onWeek}
          style={styles.headBtn}
        >
          <Text style={[styles.headLink, { color: c.muted }]}>{board ? `이번 주 ${board.weekDays}일` : '기록'}</Text>
          <Icon name="chevron-right" size={15} color={c.muted} strokeWidth={2.4} />
        </Press>
      </View>
      {board ? (
        <View style={styles.week}>
          {board.week.map((d) => (
            <DayCell key={d.date} day={d} today={today} c={c} onPress={() => onDay(d.date)} />
          ))}
        </View>
      ) : (
        <Text style={[styles.missing, { color: c.muted }]}>이번 주 기록을 불러오지 못했어요.</Text>
      )}
    </View>
  );
}

const KINDS: ['checkin' | 'pitch' | 'workout', string][] = [
  ['checkin', '체크인'],
  ['pitch', '투구'],
  ['workout', '운동'],
];

/** 그날의 상태 — 기록(체크) · 휴식만(달) · 없음 */
export function dayState(day: BoardDay): 'done' | 'rest' | 'none' {
  if (day.checkin || day.workout || day.pitch === 'throw') return 'done';
  return day.pitch === 'rest' ? 'rest' : 'none';
}

function DayCell({ day, today, c, onPress }: { day: BoardDay; today: string; c: Palette; onPress: () => void }) {
  const isToday = day.date === today;
  const future = day.date > today;
  const state = dayState(day);
  const kinds = KINDS.filter(([k]) => (k === 'pitch' ? day.pitch != null : day[k])).map(([k, l]) => (k === 'pitch' && day.pitch === 'rest' ? '휴식' : l));
  const spoken = `${korDate(day.date)} ${weekdayKo(day.date)}요일${isToday ? ', 오늘' : ''}, ${kinds.length ? `${kinds.join(' · ')} 기록` : future ? '앞날' : '기록 없음'}`;
  const n = Number(day.date.slice(8, 10));
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: isToday }}
      onPress={onPress}
      style={[styles.day, isToday && { backgroundColor: c.card, boxShadow: c.float }]}
    >
      <Text style={[styles.dayWeek, { color: isToday ? c.ink : c.muted }]}>{weekdayKo(day.date)}</Text>
      {state === 'done' ? (
        <View style={[styles.dot, { backgroundColor: c.action }]}>
          <Icon name="check" size={17} color={c.onAction} strokeWidth={3} />
        </View>
      ) : state === 'rest' ? (
        <View style={[styles.dot, { backgroundColor: withAlpha(c.link, 0.14) }]}>
          <Icon name="moon" size={15} color={c.link} strokeWidth={2.4} />
        </View>
      ) : (
        <View
          style={[
            styles.dot,
            isToday ? { borderWidth: 1.5, borderColor: c.link, backgroundColor: c.card } : { backgroundColor: withAlpha(c.ink, future ? 0.035 : 0.06) },
          ]}
        >
          <Text style={[styles.dayNum, { color: isToday ? c.ink : c.muted, fontWeight: isToday ? '700' : '500', opacity: future ? 0.75 : 1 }]}>{n}</Text>
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginHorizontal: 2, marginBottom: 4 },
  headText: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  headBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  headLink: { fontSize: 13, fontWeight: '500' },
  missing: { fontSize: 13, paddingVertical: 12 },
  week: { flexDirection: 'row', gap: 2 },
  day: { flex: 1, minWidth: 0, minHeight: 78, borderRadius: 18, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', gap: 8 },
  dayWeek: { fontSize: 13 },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15, fontVariant: ['tabular-nums'] },
});
