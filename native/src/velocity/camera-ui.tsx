import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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

/** 두 칸 고르개 — 웹 Segmented(회색 바탕 위 흰 칸) */
export function Segmented({ items, value, onChange }: { items: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={st.seg}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable key={it.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(it.value)} style={[st.segItem, on && st.segOn]}>
            <Text style={[st.segText, on && { fontWeight: '700' }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  seg: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: '#e5e5ea' },
  segItem: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  segText: { fontSize: 15, fontWeight: '500', color: '#1d1d1f' },
  chrome: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  pill: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '100%',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '600', flexShrink: 1 },
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
  target: { width: 112, height: 112, borderRadius: 56, borderWidth: 2 },
  tick: { position: 'absolute', opacity: 0.8 },
  targetLabel: { position: 'absolute', top: '50%', marginTop: 72, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  zone: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 4, boxShadow: '0 0 0 1px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.25)' },
  zoneLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.45)' },
  zoneLabel: { position: 'absolute', bottom: '100%', marginBottom: 6, left: '50%', marginLeft: -60, width: 120, textAlign: 'center', color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  knobHit: { position: 'absolute', right: -30, bottom: -30, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: '#0a84d6', boxShadow: '0 2px 6px rgba(0,0,0,0.45)' },
  info: { maxWidth: 260, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)' },
  infoText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

/**
 * 릴리스 표적 — 웹 velocity-screen '표적 — 릴리스 포인트': 가운데 112 원 · 십자 눈금 · 점, 밑에 '릴리스 포인트'.
 * 측정 중 기다릴 때는 하늘색 테두리 + 둘레를 살짝 어둡게, 공을 담는 중엔 주황.
 */
export function ReleaseTarget({ state }: { state: 'idle' | 'armed' | 'capturing' }) {
  const color = state === 'armed' ? '#7dd3fc' : state === 'capturing' ? '#fde68a' : 'rgba(255,255,255,0.7)';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[st.target, { borderColor: color }, state === 'armed' && { boxShadow: '0 0 0 9999px rgba(0,0,0,0.15)' }]}>
        <View style={[st.tick, { top: 0, left: 55, width: 1, height: 12, backgroundColor: color }]} />
        <View style={[st.tick, { bottom: 0, left: 55, width: 1, height: 12, backgroundColor: color }]} />
        <View style={[st.tick, { left: 0, top: 55, width: 12, height: 1, backgroundColor: color }]} />
        <View style={[st.tick, { right: 0, top: 55, width: 12, height: 1, backgroundColor: color }]} />
        <View style={[st.tick, { left: 53, top: 53, width: 6, height: 6, borderRadius: 3, backgroundColor: color }]} />
      </View>
      <Text style={st.targetLabel}>릴리스 포인트</Text>
    </View>
  );
}

/**
 * 스트라이크 존 — 웹 ZoneOverlay(centerLocked): 자리는 릴리스 표적 바로 밑에 붙박고, 두 손가락으로 벌리거나 오른쪽 아래 손잡이를 끌어 크기만.
 * 크기는 부르는 쪽이 장면 좌표로 정한다(onGrow 배율 — 손동작 시작 때 크기에 곱함).
 */
export function ZoneOverlay({
  rect,
  editable,
  onGrow,
}: {
  rect: { left: number; top: number; width: number; height: number };
  editable: boolean;
  onGrow: (factor: number, start: boolean) => void;
}) {
  const handle = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => onGrow(1, true))
    .onUpdate((e) => {
      /* 가운데를 두고 양쪽으로 — 끈 만큼의 두 배가 가로 변화(세로로 끌어도 같은 비율로) */
      const d = Math.max(e.translationX, (e.translationY * rect.width) / Math.max(1, rect.height));
      onGrow(Math.max(0.05, 1 + (2 * d) / Math.max(1, rect.width)), false);
    });
  return (
    <View pointerEvents="box-none" style={[st.zone, rect]}>
      <View style={[st.zoneLine, { left: '33.3%', top: 0, bottom: 0, width: 1 }]} />
      <View style={[st.zoneLine, { left: '66.6%', top: 0, bottom: 0, width: 1 }]} />
      <View style={[st.zoneLine, { top: '33.3%', left: 0, right: 0, height: 1 }]} />
      <View style={[st.zoneLine, { top: '66.6%', left: 0, right: 0, height: 1 }]} />
      {editable ? (
        <>
          <Text style={st.zoneLabel} numberOfLines={1}>
            스트라이크 존
          </Text>
          <GestureDetector gesture={handle}>
            <View accessible accessibilityLabel="존 크기 손잡이" hitSlop={10} style={st.knobHit}>
              <View style={st.knob} />
            </View>
          </GestureDetector>
        </>
      ) : null}
    </View>
  );
}

/** 뷰파인더 어디서든 두 손가락으로 벌려 존 크기 */
export function ZonePinch({ onGrow, children }: { onGrow: (factor: number, start: boolean) => void; children: ReactNode }) {
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => onGrow(1, true))
    .onUpdate((e) => onGrow(e.scale, false));
  return (
    <GestureDetector gesture={pinch}>
      <View collapsable={false} style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </GestureDetector>
  );
}
