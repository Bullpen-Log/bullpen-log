import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DualCamera, DualCameraPreview, type StartInfo, type ThrowEvent } from '../../modules/dual-camera';

/**
 * 구속 측정(네이티브) — 1판: 카메라를 켜고 미리보기 · 던짐 알림만 보인다(2026-10-17 검토 D3 의 첫 조각).
 *
 * 다음 판에서 숨은 웹뷰 계산기(D5)로 클립을 재고, 설정 단계 · 결과 · 저장을 옮긴다. 지금은 앱 카메라 부품이 RN 에서 도는지 보는 화면이다.
 * 카메라 조건은 사이트와 같다(1080p · 60fps · 2배 줌 · 손떨림 보정 — '모두 같은 기준 조건').
 */
export default function VelocityScreen() {
  const inset = useSafeAreaInsets();
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [throws, setThrows] = useState<ThrowEvent[]>([]);

  useEffect(() => {
    let alive = true;
    const subs = [
      DualCamera.addListener('throw', (e) => setThrows((list) => [e, ...list].slice(0, 5))),
      DualCamera.addListener('fps', (e) => setFps(Math.round(e.fps))),
      DualCamera.addListener('error', (e) => setError(e.message)),
    ];
    DualCamera.start({ fps: 60, short: 1080, zoom: 2, armed: true, wide: false, focusFar: false })
      .then((i) => alive && setInfo(i))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
      void DualCamera.stop();
    };
  }, []);

  return (
    <View style={styles.root}>
      <DualCameraPreview style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: inset.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>‹</Text>
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {error ? '카메라 오류' : info ? `${info.mainHeight}p · ${fps ?? Math.round(info.mainFps)}fps` : '카메라 켜는 중'}
          </Text>
        </View>
      </View>
      <View style={[styles.bottom, { paddingBottom: inset.bottom + 16 }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {throws.map((t, i) => (
          <Text key={`${t.atSec}-${i}`} style={styles.line}>
            {t.kind === 'ball' ? '투구를 인식했어요' : t.kind === 'seed' ? '공 후보' : t.kind === 'skip' ? '발열로 쉼' : '움직임'} ·{' '}
            {t.atSec.toFixed(2)}s
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  pill: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 6 },
  line: { color: '#fff', fontSize: 15, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  error: { color: '#ff6b6b', fontSize: 15, fontWeight: '600' },
});
