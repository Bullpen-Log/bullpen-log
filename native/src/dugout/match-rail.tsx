import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { MeetupCard } from '@/app/actions/app-dugout';
import { SPACE, usePalette, useTheme } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { dotStart, railIndex } from './rail-model';

/**
 * 같이 연습 — 매치 카드 가로 넘기기(2026-10-29 확정 시안 '매치 카드 + 모임 스와이프').
 * 카드 한 장 + 다음 카드의 끝이 보이게(카드 폭 = 칸 − 22), 손을 놓으면 카드 단위로 선다(snapToOffsets · 한 번에 한 장). 자동 넘김 · 무한 돌기는 없다.
 * 고른 모임은 id 로(dugout/home-store) — 목록이 바뀌면 같은 id 의 자리로 옮겨 선다. 넘기던 손이 카드 누르기로 이어지지 않게, 넘기는 동안과 멈춘 직후 0.25초는
 * 누름을 받지 않는다(ScrollView 도 넘기기 시작하면 카드 누름을 걷는다).
 * 위치는 '2 / 6'(더 받을 게 있으면 '+') 과 점 다섯 개까지(모임이 많아도 점이 늘지 않게 지금 자리 둘레만). 한 장이면 넘김 도구를 안 그린다.
 * 벤치는 한 번 그린 그림(assets/dugout/bench.png) 하나를 모든 카드가 같이 쓴다 — 카드마다 3D 를 돌리지 않는다.
 */
const BENCH = require('../../assets/dugout/bench.png');
const GAP = 12;
const PEEK = 22;
const DOTS = 5;
/* 시안 색(dugout-preview styles.css --du-night · --du-hero-fill · --du-button) — 다크 · 네이비는 같은 짙은 판 */
const NIGHT = {
  light: { card: '#0b304e', fill: '#123e61', button: '#157fe0' },
  dark: { card: '#0b2b46', fill: '#103653', button: '#328ee0' },
} as const;
const INK = '#f4fbff';
const MUTED = '#bbd9eb';

