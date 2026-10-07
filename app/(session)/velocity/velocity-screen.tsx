'use client';

import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { flushSync } from 'react-dom';
import { ConfirmDialog } from '@/components/confirm-delete';
import { buzz } from '@/lib/haptics';
import { unstable_rethrow, useRouter } from 'next/navigation';
import {
  Activity,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Database,
  Film,
  FlaskConical,
  Focus,
  Hand,
  Info,
  List,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
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
  type LiveInfo,
  type LiveStatus,
  type PitchClip,
  type ResultMeta,
} from '@/lib/velocity-engine/live-capture';
import { DualCapture, DualUnsupportedError } from '@/lib/velocity-engine/dual-capture';
import {
  dualCameraStatus,
  dualStatusNow,
  markDualUnsupported,
} from '@/lib/dual-camera';
import {
  DEFAULT_CAM_MODE,
  camModeLabel,
  fpsGood,
  noteCamLimit,
  withCamLimits,
  type CamMode,
  type CamModeOption,
} from '@/lib/velocity-camera-mode';
import { CameraModeSheet } from '@/components/velocity/camera-mode-sheet';
import { focalPxFromFov } from '@/lib/velocity-engine/geometry';
import { liveFpsNote, type LiveReport } from '@/lib/velocity-engine/live-meter';
import { readVideoLens, videoFovFor } from '@/lib/velocity-engine/video-lens';
import { analysisOf, type AnalysisJson } from '@/lib/velocity-analysis';
import {
  SegmentedRecorder,
  recordingBitrate,
  type RecorderState,
} from '@/lib/velocity-recorder';
import { VELOCITY_ENGINE_VERSION } from '@/lib/velocity-engine/version';
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
  distanceOf,
  DEFAULT_SETUP,
  defaultZone,
  fitZone,
  frameRectToView,
  viewRectToFrame,
  visibleFrameRect,
  loadSetup,
  RELEASE_DIST_MAX,
  RELEASE_DIST_MIN,
  saveSetup,
  SETUP_KEY,
  setupSummary,
  TARGET_DIST_MAX,
  TARGET_DIST_MIN,
  ZONE_WIDTH_RANGE,
  zoneAspectIn,
  zoneOfPoint,
  type VelocitySetup,
  type ZoneRect,
} from '@/lib/velocity-setup';
import { useDeviceLevel } from '@/lib/use-device-level';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import { formatSpeed, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { useWakeLock } from '@/components/use-wake-lock';
import {
  BottomSheet,
  PitchEditorFields,
  ZoneGrid,
} from '@/components/velocity/pitch-editor';
import {
  DistanceField,
  LevelBubble,
  PrimaryButton,
  StepShell,
  ZoneOverlay,
  type Choices,
} from '@/components/velocity/setup-steps';
import {
  cameraPosOptions,
  netOptions,
  OptionCards,
  sessionTypeOptions,
  SetupSummaryRow,
} from '@/components/velocity/setup-art';
import { isTipsSkippedToday, TipsPopup } from '@/components/velocity/tips-popup';
import { VelocitySettingsFields } from '@/components/velocity/velocity-settings';
import { ClipPlayer } from '@/components/velocity/clip-player';
import { Panel, StatRow, Note } from '@/components/velocity/kit';
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
import { SessionSummary } from '@/components/velocity/session-summary';
import { PitchResult } from '@/components/velocity/pitch-result';
import type { TrailPoint } from '@/components/velocity/clip-player';
import { AdminJump } from '@/components/velocity/admin-jump';
import {
  type SessionPitch,
  type VelocityScreenKey,
} from '@/components/velocity/session-types';

/**
 * 구속 측정 화면 — Smart Scout · PitchLab 의 흐름을 우리 모양(아이폰 느낌)으로.
 *
 *   지난 설정 그대로?  → 1 어떤 투구(불펜 · 라이브 · 경기 · 캐치볼)
 *   → 2 카메라 위치(투수 뒤 · 포수 뒤)  → 3 네트  → [주의사항 팝업, 카메라 화면 위에]
 *   → 4 카메라: 수평계 · 릴리스 포인트를 표적에  → 5 반투명 스트라이크 존 놓기  → 측정
 *   (타구 측정은 2026-10-03 사용자 요청으로 뺐다 — 투구만 잰다)
 *   (설정 단계마다 그림 카드로 어떤 상황에서 무엇을 고르는지 보인다 — components/velocity/setup-art.tsx)
 *   → 세션(측정 중 화면: 구속 · 구종 · 회전축 · 이전 공)  → 세션 종료 → 세션 요약(저장하기 · 계속 재기)
 *
 * 카메라는 4에서 켜져 측정까지 같은 <video> 로 이어진다. 고른 것과 존 자리는 브라우저에 남겨
 * 다음에는 '지난 설정'에서 바로 4로 간다. 측정 화면의 설정에서 소리 안내 · 화각 · 보정 · 처음부터 다시.
 *
 * PC 에서는 이 전체를 폰 크기 틀(390px) 안에 띄운다 — 폰이 기준이라 PC 화면에 맞춰 늘리지
 * 않는다. 잰 값은 '저장'을 누를 때 서버로 간다(app/actions/velocity.ts). 영상은 어디에도 안 올린다.
 */

export type Step = 'type' | 'camera' | 'net' | 'align' | 'zone' | 'measure' | 'lens';

/** 카메라(뷰파인더)가 필요한 단계 — 들어오면 카메라를 켠다 */
const CAMERA_STEPS: ReadonlySet<Step> = new Set<Step>([
  'align',
  'zone',
  'measure',
  'lens',
]);

/* 내비게이션 바의 뒤로 — 어느 단계에서 어디로, 무슨 이름으로. 없으면 '투구 기록'(나가기) */
const BACK_OF: Partial<Record<Step, { to: Step; label: string }>> = {
  camera: { to: 'type', label: '종류' },
  net: { to: 'camera', label: '카메라 위치' },
  align: { to: 'net', label: '네트' },
  zone: { to: 'align', label: '수평' },
  lens: { to: 'measure', label: '측정' },
};
type LocalClip = { url: string; blob: Blob; durationSec: number; eventSec: number };
/** 공의 영상 주소(일반 · 광각)를 푼다 — 저장했거나 화면을 떠날 때 */
const revokeClips = (p: { clip?: LocalClip; wideClip?: LocalClip }) => {
  if (p.clip) URL.revokeObjectURL(p.clip.url);
  if (p.wideClip) URL.revokeObjectURL(p.wideClip.url);
};
type LocalPitch = SavePitchInput & {
  id: number;
  /** 엔진이 본 자료 — 잰 순간의 스트라이크 존(zoneRect)도 실려 영상에 겹쳐 그린다 */
  analysis?: AnalysisJson | null;
  source: 'camera' | 'file';
  /** LiveCapture 결과 번호 — 뒤에 오는 영상 클립과 짝 */
  captureId?: number;
  clip?: LocalClip;
  /** 같은 공의 광각 카메라 영상 — 앱이 일반 · 광각을 함께 찍을 때(설정 '광각 영상도 같이 저장') */
  wideClip?: LocalClip;
  /** 관리자 점프 도구가 넣은 예시 공 — 화면 확인용, 저장은 막는다 */
  sample?: boolean;
  /** 카메라 실시간의 촬영 조건 알림(초당 장면 · 잘린 화면 · 짐작한 화각 · 번짐 …) — 화면에만 보인다 */
  notes?: string[];
  /** 결과 화면이 영상에 맞춰 따라 그릴 공 길(장면 비율, t 는 궤적 시각) — 화면에만 */
  trail?: TrailPoint[] | null;
  /** 클립의 eventSec 에 해당하는 궤적 시각(ResultMeta.hitT) — 클립 시각 = eventSec + (t − hitT) */
  hitT?: number | null;
};
/**
 * 결과 화면에서 따라 그릴 공 길(장면 비율) — 엔진 2.0 은 맞춘 궤적을 공이 처음 보인 장면부터 그물까지 비춘 길(distance.path), 1.x 는
 * 잡힌 공 자리.
 */
function trailOf(result: ScreenResult): TrailPoint[] | null {
  const { width, height } = result.analyzeSize;
  if (!width || !height) return null;
  const path = (result as { distance?: { path?: number[][] } }).distance?.path;
  const rows =
    path && path.length >= 2
      ? path
      : result.track.map((o) => [o.t, o.x, o.y, o.diameterPx]);
  if (rows.length < 2) return null;
  return rows.map(([t, x, y, d]) => ({ t, x: x / width, y: y / height, d: d / width }));
}
/** 카메라 실시간 결과에는 촬영 조건 알림(live)이 붙는다(lib/velocity-engine/live-meter.ts) — 영상 파일 결과에는 없다 */
type ScreenResult = AnalyzeResult & { live?: LiveReport };

/* 관리자 점프의 '예시 공' — 화면(세션 · 요약 · 이전 공)을 자료 없이도 확인할 수 있게 */
const SAMPLE_PITCHES: { kmh: number; type: string; zone: number; result: string }[] = [
  { kmh: 128.4, type: 'fastball', zone: 5, result: 'strike' },
  { kmh: 131.2, type: 'fastball', zone: 2, result: 'ball' },
  { kmh: 112.7, type: 'slider', zone: 9, result: 'strike' },
  { kmh: 118.9, type: 'changeup', zone: 8, result: 'strike' },
];

/* 카메라 앱 모양의 단추 — 위 줄 동그라미 · 아래 보조 단추 · 라벨 */
const CHROME_BTN =
  'inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60 disabled:opacity-40';
/* 정보 판(거의 검정) 위의 위 줄 단추 — 옅은 흰 바탕이라야 단추로 보인다 */
const CHROME_BTN_ON_PANEL = CHROME_BTN.replace('bg-black/45', 'bg-white/10').replace(
  'hover:bg-black/60',
  'hover:bg-white/15'
);
const SIDE_BTN =
  'inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors active:bg-white/25 disabled:opacity-40';
const SIDE_LABEL = 'mt-1 text-xs text-white/70';

/** 녹화 시간 — 분:초(한 시간이 넘으면 시:분:초) */
const formatClock = (sec: number) => {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const STATUS_TEXT: Record<LiveStatus, string> = {
  off: '카메라 꺼짐',
  starting: '카메라 켜는 중…',
  ready: '준비됨',
  settling: '가만히 — 배경 잡는 중',
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

/*
 * 새 공의 번호 — 목록의 가장 큰 번호 + 1. 파일 전역 카운터(let seq)였을 때는 개발 서버 자동 반영이 카운터만 0 으로 되돌려
 * 목록의 옛 번호와 겹쳤다(React key 중복 · 고치기가 두 공에 걸림, 2026-09-30 시험).
 */
const nextPitchId = (list: readonly { id: number }[]) =>
  list.reduce((max, p) => Math.max(max, p.id), 0) + 1;

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
  initialStep = 'type',
}: {
  isAdmin: boolean;
  native: boolean;
  today: string;
  /** 서버가 그 사람의 스피드건 짝으로 맞춘 보정식 */
  calibration: CalFit;
  /** 프로필의 던지는 손 — 회전축 그림을 뺀 뒤(엔진 2.0, 사용자 2026-10-06) 쓰지 않는다. 부르는 쪽 호환으로만 남긴다 */
  throwingHand?: string | null;
  /** 처음 보일 단계 — 미리보기 · 시험용. 보통은 처음부터 */
  initialStep?: Step;
}) {
  const router = useRouter();
  const unit = useSpeedUnit();
  const videoRef = useRef<HTMLVideoElement>(null);
  const finderRef = useRef<HTMLDivElement>(null);
  /* 세션 중 정보 판 · 뷰파인더 위 둘째 줄(수평계 · 카메라 정보) — 판 전환을 곧바로 · 존이 둘째 줄 밑으로 못 가게 */
  const panelRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  /* 웹 카메라(LiveCapture) 또는 앱의 일반 · 광각 동시 촬영(DualCapture — 앱 + 설정 '광각 영상도 같이 저장') */
  const captureRef = useRef<LiveCapture | DualCapture | null>(null);
  /* 카메라를 켠 차례 — 결과 · 클립 번호를 켤 때마다 가른다(startCamera) */
  const captureGenRef = useRef(0);
  /* 공이 된 결과 번호 · 결과보다 먼저 온 클립(attachClipToPitch) — 이벤트 안에서만 만진다 */
  const acceptedIdsRef = useRef(new Set<number>());
  const earlyClipsRef = useRef(new Map<number, { clip: PitchClip; at: number }>());
  /*
   * 카메라를 켤 때 넣는 설정의 최신 값 — 아래 useLayoutEffect 가 그릴 때마다 맞춘다. enterCameraStep 은 누르기 전 그림의
   * startCamera 를 부르므로, 그 함수가 쥔 값을 쓰면 flushSync 로 막 넣은 설정('이 설정으로 시작'의 네트 · 포수 뒤 · 릴리스
   * 거리)이 카메라에 안 들어갔다(네트 없음인데 초점 고정 등 — 김민 17dbf60). 그리기(커밋) 안에서 맞추므로 flushSync 가 끝나면 새 값이다.
   */
  const cameraSettingsRef = useRef({
    fov: DEFAULT_FOV_DEG,
    approach: 'receding' as ReturnType<typeof approachOf>,
    net: DEFAULT_SETUP.net,
    focalRatio: null as number | null,
    releaseDistM: DEFAULT_SETUP.releaseDistM,
    /* 엔진 2.0 의 거리 자 — 투수 뒤 = 그물 · 미트까지, 포수 뒤 = 릴리스까지(distanceOf) */
    distanceM: DEFAULT_SETUP.targetDistM as number | null,
    autoMode: DEFAULT_SETUP.autoMode,
    wideClip: DEFAULT_SETUP.wideClip,
    camMode: DEFAULT_SETUP.camMode,
    recordMode: false,
  });
  /* 카메라를 저절로 켠 단계 — 한 단계에 한 번만(아래 안전장치 효과) */
  const autoStartedFor = useRef<Step | null>(null);
  const pitchesRef = useRef<LocalPitch[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── 설정 단계 ── */
  const storedRaw = useSyncExternalStore(subscribeStorage, readSetupRaw, () => null);
  const stored = useMemo(() => (storedRaw ? loadSetup() : null), [storedRaw]);
  const [decided, setDecided] = useState(initialStep !== 'type');
  const [step, setStep] = useState<Step>(initialStep);
  const [choices, setChoices] = useState<Choices>({
    cameraPos: DEFAULT_SETUP.cameraPos,
    net: DEFAULT_SETUP.net,
  });
  const [zone, setZone] = useState<ZoneRect>(DEFAULT_SETUP.zone);
  const [voice, setVoice] = useState(false);
  const [releaseDistM, setReleaseDistM] = useState(DEFAULT_SETUP.releaseDistM);
  const [targetDistM, setTargetDistM] = useState(DEFAULT_SETUP.targetDistM);
  const [autoMode, setAutoMode] = useState(DEFAULT_SETUP.autoMode);
  const [calibSave, setCalibSave] = useState(DEFAULT_SETUP.calibSave);
  /* 엔진 개발용 녹화(관리자 설정) — 켜면 측정 대기 화면의 시작 단추가 녹화 단추 */
  const [recordMode, setRecordMode] = useState(DEFAULT_SETUP.recordMode);
  const recOn = isAdmin && recordMode;
  /* 진단 표시(관리자 설정) — 장면 받는 길 · fps · 처리 시간 · 알아챔 수 · 거부 까닭 */
  const [diagHud, setDiagHud] = useState(DEFAULT_SETUP.diagHud);
  const [liveInfo, setLiveInfo] = useState<LiveInfo | null>(null);
  const [diag, setDiag] = useState({ captures: 0, ok: 0, rejected: 0, last: '' });
  /* 카메라가 낸 결과를 진단 수에 센다 — 화면이 걸러 버리는 잡음 거부까지(addResult 의 noise) */
  const noteDiagRef = useRef((r: ScreenResult) => {
    setDiag((d) => ({
      captures: d.captures + 1,
      ok: d.ok + (r.measure.ok ? 1 : 0),
      rejected: d.rejected + (r.measure.ok ? 0 : 1),
      last: r.measure.ok ? `${r.measure.kmh.toFixed(1)}km/h · 궤적 ${r.track.length}장` : `${r.measure.code} · 궤적 ${r.track.length}장`,
    }));
  });
  /* 녹화기 · 그 상태(찍는 시간 · 조각 · 올림) — 녹화 중이 아니면 null */
  const recorderRef = useRef<SegmentedRecorder | null>(null);
  const [rec, setRec] = useState<RecorderState | null>(null);
  const recording = rec != null && (rec.phase === 'starting' || rec.phase === 'recording' || rec.phase === 'stopping');
  /* 저장된 공 영상에 스트라이크 존을 겹쳐 그릴까(설정) */
  const [clipZone, setClipZone] = useState(DEFAULT_SETUP.clipZone);
  /* 광각 영상도 같이 저장(설정) — 앱의 동시 촬영 부품이 있을 때 공마다 wideClip 이 붙는다(2단계) */
  const [wideClip, setWideClip] = useState(DEFAULT_SETUP.wideClip);
  /* 측정 카메라의 화질 · 프레임(오른쪽 위 카메라 정보를 눌러 고름) — null 이면 자동(DEFAULT_CAM_MODE, 1080p · 60fps) */
  const [camMode, setCamMode] = useState<CamMode | null>(DEFAULT_SETUP.camMode);
  /* 지금 카메라로 고를 수 있는 화질 — 켤 때마다 카메라가 알려 준다 */
  const [camOptions, setCamOptions] = useState<CamModeOption[]>([]);
  /*
   * 이번 한 번은 앱의 동시 촬영 말고 웹 카메라로 켠다 — 고른 화질 · 프레임을 두 카메라를 함께 켜서는 못 낼 때(그 화질만의 일이라
   * 이 아이폰의 동시 촬영을 잠그지 않는다. 예전에는 잠가서, 1080p 하나를 고른 뒤로 광각 동시 촬영이 영영 꺼졌다).
   */
  const skipDualOnceRef = useRef(false);
  /* 고른 화질 때문에 광각 동시 촬영을 건너뛰고 있다 — 시트가 '광각 영상 없음'을 계속 보인다 */
  const [dualSkipped, setDualSkipped] = useState<CamMode | null>(null);
  /* 보정용 저장은 관리자만 효과가 있다 */
  const calibOn = isAdmin && calibSave;
  /* 세션 — 시작하면 카메라를 숨기고 정보 판을 보인다 */
  const [live, setLive] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  /* 세션을 끝낸 뒤 — 종합 화면(저장하기 · 계속 재기) */
  const [summaryOpen, setSummaryOpen] = useState(false);
  /* 공 하나의 결과 화면 — 잴 때마다 띄운다(가장 최근 공). 영상 파일로 잰 공은 그 파일을 되풀이한다 */
  const [resultOpen, setResultOpen] = useState(false);
  const [fileReplay, setFileReplay] = useState<string | null>(null);
  useEffect(() => () => {
    if (fileReplay) URL.revokeObjectURL(fileReplay);
  }, [fileReplay]);
  /* 세션 중 오른쪽 아래 '이전 공' 시트 */
  const [prevOpen, setPrevOpen] = useState(false);
  /* 주의사항 팝업 — 설정이 끝나고 카메라 화면 위에 뜬다. '오늘은 보지 않기'면 그날은 안 뜬다 */
  const [tipsOpen, setTipsOpen] = useState(false);
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
  const [last, setLast] = useState<ScreenResult | null>(null);
  const [pitches, setPitches] = useState<LocalPitch[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);

  const [fov, setFov] = useState(() => loadFov(DEFAULT_FOV_DEG));
  const [useCal, setUseCal] = useState(true);
  /* 렌즈 보정(공으로 잰 초점거리) — 있으면 화각 가정 대신 쓴다 */
  const lens = useStoredLens();
  /* 저장된 보정이 지금 카메라(이름 · 비율 · 줌)와 맞을 때만 쓴다 — 다른 폰 · 렌즈 값이 섞이지 않게 */
  const lensOk = lensMatches(lens, camera);
  const focalRatio = lensOk ? lens.focalPerLongSide : null;
  const [circle, setCircle] = useState<Circle>(DEFAULT_CIRCLE);
  /* 뷰파인더 칸의 크기 — 스트라이크 존(장면 좌표)을 칸 좌표로 바꿔 그릴 때 */
  const [finderSize, setFinderSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const cameraOn = status !== 'off' && status !== 'starting';
  /* 삼각대에 세워 두고 손대지 않으니 화면이 저절로 꺼지지 않게 — 꺼지면 카메라도 멈춘다 */
  useWakeLock(cameraOn);
  /* 측정 중인가 — 카메라를 다시 켤 때(화질 · 프레임 바꿈) 이어서 기다릴지 */
  const liveRef = useRef(false);
  useLayoutEffect(() => {
    cameraSettingsRef.current = {
      fov,
      approach,
      net: choices.net,
      focalRatio,
      releaseDistM,
      distanceM: distanceOf({ cameraPos: choices.cameraPos, targetDistM, releaseDistM }),
      autoMode,
      wideClip,
      camMode,
      recordMode: recOn,
    };
    liveRef.current = live;
  });
  /* 이 아이폰이 일반 · 광각을 함께 켤 수 있나 — 미리 물어 둔다(설정 칸 · 카메라 켜기가 기다리지 않게) */
  useEffect(() => {
    if (native) void dualCameraStatus();
  }, [native]);
  /*
   * 스트라이크 존 — 규격(모양 ZONE_ASPECT · 가로 범위 ZONE_WIDTH_RANGE)에 맞춘 것을 쓴다. 놓는 단계에서는 칸에 보이는 장면
   * 안으로 넣는다(칸 밖으로 나간 존은 손잡이를 못 잡는다).
   */
  const frameSize = camera ? { width: camera.width, height: camera.height } : null;
  const visible =
    frameSize && finderSize
      ? visibleFrameRect(frameSize, finderSize)
      : { x: 0, y: 0, w: 1, h: 1 };
  const activeZone = fitZone(
    zone,
    choices.cameraPos,
    frameSize ?? undefined,
    step === 'zone' ? visible : undefined
  );
  /* 수평계 — 카메라가 보이는 동안(수평 · 존 · 측정 직전 · 세션 중 '카메라'로 정보 판을 내려 카메라를 볼 때) 저절로 켠다 */
  const levelOn =
    cameraOn &&
    !showAsk &&
    (step === 'align' ||
      step === 'zone' ||
      (step === 'measure' && (!live || showCamera) && !summaryOpen));
  const { level, requestPermission } = useDeviceLevel(levelOn);
  /*
   * 카메라 숙임(엔진 2.0) — 수평계가 켜진 동안(수평 · 존 · 측정 직전) 읽은 앞뒤 기울기. 위를 보면 + 라 숙임은 그 반대. 세션 중에는
   * 정보 판이 카메라를 가려 수평계가 꺼지지만 삼각대라 그대로다 — 마지막 값을 쥔다.
   */
  const tiltRef = useRef<number | null>(null);
  useEffect(() => {
    if (level.pitch == null) return;
    const tilt = (-level.pitch * Math.PI) / 180;
    if (tiltRef.current != null && Math.abs(tiltRef.current - tilt) < 1e-6) return;
    tiltRef.current = tilt;
    captureRef.current?.setTilt(tilt);
  }, [level.pitch]);
  const fit = calibration;
  const shown = (raw: number) =>
    useCal && fit.n > 0 ? applyCalibration(raw, fit) : raw;

  const [sheet, setSheet] = useState<'none' | 'settings' | 'save' | 'pitch' | 'camera'>(
    'none'
  );
  const [editing, setEditing] = useState<number | null>(null);
  /* 어떤 투구인가 — 첫 설정 단계에서 고르고, 저장할 때 투구 기록의 종류가 된다(저장 시트에서도 바꿀 수 있다) */
  const [sessionType, setSessionType] = useState<string>(DEFAULT_SETUP.sessionType);
  const [intensity, setIntensity] = useState(7);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  /* 저장하지 않은 공이 있을 때 나가기 — 묻는 창(앱의 영어 시스템 창 대신) */
  const [askLeave, setAskLeave] = useState(false);

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
      /* 녹화 중에 화면을 떠나면 찍던 조각은 버린다(이미 올린 조각은 남는다) */
      recorderRef.current?.abort();
      recorderRef.current = null;
      captureRef.current?.stop();
      captureRef.current = null;
      autoStartedFor.current = null;
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
      for (const p of pitchesRef.current) revokeClips(p);
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

  const persistSetup = (patch: Partial<Omit<VelocitySetup, 'savedAt'>> = {}) => {
    /*
     * 설정을 남기는 것은 이미 고른 뒤다 — 처음 쓰는 사람은 여기서 처음으로 '저장된 설정'이 생겨, 이것을 안 적으면
     * '측정 시작하기'를 누르는 순간 '지난 설정 그대로?' 화면으로 튀었다(카메라는 켜진 채 — 김민 17dbf60).
     */
    setDecided(true);
    return saveSetup({
      ...choices,
      sessionType,
      zone: activeZone,
      voice,
      useCal,
      releaseDistM,
      targetDistM,
      autoMode,
      calibSave,
      clipZone,
      wideClip,
      camMode,
      recordMode,
      diagHud,
      ...patch,
    });
  };

  const addResult = (
    result: ScreenResult,
    source: LocalPitch['source'],
    meta?: ResultMeta
  ) => {
    if (!result.measure.ok) {
      /*
       * 자동 모드에서 공 궤적이 세 장도 안 된 거부는 던진 공이 아니라 잡음일 때가 많다 — 튄 공 · 몸짓(장면 부족 · 너무 멂 ·
       * 거리 부족), 공이 맞은 뒤 1초 남짓 흔들리는 흰 과녁 천(번짐 · 궤적 불안정, 실제 영상 18개 중 4개 — 2026-09-30 정확도
       * 검증). 방금 잰 값을 거부 문구로 덮지 않고 '못 쟀어요'도 말하지 않는다.
       *
       * 다만 판단이 공을 공답게 따라간 것(live.ball.strong)은 잡음이 아니다 — 밖 · 표적 그물 앞에서는 알아채고도 계산이
       * 막혀 8개 중 6개가 여기서 조용히 버려져 사용자에게 '한 개도 안 잡혔다'가 됐다(1.9.0, outdoor-2026-10-03.md).
       * 그것은 '공은 봤는데 못 쟀어요'와 까닭으로 보인다.
       */
      /*
       * 엔진 2.0(거리 자)은 둥글게 작아지는 덩어리로 알아채, 헛 알아챔(투구 뒤 튄 공 · 굴러가는 공 · 몸짓)은 계산이 거른다 — 그 거부를
       * '못 쟀어요'로 말하면 방금 잰 값을 덮었다. 자동 모드에서는 고칠 수 있는 흔들림만 알리고 나머지는 조용히 넘긴다(못 잰 공은 안 보임).
       */
      const byDistance = 'distance' in result && result.distance != null;
      const noise =
        source === 'camera' &&
        autoMode &&
        (byDistance
          ? result.measure.code !== 'CAMERA_SHAKE'
          : result.track.length < 3 &&
            !result.live?.ball?.strong &&
            [
              'NOT_ENOUGH_FRAMES',
              'TOO_FAR',
              'TRAVEL_TOO_SHORT',
              'MOTION_BLUR',
              'UNSTABLE_TRACK',
            ].includes(result.measure.code));
      if (noise) return;
      setLast(result);
      speak('못 쟀어요');
      return;
    }
    setLast(result);
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
        activeZone,
        choices.cameraPos
      );
    }

    /* 이 결과가 공이 된다 — 먼저 와서 기다리던 클립(attachClipToPitch)이 있으면 바로 붙인다 */
    let earlyClip: LocalClip | undefined;
    if (meta?.id != null) {
      acceptedIdsRef.current.add(meta.id);
      const early = earlyClipsRef.current.get(meta.id);
      if (early) {
        earlyClipsRef.current.delete(meta.id);
        earlyClip = {
          url: URL.createObjectURL(early.clip.blob),
          blob: early.clip.blob,
          durationSec: early.clip.durationSec,
          eventSec: early.clip.eventSec,
        };
      }
    }
    setPitches((prev) => [
      ...prev,
      {
        id: nextPitchId(prev),
        source,
        clip: earlyClip,
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
        analysis: {
          ...analysisOf(result, approach),
          /* 클립은 카메라 장면 그대로라 이 존을 영상 위에 그대로 얹는다. 영상 파일은 장면이 달라 싣지 않는다 */
          zoneRect: source === 'camera' ? activeZone : null,
        },
        autoDetected: source === 'camera' ? autoMode : false,
        captureId: meta?.id,
        notes: result.live?.notes.map((note) => note.text) ?? [],
        trail: trailOf(result),
        hitT: meta?.hitT ?? null,
        ...EMPTY_EDIT,
        zone: guessedZone,
      },
    ]);
    setSaved(false);
    setResultOpen(true);
    /* 앱(아이폰)에서도 떨린다 — navigator.vibrate 는 아이폰에 없다(lib/haptics.ts) */
    buzz(30);
    speak(`${Math.round(toSpeed(value, unit))}`);
  };
  useEffect(() => {
    addResultRef.current = addResult;
  });

  const startCamera = async () => {
    const video = videoRef.current;
    /* 이번 한 번만 웹 카메라 — 맨 앞에서 읽고 지운다(아래에서 일찍 끝나도 다음 켜기로 새지 않게) */
    const skipDual = skipDualOnceRef.current;
    skipDualOnceRef.current = false;
    /*
     * 뷰파인더(<video>)는 카메라 단계(수평 · 존 · 측정 · 렌즈)에서만 그려진다. 단계를 바꾸는 누름 안에서 부를 때는
     * flushSync 로 먼저 그린 뒤 부른다(enterCameraStep) — 예전에는 그리기 전에 불려 여기서 조용히 끝나, 카메라가
     * 안 켜지고 '카메라 다시 켜기' 단추만 남았다(웹 · 앱 모두, 2026-09-30 사용자).
     */
    if (!video) return;
    setError(null);
    setLast(null);
    /* 옛 카메라의 실제 fps — 새 카메라가 첫 값을 보내기 전까지 시트가 옛 값으로 '못 냈어요'를 띄웠다 */
    setFps(null);
    /*
     * 결과 번호는 LiveCapture 가 켤 때마다 1부터 다시 센다 — 세션 중에 카메라를 다시 켜면 새 공의 클립이 같은 번호의
     * 옛 공에도 붙었다. 켤 때마다 다른 자리를 얹어 가른다.
     */
    const idBase = ++captureGenRef.current * 1_000_000;
    const gen = captureGenRef.current;
    /* 설정은 방금 그린 값으로(cameraSettingsRef) — 이 함수가 옛 그림의 것이어도 */
    const now = cameraSettingsRef.current;
    const finder = finderRef.current;
    /*
     * 앱에 동시 촬영 부품이 있고, 이 아이폰이 일반 · 광각을 함께 켤 수 있고, 설정을 켰으면 앱이 두 카메라를 쥔다(웹 카메라는
     * 켜지 않는다 — 같은 카메라를 둘이 못 쓴다). 결과는 던진 뒤 1~3초에 온다(앱이 자른 클립을 영상 파일 엔진으로 잰다).
     * 기기 검사는 화면을 열 때 미리 해 둔다 — 아직이면 기다린다(앱 길만. 웹 카메라는 누름에 바로 붙여 켠다).
     */
    let dualOk = false;
    if (native && now.wideClip && !now.recordMode && finder && !skipDual) {
      const s = dualStatusNow() ?? (await dualCameraStatus());
      if (gen !== captureGenRef.current) return;
      dualOk = s.supported;
    }
    const capture =
      dualOk && finder
        ? new DualCapture(
            finder,
            {
              onStatus: setStatus,
              onResult: (r, meta) => {
                noteDiagRef.current(r);
                addResultRef.current(r, 'camera', { ...meta, id: idBase + meta.id });
              },
              onClip: (id, clip) => attachClipRef.current(idBase + id, clip),
              onWideClip: (id, clip) => attachWideClipRef.current(idBase + id, clip),
              onError: setError,
              onNotice: setToast,
              onFps: (f) => setFps(Math.round(f)),
            },
            now.fov,
            now.approach,
            now.net
          )
        : new LiveCapture(
      video,
      {
        onStatus: setStatus,
        onResult: (r, meta) => {
          noteDiagRef.current(r);
          addResultRef.current(r, 'camera', meta && { ...meta, id: idBase + meta.id });
        },
        onInfo: setLiveInfo,
        onClip: (id, clip) => attachClipRef.current(idBase + id, clip),
        onError: setError,
        onNotice: setToast,
        onFps: (f) => setFps(Math.round(f)),
      },
      now.fov,
      now.approach,
      now.net
    );
    capture.setFocalPerLongSide(now.focalRatio);
    capture.setReleaseDistance(
      now.approach === 'approaching' ? now.releaseDistM : null
    );
    /* 엔진 2.0 — 거리 자 · 숙임(폰 기울기). 켜기 전에 넣어야 카메라에 2배 줌을 청한다 */
    capture.setDistance(now.distanceM, tiltRef.current);
    capture.setManual(!now.autoMode);
    /* 엔진 개발용 녹화 중에는 공마다 클립 녹화기를 끈다 — 긴 녹화와 녹화기 셋이 겹치면 장면이 밀린다 */
    capture.setClips(!now.recordMode);
    capture.setMode(now.camMode);
    /* 세션 중에 다시 켰으면(화질 · 프레임을 바꿈) 켜지는 대로 이어서 기다린다 */
    if (liveRef.current) capture.arm();
    const prev = captureRef.current;
    prev?.stop();
    captureRef.current = capture;
    /* 앱 동시 촬영에서 웹 카메라로 바꿀 때 — 앱이 카메라를 놓은 뒤에 켠다 */
    if (prev instanceof DualCapture) await prev.stopped;
    if (captureRef.current !== capture) return;
    try {
      const info = await capture.start();
      if (captureRef.current !== capture) return;
      setCamera(info);
      if (capture instanceof DualCapture) setDualSkipped(null);
      /* 켜 보고 안 그 카메라의 화질별 한계를 적고, 고르는 칸에 덧씌운다(다음에 고를 때부터 주황) */
      if (info.frameRate != null)
        noteCamLimit(
          info.label,
          Math.min(info.width, info.height),
          (now.camMode ?? DEFAULT_CAM_MODE).fps,
          info.frameRate
        );
      setCamOptions(withCamLimits(info.label, capture.getModeOptions()));
      checkCamMode(info, now.camMode);
    } catch (e) {
      /* 켜는 사이에 껐다(화면을 떠남 · 다시 켬) — 알릴 것 없다 */
      if (e instanceof DOMException && e.name === 'AbortError') return;
      /*
       * 앱이 켜 보고 '이 아이폰은 두 카메라를 함께 못 켬(60fps 를 못 냄 · 하드웨어 몫)'으로 끝냈다 — 기억해 두고(설정 칸이
       * 잠긴다) 웹 카메라로 바꿔 켠다. 측정은 끊기지 않는다.
       */
      if (e instanceof DualUnsupportedError) {
        /* 그사이 다른 켜기로 바뀌었으면(설정을 끔 · 뒤로) 늦게 온 거절은 아무것도 하지 않는다 */
        if (captureRef.current !== capture) return;
        /*
         * 고른 화질 · 프레임 때문이면(그 화질은 함께 켜서 60fps 를 못 냄 · 하드웨어 몫) 이번만 웹 카메라로 — 동시 촬영은 잠그지 않는다.
         * 고른 것이 없을 때(기본 1080p · 60)도 안 되면 이 아이폰이 못 하는 것이라 잠근다.
         */
        if (now.camMode && (e.reason === 'fps' || e.reason === 'cost')) {
          if (captureRef.current === capture) captureRef.current = null;
          setToast(
            `광각 동시 촬영으로는 ${camModeLabel(now.camMode)} 를 못 켜요 — 이번엔 일반 카메라로 재요(광각 영상 없음)`
          );
          skipDualOnceRef.current = true;
          setDualSkipped(now.camMode);
          void startCamera();
          return;
        }
        markDualUnsupported(e.reason);
        if (captureRef.current === capture) captureRef.current = null;
        setToast('광각 동시 촬영이 안 되는 아이폰이라 일반 카메라로 재요');
        void startCamera();
        return;
      }
      const message = e instanceof Error ? e.message : '카메라를 켜지 못했습니다.';
      /*
       * 앱에는 주소창이 없다 — 앱에서 막혔으면 아이폰이 카메라를 거절한 것이고, 아이폰은 앱 안에서 다시 묻지 않는다.
       * 엔진의 거절 문구('허용해 주세요 … 자물쇠')를 앱에서는 설정 길로 바꾼다.
       */
      setError(
        native && message.includes('허용')
          ? '카메라가 꺼져 있어요. 아이폰 설정 › Bullpen Log › 카메라를 켠 뒤 다시 켜 주세요.'
          : message
      );
      if (captureRef.current === capture) captureRef.current = null;
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
  /* 설정이 끝나면 카메라 화면 위에 주의사항 팝업 — '오늘은 보지 않기'를 눌렀으면 그날은 건너뛴다 */
  const openTips = () => {
    if (!isTipsSkippedToday(today)) setTipsOpen(true);
  };
  /*
   * 카메라 단계로 들어가며 카메라를 켠다 — 상태 바꾸기를 flushSync 로 바로 그려 <video> 가 붙은 뒤, 같은 누름 안에서
   * 켠다(아이폰은 카메라 권한 창 · 영상 재생을 사용자의 누름에 붙여 두는 편이 안전하다).
   */
  const enterCameraStep = (target: Step, apply: () => void) => {
    /* 안전장치 효과가 같은 단계에서 한 번 더 켜지 않게 먼저 적어 둔다(flushSync 안에서 효과가 돌 수 있다) */
    autoStartedFor.current = target;
    flushSync(apply);
    void startCamera();
  };
  const usePrevious = () => {
    if (!stored) return;
    enterCameraStep('align', () => {
      setChoices({ cameraPos: stored.cameraPos, net: stored.net });
      setSessionType(stored.sessionType);
      setZone(stored.zone);
      setVoice(stored.voice);
      setUseCal(stored.useCal);
      setReleaseDistM(stored.releaseDistM);
      setTargetDistM(stored.targetDistM);
      setAutoMode(stored.autoMode);
      setCalibSave(stored.calibSave);
      setClipZone(stored.clipZone);
      setWideClip(stored.wideClip);
      setCamMode(isAdmin ? stored.camMode : null);
      setRecordMode(stored.recordMode);
      setDiagHud(stored.diagHud);
      setDecided(true);
      setStep('align');
    });
    openTips();
  };
  const startFresh = () => {
    /* 새 설정이어도 보기 취향(영상에 존 표시)은 이어 간다 — 안 그러면 저장할 때 켜짐으로 되돌아간다 */
    if (stored) {
      setClipZone(stored.clipZone);
      setWideClip(stored.wideClip);
      setCamMode(isAdmin ? stored.camMode : null);
      setRecordMode(stored.recordMode);
      setDiagHud(stored.diagHud);
    }
    setDecided(true);
    setStep('type');
  };
  const goAlign = () => {
    enterCameraStep('align', () => setStep('align'));
    openTips();
  };
  /*
   * 수평계 허락(아이폰) — 카메라 허락 창과 한 누름에 겹치지 않게, 카메라를 켠 다음 누름들(주의사항 닫기 · 다음 · 측정 시작)에서
   * 청한다. 이미 허락했거나 허락이 필요 없는 기기면 아무 일도 없다. 그래도 못 받았으면 수평계 자리의 '수평계 켜기'.
   */
  const goZone = () => {
    void requestPermission();
    setStep('zone');
  };
  const goMeasure = () => {
    void requestPermission();
    setZone(activeZone);
    persistSetup();
    captureRef.current?.setApproach(approach);
    setStep('measure');
  };
  const restart = () => {
    captureRef.current?.disarm();
    stopCamera();
    setSheet('none');
    setDecided(true);
    setStep('type');
  };

  /* 최신 처리 함수를 ref 로 — LiveCapture 의 handler 는 카메라를 켤 때의 closure 라 그대로 두면 존 · 설정이 옛 값이다 */
  const addResultRef = useRef<
    (r: ScreenResult, s: LocalPitch['source'], m?: ResultMeta) => void
  >(() => undefined);
  const attachClipRef = useRef<(id: number, clip: PitchClip) => void>(() => undefined);
  const attachWideClipRef = useRef<(id: number, clip: PitchClip) => void>(() => undefined);
  useEffect(() => {
    captureRef.current?.setManual(!autoMode);
  }, [autoMode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  /*
   * 결과 뒤 1~3초 안에 오는 영상 클립을 그 공에 붙인다. 모든 공의 클립을 쥐고 있다가 저장할 때 올린다(2026-10-03 사용자:
   * "클립은 보정용이던 말던 모든 상황에서 녹화") — 예전에는 보정용 저장이 아니면 최근 30개만 쥐고 올리지 않았다.
   */
  const attachClipToPitch = (id: number, clip: PitchClip) => {
    /*
     * 짝이 되는 공이 아직 없으면 붙들어 둔다 — 클립은 던진 뒤 1~3초에 오고, 계산이 밀리면 결과보다 먼저 온다(버리면 보정용
     * 클립이 빠졌다). 결과가 오면 addResult 가 붙인다. 끝내 짝이 없으면(잡음 · 거부된 던짐) 10초 뒤 버린다 — 주소를
     * 만들지 않으니 영상(2MB 남짓)이 메모리에 남지 않는다.
     */
    if (!acceptedIdsRef.current.has(id)) {
      const now = performance.now();
      for (const [k, v] of earlyClipsRef.current)
        if (now - v.at > 10_000) earlyClipsRef.current.delete(k);
      earlyClipsRef.current.set(id, { clip, at: now });
      return;
    }
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
      return next;
    });
  };
  /* 광각 클립 — DualCapture 가 잰 공(결과 다음)에만 보낸다. 짝이 없으면 버린다 */
  const attachWideClipToPitch = (id: number, clip: PitchClip) => {
    if (!acceptedIdsRef.current.has(id)) return;
    const url = URL.createObjectURL(clip.blob);
    setPitches((prev) =>
      prev.map((p) =>
        p.captureId === id
          ? {
              ...p,
              wideClip: {
                url,
                blob: clip.blob,
                durationSec: clip.durationSec,
                eventSec: clip.eventSec,
              },
            }
          : p
      )
    );
  };
  useEffect(() => {
    attachClipRef.current = attachClipToPitch;
    attachWideClipRef.current = attachWideClipToPitch;
  });

  /*
   * 세션 — 시작해도 카메라를 계속 보이고 알아서 잡는다(수동이면 공마다 단추). 정보 판(구속 · 목록)은 왼쪽 위 '측정 화면'으로
   * 올린다. 예전에는 시작하면 판이 올라와 카메라를 덮어, 공이 화면에 잘 들어오는지 보려면 '카메라'를 다시 눌러야 했다(사용자
   * 2026-10-07: "측정 시작을 누르면 바로 카메라가 계속 보이게"). 잰 값은 뷰파인더 아래에 뜬다. 종료하면 저장 시트
   */
  const startSession = () => {
    const capture = captureRef.current;
    if (!capture) return;
    void requestPermission();
    setError(null);
    setLast(null);
    setSaved(false);
    setShowCamera(true);
    capture.setManual(!autoMode);
    setLive(true);
    /* 그리기를 먼저 마친 뒤 기다린다 — 누른 순간에 대기 · 음성까지 하면 첫 장면들이 늦었다 */
    requestAnimationFrame(() => {
      capture.arm();
      speak(
        autoMode
          ? '측정을 시작해요. 던지세요'
          : '측정을 시작해요. 공마다 단추를 누르세요'
      );
    });
  };
  /* 세션을 멈춘다 — 설정에서 존 다시 놓기 · 렌즈 보정으로 갈 때. 잰 공은 그대로라 돌아와 '측정 시작'으로 이어 잰다 */
  const pauseSession = () => {
    if (!live) return;
    captureRef.current?.disarm();
    setLive(false);
    setShowCamera(false);
    setPrevOpen(false);
    setResultOpen(false);
  };
  /* 세션 종료 — 잰 공이 있으면 종합 화면으로. 거기서 저장하거나(끝) 이어서 잰다 */
  const endSession = () => {
    captureRef.current?.disarm();
    setLive(false);
    setShowCamera(false);
    setPrevOpen(false);
    setResultOpen(false);
    if (pitches.length > 0) setSummaryOpen(true);
  };
  /*
   * 엔진 개발용 녹화(관리자) — 측정 없이 카메라 영상을 계속 찍어 30초 남짓 조각으로 구속 측정 관리자에 올린다
   * (lib/velocity-recorder.ts). 그때의 카메라 · 설정(meta)을 같이 남겨, 관리자 화면에서 공마다 범위를 잡아 같은 조건으로 다시 잰다.
   */
  const startRecording = async () => {
    const capture = captureRef.current;
    const stream = capture instanceof LiveCapture ? capture.getStream() : null;
    if (!stream || !camera || recorderRef.current) {
      setToast('카메라를 켠 뒤에 녹화할 수 있어요');
      return;
    }
    const recorder = new SegmentedRecorder(stream, (s) => setRec({ ...s }));
    recorderRef.current = recorder;
    const frameFps = fps ?? camera.frameRate ?? 60;
    await recorder.start({
      date: today,
      bitrate: recordingBitrate(camera.width, camera.height, frameFps),
      meta: {
        engineVersion: VELOCITY_ENGINE_VERSION,
        app: native,
        camera: {
          label: camera.label,
          width: camera.width,
          height: camera.height,
          frameRate: camera.frameRate,
          measuredFps: fps,
          focus: camera.focus,
          zoom: camera.zoom,
          cropped: camera.cropped,
        },
        camMode,
        fovDeg: fov,
        focalRatio,
        cameraPos: choices.cameraPos,
        net: choices.net,
        zone: activeZone,
        releaseDistM: approach === 'approaching' ? releaseDistM : null,
        /* 엔진 2.0 의 거리 자(투수 뒤) — 관리자 편집기가 이 거리로 다시 잰다 */
        targetDistM: approach === 'receding' ? targetDistM : null,
      },
    });
    if (recorder.state.phase === 'error') {
      setToast(recorder.state.error ?? '녹화를 시작하지 못했어요');
      recorderRef.current = null;
      setRec(null);
      return;
    }
    buzz(20);
  };
  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state.phase !== 'recording') return;
    const res = await recorder.stop();
    recorderRef.current = null;
    setRec(null);
    buzz(20);
    setToast(
      res.ok
        ? `녹화를 구속 측정 관리자에 올렸어요(조각 ${res.parts}개)`
        : res.parts > 0
          ? `조각 ${res.parts}개만 올렸어요 — ${res.error ?? '일부를 못 올렸어요'}`
          : (res.error ?? '녹화를 올리지 못했어요')
    );
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
    if (recorderRef.current) {
      setToast('녹화를 먼저 멈춰 주세요');
      return;
    }
    if (pitches.length > 0) {
      setAskLeave(true);
      return;
    }
    router.push('/velocity');
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
      /*
       * 파일의 렌즈 정보로 화각을 잡는다(관리자 '영상 파일로 재기'와 같게). 카메라 앱 영상은 손떨림 보정이 가장자리를
       * 잘라 실시간 카메라보다 좁다 — 설정 화각(기본 69°) · 실시간 렌즈 보정을 쓰면 아이폰 영상이 약 16% 낮게 나왔다
       * (2차 보정). 렌즈 정보가 없는 파일만 설정 화각 · 렌즈 보정 그대로.
       */
      const fileFov = videoFovFor(await readVideoLens(file));
      const result = await analyzeVideo({
        file,
        fovDeg: fileFov ?? fov,
        onProgress: setFileProgress,
        approach,
        focalPerLongSide: fileFov != null ? null : focalRatio,
        releaseDistanceM: approach === 'approaching' ? releaseDistM : null,
        /* 엔진 2.0 — 영상 파일은 찍을 때의 폰 기울기를 몰라 숙임 0 */
        distanceM: distanceOf({ cameraPos: choices.cameraPos, targetDistM, releaseDistM }),
        tiltRad: null,
      });
      if (result.measure.ok) setFileReplay(URL.createObjectURL(file));
      addResult(result, 'file');
      /* HDR · 보정한 촬영과 다른 영상이면 그 알림(± 가 넓은 까닭)을 잠깐 보인다 */
      if (result.measure.ok && result.video.notes.length)
        setToast(result.video.notes[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상을 분석하지 못했습니다.');
    } finally {
      setFileBusy(false);
    }
  };

  useEffect(() => {
    captureRef.current?.setFocalPerLongSide(focalRatio);
  }, [focalRatio]);
  /*
   * 안전장치 — 카메라가 필요한 단계에 들어왔는데 카메라가 없으면(관리자 점프 · 뒤로 · 다른 길) 들어올 때 한 번 저절로
   * 켠다. 한 단계에 한 번뿐 — 권한을 거절했으면 되풀이하지 않고 '카메라 다시 켜기' 단추로 둔다.
   */
  useEffect(() => {
    const needs = !showAsk && CAMERA_STEPS.has(step);
    if (!needs) {
      autoStartedFor.current = null;
      return;
    }
    if (autoStartedFor.current === step || captureRef.current || !videoRef.current)
      return;
    autoStartedFor.current = step;
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 단계가 바뀔 때만 본다
  }, [step, showAsk]);
  /*
   * '광각 영상도 같이 저장'을 바꾸면 카메라를 쥔 쪽이 바뀐다(웹 카메라 ↔ 앱 동시 촬영) — 측정 중이 아니면 바로 다시 켠다.
   * 측정 중이면 세션을 멈춘 뒤('카메라 다시 켜기') 바뀐다.
   */
  useEffect(() => {
    const capture = captureRef.current;
    if (!capture || live || recorderRef.current) return;
    const wantsDual =
      native && wideClip && !recOn && dualStatusNow()?.supported === true;
    if (wantsDual === capture instanceof DualCapture) {
      capture.setClips(!recOn);
      return;
    }
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 설정이 바뀔 때만 본다
  }, [wideClip, recOn]);

  /*
   * 화질 · 프레임 고르기(오른쪽 위 카메라 정보 → 시트). 고르면 남기고 카메라를 다시 켠다 — 세션 중이면 켜지는 대로 이어서
   * 기다린다(startCamera 의 liveRef). 같은 값을 다시 골라도 다시 켠다(카메라가 다르게 켜졌을 때 한 번 더 해 보기).
   */
  const applyCamMode = (next: CamMode | null) => {
    if (recorderRef.current) {
      setToast('녹화 중에는 화질을 바꿀 수 없어요');
      return;
    }
    setCamMode(next);
    persistSetup({ camMode: next });
    cameraSettingsRef.current = { ...cameraSettingsRef.current, camMode: next };
    void startCamera();
  };
  /*
   * 고른 화질 · 프레임으로 켜졌나 — 카메라가 못 내는 조합이면 가까운 것으로 켜진다. 되돌리지 않고(예전에는 30fps 로 켜지면
   * 고르기 전으로 되돌려 '1080 으로 안 넘어간다'로 보였다) 실제로 켜진 값을 알리고, 60fps 아래면 측정이 잘 안 된다고 경고한다
   * (막지 않는다 — 2026-10-04 사용자). 같은 경고가 오른쪽 위 알약(주황)과 시트에도 남는다.
   */
  const checkCamMode = (info: CameraInfo, asked: CamMode | null) => {
    if (info.frameRate == null) return;
    const gotFps = Math.round(info.frameRate);
    const gotShort = Math.min(info.width, info.height);
    const low = !fpsGood(gotFps);
    if (asked && (Math.abs(gotShort - asked.short) > 8 || Math.abs(gotFps - asked.fps) > 2)) {
      setToast(
        `이 카메라는 ${camModeLabel(asked)} 를 못 내 ${gotShort}p · ${gotFps}fps 로 켰어요${
          low ? ' — 60fps 아래라 측정이 잘 안 돼요' : ''
        }`
      );
      return;
    }
    if (low) setToast(`지금 ${gotFps}fps 예요 — 60fps 아래라 측정이 잘 안 돼요`);
  };

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
  useEffect(() => {
    captureRef.current?.setDistance(
      distanceOf({ cameraPos: choices.cameraPos, targetDistM, releaseDistM }),
      tiltRef.current
    );
  }, [choices.cameraPos, targetDistM, releaseDistM]);

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
  /* 저장 때 올릴 영상 수 — 일반 + 광각 */
  const clipCount = pitches.reduce(
    (n, p) => n + (p.clip ? 1 : 0) + (p.wideClip ? 1 : 0),
    0
  );
  const stats = summarize(shownPitches);
  /* 세션 화면 · 요약 · 이전 공 시트가 받는 모양(components/velocity/session-types.ts) */
  const sessionPitches: SessionPitch[] = shownPitches.map((p, i) => ({
    id: p.id,
    seq: i + 1,
    kmh: p.kmh,
    rawKmh: p.rawKmh,
    errorKmh: p.errorKmh,
    confidence: (p.confidence in CONFIDENCE_TEXT
      ? p.confidence
      : 'medium') as ConfidenceKey,
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
  /*
   * 결과 화면 — 가장 최근 공의 길과 영상. 클립 시각 = 궤적 시각 + offset: 카메라 실시간 클립은 '담는 중'을 알린 장면(hitT)이 클립의
   * eventSec(벽시계라 어림 — 첫 재생에서 영상 속 공으로 맞춘다, lib/velocity-tracer.ts), 영상 파일 · 동시 촬영은 그 영상을 그대로
   * 쟀으니 0. 되풀이는 공이 처음 보이기 0.5초 앞에서 그물에 닿고 0.7초 뒤까지.
   */
  const resultTrail = lastPitch?.trail ?? null;
  const resultClip = (() => {
    if (!lastPitch) return null;
    const c = lastPitch.clip;
    const url = lastPitch.source === 'file' ? fileReplay : c?.url;
    if (!url) return null;
    const offset = c ? c.eventSec - (lastPitch.hitT ?? resultTrail?.[0]?.t ?? 0) : 0;
    const from = resultTrail ? resultTrail[0].t + offset : (c?.eventSec ?? 0);
    const to = resultTrail ? resultTrail[resultTrail.length - 1].t + offset : from + 0.6;
    return {
      url,
      offset,
      loop: {
        from: Math.max(0, from - 0.5),
        to: Math.min(c?.durationSec || Infinity, to + 0.7),
      },
    };
  })();
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
      let res: Awaited<ReturnType<typeof saveVelocitySession>>;
      try {
        res = await saveVelocitySession({
          date: today,
          sessionType,
          intensity,
          fovDeg: fov,
          source: pitches.every((p) => p.source === 'file') ? 'file' : 'camera',
          device: camera
            ? `${camera.label} ${camera.width}×${camera.height}`.trim()
            : null,
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
          useCal,
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
      } catch (err) {
        /* 화면 이동 같은 Next.js 자체 신호는 잡지 않고 그대로 넘긴다 */
        unstable_rethrow(err);
        /*
         * 신호가 끊겨도 잰 공은 그대로 둔다 — 예전에는 전환(transition) 안의 오류가 오류 화면으로 넘어가 세션이 통째로
         * 사라졌다(김민 17dbf60).
         */
        setError(
          '신호가 약해 저장하지 못했어요. 잰 공은 그대로 있으니 신호가 잡히면 다시 저장해 주세요.'
        );
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      /* 공마다 영상 클립을 올린다(모든 세션) — 실패해도 측정값은 이미 저장됐다 */
      if (res.pitchIds) {
        const ids = res.pitchIds;
        /* 공마다 일반 영상 · (있으면) 광각 영상 */
        const targets = pitches.flatMap((p, i) => {
          const id = ids[i];
          if (!id) return [];
          const jobs: { id: string; clip: LocalClip; kind: 'main' | 'wide' }[] = [];
          if (p.clip) jobs.push({ id, clip: p.clip, kind: 'main' });
          if (p.wideClip) jobs.push({ id, clip: p.wideClip, kind: 'wide' });
          return jobs;
        });
        if (targets.length) {
          setUploading({ done: 0, total: targets.length });
          let failed = 0;
          for (let i = 0; i < targets.length; i++) {
            const { id, clip, kind } = targets[i];
            const r = await uploadClip(
              id,
              clip.blob,
              { sec: clip.durationSec, eventSec: clip.eventSec },
              undefined,
              kind
            );
            if (!r.ok) failed++;
            setUploading({ done: i + 1, total: targets.length });
          }
          setUploading(null);
          if (failed)
            setError(`클립 ${failed}개를 올리지 못했어요(측정값은 저장됐어요).`);
        }
      }
      for (const p of pitches) revokeClips(p);
      setSaved(true);
      setPitches([]);
      setClipOpen(null);
      setSheet('none');
      setSummaryOpen(false);
      /*
       * 저장은 곧 측정의 끝(사용자 규칙: '세션 저장하기'로 끝내고, 더 재려면 '구속 측정하기').
       * 구속 측정 메인(/velocity)으로 — 방금 세션이 구속 변화 그래프에 붙는다. 화면을 떠나면 카메라도 꺼진다.
       */
      router.push('/velocity');
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
        : tipsOpen
          ? 'tips'
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
    if (key === 'tips') {
      /* 주의사항은 카메라 화면 위의 팝업 — 카메라는 켜지 않고 팝업만 */
      setStep('align');
      setTipsOpen(true);
      return;
    }
    setTipsOpen(false);
    setStep(key);
  };
  const addSamplePitches = () => {
    setPitches((prev) => [
      ...prev,
      ...SAMPLE_PITCHES.map((sp, i) => ({
        id: nextPitchId(prev) + i,
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
      for (const p of prev) if (p.sample) revokeClips(p);
      return prev.filter((p) => !p.sample);
    });
  };

  const back = showAsk ? null : (BACK_OF[step] ?? null);
  /* 방금 결과를 카메라 위에 크게 보이나 — 측정에서 카메라가 보일 때 */
  const resultShown =
    step === 'measure' && last != null && !fileBusy && !(live && !showCamera);
  /* 카메라 무대 위 가운데 — 단계 이름(측정은 세션 중 상태가 대신) */
  const stageTitle =
    step === 'align'
      ? { n: '4/5', label: '수평 · 표적' }
      : step === 'zone'
        ? { n: '5/5', label: '스트라이크 존' }
        : null;
  const fpsNote = liveFpsNote(fps);
  /* 오른쪽 위 알약을 주황으로 — 실제로 들어오는 fps 가 낮거나(50 아래), 카메라가 60fps 아래로 켜졌거나(시트와 같은 기준) */
  const lowFps =
    fpsNote != null || (camera?.frameRate != null && !fpsGood(camera.frameRate));
  /* 카메라가 잘려 왔으면(원래 비율이 아니면) 화각을 짐작한다 — 막지 않고 알린다 */
  const cropNote =
    camera?.cropped === true
      ? `카메라 화면이 잘려 와서(${camera.width}×${camera.height}) 값이 부정확할 수 있어요.`
      : null;
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;
  const levelOk = !level.supported || level.ok;
  const targetText =
    choices.cameraPos === 'behind-pitcher' ? '릴리스 포인트' : '미트가 오는 자리';

  /*
   * 스트라이크 존 — 장면 좌표를 지금 뷰파인더 칸에 맞춰 그린다(카메라가 꺼져 있으면 칸 = 장면으로 본다). 모양 · 크기는 규격
   * (activeZone, 위)이고, 놓는 단계에서 끌 때도 같은 규격(모양 zoneAspect · 가로 zoneMinW ~ zoneMaxW, 칸 좌표로 바꾼 것).
   */
  const viewZone =
    frameSize && finderSize
      ? frameRectToView(activeZone, frameSize, finderSize)
      : activeZone;
  const [zoneLo, zoneHi] = ZONE_WIDTH_RANGE[choices.cameraPos];
  const zoneAspectView = (zoneAspectIn(frameSize ?? undefined) * visible.w) / visible.h;

  /* 뷰파인더 — 카메라 무대(수평 · 존 · 측정 · 렌즈)의 같은 자리에 하나. 단계가 바뀌어도 같은 <video> 다 */
  const finder = (
    <div
      ref={finderRef}
      data-finder
      className="relative h-full w-full overflow-hidden bg-black"
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
      {cameraOn && step !== 'align' && step !== 'lens' && !(live && !showCamera) && (
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
          aspect={zoneAspectView}
          minW={zoneLo / visible.w}
          maxW={zoneHi / visible.w}
          /* 존이 위 줄 · 둘째 줄(수평계) 밑으로 들어가면 손잡이를 못 잡는다 — 둘째 줄 아래까지 비운다 */
          topInset={() => {
            const row = topRowRef.current?.getBoundingClientRect();
            const box = finderRef.current?.getBoundingClientRect();
            return row && box ? Math.max(0, row.bottom - box.top) : 0;
          }}
        />
      )}

      {/* 표적 — 릴리스 포인트 */}
      {cameraOn && step !== 'zone' && step !== 'lens' && !(live && !showCamera) && (
        <div aria-hidden className="pointer-events-none absolute inset-0 text-white">
          <div
            className={`absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors ${
              status === 'armed'
                ? 'border-sky-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]'
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
      {cameraOn && step !== 'lens' && !(live && !showCamera) && (
        <div
          ref={topRowRef}
          className="pointer-events-none absolute inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top))] flex h-7 items-center justify-between gap-2 text-xs"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {levelOn && <LevelBubble level={level} onRequest={requestPermission} />}
          </div>
          {camera && !isAdmin && (
            /* 화질 · 프레임은 1080p · 60fps 고정(사용자 2026-10-07, DEFAULT_CAM_MODE — 엔진 2.0 을 맞춘 조건). 못 내는 폰은 60fps 를 지키며 화질을 낮춘다 */
            <span
              className={`inline-flex h-7 min-w-0 items-center rounded-full px-2.5 tabular-nums backdrop-blur ${
                lowFps ? 'bg-amber-600 text-white' : 'bg-black/55 text-white/80'
              }`}
            >
              <span className="truncate">
                {camera.width}×{camera.height}
                {(fps ?? camera.frameRate) != null &&
                  ` · ${fps ?? Math.round(camera.frameRate ?? 0)}fps`}
                {camera.focus === 'manual' && ' · 수동초점'}
                {camera.focus === 'auto' && ' · 자동초점'}
              </span>
            </span>
          )}
          {camera && isAdmin && (
            /*
             * 관리자만 누르면 화질 · 프레임 고르기(엔진 시험용). 뷰파인더 위 손동작(존 끌기)이 이 누름을 가져가지 않게 pointerdown 을
             * 여기서 멈춘다. 보이는 알약은 h-7 이지만 누르는 자리는 위아래로 넓힌다(before 로 44px).
             */
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSheet('camera')}
              aria-label="카메라 화질 · 프레임 바꾸기"
              className={`pointer-events-auto relative inline-flex h-7 min-w-0 items-center gap-1 rounded-full pl-2.5 pr-2 tabular-nums backdrop-blur before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] motion-safe:transition-colors ${
                lowFps
                  ? 'bg-amber-600 text-white'
                  : 'bg-black/55 text-white/80 active:bg-black/70'
              }`}
            >
              <span className="truncate">
                {camera.width}×{camera.height}
                {/* 실제로 들어오는 fps 가 오기 전에는 카메라가 약속한 값 */}
                {(fps ?? camera.frameRate) != null &&
                  ` · ${fps ?? Math.round(camera.frameRate ?? 0)}fps`}
                {camera.focus === 'manual' && ' · 수동초점'}
                {camera.focus === 'auto' && ' · 자동초점'}
              </span>
              <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </button>
          )}
        </div>
      )}

      {/*
        진단 표시(관리자 설정) — 밖에서 하나도 안 잡힐 때 그 자리에서 까닭을 본다: 장면 받는 길(worker-stream 이 가장 가볍다) ·
        실제로 들어오는 fps · 측정 워커가 장면 하나에 쓴 시간(16.7ms 를 넘으면 60fps 를 못 따라간다) · 계산이 밀려 버린 공 ·
        알아챈 수 · 잰 수 · 거부 수와 마지막 결과. 정보 판이 올라와 있어도 보이게 위에 둔다.
      */}
      {isAdmin && diagHud && cameraOn && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-3 top-[calc(6.25rem+env(safe-area-inset-top))] z-30 max-w-[15rem] rounded-lg bg-black/70 px-2.5 py-1.5 text-xs leading-snug text-white/90 tabular-nums backdrop-blur"
        >
          <p>
            {camera?.label.startsWith('DualCamera') ? 'dual(앱)' : (liveInfo?.pipeline ?? '—')}
            {' · '}
            {fps ?? '—'}fps
            {liveInfo?.stats?.procAvgMs != null &&
              ` · 처리 ${liveInfo.stats.procAvgMs.toFixed(1)}/${liveInfo.stats.procMaxMs.toFixed(0)}ms`}
          </p>
          <p>
            알아챔 {diag.captures} · 잼 {diag.ok} · 거부 {diag.rejected}
            {(liveInfo?.dropped ?? 0) > 0 && ` · 버림 ${liveInfo?.dropped}`}
          </p>
          {diag.last && <p className="truncate text-white/70">마지막 {diag.last}</p>}
          {liveInfo?.frame && (
            <p className="truncate text-white/60">
              {liveInfo.frame.format} {liveInfo.frame.coded[0]}×{liveInfo.frame.coded[1]}
              {liveInfo.rotationFix ? ` · 돌림 ${liveInfo.rotationFix}°` : ''}
            </p>
          )}
          {liveInfo?.streamFailed && (
            <p className="truncate text-amber-300">직접 받기 실패: {liveInfo.streamFailed}</p>
          )}
          <p className="text-white/60">상태 {STATUS_TEXT[status]}</p>
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
    <div className="ui-chrome relative flex min-h-0 flex-1 flex-col overflow-hidden bg-page text-ink desk:mx-auto desk:my-4 desk:h-[calc(100dvh-2rem)] desk:max-h-[52.75rem] desk:w-[24.375rem] desk:flex-none desk:overflow-hidden desk:rounded-[2.5rem] desk:border-[6px] desk:border-ink/85 desk:shadow-2xl">
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
          toggles={[
            {
              key: 'calibSave',
              label: '정확도 보정용 저장',
              hint: '켜고 잰 세션을 구속 측정 관리자에서 보정 자료로 표시해요.',
              icon: Database,
              on: calibSave,
              onChange: (next) => {
                setCalibSave(next);
                persistSetup({ calibSave: next });
              },
            },
            {
              key: 'diagHud',
              label: '진단 표시',
              hint: '카메라 위에 장면 받는 길 · 실제 fps · 처리 시간 · 알아챔 · 거부 까닭을 작게 띄워요.',
              icon: Activity,
              on: diagHud,
              onChange: (next) => {
                setDiagHud(next);
                persistSetup({ diagHud: next });
              },
            },
            {
              key: 'recordMode',
              label: '엔진 개발용 녹화',
              hint: '측정 대기 화면의 시작 단추가 녹화 단추가 돼요. 측정 없이 찍어 구속 측정 관리자에 올려요.',
              icon: Clapperboard,
              on: recordMode,
              onChange: (next) => {
                if (recorderRef.current) {
                  setToast('녹화를 먼저 멈춰 주세요');
                  return;
                }
                setRecordMode(next);
                persistSetup({ recordMode: next });
              },
            },
          ]}
          tools={[
            {
              label: `예시 공 ${SAMPLE_PITCHES.length}개 넣기`,
              onClick: addSamplePitches,
              icon: FlaskConical,
            },
            { label: '예시 공 지우기', onClick: clearSamplePitches, icon: Trash2 },
          ]}
          className="absolute left-0 top-1/2 z-30 -translate-y-1/2"
        />
      )}
      {/*
       * 내비게이션 바 — 카메라 단계(수평 · 존 · 측정 · 렌즈)는 카메라 앱처럼 위 줄을 카메라 위에 그린다(아래 카메라 무대).
       * 높이는 48px + 시계 자리(box-content) — 앱이 시계 자리까지 그리게 된 뒤 h-12 안에 그 여백을 넣으면 찌그러졌다.
       */}
      {(showAsk || !CAMERA_STEPS.has(step)) && (
        <header className="box-content flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)]">
          {back ? (
            <button
              type="button"
              onClick={() => setStep(back.to)}
              className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
              {back.label}
            </button>
          ) : (
            <button
              type="button"
              onClick={leave}
              className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
              구속 측정
            </button>
          )}
          <h1 className="text-heading text-base">구속 측정</h1>
          <span className="h-10 w-10" />
        </header>
      )}

      {/* 지난 설정 → 1 어떤 투구 → 2 카메라 위치 → 3 네트 — 카메라 앞 단계(그림 카드) */}
      {showAsk && stored && (
        <PreviousSetupStep setup={stored} onUse={usePrevious} onFresh={startFresh} />
      )}
      {!showAsk && step === 'type' && (
        <StepShell
          step={1}
          total={5}
          title="어떤 투구인가요?"
          subtitle="투구 기록에 이 종류로 남아요 — 나중에 돌아볼 때 무엇을 하다 던졌는지 갈려요."
          footer={
            <PrimaryButton onClick={() => setStep('camera')}>
              다음
              <ChevronRight aria-hidden className="h-4 w-4" />
            </PrimaryButton>
          }
        >
          <OptionCards
            label="어떤 투구"
            options={sessionTypeOptions()}
            value={sessionType}
            onChange={setSessionType}
          />
        </StepShell>
      )}
      {!showAsk && step === 'camera' && (
        <StepShell
          step={2}
          total={5}
          title="폰을 어디에 둘까요?"
          subtitle="공이 날아가는 길과 넣은 거리로 구속을 재요. 뒤에서 정면으로 보게 두는 두 자리 중 하나예요."
          footer={
            <PrimaryButton
              onClick={() => {
                persistSetup({ targetDistM, releaseDistM });
                setStep('net');
              }}
            >
              다음
              <ChevronRight aria-hidden className="h-4 w-4" />
            </PrimaryButton>
          }
        >
          <div className="space-y-5">
            <OptionCards
              label="카메라 위치"
              options={cameraPosOptions()}
              value={choices.cameraPos}
              onChange={(cameraPos) => {
                if (cameraPos !== choices.cameraPos) setZone(defaultZone(cameraPos));
                setChoices({ ...choices, cameraPos });
              }}
              columns={1}
            />
            {choices.cameraPos === 'behind-pitcher' ? (
              <DistanceField
                label="폰에서 공이 닿는 곳까지"
                hint="그물이나 포수 미트까지예요. 줄자로 재서 넣으면 가장 정확해요(5% 틀리면 구속도 5% 틀려요). 정규 마운드에서 폰을 투수판 1m 뒤에 두면 약 19.5m예요."
                value={targetDistM}
                min={TARGET_DIST_MIN}
                max={TARGET_DIST_MAX}
                onChange={setTargetDistM}
              />
            ) : (
              <DistanceField
                label="폰에서 투수가 공을 놓는 곳까지"
                hint="줄자로 재서 넣으면 가장 정확해요. 정규 마운드에서 폰을 홈플레이트 1.8m 뒤에 두면 약 18.5m예요."
                value={releaseDistM}
                min={RELEASE_DIST_MIN}
                max={RELEASE_DIST_MAX}
                onChange={setReleaseDistM}
              />
            )}
          </div>
        </StepShell>
      )}
      {!showAsk && step === 'net' && (
        <StepShell
          step={3}
          total={5}
          title="카메라 앞에 네트가 있나요?"
          subtitle="그물이 있으면 초점을 고정해요 — 자동초점은 눈앞의 그물코에 초점을 맞춰 공이 흐려져요."
          footer={
            <PrimaryButton onClick={goAlign}>
              카메라 켜기
              <ChevronRight aria-hidden className="h-4 w-4" />
            </PrimaryButton>
          }
        >
          <OptionCards
            label="네트"
            options={netOptions()}
            value={choices.net ? 'yes' : 'no'}
            onChange={(v) => setChoices({ ...choices, net: v === 'yes' })}
          />
        </StepShell>
      )}

      {/*
       * 카메라 무대 — 4 수평 · 5 존 · 6 측정 · 렌즈 보정이 같은 틀을 쓴다(카메라 앱처럼 위 줄 · 뷰파인더 · 아래 단추). 뷰파인더가
       * 늘 같은 자리에 있어야 <video> 가 새로 만들어지지 않는다 — 예전에는 존 단계와 측정 단계가 뷰파인더를 다른 자리에 그려,
       * 측정으로 넘어가면 새 <video> 에 카메라가 이어지지 않아 까맸다(2026-09-30 사용자: "측정 화면에서 카메라가 안 보인다").
       * 측정: 세션 전에는 카메라가 꽉 차고, 시작하면 정보 판이 밑에서 올라와 덮는다('카메라'로 내린다).
       */}
      {!showAsk && CAMERA_STEPS.has(step) && (
        <div className="relative flex min-h-0 flex-1 flex-col bg-black text-white">
          {/*
           * 뷰파인더 — 세션 중에도 제 크기로 재생해 둔다(프레임이 와야 잰다). 카메라를 숨길 때는 그 위를
           * 거의 불투명한 정보 판으로 덮는다. 영상을 1px · 투명도 0 으로 줄이면 크롬은 그 영상을 그리지 않아
           * 프레임 알림(requestVideoFrameCallback)이 끊길 수 있고, 아이폰은 안 보이는 영상을 멈출 수 있다.
           * 판을 100% 불투명하게 하면 크롬이 가려진 영상을 건너뛸 수 있어 98% 로 둔다. 크기가 그대로라
           * 스트라이크 존 · 코스 짐작의 기준도 바뀌지 않는다.
           */}
          <div
            className={
              step === 'lens'
                ? 'relative h-[calc(min(46dvh,24rem)+1.5rem)] shrink-0'
                : 'relative min-h-0 flex-1'
            }
          >
            {finder}
            {/*
             * 정보 판 — 세션 중 카메라 위를 덮는다. '카메라'를 누르면 밑으로 내려가 카메라가 보이고, '측정 화면'을 누르면 다시
             * 밑에서 올라온다(나갈 때 150ms · 들어올 때 200ms, 처음 시작할 때도 올라온다). 내려가 있어도 떼지 않는다.
             */}
            {step === 'measure' && live && (
              <div
                ref={panelRef}
                inert={showCamera}
                data-down={showCamera ? '' : undefined}
                className="absolute inset-0 z-5 translate-y-0 overflow-y-auto overscroll-contain bg-black/98 px-4 pb-4 pt-[calc(3.5rem+env(safe-area-inset-top))] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] will-change-transform motion-safe:animate-panel-up motion-reduce:transition-none data-[down]:pointer-events-none data-[down]:translate-y-full data-[down]:duration-150 data-[down]:ease-in"
              >
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
                        ± {speedNum(lastPitch.errorKmh)} ·{' '}
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
                      {lastPitch.notes?.slice(0, 2).map((text) => (
                        <p
                          key={text}
                          className="mt-1.5 text-xs leading-snug text-warn-line"
                        >
                          {text}
                        </p>
                      ))}
                    </div>
                  ) : last && !last.measure.ok ? (
                    <div className="py-3 motion-safe:animate-fade-in">
                      <p className="text-sm font-bold text-warn-line">
                        {last.live?.ball?.strong ? '공은 봤는데 못 쟀어요' : '재지 않았어요'}
                      </p>
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
                      {(fpsNote ?? cropNote) && (
                        <p className="mt-2 text-xs leading-snug text-warn-line">
                          {fpsNote ?? cropNote}
                        </p>
                      )}
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
            {/*
             * 아래 한 열 — 안내 · 알림 · 방금 결과를 뷰파인더 밑에서부터 쌓는다. 뷰파인더 안이라 아래 막대(홈 막대 여백만큼
             * 커진다) 뒤로 숨지 않고, 알림과 결과가 서로 겹치지 않는다(2026-09-30 디자인 검토 — 예전에는 막대 높이를 짐작한
             * 자리에 따로 떠 있어 앱에서 10px 가려지고 결과 글자 위에 겹쳤다).
             */}
            {step !== 'lens' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2">
                {(!live || showCamera) &&
                  (step === 'align' ||
                    step === 'zone' ||
                    error ||
                    saved ||
                    toast ||
                    fpsNote ||
                    cropNote ||
                    (isAdmin && !native)) && (
                    <div className={`space-y-2 px-4 ${resultShown ? '' : 'pb-3'}`}>
                      {step === 'align' && (
                        <p className="rounded-xl bg-black/55 px-4 py-2.5 text-sm leading-snug text-white backdrop-blur motion-safe:animate-fade-in">
                          {withGa(targetText)} 가운데 표적에 오게 폰 높이와 방향을
                          맞추세요.
                        </p>
                      )}
                      {step === 'align' && cameraOn && !levelOk && (
                        <p className="rounded-xl bg-amber-600/90 px-4 py-2.5 text-sm leading-snug text-white">
                          아직 기울어 있어요. 그대로 가도 되지만 코스와 궤적이 비뚤게
                          보여요.
                        </p>
                      )}
                      {step === 'zone' && (
                        <p className="rounded-xl bg-black/55 px-4 py-2.5 text-sm leading-snug text-white backdrop-blur motion-safe:animate-fade-in">
                          {choices.cameraPos === 'behind-pitcher'
                            ? '멀리 포수 미트 쪽에 두세요. '
                            : '홈플레이트 위에 두세요. '}
                          화면 어디든 끌면 옮겨지고, 두 손가락으로 벌리거나 모서리
                          손잡이로 크기를 맞춰요.
                        </p>
                      )}
                      {/* 초당 장면 · 잘림 — 측정 화면에서만(수평 · 존은 오른쪽 위 주황 표시로 충분), 결과가 떠 있으면 결과의 알림이 말한다 */}
                      {step === 'measure' &&
                        !resultShown &&
                        (fpsNote ?? cropNote) &&
                        !error && (
                          <p className="rounded-xl bg-warn/90 px-4 py-2.5 text-sm leading-snug text-white">
                            {fpsNote ?? cropNote}
                          </p>
                        )}
                      {step === 'measure' && isAdmin && !native && !error && !saved && (
                        <p className="rounded-xl bg-black/55 px-4 py-2 text-xs leading-snug text-white/85 backdrop-blur">
                          웹 시험 모드(관리자) — 브라우저 카메라는 대개 초당 30장이라
                          값은 참고용이에요.
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
                          {/*
                            일반 이동 — 앱 안의 링크로 가면 (app) 의 팝업 경로(@modal/(.)pitch-log)가 가로채 빈 화면 위에 팝업이
                            떴다(측정 화면은 (app) 밖이다). 주소로 곧장 가면 팝업 없이 그날 화면이 뜬다.
                          */}
                          <a
                            href={`/pitch-log/${today}`}
                            className="ml-auto font-semibold text-sky-soft"
                          >
                            기록 보기
                          </a>
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
                  <p className="mx-4 mb-3 rounded-xl bg-white/15 px-4 py-2.5 text-center text-sm text-white backdrop-blur motion-safe:animate-fade-in">
                    {toast}
                  </p>
                )}
                {resultShown && last && (
                  <div className="bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pb-5 pt-10 text-white">
                    {last.measure.ok ? (
                      <div className="motion-safe:animate-fade-in">
                        <p className="text-display text-6xl leading-none tabular-nums">
                          {speedNum(shown(last.measure.kmh))}
                          <span className="ml-2 text-lg text-white/70">
                            {speedLabel(unit)}
                          </span>
                        </p>
                        <p className="mt-1.5 text-xs text-white/75">
                          ± {speedNum(last.measure.errorKmh)} ·{' '}
                          {CONFIDENCE_TEXT[last.measure.confidence]}
                          {last.release &&
                            ` · 릴리스 추정 ${speedNum(shown(last.release.releaseKmh))}`}
                          {useCal &&
                            fit.n > 0 &&
                            ` · 보정 전 ${speedNum(last.measure.kmh)}`}
                        </p>
                        {last.live?.notes.slice(0, 2).map((note) => (
                          <p
                            key={note.code}
                            className="mt-1 text-xs leading-snug text-warn-line"
                          >
                            {note.text}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className="motion-safe:animate-fade-in">
                        <p className="text-sm font-bold text-warn-line">
                          {last.live?.ball?.strong ? '공은 봤는데 못 쟀어요' : '재지 않았어요'}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-white/90">
                          {last.measure.message}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-white/60">
                          {last.measure.fix}
                        </p>
                        <p className="mt-1.5 text-xs text-white/45 tabular-nums">
                          {last.sourceSize.width}×{last.sourceSize.height}
                          {last.fps != null && ` · ${Math.round(last.fps)}fps`} · 프레임{' '}
                          {last.frameCount} · 공 {last.track.length} · 흔들림{' '}
                          {last.shakePx}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 렌즈 보정 — 공을 아는 거리에 두고 크기를 재 초점거리를 얻는다(뷰파인더 밑의 판) */}
          {step === 'lens' && (
            <div className="relative z-10 -mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-t-3xl bg-page px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 text-ink motion-safe:animate-sheet-up">
              <h2 className="text-heading text-xl leading-tight">렌즈 보정</h2>
              <p className="mb-3 mt-1.5 text-sm leading-relaxed text-muted">
                카메라 유리에서 공 앞면까지 줄자로 1m 를 재어 공을 두고, 화면의 원을
                공에 대충 맞춘 뒤 &lsquo;재기&rsquo;를 누르세요. 초점거리를 직접 재면
                화각 가정의 오차(기종 · 크롭)가 사라져요.
              </p>
              {!cameraOn && (
                <div className="mb-3">
                  <Note tone="warn">카메라를 켜야 잴 수 있어요.</Note>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="mb-3 rounded-xl border border-danger-line bg-danger-bg px-4 py-2.5 text-sm text-danger"
                >
                  {error}
                </p>
              )}
              {toast && (
                <p className="mb-3 rounded-xl bg-surface-2 px-4 py-2.5 text-center text-sm text-ink motion-safe:animate-fade-in">
                  {toast}
                </p>
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

          {step === 'measure' && resultOpen && lastPitch && !summaryOpen && (
            <PitchResult
              pitchKey={lastPitch.id}
              index={pitches.length}
              speed={speedNum(shown(lastPitch.rawKmh))}
              unit={speedLabel(unit)}
              sub={`± ${speedNum(lastPitch.errorKmh)} · ${
                CONFIDENCE_TEXT[lastPitch.confidence as keyof typeof CONFIDENCE_TEXT] ?? ''
              }`}
              notes={lastPitch.notes ?? []}
              clip={resultClip}
              trail={resultTrail}
              frame={lastPitch.analysis?.analyzeSize ?? null}
              cameraPos={choices.cameraPos}
              pitchType={lastPitch.pitchType}
              onPitchType={(pitchType) => patch(lastPitch.id, { pitchType })}
              onClose={() => setResultOpen(false)}
              onNext={() => {
                setResultOpen(false);
                if (!autoMode && live) nextPitch();
              }}
              nextLabel={autoMode ? '다음 공' : '다음 공 준비'}
            />
          )}

          {/*
           * 세션 요약 — 세션 종료 뒤. 카메라(뷰파인더)는 밑에 그대로 둔다 — '구속 측정하기'로 같은
           * 세션을 이어 잴 수 있게(영상을 떼면 카메라가 멈춘다). 위 줄과 아래 단추도 이 판이 덮는다.
           */}
          {step === 'measure' && summaryOpen && (
            <div className="absolute inset-0 z-20 flex flex-col bg-page text-ink motion-safe:animate-fade-in">
              <div className="box-content flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)]">
                <button
                  type="button"
                  onClick={leave}
                  className="inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint"
                >
                  <ChevronLeft aria-hidden className="h-5 w-5" />
                  투구 기록
                </button>
                <span className="text-heading text-base">구속 측정</span>
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
                  className="absolute inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] rounded-xl bg-danger/90 px-4 py-2.5 text-sm leading-relaxed text-white"
                >
                  {error}
                </p>
              )}
            </div>
          )}

          {/*
           * 위 줄 — 카메라 앱처럼 카메라 위에. 수평 · 존 · 렌즈는 왼쪽 뒤로 · 가운데 단계 이름. 측정은 세션 전에 닫기, 세션 중에는
           * '카메라'(정보 판을 내려 카메라를 본다) · '측정 화면'(다시 올린다), 가운데 상태. 오른쪽은 늘 재초점 · 설정.
           */}
          {!(step === 'measure' && summaryOpen) && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <div className="pointer-events-auto flex items-center gap-1">
                {step !== 'measure' && back ? (
                  <button
                    type="button"
                    onClick={() => {
                      /* 설정 단계로 돌아가면 카메라는 끈다 — 다시 오면 다시 켠다 */
                      if (step === 'align') stopCamera();
                      setStep(back.to);
                    }}
                    aria-label={`뒤로 · ${back.label}`}
                    className={CHROME_BTN}
                  >
                    <ChevronLeft aria-hidden className="h-5 w-5" />
                  </button>
                ) : step === 'measure' && live && !showCamera ? (
                  <button
                    type="button"
                    onClick={() => {
                      /* 판을 먼저 내리고(그 장면에 시작), 화면 전체 다시 그리기는 틈틈이 — 누른 뒤 0.1초 멈췄다 */
                      panelRef.current?.setAttribute('data-down', '');
                      startTransition(() => setShowCamera(true));
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 pl-3 pr-3.5 text-xs font-semibold text-white backdrop-blur transition-[background-color,scale] hover:bg-white/15 active:scale-95"
                  >
                    <Camera aria-hidden className="h-4 w-4" />
                    카메라
                  </button>
                ) : step === 'measure' && live && showCamera ? (
                  <button
                    type="button"
                    onClick={() => {
                      panelRef.current?.removeAttribute('data-down');
                      startTransition(() => setShowCamera(false));
                    }}
                    className="inline-flex h-10 items-center gap-1 rounded-full bg-black/45 pl-2.5 pr-3.5 text-xs font-semibold text-white backdrop-blur transition-[background-color,scale] hover:bg-black/60 active:scale-95"
                  >
                    <ChevronUp aria-hidden className="h-4 w-4" />
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
              {stageTitle && (
                <span className="absolute left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] inline-flex h-10 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/45 px-3.5 text-xs font-semibold backdrop-blur motion-safe:animate-fade-in">
                  {stageTitle.n && (
                    <span className="tabular-nums text-white/55">{stageTitle.n}</span>
                  )}
                  {stageTitle.label}
                </span>
              )}
              {step === 'measure' && (
                <span
                  className={`absolute left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] inline-flex h-10 max-w-[10rem] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold backdrop-blur transition-colors ${
                    live && !showCamera ? 'bg-white/10' : 'bg-black/45'
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      recording || status === 'armed'
                        ? 'animate-pulse bg-danger'
                        : status === 'capturing' || status === 'analyzing'
                          ? 'bg-amber-400'
                          : 'bg-white/60'
                    }`}
                  />
                  <span className="truncate">
                    {recording ? `녹화 중 ${formatClock(rec?.elapsedSec ?? 0)}` : STATUS_TEXT[status]}
                  </span>
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
                {step === 'measure' && (
                  <button
                    type="button"
                    onClick={() => setSheet('settings')}
                    aria-label="설정"
                    className={live && !showCamera ? CHROME_BTN_ON_PANEL : CHROME_BTN}
                  >
                    <Settings2 aria-hidden className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 아래 단추 — 카메라 앱처럼 셋: 보조 · 셔터(다음 · 완료 · 시작 · 종료) · 보조. 렌즈 보정은 판이 대신한다 */}
          {step !== 'lens' && (
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
              {step === 'align' || step === 'zone' ? (
                <>
                  <div className="flex w-20 flex-col items-center">
                    {step === 'align' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setTipsOpen(true)}
                          aria-label="주의사항 보기"
                          className={SIDE_BTN}
                        >
                          <Info aria-hidden className="h-5 w-5" />
                        </button>
                        <span className={SIDE_LABEL}>주의사항</span>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setZone(
                              defaultZone(choices.cameraPos, frameSize ?? undefined)
                            )
                          }
                          aria-label="스트라이크 존 기본 자리"
                          className={SIDE_BTN}
                        >
                          <RotateCcw aria-hidden className="h-5 w-5" />
                        </button>
                        <span className={SIDE_LABEL}>기본 자리</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={step === 'align' ? goZone : goMeasure}
                      disabled={!cameraOn}
                      aria-label={
                        step === 'align' ? '다음 — 스트라이크 존' : '완료 — 측정 화면'
                      }
                      className="group flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-40"
                    >
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black transition-transform group-active:scale-90">
                        <span className="text-sm font-bold">
                          {step === 'align' ? '다음' : '완료'}
                        </span>
                      </span>
                    </button>
                    <span className={SIDE_LABEL}>
                      {step === 'align' ? '스트라이크 존으로' : '측정으로'}
                    </span>
                  </div>
                  <div aria-hidden className="w-20" />
                </>
              ) : !live && recOn ? (
                /*
                 * 엔진 개발용 녹화(관리자 설정) — 시작 단추 자리가 녹화 단추. 왼쪽은 조각 · 올림, 오른쪽은 찍은 시간.
                 * 멈추면 남은 조각을 다 올린 뒤 끝난다(그동안 단추는 도는 표시).
                 */
                <>
                  <div className="flex w-20 flex-col items-center">
                    <span
                      className={`${SIDE_BTN} pointer-events-none flex-col text-xs leading-tight tabular-nums`}
                    >
                      <span className="font-semibold">
                        {rec ? `${rec.uploaded}/${rec.parts}` : '0/0'}
                      </span>
                    </span>
                    <span className={SIDE_LABEL}>
                      {rec?.progress != null ? `올리는 중 ${rec.progress}%` : '올린 조각'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={
                        recording
                          ? () => void stopRecording()
                          : cameraOn
                            ? () => void startRecording()
                            : startCamera
                      }
                      disabled={
                        status === 'starting' ||
                        rec?.phase === 'starting' ||
                        rec?.phase === 'stopping'
                      }
                      aria-label={
                        recording ? '녹화 멈춤' : cameraOn ? '녹화 시작' : '카메라 켜기'
                      }
                      className="group flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-60"
                    >
                      {rec?.phase === 'starting' || rec?.phase === 'stopping' ? (
                        <Loader2 aria-hidden className="h-7 w-7 animate-spin text-white" />
                      ) : recording ? (
                        <span className="h-8 w-8 rounded-lg bg-red-500 transition-transform group-active:scale-90" />
                      ) : cameraOn ? (
                        <span className="h-16 w-16 rounded-full bg-red-500 transition-transform group-active:scale-90" />
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black">
                          <Camera aria-hidden className="h-6 w-6" />
                        </span>
                      )}
                    </button>
                    <span className={SIDE_LABEL}>
                      {rec?.phase === 'stopping'
                        ? '남은 조각 올리는 중'
                        : recording
                          ? '녹화 멈춤'
                          : cameraOn
                            ? '엔진 개발용 녹화'
                            : '카메라 켜기'}
                    </span>
                  </div>
                  <div className="flex w-20 flex-col items-center">
                    <span
                      className={`${SIDE_BTN} pointer-events-none text-xs font-semibold tabular-nums ${
                        recording ? 'text-red-400' : ''
                      }`}
                    >
                      {formatClock(rec?.elapsedSec ?? 0)}
                    </span>
                    <span className={SIDE_LABEL}>
                      {rec?.failed ? `실패 ${rec.failed}` : recording ? '녹화 중' : '대기'}
                    </span>
                  </div>
                </>
              ) : !live ? (
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
                      disabled={status === 'starting' || fileBusy}
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
          )}
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
                        {p.result === 'strike' && (
                          <span className="ml-1.5 text-ok">S</span>
                        )}
                        {p.result === 'ball' && (
                          <span className="ml-1.5 text-warn">B</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {zoneLabel(p.zone) ?? '코스 —'}
                        {p.releaseKmh != null && ` · 릴리스 ${speedNum(p.releaseKmh)}`}
                        {p.gunKmh != null && ` · 건 ${speedNum(p.gunKmh)}`}
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
            공을 누르면 구종 · 코스 · 결과 · 스피드건 값을 고쳐요. ▶ 는 그 공의
            영상(세션을 저장하면 같이 올라가요).
          </p>
        </div>
      </BottomSheet>

      {/*
        주의사항 — 설정이 끝나면 카메라 화면 위에 창처럼 뜬다(뒤 화면은 여백에서만 조금 보인다).
        '오늘은 보지 않기'를 누르면 그날은 안 뜬다. 관리자 점프의 '주의사항 창'으로도 연다.
      */}
      <TipsPopup
        open={tipsOpen}
        choices={choices}
        today={today}
        onClose={() => {
          void requestPermission();
          setTipsOpen(false);
        }}
      />

      {/* 공 하나의 영상 클립 — 세션을 저장할 때 같이 올라간다 */}
      <BottomSheet
        open={clipPitch?.clip != null}
        onClose={() => setClipOpen(null)}
        title={clipPitch ? `${pitches.indexOf(clipPitch) + 1}번째 공 · 영상` : '영상'}
      >
        {clipPitch?.clip && (
          <div className="space-y-3">
            <ClipPlayer
              src={clipPitch.clip.url}
              eventSec={clipPitch.clip.eventSec}
              zoneRect={clipPitch.analysis?.zoneRect ?? null}
              zone={clipPitch.zone}
              cameraPos={choices.cameraPos}
              showZone={clipZone}
              autoPlay
            />
            <p className="text-xs leading-relaxed text-muted">
              {formatSpeed(shown(clipPitch.rawKmh), unit)} · 던진 순간{' '}
              {clipPitch.clip.eventSec.toFixed(1)}초 · 길이{' '}
              {clipPitch.clip.durationSec.toFixed(1)}초 · 저장하면 같이 올라가요
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
                value={`${speedNum(editingPitch.rawKmh)} ${speedLabel(unit)}`}
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
            {/* 저장 실패(신호 끊김 등) — 시트가 요약의 오류 줄을 덮으니 여기에도 */}
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-danger-line bg-danger-bg px-4 py-2.5 text-sm leading-relaxed text-danger"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky text-sm font-semibold text-white hover:bg-sky-strong disabled:opacity-50"
            >
              {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {uploading
                ? `클립 올리는 중 ${uploading.done}/${uploading.total}`
                : clipCount > 0
                  ? `저장하고 클립 ${clipCount}개 올리기`
                  : '저장'}
            </button>
            {calibOn && (
              <p className="text-xs leading-relaxed text-warn">
                정확도 보정용 저장이 켜져 있어요 — 이 세션이 구속 측정 관리자에서 보정
                자료로 표시돼요.
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

      {/* 카메라 화질 · 프레임 */}
      <CameraModeSheet
        open={sheet === 'camera'}
        onClose={() => setSheet('none')}
        mode={camMode}
        options={camOptions}
        current={
          camera
            ? {
                width: camera.width,
                height: camera.height,
                /* 카메라가 약속한 값(고른 값과 견줌) · 실제로 들어오는 값(따로 경고) */
                fps: camera.frameRate,
                liveFps: fps,
              }
            : null
        }
        busy={status === 'starting'}
        dual={camera?.label.startsWith('DualCamera') === true}
        dualSkipped={
          dualSkipped != null &&
          camMode != null &&
          dualSkipped.short === camMode.short &&
          dualSkipped.fps === camMode.fps
        }
        locked={
          rec && (rec.phase === 'starting' || rec.phase === 'recording' || rec.phase === 'stopping')
            ? '녹화 중에는 화질 · 프레임을 바꿀 수 없어요 — 녹화를 멈춘 뒤 바꿔요.'
            : null
        }
        onPick={(next) => applyCamMode(next)}
      />

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
              targetDistM,
              autoMode,
              calibSave,
              clipZone,
              wideClip,
            }}
            showChoices={false}
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
              if (patch.targetDistM != null) {
                setTargetDistM(patch.targetDistM);
                persistSetup({ targetDistM: patch.targetDistM });
              }
              if (patch.autoMode != null) {
                setAutoMode(patch.autoMode);
                persistSetup({ autoMode: patch.autoMode });
              }
              if (patch.calibSave != null) {
                setCalibSave(patch.calibSave);
                persistSetup({ calibSave: patch.calibSave });
              }
              if (patch.clipZone != null) {
                setClipZone(patch.clipZone);
                persistSetup({ clipZone: patch.clipZone });
              }
              if (patch.wideClip != null) {
                setWideClip(patch.wideClip);
                persistSetup({ wideClip: patch.wideClip });
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
                  pauseSession();
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
                pauseSession();
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

      <ConfirmDialog
        open={askLeave}
        onClose={() => setAskLeave(false)}
        onConfirm={() => {
          setAskLeave(false);
          router.push('/velocity');
        }}
        title="저장하지 않고 나갈까요?"
        detail={`저장하지 않은 공 ${pitches.length}개가 사라져요. 남기려면 취소하고 '측정 종료'에서 저장하세요.`}
        confirmLabel="저장하지 않고 나가기"
        pending={false}
      />
    </div>
  );
}

/**
 * 지난 설정으로 바로 시작할까 — 저장된 설정을 그림 네 칸으로 보이고, 맨 밑에 [새 설정 | 이 설정으로 시작].
 * 사용자 요청: "전에 사용한 설정을 바로 사용할 수 있도록 하고 하단에 새 설정".
 */
function PreviousSetupStep({
  setup,
  onUse,
  onFresh,
}: {
  setup: VelocitySetup;
  onUse: () => void;
  onFresh: () => void;
}) {
  const when = setup.savedAt ? new Date(setup.savedAt) : null;
  return (
    <StepShell
      step={1}
      total={5}
      title="지난 설정으로 바로 시작할까요?"
      subtitle="같은 자리에서 같은 방식으로 재면 카메라로 바로 가요."
      footer={
        <>
          <PrimaryButton tone="quiet" onClick={onFresh}>
            새 설정
          </PrimaryButton>
          <PrimaryButton onClick={onUse}>
            이 설정으로 시작
            <ChevronRight aria-hidden className="h-4 w-4" />
          </PrimaryButton>
        </>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="px-4 pb-4 pt-4">
          <SetupSummaryRow
            sessionType={setup.sessionType}
            cameraPos={setup.cameraPos}
            net={setup.net}
          />
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-muted">
          스트라이크 존 자리 저장됨 · 소리 안내 {setup.voice ? '켬' : '끔'} · 자동 측정{' '}
          {setup.autoMode ? '켬' : '끔'}
          {when && ` · ${when.getMonth() + 1}월 ${when.getDate()}일에 저장`}
        </p>
      </div>
    </StepShell>
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
