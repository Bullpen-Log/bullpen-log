import { useState } from 'react';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeInLeft,
  FadeInRight,
  useReducedMotion,
} from 'react-native-reanimated';
import { calendarRange } from '@/lib/calendar-month';
import type { CalendarEventView } from '@/lib/calendar-event';
import type { RecordItem } from '@/lib/records/day-records';
import { shiftMonth } from '~/records/model';
import { type Palette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';

export const calendarDateLabel = (date: string) =>
  `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T12:00:00Z`).getUTCDay()]}`;

export function CalendarGrid({
  month,
  today,
  selected,
  records,
  events,
  onDay,
  onMonth,
  onToday,
  c,
}: {
  month: string;
  today: string;
  selected: string;
  records: RecordItem[] | null;
  events: CalendarEventView[] | null;
  onDay: (date: string) => void;
  onMonth: (month: string) => void;
  onToday: () => void;
  c: Palette;
}) {
  const reduce = useReducedMotion();
  const { fontScale, width } = useWindowDimensions();
  const [jump, setJump] = useState(false);
  const [direction, setDirection] = useState<0 | -1 | 1>(0);
  const range = calendarRange(month)!;
  const recordDates = new Set(records?.map((r) => r.date));
  const eventDates = new Set(events?.map((e) => e.date));
  const go = (dir: -1 | 1) => {
    setDirection(dir);
    onMonth(shiftMonth(month, dir));
  };
  const stacked = fontScale > 1.2 && width < 400;
  const dayHeight = fontScale > 1.3 ? 54 : 46;
  return (
    <View style={[s.calendar, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={[s.monthRow, stacked && { flexWrap: 'wrap' }]}>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`${month.slice(0, 4)}년 ${Number(month.slice(5))}월, 연월 선택`}
          onPress={() => setJump(true)}
          style={s.monthTitle}
        >
          <Text
            style={{
              color: c.ink,
              fontSize: width < 360 ? 20 : 22,
              fontWeight: '700',
              letterSpacing: -0.7,
            }}
          >
            {month.slice(0, 4)}년 {Number(month.slice(5))}월
          </Text>
          <Icon name="chevron-down" size={14} color={c.muted} />
        </Press>
        <View style={[s.monthActions, stacked && { marginLeft: 'auto' }]}>
          <Press accessibilityRole="button" onPress={onToday} style={s.today}>
            <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>오늘</Text>
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="이전 달"
            onPress={() => go(-1)}
            style={s.nav}
          >
            <Icon name="chevron-left" size={18} color={c.muted} />
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="다음 달"
            onPress={() => go(1)}
            style={s.nav}
          >
            <Icon name="chevron-right" size={18} color={c.muted} />
          </Press>
        </View>
      </View>
      <View
        style={s.week}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
          <Text key={w} style={[s.weekLabel, { color: c.muted }]}>
            {w}
          </Text>
        ))}
      </View>
      <Animated.View
        key={month}
        entering={
          !reduce && direction
            ? (direction > 0 ? FadeInRight : FadeInLeft)
                .duration(200)
                .withInitialValues({
                  opacity: 0.7,
                  transform: [{ translateX: direction * 10 }],
                })
            : undefined
        }
        style={s.grid}
      >
        {range.days.map((date) => {
          const on = date === selected,
            now = date === today,
            outside = date.slice(0, 7) !== month;
          const record = recordDates.has(date),
            event = eventDates.has(date);
          return (
            <Press
              key={date}
              select
              selected={on}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${calendarDateLabel(date)}${now ? ', 오늘' : ''}${record ? ', 기록 있음' : ''}${event ? ', 개인 일정 있음' : ''}`}
              onPress={() => onDay(date)}
              style={[s.day, { minHeight: dayHeight }]}
            >
              <View
                style={[
                  s.dayFill,
                  {
                    minHeight: dayHeight - 2,
                    backgroundColor: on ? c.action : 'transparent',
                    borderColor: now && !on ? withAlpha(c.link, 0.4) : 'transparent',
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 17,
                    lineHeight: 24,
                    fontWeight: on ? '700' : '400',
                    color: on ? c.onAction : outside ? c.muted : c.ink,
                    opacity: outside && !on ? 0.55 : 1,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {Number(date.slice(8))}
                </Text>
                <View
                  style={[s.marks, { opacity: outside && !on ? 0.55 : 1 }]}
                  accessibilityElementsHidden
                >
                  {record ? (
                    <View
                      style={[s.dot, { backgroundColor: on ? c.onAction : c.link }]}
                    />
                  ) : null}
                  {event ? (
                    <View
                      style={[s.bar, { backgroundColor: on ? c.onAction : c.link }]}
                    />
                  ) : null}
                </View>
              </View>
            </Press>
          );
        })}
      </Animated.View>
      <View style={[s.legend, { borderTopColor: c.line }]}>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: c.link }]} />
          <Text style={{ fontSize: 11, color: c.muted }}>남긴 기록</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.bar, { backgroundColor: c.link }]} />
          <Text style={{ fontSize: 11, color: c.muted }}>개인 일정</Text>
        </View>
      </View>
      {jump ? (
        <MonthPicker
          month={month}
          onClose={() => setJump(false)}
          onPick={(m) => {
            setDirection(m > month ? 1 : -1);
            onMonth(m);
            setJump(false);
          }}
          c={c}
        />
      ) : null}
    </View>
  );
}

