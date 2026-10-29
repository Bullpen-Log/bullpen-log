import { Text, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 3D 동작 분석 새 분석 화면의 작은 그림 · 단계 줄(2026-10-29 확정 시안 analysis-capture-info · video-selection).
 * 마운드 · 평지는 수평으로 정리한 소프트 솔리드 도형(시안 마지막 수정 — 기울어진 옛 도형으로 되돌리지 않는다). 색은 시안 값 그대로.
 */
const SOLID = { top: '#b1dcff', mid: '#4d9ee5', side: '#1773bd', rubber: '#f4f9ff' };

/** 마운드 — 볼록한 흙더미 + 윗면 빛 + 투수판(시안 .ci-mound-*, 94×56) */
export function MoundIcon({ width = 94 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 56) / 94} viewBox="0 0 94 56" accessible={false}>
      <Defs>
        <LinearGradient id="mound-body" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={SOLID.top} />
          <Stop offset="0.53" stopColor={SOLID.mid} />
          <Stop offset="1" stopColor={SOLID.side} />
        </LinearGradient>
        <LinearGradient id="mound-top" x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={SOLID.top} />
          <Stop offset="1" stopColor={SOLID.mid} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="47.5" cy="51" rx="35" ry="3.5" fill="rgba(20,40,70,0.12)" />
      <Path d="M10 37 C10 24 26 15 47.5 15 C69 15 85 24 85 37 C85 46 69 51 47.5 51 C26 51 10 46 10 37 Z" fill="url(#mound-body)" />
      <Ellipse cx="47" cy="26.5" rx="31" ry="11.5" fill="url(#mound-top)" opacity={0.7} />
      <Rect x="36" y="22" width="22" height="7" rx="2" fill={SOLID.rubber} />
    </Svg>
  );
}

/** 평지 — 납작한 판 두 겹 + 투수판(시안 .ci-flat-*) */
export function FlatIcon({ width = 94 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 56) / 94} viewBox="0 0 94 56" accessible={false}>
      <Defs>
        <LinearGradient id="flat-body" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={SOLID.mid} />
          <Stop offset="1" stopColor={SOLID.side} />
        </LinearGradient>
        <LinearGradient id="flat-top" x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor={SOLID.top} />
          <Stop offset="1" stopColor={SOLID.mid} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="47" cy="53" rx="38" ry="2.5" fill="rgba(20,40,70,0.12)" />
      <Ellipse cx="47" cy="42.5" rx="41" ry="8.5" fill="url(#flat-body)" />
      <Ellipse cx="47" cy="36.5" rx="41" ry="8.5" fill="url(#flat-top)" />
      <Rect x="36" y="32" width="22" height="7" rx="2" fill={SOLID.rubber} />
    </Svg>
  );
}

/** 새 분석 단계 줄 — 1 영상 선택 · 2 촬영 정보 · 3 확인. 지난 단계는 체크, 지금 단계는 파랑 원 */
export function StepRail({ at, c }: { at: 0 | 1 | 2; c: Palette }) {
  const names = ['영상 선택', '촬영 정보', '확인'];
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${names.length}단계 중 ${at + 1}단계, ${names[at]}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}
    >
      {names.map((n, i) => (
        <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          {i > 0 ? <View style={{ width: 14, height: 1, backgroundColor: c.line }} /> : null}
          {i < at ? (
            <Icon name="check" size={14} color={c.sky} />
          ) : (
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: i === at ? c.action : c.chip,
              }}
            >
              <Text style={{ color: i === at ? '#fff' : c.muted, fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
            </View>
          )}
          <Text numberOfLines={1} style={{ color: i === at ? c.sky : c.muted, fontSize: 13, fontWeight: i === at ? '700' : '500', flexShrink: 1 }}>
            {n}
          </Text>
        </View>
      ))}
    </View>
  );
}
