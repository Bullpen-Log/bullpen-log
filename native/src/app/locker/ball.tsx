import * as Haptics from 'expo-haptics';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { SinkerBall } from '~/home/ball/ball';
import { THREAD_COLORS, THREAD_NAMES, type ThreadIndex } from '~/home/ball/geometry';
import { setThread, useLocker } from '~/home/locker-store';
import { SheetHead } from '~/home/sheet-head';

/**
 * 내 공 꾸미기(시트) — 승인 시안의 locker-ball: 홈 히어로와 같은 공을 돌려 보고 실밥 색(레드 · 블루 · 네이비)을 고른다.
 * 고르는 즉시 이 폰의 라커에 남고(계정마다) 홈의 공도 같은 색이 된다 — 시트를 닫아도 · 앱을 다시 켜도.
 * 시안은 홈의 캔버스 하나를 시트로 옮겼다 돌려놓았다(빈 캔버스 · 회전 멈춤이 생길 수 있는 길) — 앱은 같은 그림 부품을 하나 더 그린다(새 엔진 없음).
 */
export default function LockerBallSheet() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { locker, ready } = useLocker();
  const pick = (i: ThreadIndex) => {
    if (i === locker.thread) return;
    void Haptics.selectionAsync();
    setThread(i);
  };
  return (
    <ScrollView style={{ backgroundColor: c.card }} contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 24, gap: 14 }}>
      <SheetHead c={c} title="내 공 꾸미기" />
      <View style={[styles.stage, { backgroundColor: c.page }]}>
        <SinkerBall interactive label="내 공 돌려 보기" size={[260, 224]} radius={82} center={[130, 104]} thread={locker.thread} shadowOpacity={0.14} />
      </View>
      <Text style={[styles.label, { color: c.muted }]}>실밥 색</Text>
      <View style={styles.picker} accessibilityRole="radiogroup">
        {THREAD_NAMES.map((name, i) => {
          const on = locker.thread === i;
          return (
            <Press
              key={name}
              select
              selected={on}
              disabled={!ready}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: !ready }}
              accessibilityLabel={`실밥 ${name}`}
              onPress={() => pick(i as ThreadIndex)}
              style={[styles.choice, { backgroundColor: on ? c.skyTint : c.page, borderColor: on ? c.link : 'transparent' }]}
            >
              <View style={[styles.swatch, { backgroundColor: THREAD_COLORS[i] }]} />
              <Text style={[styles.choiceText, { color: on ? c.link : c.ink, fontWeight: on ? '600' : '400' }]}>{name}</Text>
            </Press>
          );
        })}
      </View>
      <Text style={[styles.note, { color: c.muted }]}>이 폰에만 저장돼요.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stage: { height: 224, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: { fontSize: 14 },
  picker: { flexDirection: 'row', gap: 9 },
  choice: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  swatch: { width: 15, height: 15, borderRadius: 8 },
  choiceText: { fontSize: 14 },
  note: { fontSize: 12, textAlign: 'center' },
});
