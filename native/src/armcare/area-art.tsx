import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { areasOf, primaryArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { SPOT_DEFS, type SpotPicture } from '@/lib/body-spots';
import type { Palette } from '~/lib/ui';

/**
 * 부위 그림 — 체크인 아픈 자리 카드와 같은 그림 · 같은 빨간 번짐(웹 components/body-spot-picker.tsx). 암케어 부위 열쇠가 체크인 자리 열쇠와 같아
 * 자리(x · y)는 lib/body-spots SPOT_DEFS 를 그대로 읽는다. 그림은 public/checkin-body 의 사본(native/assets/checkin-body) — 바꾸면 둘 다.
 * 2026-11-06 김민: 3D 근육 지도 · 근육 이름 대신 체크인과 같은 큰 부위로 단순화.
 */
const ART: Record<SpotPicture, number> = {
  front: require('../../assets/checkin-body/front.jpg'),
  back: require('../../assets/checkin-body/back.jpg'),
  'arm-inner': require('../../assets/checkin-body/arm-inner.jpg'),
  'arm-outer': require('../../assets/checkin-body/arm-outer.jpg'),
  'arm-back': require('../../assets/checkin-body/arm-back.jpg'),
  'legs-front': require('../../assets/checkin-body/legs-front.jpg'),
  'legs-back': require('../../assets/checkin-body/legs-back.jpg'),
};

export function AreaArt({ area, size, radius = 16 }: { area: ArmcareAreaKey; size: number; radius?: number }) {
  const def = SPOT_DEFS.find((d) => d.key === area);
  if (!def) return null;
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: '#eef0f4' }}>
      {/* 크기를 꼭 준다 — 안 주면 그림 원래 크기(640)로 그려져 칸에 귀퉁이만 보였다 */}
      <Image source={ART[def.picture]} style={{ position: 'absolute', width: size, height: size }} resizeMode="cover" />
      {/* 웹 번짐(지름 34% · 색 멈춤 32 · 47 · 60 · 70%)과 같은 모양 — 원 반지름 기준으로 옮긴 값 */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0.45" stopColor="#e23a46" stopOpacity={0.72} />
            <Stop offset="0.66" stopColor="#e23a46" stopOpacity={0.32} />
            <Stop offset="0.85" stopColor="#e23a46" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#e23a46" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={def.x} cy={def.y} r={17} fill="url(#glow)" />
      </Svg>
    </View>
  );
}

/** 운동이 쓰는 부위 칩 — 근육 이름 대신 큰 부위('어깨 뒤쪽'), 맨 앞(주 부위)만 진하게 */
export function AreaChips({ muscles, c }: { muscles: readonly string[]; c: Palette }) {
  const main = primaryArea(muscles);
  const areas = areasOf(muscles).sort((a, b) => Number(b.key === main?.key) - Number(a.key === main?.key));
  if (!areas.length) return null;
  return (
    <View style={st.wrap}>
      {areas.map((a, i) => (
        <View key={a.key} style={[st.chip, { backgroundColor: i === 0 ? c.skyTint : c.chip }]}>
          <Text style={{ color: i === 0 ? c.skyStrong : c.muted, fontSize: 13 }}>{a.label}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { minHeight: 24, borderRadius: 12, paddingHorizontal: 8, justifyContent: 'center' },
});
