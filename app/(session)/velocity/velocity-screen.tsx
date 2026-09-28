'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Focus,
  Hand,
  List,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  analyzeVideo,
  DEFAULT_FOV_DEG,
  type AnalyzeResult,
} from '@/lib/velocity-engine/analyze-video';
import {
  LiveCapture,
  type CameraInfo,
  type LiveStatus,
  type PitchClip,
  type ResultMeta,
} from '@/lib/velocity-engine/live-capture';
import { focalPxFromFov } from '@/lib/velocity-engine/geometry';
import { analysisOf } from '@/lib/velocity-analysis';
import { uploadClip } from '@/lib/velocity-clip-upload';
import {
  VelocityTutorial,
  setTutorialHidden,
  useTutorialHidden,
} from '@/components/velocity/tutorial';
import {
  applyCalibration,
  calibrationText,
  loadFov,
  saveFov,
  type CalFit,
} from '@/lib/velocity-calibration';
import {
  CONFIDENCE_TEXT,
  PITCH_TYPES,
  pitchTypeLabel,
  sessionSetupText,
  summarize,
  zoneLabel,
  type ConfidenceKey,
  type PitchEdit,
} from '@/lib/velocity-meta';
import {
  approachOf,
  DEFAULT_SETUP,
  frameRectToView,
  viewRectToFrame,
  loadSetup,
  modeLabel,
  saveSetup,
  SETUP_KEY,
  setupSummary,
  zoneOfPoint,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { LEVEL_OK_DEG, useDeviceLevel } from '@/lib/use-device-level';
import { SESSION_TYPES, DEFAULT_SESSION_TYPE, isRestSession } from '@/lib/session-type';
import { formatSpeed, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { BottomSheet, PitchEditorFields, ZoneGrid } from '@/components/velocity/pitch-editor';
import {
  AskPreviousStep,
  ChoicesStep,
  LevelBubble,
  PrimaryButton,
  TipsStep,
  ZoneOverlay,
  type Choices,
} from '@/components/velocity/setup-steps';
import { VelocitySettingsFields } from '@/components/velocity/velocity-settings';
import { Panel, StatRow, StepBar, Note } from '@/components/velocity/kit';
import { spinAxisFor } from '@/lib/velocity-spin';
import {
  CircleOverlay,
  DEFAULT_CIRCLE,
  LensCalibrationPanel,
  type Circle,
} from '@/components/velocity/lens-calibration';
import { useStoredLens } from '@/components/velocity/velocity-settings';
import {
  clearLens,
  focalPxFor,
  fovDegFromFocal,
  lensMatches,
} from '@/lib/velocity-lens';
import { saveVelocitySession, type SavePitchInput } from '@/app/actions/velocity';
import { SpinAxisGraphic, SpinAxisNote } from '@/components/velocity/spin-axis';
import { SessionSummary } from '@/components/velocity/session-summary';
import { AdminJump } from '@/components/velocity/admin-jump';
import {
  throwingHandOf,
  type SessionPitch,
  type VelocityScreenKey,
} from '@/components/velocity/session-types';

/**
 * 구속 측정 화면 — Smart Scout · PitchLab 의 흐름을 우리 모양(아이폰 느낌)으로.
 *
 *   1 지난 설정 그대로?  → 2 투구/타격 · 투수 뒤/포수 뒤 · 네트  → 3 주의사항 카드(자세히)
 *   → 4 카메라: 수평계 · 릴리스 포인트를 표적에  → 5 반투명 스트라이크 존 놓기  → 6 측정
 *   → 세션(측정 중 화면: 구속 · 구종 · 회전축 · 이전 공)  → 세션 종료 → 세션 요약(저장하기 · 계속 재기)
 *
 * 카메라는 4에서 켜져 6까지 같은 <video> 로 이어진다. 고른 것과 존 자리는 브라우저에 남겨
 * 다음에는 1에서 바로 4로 간다. 6의 설정에서 소리 안내 · 화각 · 보정 · 처음부터 다시.
 *
 * PC 에서는 이 전체를 폰 크기 틀(390px) 안에 띄운다 — 폰이 기준이라 PC 화면에 맞춰 늘리지
 * 않는다. 잰 값은 '저장'을 누를 때 서버로 간다(app/actions/velocity.ts). 영상은 어디에도 안 올린다.
 */

export type Step = 'choices' | 'tips' | 'align' | 'zone' | 'measure' | 'lens';
type LocalClip = { url: string; blob: Blob; durationSec: number; eventSec: number };
type LocalPitch = SavePitchInput & {
  id: number;
  source: 'camera' | 'file';
  /** LiveCapture 결과 번호 — 뒤에 오는 영상 클립과 짝 */
  captureId?: number;
  clip?: LocalClip;
  /** 관리자 점프 도구가 넣은 예시 공 — 화면 확인용, 저장은 막는다 */
  sample?: boolean;
};

/* 관리자 점프의 '예시 공' — 화면(세션 · 요약 · 이전 공)을 자료 없이도 확인할 수 있게 */
const SAMPLE_PITCHES: { kmh: number; type: string; zone: number; result: string }[] = [
  { kmh: 128.4, type: 'fastball', zone: 5, result: 'strike' },
  { kmh: 131.2, type: 'fastball', zone: 2, result: 'ball' },
  { kmh: 112.7, type: 'slider', zone: 9, result: 'strike' },
  { kmh: 118.9, type: 'changeup', zone: 8, result: 'strike' },
];

/** 보정용 저장이 아닐 때 이 폰에 쥐고 있는 클립 수(메모리) — 넘으면 오래된 것부터 버린다 */
const MAX_LOCAL_CLIPS = 30;

/* 카메라 앱 모양의 단추 — 위 줄 동그라미 · 아래 보조 단추 · 라벨 */
const CHROME_BTN =
  'inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60 disabled:opacity-40';
const SIDE_BTN =
  'inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors active:bg-white/25 disabled:opacity-40';
const SIDE_LABEL = 'mt-1 text-xs text-white/70';

const STATUS_TEXT: Record<LiveStatus, string> = {
  off: '카메라 꺼짐',
  starting: '카메라 켜는 중…',
  ready: '준비됨',
  settling: '잠잠해지면 시작해요',
  armed: '던지세요',
  capturing: '담는 중',
  analyzing: '계산 중…',
};

const THROW_TYPES = SESSION_TYPES.filter((t) => !isRestSession(t.name));
const EMPTY_EDIT: PitchEdit = {
  pitchType: null,
  zone: null,
  result: null,
  gunKmh: null,
  memo: null,
};

let seq = 0;

/* 저장된 설정을 그리는 동안 읽는다 — 서버에서는 없음, 브라우저에서는 있으면 '지난 설정' 단계 */
const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
const readSetupRaw = () => {
  try {
    return localStorage.getItem(SETUP_KEY);
  } catch {
    return null;
  }
};

export function VelocityScreen({
  isAdmin,
  native,
  today,
  calibration,
  throwingHand = null,
  initialStep = 'choices',
}: {
  isAdmin: boolean;
  native: boolean;
  today: string;
  /** 서버가 그 사람의 스피드건 짝으로 맞춘 보정식 */
  calibration: CalFit;
  /** 프로필의 던지는 손('우투' · '좌투' · '양투') — 회전축 그림의 좌우 */
  throwingHand?: string | null;
  /** 처음 보일 단계 — 미리보기 · 시험용. 보통은 처음부터 */
  initialStep?: Step;
}) {
  const router = useRouter();
  const unit = useSpeedUnit();
  const hand = throwingHandOf(throwingHand);
  const videoRef = useRef<HTMLVideoElement>(null);
  const finderRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<LiveCapture | null>(null);
  const pitchesRef = useRef<LocalPitch[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── 설정 단계 ── */
  const storedRaw = useSyncExternalStore(subscribeStorage, readSetupRaw, () => null);
  const stored = useMemo(() => (storedRaw ? loadSetup() : null), [storedRaw]);
  const [decided, setDecided] = useState(initialStep !== 'choices');
  const [step, setStep] = useState<Step>(initialStep);
  const [choices, setChoices] = useState<Choices>({
    mode: DEFAULT_SETUP.mode,
    cameraPos: DEFAULT_SETUP.cameraPos,
    net: DEFAULT_SETUP.net,
  });
  const [zone, setZone] = useState<ZoneRect>(DEFAULT_SETUP.zone);
  const [voice, setVoice] = useState(false);
  const [releaseDistM, setReleaseDistM] = useState(DEFAULT_SETUP.releaseDistM);
  const [autoMode, setAutoMode] = useState(DEFAULT_SETUP.autoMode);
  const [calibSave, setCalibSave] = useState(DEFAULT_SETUP.calibSave);
  /* 보정용 저장은 관리자만 효과가 있다 */
  const calibOn = isAdmin && calibSave;
  /* 세션 — 시작하면 카메라를 숨기고 정보 판을 보인다 */
  const [live, setLive] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  /* 세션을 끝낸 뒤 — 종합 화면(저장하기 · 계속 재기) */
  const [summaryOpen, setSummaryOpen] = useState(false);
  /* 세션 중 오른쪽 아래 '이전 공' 시트 */
  const [prevOpen, setPrevOpen] = useState(false);
  const [clipOpen, setClipOpen] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(
    null
  );
  /* 뷰파인더가 마지막으로 보였을 때 크기 — 숨긴 동안 코스를 짐작할 때 */
  /* 처음 쓰는 사람에게 튜토리얼 — '다시 보지 않기'면 안 뜬다 */
  const tutorialHidden = useTutorialHidden();
  const [tutorialDone, setTutorialDone] = useState(false);
  /* 설정의 '사용 안내 다시 보기' — '다시 보지 않기'를 골랐어도 한 번 연다 */
  const [tutorialForce, setTutorialForce] = useState(false);
  const tutorialOpen = (tutorialHidden === false && !tutorialDone) || tutorialForce;
  const showAsk = stored != null && !decided;
  const approach = approachOf(choices);

  /* ── 카메라 · 측정 ── */
  const [status, setStatus] = useState<LiveStatus>('off');
  const [camera, setCamera] = useState<CameraInfo | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<AnalyzeResult | null>(null);
  const [pitches, setPitches] = useState<LocalPitch[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const { level, requestPermission } = useDeviceLevel(step === 'align');

  const [fov, setFov] = useState(() => loadFov(DEFAULT_FOV_DEG));
  const [useCal, setUseCal] = useState(true);
  /* 렌즈 보정(공으로 잰 초점거리) — 있으면 화각 가정 대신 쓴다 */
  const lens = useStoredLens();
  /* 저장된 보정이 지금 카메라(이름 · 비율 · 줌)와 맞을 때만 쓴다 — 다른 폰 · 렌즈 값이 섞이지 않게 */
  const lensOk = lensMatches(lens, camera);
  const focalRatio = lensOk ? lens.focalPerLongSide : null;
  const zoomBad = camera?.zoom != null && Math.abs(camera.zoom - 1) > 0.05;
  const [circle, setCircle] = useState<Circle>(DEFAULT_CIRCLE);
  /* 뷰파인더 칸의 크기 — 스트라이크 존(장면 좌표)을 칸 좌표로 바꿔 그릴 때 */
  const [finderSize, setFinderSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const fit = calibration;
  const shown = (raw: number) =>
    useCal && fit.n > 0 ? applyCalibration(raw, fit) : raw;

  const [sheet, setSheet] = useState<'none' | 'settings' | 'save' | 'pitch'>('none');
  const [editing, setEditing] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<string>(DEFAULT_SESSION_TYPE);
  const [intensity, setIntensity] = useState(7);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    pitchesRef.current = pitches;
  }, [pitches]);
  /* 저장하지 않은 공이 있으면 탭을 닫거나 새로고침할 때 브라우저가 한 번 묻는다 */
  const unsaved = pitches.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      captureRef.current = null;
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
      for (const p of pitchesRef.current) if (p.clip) URL.revokeObjectURL(p.clip.url);
    };
  }, []);

  /* 소리로 알린다 — 설정에서 켰을 때만. 폰 스피커로 '백삼십이' 하고 읽는다 */
  const speak = (text: string) => {
    if (!voice || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  };

  const persistSetup = (patch: Partial<Omit<VelocitySetup, 'savedAt'>> = {}) =>
    saveSetup({
      ...choices,
      zone,
      voice,
      useCal,
      releaseDistM,
      autoMode,
      calibSave,
      ...patch,
    });

  const addResult = (
    result: AnalyzeResult,
    source: LocalPitch['source'],
    meta?: ResultMeta
  ) => {
    setLast(result);
    if (!result.measure.ok) {
      speak('못 쟀어요');
      return;
    }
    const m = result.measure;
    const r = result.release;
    const value = shown(m.kmh);

    /*
     * 코스 짐작 — 마지막으로 잡힌 공이 스트라이크 존의 어느 칸에 있었나. 포수 뒤에서는 마지막
     * 공이 미트 근처라 잘 맞고, 투수 뒤에서는 공이 멀어 어림일 뿐이다. 사람이 고칠 수 있다.
     */
    let guessedZone: number | null = null;
    const tail = result.track[result.track.length - 1];
    /* 존은 장면 좌표라 뷰파인더 크기와 상관없이 잰다(세션 중 카메라를 가려도 같다) */
    if (tail && source === 'camera') {
      guessedZone = zoneOfPoint(
        tail.x / result.analyzeSize.width,
        tail.y / result.analyzeSize.height,
        zone,
        choices.cameraPos
      );
    }

    setPitches((prev) => [
      ...prev,
      {
        id: ++seq,
        source,
        rawKmh: m.kmh,
        errorKmh: m.errorKmh,
        confidence: m.confidence,
        releaseKmh: r?.releaseKmh ?? null,
        releaseDxCm: r?.dxCm ?? null,
        releaseDyCm: r?.dyCm ?? null,
        releaseDistM: r?.distanceM ?? m.detail.releaseDistanceM,
        travelM: m.detail.travelM,
        durationSec: m.detail.durationSec,
        frames: m.detail.frames,
        fps: result.fps,
        analysis: analysisOf(result, approach),
        autoDetected: source === 'camera' ? autoMode : false,
        captureId: meta?.id,
        ...EMPTY_EDIT,
        zone: guessedZone,
      },
    ]);
    setSaved(false);
    if (navigator.vibrate) navigator.vibrate(30);
    speak(`${Math.round(toSpeed(value, unit))}`);
  };
  useEffect(() => {
    addResultRef.current = addResult;
  });

  const startCamera = async () => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setLast(null);
    const capture = new LiveCapture(
      video,
      {
        onStatus: setStatus,
        onResult: (r, meta) => addResultRef.current(r, 'camera', meta),
        onClip: (id, clip) => attachClipRef.current(id, clip),
        onError: setError,
        onFps: (f) => setFps(Math.round(f)),
      },
      fov,
      approach,
      choices.net
    );
    capture.setFocalPerLongSide(focalRatio);
    capture.setReleaseDistance(approach === 'approaching' ? releaseDistM : null);
    capture.setManual(!autoMode);
    capture.setClips(true);
    captureRef.current?.stop();
    captureRef.current = capture;
    try {
      setCamera(await capture.start());
    } catch (e) {
      setError(e instanceof Error ? e.message : '카메라를 켜지 못했습니다.');
      captureRef.current = null;
    }
  };

  const stopCamera = () => {
    captureRef.current?.stop();
    captureRef.current = null;
    setCamera(null);
    setFps(null);
    setLive(false);
    setShowCamera(false);
  };

  /* 단계 옮기기 */
  const usePrevious = () => {
    if (!stored) return;
    setChoices({ mode: stored.mode, cameraPos: stored.cameraPos, net: stored.net });
    setZone(stored.zone);
    setVoice(stored.voice);
    setUseCal(stored.useCal);
    setReleaseDistM(stored.releaseDistM);
    setAutoMode(stored.autoMode);
    setCalibSave(stored.calibSave);
    setDecided(true);
    setStep('align');
    void startCamera();
  };
  const startFresh = () => {
    setDecided(true);
    setStep('choices');
  };
  const goAlign = () => {
    setStep('align');
    void startCamera();
  };
  const goZone = () => setStep('zone');
  const goMeasure = () => {
    persistSetup();
    captureRef.current?.setApproach(approach);
    setStep('measure');
  };
  const restart = () => {
    captureRef.current?.disarm();
    stopCamera();
    setSheet('none');
    setDecided(true);
    setStep('choices');
  };

  /* 최신 처리 함수를 ref 로 — LiveCapture 의 handler 는 카메라를 켤 때의 closure 라 그대로 두면 존 · 설정이 옛 값이다 */
  const addResultRef = useRef<
    (r: AnalyzeResult, s: LocalPitch['source'], m?: ResultMeta) => void
  >(() => undefined);
  const attachClipRef = useRef<(id: number, clip: PitchClip) => void>(() => undefined);
  const calibOnRef = useRef(false);
  useEffect(() => {
    calibOnRef.current = calibOn;
  }, [calibOn]);
  useEffect(() => {
    captureRef.current?.setManual(!autoMode);
  }, [autoMode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  /* 결과 뒤 1~3초 안에 오는 영상 클립을 그 공에 붙인다. 보정용 저장이 아니면 최근 몇 개만 쥔다(메모리) */
  const attachClipToPitch = (id: number, clip: PitchClip) => {
    const url = URL.createObjectURL(clip.blob);
    setPitches((prev) => {
      const next = prev.map((p) =>
        p.captureId === id
          ? {
              ...p,
              clip: {
                url,
                blob: clip.blob,
                durationSec: clip.durationSec,
                eventSec: clip.eventSec,
              },
            }
          : p
      );
      if (calibOnRef.current) return next;
      const withClip = next.filter((p) => p.clip);
      const drop = withClip.slice(0, Math.max(0, withClip.length - MAX_LOCAL_CLIPS));
      if (!drop.length) return next;
      for (const d of drop) if (d.clip) URL.revokeObjectURL(d.clip.url);
      const dropIds = new Set(drop.map((d) => d.id));
      return next.map((p) => (dropIds.has(p.id) ? { ...p, clip: undefined } : p));
    });
  };
  useEffect(() => {
    attachClipRef.current = attachClipToPitch;
  });

  /* 세션 — 시작하면 카메라를 숨기고 알아서 잡는다(수동이면 공마다 단추). 종료하면 저장 시트 */
  const startSession = () => {
    const capture = captureRef.current;
    if (!capture) return;
    setError(null);
    setLast(null);
    setSaved(false);
    setShowCamera(false);
    capture.setManual(!autoMode);
    capture.arm();
    setLive(true);
    speak(
      autoMode ? '측정을 시작해요. 던지세요' : '측정을 시작해요. 공마다 단추를 누르세요'
    );
  };
  /* 세션 종료 — 잰 공이 있으면 종합 화면으로. 거기서 저장하거나(끝) 이어서 잰다 */
  const endSession = () => {
    captureRef.current?.disarm();
    setLive(false);
    setShowCamera(false);
    setPrevOpen(false);
    if (pitches.length > 0) setSummaryOpen(true);
  };
  /* 요약에서 '구속 측정하기' — 같은 세션에 공을 더 잰다(카메라가 꺼져 있으면 대기 화면으로) */
  const continueSession = () => {
    setSummaryOpen(false);
    startSession();
  };
  const nextPitch = () => {
    captureRef.current?.arm();
  };
  /* 나가기 — 저장하지 않은 공이 있으면 한 번 묻는다(말없이 사라지지 않게) */
  const leave = () => {
    if (
      pitches.length > 0 &&
      !window.confirm(
        `저장하지 않은 공 ${pitches.length}개가 있어요. 저장하지 않고 나갈까요?`
      )
    ) {
      return;
    }
    router.push('/videos?view=velocity');
  };
  const refocus = async () => {
    const capture = captureRef.current;
    if (!capture || focusBusy) return;
    setFocusBusy(true);
    const focus = await capture.refocus();
    setCamera((c) => (c ? { ...c, focus } : c));
    setFocusBusy(false);
    setToast(
      focus === 'unsupported'
        ? '이 기기는 브라우저에서 초점을 못 만져요'
        : '초점을 다시 맞췄어요'
    );
  };

  const pickFile = async (file: File) => {
    setFileBusy(true);
    setFileProgress(0);
    setError(null);
    setLast(null);
    try {
      addResult(
        await analyzeVideo({
          file,
          fovDeg: fov,
          onProgress: setFileProgress,
          approach,
          focalPerLongSide: focalRatio,
          releaseDistanceM: approach === 'approaching' ? releaseDistM : null,
        }),
        'file'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상을 분석하지 못했습니다.');
    } finally {
      setFileBusy(false);
    }
  };

  useEffect(() => {
    captureRef.current?.setFocalPerLongSide(focalRatio);
  }, [focalRatio]);
  useEffect(() => {
    const el = finderRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!(width > 0 && height > 0)) return;
      setFinderSize((prev) =>
        prev &&
        Math.abs(prev.width - width) < 0.5 &&
        Math.abs(prev.height - height) < 0.5
          ? prev
          : { width, height }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [step, showAsk]);
  useEffect(() => {
    captureRef.current?.setReleaseDistance(
      approach === 'approaching' ? releaseDistM : null
    );
  }, [approach, releaseDistM]);

  const changeFov = (next: number) => {
    setFov(next);
    saveFov(next);
    captureRef.current?.setFov(next);
  };

  const patch = (id: number, edit: Partial<PitchEdit>) =>
    setPitches((prev) => prev.map((p) => (p.id === id ? { ...p, ...edit } : p)));
  const remove = (id: number) => {
    setPitches((prev) => prev.filter((p) => p.id !== id));
    setSheet('none');
    setEditing(null);
  };

  const shownPitches = pitches.map((p) => ({ ...p, kmh: shown(p.rawKmh) }));
  const stats = summarize(shownPitches);
  /* 세션 화면 · 요약 · 이전 공 시트가 받는 모양(components/velocity/session-types.ts) */
  const sessionPitches: SessionPitch[] = shownPitches.map((p, i) => ({
    id: p.id,
    seq: i + 1,
    kmh: p.kmh,
    rawKmh: p.rawKmh,
    errorKmh: p.errorKmh,
    confidence: (p.confidence in CONFIDENCE_TEXT ? p.confidence : 'medium') as ConfidenceKey,
    releaseKmh: p.releaseKmh != null ? shown(p.releaseKmh) : null,
    releaseDxCm: p.releaseDxCm,
    releaseDyCm: p.releaseDyCm,
    releaseDistM: p.releaseDistM,
    travelM: p.travelM,
    durationSec: p.durationSec,
    frames: p.frames,
    fps: p.fps,
    pitchType: p.pitchType,
    zone: p.zone,
    result: p.result,
    gunKmh: p.gunKmh,
    memo: p.memo,
    autoDetected: p.autoDetected !== false,
    source: p.source,
    clip: p.clip
      ? { url: p.clip.url, durationSec: p.clip.durationSec, eventSec: p.clip.eventSec }
      : null,
  }));
  const lastPitch = pitches[pitches.length - 1] ?? null;
  const spinAxis = spinAxisFor(lastPitch?.pitchType ?? null, hand);
  const editingPitch =
    editing == null ? null : (pitches.find((p) => p.id === editing) ?? null);
  const clipPitch =
    clipOpen == null ? null : (pitches.find((p) => p.id === clipOpen) ?? null);

  const save = () => {
    if (!stats || saving) return;
    /* 관리자 점프의 예시 공은 화면 확인용 — 실제 기록에 섞이면 안 된다 */
    if (pitches.some((p) => p.sample)) {
      setSheet('none');
      setError('예시 공은 저장할 수 없어요 — 관리자 이동 › 예시 공 지우기.');
      return;
    }
    setError(null);
    startSaving(async () => {
      const longSide = camera ? Math.max(camera.width, camera.height) : null;
      const res = await saveVelocitySession({
        date: today,
        sessionType,
        intensity,
        fovDeg: fov,
        source: pitches.every((p) => p.source === 'file') ? 'file' : 'camera',
        device: camera
          ? `${camera.label} ${camera.width}×${camera.height}`.trim()
          : null,
        mode: choices.mode,
        cameraPos: choices.cameraPos,
        net: choices.net,
        forCalibration: calibOn,
        autoMode,
        focalPx: longSide
          ? focalRatio
            ? focalRatio * longSide
            : focalPxFromFov(longSide, fov)
          : null,
        lensCal: lensOk ? lens : null,
        releaseDistM: approach === 'approaching' ? releaseDistM : null,
        frameW: camera?.width ?? null,
        frameH: camera?.height ?? null,
        pitches: pitches.map((p) => ({
          rawKmh: p.rawKmh,
          errorKmh: p.errorKmh,
          confidence: p.confidence,
          releaseKmh: p.releaseKmh,
          releaseDxCm: p.releaseDxCm,
          releaseDyCm: p.releaseDyCm,
          releaseDistM: p.releaseDistM,
          travelM: p.travelM,
          durationSec: p.durationSec,
          frames: p.frames,
          fps: p.fps,
          pitchType: p.pitchType,
          zone: p.zone,
          result: p.result,
          gunKmh: p.gunKmh,
          memo: p.memo,
          analysis: p.analysis ?? null,
          autoDetected: p.autoDetected !== false,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      /* 보정용 저장이면 공마다 영상 클립을 올린다 — 실패해도 측정값은 이미 저장됐다 */
      if (calibOn && res.pitchIds) {
        const ids = res.pitchIds;
        const targets = pitches
          .map((p, i) => ({ p, id: ids[i] }))
          .filter(
            (t): t is { p: LocalPitch & { clip: LocalClip }; id: string } =>
              !!t.p.clip && !!t.id
          );
        if (targets.length) {
          setUploading({ done: 0, total: targets.length });
          let failed = 0;
          for (let i = 0; i < targets.length; i++) {
            const { p, id } = targets[i];
            const r = await uploadClip(id, p.clip.blob, {
              sec: p.clip.durationSec,
              eventSec: p.clip.eventSec,
            });
            if (!r.ok) failed++;
            setUploading({ done: i + 1, total: targets.length });
          }
          setUploading(null);
          if (failed)
            setError(`클립 ${failed}개를 올리지 못했어요(측정값은 저장됐어요).`);
        }
      }
      for (const p of pitches) if (p.clip) URL.revokeObjectURL(p.clip.url);
      setSaved(true);
      setPitches([]);
      setClipOpen(null);
      setSheet('none');
      setSummaryOpen(false);
      /*
       * 저장은 곧 측정의 끝(사용자 규칙: '세션 저장하기'로 끝내고, 더 재려면 '구속 측정하기').
       * 저장된 세션이 보이는 곳으로 간다 — 앱은 투구 기록의 [구속 측정] 보기, 관리자 웹은
       * 구속 측정 관리자의 오늘 폴더. 화면을 떠나면 카메라도 꺼진다.
       */
      router.push(
        native ? '/videos?view=velocity' : isAdmin ? `/admin/velocity?at=${today}` : '/videos'
      );
    });
  };

  /* ── 관리자 점프 — 측정 화면 안의 어느 화면으로든(components/velocity/admin-jump.tsx) ── */
  const currentScreen: VelocityScreenKey = showAsk
    ? 'ask'
    : summaryOpen
      ? 'summary'
      : step === 'measure'
        ? live
          ? 'live'
          : 'measure'
        : step;
  const jumpTo = (key: VelocityScreenKey) => {
    setSheet('none');
    setPrevOpen(false);
    setClipOpen(null);
    setEditing(null);
    if (key === 'ask') {
      if (!stored) {
        setToast('저장된 설정이 없어요 — 설정을 한 번 마치면 생겨요');
        return;
      }
      setLive(false);
      setSummaryOpen(false);
      setDecided(false);
      return;
    }
    setDecided(true);
    if (key === 'live') {
      setStep('measure');
      setSummaryOpen(false);
      setShowCamera(false);
      setLive(true);
      return;
    }
    if (key === 'summary') {
      setStep('measure');
      setLive(false);
      setSummaryOpen(true);
      return;
    }
    setLive(false);
    setSummaryOpen(false);
    setStep(key);
  };
  const addSamplePitches = () => {
    setPitches((prev) => [
      ...prev,
      ...SAMPLE_PITCHES.map((sp, i) => ({
        id: ++seq,
        source: 'camera' as const,
        sample: true,
        rawKmh: sp.kmh,
        errorKmh: 2.1,
        confidence: i === 2 ? 'medium' : 'high',
        releaseKmh: Math.round((sp.kmh + 2.3) * 10) / 10,
        releaseDxCm: Math.round(((i % 3) - 1) * 4.2 * 10) / 10,
        releaseDyCm: Math.round((i * 1.5 - 2) * 10) / 10,
        releaseDistM: 1.3,
        travelM: 5.4,
        durationSec: 0.16,
        frames: 11,
        fps: 120,
        analysis: null,
        autoDetected: true,
        pitchType: sp.type,
        zone: sp.zone,
        result: sp.result,
        gunKmh: null,
        memo: null,
      })),
    ]);
    setLast(null);
    setSaved(false);
    setToast(`예시 공 ${SAMPLE_PITCHES.length}개를 넣었어요(저장은 안 돼요)`);
  };
  const clearSamplePitches = () => {
    setPitches((prev) => {
      for (const p of prev) if (p.sample && p.clip) URL.revokeObjectURL(p.clip.url);
      return prev.filter((p) => !p.sample);
    });
  };

  const cameraOn = status !== 'off' && status !== 'starting';
  const lowFps = fps != null && fps < 60;
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;
  const levelOk =
    !level.supported ||
    (Math.abs(level.roll ?? 0) <= LEVEL_OK_DEG &&
      Math.abs(level.pitch ?? 0) <= LEVEL_OK_DEG);
  const targetText =
    choices.mode === 'hit'
      ? '배트에 맞는 지점'
      : choices.cameraPos === 'behind-pitcher'
        ? '릴리스 포인트'
        : '미트가 오는 자리';

  /* 스트라이크 존 — 장면 좌표를 지금 뷰파인더 칸에 맞춰 그린다(카메라가 꺼져 있으면 칸 = 장면으로 본다) */
  const frameSize = camera ? { width: camera.width, height: camera.height } : null;
  const viewZone =
    frameSize && finderSize ? frameRectToView(zone, frameSize, finderSize) : zone;

  /* 뷰파인더 — 4 · 5 · 6 단계가 같은 <video> 를 쓴다 */
  const finder = (
    <div
      ref={finderRef}
      className={
        step === 'measure'
          ? 'relative h-full w-full overflow-hidden bg-black'
          : step === 'lens'
            ? 'relative aspect-[3/4] max-h-[50dvh] w-full overflow-hidden rounded-2xl bg-black'
            : 'relative h-full min-h-40 w-full overflow-hidden rounded-2xl bg-black'
      }
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`h-full w-full object-cover ${cameraOn ? '' : 'hidden'}`}
      />

      {!cameraOn && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <Camera aria-hidden className="h-6 w-6 text-white/80" />
          </span>
          {status === 'starting' ? (
            <p className="inline-flex items-center gap-2 text-xs text-white/60">
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              카메라 켜는 중…
            </p>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25"
            >
              카메라 다시 켜기
            </button>
          )}
        </div>
      )}

      {/* 스트라이크 존 — 5에서 놓고 6에서 비쳐 보인다 */}
      {cameraOn && step === 'lens' && (
        <CircleOverlay value={circle} onChange={setCircle} />
      )}
      {cameraOn && step !== 'align' && step !== 'lens' && (
        <ZoneOverlay
          rect={viewZone}
          onChange={(next) =>
            setZone(
              frameSize && finderSize
                ? viewRectToFrame(next, frameSize, finderSize)
                : next
            )
          }
          editable={step === 'zone'}
        />
      )}

      {/* 표적 — 릴리스 포인트 */}
      {cameraOn && step !== 'zone' && step !== 'lens' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 text-white">
          <div
            className={`absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors ${
              status === 'armed'
                ? 'border-sky-soft shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]'
                : status === 'capturing'
                  ? 'border-warn-line'
                  : 'border-white/70'
            }`}
          >
            <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-current opacity-80" />
            <span className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-current opacity-80" />
            <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current opacity-80" />
            <span className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current opacity-80" />
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
          </div>
          <p className="absolute left-1/2 top-[calc(50%+4.5rem)] -translate-x-1/2 whitespace-nowrap text-xs font-semibold tracking-wide text-white/85 drop-shadow">
            {targetText}
          </p>
        </div>
      )}

      {/* 위 줄 — 상태 · 수평계 · 카메라 정보 */}
      {cameraOn && (
        <div
          className={`pointer-events-none absolute inset-x-3 flex items-start justify-between gap-2 text-xs ${
            step === 'measure' ? 'top-[calc(3.5rem+env(safe-area-inset-top))]' : 'top-3'
          }`}
        >
          {step === 'measure' ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold backdrop-blur ${
                status === 'armed'
                  ? 'bg-sky text-white'
                  : status === 'capturing'
                    ? 'bg-warn text-white'
                    : 'bg-black/55 text-white/90'
              }`}
            >
              {(status === 'analyzing' || status === 'settling') && (
                <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
              )}
              {status === 'armed' && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              )}
              {STATUS_TEXT[status]}
            </span>
          ) : step === 'align' ? (
            <LevelBubble level={level} />
          ) : (
            <span />
          )}
          {camera && (
            <span
              className={`rounded-full px-2.5 py-1 tabular-nums backdrop-blur ${
                lowFps ? 'bg-warn text-white' : 'bg-black/55 text-white/80'
              }`}
            >
              {camera.width}×{camera.height}
              {fps != null && ` · ${fps}fps`}
              {camera.focus === 'manual' && ' · 수동초점'}
              {camera.focus === 'auto' && ' · 자동초점'}
            </span>
          )}
        </div>
      )}

      {/* 수평계 허락(아이폰) */}
      {step === 'align' && cameraOn && level.needsPermission && (
        <button
          type="button"
          onClick={requestPermission}
          className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-ink shadow"
        >
          기울기 허용하기
        </button>
      )}

      {/* 결과 — 6에서 카메라 위에 크게 */}
      {step === 'measure' && last && !fileBusy && !(live && !showCamera) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pb-5 pt-12 text-white">
          {last.measure.ok ? (
            <div className="motion-safe:animate-fade-in">
              <p className="text-display text-6xl leading-none tabular-nums">
                {speedNum(shown(last.measure.kmh))}
                <span className="ml-2 text-lg text-white/70">{speedLabel(unit)}</span>
              </p>
              <p className="mt-1.5 text-xs text-white/75">
                ± {last.measure.errorKmh} · {CONFIDENCE_TEXT[last.measure.confidence]}
                {last.release &&
                  ` · 릴리스 추정 ${speedNum(shown(last.release.releaseKmh))}`}
                {useCal && fit.n > 0 && ` · 보정 전 ${last.measure.kmh}`}
              </p>
            </div>
          ) : (
            <div className="motion-safe:animate-fade-in">
              <p className="text-sm font-bold text-warn-line">재지 않았어요</p>
              <p className="mt-1 text-xs leading-relaxed text-white/90">
                {last.measure.message}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/60">
                {last.measure.fix}
              </p>
              <p className="mt-1.5 text-[10px] text-white/45 tabular-nums">
                {last.sourceSize.width}×{last.sourceSize.height}
                {last.fps != null && ` · ${Math.round(last.fps)}fps`} · 프레임{' '}
                {last.frameCount} · 공 {last.track.length} · 흔들림 {last.shakePx}
              </p>
            </div>
          )}
        </div>
      )}

      {fileBusy && (
        <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/70 px-4 py-3 text-xs text-white/85 backdrop-blur">
          <p className="inline-flex items-center gap-2">
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            영상을 한 장씩 살펴보는 중… {Math.round(fileProgress * 100)}%
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-sky transition-[width]"
              style={{ width: `${Math.round(fileProgress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    /*
     * 폰 틀. PC(desk)에서는 390px 폭 · 둥근 모서리 · 테두리로 폰처럼 보이고, 폰에서는 화면을
     * 꽉 채운다. ui-chrome — PC 의 작아진 크기 기준을 쓰지 않고 폰 크기 그대로 그린다.
     */
    <div className="ui-chrome relative flex min-h-0 flex-1 flex-col bg-page text-ink desk:mx-auto desk:my-4 desk:h-[calc(100dvh-2rem)] desk:max-h-[52.75rem] desk:w-[24.375rem] desk:flex-none desk:overflow-hidden desk:rounded-[2.5rem] desk:border-[6px] desk:border-ink/85 desk:shadow-2xl">
      {tutorialOpen && (
        <VelocityTutorial
          open
          onClose={(hide) => {
            setTutorialHidden(hide);
            setTutorialDone(true);
            setTutorialForce(false);
          }}
        />
      )}
      {/*
        관리자 점프 — 측정 화면 안의 화면들로 곧장(사용자 요청: 관리자가 기능을 확인해 보게). 접히면
        반투명한 손잡이, 누르면 화면 이름 목록. 일반 계정은 이 부품이 없다.
      */}
      {isAdmin && (
        <AdminJump
          current={currentScreen}
          onJump={jumpTo}
          tools={[
            { label: `예시 공 ${SAMPLE_PITCHES.length}개 넣기`, onClick: addSamplePitches },
            { label: '예시 공 지우기', onClick: clearSamplePitches },
          ]}
          className="absolute left-0 top-1/2 z-30 -translate-y-1/2"
        />
      )}
      {/* 내비게이션 바 — 측정 단계는 카메라 앱처럼 위 줄을 카메라 위에 그린다 */}
      {!(step === 'measure' && !showAsk) && (
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)]">
          {step === 'align' && !showAsk ? (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setStep('tips');
              }}
              className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
              주의사항
            </button>
          ) : step === 'lens' ? (
            <button
              type="button"
              onClick={() => setStep('measure')}
              className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
              측정
            </button>
          ) : step === 'zone' ? (
            <button
              type="button"
              onClick={() => setStep('align')}
              className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
              수평
            </button>
          ) : (
            <button
              type="button"
              onClick={leave}
              className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
              투구 기록
            </button>
          )}
          <h1 className="text-heading text-base">{modeLabel(choices.mode)} 측정</h1>
          {step === 'measure' ? (
            <button
              type="button"
              onClick={() => setSheet('settings')}
              aria-label="설정"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-sky transition-colors hover:bg-sky-tint"
            >
              <Settings2 aria-hidden className="h-5 w-5" />
            </button>
          ) : (
            <span className="h-10 w-10" />
          )}
        </header>
      )}

      {/* 1 · 2 · 3 — 카메라 앞 단계 */}
      {showAsk && stored && (
        <AskPreviousStep setup={stored} onUse={usePrevious} onFresh={startFresh} />
      )}
      {!showAsk && step === 'choices' && (
        <ChoicesStep
          value={choices}
          onChange={setChoices}
          onNext={() => setStep('tips')}
        />
      )}
      {!showAsk && step === 'tips' && (
        <TipsStep
          choices={choices}
          onNext={goAlign}
          onBack={() => setStep('choices')}
        />
      )}

      {/* 4 · 5 — 카메라 맞추기 · 존 놓기 */}
      {!showAsk && (step === 'align' || step === 'zone') && (
        <>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3">
            <StepBar step={step === 'align' ? 4 : 5} total={6} />
            <h2 className="text-heading mt-3 text-xl leading-tight short:mt-2 short:text-lg">
              {step === 'align'
                ? '수평을 맞추고 표적을 맞추세요'
                : '스트라이크 존을 놓으세요'}
            </h2>
            <p className="mb-3 mt-1 text-sm leading-snug text-muted short:mb-2">
              {step === 'align'
                ? `${withGa(targetText)} 가운데 표적에 오게 폰 높이와 방향을 맞추세요.${
                    level.supported ? ' 위 수평계가 초록이 되면 좋아요.' : ''
                  }`
                : '끌어서 옮기고 오른쪽 아래 손잡이로 크기를 바꾸세요. 잰 공의 코스를 짐작하는 데 써요.'}
            </p>
            <div className="min-h-0 flex-1">{finder}</div>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-2.5 text-sm text-danger"
              >
                {error}
              </p>
            )}
            {step === 'align' && cameraOn && !levelOk && (
              <p className="mt-3 rounded-xl bg-warn-bg px-4 py-2.5 text-sm text-warn">
                아직 기울어 있어요. 그대로 가도 되지만 코스와 궤적이 비뚤게 보여요.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {step === 'zone' && (
              <PrimaryButton tone="quiet" onClick={() => setZone(DEFAULT_SETUP.zone)}>
                기본 자리
              </PrimaryButton>
            )}
            <PrimaryButton
              onClick={step === 'align' ? goZone : goMeasure}
              disabled={!cameraOn}
            >
              {step === 'align' ? '다음' : '측정 시작하기'}
              <ChevronRight aria-hidden className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </>
      )}

      {/* 렌즈 보정 — 공을 아는 거리에 두고 크기를 재 초점거리를 얻는다 */}
      {!showAsk && step === 'lens' && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
          <h2 className="text-heading text-2xl leading-tight">렌즈 보정</h2>
          <p className="mb-4 mt-1.5 text-sm leading-relaxed text-muted">
            카메라 유리에서 공 앞면까지 줄자로 1m 를 재어 공을 두고, 화면의 원을 공에
            대충 맞춘 뒤 &lsquo;재기&rsquo;를 누르세요. 초점거리를 직접 재면 화각 가정의
            오차(기종 · 크롭)가 사라져요.
          </p>
          {finder}
          {!cameraOn && (
            <div className="mt-3">
              <Note tone="warn">카메라를 켜야 잴 수 있어요.</Note>
            </div>
          )}
          <LensCalibrationPanel
            snapshot={() => captureRef.current?.snapshot() ?? null}
            camera={camera}
            finderRef={finderRef}
            circle={circle}
            current={lens}
            onSaved={() => setStep('measure')}
          />
        </div>
      )}

      {/* 6 — 측정: 폰 카메라 앱처럼. 세션 전에는 카메라가 꽉 차고, 시작하면 카메라 대신 정보 판 */}
      {!showAsk && step === 'measure' && (
        <div className="relative flex min-h-0 flex-1 flex-col bg-black text-white">
          {/*
           * 뷰파인더 — 세션 중에도 제 크기로 재생해 둔다(프레임이 와야 잰다). 카메라를 숨길 때는 그 위를
           * 거의 불투명한 정보 판으로 덮는다. 영상을 1px · 투명도 0 으로 줄이면 크롬은 그 영상을 그리지 않아
           * 프레임 알림(requestVideoFrameCallback)이 끊길 수 있고, 아이폰은 안 보이는 영상을 멈출 수 있다.
           * 판을 100% 불투명하게 하면 크롬이 가려진 영상을 건너뛸 수 있어 98% 로 둔다. 크기가 그대로라
           * 스트라이크 존 · 코스 짐작의 기준도 바뀌지 않는다.
           */}
          <div className="relative min-h-0 flex-1">
            {finder}
            {/* 정보 판 — 세션 중, 카메라 대신 */}
            {live && !showCamera && (
              <div className="absolute inset-0 z-5 overflow-y-auto overscroll-contain bg-black/98 px-4 pb-4 pt-[calc(3.5rem+env(safe-area-inset-top))]">
                <section className="rounded-3xl bg-white/[0.06] px-5 pb-4 pt-5 text-center">
                  {lastPitch ? (
                    <div key={lastPitch.id} className="motion-safe:animate-fade-in">
                      <p className="text-xs font-medium text-white/60">
                        {pitches.length}구째
                        {lastPitch.autoDetected === false ? ' · 수동' : ''}
                        {pitchTypeLabel(lastPitch.pitchType)
                          ? ` · ${pitchTypeLabel(lastPitch.pitchType)}`
                          : ''}
                      </p>
                      <p className="text-display mt-1 text-7xl leading-none tabular-nums">
                        {speedNum(shown(lastPitch.rawKmh))}
                        <span className="ml-2 text-xl text-white/60">
                          {speedLabel(unit)}
                        </span>
                      </p>
                      <p className="mt-2 text-xs text-white/70">
                        ± {lastPitch.errorKmh} ·{' '}
                        {
                          CONFIDENCE_TEXT[
                            lastPitch.confidence as keyof typeof CONFIDENCE_TEXT
                          ]
                        }
                        {lastPitch.releaseKmh != null &&
                          ` · 릴리스 ${speedNum(shown(lastPitch.releaseKmh))}`}
                        {lastPitch.zone != null &&
                          ` · ${zoneLabel(lastPitch.zone)}(짐작)`}
                      </p>
                    </div>
                  ) : last && !last.measure.ok ? (
                    <div className="py-3 motion-safe:animate-fade-in">
                      <p className="text-sm font-bold text-warn-line">재지 않았어요</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/90">
                        {last.measure.message}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-white/60">
                        {last.measure.fix}
                      </p>
                    </div>
                  ) : (
                    <div className="py-6">
                      <p className="text-lg font-semibold">
                        {status === 'armed' ? '던지세요' : STATUS_TEXT[status]}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-white/60">
                        {autoMode
                          ? '공마다 알아서 잡아요. 끝나면 아래 가운데 세션 종료.'
                          : '아래 오른쪽 "다음 공"을 누르고 던지세요.'}
                      </p>
                    </div>
                  )}

                  {/* 방금 공 구종 — 한 번에 */}
                  {lastPitch && (
                    <div className="no-scrollbar -mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 pb-0.5">
                      {PITCH_TYPES.map((t) => {
                        const on = lastPitch.pitchType === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() =>
                              patch(lastPitch.id, { pitchType: on ? null : t.key })
                            }
                            aria-pressed={on}
                            className={`h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                              on
                                ? 'bg-sky text-white'
                                : 'bg-white/10 text-white hover:bg-white/20'
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* 회전축 — 고른 구종의 전형값(카메라는 회전을 못 잰다). 구종 칩을 누르면 축이 돈다 */}
                <section className="mt-3 rounded-2xl bg-white/[0.06] px-5 py-4">
                  <div className="flex items-center gap-4">
                    <SpinAxisGraphic
                      pitchType={lastPitch?.pitchType ?? null}
                      hand={hand}
                      size={104}
                      tone="dark"
                      showLabel={false}
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-xs font-medium text-white/55">
                        회전축 · {hand === 'left' ? '좌투' : '우투'} 기준
                      </p>
                      <p className="mt-0.5 text-lg font-semibold">
                        {pitchTypeLabel(lastPitch?.pitchType) ?? '구종을 고르세요'}
                      </p>
                      {spinAxis && (
                        <>
                          <p className="mt-1 text-sm tabular-nums text-white/85">
                            {spinAxis.clock} · 효율 {spinAxis.efficiencyPct}% ·{' '}
                            {spinAxis.rpm[0]}~{spinAxis.rpm[1]}rpm
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-white/55">
                            {spinAxis.movement}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <SpinAxisNote tone="dark" />
                  </div>
                </section>

                {/* 이번 세션 */}
                {stats && (
                  <dl className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-2xl bg-white/10">
                    <DarkStat
                      label="최고"
                      value={speedNum(stats.max)}
                      unit={speedLabel(unit)}
                    />
                    <DarkStat
                      label="평균"
                      value={speedNum(stats.avg)}
                      unit={speedLabel(unit)}
                    />
                    <DarkStat label="공" value={stats.n} unit="구" />
                    <DarkStat
                      label="스트라이크"
                      value={stats.strikeRate == null ? '—' : stats.strikeRate}
                      unit={stats.strikeRate == null ? '' : '%'}
                    />
                  </dl>
                )}

                {error && (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-danger-line/60 bg-danger/15 px-4 py-2.5 text-sm leading-relaxed text-white"
                  >
                    {error}
                  </p>
                )}

                <p className="mt-3 text-center text-xs text-white/45">
                  이전 공은 오른쪽 아래 목록에서 — 구종 · 코스 고치기와 영상.
                </p>
              </div>
            )}
          </div>

          {/*
           * 세션 요약 — 세션 종료 뒤. 카메라(뷰파인더)는 밑에 그대로 둔다 — '구속 측정하기'로 같은
           * 세션을 이어 잴 수 있게(영상을 떼면 카메라가 멈춘다). 위 줄과 아래 단추도 이 판이 덮는다.
           */}
          {summaryOpen && (
            <div className="absolute inset-0 z-20 flex flex-col bg-page text-ink motion-safe:animate-fade-in">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)]">
                <button
                  type="button"
                  onClick={leave}
                  className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
                >
                  <ChevronLeft aria-hidden className="h-5 w-5" />
                  투구 기록
                </button>
                <span className="text-heading text-base">{modeLabel(choices.mode)} 측정</span>
                <button
                  type="button"
                  onClick={() => setSheet('settings')}
                  aria-label="설정"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-sky transition-colors hover:bg-sky-tint"
                >
                  <Settings2 aria-hidden className="h-5 w-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <SessionSummary
                  pitches={sessionPitches}
                  unit={unit}
                  hand={hand}
                  date={today}
                  setupText={sessionSetupText(choices)}
                  calibrationText={useCal && fit.n > 0 ? calibrationText(fit) : null}
                  onSave={() => setSheet('save')}
                  onContinue={continueSession}
                  onPlayClip={(id) => setClipOpen(id)}
                  onEditPitch={(id) => {
                    setEditing(id);
                    setSheet('pitch');
                  }}
                  /* 지우기는 공을 눌러 여는 편집 시트에 — 줄에 단추가 셋이면 폰 폭에서 구종 글자가 잘린다 */
                  saving={saving}
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="absolute inset-x-4 bottom-20 rounded-xl bg-danger/90 px-4 py-2.5 text-sm leading-relaxed text-white"
                >
                  {error}
                </p>
              )}
            </div>
          )}

          {/*
           * 위 줄 — 카메라 앱처럼 카메라 위에. 세션 중에는 왼쪽 '초점 재조정'(카메라로 돌아가 초점을
           * 다시 맞춘다), 가운데 상태, 오른쪽 설정(단위 · 소리 · 자동 측정 …). 세션 전에는 닫기 · 재초점 · 설정.
           */}
          {!summaryOpen && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <div className="pointer-events-auto flex items-center gap-1">
                {live && !showCamera ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCamera(true);
                      void refocus();
                    }}
                    disabled={focusBusy}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-black/45 pl-3 pr-3.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/60 disabled:opacity-40"
                  >
                    {focusBusy ? (
                      <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                    ) : (
                      <Focus aria-hidden className="h-4 w-4" />
                    )}
                    초점 재조정
                  </button>
                ) : live && showCamera ? (
                  <button
                    type="button"
                    onClick={() => setShowCamera(false)}
                    className="inline-flex h-10 items-center gap-0.5 rounded-full bg-black/45 pl-2 pr-3.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/60"
                  >
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                    측정 화면
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={leave}
                    aria-label="닫기"
                    className={CHROME_BTN}
                  >
                    <X aria-hidden className="h-5 w-5" />
                  </button>
                )}
              </div>
              {live && (
                <span className="absolute left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] inline-flex h-10 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/45 px-3 text-xs font-semibold backdrop-blur">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status === 'armed'
                        ? 'animate-pulse bg-danger'
                        : status === 'capturing' || status === 'analyzing'
                          ? 'bg-warn'
                          : 'bg-white/60'
                    }`}
                  />
                  {autoMode ? '자동' : '수동'} · {STATUS_TEXT[status]}
                </span>
              )}
              <div className="pointer-events-auto flex items-center gap-1">
                {cameraOn && (!live || showCamera) && (
                  <button
                    type="button"
                    onClick={refocus}
                    disabled={focusBusy}
                    aria-label="재초점"
                    title="재초점"
                    className={CHROME_BTN}
                  >
                    {focusBusy ? (
                      <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                    ) : (
                      <Focus aria-hidden className="h-5 w-5" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSheet('settings')}
                  aria-label="설정"
                  className={CHROME_BTN}
                >
                  <Settings2 aria-hidden className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* 알림 — 아래 단추 위 */}
          {(!live || showCamera) &&
            (error || saved || toast || zoomBad || (isAdmin && !native)) && (
              <div className="pointer-events-none absolute inset-x-4 bottom-[8.25rem] z-10 space-y-2">
                {zoomBad && camera && (
                  <p className="rounded-xl bg-danger/90 px-4 py-2.5 text-sm font-semibold text-white">
                    줌이 ×{camera.zoom} 이에요 — 1× 에서만 잴 수 있어요. 카메라를 다시
                    켜 보세요.
                  </p>
                )}
                {isAdmin && !native && !error && !saved && (
                  <p className="rounded-xl bg-black/55 px-4 py-2 text-xs leading-snug text-white/85 backdrop-blur">
                    웹 시험 모드(관리자) — 브라우저 카메라는 60fps 밑이면 숫자를 내지
                    않아요.
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl bg-danger/90 px-4 py-2.5 text-sm leading-relaxed text-white"
                  >
                    {error}
                  </p>
                )}
                {saved && (
                  <p className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/70 px-4 py-2.5 text-sm text-white backdrop-blur">
                    <Check aria-hidden className="h-4 w-4 text-ok" />
                    오늘 투구 기록에 남겼어요.
                    <Link
                      href={`/pitch-log/${today}`}
                      className="ml-auto font-semibold text-sky-soft"
                    >
                      기록 보기
                    </Link>
                  </p>
                )}
                {toast && (
                  <p className="rounded-xl bg-black/70 px-4 py-2.5 text-center text-sm text-white backdrop-blur motion-safe:animate-fade-in">
                    {toast}
                  </p>
                )}
              </div>
            )}
          {live && !showCamera && toast && (
            <p className="pointer-events-none absolute inset-x-4 bottom-[8.25rem] z-10 rounded-xl bg-white/15 px-4 py-2.5 text-center text-sm text-white backdrop-blur motion-safe:animate-fade-in">
              {toast}
            </p>
          )}

          {/* 아래 단추 — 카메라 앱처럼 셋: 보조 · 셔터(시작/종료) · 보조 */}
          <div className="z-10 flex shrink-0 items-start justify-between bg-black px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                e.target.value = '';
              }}
            />
            {!live ? (
              <>
                <div className="flex w-20 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={fileBusy}
                    aria-label="슬로모션 영상 파일로 재기"
                    className={SIDE_BTN}
                  >
                    <Film aria-hidden className="h-5 w-5" />
                  </button>
                  <span className={SIDE_LABEL}>파일</span>
                </div>
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={cameraOn ? startSession : startCamera}
                    disabled={status === 'starting' || fileBusy || zoomBad}
                    aria-label={cameraOn ? '측정 시작' : '카메라 켜기'}
                    className="group flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-40"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black transition-transform group-active:scale-90">
                      {status === 'starting' ? (
                        <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
                      ) : cameraOn ? (
                        <span className="text-sm font-bold">시작</span>
                      ) : (
                        <Camera aria-hidden className="h-6 w-6" />
                      )}
                    </span>
                  </button>
                  <span className={SIDE_LABEL}>
                    {cameraOn ? '측정 시작' : '카메라 켜기'}
                  </span>
                </div>
                <div className="flex w-20 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !autoMode;
                      setAutoMode(next);
                      persistSetup({ autoMode: next });
                    }}
                    aria-pressed={autoMode}
                    aria-label="자동 · 수동 모드"
                    className={SIDE_BTN}
                  >
                    {autoMode ? (
                      <RefreshCw aria-hidden className="h-5 w-5" />
                    ) : (
                      <Hand aria-hidden className="h-5 w-5" />
                    )}
                  </button>
                  <span className={SIDE_LABEL}>{autoMode ? '자동' : '수동'}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex w-20 flex-col items-center">
                  {autoMode ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setAutoMode(false);
                          persistSetup({ autoMode: false });
                        }}
                        aria-label="수동 측정으로 바꾸기"
                        className={SIDE_BTN}
                      >
                        <RefreshCw aria-hidden className="h-5 w-5" />
                      </button>
                      <span className={SIDE_LABEL}>자동</span>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={nextPitch}
                        disabled={status !== 'ready'}
                        aria-label="다음 공 준비"
                        className={`${SIDE_BTN} ${status === 'ready' ? 'border-sky bg-sky' : ''}`}
                      >
                        <Play aria-hidden className="h-5 w-5 fill-current" />
                      </button>
                      <span className={SIDE_LABEL}>
                        {status === 'ready' ? '다음 공' : '대기 중'}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={endSession}
                    aria-label="세션 종료"
                    className="group flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border-4 border-white/90"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white transition-transform group-active:scale-90">
                      <Square aria-hidden className="h-6 w-6 fill-current" />
                    </span>
                  </button>
                  <span className={SIDE_LABEL}>
                    세션 종료{pitches.length ? ` · ${pitches.length}구` : ''}
                  </span>
                </div>
                <div className="flex w-20 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setPrevOpen(true)}
                    disabled={pitches.length === 0}
                    aria-label={`이전 공 보기 · ${pitches.length}구`}
                    className={`${SIDE_BTN} relative`}
                  >
                    <List aria-hidden className="h-5 w-5" />
                    {pitches.length > 0 && (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-sky px-1 text-center text-xs font-bold leading-5 text-white tabular-nums">
                        {pitches.length}
                      </span>
                    )}
                  </button>
                  <span className={SIDE_LABEL}>이전 공</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 이전 공 — 세션 중 오른쪽 아래. 줄을 누르면 고치기, ▶ 는 그 공의 영상 */}
      <BottomSheet
        open={prevOpen}
        onClose={() => setPrevOpen(false)}
        title={`이전 공 · ${pitches.length}구`}
      >
        <div className="space-y-3">
          {stats && (
            <Panel>
              <StatRow
                items={[
                  { label: '최고', value: speedNum(stats.max), unit: speedLabel(unit) },
                  { label: '평균', value: speedNum(stats.avg), unit: speedLabel(unit) },
                  { label: '공', value: stats.n, unit: '구' },
                  {
                    label: '스트라이크',
                    value: stats.strikeRate == null ? '—' : stats.strikeRate,
                    unit: stats.strikeRate == null ? '' : '%',
                  },
                ]}
              />
            </Panel>
          )}
          <Panel>
            <ul className="divide-y divide-line">
              {[...sessionPitches].reverse().map((p) => (
                <li key={p.id} className="flex min-h-14 items-center gap-2 pl-4 pr-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPrevOpen(false);
                      setEditing(p.id);
                      setSheet('pitch');
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
                  >
                    <span className="w-5 text-xs text-muted tabular-nums">{p.seq}</span>
                    <span className="text-display w-14 text-2xl leading-none tabular-nums text-ink">
                      {speedNum(p.kmh)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {pitchTypeLabel(p.pitchType) ?? (
                          <span className="text-muted">구종 —</span>
                        )}
                        {p.result === 'strike' && <span className="ml-1.5 text-ok">S</span>}
                        {p.result === 'ball' && <span className="ml-1.5 text-warn">B</span>}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {zoneLabel(p.zone) ?? '코스 —'}
                        {p.releaseKmh != null && ` · 릴리스 ${speedNum(p.releaseKmh)}`}
                        {p.gunKmh != null && ` · 건 ${p.gunKmh}`}
                        {p.source === 'file' && ' · 파일'}
                      </span>
                    </span>
                    <ZoneGrid value={p.zone} size="sm" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrevOpen(false);
                      setClipOpen(p.id);
                    }}
                    disabled={!p.clip}
                    aria-label={p.clip ? '영상 보기' : '영상 없음'}
                    title={p.clip ? '영상 보기' : '영상 없음'}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-sky-tint hover:text-sky disabled:opacity-30"
                  >
                    <Play aria-hidden className="h-4 w-4 fill-current" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-xs leading-relaxed text-muted">
            공을 누르면 구종 · 코스 · 결과 · 스피드건 값을 고쳐요. ▶ 는 그 공의 영상(이 폰에서만).
          </p>
        </div>
      </BottomSheet>

      {/* 공 하나의 영상 클립 — 이 폰에서만(보정용 저장이면 저장할 때 올라간다) */}
      <BottomSheet
        open={clipPitch?.clip != null}
        onClose={() => setClipOpen(null)}
        title={clipPitch ? `${pitches.indexOf(clipPitch) + 1}번째 공 · 영상` : '영상'}
      >
        {clipPitch?.clip && (
          <div className="space-y-3">
            <video
              key={clipPitch.clip.url}
              src={clipPitch.clip.url}
              controls
              playsInline
              muted
              autoPlay
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                const at = Math.max(0, (clipPitch.clip?.eventSec ?? 0) - 0.4);
                if (Number.isFinite(v.duration))
                  v.currentTime = Math.min(at, v.duration);
              }}
              className="max-h-[60dvh] w-full rounded-2xl bg-black object-contain"
            />
            <p className="text-xs leading-relaxed text-muted">
              {formatSpeed(shown(clipPitch.rawKmh), unit)} · 던진 순간{' '}
              {clipPitch.clip.eventSec.toFixed(1)}초 · 길이{' '}
              {clipPitch.clip.durationSec.toFixed(1)}초 ·{' '}
              {calibOn
                ? '저장하면 구속 측정 관리자에 올라가요'
                : '이 폰에서만 보여요(저장 안 함)'}
            </p>
          </div>
        )}
      </BottomSheet>

      {/* 공 하나 — 구종 · 코스 · 결과 · 건 값 · 메모 · 자세한 값 */}
      <BottomSheet
        open={sheet === 'pitch' && editingPitch != null}
        onClose={() => {
          setSheet('none');
          setEditing(null);
        }}
        title={
          editingPitch
            ? `${pitches.indexOf(editingPitch) + 1}번째 공 · ${formatSpeed(shown(editingPitch.rawKmh), unit)}`
            : '공'
        }
      >
        {editingPitch && (
          <div className="space-y-5">
            <PitchEditorFields
              value={editingPitch}
              onChange={(next) => patch(editingPitch.id, next)}
            />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-xs">
              <Detail
                label="카메라 값(보정 전)"
                value={`${editingPitch.rawKmh} km/h`}
              />
              <Detail
                label="릴리스 구속 추정"
                value={
                  editingPitch.releaseKmh != null
                    ? `${speedNum(shown(editingPitch.releaseKmh))} ${speedLabel(unit)}`
                    : '—'
                }
              />
              <Detail
                label="릴리스 포인트"
                value={
                  editingPitch.releaseDxCm != null && editingPitch.releaseDyCm != null
                    ? `${sideText(editingPitch.releaseDxCm)} · ${upText(editingPitch.releaseDyCm)}`
                    : '—'
                }
              />
              <Detail
                label={approach === 'receding' ? '릴리스까지 거리' : '미트까지 거리'}
                value={
                  editingPitch.releaseDistM != null
                    ? `${editingPitch.releaseDistM}m`
                    : '—'
                }
              />
              <Detail
                label="날아간 구간"
                value={
                  editingPitch.travelM != null
                    ? `${editingPitch.travelM}m · ${editingPitch.durationSec ?? '?'}초`
                    : '—'
                }
              />
              <Detail
                label="프레임"
                value={`${editingPitch.frames ?? '?'}장${
                  editingPitch.fps != null
                    ? ` · ${Math.round(editingPitch.fps)}fps`
                    : ''
                }`}
              />
            </dl>
            <button
              type="button"
              onClick={() => remove(editingPitch.id)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-danger-bg text-sm font-semibold text-danger transition-colors hover:bg-danger-line/60"
            >
              <Trash2 aria-hidden className="h-4 w-4" />이 공 지우기
            </button>
          </div>
        )}
      </BottomSheet>

      {/* 저장 */}
      <BottomSheet
        open={sheet === 'save'}
        onClose={() => setSheet('none')}
        title="오늘 투구 기록으로 남기기"
      >
        {stats && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {today} · {stats.n}구 · 최고 {formatSpeed(stats.max, unit)} · 평균{' '}
              {formatSpeed(stats.avg, unit)}
              {useCal && fit.n > 0 ? ` · 보정 ${calibrationText(fit)}` : ' · 보정 없음'}
            </p>
            <div>
              <p className="mb-1.5 text-sm font-semibold">종류</p>
              <div className="flex flex-wrap gap-1.5">
                {THROW_TYPES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setSessionType(t.name)}
                    aria-pressed={sessionType === t.name}
                    className={`min-h-9 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                      sessionType === t.name
                        ? 'bg-sky text-white'
                        : 'border border-line-strong bg-surface-2 text-ink hover:border-sky hover:text-sky'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="flex justify-between text-sm font-semibold">
                강도 <b className="tabular-nums">{intensity} / 10</b>
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="mt-2 w-full accent-sky"
              />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky text-sm font-semibold text-white hover:bg-sky-strong disabled:opacity-50"
            >
              {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {uploading
                ? `클립 올리는 중 ${uploading.done}/${uploading.total}`
                : calibOn
                  ? `저장하고 클립 ${pitches.filter((p) => p.clip).length}개 올리기`
                  : '저장'}
            </button>
            {calibOn && (
              <p className="text-xs leading-relaxed text-warn">
                정확도 보정용 저장이 켜져 있어요 — 공마다 영상 클립과 분석 자료가 구속
                측정 관리자에 올라가요.
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted">
              투구 기록 한 건(투구수 {stats.n} · 최고 · 평균)과 공마다 한 줄이 남아요.
              그날 화면에서 공마다 고치고 지울 수 있어요. 스피드건 값을 적은 공은 보정
              자료로도 쓰여요.
            </p>
          </div>
        )}
      </BottomSheet>

      {/* 설정 */}
      <BottomSheet
        open={sheet === 'settings'}
        onClose={() => setSheet('none')}
        title="설정"
      >
        <div className="space-y-4">
          <VelocitySettingsFields
            values={{
              ...choices,
              voice,
              useCal,
              fovDeg: fov,
              releaseDistM,
              autoMode,
              calibSave,
            }}
            showChoices={false}
            isAdmin={isAdmin}
            calibration={fit}
            onChange={(patch) => {
              if (patch.fovDeg != null) changeFov(patch.fovDeg);
              if (patch.voice != null) {
                setVoice(patch.voice);
                persistSetup({ voice: patch.voice });
              }
              if (patch.useCal != null) {
                setUseCal(patch.useCal);
                persistSetup({ useCal: patch.useCal });
              }
              if (patch.releaseDistM != null) {
                setReleaseDistM(patch.releaseDistM);
                persistSetup({ releaseDistM: patch.releaseDistM });
              }
              if (patch.autoMode != null) {
                setAutoMode(patch.autoMode);
                persistSetup({ autoMode: patch.autoMode });
              }
              if (patch.calibSave != null) {
                setCalibSave(patch.calibSave);
                persistSetup({ calibSave: patch.calibSave });
              }
            }}
          />

          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
            <p className="font-semibold text-ink">지금 설정</p>
            <p className="mt-0.5">
              {setupSummary(choices)} · 스트라이크 존 자리 저장됨
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-ink">렌즈 보정</span>
                <span className="block text-xs leading-snug text-muted">
                  {lens && camera && lensOk
                    ? `공으로 잰 초점거리 ${Math.round(
                        focalPxFor(lens, Math.max(camera.width, camera.height))
                      )}px · 화각 약 ${fovDegFromFocal(
                        focalPxFor(lens, Math.max(camera.width, camera.height)),
                        Math.max(camera.width, camera.height)
                      )}°`
                    : lens
                      ? '공으로 잰 값을 쓰는 중'
                      : `아직 안 했어요 — 화각 ${fov}° 가정으로 계산 중. 정확도를 위해 꼭 한 번 하세요.`}
                  {lens && camera && !lensOk && (
                    <span className="block text-warn">
                      저장된 보정이 이 카메라(이름 · 비율 · 줌)와 달라요 — 지금은 화각
                      가정으로 계산 중. 다시 재세요.
                    </span>
                  )}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSheet('none');
                  setStep('lens');
                }}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface-2 px-3.5 text-xs font-semibold text-ink hover:border-sky hover:text-sky"
              >
                {lens ? '다시 재기' : '보정하기'}
              </button>
            </div>
            {lens && (
              <button
                type="button"
                onClick={() => clearLens()}
                className="mt-2 text-xs text-muted underline-offset-2 hover:underline"
              >
                보정 지우기(화각 가정으로 돌아가기)
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <PrimaryButton
              tone="quiet"
              onClick={() => {
                setSheet('none');
                setStep('zone');
              }}
            >
              존 다시 놓기
            </PrimaryButton>
            <PrimaryButton tone="quiet" onClick={restart}>
              처음부터 다시 설정
            </PrimaryButton>
          </div>

          <button
            type="button"
            onClick={() => {
              setSheet('none');
              setTutorialForce(true);
            }}
            className="w-full text-center text-sm text-muted underline-offset-2 hover:underline"
          >
            사용 안내 다시 보기
          </button>

          {cameraOn && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setSheet('none');
              }}
              className="w-full text-center text-sm text-muted underline-offset-2 hover:underline"
            >
              카메라 끄기
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

/** 검은 바탕(세션 정보 판)용 통계 칸 */
function DarkStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="bg-black px-2 py-3 text-center">
      <dt className="text-xs text-white/55">{label}</dt>
      <dd className="text-display mt-0.5 text-2xl leading-none tabular-nums text-white">
        {value}
        {unit && <span className="ml-0.5 font-sans text-xs text-white/55">{unit}</span>}
      </dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums text-ink">{value}</dd>
    </>
  );
}

/** '릴리스 포인트가' · '지점이' — 받침이 있으면 '이', 없으면 '가' */
const withGa = (word: string) => {
  const last = word.charCodeAt(word.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return word + (hangul && (last - 0xac00) % 28 !== 0 ? '이' : '가');
};

const sideText = (dx: number) =>
  Math.abs(dx) < 1 ? '가운데' : `${dx > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(dx)}cm`;
const upText = (dy: number) =>
  Math.abs(dy) < 1 ? '표적 높이' : `${dy > 0 ? '위' : '아래'} ${Math.abs(dy)}cm`;
