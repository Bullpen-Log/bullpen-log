import { type Href, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { SinkerBall } from './ball/ball';
import { stickerCount, useLocker } from './locker-store';

/**
 * 내 라커 — 승인 시안 '새 구성'의 셋째 구역(nl-locker): 작은 선반 셋. 위 히어로와 같은 공(실밥 색까지)을 꾸미고, 스티커를 모으고, 공을 잡는다.
 * 셋 다 시트(앱의 다른 시트와 같은 formSheet — 끌어 내리기 · 손잡이)로 연다.
 */
export function LockerRow() {
  const c = usePalette();
  const { locker } = useLocker();
  const n = stickerCount(locker);
  const go = (to: string) => router.push(to as Href);
  return (
    <View accessibilityLabel="내 라커">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.headText, { color: c.ink }]}>
          내 라커
        </Text>
        <Text style={[styles.small, { color: c.muted }]}>스티커 {n}개</Text>
      </View>
      <View style={[styles.shelf, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Press accessibilityRole="button" accessibilityLabel="내 공 꾸미기" onPress={() => go('/locker/ball')} style={styles.item}>
          <SinkerBall size={[28, 28]} radius={12.5} thread={locker.thread} shadow={false} />
          <Text style={[styles.label, { color: c.ink }]}>내 공 꾸미기</Text>
        </Press>
        <Press accessibilityRole="button" accessibilityLabel={`스티커, ${n}개 받음`} onPress={() => go('/locker/stickers')} style={styles.item}>
          <Icon name="sticker" size={24} color={c.link} strokeWidth={2.2} />
          <Text style={[styles.label, { color: c.ink }]}>스티커</Text>
        </Press>
        <Press accessibilityRole="button" accessibilityLabel="공 잡기" onPress={() => go('/locker/catch')} style={styles.item}>
          <Icon name="hand" size={24} color={c.link} strokeWidth={2.2} />
          <Text style={[styles.label, { color: c.ink }]}>공 잡기</Text>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginHorizontal: 2, marginBottom: 12 },
  headText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  small: { fontSize: 12 },
  shelf: { flexDirection: 'row', borderRadius: 21, padding: 6 },
  item: { flex: 1, minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16 },
  label: { fontSize: 12, fontWeight: '500' },
});
