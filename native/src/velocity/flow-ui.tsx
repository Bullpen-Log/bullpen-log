import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Easing, FadeInDown } from 'react-native-reanimated';
import { RECEIVERS, RUBBER_DIST_PRESETS, TARGET_DIST_MAX, TARGET_DIST_MIN, type Receiver } from '@/lib/velocity-setup';
import { PALETTES, usePalette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';

/*
 * 구속 측정 화면의 틀(최종 시안 sinker-velocity-final-flow, 2026-10-29) — 위 머리줄 · 가운데 카메라(작은 상태 칩 · 아래 흰 판) · 아래 단추 줄(독).
 * 색은 앱 테마(usePalette)를 따라 라이트 · 다크 · 네이비 모두 맞는다. 카메라 위 칩은 늘 어두운 반투명(영상 위 글자 대비).
 */

/** 판이 바뀔 때 — 9px 아래에서 짧게 떠오름(시안 af-panel-up 0.22초). 움직임 줄이기는 Reanimated 가 기기 설정을 따라 끈다 */
export const panelIn = FadeInDown.duration(220)
  .easing(Easing.out(Easing.ease))
  .withInitialValues({ opacity: 0.7, transform: [{ translateY: 9 }] });

const CHIP_BG = 'rgba(16,37,54,0.79)';

export function FlowHeader({ title, onBack, backLabel, onHelp }: { title: string; onBack: () => void; backLabel: string; onHelp?: () => void }) {
  const p = usePalette();
  return (
    <View style={[st.header, { backgroundColor: p.page }]}>
      <IconButton icon="chevron-left" label={backLabel} color={p.ink} onPress={onBack} />
      <Text style={[st.headerTitle, { color: p.ink }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {onHelp ? <IconButton icon="info" label="촬영 방법" color={p.ink} onPress={onHelp} /> : <View style={st.iconBtn} />}
    </View>
  );
}

function IconButton({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.55 }]}>
      <Icon name={icon} size={21} color={color} />
    </Pressable>
  );
}

