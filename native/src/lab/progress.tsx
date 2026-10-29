import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READABLE } from '~/lib/layout';
import { TYPE, type Palette } from '~/lib/ui';
import { PitcherMark } from '~/pitch/dock-art';
import { Icon, type IconName } from '~/shell/icon';

/**
 * 3D 동작 분석 진행 화면(2026-10-29 확정 시안 analysis-progress) — 새 분석(app/lab/new.tsx)의 전송 · 접수와 결과 화면(app/lab/[id].tsx)의 대기 · 분석 · 지연 ·
 * 연결 확인 불가 · 완료 · 실패를 같은 틀로 그린다. 상태는 부모가 실제 값으로 정한다(올린 바이트 · 서버 작업 상태 · 묻기 실패) — 여기에는 시계도 가짜 퍼센트도 없다.
 * 원본 재생기는 두지 않는다(분석 정보 보기는 글만).
 *
 * 단계: 영상 전송 → 요청 접수 → 동작 분석 → 분석 완료. 서버의 세부 단계(download · pose …)는 화면에 내지 않는다(앱까지 오는 값이 아니라서).
 */
export type LabPhase =
  | { kind: 'upload'; sent: number; total: number; views: { side: SendStep; back: SendStep } }
  | { kind: 'upload-failed'; reason: string }
  | { kind: 'accepting' }
  | { kind: 'request-failed'; reason: string }
  | { kind: 'queued' }
  | { kind: 'running' }
  | { kind: 'delayed'; was: 'queued' | 'running' }
  | { kind: 'offline'; was: 'queued' | 'running' | 'accepting' }
  | { kind: 'done' }
  | { kind: 'failed'; reason: string; video: boolean };
export type SendStep = 'wait' | 'sending' | 'done';
type StepState = 'done' | 'active' | 'wait' | 'fail';

export type LabAction = { label: string; onPress: () => void; busy?: boolean };

const MB = 1048576;
const mb = (b: number) => (b / MB >= 100 ? Math.round(b / MB) : Math.round((b / MB) * 10) / 10);

function stepsOf(p: LabPhase): StepState[] {
  switch (p.kind) {
    case 'upload':
      return ['active', 'wait', 'wait', 'wait'];
    case 'upload-failed':
      return ['fail', 'wait', 'wait', 'wait'];
    case 'accepting':
      return ['done', 'active', 'wait', 'wait'];
    case 'request-failed':
      return ['done', 'fail', 'wait', 'wait'];
    case 'queued':
      return ['done', 'done', 'active', 'wait'];
    case 'running':
    case 'delayed':
      return ['done', 'done', 'active', 'wait'];
    case 'offline':
      return p.was === 'accepting' ? ['done', 'active', 'wait', 'wait'] : ['done', 'done', 'active', 'wait'];
    case 'done':
      return ['done', 'done', 'done', 'done'];
    case 'failed':
      return ['done', 'done', 'fail', 'wait'];
  }
}

function textOf(p: LabPhase): { title: string; line: string } {
  switch (p.kind) {
    case 'upload':
      return { title: '영상을 보내고 있어요.', line: '옆 · 뒤 원본을 분석 서버로 보내는 중이에요.' };
    case 'upload-failed':
      return { title: '영상을 다 보내지 못했어요.', line: p.reason };
    case 'accepting':
      return { title: '분석 요청을 확인하고 있어요.', line: '영상은 다 보냈어요. 서버가 요청을 받았는지 확인하는 중이에요.' };
    case 'request-failed':
      return { title: '분석을 시작하지 못했어요.', line: p.reason };
    case 'queued':
      return { title: '분석을 기다리고 있어요.', line: '요청이 접수됐어요. 차례가 오면 분석을 시작해요.' };
    case 'running':
      return { title: '투구 동작을 분석하고 있어요.', line: '옆 · 뒤 영상으로 투구 동작을 확인해요.' };
    case 'delayed':
      return {
        title: '분석이 오래 걸리고 있어요.',
        line: p.was === 'queued' ? '아직 분석 차례를 기다리고 있어요. 서버 상태를 계속 확인하고 있어요.' : '분석은 계속되고 있어요. 서버 상태를 계속 확인하고 있어요.',
      };
    case 'offline':
      return { title: '상태를 확인하지 못했어요.', line: '연결이 약해 지금 상태를 받지 못했어요. 마지막으로 확인한 단계를 보여 줘요.' };
    case 'done':
      return { title: '분석이 끝났어요.', line: '결과에서 핵심 장면과 요소별 분석을 확인해요.' };
    case 'failed':
      return { title: p.video ? '이 영상으로는 분석하지 못했어요.' : '분석이 끝나지 않았어요.', line: p.reason };
  }
}

