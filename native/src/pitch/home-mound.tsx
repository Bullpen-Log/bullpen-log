import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { Press } from '~/shell/press';

/** 최초안의 미니 마운드. 터치할 때만 움직이며 웹뷰·WebGL·상시 렌더 루프를 만들지 않는다. */
export function PitchHomeMound() {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 5}deg` }, { translateY: -turn.value * 3 }] }));
  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateX: turn.value * 30 }, { translateY: -turn.value * 25 }, { scale: 1 + turn.value * 0.15 }] }));
  return (
    <Press accessibilityRole="button" accessibilityLabel="미니 마운드 움직여 보기" onPress={() => {
      if (!reduced) turn.value = withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 420 }));
    }} style={styles.target}>
      <Animated.View style={[styles.art, style]} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%" viewBox="0 0 200 150">
          <Defs>
            <LinearGradient id="pitch-mound-top" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#57c4f5" /><Stop offset="1" stopColor="#0875b8" /></LinearGradient>
            <LinearGradient id="pitch-mound-side" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#195a83" /><Stop offset="1" stopColor="#072b49" /></LinearGradient>
          </Defs>
          <Ellipse cx="103" cy="125" rx="75" ry="14" fill="#001b32" opacity=".25" />
          <Path d="M22 72 95 30 177 68 164 111 102 132 34 106Z" fill="url(#pitch-mound-side)" />
          <Path d="M22 62 95 20 177 58 164 101 102 122 34 96Z" fill="url(#pitch-mound-top)" />
          <Path d="M34 69 104 107 163 64M61 43 104 107 144 42" fill="none" stroke="#d4f2ff" opacity=".5" strokeWidth="1.2" />
          <Ellipse cx="100" cy="60" rx="24" ry="12" fill="#68c9ed" />
          <Path d="m88 56 21-1 6 4-21 2Z" fill="#f3fbff" />
          <Path d="m96 100 12-2 9 6-3 8-12 2-10-7Z" fill="#edf9ff" />
          {[0,1,2,3,4].map((i) => <Circle key={i} cx={49 + i * 24} cy={83 + Math.sin(i / 4 * Math.PI) * 16} r="1.7" fill="#d6f3ff" opacity=".7" />)}
        </Svg>
        <Animated.View style={[styles.ball, ballStyle]}>
          <Svg width="19" height="19" viewBox="0 0 20 20"><Circle cx="10" cy="10" r="9" fill="#f3f9fc" /><Path d="M4 3q7 7 0 14M16 3q-7 7 0 14" stroke="#c86b6e" strokeWidth="1" fill="none" strokeDasharray="2 1" /></Svg>
        </Animated.View>
      </Animated.View>
    </Press>
  );
}
const styles = StyleSheet.create({
  target: { width: '48%', height: 150, justifyContent: 'center', minWidth: 100 },
  art: { width: '100%', height: 150 },
  ball: { position: 'absolute', left: '48%', top: 43 },
});
