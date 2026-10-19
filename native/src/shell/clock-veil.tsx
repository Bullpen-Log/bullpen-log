import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { usePalette } from '~/lib/ui';

/**
 * 시계 자리 막 — 웹 globals.css '[data-top-veil]'(막대가 없는 탭: 투구 · 트레이닝 · 영양). 굴린 본문이 시계 · 배터리 밑으로
 * 그대로 지나가지 않게 시계 자리를 바탕색으로 덮고, 밑 16px 동안 옅어진다. 웹은 흐림 + 30% 지만 앱은 흐림이 없어 바탕색을 진하게(92%).
 */
export function ClockVeil() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.wrap, { height: inset.top + 16 }]}>
      <View style={{ height: inset.top, backgroundColor: c.page, opacity: 0.92 }} />
      <Svg width="100%" height={16}>
        <Defs>
          <LinearGradient id="clockVeil" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.page} stopOpacity={0.92} />
            <Stop offset="1" stopColor={c.page} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="16" fill="url(#clockVeil)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0 },
});
