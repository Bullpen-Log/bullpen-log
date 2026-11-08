import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { programChoiceList } from '@/lib/program/program';
import { READABLE } from '~/lib/layout';
import { SPACE, TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { FlowBar } from '~/videos/flow-parts';
import { Cover, weeksText } from './program-cards';

/** 진행 중 프로그램·오늘 일정과 독립된 둘러보기. 시작 가능 여부는 기존 상세가 판정한다. */
export function ProgramBrowser() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const two = width >= 600 && (width - SPACE.gap) / 2 >= 280 * Math.max(1, fontScale);
  return (
    <View style={{ flex: 1, paddingTop: inset.top, backgroundColor: c.page }}>
      <FlowBar title="프로그램" onBack={() => router.canGoBack() ? router.back() : router.replace('/')} />
      <ScrollView contentContainerStyle={[{ padding: SPACE.side, paddingBottom: Math.max(40, inset.bottom + 24) }, READABLE]}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={s.grid}>
          {programChoiceList().map((p) => (
            <Press key={p.id} card accessibilityRole="button" accessibilityLabel={`${p.name}, ${weeksText(p)}, 상세 보기`}
              onPress={() => router.push(`/training/program/${p.id}` as Href)}
              style={[s.card, { width: two ? (width - SPACE.gap) / 2 : '100%', backgroundColor: c.card, boxShadow: c.float }]}>
              <Cover p={p} c={c} active={false} />
              <View style={s.copy}>
                <Text style={[TYPE.section, { color: c.ink }]}>{p.name}</Text>
                <Text style={[TYPE.sub, { color: c.muted }]}>{weeksText(p)}</Text>
                <Text style={[TYPE.body, { color: c.muted }]}>{p.summary}</Text>
              </View>
            </Press>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.gap },
  card: { borderRadius: 24, overflow: 'hidden' },
  copy: { padding: 18, gap: 6 },
});
