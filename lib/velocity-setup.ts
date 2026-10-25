/**
 * 구속 측정 설정 — 카메라를 켜기 전에 고르는 것들과 스트라이크 존 자리.
 *
 * 기기에 남겨 두어 다음에 "지난 설정 그대로 쓸까요?"로 바로 카메라까지 간다. 폰마다 자리가 달라(삼각대 높이 · 거리) 계정이 아니라
 * 기기에 둔다 — 웹은 lib/velocity-storage.ts(localStorage), 아이폰 앱(native/)은 앱 저장소. 이 파일은 계산만 둔다(앱도 같이 쓴다).
 */

import type { Approach } from '@/lib/velocity-engine/analyze-frames';
import { DEFAULT_SESSION_TYPE, isRestSession, isSessionType } from '@/lib/session-type';

export type CameraPos = 'behind-pitcher' | 'behind-catcher';

/**
 * 스트라이크 존 — 카메라 장면(원본 프레임) 기준 0~1 비율(왼쪽 위 x · y, 폭 · 높이).
 *
 * 예전에는 뷰파인더 칸 기준이었다. 그런데 칸 모양이 단계마다 달라(존 놓기는 좁은 칸, 측정은 꽉 찬
 * 칸) 뷰파인더가 장면을 다르게 잘라 보여 주니, 같은 비율이 장면의 다른 자리를 가리켰다 — 놓은 존이
 * 측정 화면에서 다른 자리 · 다른 크기로 보였다. 장면 기준으로 두고 그릴 때마다 칸에 맞춰 바꾼다
 * (frameRectToView · viewRectToFrame).
 */
export type ZoneRect = { x: number; y: number; w: number; h: number };

export type VelocitySetup = {
  /** 어떤 투구인가 — 투구 기록의 종류(불펜 · 라이브 · 경기 · 캐치볼). 저장할 때 그 기록의 종류가 된다 */
  sessionType: string;
  cameraPos: CameraPos;
  net: boolean;
  zone: ZoneRect;
  /** 잰 구속을 소리로 읽어 줄까 */
  voice: boolean;
  /** 스피드건 보정식을 적용할까 */
  useCal: boolean;
  /**
   * 포수 뒤에서 찍을 때, 카메라에서 릴리스 지점까지의 거리(m). 다가오는 공은 마지막 몇 m 만
   * 보이므로 이 거리만큼 공기저항을 되돌려 릴리스 구속을 낸다(1m 에 약 0.8km/h).
   * 정규 마운드(18.44m)에서 릴리스가 판보다 약 1.8m 앞, 카메라가 홈플레이트 뒤 약 1.8m 면 ≈ 18.5m.
   */
  releaseDistM: number;
  /**
   * 투수 뒤에서 찍을 때, 카메라에서 공이 닿는 곳(그물 · 포수 미트)까지의 거리(m) — 엔진 2.0 의 거리 자. 공이 여기 닿은 때의
   * 깊이를 이 값으로 두고 구속을 낸다(lib/velocity-engine/analyze-distance.ts) — 5% 틀리면 구속도 5% 틀리니 줄자로 재 넣는다.
   * 정규 마운드(18.44m)에서 폰을 투수판 1m 뒤에 두면 약 19.5m.
   */
  targetDistM: number;
  /**
   * 거리를 공 크기로 어림한다(2026-10-07 사용자: "거리를 판단할 수 없을까") — 켜면 targetDistM 은 첫 어림일 뿐이다. 거리를 안 잰
   * 사람이 기본 20m 로 재 값이 10% 넘게 틀렸다(밖 실험 영상의 실제 거리 약 22.5m). 줄자로 재 넣으면 끈다.
   */
  distAuto: boolean;
  /** 줄자(레이저)로 잰 거리를 넣었다 — 세션 거리 보정(공 크기 가운데 값, lib/velocity-session-distance.ts sessionCorrection)을 하지 않고 넣은 값이 이긴다(엔진 2.4 1단계) */
  distTape: boolean;
  /** 누가 받나(새 앱, 2026-10-25 PLAN-pitchlab.md) — 망이면 '망 안쪽, 공이 멈추는 곳'을 고르게 안내한다 */
  receiver?: Receiver;
  /** 투수판 → 공이 멈추는 곳(m, 새 앱) — 엔진 거리는 여기에 PHONE_BEHIND_RUBBER_M 를 더한다 */
  rubberDistM?: number;
  /** 자동 측정 — 켜 두면 공마다 알아서 잡는다. 끄면 공마다 단추를 눌러 기다린다 */
  autoMode: boolean;
  /**
   * 관리자의 '정확도 보정용 저장' — 켜고 잰 세션을 보정용으로 표시한다(관리자만 효과). 영상 클립 · 분석 자료는 이것과
   * 상관없이 모든 세션에서 올린다(2026-10-03 사용자: "클립은 보정용이던 말던 모든 상황에서 녹화").
   */
  calibSave: boolean;
  /**
   * 저장된 공 영상(▶ · 구속 측정 관리자)에 스트라이크 존과 짐작한 코스 칸을 겹쳐 그릴까. 영상 파일에 새기지 않고 볼 때
   * 겹친다 — 그래서 언제든 켜고 끌 수 있다. 존 자리는 공마다 잰 순간의 것(analysis.zoneRect).
   */
  clipZone: boolean;
  /**
   * 엔진 개발용 녹화(관리자) — 켜면 측정 대기 화면의 시작 단추가 녹화 단추가 되어 측정 없이 찍어 구속 측정 관리자로 올린다
   * (lib/velocity-recorder.ts). 관리자가 아니면 켜져 있어도 효과가 없다.
   */
  recordMode: boolean;
  /**
   * 진단 표시(관리자) — 측정 화면 위에 장면 받는 길 · 실제 초당 장면 · 장면 하나 처리 시간 · 알아챔 · 잰 것 · 거부 까닭을 작게 띄운다.
   * 밖에서 하나도 안 잡혔을 때 그 자리에서 까닭을 보려고(2026-10-03).
   */
  diagHud: boolean;
  savedAt: string;
};

