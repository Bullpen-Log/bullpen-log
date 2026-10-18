import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { usePalette } from '~/lib/ui';
import type { HomeRing } from './api';

/**
 * 홈 맨 위 링 넷(웹 app/(app)/today/today-rings.tsx 와 같은 숫자 — lib/report/home-today.ts). 한 만큼 차고, 다 차면 가운데가 파랗게 차며 체크.
 * 색은 하나(sky — 링마다 색을 달리하면 구별이 안 된다는 사용자 규칙).
 */
const ICON: Record<HomeRing['key'], SFSymbol> = {
  checkin: 'heart.text.square',
  pitch: 'baseball',
  training: 'dumbbell',
  nutrition: 'fork.knife',
};
const SIZE = 64;
const R = 27;
const LEN = 2 * Math.PI * R;

export function RingsCard({ rings, onPress }: { rings: HomeRing[]; onPress: (ring: HomeRing) => void }) {
  const c = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      {rings.map((it) => {
        const v = Math.min(1, Math.max(0, it.value));
        const full = v >= 1;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={`${it.label} ${it.caption}`}
            onPress={() => onPress(it)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.ring}>
              <Svg width={SIZE} height={SIZE} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
                <Circle cx={32} cy={32} r={R} fill="none" strokeWidth={7} stroke={c.line} />
                {v > 0 ? (
                  <Circle
                    cx={32}
                    cy={32}
                    r={R}
                    fill="none"
                    strokeWidth={7}
                    stroke={c.sky}
                    strokeLinecap="round"
                    strokeDasharray={`${LEN} ${LEN}`}
                    strokeDashoffset={LEN * (1 - v)}
                    transform="rotate(-90 32 32)"
                  />
                ) : null}
              </Svg>
              {full ? (
                <View style={[styles.done, { backgroundColor: c.sky }]}>
                  <SymbolView name="checkmark" size={18} tintColor="#fff" weight="bold" />
                </View>
              ) : (
                <SymbolView name={ICON[it.key]} size={20} tintColor={c.muted} />
              )}
            </View>
            <Text style={[styles.label, { color: c.ink }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 8 },
  item: { flex: 1, alignItems: 'center', gap: 8 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  done: { position: 'absolute', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
});
