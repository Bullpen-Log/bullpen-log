'use client';

import { SETUP_KEY, loadDistMemory, loadFov, loadSetup, saveDistMemory, saveFov, saveSetup } from '@/lib/velocity-storage';
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
import { buzz, haptic } from '@/lib/haptics';
import { unstable_rethrow, useRouter } from 'next/navigation';
import {
  Activity,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Database,
  Film,
  FlaskConical,
  Focus,
  History,
  Info,
  List,
  Loader2,
  RotateCcw,
  Settings2,
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
import {
  DualCapture,
  DualUnsupportedError,
  type AttemptInfo,
} from '@/lib/velocity-engine/dual-capture';
import {
  MeasureProgress,
  measurePhaseOf,
} from '@/components/velocity/measure-progress';
import { CameraTuner } from '@/components/velocity/camera-tuner';
import {
  dualCameraStatus,
  dualStatusNow,
  isOldApp,
  markDualUnsupported,
  type DualStatus,
} from '@/lib/dual-camera';
import { DEFAULT_CAM_MODE, camModeLabel, fpsGood } from '@/lib/velocity-camera-mode';
import { focalPxFromFov } from '@/lib/velocity-engine/geometry';
import { liveFpsNote, type LiveReport } from '@/lib/velocity-engine/live-meter';
import { readVideoLens, videoFovFor } from '@/lib/velocity-engine/video-lens';
import {
  analysisOf,
  type AnalysisJson,
  distanceMismatch,
} from '@/lib/velocity-analysis';
import { type DistanceReport } from '@/lib/velocity-engine/analyze-distance';
import {
  SESSION_DIST_FULL,
  medianOf,
  TAPE_WARN,
} from '@/lib/velocity-session-distance';
import {
  SegmentedRecorder,
  recordingBitrate,
  type RecorderState,
} from '@/lib/velocity-recorder';
import { DualSessionRecorder } from '@/lib/velocity-dual-recorder';
import { loadPhoneAssetBlob, localVideoAvailable, removePhoneAssets, saveBlobToPhone } from '@/lib/local-video';
import { VELOCITY_ENGINE_VERSION } from '@/lib/velocity-engine/version';
import { reject } from '@/lib/velocity-engine/validate';
import { uploadAttemptClip, uploadClip } from '@/lib/velocity-clip-upload';
import {
  SIZE_OUTLIER_FIX,
  judgeBySession,
  lowConfidenceFix,
  measuredFields,
  sessionDistanceOf,
  sizeOutlier,
  stdCorrection,
  steadied,
  withSessionDistance,
  type SessionPitchCore,
} from '@/lib/velocity-session';
import {
  VelocityTutorial,
  setTutorialHidden,
  useTutorialHidden,
} from '@/components/velocity/tutorial';
import {
  applyCalibration,
  calibrationText,
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
  distanceAutoOf,
  distanceOf,
  DEFAULT_SETUP,
  centerZone,
  defaultZone,
  fitZone,
  frameRectToView,
  viewRectToFrame,
  visibleFrameRect,
  RELEASE_DIST_MAX,
  RELEASE_DIST_MIN,
  setupSummary,
  TARGET_DIST_MAX,
  TARGET_DIST_MIN,
  ZONE_WIDTH_RANGE,
  zoneAspectIn,
  zoneOfPoint,
  type VelocitySetup,
  type ZoneRect,
  STANDARD_TARGET_DIST_M,
  STANDARD_DIST_HINT,
  TAPE_HINT,
} from '@/lib/velocity-setup';
import { useDeviceLevel } from '@/lib/use-device-level';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import { formatSpeed, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { useWakeLock } from '@/components/use-wake-lock';
import { BottomSheet, PitchEditorFields } from '@/components/velocity/pitch-editor';
import {
  DistanceField,
  LevelBubble,
  GuideCard,
  PrimaryButton,
  ZoneOverlay,
  type Choices,
} from '@/components/velocity/setup-steps';
import {
  cameraPosOptions,
  OptionCards,
  sessionTypeOptions,
  SetupSummaryRow,
} from '@/components/velocity/setup-art';
import { isTipsSkippedToday, TipsCard, tipsCount } from '@/components/velocity/tips-popup';
import {
  TAPE_MODES,
  VelocitySettingsFields,
} from '@/components/velocity/velocity-settings';
import { Segmented } from '@/components/segmented';
import { EffortChips } from '@/components/effort-chips';
import { CHIP_BASE, CHIP_ON, SectionLabel, Note } from '@/components/velocity/kit';
import {
  CircleOverlay,
  DEFAULT_CIRCLE,
  LensCalibrationPanel,
  viewToFrame,
  type Circle,
} from '@/components/velocity/lens-calibration';
import { useStoredLens } from '@/components/velocity/velocity-settings';
import {
  clearLens,
  focalPxFor,
  fovDegFromFocal,
  lensMatches,
} from '@/lib/velocity-lens';
import {
  recordVelocityAttempt,
  saveVelocitySession,
  type SaveSessionInput,
  type SavePitchInput,
} from '@/app/actions/velocity';
import {
  clearDraft,
  deleteClip,
  loadClips,
  loadDraft,
  putClip,
  queueUpload,
  retryUploads,
  saveDraft,
} from '@/lib/velocity-draft';
import { SessionDetails, SessionSummary } from '@/components/velocity/session-summary';
import { PitchResult } from '@/components/velocity/pitch-result';
import type { TrailPoint } from '@/components/velocity/clip-player';
import { AdminJump } from '@/components/velocity/admin-jump';
import {
  type SessionPitch,
  type VelocityHistoryItem,
  type VelocityScreenKey,
} from '@/components/velocity/session-types';
import { SessionHistory } from '@/components/velocity/session-history';
import { backTooSoon, previousUrl } from '@/lib/nav-state';
import { useAbsSession } from '@/components/abs/use-abs-session';
import { AbsSetupCard } from '@/components/abs/abs-setup-card';
import { PlateOverlay } from '@/components/abs/plate-overlay';
import { BatterChip } from '@/components/abs/batter-chip';
import { ModeSheet } from '@/components/velocity/mode-sheet';
import { ModeStrip } from '@/components/velocity/mode-strip';
import { LAST_MODE_KEY, allowedMode, modeInfo, parseMode, type CameraMode } from '@/lib/camera-mode';
import { focalPxFromFov as absFocalPxFromFov } from '@/lib/velocity-engine/geometry';

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

export type Step =
  | 'home'
  | 'type'
  | 'camera'
  | 'tips'
  | 'align'
  | 'zone'
  /** ABS(볼 · 스트라이크 자동 판정) 설정 — 존 다음, ABS 를 켰을 때만(components/abs) */
  | 'abs'
  | 'measure'
  | 'lens';

/**
 * 카메라(뷰파인더)가 필요한 단계 — 들어오면 카메라를 켠다. 첫 화면부터 카메라다(2026-10-15 김민: "기본 홈화면을 카메라처럼, 측정 시작을
 * 누르면 그 위로 안내창 · 밑의 촬영 단추는 가리지 않게") — 설정 단계(지난 설정 · 종류 · 카메라 위치 · 주의사항)는 뷰파인더 위 안내창.
 */
const CAMERA_STEPS: ReadonlySet<Step> = new Set<Step>([
  'home',
  'type',
  'camera',
  'tips',
  'align',
  'zone',
  'abs',
  'measure',
  'lens',
]);
/** 측정 전 — 첫 화면과 안내창 단계. 셔터가 앞으로 가기를 맡고 스트라이크 존은 아직 안 그린다 */
const PREP_STEPS: ReadonlySet<Step> = new Set<Step>(['home', 'type', 'camera', 'tips']);

/* 내비게이션 바의 뒤로 — 어느 단계에서 어디로, 무슨 이름으로. 없으면 '투구 기록'(나가기) */
const BACK_OF: Partial<Record<Step, { to: Step; label: string }>> = {
  type: { to: 'home', label: '처음' },
  camera: { to: 'type', label: '종류' },
  align: { to: 'camera', label: '카메라 위치' },
  zone: { to: 'align', label: '수평' },
  abs: { to: 'zone', label: '존' },
  lens: { to: 'measure', label: '측정' },
};
type LocalClip = { url: string; blob: Blob; durationSec: number; eventSec: number };
/** 공의 영상 주소(일반 · 광각)를 푼다 — 저장했거나 화면을 떠날 때 */
/** 카메라 상태 판(관리자)에서 바꿔 기준 밖이 된 까닭의 꼬리 */
const TUNED = '(직접 바꿈)';
/** 기준 조건 밖이라는 알림 한 줄 */
const standardNoteOf = (offStandard: string[]) =>
  `기준 조건이 아니에요(${offStandard.join(' · ')}). 다른 폰과 값이 다를 수 있어요.`;

/** 어느 카메라로 재나 — 웹 카메라 · 앱 카메라(일반 하나) */
type CameraPlan = 'web' | 'app';

/**
 * 앱이면 앱 카메라(사용자 2026-10-08: "웹카메라가 아닌 앱 자체의 카메라로" — 손떨림 보정을 켤 수 있다). 광각은 같이 찍지 않는다
 * (사용자 2026-10-08 — 광각과 함께면 측정 카메라가 720p 로 떨어진다. 설정 '광각 영상도 같이 저장'을 없앴다). 옛 앱(single 모름)은
 * 일반 하나로 못 켜서 웹 카메라. 엔진 개발용 녹화는 웹 카메라의 영상 흐름을 찍으므로 웹 카메라. 상태를 아직 모르면 웹 카메라로
 * 본다(켤 때는 기다렸다 고른다).
 */
function cameraPlan(
  native: boolean,
  recordMode: boolean,
  s: DualStatus | null
): CameraPlan {
  if (!native || recordMode || !s) return 'web';
  return s.single ? 'app' : 'web';
}

/** 세션의 측정 맥락 — 저장 입력 가운데 화면이 정하는 칸들(폰에 맡긴 세션을 카메라 없이 저장할 때도 그때 값으로) */
type SessionContext = Pick<
  SaveSessionInput,
  | 'fovDeg'
  | 'source'
  | 'device'
  | 'cameraPos'
  | 'net'
  | 'forCalibration'
  | 'autoMode'
  | 'focalPx'
  | 'lensCal'
  | 'releaseDistM'
  | 'distanceM'
  | 'distanceSource'
  | 'useCal'
  | 'frameW'
  | 'frameH'
>;
/** 폰에 맡기는 공 — 영상(따로 담는다) · 이번 카메라의 결과 번호(다시 켜면 겹친다)는 빼고 */
type DraftPitch = Omit<LocalPitch, 'clip' | 'captureId'>;
const toDraftPitch = (p: LocalPitch): DraftPitch => {
  const rest: Partial<LocalPitch> = { ...p };
  delete rest.clip;
  delete rest.captureId;
  return rest as DraftPitch;
};
const revokeClips = (p: { clip?: LocalClip }) => {
  if (p.clip) URL.revokeObjectURL(p.clip.url);
};
type LocalPitch = SavePitchInput & Pick<SessionPitchCore, 'dist' | 'auto' | 'std'> & {
  id: number;
  /** 엔진이 본 자료 — 잰 순간의 스트라이크 존(zoneRect)도 실려 영상에 겹쳐 그린다 */
  analysis?: AnalysisJson | null;
  source: 'camera' | 'file';
  /** LiveCapture 결과 번호 — 뒤에 오는 영상 클립과 짝 */
  captureId?: number;
  clip?: LocalClip;
  /** 관리자 점프 도구가 넣은 예시 공 — 화면 확인용, 저장은 막는다 */
  sample?: boolean;
  /** 카메라 실시간의 촬영 조건 알림(초당 장면 · 잘린 화면 · 짐작한 화각 · 번짐 …) — 화면에만 보인다 */
  notes?: string[];
  /** 결과 화면이 영상에 맞춰 따라 그릴 공 길(장면 비율, t 는 궤적 시각) — 화면에만 */
  trail?: TrailPoint[] | null;
  /** 클립의 eventSec 에 해당하는 궤적 시각(ResultMeta.hitT) — 클립 시각 = eventSec + (t − hitT) */
  hitT?: number | null;
  /** 결과 화면이 영상 속 공으로 맞춘 클립 시각 − 궤적 시각 — 저장할 때 공 길을 클립 시각으로 남긴다 */
  clipOffset?: number | null;
};
/**
 * 저장할 분석에 결과 화면의 공 길을 싣는다 — [클립 시각, x, y, 지름](장면 비율, 160점까지). 결과 화면이 영상 속 공으로 맞췄으면
 * 그 시각(trailAligned), 아니면 클립의 eventSec 로 어림한 시각. 저장한 공을 목록에서 '잰 직후처럼' 다시 볼 때 쓴다.
 */
function withTrail(p: LocalPitch): AnalysisJson | null {
  if (!p.analysis) return null;
  const t = p.trail;
  if (!t || t.length < 2 || (!p.clip && p.source !== 'file')) return p.analysis;
  const off = p.clipOffset ?? (p.clip ? p.clip.eventSec - (p.hitT ?? t[0].t) : 0);
  const every = Math.max(1, Math.ceil(t.length / 160));
  const r = (v: number, k: number) => Math.round(v * k) / k;
  return {
    ...p.analysis,
    trail: t
      .filter((_, i) => i % every === 0 || i === t.length - 1)
      .map((q) => [r(q.t + off, 1e4), r(q.x, 1e5), r(q.y, 1e5), r(q.d, 1e5)]),
    trailAligned: p.clipOffset != null || p.source === 'file',
  };
}
/** 넣은 거리와 공 크기로 본 거리가 이만큼(비율) 넘게 다르면 알린다 — 공 크기 어림의 흩어짐 2.5%, 화각 짐작이면 8% 안팎 */
const DIST_MISMATCH = 0.12;
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

/** 앱 카메라의 셔터 · ISO 를 세션 기기 글에 — ' · 셔터 1/500 ISO 320'(2.4.2) */
const exposureText = (e: { shutterSec: number | null; iso: number | null } | null) =>
  e?.shutterSec
    ? ` · 셔터 1/${Math.round(1 / e.shutterSec)}${e.iso ? ` ISO ${Math.round(e.iso)}` : ''}`
    : '';

/** 못 잰 공의 머리말 — 믿음이 모자라 버린 공은 '측정 불가' */
function rejectTitle(r: ScreenResult): string {
  if (!r.measure.ok && r.measure.code === 'LOW_CONFIDENCE') return '측정 불가';
  return r.live?.ball?.strong ? '공은 봤는데 못 쟀어요' : '재지 않았어요';
}

/* 관리자 점프의 '예시 공' — 화면(세션 · 요약 · 이전 공)을 자료 없이도 확인할 수 있게 */
const SAMPLE_PITCHES: { kmh: number; type: string; zone: number; result: string }[] = [
  { kmh: 128.4, type: 'fastball', zone: 5, result: 'strike' },
  { kmh: 131.2, type: 'fastball', zone: 2, result: 'ball' },
  { kmh: 112.7, type: 'slider', zone: 9, result: 'strike' },
  { kmh: 118.9, type: 'changeup', zone: 8, result: 'strike' },
];

/* 카메라 앱 모양의 단추 — 위 줄 동그라미 · 아래 보조 단추 · 라벨 */
/* 카메라 위 둥근 단추 — 누르는 크기 44px(체크인 · 탭 카드의 칩과 같은 규격) */
const CHROME_BTN =
  'inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60 disabled:opacity-40';
/* 정보 판(거의 검정) 위의 위 줄 단추 — 옅은 흰 바탕이라야 단추로 보인다 */
const CHROME_BTN_ON_PANEL = CHROME_BTN.replace('bg-black/45', 'bg-white/10').replace(
  'hover:bg-black/60',
  'hover:bg-white/15'
);
/* 셔터 옆 둥근 단추 — 위아래 14px 로 셔터(76px) 가운데에 맞추고, 밑 글자도 셔터 글자와 같은 높이(2026-10-15 김민: "셔터와 수평으로") */
const SIDE_BTN =
  'my-3.5 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors active:bg-white/25 disabled:opacity-40';
const SIDE_LABEL = 'mt-1 text-caption font-medium text-white/80';
/* 카메라 위 알림 창 — 안내창(GuideCard)과 같은 흰 창 모양(2026-10-15 김민: "안내 문구는 전부 카메라 위에 창처럼") */
const NOTE_WIN =
  'rounded-2xl bg-page/95 px-4 py-3 text-sm leading-snug text-ink shadow-lg backdrop-blur motion-safe:animate-fade-in';

/** 녹화 시간 — 분:초(한 시간이 넘으면 시:분:초) */
/** '2026-10-15' → '10월 15일' */
const monthDay = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  return m && d ? `${m}월 ${d}일` : date;
};

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
  settling: '가만히 · 배경 잡는 중',
  armed: '던져요',
  capturing: '영상 담는 중…',
  analyzing: '구속 계산 중…',
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
/** 지난 번 고른 카메라 모드(lib/camera-mode.ts) — 모드 시트가 먼저 골라 두는 것 */
const readLastMode = () => {
  try {
    return localStorage.getItem(LAST_MODE_KEY);
  } catch {
    return null;
  }
};

export function VelocityScreen({
  isAdmin,
  canAbs = isAdmin,
  canRecord = isAdmin,
  native,
  today,
  calibration,
  history = [],
  initialStep = 'home',
  resume = false,
  absMode = false,
}: {
  /** /abs 딥링크 — ABS 모드로 바로 열고(모드 시트 없이) 제목 · 셔터 글이 '판정'. 흐름 · 엔진은 구속 측정 그대로(lib/camera-mode.ts) */
  absMode?: boolean;
  /** 대표관리자 — 보정 · 카메라 진단 · 관리자 도구 */
  isAdmin: boolean;
  /** ABS 모드 · 세션 녹화 — 대표 · 준관리자(lib/permissions.ts, 2026-10-20) */
  canAbs?: boolean;
  canRecord?: boolean;
  native: boolean;
  today: string;
  /** 서버가 그 사람의 스피드건 짝으로 맞춘 보정식 */
  calibration: CalFit;
  /** 프로필의 던지는 손 — 회전축 그림을 뺀 뒤(엔진 2.0, 사용자 2026-10-06) 쓰지 않는다. 부르는 쪽 호환으로만 남긴다 */
  throwingHand?: string | null;
  /** 지난 세션들(날짜 · createdAt 오름차순) — 첫 화면 왼쪽 아래 기록 단추 · 기록 시트 */
  history?: VelocityHistoryItem[];
  /** 처음 보일 단계 — 미리보기 · 시험용. 보통은 첫 화면(카메라) */
  initialStep?: Step;
  /** 구속 측정 첫 화면의 '저장하지 않은 공 이어서 하기' — 폰에 맡겨 둔 공을 되살려 세션 요약부터 연다 */
  resume?: boolean;
}) {
  const router = useRouter();
  const unit = useSpeedUnit();
  const videoRef = useRef<HTMLVideoElement>(null);
  const finderRef = useRef<HTMLDivElement>(null);
  /* 세션 중 정보 판 · 뷰파인더 위 둘째 줄(수평계 · 카메라 정보) — 판 전환을 곧바로 · 존이 둘째 줄 밑으로 못 가게 */
  /* 세션 중 옆으로 넘기는 두 쪽 — 왼쪽 카메라, 오른쪽 이번 세션(정보 판) */
  const pagerRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  /* 웹 카메라(LiveCapture) 또는 앱의 일반 · 광각 동시 촬영(DualCapture — 앱 + 설정 '광각 영상도 같이 저장') */
  const captureRef = useRef<LiveCapture | DualCapture | null>(null);
  /* 카메라를 켠 차례 — 결과 · 클립 번호를 켤 때마다 가른다(startCamera) */
  const captureGenRef = useRef(0);
  /* 공이 된 결과 번호 · 결과보다 먼저 온 클립(attachClipToPitch) — 이벤트 안에서만 만진다 */
  const acceptedIdsRef = useRef(new Set<number>());
  const earlyClipsRef = useRef(new Map<number, { clip: PitchClip; at: number }>());
  /* 시도 기록이 아직 안 보낸 알림(결과 번호 → 시도) — 화면이 결과를 버리면(측정 불가) 그 까닭을 싣는다(dropAttempt · recordAttempt) */
  const pendingAttemptsRef = useRef(new Map<number, AttemptInfo>());
  const dropAttempt = (id: number | undefined, why: string) => {
    if (id == null) return;
    const a = pendingAttemptsRef.current.get(id);
    if (a)
      pendingAttemptsRef.current.set(id, {
        ...a,
        ok: false,
        code: 'LOW_CONFIDENCE',
        why,
      });
  };
  /*
   * 카메라를 켤 때 넣는 설정의 최신 값 — 아래 useLayoutEffect 가 그릴 때마다 맞춘다. continueToCamera 는 누르기 전 그림의
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
    /* 거리를 공 크기로 어림하나(distanceAutoOf) — 그러면 distanceM 은 첫 어림 */
    distanceAuto: DEFAULT_SETUP.distAuto,
    autoMode: DEFAULT_SETUP.autoMode,
    recordMode: false,
    /* 초점 자리 — 스트라이크 존 가운데(장면 0~1). 앱 카메라가 그 먼 곳에 맞춘다 */
    focusAt: { x: 0.5, y: 0.5 },
  });
  /* 카메라를 저절로 켠 단계 — 한 단계에 한 번만(아래 안전장치 효과) */
  const autoStartedFor = useRef<Step | null>(null);
  /* 지금 카메라를 켤 때의 공 방향(멀어지는 · 다가오는) — 카메라 위치를 바꾸면 줌 · 엔진 방향이 달라 다시 켠다(continueToCamera) */
  const startedApproachRef = useRef<string | null>(null);
  const pitchesRef = useRef<LocalPitch[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── 설정 단계 ── */
  const storedRaw = useSyncExternalStore(subscribeStorage, readSetupRaw, () => null);
  const stored = useMemo(() => (storedRaw ? loadSetup() : null), [storedRaw]);
  const [decided, setDecided] = useState(initialStep !== 'type' && initialStep !== 'home');
  const [step, setStep] = useState<Step>(initialStep);
  /*
   * 카메라 모드(구속 측정 · ABS 판정, docs/designs/camera-modes.md) — 열리면 첫 화면 위 모드 시트에서 고른다(지난 번 모드가 먼저 골라짐).
   * /abs 딥링크 · 미리보기 단계로 열면 시트 없이. 띠(셔터 위)로 바꾸면 카메라는 그대로.
   */
  const lastModeRaw = useSyncExternalStore(subscribeStorage, readLastMode, () => null);
  const [modeChosen, setModeChosen] = useState<CameraMode | null>(absMode ? 'abs' : null);
  const mode: CameraMode = modeChosen ?? allowedMode(parseMode(lastModeRaw), canAbs);
  const [modePicked, setModePicked] = useState(absMode || initialStep !== 'home');
  const modeMeta = modeInfo(mode);
  const setMode = (next: CameraMode) => {
    setModeChosen(next);
    try {
      window.localStorage.setItem(LAST_MODE_KEY, next);
    } catch {
      /* 저장소 없음 */
    }
  };
  const [choices, setChoices] = useState<Choices>({
    cameraPos: DEFAULT_SETUP.cameraPos,
    net: DEFAULT_SETUP.net,
  });
  const [zone, setZone] = useState<ZoneRect>(DEFAULT_SETUP.zone);
  const [voice, setVoice] = useState(false);
  const [releaseDistM, setReleaseDistM] = useState(DEFAULT_SETUP.releaseDistM);
  const [targetDistM, setTargetDistM] = useState(DEFAULT_SETUP.targetDistM);
  const [distAuto, setDistAuto] = useState(DEFAULT_SETUP.distAuto);
  /* 줄자로 잰 거리를 넣었다 — 세션 거리 보정 없이 그 값으로(엔진 2.4 1단계) */
  const [distTape, setDistTape] = useState(DEFAULT_SETUP.distTape);
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
      last: r.measure.ok
        ? `${r.measure.kmh.toFixed(1)}km/h · 궤적 ${r.track.length}장`
        : `${r.measure.code} · 궤적 ${r.track.length}장`,
    }));
  });
  /* 녹화기 · 그 상태(찍는 시간 · 조각 · 올림) — 녹화 중이 아니면 null */
  const recorderRef = useRef<SegmentedRecorder | null>(null);
  /*
   * 세션 통째 녹화(관리자 · 앱 카메라, 엔진 2.7) — 측정 시작 왼쪽 위 '세션 녹화' 단추로 켜고(2026-10-17 사용자: "시작하기 전에 옆에 따로
   * 켜기 버튼"), 측정 시작에 녹화를 시작해 종료 · 저장 · 나가기에 끈다. 1분에 100MB 남짓이라 기억하지 않는다 — 화면을 열 때마다 꺼진 채.
   */
  const sessionRecRef = useRef<DualSessionRecorder | null>(null);
  const [sessionRecWanted, setSessionRecWanted] = useState(false);
  const [rec, setRec] = useState<RecorderState | null>(null);
  const recording =
    rec != null &&
    (rec.phase === 'starting' || rec.phase === 'recording' || rec.phase === 'stopping');
  /* 저장된 공 영상에 스트라이크 존을 겹쳐 그릴까(설정) */
  const [clipZone, setClipZone] = useState(DEFAULT_SETUP.clipZone);
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
  useEffect(
    () => () => {
      if (fileReplay) URL.revokeObjectURL(fileReplay);
    },
    [fileReplay]
  );
  /*
   * 주의사항 안내창 — 설정이 끝나면 카메라 위에 뜬다('오늘은 보지 않기'면 그날은 건너뜀). 몇 번째 장 · 다 보면 갈 단계(수평 · 첫 화면) ·
   * 위 줄 ‹ 로 돌아갈 단계
   */
  const [tipIndex, setTipIndex] = useState(0);
  const [tipsReturn, setTipsReturn] = useState<Step>('align');
  const [tipsBack, setTipsBack] = useState<Step>('home');
  /* 목록에서 고른 공의 결과 화면('잰 직후처럼') */
  const [viewPitch, setViewPitch] = useState<number | null>(null);
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
  /* 지난 설정 묻기 — 첫 화면에서 셔터를 누르면 종류 단계 자리에 뜬다 */
  const showAsk = stored != null && !decided && step === 'type';
  const approach = approachOf(choices);

  /* ── 카메라 · 측정 ── */
  const [status, setStatus] = useState<LiveStatus>('off');
  /* 던짐을 알아챌 때마다 1씩 — 진행 표시의 담기 막대를 처음부터(measure-progress.tsx) */
  const [captureRun, setCaptureRun] = useState(0);
  /* 지금 앱 카메라(DualCapture)로 재나 — 결과가 늦게 와서 진행 막대를 길게 · 카메라 상태 판이 이것을 만진다 */
  const [appCapture, setAppCapture] = useState<DualCapture | null>(null);
  const appCamera = appCapture != null;
  /* 카메라 상태 판(오른쪽 위 카메라 정보 알약을 누름) — 앱 카메라일 때만 */
  const [tunerOpen, setTunerOpen] = useState(false);
  const onCaptureStatus = (s: LiveStatus) => {
    if (s === 'capturing') setCaptureRun((n) => n + 1);
    setStatus(s);
  };
  const [camera, setCamera] = useState<CameraInfo | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  /* 앱 카메라의 지금 셔터 · ISO(1초마다 fps 알림에 실려 옴, 2.4.2) — 세션 기기 글에 남긴다 */
  const [exposure, setExposure] = useState<{
    shutterSec: number | null;
    iso: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ScreenResult | null>(null);
  const [pitches, setPitches] = useState<LocalPitch[]>([]);
  /* 폰에 맡겨 둔 세션을 되살렸으면 그 세션의 날짜 · 측정 맥락(카메라를 다시 켜기 전에 저장해도 그때 값으로) */
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [draftMeta, setDraftMeta] = useState<SessionContext | null>(null);
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
      distanceM: distanceOf({
        cameraPos: choices.cameraPos,
        targetDistM,
        releaseDistM,
      }),
      distanceAuto: distanceAutoOf({ cameraPos: choices.cameraPos, distAuto }),
      autoMode,
      recordMode: recOn,
      focusAt: cameraSettingsRef.current.focusAt,
    };
    liveRef.current = live;
  });
  /* 이 아이폰이 앱 카메라로 잴 수 있나 — 미리 물어 둔다(카메라 켜기가 기다리지 않게) */
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
  /* 가운데는 늘 릴리스 표적 바로 밑(ZONE_CENTER) — 사용자는 크기만 바꾼다 */
  const activeZone = fitZone(
    centerZone(zone),
    choices.cameraPos,
    frameSize ?? undefined,
    step === 'zone' ? visible : undefined
  );
  /* 존을 옮기면 앱 카메라의 초점 자리도 그리로(존 가운데 = 공이 그물 · 미트에 닿는 먼 곳). 0.02 칸 단위로만 — 끄는 동안 쉬지 않게 */
  const focusX = Math.round((activeZone.x + activeZone.w / 2) * 50) / 50;
  const focusY = Math.round((activeZone.y + activeZone.h / 2) * 50) / 50;
  useLayoutEffect(() => {
    cameraSettingsRef.current.focusAt = { x: focusX, y: focusY };
  }, [focusX, focusY]);
  useEffect(() => {
    const capture = captureRef.current;
    if (capture instanceof DualCapture) capture.setFocusPoint({ x: focusX, y: focusY });
  }, [focusX, focusY, camera]);
  /* 렌즈 보정(앱 카메라) — 1~2m 앞 공에 초점을 맞춘다('먼 곳만'을 풀고 원 가운데로). 나가면 존 가운데 · 원래 거리로 */
  const lensFocusX = Math.round(circle.x * 20) / 20;
  const lensFocusY = Math.round(circle.y * 20) / 20;
  useEffect(() => {
    const view = finderRef.current?.getBoundingClientRect();
    if (step !== 'lens' || !appCapture || !camera || !view) return;
    const f = viewToFrame({ x: lensFocusX, y: lensFocusY, d: 0 }, camera, view);
    appCapture.focusNear({ x: f.cx / camera.width, y: f.cy / camera.height });
    return () => appCapture.focusNear(null);
  }, [step, appCapture, camera, lensFocusX, lensFocusY]);
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
  /* 마지막 숙임을 상태로도(ABS 보정 — 수평계가 꺼진 세션 중에도 그 값을 쓴다) */
  const [absTilt, setAbsTilt] = useState<number | null>(null);
  useEffect(() => {
    if (level.pitch == null) return;
    const tilt = (-level.pitch * Math.PI) / 180;
    if (tiltRef.current != null && Math.abs(tiltRef.current - tilt) < 1e-6) return;
    tiltRef.current = tilt;
    setAbsTilt(tilt);
    captureRef.current?.setTilt(tilt);
  }, [level.pitch]);
  /*
   * ABS(볼 · 스트라이크 자동 판정, 관리자 · 투수 뒤) — 설정 · 플레이트 보정 · 판정은 components/abs/use-abs-session.ts. 엔진 결과가 올 때(addResult)
   * judge() 로 analysis.abs 를 만들고 코스 · 결과를 채운다. 초점거리는 세션 저장 입력(focalPx)과 같은 셈.
   */
  const abs = useAbsSession({
    enabled: canAbs,
    camera: camera ? { width: camera.width, height: camera.height } : null,
    focalPx: camera
      ? focalRatio
        ? focalRatio * Math.max(camera.width, camera.height)
        : absFocalPxFromFov(Math.max(camera.width, camera.height), fov)
      : null,
    tiltRad: level.pitch != null ? (-level.pitch * Math.PI) / 180 : absTilt,
    rollRad: level.roll != null ? (level.roll * Math.PI) / 180 : null,
    zoneRect: zone,
    detecting: step === 'abs',
    live: step === 'measure' && live,
    snapshot: () => captureRef.current?.snapshot() ?? null,
  });
  /* ABS 켬 · 끔은 모드가 정한다(저장된 설정값은 모드 아래) — 설정을 읽은 뒤 한 박자 뒤 */
  const absSetOn = abs.setOn;
  useEffect(() => {
    const t = setTimeout(() => absSetOn(mode === 'abs'), 50);
    return () => clearTimeout(t);
  }, [mode, absSetOn]);
  const fit = calibration;
  const shown = (raw: number) =>
    useCal && fit.n > 0 ? applyCalibration(raw, fit) : raw;

  const [sheet, setSheet] = useState<'none' | 'settings' | 'save' | 'pitch' | 'history'>(
    'none'
  );
  const [editing, setEditing] = useState<number | null>(null);
  /* 어떤 투구인가 — 첫 설정 단계에서 고르고, 저장할 때 투구 기록의 종류가 된다(저장 시트에서도 바꿀 수 있다) */
  const [sessionType, setSessionType] = useState<string>(DEFAULT_SETUP.sessionType);
  /*
   * 투구 기록의 체감 강도(%) — 저장 시트에서 고른다(2판 D2). 투구 기록 입력 폼과 같이 기본값을 두지 않는다: 예전 막대는 7 에서
   * 시작해 손대지 않은 7 이 그대로 휴식일 · 세게 던진 날 셈에 들어갔다. 안 고르고 저장하면 시트 안에 한 줄로 막는다.
   */
  const [effortPct, setEffortPct] = useState<number | null>(null);
  const [effortMissing, setEffortMissing] = useState(false);
  const [saving, startSaving] = useTransition();
  /* 저장한 세션의 날짜 — '기록 남기기' 링크가 그날로(되살린 세션은 오늘이 아닐 수 있다). 없으면 null */
  const [saved, setSaved] = useState<string | null>(null);
  /* 저장하지 않은 공이 있을 때 나가기 — 묻는 창(앱의 영어 시스템 창 대신) */
  /* 'home' = 닫기(첫 화면으로) · 'exit' = 구속 측정을 떠남(위 줄 ✕) */
  const [askLeave, setAskLeave] = useState<false | 'home' | 'exit'>(false);
  const [askClear, setAskClear] = useState(false);
  /* 결과 화면의 '스피드건 값 넣기'로 공 시트를 열었다 — 스피드건 칸부터 */
  const [focusGun, setFocusGun] = useState(false);

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
      sessionRecRef.current?.abort();
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
      distAuto,
      distTape,
      autoMode,
      calibSave,
      clipZone,
      recordMode,
      diagHud,
      ...patch,
    });
  };

  const addResult = (
    raw: ScreenResult,
    source: LocalPitch['source'],
    meta?: ResultMeta
  ) => {
    const result = judgeBySession(raw, pitches, source, distTape);
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
    /*
     * 믿음 '높음'이 아닌 공은 기록하지 않고 '측정 불가'로 알린다(2026-10-13 김민: "믿음 높은 것만 측정하고 제대로 인식하지 못한 것은
     * 측정 불가 안내"). 10-12 밖 22구에서 믿음 낮은 공 둘이 스피드건과 17 · 22km/h 갈렸다 — 틀린 값을 보이느니 다시 던지게 한다.
     */
    /*
     * 관리자가 '정확도 보정용 저장'을 켰으면 버리지 않고 기록한다(믿음은 그대로 남고 알림이 붙는다) — 줄자 거리 · 조건을 바꿔 찍는
     * 엔진 시험에서 낮음 공의 클립까지 있어야 까닭을 본다. 보정식은 어차피 '높음' 짝만 쓴다(loadCalibration).
     */
    /* 흔들림을 바로잡아 잰 공(손에 든 폰)은 '보통'이어도 기록한다 — 2026-10-14 사용자, 표시가 붙는다(steadied) */
    if (result.measure.confidence !== 'high' && !steadied(result) && !calibOn) {
      setLast({
        ...result,
        measure: {
          ok: false,
          ...reject('LOW_CONFIDENCE'),
          fix: lowConfidenceFix(result, source, approach === 'approaching', distTape),
        },
      });
      dropAttempt(meta?.id, 'low-confidence');
      speak('측정 불가');
      return;
    }
    /* 같은 세션의 공 크기 거리에서 튄 공 — 끝을 잘못 잡았다(lib/velocity-session.ts sizeOutlier) */
    if (!calibOn && sizeOutlier(result, pitches, source)) {
      setLast({
        ...result,
        measure: { ok: false, ...reject('LOW_CONFIDENCE'), fix: SIZE_OUTLIER_FIX },
      });
      dropAttempt(meta?.id, 'session-size');
      speak('측정 불가');
      return;
    }
    setLast(result);
    const m = result.measure;
    /*
     * 거리 — 공 크기로 어림하라 했는데 못 했으면(공이 덜 잡힘) 그 까닭을, 넣은 거리가 공 크기로 본 거리와 많이 다르면 다시 재 보라고
     * 알린다(사용자 2026-10-07: 기본 20m 그대로 재 실제 22.5m 와 12% 갈렸다).
     */
    const dist = (result as { distance?: DistanceReport }).distance ?? null;
    const distNotes: string[] = [];
    const mismatch = dist ? distanceMismatch({ distance: dist }) : null;
    const bySession = dist?.sizeRefM != null && dist.sizeRefM !== dist.inputDistM;
    if (
      dist &&
      distanceAutoOf({ cameraPos: choices.cameraPos, distAuto }) &&
      dist.distanceSource === 'input'
    )
      distNotes.push(
        `공이 덜 잡혀 거리를 어림하지 못했어요. ${dist.distanceM}m로 쟀어요.`
      );
    else if (mismatch)
      distNotes.push(
        `공을 미트까지 따라가지 못한 것 같아요(${bySession ? '세션 거리' : '넣은 거리'} ${mismatch.input}m · 공 크기로 본 거리 ${mismatch.size}m). 값이 틀릴 수 있어 최고 · 평균에서 뺐어요.`
      );
    /* 세션 거리로 다시 판정한 공은 그 거리와 견준다 — 세션 거리 알림이 이미 거리를 말했다 */
    else if (
      dist &&
      dist.distanceSource === 'input' &&
      dist.sizeDistM != null &&
      Math.abs(dist.sizeDistM / (dist.sizeRefM ?? dist.inputDistM) - 1) > DIST_MISMATCH
    )
      distNotes.push(
        `${bySession ? '세션 거리' : '넣은 거리'} ${dist.sizeRefM ?? dist.inputDistM}m와 공 크기로 본 거리 ${dist.sizeDistM}m가 달라요. 줄자로 다시 재 보세요.`
      );

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
    /* ABS — 보정이 있고 궤적 스냅샷이 있으면 판정(components/abs). 코스는 짐작 대신 판정 칸, 결과는 S/B */
    const absJudged =
      source === 'camera' && 'distance' in result && result.distance
        ? abs.judge({
            distance: result.distance as DistanceReport,
            track: result.track,
            analyzeSize: result.analyzeSize,
            sourceSize: result.sourceSize,
          })
        : null;
    const added: Omit<LocalPitch, 'id'> = {
      source,
      clip: earlyClip,
      ...measuredFields(result, distAuto),
      analysis: {
        ...analysisOf(result, approach),
        abs: absJudged,
        /* 클립은 카메라 장면 그대로라 이 존을 영상 위에 그대로 얹는다. 영상 파일은 장면이 달라 싣지 않는다 */
        zoneRect: source === 'camera' ? activeZone : null,
        /* 기준 조건 밖에서 잰 공 — 다른 폰 · 다른 조건의 값과 견줄 때 가른다 */
        offStandard:
          source === 'camera'
            ? [
                ...(camera?.offStandard ?? []),
                /* 실제로 받은 장면 수가 낮았다(처리가 밀려 장면을 버림) */
                ...(liveFpsNote(fps) ? [`초당 ${fps}장`] : []),
              ]
            : [],
      },
      autoDetected: source === 'camera' ? autoMode : false,
      captureId: meta?.id,
      notes: [
        ...(source === 'camera' && camera?.offStandard?.length
          ? [standardNoteOf(camera.offStandard)]
          : []),
        ...distNotes,
        /* 조용할 때 훑기가 찾은 공(엔진 2.7) — 알림이 없어 지난 영상을 훑어 뒤늦게 잰 것 */
        ...(meta?.late ? ['뒤늦게 찾은 공이에요. 알림이 없어 지난 영상을 훑어 쟀어요.'] : []),
        ...(steadied(result)
          ? ['폰이 흔들려 바로잡아 잰 값이에요. 고정한 폰보다 조금 덜 정확할 수 있어요.']
          : m.confidence !== 'high'
            ? ['보정용 저장이라 기록했어요. 보통 측정이면 측정 불가로 빠지는 공이에요.']
            : []),
        ...(result.live?.notes.map((note) => note.text) ?? []),
        ...(source === 'file'
          ? ((result as { video?: { notes: string[] } }).video?.notes ?? [])
          : []),
      ],
      trail: trailOf(result),
      hitT: meta?.hitT ?? null,
      ...EMPTY_EDIT,
      zone: absJudged?.verdict ? absJudged.verdict.cell : guessedZone,
      result: absJudged?.verdict?.call ?? null,
    };
    const memory = loadDistMemory();
    setPitches((prev) =>
      withSessionDistance(
        [...prev, { ...added, id: nextPitchId(prev) }],
        memory,
        distTape
      )
    );
    setSaved(null);
    setResultOpen(true);
    /* 앱(아이폰)에서도 떨린다 — 아이폰 알림 떨림(성공), 웹은 짧은 진동(lib/haptics.ts) */
    haptic('success');
    /* 읽어 주는 값도 세션 거리로 옮긴 값 */
    const spoken =
      withSessionDistance([...pitches, { ...added, id: -1 }], memory, distTape).at(-1)
        ?.rawKmh ?? m.kmh;
    speak(`${Math.round(toSpeed(shown(spoken), unit))}`);
  };
  useEffect(() => {
    addResultRef.current = addResult;
  });

  const startCamera = async () => {
    const video = videoRef.current;
    /*
     * 뷰파인더(<video>)는 카메라 단계(수평 · 존 · 측정 · 렌즈)에서만 그려진다. 단계를 바꾸는 누름 안에서 부를 때는
     * flushSync 로 먼저 그린 뒤 부른다(continueToCamera) — 예전에는 그리기 전에 불려 여기서 조용히 끝나, 카메라가
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
     * 앱이면 앱 카메라로 잰다(cameraPlan — 새 앱은 늘, 옛 앱은 광각 설정을 켰을 때만). 웹 카메라는 켜지 않는다(같은 카메라를
     * 둘이 못 쓴다). 결과는 던진 뒤 2~4초에 온다(앱이 자른 클립을 영상 파일 엔진으로 잰다). 기기 검사는 화면을 열 때 미리 해
     * 둔다 — 아직이면 기다린다(앱 길만. 웹 카메라는 누름에 바로 붙여 켠다).
     */
    let plan: CameraPlan = 'web';
    if (native && !now.recordMode && finder) {
      const s = dualStatusNow() ?? (await dualCameraStatus());
      if (gen !== captureGenRef.current) return;
      plan = cameraPlan(native, now.recordMode, s);
    }
    const capture =
      plan !== 'web' && finder
        ? new DualCapture(
            finder,
            {
              onStatus: onCaptureStatus,
              onResult: (r, meta) => {
                noteDiagRef.current(r);
                addResultRef.current(r, 'camera', { ...meta, id: idBase + meta.id });
              },
              onClip: (id, clip) => attachClipRef.current(idBase + id, clip),
              onError: setError,
              onNotice: setToast,
              onFps: (f, _low, e) => {
                setFps(Math.round(f));
                if (e?.shutterSec) setExposure(e);
              },
              onAttempt: (a) => attemptRef.current({ ...a, id: idBase + a.id }),
            },
            now.fov,
            now.approach,
            now.net
          )
        : new LiveCapture(
            video,
            {
              onStatus: onCaptureStatus,
              onResult: (r, meta) => {
                noteDiagRef.current(r);
                addResultRef.current(
                  r,
                  'camera',
                  meta && { ...meta, id: idBase + meta.id }
                );
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
    if (capture instanceof DualCapture) capture.setFocusPoint(now.focusAt);
    startedApproachRef.current = now.approach;
    setAppCapture(capture instanceof DualCapture ? capture : null);
    capture.setFocalPerLongSide(now.focalRatio);
    capture.setReleaseDistance(
      now.approach === 'approaching' ? now.releaseDistM : null
    );
    /* 엔진 2.0 — 거리 자 · 숙임(폰 기울기). 켜기 전에 넣어야 카메라에 2배 줌을 청한다 */
    capture.setDistance(now.distanceM, tiltRef.current, now.distanceAuto);
    capture.setManual(!now.autoMode);
    /* 엔진 개발용 녹화 중에는 공마다 클립 녹화기를 끈다 — 긴 녹화와 녹화기 셋이 겹치면 장면이 밀린다 */
    capture.setClips(!now.recordMode);
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
      checkCamMode(info);
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
        /* 앱 카메라로 못 켰다(60fps 를 못 냄 등) — 기억해 두고 웹 카메라로 다시 켠다. 측정은 끊기지 않는다 */
        markDualUnsupported(e.reason, true);
        if (captureRef.current === capture) captureRef.current = null;
        setToast('앱 카메라를 켜지 못해 웹 카메라로 재요');
        void startCamera();
        return;
      }
      const message = e instanceof Error ? e.message : '카메라를 켜지 못했어요.';
      /*
       * 앱에는 주소창이 없다 — 앱에서 막혔으면 아이폰이 카메라를 거절한 것이고, 아이폰은 앱 안에서 다시 묻지 않는다.
       * 엔진의 거절 문구('허용해 주세요 … 자물쇠')를 앱에서는 설정 길로 바꾼다.
       */
      setError(
        native && message.includes('허용')
          ? '카메라가 꺼져 있어요. 아이폰 설정 › 싱커(불펜로그) › 카메라를 켠 뒤 다시 켜 주세요.'
          : message
      );
      if (captureRef.current === capture) captureRef.current = null;
    }
  };

  const stopCamera = () => {
    captureRef.current?.stop();
    captureRef.current = null;
    setAppCapture(null);
    setCamera(null);
    setFps(null);
    setLive(false);
    setShowCamera(false);
  };

  /* 단계 옮기기 */
  /*
   * 설정이 끝나면 — 그날 '오늘은 보지 않기'가 아니면 주의사항 안내창, 아니면 수평 맞추기. 카메라는 첫 화면부터 켜져 있고, 카메라 위치
   * (멀어지는 공 · 다가오는 공)가 바뀌었을 때만 다시 켠다 — 줌(투수 뒤 2배)과 엔진의 공 방향이 켤 때 정해진다. 설정 바꾸기를 flushSync 로
   * 바로 그려 cameraSettingsRef 가 새 값이 된 뒤 견준다(김민 17dbf60 — 옛 설정으로 켜지던 것).
   */
  const continueToCamera = (apply?: () => void) => {
    const tips = !isTipsSkippedToday(today);
    const target: Step = tips ? 'tips' : 'align';
    const from = step;
    autoStartedFor.current = target;
    flushSync(() => {
      apply?.();
      if (tips) {
        setTipIndex(0);
        setTipsBack(from);
        setTipsReturn('align');
      }
      setStep(target);
    });
    if (
      !captureRef.current ||
      startedApproachRef.current !== cameraSettingsRef.current.approach
    )
      void startCamera();
  };
  /* 주의사항만 다시 보기(첫 화면 · 수평의 ⓘ) — 다 보면 그 자리로 돌아간다 */
  const openTips = () => {
    setTipIndex(0);
    setTipsBack(step);
    setTipsReturn(step);
    setStep('tips');
  };
  /* 수평계 허락(아이폰)도 이 누름에 — 카메라 허락 창과 한 누름에 겹치지 않게(아래 goZone 설명) */
  const finishTips = () => {
    void requestPermission();
    setStep(tipsReturn);
  };
  const applyPrevious = () => {
    if (!stored) return;
    continueToCamera(() => {
      setChoices({ cameraPos: stored.cameraPos, net: false });
      setSessionType(stored.sessionType);
      setZone(stored.zone);
      setVoice(stored.voice);
      setUseCal(stored.useCal);
      setReleaseDistM(stored.releaseDistM);
      /* 거리는 기준 20m — 줄자로 쟀으면(distTape) 그 값, 관리자는 저장한 거리(특수 시험). 기준이면 세션마다 공 크기로 맞춘다(2.4.0) */
      setDistTape(stored.distTape);
      setTargetDistM(stored.distTape ? stored.targetDistM : STANDARD_TARGET_DIST_M);
      setDistAuto(false);
      setAutoMode(true);
      setCalibSave(stored.calibSave);
      setClipZone(stored.clipZone);
      setRecordMode(stored.recordMode);
      setDiagHud(stored.diagHud);
      setDecided(true);
    });
  };
  const startFresh = () => {
    /* 새 설정이어도 보기 취향(영상에 존 표시)은 이어 간다 — 안 그러면 저장할 때 켜짐으로 되돌아간다 */
    if (stored) {
      setClipZone(stored.clipZone);
      setRecordMode(stored.recordMode);
      setDiagHud(stored.diagHud);
    }
    setDecided(true);
    setStep('type');
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
    /* ABS 를 켰으면 존 다음에 플레이트 · 신장 단계 하나 더(투수 뒤만) */
    setStep(abs.on && choices.cameraPos === 'behind-pitcher' ? 'abs' : 'measure');
  };
  const goMeasureFromAbs = () => {
    captureRef.current?.setApproach(approach);
    setStep('measure');
  };
  /* 모드 시트에서 고르기 — 그 모드의 설정 흐름(지난 설정 · 종류)으로 */
  const pickMode = (next: CameraMode) => {
    setMode(next);
    setModePicked(true);
    setStep('type');
  };
  /* 셔터 위 띠로 바꾸기 — 공통 설정은 그대로. ABS 설정 단계에서 구속으로 가면 측정으로, 측정 전에 ABS 로 가면 플레이트 단계로 */
  const switchMode = (next: CameraMode) => {
    if (next === mode) return;
    setMode(next);
    if (step === 'abs' && next === 'speed') goMeasureFromAbs();
    else if (step === 'measure' && !live && next === 'abs' && choices.cameraPos === 'behind-pitcher') setStep('abs');
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
  /* 시도 기록(엔진 2.4 0단계) — 결과 번호 → 서버 시도 id, 이번 세션의 시도 id 전부(저장할 때 세션에 잇는다) */
  const attemptRef = useRef<(a: AttemptInfo) => void>(() => undefined);
  const attemptIdsRef = useRef(new Map<number, string>());
  const sessionAttemptIdsRef = useRef<string[]>([]);
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
      /* 클립이 올 때(카메라 알림)만 불린다 — React 컴파일러가 셔터 처리(onPrepShutter → startCamera)에서 이어진 길을 그리는 중으로 잘못 본다 */
      // eslint-disable-next-line react-hooks/purity
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
  useEffect(() => {
    attachClipRef.current = attachClipToPitch;
  });

  /*
   * 시도 기록 — 앱 카메라의 공 · 움직임 알림마다 쟀나 · 못 쟀으면 까닭을 서버에 남긴다(엔진 2.4 0단계, 2026-10-12: 못 잰 공이 어디에도
   * 안 남아 빠른 공의 실패를 구간별로 셀 수 없었다). 서버가 안 받아도(신호 없음) 측정은 그대로 — 조용히 넘긴다. 저장할 때 세션 · 공에
   * 잇는다(attemptIds · attemptId). 못 잰 공의 클립은 관리자의 보정용 저장일 때만 서버에 올린다.
   */
  const recordAttempt = (a0: AttemptInfo) => {
    const date = draftDate ?? today;
    const calib = calibOn;
    /* 결과를 받은 화면(addResult)이 바로 이어서 버릴 수 있다(측정 불가) — 한 박자 뒤에 보내 그 까닭까지 싣는다(dropAttempt) */
    pendingAttemptsRef.current.set(a0.id, a0);
    setTimeout(() => {
      const a = pendingAttemptsRef.current.get(a0.id) ?? a0;
      pendingAttemptsRef.current.delete(a0.id);
      void (async () => {
        let res: Awaited<ReturnType<typeof recordVelocityAttempt>>;
        try {
          res = await recordVelocityAttempt({
            date,
            kind: a.kind,
            atSec: a.atSec,
            strength: a.strength,
            ok: a.ok,
            code: a.code,
            why: a.why,
            trackFrames: a.trackFrames,
            rawKmh: a.rawKmh,
            confidence: a.confidence,
            distance: a.distance,
            thermal: a.thermal,
          });
        } catch (err) {
          unstable_rethrow(err);
          return;
        }
        if (!res.ok) return;
        attemptIdsRef.current.set(a.id, res.id);
        sessionAttemptIdsRef.current.push(res.id);
        if (a.clip && calib)
          await uploadAttemptClip(res.id, a.clip.blob, {
            sec: a.clip.durationSec,
            eventSec: a.clip.eventSec,
          }).catch(() => undefined);
      })();
    }, 0);
  };
  useEffect(() => {
    attemptRef.current = recordAttempt;
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
    setSaved(null);
    setShowCamera(true);
    capture.setManual(!autoMode);
    setLive(true);
    /* 그리기를 먼저 마친 뒤 기다린다 — 누른 순간에 대기 · 음성까지 하면 첫 장면들이 늦었다 */
    requestAnimationFrame(() => {
      capture.arm();
      void startSessionRecording(capture);
      speak(
        autoMode
          ? '측정을 시작해요. 던져요'
          : '측정을 시작해요. 공마다 단추를 눌러요'
      );
    });
  };
  /*
   * 세션 중 두 쪽(카메라 · 이번 세션) 사이를 단추로 — 손으로 넘길 때와 같은 가로 굴림. 어느 쪽인지는 굴림이 정한다(onScroll →
   * showCamera), 처음 붙을 때만 showCamera 쪽으로 놓는다(관리자 점프의 '측정 중 화면'은 이번 세션부터)
   */
  const goPage = (info: boolean) => {
    const el = pagerRef.current;
    el?.scrollTo({ left: info ? el.clientWidth : 0 });
  };
  useLayoutEffect(() => {
    const el = pagerRef.current;
    if (live && el && !showCamera)
      el.scrollTo({ left: el.clientWidth, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 붙을 때만(그 뒤는 굴림이 showCamera 를 정한다)
  }, [live]);
  /* 세션을 멈춘다 — 설정에서 존 다시 놓기 · 렌즈 보정으로 갈 때. 잰 공은 그대로라 돌아와 '측정 시작'으로 이어 잰다 */
  const pauseSession = () => {
    if (!live) return;
    captureRef.current?.disarm();
    setLive(false);
    setShowCamera(false);
    setResultOpen(false);
  };
  /*
   * 세션 종료 — 종합 화면으로. 거기서 저장하거나(끝) 이어서 잰다. 잰 공이 0개여도 띄운다(빈 요약 '잰 공이 없어요' + 구속 측정하기) —
   * 예전엔 카메라만 꺼져 "저장 버튼이 안 보인다"(2026-10-19 김민). 세션 녹화는 관리자 [세션 녹화] 폴더에 남는다.
   */
  const endSession = () => {
    captureRef.current?.disarm();
    void stopSessionRecording();
    setLive(false);
    setShowCamera(false);
    setResultOpen(false);
    setSummaryOpen(true);
  };
  /*
   * 세션 통째 녹화(엔진 2.7 1단계, lib/velocity-dual-recorder.ts) — 관리자가 '세션 녹화' 단추를 켠 채 앱 카메라로 잴 때, 앱이 쥔
   * 최근 영상을 4초마다 잘라 서버 녹화(엔진 개발용 녹화와 같은 표 · 편집기)로 올린다. 알림이 침묵해 놓친 공의 영상이 남는다.
   */
  const startSessionRecording = async (capture: DualCapture | LiveCapture) => {
    if (!canRecord || !sessionRecWanted || sessionRecRef.current) return;
    if (!(capture instanceof DualCapture)) {
      setToast('세션 녹화는 앱 카메라에서만 돼요');
      return;
    }
    /* 올리기가 밀린 조각은 폰에 두고 끝낸 뒤 올린다(앱의 LocalVideo 가 있을 때 — 두 앱 모두) */
    const canSpill = localVideoAvailable();
    const recorder = new DualSessionRecorder(
      {
        cameraNow: () => capture.cameraNow(),
        anchorClock: () => capture.anchorClock(),
        cutRange: (from, to) => capture.cutRange(from, to),
        ...(canSpill
          ? {
              spill: (blob: Blob) => saveBlobToPhone(blob),
              unspill: (id: string) => loadPhoneAssetBlob(id),
              dropSpill: (ids: string[]) => removePhoneAssets(ids),
            }
          : {}),
      },
      (s) => setRec({ ...s })
    );
    sessionRecRef.current = recorder;
    await recorder.start({
      date: today,
      meta: {
        engineVersion: VELOCITY_ENGINE_VERSION,
        app: native,
        sessionRecording: true,
        camera: camera
          ? {
              label: camera.label,
              width: camera.width,
              height: camera.height,
              frameRate: camera.frameRate,
              measuredFps: fps,
              focus: camera.focus,
              zoom: camera.zoom,
              cropped: camera.cropped,
            }
          : null,
        camMode: DEFAULT_CAM_MODE,
        fovDeg: fov,
        focalRatio,
        cameraPos: choices.cameraPos,
        net: choices.net,
        zone: activeZone,
        releaseDistM: approach === 'approaching' ? releaseDistM : null,
        targetDistM: approach === 'receding' ? targetDistM : null,
        /* 알림 시각(VelocityAttempt.atSec)과 같은 시계 — 편집기에서 컷을 잡을 때 */
        cameraClockStart: capture.cameraNow(),
      },
    });
    if (sessionRecRef.current !== recorder) return;
    if (recorder.state.phase === 'error') {
      setToast(recorder.state.error ?? '세션 녹화를 시작하지 못했어요');
      sessionRecRef.current = null;
      setRec(null);
      return;
    }
    setToast(
      recorder.state.error
        ? '세션 녹화 준비 — 첫 알림이 오면 찍기 시작해요'
        : '세션 녹화를 시작했어요'
    );
  };
  const stopSessionRecording = async () => {
    const recorder = sessionRecRef.current;
    if (!recorder) return;
    sessionRecRef.current = null;
    const res = await recorder.stop();
    setRec(null);
    if (res.parts > 0 || res.error)
      setToast(
        res.ok
          ? `세션 녹화를 관리자에 올렸어요(조각 ${res.parts}개)`
          : `세션 녹화 조각 ${res.parts}개 올림. ${res.error ?? '일부를 못 올렸어요'}`
      );
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
        camMode: DEFAULT_CAM_MODE,
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
          ? `조각 ${res.parts}개만 올렸어요. ${res.error ?? '일부를 못 올렸어요'}`
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
  /* 첫 화면(카메라)으로 — 세션 · 안내를 접는다. 카메라는 켠 채로(첫 화면이 카메라다). 다음 셔터는 지난 설정부터 묻는다 */
  const goHome = () => {
    captureRef.current?.disarm();
    void stopSessionRecording();
    setLive(false);
    setShowCamera(false);
    setSummaryOpen(false);
    setSheet('none');
    setViewPitch(null);
    setDecided(false);
    setStep('home');
  };
  /* 구속 측정을 떠난다 — 들어온 화면으로(홈에서 쓸어 왔으면 홈), 바로 열었으면 홈 */
  const exit = () => {
    if (backTooSoon()) return;
    if (previousUrl()) router.back();
    else router.replace('/today');
  };
  /* 잰 공을 버린다 — 저장하지 않고 나가기 */
  const discardPitches = () => {
    for (const p of pitches) revokeClips(p);
    setPitches([]);
    setLast(null);
    attemptIdsRef.current.clear();
    sessionAttemptIdsRef.current = [];
    void clearDraft();
    /* 되살린 세션의 날짜 · 맥락도 비운다 — 남으면 다음 세션이 옛 날짜로 저장됐다(2026-10-17) */
    setDraftDate(null);
    setDraftMeta(null);
  };
  /* 닫기 — 첫 화면이면 구속 측정을 떠나고, 그 밖이면 첫 화면으로. 저장하지 않은 공이 있으면 한 번 묻는다(말없이 사라지지 않게) */
  const leave = () => {
    if (recorderRef.current) {
      setToast('녹화를 먼저 멈춰 주세요');
      return;
    }
    if (pitches.length > 0) {
      setAskLeave('home');
      return;
    }
    if (step === 'home') exit();
    else goHome();
  };
  /*
   * 구속 측정을 떠난다 — 위 줄 ✕. 설정 단계엔 '‹ 앞 단계'뿐, 측정 중엔 '카메라 · 이번 세션'뿐이라 나가는 길이 몇 번을 눌러야 나왔다
   * (2026-10-20 김민: 투구 탭에서 들어가면 나가기가 없다). 녹화 중이면 막고, 저장 안 한 공이 있으면 묻는다.
   */
  const quit = () => {
    if (recorderRef.current) {
      setToast('녹화를 먼저 멈춰 주세요');
      return;
    }
    if (pitches.length > 0) {
      setAskLeave('exit');
      return;
    }
    exit();
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
        distanceM: distanceOf({
          cameraPos: choices.cameraPos,
          targetDistM,
          releaseDistM,
        }),
        distanceAuto: distanceAutoOf({ cameraPos: choices.cameraPos, distAuto }),
        tiltRad: null,
      });
      if (result.measure.ok) setFileReplay(URL.createObjectURL(file));
      /* 영상의 알림(HDR · 보정 조건 밖 · 화각 짐작)은 결과 화면에 공의 알림으로 뜬다(addResult) */
      addResult(result, 'file');
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상을 분석하지 못했어요.');
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
    const needs = CAMERA_STEPS.has(step);
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
   * 엔진 개발용 녹화를 바꾸면 카메라를 쥔 쪽이 바뀐다(웹 카메라 ↔ 앱 카메라) — 측정 중이 아니면 바로 다시 켠다. 측정 중이면
   * 세션을 멈춘 뒤('카메라 다시 켜기') 바뀐다.
   */
  useEffect(() => {
    const capture = captureRef.current;
    if (!capture || live || recorderRef.current) return;
    const plan = cameraPlan(native, recOn, dualStatusNow());
    const held: CameraPlan = capture instanceof DualCapture ? 'app' : 'web';
    if (plan === held) {
      capture.setClips(!recOn);
      return;
    }
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 설정이 바뀔 때만 본다
  }, [recOn]);

  /*
   * 1080p · 60fps 로 켜졌나 — 화질 · 프레임은 고르지 않고 늘 이것을 청한다(2026-10-08 사용자: "1080 · 60 으로 고정해 통일"). 카메라가
   * 둘 다 못 내면 60fps 를 지키며 화질을 낮춰 켜고(live-capture rescueFrameRate) 그대로 알린다. 60fps 아래면 측정이 잘 안 된다고 경고한다.
   */
  const checkCamMode = (info: CameraInfo) => {
    const asked = DEFAULT_CAM_MODE;
    if (info.frameRate == null) return;
    const gotFps = Math.round(info.frameRate);
    const gotShort = Math.min(info.width, info.height);
    const low = !fpsGood(gotFps);
    /* 모자랄 때만 알린다 — 앱 카메라는 되면 일부러 120fps 로 켠다(엔진 2.4.2 preferFps). 예전엔 '60 이 아니면' 못 냈다고 알렸다 */
    if (gotShort < asked.short - 8 || gotFps < asked.fps - 2) {
      setToast(
        `이 카메라는 ${camModeLabel(asked)} 를 못 내 ${gotShort}p · ${gotFps}fps 로 켰어요${
          low ? ' · 60fps 아래라 측정이 잘 안 돼요' : ''
        }`
      );
      return;
    }
    if (low) setToast(`지금 ${gotFps}fps 예요. 60fps 아래라 측정이 잘 안 돼요`);
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
      tiltRef.current,
      distanceAutoOf({ cameraPos: choices.cameraPos, distAuto })
    );
  }, [choices.cameraPos, targetDistM, releaseDistM, distAuto]);

  const changeFov = (next: number) => {
    setFov(next);
    saveFov(next);
    captureRef.current?.setFov(next);
  };

  const patch = (id: number, edit: Partial<PitchEdit>) =>
    setPitches((prev) => prev.map((p) => (p.id === id ? { ...p, ...edit } : p)));
  /* 이번 세션(카메라)의 깨끗한 공이 3개(SESSION_DIST_FULL)를 넘기면 그 중앙값을 지난 세션 거리로 남긴다 — 다음 세션 첫 공부터 섞어 쓴다 */
  useEffect(() => {
    const ds = pitches
      .filter((p) => p.auto?.clean && p.source === 'camera')
      .map((p) => p.auto!.distM);
    if (ds.length >= SESSION_DIST_FULL)
      saveDistMemory({
        distM: Math.round(medianOf(ds) * 100) / 100,
        n: ds.length,
        at: Date.now(),
      });
  }, [pitches]);
  const remove = (id: number) => {
    setPitches((prev) =>
      withSessionDistance(
        prev.filter((p) => p.id !== id),
        loadDistMemory(),
        distTape
      )
    );
    setSheet('none');
    setEditing(null);
  };

  const shownPitches = pitches.map((p) => ({ ...p, kmh: shown(p.rawKmh) }));
  /* 저장 때 올릴 영상 수 */
  const clipCount = pitches.reduce((n, p) => n + (p.clip ? 1 : 0), 0);
  const stats = summarize(
    shownPitches.map((p) => ({ ...p, excluded: distanceMismatch(p.analysis) != null }))
  );
  /* 세션 화면 · 요약 · 이전 공 시트가 받는 모양(components/velocity/session-types.ts) */
  const sessionPitches: SessionPitch[] = shownPitches.map((p, i) => ({
    id: p.id,
    excluded: distanceMismatch(p.analysis) != null,
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
  /*
   * 카메라 실시간 클립의 eventSec 은 녹화기의 '시작' 알림 시각으로 정해 아이폰에서 0.2~0.85초씩 어긋났다(2026-10-07 4개) — 결과
   * 화면이 영상 속 공으로 넓게(±1초) 맞춘다. 맞춘 값(clipOffset)이 있으면 그것, 영상 파일은 그 영상의 시각 그대로(0).
   */
  const replayClip = (p: LocalPitch) => {
    const c = p.clip;
    const url = p.source === 'file' ? (p === lastPitch ? fileReplay : null) : c?.url;
    if (!url) return null;
    if (p.clipOffset != null) return { url, offset: p.clipOffset, alignRange: 0.15 };
    if (!c) return { url, offset: 0, alignRange: 0.15 };
    return {
      url,
      offset: c.eventSec - (p.hitT ?? p.trail?.[0]?.t ?? 0),
      alignRange: 1,
    };
  };
  /* 결과 화면에 보일 공 — 목록에서 고른 공(viewPitch), 아니면 방금 잰 공 */
  const shownPitch =
    viewPitch != null
      ? (pitches.find((p) => p.id === viewPitch) ?? null)
      : resultOpen && !summaryOpen
        ? lastPitch
        : null;
  const editingPitch =
    editing == null ? null : (pitches.find((p) => p.id === editing) ?? null);

  /*
   * 저장 · 맡길 때 쓸 맥락 — 되살린 세션에 새로 잰 공이 없으면 그때의 맥락. 예전엔 '카메라가 꺼져 있을 때만'이라, 이어 재기 화면이
   * 카메라를 저절로 켜면 공 하나 안 쟀는데도 오늘 카메라 설정(화각 · 기기 · 폰 자리)으로 덮였다(2026-10-17 금윤호 버그 사냥).
   * 새 공을 재면 그 카메라가 지금 맥락이라 sessionContext().
   */
  const restoredIdsRef = useRef(new Set<number>());
  const contextNow = (): SessionContext =>
    draftMeta && pitches.every((p) => p.sample || restoredIdsRef.current.has(p.id))
      ? draftMeta
      : sessionContext();
  /* 세션의 측정 맥락 — 저장할 때 · 폰에 맡길 때 같이 */
  const sessionContext = (): SessionContext => {
    const longSide = camera ? Math.max(camera.width, camera.height) : null;
    return {
      fovDeg: fov,
      source: pitches.every((p) => p.source === 'file') ? 'file' : 'camera',
      device: camera
        ? `${camera.label} ${camera.width}×${camera.height}${exposureText(exposure)}`.trim()
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
      ...sessionDistanceOf(pitches, {
        cameraPos: choices.cameraPos,
        distAuto,
        distTape,
        targetDistM,
      }),
      useCal,
      frameW: camera?.width ?? null,
      frameH: camera?.height ?? null,
    };
  };
  /*
   * 세션 거리 보정이 처음 걸리거나 값이 바뀌면 한 번 알린다(앞 공도 같이 옮겼으니). 줄자로 잰 세션은 깨끗한 공 셋의 공 크기 가운데 값이
   * 줄자와 TAPE_WARN(7%) 넘게 다르면 폰 · 미트 자리를 확인하라고 알린다(줄자 값은 그대로).
   */
  const corrNoteRef = useRef<string | null>(null);
  useEffect(() => {
    const c = stdCorrection(pitches, 'camera');
    let note: string | null = null;
    if (c && distTape && Math.abs(c.m / targetDistM - 1) > TAPE_WARN)
      note = `줄자 ${targetDistM}m · 공 크기 ${c.m}m. 폰이나 미트 자리를 확인해 봐요`;
    else if (c?.apply && !distTape)
      note = `공 ${c.n}개의 공 크기로 세션 거리를 ${c.m}m 로 맞추고 앞 공도 다시 셌어요`;
    if (note && note !== corrNoteRef.current) {
      corrNoteRef.current = note;
      setToast(note);
    }
  }, [pitches, distTape, targetDistM]);
  /*
   * 폰에 맡기기(lib/velocity-draft.ts) — 공 목록이 바뀔 때마다 · 영상은 처음 붙을 때 한 번. 담은 영상은 디스크에 놓인 것으로 바꿔 쥐어
   * 메모리를 던다(지금 보는 공 · 막 잰 공은 재생이 끊기지 않게 그대로). 예시 공은 맡기지 않는다.
   */
  const storedRef = useRef(new Map<number, { src: Blob; stored: Blob }>());
  /*
   * 공이 있다가 없어졌을 때만 폰 임시 저장을 지운다 — 마지막 공을 지우면 효과가 그냥 끝나 임시 저장이 남고, 다음에 열 때 지운 공이
   * 되살아났다(2026-10-17). 처음(loadDraft 전, 공 0개)에는 지우지 않아 되살리기와 겹치지 않는다.
   */
  const hadRealRef = useRef(false);
  useEffect(() => {
    const real = pitches.filter((p) => !p.sample);
    if (real.length === 0) {
      if (hadRealRef.current) {
        hadRealRef.current = false;
        storedRef.current.clear();
        void clearDraft();
      }
      return;
    }
    hadRealRef.current = true;
    void saveDraft<DraftPitch, SessionContext>({
      date: draftDate ?? today,
      meta: contextNow(),
      pitches: real.map(toDraftPitch),
      savedAt: Date.now(),
    });
    const newest = real[real.length - 1].id;
    const ids = new Set(real.map((p) => p.id));
    for (const id of storedRef.current.keys())
      if (!ids.has(id)) {
        storedRef.current.delete(id);
        void deleteClip(id);
      }
    for (const p of real) {
      const clip = p.clip;
      if (!clip) continue;
      const known = storedRef.current.get(p.id);
      if (!known || (known.src !== clip.blob && known.stored !== clip.blob)) {
        storedRef.current.set(p.id, { src: clip.blob, stored: clip.blob });
        void putClip(p.id, {
          blob: clip.blob,
          durationSec: clip.durationSec,
          eventSec: clip.eventSec,
        }).then((got) => {
          if (got && storedRef.current.get(p.id)?.src === clip.blob)
            storedRef.current.set(p.id, { src: clip.blob, stored: got.blob });
        });
      } else if (known.stored !== clip.blob && p.id !== newest && p.id !== viewPitch) {
        const url = URL.createObjectURL(known.stored);
        const old = clip.url;
        setPitches((prev) =>
          prev.map((q) =>
            q.id === p.id && q.clip?.blob === clip.blob
              ? { ...q, clip: { ...clip, url, blob: known.stored } }
              : q
          )
        );
        URL.revokeObjectURL(old);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 공 목록이 바뀔 때만 맡긴다(맥락은 그때 값)
  }, [pitches]);
  /*
   * 처음 열 때 — 폰에 맡겨 둔 세션이 있으면 이어서 담는다(앱이 꺼져도 잰 공이 사라지지 않게). 첫 화면의 '이어서 하기'로 왔으면
   * 세션 요약부터. 저장한 뒤 올리지 못한 영상도 다시 올린다.
   */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const d = await loadDraft<DraftPitch, SessionContext>();
      if (!alive || !d?.pitches?.length) return;
      const clips = await loadClips();
      if (!alive) return;
      const restored: LocalPitch[] = d.pitches.map((p) => {
        const c = clips.get(p.id);
        if (!c) return p;
        storedRef.current.set(p.id, { src: c.blob, stored: c.blob });
        return {
          ...p,
          clip: {
            url: URL.createObjectURL(c.blob),
            blob: c.blob,
            durationSec: c.durationSec,
            eventSec: c.eventSec,
          },
        };
      });
      setPitches((prev) => (prev.length ? prev : restored));
      restoredIdsRef.current = new Set(restored.map((p) => p.id));
      setDraftDate(d.date);
      setDraftMeta(d.meta);
      setToast(`저장하지 않은 공 ${restored.length}개를 이어서 담았어요`);
      if (resume) {
        setDecided(true);
        setStep('measure');
        setSummaryOpen(true);
      }
    })();
    void retryUploads((u) =>
      uploadClip(
        u.pitchId,
        u.blob,
        { sec: u.sec, eventSec: u.eventSec },
        undefined,
        u.kind,
        u.phone
      ).then((r) => r.ok)
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번
  }, []);

  const save = () => {
    if (!stats || saving) return;
    /* 관리자 점프의 예시 공은 화면 확인용 — 실제 기록에 섞이면 안 된다 */
    if (pitches.some((p) => p.sample)) {
      setSheet('none');
      setError('예시 공은 저장할 수 없어요. 관리자 이동 › 예시 공 지우기.');
      return;
    }
    /* 체감 강도를 안 골랐다 — 칩 밑의 빨간 한 줄로 알린다(서버도 같은 말로 막는다) */
    if (effortPct == null) {
      setError(null);
      setEffortMissing(true);
      return;
    }
    setError(null);
    /* 날짜는 저장 직전에 한 번 잡는다 — 성공 처리 · 안내 링크가 같은 날을 본다 */
    const date = draftDate ?? today;
    startSaving(async () => {
      let res: Awaited<ReturnType<typeof saveVelocitySession>>;
      try {
        res = await saveVelocitySession({
          date,
          sessionType,
          effortPct,
          /* 되살린 세션에 새 공이 없으면 그때의 맥락으로 */
          ...contextNow(),
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
            analysis: p.analysis ? withTrail(p) : null,
            autoDetected: p.autoDetected !== false,
            attemptId:
              p.captureId != null
                ? (attemptIdsRef.current.get(p.captureId) ?? null)
                : null,
          })),
          attemptIds: sessionAttemptIdsRef.current,
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
        /* 공마다 영상 하나 */
        const targets = pitches.flatMap((p, i) => {
          const id = ids[i];
          if (!id) return [];
          const jobs: { id: string; clip: LocalClip; kind: 'main' | 'wide' }[] = [];
          if (p.clip) jobs.push({ id, clip: p.clip, kind: 'main' });
          return jobs;
        });
        if (targets.length) {
          setUploading({ done: 0, total: targets.length });
          let failed = 0;
          for (let i = 0; i < targets.length; i++) {
            const { id, clip, kind } = targets[i];
            /*
             * 회원 클립은 폰의 앱 안에, 관리자 클립은 늘 서버에 — 2026-10-15 김민: 10-12 클립 22개가 앱을 다시 깔며 폰에서 통째로
             * 지워졌다(앱 안 폴더는 백업에서도 뺀다). 관리자 클립은 엔진 확인 자료라 잃으면 안 된다.
             */
            const phone = !isAdmin;
            const r = await uploadClip(
              id,
              clip.blob,
              { sec: clip.durationSec, eventSec: clip.eventSec },
              undefined,
              kind,
              phone
            );
            if (!r.ok) {
              failed++;
              /* 폰에 맡겨 두었다가 다음에 열 때 다시 올린다 */
              await queueUpload({
                pitchId: id,
                blob: clip.blob,
                sec: clip.durationSec,
                eventSec: clip.eventSec,
                kind,
                phone,
              });
            }
            setUploading({ done: i + 1, total: targets.length });
          }
          setUploading(null);
          if (failed)
            setError(
              `클립 ${failed}개를 올리지 못했어요. 폰에 두었다가 다음에 열 때 다시 올려요(측정값은 저장됐어요).`
            );
        }
      }
      for (const p of pitches) revokeClips(p);
      await clearDraft();
      setDraftDate(null);
      setDraftMeta(null);
      setSaved(date);
      setPitches([]);
      attemptIdsRef.current.clear();
      sessionAttemptIdsRef.current = [];
      setViewPitch(null);
      setSheet('none');
      setSummaryOpen(false);
      /*
       * 저장은 곧 측정의 끝(사용자 규칙: '세션 저장하기'로 끝내고, 더 재려면 '구속 측정하기'). 첫 화면(카메라)으로 — 기록 단추 ·
       * 기록 시트에 방금 세션이 붙게 서버 자료를 다시 받는다.
       */
      goHome();
      router.refresh();
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
        : step === 'abs'
          ? 'zone'
          : step;
  const jumpTo = (key: VelocityScreenKey) => {
    setSheet('none');
    setViewPitch(null);
    setEditing(null);
    if (key === 'ask') {
      if (!stored) {
        setToast('저장된 설정이 없어요. 설정을 한 번 마치면 생겨요');
        return;
      }
      setLive(false);
      setSummaryOpen(false);
      setDecided(false);
      setStep('type');
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
      setTipIndex(0);
      setTipsBack('home');
      setTipsReturn('align');
    }
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
    setSaved(null);
    setToast(`예시 공 ${SAMPLE_PITCHES.length}개를 넣었어요(저장은 안 돼요)`);
  };
  const clearSamplePitches = () => {
    setPitches((prev) => {
      for (const p of prev) if (p.sample) revokeClips(p);
      return prev.filter((p) => !p.sample);
    });
  };

  const back =
    step === 'tips' ? { to: tipsBack, label: '이전' } : (BACK_OF[step] ?? null);
  /*
   * 던짐을 알아채고 결과를 내는 중인가(영상 담기 · 계산) — 크게 보인다. 앱 카메라는 날아가는 공이 확실할 때만 띄운다(움직임만 잡힌
   * 것은 조용히 재 본다). 담기에 걸리는 시간: 앱 카메라는 공이 보인 뒤 1.6초를 더 받고 읽어서
   */
  const phase = step === 'measure' ? measurePhaseOf(status) : null;
  const captureSec = appCamera ? 2.3 : 1;
  /* 방금 결과를 카메라 위에 크게 보이나 — 측정에서 카메라가 보일 때(다음 공을 재는 동안은 진행 표시가 대신) */
  const resultShown =
    step === 'measure' &&
    last != null &&
    !fileBusy &&
    !(live && !showCamera) &&
    phase == null;
  /* 첫 화면 기록 단추의 숫자 — 가장 최근 세션의 최고 구속(maxKmh 는 이미 보정된 값 — lib/velocity-load.ts, 한 번 더 걸면 기록 시트와 어긋난다) */
  const latestMax = history.length ? history[history.length - 1].maxKmh : null;
  const lastTip = tipIndex >= tipsCount(choices) - 1;
  /* 안내창 카드 밑 단추(김민: "다음 버튼은 창에다가, 셔터로 하니까 헷갈려") — 셔터는 첫 화면의 측정 시작과 측정에만 */
  const guideLabel = showAsk
    ? '이 설정으로 시작'
    : step === 'tips' && lastTip
      ? tipsReturn === 'align'
        ? '카메라 맞추기'
        : '닫기'
      : '다음';
  const onGuideNext = () => {
    if (showAsk) applyPrevious();
    else if (step === 'type') setStep('camera');
    else if (step === 'camera') {
      persistSetup({ targetDistM, releaseDistM, distTape });
      continueToCamera();
    } else if (lastTip) finishTips();
    else setTipIndex(tipIndex + 1);
  };
  /* 카메라 무대 위 가운데 — 단계 이름(측정은 세션 중 상태가 대신) */
  const stageTitle = step === 'home' ? { n: '', label: modePicked ? modeMeta.title : '카메라' } : null;
  /*
   * 셔터 — 첫 화면은 '측정 시작'(안내창을 연다). 안내창 · 수평 · 존 동안은 흐리게 자리만 지킨다(앞으로 가기는 카드 안 단추 — 김민:
   * "다음 버튼은 창에다가, 셔터로 하니까 헷갈려"). 측정 단계의 셔터는 아래 막대의 다른 갈래가 그린다.
   */
  const waitShutter = (
    <div className="flex flex-col items-center">
      <Shutter
        onClick={() => setStep('type')}
        disabled={step !== 'home' || fileBusy}
        label={modeMeta.shutter}
      />
      <span className={`${SIDE_LABEL} transition-opacity ${step === 'home' ? '' : 'opacity-35'}`}>
        {modeMeta.shutter}
      </span>
    </div>
  );
  /* 안내창(카드)이 뷰파인더 밑에 떠 있나 — 알림은 그때 위쪽으로 */
  const cardUp =
    (PREP_STEPS.has(step) && step !== 'home') || step === 'align' || step === 'zone';
  const fpsNote = liveFpsNote(fps);
  /*
   * 기준 조건(1080p · 60fps · 2배가 진짜 줌 · 손떨림 보정)을 못 맞춘 카메라 — 모든 사용자가 같은 조건이어야 값을 견줄 수 있다(2026-10-08
   * 사용자). 몰래 낮추지 않고, 막지도 않고, 측정 화면에 계속 알린다
   */
  const standardNote = camera?.offStandard?.length
    ? standardNoteOf(camera.offStandard) +
      /* 옛 앱(앱 카메라가 없음) — 무엇을 하면 되는지까지(웹 카메라라 손떨림 보정을 못 켠다) */
      (native && !recOn && isOldApp(dualStatusNow())
        ? ' TestFlight에서 싱커 앱을 업데이트하면 앱 카메라로 기준 조건에 맞춰 재요.'
        : '')
    : null;
  /* 오른쪽 위 알약을 주황으로 — 실제로 들어오는 fps 가 낮거나(50 아래), 카메라가 60fps 아래로 켜졌거나(시트와 같은 기준) */
  const lowFps =
    fpsNote != null ||
    standardNote != null ||
    (camera?.frameRate != null && !fpsGood(camera.frameRate));
  /* 카메라가 잘려 왔으면(원래 비율이 아니면) 화각을 짐작한다 — 막지 않고 알린다 */
  const cropNote =
    camera?.cropped === true
      ? `카메라 화면이 잘려 와서(${camera.width}×${camera.height}) 값이 부정확할 수 있어요.`
      : null;
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;
  /* 관리자 '세션 녹화' 칩 — 측정 시작 전엔 켜기 단추, 측정 중엔 녹화 상태(결과가 떠 있으면 숨김). 알림창은 그만큼 위로 */
  const recChip = step === 'measure' && canRecord && !recOn && (!live || (rec != null && !resultShown));
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
      {cameraOn &&
        step !== 'align' &&
        step !== 'lens' &&
        !PREP_STEPS.has(step) &&
        !(live && !showCamera) && (
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
          centerLocked
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

      {/* ABS — 플레이트 앞변 · 존 상자(설정 단계는 손잡이, 측정 중엔 옅게) */}
      {abs.on &&
        cameraOn &&
        frameSize &&
        finderSize &&
        (step === 'abs' || (step === 'measure' && showCamera && !summaryOpen)) && (
          <PlateOverlay
            ends={abs.ends}
            poly={abs.zonePoly}
            frame={frameSize}
            view={finderSize}
            manual={step === 'abs' && abs.manual}
            onEnds={abs.setEnds}
            dim={step === 'measure'}
          />
        )}
      {abs.on && cameraOn && step === 'measure' && live && !summaryOpen && !resultShown && (
        <div className="absolute left-3 top-[calc(5.75rem+env(safe-area-inset-top))] z-10">
          <BatterChip batter={abs.batter} height={abs.setup.height} onNext={abs.nextBatter} />
        </div>
      )}

      {/* 모드 고르기 시트 — 열리자마자 미리보기 위(docs/designs/camera-modes.md 2-1). 고르면 그 모드의 설정 흐름으로 */}
      {step === 'home' && !modePicked && status !== 'starting' && <ModeSheet value={mode} isAdmin={canAbs} onPick={pickMode} />}
      {/* 표적 — 릴리스 포인트 */}
      {cameraOn && step !== 'zone' && step !== 'abs' && step !== 'lens' && !(live && !showCamera) && (
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
          {camera && (
            /*
             * 화질 · 프레임은 1080p · 60fps 고정(사용자 2026-10-08 — 관리자도 고르지 않는다). 못 내는 폰은 60fps 를 지키며 화질을 낮춘다.
             * 앱 카메라면 누르면 카메라 상태 판(흐린 까닭 가르기 · 손떨림 보정 · 줌 · 수동 초점)
             */
            <button
              type="button"
              disabled={!appCamera || !isAdmin}
              onClick={() => setTunerOpen((v) => !v)}
              aria-expanded={appCamera && isAdmin ? tunerOpen : undefined}
              aria-label="카메라 상태"
              className={`pointer-events-auto inline-flex h-7 min-w-0 items-center rounded-full px-2.5 tabular-nums backdrop-blur disabled:cursor-default ${
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
            </button>
          )}
        </div>
      )}
      {cameraOn &&
        appCapture &&
        isAdmin &&
        tunerOpen &&
        step !== 'lens' &&
        !(live && !showCamera) && (
          <div className="absolute inset-x-3 top-[calc(5.5rem+env(safe-area-inset-top))] z-20">
            <CameraTuner
              capture={appCapture}
              onClose={() => setTunerOpen(false)}
              onTuned={(d) =>
                /* 바꾼 것이 기준 조건 밖이면 알림 · 공 기록에 남긴다(카메라를 다시 켜면 기본으로 돌아가 이 표시도 사라진다) */
                setCamera(
                  (c) =>
                    c && {
                      ...c,
                      offStandard: [
                        ...c.offStandard.filter((r) => !r.endsWith(TUNED)),
                        ...(d.stabilization === 'off'
                          ? [`손떨림 보정 끔${TUNED}`]
                          : []),
                        ...(Math.abs(d.zoom - (c.zoom ?? 1)) > 0.05
                          ? [`줌 ${d.zoom}배${TUNED}`]
                          : []),
                      ],
                    }
                )
              }
            />
          </div>
        )}

      {/*
        진단 표시(관리자 설정) — 밖에서 하나도 안 잡힐 때 그 자리에서 까닭을 본다: 장면 받는 길(worker-stream 이 가장 가볍다) ·
        실제로 들어오는 fps · 측정 워커가 장면 하나에 쓴 시간(16.7ms 를 넘으면 60fps 를 못 따라간다) · 계산이 밀려 버린 공 ·
        알아챈 수 · 잰 수 · 거부 수와 마지막 결과. 정보 판이 올라와 있어도 보이게 위에 둔다.
      */}
      {/* 진단 표시(관리자 설정)는 측정 단계에서만 — 첫 화면이 카메라가 된 뒤 첫 화면 · 안내 단계에도 떴다(2026-10-15 김민) */}
      {isAdmin && diagHud && cameraOn && step === 'measure' && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-3 top-[calc(6.25rem+env(safe-area-inset-top))] z-30 max-w-[15rem] rounded-lg bg-black/70 px-2.5 py-1.5 text-xs leading-snug text-white/90 tabular-nums backdrop-blur"
        >
          <p>
            {camera?.label.startsWith('DualCamera')
              ? 'dual(앱)'
              : (liveInfo?.pipeline ?? '—')}
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
              {liveInfo.frame.format} {liveInfo.frame.coded[0]}×
              {liveInfo.frame.coded[1]}
              {liveInfo.rotationFix ? ` · 돌림 ${liveInfo.rotationFix}°` : ''}
            </p>
          )}
          {liveInfo?.streamFailed && (
            <p className="truncate text-amber-300">
              직접 받기 실패: {liveInfo.streamFailed}
            </p>
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
              className="h-full rounded-full bg-sky motion-safe:transition-[width]"
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
      {/*
       * 카메라 무대 — 4 수평 · 5 존 · 6 측정 · 렌즈 보정이 같은 틀을 쓴다(카메라 앱처럼 위 줄 · 뷰파인더 · 아래 단추). 뷰파인더가
       * 늘 같은 자리에 있어야 <video> 가 새로 만들어지지 않는다 — 예전에는 존 단계와 측정 단계가 뷰파인더를 다른 자리에 그려,
       * 측정으로 넘어가면 새 <video> 에 카메라가 이어지지 않아 까맸다(2026-09-30 사용자: "측정 화면에서 카메라가 안 보인다").
       * 측정: 세션 전에는 카메라가 꽉 차고, 시작하면 정보 판이 밑에서 올라와 덮는다('카메라'로 내린다).
       */}
      {CAMERA_STEPS.has(step) && (
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
             * 안내창 — 첫 화면에서 셔터를 누르면 뷰파인더 위에 뜬다(2026-10-15 김민: "그 위로 안내창, 밑의 촬영 단추는 가리지 않게").
             * 뷰파인더 칸 안이라 밑의 셔터 줄은 늘 보이고, 앞으로 가기는 그 셔터가 맡는다. 위 줄(‹ · 이름)은 안 덮게 그 밑부터.
             */}
            {((PREP_STEPS.has(step) && step !== 'home') ||
              step === 'align' ||
              step === 'zone') && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+3.25rem)] z-20 flex flex-col justify-end">
                {showAsk && stored ? (
                  <PreviousSetupCard
                    key="ask"
                    setup={stored}
                    onFresh={startFresh}
                    onUse={onGuideNext}
                  />
                ) : step === 'align' ? (
                  <GuideCard
                    key="align"
                    step={3}
                    total={4}
                    title="수평 · 표적 맞추기"
                    subtitle={`${withGa(targetText)} 가운데 표적에 오게 폰 높이와 방향을 맞춰요.`}
                    footer={
                      <PrimaryButton onClick={goZone} disabled={!cameraOn}>
                        다음
                        <ChevronRight aria-hidden className="h-4 w-4" />
                      </PrimaryButton>
                    }
                  >
                    {cameraOn && !levelOk && (
                      <p className="rounded-2xl bg-warn-bg px-4 py-2.5 text-sm leading-snug text-warn">
                        아직 기울어 있어요. 그대로 가도 되지만 코스와 궤적이 비뚤게 보여요.
                      </p>
                    )}
                  </GuideCard>
                ) : step === 'zone' ? (
                  <GuideCard
                    key="zone"
                    step={4}
                    total={4}
                    title="스트라이크 존"
                    subtitle="자리는 릴리스 표적 바로 밑에 고정돼요. 두 손가락으로 벌리거나 모서리 손잡이로 크기만 맞춰요."
                    footer={
                      <PrimaryButton onClick={goMeasure} disabled={!cameraOn}>
                        {abs.on && choices.cameraPos === 'behind-pitcher' ? '다음' : '완료'}
                        <ChevronRight aria-hidden className="h-4 w-4" />
                      </PrimaryButton>
                    }
                  />
                ) : step === 'abs' ? (
                  <GuideCard
                    key="abs"
                    title="ABS · 홈플레이트와 타자"
                    subtitle="존 밑에 흰 홈플레이트가 보여야 해요. 찾으면 존 상자가 플레이트 위에 그려져요."
                    footer={
                      <PrimaryButton onClick={goMeasureFromAbs} disabled={!cameraOn || !abs.calib?.ok}>
                        완료
                        <ChevronRight aria-hidden className="h-4 w-4" />
                      </PrimaryButton>
                    }
                  >
                    <AbsSetupCard abs={abs} tiltKnown={absTilt != null || level.pitch != null} />
                  </GuideCard>
                ) : step === 'type' ? (
                  <GuideCard
                    key="type"
                    step={1}
                    total={4}
                    title="어떤 투구인가요?"
                    subtitle="투구 기록을 남길 때 이 종류로 채워요."
                    footer={
                      <PrimaryButton onClick={onGuideNext}>
                        {guideLabel}
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
                  </GuideCard>
                ) : step === 'camera' ? (
                  <GuideCard
                    key="camera"
                    step={2}
                    total={4}
                    title="폰은 투수 바로 뒤 1m 안에 둬요"
                    subtitle="던지는 방향을 정면으로 보게 둬요. 멀거나 옆이면 공을 놓쳐요."
                    footer={
                      <PrimaryButton onClick={onGuideNext}>
                        {guideLabel}
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
                    <div className="space-y-3">
                      {/* 기준 20m 로 재고 세션마다 공 크기로 맞춘다(2.4.0). 줄자로 쟀으면 그 값이 이긴다. 공마다 공 크기로 어림하는 관리자 칸은 뺐다(2026-10-15) */}
                      <SectionLabel>폰에서 포수 미트까지</SectionLabel>
                      <Segmented
                        label="폰에서 미트까지"
                        value={distTape ? 'tape' : 'standard'}
                        onChange={(v) => {
                          const tape = v === 'tape';
                          setDistTape(tape);
                          if (!tape) setTargetDistM(STANDARD_TARGET_DIST_M);
                        }}
                        options={TAPE_MODES}
                        size="md"
                      />
                      {!distTape && (
                        <p className="px-0.5 text-footnote leading-snug text-muted">
                          {STANDARD_DIST_HINT}
                        </p>
                      )}
                      {distTape && (
                        <DistanceField
                          label="줄자로 잰 거리"
                          hint={TAPE_HINT}
                          value={targetDistM}
                          min={TARGET_DIST_MIN}
                          max={TARGET_DIST_MAX}
                          onChange={setTargetDistM}
                        />
                      )}
                    </div>
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
                  </GuideCard>
                ) : (
                  <TipsCard
                    choices={choices}
                    index={tipIndex}
                    onIndex={setTipIndex}
                    today={today}
                    onSkipToday={finishTips}
                    action={{ label: guideLabel, onClick: onGuideNext }}
                  />
                )}
              </div>
            )}
            {/*
             * 세션 중 옆으로 넘기는 두 쪽(김민 2026-10-09: "옆으로 넘기면 이번 세션 공들의 정보를") — 왼쪽은 비어 있어 밑의 카메라가
             * 보이고, 왼쪽으로 밀면 오른쪽 쪽(이번 세션: 방금 공 · 숫자 · 구종별 · 구속 흐름 · 공 목록)이 손을 따라온다. 가로 굴림 +
             * 붙기(scroll-snap)라 손 · 단추 · 움직임 줄이기가 브라우저 몫이다. 카메라가 꺼지면 왼쪽 쪽이 '카메라 다시 켜기'를
             * 가리지 않게 손을 받지 않는다.
             */}
            {step === 'measure' && live && (
              <div
                ref={pagerRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const cam = el.scrollLeft < el.clientWidth / 2;
                  if (cam !== showCamera) startTransition(() => setShowCamera(cam));
                }}
                className={`no-scrollbar absolute inset-0 z-5 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain motion-safe:scroll-smooth ${
                  cameraOn ? '' : 'pointer-events-none'
                }`}
              >
                <div aria-hidden className="h-full w-full shrink-0 snap-start" />
                <div
                  inert={showCamera}
                  className="pointer-events-auto h-full w-full shrink-0 snap-start overflow-y-auto overscroll-contain bg-black/98 px-4 pb-6 pt-[calc(3.5rem+env(safe-area-inset-top))]"
                >
                  {phase && (
                    <div className="mb-3">
                      <MeasureProgress
                        phase={phase}
                        captureSec={captureSec}
                        runKey={captureRun}
                      />
                    </div>
                  )}
                  <section className="rounded-2xl bg-white/[0.06] px-5 pb-4 pt-5 text-center">
                    {lastPitch ? (
                      <div key={lastPitch.id} className="motion-safe:animate-fade-in">
                        <p className="text-xs font-medium text-white/60">
                          {pitches.length}구째
                          {lastPitch.autoDetected === false ? ' · 수동' : ''}
                          {pitchTypeLabel(lastPitch.pitchType)
                            ? ` · ${pitchTypeLabel(lastPitch.pitchType)}`
                            : ''}
                        </p>
                        <p className="text-numeric mt-1 text-7xl leading-none">
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
                          {rejectTitle(last)}
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
                          {STATUS_TEXT[status]}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-white/60">
                          공마다 알아서 잡아요. 끝나면 아래 가운데 세션 종료를 눌러요.
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
                              className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
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

                  {error && (
                    <p
                      role="alert"
                      className="mt-3 rounded-2xl border border-danger-line/60 bg-danger/15 px-4 py-2.5 text-sm leading-relaxed text-white"
                    >
                      {error}
                    </p>
                  )}

                  {/* 이번 세션 — 세션 요약과 같은 부품을 어두운 색으로. 공을 누르면 고치기, ▶ 는 그 공의 영상 */}
                  <SessionDetails
                    className="theme-dark mt-5 text-ink"
                    pitches={sessionPitches}
                    unit={unit}
                    onPlayClip={(id) => setViewPitch(id)}
                    onEditPitch={(id) => {
                      setEditing(id);
                      setSheet('pitch');
                    }}
                  />
                </div>
              </div>
            )}
            {/*
             * 아래 한 열 — 안내 · 알림 · 방금 결과를 뷰파인더 밑에서부터 쌓는다. 뷰파인더 안이라 아래 막대(홈 막대 여백만큼
             * 커진다) 뒤로 숨지 않고, 알림과 결과가 서로 겹치지 않는다(2026-09-30 디자인 검토 — 예전에는 막대 높이를 짐작한
             * 자리에 따로 떠 있어 앱에서 10px 가려지고 결과 글자 위에 겹쳤다).
             */}
            {/* 알아챘다 · 계산 중 — 뷰파인더 테두리가 빛난다(멀리서도 보이게) */}
            {phase && (!live || showCamera) && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-10 ring-4 ring-inset ring-sky-soft motion-safe:animate-pulse"
              />
            )}
            {step !== 'lens' && (
              /* 안내창(카드)이 밑에 떠 있는 단계는 알림을 위쪽(수평계 줄 밑)에 — 카드와 겹치지 않게 */
              <div
                className={`pointer-events-none absolute inset-x-0 flex flex-col gap-2 ${
                  cardUp
                    ? 'top-[calc(5.25rem+env(safe-area-inset-top))] z-30'
                    : 'bottom-0 z-10'
                }`}
              >
                {phase && (!live || showCamera) && (
                  <div className="px-4 pb-3">
                    <MeasureProgress
                      phase={phase}
                      captureSec={captureSec}
                      runKey={captureRun}
                    />
                  </div>
                )}
                {(!live || showCamera) &&
                  (error ||
                    saved ||
                    toast ||
                    fpsNote ||
                    standardNote ||
                    cropNote ||
                    (isAdmin && !native)) && (
                    <div className={`space-y-2 px-4 ${recChip ? 'pb-14' : resultShown || cardUp ? '' : 'pb-3'}`}>
                      {/* 초당 장면 · 잘림 — 측정 화면에서만(수평 · 존은 오른쪽 위 주황 표시로 충분), 결과가 떠 있으면 결과의 알림이 말한다 */}
                      {step === 'measure' &&
                        !resultShown &&
                        phase == null &&
                        (fpsNote ?? standardNote ?? cropNote) &&
                        !error && (
                          <p className={`${NOTE_WIN} border-l-4 border-warn`}>
                            {fpsNote ?? standardNote ?? cropNote}
                          </p>
                        )}
                      {step === 'measure' && isAdmin && !native && !error && !saved && (
                        <p className={`${NOTE_WIN} text-xs text-muted`}>
                          웹 시험 모드(관리자) — 브라우저 카메라는 대개 초당 30장이라
                          값은 참고용이에요.
                        </p>
                      )}
                      {error && (
                        <p
                          role="alert"
                          className={`${NOTE_WIN} border-l-4 border-danger`}
                        >
                          {error}
                        </p>
                      )}
                      {saved && (
                        <p className={`${NOTE_WIN} pointer-events-auto flex items-center gap-2`}>
                          <Check aria-hidden className="h-4 w-4 text-ok" />
                          {/* 2026-10-16 부터 측정은 투구 기록을 만들지 않는다 — 그날 화면이 이 값으로 채운 기록을 권한다 */}
                          저장했어요. 투구 기록으로도 남겨 주세요.
                          {/*
                            일반 이동 — 앱 안의 링크로 가면 (app) 의 팝업 경로(@modal/(.)pitch-log)가 가로채 빈 화면 위에 팝업이
                            떴다(측정 화면은 (app) 밖이다). 주소로 곧장 가면 팝업 없이 그날 화면이 뜬다.
                          */}
                          <a
                            href={`/pitch-log/${saved}`}
                            className="ml-auto font-semibold text-sky"
                          >
                            기록 남기기
                          </a>
                        </p>
                      )}
                      {toast && (
                        <p className={`${NOTE_WIN} text-center`}>
                          {toast}
                        </p>
                      )}
                    </div>
                  )}
                {live && !showCamera && toast && (
                  <p className="mx-4 mb-3 rounded-2xl bg-white/15 px-4 py-2.5 text-center text-sm text-white backdrop-blur motion-safe:animate-fade-in">
                    {toast}
                  </p>
                )}
                {resultShown && last && (
                  <div className="bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pb-5 pt-10 text-white">
                    {last.measure.ok ? (
                      <div className="motion-safe:animate-fade-in">
                        <p className="text-numeric text-6xl leading-none">
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
                          {rejectTitle(last)}
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
                공에 대충 맞춘 뒤 &lsquo;재기&rsquo;를 눌러요. 초점거리를 직접 재면
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
                focusedOnBall={appCamera}
              />
            </div>
          )}

          {/* 세션 요약(z-20) 위에서도 — 요약의 ▶ 로 연 공 */}
          {step === 'measure' && shownPitch && (
            <div className="absolute inset-0 z-30">
              <PitchResult
                pitchKey={shownPitch.id}
                busy={phase}
                index={pitches.indexOf(shownPitch) + 1}
                speed={speedNum(shown(shownPitch.rawKmh))}
                unit={speedLabel(unit)}
                sub={`± ${speedNum(shownPitch.errorKmh)} · ${
                  CONFIDENCE_TEXT[
                    shownPitch.confidence as keyof typeof CONFIDENCE_TEXT
                  ] ?? ''
                }${
                  shownPitch.dist
                    ? ` · 거리 ${shownPitch.dist.m}m${
                        shownPitch.dist.from === 'memory'
                          ? '(지난 세션 + 공 크기)'
                          : shownPitch.dist.from === 'session'
                            ? '(세션 공 크기)'
                            : shownPitch.dist.auto
                              ? '(공 크기)'
                              : ''
                      }`
                    : ''
                }`}
                notes={shownPitch.notes ?? []}
                clip={replayClip(shownPitch)}
                trail={shownPitch.trail ?? null}
                frame={shownPitch.analysis?.analyzeSize ?? null}
                abs={shownPitch.analysis?.abs ?? null}
                absFit={shownPitch.analysis?.distance?.fit ?? null}
                cameraPos={choices.cameraPos}
                pitchType={shownPitch.pitchType}
                onPitchType={(pitchType) => patch(shownPitch.id, { pitchType })}
                gunText={
                  shownPitch.gunKmh != null
                    ? `${speedNum(shownPitch.gunKmh)} ${speedLabel(unit)}`
                    : null
                }
                onGun={
                  isAdmin
                    ? () => {
                        setEditing(shownPitch.id);
                        setFocusGun(true);
                        setSheet('pitch');
                      }
                    : undefined
                }
                onAligned={(clipOffset) =>
                  setPitches((prev) =>
                    prev.map((q) => (q.id === shownPitch.id ? { ...q, clipOffset } : q))
                  )
                }
                onClose={() => {
                  setViewPitch(null);
                  setResultOpen(false);
                }}
                onNext={() => {
                  if (viewPitch != null) {
                    setViewPitch(null);
                    return;
                  }
                  setResultOpen(false);
                  if (!autoMode && live) nextPitch();
                }}
                nextLabel={
                  viewPitch != null ? '닫기' : autoMode ? '다음 공' : '다음 공 준비'
                }
                onEdit={
                  viewPitch != null
                    ? () => {
                        setViewPitch(null);
                        setEditing(shownPitch.id);
                        setSheet('pitch');
                      }
                    : undefined
                }
              />
            </div>
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
                  date={draftDate ?? today}
                  setupText={sessionSetupText(choices)}
                  calibrationText={useCal && fit.n > 0 ? calibrationText(fit) : null}
                  onSave={() => setSheet('save')}
                  onContinue={continueSession}
                  onPlayClip={(id) => setViewPitch(id)}
                  onEditPitch={(id) => {
                    setEditing(id);
                    setSheet('pitch');
                  }}
                  /* 지우기는 공을 눌러 여는 편집 시트에 — 줄에 단추가 셋이면 폰 폭에서 구종 글자가 잘린다 */
                  saving={saving}
                  abs={pitches
                    .filter((p) => p.analysis?.abs)
                    .map((p) => ({ id: p.id, abs: p.analysis!.abs! }))}
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="absolute inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] rounded-2xl bg-danger/90 px-4 py-2.5 text-sm leading-relaxed text-white"
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
                {/* 설정 단계에도 늘 나가기(✕) — 그 옆 ‹ 는 앞 단계로 */}
                {step !== 'measure' && back && (
                  <button type="button" onClick={quit} aria-label="구속 측정 나가기" className={CHROME_BTN}>
                    <X aria-hidden className="h-5 w-5" />
                  </button>
                )}
                {step !== 'measure' && back ? (
                  <button
                    type="button"
                    onClick={() => setStep(back.to)}
                    aria-label={`뒤로 · ${back.label}`}
                    className={CHROME_BTN}
                  >
                    <ChevronLeft aria-hidden className="h-5 w-5" />
                  </button>
                ) : step === 'measure' && live && !showCamera ? (
                  <button
                    type="button"
                    onClick={() => goPage(false)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 pl-3 pr-3.5 text-xs font-semibold text-white backdrop-blur transition-[background-color,scale] hover:bg-white/15 active:scale-95"
                  >
                    <Camera aria-hidden className="h-4 w-4" />
                    카메라
                  </button>
                ) : step === 'measure' && live && showCamera ? (
                  <button
                    type="button"
                    onClick={() => goPage(true)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-black/45 pl-3 pr-3.5 text-xs font-semibold text-white backdrop-blur transition-[background-color,scale] hover:bg-black/60 active:scale-95"
                  >
                    <List aria-hidden className="h-4 w-4" />
                    이번 세션
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
                        ? 'motion-safe:animate-pulse bg-danger'
                        : status === 'capturing' || status === 'analyzing'
                          ? 'bg-amber-400'
                          : 'bg-white/60'
                    }`}
                  />
                  <span className="truncate">
                    {recording
                      ? `녹화 중 ${formatClock(rec?.elapsedSec ?? 0)}`
                      : STATUS_TEXT[status]}
                  </span>
                </span>
              )}
              <div className="pointer-events-auto flex items-center gap-1">
                {/* 측정 화면은 아래 막대의 '초점' 단추가 맡는다 — 위 줄은 수평 · 존 · 렌즈 단계만 */}
                {cameraOn && step !== 'measure' && !PREP_STEPS.has(step) && (
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
                {(step === 'measure' || step === 'home') && (
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
          {/* 모드 띠 — 셔터 위(설계 2-2). 측정 중엔 잠금. 모드를 아직 안 골랐으면(시트가 떠 있음) 자리만 */}
          {step !== 'lens' && (
            <div className="relative z-10 shrink-0 bg-black px-3 pt-1.5">
              {modePicked ? <ModeStrip value={mode} isAdmin={canAbs} locked={step === 'measure' && live} onChange={switchMode} /> : <div className="h-8" />}
            </div>
          )}
          {step !== 'lens' && (
            <div className="relative z-10 flex shrink-0 items-start justify-between bg-black px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
              {/* 쪽 점 — 지금 카메라 · 이번 세션 중 어디인지(옆으로 넘길 수 있다는 표시). 검은 막대 위라 내용과 안 겹친다 */}
              {step === 'measure' && live && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-1 flex justify-center gap-1.5"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${showCamera ? 'bg-white' : 'bg-white/35'}`}
                  />
                  <span
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${showCamera ? 'bg-white/35' : 'bg-white'}`}
                  />
                </div>
              )}
              {recChip && (
                <div className="absolute bottom-full left-4 mb-2">
                  {!live ? (
                    <button
                      type="button"
                      aria-pressed={sessionRecWanted}
                      onClick={() => {
                        if (!sessionRecWanted && cameraOn && !appCapture) {
                          setToast('세션 녹화는 앱 카메라에서만 돼요');
                          return;
                        }
                        setSessionRecWanted(!sessionRecWanted);
                      }}
                      className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium backdrop-blur transition-colors ${
                        sessionRecWanted
                          ? 'border-red-400/70 bg-red-500/85 text-white'
                          : 'border-white/25 bg-black/55 text-white/85'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-2.5 w-2.5 rounded-full ${sessionRecWanted ? 'bg-white' : 'bg-red-400'}`}
                      />
                      {sessionRecWanted ? '세션 녹화 켬' : '세션 녹화 끔'}
                    </button>
                  ) : (
                    rec && (
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-red-500/85 px-3 text-xs font-medium tabular-nums text-white">
                        <span aria-hidden className="h-2 w-2 rounded-full bg-white motion-safe:animate-pulse" />
                        {/* 폰 = 올리기가 밀려 폰에 둔 조각(끝낸 뒤 올림) · 실패 = 버린 조각. 시계를 못 잡았으면 그 글 */}
                        {rec.parts === 0 && rec.error
                          ? '녹화 준비 · 첫 알림을 기다려요'
                          : `녹화 중 · 올림 ${rec.uploaded}/${rec.parts}${rec.spilled ? ` · 폰 ${rec.spilled}` : ''}${rec.failed ? ` · 실패 ${rec.failed}` : ''}`}
                      </span>
                    )
                  )}
                </div>
              )}
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
              {PREP_STEPS.has(step) ? (
                <>
                  {/* 첫 화면 왼쪽 — 지난 기록(카메라 앱의 사진첩 자리, 2026-10-15 김민이 고름). 최근 세션 최고 구속을 동그라미에 */}
                  <div className="flex w-20 flex-col items-center">
                    {step === 'home' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSheet('history')}
                          aria-label={
                            pitches.length > 0
                              ? `구속 기록 · 저장하지 않은 공 ${pitches.length}개`
                              : '구속 기록'
                          }
                          className="relative my-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 ring-2 ring-white/70 transition-[background-color,scale] hover:bg-white/15 active:scale-95"
                        >
                          {latestMax != null ? (
                            <span className="text-numeric text-sm font-bold leading-none">
                              {speedNum(latestMax)}
                            </span>
                          ) : (
                            <History aria-hidden className="h-5 w-5" />
                          )}
                          {pitches.length > 0 && (
                            <span
                              aria-hidden
                              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-sky ring-2 ring-black"
                            />
                          )}
                        </button>
                        <span className={SIDE_LABEL}>기록</span>
                      </>
                    )}
                  </div>
                  {waitShutter}
                  <div className="flex w-20 flex-col items-center">
                    {step === 'home' && (
                      <>
                        <button
                          type="button"
                          onClick={openTips}
                          aria-label="주의사항 보기"
                          className={SIDE_BTN}
                        >
                          <Info aria-hidden className="h-5 w-5" />
                        </button>
                        <span className={SIDE_LABEL}>주의사항</span>
                      </>
                    )}
                  </div>
                </>
              ) : step === 'align' || step === 'zone' ? (
                <>
                  <div className="flex w-20 flex-col items-center">
                    {step === 'align' ? (
                      <>
                        <button
                          type="button"
                          onClick={openTips}
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
                  {/* 다음 · 완료는 카메라 위 안내창 안(김민: "셔터로 하니까 헷갈려") — 셔터는 흐리게 자리만 */}
                  {waitShutter}
                  <div className="w-20" />
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
                      {rec?.progress != null
                        ? `올리는 중 ${rec.progress}%`
                        : '올린 조각'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Shutter
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
                      label={
                        recording ? '녹화 멈춤' : cameraOn ? '녹화 시작' : '카메라 켜기'
                      }
                      state={
                        rec?.phase === 'starting' || rec?.phase === 'stopping'
                          ? 'busy'
                          : recording
                            ? 'stop'
                            : cameraOn
                              ? 'ready'
                              : 'off'
                      }
                    />
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
                      {rec?.failed
                        ? `실패 ${rec.failed}`
                        : recording
                          ? '녹화 중'
                          : '대기'}
                    </span>
                  </div>
                </>
              ) : !live ? (
                <>
                  {/* 영상 파일로 재기는 관리자만(2026-10-15 사용자: "파일 측정은 관리자만, 일반 사용자는 제거") */}
                  <div className="flex w-20 flex-col items-center">
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={fileBusy}
                          aria-label="영상 파일로 재기"
                          className={SIDE_BTN}
                        >
                          <Film aria-hidden className="h-5 w-5" />
                        </button>
                        <span className={SIDE_LABEL}>파일</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <Shutter
                      onClick={cameraOn ? startSession : startCamera}
                      disabled={status === 'starting' || fileBusy}
                      label={cameraOn ? '측정 시작' : '카메라 켜기'}
                      state={status === 'starting' ? 'busy' : cameraOn ? 'ready' : 'off'}
                    />
                    <span className={SIDE_LABEL}>
                      {cameraOn ? '측정 시작' : '카메라 켜기'}
                    </span>
                  </div>
                  {/* 측정은 늘 자동(2026-10-15 사용자) — 자동 · 수동 단추 자리에 초점 단추 */}
                  <div className="flex w-20 flex-col items-center">
                    <button
                      type="button"
                      onClick={refocus}
                      disabled={!cameraOn || focusBusy}
                      aria-label="초점 다시 맞추기"
                      className={SIDE_BTN}
                    >
                      {focusBusy ? (
                        <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                      ) : (
                        <Focus aria-hidden className="h-5 w-5" />
                      )}
                    </button>
                    <span className={SIDE_LABEL}>초점</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex w-20 flex-col items-center">
                    <button
                      type="button"
                      onClick={refocus}
                      disabled={!cameraOn || focusBusy}
                      aria-label="초점 다시 맞추기"
                      className={SIDE_BTN}
                    >
                      {focusBusy ? (
                        <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                      ) : (
                        <Focus aria-hidden className="h-5 w-5" />
                      )}
                    </button>
                    <span className={SIDE_LABEL}>초점</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Shutter onClick={endSession} label="세션 종료" state="stop" />
                    <span className={SIDE_LABEL}>
                      세션 종료{pitches.length ? ` · ${pitches.length}구` : ''}
                    </span>
                  </div>
                  <div className="flex w-20 flex-col items-center">
                    <button
                      type="button"
                      onClick={() => goPage(true)}
                      disabled={pitches.length === 0}
                      aria-label={`이번 세션 공 보기 · ${pitches.length}구`}
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

      {/*
        주의사항 — 설정이 끝나면 카메라 화면 위에 창처럼 뜬다(뒤 화면은 여백에서만 조금 보인다).
        '오늘은 보지 않기'를 누르면 그날은 안 뜬다. 관리자 점프의 '주의사항 창'으로도 연다.
      */}
      {/* 지난 기록 — 첫 화면 왼쪽 아래 기록 단추(카메라 앱의 사진첩 자리). 저장하지 않은 공이 있으면 맨 위에 */}
      <BottomSheet
        open={sheet === 'history'}
        onClose={() => setSheet('none')}
        title="구속 기록"
      >
        {pitches.length > 0 && !live && (
          <section className="mb-4 rounded-2xl bg-sky-tint p-4">
            <p className="text-base font-bold text-ink">
              저장하지 않은 공 {pitches.length}개가 있어요
            </p>
            <p className="mt-1 text-sm text-muted">
              {draftDate && draftDate !== today ? draftDate : '오늘'} 잰 공이에요. 이어서
              저장하거나 더 잴 수 있어요.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSheet('none');
                  setDecided(true);
                  setStep('measure');
                  setSummaryOpen(true);
                }}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-sky text-base font-bold text-white transition-colors hover:bg-sky-strong"
              >
                이어서 하기
              </button>
              <button
                type="button"
                onClick={() => setAskClear(true)}
                className="inline-flex h-12 items-center justify-center rounded-2xl px-5 text-base font-semibold text-danger transition-colors hover:bg-danger/10"
              >
                지우기
              </button>
            </div>
          </section>
        )}
        <SessionHistory items={history} unit={unit} today={today} />
      </BottomSheet>
      <ConfirmDialog
        open={askClear}
        onClose={() => setAskClear(false)}
        onConfirm={() => {
          setAskClear(false);
          discardPitches();
        }}
        title="저장하지 않은 공을 지울까요?"
        detail={`공 ${pitches.length}개와 영상이 폰에서 지워져요.`}
        confirmLabel="지우기"
        pending={false}
      />

      {/* 공 하나 — 구종 · 코스 · 결과 · 건 값 · 메모 · 자세한 값 */}
      <BottomSheet
        open={sheet === 'pitch' && editingPitch != null}
        onClose={() => {
          setSheet('none');
          setEditing(null);
          setFocusGun(false);
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
              focusGun={focusGun}
              showGun={isAdmin}
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
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-danger-bg text-base font-semibold text-danger transition-colors hover:bg-danger-line/60"
            >
              <Trash2 aria-hidden className="h-5 w-5" />이 공 지우기
            </button>
          </div>
        )}
      </BottomSheet>

      {/* 저장 */}
      <BottomSheet
        open={sheet === 'save'}
        onClose={() => setSheet('none')}
        title="세션 저장하기"
      >
        {stats && (
          <div className="space-y-4">
            <p className="text-subhead text-muted">
              {monthDay(draftDate ?? today)} · {stats.n}구 · 최고{' '}
              {formatSpeed(stats.max, unit)} · 평균 {formatSpeed(stats.avg, unit)}
            </p>
            <div>
              <p className="mb-1.5 text-sm font-semibold">종류</p>
              {/* 체크인 · 탭 카드와 같은 알약 칩, 휴대폰은 같은 너비 칸(chip-grid) */}
              <div className="chip-grid flex flex-wrap gap-2">
                {THROW_TYPES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setSessionType(t.name)}
                    aria-pressed={sessionType === t.name}
                    className={`${CHIP_BASE} ${sessionType === t.name ? CHIP_ON : ''}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            {/* 투구 기록 입력 폼과 같은 칩(components/effort-chips.tsx) — 고른 % 와 1~10 을 서버가 같이 남긴다 */}
            <EffortChips
              value={effortPct}
              onChange={(pct) => {
                setEffortMissing(false);
                setEffortPct(pct);
              }}
              invalid={effortMissing}
              labelClassName="text-sm font-semibold"
            />
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
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky text-lg font-bold text-white hover:bg-sky-strong disabled:opacity-50"
            >
              {saving && <Loader2 aria-hidden className="h-5 w-5 animate-spin" />}
              {uploading
                ? `클립 올리는 중 ${uploading.done}/${uploading.total}`
                : clipCount > 0
                  ? `저장하고 클립 ${clipCount}개 올리기`
                  : '저장'}
            </button>
            {calibOn && (
              <p className="text-footnote leading-snug text-warn">
                정확도 보정용 저장이 켜져 있어요. 구속 측정 관리자에서 보정 자료로 보여요.
              </p>
            )}
            <p className="text-footnote leading-snug text-muted">
              공마다 고치고 지우는 건 그날 투구 기록에서 할 수 있어요.
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
              targetDistM,
              distAuto,
              autoMode,
              calibSave,
              clipZone,
            }}
            showChoices={false}
            calibration={fit}
            isAdmin={isAdmin}
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
              if (patch.distAuto != null) {
                setDistAuto(patch.distAuto);
                persistSetup({ distAuto: patch.distAuto });
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
            }}
          />

          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
            <p className="font-semibold text-ink">지금 설정</p>
            <p className="mt-0.5">
              {setupSummary(choices)} · 스트라이크 존 자리 저장됨
            </p>
          </div>

          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
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
                      : `아직 안 했어요. 지금은 화각 ${fov}° 로 어림해 재요. 한 번 해 두면 더 정확해요.`}
                  {lens && camera && !lensOk && (
                    <span className="block text-warn">
                      저장된 보정이 이 카메라(이름 · 비율 · 줌)와 달라요. 지금은 화각을
                      어림해 재고 있어요. 다시 재 주세요.
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
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-sky px-4 text-sm font-semibold text-white hover:bg-sky-strong"
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
        open={askLeave !== false}
        onClose={() => setAskLeave(false)}
        onConfirm={() => {
          const to = askLeave;
          setAskLeave(false);
          discardPitches();
          if (to === 'exit' || step === 'home') exit();
          else goHome();
        }}
        title="저장하지 않고 나갈까요?"
        detail={`저장하지 않은 공 ${pitches.length}개가 사라져요. 남기려면 취소하고 세션 종료에서 저장해요.`}
        confirmLabel="저장하지 않고 나가기"
        pending={false}
      />
    </div>
  );
}

/**
 * 지난 설정으로 바로 시작할까 — 카메라 위 안내창. 저장된 설정을 그림 칸으로 보이고, 카드 밑 [새 설정 | 이 설정으로 시작].
 * 사용자 요청: "전에 사용한 설정을 바로 사용할 수 있도록 하고 하단에 새 설정".
 */
/**
 * 셔터 — 빨간 원 하나(2026-10-15 김민: "기본 사진 버튼 느낌 말고 빨간색" → "베젤 없애" — 흰 고리를 뺐다).
 * 같은 날 더: 폰 카메라 앱의 동영상 셔터처럼 — 짙은 회색 테 + 좁은 검은 틈 + 반짝임 없는 평평한 빨간 원(김민이 보낸 화면, "지금은 좀 저 퀄리티").
 * 측정 중(세션 · 녹화)에는 빨간 원이 둥근 네모로 줄어든다(멈춤). 켜는 중은 도는 표시, 카메라가 꺼져 있으면 카메라 그림.
 */
function Shutter({
  onClick,
  disabled,
  label,
  state = 'ready',
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  state?: 'ready' | 'stop' | 'busy' | 'off';
}) {
  const stop = state === 'stop';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="group relative flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border-[5px] border-white transition-opacity disabled:opacity-35"
    >
      {/*
       * 운동 영상 촬영 단추(mobile/ios/App/App/ShootCameraPlugin.swift recordButton)와 똑같이 — 76 원 · 흰 테두리 5 · 안쪽 빨강(systemRed)
       * 58 원, 멈춤이면 30 네모(모서리 7), 0.18초(2026-10-17 사용자: "운동 영상 촬영할 때 빨간 버튼이랑 완전 똑같이")
       */}
      <span
        className={`flex items-center justify-center bg-[#ff3b30] text-white motion-safe:transition-[width,height,border-radius] motion-safe:duration-[180ms] motion-safe:ease-in-out ${
          stop ? 'h-[1.875rem] w-[1.875rem] rounded-[7px]' : 'h-[3.625rem] w-[3.625rem] rounded-full'
        }`}
      >
        {state === 'busy' ? (
          <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
        ) : state === 'off' ? (
          <Camera aria-hidden className="h-6 w-6" />
        ) : null}
      </span>
    </button>
  );
}

function PreviousSetupCard({
  setup,
  onFresh,
  onUse,
}: {
  setup: VelocitySetup;
  onFresh: () => void;
  onUse: () => void;
}) {
  const when = setup.savedAt ? new Date(setup.savedAt) : null;
  return (
    <GuideCard
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
      <div className="overflow-hidden rounded-2xl bg-surface">
        <div className="p-(--block-pad)">
          <SetupSummaryRow
            sessionType={setup.sessionType}
            cameraPos={setup.cameraPos}
            net={setup.net}
          />
        </div>
        <p className="border-t border-line px-(--block-pad) py-3 text-footnote leading-snug text-muted">
          스트라이크 존 자리 저장됨 · 소리 안내 {setup.voice ? '켬' : '끔'}
          {when && ` · ${when.getMonth() + 1}월 ${when.getDate()}일에 저장`}
        </p>
      </div>
    </GuideCard>
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