export const RELEASE_DIST_MIN = 3;
export const RELEASE_DIST_MAX = 40;
/** 투수 뒤 거리(카메라 → 그물 · 미트)의 범위 — 마당 그물 5m 부터 외야 송구 40m 까지 */
export const TARGET_DIST_MIN = 5;
export const TARGET_DIST_MAX = 40;

/*
 * 고를 수 있는 자리는 투수 뒤 하나 — 포수 뒤는 엔진이 늘 믿음 '낮음'으로 매겨, 믿음 '높음'만 기록하게 된 뒤(2026-10-13 김민)로는 모든 공이
 * 측정 불가였다. 타입 · 옛 세션 줄('behind-catcher')은 그대로 두고, 저장된 설정은 투수 뒤로 읽는다(loadSetup).
 */
export const CAMERA_OPTIONS: { key: CameraPos; label: string; hint: string }[] = [
  {
    key: 'behind-pitcher',
    label: '투수 뒤',
    hint: '공이 날아가는 길을 뒤에서 봐요',
  },
];

/**
 * 스트라이크 존 모양 — 세로 ÷ 가로(픽셀). 가로는 홈플레이트 폭 43.2cm, 세로는 무릎부터 어깨와 벨트의 한가운데까지(성인 약
 * 55~65cm, 규칙서의 평균 존 0.46~1.07m)라 1.3~1.45 — 1.35 로 둔다. 존을 놓을 때 이 모양은 지키고 크기만 바꾼다.
 */
export const ZONE_ASPECT = 1.35;

