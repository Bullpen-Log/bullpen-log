import * as Haptics from 'expo-haptics';
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

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
      renderRightActions={(progress) => (
        <Actions progress={progress} width={ACTION_W * actions.length}>
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
        </Actions>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

/**
 * 단추 칸은 줄 뒤에 깔려 있다(ReanimatedSwipeable 이 absoluteFill 로 둔다) — 줄 바탕이 반투명(체크한 줄의 옅은 하늘색)이면 밀지 않아도 주황 · 빨강
 * 단추가 비쳐 겹쳐 보였다(2026-10-20 김민). 밀기 시작할 때만 보이게 한다.
 */
function Actions({ progress, width, children }: { progress: SharedValue<number>; width: number; children: ReactNode }) {
  const shown = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? 1 : 0 }));
  return <Animated.View style={[styles.actions, { width }, shown]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  label: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
