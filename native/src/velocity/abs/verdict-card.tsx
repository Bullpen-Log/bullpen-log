import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { AbsAnalysis, FitSnapshot } from '@/lib/abs/analysis';
import { RULES } from '@/lib/abs/rules';
import { zoneWorld } from '@/lib/abs/zone';
import { APP_UA, SITE_URL } from '~/lib/site';
import { Press } from '~/shell/press';
import { absHeadOf, HEAD_LABEL, noVerdictReason, placeText } from './present';

const SKY = '#0a84d6';
const WARN = '#f59e0b';

/**
 * 판정 카드(앱, ABS 모드의 방금 공) — 2026-10-29 개편: 스트라이크 · 볼을 맨 먼저 크게, 경계 · 참고는 그 밑 작은 배지(제3 판정이 아니다),
 * 자리 · 까닭은 저장된 AbsAnalysis 에 있을 때만, 구속은 있을 때만 그 밑에 작게. 타격은 '타격 · 판정 없음', 궤적 · 깊이가 모자라면 '판정 없음' + 까닭,
 * analysis.abs 자체가 없어도(보정 · 궤적이 없어 판정 함수가 null) 빈 자리 대신 '판정 없음'과 모자란 것.
 * 영상 다시 보기 · 3D 는 따로 된 단추 둘(카드 전체를 누르는 단추 안에 3D 단추가 겹쳐 둘이 같이 열리던 것). 3D 는 판정 · 궤적(distance.fit)이 다 있을 때만.
 * 판정이 들어올 때 한 번 옅게 떠오르고(움직임 줄이기면 없이), 부모가 공마다 key 를 바꿔 준다. 어두운 바탕 기준 색(바탕은 부모 카드).
 */