/**
 * 존 가로의 범위 — 장면 가로에 대한 비율, 카메라 위치별. 아이폰 기본 카메라(세로, 화각 약 69°)로 찍으면 존(43cm)의 가로는
 * 거리 d(m)에서 장면 가로의 약 0.56 ÷ d 다(초점 1397px × 0.432m ÷ 1080px).
 *  - 포수 뒤: 홈까지 1.2~4m → 14~47% — 12~50%.
 *  - 투수 뒤: 홈까지 17~20m → 2.8~3.3%. 실제 크기까지 줄일 수 있게 2%부터, 줌 · 가까운 연습장도 되게 15%까지.
 */
export const ZONE_WIDTH_RANGE: Record<CameraPos, readonly [number, number]> = {
  'behind-catcher': [0.12, 0.5],
  'behind-pitcher': [0.02, 0.15],
};

/** 처음 놓는 존의 가로(장면 가로 비율) — 포수 뒤 2m 남짓 · 투수 뒤는 실제(약 3%)보다 조금 크게, 눈에 보이게 */
const ZONE_DEFAULT_W: Record<CameraPos, number> = {
  'behind-catcher': 0.3,
  'behind-pitcher': 0.04,
};

type FrameSize = { width: number; height: number };
/** 카메라 장면 크기를 모를 때 — 폰 세로 1080×1920 */
const PORTRAIT: FrameSize = { width: 1080, height: 1920 };
const WHOLE: ZoneRect = { x: 0, y: 0, w: 1, h: 1 };

/** 장면 비율 좌표에서 존의 세로 ÷ 가로 — 픽셀 모양(ZONE_ASPECT)을 장면 가로 · 세로로 나눈 것 */
export function zoneAspectIn(frame: FrameSize = PORTRAIT): number {
  return (ZONE_ASPECT * frame.width) / frame.height;
}

/**
 * 존을 규격에 맞춘다 — 가운데는 두고 모양(ZONE_ASPECT) · 크기(ZONE_WIDTH_RANGE)를 지켜, 보이는 장면(bounds, 장면 비율) 안에
 * 넣는다. 예전에 마음대로 늘려 둔 존 · 카메라 위치를 바꾼 뒤의 존도 이것으로 고친다. 이미 맞으면 같은 객체를 돌려준다.
 */
export function fitZone(
  rect: ZoneRect,
  cameraPos: CameraPos,
  frame: FrameSize = PORTRAIT,
  bounds: ZoneRect = WHOLE
): ZoneRect {
  const k = zoneAspectIn(frame);
  const [lo, hi] = ZONE_WIDTH_RANGE[cameraPos];
  const maxW = Math.min(hi, bounds.w, bounds.h / k);
  const w = Math.min(maxW, Math.max(lo, rect.w));
  const h = w * k;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const x = clamp(rect.x + rect.w / 2 - w / 2, bounds.x, bounds.x + bounds.w - w);
  const y = clamp(rect.y + rect.h / 2 - h / 2, bounds.y, bounds.y + bounds.h - h);
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return same(x, rect.x) && same(y, rect.y) && same(w, rect.w) && same(h, rect.h)
    ? rect
    : { x, y, w, h };
}

/**
 * 존 가운데 자리(장면 비율) — 늘 여기, 사용자는 크기만 바꾼다(2026-10-11 김민: "릴리스 포인트와 일치하게 고정, 릴리스 포인트 중앙에서
 * 살짝 밑"). 릴리스 표적은 화면 가운데다. 폰을 릴리스 높이(약 1.75m)에 두면 20m 앞 존 가운데(약 0.76m)는 2.8° 아래이고,
 * 2배 줌 세로 반화각(약 31°)에 대면 화면 높이의 4% 쯤 아래다.
 */
export const ZONE_CENTER = { x: 0.5, y: 0.54 } as const;

/** 크기는 두고 가운데를 ZONE_CENTER 로 */
export function centerZone(rect: ZoneRect): ZoneRect {
  const x = ZONE_CENTER.x - rect.w / 2;
  const y = ZONE_CENTER.y - rect.h / 2;
  return Math.abs(x - rect.x) < 1e-6 && Math.abs(y - rect.y) < 1e-6
    ? rect
    : { ...rect, x, y };
}

