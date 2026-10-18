import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tiltOf } from '@/lib/device-tilt';
import { NO_CALIBRATION, type CalFit } from '@/lib/velocity-calibration';
import { EFFORT_CHIPS, effortScaleText } from '@/lib/pitch-effort';
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
import { clearDraft, loadDraft, saveDraft } from '~/velocity/draft';
import { ClipModal } from '~/velocity/clip-modal';
import { PITCH_TYPES } from '@/lib/velocity-meta';
import { CardButton, ChromeButton, ChromePill, GuideCard, InfoPill, LevelBubble, RED, Shutter, ShutterLabel, SideButton, SideGap } from '~/velocity/camera-ui';

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

/** 저장 안 하고 버리는 공의 클립 파일을 지운다 */
const discardAll = (list: NativePitch[]) => {
  const paths = list.map((p) => p.clip.path);
  if (paths.length) void DualCamera.discard({ paths });
};

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
  /** 카메라 권한을 거절했나 — 설정을 바꾸면 iOS 가 앱을 다시 켜므로 돌아와 다시 켜기는 없다 */
  const [denied, setDenied] = useState(false);
  const [fps, setFps] = useState<{ fps: number; dropped: number } | null>(null);
  const [status, setStatus] = useState<{ status: CaptureStatus; visible: number }>({ status: 'armed', visible: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [tilt, setTilt] = useState<{ roll: number; pitch: number } | null>(null);
  const [pitches, setPitches] = useState<NativePitch[]>([]);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [sheet, setSheet] = useState(false);
  const [effortPct, setEffortPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /* 세션 저장 창에서 펼친 공(구종 고르기 · 영상) · 다시 보는 클립 */
  const [openId, setOpenId] = useState<number | null>(null);
  const [replay, setReplay] = useState<string | null>(null);
  /* 세션 날짜 — 보통 오늘, 맡겨 둔 세션을 이어 하면 그 날 */
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  /* 측정 시작 셔터를 눌렀나 — 웹처럼 카메라 화면에서 빨간 단추로 시작 */
  const [live, setLive] = useState(false);
  const [focusBusy, setFocusBusy] = useState(false);

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
  /* 공 목록을 바꾸는 곳은 모두 여기로 — ref(재기 흐름이 읽음) · 화면 · 폰에 맡긴 세션을 같이 */
  const draftReady = useRef(false);
  const setList = (next: NativePitch[]) => {
    pitchesRef.current = next;
    setPitches(next);
  };
  useEffect(() => {
    if (!draftReady.current) return;
    const date = sessionDate ?? todayRef.current;
    if (pitches.length && date) void saveDraft({ date, sessionType, pitches });
    else void clearDraft();
  }, [pitches, sessionType, sessionDate]);

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
        void loadDraft().then((d) => {
          if (!alive) return;
          if (!d) {
            draftReady.current = true;
            return;
          }
          const resume = () => {
            setList(d.pitches);
            setSessionType(d.sessionType);
            setSessionDate(d.date);
            if (s) setZone(s.zone);
            draftReady.current = true;
            setStep('measure');
            setLive(true);
            setSheet(true);
          };
          const drop = () => {
            discardAll(d.pitches);
            draftReady.current = true;
            void clearDraft();
          };
          Alert.alert('저장하지 않은 공이 있어요', `${d.date.slice(5).replace('-', '/')} ${d.sessionType} · ${d.pitches.length}구`, [
            { text: '지우기', style: 'destructive', onPress: drop },
            { text: '이어서 하기', style: 'default', onPress: resume },
          ]);
        });
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
            setList(out.list);
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
      DualCamera.addListener('fps', (e) => setFps({ fps: Math.round(e.fps), dropped: e.dropped })),
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
      .catch((e: unknown) => {
        if (!alive) return;
        setDenied((e as { code?: string }).code === 'denied');
        setError(e instanceof Error ? e.message : String(e));
      });
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
    const armed = step === 'measure' && live && !sheet;
    capture.armed = armed;
    void DualCamera.setTrigger({ armed });
  }, [step, live, sheet, info]);

  const begin = (s: Pick<VelocitySetup, 'sessionType' | 'zone'>) => {
    setSessionType(s.sessionType);
    setZone(s.zone);
    setStep('measure');
    void saveJson(SETUP_KEY, { ...DEFAULT_SETUP, sessionType: s.sessionType, cameraPos, zone: s.zone, savedAt: new Date().toISOString() });
  };

  /* 위 왼쪽 단추 — 설정 단계면 앞 단계로, 측정이면 닫기 */
  const PREV: Partial<Record<Step, Step>> = { camera: 'type', level: 'camera', zone: 'level' };
  const back = () => {
    const prev = PREV[step];
    if (prev) return setStep(prev);
    if (step === 'type' && stored) return setStep('ask');
    close();
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
          void clearDraft();
          router.back();
        },
      },
    ]);
  };
  const remove = (id: number) => {
    const gone = pitches.find((p) => p.id === id);
    if (gone) discardAll([gone]);
    setList(pitches.filter((p) => p.id !== id));
  };
  const setPitchType = (id: number, key: string) =>
    setList(pitches.map((p) => (p.id === id ? { ...p, pitchType: p.pitchType === key ? null : key } : p)));
  const save = async () => {
    if (!start || saving || !pitches.length) return;
    if (effortPct == null) return setSaveError('체감 강도를 골라 주세요.');
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveSession({
        date: sessionDate ?? start.today,
        sessionType,
        effortPct,
        ctx: ctxRef.current,
        pitches,
        isAdmin: start.isAdmin,
        attemptIds: attempts.current,
      });
      if (!res.ok) return setSaveError(res.error);
      setList([]);
      void clearDraft();
      setSessionDate(null);
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

  const setupNo: Partial<Record<Step, [number, string]>> = { type: [1, '투구 종류'], camera: [2, '카메라 자리'], level: [3, '수평'], zone: [4, '스트라이크 존'] };
  const no = setupNo[step];
  const measuring = step === 'measure' && live;
  const refocus = () => {
    if (focusBusy) return;
    setFocusBusy(true);
    /* 존 가운데에 맞추고(먼 곳만) 잠근다 — 앱 시작 옵션과 같은 '먼 곳' */
    void DualCamera.focus({ focus: { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 }, far: true })
      .catch(() => undefined)
      .finally(() => setTimeout(() => setFocusBusy(false), 600));
  };
  const showTips = () =>
    Alert.alert(
      '주의사항',
      ['삼각대에 세워 흔들리지 않게 두세요.', '투수 뒤 약 1m, 미트까지 화면에 들어오게요.', '해를 마주 보지 않게, 밝은 곳에서 재요.', '2배 줌 그대로 두세요(앱이 맞춰요).', '미트 뒤 그물이 흔들리면 잘 못 재요.'].join('\n')
    );
  const statusDot = status.visible > 0 ? (status.status === 'analyzing' ? '#fbbf24' : RED) : '#34d399';
  const statusText =
    status.visible > 0 ? (status.status === 'analyzing' ? '구속 계산 중' : '투구를 인식했어요') : pitches.length ? `측정 중 · ${pitches.length}구` : '던지면 저절로 재요';

  return (
    <View style={styles.root}>
      <View style={styles.finder} onLayout={(e) => setView(e.nativeEvent.layout)}>
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
          >
            {/* 존 9칸 격자 — 웹 ZoneOverlay 처럼 */}
            <View style={[styles.zoneLine, { left: '33.3%', top: 0, bottom: 0, width: 1 }]} />
            <View style={[styles.zoneLine, { left: '66.6%', top: 0, bottom: 0, width: 1 }]} />
            <View style={[styles.zoneLine, { top: '33.3%', left: 0, right: 0, height: 1 }]} />
            <View style={[styles.zoneLine, { top: '66.6%', left: 0, right: 0, height: 1 }]} />
          </View>
        ) : null}

        {/* 위 줄 — 뒤로 · 가운데 알약 · 재초점(웹 카메라 앱 꼴) */}
        <View style={[styles.top, { paddingTop: inset.top + 6 }]}>
          <ChromeButton icon={step === 'measure' ? 'x' : 'chevron-left'} label={step === 'measure' ? '닫기' : '뒤로'} onPress={back} />
          <View style={styles.topMid}>
            {no ? (
              <ChromePill>
                {no[0]}/4 · {no[1]}
              </ChromePill>
            ) : step === 'ask' ? (
              <ChromePill>지난 설정</ChromePill>
            ) : step === 'measure' ? (
              <ChromePill dot={measuring ? statusDot : 'rgba(255,255,255,0.5)'}>{measuring ? statusText : '측정 준비'}</ChromePill>
            ) : null}
          </View>
          {step !== 'measure' ? <ChromeButton icon="focus" label="초점 다시 맞추기" onPress={refocus} busy={focusBusy} disabled={!info} /> : <View style={{ width: 44 }} />}
        </View>
        {/* 둘째 줄 — 수평계 | 카메라 상태 */}
        <View style={[styles.second, { top: inset.top + 58 }]}>
          {tilt ? <LevelBubble roll={tilt.roll} pitch={tilt.pitch} rollOk={ROLL_OK} pitchOk={PITCH_OK} /> : <View />}
          <InfoPill tone={error ? 'warn' : undefined}>
            {error
              ? '카메라 오류'
              : info
                ? `${Math.min(info.mainWidth, info.mainHeight)}p · ${fps?.fps ?? Math.round(info.mainFps)}fps · 2배${fps?.dropped ? ` · 버림 ${fps.dropped}` : ''}`
                : '카메라 켜는 중'}
          </InfoPill>
        </View>

        {/* 카메라 위 안내창 · 결과 — 뷰파인더 아래쪽 */}
        <View style={styles.over} pointerEvents="box-none">
          {blocked ? (
            <GuideCard title={blocked} footer={<CardButton label="닫기" onPress={() => router.back()} />} />
          ) : error && step !== 'measure' ? (
            <GuideCard
              title="카메라를 켜지 못했어요"
              subtitle={error}
              footer={
                <>
                  <CardButton label="닫기" tone={denied ? 'quiet' : 'sky'} onPress={() => router.back()} />
                  {denied ? <CardButton label="설정 열기" onPress={() => void Linking.openSettings()} /> : null}
                </>
              }
            />
          ) : step === 'loading' ? null : step === 'ask' && stored ? (
            <GuideCard
              title="지난 설정으로 바로 시작할까요?"
              subtitle={`${stored.sessionType} · 투수 뒤 · 2배 줌. 같은 자리에서 같은 방식으로 재면 카메라로 바로 가요.`}
              footer={
                <>
                  <CardButton label="새 설정" tone="quiet" onPress={() => setStep('type')} />
                  <CardButton label="이 설정으로 시작" onPress={() => begin(stored)} />
                </>
              }
            />
          ) : step === 'type' ? (
            <GuideCard step={1} total={4} title="어떤 투구인가요?" subtitle="투구 기록을 남길 때 이 종류로 채워요." footer={<CardButton label="다음" onPress={() => setStep('camera')} />}>
              <Chips items={SESSION_TYPES.filter((t) => !isRestSession(t.name)).map((t) => t.name)} value={sessionType} onChange={setSessionType} light />
            </GuideCard>
          ) : step === 'camera' ? (
            <GuideCard
              step={2}
              total={4}
              title="투수 뒤에 폰을 두세요"
              subtitle="삼각대에 세워 투수 뒤 약 1m 에 두고, 미트까지 화면에 들어오게 해요. 2배 줌 · 기준 거리 20m 로 재요."
              footer={<CardButton label="다음" onPress={() => setStep('level')} />}
            />
          ) : step === 'level' ? (
            <GuideCard
              step={3}
              total={4}
              ok={!!level}
              title={level ? '수평이에요' : '폰을 수평으로 맞춰 주세요'}
              subtitle={
                tilt
                  ? `좌우 ${tilt.roll.toFixed(1)}° · 앞뒤 ${tilt.pitch.toFixed(0)}°${level ? '' : '. 좌우 1.5° · 앞뒤 10° 안으로 맞춰요.'}`
                  : '기울기를 읽는 중이에요.'
              }
              footer={<CardButton label="다음" onPress={() => setStep('zone')} />}
            />
          ) : step === 'zone' ? (
            <GuideCard
              step={4}
              total={4}
              title="스트라이크 존 크기를 맞춰 주세요"
              subtitle="미트 자리의 존에 맞게 키우거나 줄여요."
              footer={<CardButton label="완료" onPress={() => begin({ sessionType, zone })} />}
            >
              <View style={styles.row}>
                <CardButton label="작게" tone="quiet" grow onPress={() => resizeZone(-1)} />
                <CardButton label="크게" tone="quiet" grow onPress={() => resizeZone(1)} />
              </View>
            </GuideCard>
          ) : last || notice || (error && step === 'measure') ? (
            /* 방금 공 — 누르면 영상 다시 보기 */
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="방금 공 영상 다시 보기"
              disabled={!last}
              onPress={() => last && setReplay(last.clip.path)}
              style={styles.result}
            >
              {last ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Text style={styles.big}>
                    {shownKmh(last, fit).toFixed(1)}
                    <Text style={styles.unit}> km/h</Text>
                  </Text>
                  {stats ? (
                    <Text style={styles.statLine}>
                      최고 {stats.max.toFixed(1)}
                      {'\n'}평균 {stats.avg.toFixed(1)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {error && step === 'measure' ? <Text style={styles.error}>{error}</Text> : null}
              {notice ? <Text style={styles.line}>{notice}</Text> : null}
              {last ? <Text style={styles.hint}>눌러서 영상 다시 보기</Text> : null}
            </Pressable>
          ) : !live ? (
            <InfoPill>빨간 단추를 누르면 측정을 시작해요</InfoPill>
          ) : null}
        </View>
      </View>

      {/* 아래 검은 막대 — 옆 단추 · 셔터 · 옆 단추(웹 카메라 앱 꼴) */}
      <View style={[styles.bar, { paddingBottom: Math.max(inset.bottom, 12) }]}>
        {step === 'measure' && live ? (
          <>
            <SideButton icon="focus" label="초점" onPress={refocus} busy={focusBusy} disabled={!info} />
            <View style={styles.mid}>
              <Shutter state="stop" label="세션 종료" onPress={() => (pitches.length ? setSheet(true) : setLive(false))} />
              <ShutterLabel>세션 종료{pitches.length ? ` · ${pitches.length}구` : ''}</ShutterLabel>
            </View>
            <SideButton icon="list" label="이전 공" onPress={() => setSheet(true)} disabled={!pitches.length} badge={pitches.length} />
          </>
        ) : step === 'measure' ? (
          <>
            <SideButton icon="info" label="주의사항" onPress={showTips} />
            <View style={styles.mid}>
              <Shutter state="ready" label="측정 시작" onPress={() => setLive(true)} disabled={!info} />
              <ShutterLabel>측정 시작</ShutterLabel>
            </View>
            <SideButton icon="focus" label="초점" onPress={refocus} busy={focusBusy} disabled={!info} />
          </>
        ) : (
          <>
            {step === 'zone' ? (
              <SideButton icon="rotate-ccw" label="기본 자리" onPress={() => setZone(fitZone(DEFAULT_SETUP.zone, cameraPos, frame))} />
            ) : (
              <SideButton icon="info" label="주의사항" onPress={showTips} />
            )}
            {/* 다음 · 완료는 카메라 위 안내창 안 — 셔터는 흐리게 자리만(웹과 같다) */}
            <View style={styles.mid}>
              <Shutter state="wait" label="설정을 마치면 측정해요" />
              <ShutterLabel>측정</ShutterLabel>
            </View>
            <SideGap />
          </>
        )}
      </View>

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
              {pitches.map((p, i) => {
                const type = PITCH_TYPES.find((t) => t.key === p.pitchType)?.label;
                return (
                  <View key={p.id} style={styles.listItem}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: openId === p.id }}
                      onPress={() => setOpenId(openId === p.id ? null : p.id)}
                      style={styles.listRow}
                    >
                      <Text style={styles.listText} numberOfLines={openId === p.id ? undefined : 1}>
                        {i + 1}. {shownKmh(p, fit).toFixed(1)} km/h{type ? ` · ${type}` : ''}
                        {p.notes.length ? ` · ${p.notes[0]}` : ''}
                      </Text>
                      <Text style={styles.chev}>{openId === p.id ? '⌃' : '⌄'}</Text>
                    </Pressable>
                    {openId === p.id ? (
                      <View style={{ gap: 8, paddingBottom: 8 }}>
                        <Chips
                          items={PITCH_TYPES.map((t) => t.label)}
                          value={type ?? null}
                          onChange={(label) => setPitchType(p.id, PITCH_TYPES.find((t) => t.label === label)!.key)}
                          light
                        />
                        <View style={styles.row}>
                          <Button label="영상 보기" kind="ghostDark" onPress={() => setReplay(p.clip.path)} flex />
                          <Button label="이 공 지우기" kind="ghostDark" onPress={() => remove(p.id)} flex />
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
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
              items={EFFORT_CHIPS.map((v) => effortScaleText(v))}
              value={effortPct == null ? null : effortScaleText(effortPct)}
              onChange={(v) => {
                /* 칩은 1~10(웹 effort-chips 와 같게), 저장은 그대로 체감 강도 %(칩 n = n × 10%) */
                setEffortPct(Math.round(Number(v) * 10));
                setSaveError(null);
              }}
              light
            />
            {saveError ? <Text style={styles.errorDark}>{saveError}</Text> : null}
            <Button label={saving ? '저장하는 중' : '저장하기'} onPress={save} disabled={saving} />
            <Button label="더 재기" kind="ghostDark" onPress={() => setSheet(false)} disabled={saving} />
          </View>
        </View>
        <ClipModal path={replay} onClose={() => setReplay(null)} />
      </Modal>
      {!sheet ? <ClipModal path={replay} onClose={() => setReplay(null)} /> : null}
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
  finder: { flex: 1, overflow: 'hidden', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  zone: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 4, boxShadow: '0 0 0 1px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.25)' },
  zoneLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.45)' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  topMid: { flex: 1, alignItems: 'center' },
  second: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  over: { position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'stretch' },
  result: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(20,20,22,0.72)',
    gap: 4,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 0.5px rgba(255,255,255,0.12), 0 12px 30px -8px rgba(0,0,0,0.6)',
  },
  big: { color: '#fff', fontSize: 56, fontFamily: 'ui-rounded', fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  unit: { fontSize: 20, fontWeight: '600' },
  statLine: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', textAlign: 'right', marginBottom: 10, fontVariant: ['tabular-nums'] },
  line: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500' },
  error: { color: '#ff6b6b', fontSize: 15, fontWeight: '600' },
  errorDark: { color: '#d70015', fontSize: 15, fontWeight: '600' },
  bar: { backgroundColor: '#000', paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', paddingHorizontal: 12 },
  mid: { alignItems: 'center' },
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
  listItem: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5ea' },
  chev: { fontSize: 15, color: '#8e8e93' },
  label: { fontSize: 13, fontWeight: '600', color: '#6e6e73', marginTop: 8 },
});
