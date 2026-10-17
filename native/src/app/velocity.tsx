import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tiltOf } from '@/lib/device-tilt';
import { NO_CALIBRATION, type CalFit } from '@/lib/velocity-calibration';
import { EFFORT_CHIPS } from '@/lib/pitch-effort';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import {
  DEFAULT_SETUP,
  ZONE_WIDTH_RANGE,
  centerZone,
  fitZone,
  frameRectToView,
  parseSetup,
  type CameraPos,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { DualCamera, DualCameraPreview, type StartInfo } from '../../modules/dual-camera';
import { rpc, RpcError } from '~/lib/rpc';
import { loadJson, saveJson } from '~/lib/store';
import { AppCapture, type CaptureStatus, type MeasureSettings } from '~/velocity/capture';
import { VelocityEngine, type EngineHandle } from '~/velocity/engine';
import { decide, saveSession, shownKmh, statsOf, type NativePitch, type SessionCtx } from '~/velocity/session';

/**
 * 구속 측정(네이티브) — 3판: 설정(지난 설정 · 종류 · 카메라 자리) → 수평 → 스트라이크 존 → 측정(던짐 알림 → 클립 → 숨은 웹뷰 계산기) →
 * 세션 저장(체감 강도 · 클립). 잰 공을 받는 규칙 · 세션 거리 보정은 웹과 같은 lib/velocity-session.ts.
 *
 * 카메라 조건은 웹과 같다(1080p · 60fps · 2배 줌 · 투수 뒤 · 기준 거리 20m — lib/velocity-setup.ts STANDARD_TARGET_DIST_M). 설정은 웹과
 * 같은 꼴로 앱 저장소에 둔다(parseSetup).
 */
const SETUP_KEY = 'bullpen-velocity-setup';
const SETTINGS: Omit<MeasureSettings, 'tiltRad'> = {
  approach: 'receding',
  focalPerLongSide: null,
  releaseDistanceM: null,
  distanceM: 20,
  distanceAuto: false,
  /* 앱이 화각을 못 주면 — 15 Pro Max 2배 · 손떨림 보정의 긴 변 화각(실험대 38.3°) */
  fallbackFovDeg: 38.3,
};
/** 수평으로 볼 좌우 · 앞뒤 기울기(도) — 웹 수평계(lib/use-device-level.ts LEVEL_OK_DEG · PITCH_OK_DEG)와 같다 */
const ROLL_OK = 1.5;
const PITCH_OK = 10;

type Step = 'loading' | 'ask' | 'type' | 'camera' | 'level' | 'zone' | 'measure';
type Start = { isAdmin: boolean; today: string; fit: CalFit };

export default function VelocityScreen() {
  const inset = useSafeAreaInsets();
  const engine = useRef<EngineHandle>(null);
  const [start, setStart] = useState<Start | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [stored, setStored] = useState<VelocitySetup | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [sessionType, setSessionType] = useState<string>(DEFAULT_SETUP.sessionType);
  const cameraPos: CameraPos = 'behind-pitcher';
  const [zone, setZone] = useState<ZoneRect>(DEFAULT_SETUP.zone);
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [status, setStatus] = useState<{ status: CaptureStatus; visible: number }>({ status: 'armed', visible: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [tilt, setTilt] = useState<{ roll: number; pitch: number } | null>(null);
  const [pitches, setPitches] = useState<NativePitch[]>([]);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [sheet, setSheet] = useState(false);
  const [effortPct, setEffortPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* 재기 흐름(AppCapture)은 한 번 만들어 쥐고, 지금 값은 ref 로 읽는다 */
  const pitchesRef = useRef<NativePitch[]>([]);
  const ctxRef = useRef<SessionCtx>({ cameraPos, zone, info: null });
  const tiltRef = useRef<number | null>(null);
  const todayRef = useRef<string | null>(null);
  const attempts = useRef(new Map<number, Promise<string | null>>());
  const captureRef = useRef<AppCapture | null>(null);
  useEffect(() => {
    ctxRef.current = { cameraPos, zone, info };
  }, [zone, info]);
  const fit = start?.fit ?? NO_CALIBRATION;

  /* 서버(관리자인가 · 오늘 · 보정식)와 지난 설정 */
  useEffect(() => {
    let alive = true;
    void Promise.all([
      rpc<{ ok: true; isAdmin: boolean; pitchLocked: boolean; today: string; fit: CalFit } | { ok: false; error: string }>(
        'velocity.loadVelocityStart'
      ),
      loadJson(SETUP_KEY),
    ])
      .then(([res, raw]) => {
        if (!alive) return;
        if (!res.ok) return setBlocked(res.error);
        if (res.pitchLocked) return setBlocked('투구 기록 첫 설정을 먼저 마쳐 주세요.');
        todayRef.current = res.today;
        setStart({ isAdmin: res.isAdmin, today: res.today, fit: res.fit });
        const s = parseSetup(raw);
        setStored(s);
        setStep(s ? 'ask' : 'type');
      })
      .catch((e: unknown) => alive && setBlocked(e instanceof RpcError ? e.message : '서버에 닿지 못했어요.'));
    return () => {
      alive = false;
    };
  }, []);

  /* 카메라 — 화면을 열면 켜 두고(설정 단계 뒤로 보이게), 알아채기는 측정 단계에서만 */
  useEffect(() => {
    let alive = true;
    const capture = new AppCapture(
      () => engine.current,
      () => ({ ...SETTINGS, tiltRad: tiltRef.current }),
      {
        onResult: (result, meta) => {
          const out = decide(result, pitchesRef.current, ctxRef.current, meta);
          if (out.notice) setNotice(out.notice);
          if (out.list) {
            pitchesRef.current = out.list;
            setPitches(out.list);
            setNotice(null);
          }
          return out.verdict;
        },
        onStatus: (s, visible) => setStatus({ status: s, visible }),
        onNotice: (m) => setNotice(m),
        onAttempt: (a) => {
          const date = todayRef.current;
          if (!date) return;
          attempts.current.set(
            a.id,
            rpc<{ ok: true; id: string } | { ok: false }>('velocity.recordVelocityAttempt', { date, ...a })
              .then((r) => (r.ok ? r.id : null))
              .catch(() => null)
          );
        },
      }
    );
    capture.armed = false;
    captureRef.current = capture;
    const subs = [
      DualCamera.addListener('throw', (e) => capture.onThrow(e)),
      DualCamera.addListener('fps', (e) => setFps(Math.round(e.fps))),
      DualCamera.addListener('error', (e) => setError(e.message)),
      DualCamera.addListener('level', (g) => {
        const t = tiltOf([g.x, g.y, g.z]);
        /* 웹 수평계처럼 살짝 다듬는다(0.1초 알림 · 약 0.25초) */
        setTilt((prev) =>
          prev ? { roll: prev.roll + 0.35 * (t.roll - prev.roll), pitch: prev.pitch + 0.35 * (t.pitch - prev.pitch) } : t
        );
      }),
    ];
    /* 사이트(dual-capture start)와 같은 옵션 — 투수 뒤라 2배 · 먼 곳만 초점 */
    DualCamera.start({ fps: 60, zoom: 2, armed: false, wide: false, focus: { x: 0.5, y: 0.5 }, focusFar: true })
      .then((i) => alive && setInfo(i))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    void DualCamera.level({ on: true });
    return () => {
      alive = false;
      capture.stop();
      subs.forEach((s) => s.remove());
      void DualCamera.level({ on: false });
      void DualCamera.stop();
    };
  }, []);

  /* 엔진에 넘기는 카메라 앞뒤 기울기(웹 velocity-screen 의 setTilt — 위를 보면 +) */
  useEffect(() => {
    tiltRef.current = tilt ? (-tilt.pitch * Math.PI) / 180 : null;
  }, [tilt]);

  /* 측정 단계에서만 알아채기 — 켜면 초점을 한 번 맞추고 잠근다 */
  useEffect(() => {
    const capture = captureRef.current;
    if (!capture || !info) return;
    const armed = step === 'measure' && !sheet;
    capture.armed = armed;
    void DualCamera.setTrigger({ armed });
  }, [step, sheet, info]);

  const begin = (s: Pick<VelocitySetup, 'sessionType' | 'zone'>) => {
    setSessionType(s.sessionType);
    setZone(s.zone);
    setStep('measure');
    void saveJson(SETUP_KEY, { ...DEFAULT_SETUP, sessionType: s.sessionType, cameraPos, zone: s.zone, savedAt: new Date().toISOString() });
  };

  const discardAll = (list: NativePitch[]) => {
    const paths = list.map((p) => p.clip.path);
    if (paths.length) void DualCamera.discard({ paths });
  };
  const close = () => {
    if (!pitches.length) return router.back();
    Alert.alert('저장하지 않고 나갈까요?', `잰 공 ${pitches.length}개가 사라져요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: () => {
          discardAll(pitches);
          router.back();
        },
      },
    ]);
  };
  const remove = (id: number) => {
    const gone = pitches.find((p) => p.id === id);
    if (gone) discardAll([gone]);
    const next = pitches.filter((p) => p.id !== id);
    pitchesRef.current = next;
    setPitches(next);
  };
  const save = async () => {
    if (!start || saving || !pitches.length) return;
    if (effortPct == null) return setSaveError('체감 강도를 골라 주세요.');
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveSession({
        date: start.today,
        sessionType,
        effortPct,
        ctx: ctxRef.current,
        pitches,
        isAdmin: start.isAdmin,
        attemptIds: attempts.current,
      });
      if (!res.ok) return setSaveError(res.error);
      pitchesRef.current = [];
      setPitches([]);
      attempts.current.clear();
      setSheet(false);
      Alert.alert(
        '저장했어요',
        res.clipFailed ? `영상 ${res.clipFailed}개는 붙이지 못했어요(측정값은 저장됐어요).` : '투구 기록으로도 남겨 주세요.',
        [{ text: '확인', onPress: () => router.back() }]
      );
    } catch (e) {
      setSaveError(e instanceof RpcError ? e.message : '저장하지 못했어요. 잰 공은 그대로 있으니 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const level = tilt && Math.abs(tilt.roll) <= ROLL_OK && Math.abs(tilt.pitch) <= PITCH_OK;
  const last = pitches.at(-1);
  const stats = statsOf(pitches, fit);
  const frame = info ? { width: info.mainWidth, height: info.mainHeight } : { width: 1080, height: 1920 };
  const zoneView = view.width ? frameRectToView(zone, frame, view) : null;
  const resizeZone = (dir: 1 | -1) => {
    const [lo, hi] = ZONE_WIDTH_RANGE[cameraPos];
    const w = Math.max(lo, Math.min(hi, zone.w * (dir > 0 ? 1.15 : 1 / 1.15)));
    setZone(fitZone(centerZone({ ...zone, w, h: zone.h * (w / zone.w) }), cameraPos, frame));
  };

  return (
    <View style={styles.root} onLayout={(e) => setView(e.nativeEvent.layout)}>
      <DualCameraPreview style={StyleSheet.absoluteFill} />
      <VelocityEngine ref={engine} />
      {(step === 'zone' || step === 'measure') && zoneView ? (
        <View
          pointerEvents="none"
          style={[
            styles.zone,
            {
              left: zoneView.x * view.width,
              top: zoneView.y * view.height,
              width: zoneView.w * view.width,
              height: zoneView.h * view.height,
            },
          ]}
        />
      ) : null}

      <View style={[styles.top, { paddingTop: inset.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} style={styles.close}>
          <Text style={styles.closeText}>‹</Text>
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {error ? '카메라 오류' : info ? `${info.mainHeight}p · ${fps ?? Math.round(info.mainFps)}fps` : '카메라 켜는 중'}
          </Text>
        </View>
        {step === 'measure' && status.visible > 0 ? (
          <View style={[styles.pill, styles.live]}>
            <Text style={styles.pillText}>{status.status === 'analyzing' ? '구속 계산 중' : '투구를 인식했어요'}</Text>
          </View>
        ) : null}
      </View>

      {blocked ? (
        <Panel inset={inset.bottom} title={blocked}>
          <Button label="닫기" onPress={() => router.back()} />
        </Panel>
      ) : step === 'loading' ? null : step === 'ask' && stored ? (
        <Panel inset={inset.bottom} title="지난 설정으로 할까요?" body={`${stored.sessionType} · 투수 뒤`}>
          <Button label="이 설정으로 시작" onPress={() => begin(stored)} />
          <Button label="새로 설정" kind="ghost" onPress={() => setStep('type')} />
        </Panel>
      ) : step === 'type' ? (
        <Panel inset={inset.bottom} title="어떤 투구인가요?" body="투구 기록을 남길 때 이 종류로 채워요.">
          <Chips
            items={SESSION_TYPES.filter((t) => !isRestSession(t.name)).map((t) => t.name)}
            value={sessionType}
            onChange={setSessionType}
          />
          <Button label="다음" onPress={() => setStep('camera')} />
        </Panel>
      ) : step === 'camera' ? (
        <Panel
          inset={inset.bottom}
          title="투수 뒤에 폰을 두세요"
          body="삼각대에 세워 투수 뒤 약 1m 에 두고, 미트까지 화면에 들어오게 해요. 2배 줌 · 기준 거리 20m 로 재요."
        >
          <Button label="다음" onPress={() => setStep('level')} />
        </Panel>
      ) : step === 'level' ? (
        <Panel
          inset={inset.bottom}
          title={level ? '수평이에요' : '폰을 수평으로 맞춰 주세요'}
          body={
            tilt
              ? `좌우 ${tilt.roll.toFixed(1)}° · 앞뒤 ${tilt.pitch.toFixed(0)}°${level ? '' : '. 좌우 1.5° · 앞뒤 10° 안으로'}`
              : '기울기를 읽는 중이에요'
          }
          ok={!!level}
        >
          <Button label="다음" onPress={() => setStep('zone')} />
        </Panel>
      ) : step === 'zone' ? (
        <Panel inset={inset.bottom} title="스트라이크 존 크기를 맞춰 주세요" body="미트 자리의 존에 맞게 키우거나 줄여요.">
          <View style={styles.row}>
            <Button label="작게" kind="ghost" onPress={() => resizeZone(-1)} flex />
            <Button label="크게" kind="ghost" onPress={() => resizeZone(1)} flex />
          </View>
          <Button label="측정 시작" onPress={() => begin({ sessionType, zone })} />
        </Panel>
      ) : (
        <View style={[styles.bottom, { paddingBottom: inset.bottom + 16 }]}>
          {last ? (
            <Text style={styles.big}>
              {shownKmh(last, fit).toFixed(1)}
              <Text style={styles.unit}> km/h</Text>
            </Text>
          ) : (
            <Text style={styles.line}>던지면 저절로 재요</Text>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.line}>{notice}</Text> : null}
          {stats ? (
            <Text style={styles.line}>
              {stats.n}구 · 최고 {stats.max.toFixed(1)} · 평균 {stats.avg.toFixed(1)}
            </Text>
          ) : null}
          {pitches.length ? <Button label="세션 끝내기" onPress={() => setSheet(true)} /> : null}
        </View>
      )}

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <View style={styles.scrim}>
          <View style={[styles.sheet, { paddingBottom: inset.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>세션 저장하기</Text>
            {stats ? (
              <Text style={styles.sheetBody}>
                {stats.n}구 · 최고 {stats.max.toFixed(1)} km/h · 평균 {stats.avg.toFixed(1)} km/h
              </Text>
            ) : null}
            <ScrollView style={styles.list}>
              {pitches.map((p, i) => (
                <View key={p.id} style={styles.listRow}>
                  <Text style={styles.listText}>
                    {i + 1}. {shownKmh(p, fit).toFixed(1)} km/h{p.notes.length ? ` · ${p.notes[0]}` : ''}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${i + 1}번 공 지우기`} onPress={() => remove(p.id)} hitSlop={8}>
                    <Text style={styles.remove}>지우기</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.label}>종류</Text>
            <Chips
              items={SESSION_TYPES.filter((t) => !isRestSession(t.name)).map((t) => t.name)}
              value={sessionType}
              onChange={setSessionType}
              light
            />
            <Text style={styles.label}>체감 강도</Text>
            <Chips
              items={EFFORT_CHIPS.map((v) => `${v}%`)}
              value={effortPct == null ? null : `${effortPct}%`}
              onChange={(v) => {
                setEffortPct(Number.parseInt(v, 10));
                setSaveError(null);
              }}
              light
            />
            {saveError ? <Text style={styles.errorDark}>{saveError}</Text> : null}
            <Button label={saving ? '저장하는 중' : '저장하기'} onPress={save} disabled={saving} />
            <Button label="더 재기" kind="ghostDark" onPress={() => setSheet(false)} disabled={saving} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Panel({
  title,
  body,
  ok,
  inset,
  children,
}: {
  title: string;
  body?: string;
  ok?: boolean;
  inset: number;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.panel, { marginBottom: inset + 16 }]}>
      <Text style={[styles.panelTitle, ok ? styles.okText : null]}>{title}</Text>
      {body ? <Text style={styles.panelBody}>{body}</Text> : null}
      <View style={styles.panelActions}>{children}</View>
    </View>
  );
}

function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  flex,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'ghostDark';
  disabled?: boolean;
  flex?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' ? styles.primary : kind === 'ghost' ? styles.ghost : styles.ghostDark,
        flex ? { flex: 1 } : null,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, kind === 'ghostDark' ? { color: '#1d1d1f' } : null]}>{label}</Text>
    </Pressable>
  );
}

