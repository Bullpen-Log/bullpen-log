import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tiltOf } from '@/lib/device-tilt';
import { NO_CALIBRATION, type CalFit } from '@/lib/velocity-calibration';
import { distanceMismatch } from '@/lib/velocity-analysis';
import { withSessionDistance } from '@/lib/velocity-session';
import { EFFORT_CHIPS, effortScaleText } from '@/lib/pitch-effort';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import {
  DEFAULT_SETUP,
  STANDARD_TARGET_DIST_M,
  TARGET_DIST_MAX,
  TARGET_DIST_MIN,
  ZONE_WIDTH_RANGE,
  centerZone,
  fitZone,
  frameRectToView,
  parseSetup,
  STANDARD_DIST_HINT,
  TAPE_MODES,
  type CameraPos,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { DualCamera, DualCameraPreview, type StartInfo } from '../../modules/dual-camera';
import { rpc, RpcError } from '~/lib/rpc';
import { loadJson, saveJson } from '~/lib/store';
import { AppCapture, timingLine, type CaptureStatus, type JobTiming, type MeasureSettings } from '~/velocity/capture';
import { VelocityEngine, type EngineHandle } from '~/velocity/engine';
import { RELEASE_OFF_NOTE, decide, saveSession, shownKmh, statsOf, type NativePitch, type SessionCtx } from '~/velocity/session';
import { clearDraft, loadDraft, saveDraft } from '~/velocity/draft';
import { ClipModal } from '~/velocity/clip-modal';
import { PITCH_TYPES } from '@/lib/velocity-meta';
import {
  CardButton,
  ChromeButton,
  ChromePill,
  GuideCard,
  InfoPill,
  LevelBubble,
  RED,
  ReleaseTarget,
  Segmented,
  Shutter,
  ShutterLabel,
  SideButton,
  SideGap,
  ZoneOverlay,
  ZonePinch,
} from '~/velocity/camera-ui';
import { TIPS_SKIP_KEY, TipsCard, tipsFor } from '~/velocity/tips';
import { SessionRecorder, canRecordSession, type RecState } from '~/velocity/session-recorder';
import { allowedMode, loadLastMode, modeInfo, saveLastMode, setupKeyOf, type CameraMode } from '~/velocity/mode';
import { ModeSheet } from '~/velocity/mode-sheet';
import { ModeStrip } from '~/velocity/mode-strip';
import { useAbs } from '~/velocity/abs/use-abs';
import { PlateOverlay } from '~/velocity/abs/plate-overlay';
import { AbsSetupBody } from '~/velocity/abs/abs-setup-card';
import { BatterChip } from '~/velocity/abs/batter-chip';
import { VerdictCard } from '~/velocity/abs/verdict-card';
import { AbsSummary } from '~/velocity/abs/abs-summary';
import type { AbsSession } from '~/velocity/abs/use-abs';
import { focalPxFromFov } from '@/lib/velocity-engine/geometry';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 카메라 화면(네이티브) — 모드 둘(구속 측정 · ABS 판정, docs/designs/camera-modes.md)이 같은 카메라 · 같은 틀에서 돈다.
 * 열리면 미리보기 위에 모드 고르기 시트 → 설정(지난 설정 · 종류 · 카메라 자리) → 수평 → 스트라이크 존 → 측정(던짐 알림 → 클립 →
 * 숨은 웹뷰 계산기) → 세션 저장(체감 강도 · 클립). 셔터 위 모드 띠로 모드를 바꾼다(측정 중엔 잠금). 잰 공을 받는 규칙 · 세션 거리
 * 보정은 웹과 같은 lib/velocity-session.ts.
 *
 * 카메라 조건은 웹과 같다(1080p · 60fps · 2배 줌 · 투수 뒤 · 기준 거리 20m — lib/velocity-setup.ts STANDARD_TARGET_DIST_M). 설정은 웹과
 * 같은 꼴로 앱 저장소에 둔다(parseSetup) — 모드마다 따로(mode.ts setupKeyOf).
 * ABS 모드는 존 다음에 제 설정 단계(abs — 홈플레이트 찾기 · 타자 신장 · 규칙, velocity/abs/use-abs.ts)가 하나 더 있고 측정 중에 타자 칩이 뜬다.
 * 공마다 판정 · 세션 요약은 다음 단계(설계 4~5단계).
 */
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

/**
 * 'mode' = 모드 고르기 시트(카메라 미리보기 위). 고르면 'guide'(사용 방법 · 주의사항 카드, 오늘 보지 않기면 건너뜀) → 그 모드의
 * 지난 설정(ask) 또는 첫 설정(type)으로(2026-10-20 김민: 고른 뒤 먼저 사용 방법과 안내사항, 그다음 시작).
 * 투구 탭의 '구속 측정' · 'ABS 판정' 칸은 ?mode= 로 열어 시트를 건너뛴다.
 */
type Step = 'loading' | 'mode' | 'guide' | 'ask' | 'type' | 'camera' | 'level' | 'zone' | 'abs' | 'measure';
/** isAdmin 대표관리자(진단 · 관리자 저장) · canAbs · canRecord 준관리자도(2026-10-20, lib/permissions.ts — 옛 서버면 isAdmin 으로) */
type Start = { isAdmin: boolean; canAbs: boolean; canRecord: boolean; today: string; fit: CalFit };

export default function VelocityScreen() {
  const inset = useSafeAreaInsets();
  /* 투구 탭에서 모드를 정해 열었나(speed · abs) — 없으면 모드 고르기 시트부터 */
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const entryMode: CameraMode | null = modeParam === 'speed' || modeParam === 'abs' ? modeParam : null;
  const engine = useRef<EngineHandle>(null);
  const [start, setStart] = useState<Start | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [stored, setStored] = useState<VelocitySetup | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [mode, setMode] = useState<CameraMode>('speed');
  const modeMeta = modeInfo(mode);
  const [sessionType, setSessionType] = useState<string>(DEFAULT_SETUP.sessionType);
  const cameraPos: CameraPos = 'behind-pitcher';
  const [zone, setZone] = useState<ZoneRect>(DEFAULT_SETUP.zone);
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 카메라 권한을 거절했나 — 설정을 바꾸면 iOS 가 앱을 다시 켜므로 돌아와 다시 켜기는 없다 */
  const [denied, setDenied] = useState(false);
  const [fps, setFps] = useState<FpsState | null>(null);
  /* 관리자 진단(2026-10-20) — 알약을 누르면 빌드 · 카메라 · 최근 작업의 단계별 시간 */
  const [diag, setDiag] = useState<JobTiming[] | null>(null);
  const timings = useRef<JobTiming[]>([]);
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
  /* 폰에서 미트까지 — 기준 20m 또는 줄자(웹과 같다, 줄자가 이긴다) */
  const [distTape, setDistTape] = useState(false);
  const [targetDistM, setTargetDistM] = useState(STANDARD_TARGET_DIST_M);
  const distRef = useRef(STANDARD_TARGET_DIST_M);
  useEffect(() => {
    distRef.current = distTape ? targetDistM : STANDARD_TARGET_DIST_M;
  }, [distTape, targetDistM]);
  /* 주의사항 카드 — 몇 번째 장(null = 닫힘). 설정을 마치면 한 번 뜬다(오늘은 보지 않기면 안 뜸) */
  const [tipsAt, setTipsAt] = useState<number | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);

  /* 재기 흐름(AppCapture)은 한 번 만들어 쥐고, 지금 값은 ref 로 읽는다 */
  const pitchesRef = useRef<NativePitch[]>([]);
  const ctxRef = useRef<SessionCtx>({ cameraPos, zone, info: null, tape: false, distM: STANDARD_TARGET_DIST_M });
  const tiltRef = useRef<number | null>(null);
  const todayRef = useRef<string | null>(null);
  /* 시도 기록 날짜 — 맡겨 둔 세션을 이어 재면 그 세션 날짜(저장 날짜와 같게) */
  const sessionDateRef = useRef<string | null>(null);
  useEffect(() => {
    sessionDateRef.current = sessionDate;
  }, [sessionDate]);
  const attempts = useRef(new Map<number, Promise<string | null>>());
  const captureRef = useRef<AppCapture | null>(null);
  /* 세션 녹화기 — 화면을 떠날 때 카메라 정리가 마지막 구간 자르기를 기다리게 */
  const recRef = useRef<SessionRecorder | null>(null);
  /* ABS 판정 함수 — 재기 흐름(한 번 만든 AppCapture)이 지금 값을 읽게 ref 로 */
  const absRef = useRef<AbsSession | null>(null);
  useEffect(() => {
    ctxRef.current = { cameraPos, zone, info, tape: distTape, distM: distTape ? targetDistM : STANDARD_TARGET_DIST_M };
  }, [zone, info, distTape, targetDistM]);
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

  /* 서버(관리자인가 · 오늘 · 보정식)와 지난 모드 — 설정은 모드를 고른 뒤 그 모드 것을 읽는다(pickMode) */
  useEffect(() => {
    let alive = true;
    void Promise.all([
      rpc<{ ok: true; isAdmin: boolean; canAbs?: boolean; canRecord?: boolean; pitchLocked: boolean; today: string; fit: CalFit } | { ok: false; error: string }>(
        'velocity.loadVelocityStart'
      ),
      loadLastMode(),
    ])
      .then(([res, last]) => {
        if (!alive) return;
        if (!res.ok) return setBlocked(res.error);
        if (res.pitchLocked) return setBlocked('투구 기록 첫 설정을 먼저 마쳐 주세요.');
        todayRef.current = res.today;
        setStart({ isAdmin: res.isAdmin, canAbs: res.canAbs ?? res.isAdmin, canRecord: res.canRecord ?? res.isAdmin, today: res.today, fit: res.fit });
        /* 관리자만 쓰는 모드를 지난 번에 골랐어도 지금 관리자가 아니면 구속 측정으로 */
        if (entryMode) {
          /* 투구 탭에서 모드를 정해 왔으면 시트 없이 안내부터(openMode 와 같은 일 — 그 함수는 이 뒤에 있어 여기서 못 부른다) */
          const m = allowedMode(entryMode, res.canAbs ?? res.isAdmin);
          setMode(m);
          void saveLastMode(m);
          void Promise.all([loadJson(TIPS_SKIP_KEY), loadJson(setupKeyOf(m))]).then(([skip, raw]) => {
            if (!alive) return;
            if (skip !== res.today) {
              setStep('guide');
              setTipsAt(0);
              return;
            }
            const s = parseSetup(raw);
            setStored(s);
            setStep(s ? 'ask' : 'type');
          });
        } else {
          setMode(allowedMode(last, res.canAbs ?? res.isAdmin));
          setStep('mode');
        }
        void loadDraft().then((d) => {
          if (!alive) return;
          if (!d) {
            draftReady.current = true;
            return;
          }
          const resume = () => {
            /* 맡겨 둔 세션은 구속 측정 것(초안에 모드가 없다 — ABS 판정은 아직 초안을 안 남긴다) */
            setMode('speed');
            setList(d.pitches);
            setSessionType(d.sessionType);
            setSessionDate(d.date);
            void loadJson(setupKeyOf('speed')).then((raw) => {
              const s = parseSetup(raw);
              if (!s || !alive) return;
              setZone(s.zone);
              /* 줄자 거리도 되살린다 — 안 그러면 이어 잰 공에 세션 거리 보정이 다시 걸려 값이 달라졌다 */
              setDistTape(s.distTape);
              setTargetDistM(s.targetDistM);
            });
            draftReady.current = true;
            /* 투구 탭에서 모드를 정해 와 사용 방법 카드가 떠 있었으면 걷는다 — 이어 재는 측정 화면 위에 남았다 */
            setTipsAt(null);
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
    // 화면을 열 때 한 번 — 들어온 모드(entryMode)는 주소라 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 카메라 — 화면을 열면 켜 두고(설정 단계 뒤로 보이게), 알아채기는 측정 단계에서만 */
  useEffect(() => {
    let alive = true;
    const capture = new AppCapture(
      () => engine.current,
      () => ({ ...SETTINGS, distanceM: distRef.current, tiltRad: tiltRef.current }),
      {
        onResult: (result, meta) => {
          const a = absRef.current;
          const out = decide(result, pitchesRef.current, ctxRef.current, meta, a?.on ? a.judge : undefined);
          if (out.notice) setNotice(out.notice);
          if (out.list) {
            setList(out.list);
            setNotice(null);
          }
          return out.verdict;
        },
        onStatus: (s, visible) => setStatus({ status: s, visible }),
        onNotice: (m) => setNotice(m),
        onTiming: (t) => {
          timings.current = [...timings.current.slice(-5), t];
        },
        onAttempt: (a) => {
          const date = sessionDateRef.current ?? todayRef.current;
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
      DualCamera.addListener('fps', (e) => {
        setFps({
          fps: Math.round(e.fps),
          dropped: e.dropped,
          thermal: e.thermal ?? null,
          feedMs: e.feedMs ?? null,
          feedSkipped: e.feedSkipped ?? null,
          droppedLate: e.droppedLate ?? null,
          droppedBuffers: e.droppedBuffers ?? null,
          writerSkipped: e.writerSkipped ?? null,
          writerResets: e.writerResets ?? null,
          screenCaptured: e.screenCaptured === true,
        });
        /* 장면이 다시 흐른다 = 카메라가 산다 — 전화 · 컨트롤센터로 잠깐 끊겼을 때 온 'error' 를 걷는다(안 걷으면 설정 카드가 오류 카드에 가려 못 갔다) */
        setError((prev) => (prev ? null : prev));
      }),
      DualCamera.addListener('error', (e) => setError(e.message)),
      DualCamera.addListener('level', (g) => {
        const t = tiltOf([g.x, g.y, g.z]);
        /* 웹 수평계처럼 살짝 다듬는다(0.2초 알림). 0.1° 도 안 움직였으면 같은 값을 돌려줘 화면을 다시 그리지 않는다(측정 중 CPU — 2026-10-20) */
        setTilt((prev) => {
          if (!prev) return t;
          const next = { roll: prev.roll + 0.5 * (t.roll - prev.roll), pitch: prev.pitch + 0.5 * (t.pitch - prev.pitch) };
          return Math.abs(next.roll - prev.roll) < 0.1 && Math.abs(next.pitch - prev.pitch) < 0.1 ? prev : next;
        });
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
      /* 세션 녹화 중이면 마지막 구간을 자른 뒤에 끈다(이 정리가 녹화 정리보다 먼저 돈다) — 오래 걸려도 2초까지만 */
      const r = recRef.current;
      void (r ? Promise.race([r.finishCuts(), new Promise((res) => setTimeout(res, 2000))]) : Promise.resolve()).finally(
        () => void DualCamera.stop()
      );
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

  /*
   * 세션 통째 녹화(관리자) — 측정 시작 전 셔터 줄 위 왼쪽 칩으로 켠다(웹과 같다, 1분 100MB 남짓이라 기억하지 않고 열 때마다 꺼짐).
   * 측정을 시작하면 녹화를 켜고, 측정을 끝내거나 화면을 떠나면 끈다. 조각은 웹 관리자 → 구속 측정 → 엔진 개발용 녹화에서 본다.
   */
  const [recWanted, setRecWanted] = useState(false);
  const [rec, setRec] = useState<RecState | null>(null);
  useEffect(() => {
    if (!(step === 'measure' && live && recWanted && start?.canRecord && info)) return;
    const r = new SessionRecorder(setRec);
    recRef.current = r;
    void r.start(sessionDate ?? start.today, {
      sessionRecording: true,
      source: 'app',
      cameraPos,
      sessionType,
      zone,
      distM: distTape ? targetDistM : STANDARD_TARGET_DIST_M,
      frame: { width: info.mainWidth, height: info.mainHeight, fps: info.mainFps },
      cameraClockStart: DualCamera.now?.() ?? null,
    });
    return () => {
      if (recRef.current === r) recRef.current = null;
      if (r.state.phase === 'recording' || r.state.phase === 'starting') void r.stop();
      else r.abort();
    };
    // 녹화는 측정을 켜고 끌 때만 — 존 · 종류를 바꿔도 이어서 녹화한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, live, recWanted, start?.canRecord, info]);

  /* 그 모드의 지난 설정이 있으면 묻고(ask), 없으면 첫 설정(type) */
  const goSetup = (next: CameraMode) => {
    void loadJson(setupKeyOf(next)).then((raw) => {
      const s = parseSetup(raw);
      setStored(s);
      setStep(s ? 'ask' : 'type');
    });
  };
  /** 모드를 정했다(시트 · 투구 탭) — 사용 방법 · 주의사항부터(오늘 보지 않기면 바로 설정) */
  const openMode = (next: CameraMode, today: string) => {
    setMode(next);
    void saveLastMode(next);
    void loadJson(TIPS_SKIP_KEY).then((d) => {
      if (d === today) return goSetup(next);
      setStep('guide');
      setTipsAt(0);
    });
  };
  /* 안내 카드를 닫았다 — 모드를 막 고른 참이면 설정으로 이어 간다 */
  const closeTips = () => {
    setTipsAt(null);
    if (step === 'guide') goSetup(mode);
  };

  /**
   * 모드 고르기(시트) · 바꾸기(띠) — 시트는 안내부터(openMode), 띠는 그 모드의 지난 설정을 읽어 ask 또는 type 으로. 설정 단계 중(camera · level · zone)에
   * 띠로 바꾸면 공통 단계라 그 자리에서 이어 간다(설계 2-2 — 공통 설정은 다시 묻지 않는다). 안내 중에 바꾸면 카드만 그 모드 것으로.
   */
  const pickMode = (next: CameraMode, from: 'sheet' | 'strip') => {
    if (from === 'sheet') return openMode(next, start?.today ?? '');
    setMode(next);
    void saveLastMode(next);
    if (step === 'guide') {
      setTipsAt(0);
      return;
    }
    const inSetup = step === 'camera' || step === 'level' || step === 'zone' || step === 'abs';
    if (inSetup || step === 'measure') {
      /* ABS 설정 단계에서 구속으로 바꾸면 그 단계는 없으니 존으로, 측정 전에 ABS 로 바꾸면 플레이트 단계로(안 가면 보정이 없어 판정이 늘 비었다) */
      if (step === 'abs' && next === 'speed') setStep('zone');
      else if (step === 'measure' && !live && next === 'abs') setStep('abs');
      return;
    }
    goSetup(next);
  };

  const begin = (s: Pick<VelocitySetup, 'sessionType' | 'zone' | 'distTape' | 'targetDistM'>) => {
    setSessionType(s.sessionType);
    setZone(s.zone);
    setDistTape(s.distTape);
    setTargetDistM(s.targetDistM);
    setStep('measure');
    void saveJson(setupKeyOf(mode), {
      ...DEFAULT_SETUP,
      sessionType: s.sessionType,
      cameraPos,
      zone: s.zone,
      distTape: s.distTape,
      targetDistM: s.targetDistM,
      savedAt: new Date().toISOString(),
    });
    /* 주의사항은 모드를 고를 때 이미 봤다(guide) — 측정 화면의 주의사항 단추로 다시 본다 */
  };

  /*
   * 위 왼쪽 — 늘 닫기(✕, 구속 측정을 떠남), 설정 단계면 그 옆에 앞 단계로(‹). 2026-10-20 김민: 투구 탭에서 들어오면 나가기가 없었다 —
   * 설정 단계엔 '‹ 앞 단계'뿐이라 몇 번을 눌러야 나갔다.
   */
  const PREV: Partial<Record<Step, Step>> = { camera: 'type', level: 'camera', zone: 'level', abs: 'zone', ask: 'mode', guide: 'mode' };
  const prevStep: Step | null = PREV[step] ?? (step === 'type' ? (stored ? 'ask' : 'mode') : null);
  const back = () => {
    if (!prevStep) return;
    setTipsAt(null);
    setStep(prevStep);
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
  /*
   * 세션 종료 — 잰 공이 있으면 저장 창, 없으면 측정만 끈다(서버는 공 0개 세션을 안 받는다 — saveVelocitySession).
   * 예전엔 말없이 꺼져 저장 단추를 찾게 됐다(웹은 빈 요약을 띄운다) — 한 줄로 알린다. 세션 녹화 조각은 녹화기가 따로 올린다.
   */
  const endSession = () => {
    if (pitches.length) return setSheet(true);
    setLive(false);
    setNotice(recWanted ? '잰 공이 없어 저장할 게 없어요. 세션 녹화는 따로 올라가요.' : '잰 공이 없어 저장할 게 없어요.');
  };
  const remove = (id: number) => {
    const gone = pitches.find((p) => p.id === id);
    if (gone) discardAll([gone]);
    /* 웹과 같이 남은 공으로 세션 거리를 다시 셈 — 지운 공이 세션 거리를 끌던 값이 남지 않게 */
    setList(withSessionDistance(pitches.filter((p) => p.id !== id), null, ctxRef.current.tape));
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
  /* 공이 더해지면 알림을 지우므로, 알림이 떠 있으면 그 알림은 마지막 공 뒤에 온 일(측정 불가 · 놓침)이다 —
   * 그때 앞 공 숫자를 크게 두면 새 공을 그 값으로 잰 것처럼 보였다(2026-10-20). 앞 공은 작게만. */
  const stale = !!notice && !!last;
  /* 마지막 공의 경고 — 공 크기 거리가 어긋나 최고 · 평균에서 빠졌거나 릴리스가 표적에서 벗어남(목록 메모와 같은 글) */
  const lastWarns =
    last && !stale
      ? last.notes.filter((n) => n === RELEASE_OFF_NOTE || (distanceMismatch(last.analysis) && n.includes('최고 · 평균에서 뺐어요')))
      : [];
  const frame = info ? { width: info.mainWidth, height: info.mainHeight } : { width: 1080, height: 1920 };
  const zoneView = view.width ? frameRectToView(zone, frame, view) : null;
  const measuring = step === 'measure' && live;
  /* ABS — 플레이트 보정 · 존 상자(웹 velocity-screen 의 useAbsSession 과 같은 입력: 긴 변 화각 → 초점 px, 숙임 · 좌우 기울기) */
  const abs = useAbs({
    enabled: mode === 'abs' && !!start?.canAbs,
    camera: info ? { width: info.mainWidth, height: info.mainHeight } : null,
    focalPx: info ? focalPxFromFov(Math.max(info.mainWidth, info.mainHeight), info.mainFovDeg > 0 ? info.mainFovDeg : SETTINGS.fallbackFovDeg) : null,
    tiltRad: tilt ? (-tilt.pitch * Math.PI) / 180 : null,
    rollRad: tilt ? (tilt.roll * Math.PI) / 180 : null,
    zoneRect: zone,
    detecting: step === 'abs' && !!info,
    live: measuring,
  });
  useEffect(() => {
    absRef.current = abs;
  }, [abs]);
  /* 존 크기 — 손동작을 시작할 때의 크기에 배율을 곱한다(자리는 릴리스 표적 바로 밑에 붙박음, 웹 centerLocked) */
  const growBase = useRef(zone);
  const growZone = (factor: number, startNow: boolean) => {
    if (startNow) growBase.current = zone;
    const base = growBase.current;
    const [lo, hi] = ZONE_WIDTH_RANGE[cameraPos];
    const w = Math.max(lo, Math.min(hi, base.w * factor));
    setZone(fitZone(centerZone({ ...base, w, h: base.h * (w / base.w) }), cameraPos, frame));
  };

  const setupNo: Partial<Record<Step, [number, string]>> = { type: [1, '투구 종류'], camera: [2, '카메라 자리'], level: [3, '수평'], zone: [4, '스트라이크 존'], abs: [5, '홈플레이트 · 타자'] };
  const no = setupNo[step];
  /* ABS 는 존 다음에 플레이트 단계가 하나 더 — 단계 수 5 */
  const total = mode === 'abs' ? 5 : 4;
  const refocus = () => {
    if (focusBusy) return;
    setFocusBusy(true);
    /* 존 가운데에 맞추고(먼 곳만) 잠근다 — 앱 시작 옵션과 같은 '먼 곳' */
    void DualCamera.focus({ focus: { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 }, far: true })
      .catch(() => undefined)
      .finally(() => setTimeout(() => setFocusBusy(false), 600));
  };
  const showTips = () => setTipsAt(0);
  const tips = tipsFor(mode);
  const statusDot = status.visible > 0 ? (status.status === 'analyzing' ? '#fbbf24' : RED) : '#34d399';
  const statusText =
    status.visible > 0 ? (status.status === 'analyzing' ? '구속 계산 중' : '투구를 인식했어요') : pitches.length ? `측정 중 · ${pitches.length}구` : '던지면 저절로 재요';

  return (
    <View style={styles.root}>
      <View style={styles.finder} onLayout={(e) => setView(e.nativeEvent.layout)}>
        <DualCameraPreview style={StyleSheet.absoluteFill} />
        <VelocityEngine ref={engine} />
        {/* 존 놓기 — 뷰파인더 어디서든 두 손가락으로 벌려 크기 */}
        {step === 'zone' ? <ZonePinch onGrow={growZone}>{null}</ZonePinch> : null}
        {/* 릴리스 표적 — 존 놓기 밖의 카메라 단계(웹과 같다) */}
        {step !== 'zone' && step !== 'loading' && !blocked ? (
          <ReleaseTarget state={measuring && !sheet ? (status.visible > 0 ? 'capturing' : 'armed') : 'idle'} />
        ) : null}
        {(step === 'zone' || step === 'measure') && zoneView ? (
          <ZoneOverlay
            editable={step === 'zone'}
            onGrow={growZone}
            rect={{ left: zoneView.x * view.width, top: zoneView.y * view.height, width: zoneView.w * view.width, height: zoneView.h * view.height }}
          />
        ) : null}
        {/* ABS — 플레이트 앞변 · 존 상자(설정 단계는 끌 수 있고, 측정 중엔 옅게) */}
        {abs.on && (step === 'abs' || step === 'measure') && view.width ? (
          <PlateOverlay ends={abs.ends} poly={abs.zonePoly} frame={frame} view={view} manual={step === 'abs' && abs.manual} onEnds={abs.setEnds} dim={step === 'measure'} />
        ) : null}

        {/* 위 줄 — 닫기 · 앞 단계 · 가운데 알약 · 재초점(웹 카메라 앱 꼴) */}
        <View style={[styles.top, { paddingTop: inset.top + 6 }]}>
          <View style={styles.topLeft}>
            <ChromeButton icon="x" label="구속 측정 나가기" onPress={close} />
            {prevStep && !blocked ? <ChromeButton icon="chevron-left" label="앞 단계로" onPress={back} /> : null}
          </View>
          <View style={styles.topMid} pointerEvents="none">
            {no ? (
              <ChromePill>
                {no[0]}/{total} · {no[1]}
              </ChromePill>
            ) : step === 'mode' ? (
              <ChromePill>카메라</ChromePill>
            ) : step === 'guide' ? (
              <ChromePill>{modeMeta.title} · 사용 방법</ChromePill>
            ) : step === 'ask' ? (
              <ChromePill>{modeMeta.title} · 지난 설정</ChromePill>
            ) : step === 'measure' ? (
              <ChromePill dot={measuring ? statusDot : 'rgba(255,255,255,0.5)'}>{measuring ? statusText : `${modeMeta.title} 준비`}</ChromePill>
            ) : null}
          </View>
          {step !== 'measure' ? <ChromeButton icon="focus" label="초점 다시 맞추기" onPress={refocus} busy={focusBusy} disabled={!info} /> : <View style={{ width: 44 }} />}
        </View>
        {/* 둘째 줄 — 수평계 | 카메라 상태 */}
        <View style={[styles.second, { top: inset.top + 58 }]}>
          {tilt ? <LevelBubble roll={tilt.roll} pitch={tilt.pitch} rollOk={ROLL_OK} pitchOk={PITCH_OK} /> : <View />}
          {/* 관리자는 눌러 진단(빌드 · 카메라 · 최근 작업 시간, 2026-10-20). Debug 빌드 · 장면을 많이 버리면 주황 */}
          <Pressable accessibilityRole="button" accessibilityLabel="카메라 진단" disabled={!start?.isAdmin} onPress={() => setDiag(timings.current)}>
            <InfoPill tone={error || info?.debugBuild || (fps?.dropped ?? 0) > 5 ? 'warn' : undefined}>
              {error ? '카메라 오류' : info ? pillText(info, fps) : '카메라 켜는 중'}
            </InfoPill>
          </Pressable>
        </View>

        {/* 모드 고르기 시트 — 열리자마자 미리보기 위(설계 2-1). 고르면 그 모드의 지난 설정 · 첫 설정으로 */}
        {step === 'mode' && start && !blocked && !error ? (
          <ModeSheet value={mode} isAdmin={start.canAbs} bottom={12} onPick={(m) => pickMode(m, 'sheet')} />
        ) : null}
        {/* 카메라 위 안내창 · 결과 — 뷰파인더 아래쪽 */}
        <View style={styles.over} pointerEvents="box-none">
          {/* 아이폰 화면 기록 — 인코더를 같이 써 장면이 빠지고 공을 놓친다(10-20 금윤호 실내). 영상이 필요하면 앱의 세션 녹화로 */}
          {fps?.screenCaptured && step !== 'loading' && step !== 'mode' ? (
            <InfoPill tone="warn">
              화면 기록이 켜져 있어 공을 놓칠 수 있어요. 꺼 주세요{start?.canRecord ? ' (영상은 세션 녹화로)' : ''}
            </InfoPill>
          ) : null}
          {/* 관리자 세션 녹화 — 측정 전엔 켜기 칩, 측정 중엔 녹화 상태(웹 velocity-screen 의 sessionRecWanted 칩) */}
          {step === 'measure' && start?.canRecord && canRecordSession() && tipsAt == null ? (
            !live && rec?.phase !== 'stopping' ? (
              <Press select selected={recWanted}
                accessibilityRole="switch"
                accessibilityState={{ checked: recWanted }}
                onPress={() => setRecWanted((v) => !v)}
                style={[styles.recChip, recWanted && styles.recChipOn]}
              >
                <View style={[styles.recDot, { backgroundColor: recWanted ? '#fff' : '#f87171' }]} />
                <Text style={styles.recText}>{recWanted ? '세션 녹화 켬' : '세션 녹화 끔'}</Text>
              </Press>
            ) : rec && rec.phase !== 'idle' ? (
              <View style={[styles.recChip, styles.recChipOn]}>
                <View style={[styles.recDot, { backgroundColor: '#fff' }]} />
                <Text style={styles.recText}>{recChipText(rec)}</Text>
              </View>
            ) : null
          ) : null}
          {/* ABS 측정 중 — 타자 칩(누르면 다음 타자 · 신장) */}
          {abs.on && step === 'measure' && live && tipsAt == null ? (
            <View style={{ marginBottom: 10 }}>
              <BatterChip batter={abs.batter} height={abs.setup.height} onNext={abs.nextBatter} />
            </View>
          ) : null}
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
          ) : tipsAt != null ? (
            <TipsCard
              tips={tips}
              index={tipsAt}
              onIndex={setTipsAt}
              action={
                tipsAt < tips.length - 1
                  ? { label: '다음', onPress: () => setTipsAt(tipsAt + 1) }
                  : { label: step === 'guide' ? '시작하기' : '확인', onPress: closeTips }
              }
              onSkipToday={() => {
                if (start) void saveJson(TIPS_SKIP_KEY, start.today);
                closeTips();
              }}
            />
          ) : step === 'loading' || step === 'mode' || step === 'guide' ? null : step === 'ask' && stored ? (
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
            <GuideCard step={1} total={total} title="어떤 투구인가요?" subtitle="투구 기록을 남길 때 이 종류로 채워요." footer={<CardButton label="다음" onPress={() => setStep('camera')} />}>
              <Chips items={SESSION_TYPES.filter((t) => !isRestSession(t.name)).map((t) => t.name)} value={sessionType} onChange={setSessionType} light />
            </GuideCard>
          ) : step === 'camera' ? (
            <GuideCard
              step={2}
              total={total}
              title="폰은 투수 바로 뒤 1m 안에 둬요"
              subtitle="던지는 방향을 정면으로 보게 둬요. 멀거나 옆이면 공을 놓쳐요."
              footer={<CardButton label="다음" onPress={() => setStep('level')} />}
            >
              {/* 폰에서 미트까지 — '18~22m'(기준 20m 로 재고 세션마다 공 크기로 맞춤) 또는 줄자(웹과 같은 글, lib/velocity-setup.ts TAPE_MODES) */}
              <Text style={styles.cardLabel}>폰에서 포수 미트까지</Text>
              <Segmented
                items={TAPE_MODES.map((m) => ({ value: m.value, label: m.label }))}
                value={distTape ? 'tape' : 'standard'}
                onChange={(v) => {
                  setDistTape(v === 'tape');
                  if (v !== 'tape') setTargetDistM(STANDARD_TARGET_DIST_M);
                }}
              />
              {distTape ? (
                <View style={styles.distRow}>
                  <Text style={styles.distHint}>줄자로 잰 거리 · 5% 틀리면 구속도 5% 틀려요.</Text>
                  <View style={styles.stepper}>
                    <StepBtn icon="minus" label="0.5m 줄이기" onPress={() => setTargetDistM((d) => Math.max(TARGET_DIST_MIN, Math.round((d - 0.5) * 2) / 2))} />
                    <Text style={styles.distValue}>{targetDistM.toFixed(1)}m</Text>
                    <StepBtn icon="plus" label="0.5m 늘리기" onPress={() => setTargetDistM((d) => Math.min(TARGET_DIST_MAX, Math.round((d + 0.5) * 2) / 2))} />
                  </View>
                </View>
              ) : (
                <Text style={styles.distHint}>{STANDARD_DIST_HINT}</Text>
              )}
            </GuideCard>
          ) : step === 'level' ? (
            <GuideCard
              step={3}
              total={total}
              title="수평 · 표적 맞추기"
              subtitle="릴리스 포인트가 가운데 표적에 오게 폰 높이와 방향을 맞춰요."
              footer={<CardButton label="다음" onPress={() => setStep('zone')} />}
            >
              {tilt && !level ? <Text style={styles.warnBox}>아직 기울어 있어요. 그대로 가도 되지만 코스와 궤적이 비뚤게 보여요.</Text> : null}
            </GuideCard>
          ) : step === 'zone' ? (
            <GuideCard
              step={4}
              total={total}
              title="스트라이크 존"
              subtitle="자리는 릴리스 표적 바로 밑에 고정돼요. 두 손가락으로 벌리거나 모서리 손잡이로 크기만 맞춰요."
              footer={
                mode === 'abs' ? (
                  <CardButton label="다음" onPress={() => setStep('abs')} />
                ) : (
                  <CardButton label="완료" onPress={() => begin({ sessionType, zone, distTape, targetDistM })} />
                )
              }
            />
          ) : step === 'abs' ? (
            <GuideCard
              step={5}
              total={total}
              title={abs.manual ? '플레이트 직접 맞추기' : '홈플레이트 · 타자'}
              subtitle={abs.manual ? undefined : '흰 홈플레이트가 존 밑에 보이게 두면 저절로 찾아요. 존 위 · 아래는 타자 신장으로 정해요.'}
              ok={!!abs.calib?.ok}
              footer={<CardButton label="완료" disabled={!abs.calib?.ok} onPress={() => begin({ sessionType, zone, distTape, targetDistM })} />}
            >
              <AbsSetupBody abs={abs} tiltKnown={!!tilt} />
            </GuideCard>
          ) : last || notice || (error && step === 'measure') ? (
            /* 방금 공 — 누르면 영상 다시 보기 */
            <Press
              accessibilityRole="button"
              accessibilityLabel="방금 공 영상 다시 보기"
              disabled={!last}
              onPress={() => last && setReplay(last.clip.path)}
              style={styles.result}
            >
              {!stale && last?.analysis?.abs ? <VerdictCard abs={last.analysis.abs} fit={last.analysis.distance?.fit ?? null} /> : null}
              {last && !stale ? (
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
              {lastWarns.map((w) => (
                <Text key={w} style={styles.line}>
                  {w}
                </Text>
              ))}
              {last && stale ? (
                <Text style={styles.hint}>
                  앞 공 {shownKmh(last, fit).toFixed(1)} km/h{stats ? ` · 최고 ${stats.max.toFixed(1)} · 평균 ${stats.avg.toFixed(1)}` : ''} · 눌러서 앞 공 영상 보기
                </Text>
              ) : last ? (
                <Text style={styles.hint}>눌러서 영상 다시 보기</Text>
              ) : null}
            </Press>
          ) : !live ? (
            <InfoPill>빨간 단추를 누르면 {mode === 'abs' ? '판정' : '측정'}을 시작해요</InfoPill>
          ) : null}
        </View>
      </View>

      {/* 아래 검은 막대 — 모드 띠 · 옆 단추 · 셔터 · 옆 단추(웹 카메라 앱 꼴) */}
      <View style={[styles.bar, { paddingBottom: Math.max(inset.bottom, 12) }]}>
        {start && !blocked && step !== 'loading' && step !== 'mode' ? (
          <ModeStrip value={mode} isAdmin={start.canAbs} locked={measuring} onChange={(m) => pickMode(m, 'strip')} />
        ) : (
          <View style={{ height: 32 }} />
        )}
        <View style={styles.barRow}>
        {step === 'measure' && live ? (
          <>
            <SideButton icon="focus" label="초점" onPress={refocus} busy={focusBusy} disabled={!info} />
            <View style={styles.mid}>
              <Shutter state="stop" label="세션 종료" onPress={endSession} />
              <ShutterLabel>세션 종료{pitches.length ? ` · ${pitches.length}구` : ''}</ShutterLabel>
            </View>
            <SideButton icon="list" label="이전 공" onPress={() => setSheet(true)} disabled={!pitches.length} badge={pitches.length} />
          </>
        ) : step === 'measure' ? (
          <>
            <SideButton icon="info" label="주의사항" onPress={showTips} />
            <View style={styles.mid}>
              <Shutter state="ready" label={modeMeta.shutter} onPress={() => {
                  setNotice(null);
                  setLive(true);
                }}
                disabled={!info}
              />
              <ShutterLabel>{modeMeta.shutter}</ShutterLabel>
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
              <Shutter state="wait" label={step === 'mode' ? '먼저 무엇을 할지 골라요' : `설정을 마치면 ${mode === 'abs' ? '판정해요' : '측정해요'}`} />
              <ShutterLabel>{mode === 'abs' ? '판정' : '측정'}</ShutterLabel>
            </View>
            <SideGap />
          </>
        )}
        </View>
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
              {/* ABS 모드 — 판정이 있는 공으로 요약(웹 session-summary 의 ABS 칸) */}
              {abs.on ? <AbsSummary items={pitches.flatMap((p) => (p.analysis?.abs ? [{ id: p.id, abs: p.analysis.abs }] : []))} /> : null}
              {pitches.map((p, i) => {
                const type = PITCH_TYPES.find((t) => t.key === p.pitchType)?.label;
                const call = p.analysis?.abs?.verdict?.call;
                return (
                  <View key={p.id} style={styles.listItem}>
                    <Press
                      accessibilityRole="button"
                      accessibilityState={{ expanded: openId === p.id }}
                      onPress={() => setOpenId(openId === p.id ? null : p.id)}
                      style={styles.listRow}
                    >
                      <Text style={styles.listText} numberOfLines={openId === p.id ? undefined : 1}>
                        {i + 1}. {shownKmh(p, fit).toFixed(1)} km/h{call ? ` · ${call === 'strike' ? 'S' : 'B'}` : ''}{type ? ` · ${type}` : ''}
                        {p.notes.length ? ` · ${p.notes[0]}` : ''}
                      </Text>
                      <Text style={styles.chev}>{openId === p.id ? '⌃' : '⌄'}</Text>
                    </Press>
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
      {/* 관리자 진단(2026-10-20) — 10-20 세션에서 무엇이 느린지 · 어떤 빌드인지 알 길이 없었다. 폰 화면에서 바로 본다 */}
      <Modal visible={diag != null} transparent animationType="fade" onRequestClose={() => setDiag(null)}>
        <Pressable style={styles.diagScrim} accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setDiag(null)}>
          <View style={[styles.diagCard, { marginBottom: inset.bottom + 8 }]}>
            <Text style={styles.diagTitle}>카메라 진단</Text>
            {diagLines(info, fps, diag ?? []).map((l, i) => (
              <Text key={i} style={styles.diagLine} selectable>
                {l}
              </Text>
            ))}
            <Text style={styles.diagHint}>쉬는 중에도 버림이 초당 5를 넘으면 빌드 탓이에요(Debug). Release 로 다시 구워 보세요.</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** 세션 녹화 칩 — '녹화 중 · 올림 6/9 · 대기 3 · 밀림 1 · 실패 2', 끝낼 때 '마무리 중 · 남음 N'(폰에 둔 조각을 올리는 중) */
function recChipText(rec: RecState) {
  if (rec.phase === 'error') return `녹화 못 함 · ${rec.error ?? ''}`;
  const tail = `${rec.spooled ? ` · 대기 ${rec.spooled}` : ''}${rec.skipped ? ` · 밀림 ${rec.skipped}` : ''}${rec.failed ? ` · 실패 ${rec.failed}` : ''}`;
  if (rec.phase === 'stopping') return `마무리 중 · 올림 ${rec.uploaded}/${rec.parts}${rec.queued ? ` · 남음 ${rec.queued}` : ''}${tail}`;
  return `녹화 중 · 올림 ${rec.uploaded}/${rec.parts}${tail}`;
}

type FpsState = {
  fps: number;
  dropped: number;
  thermal: number | null;
  feedMs: number | null;
  feedSkipped: number | null;
  /** 버린 까닭(늦음 · 버퍼 모자람) · 인코더가 안 받은 장면 · 녹화기를 새로 연 횟수 — 같은 날 밤 판부터, 옛 판은 null */
  droppedLate: number | null;
  droppedBuffers: number | null;
  writerSkipped: number | null;
  writerResets: number | null;
  /** 아이폰 화면 기록(미러링)이 켜져 있나 — 같은 날 밤 판부터 */
  screenCaptured: boolean;
};
const THERMAL_TEXT: Record<number, string> = { 0: '보통', 1: '따뜻', 2: '뜨거움', 3: '아주 뜨거움' };

/** 둘째 줄 알약 — '1080p · 60fps · 2배' 뒤에 버림 N · DEBUG · 뜨거움이 붙는다 */
function pillText(info: StartInfo, fps: FpsState | null) {
  return [
    `${Math.min(info.mainWidth, info.mainHeight)}p`,
    `${fps?.fps ?? Math.round(info.mainFps)}fps`,
    '2배',
    ...(fps?.dropped ? [`버림 ${fps.dropped}`] : []),
    ...(info.debugBuild ? ['DEBUG'] : []),
    ...((fps?.thermal ?? 0) >= 2 ? ['뜨거움'] : []),
  ].join(' · ');
}

/** 관리자 진단 줄들 — 빌드 · 카메라 약속 · 지금 상태 · 최근 작업 여섯 */
function diagLines(info: StartInfo | null, fps: FpsState | null, timings: JobTiming[]): string[] {
  const build = info?.debugBuild == null ? '모름(옛 앱)' : info.debugBuild ? 'Debug(최적화 없음)' : 'Release';
  const lines = [`빌드 ${build} · 앱 ${info?.appVersion || '?'} (${info?.appBuild || '?'}) · JS ${__DEV__ ? 'dev' : 'release'}`];
  if (info) lines.push(`카메라 ${Math.min(info.mainWidth, info.mainHeight)}p · 약속 ${Math.round(info.mainFps)}fps · 화각 ${info.mainFovDeg.toFixed(1)}°`);
  if (fps) {
    const feed = fps.feedMs == null ? '?' : fps.feedMs.toFixed(1);
    lines.push(
      `지금 ${fps.fps}fps · 버림 ${fps.dropped}/초 · 공 찾기 ${feed}ms/장${fps.feedSkipped ? ` (건너뜀 ${fps.feedSkipped}/초)` : ''} · 열 ${THERMAL_TEXT[fps.thermal ?? -1] ?? '?'}`
    );
    /* 버린 까닭 — 늦음은 장면 줄이 밀림, 버퍼 모자람은 인코더 · 다른 앱(화면 녹화)이 버퍼를 붙듦. 인코더 건너뜀 · 녹화기 새로 염은 클립이 빈 까닭 */
    if (fps.droppedLate != null)
      lines.push(
        `버린 까닭 늦음 ${fps.droppedLate} · 버퍼 ${fps.droppedBuffers ?? 0} · 인코더 건너뜀 ${fps.writerSkipped ?? 0}${fps.writerResets ? ` · 녹화기 새로 염 ${fps.writerResets}` : ''}`
      );
  }
  lines.push(timings.length ? '최근 작업(ms):' : '최근 작업 없음');
  for (const t of timings) lines.push(timingLine(t));
  return lines;
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
          <Press select selected={on}
            key={it}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it)}
            style={[styles.chip, light ? styles.chipLight : null, on ? styles.chipOn : null]}
          >
            <Text style={[styles.chipText, light && !on ? { color: '#1d1d1f' } : null]}>{it}</Text>
          </Press>
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
  topLeft: { flexDirection: 'row', gap: 8 },
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
  bar: { backgroundColor: '#000', paddingTop: 6, paddingHorizontal: 12 },
  barRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', marginTop: 4 },
  mid: { alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  recChip: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  recChipOn: { borderColor: 'rgba(248,113,113,0.7)', backgroundColor: 'rgba(239,68,68,0.85)' },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  recText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#6e6e73', marginBottom: 8 },
  distRow: { marginTop: 10, gap: 8 },
  distHint: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#6e6e73' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  distValue: { minWidth: 90, textAlign: 'center', fontSize: 28, fontFamily: 'ui-rounded', fontWeight: '700', color: '#1d1d1f', fontVariant: ['tabular-nums'] },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(29,29,31,0.06)', alignItems: 'center', justifyContent: 'center' },
  warnBox: { borderRadius: 16, backgroundColor: '#fffbeb', color: '#b45309', paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, lineHeight: 20, overflow: 'hidden' },
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
  list: { maxHeight: 280 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 8 },
  listText: { flex: 1, fontSize: 15, color: '#1d1d1f' },
  listItem: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5ea' },
  chev: { fontSize: 15, color: '#8e8e93' },
  label: { fontSize: 13, fontWeight: '600', color: '#6e6e73', marginTop: 8 },
  diagScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: 12 },
  diagCard: { borderRadius: 20, backgroundColor: 'rgba(20,20,22,0.96)', padding: 16, gap: 6 },
  diagTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  diagLine: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontVariant: ['tabular-nums'] },
  diagHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 6 },
});

function StepBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={20} color="#1d1d1f" />
    </Pressable>
  );
}
