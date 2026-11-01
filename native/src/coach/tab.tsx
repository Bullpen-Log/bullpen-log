import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';
import { COACH_POINTS } from '@/lib/coach-intro';
import { loadMe } from '~/pitch/api';
import { READABLE_WIDE } from '~/lib/layout';
import { SPACE, SURFACE, TYPE, usePalette } from '~/lib/ui';
import { PageHead, SectionHead } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { MenuButton } from '~/shell/menu-button';
import { Press } from '~/shell/press';
import { pushOpen } from '~/shell/release';

/**
 * 코치 소개(2026-11-01, docs/designs/ai-coach.md U13) — 유료가 아닌 사람이 코치 탭 · 분석 화면을 열면. 결제 안내 · 밖 링크는 두지 않는다(애플 심사).
 * 웹 app/(app)/coach/coach-intro.tsx 와 같은 글(lib/coach-intro.ts).
 */
export function CoachIntro() {
  const c = usePalette();
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Icon name="clipboard-list" size={28} color={c.ink} />
      <Text style={[TYPE.card, { color: c.ink }]}>내 상태에 맞춰 한 주 운동을 짜고 매일 고쳐 주는 코치예요.</Text>
      <View style={{ gap: 6 }}>
        {COACH_POINTS.map((p) => (
          <Text key={p} style={[TYPE.body, { color: c.muted }]}>
            {p}
          </Text>
        ))}
      </View>
      <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>유료 요금제 전용이에요.</Text>
    </View>
  );
}

/** 코치 탭의 껍데기 주소 — 앱 화면만(웹 /coach 는 PC 분석 · 소개라 앱이 웹으로 안 보낸다, app/index.tsx pressTab) */
export const COACH_PATH = '/coach';

const REVIEWS = [
  { view: 'pitch', label: '투구 분석' },
  { view: 'training', label: '트레이닝 분석' },
] as const;

/**
 * 코치 탭(하단 탭 둘째, docs/designs/ai-coach.md 10-1) — 1단계는 무료면 소개, 유료면 리뷰(지금 분석 화면 둘로 가는 길) + '자동 일정은 곧' 한 줄.
 * 출시 전 베타의 잠김은 껍데기가 막는다(탭 막대 자물쇠 — app/index.tsx). 유료는 서버가 정한다(loadAppMe 의 coachPaid ← lib/coach-access.ts).
 * ponytail: 리뷰는 분석 화면을 탭 안에 옮겨 담지 않고 그 화면을 연다 — 자동 일정(3단계)이 들어올 때 탭 본문을 다시 짠다.
 */
export function CoachMainTab({ bottom }: { bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  /* null = 아직 모름(소개를 먼저 그렸다 바꾸면 유료 사용자에게 소개가 번쩍인다) */
  const [paid, setPaid] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    loadMe().then(
      (me) => alive && setPaid(me.coachPaid === true),
      () => alive && setPaid(false)
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[
        { paddingTop: inset.top + SPACE.section, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: SPACE.gap },
        READABLE_WIDE,
      ]}
    >
      <PageHead title="코치">
        <MenuButton />
      </PageHead>
      {paid === false ? <CoachIntro /> : null}
      {paid ? (
        <>
          <Text style={[TYPE.body, { color: c.muted }]}>자동 일정은 곧 열려요.</Text>
          <SectionHead title="리뷰" />
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            {REVIEWS.map((r, i) => (
              <Press
                key={r.view}
                accessibilityRole="link"
                onPress={() => pushOpen(`/analysis?view=${r.view}` as Href)}
                style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
              >
                <Icon name="chart-no-axes-column" size={20} color={c.link} />
                <Text style={[TYPE.card, { flex: 1, color: c.ink }]}>{r.label}</Text>
                <Icon name="chevron-right" size={18} color={c.muted} />
              </Press>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
});
