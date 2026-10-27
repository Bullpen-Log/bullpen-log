import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/** 홈 시트(내 라커 · 전체 기록)의 머리 — 알림 시트(app/notice.tsx)와 같은 꼴: 제목 + 오른쪽 닫기 ✕(44) */
export function SheetHead({ c, title, onClose = () => router.back() }: { c: Palette; title: string; onClose?: () => void }) {
  return (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        onPress={onClose}
        hitSlop={6}
        style={({ pressed }) => [styles.close, { backgroundColor: c.chip }, pressed && { opacity: 0.55 }]}
      >
        <Icon name="x" size={18} color={c.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  title: { fontSize: 21, fontWeight: '700', letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
