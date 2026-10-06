/**
 * 구속 측정 설정 — 카메라를 켜기 전에 고르는 것들과 스트라이크 존 자리.
 *
 * 브라우저(localStorage)에 남겨 두어 다음에 "지난 설정 그대로 쓸까요?"로 바로 카메라까지 간다.
 * 폰마다 자리가 달라(삼각대 높이 · 거리) 계정이 아니라 기기에 둔다.
 */

import type { Approach } from '@/lib/velocity-engine/analyze-frames';
import { DEFAULT_SESSION_TYPE, isRestSession, isSessionType } from '@/lib/session-type';
import { isCamMode, type CamMode } from '@/lib/velocity-camera-mode';

export const SETUP_KEY = 'bullpen-velocity-setup';
/** 같은 탭 안에서 설정이 바뀌었다고 알리는 신호 — storage 이벤트는 다른 탭에만 간다 */
export const SETUP_CHANGE_EVENT = 'bullpen:velocity-setup';

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
   * 광각 영상도 같이 저장 — 광각 카메라가 있는 아이폰 앱에서, 측정은 일반 카메라로 하면서 공마다 광각 카메라 영상도 함께 남긴다
   * (2026-10-03 사용자). 웹 화면은 카메라를 하나만 켤 수 있어 앱의 'DualCamera' 부품이 있어야 실제로 찍힌다(lib/dual-camera.ts).
   */
  wideClip: boolean;
  /** 측정 카메라의 화질 · 프레임(lib/velocity-camera-mode.ts) — null 이면 자동(1080p · 60fps) */
  camMode: CamMode | null;
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

export const CAMERA_OPTIONS: { key: CameraPos; label: string; hint: string }[] = [
  {
    key: 'behind-pitcher',
    label: '투수 뒤',
    hint: '1m 이내 · 공이 멀어져요 · 그물까지 거리를 넣어요',
  },
  {
    key: 'behind-catcher',
    label: '포수 뒤',
    hint: '네트 뒤 1~3m · 공이 다가와요 · 코스가 잘 보여요',
  },
];

export const NET_OPTIONS: { key: boolean; label: string; hint: string }[] = [
  {
    key: true,
    label: '네트 있음',
    hint: '초점을 고정해요(수동초점) — 그물코에 초점이 안 잡히게',
  },
  { key: false, label: '네트 없음', hint: '자동초점 · 포수나 벽까지 잰다' },
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

/** 카메라 위치별 처음 존 — 가운데, 조금 아래(공이 떨어진다) */
export function defaultZone(
  cameraPos: CameraPos,
  frame: FrameSize = PORTRAIT
): ZoneRect {
  const w = ZONE_DEFAULT_W[cameraPos];
  const h = w * zoneAspectIn(frame);
  return { x: 0.5 - w / 2, y: 0.54 - h / 2, w, h };
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

export const DEFAULT_SETUP: Omit<VelocitySetup, 'savedAt'> = {
  sessionType: DEFAULT_SESSION_TYPE,
  cameraPos: 'behind-pitcher',
  net: true,
  zone: DEFAULT_ZONE,
  voice: false,
  useCal: true,
  releaseDistM: 18.5,
  targetDistM: 20,
  autoMode: true,
  calibSave: false,
  clipZone: true,
  wideClip: false,
  camMode: null,
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

export function loadSetup(): VelocitySetup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<VelocitySetup>;
    if (p.cameraPos !== 'behind-pitcher' && p.cameraPos !== 'behind-catcher')
      return null;
    return {
      sessionType:
        typeof p.sessionType === 'string' &&
        isSessionType(p.sessionType) &&
        !isRestSession(p.sessionType)
          ? p.sessionType
          : DEFAULT_SESSION_TYPE,
      cameraPos: p.cameraPos,
      net: p.net !== false,
      /* 예전(모양 · 크기가 자유롭던 때)에 놓은 존도 규격에 맞춘다 */
      zone: fitZone(isRect(p.zone) ? p.zone : defaultZone(p.cameraPos), p.cameraPos),
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
      autoMode: p.autoMode !== false,
      calibSave: p.calibSave === true,
      clipZone: p.clipZone !== false,
      wideClip: p.wideClip === true,
      camMode: isCamMode(p.camMode) ? p.camMode : null,
      recordMode: p.recordMode === true,
      diagHud: p.diagHud === true,
      savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function saveSetup(setup: Omit<VelocitySetup, 'savedAt'>): VelocitySetup {
  const full = { ...setup, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(full));
  } catch {
    /* 사생활 보호 모드 등 — 이번만 쓴다 */
  }
  window.dispatchEvent(new Event(SETUP_CHANGE_EVENT));
  return full;
}

/** 저장된 설정을 지운다 — 다음 측정 때 처음부터 다시 묻는다 */
export function clearSetup() {
  try {
    localStorage.removeItem(SETUP_KEY);
  } catch {
    /* 위와 같다 */
  }
  window.dispatchEvent(new Event(SETUP_CHANGE_EVENT));
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

/**
 * 공이 카메라에서 멀어지나 다가오나 — 엔진이 크기 변화 방향을 정하는 데 쓴다.
 * 투수 뒤에서 찍으면 멀어지고, 포수 뒤에서 찍으면 다가온다. (타구 측정은 2026-10-03 사용자 요청으로 뺐다.)
 */
export function approachOf(setup: Pick<VelocitySetup, 'cameraPos'>): Approach {
  return setup.cameraPos === 'behind-pitcher' ? 'receding' : 'approaching';
}

export function setupSummary(s: Pick<VelocitySetup, 'cameraPos' | 'net'>) {
  return [
    CAMERA_OPTIONS.find((o) => o.key === s.cameraPos)?.label,
    s.net ? '네트 있음' : '네트 없음',
  ].join(' · ');
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
