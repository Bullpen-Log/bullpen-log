import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';

/**
 * 제목 밑 날짜 띠 — 최근 날들을 옆으로 굴리는 한 줄(웹 components/date-scroll-strip.tsx, 영양 · 트레이닝 공용).
 * 고른 날을 가운데로 굴려 둔다(오늘이면 오른쪽 끝). 달이 바뀌는 1일은 요일 대신 'N월'. 양끝이 옅어져 더 있다는 게 보인다.
 * 오늘은 파란 테두리 + 굵은 숫자, 고른 날은 파란 채움. 칸 밑 표시(mark)는 부르는 쪽이 그린다 — 영양은 먹은 양 막대.
 * end = 띠 오른쪽 끝(달력 그림 등).
 */
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const CELL = 44;
const GAP = 4;
const PAD = 12;

export function DateStrip({
  days,
  date,
  today,
  onPick,
  labelOf,
  mark,
  end,
}: {
  /** 띠의 날들(오래된 → 최근) */
  days: string[];
  date: string;
  today: string;
  onPick: (day: string) => void;
  /** 화면 읽기가 읽을 그날 한 줄 */
  labelOf?: (day: string) => string;
  mark?: (day: string, selected: boolean) => ReactNode;
  end?: ReactNode;
}) {
  const c = usePalette();
  const ref = useRef<ScrollViewInstance>(null);
  const [w, setW] = useState(0);
  const at = days.indexOf(date);
  /* 고른 날을 가운데로 — 처음엔 움직임 없이, 고른 날이 바뀌면 부드럽게 */
  const first = useRef(true);
  useEffect(() => {
    if (!w || at < 0) return;
    const x = PAD + at * (CELL + GAP) - (w - CELL) / 2;
    ref.current?.scrollTo({ x: Math.max(0, x), animated: !first.current });
    first.current = false;
  }, [w, at]);

  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={ref}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP }}
          accessibilityLabel="날짜"
        >
          {days.map((d) => {
            const selected = d === date;
            const isToday = d === today;
            const [, m, dayNo] = d.split('-').map(Number);
            const weekday = WEEKDAY[new Date(`${d}T00:00:00.000Z`).getUTCDay()];
            return (
              <Press
                key={d}
                select
                selected={selected}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${m}월 ${dayNo}일 ${weekday}요일${labelOf ? `, ${labelOf(d)}` : ''}`}
                onPress={() => {
                  if (selected) return;
                  void Haptics.selectionAsync();
                  onPick(d);
                }}
                style={[
                  styles.cell,
                  selected
                    ? { backgroundColor: c.action, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                    : isToday
                      ? { borderWidth: 1.5, borderColor: c.sky }
                      : null,
                ]}
              >
                <Text style={{ fontSize: 11, color: selected ? 'rgba(255,255,255,0.8)' : dayNo === 1 ? c.link : c.muted, fontWeight: dayNo === 1 ? '600' : '400' }}>
                  {dayNo === 1 ? `${m}월` : weekday}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: isToday || selected ? '700' : '600', color: selected ? '#fff' : isToday ? c.link : c.ink, fontVariant: ['tabular-nums'] }}>
                  {dayNo}
                </Text>
                {mark?.(d, selected)}
              </Press>
            );
          })}
        </ScrollView>
        {/* 양끝 옅어짐 — 더 있다는 표시(웹 mask-image 12px) */}
        <Fade color={c.page} side="left" />
        <Fade color={c.page} side="right" />
      </View>
      {end ? <View style={{ justifyContent: 'center' }}>{end}</View> : null}
    </View>
  );
}

function Fade({ color, side }: { color: string; side: 'left' | 'right' }) {
  const id = `fade-${side}`;
  return (
    <Svg pointerEvents="none" style={[styles.fade, side === 'left' ? { left: 0 } : { right: 0 }]}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={side === 'left' ? 1 : 0} />
          <Stop offset="1" stopColor={color} stopOpacity={side === 'left' ? 0 : 1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** 영양 띠의 칸 밑 막대 — 그날 먹은 / 목표(넘치면 경고색, 고른 칸이면 흰색) */
export function StripBar({ pct, over, selected }: { pct: number; over: boolean; selected: boolean }) {
  const c = usePalette();
  return (
    <View style={[styles.bar, { backgroundColor: selected ? 'rgba(255,255,255,0.3)' : c.line }]}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 2, backgroundColor: selected ? '#fff' : over ? c.warn : c.sky }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  cell: { width: CELL, alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 12 },
  bar: { marginTop: 4, height: 4, width: 24, borderRadius: 2, overflow: 'hidden' },
});