export function VerdictCard({
  abs,
  fit,
  hadFit = !!fit,
  hand = null,
  speed,
  onReplay,
}: {
  abs: AbsAnalysis | null;
  fit?: FitSnapshot | null;
  /** 엔진이 궤적을 맞췄나(analysis.distance.fit) — abs 가 없을 때 까닭을 고른다 */
  hadFit?: boolean;
  /** 타자 타석 — 모르면 null(몸쪽 · 바깥쪽 대신 1루 · 3루 쪽) */
  hand?: 'R' | 'L' | null;
  /** '123.4 km/h' — 구속을 잰 공만 */
  speed?: string | null;
  onReplay?: () => void;
}) {
  const reduce = useReducedMotion();
  const head = absHeadOf(abs);
  const v = head === 'strike' || head === 'ball' ? abs!.verdict! : null;
  const title = head === 'contact' ? '타격 · 판정 없음' : HEAD_LABEL[head];
  const place = v ? placeText(v, hand) : null;
  const why = v ? (v.reasons[0] ?? null) : noVerdictReason(abs, hadFit);
  const who = abs ? `타자 ${abs.batter} · ${abs.heightCm}cm` : null;
  const show3d = !!(v && fit && abs && abs.event !== 'contact');
  const label = [title, v?.borderline ? '경계' : null, v?.confidence === 'low' ? '참고' : null, place, who, speed ? `구속 ${speed}` : null].filter(Boolean).join(', ');
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(180)}>
      <View style={st.top} accessible accessibilityLabel={label}>
        {v ? (
          <View style={[st.ball, head === 'strike' && { backgroundColor: SKY }]}>
            <Text style={st.ballText}>{head === 'strike' ? 'S' : 'B'}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* 320px · 큰 글자에서도 한 줄 — 넘치면 글자를 줄인다(격자 · S/B 원과 한 줄에 선다) */}
          <Text style={[st.head, !v && st.headQuiet]} numberOfLines={v ? 1 : 2} adjustsFontSizeToFit={!!v} minimumFontScale={0.6}>
            {title}
          </Text>
          {v && (v.borderline || v.confidence === 'low') ? (
            <View style={st.badges}>
              {v.borderline ? (
                <View style={[st.badge, st.badgeEdge]}>
                  <Text style={[st.badgeText, { color: '#fcd34d' }]}>경계</Text>
                </View>
              ) : null}
              {v.confidence === 'low' ? (
                <View style={st.badge}>
                  <Text style={st.badgeText}>참고</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {place ? <Text style={st.place}>{place}</Text> : null}
          {who ? <Text style={st.meta}>{who}</Text> : null}
          {why ? <Text style={st.reason}>{why}</Text> : null}
        </View>
        {v && abs ? <MiniZone abs={abs} /> : null}
      </View>
      {speed ? <Text style={st.speed}>구속 {speed}</Text> : null}
      {onReplay || show3d ? (
        <View style={st.actions}>
          {onReplay ? (
            <Press accessibilityRole="button" onPress={onReplay} style={st.action}>
              <Text style={st.actionText}>영상 다시 보기</Text>
            </Press>
          ) : null}
          {show3d ? <Abs3dButton abs={abs!} fit={fit!} /> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

/** 9칸 격자 + 통과점 — 칸 · 점은 저장된 판정 그대로(칸이 없으면 칸 강조 없음, 통과점이 없으면 점 없음) */
function MiniZone({ abs }: { abs: AbsAnalysis }) {
  const v = abs.verdict!;
  const box = zoneWorld(abs.heightCm, RULES[abs.rule]);
  /* 통과점의 격자 안 자리(0~1, 왼쪽 위 원점) — 상자 밖이면 가장자리 조금 밖에 */
  const dot = abs.cross
    ? {
        x: clamp((abs.cross.x - box.left) / (box.right - box.left), -0.18, 1.18),
        y: clamp((box.top - abs.cross.y) / (box.top - box.bottom), -0.18, 1.18),
      }
    : null;
  return (
    <View style={st.grid} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={[st.cell, v.cell === i + 1 && { backgroundColor: 'rgba(10,132,214,0.6)' }]} />
      ))}
      {dot ? (
        <View
          pointerEvents="none"
          style={[st.dot, { backgroundColor: v.call === 'strike' ? SKY : WARN, left: (0.12 + dot.x * 0.76) * GRID - 6, top: (0.12 + dot.y * 0.76) * GRID - 6 }]}
        />
      ) : null}
    </View>
  );
}

/**
 * 3D 둘러보기 — 판정 · 궤적은 아직 저장 전 공일 수 있어 주소가 아니라 웹뷰가 뜨기 전에 넣는다(window.__ABS3D, app/embed/abs/abs-embed.tsx).
 * 웹의 ✕ 가 { t: 'abs', kind: 'close' } 를 보내면 닫는다. 로그인은 앱 껍데기와 같은 'session' 쿠키(sharedCookiesEnabled).
 * 저장 창 공 목록에서도 쓴다(velocity.tsx, light) — 판정 · 궤적이 있는 공만 넘긴다.
 */
export function Abs3dButton({ abs, fit, light = false }: { abs: AbsAnalysis; fit: FitSnapshot; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { t?: string; kind?: string };
      if (m.t === 'abs' && m.kind === 'close') setOpen(false);
    } catch {
      /* 다른 말은 버린다 */
    }
  };
  return (
    <>
      <Press accessibilityRole="button" accessibilityHint="존과 공이 지난 자리를 3D 로 열어요" onPress={() => setOpen(true)} style={[st.action, light && st.actionLight]}>
        <Text style={[st.actionText, light && { color: '#1d1d1f' }]}>3D로 둘러보기</Text>
      </Press>
      <Modal visible={open} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#151722' }}>
          <WebView
            source={{ uri: `${SITE_URL}/embed/abs` }}
            applicationNameForUserAgent={APP_UA}
            sharedCookiesEnabled
            injectedJavaScriptBeforeContentLoaded={`window.__ABS3D=${JSON.stringify({ abs, fit })};true;`}
            onMessage={onMessage}
            style={{ flex: 1, backgroundColor: '#151722' }}
          />
        </View>
      </Modal>
    </>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

const GRID = 64;
const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ball: { width: 44, height: 44, borderRadius: 22, marginTop: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  ballText: { color: '#fff', fontSize: 24, fontFamily: 'ui-rounded', fontWeight: '800' },
  head: { color: '#fff', fontSize: 32, lineHeight: 38, fontFamily: 'ui-rounded', fontWeight: '800', letterSpacing: -0.5 },
  headQuiet: { fontSize: 24, lineHeight: 30, color: 'rgba(255,255,255,0.85)' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  badgeEdge: { backgroundColor: 'rgba(245,158,11,0.25)' },
  badgeText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  place: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 4 },
  meta: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
  reason: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  speed: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', marginTop: 8, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  action: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  actionLight: { backgroundColor: '#e5e5ea' },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  grid: { width: GRID, height: GRID, padding: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  cell: { width: (GRID - 4 - 4) / 3, height: (GRID - 4 - 4) / 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(0,0,0,0.6)' },
});
