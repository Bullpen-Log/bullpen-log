import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Press } from '~/shell/press';

/**
 * 측정 중 '카메라 위치 확인 필요'(앱) — 삼각대 감시(use-abs drift)가 플레이트 앞변이 처음 자리에서 2px 넘게 밀렸다고 볼 때.
 * 지금 동작 그대로 알린다: 판정은 멈추지 않고 경계 띠를 넓혀 이어 간다(lib/abs/stability.ts bandsFor). [앞변 다시 맞추기]는 지금 장면에서 앞변을 다시 찾아
 * 기준을 바꾼다(use-abs recalibrate — 못 찾으면 그대로 두고 까닭을 알림). 판정 · 저장을 멈추는 것은 이번 범위 밖(2026-10-29).
 */
export function AbsDriftWarn({ onFix }: { onFix: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <View style={st.box} accessibilityRole="alert">
      <Text style={st.title}>카메라 위치 확인 필요</Text>
      <Text style={st.body}>폰이 조금 움직였어요. 판정은 경계 띠를 넓혀 이어 가요.</Text>
      <Press
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void Promise.resolve(onFix()).finally(() => setBusy(false));
        }}
        style={st.btn}
      >
        {busy ? <ActivityIndicator color="#1d1d1f" /> : <Text style={st.btnText}>앞변 다시 맞추기</Text>}
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  box: { marginTop: 8, padding: 12, borderRadius: 16, backgroundColor: 'rgba(180,83,9,0.88)', gap: 4 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  btn: { alignSelf: 'flex-start', minHeight: 44, marginTop: 6, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center' },
  btnText: { color: '#1d1d1f', fontSize: 14, fontWeight: '700' },
});
