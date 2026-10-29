import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tiltOf } from '@/lib/device-tilt';
import { NO_CALIBRATION, type CalFit } from '@/lib/velocity-calibration';
import { distanceMismatch } from '@/lib/velocity-analysis';
import { stdCorrection, withSessionDistance, type MissReason } from '@/lib/velocity-session';
import { EFFORT_CHIPS, effortScaleText } from '@/lib/pitch-effort';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import {
  DEFAULT_SETUP,
  ZONE_WIDTH_RANGE,
  centerZone,
  fitZone,
  frameRectToView,
  parseSetup,
  PHONE_BEHIND_RUBBER_M,
  RECEIVERS,
  phoneDistOf,
  type Receiver,
  type CameraPos,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { DualCamera, DualCameraPreview, type StartInfo } from '../../modules/dual-camera';
import { BullpenNative } from '../../modules/bullpen-native';
import { rpc, RpcError } from '~/lib/rpc';
import { loadJson, saveJson } from '~/lib/store';
import { AppCapture, timingLine, type CaptureStatus, type JobTiming, type MeasureSettings } from '~/velocity/capture';
import { attemptSettings, attemptVersions, loadUpdateId } from '~/velocity/attempt-meta';
import { VelocityEngine, type EngineHandle } from '~/velocity/engine';
import { RELEASE_OFF_NOTE, decide, saveSession, shownKmh, statsOf, type NativePitch, type SessionCtx } from '~/velocity/session';
import { clearDraft, loadDraft, saveDraft } from '~/velocity/draft';
import { ClipModal } from '~/velocity/clip-modal';
import { PITCH_TYPES } from '@/lib/velocity-meta';
import { ReleaseTarget, ZoneOverlay, ZonePinch } from '~/velocity/camera-ui';
import {
  CamChip,
  DistanceSheet,
  FlowButton,
  FlowDock,
  FlowHeader,
  FlowPanel,
  FlowSheet,
  HelpRows,
  InlineLink,
  LevelChip,
  MetaRows,
  PanelHint,
  panelIn,
} from '~/velocity/flow-ui';
import { TIPS_SKIP_KEY, TipsCard, tipsFor } from '~/velocity/tips';
import { SessionRecorder, canRecordSession, type RecState } from '~/velocity/session-recorder';
import { allowedMode, loadLastMode, modeInfo, saveLastMode, setupKeyOf, type CameraMode } from '~/velocity/mode';
import { ModeSheet } from '~/velocity/mode-sheet';
import { useAbs } from '~/velocity/abs/use-abs';
import { PlateOverlay } from '~/velocity/abs/plate-overlay';
import { AbsSetupBody } from '~/velocity/abs/abs-setup-card';
import { BatterChip } from '~/velocity/abs/batter-chip';
import { Abs3dButton, VerdictCard } from '~/velocity/abs/verdict-card';
import { absRowText, absStatusLine } from '~/velocity/abs/present';
import { AbsDriftWarn } from '~/velocity/abs/drift-warn';
import { AbsSummary } from '~/velocity/abs/abs-summary';
import type { AbsSession } from '~/velocity/abs/use-abs';
import { focalPxFromFov } from '@/lib/velocity-engine/geometry';
import { speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { usePalette } from '~/lib/ui';

/**
 * 카메라 화면(네이티브) — 모드 둘(구속 측정 · ABS 판정, docs/designs/camera-modes.md)이 같은 카메라 · 같은 틀에서 돈다.
 * 틀은 최종 시안(2026-10-29, sinker-velocity-final-flow): 위 머리줄 · 가운데 카메라(작은 상태 칩 · 아래 흰 판) · 아래 단추 줄(velocity/flow-ui.tsx).
 * 열리면 미리보기 위에 모드 고르기 시트 → 촬영 준비(거리 · 받는 곳 확인 → 수평) → 측정(던짐 알림 → 클립 → 숨은 웹뷰 계산기) →
 * 세션 요약 · 저장(종류 · 체감 강도 · 클립). 판의 단계(투구 감지 → 공 경로 확인 → 구속 계산 → 결과)는 재기 흐름(capture.ts)의 실제 알림만
 * 따르고, 결과가 오기 전에는 숫자를 보이지 않는다. 잰 공을 받는 규칙 · 세션 거리 보정은 웹과 같은 lib/velocity-session.ts.
 *
 * 카메라 조건은 웹과 같다(1080p · 60fps · 2배 줌 · 투수 뒤 · 기준 거리 20m — lib/velocity-setup.ts STANDARD_TARGET_DIST_M). 설정은 웹과
 * 같은 꼴로 앱 저장소에 둔다(parseSetup) — 모드마다 따로(mode.ts setupKeyOf).
 * ABS 모드는 존 다음에 제 설정 단계(abs — 홈플레이트 찾기 · 타자 신장 · 규칙, velocity/abs/use-abs.ts)가 하나 더 있고 측정 중에 타자 칩이 뜬다.
 * 공마다 판정 · 세션 요약은 다음 단계(설계 4~5단계).
 */
const SETTINGS: Omit<MeasureSettings, 'tiltRad' | 'distanceM' | 'distanceAuto'> = {
  approach: 'receding',
  focalPerLongSide: null,
  releaseDistanceM: null,
  /* 값은 고른 거리로, 공 크기는 15% 문으로만(엔진 2.9.0 — 빠른 공일수록 공 크기 거리가 짧아 값이 낮았다, PLAN-pitchlab.md) */
  distanceChosen: true,
  /* 앱이 화각을 못 주면 — 15 Pro Max 2배 · 손떨림 보정의 긴 변 화각(실험대 38.3°) */
  fallbackFovDeg: 38.3,
};
/** 수평으로 볼 좌우 · 앞뒤 기울기(도) — 웹 수평계(lib/use-device-level.ts LEVEL_OK_DEG · PITCH_OK_DEG)와 같다 */
const ROLL_OK = 1.5;
const PITCH_OK = 10;
/** 소리 안내 켬/끔 — 이 폰에 기억(모드 설정과 따로) */
const VOICE_KEY = 'bullpen-velocity-voice';
/** 소리 안내 — 새 앱 판(DualCamera.speak, 2026-10-21)부터. 옛 판이면 단추를 안 보인다 */
const canSpeak = typeof DualCamera.speak === 'function';

/** 저장 안 하고 버리는 공의 클립 파일을 지운다 */
/**
 * 카메라를 켠 화면 차례 — 화면을 닫으며 늦게(세션 녹화 마무리로 2초까지) 끄는 사이 다시 열면, 옛 화면의 늦은 stop 이 새 화면의 카메라를 껐다.
 * 그 사이 새 화면이 켰으면(차례가 바뀌었으면) 옛 화면은 끄지 않는다(새 start 가 이미 옛 카메라를 갈아 끼웠다).
 */
let cameraGen = 0;

const discardAll = (list: NativePitch[]) => {
  const paths = list.map((p) => p.clip.path);
  if (paths.length) void DualCamera.discard({ paths });
};

/**
 * 'mode' = 모드 고르기 시트(카메라 미리보기 위). 고르면 'guide'(사용 방법 · 주의사항 카드, 오늘 보지 않기면 건너뜀) → 그 모드의
 * 지난 설정(ask) 또는 첫 설정(type)으로(2026-10-20 김민: 고른 뒤 먼저 사용 방법과 안내사항, 그다음 시작).
 * 투구 탭의 '구속 측정' · 'ABS 판정' 칸은 ?mode= 로 열어 시트를 건너뛴다.
 */
type Step = 'loading' | 'mode' | 'guide' | 'prep' | 'abs' | 'measure';
/** 측정 중 판 — 알림 단계(detected · tracking · calculating)는 재기 흐름 상태에서, 나머지는 마지막 결과에서 */
type Phase = 'waiting' | 'detected' | 'tracking' | 'calculating' | 'result' | 'missed' | 'failed' | 'backlog';
/** 마지막으로 끝난 시도 — 구속을 얻은 공(result)인지, 못 얻은 까닭이 무엇인지(공 길 · 계산 · 앞 공 처리 중) */
type Outcome = { kind: 'result' } | { kind: 'missed' | 'failed'; text: string; miss?: MissReason };
/** isAdmin 대표관리자(진단 · 관리자 저장) · canAbs · canRecord 준관리자도(2026-10-20, lib/permissions.ts — 옛 서버면 isAdmin 으로) */
type Start = { isAdmin: boolean; canAbs: boolean; canRecord: boolean; today: string; fit: CalFit };

export default function VelocityScreen() {
  const inset = useSafeAreaInsets();
  /* 구속 단위 — 앱 설정(km/h · mph)대로 보이고, 저장은 늘 km/h */
  const unit = usePrefs().speed;
  const sp = (kmh: number) => toSpeed(kmh, unit).toFixed(1);
  const ul = speedLabel(unit);
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
  /** 마지막 카메라 상태 — 시도 기록에 같이 싣는다(현장 뒤에 원격으로 장면 버림 · 열 · 화면 기록을 읽게) */
  const fpsNow = useRef<FpsState | null>(null);
  /** 화면 코드의 OTA 갱신 번호 — 시도 기록의 versions 에(한 번만 읽는다) */
  const updateIdRef = useRef<string | null>(null);
  useEffect(() => {
    void loadUpdateId().then((id) => {
      updateIdRef.current = id;
    });
  }, []);
  /* 관리자 진단(2026-10-20) — 알약을 누르면 빌드 · 카메라 · 최근 작업의 단계별 시간 */
  const [diag, setDiag] = useState<JobTiming[] | null>(null);
  const timings = useRef<JobTiming[]>([]);
  const [status, setStatus] = useState<{ status: CaptureStatus; visible: number }>({ status: 'armed', visible: 0 });
  /* 마지막 시도 결과 · 앞 공 처리 중 들어와 못 잰 투구 수 · 재기는 이어 가는 알림(장면 빠짐 · 세션 거리) */
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [backlogN, setBacklogN] = useState(0);
  const [infoNote, setInfoNote] = useState<string | null>(null);
  /** 앱이 알아챘지만 구속을 얻지 못한 시도 수(공 길 · 계산 실패 · 앞 공 처리 중). 알아채지 못한 투구는 셀 수 없어 안 들어간다 */
  const [unrecorded, setUnrecorded] = useState(0);
  const [tilt, setTilt] = useState<{ roll: number; pitch: number } | null>(null);
  const [pitches, setPitches] = useState<NativePitch[]>([]);
  const [view, setView] = useState({ width: 0, height: 0 });
  /* 세션을 마쳤나(요약) · 저장했나(저장 끝 판) — 요약 · 저장 동안은 알아채기를 끈다 */
  const [ended, setEnded] = useState(false);
  const [saved, setSaved] = useState<{ clipFailed: number } | null>(null);
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
  /*
   * 거리 — '누가 받나요' + '투수판 → 공이 멈추는 곳'(PitchLab 방식, 2026-10-25 김민 · PLAN-pitchlab.md). 엔진엔 폰 → 멈추는 곳(+PHONE_BEHIND_RUBBER_M)을
   * 넘기고 공마다 공 크기로 거리를 어림하되, 고른 거리와 15% 넘게 다르면 거리 오류로 측정 불가(엔진 2.8.2). 화각을 모르는 폰은 고른 거리 + 세션 보정.
   */
  const [receiver, setReceiver] = useState<Receiver>(DEFAULT_SETUP.receiver ?? 'net');
  const [rubberDistM, setRubberDistM] = useState(DEFAULT_SETUP.rubberDistM ?? 20);
  /* 이번 세션에서 거리 · 받는 곳을 확인했나(촬영 준비) · 거리 판 · 도움말 판 */
  const [distOk, setDistOk] = useState(false);
  const [distSheet, setDistSheet] = useState(false);
  const [help, setHelp] = useState<'howto' | 'silent' | null>(null);
  const distRef = useRef({ m: phoneDistOf(rubberDistM), auto: true });
  useEffect(() => {
    distRef.current = { m: phoneDistOf(rubberDistM), auto: true };
  }, [rubberDistM]);
  /* 주의사항 카드 — 몇 번째 장(null = 닫힘). 설정을 마치면 한 번 뜬다(오늘은 보지 않기면 안 뜸) */
  const [tipsAt, setTipsAt] = useState<number | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);

  /* 재기 흐름(AppCapture)은 한 번 만들어 쥐고, 지금 값은 ref 로 읽는다 */
  const pitchesRef = useRef<NativePitch[]>([]);
  const ctxRef = useRef<SessionCtx>({ cameraPos, zone, info: null, tape: false, distM: phoneDistOf(rubberDistM) });
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
    ctxRef.current = { cameraPos, zone, info, tape: false, distM: phoneDistOf(rubberDistM) };
  }, [zone, info, rubberDistM]);
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

  /* 그 모드의 지난 설정을 화면에 펴고 촬영 준비로 — 지난 설정이 있으면 '지난 자리 그대로인가요?', 없으면 첫 촬영 준비 */
  const applySetup = (s: VelocitySetup | null) => {
    setStored(s);
    if (s) {
      setSessionType(s.sessionType);
      setZone(s.zone);
      setReceiver(s.receiver ?? 'net');
      setRubberDistM(s.rubberDistM ?? 20);
    }
    setDistOk(false);
    setStep('prep');
  };

  /* 서버(관리자인가 · 오늘 · 보정식)와 지난 모드 — 설정은 모드를 고른 뒤 그 모드 것을 읽는다(openMode) */
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
            applySetup(parseSetup(raw));
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
              /* 고른 거리도 되살린다 — 안 그러면 이어 잰 공이 다른 거리로 판정됐다 */
              setReceiver(s.receiver ?? 'net');
              setRubberDistM(s.rubberDistM ?? 20);
            });
            draftReady.current = true;
            /* 투구 탭에서 모드를 정해 와 사용 방법 카드가 떠 있었으면 걷는다 — 이어 재는 측정 화면 위에 남았다 */
            setTipsAt(null);
            /* 세션 요약부터 — 저장하거나 [더 측정]으로 이어 잰다(거리는 위에서 되살린 지난 설정) */
            setStep('measure');
            setLive(true);
            setEnded(true);
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

  /*
   * 소리 안내 — 웹 측정 화면의 '소리로 구속 알려주기'와 같은 말(시작 · 잰 구속 · 측정 불가 · 못 쟀어요, 2026-10-21 김민). 위 오른쪽 스피커 단추로
   * 켜고 끄며 이 폰에 기억한다. 카메라 알림 콜백에서도 부르니 켬/끔은 ref 로 읽는다
   */
  const [voice, setVoice] = useState(false);
  const voiceRef = useRef(false);
  useEffect(() => {
    void loadJson(VOICE_KEY).then((v) => {
      voiceRef.current = v === true;
      setVoice(v === true);
    });
  }, []);
  const say = (text: string) => {
    if (voiceRef.current) void DualCamera.speak?.(text).catch(() => undefined);
  };
  /*
   * 못 잰 공 집계 — 세션 내내 까닭별로 쌓아 보이고, 소리 안내는 할 일 한 마디까지 읽는다(던지는 사람은 18m 밖이라 화면 글을 못 본다 —
   * 2026-10-22 김민 "인식이 안 될 때 왜 안 됐는지 실시간으로").
   */
  const [misses, setMisses] = useState<Record<string, number>>({});
  const countMiss = (m: MissReason) => {
    setMisses((c) => ({ ...c, [m.label]: (c[m.label] ?? 0) + 1 }));
    say(`측정 불가. ${m.say}`);
  };
  const missText = Object.entries(misses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  const toggleVoice = () => {
    const on = !voiceRef.current;
    voiceRef.current = on;
    setVoice(on);
    void saveJson(VOICE_KEY, on);
    if (on) say('소리 안내를 켰어요');
  };

  /* 카메라 — 화면을 열면 켜 두고(설정 단계 뒤로 보이게), 알아채기는 측정 단계에서만 */
  useEffect(() => {
    let alive = true;
    let shownJobs = 0;
    const myGen = ++cameraGen;
    const capture = new AppCapture(
      () => engine.current,
      () => ({ ...SETTINGS, distanceM: distRef.current.m, distanceAuto: distRef.current.auto, tiltRad: tiltRef.current }),
      {
        onResult: (result, meta) => {
          const a = absRef.current;
          /* ABS 는 공을 알아챈 때의 타자로 판정(계산 중에 '다음 타자'를 눌러도 앞 공은 앞 타자) */
          const out = decide(result, pitchesRef.current, ctxRef.current, meta, a?.on ? (r) => a.judge(r, meta.queuedAt) : undefined);
          /* 받은 공의 값은 목록이 바뀐 뒤 읽는다(판 · 소리 — 세션 거리 보정까지 다시 낸 값) */
          if (out.list) {
            setList(out.list);
            setOutcome({ kind: 'result' });
          } else if (out.notice) {
            /*
             * 엔진이 공 길을 못 따라가 거부(why 없음) → 공 확인 실패. 길은 잡았는데 믿을 수 없는 값(믿음 낮음 · 앞 공과 거리 다름) → 계산 실패.
             * 둘 다 숫자는 남기지 않는다(decide 가 목록에 안 넣는다).
             */
            const why = out.verdict.kept ? undefined : out.verdict.why;
            setOutcome({ kind: why ? 'failed' : 'missed', text: out.notice, miss: out.miss });
            setUnrecorded((n) => n + 1);
            if (out.miss) countMiss(out.miss);
            else say('측정 불가');
          }
          return out.verdict;
        },
        onStatus: (s, visible) => {
          setStatus({ status: s, visible });
          /*
           * 쉬다가 새 투구를 알아챘다 — 지난 결과 · 알림은 걷는다(10-20 화면 녹화에선 한 알림이 80초 넘게 남아 새로 던진 공이 잡혔는지 알 수 없었다).
           * 앞 공을 재는 중에 하나 더 알아챈 것은 그대로 둔다(앞 공 결과가 이어서 뜬다)
           */
          if (visible > 0 && shownJobs === 0) {
            setOutcome(null);
            setBacklogN(0);
            setInfoNote(null);
          }
          shownJobs = visible;
        },
        onNotice: (m, miss, kind) => {
          if (kind === 'info') return setInfoNote(m);
          setUnrecorded((n) => n + 1);
          if (kind === 'backlog') {
            setBacklogN((n) => n + 1);
            say('앞 공을 처리하고 있어요');
            return;
          }
          setOutcome({ kind, text: m, miss });
          if (miss) countMiss(miss);
          else say('측정 불가');
        },
        onTiming: (t) => {
          timings.current = [...timings.current.slice(-5), t];
        },
        onAttempt: ({ opts, hitsAvail, ...a }) => {
          const date = sessionDateRef.current ?? todayRef.current;
          if (!date) return;
          /* 설정 · 판도 같이(설계안 작업 A) — 잰 작업은 계산기에 넘긴 옵션 그대로, 못 잰 알림은 지금 설정 */
          const ctx = ctxRef.current;
          attempts.current.set(
            a.id,
            rpc<{ ok: true; id: string } | { ok: false }>('velocity.recordVelocityAttempt', {
              date,
              ...a,
              camera: fpsNow.current,
              settings: attemptSettings(opts, ctx, distRef.current, SETTINGS.distanceChosen === true, hitsAvail),
              versions: attemptVersions(ctx.info, engine.current?.info() ?? null, updateIdRef.current),
            })
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
        capture.noteNet(e.netMs);
        setFps((fpsNow.current = {
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
          /* 셔터는 분모로(1/1250 → 1250) — 서버가 숫자를 정수로 남겨 초로 두면 0 이 됐다 */
          shutterDen: e.shutter > 0 ? Math.round(1 / e.shutter) : null,
          iso: e.iso > 0 ? Math.round(e.iso) : null,
          shutterCap: e.shutterCap ?? null,
          netMs: e.netMs ?? null,
        }));
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
        () => {
          if (myGen === cameraGen) void DualCamera.stop();
        }
      );
    };
    /* 카메라는 한 번만 켠다 — 처리기는 ref · 안정된 setState(countMiss 는 setMisses · voiceRef 만 읽는다)만 쓴다 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * 카메라 화면에서는 폰이 잠기지 않게 — 삼각대에 두고 안 만지면 30초 뒤 자동 잠금이 카메라를 멈췄다(10-21 밖: 녹화가 26초에서 끊기고
   * 그 뒤 던진 공은 알아채지도 못함). 운동 · 워밍업 화면과 같은 BullpenNative.keepAwake
   */
  useEffect(() => {
    void BullpenNative.keepAwake(true).catch(() => undefined);
    return () => void BullpenNative.keepAwake(false).catch(() => undefined);
  }, []);

  /* 엔진에 넘기는 카메라 앞뒤 기울기(웹 velocity-screen 의 setTilt — 위를 보면 +) */
  useEffect(() => {
    tiltRef.current = tilt ? (-tilt.pitch * Math.PI) / 180 : null;
  }, [tilt]);

  /* 측정 단계에서만 알아채기 — 켜면 초점을 한 번 맞추고 잠근다 */
  useEffect(() => {
    const capture = captureRef.current;
    if (!capture || !info) return;
    const armed = step === 'measure' && live && !ended;
    capture.armed = armed;
    void DualCamera.setTrigger({ armed });
  }, [step, live, ended, info]);

  /*
   * 세션 통째 녹화(관리자) — 측정 시작 전(촬영 준비) 카메라 위 왼쪽 칩으로 켠다(웹과 같다, 1분 100MB 남짓이라 기억하지 않고 열 때마다 꺼짐).
   * 측정을 시작하면 녹화를 켜고, 측정을 끝내거나 화면을 떠나면 끈다. 조각은 웹 관리자 → 구속 측정 → 엔진 개발용 녹화에서 본다.
   */
  const [recWanted, setRecWanted] = useState(false);
  const [rec, setRec] = useState<RecState | null>(null);
  useEffect(() => {
    if (!(step === 'measure' && live && recWanted && start?.canRecord && info)) return;
    /*
     * 칩은 지금 녹화기 것만 — 끝낸 녹화기가 마저 올리는 동안 새 세션을 켜면 옛 녹화기 숫자가 새 녹화를 덮었다(10-20 금윤호 화면 녹화:
     * 다음 두 세션 내내 '녹화 중 · 올림 9/9 · 실패 16' 그대로). 지금 녹화기가 없으면(녹화 끔) 마저 올리는 옛 것을 보인다.
     */
    const r: SessionRecorder = new SessionRecorder((s) => {
      if (recRef.current === r || recRef.current == null) setRec(s);
    });
    recRef.current = r;
    void r.start(sessionDate ?? start.today, {
      sessionRecording: true,
      source: 'app',
      cameraPos,
      sessionType,
      zone,
      distM: phoneDistOf(rubberDistM),
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

  /** 모드를 정했다(시트 · 투구 탭) — 사용 방법 · 주의사항부터(오늘 보지 않기면 바로 촬영 준비) */
  const goSetup = (next: CameraMode) => {
    void loadJson(setupKeyOf(next)).then((raw) => applySetup(parseSetup(raw)));
  };
  const openMode = (next: CameraMode, today: string) => {
    setMode(next);
    void saveLastMode(next);
    void loadJson(TIPS_SKIP_KEY).then((d) => {
      if (d === today) return goSetup(next);
      setStep('guide');
      setTipsAt(0);
    });
  };
  /* 안내 카드를 닫았다 — 모드를 막 고른 참이면 촬영 준비로 이어 간다 */
  const closeTips = () => {
    setTipsAt(null);
    if (step === 'guide') goSetup(mode);
  };

  /* 측정을 시작한다 — 지금 설정을 그 모드 것으로 남기고(다음엔 '지난 자리 그대로인가요?'), ABS 인데 홈플레이트를 아직 못 맞췄으면 플레이트 단계부터 */
  const startMeasure = () => {
    const s: VelocitySetup = { ...DEFAULT_SETUP, sessionType, cameraPos, zone, receiver, rubberDistM, savedAt: new Date().toISOString() };
    void saveJson(setupKeyOf(mode), s);
    setStored(s);
    if (mode === 'abs' && !abs.calib?.ok) return setStep('abs');
    setStep('measure');
    setOutcome(null);
    setBacklogN(0);
    setInfoNote(null);
    setUnrecorded(0);
    setMisses({});
    setEnded(false);
    setSaved(null);
    setLive(true);
  };
  /* 결과 · 실패 판을 걷고 대기로 — 알아채기는 판을 보는 동안에도 켜져 있다(던지는 사람은 18m 밖이라 단추 없이도 다음 공을 잰다) */
  const ack = () => {
    setOutcome(null);
    setBacklogN(0);
    setInfoNote(null);
  };
  /* 요약에서 다시 재기 — 같은 세션 · 같은 거리로 이어 간다 */
  const resume = () => {
    ack();
    setEnded(false);
  };
  /* 저장 뒤 새 세션 — 촬영 준비로 돌아가 거리 · 받는 곳을 다시 확인한다(장소가 바뀌었을 수 있다) */
  const newSession = () => {
    setSaved(null);
    setEnded(false);
    setLive(false);
    ack();
    setUnrecorded(0);
    setMisses({});
    setDistOk(false);
    setStep('prep');
  };

  const close = () => {
    /* 지금 목록(ref) — 저장 뒤 알림에서 부르면 화면 값은 저장 전 목록이었다 */
    const list = pitchesRef.current;
    if (!list.length) return router.back();
    Alert.alert('저장하지 않고 나갈까요?', `잰 공 ${list.length}개가 사라져요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: () => {
          discardAll(pitchesRef.current);
          void clearDraft();
          router.back();
        },
      },
    ]);
  };
  /*
   * 머리줄 ‹ — 안내 카드면 닫고(모드를 막 고른 참이면 모드 고르기로), ABS 플레이트 단계면 촬영 준비로, 촬영 준비면 모드 고르기로(투구 탭에서 모드를
   * 정해 왔으면 나가기). 측정 · 요약에서는 구속 측정을 떠난다(잰 공이 있으면 묻는다 — 2026-10-20 김민: 나가기가 늘 한 번에 있어야).
   */
  const back = () => {
    if (blocked || step === 'loading') return router.back();
    if (tipsAt != null) {
      setTipsAt(null);
      if (step === 'guide') return entryMode ? close() : setStep('mode');
      return;
    }
    if (step === 'abs') return setStep('prep');
    if (step === 'prep' && !entryMode) return setStep('mode');
    close();
  };
  const backLabel = tipsAt != null ? '안내 닫기' : step === 'abs' ? '촬영 준비로' : step === 'prep' && !entryMode ? '모드 고르기로' : '구속 측정 나가기';

  const remove = (id: number) => {
    const gone = pitches.find((p) => p.id === id);
    if (gone) discardAll([gone]);
    /* 웹과 같이 남은 공으로 세션 거리를 다시 셈 — 지운 공이 세션 거리를 끌던 값이 남지 않게 */
    setList(withSessionDistance(pitches.filter((p) => p.id !== id), null, ctxRef.current.tape));
  };
  const setPitchType = (id: number, key: string) =>
    setList(pitches.map((p) => (p.id === id ? { ...p, pitchType: p.pitchType === key ? null : key } : p)));
  /*
   * 세션 저장 — 요약에서 [기록 저장]. 요약을 보는 동안은 알아채기가 꺼져 있어 저장하는 사이 새 공이 안 들어온다(2026-10-21 김민: 저장하는 동안 ·
   * 뒤에도 재기가 이어졌다). 그래도 목록이 바뀌었으면 저장한 공만 빼고 남긴다.
   */
  const save = async () => {
    if (!start || saving || !pitchesRef.current.length) return;
    if (effortPct == null) return setSaveError('체감 강도를 골라 주세요.');
    setSaving(true);
    setSaveError(null);
    const batch = pitchesRef.current;
    const savedIds = new Set(batch.map((p) => p.id));
    /* 지금까지의 시도 기록만 이 세션에 — 저장하는 사이 생긴 시도는 다음 세션 몫 */
    const sentAttempts = new Map(attempts.current);
    try {
      const res = await saveSession({
        date: sessionDate ?? start.today,
        sessionType,
        effortPct,
        ctx: ctxRef.current,
        pitches: batch,
        isAdmin: start.isAdmin,
        attemptIds: sentAttempts,
      });
      if (!res.ok) return setSaveError(res.error);
      const rest = pitchesRef.current.filter((p) => !savedIds.has(p.id));
      setList(rest.length ? withSessionDistance(rest, null, ctxRef.current.tape) : []);
      if (!rest.length) void clearDraft();
      setSessionDate(null);
      for (const k of sentAttempts.keys()) attempts.current.delete(k);
      setLive(false);
      setSaved({ clipFailed: res.clipFailed ?? 0 });
    } catch (e) {
      setSaveError(e instanceof RpcError ? e.message : '저장하지 못했어요. 잰 공은 그대로 있으니 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  };

  /* 소리 안내 — 측정을 시작하면 한 번, 공이 하나 더해지면 그 값(보이는 단위 · 정수, 웹과 같다). 이어 하기로 여러 개가 한꺼번에 오면 안 읽는다 */
  useEffect(() => {
    if (step === 'measure' && live && !ended) say('측정을 시작해요. 던져요');
    // 측정을 켤 때만 — 요약에서 이어 갈 때(ended)는 다시 안 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, live]);
  const spokenLen = useRef(0);
  useEffect(() => {
    const n = pitches.length;
    if (live && n === spokenLen.current + 1) say(`${Math.round(toSpeed(shownKmh(pitches[n - 1], fit), unit))}`);
    spokenLen.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitches]);

  /*
   * 세션 거리 알림 — 화각을 모르는 폰(고른 거리로 잼)에서 세션 거리로 옮긴 것을 한 번 알린다. 공마다 공 크기로 잰 폰은 엔진이 공마다 판정한다(2.8.2).
   */
  const corrNote = useRef<string | null>(null);
  useEffect(() => {
    const c = stdCorrection(pitches, 'camera');
    const note = c?.apply ? `공 ${c.n}개의 공 크기로 세션 거리를 ${c.m}m 로 맞추고 앞 공도 다시 셌어요` : null;
    if (note && note !== corrNote.current) {
      corrNote.current = note;
      setInfoNote(note);
    }
  }, [pitches]);

  const p = usePalette();
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 350;
  const level = tilt && Math.abs(tilt.roll) <= ROLL_OK && Math.abs(tilt.pitch) <= PITCH_OK;
  /* 수평 센서가 값을 주면 수평일 때만 시작(기존 수평 기준 ROLL_OK · PITCH_OK 그대로). 값을 안 주는 폰이면 막지 않고 눈으로 맞추게 한다 */
  const canStart = !tilt || !!level;
  const last = pitches.at(-1);
  const stats = statsOf(pitches, fit);
  const n = pitches.length;
  /* 마지막 공의 경고 — 공 크기 거리가 어긋나 최고 · 평균에서 빠졌거나 릴리스가 표적에서 벗어남(목록 메모와 같은 글) */
  const lastWarn = last?.notes.find((x) => x === RELEASE_OFF_NOTE || (distanceMismatch(last.analysis) && x.includes('최고 · 평균에서 뺐어요')));
  const excludedN = pitches.filter((x) => distanceMismatch(x.analysis) != null).length;
  const frame = info ? { width: info.mainWidth, height: info.mainHeight } : { width: 1080, height: 1920 };
  const zoneView = view.width ? frameRectToView(zone, frame, view) : null;
  const measuring = step === 'measure' && live && !ended;
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

  const refocus = () => {
    if (focusBusy) return;
    setFocusBusy(true);
    /* 존 가운데에 맞추고(먼 곳만) 잠근다 — 앱 시작 옵션과 같은 '먼 곳' */
    void DualCamera.focus({ focus: { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 }, far: true })
      .catch(() => undefined)
      .finally(() => setTimeout(() => setFocusBusy(false), 600));
  };
  const tips = tipsFor(mode);
  const verb = mode === 'abs' ? '판정' : '측정';
  const receiverLabel = RECEIVERS.find((r) => r.value === receiver)?.label ?? '망';
  const editable = step === 'prep' || step === 'abs';
  /* 거리 칩 — 측정 전엔 거리 판, 측정 중엔 바꿀 수 없다고 알린다(거리가 바뀌면 값 전체가 달라진다 — 새 세션에서) */
  const onDistance = () => {
    if (editable) return setDistSheet(true);
    setInfoNote('측정 중에는 거리를 바꿀 수 없어요. 거리가 달라지면 세션을 마치고 새 세션에서 설정해 주세요.');
  };

  /* 측정 중 판 — 알림 단계는 재기 흐름 상태(capture.ts sync)에서. 공 구간을 받은 작업은 계산기가 '공 길 찾음'을 안 보내 경로 확인 → 결과로 간다 */
  const proc: Phase | null =
    status.visible > 0 ? (status.status === 'computing' ? 'calculating' : status.status === 'analyzing' ? 'tracking' : 'detected') : null;
  const phase: Phase = proc ?? outcome?.kind ?? (backlogN > 0 ? 'backlog' : 'waiting');
  const GREEN = '#72deb6';
  const STATUS: Record<Phase, [string, string]> = {
    waiting: [n ? `${verb} 중 · ${n}구` : `${verb} 중 · 대기`, GREEN],
    detected: ['투구 감지', GREEN],
    tracking: ['공 경로 확인 중', GREEN],
    calculating: ['구속 계산 중', GREEN],
    result: [`${verb} 완료 · ${n}구`, GREEN],
    missed: ['측정 불가 · 공 확인 실패', '#ff9d94'],
    failed: ['측정 불가 · 계산 실패', '#ff9d94'],
    backlog: ['이번 투구 미기록', '#ffd08a'],
  };
  /* ABS — 칩 글을 판정으로(present.ts absStatusLine): 대기 · 결과는 판정 수(판정 없음 따로) · 카메라 위치 경고, 계산 · 실패도 '판정' */
  if (abs.on) {
    const line = absStatusLine({ status: 'armed', visible: 0, judged: pitches.filter((x) => x.analysis?.abs?.verdict).length, total: n, recalibrate: !!abs.drift?.recalibrate });
    const tone = line.tone === 'warn' ? '#ffd08a' : GREEN;
    STATUS.waiting = [line.text, tone];
    STATUS.result = [line.text, tone];
    STATUS.calculating = ['판정 계산 중', GREEN];
    STATUS.missed = ['판정 없음 · 공 확인 실패', '#ff9d94'];
    STATUS.failed = ['판정 없음 · 계산 실패', '#ff9d94'];
  }
  const prepView = !distOk ? (stored ? 'repeat' : 'first') : canStart ? 'ready' : 'tilt';
  const statusChip: [string, string] | null =
    step === 'measure'
      ? STATUS[phase]
      : step === 'prep'
        ? [prepView === 'tilt' ? '수평 확인' : prepView === 'ready' ? '준비 완료' : '촬영 준비', prepView === 'tilt' ? '#ffd08a' : GREEN]
        : step === 'abs'
          ? ['홈플레이트 맞추기', abs.calib?.ok ? GREEN : '#ffd08a']
          : null;
  /*
   * 카메라 칸이 낮은 폰(SE 등) — 촬영 준비 판이 가운데 릴리스 표적을 가리지 않게 머리글 · 설명 · 거리 줄을 뺀다(거리는 위 거리 칩에 그대로 보인다).
   * 측정 중엔 폰을 이미 맞췄으니 줄이지 않는다.
   */
  const compact = view.height > 0 && view.height < 520;
  const prepEyebrow = compact ? undefined : '촬영 준비';
  const distMeta: [string, string][] = [
    ['받는 곳', receiverLabel],
    ['입력 거리', `투수판 → 공이 멈추는 곳 ${rubberDistM}m`],
  ];

  /* 판 · 아래 줄 — 단계마다 하나씩 고른다 */
  let panel: ReactNode = null;
  let panelKey = 'none';
  let summary: ReactNode = null;
  let note: string | null = null;
  let actions: ReactNode = null;
  const extra = (
    <>
      {backlogN > 0 && phase !== 'backlog' ? <PanelHint tone="warn" text={`그사이 던진 공 ${backlogN}개는 앞 공을 처리하느라 기록하지 못했어요.`} /> : null}
      {/* 삼각대 감시가 밀렸다고 봄 — 판정은 경계 띠를 넓혀 이어 간다(use-abs drift.recalibrate). 멈춘 것처럼 말하지 않는다 */}
      {abs.on && step === 'measure' && abs.drift?.recalibrate ? (
        <AbsDriftWarn onFix={() => abs.recalibrate().then((why) => setInfoNote(why ?? '앞변을 다시 맞췄어요.'))} />
      ) : null}
      {infoNote ? <PanelHint text={infoNote} /> : null}
      {error && step === 'measure' ? <PanelHint tone="warn" text={`카메라 · ${error}`} /> : null}
    </>
  );
  if (blocked) {
    panelKey = 'blocked';
    panel = <FlowPanel title={blocked} />;
    actions = <FlowButton label="닫기" onPress={() => router.back()} />;
  } else if (error && step !== 'measure') {
    panelKey = 'camera-error';
    panel = <FlowPanel tone="danger" title="카메라를 켜지 못했어요" body={error} />;
    actions = denied ? (
      <>
        <FlowButton kind="secondary" label="닫기" onPress={() => router.back()} />
        <FlowButton label="설정 열기" onPress={() => void Linking.openSettings()} />
      </>
    ) : (
      <FlowButton label="닫기" onPress={() => router.back()} />
    );
  } else if (tipsAt != null) {
    panelKey = 'tips';
    panel = (
      <TipsCard
        tips={tips}
        index={tipsAt}
        onIndex={setTipsAt}
        action={tipsAt < tips.length - 1 ? { label: '다음', onPress: () => setTipsAt(tipsAt + 1) } : { label: step === 'guide' ? '시작하기' : '확인', onPress: closeTips }}
        onSkipToday={() => {
          if (start) void saveJson(TIPS_SKIP_KEY, start.today);
          closeTips();
        }}
      />
    );
  } else if (step === 'loading') {
    note = '카메라를 켜는 중이에요';
  } else if (step === 'mode') {
    note = '무엇을 할지 골라 주세요';
  } else if (step === 'prep') {
    panelKey = `prep-${prepView}`;
    if (prepView === 'first') {
      panel = (
        <FlowPanel compact={compact} eyebrow={prepEyebrow} title="폰을 놓을 자리를 확인해요" body={`투수판 뒤 약 ${PHONE_BEHIND_RUBBER_M}m에 폰을 두고 던지는 방향을 정면으로 보게 해요.`}>
          {compact ? null : <MetaRows rows={[['폰 고정', '삼각대'], ['배경', '공이 잘 보이는 곳']]} />}
        </FlowPanel>
      );
      note = '거리는 투수판부터 공이 실제로 멈추는 곳까지예요.';
      actions = (
        <>
          <FlowButton kind="secondary" label="촬영 방법" onPress={() => setHelp('howto')} />
          <FlowButton label="거리 설정" onPress={() => setDistSheet(true)} />
        </>
      );
    } else if (prepView === 'repeat') {
      panel = (
        <FlowPanel compact={compact} eyebrow={prepEyebrow} title="지난 자리 그대로인가요?" body={compact ? `${receiverLabel} · 투수판 → 공이 멈추는 곳 ${rubberDistM}m` : '장소나 받는 곳이 같으면 그대로 시작해요.'}>
          {compact ? null : <MetaRows rows={distMeta} />}
        </FlowPanel>
      );
      note = '장소나 거리가 바뀌었으면 거리를 바꿔 주세요.';
      actions = (
        <>
          <FlowButton kind="secondary" label="거리 바꾸기" onPress={() => setDistSheet(true)} />
          <FlowButton label="같은 자리예요" onPress={() => setDistOk(true)} />
        </>
      );
    } else if (prepView === 'tilt') {
      panel = (
        <FlowPanel compact={compact} eyebrow={prepEyebrow} title="폰을 수평으로 맞춰요" body="삼각대 헤드를 돌려 위쪽 수평 칩이 '수평 양호'가 되게 맞춰요.">
          {compact ? null : <MetaRows rows={distMeta} />}
        </FlowPanel>
      );
      note = '수평이 맞으면 시작 단추가 켜져요.';
      actions = (
        <>
          <FlowButton kind="secondary" label="거리 수정" onPress={() => setDistSheet(true)} />
          <FlowButton label="수평 맞춘 뒤 시작" disabled />
        </>
      );
    } else {
      panel = (
        <FlowPanel compact={compact} eyebrow={prepEyebrow} title="촬영 준비를 마쳤어요" body={compact ? (tilt ? null : '수평 센서 값이 없어요. 눈으로 맞춰 주세요.') : mode === 'abs' ? '다음 단계에서 홈플레이트를 찾아요.' : null}>
          {compact ? null : <MetaRows rows={[...distMeta, ['수평 센서', tilt ? '양호' : '값 없음 · 눈으로 맞춰 주세요']]} />}
          <InlineLink label="촬영 방법 다시 보기" onPress={() => setHelp('howto')} />
        </FlowPanel>
      );
      note = '공을 놓는 자리가 가운데 표적에 오게 맞춰요.';
      actions = (
        <>
          <FlowButton kind="secondary" label="거리 수정" onPress={() => setDistSheet(true)} />
          <FlowButton label={mode === 'abs' && !abs.calib?.ok ? '다음' : modeMeta.shutter} onPress={startMeasure} disabled={!info} />
        </>
      );
    }
  } else if (step === 'abs') {
    panelKey = 'abs';
    panel = (
      <FlowPanel
        light
        eyebrow="ABS 판정 준비"
        title={abs.manual ? '플레이트 직접 맞추기' : '홈플레이트 · 타자'}
        body={abs.manual ? null : '흰 홈플레이트가 존 밑에 보이게 두면 저절로 찾아요. 존 위 · 아래는 타자 신장으로 정해요.'}
      >
        <View style={{ marginTop: 10 }}>
          <AbsSetupBody abs={abs} tiltKnown={!!tilt} />
        </View>
      </FlowPanel>
    );
    actions = (
      <>
        <FlowButton kind="secondary" label="이전" onPress={() => setStep('prep')} />
        <FlowButton label={modeMeta.shutter} onPress={startMeasure} disabled={!abs.calib?.ok} />
      </>
    );
  } else if (step === 'measure' && saved) {
    summary = (
      <View style={[styles.sumCard, { backgroundColor: p.card, alignItems: 'center', paddingVertical: 30 }]}>
        <View style={[styles.savedMark, { backgroundColor: p.skyTint }]}>
          <Icon name="circle-check" size={28} color={p.ok} />
        </View>
        <Text style={[styles.sumTitle, { color: p.ink, textAlign: 'center' }]} accessibilityRole="header">
          기록을 저장했어요
        </Text>
        <Text style={[styles.sumBody, { color: p.muted, textAlign: 'center' }]}>
          {saved.clipFailed ? `영상 ${saved.clipFailed}개는 붙이지 못했어요. 측정값은 저장됐어요.` : '투구 기록으로도 남겨 주세요.'}
        </Text>
      </View>
    );
    note = '새 세션은 촬영 준비부터 다시 확인해요.';
    actions = (
      <>
        <FlowButton kind="secondary" label="끝내기" onPress={close} />
        <FlowButton label="새 세션" onPress={newSession} />
      </>
    );
  } else if (step === 'measure' && ended) {
    const unrecRow = (
      <View style={[styles.sumRow, { borderTopColor: p.line }]}>
        <Text style={[styles.sumRowKey, { color: p.muted }]}>처리했지만 구속 미기록</Text>
        <Text style={[styles.sumRowVal, { color: p.ink }]}>{unrecorded}회</Text>
      </View>
    );
    const missLine = unrecorded && missText ? <Text style={[styles.sumSmall, { color: p.muted }]}>{missText}</Text> : null;
    const notCounted = <Text style={[styles.sumSmall, { color: p.muted, marginTop: 10 }]}>반응이 없었던 투구는 이 횟수에 포함되지 않아요.</Text>;
    if (!n) {
      summary = (
        <View style={[styles.sumCard, { backgroundColor: p.card, alignItems: 'stretch', paddingVertical: 26 }]}>
          <Text style={[styles.sumTitle, { color: p.ink, textAlign: 'center' }]} accessibilityRole="header">
            구속이 기록되지 않았어요
          </Text>
          <Text style={[styles.sumBody, { color: p.muted, textAlign: 'center', marginBottom: 12 }]}>저장할 공이 없어요. 촬영 점검을 확인하고 다시 {verb}해 주세요.</Text>
          {unrecRow}
          {missLine}
          {notCounted}
          <InlineLink label="던졌는데 반응이 없었어요" onPress={() => setHelp('silent')} />
        </View>
      );
      note = '촬영 거리를 바꾸려면 새 세션을 시작해 주세요.';
      actions = <FlowButton label={`다시 ${verb}`} onPress={resume} />;
    } else {
      summary = (
        <>
          <View style={[styles.sumCard, { backgroundColor: p.card }]}>
            <Text style={[styles.sumTitle, { color: p.ink }]} accessibilityRole="header">
              {verb}을 마쳤어요
            </Text>
            <View style={[styles.sumNumber, { borderBottomColor: p.line }, narrow && { flexDirection: 'column', alignItems: 'flex-start' }]}>
              <Text style={[styles.sumMax, { color: p.ink }]}>
                {stats ? sp(stats.max) : '—'}
                <Text style={[styles.sumUnit, { color: p.muted }]}> {ul}</Text>
              </Text>
              <Text style={[styles.sumSmall, { color: p.muted }]}>{stats ? `최고 구속 · ${n}구 기록` : `${n}구 기록`}</Text>
            </View>
            {excludedN ? <Text style={[styles.sumSmall, { color: p.warn, marginBottom: 8 }]}>공 크기 거리가 어긋난 공 {excludedN}개는 최고 구속에서 뺐어요.</Text> : null}
            {abs.on ? <AbsSummary items={pitches.map((x) => x.analysis?.abs ?? null)} /> : null}
            <Text style={[styles.sumLabel, { color: p.muted }]}>구속이 기록된 공</Text>
            {pitches.map((x, i) => {
              const type = PITCH_TYPES.find((t) => t.key === x.pitchType)?.label;
              const call = x.analysis?.abs?.verdict?.call;
              const xa = x.analysis?.abs ?? null;
              const xfit = x.analysis?.distance?.fit ?? null;
              const open = openId === x.id;
              return (
                <View key={x.id} style={[styles.sumRowWrap, { borderTopColor: p.line }]}>
                  <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenId(open ? null : x.id)} style={styles.sumRowPress}>
                    <Text style={[styles.sumRowKey, { color: p.muted }]}>{i + 1}구</Text>
                    <Text style={[styles.sumRowMid, { color: p.muted }]} numberOfLines={1}>
                      {[abs.on ? absRowText(xa) : call ? (call === 'strike' ? 'S' : 'B') : null, type, x.notes.length ? '메모' : null].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={[styles.sumRowVal, { color: p.ink }]}>
                      {sp(shownKmh(x, fit))} {ul}
                    </Text>
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={p.muted} />
                  </Press>
                  {open ? (
                    <View style={{ gap: 8, paddingBottom: 10 }}>
                      {x.notes.map((m) => (
                        <Text key={m} style={[styles.sumSmall, { color: p.muted }]}>
                          {m}
                        </Text>
                      ))}
                      <Chips items={PITCH_TYPES.map((t) => t.label)} value={type ?? null} onChange={(label) => setPitchType(x.id, PITCH_TYPES.find((t) => t.label === label)!.key)} />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <FlowButton kind="secondary" grow label="영상 보기" onPress={() => setReplay(x.clip.path)} />
                        <FlowButton kind="secondary" grow label="이 공 지우기" onPress={() => remove(x.id)} />
                      </View>
                      {/* 3D 는 판정 · 궤적이 다 있는 공만(타격 · 판정 없음은 없음) */}
                      {abs.on && xa?.verdict && xa.event !== 'contact' && xfit ? <Abs3dButton abs={xa} fit={xfit} light /> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {unrecRow}
            {missLine}
            {notCounted}
          </View>
          <View style={[styles.sumCard, { backgroundColor: p.card }]}>
            <Text style={[styles.sumLabel, { color: p.muted, marginTop: 0 }]}>종류</Text>
            <Chips items={SESSION_TYPES.filter((t) => !isRestSession(t.name)).map((t) => t.name)} value={sessionType} onChange={setSessionType} />
            <Text style={[styles.sumLabel, { color: p.muted }]}>체감 강도</Text>
            <Chips
              items={EFFORT_CHIPS.map((v) => effortScaleText(v))}
              value={effortPct == null ? null : effortScaleText(effortPct)}
              onChange={(v) => {
                /* 칩은 1~10(웹 effort-chips 와 같게), 저장은 그대로 체감 강도 %(칩 n = n × 10%) */
                setEffortPct(Math.round(Number(v) * 10));
                setSaveError(null);
              }}
            />
            {saveError ? <Text style={[styles.sumBody, { color: p.danger }]}>{saveError}</Text> : null}
          </View>
        </>
      );
      note = '촬영 거리를 바꾸려면 새 세션을 시작해 주세요.';
      actions = (
        <>
          <FlowButton kind="secondary" label={`더 ${verb}`} onPress={resume} disabled={saving} />
          <FlowButton label={saving ? '저장하는 중' : '기록 저장'} onPress={save} busy={saving} />
        </>
      );
    }
  } else if (step === 'measure') {
    /* 숫자는 결과(result)에서만 — 알아챔 · 경로 · 계산 단계는 글로만 */
    const cleaned = outcome && outcome.kind !== 'result' ? outcome.text.replace(/^(뒤늦게 찾은 공 · )?(못 쟀어요 · |측정 불가 · )/, '$1') : null;
    const missHint = outcome && outcome.kind !== 'result' && outcome.miss ? <PanelHint text={outcome.miss.label} /> : null;
    const busyLabel = { detected: '영상 확인 중', tracking: '경로 확인 중', calculating: '계산 중' } as const;
    panelKey = phase === 'result' ? `result-${last?.id}` : phase === 'missed' || phase === 'failed' || phase === 'backlog' ? `${phase}-${unrecorded}` : phase;
    const endBtn = <FlowButton kind="secondary" label="세션 마치기" onPress={() => setEnded(true)} />;
    if (phase === 'waiting') {
      panel = (
        <FlowPanel eyebrow={STATUS.waiting[0]} title={`던지면 자동으로 ${verb}해요`}>
          <InlineLink label="던졌는데 반응이 없어요" onPress={() => setHelp('silent')} />
          {extra}
        </FlowPanel>
      );
      note = '폰을 움직이지 않은 채 투구해 주세요.';
      actions = <FlowButton kind="secondary" grow label="세션 마치기" onPress={() => setEnded(true)} />;
    } else if (phase === 'detected' || phase === 'tracking' || phase === 'calculating') {
      const copy = {
        detected: ['투구 감지', '투구를 인식했어요', '공이 날아간 영상을 받고 있어요.'],
        tracking: ['공 경로 확인 중', '공이 날아간 길을 찾고 있어요', '결과가 나오기 전에는 숫자를 보여주지 않아요.'],
        calculating: abs.on
          ? ['판정 계산 중', '판정을 계산하고 있어요', '결과가 나오기 전에는 판정을 보여주지 않아요.']
          : ['구속 계산 중', '구속을 계산하고 있어요', '결과가 나오기 전에는 숫자를 보여주지 않아요.'],
      }[phase];
      panel = (
        <FlowPanel eyebrow={copy[0]} title={copy[1]} body={copy[2]}>
          {extra}
        </FlowPanel>
      );
      note = '폰을 움직이지 않은 채 기다려 주세요.';
      actions = <FlowButton label={busyLabel[phase]} disabled />;
    } else if (phase === 'result' && last && abs.on) {
      /* ABS 방금 공 — 판정을 먼저 크게, 구속은 그 밑에 작게. 영상 다시 보기 · 3D 는 카드 안 따로 된 단추 */
      panel = (
        <FlowPanel eyebrow="방금 공">
          <View style={styles.verdictWrap}>
            <VerdictCard
              key={last.id}
              abs={last.analysis?.abs ?? null}
              fit={last.analysis?.distance?.fit ?? null}
              speed={`${sp(shownKmh(last, fit))} ${ul}`}
              onReplay={() => setReplay(last.clip.path)}
            />
          </View>
          {extra}
        </FlowPanel>
      );
      note = lastWarn ?? '판정은 구속이 잡힌 공만 내요.';
      actions = (
        <>
          {endBtn}
          <FlowButton label={`계속 ${verb}`} onPress={ack} />
        </>
      );
    } else if (phase === 'result' && last) {
      panel = (
        <FlowPanel eyebrow="방금 공 · 참고 측정값">
          {last.analysis?.abs ? (
            <View style={styles.verdictWrap}>
              <VerdictCard abs={last.analysis.abs} fit={last.analysis.distance?.fit ?? null} />
            </View>
          ) : null}
          <Text style={[styles.speed, { color: p.ink }, narrow && { fontSize: 48 }]} accessibilityLabel={`${sp(shownKmh(last, fit))} ${ul}`}>
            {sp(shownKmh(last, fit))}
            <Text style={[styles.speedUnit, { color: p.muted }]}> {ul}</Text>
          </Text>
          <View style={styles.resultRow}>
            <Text style={[styles.sumSmall, { color: p.muted }]}>구속이 기록됐어요</Text>
            <Text style={[styles.resultCount, { color: p.link }]}>{n}구 기록</Text>
          </View>
          {extra}
        </FlowPanel>
      );
      note = lastWarn ?? '구속이 나온 공만 기록돼요.';
      actions = (
        <>
          {endBtn}
          <FlowButton label={`계속 ${verb}`} onPress={ack} />
        </>
      );
    } else if (phase === 'missed' || phase === 'failed') {
      panel = (
        <FlowPanel tone="danger" title={phase === 'missed' ? '공을 끝까지 찾지 못했어요' : abs.on ? '판정하지 못했어요' : '구속을 계산하지 못했어요'} body={cleaned}>
          {missHint}
          {extra}
        </FlowPanel>
      );
      note = abs.on ? '이번 시도는 판정 없이 넘어갔어요.' : phase === 'missed' ? '이번 시도에는 구속값이 기록되지 않았어요.' : '추정 숫자는 기록하지 않았어요.';
      actions = (
        <>
          {endBtn}
          <FlowButton label={`다시 ${verb}`} onPress={ack} />
        </>
      );
    } else {
      panel = (
        <FlowPanel tone="warn" title="앞 공을 처리하고 있어요" body={`이 투구는 앞 공을 계산하는 동안 들어와 재지 못했어요.${backlogN > 1 ? ` 못 잰 투구 ${backlogN}개.` : ''}`}>
          {extra}
        </FlowPanel>
      );
      note = '처리가 끝난 뒤 다시 던져 주세요.';
      actions = (
        <>
          {endBtn}
          <FlowButton label={`다시 ${verb}`} onPress={ack} />
        </>
      );
    }
  }
  const showChips = !blocked && step !== 'loading' && step !== 'mode' && step !== 'guide' && !summary;
  const camWarn = !!error || !!info?.debugBuild || (fps?.dropped ?? 0) > 5;

  return (
    <View style={[styles.root, { backgroundColor: p.page, paddingTop: inset.top }]}>
      <FlowHeader title={step === 'mode' ? '카메라' : modeMeta.title} onBack={back} backLabel={backLabel} onHelp={blocked ? undefined : () => setHelp('howto')} />
      <View style={styles.finder} onLayout={(e) => setView(e.nativeEvent.layout)}>
        <DualCameraPreview style={StyleSheet.absoluteFill} />
        <VelocityEngine ref={engine} />
        {/* 존 크기 — 측정 전엔 뷰파인더 어디서든 두 손가락으로 벌려 크기(자리는 표적 밑 고정) */}
        {step === 'prep' && !distSheet ? <ZonePinch onGrow={growZone}>{null}</ZonePinch> : null}
        {/* 릴리스 표적 — 알아채기 켬(하늘) · 투구를 알아챔(노랑). 공 그림은 그리지 않는다(실측 궤적으로 오해하지 않게) */}
        {step !== 'loading' && step !== 'mode' && !blocked ? <ReleaseTarget state={measuring ? (status.visible > 0 ? 'capturing' : 'armed') : 'idle'} /> : null}
        {(editable || step === 'measure') && zoneView ? (
          <ZoneOverlay
            editable={step === 'prep'}
            onGrow={growZone}
            rect={{ left: zoneView.x * view.width, top: zoneView.y * view.height, width: zoneView.w * view.width, height: zoneView.h * view.height }}
          />
        ) : null}
        {/* ABS — 플레이트 앞변 · 존 상자(설정 단계는 끌 수 있고, 측정 중엔 옅게) */}
        {abs.on && (step === 'abs' || step === 'measure') && view.width ? (
          <PlateOverlay ends={abs.ends} poly={abs.zonePoly} frame={frame} view={view} manual={step === 'abs' && abs.manual} onEnds={abs.setEnds} dim={step === 'measure'} />
        ) : null}

        {/* 카메라 위 작은 칩 — 왼쪽 상태 · 수평(센서 값이 있을 때만) · 녹화 / 오른쪽 거리 · 초점 · 소리 · 카메라 */}
        {showChips ? (
          <View style={styles.camTop} pointerEvents="box-none">
            {/* 한 줄씩 — 왼쪽 칩은 줄어들고(글자 생략) 오른쪽 칩은 제 크기. 두 기둥으로 두면 넓은 카메라 칩이 수평 칩을 세로로 찌그러뜨렸다(320 폭) */}
            <View style={styles.camRow} pointerEvents="box-none">
              {statusChip ? (
                <View style={styles.camShrink}>
                  <CamChip dot={statusChip[1]} label={`상태 ${statusChip[0]}`}>
                    {statusChip[0]}
                  </CamChip>
                </View>
              ) : (
                <View />
              )}
              <CamChip
                icon="ruler"
                onPress={onDistance}
                label={`촬영 거리 ${receiverLabel} ${rubberDistM}미터${editable ? '' : ', 측정 중 수정 불가'}`}
                hint={editable ? '받는 곳과 거리를 바꿔요' : undefined}
              >
                {`${receiverLabel} · 설정 ${rubberDistM}m`}
              </CamChip>
            </View>
            <View style={styles.camRow} pointerEvents="box-none">
              {tilt ? <LevelChip roll={tilt.roll} ok={!!level} /> : <View />}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {canSpeak ? <CamChip icon={voice ? 'volume-2' : 'volume-x'} label={voice ? '소리 안내 끄기' : '소리 안내 켜기'} onPress={toggleVoice} /> : null}
                <CamChip icon="focus" label="초점 다시 맞추기" onPress={info && !focusBusy ? refocus : undefined} />
              </View>
            </View>
            {/* 관리자는 눌러 진단(빌드 · 카메라 · 최근 작업 시간, 2026-10-20). 누구에게나 카메라 문제(Debug · 장면 많이 버림 · 오류)는 주황으로 */}
            {start?.isAdmin || (camWarn && info) ? (
              <View style={{ alignSelf: 'flex-end', maxWidth: '100%' }}>
                <CamChip tone={camWarn ? 'warn' : undefined} label="카메라 진단" onPress={start?.isAdmin ? () => setDiag(timings.current) : undefined}>
                  {error ? '카메라 오류' : info ? pillText(info, fps) : '카메라 켜는 중'}
                </CamChip>
              </View>
            ) : null}
            {/* 아이폰 화면 기록 — 인코더를 같이 써 장면이 빠지고 공을 놓친다(10-20 금윤호 실내). 영상이 필요하면 앱의 세션 녹화로 */}
            {fps?.screenCaptured ? (
              <CamChip tone="warn" lines={2}>
                화면 기록이 켜져 있어 공을 놓칠 수 있어요{start?.canRecord ? ' (영상은 세션 녹화로)' : ''}
              </CamChip>
            ) : null}
            {/* 관리자 세션 녹화 — 측정 전엔 켜기 칩, 측정 중엔 녹화 상태(웹 velocity-screen 의 sessionRecWanted 칩) */}
            {start?.canRecord && canRecordSession() && (editable || step === 'measure') ? (
              editable && rec?.phase !== 'stopping' ? (
                <Press
                  select
                  selected={recWanted}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: recWanted }}
                  onPress={() => setRecWanted((v) => !v)}
                  style={[styles.recChip, recWanted && styles.recChipOn]}
                >
                  <View style={[styles.recDot, { backgroundColor: recWanted ? '#fff' : '#f87171' }]} />
                  <Text style={styles.recText}>{recWanted ? '세션 녹화 켬' : '세션 녹화 끔'}</Text>
                </Press>
              ) : rec && rec.phase !== 'idle' && rec.phase !== 'done' ? (
                <View style={[styles.recChip, styles.recChipOn]}>
                  <View style={[styles.recDot, { backgroundColor: '#fff' }]} />
                  <Text style={styles.recText} numberOfLines={1}>
                    {recChipText(rec)}
                  </Text>
                </View>
              ) : null
            ) : null}
            {/* ABS 측정 중 — 타자 칩(누르면 다음 타자 · 신장) */}
            {abs.on && measuring ? <BatterChip batter={abs.batter} height={abs.setup.height} onNext={abs.nextBatter} /> : null}
          </View>
        ) : null}

        {/* 모드 고르기 시트 — 열리자마자 미리보기 위(설계 2-1). 고르면 사용 방법 · 촬영 준비로 */}
        {step === 'mode' && start && !blocked && !error ? <ModeSheet value={mode} isAdmin={start.canAbs} bottom={12} onPick={(m) => openMode(m, start.today)} /> : null}
        {panel ? (
          <View style={styles.over} pointerEvents="box-none">
            <Animated.View key={panelKey} entering={panelIn}>
              {panel}
            </Animated.View>
          </View>
        ) : null}
        {/* 세션 요약 · 저장 끝 — 카메라를 덮는다(카메라는 켜 둔 채 — 이어 잴 때 다시 켜지 않게) */}
        {summary ? (
          <Animated.View key={saved ? 'saved' : n ? 'summary' : 'empty'} entering={panelIn} style={[StyleSheet.absoluteFill, { backgroundColor: p.page }]}>
            <ScrollView contentContainerStyle={styles.sumScroll}>{summary}</ScrollView>
          </Animated.View>
        ) : null}
      </View>
      <FlowDock note={note} bottom={inset.bottom}>
        {actions}
      </FlowDock>

      <DistanceSheet
        visible={distSheet}
        receiver={receiver}
        distM={rubberDistM}
        bottom={inset.bottom}
        onClose={() => setDistSheet(false)}
        onApply={(who, m) => {
          setReceiver(who);
          setRubberDistM(m);
          setDistOk(true);
          setDistSheet(false);
        }}
      />
      <FlowSheet visible={help === 'howto'} title="촬영 방법" onClose={() => setHelp(null)} bottom={inset.bottom}>
        <HelpRows rows={HOWTO_ROWS} />
        <View style={{ marginTop: 18, flexDirection: 'row' }}>
          <FlowButton
            kind="secondary"
            grow
            label="자세한 주의사항 보기"
            onPress={() => {
              setHelp(null);
              setTipsAt(0);
            }}
          />
        </View>
      </FlowSheet>
      <FlowSheet visible={help === 'silent'} title="반응이 없나요?" onClose={() => setHelp(null)} bottom={inset.bottom}>
        <Text style={[styles.sheetBody, { color: p.muted }]}>감지되지 않은 투구는 자동으로 셀 수 없어요. 아래를 확인하고 다시 던져 주세요.</Text>
        <HelpRows rows={SILENT_ROWS} />
        <View style={{ marginTop: 18, flexDirection: 'row', gap: 8 }}>
          <FlowButton kind="secondary" label="촬영 방법" onPress={() => setHelp('howto')} />
          <FlowButton label={`${verb} 화면`} onPress={() => setHelp(null)} />
        </View>
      </FlowSheet>
      <ClipModal path={replay} onClose={() => setReplay(null)} />
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

/** 촬영 방법 — 시안 도움말 셋. 자세한 주의사항은 TipsCard(velocity/tips.tsx) */
const HOWTO_ROWS: [string, string][] = [
  ['폰 놓기', `투수판 뒤 약 ${PHONE_BEHIND_RUBBER_M}m에 두고 삼각대에 고정해요. 손으로 들면 재지 않아요.`],
  ['거리 입력', '투수판부터 공이 실제로 멈추는 곳까지예요. 망이면 공이 멈추는 망 안쪽, 포수면 미트까지 재요.'],
  ['화면 맞추기', '공을 놓는 자리를 가운데 표적에 맞추고 받는 곳이 화면에 다 보이게 해요.'],
];
/** 던졌는데 반응이 없을 때 — 못 잰 까닭 1위 둘(공이 화면에서 안 움직임 · 첫 공을 놓침)과 주의사항에서 */
const SILENT_ROWS: [string, string][] = [
  ['폰 자리', `던지는 사람 뒤 약 ${PHONE_BEHIND_RUBBER_M}m에서 정면을 보고 있나요? 너무 붙으면 팔과 몸이 공을 가려요.`],
  ['표적', '공을 놓는 자리가 가운데 표적 안에 오나요?'],
  ['받는 곳', '망이나 포수 미트가 화면 안에 다 보이나요?'],
  ['밝기 · 배경', '해를 마주 보거나 공 뒤 배경이 너무 밝지 않나요?'],
  ['화면 기록', '아이폰 화면 기록이나 미러링을 끄면 놓치는 공이 줄어요.'],
];

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
  /** 지금 셔터(분모) · ISO · 셔터 상한(분모) — 10-21 부터 시도 기록에 남긴다(그날 셔터를 몰라 빠른 공 번짐을 가리지 못했다) */
  shutterDen: number | null;
  iso: number | null;
  shutterCap: number | null;
  /** 장면당 학습 모델 공 알림 시간(ms, SPEC-detect D3) — 모델이 있는 판부터 */
  netMs: number | null;
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
      `지금 ${fps.fps}fps · 버림 ${fps.dropped}/초 · 공 찾기 ${feed}ms/장${fps.feedSkipped ? ` (건너뜀 ${fps.feedSkipped}/초)` : ''} · 열 ${THERMAL_TEXT[fps.thermal ?? -1] ?? '?'}${fps.shutterDen ? ` · 셔터 1/${fps.shutterDen}${fps.shutterCap ? `(상한 1/${fps.shutterCap})` : ''} ISO ${fps.iso ?? '?'}` : ''}`
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


function Chips({ items, value, onChange }: { items: readonly string[]; value: string | null; onChange: (v: string) => void }) {
  const p = usePalette();
  return (
    <View style={styles.chips}>
      {items.map((it) => {
        const on = it === value;
        return (
          <Press
            select
            selected={on}
            key={it}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it)}
            style={[styles.chip, { backgroundColor: on ? p.action : p.chip }]}
          >
            <Text style={[styles.chipText, { color: on ? p.onAction : p.ink }]}>{it}</Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  finder: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  camTop: { position: 'absolute', top: 12, left: 12, right: 12, gap: 6 },
  camRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  camShrink: { flexShrink: 1, minWidth: 0 },
  over: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  speed: { fontSize: 56, lineHeight: 60, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 16, fontWeight: '700', letterSpacing: 0 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 },
  resultCount: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  verdictWrap: { backgroundColor: '#14283d', borderRadius: 14, padding: 10, marginBottom: 8 },
  sumScroll: { padding: 13, gap: 12 },
  sumCard: { borderRadius: 22, padding: 20 },
  sumTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  sumBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  sumNumber: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 12, marginBottom: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  sumMax: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sumUnit: { fontSize: 14, fontWeight: '700' },
  sumSmall: { fontSize: 13, lineHeight: 18 },
  sumLabel: { fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth },
  sumRowWrap: { borderTopWidth: StyleSheet.hairlineWidth },
  sumRowPress: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  sumRowKey: { fontSize: 14, minWidth: 30 },
  sumRowMid: { flex: 1, fontSize: 13 },
  sumRowVal: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  savedMark: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  sheetBody: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  recChip: {
    alignSelf: 'flex-start',
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(16,37,54,0.79)',
    maxWidth: '100%',
  },
  recChipOn: { borderColor: 'rgba(248,113,113,0.7)', backgroundColor: 'rgba(239,68,68,0.85)' },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  recText: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  diagScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: 12 },
  diagCard: { borderRadius: 20, backgroundColor: 'rgba(20,20,22,0.96)', padding: 16, gap: 6 },
  diagTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  diagLine: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontVariant: ['tabular-nums'] },
  diagHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 6 },
});