/** 카메라 위치별 처음 존 — 가운데(ZONE_CENTER) */
export function defaultZone(
  cameraPos: CameraPos,
  frame: FrameSize = PORTRAIT
): ZoneRect {
  const w = ZONE_DEFAULT_W[cameraPos];
  const h = w * zoneAspectIn(frame);
  return centerZone({ x: 0, y: 0, w, h });
}

/** 처음 놓이는 스트라이크 존(투수 뒤 기준) — 카메라 위치를 알면 defaultZone(cameraPos) */
export const DEFAULT_ZONE: ZoneRect = defaultZone('behind-pitcher');

/**
 * 존 번호(1~9, 투수가 보는 대로 — zoneOfPoint)를 화면 칸(0~8, 화면의 왼쪽 위부터)으로. 포수 뒤는 좌우가 뒤집힌다.
 * 영상에 짐작한 코스 칸을 밝힐 때.
 */
export function zoneCellOnScreen(
  zone: number | null | undefined,
  cameraPos: CameraPos
): number | null {
  if (zone == null || !Number.isInteger(zone) || zone < 1 || zone > 9) return null;
  const row = Math.floor((zone - 1) / 3);
  const col = (zone - 1) % 3;
  return row * 3 + (cameraPos === 'behind-catcher' ? 2 - col : col);
}

/**
 * 폰 → 미트 거리의 기준(2026-10-09 김민: "거리는 늘 정식 규격 18.44m 에 포수가 조금 뒤에서 받아 19m 쯤, 카메라 1m 뒤 해서 20m 로
 * 고정"). 공 크기 거리와 15% 넘게 다르면 그 공은 믿음을 낮추고 최고 · 평균에서 뺀다(엔진 INPUT_SIZE_MISMATCH). 2.8.0 부터 화각을 아는
 * 앱은 공마다 공 크기로 거리를 어림해(TAPE_MODES '자동') 이 값은 첫 어림 · 화각을 모를 때의 기준이다.
 */
export const STANDARD_TARGET_DIST_M = 20;

/*
 * 거리 고르기는 두 가지(2026-10-19 김민 결정, 2026-10-22 '자동'으로): '자동' 또는 '줄자로 쟀어요'. 자동이면 앱은 공마다 공 크기로 거리를 어림하고
 * (엔진 2.8.0 autoDistance — 화각을 아는 폰만, 2026-10-22 김민 "공을 던질 때마다 거리를 재면서 던지는 사람은 없어"), 화각을 모르는 폰 · 웹은 기준
 * 20m 로 재고 세션 보정(±15%)으로 맞춘다. 웹 측정 화면 · 설정 시트 · 새 앱이 같은 글을 쓴다(한 곳에 두어 안 어긋나게).
 */
export const TAPE_MODES = [
  { value: 'standard', label: '자동' },
  { value: 'tape', label: '줄자로 쟀어요' },
] as const;
/*
 * 새 앱의 거리 고르기(2026-10-25 김민 "PitchLab 방식으로", PLAN-pitchlab.md) — '누가 받나요' + '투수판 → 공이 멈추는 곳'(14m · 20m · 직접).
 * 망 앞면까지 거리를 넣으면 공이 망 안쪽 1~2.6m 뒤에서 멈춰 구속이 5~11% 낮았다(10-03 · 10-23 · 10-21, 미트는 맞음) — 그래서 '멈추는 곳'으로 묻는다.
 * 엔진은 고른 거리로 값을 내고, 공 크기 거리가 그보다 22% 넘게 짧거나 15% 넘게 길면 거리 오류로 측정 불가(엔진 2.9.0 gateAuto).
 */
