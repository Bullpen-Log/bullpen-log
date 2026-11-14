import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { GOAL_LABELS, programChoiceList, type ProgramChoice } from '@/lib/program/program';
import type { ProgramShelf } from '@/lib/report/training-home-data';
import { SPACE, usePalette, useTheme, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 트레이닝 탭 '프로그램' — 옆으로 넘기는 큰 커버 카드(2026-10-29 확정 디자인). 다음 카드가 조금 보이고 카드 폭마다 멈춘다, 밑에 위치 점 · 'n / N' ·
 * 이전 · 다음 단추(손가락 말고도 넘기게). 목록 · 자격은 서버(lib/report/training-home-data.ts programShelfData), 글은 프로그램 정의(lib/program/program.ts) 그대로 —
 * 기간 · 빈도 · 한 줄 설명을 시안 글로 박지 않는다. 카드를 누르면 프로그램 상세(/training/program/[id] — 시작 준비 · 오늘 운동은 거기서).
 * 스크롤로 넘기다 손을 뗀 것은 누름이 아니다(ScrollView 가 응답을 가져간다).
 */
const GAP = 12;
/* 탭 화면의 옆 여백(SPACE.side) — 카드 줄만 화면 끝까지 */
const BLEED = SPACE.side;

export const weeksText = (p: ProgramChoice) =>
  `${p.weeks.length}주 · 주 ${p.perWeek.length > 1 ? `${Math.min(...p.perWeek)}–${Math.max(...p.perWeek)}` : p.perWeek[0]}회`;

export function ProgramCards({ shelf }: { shelf: ProgramShelf; today: string }) {
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
  /*
   * 카드 → 프로그램 상세(2026-10-30 확정 시안 01). 진행 중 · 다른 프로그램 진행 중 · 오늘 일정이 있는 날도 설명은 볼 수 있다 — 시작할 수 있는지는
   * 상세의 아래 단추가 서버 판정으로 가른다(예전엔 여기서 알림 한 줄로 끝나 설명을 못 봤다). 상세를 열기만 해서는 아무것도 저장하지 않는다.
   */
  const open = (id: string) => {
    void Haptics.selectionAsync();
    router.push(`/training/program/${id}` as Href);
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
          onPress={() => router.push('/training/programs' as Href)}
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
                  <Text numberOfLines={2} lineBreakStrategyIOS="hangul-word" style={[styles.name, { color: c.ink }]}>
                    {p.name}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>{weeksText(p)}</Text>
                  <Text numberOfLines={2} lineBreakStrategyIOS="hangul-word" style={{ color: blocked ? c.muted : c.link, fontSize: 13 }}>
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

const PROGRAM_COVERS = {
  'stronglifts-5x5': require('../../assets/program-covers/stronglifts-5x5.webp'),
  '531': require('../../assets/program-covers/531.webp'),
  'juggernaut-5s': require('../../assets/program-covers/juggernaut-5s.webp'),
  ws4sb: require('../../assets/program-covers/ws4sb.webp'),
  'pitcher-power': require('../../assets/program-covers/pitcher-power.webp'),
  'basics-4w': require('../../assets/program-covers/basics-4w.webp'),
} satisfies Record<Exclude<ProgramChoice['id'], 'offseason-strength-power'>, number>;

/** 프로그램 목록 · 상세 공통. 표지에는 그림만 넣고 목표와 진행 상태는 앱 글자로 읽는다. */
export function Cover({ p, c, active }: { p: ProgramChoice; c: Palette; active: boolean }) {
  const dark = useTheme() !== 'light';
  const source = p.id === 'offseason-strength-power' ? undefined : PROGRAM_COVERS[p.id];
  return (
    <View style={[styles.cover, { backgroundColor: dark ? '#123049' : '#e3effb' }]}>
      {source ? (
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          pointerEvents="none"
          source={source}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.art]} pointerEvents="none">
          <Svg width={150} height={104} viewBox="0 0 150 104" accessible={false}>
            <Rect x="28" y="66" width="32" height="28" rx="9" fill={c.skyStrong} opacity={0.7} />
            <Rect x="60" y="44" width="32" height="50" rx="9" fill={c.skyStrong} opacity={0.85} />
            <Rect x="92" y="20" width="32" height="74" rx="9" fill={c.skyStrong} />
          </Svg>
        </View>
      )}
      <View style={styles.coverTop}>
        <View style={[styles.badge, { backgroundColor: c.skyTint }]}>
          <Text style={[styles.badgeText, { color: c.skyStrong }]}>{GOAL_LABELS[p.goal]}</Text>
        </View>
        {active ? (
          <View style={[styles.badge, { backgroundColor: c.action }]}>
            <Text style={[styles.badgeText, { color: c.onAction }]}>진행 중</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginHorizontal: 2 },
  headText: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  headBtn: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  card: { borderRadius: 24, overflow: 'hidden' },
  cover: { width: '100%', minHeight: 164, aspectRatio: 960 / 492, paddingHorizontal: 16, paddingTop: 13, overflow: 'hidden' },
  coverTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' },
  art: { alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  body: { padding: 18, gap: 5 },
  name: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  dots: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pip: { height: 6, borderRadius: 3 },
  nav: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
