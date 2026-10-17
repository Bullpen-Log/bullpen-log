import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DualCamera, DualCameraPreview, type StartInfo } from '../../modules/dual-camera';
import { AppCapture, type CaptureStatus, type MeasureSettings } from '~/velocity/capture';
import { VelocityEngine, type EngineHandle, type EngineResult } from '~/velocity/engine';

/**
 * 구속 측정(네이티브) — 2판: 카메라 → 던짐 알림 → 클립 → 숨은 웹뷰 계산기(D5) → 결과. 설정 단계 · 세션 거리 보정 · 저장은 다음 판.
 *
 * 카메라 조건 · 재기 조건은 사이트와 같다(1080p · 60fps · 2배 줌 · 투수 뒤 · 기준 거리 20m — lib/velocity-setup.ts
 * STANDARD_TARGET_DIST_M). 그 파일은 브라우저 저장소와 섞여 있어 아직 숫자만 옮겼다.
 */
const SETTINGS: MeasureSettings = {
  approach: 'receding',
  focalPerLongSide: null,
  releaseDistanceM: null,
  distanceM: 20,
  distanceAuto: false,
  tiltRad: null,
  /* 앱이 화각을 못 주면 — 15 Pro Max 2배 · 손떨림 보정의 긴 변 화각(실험대 38.3°) */
  fallbackFovDeg: 38.3,
};

type Row = { id: number; result: EngineResult };

export default function VelocityScreen() {
  const inset = useSafeAreaInsets();
  const engine = useRef<EngineHandle>(null);
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [status, setStatus] = useState<{ status: CaptureStatus; visible: number }>({ status: 'armed', visible: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    const capture = new AppCapture(
      () => engine.current,
      () => SETTINGS,
      {
        onResult: (result, meta) => {
          setRows((list) => [{ id: meta.id, result }, ...list].slice(0, 20));
          /* 클립 올리기(저장)는 다음 판 — 지금은 다 쓴 클립을 지운다 */
          void DualCamera.discard({ paths: [meta.clip.path] });
        },
        onStatus: (s, visible) => setStatus({ status: s, visible }),
        onNotice: (m) => setNotice(m),
      }
    );
    const subs = [
      DualCamera.addListener('throw', (e) => capture.onThrow(e)),
      DualCamera.addListener('fps', (e) => setFps(Math.round(e.fps))),
      DualCamera.addListener('error', (e) => setError(e.message)),
    ];
    /* 사이트(dual-capture start)와 같은 옵션 — 화질은 앱이 고르게(short 를 안 넘김), 투수 뒤라 2배 · 먼 곳만 초점.
       켜고 나서 알아채기를 켠다(setTrigger armed — 초점을 한 번 맞추고 잠근다) */
    DualCamera.start({ fps: 60, zoom: 2, armed: false, wide: false, focus: { x: 0.5, y: 0.5 }, focusFar: true })
      .then(async (i) => {
        if (!alive) return;
        setInfo(i);
        await DualCamera.setTrigger({ armed: true });
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      capture.stop();
      subs.forEach((s) => s.remove());
      void DualCamera.stop();
    };
  }, []);

  const best = rows.find((r) => r.result.measure.ok && r.result.measure.confidence === 'high');

  return (
    <View style={styles.root}>
      <DualCameraPreview style={StyleSheet.absoluteFill} />
      <VelocityEngine ref={engine} />
      <View style={[styles.top, { paddingTop: inset.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>‹</Text>
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {error ? '카메라 오류' : info ? `${info.mainHeight}p · ${fps ?? Math.round(info.mainFps)}fps` : '카메라 켜는 중'}
          </Text>
        </View>
        {status.visible > 0 ? (
          <View style={[styles.pill, styles.live]}>
            <Text style={styles.pillText}>{status.status === 'analyzing' ? '구속 계산 중' : '투구를 인식했어요'}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.bottom, { paddingBottom: inset.bottom + 16 }]}>
        {best?.result.measure.ok ? (
          <Text style={styles.big}>
            {best.result.measure.kmh.toFixed(1)}
            <Text style={styles.unit}> km/h</Text>
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.line}>{notice}</Text> : null}
        {rows.slice(0, 5).map(({ id, result }) => (
          <Text key={id} style={styles.line}>
            {result.measure.ok
              ? result.measure.confidence === 'high'
                ? `${result.measure.kmh.toFixed(1)} km/h`
                : `측정 불가 · 믿음 ${result.measure.confidence === 'medium' ? '보통' : '낮음'}(${result.measure.kmh.toFixed(1)})`
              : `측정 불가 · ${result.measure.code}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  pill: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' },
  live: { backgroundColor: 'rgba(10,132,214,0.85)' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 6 },
  big: { color: '#fff', fontSize: 56, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 20, fontWeight: '600' },
  line: { color: '#fff', fontSize: 15, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  error: { color: '#ff6b6b', fontSize: 15, fontWeight: '600' },
});
