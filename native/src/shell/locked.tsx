import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { noticeLocked } from '~/shell/release';

/**
 * 출시 전 베타의 '잠긴 기능' 모양 — 하단 탭 · 더보기 · 투구 탭 도구 · 베타 홈이 같은 모양을 쓴다(2026-10-29 금윤호: "버튼의 아이콘 위에 잠금 아이콘,
 * 회색으로, 누가 봐도 비활성"). 아이콘은 회색으로 흐리게, 그 오른쪽 위에 진한 회색 원 + 자물쇠(흐리지 않음 — 잠금이 또렷이 보이게), 이름도 회색.
 * 누르면 안내만 하고 들어가지 않는다(shell/release.ts noticeLocked). 판정은 shell/release.ts canOpen.
 */

/** 잠긴 아이콘 · 그림의 흐림 */
export const LOCK_DIM = 0.38;

/** 잠긴 칸의 색 — 바탕은 회색 칩, 아이콘은 옅은 회색, 이름은 회색 글자 */
export const lockedColors = (c: Palette) => ({ fill: c.chip, glyph: c.lineStrong, label: c.muted });

/** 자물쇠 원 — 진한 회색 바탕에 바탕색 자물쇠(라이트 · 다크 · 네이비 모두 대비가 선다), 둘레에 칸 색 테를 둘러 아이콘과 떨어져 보인다 */
export function LockBadge({ size = 18, ring, style }: { size?: number; ring?: string; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        s.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.muted, borderColor: ring ?? c.card, borderWidth: Math.max(1.5, size * 0.09) },
        style,
      ]}
    >
      <Icon name="lock" size={Math.round(size * 0.56)} color={c.page} strokeWidth={2.8} filled />
    </View>
  );
}

/**
 * 잠긴 아이콘 — 감싼 아이콘 · 그림을 흐리게 하고 자물쇠를 얹는다. locked 가 아니면 그대로 그린다(자리 · 크기가 같다).
 * badge: 자물쇠 원 크기, ring: 자물쇠 테 색(칸 바탕과 같게), center: 자물쇠를 아이콘 한가운데에(큰 칸 — 투구 탭 도구 블럭), 아니면 오른쪽 위.
 */
export function LockedGlyph({
  locked,
  badge = 18,
  ring,
  center = false,
  children,
}: {
  locked: boolean;
  badge?: number;
  ring?: string;
  center?: boolean;
  children: ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <View style={center ? s.center : undefined}>
      <View style={{ opacity: center ? LOCK_DIM * 0.7 : LOCK_DIM }}>{children}</View>
      <LockBadge size={badge} ring={ring} style={center ? s.centerBadge : { position: 'absolute', top: -badge * 0.32, right: -badge * 0.38 }} />
    </View>
  );
}

/**
 * 잠긴 도구 블럭(투구 탭 도구 도크의 구속 측정 · ABS) — 블럭 전체를 회색 판으로(그림자 · 색 없음), 회색 그림 위 한가운데 큰 자물쇠,
 * 이름 · '준비 중'도 회색. 누르면 작은 안내('준비 중인 기능입니다.')만 뜨고 들어가지 않는다(2026-10-30 금윤호: "블럭을 아예 회색으로 · 그 위에 자물쇠").
 */
export function LockedBlock({ icon, size, label, style }: { icon: IconName; size: number; label: string; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  const k = lockedColors(c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, 준비 중`}
      accessibilityHint={LOCKED_HINT}
      accessibilityState={{ disabled: true }}
      onPress={noticeLocked}
      style={({ pressed }) => [s.block, { backgroundColor: k.fill, borderColor: c.lineStrong }, style, pressed && { opacity: 0.85 }]}
    >
      <LockedGlyph locked center badge={34} ring={k.fill}>
        <Icon name={icon} size={size} color={k.glyph} />
      </LockedGlyph>
      <Text style={[s.blockLabel, { color: k.label }]}>{label}</Text>
      <Text style={{ color: k.label, fontSize: 12, fontWeight: '600', marginTop: -8 }}>준비 중</Text>
    </Pressable>
  );
}

/** 읽어 주는 글 — 잠긴 칸 모두 같게 */
export const LOCKED_HINT = '준비 중인 기능이에요. 누르면 안내만 나와요.';

/**
 * 잠긴 기능 한 줄(카드) — 회색 판, 흐린 아이콘 + 자물쇠, 회색 이름, 오른쪽 '준비 중'. 누르면 안내만.
 * 투구 탭 베타 판의 '오늘 투구 기록' 같은 자리에.
 */
export function LockedRow({ icon, label, style }: { icon: IconName; label: string; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  const k = lockedColors(c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, 준비 중`}
      accessibilityHint={LOCKED_HINT}
      accessibilityState={{ disabled: true }}
      onPress={noticeLocked}
      style={({ pressed }) => [s.row, { backgroundColor: k.fill, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <LockedGlyph locked badge={16} ring={k.fill}>
        <Icon name={icon} size={24} color={k.glyph} />
      </LockedGlyph>
      <Text numberOfLines={1} style={[TYPE.body, { flex: 1, color: k.label }]}>
        {label}
      </Text>
      <Text style={[TYPE.sub, { color: k.label }]}>준비 중</Text>
    </Pressable>
  );
}

/** 잠긴 기능 칸(작은 네모) — 베타 홈의 '준비 중인 기능' 격자에. 회색 판, 흐린 아이콘 + 자물쇠, 회색 이름 */
export function LockedTile({ icon, label, style }: { icon: IconName; label: string; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  const k = lockedColors(c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, 준비 중`}
      accessibilityHint={LOCKED_HINT}
      accessibilityState={{ disabled: true }}
      onPress={noticeLocked}
      style={({ pressed }) => [s.tile, { backgroundColor: k.fill, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <LockedGlyph locked badge={18} ring={k.fill}>
        <Icon name={icon} size={28} color={k.glyph} />
      </LockedGlyph>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[TYPE.sub, { color: k.label, fontWeight: '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerBadge: { position: 'absolute' },
  block: { borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 16, borderWidth: 1, borderStyle: 'dashed' },
  blockLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 12 },
  tile: { alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 92, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 14 },
});