export function MatchRail({
  items,
  selected,
  hasMore,
  onSelect,
  onOpen,
  onNearEnd,
}: {
  items: MeetupCard[];
  selected: string | null;
  hasMore: boolean;
  onSelect: (id: string) => void;
  onOpen: (m: MeetupCard, ticket: boolean) => void;
  onNearEnd: () => void;
}) {
  const reduce = useReducedMotion();
  const c = usePalette();
  const tone = NIGHT[useTheme() === 'light' ? 'light' : 'dark'];
  const [width, setWidth] = useState(0);
  const one = items.length === 1;
  const cardW = Math.max(0, width - (one ? 0 : PEEK));
  const step = cardW + GAP;
  const index = Math.max(0, items.findIndex((m) => m.id === selected));
  const ref = useRef<ScrollViewInstance>(null);
  const x = useRef(0);
  /* 넘기는 중 · 멈춘 직후 — 카드 누름을 받지 않는다 */
  const moving = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  /* 고른 모임이 지금 선 자리와 다르면(목록이 새로 왔거나 지역을 바꿈) 그 자리로 바로 옮긴다 */
  useEffect(() => {
    if (!step || moving.current) return;
    if (railIndex(x.current, step, items.length) !== index) ref.current?.scrollTo({ x: index * step, animated: false });
  }, [index, step]);
  /* 끝에서 둘째 카드에 오면 다음 장 */
  useEffect(() => {
    if (hasMore && items.length && index >= items.length - 2) onNearEnd();
  }, [hasMore, index, items.length, onNearEnd]);

  const settled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    x.current = e.nativeEvent.contentOffset.x;
    if (!step) return;
    const i = railIndex(x.current, step, items.length);
    if (items[i]) onSelect(items[i].id);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      moving.current = false;
    }, 250);
  };
  const go = (i: number) => {
    const to = Math.min(items.length - 1, Math.max(0, i));
    if (!items[to]) return;
    ref.current?.scrollTo({ x: to * step, animated: !reduce });
    x.current = to * step;
    onSelect(items[to].id);
  };
  const open = (m: MeetupCard, ticket: boolean) => {
    if (moving.current) return;
    onOpen(m, ticket);
  };

  const n = items.length;
  const from = dotStart(index, n, DOTS);
  const dots = items.slice(from, from + DOTS);

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width ? (
          <ScrollView
            ref={ref}
            horizontal
            accessibilityLabel="다가오는 같이 연습 모임"
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!one}
            snapToOffsets={items.map((_, i) => i * step)}
            snapToEnd={false}
            decelerationRate="fast"
            disableIntervalMomentum
            style={{ marginHorizontal: -SPACE.side }}
            contentContainerStyle={{ paddingHorizontal: SPACE.side, gap: GAP }}
            scrollEventThrottle={32}
            onScroll={(e) => {
              x.current = e.nativeEvent.contentOffset.x;
            }}
            onScrollBeginDrag={() => {
              clearTimeout(settle.current);
              moving.current = true;
            }}
            onScrollEndDrag={(e) => {
              /* 놓을 때 빠르기가 없으면 멈춤 끝 알림이 안 온다 — 여기서 정한다 */
              if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) settled(e);
            }}
            onMomentumScrollEnd={settled}
          >
            {items.map((m, i) => (
              <Card key={m.id} m={m} i={i} n={n} width={cardW} tone={tone} onOpen={open} />
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: 330 }} />
        )}
      </View>
      {one ? null : (
        <View style={st.controls}>
          <View style={st.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {dots.map((m) => {
              const on = m.id === items[index]?.id;
              return (
                <Press key={m.id} onPress={() => go(items.indexOf(m))} hitSlop={{ top: 4, bottom: 4 }} style={st.dot}>
                  <View style={[st.dotMark, { backgroundColor: on ? c.link : c.line }, on && { width: 15 }]} />
                </Press>
              );
            })}
          </View>
          <Text style={[st.position, { color: c.muted }]} accessibilityLiveRegion="polite" accessibilityLabel={`${n}개 중 ${index + 1}번째 모임`}>
            {`${index + 1} / ${n}${hasMore ? '+' : ''}`}
          </Text>
          <Press accessibilityRole="button" accessibilityLabel="이전 모임" accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => go(index - 1)} style={st.arrow}>
            <Arrow dir="left" off={index === 0} color={c.link} face={c.card} />
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="다음 모임"
            accessibilityState={{ disabled: index >= n - 1 }}
            disabled={index >= n - 1}
            onPress={() => go(index + 1)}
            style={st.arrow}
          >
            <Arrow dir="right" off={index >= n - 1} color={c.link} face={c.card} />
          </Press>
        </View>
      )}
    </View>
  );
}

function Arrow({ dir, off, color, face }: { dir: 'left' | 'right'; off: boolean; color: string; face: string }) {
  return (
    <View style={[st.arrowFace, { backgroundColor: face, opacity: off ? 0.4 : 1 }]}>
      <Icon name={dir === 'left' ? 'chevron-left' : 'chevron-right'} size={18} color={color} />
    </View>
  );
}

