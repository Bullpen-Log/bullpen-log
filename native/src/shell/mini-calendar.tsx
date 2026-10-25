import * as Haptics from 'expo-haptics';
import { useRef, useState, type ComponentRef } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 작은 달력 — 날짜 하나를 고른다(웹 components/mini-calendar.tsx). 요일 줄 · 오늘은 하늘 글자 · 고른 날은 하늘 채움 ·
 * 고를 수 없는 날은 흐리게 · 기록이 있는 날은 숫자 밑 점. 한 판에 늘 여섯 줄(달마다 높이가 들썩이지 않게).
 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 판 높이(머리 + 요일 + 여섯 줄 + 여백) — 위아래 어디로 열지 정할 때 */
const POP_H = 380;
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function MiniCalendar({
  value,
  today,
  min,
  max,
  marked,
  onPick,
}: {
  value: string;
  today: string;
  min: string;
  max: string;
  marked: (day: string) => boolean;
  onPick: (day: string) => void;
}) {
  const c = usePalette();
  const [view, setView] = useState(() => {
    const [y, m] = (value || today).split('-').map(Number);
    return { y, m: m - 1 };
  });
  const daysIn = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const first = keyOf(view.y, view.m, 1);
  const last = keyOf(view.y, view.m, daysIn);
  const move = (delta: -1 | 1) => {
    const d = new Date(Date.UTC(view.y, view.m + delta, 1));
    void Haptics.selectionAsync();
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Press accessibilityRole="button" accessibilityLabel="이전 달" disabled={first <= min} onPress={() => move(-1)} style={[styles.arrow, first <= min && { opacity: 0.3 }]}>
          <Icon name="chevron-left" size={16} color={c.muted} />
        </Press>
        <Text accessibilityLiveRegion="polite" style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>
          {view.y}년 {view.m + 1}월
        </Text>
        <Press accessibilityRole="button" accessibilityLabel="다음 달" disabled={last >= max} onPress={() => move(1)} style={[styles.arrow, last >= max && { opacity: 0.3 }]}>
          <Icon name="chevron-right" size={16} color={c.muted} />
        </Press>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[styles.week, { color: c.muted }]}>
            {w}
          </Text>
        ))}
      </View>
      <Animated.View key={first} entering={FadeIn.duration(160)} style={styles.grid}>
        {Array.from({ length: 42 }, (_, i) => {
          const day = i - lead + 1;
          if (day < 1 || day > daysIn) return <View key={i} style={styles.cell} />;
          const key = keyOf(view.y, view.m, day);
          const off = key < min || key > max;
          const picked = key === value;
          const isToday = key === today;
          const has = !off && marked(key);
          return (
            <View key={i} style={styles.cellWrap}>
              <Press
                select
                selected={picked}
                accessibilityRole="button"
                accessibilityState={{ selected: picked, disabled: off }}
                accessibilityLabel={`${view.m + 1}월 ${day}일${isToday ? ', 오늘' : ''}${has ? ', 기록 있음' : ''}`}
                disabled={off}
                onPress={() => onPick(key)}
                style={[styles.cell, picked && { backgroundColor: c.action }]}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontVariant: ['tabular-nums'],
                    fontWeight: picked || isToday ? '700' : '400',
                    color: off ? withAlpha(c.muted, 0.35) : picked ? '#fff' : isToday ? c.link : c.ink,
                  }}
                >
                  {day}
                </Text>
                <View style={[styles.dot, { backgroundColor: has ? (picked ? '#fff' : c.sky) : 'transparent' }]} />
              </Press>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

/**
 * 날짜 띠 끝의 달력 그림 — 누르면 그 밑에 작은 달력 판(웹 nutrition-view DateNav · training date-nav). 바깥을 누르면 닫힌다.
 */
export function DateNavButton({
  date,
  today,
  min,
  marked,
  onPick,
  label,
}: {
  date: string;
  today: string;
  min: string;
  marked: (day: string) => boolean;
  onPick: (day: string) => void;
  /** 그림 대신 글자 칸(날짜 입력처럼) — 웹 input type=date 자리 */
  label?: string;
}) {
  const c = usePalette();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const open = () =>
    ref.current?.measureInWindow((x, y, w, h) => {
      const { width, height } = Dimensions.get('window');
      /* 글자 칸은 왼쪽 끝을 맞춘다(판 폭 296). 밑에 판(약 380) 자리가 없으면 위로 연다 */
      const right = label != null ? Math.max(12, width - x - 296) : Math.max(12, width - (x + w));
      setAt(y + h + 8 + POP_H > height - 24 && y - 8 - POP_H > 40 ? { bottom: height - y + 8, right } : { top: y + h + 8, right });
    });
  return (
    <>
      <View ref={ref} collapsable={false}>
        {label != null ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={`날짜 ${label}, 바꾸기`}
            accessibilityState={{ expanded: at != null }}
            onPress={open}
            style={[styles.field, { backgroundColor: withAlpha(c.ink, 0.05) }, at && { borderColor: c.sky }]}
          >
            <Text style={{ color: c.ink, fontSize: 15, fontVariant: ['tabular-nums'] }}>{label}</Text>
            <Icon name="calendar-days" size={16} color={c.muted} />
          </Press>
        ) : (
          <Press
            accessibilityRole="button"
            accessibilityLabel="다른 날짜 고르기"
            accessibilityState={{ expanded: at != null }}
            onPress={open}
            style={[styles.navBtn, at && { backgroundColor: withAlpha(c.ink, 0.06) }]}
          >
            <Icon name="calendar-days" size={20} color={at ? c.link : c.muted} />
          </Press>
        )}
      </View>
      {at ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setAt(null)}>
          <Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={() => setAt(null)} />
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[styles.pop, { top: at.top, bottom: at.bottom, right: at.right, backgroundColor: c.card, borderColor: c.line, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }]}
          >
            <MiniCalendar
              value={date}
              today={today}
              min={min}
              max={today}
              marked={marked}
              onPick={(d) => {
                setAt(null);
                if (d !== date) onPick(d);
              }}
            />
          </Animated.View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '500', paddingBottom: 4 },
  cellWrap: { width: '14.28%', padding: 1 },
  cell: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2 },
  field: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'transparent' },
  navBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pop: { position: 'absolute', width: 296, padding: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
});
