import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { TYPE } from '~/lib/ui';
import { MARK_PATH } from '~/shell/mark-path';
import { Wordmark } from '~/shell/wordmark';

export function LoginHero({ compact }: { compact: boolean }) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={[styles.hero, { minHeight: compact ? 166 : 220 }]}>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="login-hero" x1="0%" y1="12%" x2="100%" y2="85%">
              <Stop offset="0" stopColor="#08243e" />
              <Stop offset="0.46" stopColor="#0b4c79" />
              <Stop offset="1" stopColor="#078ad7" />
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#login-hero)" />
        </Svg>
      </View>
      <View style={styles.brand}>
        <Wordmark size={compact ? 29 : 34} color="#ffffff" allowFontScaling={false} />
        <Text style={styles.caption}>야구 훈련과 기록</Text>
      </View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[styles.art, fontScale > 1.4 && { width: '42%' }]}>
        <Svg width="100%" height="100%" viewBox="0 0 208 190">
          <Defs>
            <RadialGradient id="login-halo">
              <Stop offset="0" stopColor="#75d0ff" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#75d0ff" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="login-ball" cx="35%" cy="24%" r="79%">
              <Stop offset="0" stopColor="#ffffff" />
              <Stop offset="0.63" stopColor="#eaf6ff" />
              <Stop offset="1" stopColor="#9cc8e8" />
            </RadialGradient>
            <LinearGradient id="login-trail" x1="0%" y1="100%" x2="100%" y2="0%">
              <Stop offset="0" stopColor="#69cfff" stopOpacity="0" />
              <Stop offset="0.62" stopColor="#b6eaff" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#e1f6ff" stopOpacity="0.42" />
            </LinearGradient>
          </Defs>
          <Circle cx="118" cy="95" r="91" fill="url(#login-halo)" />
          <Circle cx="118" cy="94" r="74" fill="none" stroke="#bbebff" opacity="0.22" />
          <Path d="M118 14v10m0 140v10M38 94h10m140 0h10" stroke="#b8e9ff" opacity="0.55" />
          <Path d="M19 157C32 179 106 157 164 107c31-27 45-57 23-60-12-2-27 2-44 9" fill="none" stroke="url(#login-trail)" strokeWidth="2" />
          <Path d="M24 171c34 1 65-14 88-31M166 64c16-7 27-9 34-6" fill="none" stroke="#a6e4ff" opacity="0.38" strokeLinecap="round" />
          <Circle cx="118" cy="98" r="57" fill="#062745" opacity="0.16" />
          <Circle cx="116" cy="92" r="55" fill="url(#login-ball)" stroke="#f1fbff" strokeWidth="0.7" />
          <G fill="none" stroke="#b84650" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M87 46c6 23-3 44-24 58m79-62c-6 27 4 50 27 65" opacity="0.65" strokeWidth="1" />
            <Path d="m83 51 5 3 6-3m-10 11 6 3 6-2m-13 10 5 4 6-1m-15 7 4 5 6 1m-16 3 3 5 6 2m55-52 5 4 6-2m-13 9 6 4 6-1m-11 9 6 4 6-2m-8 8 6 3 5-4m-5 10 6 2 4-5m0 10 6 1 3-5" strokeWidth="1.65" />
          </G>
          <G transform="translate(99 83) rotate(-11 16 16) scale(0.034)">
            <Path d={MARK_PATH} fill="#2473a6" opacity="0.8" />
          </G>
          <Path d="M28 146c18 11 74-2 116-36 24-19 37-36 43-48" fill="none" stroke="url(#login-trail)" strokeWidth="2.2" strokeLinecap="round" />
          <Circle cx="42" cy="150" r="2.5" fill="#b4ebff" />
          <Circle cx="177" cy="28" r="2" fill="#cef2ff" />
          <Path d="M54 40v12m-6-6h12m106 101v10m-5-5h10" fill="none" stroke="#c1ebff" strokeLinecap="round" opacity="0.74" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#0a3659',
    borderRadius: 32,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
  },
  brand: { flex: 1, minWidth: 0, gap: 9, paddingVertical: 20, zIndex: 1 },
  caption: { ...TYPE.body, color: '#d9f0ff' },
  art: { width: '51%', maxWidth: 230, aspectRatio: 208 / 190, marginRight: 6 },
});
