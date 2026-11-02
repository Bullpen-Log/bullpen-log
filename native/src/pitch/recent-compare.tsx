import { type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useCompareStore } from '~/compare/store';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { pushOpen } from '~/shell/release';

/**
 * 투구 탭 도크 밑 '최근 비교'(R01) — 한두 줄만. 누르면 저장한 그대로(멈춘 채, 맞춘 기준 · 속도 · 그림) 다시 연다.
 * 없으면 아무것도 안 그린다(빈 안내 카드를 쌓지 않는다). 이 기기에 저장한 비교만 — 클라우드 백업은 아직 없다.
 */
export function RecentComparisons() {
  const c = usePalette();
  const { recent } = useCompareStore();
  const rows = (recent ?? []).slice(0, 2);
  if (!rows.length) return null;
  return (
    <View style={styles.wrap} accessibilityRole="list" accessibilityLabel="최근 비교">
      {rows.map((r) => (
        <Press
          key={r.id}
          accessibilityRole="button"
          accessibilityLabel={`최근 비교 ${r.title}, ${r.aligned ? '기준 맞춤' : '기준 맞추기 전'}, 열기`}
          onPress={() => pushOpen({ pathname: '/pitch/compare' as Href as never, params: { doc: r.id, src: 'pitch' } })}
          style={[styles.row, { backgroundColor: c.card, boxShadow: c.float }]}
        >
          <Icon name="film" size={18} color={c.link} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[TYPE.buttonCompact, { color: c.ink }]}>
              {r.title}
            </Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
              {[r.labels.join(' · ') || null, r.aligned ? '기준 맞춤' : '기준 맞추기 전'].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={c.muted} />
        </Press>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
});
