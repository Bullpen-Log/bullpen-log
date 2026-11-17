import { type Href, router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { recoverySummary } from '@/lib/workout/load/describe';
import { usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { outbox, outboxOwner } from './outbox';

/**
 * EX-LOAD01-R1 — 트레이닝 탭의 한 줄: 내 세트가 붙들렸거나(서버가 받지 않음 · 저장 확인 없음) 오래 못 보냈거나, 계정을 모르는 세트가 있거나(확인해야 보낸다),
 * 읽을 수 없는 기록이 있으면 '못 보낸 세트 N개 · 확인하기'로 복구 화면(/workout-recovery)에 데려간다. 웹 components/load/recovery-notice.tsx 와 같은
 * 셈. 다른 계정의 세트는 세지 않는다(그 계정으로 로그인해야 한다). 없으면 아무것도 그리지 않는다.
 */
const HOUR = 3_600_000;
const noSubscribe = () => () => {};
const hourNow = () => Math.floor(Date.now() / HOUR) * HOUR;

export function RecoveryNotice() {
  const c = usePalette();
  const rows = useSyncExternalStore(outbox.subscribe, outbox.snapshot);
  const extras = useSyncExternalStore(outbox.subscribe, outbox.extras);
  const now = useSyncExternalStore(noSubscribe, hourNow);
  const owner = outboxOwner();
  if (!owner) return null;
  const s = recoverySummary(rows, owner, now);
  const count = s.mineHeld + s.mineStale + s.unknown + extras.malformed.length + extras.corrupt.length;
  if (!count) return null;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`못 보낸 세트 ${count}개, 확인하기`}
      onPress={() => router.push('/workout-recovery' as Href)}
      style={[st.row, { backgroundColor: c.warnBg }]}
    >
      <Icon name="circle-alert" size={18} color={c.warn} />
      <View style={{ flex: 1 }}>
        <Text style={[st.bold, { color: c.ink }]}>못 보낸 세트 {count}개</Text>
        <Text style={[st.small, { color: c.muted }]}>이 폰에 남아 있어요. 확인하고 다시 보내거나 고쳐요.</Text>
      </View>
      <Icon name="chevron-right" size={18} color={c.muted} />
    </Press>
  );
}

const st = StyleSheet.create({
  row: { minHeight: 56, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
});
