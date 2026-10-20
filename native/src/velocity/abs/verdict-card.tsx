import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { AbsAnalysis, FitSnapshot } from '@/lib/abs/analysis';
import { APP_UA, SITE_URL } from '~/lib/site';
import { verdictText } from '@/lib/abs/judge';
import { RULES } from '@/lib/abs/rules';
import { zoneWorld } from '@/lib/abs/zone';
import { Press } from '~/shell/press';

const SKY = '#0a84d6';
const WARN = '#f59e0b';

/**
 * 판정 카드(앱) — 측정 중 방금 공 카드 위에 뜬다(웹 components/abs/verdict-card.tsx 와 같은 내용): S / B 크게 · 가장자리까지 거리 한 줄 ·
 * 9칸 미니 격자에 통과점 · '경계' · '참고' 배지. 타격이면 '타격', 판정을 못 냈으면 까닭 한 줄. 어두운 바탕 기준 색.
 * fit(궤적 스냅샷 analysis.distance.fit)이 있으면 밑에 '3D 로 둘러보기' — 사이트 app/embed/abs 를 전체 화면 웹뷰로(3D 는 웹 WebGL 한 벌).
 */
export function VerdictCard({ abs, fit, hand = 'R' }: { abs: AbsAnalysis; fit?: FitSnapshot | null; hand?: 'R' | 'L' }) {
  return (
    <View>
      <Verdict abs={abs} hand={hand} />
      {fit && abs.verdict ? <Abs3dButton abs={abs} fit={fit} /> : null}
    </View>
  );
}

/**
 * 3D 둘러보기 — 판정 · 궤적은 아직 저장 전 공일 수 있어 주소가 아니라 웹뷰가 뜨기 전에 넣는다(window.__ABS3D, app/embed/abs/abs-embed.tsx).
 * 웹의 ✕ 가 { t: 'abs', kind: 'close' } 를 보내면 닫는다. 로그인은 앱 껍데기와 같은 'session' 쿠키(sharedCookiesEnabled).
 */
function Abs3dButton({ abs, fit }: { abs: AbsAnalysis; fit: FitSnapshot }) {
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
      <Press accessibilityRole="button" onPress={() => setOpen(true)} style={st.open3d}>
        <Text style={st.open3dText}>3D 로 둘러보기</Text>
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

function Verdict({ abs, hand }: { abs: AbsAnalysis; hand: 'R' | 'L' }) {
  const v = abs.verdict;
  const strike = v?.call === 'strike';
  if (abs.event === 'contact') {
    return (
      <View style={st.row}>
        <Text style={st.bigText}>타격</Text>
        <Text style={st.sub}>쳐서 판정하지 않아요.</Text>
      </View>
    );
  }
  if (!v) {
    return (
      <View style={st.row}>
        <Text style={[st.bigText, { color: 'rgba(255,255,255,0.6)' }]}>—</Text>
        <Text style={st.sub}>{abs.reason ?? '판정을 못 했어요.'}</Text>
      </View>
    );
  }
  const box = zoneWorld(abs.heightCm, RULES[abs.rule]);
  /* 통과점의 격자 안 자리(0~1, 왼쪽 위 원점) — 상자 밖이면 가장자리 조금 밖에 */
  const dot = abs.cross
    ? {
        x: clamp((abs.cross.x - box.left) / (box.right - box.left), -0.18, 1.18),
        y: clamp((box.top - abs.cross.y) / (box.top - box.bottom), -0.18, 1.18),
      }
    : null;
  return (
    <View style={st.row}>
      <View style={[st.ball, strike && { backgroundColor: SKY }]} accessibilityLabel={strike ? '스트라이크' : '볼'}>
        <Text style={st.ballText}>{strike ? 'S' : 'B'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.title}>{verdictText(v, hand)}</Text>
        <View style={st.metaRow}>
          <Text style={st.meta}>
            타자 {abs.batter} · {abs.heightCm}cm
          </Text>
          {v.borderline ? (
            <View style={[st.badge, { backgroundColor: 'rgba(245,158,11,0.25)' }]}>
              <Text style={[st.badgeText, { color: '#fcd34d' }]}>경계</Text>
            </View>
          ) : null}
          {v.confidence === 'low' ? (
            <View style={st.badge}>
              <Text style={st.badgeText}>참고</Text>
            </View>
          ) : null}
        </View>
        {v.reasons[0] ? <Text style={st.reason}>{v.reasons[0]}</Text> : null}
      </View>
      <View style={st.grid}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={[st.cell, v.cell === i + 1 && { backgroundColor: 'rgba(10,132,214,0.6)' }]} />
        ))}
        {dot ? (
          <View
            pointerEvents="none"
            style={[
              st.dot,
              { backgroundColor: strike ? SKY : WARN, left: (0.12 + dot.x * 0.76) * GRID - 6, top: (0.12 + dot.y * 0.76) * GRID - 6 },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

const GRID = 64;
const st = StyleSheet.create({
  open3d: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 8 },
  open3dText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)' },
  bigText: { color: 'rgba(255,255,255,0.85)', fontSize: 30, fontFamily: 'ui-rounded', fontWeight: '700' },
  sub: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  ball: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  ballText: { color: '#fff', fontSize: 32, fontFamily: 'ui-rounded', fontWeight: '800' },
  title: { color: '#fff', fontSize: 17, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  meta: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  badgeText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  reason: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
  grid: { width: GRID, height: GRID, padding: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  cell: { width: (GRID - 4 - 4) / 3, height: (GRID - 4 - 4) / 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(0,0,0,0.6)' },
});