function MonthPicker({
  month,
  onPick,
  onClose,
  c,
}: {
  month: string;
  onPick: (month: string) => void;
  onClose: () => void;
  c: Palette;
}) {
  const [year, setYear] = useState(month.slice(0, 4));
  const valid = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= 2100;
  return (
    <Sheet open fit title="연월 선택" onClose={onClose} c={c}>
      <Text style={{ color: c.muted, fontSize: 13, marginBottom: 8 }}>연도</Text>
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Press
          accessibilityRole="button"
          accessibilityLabel="이전 연도"
          onPress={() =>
            setYear(
              String(Math.max(1900, (Number(year) || Number(month.slice(0, 4))) - 1))
            )
          }
          style={s.pickerNav}
        >
          <Icon name="chevron-left" size={20} color={c.link} />
        </Press>
        <TextInput
          accessibilityLabel="연도, 1900년부터 2100년"
          value={year}
          onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 21,
            fontWeight: '600',
            minHeight: 50,
            color: c.ink,
            backgroundColor: c.chip,
            borderRadius: 15,
          }}
        />
        <Press
          accessibilityRole="button"
          accessibilityLabel="다음 연도"
          onPress={() =>
            setYear(
              String(Math.min(2100, (Number(year) || Number(month.slice(0, 4))) + 1))
            )
          }
          style={s.pickerNav}
        >
          <Icon name="chevron-right" size={20} color={c.link} />
        </Press>
      </View>
      {!valid ? (
        <Text
          accessibilityRole="alert"
          style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}
        >
          1900~2100년 중에서 선택해주세요.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: 12 }, (_, i) => {
          const value = `${year}-${String(i + 1).padStart(2, '0')}`,
            on = value === month;
          return (
            <View key={i} style={{ width: '25%', padding: 3 }}>
              <Press
                select
                selected={on}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                disabled={!valid}
                onPress={() => onPick(value)}
                style={{
                  minHeight: 48,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 15,
                  backgroundColor: on ? c.action : c.chip,
                  opacity: valid ? 1 : 0.4,
                }}
              >
                <Text style={{ color: on ? c.onAction : c.ink, fontSize: 16 }}>
                  {i + 1}월
                </Text>
              </Press>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  calendar: {
    borderRadius: 27,
    paddingHorizontal: 10,
    paddingTop: 11,
    paddingBottom: 12,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    marginBottom: 8,
  },
  monthTitle: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 4,
    flexShrink: 1,
  },
  monthActions: { flexDirection: 'row', alignItems: 'center' },
  today: {
    minHeight: 44,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: { minHeight: 44, width: 34, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', paddingBottom: 5 },
  weekLabel: {
    width: '14.285714%',
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285714%', alignItems: 'center', justifyContent: 'center' },
  dayFill: {
    width: '92%',
    maxWidth: 48,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marks: {
    height: 7,
    gap: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 4, height: 4, borderRadius: 4 },
  bar: { width: 11, height: 3, borderRadius: 3 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 17,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pickerNav: {
    minWidth: 44,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
