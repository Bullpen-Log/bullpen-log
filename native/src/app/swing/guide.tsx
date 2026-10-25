import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LAB_MAX_VIDEO_MB, type LabHand } from '@/lib/pitch-lab-meta';
import {
  SWING_GUIDE_MOVE_NOTE,
  SWING_GUIDE_POINTS,
  SWING_GUIDE_SECTION_NAME,
  swingForHand,
  swingGuideUploadPoints,
  type SwingGuideSection,
} from '@/lib/swing-lab-meta';
import { Bar, s } from '~/community/parts';
import { Points, SwingChecklist, SwingPlaceArt } from '~/swing/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 3D 스윙 분석 촬영 안내(앱) — 웹 /hitting/lab/guide 와 같은 글(lib/swing-lab-meta.ts SWING_GUIDE_*). 투구 안내(app/lab/guide.tsx)와 같은 짜임.
 * ?hand=L 이면 좌타 기준(1루 ↔ 3루).
 */
export default function SwingGuideScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { hand: handParam } = useLocalSearchParams<{ hand?: string }>();
  const hand: LabHand = handParam === 'L' ? 'L' : 'R';
  const section = (id: SwingGuideSection, children: ReactNode) => (
    <View key={id} style={{ borderRadius: 14, padding: 14, gap: 12, backgroundColor: c.card, boxShadow: c.float }}>
      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>{SWING_GUIDE_SECTION_NAME[id]}</Text>
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="3D 스윙" title="촬영 안내" c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>이대로 찍으면 3D 가 가장 정확해요.</Text>
        {section('checklist', <SwingChecklist hand={hand} c={c} />)}
        {section(
          'place',
          <>
            <SwingPlaceArt hand={hand} c={c} />
            <Points items={SWING_GUIDE_POINTS.place.map((t) => swingForHand(t, hand))} c={c} />
          </>
        )}
        {section('frame', <Points items={SWING_GUIDE_POINTS.frame} c={c} />)}
        {section('phone', <Points items={SWING_GUIDE_POINTS.phone} c={c} />)}
        {section(
          'steps',
          <View style={{ gap: 10 }}>
            {SWING_GUIDE_POINTS.steps.map((text, i) => (
              <View key={text} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.action }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, color: c.ink, fontSize: 15, lineHeight: 22, paddingTop: 1 }}>{text}</Text>
              </View>
            ))}
          </View>
        )}
        {section(
          'move',
          <>
            <Points items={SWING_GUIDE_POINTS.move} c={c} />
            <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22, borderRadius: 12, padding: 12, backgroundColor: c.page }}>{SWING_GUIDE_MOVE_NOTE}</Text>
          </>
        )}
        {section('upload', <Points items={swingGuideUploadPoints(LAB_MAX_VIDEO_MB)} c={c} />)}
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={[s.primary, { backgroundColor: c.action }]}>
          <Text style={s.primaryText}>돌아가기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