export const RECEIVERS = [
  { value: 'catcher', label: '포수', hint: '투수판에서 포수 미트까지예요.' },
  { value: 'net', label: '망', hint: '망 앞면이 아니라 공이 들어가 멈추는 망 안쪽까지예요. 앞면까지만 재면 구속이 5~10% 낮게 나와요.' },
] as const;
export type Receiver = (typeof RECEIVERS)[number]['value'];
/** 투수판 → 공이 멈추는 곳 고르기(2026-10-23 김민: 14m 리틀 · 초등, 20m 중학교 이상) — 그 밖은 직접 */
export const RUBBER_DIST_PRESETS = [14, 20] as const;
/** 폰은 투수판 뒤 이만큼(m) — 10-22 폰 자리 안내 '투수 뒤 1.5~2m'(가장 잘 잰 10-03 · 09-28 이 2~2.5m)를 2m 하나로 */
export const PHONE_BEHIND_RUBBER_M = 2;
/** 엔진에 넘기는 거리(폰 → 공이 멈추는 곳) */
export const phoneDistOf = (rubberDistM: number) => rubberDistM + PHONE_BEHIND_RUBBER_M;
/** 공 크기 거리가 고른 거리와 많이 다를 때(엔진 size-mismatch → 측정 불가) */
export const DISTANCE_MISMATCH_FIX = '거리 오류예요. 공 크기로 본 거리가 고른 거리와 많이 달라요. 투수판에서 공이 멈추는 곳까지 거리를 다시 골라 주세요.';
/** '자동'을 골랐을 때 밑의 안내 */
export const STANDARD_DIST_HINT = '거리는 공 크기로 알아서 맞춰요. 줄자로 쟀으면 넣어도 돼요.';
/** 기준 20m 로 재는 폰(화각 모름)에서 공 크기 거리가 기준과 15% 넘게 다를 때(엔진 size-mismatch → '낮음' → 기록 안 함) */
export const OUT_OF_RANGE_FIX = `폰에서 받는 곳까지가 ${STANDARD_TARGET_DIST_M}m 와 많이 달라 보여요. 줄자로 재서 넣어 주세요.`;
/**
 * 줄자 칸 밑 글 — 무엇을 재는지(폰 → 받는 곳). 10-21 밤 '18m' 세션은 투수판 → 미트 거리를 넣은 듯 공 크기가 모두 19.5m 를 말했다
 * (폰이 던지는 사람 1.5m 뒤) — 구속이 5% 낮았다.
 */
export const TAPE_HINT = '폰에서 받는 곳까지 잰 거리예요. 투수판 거리가 아니에요. 5% 틀리면 구속도 5% 틀려요.';
/** 줄자 세션인데 공 크기 거리가 줄자 값과 15% 넘게 다를 때 */
export const TAPE_MISMATCH_FIX = '줄자 거리와 공 크기 거리가 많이 달라요. 줄자 값과 폰 · 미트 자리를 확인해 주세요.';

export const DEFAULT_SETUP: Omit<VelocitySetup, 'savedAt'> = {
  sessionType: DEFAULT_SESSION_TYPE,
  cameraPos: 'behind-pitcher',
  /* 네트는 더 묻지 않는다(2026-10-15 사용자: "네트 있음도 없애고 묻지도 마") — 늘 없음(자동초점) */
  net: false,
  zone: DEFAULT_ZONE,
  voice: false,
  useCal: true,
  releaseDistM: 18.5,
  targetDistM: STANDARD_TARGET_DIST_M,
  distAuto: false,
  distTape: false,
  receiver: 'net',
  rubberDistM: 20,
  autoMode: true,
  calibSave: false,
  clipZone: true,
  recordMode: false,
  diagHud: false,
};