function Chips({
  items,
  value,
  onChange,
  light,
}: {
  items: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
  light?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {items.map((it) => {
        const on = it === value;
        return (
          <Pressable
            key={it}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it)}
            style={[styles.chip, light ? styles.chipLight : null, on ? styles.chipOn : null]}
          >
            <Text style={[styles.chipText, light && !on ? { color: '#1d1d1f' } : null]}>{it}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  zone: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 4 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  pill: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' },
  live: { backgroundColor: 'rgba(10,132,214,0.85)' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 8 },
  big: { color: '#fff', fontSize: 56, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 20, fontWeight: '600' },
  line: { color: '#fff', fontSize: 15, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  error: { color: '#ff6b6b', fontSize: 15, fontWeight: '600' },
  errorDark: { color: '#d70015', fontSize: 15, fontWeight: '600' },
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  panelTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  okText: { color: '#30d158' },
  panelBody: { color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 21 },
  panelActions: { gap: 8, marginTop: 8 },
  row: { flexDirection: 'row', gap: 8 },
  button: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: '#0a84d6' },
  ghost: { backgroundColor: 'rgba(255,255,255,0.14)' },
  ghostDark: { backgroundColor: '#e5e5ea' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  chipLight: { backgroundColor: '#e5e5ea' },
  chipOn: { backgroundColor: '#0a84d6' },
  chipText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#f2f2f7', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8, maxHeight: '85%' },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: '#1d1d1f' },
  sheetBody: { fontSize: 15, color: '#3a3a3c' },
  list: { maxHeight: 200 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 8 },
  listText: { flex: 1, fontSize: 15, color: '#1d1d1f' },
  remove: { fontSize: 15, color: '#d70015', fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: '#6e6e73', marginTop: 8 },
});
