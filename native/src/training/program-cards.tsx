import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { GOAL_LABELS, programChoiceList, type ProgramChoice } from '@/lib/program/program';
import type { ProgramShelf } from '@/lib/report/training-home-data';
import { SPACE, usePalette, useTheme, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';

/**
 * 트레이닝 탭 '프로그램' — 옆으로 넘기는 큰 커버 카드(2026-10-29 확정 디자인). 다음 카드가 조금 보이고 카드 폭마다 멈춘다, 밑에 위치 점 · 'n / N' ·
 * 이전 · 다음 단추(손가락 말고도 넘기게). 목록 · 자격은 서버(lib/report/training-home-data.ts programShelfData), 글은 프로그램 정의(lib/program/program.ts) 그대로 —
 * 기간 · 빈도 · 한 줄 설명을 시안 글로 박지 않는다. 카드를 누르면 트레이닝 오늘 화면의 그 프로그램 소개(시작 시트 — 자격 · 장비 · 시작은 거기서).
 * 스크롤로 넘기다 손을 뗀 것은 누름이 아니다(ScrollView 가 응답을 가져간다).
 */
const GAP = 12;
/* 탭 화면의 옆 여백(SPACE.side) — 카드 줄만 화면 끝까지 */
const BLEED = SPACE.side;

const weeksText = (p: ProgramChoice) =>
  `${p.weeks.length}주 · 주 ${p.perWeek.length > 1 ? `${Math.min(...p.perWeek)}–${Math.max(...p.perWeek)}` : p.perWeek[0]}회`;

export function ProgramCards({ shelf, today }: { shelf: ProgramShelf; today: string }) {
  const c = usePalette();
  const all = useMemo(() => programChoiceList(), []);
  const items = shelf.items.map((it) => ({ ...it, p: all.find((p) => p.id === it.id) })).filter((x): x is typeof x & { p: ProgramChoice } => x.p != null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);
  /* 카드 폭 — 다음 카드가 46pt 쯤 보이게, 넓은 화면(아이패드)에서는 320 에서 멈춘다 */
  const cardW = width ? Math.min(320, width - 46 - GAP) : 0;
  const step = cardW + GAP;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i));
    setIndex(next);
    scroll.current?.scrollTo({ x: next * step, animated: true });
  };
  const open = (id: string) => {
    void Haptics.selectionAsync();
    if (shelf.activeId === id) return router.push({ pathname: '/training-today' as Href as never, params: { today } });
    if (shelf.activeId) return toast('지금 하는 프로그램이 있어요. 바꾸려면 그 프로그램을 먼저 그만둬요.', 'info');
    if (!shelf.canStart) return toast('오늘은 운동 일정을 만들어서, 프로그램은 내일 시작할 수 있어요.', 'info');
    router.push({ pathname: '/training-today' as Href as never, params: { today, program: id } });
  };
  if (!items.length) return null;
  return (
    <View>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.headText, { color: c.ink }]}>
          프로그램
        </Text>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`프로그램 전체 ${items.length}개 보기`}
          onPress={() =>
            shelf.activeId || !shelf.canStart
              ? router.push({ pathname: '/training-today' as Href as never, params: { today } })
              : router.push({ pathname: '/training-today' as Href as never, params: { today, program: 'all' } })
          }
          style={styles.headBtn}
        >
          <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>전체 {items.length}</Text>
          <Icon name="chevron-right" size={14} color={c.link} />
        </Press>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {cardW > 0 ? (
          <ScrollView
            ref={scroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={step}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            /* 화면 끝까지 넘어가 보이게 — 바깥 여백만큼 밖으로 펴고 안에서 다시 띄운다(페이지 전체가 옆으로 넘치지 않게) */
            style={{ marginHorizontal: -BLEED }}
            contentContainerStyle={{ gap: GAP, paddingHorizontal: BLEED }}
            onMomentumScrollEnd={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              /* 끝 카드는 왼쪽에 맞출 수 없어(뒤가 없다) 끝까지 밀었으면 마지막으로 센다 */
              const atEnd = contentOffset.x >= contentSize.width - layoutMeasurement.width - 4;
              setIndex(atEnd ? items.length - 1 : Math.round(contentOffset.x / step));
            }}
          >
            {items.map(({ id, blocked, p }, i) => (
              <Press
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${weeksText(p)}${shelf.activeId === id ? ', 진행 중' : ''}${blocked ? `, ${blocked}` : ''}, ${i + 1} / ${items.length}`}
                onPress={() => open(id)}
                style={[styles.card, { width: cardW, backgroundColor: c.card, boxShadow: c.float }]}
              >
                <Cover p={p} c={c} active={shelf.activeId === id} />
                <View style={styles.body}>
                  <Text numberOfLines={1} style={[styles.name, { color: c.ink }]}>
                    {p.name}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>{weeksText(p)}</Text>
                  <Text numberOfLines={1} style={{ color: blocked ? c.muted : c.link, fontSize: 13 }}>
                    {blocked ?? p.summary}
                  </Text>
                </View>
              </Press>
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: 268 }} />
        )}
      </View>
      <View style={styles.foot}>
        <View style={styles.dots} accessible={false}>
          {items.map((it, i) => (
            <View key={it.id} style={[styles.pip, { backgroundColor: i === index ? c.link : withAlpha(c.ink, 0.15), width: i === index ? 14 : 6 }]} />
          ))}
        </View>
        <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
          {index + 1} / {items.length}
        </Text>
        <Press accessibilityRole="button" accessibilityLabel="이전 프로그램" accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => go(index - 1)} style={[styles.nav, { backgroundColor: c.card, opacity: index === 0 ? 0.45 : 1 }]}>
          <Icon name="chevron-left" size={18} color={c.ink} />
        </Press>
        <Press
          accessibilityRole="button"
          accessibilityLabel="다음 프로그램"
          accessibilityState={{ disabled: index >= items.length - 1 }}
          disabled={index >= items.length - 1}
          onPress={() => go(index + 1)}
          style={[styles.nav, { backgroundColor: c.card, boxShadow: c.float, opacity: index >= items.length - 1 ? 0.45 : 1 }]}
        >
          <Icon name="chevron-right" size={18} color={c.ink} />
        </Press>
      </View>
    </View>
  );
}

/** 커버 — 옅은 파랑 면 위 프로그램마다 다른 소프트 솔리드 그림 하나(목표 이름은 위 작은 글) */
function Cover({ p, c, active }: { p: ProgramChoice; c: Palette; active: boolean }) {
  const dark = useTheme() !== 'light';
  return (
    <View style={[styles.cover, { backgroundColor: dark ? '#123049' : '#e3effb' }]}>
      <View style={styles.coverTop}>
        <Text style={{ color: dark ? '#9fcdf0' : '#3a6f9c', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{GOAL_LABELS[p.goal]}</Text>
        {active ? (
          <View style={[styles.badge, { backgroundColor: c.action }]}>
            <Text style={{ color: c.onAction, fontSize: 11, fontWeight: '700' }}>진행 중</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.art}>
        <CoverArt id={p.id} dark={dark} />
      </View>
    </View>
  );
}

function CoverArt({ id, dark }: { id: string; dark: boolean }) {
  const top = dark ? '#7cc3f5' : '#7ab6ea';
  const bottom = dark ? '#3b86c7' : '#3f86cf';
  const g = (
    <Defs>
      <LinearGradient id={`cv-${id}`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={top} />
        <Stop offset="1" stopColor={bottom} />
      </LinearGradient>
    </Defs>
  );
  const fill = `url(#cv-${id})`;
  const shade = dark ? 'rgba(0,0,0,0.22)' : 'rgba(20,70,120,0.12)';
  return (
    <Svg width={150} height={104} viewBox="0 0 150 104" accessible={false}>
      {g}
      {id === 'pitcher-power' ? (
        /* 올라가는 막대 셋 */
        <>
          <Rect x="34" y="62" width="26" height="34" rx="11" fill={shade} transform="translate(3 4)" />
          <Rect x="34" y="62" width="26" height="34" rx="11" fill={fill} />
          <Rect x="64" y="42" width="26" height="54" rx="11" fill={fill} />
          <Rect x="94" y="16" width="26" height="80" rx="11" fill={fill} />
        </>
      ) : id === 'stronglifts-5x5' ? (
        /* 다섯 줄 다섯 칸 */
        <>
          {Array.from({ length: 25 }, (_, i) => (
            <Circle key={i} cx={39 + (i % 5) * 18} cy={16 + Math.floor(i / 5) * 18} r={6.5} fill={fill} opacity={i % 5 < 3 ? 1 : 0.55} />
          ))}
        </>
      ) : id === '531' ? (
        /* 원판 셋(작아짐) */
        <>
          <Rect x="22" y="48" width="106" height="10" rx="5" fill={shade} />
          <Rect x="30" y="18" width="20" height="70" rx="8" fill={fill} />
          <Rect x="56" y="28" width="18" height="50" rx="8" fill={fill} opacity={0.85} />
          <Rect x="80" y="36" width="16" height="34" rx="7" fill={fill} opacity={0.7} />
        </>
      ) : id === 'juggernaut-5s' ? (
        /* 파도 넷 */
        <Path d="M14 70 C30 30 44 30 58 62 S86 94 100 50 S126 18 138 40" stroke={fill} strokeWidth={14} strokeLinecap="round" fill="none" />
      ) : id === 'ws4sb' ? (
        /* 바벨 */
        <>
          <Rect x="18" y="47" width="114" height="10" rx="5" fill={fill} opacity={0.75} />
          <Rect x="24" y="22" width="18" height="60" rx="8" fill={fill} />
          <Rect x="108" y="22" width="18" height="60" rx="8" fill={fill} />
          <Rect x="44" y="32" width="12" height="40" rx="6" fill={fill} opacity={0.85} />
          <Rect x="94" y="32" width="12" height="40" rx="6" fill={fill} opacity={0.85} />
        </>
      ) : (
        /* 기본기 — 계단 */
        <>
          <Rect x="28" y="66" width="32" height="28" rx="9" fill={fill} opacity={0.7} />
          <Rect x="60" y="44" width="32" height="50" rx="9" fill={fill} opacity={0.85} />
          <Rect x="92" y="20" width="32" height="74" rx="9" fill={fill} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginHorizontal: 2 },
  headText: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  headBtn: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  card: { borderRadius: 24, overflow: 'hidden' },
  cover: { height: 164, paddingHorizontal: 18, paddingTop: 16 },
  coverTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  body: { padding: 18, gap: 5 },
  name: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  dots: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pip: { height: 6, borderRadius: 3 },
  nav: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