/** 카메라 위 작은 칩 — 상태(점) · 거리(자 그림) · 초점 · 소리 */
export function CamChip({
  children,
  dot,
  icon,
  onPress,
  label,
  hint,
  tone,
  lines = 1,
}: {
  lines?: number;
  children?: ReactNode;
  dot?: string;
  icon?: IconName;
  onPress?: () => void;
  label?: string;
  hint?: string;
  tone?: 'warn';
}) {
  const body = (
    <>
      {dot ? <View style={[st.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Icon name={icon} size={14} color="#fff" /> : null}
      {children != null ? (
        <Text style={st.chipText} numberOfLines={lines}>
          {children}
        </Text>
      ) : null}
    </>
  );
  const style = [st.chip, tone === 'warn' && { backgroundColor: 'rgba(146,64,14,0.88)' }, children == null && st.chipIcon];
  if (!onPress)
    return (
      <View style={style} accessibilityLabel={label} accessible={!!label}>
        {body}
      </View>
    );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  );
}

/** 수평 칩 — 폰이 준 좌우 기울기 그대로(점이 가운데 눈금에서 기운 쪽으로). 기울기 값이 없는 폰이면 부르는 쪽이 안 그린다 */
export function LevelChip({ roll, ok }: { roll: number; ok: boolean }) {
  const shift = Math.max(-1, Math.min(1, roll / 5)) * 17;
  const color = ok ? '#72deb6' : '#ffd08a';
  return (
    <View style={st.chip} accessible accessibilityLabel={`${ok ? '수평 양호' : '수평 맞추기'}, 좌우 기울기 ${Math.abs(roll).toFixed(1)}도`}>
      <Text style={[st.chipText, { color: ok ? '#ddffec' : '#ffe7bd' }]}>{ok ? '수평 양호' : '수평 맞추기'}</Text>
      <View style={st.track}>
        <View style={st.trackMid} />
        <View style={[st.trackDot, { backgroundColor: color, transform: [{ translateX: shift }] }]} />
      </View>
      <Text style={[st.chipText, { fontVariant: ['tabular-nums'] }]}>{Math.abs(roll).toFixed(1)}°</Text>
    </View>
  );
}

/** 카메라 아래쪽 흰 판 — 무엇이 일어났고 무엇을 할지. tone 이 있으면 제목 앞에 알림 그림 */
export function FlowPanel({
  eyebrow,
  title,
  body,
  tone,
  light,
  compact,
  children,
}: {
  eyebrow?: string;
  title?: string;
  body?: string | null;
  tone?: 'danger' | 'warn';
  /** 늘 밝은 판 — 안에 밝은 바탕용 옛 부품(ABS 설정)을 넣을 때 */
  light?: boolean;
  /** 카메라 칸이 낮은 폰 — 가운데 표적을 덜 가리게 최소 높이를 없앤다 */
  compact?: boolean;
  children?: ReactNode;
}) {
  const theme = usePalette();
  const p = light ? PALETTES.light : theme;
  const color = tone === 'danger' ? p.danger : tone === 'warn' ? p.warn : p.ink;
  return (
    <View style={[st.panel, { backgroundColor: p.card }, compact && { minHeight: 0 }]} accessibilityLiveRegion="polite">
      {eyebrow ? <Text style={[st.eyebrow, { color: p.link }]}>{eyebrow}</Text> : null}
      {title ? (
        <View style={st.titleRow}>
          {tone ? <Icon name={tone === 'warn' ? 'history' : 'circle-alert'} size={20} color={color} /> : null}
          <Text style={[st.title, { color }]} accessibilityRole="header">
            {title}
          </Text>
        </View>
      ) : null}
      {body ? <Text style={[st.body, { color: p.muted }]}>{body}</Text> : null}
      {children}
    </View>
  );
}

/** 판 안의 이름 · 값 줄(받는 곳 · 입력 거리 · 수평 센서) */
export function MetaRows({ rows }: { rows: [string, string][] }) {
  const p = usePalette();
  return (
    <View style={{ marginTop: 10, gap: 4 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={st.metaRow}>
          <Text style={[st.metaKey, { color: p.muted }]}>{k}</Text>
          <Text style={[st.metaVal, { color: p.ink }]} numberOfLines={1}>
            {v}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 판 안의 파란 글 단추('던졌는데 반응이 없어요 →') */
export function InlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => [st.inline, pressed && { opacity: 0.6 }]}>
      <Text style={[st.inlineText, { color: p.link }]}>{label} →</Text>
    </Pressable>
  );
}

/** 판 안의 작은 알림 줄 — 까닭 칩(파랑) · 앞 공 처리 중 들어온 투구(주황) */
export function PanelHint({ text, tone }: { text: string; tone?: 'warn' }) {
  const p = usePalette();
  const color = tone === 'warn' ? p.warn : p.link;
  return (
    <View style={st.hint}>
      <Icon name={tone === 'warn' ? 'history' : 'info'} size={15} color={color} />
      <Text style={[st.hintText, { color }]}>{text}</Text>
    </View>
  );
}

/** 아래 단추 줄 — 한 줄 안내 + 단추(보조 · 주) */
export function FlowDock({ note, children, bottom }: { note?: string | null; children?: ReactNode; bottom: number }) {
  const p = usePalette();
  return (
    <View style={[st.dock, { backgroundColor: p.page, paddingBottom: Math.max(bottom, 10) }]}>
      <Text style={[st.dockNote, { color: p.muted }]} numberOfLines={2}>
        {note ?? ''}
      </Text>
      {children ? <View style={st.actions}>{children}</View> : <View style={{ height: 52 }} />}
    </View>
  );
}

export function FlowButton({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  grow,
}: {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  /** 보조 단추 하나만 둘 때 줄을 채운다 */
  grow?: boolean;
}) {
  const p = usePalette();
  const primary = kind === 'primary';
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        st.btn,
        primary ? [st.btnPrimary, { backgroundColor: off ? p.skyTint : p.action }] : [st.btnSecondary, { backgroundColor: p.skyTint }],
        grow && { flex: 1 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[st.btnText, { color: primary ? (off ? p.muted : p.onAction) : p.link }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

/** 아래에서 올라오는 판(촬영 방법 · 촬영 점검 · 거리) — 손잡이 · 제목 · 닫기 */
export function FlowSheet({ visible, title, onClose, children, bottom }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; bottom: number }) {
  const p = usePalette();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
        <View style={[st.sheet, { backgroundColor: p.card, paddingBottom: Math.max(bottom, 16) + 12 }]}>
          <View style={[st.handle, { backgroundColor: p.line }]} />
          <View style={st.sheetHead}>
            <Text style={[st.sheetTitle, { color: p.ink }]} accessibilityRole="header">
              {title}
            </Text>
            <IconButton icon="x" label="닫기" color={p.muted} onPress={onClose} />
          </View>
          {/* 작은 폰 · 큰 글씨면 판이 화면을 넘는다 — 안을 굴린다 */}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 번호 매긴 도움말 줄(촬영 방법 · 촬영 점검) */
export function HelpRows({ rows }: { rows: [string, string][] }) {
  const p = usePalette();
  return (
    <View style={{ gap: 14, marginTop: 6 }}>
      {rows.map(([t, d], i) => (
        <View key={t} style={st.helpRow}>
          <View style={[st.helpNo, { backgroundColor: p.skyTint }]}>
            <Text style={[st.helpNoText, { color: p.link }]}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.helpTitle, { color: p.ink }]}>{t}</Text>
            <Text style={[st.helpBody, { color: p.muted }]}>{d}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** 거리 바르게 넣었나 — 5~40m, 0.5m 단위 */
export const distanceOk = (v: number) => Number.isFinite(v) && v >= TARGET_DIST_MIN && v <= TARGET_DIST_MAX && Math.round(v * 2) === v * 2;

/** 촬영 거리 판 — 받는 곳(망 · 포수) + 투수판부터 공이 멈추는 곳까지(m). 측정 전에만 연다(부르는 쪽이 지킨다) */
export function DistanceSheet({
  visible,
  receiver,
  distM,
  onApply,
  onClose,
  bottom,
}: {
  visible: boolean;
  receiver: Receiver;
  distM: number;
  onApply: (receiver: Receiver, distM: number) => void;
  onClose: () => void;
  bottom: number;
}) {
  return (
    <FlowSheet visible={visible} title="촬영 거리" onClose={onClose} bottom={bottom}>
      {/* 열 때마다 지금 값으로 새로 — 고치다 닫으면 버린다 */}
      {visible ? <DistanceForm receiver={receiver} distM={distM} onApply={onApply} /> : null}
    </FlowSheet>
  );
}

function DistanceForm({ receiver, distM, onApply }: { receiver: Receiver; distM: number; onApply: (receiver: Receiver, distM: number) => void }) {
  const p = usePalette();
  const [who, setWho] = useState<Receiver>(receiver);
  const [text, setText] = useState(String(distM));
  const [error, setError] = useState(false);
  const apply = () => {
    const v = Number(text.replace(',', '.'));
    if (!distanceOk(v)) return setError(true);
    onApply(who, v);
  };
  return (
    <>
      <Text style={[st.fieldLabel, { color: p.ink }]}>받는 곳</Text>
      <View style={st.receivers} accessibilityRole="radiogroup">
        {RECEIVERS.map((r) => {
          const on = who === r.value;
          return (
            <Pressable
              key={r.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setWho(r.value)}
              style={[st.receiver, { backgroundColor: on ? p.action : p.skyTint }]}
            >
              <Text style={[st.receiverText, { color: on ? p.onAction : p.muted }]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[st.fieldLabel, { color: p.ink }]}>투수판부터 공이 멈추는 곳까지(m)</Text>
      <View style={st.inputRow}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(false);
          }}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={apply}
          accessibilityLabel="투수판부터 공이 멈추는 곳까지 거리, 미터"
          style={[st.input, { borderColor: error ? p.danger : p.line, backgroundColor: p.page, color: p.ink }]}
        />
        {RUBBER_DIST_PRESETS.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityLabel={`${m}미터`}
            onPress={() => {
              setText(String(m));
              setError(false);
            }}
            style={[st.preset, { backgroundColor: p.skyTint }]}
          >
            <Text style={[st.presetText, { color: p.link }]}>{m}m</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={[st.fieldError, { color: p.danger }]}>{`${TARGET_DIST_MIN}~${TARGET_DIST_MAX}m를 0.5m 단위로 입력해 주세요.`}</Text> : null}
      <Text style={[st.fieldNote, { color: p.muted }]}>
        {who === 'net' ? '망 앞면이 아닌 공이 멈추는 위치를 기준으로 해요.' : '포수가 공을 받는 미트 위치를 기준으로 해요.'}
      </Text>
      <FlowButton label="거리 적용" onPress={apply} />
    </>
  );
}

const st = StyleSheet.create({
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: CHIP_BG,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  chipIcon: { width: 36, minHeight: 36, paddingHorizontal: 0, justifyContent: 'center' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  track: { width: 42, height: 9, borderRadius: 5, backgroundColor: 'rgba(203,221,235,0.5)', justifyContent: 'center', alignItems: 'center' },
  trackMid: { position: 'absolute', width: 2, height: 13, backgroundColor: '#fff' },
  trackDot: { width: 7, height: 7, borderRadius: 4 },
  panel: { minHeight: 120, paddingHorizontal: 17, paddingVertical: 16, borderRadius: 22, boxShadow: '0 12px 28px rgba(7,26,41,0.4)' },
  eyebrow: { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.6 },
  body: { marginTop: 6, fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaKey: { fontSize: 13 },
  metaVal: { fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  inline: { alignSelf: 'flex-start', marginTop: 8, minHeight: 32, justifyContent: 'center' },
  inlineText: { fontSize: 14, fontWeight: '700' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  hintText: { flex: 1, fontSize: 13, fontWeight: '700' },
  dock: { paddingTop: 10, paddingHorizontal: 16, gap: 8 },
  dockNote: { textAlign: 'center', minHeight: 17, fontSize: 13, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  btnPrimary: { flex: 1 },
  btnSecondary: { minWidth: 109, flexShrink: 1 },
  btnText: { fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,23,37,0.59)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 20 },
  handle: { width: 34, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  helpRow: { flexDirection: 'row', gap: 12 },
  helpNo: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  helpNoText: { fontSize: 14, fontWeight: '700' },
  helpTitle: { fontSize: 16, fontWeight: '700' },
  helpBody: { marginTop: 2, fontSize: 14, lineHeight: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  receivers: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 6 },
  receiver: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  receiverText: { fontSize: 15, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 18, fontWeight: '700' },
  preset: { minHeight: 48, minWidth: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  presetText: { fontSize: 15, fontWeight: '700' },
  fieldError: { fontSize: 13, marginTop: 6 },
  fieldNote: { fontSize: 13, lineHeight: 18, marginTop: 10, marginBottom: 16 },
});