export const isRect = (z: unknown): z is ZoneRect =>
  !!z &&
  typeof z === 'object' &&
  ['x', 'y', 'w', 'h'].every((k) => {
    const v = (z as Record<string, unknown>)[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  });

/** 저장해 둔 설정(JSON 을 푼 값) → 지금 규칙에 맞춘 설정. 꼴이 틀리면 null — 웹 · 앱 저장소가 같이 쓴다 */
export function parseSetup(raw: unknown): VelocitySetup | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = { ...(raw as Partial<VelocitySetup>) };
  if (p.cameraPos !== 'behind-pitcher' && p.cameraPos !== 'behind-catcher')
    return null;
  /* 포수 뒤는 더는 고를 수 없다(CAMERA_OPTIONS) — 지난 설정이 포수 뒤였으면 투수 뒤로, 존도 투수 뒤 기본으로 */
  if (p.cameraPos === 'behind-catcher') {
    p.cameraPos = 'behind-pitcher';
    p.zone = undefined;
  }
  return {
    sessionType:
      typeof p.sessionType === 'string' &&
      isSessionType(p.sessionType) &&
      !isRestSession(p.sessionType)
        ? p.sessionType
        : DEFAULT_SESSION_TYPE,
    cameraPos: p.cameraPos,
    net: false,
    /* 예전(모양 · 크기가 자유롭던 때)에 놓은 존도 규격에 맞춘다 */
    zone: fitZone(
      isRect(p.zone) ? centerZone(p.zone) : defaultZone(p.cameraPos),
      p.cameraPos
    ),
    voice: p.voice === true,
    useCal: p.useCal !== false,
    releaseDistM:
      typeof p.releaseDistM === 'number' &&
      p.releaseDistM >= RELEASE_DIST_MIN &&
      p.releaseDistM <= RELEASE_DIST_MAX
        ? p.releaseDistM
        : DEFAULT_SETUP.releaseDistM,
    targetDistM:
      typeof p.targetDistM === 'number' &&
      p.targetDistM >= TARGET_DIST_MIN &&
      p.targetDistM <= TARGET_DIST_MAX
        ? p.targetDistM
        : DEFAULT_SETUP.targetDistM,
    /* 공마다 공 크기로 거리 어림은 뺐다(2026-10-15 사용자: "기준 20m · 줄자만") — 옛 설정에 켜져 있어도 끔 */
    distAuto: false,
    distTape: p.distTape === true,
    receiver: p.receiver === 'catcher' ? 'catcher' : 'net',
    rubberDistM:
      typeof p.rubberDistM === 'number' && p.rubberDistM >= TARGET_DIST_MIN && p.rubberDistM <= TARGET_DIST_MAX
        ? p.rubberDistM
        : DEFAULT_SETUP.rubberDistM,
    /* 측정은 늘 자동(2026-10-15 사용자: "항상 자동으로") — 옛 설정의 수동도 자동으로 */
    autoMode: true,
    calibSave: p.calibSave === true,
    clipZone: p.clipZone !== false,
    recordMode: p.recordMode === true,
    diagHud: p.diagHud === true,
    savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
  };
}

/**
 * 엔진 2.0 의 거리 자(m) — 투수 뒤만: 카메라 → 그물 · 미트(targetDistM). 포수 뒤는 null(1.x 엔진 — 다가오는 공 크기로 거리, 릴리스
 * 거리로 공기저항 되돌림). 2.0 은 다가오는 공을 '처음 잡힌 장면 = 릴리스'로 놓는데, 18m 앞 공은 1배에서 4px 남짓이라 대개 중간부터
 * 잡혀(12m 면 +54%) 쓸 수 없다. 포수 뒤 2.0 은 가까운 끝(폰 → 그물)을 자로 삼아야 한다 — 영상이 생기면.
 */
export function distanceOf(
  setup: Pick<VelocitySetup, 'cameraPos' | 'targetDistM' | 'releaseDistM'>
): number | null {
  return setup.cameraPos === 'behind-pitcher' ? setup.targetDistM : null;
}

/** 엔진 2.0 의 거리를 공 크기로 어림하나 — 투수 뒤이고 거리를 줄자로 넣지 않았을 때(distAuto) */
export function distanceAutoOf(
  setup: Pick<VelocitySetup, 'cameraPos' | 'distAuto'>
): boolean {
  return setup.cameraPos === 'behind-pitcher' && setup.distAuto;
}