/** 모임 카드 한 장 — 날짜 · 벤치 · 종류(마감이면 '모집 마감') → 이름 · 때 · 곳 → 인원 · 남은 자리 → 모임 보기(참가 중이면 내 참가 티켓) */
function Card({
  m,
  i,
  n,
  width,
  tone,
  onOpen,
}: {
  m: MeetupCard;
  i: number;
  n: number;
  width: number;
  tone: (typeof NIGHT)['light' | 'dark'];
  onOpen: (m: MeetupCard, ticket: boolean) => void;
}) {
  const closed = m.state !== 'open';
  const people = m.capacity ? `${m.joins} / ${m.capacity}명` : `${m.joins}명 참가`;
  const right = m.joined ? '참가 중' : m.mine ? '내가 연 모임' : closed ? m.stateLabel : m.seats != null ? `${m.seats}자리 남음` : null;
  const where = m.place ?? m.area;
  /* 화면 읽기는 카드 단추 하나로 — 그 이름에 카드 내용을 모두 담는다 */
  const summary = `${n}개 중 ${i + 1}번째 모임, ${m.title}, ${m.month}월 ${m.day}일 ${m.weekday} ${m.time}${where ? `, ${where}` : ''}, ${people}${right ? `, ${right}` : ''}`;
  return (
    <View style={[st.card, { width, backgroundColor: tone.card }]}>
      <Press accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onPress={() => onOpen(m, false)} style={st.top}>
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id={`du-${m.id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={tone.fill} />
              <Stop offset="1" stopColor={tone.card} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#du-${m.id})`} />
        </Svg>
        <View style={st.calendar}>
          <Text style={st.calSmall}>{`${m.month}월`}</Text>
          <Text style={st.calDay}>{m.day}</Text>
          <Text style={st.calSmall}>{m.weekday}</Text>
        </View>
        <View pointerEvents="none" style={st.scene}>
          <Image source={BENCH} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityIgnoresInvertColors />
        </View>
        <Text style={st.kind}>{closed && !m.joined ? m.stateLabel : m.kind}</Text>
      </Press>
      <View style={st.copy}>
        <Text style={st.title} numberOfLines={2}>
          {m.title}
        </Text>
        <Text style={st.line} numberOfLines={2}>
          {[m.time, where].filter(Boolean).join(' · ')}
        </Text>
        <View style={st.people}>
          <Icon name="people" size={16} color={MUTED} />
          <Text style={st.peopleText}>{people}</Text>
          {right ? <Text style={[st.peopleText, { marginLeft: 'auto' }]}>{right}</Text> : null}
        </View>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`${summary}. ${m.joined ? '내 참가 티켓' : '모임 보기'}`}
          onPress={() => onOpen(m, m.joined)}
          style={[st.cta, { backgroundColor: tone.button }]}
        >
          <Text style={st.ctaText}>{m.joined ? '내 참가 티켓' : '모임 보기'}</Text>
          <Icon name={m.joined ? 'ticket' : 'arrow-up-right'} size={18} color="#ffffff" />
        </Press>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 26, overflow: 'hidden' },
  top: { minHeight: 157, paddingTop: 19, paddingHorizontal: 19 },
  calendar: { width: 64, alignItems: 'center', gap: 1, paddingTop: 10, paddingBottom: 9, borderRadius: 17, backgroundColor: 'rgba(244,251,255,0.1)', zIndex: 2 },
  calSmall: { color: MUTED, fontSize: 11 },
  calDay: { color: INK, fontSize: 40, lineHeight: 46, fontWeight: '600', letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
  scene: { position: 'absolute', right: -7, top: -1, width: '79%', height: 174 },
  kind: { position: 'absolute', top: 19, right: 18, color: MUTED, fontSize: 12, zIndex: 2 },
  copy: { paddingTop: 5, paddingHorizontal: 19, paddingBottom: 18, flexGrow: 1 },
  title: { color: INK, fontSize: 22, lineHeight: 30, fontWeight: '600', letterSpacing: -0.6, marginBottom: 6 },
  line: { color: MUTED, fontSize: 13, lineHeight: 18 },
  people: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, marginTop: 3, marginBottom: 7 },
  peopleText: { color: MUTED, fontSize: 13 },
  cta: { minHeight: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 'auto' },
  ctaText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginTop: 8 },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dot: { minWidth: 24, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  dotMark: { width: 5, height: 5, borderRadius: 3 },
  position: { marginLeft: 'auto', marginRight: 6, fontSize: 13, fontVariant: ['tabular-nums'] },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowFace: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
