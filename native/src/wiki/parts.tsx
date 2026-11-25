import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { WikiCategoryId } from '@/lib/wiki';
import { TYPE, withAlpha, type Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 싱커위키 앱 부품(R1) — 웹 components/wiki/wiki-motif.tsx · disclosure.tsx 와 같은 뜻.
 * 덕아웃 느낌은 옅은 초록(c.ok)과 공이 날아가는 호 · 실밥 그림만. 무엇을 잰 그래프가 아니다.
 */

/** 공이 날아가는 호 + 실밥(꾸밈, 읽기 프로그램에는 숨김) */
export function BallArc({ c, width = 44, height = 20 }: { c: Palette; width?: number; height?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} viewBox="0 0 64 28" fill="none">
        <Path d="M3 25 C 18 4, 40 2, 52 10" stroke={c.ok} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 5" opacity={0.55} />
        <Circle cx={56} cy={13} r={6} stroke={c.ok} strokeWidth={2} />
        <Path d="M52.6 9.2c1.4 2.2 1.4 5.4 0 7.6M59.4 9.2c-1.4 2.2-1.4 5.4 0 7.6" stroke={c.ok} strokeWidth={1.4} strokeLinecap="round" opacity={0.8} />
      </Svg>
    </View>
  );
}

const CATEGORY_ICON: Record<WikiCategoryId, IconName> = {
  'pitching-mechanics': 'baseball',
  'training-concepts': 'flame',
  'movements-postures': 'person-standing',
  equipment: 'dumbbell',
  'records-metrics': 'gauge',
  'basic-terms': 'book-open',
};

/** 묶음 그림 — 옅은 초록 동그라미 안 선 그림 */
export function CategoryBadge({ id, c, size = 40 }: { id: WikiCategoryId; c: Palette; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(c.ok, 0.14) }}
    >
      <Icon name={CATEGORY_ICON[id]} size={Math.round(size * 0.5)} color={c.ok} />
    </View>
  );
}

/**
 * 펼쳐 보기 — 자세한 설명 · 근거와 출처 · 편집 정보 · 사진 정보. 누르면 펼침/접힘, 읽기 프로그램에 펼침 상태를 알린다(accessibilityState.expanded).
 * 안의 글은 지우거나 줄이지 않는다.
 */
export function Disclosure({ title, c, children, compact = false }: { title: string; c: Palette; children: ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={compact ? undefined : { borderRadius: 16, backgroundColor: c.card, overflow: 'hidden' }}>
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: compact ? 40 : 52, paddingHorizontal: compact ? 0 : 16 }}
      >
        <Text style={compact ? [TYPE.sub, { color: c.muted, fontWeight: '600' }] : [TYPE.card, { color: c.ink }]}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: compact ? 13 : 17, transform: [{ rotate: open ? '90deg' : '0deg' }] }}>›</Text>
      </Press>
      {open ? <View style={compact ? { gap: 6, paddingBottom: 4 } : { gap: 20, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}>{children}</View> : null}
    </View>
  );
}