/**
 * 공이 카메라에서 멀어지나 다가오나 — 엔진이 크기 변화 방향을 정하는 데 쓴다.
 * 투수 뒤에서 찍으면 멀어지고, 포수 뒤에서 찍으면 다가온다. (타구 측정은 2026-10-03 사용자 요청으로 뺐다.)
 */
export function approachOf(setup: Pick<VelocitySetup, 'cameraPos'>): Approach {
  return setup.cameraPos === 'behind-pitcher' ? 'receding' : 'approaching';
}

export function setupSummary(s: Pick<VelocitySetup, 'cameraPos'>) {
  return CAMERA_OPTIONS.find((o) => o.key === s.cameraPos)?.label ?? '';
}

/**
 * 뷰파인더 안의 한 점(0~1)이 스트라이크 존의 어느 칸인가 — 1~9, 왼쪽 위부터. 밖이면 null.
 * 카메라가 투수 뒤면 화면의 왼쪽이 투수의 왼쪽이라 그대로, 포수 뒤면 좌우가 뒤집힌다.
 */
/** 장면 비율(0~1)의 점이 존의 몇 번째 칸(1~9, 투수 시점)인가 — 존 밖이면 null */
export function zoneOfPoint(
  px: number,
  py: number,
  rect: ZoneRect,
  cameraPos: CameraPos
): number | null {
  const u = (px - rect.x) / rect.w;
  const v = (py - rect.y) / rect.h;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  let col = Math.min(2, Math.floor(u * 3));
  const row = Math.min(2, Math.floor(v * 3));
  if (cameraPos === 'behind-catcher') col = 2 - col;
  return row * 3 + col + 1;
}

/**
 * 카메라 프레임 안의 점(픽셀)을 뷰파인더 비율(0~1)로 — 뷰파인더는 object-cover 라 프레임의
 * 가장자리가 잘려 보인다. 잘린 만큼을 빼고 비율로 바꾼다. 화면 밖이면 0~1 을 벗어난 값이 나온다.
 */
export function frameToView(
  point: { x: number; y: number },
  frame: { width: number; height: number },
  view: { width: number; height: number }
): { x: number; y: number } {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const shownW = frame.width * scale;
  const shownH = frame.height * scale;
  const offX = (view.width - shownW) / 2;
  const offY = (view.height - shownH) / 2;
  return {
    x: (point.x * scale + offX) / view.width,
    y: (point.y * scale + offY) / view.height,
  };
}

/**
 * object-cover 로 채운 뷰파인더에 장면의 어느 부분이 보이나 — 보이는 조각을 장면 비율(0~1)로.
 * 칸이 장면보다 넓적하면 위아래가, 홀쭉하면 양옆이 잘린다.
 */
export function visibleFrameRect(
  frame: { width: number; height: number },
  view: { width: number; height: number }
): ZoneRect {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const w = view.width / scale / frame.width;
  const h = view.height / scale / frame.height;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** 장면 비율 사각형 → 뷰파인더 비율 사각형(칸 밖이면 0~1 을 벗어난다) */
export function frameRectToView(
  rect: ZoneRect,
  frame: { width: number; height: number },
  view: { width: number; height: number }
): ZoneRect {
  const v = visibleFrameRect(frame, view);
  return {
    x: (rect.x - v.x) / v.w,
    y: (rect.y - v.y) / v.h,
    w: rect.w / v.w,
    h: rect.h / v.h,
  };
}

/** 뷰파인더 비율 사각형 → 장면 비율 사각형 */
export function viewRectToFrame(
  rect: ZoneRect,
  frame: { width: number; height: number },
  view: { width: number; height: number }
): ZoneRect {
  const v = visibleFrameRect(frame, view);
  return {
    x: v.x + rect.x * v.w,
    y: v.y + rect.y * v.h,
    w: rect.w * v.w,
    h: rect.h * v.h,
  };
}
