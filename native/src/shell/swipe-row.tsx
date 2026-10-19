import * as Haptics from 'expo-haptics';
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

/**
 * 밀어서 하기 — 줄을 왼쪽으로 밀면 오른쪽에서 단추(즐겨찾기 · 빼기 …)가 나온다. 웹 components/swipe-row.tsx 와 같은 쓰임(아이폰 메일 · 설정 목록처럼).
 * 한 번에 한 줄만 열린다 — 다른 줄을 밀면 앞 줄이 닫힌다. 단추를 누르면 닫히고 그 일을 한다.
 * 뿌리 레이아웃(app/_layout.tsx)이 GestureHandlerRootView 로 감싸 둬야 돈다.
 */
export type SwipeAction = { label: string; color: string; onPress: () => void };

let openRow: SwipeableMethods | null = null;
const ACTION_W = 80;

export function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const me = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={me}
      friction={2}
      overshootRight={false}
      rightThreshold={ACTION_W / 2}
      onSwipeableWillOpen={() => {
        if (openRow && openRow !== me.current) openRow.close();
        openRow = me.current;
        void Haptics.selectionAsync();
      }}
      onSwipeableClose={() => {
        if (openRow === me.current) openRow = null;
      }}
      renderRightActions={() => (
        <View style={[styles.actions, { width: ACTION_W * actions.length }]}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              onPress={() => {
                me.current?.close();
                a.onPress();
              }}
              style={({ pressed }) => [styles.action, { backgroundColor: a.color }, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.label} numberOfLines={2}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  label: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