const STEP_NAMES = ['영상 전송', '요청 접수', '동작 분석', '분석 완료'];
const STEP_ICON: Record<StepState, IconName> = { done: 'check', active: 'ellipsis', wait: 'circle', fail: 'circle-alert' };
const STEP_TEXT: Record<StepState, string> = { done: '완료', active: '진행 중', wait: '대기', fail: '멈춤' };

/** 투구 그래픽 — 승인 투수 그림 위에 관절점 · 연결선이 분석을 시작할 때 나타나고, 끝나면 체크. 전송 땐 옆 · 뒤 카드가 가운데로 모인다 */
function Graphic({ p, c }: { p: LabPhase; c: Palette }) {
  const calm = useReducedMotion();
  const sending = p.kind === 'upload' || p.kind === 'upload-failed';
  const analyzing = p.kind === 'running' || p.kind === 'delayed' || p.kind === 'done' || (p.kind === 'offline' && p.was === 'running');
  const merge = useSharedValue(sending ? 0 : 1);
  const joints = useSharedValue(analyzing ? 1 : 0);
  const badge = useSharedValue(1);
  useEffect(() => {
    merge.set(calm ? (sending ? 0 : 1) : withTiming(sending ? 0 : 1, { duration: 420 }));
  }, [sending, calm, merge]);
  useEffect(() => {
    joints.set(calm ? (analyzing ? 1 : 0) : withTiming(analyzing ? 1 : 0, { duration: 360 }));
  }, [analyzing, calm, joints]);
  useEffect(() => {
    if (calm) return;
    badge.set(0.6);
    badge.set(withSpring(1, { damping: 12, stiffness: 220 }));
  }, [p.kind, calm, badge]);
  const left = useAnimatedStyle(() => ({ opacity: 1 - merge.get(), transform: [{ translateX: merge.get() * 46 }, { rotate: '-6deg' }] }));
  const right = useAnimatedStyle(() => ({ opacity: 1 - merge.get(), transform: [{ translateX: -merge.get() * 46 }, { rotate: '6deg' }] }));
  const jointStyle = useAnimatedStyle(() => ({ opacity: joints.get() }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.get() }] }));
  const done = p.kind === 'done';
  const failed = p.kind === 'failed' || p.kind === 'upload-failed' || p.kind === 'request-failed';
  const badgeIcon: IconName = done ? 'check' : failed ? 'circle-alert' : sending ? 'video' : 'focus';
  return (
    <View style={g.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[g.side, { backgroundColor: c.card, boxShadow: c.float, left: 6 }, left]}>
        <Icon name="video" size={16} color={c.sky} />
        <Text style={[g.sideText, { color: c.sky }]}>옆</Text>
      </Animated.View>
      <Animated.View style={[g.side, { backgroundColor: c.card, boxShadow: c.float, right: 6 }, right]}>
        <Icon name="video" size={16} color={c.sky} />
        <Text style={[g.sideText, { color: c.sky }]}>뒤</Text>
      </Animated.View>
      <View style={[g.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
        <View style={[g.inner, { backgroundColor: c.skyTint }]}>
          <PitcherMark size={128} layer="body" />
          <Animated.View style={[StyleSheet.absoluteFill, g.center, jointStyle]}>
            <PitcherMark size={128} layer="joints" />
          </Animated.View>
        </View>
        <Animated.View style={[g.badge, { backgroundColor: done ? c.ok : failed ? c.warn : c.action }, badgeStyle]}>
          {p.kind === 'accepting' || (p.kind === 'upload' && p.total === 0) ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Icon name={badgeIcon} size={18} color="#fff" />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

export function LabProgress({
  c,
  phase,
  head,
  info,
  primary,
  secondary,
  note,
  extra,
}: {
  c: Palette;
  phase: LabPhase;
  /** 위 한 줄 — '10월 28일 투구 · 평지 · 오른손' */
  head: string;
  /** 분석 정보 보기(접힘) — [이름, 값] 줄 */
  info: [string, string][];
  primary?: LabAction | null;
  secondary?: LabAction | null;
  /** 아래 단추 위 한 줄 — 전송 중이면 '전송이 끝날 때까지 앱을 열어 두세요.' 등 */
  note?: string | null;
  /** 실패 칸 밑의 촬영 안내 같은 덧붙임 */
  extra?: ReactNode;
}) {
  const inset = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const t = textOf(phase);
  const steps = stepsOf(phase);
  /* 상태가 바뀌면 화면 읽기에 한 번 알린다 */
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(t.title);
    if (phase.kind === 'done') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [t.title, phase.kind]);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingBottom: 24, gap: 18 }, READABLE]}>
        <Text style={[TYPE.sub, { color: c.muted }]}>{head}</Text>
        <Graphic p={phase} c={c} />
        <View style={{ gap: 6, alignItems: 'center' }} accessibilityLiveRegion="polite">
          <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, textAlign: 'center' }]}>
            {t.title}
          </Text>
          <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>{t.line}</Text>
        </View>
        {phase.kind === 'upload' ? <UploadCard p={phase} c={c} /> : null}
        <View style={[x.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          {STEP_NAMES.map((n, i) => {
            const st = steps[i];
            const tone = st === 'active' ? c.sky : st === 'fail' ? c.warn : st === 'done' ? c.sky : c.muted;
            return (
              <View key={n} style={x.step} accessibilityLabel={`${n} ${STEP_TEXT[st]}`}>
                <View style={[x.stepDot, { backgroundColor: st === 'active' ? c.action : st === 'wait' ? c.chip : st === 'fail' ? c.warnBg : c.skyTint }]}>
                  <Icon name={STEP_ICON[st]} size={14} color={st === 'active' ? '#fff' : tone} />
                </View>
                <Text style={[TYPE.body, { flex: 1, color: st === 'active' ? c.sky : c.ink, fontWeight: st === 'active' ? '600' : '400' }]}>{n}</Text>
                <Text style={[TYPE.sub, { color: tone }]}>{STEP_TEXT[st]}</Text>
              </View>
            );
          })}
        </View>
        {extra}
        <View style={{ alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            hitSlop={8}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>분석 정보 {open ? '접기' : '보기'}</Text>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.link} />
          </Pressable>
        </View>
        {open ? (
          <View style={[x.card, { backgroundColor: c.card, boxShadow: c.float, gap: 0, paddingVertical: 4 }]}>
            {info.map(([k, v], i) => (
              <View key={k} style={[x.infoRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Text style={[TYPE.sub, { color: c.muted, width: 84 }]}>{k}</Text>
                <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{v}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={[{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: inset.bottom + 12, gap: 10 }, READABLE]}>
        {note ? <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{note}</Text> : null}
        {primary ? (
          <Pressable
            accessibilityRole="button"
            disabled={primary.busy}
            onPress={primary.onPress}
            style={({ pressed }) => [x.cta, { backgroundColor: c.action, opacity: primary.busy ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            {primary.busy ? <ActivityIndicator color="#fff" /> : <Text style={[TYPE.button, { color: '#fff' }]}>{primary.label}</Text>}
          </Pressable>
        ) : null}
        {secondary ? (
          <Pressable
            accessibilityRole="button"
            disabled={secondary.busy}
            onPress={secondary.onPress}
            style={({ pressed }) => [x.cta, { backgroundColor: c.card, opacity: secondary.busy ? 0.5 : pressed ? 0.7 : 1 }]}
          >
            <Text style={[TYPE.button, { color: c.ink }]}>{secondary.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** 전송 카드 — 두 파일의 실제 보낸 바이트를 합친 %, 칸마다 대기 · 보내는 중 · 완료 */
function UploadCard({ p, c }: { p: Extract<LabPhase, { kind: 'upload' }>; c: Palette }) {
  const pct = p.total > 0 ? Math.min(100, Math.floor((p.sent / p.total) * 100)) : 0;
  const label: Record<SendStep, string> = { wait: '대기', sending: '보내는 중', done: '완료' };
  return (
    <View style={[x.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={[TYPE.card, { color: c.ink }]}>전체 영상 전송</Text>
        <Text style={[TYPE.num, { color: c.ink, fontSize: 20 }]} accessibilityLabel={`${pct}퍼센트`}>
          {pct}
          <Text style={[TYPE.unit, { color: c.muted }]}>%</Text>
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.chip }}
      >
        <View style={{ height: 8, width: `${pct}%`, backgroundColor: c.action }} />
      </View>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {mb(p.sent)}MB / {mb(p.total)}MB
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['side', 'back'] as const).map((v) => (
          <View key={v} style={[x.sendChip, { backgroundColor: p.views[v] === 'done' ? c.skyTint : c.page }]}>
            <Icon name={p.views[v] === 'done' ? 'check' : 'video'} size={14} color={p.views[v] === 'wait' ? c.muted : c.sky} />
            <Text style={[TYPE.sub, { color: c.ink }]}>{v === 'side' ? '옆 영상' : '뒤 영상'}</Text>
            <Text style={[TYPE.sub, { color: p.views[v] === 'wait' ? c.muted : c.sky, marginLeft: 'auto' }]}>{label[p.views[v]]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const g = StyleSheet.create({
  wrap: { height: 196, alignItems: 'center', justifyContent: 'center' },
  card: { width: 168, height: 168, borderRadius: 36, padding: 10 },
  inner: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -8, bottom: -8, width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  side: { position: 'absolute', top: 70, width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 4 },
  sideText: { fontSize: 12, fontWeight: '700' },
});
const x = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  stepDot: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  cta: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  sendChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 12, paddingHorizontal: 10 },
});
