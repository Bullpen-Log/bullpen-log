import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '~/shell/icon';

/*
 * 구속 측정 카메라 화면의 조각 — 웹 app/(session)/velocity/velocity-screen.tsx 의 카메라 앱 꼴과 같게:
 * 위 줄 둥근 검은 단추(CHROME_BTN) · 가운데 알약, 아래 검은 막대의 셔터(76 흰 테두리 · 안 빨강) · 옆 둥근 단추(SIDE_BTN) + 밑 글자,
 * 카메라 위 흰 안내창(GuideCard) · 수평계 알약(LevelBubble).
 */
export const RED = '#ff3b30';
const SKY = '#0a84d6';
const GREEN = '#34d399';

/** 위 줄 둥근 단추 — 웹 CHROME_BTN(44 · 검은 45%) */
export function ChromeButton({ icon, label, onPress, busy, disabled }: { icon: IconName; label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={6}
      style={({ pressed }) => [st.chrome, (pressed || disabled) && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Icon name={icon} size={22} color="#fff" />}
    </Pressable>
  );
}

/** 위 가운데 알약 — 설정 단계는 'n/4 · 이름', 측정은 점 + 상태 */
export function ChromePill({ children, dot }: { children: ReactNode; dot?: string }) {
  return (
    <View style={st.pill}>
      {dot ? <View style={[st.dot, { backgroundColor: dot }]} /> : null}
      <Text style={st.pillText} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** 셔터 — 운동 영상 촬영 단추와 같다: 76 원 · 흰 테두리 5 · 안 빨강 58 원, 멈춤이면 30 네모(모서리 7), 0.18초 */
export function Shutter({ state, label, onPress, disabled }: { state: 'ready' | 'stop' | 'wait'; label: string; onPress?: () => void; disabled?: boolean }) {
  const stop = useSharedValue(state === 'stop' ? 1 : 0);
  useEffect(() => {
    stop.set(withTiming(state === 'stop' ? 1 : 0, { duration: 180 }));
  }, [state, stop]);
  const inner = useAnimatedStyle(() => {
    const s = stop.get();
    const size = 58 - 28 * s;
    return { width: size, height: size, borderRadius: 29 - 22 * s };
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || state === 'wait'}
      style={({ pressed }) => [st.shutter, (disabled || state === 'wait') && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <Animated.View style={[{ backgroundColor: RED }, inner]} />
    </Pressable>
  );
}

/** 셔터 옆 둥근 단추 + 밑 글자 — 웹 SIDE_BTN(48 · 흰 테두리 25%) · SIDE_LABEL */
export function SideButton({
  icon,
  label,
  onPress,
  disabled,
  busy,
  badge,
  children,
}: {
  icon?: IconName;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  badge?: number;
  children?: ReactNode;
}) {
  return (
    <View style={st.side}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled || busy || !onPress}
        style={({ pressed }) => [st.sideBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.25)' }, disabled && { opacity: 0.4 }]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : children ?? (icon ? <Icon name={icon} size={22} color="#fff" /> : null)}
        {badge ? (
          <View style={st.badge}>
            <Text style={st.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </Pressable>
      <Text style={st.sideLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** 빈 옆 자리 — 셔터가 늘 가운데에 오게 */
export const SideGap = () => <View style={st.side} />;

/** 셔터 밑 글자 */
export const ShutterLabel = ({ children }: { children: ReactNode }) => <Text style={st.sideLabel}>{children}</Text>;

/** 카메라 위 흰 안내창 — 웹 GuideCard(단계 막대 · n/4 · 제목 · 설명 · 내용 · 단추 줄) */
export function GuideCard({
  step,
  total,
  title,
  subtitle,
  ok,
  children,
  footer,
}: {
  step?: number;
  total?: number;
  title: string;
  subtitle?: string;
  ok?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <View style={st.card}>
      {step != null && total != null ? (
        <View style={st.stepRow}>
          <View style={st.stepBar}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} style={[st.stepSeg, { backgroundColor: i < step ? SKY : '#e5e5ea' }]} />
            ))}
          </View>
          <Text style={st.stepNum}>
            {step}/{total}
          </Text>
        </View>
      ) : null}
      <Text style={[st.cardTitle, ok && { color: '#047857' }]}>{title}</Text>
      {subtitle ? <Text style={st.cardBody}>{subtitle}</Text> : null}
      {children ? <View style={{ marginTop: 16 }}>{children}</View> : null}
      {footer ? <View style={st.cardFoot}>{footer}</View> : null}
    </View>
  );
}

/** 안내창 단추 — 웹 PrimaryButton(56 · 모서리 16, sky 는 넓게 · quiet 는 옅은 회색) */
export function CardButton({ label, onPress, tone = 'sky', disabled, grow }: { label: string; onPress: () => void; tone?: 'sky' | 'quiet'; disabled?: boolean; grow?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [st.cardBtn, tone === 'sky' ? st.cardBtnSky : st.cardBtnQuiet, grow && { flex: 1 }, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[st.cardBtnText, tone === 'quiet' && { color: '#1d1d1f', fontSize: 16, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

/** 수평계 알약 — 웹 LevelBubble: 둥근 창 안 수평선(세 배로 기울여 그림) + '수평' 또는 돌릴 방향 · 각도 */
export function LevelBubble({ roll, pitch, rollOk, pitchOk }: { roll: number; pitch: number; rollOk: number; pitchOk: number }) {
  const rollOff = Math.abs(roll) > rollOk;
  const ok = !rollOff && Math.abs(pitch) <= pitchOk;
  const deg = rollOff ? Math.max(2, Math.round(Math.abs(roll))) : Math.max(pitchOk + 1, Math.round(Math.abs(pitch)));
  const lift = Math.max(-7, Math.min(7, pitch * 0.5));
  const icon: IconName = rollOff ? (roll > 0 ? 'rotate-ccw' : 'rotate-cw') : pitch > 0 ? 'arrow-down' : 'arrow-up';
  return (
    <View
      accessible
      accessibilityLabel={ok ? '수평' : rollOff ? `좌우로 ${deg}도 기울어짐` : `앞뒤로 ${deg}도 기울어짐`}
      style={st.level}
    >
      <View style={[st.levelWin, { borderColor: ok ? 'rgba(110,231,183,0.8)' : 'rgba(255,255,255,0.35)', backgroundColor: ok ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)' }]}>
        <View style={[st.levelTick, { left: 0, backgroundColor: ok ? GREEN : 'rgba(255,255,255,0.6)' }]} />
        <View style={[st.levelTick, { right: 0, backgroundColor: ok ? GREEN : 'rgba(255,255,255,0.6)' }]} />
        <View
          style={[
            st.levelLine,
            { backgroundColor: ok ? GREEN : '#fff', transform: [{ translateY: lift }, { rotate: `${-Math.max(-30, Math.min(30, roll * 3))}deg` }] },
          ]}
        />
      </View>
      {ok ? (
        <Text style={[st.levelText, { color: GREEN }]}>수평</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Icon name={icon} size={12} color="#fff" strokeWidth={3} />
          <Text style={st.levelText}>{deg}°</Text>
        </View>
      )}
    </View>
  );
}

/** 카메라 위 작은 알약(카메라 상태 · 안내 한 줄) */
export function InfoPill({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  return (
    <View style={[st.info, tone === 'warn' && { backgroundColor: 'rgba(180,83,9,0.85)' }]}>
      <Text style={st.infoText} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  chrome: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  pill: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: 220,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  side: { width: 80, alignItems: 'center' },
  sideBtn: {
    marginVertical: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideLabel: { marginTop: 4, color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500', textAlign: 'center' },
  badge: { position: 'absolute', right: -4, top: -4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: SKY, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  card: {
    backgroundColor: '#f2f2f7',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 32px -6px rgba(0,0,0,0.45), 0 30px 60px -20px rgba(0,0,0,0.5)',
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  stepBar: { flex: 1, flexDirection: 'row', gap: 4 },
  stepSeg: { flex: 1, height: 4, borderRadius: 2 },
  stepNum: { fontSize: 12, color: '#6e6e73', fontVariant: ['tabular-nums'] },
  cardTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: '#1d1d1f' },
  cardBody: { marginTop: 6, fontSize: 15, lineHeight: 21, color: '#6e6e73' },
  cardFoot: { marginTop: 20, flexDirection: 'row', gap: 8 },
  cardBtn: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  cardBtnSky: { flex: 1, backgroundColor: SKY },
  cardBtnQuiet: { minWidth: 112, backgroundColor: 'rgba(29,29,31,0.06)' },
  cardBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  level: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)' },
  levelWin: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, overflow: 'hidden', justifyContent: 'center' },
  levelTick: { position: 'absolute', top: 9.5, width: 4, height: 1 },
  levelLine: { position: 'absolute', left: 6, right: 6, top: 9, height: 2, borderRadius: 1 },
  levelText: { color: '#fff', fontSize: 12, fontWeight: '600', minWidth: 30, fontVariant: ['tabular-nums'] },
  info: { maxWidth: 260, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)' },
  infoText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
